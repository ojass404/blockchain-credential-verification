import React, { useEffect, useRef, useState } from 'react';
const labels = { valid:'Verified document', revoked:'Credential revoked', unregistered:'No registered match', mismatch:'Document does not match', active:'Registered credential', not_found:'Credential not found' };
const descriptions = {
  valid:'This exact PDF matches a credential registered by its issuing institution. At least one matching record is currently active.',
  revoked:'This document matches a registered credential, but all matching records have been revoked. It should not be accepted as an active credential.',
  unregistered:'This exact file is not registered in the current registry. It may be unissued, modified, or re-exported. We cannot confirm it as a valid credential.',
  mismatch:'This PDF is different from the document registered under the shared verification link.',
  active:'This credential is active. Upload the certificate PDF to check that its exact contents match.',
  not_found:'The shared credential is not present in the current registry.'
};
export function PublicVerification({csrf}) {
  const context=new URLSearchParams(location.search).get('credential');
  const [file,setFile]=useState(null), [result,setResult]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false), [drag,setDrag]=useState(false);
  const sequence=useRef(0), controller=useRef(null), input=useRef(null);
  function reset() { sequence.current++;controller.current?.abort();setResult(null);setError('');setBusy(false); }
  async function verify(selected) {
    reset();setFile(selected);const current=sequence.current;
    if(!selected) return;
    if(!selected.name.toLowerCase().endsWith('.pdf') || selected.size>5*1024*1024) {setError('Choose a PDF no larger than 5 MiB.');return;}
    const ac=new AbortController();controller.current=ac;setBusy(true);
    const timeout=setTimeout(()=>ac.abort(),20000);
    try {
      const body=new FormData();body.append('document',selected);
      const r=await fetch(context?`/api/verify/${encodeURIComponent(context)}`:'/api/verify-file',{method:'POST',body,headers:{'X-CSRF-Token':csrf},signal:ac.signal});
      if(r.status===401){location.replace('/login/verifier'+location.search);return;}
      const data=await r.json();
      if(current!==sequence.current)return;
      if(!r.ok && data.status!=='not_found')throw Error(data.error || 'Verification is temporarily unavailable.');
      setResult(context?{...data,status:data.status==='not_found'?'not_found':!data.fileMatches?'mismatch':data.revoked?'revoked':'valid',records:data.exists?[{...data,institutionName:data.institutionName||'Registered institution'}]:[]}:data);
    } catch(e) {if(current===sequence.current)setError(e.name==='AbortError'?'The registry took too long to respond. Please try again.':e.message==='Failed to fetch'?'The verification service is unavailable. Please try again shortly.':e.message);}
    finally {clearTimeout(timeout);if(current===sequence.current)setBusy(false);}
  }
  useEffect(()=>{
    if(context) {const ac=new AbortController();controller.current=ac;const current=sequence.current;setBusy(true);fetch(`/api/verify/${encodeURIComponent(context)}`,{signal:ac.signal}).then(async r=>{const d=await r.json();if(!r.ok&&d.status!=='not_found')throw Error(d.error);if(current===sequence.current)setResult({...d,records:d.exists?[d]:[]});}).catch(e=>{if(e.name!=='AbortError'&&current===sequence.current)setError(e.message);}).finally(()=>{if(current===sequence.current)setBusy(false);});}
    return ()=>controller.current?.abort();
  },[]);
  return <main className="public-main"><div className="page-intro"><p className="eyebrow">PUBLIC VERIFICATION</p><h1>A document. A verifiable record.</h1><p>Check an educational credential against its issuing institution’s registry.<br className="desktop-only"/> Upload the original PDF. We’ll take care of the rest.</p></div>
    <div className="verification-grid"><div><section className="panel upload-panel"><div className="panel-title"><h2>Verify a certificate</h2><span className="small-tag">Authenticated verification</span></div>
      <div className={`dropzone ${drag?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files.length!==1){reset();setError('Choose one PDF at a time.');return;}verify(e.dataTransfer.files[0]);}}>
        <svg width="40" height="44" viewBox="0 0 40 44" fill="none" aria-hidden="true"><path d="M8 2h16l9 9v30H8zM24 2v10h9M14 22h13M14 28h13M14 34h8" stroke="currentColor" strokeWidth="1.6"/></svg>
        <h3>{file?file.name:'Drop your certificate here'}</h3><p>{file?`${(file.size/1024).toFixed(1)} KB · PDF document`:'PDF format · Maximum file size 5 MiB'}</p><label className="button primary file-button">{file?'Choose another PDF':'Choose PDF'}<input ref={input} type="file" accept=".pdf,application/pdf" aria-label="Certificate PDF" onChange={e=>verify(e.target.files?.[0])}/></label>
      </div><div className="privacy-line"><span aria-hidden="true">↳</span> Verification uploads are processed privately and are not saved.</div>
      {context&&<p className="hint">Opened from a credential sharing link. The uploaded file will be compared to that specific record. <a href="/verify">Start a new document check</a></p>}
    </section>
    <div aria-live="polite" aria-busy={busy}>{busy&&<section className="panel progress"><span className="spinner"/>Checking the document against the registry…</section>}{error&&<section className="panel result error" role="alert"><h2>We couldn’t complete this check</h2><p>{error}</p><button onClick={()=>verify(file)} disabled={!file}>Try again</button></section>}
    {result&&<section className={`panel result ${result.status}`}><div className="result-top"><span className="result-symbol" aria-hidden="true">{result.status==='valid'?'✓':result.status==='active'?'i':'!'}</span><div><p className="eyebrow">VERIFICATION RESULT</p><h2>{labels[result.status]||'Registry result'}</h2></div></div><p>{descriptions[result.status]}</p>
      {result.records?.length>1&&<p className="notice">This PDF is associated with {result.records.length} issuance records. Review the status of each below.</p>}
      {result.records?.map((r,index)=><div className="verified-record" key={r.credentialId||index}><div className="record-heading"><strong>{r.institutionName||'Registered institution'}</strong><span className={`badge ${r.status}`}>{r.revoked?'Revoked':'Active'}</span></div><dl><dt>Qualification</dt><dd>{r.course||'Not supplied by issuer'}</dd><dt>Issued on</dt><dd>{new Date(Number(r.issuedAt)*1000).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</dd><dt>Document integrity</dt><dd>{result.fileChecked?(result.fileMatches?'Exact file match':'File differs from registered original'):'File not checked'}</dd></dl></div>)}
      <details><summary>View verification details</summary><dl className="technical"><dt>SHA-256</dt><dd>{result.uploadedHash||result.registeredHash||result.documentHash||'File not checked'}</dd><dt>Registry</dt><dd>{result.registryAddress||'—'}</dd>{result.records?.map((r,i)=><React.Fragment key={i}><dt>Record {i+1}</dt><dd>{r.credentialId}</dd>{r.transactionHash&&<><dt>Issuance transaction</dt><dd>{r.transactionHash}</dd></>}</React.Fragment>)}</dl></details>
    </section>}</div></div>
    <aside className="verification-aside"><p className="eyebrow">HOW IT WORKS</p><ol className="steps"><li><span>01</span><div><h3>Upload the original PDF</h3><p>Use the file supplied by the institution. No credential ID or hash is needed.</p></div></li><li><span>02</span><div><h3>We check its digital fingerprint</h3><p>The file’s SHA-256 hash is compared with issuance records on the blockchain.</p></div></li><li><span>03</span><div><h3>Review the current status</h3><p>See whether the exact document is registered and whether it has been revoked.</p></div></li></ol><div className="aside-note"><h3>Received a scanned copy?</h3><p>A scan or re-export changes the file’s fingerprint. Ask the institution for the original digital PDF.</p></div><div className="aside-note"><h3>Issuing a new certificate?</h3><p>Sign in to your institution account to register the finalized document first.</p><a href="/login/institution">Go to institution portal <span aria-hidden="true">→</span></a></div></aside></div>
    <p className="verification-footnote">A file match confirms integrity against an issued record. It does not independently validate the academic claims in the document.</p>
  </main>;
}
