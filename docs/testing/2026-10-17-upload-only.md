# Upload-only verification and role portals

Implemented in the existing repository after reviewing the six-page Prototype.pdf specification. The requested local workflow overrides its wallet UI assumptions: password-authenticated institutions register documents using their assigned local Hardhat signing account.

## Observed validation

- Backend: all 13 test groups pass, including sessions, role and membership boundaries, private PDF ownership, wallet challenge replay protection, deployment validation, upload limits, rate limits, upload-only statuses and managed-mode environment gates. Tests need permission to bind local loopback sockets; the sandbox-only attempt failed with EPERM, and the permitted rerun passed.
- Frontend: Vite production build passes (26 modules).
- `npm run demo:upload-only --prefix backend`: actual running HTTP API and Hardhat deployment pass unregistered and prepared-but-unsubmitted checks; password-based local issuance; exact-file verification; edited-file rejection; QR sharing; contextual mismatch; revocation; active record left ready for use.
- Managed mode also rejects Institution B executing Institution A's action, issuing for A's student, revoking A's certificate, and downloading A's PDF (404). Existing session tests cover Student A accessing Student B's private PDF.
- Browser: institution login, scoped student selection, PDF fingerprint calculation, registration and receipt confirmation succeeded without an extension/key prompt. The same uploaded file returned Verified document, the public title, Synthetic Institute A and Exact file match on `/verify`, without an ID field.
- Public browser screenshot: `upload-only-public.jpg`. Synthetic PDF layout rendered and visually inspected; no real student information used.

## Boundaries

This is a functioning local prototype, not a production-scale release. Managed signing requires the explicit flag, a seeded database and nonproduction mode; it represents local service custody rather than personal possession of an external wallet. Contract transaction authorization remains enforced. Public file lookup scans real issuance events and checks live records; production needs a persistent event index and operational infrastructure. No match alone cannot distinguish modified bytes from a never-issued PDF; a shared record link provides that context. QR links use the configured local origin and are not internet-hosted. Existing development services and blockchain state were preserved.
