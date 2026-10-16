import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getAddress, hexlify, randomBytes } from 'ethers';
import { hashPassword, token, userFields } from './database.js';
import { HttpError, requireRole, requireWallet, sessionMiddleware } from './accounts.js';
import { upload, pdfHash } from './upload.js';
import { chainContext, sameDeployment } from './chain-actions.js';

export function dashboardRouter(db) {
  const router = Router();
  router.use(sessionMiddleware(db));
  router.use(rateLimit({ windowMs: 60000, limit: 60, message: { error: 'Too many dashboard requests. Try again later.' } }));
  function certificate(req) {
    const row = db.prepare('SELECT * FROM certificates WHERE id=?').get(req.params.id);
    const u = req.account;
    if (!row || (u.role === 'student' && row.student_id !== u.id) || (u.role === 'institution' && row.institution_id !== u.institution_id)) throw new HttpError(404, 'Certificate not found.');
    return row;
  }
  function saveAction(req, deployment, kind, data, certificateId = null) {
    const id = token();
    db.prepare('INSERT INTO actions(id,user_id,kind,certificate_id,wallet,registry,instance,data) VALUES(?,?,?,?,?,?,?,?)').run(id, req.account.id, kind, certificateId, req.account.wallet, deployment.address, deployment.instanceId, data);
    return { actionId: id, to: deployment.address, data, chainId: deployment.chainId, wallet: req.account.wallet };
  }
  router.get('/', (req, res) => {
    const u = req.account;
    const where = u.role === 'administrator' ? '' : u.role === 'institution' ? ' WHERE c.institution_id=?' : ' WHERE c.student_id=?';
    const certificates = db.prepare(`SELECT c.id,c.institution_id,c.student_id,c.status,c.document_hash,c.tx_hash,u.name AS student_name,i.name AS institution_name FROM certificates c JOIN users u ON u.id=c.student_id JOIN institutions i ON i.id=c.institution_id${where}`).all(...(where ? [u.role === 'institution' ? u.institution_id : u.id] : []));
    const institutions = db.prepare('SELECT * FROM institutions' + (u.role === 'administrator' ? '' : ' WHERE id=?')).all(...(u.role === 'administrator' ? [] : [u.institution_id]));
    const users = u.role === 'student' ? [] : db.prepare(`SELECT ${userFields} FROM users u LEFT JOIN institutions i ON i.id=u.institution_id${u.role === 'administrator' ? '' : " WHERE u.institution_id=? AND u.role='student'"}`).all(...(u.role === 'administrator' ? [] : [u.institution_id]));
    const actions = db.prepare("SELECT id,kind,certificate_id,state,tx_hash FROM actions WHERE user_id=? AND state='pending'").all(u.id);
    res.json({ certificates, institutions, users, actions });
  });
  router.post('/institutions', (req, res) => {
    requireRole(req.account, 'administrator');
    if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 120) throw new HttpError(400, 'Enter an institution name (up to 120 characters).');
    let wallet; try { wallet = getAddress(req.body.wallet); } catch { throw new HttpError(400, 'Enter a valid institution wallet.'); }
    if (wallet === '0x0000000000000000000000000000000000000000' || db.prepare('SELECT id FROM institutions WHERE wallet=?').get(wallet)) throw new HttpError(409, 'Wallet is zero or already assigned.');
    const result = db.prepare('INSERT INTO institutions(name,wallet) VALUES(?,?)').run(req.body.name.trim(), wallet);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  router.post('/users', async (req, res) => {
    requireRole(req.account, 'administrator');
    const { name, email, password, role, institutionId } = req.body;
    if (!['institution','student'].includes(role) || typeof name !== 'string' || !name.trim() || name.length > 120 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 12 || password.length > 256) throw new HttpError(400, 'Provide name, email, role and a password of 12–256 characters.');
    if (!Number.isSafeInteger(institutionId) || !db.prepare('SELECT id FROM institutions WHERE id=?').get(institutionId)) throw new HttpError(400, 'Choose an existing institution.');
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim())) throw new HttpError(409, 'Email is already registered.');
    const hashed = await hashPassword(password);
    db.prepare('INSERT INTO users(email,name,password_hash,role,institution_id) VALUES(?,?,?,?,?)').run(email.toLowerCase().trim(), name.trim(), hashed, role, institutionId);
    res.status(201).json({ ok: true });
  });
  router.get('/certificates/:id/pdf', (req, res) => {
    const row = certificate(req);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="certificate-${row.id.slice(2,14)}.pdf"` }).send(Buffer.from(row.pdf));
  });
  router.post('/students/:studentId/issue', (req, _res, next) => {
    requireRole(req.account, 'institution'); requireWallet(req);
    const student = db.prepare("SELECT id FROM users WHERE id=? AND role='student' AND institution_id=?").get(req.params.studentId, req.account.institution_id);
    if (!student) throw new HttpError(404, 'Student not found in your institution.');
    req.student = student; next();
  }, upload.single('document'), async (req, res) => {
    try {
      let hash; try { hash = pdfHash(req.file); } catch (e) { throw new HttpError(400, e.message); }
      const prepared = await chainContext(async ({ deployment, registry }) => {
        if (!(await registry.approvedInstitutions(req.account.wallet))) throw new HttpError(403, 'Your institution wallet is not approved by the contract administrator.');
        const id = hexlify(randomBytes(32));
        db.exec('BEGIN');
        try {
          db.prepare('INSERT INTO certificates(id,institution_id,student_id,document_hash,pdf,registry,instance) VALUES(?,?,?,?,?,?,?)').run(id, req.account.institution_id, req.student.id, hash, req.file.buffer, deployment.address, deployment.instanceId);
          const action = saveAction(req, deployment, 'issue', registry.interface.encodeFunctionData('issueCredential', [id, hash]), id);
          db.exec('COMMIT'); return { ...action, credentialId: id };
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      });
      res.status(201).json(prepared);
    } finally { delete req.file; }
  });
  router.post('/certificates/:id/revoke', async (req, res) => {
    requireRole(req.account, 'institution', 'administrator'); requireWallet(req);
    const row = certificate(req);
    const action = await chainContext(async ({ deployment, registry }) => {
      sameDeployment(row, deployment);
      const c = await registry.getCredential(row.id);
      if (!c.exists || c.revoked) throw new HttpError(409, 'Credential is missing or already revoked on-chain.');
      if (req.account.role === 'institution' && c.issuer !== req.account.wallet) throw new HttpError(403, 'Only the issuing institution may revoke this credential.');
      if (req.account.role === 'administrator' && await registry.administrator() !== req.account.wallet) throw new HttpError(403, 'This wallet is not the contract administrator.');
      return saveAction(req, deployment, 'revoke', registry.interface.encodeFunctionData('revokeCredential', [row.id]), row.id);
    });
    res.json(action);
  });
  router.post('/institutions/:id/approval', async (req, res) => {
    requireRole(req.account, 'administrator'); requireWallet(req);
    const institution = db.prepare('SELECT * FROM institutions WHERE id=?').get(req.params.id);
    if (!institution) throw new HttpError(404, 'Institution not found.');
    if (typeof req.body.approved !== 'boolean') throw new HttpError(400, 'Approval must be true or false.');
    res.json(await chainContext(async ({ deployment, registry }) => {
      if (await registry.administrator() !== req.account.wallet) throw new HttpError(403, 'This wallet is not the contract administrator.');
      return saveAction(req, deployment, 'approval', registry.interface.encodeFunctionData('setInstitutionApproval', [institution.wallet, req.body.approved]));
    }));
  });
  router.get('/actions/:id', async (req, res) => {
    requireRole(req.account, 'institution', 'administrator'); requireWallet(req);
    const action = db.prepare("SELECT * FROM actions WHERE id=? AND user_id=? AND state='pending'").get(req.params.id, req.account.id);
    if (!action || action.wallet !== req.account.wallet) throw new HttpError(404, 'Pending action not found.');
    res.json(await chainContext(async ({ deployment }) => { sameDeployment(action, deployment); return { actionId: action.id, to: action.registry, data: action.data, chainId: deployment.chainId, wallet: action.wallet }; }));
  });
  router.post('/actions/:id/confirm', async (req, res) => {
    requireRole(req.account, 'institution', 'administrator'); requireWallet(req);
    const action = db.prepare('SELECT * FROM actions WHERE id=? AND user_id=?').get(req.params.id, req.account.id);
    if (!action || action.wallet !== req.account.wallet) throw new HttpError(404, 'Action not found.');
    if (action.certificate_id && req.account.role === 'institution') {
      const owned = db.prepare('SELECT id FROM certificates WHERE id=? AND institution_id=?').get(action.certificate_id, req.account.institution_id);
      if (!owned) throw new HttpError(404, 'Action not found.');
    }
    if (action.state === 'confirmed' && action.tx_hash !== req.body.txHash) throw new HttpError(409, 'This action already has a confirmed transaction.');
    if (!/^0x[0-9a-fA-F]{64}$/.test(req.body.txHash || '')) throw new HttpError(400, 'Provide the mined transaction hash.');
    await chainContext(async ({ deployment, provider, registry }) => {
      sameDeployment(action, deployment);
      const tx = await provider.getTransaction(req.body.txHash);
      const receipt = await provider.getTransactionReceipt(req.body.txHash);
      if (!tx || !receipt) throw new HttpError(409, 'Transaction is not mined yet. Retry confirmation.');
      if (receipt.status !== 1 || tx.to !== action.registry || tx.from !== action.wallet || tx.data !== action.data || tx.value !== 0n || tx.chainId !== BigInt(deployment.chainId)) throw new HttpError(400, 'Transaction does not match this authorized action or failed on-chain.');
      if (action.certificate_id) {
        const record = db.prepare('SELECT * FROM certificates WHERE id=?').get(action.certificate_id);
        const c = await registry.getCredential(record.id);
        if (!c.exists || c.documentHash !== record.document_hash) throw new HttpError(409, 'On-chain credential does not match the private record.');
        if (action.kind === 'issue' && c.issuer !== action.wallet) throw new HttpError(409, 'On-chain issuer does not match.');
        db.prepare('UPDATE certificates SET status=?,tx_hash=COALESCE(tx_hash,?) WHERE id=?').run(c.revoked ? 'revoked' : 'active', receipt.hash, record.id);
      }
      db.prepare("UPDATE actions SET state='confirmed',tx_hash=? WHERE id=?").run(receipt.hash, action.id);
    });
    res.json({ ok: true });
  });
  return router;
}
