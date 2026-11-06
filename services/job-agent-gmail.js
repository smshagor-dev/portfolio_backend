const { google } = require("googleapis");
const prisma = require("../lib/prisma");
const { decryptText } = require("../utils/encryption");

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const SAFE_JOB_ALERT_QUERIES = [
  "from:(linkedin.com OR jobs-noreply@linkedin.com) subject:(job OR jobs OR alert)",
  "from:(indeed.com) subject:(job OR jobs OR alert)",
  "from:(glassdoor.com) subject:(job OR jobs OR alert)",
];

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/g, " ");
}

function getMessageHeader(message, name) {
  const headers = message?.payload?.headers || [];
  const found = headers.find((header) => String(header.name || "").toLowerCase() === name.toLowerCase());
  return normalizeString(found?.value);
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function collectMessageParts(part, output = []) {
  if (!part) return output;
  if (part.body?.data) {
    output.push({ mimeType: part.mimeType || "", text: decodeBase64Url(part.body.data) });
  }
  for (const child of part.parts || []) collectMessageParts(child, output);
  return output;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getMessageText(message) {
  const parts = collectMessageParts(message.payload);
  const plain = parts.find((part) => part.mimeType.includes("text/plain"))?.text;
  const html = parts.find((part) => part.mimeType.includes("text/html"))?.text;
  return normalizeString(plain || stripHtml(html) || message.snippet);
}

function extractFirstUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.]+$/, "") : "";
}

function detectSource(from, sourceUrl) {
  const value = `${from} ${sourceUrl}`.toLowerCase();
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("indeed")) return "indeed";
  if (value.includes("glassdoor")) return "glassdoor";
  return "gmail_job_alert";
}

function cleanSubject(subject) {
  return normalizeString(subject)
    .replace(/\s+/g, " ")
    .replace(/^job alert:?\s*/i, "")
    .replace(/^jobs? for you:?\s*/i, "")
    .replace(/^recommended jobs?:?\s*/i, "");
}

function parseTitleCompanyLocation(subject, text) {
  const cleanedSubject = cleanSubject(subject);
  const lines = String(text || "").split(/\r?\n/).map((line) => normalizeString(line)).filter(Boolean);
  const firstMeaningfulLine = lines.find((line) => !/^view|apply|unsubscribe|job alert/i.test(line)) || "";
  const candidate = cleanedSubject || firstMeaningfulLine || "Job alert";
  const atMatch = candidate.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s+[-|]\s+(.+))?$/i);

  if (atMatch) {
    return {
      title: normalizeString(atMatch[1]) || "Job alert",
      company: normalizeString(atMatch[2]) || "Unknown company",
      location: normalizeString(atMatch[3]),
    };
  }

  const companyLine = lines.find((line) => /^company:?\s+/i.test(line));
  const locationLine = lines.find((line) => /^location:?\s+/i.test(line) || /\b(remote|hybrid|onsite)\b/i.test(line));

  return {
    title: candidate,
    company: companyLine ? companyLine.replace(/^company:?\s*/i, "") : "Unknown company",
    location: locationLine ? locationLine.replace(/^location:?\s*/i, "") : "",
  };
}

function parseGmailJobAlert(message) {
  const subject = getMessageHeader(message, "subject");
  const from = getMessageHeader(message, "from");
  const dateHeader = getMessageHeader(message, "date");
  const text = getMessageText(message);
  const sourceUrl = extractFirstUrl(text);
  const parsed = parseTitleCompanyLocation(subject, text);

  return {
    source: detectSource(from, sourceUrl),
    emailSubject: subject,
    title: parsed.title,
    company: parsed.company,
    location: parsed.location,
    sourceUrl,
    receivedAt: dateHeader ? new Date(dateHeader) : null,
    externalId: message.id ? `gmail:${message.id}` : null,
  };
}

function buildJobDedupeWhere(job) {
  const sourceUrl = normalizeString(job.sourceUrl);
  if (sourceUrl) {
    return { OR: [{ sourceUrl }] };
  }

  return {
    OR: [
      {
        title: job.title,
        company: job.company,
        location: job.location || "",
      },
    ],
  };
}

async function findDuplicateJob(job) {
  const sourceUrl = normalizeString(job.sourceUrl);
  if (sourceUrl) {
    const byUrl = await prisma.jobPost.findFirst({ where: { sourceUrl } });
    if (byUrl) return byUrl;
  }

  const candidates = await prisma.jobPost.findMany({
    where: {
      title: job.title,
      company: job.company,
      location: job.location || "",
    },
    take: 5,
  });

  return candidates.find((candidate) =>
    normalizeKey(candidate.title) === normalizeKey(job.title) &&
    normalizeKey(candidate.company) === normalizeKey(job.company) &&
    normalizeKey(candidate.location) === normalizeKey(job.location),
  ) || null;
}

function createGmailClient(oauth2Client, settings) {
  oauth2Client.setCredentials({ refresh_token: decryptText(settings.gmailRefreshToken) });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

module.exports = {
  GMAIL_SCOPES,
  SAFE_JOB_ALERT_QUERIES,
  buildJobDedupeWhere,
  createGmailClient,
  findDuplicateJob,
  parseGmailJobAlert,
};
