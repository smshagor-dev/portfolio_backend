const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const { buildDatabaseUrl } = require("../lib/config");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Missing Prisma command.");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: buildDatabaseUrl() || process.env.DATABASE_URL,
  },
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
