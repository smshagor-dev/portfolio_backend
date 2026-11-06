const { ensureDatabaseExists } = require("../lib/bootstrap");

async function main() {
  await ensureDatabaseExists();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to prepare database:", error.message);
    process.exit(1);
  });
