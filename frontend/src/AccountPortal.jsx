import React, { useEffect, useState } from 'react';
import { BrowserProvider } from 'ethers';

export function AccountPortal() {
  const [session, setSession] = useState(null), [data, setData] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [hashes, setHashes] = useState({});
  async function api(path, options = {}) {
    const response = await fetch('/api' + path, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(session ? { 'X-CSRF-Token': session.csrf } : {}), ...options.headers } });
    const body = await response.json();
    if (response.status === 401) { setSession(null); setData(null); }
    if (!response.ok) throw Error(body.error || 'Request failed.');
    return body;
  }
  async function refresh() {
    const s = await api('/auth/me'); setSession(s);
    setData(await api('/dashboard'));
  }
  useEffect(() => { refresh().catch(e => { if (e.message !== 'Sign in to continue.') setError(e.message); }); }, []);
  async function task(work) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e.shortMessage || e.message); }
    finally { setBusy(false); }
  }
  async function signerFor(wallet) {
    if (!window.ethereum) throw Error('Use a browser with an Ethereum wallet extension connected to the local Hardhat network. No wallet keys are stored by this app.');
    const provider = new BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    if ((await provider.getNetwork()).chainId !== 31337n) throw Error('Switch your wallet to the local Hardhat network (chain 31337).');
    const signer = await provider.getSigner();
    if (await signer.getAddress() !== wallet) throw Error(`Select your assigned wallet: ${wallet}`);
    return signer;
  }
  async function verifyWallet() {
    const challenge = await api('/auth/wallet/challenge', { method: 'POST', body: '{}' });
    const signer = await signerFor(challenge.wallet);
    const signature = await signer.signMessage(challenge.message);
    await api('/auth/wallet/verify', { method: 'POST', body: JSON.stringify({ signature }) });
    await refresh(); setNotice('Wallet ownership verified for this session for 30 minutes.');
  }
  async function sendAction(action) {
    const signer = await signerFor(action.wallet);
    const tx = await signer.sendTransaction({ to: action.to, data: action.data, value: 0, chainId: Number(action.chainId) });
    setHashes(previous => ({ ...previous, [action.actionId]: tx.hash }));
    setNotice('Transaction submitted. Waiting for its receipt…');
    await tx.wait();
    await api(`/dashboard/actions/${action.actionId}/confirm`, { method: 'POST', body: JSON.stringify({ txHash: tx.hash }) });
    await refresh(); setNotice('Transaction confirmed on-chain and recorded.');
  }
  async function transact(path, body) {
    const action = await api('/dashboard' + path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
    await refresh();
    await sendAction(action);
  }
  const role = session?.user.role;
  return <section className="account-portal"><p className="eyebrow">PRIVATE ACCOUNT ACCESS</p><h1>{session ? `${role === 'administrator' ? 'Administrator' : role === 'institution' ? 'Institution' : 'Student'} dashboard` : 'Sign in'}</h1>
    <p className="intro">{session ? `${session.user.name} · ${session.user.institution_name || 'Registry administration'}` : 'Sign in with your assigned account. Your permissions and institution membership are checked by the server.'}</p>
    {error && <p role="alert" className="notice error">{error}</p>}<p role="status">{busy ? 'Working… ' : ''}{notice}</p>
    {!session ? <form className="account-form" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); task(async () => { await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); await refresh(); }); }}>
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required/>
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required/>
      <button className="primary" disabled={busy}>Sign in</button>
    </form> : <>
      <div className="account-toolbar"><button disabled={busy} onClick={() => task(refresh)}>Refresh dashboard</button><button disabled={busy} onClick={() => task(async () => { await api('/auth/logout', { method:'POST', body:'{}' }); setSession(null); setData(null); setHashes({}); })}>Sign out</button></div>
      {role !== 'student' && <section className="account-section"><h2>Assigned wallet</h2><p className="mono">{session.user.wallet}</p><p>{session.walletVerified ? 'Ownership verified for this session.' : 'Verify wallet ownership before issuing, revoking or approving.'}</p><button disabled={busy} onClick={() => task(verifyWallet)}>Connect and verify wallet</button><p className="hint">Transactions are signed in your wallet on chain 31337. The contract independently checks transaction permissions.</p></section>}
      {data && <>
        {role === 'administrator' && <section className="account-section"><h2>Institutions</h2>{data.institutions.map(i => <div className="record" key={i.id}><strong>{i.name}</strong><p className="mono">{i.wallet}</p><div className="account-toolbar"><button disabled={busy || !session.walletVerified} onClick={() => task(() => transact(`/institutions/${i.id}/approval`, { approved:true }))}>Approve wallet</button><button disabled={busy || !session.walletVerified} onClick={() => task(() => transact(`/institutions/${i.id}/approval`, { approved:false }))}>Disable future issuance</button></div></div>)}
        <details><summary>Add institution</summary><form className="account-form" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; const values=Object.fromEntries(new FormData(form)); task(async () => { await api('/dashboard/institutions',{method:'POST',body:JSON.stringify(values)}); form.reset(); await refresh(); }); }}><label htmlFor="institution-name">Institution name</label><input id="institution-name" name="name" required maxLength={120}/><label htmlFor="institution-wallet">Assigned wallet address</label><input id="institution-wallet" name="wallet" required/><button disabled={busy}>Create institution</button></form></details></section>}
        {role === 'administrator' && <section className="account-section"><h2>Accounts</h2>{data.users.map(u => <p key={u.id}>{u.name} — {u.role} · {u.institution_name || 'Administration'}</p>)}<details><summary>Create institution or student account</summary><form className="account-form" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; const values=Object.fromEntries(new FormData(form)); values.institutionId=Number(values.institutionId); task(async () => { await api('/dashboard/users',{method:'POST',body:JSON.stringify(values)}); form.reset(); await refresh(); }); }}>
          <label htmlFor="new-name">Name</label><input id="new-name" name="name" required maxLength={120}/><label htmlFor="new-email">Email</label><input id="new-email" name="email" type="email" required/><label htmlFor="new-password">Initial password (12–256 characters)</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/>
          <label htmlFor="new-role">Assigned account role</label><select id="new-role" name="role"><option value="student">Student</option><option value="institution">Institution operator</option></select><label htmlFor="new-institution">Institution membership</label><select id="new-institution" name="institutionId" required>{data.institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select><button disabled={busy}>Create account</button></form></details></section>}
        {role === 'institution' && <section className="account-section"><h2>Issue a credential</h2><p>Choose a student in your institution and the finalized PDF. The document stays private; only its hash is registered on-chain.</p><form className="account-form" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; const values=new FormData(form); const student=values.get('student'); values.delete('student'); task(async () => { await transact(`/students/${student}/issue`, values); form.reset(); }); }}><label htmlFor="issue-student">Student</label><select id="issue-student" name="student" required><option value="">Choose a student</option>{data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select><label htmlFor="issue-pdf">Final certificate PDF (up to 5 MiB)</label><input id="issue-pdf" name="document" type="file" accept=".pdf,application/pdf" required/><button className="primary" disabled={busy || !session.walletVerified}>Prepare and sign issuance</button></form></section>}
        <section className="account-section"><h2>{role === 'student' ? 'Your certificates' : 'Certificate records'}</h2><p className="hint">Status reflects the last confirmed dashboard transaction. Public verification reads current blockchain status.</p>{!data.certificates.length && <p>No certificates yet.</p>}{data.certificates.map(c => <article className="record" key={c.id}><strong>{c.student_name} · {c.institution_name}</strong><p className="mono">{c.id}</p><p>Recorded status: {c.status}</p><div className="account-toolbar"><a href={`/api/dashboard/certificates/${c.id}/pdf`}>Download private PDF</a>{role !== 'student' && c.status === 'active' && <button disabled={busy || !session.walletVerified} onClick={() => task(() => transact(`/certificates/${c.id}/revoke`, {}))}>Revoke with wallet</button>}</div></article>)}</section>
        {role !== 'student' && data.actions.length > 0 && <section className="account-section"><h2>Pending wallet actions</h2><p>A cancelled wallet request is not a completed transaction. Resume signing, or confirm the transaction hash if it was already mined.</p>{data.actions.map(a => <article className="record" key={a.id}><p>{a.kind} {a.certificate_id && <span className="mono">{a.certificate_id}</span>}</p><button disabled={busy || !session.walletVerified} onClick={() => task(async () => sendAction(await api(`/dashboard/actions/${a.id}`)))}>Resume signing</button><label htmlFor={`tx-${a.id}`}>Mined transaction hash</label><input id={`tx-${a.id}`} value={hashes[a.id] || ''} onChange={e => setHashes({...hashes,[a.id]:e.target.value})}/><button disabled={busy || !session.walletVerified || !hashes[a.id]} onClick={() => task(async () => { await api(`/dashboard/actions/${a.id}/confirm`,{method:'POST',body:JSON.stringify({txHash:hashes[a.id]})}); await refresh(); })}>Confirm receipt</button></article>)}</section>}
      </>}
    </>}
  </section>;
}
