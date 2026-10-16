# System design: local public verification

Status: implemented local prototype as of 16 October 2026. The previous file on this branch was empty; the historical design branch also contained an unfinished diagram and embedded shell text. This document describes the actual implementation and separates planned features.

## Components and trust boundaries

The React/Vite frontend on loopback port 5173 sends GET or multipart POST requests through its `/api` proxy to Express on port 3001. The API reads the current `.local/deployment.json`, checks local Hardhat RPC identity on port 8545, and calls `CredentialRegistry.getCredential` using the generated ABI. It holds no signer or private key. The verifier needs neither login nor wallet.

The deployment CLI compiles Solidity, deploys with the local node's unlocked administrator, and atomically records address, ABI, chain ID, RPC URL, runtime bytecode hash, deployment transaction/block hash, and Hardhat instance ID. The API checks chain, instance, bytecode, and receipt before reading a credential. This catches resets even when a deterministic address is reused. RPC, decoding, and configuration failures return 503; only an actual empty contract record returns credential-not-found 404. A reset during an in-flight multi-call check is an inherent local-development race; subsequent requests revalidate all state.

The PDF demo CLI uses a separate unlocked institution account after administrator approval. It creates fictional PDFs, hashes finalized bytes, issues records, verifies through the real HTTP API, and revokes one credential. Signing exists only in the local CLI, never in an unauthenticated HTTP route. The scripts require loopback chain 31337 and the Hardhat metadata API.

## Data model

On-chain records contain opaque bytes32 credential ID, bytes32 SHA-256 document hash, issuer address, issuance timestamp, existence flag, and revocation flag. Administrator approval controls future institution issuance. Disabling an institution does not revoke historical credentials; the original issuer or administrator can revoke. Revocation preserves all original fields.

No student name, marks, PDF, password, or private metadata is placed on-chain. The public verification API processes uploads in bounded memory and releases request references after completion/error. Authenticated issuance stores private PDFs as SQLite BLOBs, with institution and student ownership attached before preparing a transaction. Synthetic fixtures and deployment data live in ignored `.local/`. SQLite now stores institutions, users, hashed passwords, sessions, pending/confirmed blockchain actions and privately owned certificates. Parameterized SQL and foreign keys enforce record relationships; all download routes additionally enforce the authenticated role and ownership.

## Verification semantics

Registry status and file integrity are independent. Both active and revoked records may match or mismatch a PDF. Lookup without a PDF reports `fileChecked: false` and `fileMatches: null`; unknown records and infrastructure failures cannot establish file integrity. A matching hash proves equality with the registered bytes, not the truth of the academic award.

Express validates IDs before reading uploads. Multer permits one file with a 5 MiB bound; `.pdf` and `%PDF-` are basic checks only. Endpoints use rate limiting, Helmet headers, and no-store responses. The UI validates obvious input errors, has explicit unavailable/not-found/loading states, and aborts superseded requests. A request generation counter prevents late responses from repopulating a result after inputs change. A 15-second client timeout offers recovery from an unresponsive service. Labels, native controls, visible focus, and live-region announcements support keyboard and assistive use.

## Remaining scope

QR generation, full transaction-history UI, public networks, production deployment, password recovery/MFA and institutional accreditation checks are not implemented. Institution/admin/student dashboards, database authentication, private downloads and browser-wallet signing are now implemented. Local unlocked accounts and Hardhat metadata are intentional development dependencies, unsuitable for a production deployment. A production design needs explicit issuer onboarding, key custody, privacy/access controls, resource limits and transport security beyond this prototype.


## Authentication and private application boundary

`POST /api/auth/login` verifies salted scrypt passwords and issues a new random HttpOnly/SameSite=Strict cookie. SQLite stores the token hash, CSRF token, account reference and expiry. Every private request loads the account role and membership from the database; user-supplied roles are ignored. Mutations require a per-session CSRF header and enforce the configured Origin. Logout deletes the server session. `GET /api/auth/me` returns the authenticated account and request token. Public health, hashing and credential verification remain independent of login.

An institution has one assigned wallet and may have multiple operator accounts/students. Account provisioning is administrator-only. Student download ownership checks use the account ID, not just shared institution membership. Institution downloads/issuance/revocation are scoped to the account's institution. Administrator access is explicitly broader. PDFs are BLOBs in an ignored owner-readable local database and cannot be accessed via guessed filesystem paths or static serving.

Wallet proof is a single-use, five-minute challenge stored in the authenticated session. Its text binds origin, account ID, assigned wallet, local chain ID, nonce and expiry. Successful signature recovery must exactly match the database-assigned address. The proof expires after 30 minutes. It permits preparing transaction requests; it does not replace Solidity authorization. The frontend uses the browser's injected wallet to sign messages and send transactions. The backend never obtains a signer.

Issuance checks institution membership before accepting the PDF, then verifies contract approval. A pending record contains the student, institution, exact PDF hash and bytes, registry and node instance. A pending action binds the user, wallet, destination and calldata. Receipt confirmation rechecks current wallet ownership, instance, transaction identity and successful chain execution, and reconciles the on-chain hash/status. Revocation checks both the application's ownership boundary and actual contract issuer; the contract independently rejects other institutions. Missing or rejected wallet transactions remain pending and can be resumed or reconciled with a mined transaction hash. Roles and action ownership also apply to recovery endpoints.

The local seed CLI creates random demo passwords outside tracked configuration and marks the database as demo-only. Production mode rejects that database and requires explicit deployment configuration. Resetting the local blockchain does not erase private records; registry/instance binding prevents their accidental reuse in new chain state.

Implementation references: [Node SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) and [ethers wallet/signature APIs](https://docs.ethers.org/v6/getting-started/).
