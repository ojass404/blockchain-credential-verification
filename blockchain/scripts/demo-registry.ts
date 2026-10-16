import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  const chain = await ethers.provider.getNetwork();

  // This demonstration uses unlocked local development accounts.
  assert.equal(
    chain.chainId,
    31337n,
    "Run this demonstration on the local Hardhat chain (31337).",
  );

  const [administrator, institution] = await ethers.getSigners();

  assert(administrator && institution, "Two local accounts are required.");

  console.log("Chain ID:", chain.chainId.toString());
  console.log("Administrator:", administrator.address);
  console.log("Institution:", institution.address);

  // Each run deploys a fresh registry.
  const registry = await ethers.deployContract(
    "CredentialRegistry",
    administrator,
  );

  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();

  console.log("\nRegistry deployed:", contractAddress);

  const approval = await registry.setInstitutionApproval(
    institution.address,
    true,
  );

  await approval.wait();

  assert.equal(
    await registry.approvedInstitutions(institution.address),
    true,
  );

  console.log("\nPASS: institution approved");
  console.log("Approval transaction:", approval.hash);

  const credentialId = ethers.hexlify(ethers.randomBytes(32));

  // Synthetic bytes for this contract demonstration.
  // The backend will later hash actual finalized PDF bytes.
  const originalBytes = ethers.toUtf8Bytes(
    "Synthetic certificate: student DEMO-001; qualification B.Tech",
  );

  const editedBytes = ethers.toUtf8Bytes(
    "Synthetic certificate: student DEMO-001; qualification M.Tech",
  );

  const originalHash = ethers.sha256(originalBytes);
  const editedHash = ethers.sha256(editedBytes);

  const issuance = await registry
    .connect(institution)
    .issueCredential(credentialId, originalHash);

  await issuance.wait();

  const issued = await registry.getCredential(credentialId);

  assert.equal(issued.exists, true);
  assert.equal(issued.revoked, false);
  assert.equal(issued.issuer, institution.address);
  assert.equal(issued.documentHash, originalHash);

  console.log("\nPASS: credential issued");
  console.log("Credential ID:", credentialId);
  console.log("Document SHA-256:", originalHash);
  console.log("Issuance transaction:", issuance.hash);

  assert.equal(issued.documentHash, ethers.sha256(originalBytes));

  console.log("\nPASS: original bytes match the registered hash");

  assert.notEqual(issued.documentHash, editedHash);

  console.log("PASS: edited bytes fail the integrity check");

  const revocation = await registry
    .connect(institution)
    .revokeCredential(credentialId);

  await revocation.wait();

  const revoked = await registry.getCredential(credentialId);

  assert.equal(revoked.revoked, true);
  assert.equal(revoked.exists, true);
  assert.equal(revoked.documentHash, issued.documentHash);
  assert.equal(revoked.issuer, issued.issuer);
  assert.equal(revoked.issuedAt, issued.issuedAt);

  console.log("\nPASS: credential revoked; original record preserved");
  console.log("Revocation transaction:", revocation.hash);

  console.log("\nDEMONSTRATION COMPLETE");
  console.log("Keep the local node running to retain this session's state.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
