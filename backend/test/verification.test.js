import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../src/app.js';
import { readDeployment, validateDeployment, Unavailable } from '../src/deployment.js';
import { keccak256 } from 'ethers';
const id = '0x' + '1'.repeat(64), bytes = Buffer.from('%PDF-1.4\nsynthetic test input');
const hash = '0x' + createHash('sha256').update(bytes).digest('hex');
async function serve(lookup, fn) {
  const server = createApp({ lookup }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function upload(bytes, name = 'test.pdf', field = 'document') {
  const form = new FormData(); form.append(field, new Blob([bytes]), name); return { method: 'POST', body: form };
}
const credential = { exists: true, revoked: false, issuer: '0x' + '2'.repeat(40), issuedAt: '1', documentHash: hash, chainId: '31337', registryAddress: '0x' + '3'.repeat(40) };
test('active/revoked and matching/mismatching are independent; lookup has no file claim', async () => {
  for (const revoked of [false, true]) await serve(async () => ({ ...credential, revoked }), async base => {
    const lookup = await (await fetch(`${base}/api/verify/${id}`)).json();
    assert.equal(lookup.fileChecked, false); assert.equal(lookup.fileMatches, null);
    for (const matches of [true, false]) {
      const response = await fetch(`${base}/api/verify/${id}`, upload(matches ? bytes : Buffer.from('%PDF-edited')));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.revoked, revoked); assert.equal(result.status, revoked ? 'revoked' : 'active'); assert.equal(result.fileMatches, matches); assert.equal(result.fileChecked, true);
    }
  });
});
test('unknown credentials are 404, blockchain failures are 503', async () => {
  for (const fail of [false, true]) await serve(async () => { if (fail) throw new Error('RPC refused'); return { exists: false }; }, async base => {
    for (const options of [undefined, upload(bytes)]) {
      const r = await fetch(`${base}/api/verify/${id}`, options); assert.equal(r.status, fail ? 503 : 404);
      const body = await r.json(); assert.equal(body.blockchainChecked, !fail); assert.equal(body.fileMatches, null); assert.equal(body.fileChecked, false);
    }
  });
});
test('invalid input never calls blockchain; uploads enforce limits and fields', async () => {
  let calls = 0;
  await serve(async () => { calls++; return credential; }, async base => {
    const cases = [ ['/api/verify/bad', undefined, 400], ['/api/verify/bad', upload(bytes), 400], [`/api/verify/${id}`, { method: 'POST' }, 400], [`/api/verify/${id}`, upload(bytes, 'test.txt'), 400], [`/api/verify/${id}`, upload('not a pdf'), 400], [`/api/verify/${id}`, upload(bytes, 'test.pdf', 'wrong'), 400], [`/api/verify/${id}`, upload(Buffer.alloc(5 * 1024 * 1024 + 1)), 413], ['/api/documents/hash', { method: 'POST' }, 400], ['/api/documents/hash', upload(Buffer.alloc(5 * 1024 * 1024 + 1)), 413] ];
    for (const [path, options, status] of cases) { const r = await fetch(base + path, options); assert.equal(r.status, status, path); assert.match(r.headers.get('content-type'), /json/); }
    assert.equal(calls, 0);
    const r = await fetch(base + '/api/documents/hash', upload(bytes)); assert.equal(r.status, 200); assert.equal((await r.json()).documentHash, hash);
  });
});
test('rate limiting returns 429 and no-store', async () => {
  await serve(async () => credential, async base => {
    for (let i = 0; i < 60; i++) assert.equal((await fetch(`${base}/api/verify/${id}`)).status, 200);
    const r = await fetch(`${base}/api/verify/${id}`); assert.equal(r.status, 429); assert.equal(r.headers.get('cache-control'), 'no-store');
  });
});
test('missing deployment has actionable failure', async () => {
  await assert.rejects(readDeployment('/nonexistent/credential-deployment.json'), { code: 'DEPLOYMENT_MISSING' });
  await serve(async () => { throw new Unavailable('DEPLOYMENT_STALE', 'Redeploy local registry.'); }, async base => {
    const r = await fetch(`${base}/api/verify/${id}`); assert.equal(r.status, 503); assert.equal((await r.json()).code, 'DEPLOYMENT_STALE');
  });
});
test('deployment validation rejects chain mismatch, reset, absent/wrong code and missing receipt', async () => {
  const d = { chainId: '31337', instanceId: 'instance', codeHash: keccak256('0x1234'), blockHash: 'block' };
  const provider = { send: async method => method === 'eth_chainId' ? '0x7a69' : { instanceId: 'instance' }, getCode: async () => '0x1234', getTransactionReceipt: async () => ({ blockHash: 'block' }) };
  await validateDeployment(provider, d);
  await assert.rejects(validateDeployment({ ...provider, send: async () => '0x1' }, d), { code: 'CHAIN_MISMATCH' });
  await assert.rejects(validateDeployment(provider, { ...d, instanceId: 'old' }), { code: 'DEPLOYMENT_STALE' });
  for (const code of ['0x', '0xabcd']) await assert.rejects(validateDeployment({ ...provider, getCode: async () => code }, d), { code: 'DEPLOYMENT_STALE' });
  await assert.rejects(validateDeployment({ ...provider, getTransactionReceipt: async () => null }, d), { code: 'DEPLOYMENT_STALE' });
});
