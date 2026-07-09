const { buildDatabaseUrl, isMongoDatabaseUrl } = require("./config");

async function ensureDatabaseExists() {
  const databaseUrl = buildDatabaseUrl();

  if (!isMongoDatabaseUrl(databaseUrl)) {
    throw new Error("DATABASE_URL must be a valid MongoDB connection string.");
  }
}

module.exports = {
  ensureDatabaseExists,
};
