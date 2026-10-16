import express from "express";
import helmet from "helmet";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";
import path from "node:path";
import { registryRouter } from "./registry.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const maximumFileSize = 5 * 1024 * 1024;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

app.disable("x-powered-by");
app.use(helmet());
app.use("/api/verify", registryRouter);

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many upload requests. Try again later.",
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maximumFileSize,
    files: 1,
    fields: 0,
    parts: 1,
  },
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "credential-verification-backend",
  });
});

app.post(
  "/api/documents/hash",
  uploadLimiter,
  upload.single("document"),
  (request, response) => {
    response.set("Cache-Control", "no-store");

    const file = request.file;

    if (!file) {
      return response.status(400).json({
        error: "Upload one PDF using the document field.",
      });
    }

    try {
      const hasPdfExtension =
        path.extname(file.originalname).toLowerCase() === ".pdf";

      const hasPdfSignature =
        file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";

      if (!hasPdfExtension || !hasPdfSignature) {
        return response.status(400).json({
          error: "The file must have a .pdf extension and PDF header.",
        });
      }

      const digest = createHash("sha256")
        .update(file.buffer)
        .digest("hex");

      return response.json({
        algorithm: "SHA-256",
        documentHash: `0x${digest}`,
        sizeBytes: file.size,
        blockchainChecked: false,
      });
    } finally {
      // Release this request's reference to the uploaded buffer.
      delete request.file;
    }
  },
);

app.use((_request, response) => {
  response.status(404).json({
    error: "Endpoint not found.",
  });
});

app.use((error, _request, response, _next) => {
  response.set("Cache-Control", "no-store");

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({
        error: "PDF exceeds the 5 MiB upload limit.",
      });
    }

    return response.status(400).json({
      error: "Upload exactly one file using the document field.",
    });
  }

  if (error?.message === "Unexpected end of form") {
    return response.status(400).json({
      error: "The upload request was incomplete.",
    });
  }

  console.error("Request failed:", error?.name ?? "UnknownError");

  return response.status(500).json({
    error: "Unable to process the request.",
  });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Backend running at http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  console.error(`Unable to start backend: ${error.message}`);
  process.exitCode = 1;
});
