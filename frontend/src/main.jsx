import React from 'react';
import { createRoot } from 'react-dom/client';
import { PublicVerification } from './PublicVerification.jsx';
import { AccountPortal } from './AccountPortal.jsx';
import './style.css';

import { PublicHeader, Footer } from './Shell.jsx';
const portal = location.pathname.split('/')[2];
function App() { return location.pathname.startsWith('/login/') && ['institution','student','administrator'].includes(portal) ? <AccountPortal portal={portal}/> : <><PublicHeader/><PublicVerification/><Footer/></>; }
createRoot(document.getElementById('root')).render(<App/>);
