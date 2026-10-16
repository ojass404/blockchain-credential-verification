import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  getAddress,
} from "ethers";

const rpcUrl = process.env.RPC_URL;
const address = process.env.REGISTRY_ADDRESS;
const chainId = process.env.CHAIN_ID;

if (!rpcUrl || !address || !chainId || !/^[0-9]+$/.test(chainId)) {
  throw new Error(
    "Configure RPC_URL, REGISTRY_ADDRESS, and numeric CHAIN_ID in .env.",
  );
}

const registryAddress = getAddress(address);
const expectedChainId = BigInt(chainId);

const rpcRequest = new FetchRequest(rpcUrl);
rpcRequest.timeout = 5000;

const provider = new JsonRpcProvider(rpcRequest);

const registry = new Contract(
  registryAddress,
  [
    "function getCredential(bytes32 credentialId) view returns (tuple(bytes32 documentHash, address issuer, uint256 issuedAt, bool exists, bool revoked))",
  ],
  provider,
);

export const registryRouter = Router();

registryRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many verification requests. Try again later.",
    },
  }),
);

registryRouter.get("/:id", async (request, response) => {
  response.set("Cache-Control", "no-store");

  const credentialId = request.params.id;

  if (!/^0x[0-9a-fA-F]{64}$/.test(credentialId)) {
    return response.status(400).json({
      error: "Credential ID must be 0x followed by 64 hexadecimal characters.",
    });
  }

  try {
    const connectedNetwork = await provider.getNetwork();

    if (connectedNetwork.chainId !== expectedChainId) {
      throw new Error("Unexpected blockchain network.");
    }

    const code = await provider.getCode(registryAddress);

    if (code === "0x") {
      throw new Error("No contract at the configured registry address.");
    }

    const credential = await registry.getCredential(credentialId);

    if (!credential.exists) {
      return response.status(404).json({
        credentialId,
        exists: false,
        status: "not_found",
        blockchainChecked: true,
        fileChecked: false,
      });
    }

    return response.json({
      credentialId,
      exists: true,
      status: credential.revoked ? "revoked" : "active",
      revoked: credential.revoked,
      issuer: credential.issuer,
      issuedAt: credential.issuedAt.toString(),
      documentHash: credential.documentHash,
      chainId: connectedNetwork.chainId.toString(),
      registryAddress,
      blockchainChecked: true,
      fileChecked: false,
    });
  } catch (error) {
    console.error(
      "Registry lookup failed:",
      error.code ?? error.name ?? "UnknownError",
    );

    return response.status(503).json({
      error: "Verification unavailable. Check the local node and registry configuration.",
      blockchainChecked: false,
      fileChecked: false,
    });
  }
});
