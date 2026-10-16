# System design: local public verification

Status: implemented local prototype as of 16 October 2026. The previous file on this branch was empty; the historical design branch also contained an unfinished diagram and embedded shell text. This document describes the actual implementation and separates planned features.

## Components and trust boundaries

The React/Vite frontend on loopback port 5173 sends GET or multipart POST requests through its `/api` proxy to Express on port 3001. The API reads the current `.local/deployment.json`, checks local Hardhat RPC identity on port 8545, and calls `CredentialRegistry.getCredential` using the generated ABI. It holds no signer or private key. The verifier needs neither login nor wallet.

The deployment CLI compiles Solidity, deploys with the local node's unlocked administrator, and atomically records address, ABI, chain ID, RPC URL, runtime bytecode hash, deployment transaction/block hash, and Hardhat instance ID. The API checks chain, instance, bytecode, and receipt before reading a credential. This catches resets even when a deterministic address is reused. RPC, decoding, and configuration failures return 503; only an actual empty contract record returns credential-not-found 404. A reset during an in-flight multi-call check is an inherent local-development race; subsequent requests revalidate all state.

The PDF demo CLI uses a separate unlocked institution account after administrator approval. It creates fictional PDFs, hashes finalized bytes, issues records, verifies through the real HTTP API, and revokes one credential. Signing exists only in the local CLI, never in an unauthenticated HTTP route. The scripts require loopback chain 31337 and the Hardhat metadata API.

## Data model

On-chain records contain opaque bytes32 credential ID, bytes32 SHA-256 document hash, issuer address, issuance timestamp, existence flag, and revocation flag. Administrator approval controls future institution issuance. Disabling an institution does not revoke historical credentials; the original issuer or administrator can revoke. Revocation preserves all original fields.

No student name, marks, PDF, password, or private metadata is placed on-chain. The API processes uploads in bounded memory and releases request references after completion/error; it does not persist uploads. Synthetic fixtures and deployment data live in ignored `.local/`. SQLite authentication/private metadata, protected certificate storage, and ownership-controlled student downloads remain planned, with no database currently connected.

## Verification semantics

Registry status and file integrity are independent. Both active and revoked records may match or mismatch a PDF. Lookup without a PDF reports `fileChecked: false` and `fileMatches: null`; unknown records and infrastructure failures cannot establish file integrity. A matching hash proves equality with the registered bytes, not the truth of the academic award.

Express validates IDs before reading uploads. Multer permits one file with a 5 MiB bound; `.pdf` and `%PDF-` are basic checks only. Endpoints use rate limiting, Helmet headers, and no-store responses. The UI validates obvious input errors, has explicit unavailable/not-found/loading states, and aborts superseded requests. A request generation counter prevents late responses from repopulating a result after inputs change. A 15-second client timeout offers recovery from an unresponsive service. Labels, native controls, visible focus, and live-region announcements support keyboard and assistive use.

## Remaining scope

Institution/admin dashboards, browser wallet signing, authentication, SQLite, private metadata, student access, QR generation, transaction-history UI, public networks, production deployment, and institutional accreditation checks are not implemented. Local unlocked accounts and Hardhat metadata are intentional development dependencies, unsuitable for a production deployment. A production design needs explicit issuer onboarding, key custody, privacy/access controls, resource limits and transport security beyond this prototype.
