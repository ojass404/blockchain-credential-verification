import { writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Contract } from 'ethers';
import { openDatabase, hashPassword, token } from '../src/database.js';
import { readDeployment, makeProvider, validateDeployment } from '../src/deployment.js';
if (process.env.NODE_ENV === 'production' || !process.argv.includes('--local') || process.env.DATABASE_PATH) throw Error('Seed requires --local, non-production mode, and the default local database.');
const db = openDatabase();
const output = new URL('../../.local/seed-accounts.json', import.meta.url);
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
  console.log(`Database already contains accounts; no passwords or memberships changed. Existing seed credentials, if created: ${fileURLToPath(output)}`);
  db.close();
} else {
  const d = await readDeployment(), p = makeProvider(d.rpcUrl);
  try {
    await validateDeployment(p, d);
    const admin = await p.getSigner(0);
    const wallets = [await admin.getAddress(), await (await p.getSigner(1)).getAddress(), await (await p.getSigner(2)).getAddress()];
    const registry = new Contract(d.address, d.abi, admin);
    if (await registry.administrator() !== wallets[0]) throw Error('Local account 0 must be the registry administrator.');
    for (const wallet of wallets.slice(1)) await (await registry.setInstitutionApproval(wallet, true)).wait();
    const accounts = [
      { name: 'Demo Administrator', email: 'admin@demo.example', role: 'administrator', institutionId: null, wallet: wallets[0] },
      { name: 'Demo Institution A Operator', email: 'institution-a@demo.example', role: 'institution', institutionId: 1, wallet: wallets[1] },
      { name: 'Demo Institution B Operator', email: 'institution-b@demo.example', role: 'institution', institutionId: 2, wallet: wallets[2] },
      { name: 'Synthetic Student A', email: 'student-a@demo.example', role: 'student', institutionId: 1, wallet: null },
      { name: 'Synthetic Student B', email: 'student-b@demo.example', role: 'student', institutionId: 2, wallet: null },
    ];
    for (const account of accounts) { account.password = token().slice(0,24); account.hash = await hashPassword(account.password); }
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO institutions(id,name,wallet) VALUES(1,?,?),(2,?,?)').run('Synthetic Institute A', wallets[1], 'Synthetic Institute B', wallets[2]);
      for (const a of accounts) db.prepare('INSERT INTO users(name,email,password_hash,role,institution_id,wallet) VALUES(?,?,?,?,?,?)').run(a.name, a.email, a.hash, a.role, a.institutionId, a.role === 'administrator' ? a.wallet : null);
      db.prepare("INSERT INTO settings(key,value) VALUES('local_seed','true')").run();
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    await writeFile(output, JSON.stringify({ warning: 'LOCAL SYNTHETIC ACCOUNTS ONLY. Never use these credentials or this database in production.', accounts: accounts.map(({ hash, ...a }) => a) }, null, 2) + '\n', { mode: 0o600 });
    await chmod(output, 0o600);
    console.log(`Created one administrator, two institutions and two students.\nRandom local passwords: ${fileURLToPath(output)}\nInstitution wallets approved on the current local registry. No private keys stored.`);
  } finally { p.destroy(); db.close(); }
}
