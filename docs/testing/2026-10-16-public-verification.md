# Public verification evidence — 16 October 2026

Environment: macOS, Node 24.16.0, npm 11.13.0, Hardhat 3.19.0, Solidity 0.8.34, ethers 6.17.0, React 19.2.0, Vite 7.3.7. Tests were executed against local chain 31337. No public deployment or Git push was performed.

## Diagnosis

Initial branch: `feat/pdf-registry-verification`, HEAD `e5a9d69`, with an uncommitted POST PDF verification addition in `backend/src/registry.js`. Its behavior was retained in the consolidated router. Original diff was saved to `/tmp/credential-verification-before.patch`; `.env` was not modified. Work continued on `codex/public-verification`.

Inspected local branches/history and live `git ls-remote --heads origin`. Remote main was `e8bbe2e`, behind registry lookup `e5a9d69`; the local checkout already contained the contract and local demo. No blind branch merge was needed. The local architecture document was empty; the historical design branch held malformed/incomplete content, so it was rewritten from inspected implementation.

The existing RPC answered `eth_chainId` with `0x7a69` (31337) and `web3_clientVersion` with Hardhat 3.19.0. `eth_getCode` at the `.env` address `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` returned `0x`. The original API returned 503. Re-executing the original bytecode guard against that RPC produced the exact exception `Error: No contract at the configured registry address.` The old route logged only `error.name`/`error.code`, hiding this useful message. The node was reachable and on the right chain; the configured address was stale. The existing node was never stopped or reset.

Initial sandbox loopback requests were blocked despite visible listeners. Retrying with local network permission exposed the actual application failure. An initial sandbox Hardhat run hit its compiler-cache mutex timeout; the permitted run subsequently compiled and passed. The backend's existing watcher reloaded the new files; a redundant start reported EADDRINUSE, so the existing serving process was reused.

## Automated results

- `npx hardhat compile --force`: PASS, 3 Solidity files, solc 0.8.34, Osaka target.
- `npx hardhat test`: PASS, 21 tests (3 Solidity including 256 fuzz runs; 18 Mocha, of which 16 cover CredentialRegistry).
- `npx tsc --noEmit`: PASS.
- `npm test --prefix backend`: PASS, 6 test groups covering both revocation states and both file comparisons; no-file lookup; 404 vs 503; invalid IDs; absent files; bad extension/header/field; >5 MiB uploads for both upload routes; hash correctness; 429/no-store; missing/stale artifact; wrong chain; missing/wrong bytecode; absent deployment receipt.
- `npm run build --prefix frontend`: PASS with Vite 7.3.7, 23 modules transformed.
- Dependency installation audit: backend 0 vulnerabilities; frontend initially identified Vite advisories, then 0 after pinning patched 7.3.7.
- `npm run test:failures --prefix backend`: PASS, 10 real HTTP checks (GET and POST for missing artifact, stale instance, missing bytecode, incompatible ABI, and unreachable RPC). Uses an isolated server and temporary artifact; the normal deployment artifact and live node remain untouched. Every failure returned 503, `blockchainChecked: false`, `fileChecked: false`, `fileMatches: null`.

## Real PDF lifecycle

`npm run deploy:local --prefix backend` wrote `.local/deployment.json`. The recorded run deployed registry `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`. This is evidence, not configuration to copy into `.env`.

`npm run demo:pdf --prefix backend` passed:

1. Active credential + original PDF: matching.
2. Same active credential + edited PDF: mismatching.
3. Same credential after revocation + original PDF: revoked and matching.
4. Same revoked credential + edited PDF: revoked and mismatching.
5. Separate credential left active + original PDF: matching.

Run IDs (ephemeral; obtain current values from `.local/demo.json`):

- Active: `0xac582d22265911e5b4e779d6f73394d219dbd943a658a1e30bd2be105bf3434d`.
- Revoked: `0xb3a02e219cbaf0228bd57244726f9545080c968bb2ffd9f0551d7da199492b23`.
- Original SHA-256: `36e512a437db080e938174150658a19316133eb175626b3e16f621058cc69970`.

`shasum -a 256` independently matched the registered hash. Poppler `pdfinfo` recognized a valid one-page A4 PDF 1.7. Both PDFs were rendered and visually inspected: original says Bachelor of Technology, edited says Master of Technology; both clearly label fictional data. `pdftotext` confirmed the edited visible content. Fontconfig emitted cache-write warnings in the sandbox, but rendering succeeded without clipping. Fixtures are ignored and are not committed.

## Browser checks

Using the Codex in-app browser against the real Vite proxy/API:

- Blank ID submitted: explicit validation message.
- Active ID lookup: Active and File not checked, with issuer/time.
- Selecting a file or changing the ID cleared the previous result.
- Original PDF: Active/matching and Revoked/matching both displayed correctly.
- Edited PDF: Revoked/mismatching and Active/mismatching both displayed correctly.
- Unknown valid ID: Not found, with file integrity explicitly unchecked.
- Loading text observed while a real request was pending.
- Technical details expanded to show actual chain, address and hash.
- Layout inspected at 390px and 1200px widths, with no overlapping sections.
- Browser console inspection returned no warnings/errors.

Screenshot: [working portal](portal-desktop.jpg).

## Limits of validation

Unavailable infrastructure was tested through the isolated HTTP server, not by shutting down the user's live node. Stale-instance tests substitute an old instance ID rather than resetting that node. Full automated browser race/timeout tests and screen-reader testing were not executed; cancellation/generation guarding is implemented, and input-change clearing was observed manually. Header/extension validation does not establish full PDF safety. Production hosting and institutional integrations remain untested and unimplemented. No teammate review, contribution, or collaboration activity is claimed.
