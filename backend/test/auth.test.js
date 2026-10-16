import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase, hashPassword, digest } from '../src/database.js';
const password = 'synthetic-test-password';
async function fixture(work) {
  const db = openDatabase(':memory:');
  const wallets = [Wallet.createRandom(), Wallet.createRandom(), Wallet.createRandom()];
  db.prepare('INSERT INTO institutions(id,name,wallet) VALUES(1,?,?),(2,?,?)').run('Institute A', wallets[1].address, 'Institute B', wallets[2].address);
  const hash = await hashPassword(password);
  for (const [id, role, institution] of [[1,'administrator',null],[2,'institution',1],[3,'institution',2],[4,'student',1],[5,'student',2]]) db.prepare('INSERT INTO users(id,email,name,password_hash,role,institution_id,wallet) VALUES(?,?,?,?,?,?,?)').run(id, `${id}@test.example`, `Synthetic ${id}`, hash, role, institution, id===1 ? wallets[0].address : null);
  const pdf = Buffer.from('%PDF-private-a');
  db.prepare('INSERT INTO certificates(id,institution_id,student_id,document_hash,pdf,registry,instance,status) VALUES(?,?,?,?,?,?,?,?)').run('cert-a',1,4,'hash',pdf,'registry','instance','active');
  db.prepare('INSERT INTO certificates(id,institution_id,student_id,document_hash,pdf,registry,instance,status) VALUES(?,?,?,?,?,?,?,?)').run('cert-b',2,5,'hash',Buffer.from('%PDF-private-b'),'registry','instance','active');
  const server = createApp({ db, lookup: async () => ({ exists:false }) }).listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function login(id) {
    const r = await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${id}@test.example`,password,role:'administrator'})});
    assert.equal(r.status,200);
    assert.match(r.headers.get('set-cookie'),/HttpOnly/); assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
    const cookie=r.headers.get('set-cookie').split(';')[0], {csrf}=await r.json();
    return { cookie, csrf, request: (url, method='GET', body, extra={}) => fetch(base+url,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,...extra},...(body ? {body:JSON.stringify(body)} : {})}) };
  }
  try { await work({db,wallets,login,base,pdf}); } finally { await new Promise(resolve=>server.close(resolve)); db.close(); }
}
test('real sessions enforce roles, institution membership and private PDF ownership', async () => fixture(async ({login,base,pdf,db}) => {
  assert.equal((await fetch(base+'/dashboard')).status,401);
  const a=await login(4), b=await login(5), inst=await login(2), admin=await login(1);
  const me=await (await a.request('/auth/me')).json(); assert.equal(me.user.role,'student');
  assert.equal((await a.request('/dashboard/users','POST',{role:'administrator'})).status,403);
  assert.equal((await a.request('/dashboard/certificates/cert-a/pdf')).status,200);
  assert.deepEqual(Buffer.from(await (await a.request('/dashboard/certificates/cert-a/pdf')).arrayBuffer()),pdf);
  assert.equal((await b.request('/dashboard/certificates/cert-a/pdf')).status,404);
  assert.equal((await a.request('/dashboard/certificates/cert-b/pdf')).status,404);
  assert.equal((await inst.request('/dashboard/certificates/cert-b/pdf')).status,404);
  assert.equal((await admin.request('/dashboard/certificates/cert-b/pdf')).status,200);
  assert.equal((await a.request('/dashboard')).status,200);
  const list=await (await a.request('/dashboard')).json(); assert.equal(list.certificates.length,1); assert.equal(list.users.length,0);
  assert.equal((await inst.request('/dashboard/students/4/issue','POST',{})).status,403);
  assert.equal((await a.request('/auth/logout','POST',{}, {'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await a.request('/auth/logout','POST',{}, {Origin:'https://attacker.example'})).status,403);
  assert.equal((await a.request('/auth/logout','POST',{})).status,200);
  assert.equal((await a.request('/auth/me')).status,401);
  db.prepare('UPDATE sessions SET expires=0').run(); assert.equal((await b.request('/auth/me')).status,401);
  assert.equal((await fetch(base+'/verify/0x'+'1'.repeat(64))).status,404);
}));
test('wallet challenges bind assigned wallet, session, nonce and expiry; replay and role spoofing fail', async () => fixture(async ({login,wallets,db}) => {
  const a=await login(2), second=await login(2), student=await login(4);
  assert.equal((await student.request('/auth/wallet/challenge','POST',{})).status,403);
  let challenge=await (await a.request('/auth/wallet/challenge','POST',{})).json();
  assert.equal((await a.request('/auth/wallet/verify','POST',{signature:await wallets[2].signMessage(challenge.message)})).status,403);
  challenge=await (await a.request('/auth/wallet/challenge','POST',{})).json();
  const signature=await wallets[1].signMessage(challenge.message);
  assert.equal((await second.request('/auth/wallet/verify','POST',{signature})).status,403);
  assert.equal((await a.request('/auth/wallet/verify','POST',{signature})).status,200);
  assert.equal((await a.request('/auth/wallet/verify','POST',{signature})).status,403);
  assert.equal((await a.request('/dashboard/students/5/issue','POST',{institutionId:2})).status,404);
  assert.equal((await a.request('/dashboard/certificates/cert-b/revoke','POST',{institutionId:2})).status,404);
  assert.equal((await a.request('/dashboard/institutions/2/approval','POST',{approved:true})).status,403);
  challenge=await (await second.request('/auth/wallet/challenge','POST',{})).json();
  db.prepare('UPDATE sessions SET challenge_expires=0 WHERE hash=?').run(digest(second.cookie.split('=')[1]));
  assert.equal((await second.request('/auth/wallet/verify','POST',{signature:await wallets[1].signMessage(challenge.message)})).status,403);
}));
test('administrator provisions membership; passwords are hashed and SQLite persists', async () => {
  await fixture(async ({login,db}) => {
    const admin=await login(1);
    assert.equal((await admin.request('/dashboard/users','POST',{name:'New Student',email:'new@test.example',password,role:'student',institutionId:2})).status,201);
    const user=db.prepare("SELECT * FROM users WHERE email='new@test.example'").get(); assert.equal(user.institution_id,2); assert.notEqual(user.password_hash,password);
    assert.equal((await admin.request('/dashboard/users','POST',{name:'Bad',email:'bad@test.example',password,role:'administrator',institutionId:2})).status,400);
  });
  const dir=await mkdtemp(path.join(tmpdir(),'accounts-test-')); const file=path.join(dir,'accounts.sqlite');
  try { let db=openDatabase(file); db.prepare('INSERT INTO settings VALUES(?,?)').run('persistence','yes'); db.close(); db=openDatabase(file); assert.equal(db.prepare('SELECT value FROM settings WHERE key=?').get('persistence').value,'yes'); db.close(); }
  finally { await rm(dir,{recursive:true,force:true}); }
});
test('bad credentials fail and seeded databases are refused in production', async () => {
  await fixture(async ({base}) => {
    for (const email of ['4@test.example','missing@test.example']) {
      const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'incorrect'})});
      assert.equal(r.status,401); assert.equal((await r.json()).error,'Email or password is incorrect.'); assert.equal(r.headers.get('set-cookie'),null);
    }
  });
  const dir=await mkdtemp(path.join(tmpdir(),'production-seed-test-')), file=path.join(dir,'accounts.sqlite');
  let db=openDatabase(file); db.prepare('INSERT INTO settings VALUES(?,?)').run('local_seed','true'); db.close();
  const previous=process.env.NODE_ENV, previousPath=process.env.DATABASE_PATH;
  try {
    process.env.NODE_ENV='production'; process.env.DATABASE_PATH=file;
    assert.throws(()=>openDatabase(),/cannot be used in production/);
  } finally {
    if(previous===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previous;
    if(previousPath===undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH=previousPath;
    await rm(dir,{recursive:true,force:true});
  }
});
