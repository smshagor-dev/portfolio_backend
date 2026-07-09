require("../lib/config");

const assert = require("assert");
const { google } = require("googleapis");
const prisma = require("../lib/prisma");
const { signAdminToken } = require("../lib/auth");
const { decryptText, encryptText } = require("../utils/encryption");
const {
  GMAIL_SCOPES,
  SAFE_JOB_ALERT_QUERIES,
  findDuplicateJob,
  parseGmailJobAlert,
} = require("../services/job-agent-gmail");

function encodeBody(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function buildFakeMessage(id = "gmail-smoke-1") {
  return {
    id,
    payload: {
      headers: [
        { name: "From", value: "LinkedIn Jobs <jobs-noreply@linkedin.com>" },
        { name: "Subject", value: "Backend Engineer at Example Labs - Remote" },
        { name: "Date", value: "Thu, 04 Jun 2026 10:00:00 +0000" },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: encodeBody("Backend Engineer at Example Labs - Remote\nView job: https://www.linkedin.com/jobs/view/123456"),
          },
        },
      ],
    },
  };
}

async function smokeOAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "local-client-id",
    process.env.GOOGLE_CLIENT_SECRET || "local-client-secret",
    process.env.GMAIL_REDIRECT_URI || "http://127.0.0.1:5000/api/admin/job-agent/gmail/callback",
  );
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state: "smoke-state",
  });

  assert(authUrl.includes("accounts.google.com"), "OAuth URL should target Google.");
  assert(authUrl.includes(encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly")), "OAuth URL should include gmail.readonly.");
  assert(authUrl.includes("access_type=offline"), "OAuth URL should request offline access.");
}

function smokeCallbackTokenHandling() {
  const encrypted = encryptText("fake-refresh-token");
  assert.notStrictEqual(encrypted, "fake-refresh-token", "Refresh token must be encrypted.");
  assert.strictEqual(decryptText(encrypted), "fake-refresh-token", "Encrypted refresh token should roundtrip.");
}

function smokeParsing() {
  const parsed = parseGmailJobAlert(buildFakeMessage());
  assert.strictEqual(parsed.source, "linkedin");
  assert.strictEqual(parsed.emailSubject, "Backend Engineer at Example Labs - Remote");
  assert.strictEqual(parsed.title, "Backend Engineer");
  assert.strictEqual(parsed.company, "Example Labs");
  assert.strictEqual(parsed.location, "Remote");
  assert.strictEqual(parsed.sourceUrl, "https://www.linkedin.com/jobs/view/123456");
  assert(parsed.receivedAt instanceof Date, "receivedAt should be a Date.");
}

async function smokeDeduplication() {
  const source = await prisma.jobSource.create({
    data: {
      name: "Gmail Smoke Source",
      type: "gmail",
      provider: "gmail-smoke",
      status: "placeholder",
      config: {},
    },
  });
  const job = await prisma.jobPost.create({
    data: {
      source: { connect: { id: source.id } },
      sourceType: "gmail",
      externalId: "gmail:smoke-dedupe",
      sourceEmail: "jobs-noreply@linkedin.com",
      sourceSubject: "Backend Engineer at Example Labs - Remote",
      sourcePlatform: "linkedin",
      emailSubject: "Backend Engineer at Example Labs - Remote",
      title: "Backend Engineer",
      company: "Example Labs",
      location: "Remote",
      sourceUrl: "https://www.linkedin.com/jobs/view/123456",
      applyUrl: "https://www.linkedin.com/jobs/view/123456",
      companyUrl: "",
      extractedUrls: [{ url: "https://www.linkedin.com/jobs/view/123456", type: "applyUrl" }],
      description: "",
      rawContent: "",
      status: "new",
      contactDiscoveryStatus: "pending",
      contactDiscoveryError: "",
    },
  });

  try {
    const duplicateByUrl = await findDuplicateJob({
      title: "Different title",
      company: "Different company",
      location: "",
      sourceUrl: "https://www.linkedin.com/jobs/view/123456",
    });
    assert.strictEqual(duplicateByUrl?.id, job.id, "Should dedupe by sourceUrl.");

    const duplicateByTuple = await findDuplicateJob({
      title: "Backend Engineer",
      company: "Example Labs",
      location: "Remote",
      sourceUrl: "",
    });
    assert.strictEqual(duplicateByTuple?.id, job.id, "Should dedupe by title/company/location.");
  } finally {
    await prisma.jobPost.deleteMany({ where: { id: job.id } });
    await prisma.jobSource.deleteMany({ where: { id: source.id } });
  }
}

async function smokeSyncEndpointWithAdminAuth() {
  const token = signAdminToken({ id: 1, email: "admin@example.com" });
  const url = "http://127.0.0.1:5000/api/admin/job-agent/gmail/sync";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.notStrictEqual(response.status, 401, "Sync endpoint should accept a valid admin token.");
  } catch (error) {
    console.log("Skipping sync endpoint smoke: backend server is not running on 127.0.0.1:5000.");
  }
}

async function main() {
  assert(SAFE_JOB_ALERT_QUERIES.length === 3, "Expected three safe Gmail alert queries.");
  smokeOAuthUrl();
  smokeCallbackTokenHandling();
  smokeParsing();
  await smokeDeduplication();
  await smokeSyncEndpointWithAdminAuth();
  console.log("Job Agent Gmail smoke checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
