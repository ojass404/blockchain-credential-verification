# Blockchain Credential Verification

**Design Experience Project**

Design and Implementation of a Blockchain Enabled Framework for Secure Educational Credentials in India.

## Overview

A web prototype that allows approved educational institutions to issue digital credentials, students to access their certificates, and employers to verify certificate authenticity.

The system registers the SHA-256 hash of a finalized certificate PDF on a blockchain. Verification compares an uploaded PDF against the registered hash and checks whether the credential has been revoked.

**Current status:** Repository structure created. Application implementation has not started.

## Problem Statement

Educational certificate verification often requires manual communication with the issuing institution. This can delay verification and make altered documents difficult to identify.

This project explores a blockchain registry that records authorized issuance and revocation while keeping certificate files and personal information off-chain.

## Objectives

- Allow an administrator to authorize institution wallets.
- Enable approved institutions to register certificate hashes.
- Verify the integrity of an uploaded certificate PDF.
- Provide public credential status verification.
- Allow the original issuer or administrator to revoke credentials.
- Give students access to their own certificates.
- Generate QR links to credential verification pages.
- Display issuance and revocation transaction references.

## Core Demonstration

1. Administrator approves an institution wallet.
2. Institution uploads a finalized certificate PDF.
3. Institution signs the issuance transaction.
4. Verifier uploads the original PDF and receives a matching result.
5. Verifier uploads an edited PDF and receives a file mismatch result.
6. Institution revokes the original credential.
7. Verification displays the revoked status.

Synthetic student records will be used for development and demonstrations.

## Planned Features

| Feature | Description | Status |
| --- | --- | --- |
| Institution authorization | Administrator approves institution wallets | Planned |
| Certificate issuance | Register a finalized PDF hash on-chain | Planned |
| Public verification | Look up a credential using its ID | Planned |
| PDF integrity verification | Compare uploaded PDF bytes with the registered hash | Planned |
| Revocation | Invalidate a credential while preserving its record | Planned |
| Student access | View and download owned certificates | Planned |
| QR verification | Open a credential status page using a QR code | Planned |
| Transaction history | Display issuance and revocation references | Planned |

## Planned Technology Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React with Vite | User interface |
| Backend | Node.js with Express | Authentication, APIs, and file handling |
| Database | SQLite | Private metadata and user records |
| Smart contract | Solidity | Institution authorization and credential registry |
| Blockchain development | Hardhat | Local deployment and contract testing |
| Wallet | MetaMask | Administrator and institution transaction signing |
| Contract interaction | ethers.js | Connect application and blockchain |
| Hashing | SHA-256 | Verify exact PDF integrity |
| QR generation | qrcode | Generate verification links |

Compatible dependency versions will be selected and pinned during implementation.

## User Roles

| Role | Permissions |
| --- | --- |
| Administrator | Approve or disable institution wallets and revoke credentials |
| Institution | Issue credentials when approved and revoke its own credentials |
| Student | View and download their own certificates |
| Public verifier | Check credential status and PDF integrity without an account or wallet |

## Planned Architecture

The frontend communicates with the backend for authentication, private metadata, and certificate downloads.

Administrator and institution wallets sign blockchain transactions. Verification reads the registered credential and optionally compares an uploaded PDF's hash.

| On-chain data | Off-chain data |
| --- | --- |
| Opaque credential ID | User accounts |
| Certificate PDF hash | Student details |
| Issuer wallet address | Institution metadata |
| Issuance timestamp | Certificate PDFs |
| Revocation status | File ownership and transaction references |

Student names, marks, passwords, and certificate PDFs will not be stored on-chain.

## Project Structure

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

Empty folders contain `.gitkeep` files so Git can track them.

### Folder Responsibilities

| Folder | Purpose |
| --- | --- |
| frontend/src | Interface components, pages, styles, and client logic |
| backend/src | APIs, authentication, database access, and file handling |
| blockchain/contracts | Solidity smart contracts |
| blockchain/scripts | Deployment and contract interaction scripts |
| blockchain/test | Smart contract tests |
| docs/architecture | Architecture, schema, workflows, and design decisions |
| docs/meetings | Meeting records, responsibilities, and integration decisions |
| docs/progress | Iteration summaries and contribution records |
| docs/testing | Test cases, results, and demonstration evidence |

## Interface Design

The interface will follow a minimal academic records portal style:

- Neutral backgrounds and dark readable text.
- One muted blue accent.
- Consistent typography and spacing.
- Clearly labelled forms.
- Compact tables.
- Explicit status text alongside colours.
- Simple navigation and limited animation.

Planned screens:

1. Public verification.
2. Institution dashboard.
3. Administrator dashboard.
4. Student dashboard.

## Verification Behaviour

| Condition | Result |
| --- | --- |
| Credential ID does not exist | Not found |
| Uploaded PDF hash differs | File mismatch |
| Credential is revoked | Revoked |
| Credential is active and uploaded PDF matches | Valid and matching |
| Blockchain cannot be reached | Verification unavailable |

Revocation and file integrity will be displayed separately when both apply.

A credential lookup without a PDF only checks the registered credential's status.

## Important Design Rules

- Only approved institution wallets may issue credentials.
- An existing credential ID cannot be registered again.
- Empty document hashes must be rejected.
- Only the original issuer or administrator may revoke a credential.
- Revocation must preserve the original record.
- Disabling an institution stops future issuance without automatically revoking historical credentials.
- Issuance must be confirmed on-chain before being marked complete.
- Cancelled or failed transactions must not appear as successful issuance.
- Student downloads must enforce ownership on the backend.
- PDFs must be finalized before hashing.
- An embedded QR code must be added before the final PDF hash is calculated.

## Scope and Limitations

- SHA-256 verification checks exact file bytes.
- Re-exported or scanned PDFs may fail even when they look identical.
- A QR code checks the linked credential status; it does not prove the surrounding PDF is unchanged.
- A matching hash confirms that the file matches the registered version, not that every academic claim is true.
- The initial prototype will run on a local blockchain.
- IPFS and public testnet deployment may be added after the core workflow works.
- DigiLocker integration, batch issuance, and notifications are outside the initial implementation.
- This is an academic prototype, not a production credential service.

## Assessment Priorities

| Rubric Criterion | Weight | Evidence |
| --- | --- | --- |
| System Design | 20% | Architecture, schema, workflows, and design decisions |
| Prototype Development | 20% | Working issuance, verification, tamper detection, and revocation |
| Teamwork and Participation | 15% | Task ownership, contributions, and meeting records |
| Documentation | 15% | README, setup instructions, API and contract documentation |
| Sub-Team Collaboration | 10% | Reviews, integration notes, and shared decisions |
| Communication | 10% | Progress presentations, feedback, and demonstration script |
| Quality of Work | 10% | Validation, access controls, useful errors, and test results |

Evidence will be maintained throughout development.

## Development Roadmap

- [x] Create project directory structure.
- [ ] Add initial repository documentation.
- [ ] Initialize Git and create the GitHub repository.
- [ ] Confirm team responsibilities.
- [ ] Define architecture and database schema.
- [ ] Prepare workflow diagrams and screen sketches.
- [ ] Initialize frontend, backend, and blockchain tooling.
- [ ] Implement and test the smart contract.
- [ ] Implement authentication, file storage, and hashing.
- [ ] Connect certificate issuance.
- [ ] Implement public verification and tamper detection.
- [ ] Add revocation, student access, and QR links.
- [ ] Complete integration testing and demonstration evidence.

## GitHub Workflow

For each iteration:

1. Create an issue with an owner and completion conditions.
2. Create a focused branch.
3. Implement and verify the change.
4. Update relevant documentation.
5. Commit with a meaningful message.
6. Open a pull request.
7. Request a teammate review where practical.
8. Merge and close the issue.

Example branch names:

- docs/system-design
- feat/credential-registry
- feat/certificate-issuance
- feat/public-verification
- fix/student-download-access

Example commit messages:

- docs: add project overview and roadmap
- feat: implement credential registry
- feat: add PDF hash verification
- fix: enforce certificate download ownership

## Progress Records

Each iteration should record:

- Completed work.
- Verification performed.
- Remaining issues.
- Contributor.
- Related GitHub issue or pull request.

## Planned Testing

- Approved institution issuance.
- Unauthorized wallet issuance rejection.
- Duplicate credential ID rejection.
- Original PDF verification.
- Edited PDF mismatch.
- Unknown credential lookup.
- Credential revocation.
- Unauthorized revocation rejection.
- Student download ownership checks.
- Cancelled wallet transactions.
- Blockchain connection failure.
- Actual verification response times.

No tests have been run because implementation has not started.

## Local Setup

Only the directory structure and documentation are currently available.

Installation, environment configuration, deployment, and application start commands will be documented as each component is implemented.

## Configuration and Data Handling

- Never commit private keys or wallet seed phrases.
- Never commit passwords or real student records.
- Keep uploaded PDFs and local databases out of Git.
- Add `.env.example` files containing placeholders when configuration is defined.
- Use synthetic data during demonstrations.

## Team

Team member names and responsibilities will be added after confirmation.