// Exercise real provider failures without stopping or resetting the user's node.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { lookupCredential, readDeployment } from '../src/deployment.js';
const directory = await mkdtemp(path.join(tmpdir(), 'credential-failures-'));
const file = path.join(directory, 'deployment.json');
const d = await readDeployment();
const server = createApp({ lookup: id => lookupCredential(id, file) }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/api/verify/0x${'1'.repeat(64)}`;
try {
  const cases = [
    ['missing artifact', null, 'DEPLOYMENT_MISSING'],
    ['reset instance', { ...d, instanceId: 'old-instance' }, 'DEPLOYMENT_STALE'],
    ['missing bytecode', { ...d, address: '0x0000000000000000000000000000000000000001' }, 'DEPLOYMENT_STALE'],
    ['ABI mismatch', { ...d, abi: [] }, 'BLOCKCHAIN_UNAVAILABLE'],
    ['unreachable RPC', { ...d, rpcUrl: 'http://127.0.0.1:1' }, 'BLOCKCHAIN_UNAVAILABLE'],
  ];
  for (const [name, config, code] of cases) {
    if (config) await writeFile(file, JSON.stringify(config));
    for (const method of ['GET', 'POST']) {
      const form = new FormData(); form.append('document', new Blob(['%PDF-1.7\nfixture']), 'fixture.pdf');
      const response = await fetch(url, { method, ...(method === 'POST' ? { body: form } : {}) });
      const body = await response.json();
      assert.equal(response.status, 503); assert.equal(body.code, code); assert.equal(body.blockchainChecked, false); assert.equal(body.fileMatches, null);
      console.log(`PASS ${method}: ${name} -> 503 ${code}`);
    }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
