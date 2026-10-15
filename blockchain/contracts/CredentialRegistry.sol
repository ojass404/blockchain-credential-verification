// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Educational Credential Registry
/// @notice Registers finalized document hashes and preserves revocation history.
contract CredentialRegistry {
    address public immutable administrator;

    mapping(address => bool) public approvedInstitutions;

    struct Credential {
        bytes32 documentHash;
        address issuer;
        uint256 issuedAt;
        bool exists;
        bool revoked;
    }

    mapping(bytes32 => Credential) private credentials;

    error Unauthorized();
    error InvalidInstitution();
    error InstitutionNotApproved();
    error InvalidCredentialId();
    error InvalidDocumentHash();
    error CredentialAlreadyExists();
    error CredentialNotFound();
    error CredentialAlreadyRevoked();

    event InstitutionApprovalChanged(
        address indexed institution,
        bool approved
    );

    event CredentialIssued(
        bytes32 indexed credentialId,
        address indexed issuer,
        bytes32 documentHash,
        uint256 issuedAt
    );

    event CredentialRevoked(
        bytes32 indexed credentialId,
        address indexed revokedBy
    );

    constructor() {
        administrator = msg.sender;
    }

    modifier onlyAdministrator() {
        if (msg.sender != administrator) {
            revert Unauthorized();
        }
        _;
    }

    /// @notice Approve or disable a wallet for future issuance.
    /// @dev Existing credentials are unaffected.
    function setInstitutionApproval(
        address institution,
        bool approved
    ) external onlyAdministrator {
        if (institution == address(0)) {
            revert InvalidInstitution();
        }

        approvedInstitutions[institution] = approved;

        emit InstitutionApprovalChanged(institution, approved);
    }

    /// @notice Register the SHA-256 hash of a finalized PDF.
    /// @dev The caller must supply the SHA-256 digest as bytes32.
    function issueCredential(
        bytes32 credentialId,
        bytes32 documentHash
    ) external {
        if (!approvedInstitutions[msg.sender]) {
            revert InstitutionNotApproved();
        }

        if (credentialId == bytes32(0)) {
            revert InvalidCredentialId();
        }

        if (documentHash == bytes32(0)) {
            revert InvalidDocumentHash();
        }

        if (credentials[credentialId].exists) {
            revert CredentialAlreadyExists();
        }

        credentials[credentialId] = Credential({
            documentHash: documentHash,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            exists: true,
            revoked: false
        });

        emit CredentialIssued(
            credentialId,
            msg.sender,
            documentHash,
            block.timestamp
        );
    }

    /// @notice Return a credential, or an empty record if it is missing.
    /// @dev Callers must check the exists field.
    function getCredential(
        bytes32 credentialId
    ) external view returns (Credential memory) {
        return credentials[credentialId];
    }

    /// @notice Revoke without deleting or modifying the original record.
    /// @dev A disabled issuer can still revoke its own credentials.
    function revokeCredential(bytes32 credentialId) external {
        Credential storage credential = credentials[credentialId];

        if (!credential.exists) {
            revert CredentialNotFound();
        }

        if (
            msg.sender != credential.issuer &&
            msg.sender != administrator
        ) {
            revert Unauthorized();
        }

        if (credential.revoked) {
            revert CredentialAlreadyRevoked();
        }

        credential.revoked = true;

        emit CredentialRevoked(credentialId, msg.sender);
    }
}
