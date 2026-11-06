const path = require("path");
const dotenv = require("dotenv");

const backendRoot = path.resolve(__dirname, "..");
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(backendRoot, ".env"),
  path.resolve(backendRoot, ".env.local"),
];

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath, override: false });
}

function getDbConfig() {
  return {
    url: String(process.env.DATABASE_URL || "").trim(),
  };
}

function buildDatabaseUrl() {
  return getDbConfig().url;
}

function isMongoDatabaseUrl(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("mongodb://") || normalized.startsWith("mongodb+srv://");
}

if (!isMongoDatabaseUrl(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL = "";
}

module.exports = {
  buildDatabaseUrl,
  getDbConfig,
  isMongoDatabaseUrl,
};
