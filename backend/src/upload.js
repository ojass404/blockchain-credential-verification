import multer from 'multer';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 } });
export function pdfHash(file) {
  if (!file) throw new Error('Upload one PDF using the document field.');
  if (path.extname(file.originalname).toLowerCase() !== '.pdf' || file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('The file must have a .pdf extension and PDF header.');
  return '0x' + createHash('sha256').update(file.buffer).digest('hex');
}
