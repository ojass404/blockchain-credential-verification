import { Contract } from 'ethers';
import { readDeployment, makeProvider, validateDeployment } from './deployment.js';
import { HttpError } from './accounts.js';
export async function chainContext(work) {
  const deployment = await readDeployment();
  const provider = makeProvider(deployment.rpcUrl);
  try {
    await validateDeployment(provider, deployment);
    return await work({ deployment, provider, registry: new Contract(deployment.address, deployment.abi, provider) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('Account blockchain action failed:', e.shortMessage || e.message);
    throw new HttpError(503, 'Blockchain unavailable or deployment stale. Check the local node and deployment.');
  } finally { provider.destroy(); }
}
export function sameDeployment(row, deployment) {
  if (row.registry !== deployment.address || row.instance !== deployment.instanceId) throw new HttpError(409, 'This record belongs to an older deployment. Issue a new credential on the current chain.');
}
