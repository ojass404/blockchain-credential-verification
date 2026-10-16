import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Contract, FetchRequest, JsonRpcProvider, getAddress, keccak256 } from 'ethers';

export const deploymentPath = fileURLToPath(new URL('../../.local/deployment.json', import.meta.url));
export class Unavailable extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export async function readDeployment(file = deploymentPath) {
  try {
    const d = JSON.parse(await readFile(file, 'utf8'));
    if (d.version !== 1 || d.chainId !== '31337' || !d.instanceId || !d.codeHash || !Array.isArray(d.abi)) throw Error('Invalid artifact');
    getAddress(d.address);
    const url = new URL(d.rpcUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Nonlocal RPC');
    return d;
  } catch {
    throw new Unavailable('DEPLOYMENT_MISSING', 'Local deployment is missing or invalid. Run npm run deploy:local in backend.');
  }
}
export function makeProvider(url) {
  const request = new FetchRequest(url);
  request.timeout = 4000;
  return new JsonRpcProvider(request, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
}
export async function validateDeployment(provider, d) {
  if (BigInt(await provider.send('eth_chainId', [])) !== BigInt(d.chainId)) throw new Unavailable('CHAIN_MISMATCH', 'RPC chain differs from the local deployment. Restore chain 31337 and redeploy.');
  const metadata = await provider.send('hardhat_metadata', []);
  if (metadata.instanceId !== d.instanceId) throw new Unavailable('DEPLOYMENT_STALE', 'Hardhat restarted or reset. Run npm run deploy:local and npm run demo:pdf in backend.');
  const code = await provider.getCode(d.address);
  if (code === '0x' || keccak256(code) !== d.codeHash) throw new Unavailable('DEPLOYMENT_STALE', 'Registry bytecode is missing or changed. Run npm run deploy:local in backend.');
  const receipt = await provider.getTransactionReceipt(d.transactionHash);
  if (!receipt || receipt.blockHash !== d.blockHash) throw new Unavailable('DEPLOYMENT_STALE', 'Deployment transaction is no longer on this chain. Redeploy the local registry.');
}
export async function lookupCredential(id, file = deploymentPath) {
  const d = await readDeployment(file);
  const provider = makeProvider(d.rpcUrl);
  try {
    await validateDeployment(provider, d);
    const c = await new Contract(d.address, d.abi, provider).getCredential(id);
    return { exists: c.exists, revoked: c.revoked, issuer: c.issuer, issuedAt: c.issuedAt.toString(), documentHash: c.documentHash, chainId: d.chainId, registryAddress: d.address };
  } finally { provider.destroy(); }
}
