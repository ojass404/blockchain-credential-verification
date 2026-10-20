# Blockchain Credential Verification

Academic prototype for educational credential verification in India. The public React screen reads a local Solidity registry through Express and automatically looks up the exact SHA-256 of an uploaded PDF. Verification now requires an authenticated account; no wallet is required. This project has no government or university endorsement.

## Implemented

- Administrator approval of institution wallets; approved-wallet issuance; issuer/administrator revocation.
- Public lookup and PDF comparison with independent registry status and file integrity results.
- Reproducible local deployment with generated ABI/configuration and detection of node resets or missing contracts.
- Synthetic PDF issuance and lifecycle demonstration, backend tests, and responsive React/Vite UI.

SQLite-backed authentication, private PDF storage, student downloads, role dashboards, and browser-wallet ownership verification are implemented. QR sharing and transaction history are implemented. Password recovery and MFA remain planned. No team contributions are inferred from this implementation.

## Requirements and installation

Verified on macOS with Node.js 24.16.0 and npm 11.13.0. Hardhat 3 uses the repository lockfile; first compilation may need internet access to download Solidity 0.8.34. Run from the repository root:

```sh
npm ci --prefix blockchain
npm ci --prefix backend
npm ci --prefix frontend
```

An existing `backend/.env` is preserved. It is optional. `PORT` defaults to 3001, `PUBLIC_ORIGIN` to `http://127.0.0.1:5173`, and `DATABASE_PATH` to `.local/accounts.sqlite`. `NODE_ENV=production` requires an explicit database path and HTTPS origin; seeded databases are refused. Legacy `RPC_URL`, `CHAIN_ID`, and `REGISTRY_ADDRESS` are ignored to prevent stale copied addresses from overriding the deployment artifact.

## Startup order

Use separate terminals for the long-running processes. Before starting another process, inspect existing listeners with `lsof -nP -iTCP:8545 -iTCP:3001 -iTCP:5173 -sTCP:LISTEN`. Do not stop a running node merely to resolve a port conflict.

1. Start a local node **only if one is not already running**:

   ```sh
   cd blockchain
   npx hardhat node --hostname 127.0.0.1
   ```

2. From the repository root, deploy a fresh local registry:

   ```sh
   npm run deploy:local --prefix backend
   ```

   This compiles the contract and uses the Hardhat node's unlocked account, without storing keys. It writes `.local/deployment.json` atomically, recording RPC URL, chain ID, address, ABI, bytecode hash, deployment receipt identity, and Hardhat instance ID. **This ignored artifact is the sole blockchain configuration source.** The script only targets loopback port 8545, chain 31337, and requires Hardhat metadata.

3. Start the backend:

   ```sh
   LOCAL_MANAGED_SIGNING=true npm start --prefix backend
   ```

   API: `http://127.0.0.1:3001`. `npm run dev --prefix backend` enables watching. Health checks report process health, not blockchain readiness.

4. Run `npm run seed:local --prefix backend` before the demos. Issue synthetic PDFs and execute the real API lifecycle:

   ```sh
   npm run demo:pdf --prefix backend
   ```

   The script creates valid original/edited PDFs with visibly different qualifications, hashes the finalized original bytes, approves a local institution, and issues two credentials. It checks active/matching, active/mismatching, revoked/matching, and revoked/mismatching through HTTP. One additional credential stays active for interactive use. IDs and evidence are written to `.local/demo.json`; PDFs are in `.local/fixtures/`. Each run creates new IDs. Authenticated issuance is available in the institution portal.

5. Start the frontend:

   ```sh
   npm run dev --prefix frontend
   ```

   Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Choose a PDF to verify it automatically; no credential ID is requested. To register your own PDF first, seed accounts below and use the institution portal. Vite proxies `/api` to port 3001. If changing the API port, also update `frontend/vite.config.js` and the local demo script.

## API contract

- `POST /api/verify-file`: multipart `document`; finds matching on-chain issuance events, checks current revocation status, and returns `valid`, `revoked`, or `unregistered`. Infrastructure failures return 503. Login is required; no ID is required.
- `GET /api/health`: process liveness.
- `POST /api/documents/hash`: multipart `document`; returns SHA-256 without claiming a blockchain check.
- `GET /api/verify/:id`: registry lookup; `fileChecked: false`, `fileMatches: null`.
- `POST /api/verify/:id`: multipart `document`; registry lookup and byte comparison.

IDs must be `0x` plus 64 hexadecimal characters. Successful responses contain issuer, Unix issuance timestamp (string), chain ID, address, document hash, `status` (`active` or `revoked`), and independent `fileChecked`/`fileMatches`. Revoked files can still match. Unknown IDs return 404 with `status: not_found`; infrastructure/deployment failures return 503 and never masquerade as not found. Invalid input returns 400, oversized files 413, and rate limits 429.

Uploads are limited to one PDF of at most 5 MiB, checked for `.pdf` extension and `%PDF-` header, hashed in memory, and never saved by public verification (authenticated issuance stores the private original). These are basic format checks, not full PDF parsing or malware scanning. Hashing permits 20 requests/minute/IP; ID verification permits 60; file-only verification permits 20. API results have `Cache-Control: no-store`. Loopback binding is intentional.

## Local reset and troubleshooting

- `DEPLOYMENT_MISSING`: run `npm run deploy:local --prefix backend` after starting the node.
- `DEPLOYMENT_STALE`: the node reset/restarted, bytecode changed, or the deployment transaction disappeared. Redeploy and rerun the PDF demo. Old IDs belong to the old registry and should not be reused. The API reloads the artifact for every request; redeployment needs no backend restart.
- `CHAIN_MISMATCH`: restore the expected local chain 31337, then redeploy.
- `BLOCKCHAIN_UNAVAILABLE`: inspect the backend log for the actual error and confirm the RPC on 8545 is reachable. ABI/call errors also fail closed as 503.
- `EADDRINUSE`: identify the existing listener. A dev watcher may already have reloaded the backend; do not start a second copy.
- Hash mismatch after scanning/re-exporting is expected: SHA-256 verifies exact bytes, not appearance or truth of academic claims.
- Hardhat's local state is ephemeral. Do not fund development accounts on public networks. The scripts do not deploy publicly.
- The historical `blockchain/scripts/demo-registry.ts` deploys a separate synthetic-text demo; it does not update the application's deployment artifact. Use `demo:pdf` for this app.

## Validation

```sh
cd blockchain
npx hardhat compile --force
npx hardhat test
npx tsc --noEmit
cd ..
npm test --prefix backend
npm run build --prefix frontend
# Requires a live local deployment; does not reset or stop the node:
npm run test:failures --prefix backend
# Requires the backend as well:
npm run demo:pdf --prefix backend
```

`test:failures` runs an isolated HTTP server with temporary configurations and checks missing/stale artifacts, missing bytecode, ABI failure, and unreachable RPC. It does not modify the app's configuration. Unit tests additionally cover chain mismatch, limits, invalid inputs, unknown IDs, and rate limiting.

See [test evidence](docs/testing/2026-10-16-public-verification.md) and [system design](docs/architecture/system-design.md). Production build output is generated under `frontend/dist`; production hosting and reverse-proxy configuration are outside this local prototype.

## Repository and assessment evidence

- `blockchain/`: Solidity registry and permission/lifecycle tests.
- `backend/`: authentication, issuance and verification API, local deployment/demo scripts, and HTTP tests.
- `frontend/`: React public verification interface.
- `docs/architecture/`: implemented design and planned boundaries (System Design, 20%).
- `docs/testing/`: observed test results and integration evidence (Prototype, 20%; Quality, 10%).
- README and reproducible demo support Documentation (15%) and Communication (10%).
- Teamwork (15%) and Collaboration (10%) require actual participant records and reviews; no such activity is fabricated here.

Team listed in the original project: Ojas Mahajan, Neet Gupta, Bhavya Kalla. Individual ownership should be recorded by the team. Keep private PDFs, database files, wallet material, `.env`, and `.local/` out of Git. Work locally on focused branches; do not push, merge, or publish without authorization.


## Accounts, private certificates and role dashboards

Run once after deploying the local registry:

```sh
npm run seed:local --prefix backend
```

This creates **one administrator, two institutions (one operator each), and two students (one per institution)**, all synthetic. The five emails are `admin@demo.example`, `institution-a@demo.example`, `institution-b@demo.example`, `student-a@demo.example`, and `student-b@demo.example`. Every account gets a different random password, saved only in ignored `.local/seed-accounts.json` with owner-only permissions. Open that local file to sign in; passwords are not embedded in code, docs, or `.env`. The seed refuses production mode and custom database paths. Re-running it preserves existing accounts and passwords. The application refuses a marked seed database in production, even when explicitly configured.

Open `/login/administrator`, `/login/institution`, or `/login/student` at http://127.0.0.1:5173 and sign in with an email/password from that file. The server validates that the account belongs to the selected portal. There is no role selector during sign-in. The server loads role and institution membership from SQLite on every authenticated request.

- **Administrator:** list institutions/accounts and records, create additional institutions and student/operator accounts, approve or disable institution wallets, and revoke credentials with the contract administrator wallet. The role dropdown in account creation assigns a new account's permissions; it is accessible only to an authenticated administrator.
- **Institution:** see only its own students and certificates, upload a finalized private PDF, sign issuance, and revoke its own credentials. The server rejects a student ID from another institution before handling the upload. An institution cannot select another institution's wallet or change its membership.
- **Student:** list and download only personally owned certificate PDFs. Changing an ID in the download URL does not grant access; other users' records return 404. Institution operators can access their institution's PDFs; administrators have access to all private records.

### Local signing and your own PDF

Set `LOCAL_MANAGED_SIGNING=true` in the backend environment (see `.env.example`) after running the local seed command. Institution and administrator operations then use their assigned unlocked Hardhat account through the authenticated backend. There is no extension installation, key entry or wallet connection step in the local UI. This is explicit local custody, not proof that the human possesses an external wallet. The server signs and recovers a fresh session-bound challenge with the assigned account, checks roles and ownership, and submits only previously authorized stored actions. The smart contract still enforces issuer approval and revocation permissions. This mode is disabled in production and for unseeded databases. Existing external-wallet challenge endpoints remain available for a future external-wallet client.

1. Sign in at `/login/institution` and choose **Issue credential**.
2. Select an enrolled student, enter a public certificate title and attach your finalized PDF (maximum 5 MiB).
3. The SHA-256 fingerprint appears automatically. Click **Register credential** and wait for confirmed issuance.
4. Open `/verify` and attach the same PDF. Verification runs automatically and displays institution, qualification, issue date, file integrity and live registry status.
5. Students can download their exact original and share a QR/link. Institutions can revoke their own records; the public result then reports revocation.

The backend validates transaction sender, destination, exact calldata, zero value, receipt success and deployment identity before marking an operation complete. Pending actions appear in Transaction history with Retry. Dashboard status is checked against the live registry; unavailable reads show a warning. Node resets archive records tied to the old deployment rather than silently reusing them.

A file alone cannot distinguish an edited certificate from a never-issued document: both have no matching hash. A shared credential link supplies the original record context and can explicitly report a mismatch. When multiple issuance records share a hash, every match and its current status is shown. The prototype scans real issuance events; a production deployment needs a durable indexed event reader rather than scanning all history per upload.

Run `npm run demo:upload-only --prefix backend` against the running seeded application to exercise issuance, exact match, edited file, revocation and QR sharing without a browser wallet. It creates synthetic files under `.local/upload-only-fixtures/` and leaves `active.pdf` ready to verify.

### Security demonstration and tests

With synthetic PDF fixtures already generated by `npm run demo:pdf --prefix backend`, run:

```sh
npm test --prefix backend
npm run demo:accounts --prefix backend
```

The second command uses **local-only CLI signing**, through the original external-wallet challenge flow. It logs into the seeded accounts, proves wallet ownership, issues one synthetic document for each student, confirms transaction receipts, rejects cross-student downloads and cross-institution operations, and revokes Institution A's own credential. It also attempts cross-institution revocation directly on the contract and confirms rejection. Each run leaves two labelled synthetic certificate records for inspecting the dashboards.

Sessions use random opaque cookies (HttpOnly, SameSite=Strict; Secure in production), with only their hashes stored in SQLite. Sessions expire after eight hours and logout invalidates the database record. Mutating authenticated routes require a session CSRF token; cross-origin mutations are rejected. Passwords use salted scrypt, and login/dashboard requests are rate limited. Private PDFs are stored as SQLite BLOBs, never served as static files. Public comparison uploads continue to be processed in memory without persistence.

This remains a local prototype: password reset/change, MFA, account disablement, audit-log retention, database encryption/backups, pagination/storage quotas, production provisioning and deployment are not implemented. Development accounts and the demonstration database must never become production accounts. See [account-security test evidence](docs/testing/2026-10-16-accounts.md).

## Verification access update — 20 October 2026

Verification now requires login, including both ID-based and PDF-only backend endpoints. `/verify` redirects anonymous visitors to `/login/verifier`. Any authenticated account can verify, while the verifier role has no private dashboard, PDF download, issuance, revocation or wallet access. Mutating verification requests require the session CSRF token. Shared QR links retain their record context across verifier login.

The local administrator and first student credentials were updated in place, and a government verifier account was added. Their requested credentials and the unchanged institution/second-student credentials are stored only in ignored `.local/seed-accounts.json`; no passwords are committed. These local changes preserve existing IDs, memberships and certificate ownership. Production continues to reject the seeded database. Older test evidence describes the prior anonymous-verification behavior.

## Institution student provisioning

Institution operators can open **Students → Create a student account**, enter a name, email and initial password (12–256 characters), and create a student in their own institution. The backend derives the student role and institution from the authenticated operator, rejecting attempts to assign another institution or a privileged role. Students cannot create accounts. Duplicate emails are rejected; passwords are hashed. New students appear in the institution directory and issuance selector and can sign in through `/login/student`.
