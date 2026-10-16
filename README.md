# Blockchain Credential Verification

Academic prototype for educational credential verification in India. The public React screen reads a local Solidity registry through Express and optionally compares the exact SHA-256 of an uploaded PDF. No verifier account or wallet is required. This project has no government or university endorsement.

## Implemented

- Administrator approval of institution wallets; approved-wallet issuance; issuer/administrator revocation.
- Public lookup and PDF comparison with independent registry status and file integrity results.
- Reproducible local deployment with generated ABI/configuration and detection of node resets or missing contracts.
- Synthetic PDF issuance and lifecycle demonstration, backend tests, and responsive React/Vite UI.

Authentication, SQLite/private metadata, student downloads, institution/admin UI, wallet integration, QR generation, and transaction-history UI remain planned. No team contributions are inferred from this implementation.

## Requirements and installation

Verified on macOS with Node.js 24.16.0 and npm 11.13.0. Hardhat 3 uses the repository lockfile; first compilation may need internet access to download Solidity 0.8.34. Run from the repository root:

```sh
npm ci --prefix blockchain
npm ci --prefix backend
npm ci --prefix frontend
```

An existing `backend/.env` is preserved. It is optional; only `PORT` (default 3001) is used. Legacy `RPC_URL`, `CHAIN_ID`, and `REGISTRY_ADDRESS` are ignored to prevent stale copied addresses from overriding the deployment artifact.

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
   npm start --prefix backend
   ```

   API: `http://127.0.0.1:3001`. `npm run dev --prefix backend` enables watching. Health checks report process health, not blockchain readiness.

4. Issue synthetic PDFs and execute the real API lifecycle:

   ```sh
   npm run demo:pdf --prefix backend
   ```

   The script creates valid original/edited PDFs with visibly different qualifications, hashes the finalized original bytes, approves a local institution, and issues two credentials. It checks active/matching, active/mismatching, revoked/matching, and revoked/mismatching through HTTP. One additional credential stays active for interactive use. IDs and evidence are written to `.local/demo.json`; PDFs are in `.local/fixtures/`. Each run creates new IDs. No issuance API is exposed.

5. Start the frontend:

   ```sh
   npm run dev --prefix frontend
   ```

   Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Paste either ID printed by the demo, then optionally select `.local/fixtures/original.pdf` or `.local/fixtures/edited.pdf`. Vite proxies `/api` to port 3001. If changing the API port, also update `frontend/vite.config.js` and the local demo script.

## API contract

- `GET /api/health`: process liveness.
- `POST /api/documents/hash`: multipart `document`; returns SHA-256 without claiming a blockchain check.
- `GET /api/verify/:id`: registry lookup; `fileChecked: false`, `fileMatches: null`.
- `POST /api/verify/:id`: multipart `document`; registry lookup and byte comparison.

IDs must be `0x` plus 64 hexadecimal characters. Successful responses contain issuer, Unix issuance timestamp (string), chain ID, address, document hash, `status` (`active` or `revoked`), and independent `fileChecked`/`fileMatches`. Revoked files can still match. Unknown IDs return 404 with `status: not_found`; infrastructure/deployment failures return 503 and never masquerade as not found. Invalid input returns 400, oversized files 413, and rate limits 429.

Uploads are limited to one PDF of at most 5 MiB, checked for `.pdf` extension and `%PDF-` header, hashed in memory, and never written by the API. These are basic format checks, not full PDF parsing or malware scanning. Hashing permits 20 requests/minute/IP; verification permits 60. API results have `Cache-Control: no-store`. Loopback binding is intentional.

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
- `backend/`: read-only API, local deployment/demo scripts, and HTTP tests.
- `frontend/`: React public verification interface.
- `docs/architecture/`: implemented design and planned boundaries (System Design, 20%).
- `docs/testing/`: observed test results and integration evidence (Prototype, 20%; Quality, 10%).
- README and reproducible demo support Documentation (15%) and Communication (10%).
- Teamwork (15%) and Collaboration (10%) require actual participant records and reviews; no such activity is fabricated here.

Team listed in the original project: Ojas Mahajan, Neet Gupta, Bhavya Kalla. Individual ownership should be recorded by the team. Keep private PDFs, database files, wallet material, `.env`, and `.local/` out of Git. Work locally on focused branches; do not push, merge, or publish without authorization.
