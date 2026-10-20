import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicVerification } from './PublicVerification.jsx';
import { AccountPortal } from './AccountPortal.jsx';
import './style.css';

import { PublicHeader, Footer } from './Shell.jsx';
const portal = location.pathname.split('/')[2];
function VerificationAccess() {
  const [session,setSession]=useState(null),[error,setError]=useState('');
  useEffect(()=>{fetch('/api/auth/me').then(async r=>{if(r.status===401){location.replace('/login/verifier'+location.search);return;}if(!r.ok)throw Error('Unable to check your session. Please reload.');setSession(await r.json());}).catch(()=>setError('The login service is unavailable. Please reload.'));},[]);
  if(!session)return <><PublicHeader/><main className="loading-page">{error||'Checking your session…'}</main></>;
  return <><PublicHeader user={session.user} onSignOut={async()=>{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':session.csrf}});if(r.ok)location.replace('/login/verifier');}}/><PublicVerification csrf={session.csrf}/><Footer/></>;
}
function App() { return location.pathname.startsWith('/login/') && ['institution','student','administrator','verifier'].includes(portal) ? <AccountPortal portal={portal}/> : <VerificationAccess/>; }
createRoot(document.getElementById('root')).render(<App/>);
