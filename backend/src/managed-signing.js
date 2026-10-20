import { verifyMessage } from 'ethers';
import { token } from './database.js';
import { HttpError } from './accounts.js';
import { chainContext, sameDeployment } from './chain-actions.js';

export function managedSigningEnabled(db) {
  return process.env.NODE_ENV !== 'production' && process.env.LOCAL_MANAGED_SIGNING === 'true' && Boolean(db.prepare("SELECT value FROM settings WHERE key='local_seed'").get());
}
// Explicit local-development custody: a password-authenticated operator authorizes
// the node's assigned account. This is never enabled for a production database.
export function managedProof(db) {
  return async (req, _res, next) => {
    try {
      if (managedSigningEnabled(db) && ['institution','administrator'].includes(req.account.role) && req.method === 'POST' && /\/(issue|revoke|approval|execute|confirm)$/.test(req.path)) {
        await chainContext(async ({ provider }) => {
          const signer = await provider.getSigner(req.account.wallet);
          const message = `Local credential service\nAccount: ${req.account.id}\nSession: ${req.session.hash}\nNonce: ${token()}`;
          if (verifyMessage(message, await signer.signMessage(message)) !== req.account.wallet) throw new HttpError(503, 'The institution signing service is unavailable.');
          const expires = Date.now() + 30*60000;
          db.prepare('UPDATE sessions SET verified_wallet=?,wallet_expires=? WHERE hash=?').run(req.account.wallet, expires, req.session.hash);
          req.session.verified_wallet = req.account.wallet; req.session.wallet_expires = expires;
        });
      }
      next();
    } catch (error) { next(error); }
  };
}
const executing = new Set();
export async function executeManagedAction(db, req) {
  if (!managedSigningEnabled(db)) throw new HttpError(403, 'The local transaction service is not enabled.');
  const a = db.prepare('SELECT * FROM actions WHERE id=? AND user_id=?').get(req.params.id, req.account.id);
  if (!a || a.wallet !== req.account.wallet) throw new HttpError(404, 'Action not found.');
  if (executing.has(a.id)) throw new HttpError(409, 'This operation is already being submitted. Refresh shortly.');
  executing.add(a.id);
  try {
    return await chainContext(async ({ deployment, provider, registry }) => {
      sameDeployment(a, deployment);
      const parsed = registry.interface.parseTransaction({ data:a.data });
      if (a.kind === 'approval') {
        if (req.account.role !== 'administrator' || parsed?.name !== 'setInstitutionApproval' || await registry.administrator() !== req.account.wallet) throw new HttpError(403, 'Administrator permission required.');
      } else {
        const c = db.prepare('SELECT * FROM certificates WHERE id=?').get(a.certificate_id);
        if (!c || parsed?.args[0] !== c.id || (a.kind === 'issue' && (req.account.role !== 'institution' || c.institution_id !== req.account.institution_id || parsed.name !== 'issueCredential' || parsed.args[1] !== c.document_hash)) || (a.kind === 'revoke' && (!['administrator','institution'].includes(req.account.role) || parsed.name !== 'revokeCredential' || (req.account.role === 'institution' && c.institution_id !== req.account.institution_id))) || !['issue','revoke'].includes(a.kind)) throw new HttpError(403, 'This operation does not belong to your institution.');
      }
      // Persist the submitted hash before waiting; retries never intentionally
      // resubmit an already-recorded transaction.
      let txHash = a.tx_hash;
      if (!txHash) {
        const signer = await provider.getSigner(a.wallet);
        const tx = await signer.sendTransaction({ to:a.registry, data:a.data, value:0 });
        txHash = tx.hash;
        db.prepare('UPDATE actions SET tx_hash=? WHERE id=?').run(txHash,a.id);
      }
      const receipt = await provider.waitForTransaction(txHash,1,12000);
      if (!receipt) throw new HttpError(409,'The operation is still pending. Use Retry to check it again.');
      if (receipt.status !== 1) throw new HttpError(409,'The registry rejected this operation. It was not completed.');
      return { txHash };
    });
  } finally { executing.delete(a.id); }
}
