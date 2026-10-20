import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
if(process.env.NODE_ENV==='production')throw Error('Local synthetic demonstration only.');
const base='http://127.0.0.1:3001/api';
const {accounts}=JSON.parse(await readFile(new URL('../../.local/seed-accounts.json',import.meta.url)));
const a=accounts.find(a=>a.role==='institution'), student=accounts.find(a=>a.role==='student');
async function login(account,portal=account.role){const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password,portal})});return r;}
assert.equal((await login(a,'administrator')).status,403);
const loginResponse=await login(a);assert.equal(loginResponse.status,200);const {csrf}=await loginResponse.json(),cookie=loginResponse.headers.get('set-cookie').split(';')[0];
const request=(url,method='GET',body)=>fetch(base+url,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
const folder=new URL('../../.local/upload-only-fixtures/',import.meta.url);await mkdir(folder,{recursive:true});
const run=Date.now();
async function createPdf(qualification){const doc=await PDFDocument.create(),page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.Helvetica);['SYNTHETIC DEMONSTRATION CERTIFICATE',`Qualification: ${qualification}`,'Student: Demo record only',`Run: ${run}`,'Not an academic award.'].forEach((line,i)=>page.drawText(line,{x:48,y:740-i*45,size:i===0?18:13,font}));return Buffer.from(await doc.save());}
const original=await createPdf('Bachelor of Technology'),edited=await createPdf('Master of Technology');
await writeFile(new URL('original.pdf',folder),original);await writeFile(new URL('edited.pdf',folder),edited);
function upload(bytes,course){const f=new FormData();f.append('document',new Blob([bytes]),'synthetic.pdf');if(course)f.append('course',course);return f;}
async function verify(bytes,expected){const r=await request('/verify-file','POST',upload(bytes));const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));assert.equal(b.status,expected,JSON.stringify(b));return b;}
async function finish(action){const r=await request(`/dashboard/actions/${action.actionId}/execute`,'POST',{});const sent=await r.json();assert.equal(r.status,200,JSON.stringify(sent));const confirmation=await request(`/dashboard/actions/${action.actionId}/confirm`,'POST',sent);assert.equal(confirmation.status,200,await confirmation.text());}
try{
  await verify(original,'unregistered');console.log('PASS unregistered PDF is not reported valid');
  const d=await(await request('/dashboard')).json();assert.equal(d.managedSigning,true);
  const target=d.users.find(u=>u.email===student.email);
  const issue=await request(`/dashboard/students/${target.id}/issue`,'POST',upload(original,'Bachelor of Technology · synthetic demonstration'));const action=await issue.json();assert.equal(issue.status,201,JSON.stringify(action));
  await verify(original,'unregistered');console.log('PASS prepared but unsubmitted document remains unregistered');
  const other=accounts.filter(a=>a.role==='institution')[1];
  const otherLogin=await login(other),otherSession=await otherLogin.json(),otherCookie=otherLogin.headers.get('set-cookie').split(';')[0];
  const otherRequest=(path,method='GET')=>fetch(base+path,{method,headers:{Cookie:otherCookie,'X-CSRF-Token':otherSession.csrf,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
  try {
    assert.equal((await otherRequest(`/dashboard/actions/${action.actionId}/execute`,'POST')).status,404);
    assert.equal((await otherRequest(`/dashboard/students/${target.id}/issue`,'POST')).status,404);
    assert.equal((await otherRequest(`/dashboard/certificates/${action.credentialId}/revoke`,'POST')).status,404);
    assert.equal((await otherRequest(`/dashboard/certificates/${action.credentialId}/pdf`)).status,404);
    console.log('PASS managed signing rejects cross-institution execution, issuance, revocation and PDF access');
  } finally {await otherRequest('/auth/logout','POST');}

  await finish(action);const valid=await verify(original,'valid');assert.equal(valid.records.length,1);assert.equal(valid.records[0].institutionName,'Synthetic Institute A');console.log('PASS register and verify original PDF without a wallet extension or typed ID');
  await verify(edited,'unregistered');console.log('PASS edited file has no exact registered match');
  const qr=await(await request(`/dashboard/certificates/${action.credentialId}/share`)).json();assert.match(qr.qr,/^data:image\/png;base64,/);assert.match(qr.url,new RegExp(action.credentialId));
  const contextual=await request(`/verify/${action.credentialId}`,'POST',upload(edited));assert.equal((await contextual.json()).fileMatches,false);console.log('PASS shared record detects edited-PDF mismatch and QR link is generated');
  const revoked=await request(`/dashboard/certificates/${action.credentialId}/revoke`,'POST',{});assert.equal(revoked.status,200);await finish(await revoked.json());await verify(original,'revoked');console.log('PASS revoked exact file detected through upload alone');
  // Leave a second unique, active document for the UI demonstration.
  const active=await createPdf('Diploma in Computer Applications');await writeFile(new URL('active.pdf',folder),active);
  const next=await request(`/dashboard/students/${target.id}/issue`,'POST',upload(active,'Diploma in Computer Applications · synthetic demonstration'));const nextAction=await next.json();assert.equal(next.status,201);await finish(nextAction);await verify(active,'valid');
  await writeFile(new URL('evidence.json',folder),JSON.stringify({revokedId:action.credentialId,activeId:nextAction.credentialId,originalHash:valid.uploadedHash},null,2));
  console.log('PASS active demonstration file left ready for upload-only verification');
}finally{await request('/auth/logout','POST',{});}
