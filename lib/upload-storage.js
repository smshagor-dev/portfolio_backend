const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { Readable } = require("stream");
const ftp = require("basic-ftp");

const localPublicRoot = path.resolve(process.cwd(), "public");

function normalizeString(value) {
  return String(value || "").trim();
}

function toBoolean(value, fallback = false) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function trimSlashes(value) {
  return normalizeString(value).replace(/^\/+|\/+$/g, "");
}

function buildSafeFilename(file, fallbackBaseName, { preserveOriginalName = false } = {}) {
  const originalName = normalizeString(file?.originalname);
  const originalExtension = path.extname(originalName).toLowerCase();
  const safeExtension = originalExtension.replace(/[^a-z0-9.]/g, "").slice(0, 16);
  const extension = safeExtension || ".bin";
  const baseNameSource = path.basename(originalName || fallbackBaseName, originalExtension);
  const safeBaseName = normalizeString(baseNameSource)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallbackBaseName;

  if (preserveOriginalName) {
    return `${safeBaseName}${extension}`;
  }

  const randomSuffix = crypto.randomBytes(4).toString("hex");
  return `${Date.now()}-${safeBaseName}-${randomSuffix}${extension}`;
}

function createMemoryUpload(options = {}) {
  return multer({
    storage: multer.memoryStorage(),
    ...options,
  });
}

function getStorageDriver() {
  const driver = normalizeString(process.env.UPLOAD_STORAGE_DRIVER).toLowerCase();
  return driver === "ftp" ? "ftp" : "local";
}

function getPublicBaseUrl() {
  return normalizeString(process.env.UPLOAD_STORAGE_PUBLIC_BASE_URL);
}

function isRemoteStorageEnabled() {
  return getStorageDriver() === "ftp";
}

function getRemoteStorageConfig() {
  const publicBaseUrl = getPublicBaseUrl();
  const fallbackHost = publicBaseUrl ? new URL(publicBaseUrl).hostname : "";
  const secure = toBoolean(process.env.UPLOAD_STORAGE_FTP_SECURE, false);
  const port = Number.parseInt(process.env.UPLOAD_STORAGE_FTP_PORT, 10);
  const config = {
    host: normalizeString(process.env.UPLOAD_STORAGE_FTP_HOST || fallbackHost),
    port: Number.isFinite(port) && port > 0 ? port : secure ? 21 : 21,
    user: normalizeString(process.env.UPLOAD_STORAGE_FTP_USER),
    password: normalizeString(process.env.UPLOAD_STORAGE_FTP_PASSWORD),
    secure,
    tlsServerName: normalizeString(process.env.UPLOAD_STORAGE_FTP_TLS_SERVERNAME),
    allowInvalidCert: toBoolean(process.env.UPLOAD_STORAGE_FTP_ALLOW_INVALID_CERT, false),
    baseDir: trimSlashes(process.env.UPLOAD_STORAGE_FTP_BASE_DIR),
    publicBaseUrl,
  };

  if (!config.publicBaseUrl || !config.host || !config.user || !config.password) {
    throw new Error(
      "Remote upload storage is enabled but FTP settings are incomplete. Set UPLOAD_STORAGE_PUBLIC_BASE_URL, UPLOAD_STORAGE_FTP_HOST, UPLOAD_STORAGE_FTP_USER, and UPLOAD_STORAGE_FTP_PASSWORD.",
    );
  }

  return config;
}

function toPublicPath(destinationPath) {
  return `/${trimSlashes(destinationPath)}`;
}

function toAbsolutePublicUrl(filePath) {
  const normalized = normalizeString(filePath);
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) {
    return normalized;
  }

  try {
    return new URL(normalized.startsWith("/") ? normalized : `/${normalized}`, `${publicBaseUrl}/`).toString();
  } catch (_error) {
    return normalized;
  }
}

function resolveLocalPublicPath(filePath) {
  const normalized = normalizeString(filePath);
  if (!normalized || /^https?:\/\//i.test(normalized)) {
    return null;
  }

  const relativePath = normalized.replace(/^\/+/, "");
  const resolved = path.resolve(localPublicRoot, relativePath);
  if (!resolved.startsWith(localPublicRoot)) {
    return null;
  }

  return resolved;
}

async function withFtpClient(callback) {
  const config = getRemoteStorageConfig();
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure,
      secureOptions: config.tlsServerName
        ? {
            servername: config.tlsServerName,
            rejectUnauthorized: !config.allowInvalidCert,
          }
        : config.allowInvalidCert
          ? {
              rejectUnauthorized: false,
            }
          : undefined,
    });

    return await callback(client, config);
  } finally {
    client.close();
  }
}

async function storeUploadedFile(file, options = {}) {
  if (!file?.buffer) {
    throw new Error("Uploaded file buffer is missing.");
  }

  const directory = trimSlashes(options.directory);
  const fallbackBaseName = normalizeString(options.fallbackBaseName) || "file";
  const filename = buildSafeFilename(file, fallbackBaseName, options);
  const destinationPath = trimSlashes(path.posix.join(directory, filename));
  const publicPath = toPublicPath(destinationPath);

  if (isRemoteStorageEnabled()) {
    await withFtpClient(async (client, config) => {
      const remotePath = trimSlashes(path.posix.join(config.baseDir, destinationPath));
      const remoteDirectory = path.posix.dirname(remotePath);
      const remoteFilename = path.posix.basename(remotePath);

      if (remoteDirectory && remoteDirectory !== ".") {
        await client.ensureDir(remoteDirectory);
      }

      await client.uploadFrom(Readable.from(file.buffer), remoteFilename);
    });
  } else {
    const resolved = resolveLocalPublicPath(publicPath);
    if (!resolved) {
      throw new Error("Failed to resolve local upload path.");
    }

    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, file.buffer);
  }

  return {
    filename,
    publicPath,
    publicUrl: toAbsolutePublicUrl(publicPath),
    size: file.size || file.buffer.length,
    mimeType: normalizeString(file.mimetype),
  };
}

async function deleteStoredFile(filePath) {
  const normalized = normalizeString(filePath);
  if (!normalized) {
    return;
  }

  const parsedPath = /^https?:\/\//i.test(normalized)
    ? (() => {
        try {
          return new URL(normalized).pathname;
        } catch (_error) {
          return "";
        }
      })()
    : normalized;

  const publicPath = toPublicPath(parsedPath);
  const destinationPath = trimSlashes(parsedPath);

  if (!destinationPath) {
    return;
  }

  if (isRemoteStorageEnabled()) {
    await withFtpClient(async (client, config) => {
      const remotePath = trimSlashes(path.posix.join(config.baseDir, destinationPath));

      try {
        await client.remove(remotePath);
      } catch (error) {
        const code = normalizeString(error?.code);
        const message = normalizeString(error?.message).toLowerCase();
        if (code === "550" || message.includes("no such file")) {
          return;
        }

        throw error;
      }
    });

    return;
  }

  const resolved = resolveLocalPublicPath(publicPath);
  if (!resolved) {
    return;
  }

  await fs.promises.unlink(resolved).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });
}

function buildEmailAttachment(filePath, fallbackFilename = "attachment") {
  const normalized = normalizeString(filePath);
  if (!normalized) {
    return null;
  }

  const absoluteUrl = toAbsolutePublicUrl(normalized);
  const filename = path.basename((/^https?:\/\//i.test(absoluteUrl) ? new URL(absoluteUrl).pathname : normalized).split("?")[0]) || fallbackFilename;
  const localPath = resolveLocalPublicPath(normalized);

  if (localPath && fs.existsSync(localPath)) {
    return { filename, path: localPath };
  }

  if (/^https?:\/\//i.test(absoluteUrl)) {
    return { filename, href: absoluteUrl };
  }

  return null;
}

module.exports = {
  buildEmailAttachment,
  createMemoryUpload,
  deleteStoredFile,
  isRemoteStorageEnabled,
  resolveLocalPublicPath,
  storeUploadedFile,
  toAbsolutePublicUrl,
};
