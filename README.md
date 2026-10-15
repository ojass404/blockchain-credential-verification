# Blockchain Credential Verification

Design Experience Project: **Design and Implementation of a Blockchain Enabled Framework for Secure Educational Credentials in India**.

A web prototype for issuing, verifying, and revoking educational credentials. Approved institutions register certificate hashes on a blockchain; students access their certificates; verifiers check credential status and whether an uploaded PDF matches the issued file.

> Status: Initial repository structure and documentation only. Application code, smart contracts, deployment, and tests have not been implemented.

## Problem

Manual certificate verification can be slow, and edited documents can be difficult to distinguish from originals. This prototype explores a shared, tamper-evident credential registry with explicit institution authorization and revocation.

## Prototype objectives

- Authorize institution wallets through an administrator.
- Register the SHA-256 hash of a finalized certificate PDF.
- Verify credential status by ID and exact PDF integrity by file upload.
- Revoke a credential while preserving its original registration.
- Give students authenticated access to their own certificates.
- Generate QR links to public verification pages.
- Display blockchain transaction references.

All features above are planned. Demonstrations will use synthetic student data.

## Core demonstration

1. Administrator approves an institution wallet.
2. Institution uploads a finalized PDF and signs its issuance transaction.
3. Verifier checks the original PDF: active and matching.
4. Verifier checks an edited PDF: file mismatch.
5. Issuer revokes the credential.
6. Verifier checks again: revoked.

## Planned technology stack

| Component | Technology |
| --- | --- |
| Frontend | React with Vite |
| Backend | Node.js with Express |
| Database | SQLite |
| Smart contract | Solidity |
| Local blockchain and tests | Hardhat |
| Wallet and contract interaction | MetaMask and ethers.js |
| File integrity | SHA-256 |
| QR links | qrcode |

Compatible dependency versions will be selected and pinned during setup. No dependencies are installed yet.

## System design

The frontend communicates with the backend for authentication, private metadata, and file access. Institution and administrator wallets sign contract transactions. Public verification reads the registry and optionally compares a PDF hash.

| On-chain | Off-chain |
| --- | --- |
| Opaque credential ID, PDF hash, issuer address, issuance timestamp, revocation status | User accounts, student details, institution metadata, PDFs, file ownership, transaction references |

The backend must confirm the contract record before marking issuance complete. A cancelled transaction must never appear as a completed issuance.

### Roles

| Role | Planned permissions |
| --- | --- |
| Administrator | Approve or disable institution wallets; revoke credentials |
| Institution | Issue credentials when approved; revoke its own credentials |
| Student | View and download their own certificates |
| Public verifier | Check credential status and uploaded PDF integrity without a wallet |

## Verification rules and limitations

- A QR code opens the registered credential's status page; it does not prove the surrounding document is unchanged.
- PDF verification compares exact bytes. Re-exported or scanned copies can fail even when visually identical.
- Finalize the PDF before hashing. Insert an embedded QR before registering the final file hash.
- Show file mismatch and revocation separately when both apply.
- Report blockchain connection failures as verification unavailable, not credential not found.
- Disabling an institution stops future issuance; historical credentials are not automatically revoked.
- A matching hash proves correspondence with the registered file, not the truth of its academic claims.
- This is an academic prototype, not a production credential service or DigiLocker integration.

## Interface direction

Use a minimal academic records portal: neutral background, dark text, one muted blue accent, readable typography, labelled forms, compact tables, and clear status text. Screens will cover public verification, institution management, administration, and student access.

## Project directory

```text
blockchain-credential-verification/
├── README.md
├── DESCRIPTION.txt
├── .gitignore
├── frontend/
│   └── src/
├── backend/
│   └── src/
├── blockchain/
│   ├── contracts/
│   ├── scripts/
│   └── test/
└── docs/
    ├── architecture/
    ├── meetings/
    ├── progress/
    └── testing/
```

Empty directories contain `.gitkeep` placeholders so Git can track the structure.

## Development roadmap

- [x] Create project folder and initial documentation.
- [ ] Define architecture, database schema, workflows, and screen sketches.
- [ ] Initialize frontend, backend, and blockchain tooling.
- [ ] Implement and test contract authorization, issuance, and revocation.
- [ ] Implement authentication, file storage, and hashing.
- [ ] Connect the issuance workflow.
- [ ] Implement verification and tamper detection.
- [ ] Add student access, QR links, and transaction references.
- [ ] Complete integration checks, evidence, and demonstration guide.

## Assessment priorities

Weights below follow the semester rubric discussed for this project.

| Criterion | Weight | Planned evidence |
| --- | --- | --- |
| System Design | 20% | Architecture, schema, workflows, design decisions |
| Prototype Development | 20% | Working issuance, verification, tamper detection, revocation |
| Teamwork and Participation | 15% | Assigned issues, individual contributions, meeting records |
| Documentation | 15% | README, reproducible setup, API and contract notes |
| Sub-Team Collaboration | 10% | Reviews, integration notes, shared decisions |
| Communication | 10% | Progress presentations, feedback, demonstration script |
| Quality of Work | 10% | Validation, access controls, error handling, test results |

Maintain evidence during every iteration. Team member names and responsibilities will be added when confirmed.

## GitHub iteration workflow

1. Create an issue with scope, owner, and completion conditions.
2. Create a branch such as `feat/public-verification` or `docs/system-design`.
3. Implement and verify the change.
4. Update relevant documentation and record progress.
5. Commit with a clear message and open a pull request.
6. Request a teammate review where practical, then merge and close the issue.

Progress entries should record completed work, verification, remaining issues, contributor, and related issue or pull request.

## Planned validation

Check approved and unauthorized issuance, duplicate IDs, original and edited PDFs, unknown IDs, issuer and unauthorized revocation, student ownership checks, cancelled wallet transactions, and unavailable blockchain connections. Record actual verification timing and test outcomes in `docs/testing/`.

No tests have been run because implementation has not started.

## Local setup

This repository is a scaffold. There are no application start commands yet. Installation, environment configuration, local chain deployment, and run instructions will be added as each component is implemented.

## Data and configuration

Never commit private keys, seed phrases, passwords, real student records, uploaded PDFs, or local database files. Keep private data off-chain. Add configuration placeholders in component-specific `.env.example` files when configuration is defined.
