import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("CredentialRegistry", function () {
  async function setup() {
    const [administrator, institution, otherInstitution, outsider] =
      await ethers.getSigners();

    const registry = await ethers.deployContract("CredentialRegistry");
    await registry.waitForDeployment();

    await (
      await registry.setInstitutionApproval(institution.address, true)
    ).wait();

    const credentialId = ethers.id("synthetic-credential-001");

    // SHA-256 of synthetic bytes; real PDFs will be hashed by the backend.
    const documentHash = ethers.sha256(
      ethers.toUtf8Bytes("synthetic certificate PDF bytes"),
    );

    return {
      registry,
      administrator,
      institution,
      otherInstitution,
      outsider,
      credentialId,
      documentHash,
    };
  }

  it("assigns the deploying wallet as administrator", async function () {
    const { registry, administrator } = await setup();

    expect(await registry.administrator()).to.equal(
      administrator.address,
    );
  });

  it("allows the administrator to approve an institution", async function () {
    const { registry, otherInstitution } = await setup();

    await expect(
      registry.setInstitutionApproval(otherInstitution.address, true),
    )
      .to.emit(registry, "InstitutionApprovalChanged")
      .withArgs(otherInstitution.address, true);

    expect(
      await registry.approvedInstitutions(otherInstitution.address),
    ).to.equal(true);
  });

  it("rejects institution approval by an outsider", async function () {
    const { registry, outsider, otherInstitution } = await setup();

    await expect(
      registry
        .connect(outsider)
        .setInstitutionApproval(otherInstitution.address, true),
    ).to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("rejects the zero address as an institution", async function () {
    const { registry } = await setup();

    await expect(
      registry.setInstitutionApproval(ethers.ZeroAddress, true),
    ).to.be.revertedWithCustomError(registry, "InvalidInstitution");
  });

  it("issues a credential and records its original details", async function () {
    const {
      registry,
      institution,
      credentialId,
      documentHash,
    } = await setup();

    const transaction = await registry
      .connect(institution)
      .issueCredential(credentialId, documentHash);

    const receipt = await transaction.wait();

    if (!receipt) {
      throw new Error("Missing issuance receipt");
    }

    const block = await ethers.provider.getBlock(receipt.blockNumber);

    if (!block) {
      throw new Error("Missing issuance block");
    }

    await expect(transaction)
      .to.emit(registry, "CredentialIssued")
      .withArgs(
        credentialId,
        institution.address,
        documentHash,
        BigInt(block.timestamp),
      );

    const credential = await registry.getCredential(credentialId);

    expect(credential.documentHash).to.equal(documentHash);
    expect(credential.issuer).to.equal(institution.address);
    expect(credential.issuedAt).to.equal(BigInt(block.timestamp));
    expect(credential.exists).to.equal(true);
    expect(credential.revoked).to.equal(false);
  });

  it("rejects issuance by an unapproved wallet", async function () {
    const {
      registry,
      outsider,
      credentialId,
      documentHash,
    } = await setup();

    await expect(
      registry
        .connect(outsider)
        .issueCredential(credentialId, documentHash),
    ).to.be.revertedWithCustomError(registry, "InstitutionNotApproved");
  });

  it("rejects an empty credential ID", async function () {
    const { registry, institution, documentHash } = await setup();

    await expect(
      registry
        .connect(institution)
        .issueCredential(ethers.ZeroHash, documentHash),
    ).to.be.revertedWithCustomError(registry, "InvalidCredentialId");
  });

  it("rejects an empty document hash", async function () {
    const { registry, institution, credentialId } = await setup();

    await expect(
      registry
        .connect(institution)
        .issueCredential(credentialId, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(registry, "InvalidDocumentHash");
  });

  it("rejects a duplicate ID without changing the original", async function () {
    const {
      registry,
      institution,
      otherInstitution,
      credentialId,
      documentHash,
    } = await setup();

    await (
      await registry
        .connect(institution)
        .issueCredential(credentialId, documentHash)
    ).wait();

    await (
      await registry.setInstitutionApproval(otherInstitution.address, true)
    ).wait();

    const differentHash = ethers.sha256(
      ethers.toUtf8Bytes("different certificate bytes"),
    );

    await expect(
      registry
        .connect(otherInstitution)
        .issueCredential(credentialId, differentHash),
    ).to.be.revertedWithCustomError(registry, "CredentialAlreadyExists");

    const credential = await registry.getCredential(credentialId);

    expect(credential.documentHash).to.equal(documentHash);
    expect(credential.issuer).to.equal(institution.address);
  });

  it("returns an empty record for an unknown ID", async function () {
    const { registry, outsider } = await setup();

    const credential = await registry
      .connect(outsider)
      .getCredential(ethers.id("unknown-credential"));

    expect(credential.exists).to.equal(false);
    expect(credential.documentHash).to.equal(ethers.ZeroHash);
    expect(credential.issuer).to.equal(ethers.ZeroAddress);
    expect(credential.issuedAt).to.equal(0n);
    expect(credential.revoked).to.equal(false);
  });

  it("allows issuer revocation and preserves original details", async function () {
    const {
      registry,
      institution,
      credentialId,
      documentHash,
    } = await setup();

    await (
      await registry
        .connect(institution)
        .issueCredential(credentialId, documentHash)
    ).wait();

    const before = await registry.getCredential(credentialId);

    await expect(
      registry.connect(institution).revokeCredential(credentialId),
    )
      .to.emit(registry, "CredentialRevoked")
      .withArgs(credentialId, institution.address);

    const after = await registry.getCredential(credentialId);

    expect(after.revoked).to.equal(true);
    expect(after.exists).to.equal(true);
    expect(after.documentHash).to.equal(before.documentHash);
    expect(after.issuer).to.equal(before.issuer);
    expect(after.issuedAt).to.equal(before.issuedAt);
  });

  it("allows administrator revocation", async function () {
    const {
      registry,
      administrator,
      institution,
      credentialId,
      documentHash,
    } = await setup();

    await (
      await registry
        .connect(institution)
        .issueCredential(credentialId, documentHash)
    ).wait();

    await expect(registry.revokeCredential(credentialId))
      .to.emit(registry, "CredentialRevoked")
      .withArgs(credentialId, administrator.address);

    expect(
      (await registry.getCredential(credentialId)).revoked,
    ).to.equal(true);
  });

  it("rejects revocation by another approved institution", async function () {
    const {
      registry,
      institution,
      otherInstitution,
      credentialId,
      documentHash,
    } = await setup();

    await (
      await registry
        .connect(institution)
        .issueCredential(credentialId, documentHash)
    ).wait();

    await (
      await registry.setInstitutionApproval(otherInstitution.address, true)
    ).wait();

    await expect(
      registry.connect(otherInstitution).revokeCredential(credentialId),
    ).to.be.revertedWithCustomError(registry, "Unauthorized");

    expect(
      (await registry.getCredential(credentialId)).revoked,
    ).to.equal(false);
  });

  it("rejects revocation of an unknown credential", async function () {
    const { registry, credentialId } = await setup();

    await expect(
      registry.revokeCredential(credentialId),
    ).to.be.revertedWithCustomError(registry, "CredentialNotFound");
  });

  it("rejects repeated revocation", async function () {
    const {
      registry,
      institution,
      credentialId,
      documentHash,
    } = await setup();

    await (
      await registry
        .connect(institution)
        .issueCredential(credentialId, documentHash)
    ).wait();

    await (
      await registry.connect(institution).revokeCredential(credentialId)
    ).wait();

    await expect(
      registry.connect(institution).revokeCredential(credentialId),
    ).to.be.revertedWithCustomError(registry, "CredentialAlreadyRevoked");
  });

  it("disables future issuance but preserves history and issuer revocation", async function () {
    const {
      registry,
      institution,
      credentialId,
      documentHash,
    } = await setup();

    await (
      await registry
        .connect(institution)
        .issueCredential(credentialId, documentHash)
    ).wait();

    await (
      await registry.setInstitutionApproval(institution.address, false)
    ).wait();

    expect(
      await registry.approvedInstitutions(institution.address),
    ).to.equal(false);

    const existing = await registry.getCredential(credentialId);

    expect(existing.exists).to.equal(true);
    expect(existing.revoked).to.equal(false);
    expect(existing.documentHash).to.equal(documentHash);

    await expect(
      registry
        .connect(institution)
        .issueCredential(ethers.id("new-credential"), documentHash),
    ).to.be.revertedWithCustomError(registry, "InstitutionNotApproved");

    await (
      await registry.connect(institution).revokeCredential(credentialId)
    ).wait();

    expect(
      (await registry.getCredential(credentialId)).revoked,
    ).to.equal(true);
  });
});
