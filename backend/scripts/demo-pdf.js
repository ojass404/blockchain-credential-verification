import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { Contract, randomBytes, hexlify, sha256 } from 'ethers';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readDeployment, makeProvider, validateDeployment } from '../src/deployment.js';
const d = await readDeployment();
const p = makeProvider(d.rpcUrl);
const folder = new URL('../../.local/fixtures/', import.meta.url);
try {
  await validateDeployment(p, d);
  await mkdir(folder, { recursive: true });
  for (const [name, qualification] of [['original', 'Bachelor of Technology'], ['edited', 'Master of Technology']]) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = ['SYNTHETIC CERTIFICATE', 'Local development fixture - no institutional endorsement', 'Student: DEMO-001 (fictional)', `Qualification: ${qualification}`, 'Issued by: Example Learning Institute (fictional)', 'This document is not an academic award.'];
    lines.forEach((text, i) => page.drawText(text, { x: 48, y: 740 - i * 44, size: i === 0 ? 22 : 12, font, color: rgb(.15, .2, .25) }));
    await writeFile(new URL(`${name}.pdf`, folder), await doc.save());
  }
  const original = await readFile(new URL('original.pdf', folder));
  const edited = await readFile(new URL('edited.pdf', folder));
  assert.notEqual(sha256(original), sha256(edited));
  const admin = await p.getSigner(0), issuer = await p.getSigner(1);
  const registry = new Contract(d.address, d.abi, admin);
  await (await registry.setInstitutionApproval(await issuer.getAddress(), true)).wait();
  const activeId = hexlify(randomBytes(32)), revokedId = hexlify(randomBytes(32));
  for (const id of [activeId, revokedId]) await (await registry.connect(issuer).issueCredential(id, sha256(original))).wait();
  const evidence = [];
  async function check(id, bytes, status, matches) {
    const form = new FormData(); form.append('document', new Blob([bytes], { type: 'application/pdf' }), 'certificate.pdf');
    const response = await fetch(`http://127.0.0.1:3001/api/verify/${id}`, { method: 'POST', body: form });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.status, status); assert.equal(result.fileMatches, matches); assert.equal(result.fileChecked, true);
    evidence.push({ status, matches, credentialId: id });
    console.log(`PASS ${status} / ${matches ? 'matching original' : 'mismatching edited PDF'}`);
  }
  await check(revokedId, original, 'active', true);
  await check(revokedId, edited, 'active', false);
  await (await registry.connect(issuer).revokeCredential(revokedId)).wait();
  await check(revokedId, original, 'revoked', true);
  await check(revokedId, edited, 'revoked', false);
  await check(activeId, original, 'active', true);
  await writeFile(new URL('../../.local/demo.json', import.meta.url), JSON.stringify({ activeId, revokedId, originalHash: sha256(original), evidence }, null, 2));
  console.log(`Active ID: ${activeId}\nRevoked ID: ${revokedId}\nPDFs: ${folder.pathname}`);
} finally { p.destroy(); }
