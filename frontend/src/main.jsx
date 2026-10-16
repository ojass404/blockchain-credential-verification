import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [id, setId] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(null);
  const generation = useRef(0);
  const fileInput = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  function clear() {
    generation.current += 1;
    request.current?.abort();
    setLoading(false); setResult(null); setError('');
  }
  async function verify(event) {
    event.preventDefault(); clear();
    if (!/^0x[0-9a-fA-F]{64}$/.test(id.trim())) { setError('Enter a credential ID: 0x followed by 64 hexadecimal characters.'); return; }
    if (file && (!file.name.toLowerCase().endsWith('.pdf') || file.size > 5 * 1024 * 1024)) { setError('Choose a PDF no larger than 5 MiB.'); return; }
    const controller = new AbortController(); request.current = controller;
    const current = generation.current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setLoading(true);
    try {
      const form = file ? new FormData() : null;
      if (file) form.append('document', file);
      const response = await fetch(`/api/verify/${id.trim()}`, { method: file ? 'POST' : 'GET', ...(form ? { body: form } : {}), signal: controller.signal });
      const data = await response.json();
      if (current !== generation.current) return;
      if (response.ok || (response.status === 404 && data.status === 'not_found')) setResult(data);
      else setError(`${response.status === 503 ? 'Verification unavailable. ' : ''}${data.error || 'Unable to complete verification.'}`);
    } catch (e) {
      if (current === generation.current && (e.name !== 'AbortError' || timedOut)) setError('Verification unavailable. The local service did not respond. Check that the backend and blockchain are running, then try again.');
    } finally { clearTimeout(timeout); if (current === generation.current) setLoading(false); }
  }
  return <><header><div className="masthead"><span className="wordmark">Academic Records</span><span className="prototype">Local prototype</span></div></header>
    <main><p className="eyebrow">PUBLIC VERIFICATION</p><h1>Verify a credential</h1><p className="intro">Check a credential’s current registry status. Add the certificate PDF to check whether its exact contents match the issued file.</p>
      <div className="workspace"><section aria-labelledby="form-title"><h2 id="form-title">Credential details</h2><form onSubmit={verify} noValidate>
        <label htmlFor="credential">Credential ID <span>Required</span></label><input id="credential" value={id} onChange={e => { clear(); setId(e.target.value); }} placeholder="0x…" autoComplete="off" spellCheck="false" aria-describedby="id-help"/>
        <p className="hint" id="id-help">The 66-character identifier supplied with the credential.</p>
        <label htmlFor="pdf">Certificate PDF <span>Optional</span></label><div className="file-field"><input ref={fileInput} id="pdf" type="file" accept=".pdf,application/pdf" onChange={e => { clear(); setFile(e.target.files?.[0] ?? null); }} aria-describedby="pdf-help"/>{file && <button className="text-button" type="button" onClick={() => { clear(); setFile(null); fileInput.current.value = ''; }}>Remove file</button>}</div>
        <p className="hint" id="pdf-help">PDF only, up to 5 MiB. Uploaded bytes are processed in memory and are not saved.</p>
        <button className="primary" disabled={loading} type="submit">{loading ? 'Checking registry…' : 'Verify credential'}</button>
      </form></section><aside><h2>What this check tells you</h2><p><strong>Registry status</strong><br/>Whether the credential is active or has been revoked by its issuer or administrator.</p><p><strong>File integrity</strong><br/>Whether the uploaded PDF matches the registered SHA-256 hash. Re-exporting or scanning a PDF changes its bytes.</p><p>No account or wallet is required.</p></aside></div>
      <div aria-live="polite" aria-atomic="true" aria-busy={loading}>{loading && <p className="notice">Reading the local blockchain…</p>}{error && <div className="notice error" role="alert"><h2>Unable to verify</h2><p>{error}</p></div>}{result && <section className="result" aria-labelledby="result-title"><div className="result-heading"><h2 id="result-title">Verification result</h2><span className="status">{result.status === 'not_found' ? 'Not found' : result.revoked ? 'Revoked' : 'Active'}</span></div>
      {result.exists ? <><div className="checks"><div><h3>Registry status</h3><p>{result.revoked ? 'Revoked — this credential is no longer active.' : 'Active — this credential is registered and has not been revoked.'}</p></div><div><h3>File integrity</h3><p>{!result.fileChecked ? 'File not checked — upload a PDF to compare it.' : result.fileMatches ? 'File matches — exact bytes match the issued document.' : 'File mismatch — this PDF differs from the issued document.'}</p></div></div><dl><dt>Issuer wallet</dt><dd className="mono">{result.issuer}</dd><dt>Issued</dt><dd>{new Date(Number(result.issuedAt) * 1000).toLocaleString()}</dd></dl><details><summary>Technical details</summary><dl>{[['Credential ID', result.credentialId], ['Chain ID', result.chainId], ['Registry', result.registryAddress], ['Registered SHA-256', result.registeredHash], ...(result.uploadedHash ? [['Uploaded SHA-256', result.uploadedHash]] : [])].map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd className="mono">{value}</dd></React.Fragment>)}</dl></details></> : <p>No credential with this ID exists in the current local registry. File integrity was not checked.</p>}</section>}</div>
      <footer><p>This is an academic development prototype on a local blockchain. It is not endorsed by any government or university.</p><p>A matching file establishes integrity against the registered version; it does not independently validate academic claims.</p></footer>
    </main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
