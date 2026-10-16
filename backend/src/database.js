import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function openDatabase(file = process.env.DATABASE_PATH || fileURLToPath(new URL('../../.local/accounts.sqlite', import.meta.url))) {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_PATH) throw Error('Production requires an explicit DATABASE_PATH.');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') chmodSync(file, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS institutions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, wallet TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('administrator','institution','student')),
      institution_id INTEGER REFERENCES institutions(id), wallet TEXT,
      CHECK((role='administrator' AND institution_id IS NULL AND wallet IS NOT NULL) OR (role IN ('institution','student') AND institution_id IS NOT NULL)));
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires INTEGER NOT NULL, verified_wallet TEXT, wallet_expires INTEGER,
      challenge TEXT, challenge_expires INTEGER);
    CREATE TABLE IF NOT EXISTS certificates (id TEXT PRIMARY KEY, institution_id INTEGER NOT NULL REFERENCES institutions(id),
      student_id INTEGER NOT NULL REFERENCES users(id), document_hash TEXT NOT NULL, pdf BLOB NOT NULL,
      registry TEXT NOT NULL, instance TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', tx_hash TEXT);
    CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
      certificate_id TEXT REFERENCES certificates(id), wallet TEXT NOT NULL, registry TEXT NOT NULL, instance TEXT NOT NULL,
      data TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', tx_hash TEXT);
  `);
  if (process.env.NODE_ENV === 'production' && db.prepare("SELECT value FROM settings WHERE key='local_seed'").get()) {
    db.close(); throw Error('A seeded demonstration database cannot be used in production.');
  }
  return db;
}
let defaultDatabase;
export function database() { return defaultDatabase ??= openDatabase(); }
export const userFields = `u.id,u.email,u.name,u.role,u.institution_id,i.name AS institution_name,
  CASE WHEN u.role='institution' THEN i.wallet ELSE u.wallet END AS wallet`;
