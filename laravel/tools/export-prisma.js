#!/usr/bin/env node
"use strict";
// Read-only source MongoDB export: node laravel/tools/export-prisma.js
const fs = require("node:fs");
const path = require("node:path");
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const EXCLUDED = new Set([
  "AdminUser", "AiProvider", "AiSettings", "SiteSettings",
  "JobAgentSettings", "JobAgentEmailSetting", "JobAgentAiSetting",
]);
const ROOT = path.resolve(__dirname, "../storage/app/imports");
async function main() {
  const arg = process.argv.indexOf("--output");
  const filename = arg >= 0 ? process.argv[arg + 1] : path.join(ROOT, "portfolio-export.json");
  if (!filename || !filename.toLowerCase().endsWith(".json")) throw new Error("JSON export filename required.");
  const output = path.resolve(filename);
  if (!output.startsWith(ROOT + path.sep)) throw new Error("Output must be inside laravel/storage/app/imports.");
  await fs.promises.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const result = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    if (EXCLUDED.has(model.name)) continue;
    const delegateName = model.name[0].toLowerCase() + model.name.slice(1);
    const delegate = prisma[delegateName];
    if (!delegate || typeof delegate.findMany !== "function") continue;
    const items = [];
    let offset = 0;
    while (true) {
      const batch = await delegate.findMany({ orderBy: { id: "asc" }, skip: offset, take: 250 });
      items.push(...batch);
      if (batch.length < 250) break;
      offset += batch.length;
    }
    result[model.name] = items;
    process.stdout.write(model.name + ": " + items.length + " records\n");
  }
  const temp = output + ".tmp";
  await fs.promises.writeFile(temp, JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
  await fs.promises.rename(temp, output);
  process.stdout.write("Exported non-credential models to " + output + "\n");
  process.stdout.write("WARNING: This file contains personal data. Keep it private and out of Git.\n");
}
main().catch((error) => {
  console.error("Export failed:", error.message);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
