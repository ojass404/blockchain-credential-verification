// Local-only end-to-end security demonstration. No HTTP signing endpoint exists.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Contract } from 'ethers';
import { readDeployment, makeProvider, validateDeployment } from '../src/deployment.js';
if (process.env.NODE_ENV === 'production') throw Error('Local demonstration only.');
const { accounts } = JSON.parse(await readFile(new URL('../../.local/seed-accounts.json',import.meta.url)));
const pdf=await readFile(new URL('../../.local/fixtures/original.pdf',import.meta.url));
const d=await readDeployment(), p=makeProvider(d.rpcUrl);
const base='http://127.0.0.1:3001/api';
async function login(role,index=0) {
  const a=accounts.filter(a=>a.role===role)[index];
  const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})}); assert.equal(r.status,200);
  const cookie=r.headers.get('set-cookie').split(';')[0], {csrf}=await r.json();
  const request=(url,method='GET',body)=>fetch(base+url,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {request, wallet:a.wallet};
}
try {
  await validateDeployment(p,d);
  const ia=await login('institution',0), ib=await login('institution',1), sa=await login('student',0), sb=await login('student',1);
  for (const user of [ia,ib]) {
    const c=await (await user.request('/auth/wallet/challenge','POST',{})).json();
    const signer=await p.getSigner(user.wallet);
    const signature=await signer.signMessage(c.message);
    assert.equal((await user.request('/auth/wallet/verify','POST',{signature})).status,200);
  }
  const studentA=(await (await sa.request('/auth/me')).json()).user.id;
  const studentB=(await (await sb.request('/auth/me')).json()).user.id;
  assert.equal((await ia.request(`/dashboard/students/${studentB}/issue`,'POST',{})).status,404);
  console.log('PASS Institution A cannot issue for Institution B student');
  async function issue(user,student) {
    const form=new FormData();form.append('document',new Blob([pdf]),'synthetic.pdf');
    const r=await user.request(`/dashboard/students/${student}/issue`,'POST',form); const action=await r.json(); assert.equal(r.status,201,JSON.stringify(action));
    assert.equal((await user.request(`/dashboard/actions/${action.actionId}/confirm`,'POST',{txHash:d.transactionHash})).status,400);
    const tx=await (await p.getSigner(user.wallet)).sendTransaction({to:action.to,data:action.data});await tx.wait();
    assert.equal((await user.request(`/dashboard/actions/${action.actionId}/confirm`,'POST',{txHash:tx.hash})).status,200);
    return action.credentialId;
  }
  const a=await issue(ia,studentA), b=await issue(ib,studentB);
  assert.equal((await sa.request(`/dashboard/certificates/${a}/pdf`)).status,200);
  assert.equal((await sb.request(`/dashboard/certificates/${b}/pdf`)).status,200);
  assert.equal((await sa.request(`/dashboard/certificates/${b}/pdf`)).status,404);
  assert.equal((await sb.request(`/dashboard/certificates/${a}/pdf`)).status,404);
  console.log('PASS both students can download only their own private PDFs');
  assert.equal((await ia.request(`/dashboard/certificates/${b}/revoke`,'POST',{})).status,404);
  const registry=new Contract(d.address,d.abi,await p.getSigner(ia.wallet));
  await assert.rejects(registry.revokeCredential(b));
  console.log('PASS cross-institution revocation blocked by API and Solidity contract');
  const r=await ia.request(`/dashboard/certificates/${a}/revoke`,'POST',{});const action=await r.json(); assert.equal(r.status,200);
  const tx=await (await p.getSigner(ia.wallet)).sendTransaction({to:action.to,data:action.data});await tx.wait();
  assert.equal((await ia.request(`/dashboard/actions/${action.actionId}/confirm`,'POST',{txHash:tx.hash})).status,200);
  assert.equal((await (await fetch(base+`/verify/${a}`)).json()).status,'revoked');
  assert.equal((await (await fetch(base+`/verify/${b}`)).json()).status,'active');
  console.log('PASS authorized issuance/revocation and unauthenticated public verification');
  console.log(`Synthetic student A certificate: ${a}\nSynthetic student B certificate: ${b}`);
  for (const user of [ia,ib,sa,sb]) await user.request('/auth/logout','POST',{});
} finally {p.destroy();}
