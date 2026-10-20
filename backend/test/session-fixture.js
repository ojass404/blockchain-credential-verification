import { digest } from '../src/database.js';
export function verifierSession(db) {
  const raw='b'.repeat(64),csrf='test-csrf';
  const user=db.prepare("INSERT INTO users(email,name,password_hash,role) VALUES('verifier@test.example','Test verifier','unused','verifier')").run();
  db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)').run(digest(raw),user.lastInsertRowid,csrf,Date.now()+60000);
  return {Cookie:`credential_session=${raw}`,'X-CSRF-Token':csrf};
}
