import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Contract } from 'ethers';
import { readDeployment, makeProvider, validateDeployment, Unavailable } from './deployment.js';
import { upload, pdfHash } from './upload.js';

export async function findRegisteredFile(hash) {
  const d=await readDeployment(), provider=makeProvider(d.rpcUrl);
  try {
    await validateDeployment(provider,d);
    const registry=new Contract(d.address,d.abi,provider);
    const deploymentReceipt=await provider.getTransactionReceipt(d.transactionHash);
    const latest=await provider.getBlockNumber();
    const matched=[];
    // The prototype contract has no reverse-hash method. Read its real issuance
    // events in bounded block ranges, then verify each matching record live.
    for(let from=deploymentReceipt.blockNumber;from<=latest;from+=2000) {
      const logs=await registry.queryFilter(registry.filters.CredentialIssued(),from,Math.min(from+1999,latest));
      for(const event of logs) if(event.args.documentHash.toLowerCase()===hash.toLowerCase()) {
        const c=await registry.getCredential(event.args.credentialId);
        if(!c.exists || c.documentHash.toLowerCase()!==hash.toLowerCase()) continue;
        matched.push({ credentialId:event.args.credentialId, issuer:c.issuer, issuedAt:c.issuedAt.toString(), revoked:c.revoked, status:c.revoked?'revoked':'active', transactionHash:event.transactionHash });
      }
    }
    return { records:matched, chainId:d.chainId, registryAddress:d.address, instance:d.instanceId };
  } finally { provider.destroy(); }
}
export function fileVerificationRouter(db, find = findRegisteredFile) {
  const router=Router();
  router.post('/',rateLimit({windowMs:60000,limit:20,message:{error:'Too many uploads. Please try again in a minute.'}}),upload.single('document'),async(req,res)=>{
    let hash;
    try {
      try { hash=pdfHash(req.file); } catch(e) { return res.status(400).json({error:e.message}); }
      const found=await find(hash);
      const records=found.records.map(record=>{
        const institution=db.prepare('SELECT name FROM institutions WHERE wallet=?').get(record.issuer);
        const metadata=db.prepare('SELECT course FROM certificates WHERE id=? AND registry=? AND instance=? AND document_hash=?').get(record.credentialId,found.registryAddress,found.instance,hash);
        return {...record,institutionName:institution?.name || 'Registered institution',course:metadata?.course || null};
      });
      res.json({ status:records.length ? (records.some(r=>!r.revoked)?'valid':'revoked'):'unregistered', uploadedHash:hash, fileChecked:true, fileMatches:records.length>0, blockchainChecked:true, chainId:found.chainId,registryAddress:found.registryAddress,records });
    } catch(e) {
      console.error('File verification failed:',e.shortMessage||e.message);
      res.status(503).json({error:e instanceof Unavailable?e.message:'Verification is temporarily unavailable. Please try again when the registry service is restored.',blockchainChecked:false,fileChecked:false,fileMatches:null});
    } finally {delete req.file;}
  });
  return router;
}
