// No third-party dependencies. Run: node scripts/verify-founder-assets.js
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const screenshots = [
  ["openmindai-desktop.webp", "713c394f7d3101bc7e9c34792a51898523888096"],
  ["openmind-studio-desktop.webp", "a37a9a4df9760b00fec9cd4dfd328349552e3d78"],
];

const directory = path.resolve(__dirname, "../public/uploads/founder");
for (const [name, gitBlobSha] of screenshots) {
  const bytes = fs.readFileSync(path.join(directory, name));
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", name);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", name);
  const digest = crypto
    .createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest("hex");
  assert.equal(digest, gitBlobSha, `${name} must match the founder-provided screenshot rendition`);
  console.log(`PASS ${name} (${bytes.length} bytes)`);
}
