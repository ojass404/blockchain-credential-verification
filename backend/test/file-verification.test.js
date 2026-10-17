import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import { managedSigningEnabled } from '../src/managed-signing.js';
async function server(findFile, run) {
  const db=openDatabase(':memory:');
  const s=createApp({db,findFile}).listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
  try{await run(`http://127.0.0.1:${s.address().port}/api/verify-file`);}finally{await new Promise(r=>s.close(r));db.close();}
}
function form(bytes='%PDF-1.7 synthetic',name='certificate.pdf') {const f=new FormData();f.append('document',new Blob([bytes]),name);return{method:'POST',body:f};}
const record={credentialId:'0x'+'a'.repeat(64),issuer:'0x'+'1'.repeat(40),issuedAt:'1',transactionHash:'0x'+'2'.repeat(64)};
test('file-only verification returns valid, revoked, unregistered and mixed records without an ID',async()=>{
  for(const statuses of [[],[false],[true],[true,false]])await server(async hash=>{
    assert.match(hash,/^0x[0-9a-f]{64}$/);return{records:statuses.map(revoked=>({...record,revoked,status:revoked?'revoked':'active'})),chainId:'31337',registryAddress:'registry',instance:'instance'};
  },async url=>{
    const r=await fetch(url,form());assert.equal(r.status,200);const b=await r.json();assert.equal(b.status,!statuses.length?'unregistered':statuses.every(Boolean)?'revoked':'valid');assert.equal(b.fileMatches,Boolean(statuses.length));assert.equal(b.blockchainChecked,true);assert.equal(b.records.length,statuses.length);assert.equal(JSON.stringify(b).includes('student_name'),false);
  });
});
test('file-only validation and registry failure never claim successful verification',async()=>{
  let calls=0;
  await server(async()=>{calls++;throw Error('RPC offline');},async url=>{
    assert.equal((await fetch(url,{method:'POST'})).status,400);
    assert.equal((await fetch(url,form('not pdf'))).status,400);
    assert.equal((await fetch(url,form('%PDF-1.7','wrong.txt'))).status,400);
    assert.equal((await fetch(url,form(Buffer.alloc(5*1024*1024+1)))).status,413);assert.equal(calls,0);
    const r=await fetch(url,form());assert.equal(r.status,503);const b=await r.json();assert.equal(b.blockchainChecked,false);assert.equal(b.fileMatches,null);
  });
});
test('managed signing requires explicit local flag and seeded database, and is forbidden in production',()=>{
  const db=openDatabase(':memory:'), previous=process.env.NODE_ENV, flag=process.env.LOCAL_MANAGED_SIGNING;
  try{process.env.NODE_ENV='development';process.env.LOCAL_MANAGED_SIGNING='true';assert.equal(managedSigningEnabled(db),false);db.prepare('INSERT INTO settings VALUES(?,?)').run('local_seed','true');assert.equal(managedSigningEnabled(db),true);process.env.NODE_ENV='production';assert.equal(managedSigningEnabled(db),false);process.env.NODE_ENV='development';process.env.LOCAL_MANAGED_SIGNING='false';assert.equal(managedSigningEnabled(db),false);}finally{db.close();if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;if(flag===undefined)delete process.env.LOCAL_MANAGED_SIGNING;else process.env.LOCAL_MANAGED_SIGNING=flag;}
});
