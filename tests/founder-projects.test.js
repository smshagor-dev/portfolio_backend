const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFounderProject, normalizeFounderProjects } = require("../lib/founder-projects");

const valid = {
  slug: "openmindai", name: "OpenMindAI", image: "/uploads/founder/openmindai-desktop.webp",
  website: "https://openmindai.org", repository: "https://github.com/smshagor-dev/OpenMindAI",
  imageAlt: "OpenMindAI desktop screenshot", status: true, sortOrder: 1,
  journey: [{ step: "01", title: "Runtime", status: "Implemented",
    lead: "Integrating inference", details: ["llama.cpp runtime", "Persistent chat"], result: "Working desktop flow" }],
};

test("existing founder product image, metadata and timeline survive normalization", () => {
  const normalized = normalizeFounderProject(valid);
  assert.equal(normalized.slug, valid.slug);
  assert.equal(normalized.image, valid.image);
  assert.deepEqual(normalized.journey[0].details, valid.journey[0].details);
  assert.equal(normalized.website, valid.website);
});
test("published and hidden project states remain distinct", () => {
  assert.equal(normalizeFounderProject({ ...valid, status: false }).status, false);
  assert.equal(normalizeFounderProject(valid).status, true);
});
test("rejects duplicate or unsafe entries", () => {
  assert.throws(() => normalizeFounderProjects([valid, valid]), /unique/i);
  assert.throws(() => normalizeFounderProject({ ...valid, slug: "../admin" }), /slug/i);
  assert.throws(() => normalizeFounderProject({ ...valid, image: "javascript:alert(1)" }), /image/i);
  assert.throws(() => normalizeFounderProject({ ...valid, image: "http://invalid.test/a.jpg" }), /image/i);
  assert.throws(() => normalizeFounderProject({ ...valid, website: "https://user:password@example.com" }), /HTTPS/i);
});
test("empty catalog is valid after deleting the last product", () => {
  assert.deepEqual(normalizeFounderProjects([]), []);
});
test("nested decision and principles arrays are preserved", () => {
  const input = { ...valid, principles: [{ title: "Offline", description: "Local-first" }],
    decisions: [{ title: "Rust", situation: "Native services", approach: "Tauri", tradeoff: "Cross-language boundaries" }] };
  const result = normalizeFounderProject(input);
  assert.equal(result.principles[0].description, "Local-first");
  assert.equal(result.decisions[0].tradeoff, "Cross-language boundaries");
});
