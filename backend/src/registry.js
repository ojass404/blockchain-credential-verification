import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { lookupCredential, Unavailable } from './deployment.js';
import { upload, pdfHash } from './upload.js';

export function createRegistryRouter(lookup = lookupCredential) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many verification requests. Try again later.' } }));
  router.param('id', (req, res, next, id) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return res.status(400).json({ error: 'Credential ID must be 0x followed by 64 hexadecimal characters.' });
    next();
  });
  async function verify(req, res) {
    let uploadedHash;
    try {
      if (req.method === 'POST') {
        try { uploadedHash = pdfHash(req.file); }
        catch (e) { return res.status(400).json({ error: e.message }); }
      }
      const c = await lookup(req.params.id);
      if (!c.exists) return res.status(404).json({ credentialId: req.params.id, exists: false, status: 'not_found', blockchainChecked: true, fileChecked: false, fileMatches: null });
      return res.json({ ...c, credentialId: req.params.id, status: c.revoked ? 'revoked' : 'active', blockchainChecked: true, fileChecked: Boolean(uploadedHash), fileMatches: uploadedHash ? uploadedHash.toLowerCase() === c.documentHash.toLowerCase() : null, registeredHash: c.documentHash, ...(uploadedHash ? { uploadedHash } : {}) });
    } catch (error) {
      console.error('Registry verification failed:', error.code ?? error.name, error.shortMessage ?? error.message);
      return res.status(503).json({ error: error instanceof Unavailable ? error.message : 'Blockchain verification unavailable. Check the local Hardhat RPC and redeploy if needed.', code: error instanceof Unavailable ? error.code : 'BLOCKCHAIN_UNAVAILABLE', blockchainChecked: false, fileChecked: false, fileMatches: null });
    } finally { delete req.file; }
  }
  router.get('/:id', verify);
  router.post('/:id', upload.single('document'), verify);
  return router;
}
