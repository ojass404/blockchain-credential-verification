# System Design

## 1. Purpose and Status

This document defines the proposed architecture for the educational credential verification prototype.

Status: Design specification. The components and behaviours described here have not yet been implemented or tested.

## 2. Prototype Scope

The prototype will demonstrate:

1. Administrator approval of an institution wallet.
2. Certificate issuance by an approved institution.
3. Public credential status lookup.
4. Exact PDF integrity verification.
5. Certificate revocation.
6. Authenticated student certificate access.
7. QR links and transaction references.

Use synthetic student records throughout development and demonstration.

## 3. Architecture

```mermaid
flowchart TD
    U["Administrator, institution, or student"] --> F["React frontend"]
    V["Public verifier"] --> F
    F --> A["Express API"]
    F --> W["MetaMask wallet"]
    W --> C["Credential registry contract"]
    A --> C
    A --> D["SQLite database"]
    A --> S["Private PDF storage"]
cd "/Users/ojasmahajan/Public/Projects/Design Exp/blockchain-credential-verification"

git switch -c docs/system-design

mkdir -p docs/architecture

cat > docs/architecture/system-design.md <<'EOF'
# System Design

## 1. Purpose and Status

This document defines the proposed architecture for the educational credential verification prototype.

Status: Design specification. The components and behaviours described here have not yet been implemented or tested.

## 2. Prototype Scope

The prototype will demonstrate:

1. Administrator approval of an institution wallet.
2. Certificate issuance by an approved institution.
3. Public credential status lookup.
4. Exact PDF integrity verification.
5. Certificate revocation.
6. Authenticated student certificate access.
7. QR links and transaction references.

Use synthetic student records throughout development and demonstration.

## 3. Architecture

```mermaid
flowchart TD
    U["Administrator, institution, or student"] --> F["React frontend"]
    V["Public verifier"] --> F
    F --> A["Express API"]
    F --> W["MetaMask wallet"]
    W --> C["Credential registry contract"]
    A --> C
    A --> D["SQLite database"]
    A --> S["Private PDF storage"]
