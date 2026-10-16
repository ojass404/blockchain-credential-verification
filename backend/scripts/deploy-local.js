import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { ContractFactory, keccak256 } from 'ethers';
import { deploymentPath, makeProvider } from '../src/deployment.js';
const rpcUrl = 'http://127.0.0.1:8545';
const provider = makeProvider(rpcUrl);
try {
  if (BigInt(await provider.send('eth_chainId', [])) !== 31337n) throw Error('Local chain 31337 required.');
  const metadata = await provider.send('hardhat_metadata', []);
  const artifact = JSON.parse(await readFile(new URL('../../blockchain/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json', import.meta.url)));
  const registry = await new ContractFactory(artifact.abi, artifact.bytecode, await provider.getSigner(0)).deploy();
  await registry.waitForDeployment();
  const receipt = await registry.deploymentTransaction().wait();
  const address = await registry.getAddress();
  const deployment = { version: 1, rpcUrl, chainId: '31337', instanceId: metadata.instanceId, address, abi: artifact.abi, codeHash: keccak256(await provider.getCode(address)), transactionHash: receipt.hash, blockHash: receipt.blockHash };
  await mkdir(new URL('../../.local/', import.meta.url), { recursive: true });
  await writeFile(deploymentPath + '.tmp', JSON.stringify(deployment, null, 2) + '\n');
  await rename(deploymentPath + '.tmp', deploymentPath);
  console.log(`Local registry deployed: ${address}\nConfiguration: ${deploymentPath}`);
} finally { provider.destroy(); }
