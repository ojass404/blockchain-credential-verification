import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { createRegistryRouter } from './registry.js';
import { upload, pdfHash } from './upload.js';
import { database } from './database.js';
import { accountRouter, originGuard, HttpError } from './accounts.js';
import { dashboardRouter } from './dashboard.js';
export function createApp({ lookup, db = database() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', originGuard);
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'credential-verification-backend' }));
  app.use('/api/auth', accountRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api/verify', createRegistryRouter(lookup));
  app.post('/api/documents/hash', rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many uploads. Try again later.' } }), upload.single('document'), (req, res) => {
    try { res.json({ algorithm: 'SHA-256', documentHash: pdfHash(req.file), sizeBytes: req.file.size, blockchainChecked: false }); }
    catch (e) { res.status(400).json({ error: e.message }); }
    finally { delete req.file; }
  });
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, req, res, _next) => {
    delete req.file;
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'PDF exceeds the 5 MiB upload limit.' : 'Upload exactly one file using the document field.' });
    if (error.message === 'Unexpected end of form') return res.status(400).json({ error: 'The upload request was incomplete.' });
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'Unable to process the request.' });
  });
  return app;
}
