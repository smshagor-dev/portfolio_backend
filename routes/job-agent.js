const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const { google } = require("googleapis");
const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");
const { decryptText, encryptText } = require("../utils/encryption");
const { generateAssistantResponse } = require("../services/ai");
const { buildJobAgentProfileContext } = require("../services/job-agent-profile-builder");
const {
  buildEncryptedKeyUpdate,
  buildFinalPrompts,
  generateJobAgentContent,
  getJobAgentAiSetting,
  keyConfigured,
  normalizeAiSettingPayload,
  serializeJobAgentAiSetting,
} = require("../services/job-agent-ai");
const { generateCoverLetterPdf } = require("../services/job-agent-pdf");
const { discoverContactsForJob, getUrlDomain, isPublicCompanyUrl } = require("../services/job-agent-contact-discovery");
const {
  extractEmails: extractValidatedEmails,
  isNoReplyEmail,
  isPlatformDomain,
  isValidEmailFormat,
  normalizeEmail: normalizeValidatedEmail,
  validateRecruiterEmail,
} = require("../services/job-agent-email-validation");
const {
  GMAIL_SCOPES,
  SAFE_JOB_ALERT_QUERIES,
  createGmailClient,
  findDuplicateJob,
  parseGmailJobAlert,
} = require("../services/job-agent-gmail");
const { defaultJobBoardSources, fetchJobsForSource } = require("../services/job-sources");
const { importCompanyCareerJobs, testCompanyCareerSource, validatePublicUrl } = require("../services/job-sources/company-career-source");
const { buildManualJob } = require("../services/job-sources/manual-source");

const router = express.Router();
const oauthStates = new Map();
const jobAgentCvUploadDirectory = path.resolve(process.cwd(), "public", "uploads", "job-agent", "cv");
const GMAIL_AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const APPROVED_SOURCES_AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EMAIL_AUTO_SEND_INTERVAL_MS = Math.max(60 * 1000, Number.parseInt(process.env.JOB_AGENT_EMAIL_AUTO_SEND_INTERVAL_MS, 10) || 10 * 60 * 1000);
const JOB_APPLICATION_DAILY_SEND_LIMIT = Math.max(1, Number.parseInt(process.env.JOB_AGENT_APPLICATION_MAX_SENDS_PER_DAY, 10) || 1);
let gmailAutoSyncRunning = false;
let approvedSourcesAutoSyncRunning = false;
let emailAutoSendRunning = false;

if (!fs.existsSync(jobAgentCvUploadDirectory)) {
  fs.mkdirSync(jobAgentCvUploadDirectory, { recursive: true });
}

const cvUpload = multer({
  storage: multer.diskStorage({
    destination(_request, _file, callback) {
      callback(null, jobAgentCvUploadDirectory);
    },
    filename(_request, file, callback) {
      const extension = path.extname(file.originalname || ".pdf").toLowerCase() || ".pdf";
      callback(null, `agent-cv-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_request, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".pdf", ".doc", ".docx"];
    if (!allowed.includes(extension)) {
      return callback(new Error("Only PDF, DOC, or DOCX files are allowed for the Job Agent CV."));
    }
    return callback(null, true);
  },
});

function emitJobAgentUpdate(request, eventType, extra = {}) {
  request.app.get("io")?.to("job-agent:admin").emit("job-agent:updated", {
    eventType,
    path: request.originalUrl,
    method: request.method,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
}

router.use((request, response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return next();
  }

  response.on("finish", () => {
    if (response.statusCode >= 200 && response.statusCode < 400) {
      emitJobAgentUpdate(request, "MUTATION");
    }
  });

  return next();
});

function normalizeString(value) {
  return String(value || "").trim();
}

function clampScore(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function parseJsonFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBackendUrl(request) {
  return normalizeString(process.env.BACKEND_URL) || (request ? `${request.protocol}://${request.get("host")}` : "http://127.0.0.1:5000");
}

function getFrontendUrl() {
  return normalizeString(process.env.FRONTEND_URL) || normalizeString(process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000";
}

function getPublicBackendUrl(request) {
  return getBackendUrl(request).replace(/\/+$/, "");
}

function getGmailOAuthClient(request = null) {
  const clientId = normalizeString(process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID);
  const clientSecret = normalizeString(process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET);
  const backendUrl = request ? getBackendUrl(request) : normalizeString(process.env.BACKEND_URL) || "http://127.0.0.1:5000";
  const redirectUri =
    normalizeString(process.env.GMAIL_REDIRECT_URI) ||
    `${backendUrl.replace(/\/+$/, "")}/api/admin/job-agent/gmail/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getSettings() {
  return prisma.jobAgentSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      gmailRefreshToken: "",
      approvedApiSources: [],
    },
  });
}

async function getActiveAiConfiguration() {
  const settings = await prisma.aiSettings.findUnique({ where: { id: 1 } });
  if (!settings?.activeProvider || !settings?.modelName) {
    throw new Error("No active AI provider configured.");
  }

  const provider = await prisma.aiProvider.findFirst({
    where: {
      name: normalizeString(settings.activeProvider).toLowerCase(),
      isActive: true,
    },
  });

  if (!provider?.apiKey) {
    throw new Error("No active AI provider configured.");
  }

  return {
    provider: provider.name,
    apiKey: decryptText(provider.apiKey),
    baseUrl: provider.baseUrl || "",
    modelName: settings.modelName,
  };
}

function serializeSettings(settings) {
  const quotaState = getInternalQuotaState(settings);
  return {
    ...settings,
    gmailRefreshToken: undefined,
    gmailConnected: Boolean(settings.gmailRefreshToken),
    gmailSafeQueries: SAFE_JOB_ALERT_QUERIES,
    approvedApiSources: quotaState.sources,
    dailySendLimit: Math.min(settings.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT, JOB_APPLICATION_DAILY_SEND_LIMIT),
  };
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
  if (!part) {
    return output;
  }
  if (part.body?.data) {
    output.push({
      mimeType: part.mimeType || "",
      text: decodeBase64Url(part.body.data),
    });
  }
  for (const child of part.parts || []) {
    collectMessageParts(child, output);
  }
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
    .replace(/\s+\n/g, "\n")
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

function extractEmails(text) {
  return Array.from(new Set(String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
}

function extractUrls(text) {
  return Array.from(new Set(String(text || "").match(/https?:\/\/[^\s"'<>]+/gi) || []))
    .map((url) => url.replace(/[),.]+$/, ""))
    .filter(Boolean);
}

function classifyJobAlertUrl(url) {
  const normalized = normalizeString(url);
  const lowered = normalized.toLowerCase();
  const domain = getUrlDomain(normalized);
  if (/unsubscribe|email-preferences|preferences|optout|opt-out/.test(lowered)) return "unsubscribeUrl";
  if (/utm_|trk|tracking|click|redirect|lnkd\.in|mailchi|sendgrid|mandrill/.test(lowered)) return "trackingUrl";
  if (isPlatformDomain(domain)) return "applyUrl";
  if (isPublicCompanyUrl(normalized)) return "companyUrl";
  return "unknownUrl";
}

function classifyJobAlertUrls(text) {
  const urls = extractUrls(text);
  const classified = urls.map((url) => ({ url, type: classifyJobAlertUrl(url) }));
  const applyUrl = classified.find((item) => item.type === "applyUrl")?.url || "";
  const companyUrl = classified.find((item) => item.type === "companyUrl")?.url || "";
  return {
    urls: classified,
    applyUrl: applyUrl || companyUrl || "",
    companyUrl,
  };
}

function extractJobFromEmail(message) {
  const subject = getMessageHeader(message, "subject");
  const from = getMessageHeader(message, "from");
  const dateHeader = getMessageHeader(message, "date");
  const text = getMessageText(message);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleFromSubject = subject
    .replace(/job alert:?/i, "")
    .replace(/jobs? for you:?/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const companyLine = lines.find((line) => /company| at /i.test(line)) || "";
  const locationLine = lines.find((line) => /remote|hybrid|onsite|location|, [A-Z]{2}\b/i.test(line)) || "";

  return {
    externalId: message.id,
    title: titleFromSubject || lines[0] || "Job alert",
    company: companyLine.replace(/^company:?\s*/i, "").slice(0, 160) || "Unknown company",
    location: locationLine.replace(/^location:?\s*/i, "").slice(0, 160),
    sourceUrl: extractFirstUrl(text),
    description: text.slice(0, 12000),
    rawContent: [`From: ${from}`, `Subject: ${subject}`, "", text].join("\n").slice(0, 20000),
    receivedAt: dateHeader ? new Date(dateHeader) : null,
    emails: extractEmails(text),
    publicContext: text.slice(0, 1000),
  };
}

function keywordMatch(job, profileContext) {
  const skills = parseJsonArray(profileContext.skills);
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  const matchedSkills = skills.filter((skill) => haystack.includes(skill.toLowerCase()));
  const missingSkills = skills.filter((skill) => !matchedSkills.includes(skill)).slice(0, 10);
  const score = skills.length ? Math.round((matchedSkills.length / skills.length) * 100) : 50;
  return {
    score: clampScore(score),
    matchedSkills,
    missingSkills,
    summary: matchedSkills.length
      ? `Matched on ${matchedSkills.slice(0, 6).join(", ")}.`
      : "No clear skill overlap was found from keyword analysis.",
    coverLetter: "",
    aiAnalysis: { mode: "keyword" },
  };
}

async function generateMatch(job, profileContext) {
  const fallback = keywordMatch(job, profileContext);
  const aiSettings = await getJobAgentAiSetting(prisma);

  try {
    const generated = await generateJobAgentContent({
      settings: aiSettings,
      profileContext,
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        sourceUrl: job.sourceUrl,
      },
    });

    return {
      score: clampScore(generated.score) || fallback.score,
      matchedSkills: generated.matchedSkills?.length ? parseJsonArray(generated.matchedSkills) : fallback.matchedSkills,
      missingSkills: parseJsonArray(generated.missingSkills),
      summary: normalizeString(generated.summary) || fallback.summary,
      coverLetter: normalizeString(generated.coverLetterText),
      emailSubject: normalizeString(generated.emailSubject) || `Application for ${job.title}`,
      emailBody: normalizeString(generated.emailBody) || normalizeString(generated.coverLetterText),
      aiProvider: generated.provider,
      aiModel: generated.model,
      emailPromptUsed: generated.emailPromptUsed,
      coverLetterPromptUsed: generated.coverLetterPromptUsed,
      mocked: generated.mocked,
      aiAnalysis: {
        generatedBy: "job-agent-ai",
        provider: generated.provider,
        model: generated.model,
        mocked: generated.mocked,
        errors: generated.errors,
      },
    };
  } catch (error) {
    const fallbackPrompts = buildFinalPrompts({
      settings: aiSettings,
      profileContext,
      job,
      match: fallback,
      recruiterContact: null,
      mode: "both",
    });
    return {
      ...fallback,
      emailSubject: `Application for ${job.title}`,
      emailBody: fallback.coverLetter || `Hello,\n\nI am interested in the ${job.title} role at ${job.company}.\n\nBest regards`,
      aiProvider: aiSettings.aiProvider,
      aiModel: aiSettings.aiModel,
      emailPromptUsed: fallbackPrompts.emailPrompt,
      coverLetterPromptUsed: fallbackPrompts.coverLetterPrompt,
      aiAnalysis: { ...fallback.aiAnalysis, error: error.message },
    };
  }
}

function getCvUrlFromProfileContext(profileContext) {
  return normalizeString(profileContext?.optionalCvProfile?.resumeUrl) || normalizeString(profileContext?.profile?.resume);
}

async function maybeGenerateCoverLetterPdfForDraft(draft, job, profileContext, aiSettings) {
  if (!aiSettings.attachCoverLetterPdf || !normalizeString(draft.coverLetterText)) {
    return draft;
  }

  const generatedPdf = await generateCoverLetterPdf({
    draftId: draft.id,
    job,
    profileContext,
    coverLetterText: draft.coverLetterText,
  });

  return prisma.jobEmailDraft.update({
    where: { id: draft.id },
    data: { coverLetterPdfUrl: generatedPdf.publicUrl },
  });
}

async function upsertMatchAndDraft(jobPost) {
  const profileContext = await buildJobAgentProfileContext();
  const aiSettings = await getJobAgentAiSetting(prisma);
  const cvProfileId = profileContext.optionalCvProfile?.id || null;
  const match = await generateMatch(jobPost, profileContext);
  const existingMatch = await prisma.jobMatch.findFirst({
    where: {
      jobPostId: jobPost.id,
      cvProfileId,
    },
    orderBy: { createdAt: "desc" },
  });

  const matchData = {
    jobPostId: jobPost.id,
    cvProfileId,
    score: match.score,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    summary: match.summary,
    coverLetter: match.coverLetter,
    aiAnalysis: {
      ...match.aiAnalysis,
      profileContextSourceTablesUsed: profileContext.sourceTablesUsed,
      profileContextMissingFields: profileContext.missingFields,
    },
  };

  const savedMatch = existingMatch
    ? await prisma.jobMatch.update({
        where: { id: existingMatch.id },
        data: {
          score: matchData.score,
          matchedSkills: matchData.matchedSkills,
          missingSkills: matchData.missingSkills,
          summary: matchData.summary,
          coverLetter: matchData.coverLetter,
          aiAnalysis: matchData.aiAnalysis,
        },
      })
    : await prisma.jobMatch.create({
        data: matchData,
      });

  const existingDraft = await prisma.jobEmailDraft.findFirst({
    where: { jobPostId: jobPost.id, status: { in: ["DRAFT", "READY", "draft"] } },
    orderBy: { createdAt: "desc" },
  });
  const cvUrl = aiSettings.attachCv ? getCvUrlFromProfileContext(profileContext) : "";
  const approvalStatus = aiSettings.requireAdminApproval ? "PENDING" : "NOT_REQUIRED";

  const draft = existingDraft
    ? await prisma.jobEmailDraft.update({
        where: { id: existingDraft.id },
        data: {
          subject: match.emailSubject,
          body: match.emailBody,
          aiProvider: match.aiProvider || aiSettings.aiProvider,
          aiModel: match.aiModel || aiSettings.aiModel,
          emailPromptUsed: match.emailPromptUsed || aiSettings.recruiterEmailPrompt,
          coverLetterPromptUsed: match.coverLetterPromptUsed || aiSettings.coverLetterPrompt,
          coverLetterText: match.coverLetter || "",
          cvUrl,
          adminApprovalRequired: aiSettings.requireAdminApproval,
          approvalStatus,
          rejectedAt: null,
          rejectionReason: "",
        },
      })
    : await prisma.jobEmailDraft.create({
        data: {
          jobPostId: jobPost.id,
          subject: match.emailSubject,
          body: match.emailBody,
          aiProvider: match.aiProvider || aiSettings.aiProvider,
          aiModel: match.aiModel || aiSettings.aiModel,
          emailPromptUsed: match.emailPromptUsed || aiSettings.recruiterEmailPrompt,
          coverLetterPromptUsed: match.coverLetterPromptUsed || aiSettings.coverLetterPrompt,
          coverLetterText: match.coverLetter || "",
          cvUrl,
          adminApprovalRequired: aiSettings.requireAdminApproval,
          approvalStatus,
          approvedBy: "",
          rejectionReason: "",
          status: "DRAFT",
          sendStatus: "pending",
          skipReason: "",
          errorMessage: "",
        },
      });

  const finalDraft = aiSettings.autoGenerateCoverLetter
    ? await maybeGenerateCoverLetterPdfForDraft(draft, jobPost, profileContext, aiSettings)
    : draft;

  return { match: savedMatch, draft: finalDraft };
}

async function getJobInclude() {
  return {
    source: true,
    matches: { orderBy: { createdAt: "desc" }, take: 1 },
    emailDrafts: { orderBy: { createdAt: "desc" }, take: 3, include: { recruiterContact: true } },
    recruiterContacts: { orderBy: { createdAt: "desc" } },
  };
}

async function createManualJob(body) {
  const title = normalizeString(body.title);
  const company = normalizeString(body.company);
  const description = normalizeString(body.description);
  const sourceUrl = normalizeString(body.sourceUrl);

  if (!title || !company || !description) {
    throw new Error("Job title, company, and description are required.");
  }

  const recruiterEmail = normalizeEmail(body.recruiterEmail);
  if (!isUsableRecruiterEmail(recruiterEmail)) {
    throw new Error("A valid HR/recruiter email is required for manual jobs.");
  }
  if (body.recruiterEmailConfirmed !== true) {
    throw new Error("Confirm the HR/recruiter email before importing a manual job.");
  }

  const preferences = await getSearchPreferences();
  const keywordResult = assertJobInsideSearchKeywords({
    title,
    company,
    location: body.location,
    sourceUrl,
    description,
    rawContent: description,
    sourceName: "Manual Import",
  }, preferences);

  const jobPost = await prisma.jobPost.create({
    data: {
      sourceType: "manual",
      sourcePlatform: "manual",
      title,
      company,
      location: normalizeString(body.location),
      sourceUrl,
      applyUrl: sourceUrl,
      companyUrl: isPublicCompanyUrl(sourceUrl) ? sourceUrl : "",
      extractedUrls: sourceUrl ? [{ url: sourceUrl, type: isPublicCompanyUrl(sourceUrl) ? "companyUrl" : "applyUrl" }] : [],
      description,
      rawContent: description,
      sourceName: "Manual Import",
      importMethod: "MANUAL",
      descriptionStatus: "READY",
      searchKeywordMatched: keywordResult.matchedKeywords.slice(0, 5).join(", "),
      status: "new",
      contactDiscoveryStatus: "pending",
      contactDiscoveryError: "",
    },
  });

  await ensureRecruiterContactForEmail(
    jobPost.id,
    recruiterEmail,
    "manual",
    normalizeString(body.recruiterContext) || "Manually provided and confirmed by admin.",
  );

  await upsertMatchAndDraft(jobPost);
  return prisma.jobPost.findUnique({ where: { id: jobPost.id }, include: await getJobInclude() });
}

async function ensureGmailSource() {
  return prisma.jobSource.upsert({
    where: { id: 1 },
    update: {
      name: "Gmail Job Alerts",
      type: "gmail",
      provider: "gmail",
      status: "active",
    },
    create: {
      id: 1,
      name: "Gmail Job Alerts",
      type: "gmail",
      provider: "gmail",
      status: "active",
      config: {},
    },
  });
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean);
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function getSearchPreferences() {
  return prisma.jobSearchPreference.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      rolesJson: ["Web Developer", "Frontend Developer", "Full Stack Developer"],
      customKeywordsJson: [],
      jobTypesJson: ["Full-time", "Internship"],
      workModesJson: ["Remote", "Hybrid"],
      regionsJson: ["Europe", "United Kingdom", "United States"],
      experienceLevelsJson: ["Entry level", "Junior", "Mid level"],
      preferredLanguagesJson: ["English"],
      maxJobsPerSync: 25,
      minimumMatchScoreToDraft: 60,
      autoDraftEnabled: false,
    },
  });
}

function serializeSearchPreference(preference) {
  return {
    id: preference.id,
    rolesJson: normalizeStringArray(preference.rolesJson),
    customKeywordsJson: normalizeStringArray(preference.customKeywordsJson),
    jobTypesJson: normalizeStringArray(preference.jobTypesJson),
    workModesJson: normalizeStringArray(preference.workModesJson),
    regionsJson: normalizeStringArray(preference.regionsJson),
    experienceLevelsJson: normalizeStringArray(preference.experienceLevelsJson),
    preferredLanguagesJson: normalizeStringArray(preference.preferredLanguagesJson),
    maxJobsPerSync: preference.maxJobsPerSync,
    minimumMatchScoreToDraft: preference.minimumMatchScoreToDraft,
    autoDraftEnabled: Boolean(preference.autoDraftEnabled),
    createdAt: preference.createdAt,
    updatedAt: preference.updatedAt,
  };
}

function normalizeSearchText(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPreferenceKeywords(preferences) {
  const serialized = preferences?.rolesJson ? preferences : serializeSearchPreference(preferences);
  return Array.from(new Set([
    ...normalizeStringArray(serialized.rolesJson),
    ...normalizeStringArray(serialized.customKeywordsJson),
  ])).filter(Boolean);
}

function keywordAppearsInText(keyword, haystack) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return false;
  if (haystack.includes(normalizedKeyword)) return true;

  const words = normalizedKeyword.split(" ").filter((word) => word.length > 2);
  return words.length > 1 && words.every((word) => haystack.includes(word));
}

function evaluateJobAgainstSearchKeywords(job, preferences) {
  const keywords = getPreferenceKeywords(preferences);
  const haystack = normalizeSearchText([
    job.title,
    job.company,
    job.location,
    job.sourceUrl,
    job.description,
    job.rawContent,
    job.jobType,
    job.workMode,
    job.region,
    job.experienceLevel,
    job.sourceName,
  ].filter(Boolean).join(" "));
  const matchedKeywords = keywords.filter((keyword) => keywordAppearsInText(keyword, haystack));

  return {
    allowed: keywords.length > 0 && matchedKeywords.length > 0,
    keywords,
    matchedKeywords,
  };
}

function assertJobInsideSearchKeywords(job, preferences) {
  const result = evaluateJobAgainstSearchKeywords(job, preferences);
  if (!result.keywords.length) {
    throw new Error("Set at least one Target role or Custom keyword before importing manual jobs.");
  }
  if (!result.allowed) {
    throw new Error(`Manual import blocked. This job does not match your Target roles or Custom keywords: ${result.keywords.slice(0, 8).join(", ")}.`);
  }
  return result;
}

function serializeJobBoardSource(source) {
  return {
    id: source.id,
    sourceName: source.sourceName,
    companyName: source.companyName,
    region: source.region,
    sourceType: source.sourceType,
    baseUrl: source.baseUrl,
    careersUrl: source.careersUrl,
    detectedProvider: source.detectedProvider,
    extractionStatus: source.extractionStatus,
    extractionMessage: source.extractionMessage,
    selectorConfigJson: source.selectorConfigJson || {},
    lastImportStatsJson: source.lastImportStatsJson || null,
    enabled: Boolean(source.enabled),
    notes: source.notes,
    requiresApiKey: Boolean(source.requiresApiKey),
    apiKeyConfigured: Boolean(source.apiKeyEncrypted),
    lastSyncAt: source.lastSyncAt,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

async function seedDefaultJobBoardSources() {
  const defaults = defaultJobBoardSources();
  const saved = [];
  for (const source of defaults) {
    const normalizedSource = {
      ...source,
      companyName: source.companyName || source.sourceName,
      careersUrl: source.careersUrl || source.baseUrl || "",
      detectedProvider: source.detectedProvider || "",
      extractionStatus: source.extractionStatus || (source.status === "Ready" ? "READY" : "UNSUPPORTED"),
      extractionMessage: source.extractionMessage || source.notes || "",
      selectorConfigJson: source.selectorConfigJson || undefined,
      lastImportStatsJson: source.lastImportStatsJson || undefined,
    };

    saved.push(await prisma.jobBoardSource.upsert({
      where: { sourceName_region: { sourceName: source.sourceName, region: source.region } },
      update: {
        sourceType: normalizedSource.sourceType,
        baseUrl: normalizedSource.baseUrl,
        notes: normalizedSource.notes,
        requiresApiKey: normalizedSource.requiresApiKey,
        status: normalizedSource.status,
        companyName: normalizedSource.companyName,
        careersUrl: normalizedSource.careersUrl,
        detectedProvider: normalizedSource.detectedProvider,
        extractionStatus: normalizedSource.extractionStatus,
        extractionMessage: normalizedSource.extractionMessage,
      },
      create: normalizedSource,
    }));
  }
  return saved;
}

async function findDuplicateBoardJob(job) {
  if (normalizeString(job.sourceUrl)) {
    const byUrl = await prisma.jobPost.findFirst({ where: { sourceUrl: job.sourceUrl } });
    if (byUrl) return byUrl;
  }
  return prisma.jobPost.findFirst({
    where: {
      title: job.title,
      company: job.company,
      location: job.location || "",
    },
  });
}

async function createImportedJob(job) {
  return prisma.jobPost.create({
    data: {
      sourceType: normalizeString(job.sourceType || job.importMethod || "MANUAL").toLowerCase(),
      sourcePlatform: normalizeString(job.sourceType || job.importMethod || "MANUAL").toLowerCase(),
      title: job.title,
      company: job.company,
      location: job.location || "",
      sourceUrl: job.sourceUrl || "",
      applyUrl: job.applyUrl || job.sourceUrl || "",
      companyUrl: job.companyUrl || (isPublicCompanyUrl(job.sourceUrl) ? job.sourceUrl : ""),
      extractedUrls: job.extractedUrls || (job.sourceUrl ? [{ url: job.sourceUrl, type: "applyUrl" }] : []),
      description: job.description || "",
      rawContent: job.rawContent || job.description || "",
      jobType: job.jobType || "",
      workMode: job.workMode || "",
      region: job.region || "",
      experienceLevel: job.experienceLevel || "",
      sourceName: job.sourceName || "",
      importMethod: job.importMethod || "MANUAL",
      descriptionStatus: job.descriptionStatus || (job.description ? "READY" : "DESCRIPTION_REQUIRED"),
      searchKeywordMatched: job.searchKeywordMatched || "",
      status: job.description ? "new" : "DESCRIPTION_REQUIRED",
      contactDiscoveryStatus: "pending",
      contactDiscoveryError: "",
    },
  });
}

function serializeEmailSetting(setting) {
  const envPasswordConfigured = Boolean(normalizeString(process.env.SMTP_PASS));
  return {
    id: setting?.id || 1,
    adminId: setting?.adminId || null,
    fromName: setting?.fromName || normalizeString(process.env.FROM_NAME),
    fromEmail: setting?.fromEmail || normalizeEmail(process.env.FROM_EMAIL),
    smtpHost: setting?.smtpHost || normalizeString(process.env.SMTP_HOST) || "smtp.gmail.com",
    smtpPort: setting?.smtpPort || Number.parseInt(process.env.SMTP_PORT, 10) || 465,
    smtpSecure: typeof setting?.smtpSecure === "boolean" ? setting.smtpSecure : true,
    smtpUsername: setting?.smtpUsername || normalizeEmail(process.env.SMTP_USER),
    dailySendLimit: Math.min(setting?.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT, JOB_APPLICATION_DAILY_SEND_LIMIT),
    isEnabled: Boolean(setting?.isEnabled),
    openTrackingEnabled: Boolean(setting?.openTrackingEnabled),
    clickTrackingEnabled: Boolean(setting?.clickTrackingEnabled),
    hasPassword: Boolean(setting?.smtpPasswordEncrypted || envPasswordConfigured),
    passwordConfigured: Boolean(setting?.smtpPasswordEncrypted || envPasswordConfigured),
    createdAt: setting?.createdAt || null,
    updatedAt: setting?.updatedAt || null,
  };
}

function serializeJob(job) {
  const match = job?.matches?.[0] || null;
  const draft = job?.emailDrafts?.[0] || null;
  const contact = job?.recruiterContacts?.[0] || draft?.recruiterContact || null;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    source: job.source?.name || job.sourceType,
    sourceType: job.sourceType,
    sourceEmail: job.sourceEmail,
    sourceSubject: job.sourceSubject || job.emailSubject,
    sourcePlatform: job.sourcePlatform || job.sourceType,
    sourceUrl: job.sourceUrl,
    applyUrl: job.applyUrl || job.sourceUrl,
    companyUrl: job.companyUrl,
    extractedUrls: job.extractedUrls || [],
    jobType: job.jobType,
    workMode: job.workMode,
    region: job.region,
    experienceLevel: job.experienceLevel,
    sourceName: job.sourceName,
    importMethod: job.importMethod,
    descriptionStatus: job.descriptionStatus || (normalizeString(job.description) ? "READY" : "DESCRIPTION_REQUIRED"),
    searchKeywordMatched: job.searchKeywordMatched,
    emailSubject: job.emailSubject,
    matchScore: match?.score ?? null,
    status: job.status,
    contactDiscoveryStatus: job.contactDiscoveryStatus,
    contactDiscoveryError: job.contactDiscoveryError,
    lastContactDiscoveryAt: job.lastContactDiscoveryAt,
    foundContactEmail: contact?.email || "",
    foundContactId: contact?.id || null,
    contactConfidenceScore: contact?.confidenceScore ?? null,
    contactValidationStatus: contact?.validationStatus || "",
    contactEmailStatus: contact?.contactEmailStatus || "",
    contactSourceUrl: contact?.sourceUrl || "",
    draftSendStatus: draft?.sendStatus || "",
    draftSkipReason: draft?.skipReason || "",
    draftErrorMessage: draft?.errorMessage || "",
    createdAt: job.createdAt,
    receivedAt: job.receivedAt,
    latestMatch: match,
    latestDraft: draft,
  };
}

function serializeDraft(draft) {
  return {
    id: draft.id,
    jobPostId: draft.jobPostId,
    recruiterContactId: draft.recruiterContactId || null,
    recipientEmail: draft.toEmail,
    hrEmail: draft.toEmail || draft.recruiterContact?.email || "",
    hrEmailSource: draft.recruiterContact?.source || "",
    hrEmailVerified: Boolean(draft.recruiterContact?.contactEmailStatus === "approved" || draft.recruiterContact?.validationStatus === "approved"),
    contactConfidenceScore: draft.recruiterContact?.confidenceScore ?? null,
    contactValidationStatus: draft.recruiterContact?.validationStatus || "",
    contactEmailStatus: draft.recruiterContact?.contactEmailStatus || "",
    contactSourceUrl: draft.recruiterContact?.sourceUrl || "",
    subject: draft.subject,
    body: draft.body,
    aiProvider: draft.aiProvider,
    aiModel: draft.aiModel,
    emailPromptUsed: draft.emailPromptUsed,
    coverLetterPromptUsed: draft.coverLetterPromptUsed,
    coverLetterText: draft.coverLetterText,
    coverLetterPdfUrl: draft.coverLetterPdfUrl,
    cvUrl: draft.cvUrl,
    cvAttached: Boolean(draft.cvUrl),
    coverLetterPdfAttached: Boolean(draft.coverLetterPdfUrl),
    adminApprovalRequired: Boolean(draft.adminApprovalRequired),
    approvalStatus: draft.approvalStatus,
    approvedAt: draft.approvedAt,
    approvedBy: draft.approvedBy,
    rejectedAt: draft.rejectedAt,
    rejectionReason: draft.rejectionReason,
    status: draft.status,
    jobTitle: draft.jobPost?.title || "",
    company: draft.jobPost?.company || "",
    sentAt: draft.sentAt,
    openedAt: draft.openedAt,
    lastOpenedAt: draft.lastOpenedAt,
    openCount: draft.openCount,
    clickedAt: draft.clickedAt,
    clickCount: draft.clickCount,
    sendStatus: draft.sendStatus,
    skipReason: draft.skipReason,
    errorMessage: draft.errorMessage,
    lastSendAttemptAt: draft.lastSendAttemptAt,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

function serializeMatch(match) {
  return {
    id: match.id,
    jobPostId: match.jobPostId,
    job: match.jobPost
      ? {
          id: match.jobPost.id,
          title: match.jobPost.title,
          company: match.jobPost.company,
          location: match.jobPost.location,
        }
      : null,
    score: match.score,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    summary: match.summary,
    aiReasoning: match.aiAnalysis,
    createdAt: match.createdAt,
  };
}

function summarizeUserAgent(value) {
  return normalizeString(value).slice(0, 160);
}

function serializeEmailEvent(event) {
  return {
    id: event.id,
    draftId: event.draftId,
    jobPostId: event.jobPostId,
    eventType: event.eventType,
    recipientEmail: event.recipientEmail,
    trackingId: event.trackingId,
    url: event.url,
    userAgentSummary: summarizeUserAgent(event.userAgent),
    ipStoredAsHash: Boolean(event.ipHash),
    createdAt: event.createdAt,
    job: event.draft?.jobPost
      ? {
          id: event.draft.jobPost.id,
          title: event.draft.jobPost.title,
          company: event.draft.jobPost.company,
        }
      : null,
  };
}

async function getEmailSetting() {
  return prisma.jobAgentEmailSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      smtpPasswordEncrypted: "",
      dailySendLimit: JOB_APPLICATION_DAILY_SEND_LIMIT,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
    },
  });
}

function normalizeEmail(value) {
  return normalizeValidatedEmail(value);
}

function isUsableRecruiterEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmailFormat(normalized)) return false;
  if (isNoReplyEmail(normalized)) return false;
  return !isPlatformDomain(normalized.split("@")[1] || "");
}

function extractCandidateRecruiterEmails(...values) {
  return Array.from(new Set(values.flatMap((value) => extractValidatedEmails(value)).map(normalizeEmail))).filter(isUsableRecruiterEmail);
}

function getInternalQuotaState(settings) {
  const approvedApiSources = settings?.approvedApiSources;
  if (approvedApiSources && !Array.isArray(approvedApiSources) && typeof approvedApiSources === "object") {
    return {
      sources: Array.isArray(approvedApiSources.sources) ? approvedApiSources.sources : [],
      quotas: approvedApiSources.quotas && typeof approvedApiSources.quotas === "object" ? approvedApiSources.quotas : {},
    };
  }
  return {
    sources: Array.isArray(approvedApiSources) ? approvedApiSources : [],
    quotas: {},
  };
}

async function ensureRecruiterContactForEmail(jobPostId, email, source = "extracted", publicContext = "Extracted from job content.") {
  const normalizedEmail = normalizeEmail(email);
  if (!jobPostId || !isUsableRecruiterEmail(normalizedEmail)) {
    return null;
  }

  const job = await prisma.jobPost.findUnique({ where: { id: jobPostId } });
  const companyDomain = getUrlDomain(job?.companyUrl) || getUrlDomain(job?.applyUrl) || "";
  const manualApproved = ["manual", "admin"].includes(source);
  const validation = validateRecruiterEmail(normalizedEmail, { companyDomain });
  if (!manualApproved && !validation.accepted) {
    return null;
  }

  const existing = await prisma.recruiterContact.findFirst({
    where: { jobPostId, email: normalizedEmail },
  });

  if (existing) {
    if (manualApproved && existing.validationStatus !== "approved") {
      return prisma.recruiterContact.update({
        where: { id: existing.id },
        data: {
          validationStatus: "approved",
          contactEmailStatus: "approved",
          confidenceScore: Math.max(existing.confidenceScore || 0, 90),
          verified: true,
          verification: "manual",
          lastVerifiedAt: new Date(),
          errorMessage: "",
        },
      });
    }
    return existing;
  }

  return prisma.recruiterContact.create({
    data: {
      jobPostId,
      email: normalizedEmail,
      name: "",
      companyName: job?.company || "",
      companyDomain,
      source,
      sourceUrl: job?.companyUrl || job?.applyUrl || job?.sourceUrl || "",
      discoveryMethod: manualApproved ? "manual_admin_entry" : "content_candidate",
      validationStatus: manualApproved ? "approved" : "needs_review",
      contactEmailStatus: manualApproved ? "approved" : "pending",
      confidenceScore: manualApproved ? 90 : validation.confidenceScore,
      isRecruiter: validation.isRecruiter,
      isHiringManager: validation.isHiringManager,
      evidence: {
        source,
        publicContext,
        validation,
        note: manualApproved ? "Manually approved by admin." : "Unverified content candidate.",
      },
      lastVerifiedAt: manualApproved ? new Date() : null,
      errorMessage: "",
      verification: manualApproved ? "manual" : "needs_review",
      verified: manualApproved,
      publicContext,
    },
  });
}

async function ensureDraftRecipientEmail(draft, { externalLookup = false } = {}) {
  if (!draft?.jobPostId) {
    return draft;
  }

  const approvedStatuses = ["approved", "valid"];
  const existingContact = draft.recruiterContact?.contactEmailStatus === "approved" || draft.recruiterContact?.validationStatus === "approved"
    ? draft.recruiterContact
    : await prisma.recruiterContact.findFirst({
        where: {
          jobPostId: draft.jobPostId,
          email: draft.toEmail ? normalizeEmail(draft.toEmail) : undefined,
          OR: [
            { validationStatus: { in: approvedStatuses } },
            { contactEmailStatus: "approved" },
          ],
        },
        orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
      });

  if (existingContact?.email && isUsableRecruiterEmail(existingContact.email)) {
    return prisma.jobEmailDraft.update({
      where: { id: draft.id },
      data: { toEmail: normalizeEmail(existingContact.email), recruiterContactId: existingContact.id, status: "READY" },
      include: { jobPost: true, recruiterContact: true },
    });
  }

  if (externalLookup) {
    const job = draft.jobPost || await prisma.jobPost.findUnique({ where: { id: draft.jobPostId } });
    if (job) {
      await discoverContactsForJob(prisma, job);
      const discovered = await prisma.recruiterContact.findFirst({
        where: {
          jobPostId: draft.jobPostId,
          OR: [
            { validationStatus: { in: approvedStatuses } },
            { contactEmailStatus: "approved" },
          ],
        },
        orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
      });
      if (discovered?.email && isUsableRecruiterEmail(discovered.email)) {
        return prisma.jobEmailDraft.update({
          where: { id: draft.id },
          data: { toEmail: normalizeEmail(discovered.email), recruiterContactId: discovered.id, status: "READY" },
          include: { jobPost: true, recruiterContact: true },
        });
      }
    }
  }

  return draft;
}

function isAllowedGmailSmtp(port, secure) {
  return (port === 465 && secure === true) || (port === 587 && secure === false);
}

function normalizeEmailSettingPayload(body, existing = null) {
  const smtpPort = Number.parseInt(body?.smtpPort, 10) || existing?.smtpPort || 465;
  const smtpSecure =
    typeof body?.smtpSecure === "boolean" ? body.smtpSecure : smtpPort === 465;
  const smtpHost = normalizeString(body?.smtpHost || existing?.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com").toLowerCase();
  const smtpUsername = normalizeEmail(body?.smtpUsername || body?.fromEmail || existing?.smtpUsername);
  const fromEmail = normalizeEmail(body?.fromEmail || existing?.fromEmail);
  const allowFromEmailAlias =
    String(process.env.JOB_AGENT_ALLOW_SMTP_FROM_ALIAS || "").trim().toLowerCase() === "true";

  if (smtpHost === "smtp.gmail.com" && !isAllowedGmailSmtp(smtpPort, smtpSecure)) {
    throw new Error("Gmail SMTP must use port 465 with secure true or port 587 with secure false.");
  }

  if (!fromEmail || !smtpUsername) {
    throw new Error("From email and Gmail username are required.");
  }

  if (smtpHost === "smtp.gmail.com" && !allowFromEmailAlias && fromEmail !== smtpUsername) {
    throw new Error("From email must match Gmail SMTP username.");
  }

  return {
    fromName: normalizeString(body?.fromName ?? existing?.fromName),
    fromEmail,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUsername,
    dailySendLimit: Math.min(
      JOB_APPLICATION_DAILY_SEND_LIMIT,
      Math.max(1, Number.parseInt(body?.dailySendLimit, 10) || existing?.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT),
    ),
    isEnabled: typeof body?.isEnabled === "boolean" ? body.isEnabled : Boolean(existing?.isEnabled),
    openTrackingEnabled:
      typeof body?.openTrackingEnabled === "boolean"
        ? body.openTrackingEnabled
        : Boolean(existing?.openTrackingEnabled),
    clickTrackingEnabled:
      typeof body?.clickTrackingEnabled === "boolean"
        ? body.clickTrackingEnabled
        : Boolean(existing?.clickTrackingEnabled),
  };
}

function validateEmailSettingForSend(setting) {
  if (!setting?.isEnabled) {
    throw new Error("Job Agent email sending is disabled.");
  }

  const normalized = normalizeEmailSettingPayload({
    fromName: setting.fromName || process.env.FROM_NAME,
    fromEmail: setting.fromEmail || process.env.FROM_EMAIL,
    smtpHost: setting.smtpHost || process.env.SMTP_HOST,
    smtpPort: setting.smtpPort || process.env.SMTP_PORT,
    smtpSecure: typeof setting.smtpSecure === "boolean" ? setting.smtpSecure : String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    smtpUsername: setting.smtpUsername || process.env.SMTP_USER,
    dailySendLimit: setting.dailySendLimit,
    isEnabled: setting.isEnabled,
    openTrackingEnabled: setting.openTrackingEnabled,
    clickTrackingEnabled: setting.clickTrackingEnabled,
  }, setting);
  const passwordConfigured = Boolean(setting.smtpPasswordEncrypted || normalizeString(process.env.SMTP_PASS));
  if (!normalized.smtpHost || !normalized.smtpPort || !normalized.smtpUsername || !passwordConfigured || !normalized.fromEmail) {
    throw new Error("SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL.");
  }

  return normalized;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value) {
  return escapeHtml(value)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\r?\n/g, "<br />");
}

function rewriteTrackedLinks(html, trackingId, request) {
  return String(html || "").replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url) => {
    const trackingUrl = `${getPublicBackendUrl(request)}/api/job-agent/track/click/${encodeURIComponent(trackingId)}?url=${encodeURIComponent(url)}`;
    return `href="${trackingUrl}"`;
  });
}

function buildTrackedHtmlEmail(draft, setting, request) {
  let html = textToHtml(draft.body);

  if (setting.clickTrackingEnabled) {
    html = rewriteTrackedLinks(html, draft.trackingId, request);
  }

  if (setting.openTrackingEnabled) {
    const pixelUrl = `${getPublicBackendUrl(request)}/api/job-agent/track/open/${encodeURIComponent(draft.trackingId)}.png`;
    html += `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px;" />`;
  }

  return html;
}

function resolvePublicUploadPath(publicUrl) {
  const normalized = normalizeString(publicUrl);
  if (!normalized || /^https?:\/\//i.test(normalized)) {
    return null;
  }

  const relative = normalized.replace(/^\/+/, "");
  if (!relative.startsWith("uploads/")) {
    return null;
  }

  const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
  const resolved = path.resolve(process.cwd(), "public", relative);
  if (!resolved.startsWith(uploadRoot) || !fs.existsSync(resolved)) {
    return null;
  }

  return resolved;
}

function deletePublicUploadIfLocal(publicUrl) {
  const resolved = resolvePublicUploadPath(publicUrl);
  if (resolved && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}

function buildAttachment(publicUrl, fallbackFilename) {
  const normalized = normalizeString(publicUrl);
  if (!normalized) {
    return null;
  }

  const filename = path.basename(normalized.split("?")[0]) || fallbackFilename;
  const localPath = resolvePublicUploadPath(normalized);
  if (localPath) {
    return { filename, path: localPath };
  }

  if (/^https?:\/\//i.test(normalized)) {
    return { filename, href: normalized };
  }

  return null;
}

function buildDraftAttachments(draft, aiSettings) {
  const attachments = [];
  if (aiSettings.attachCv) {
    const cv = buildAttachment(draft.cvUrl, "cv.pdf");
    if (cv) attachments.push(cv);
  }

  if (aiSettings.attachCoverLetterPdf) {
    const coverLetter = buildAttachment(draft.coverLetterPdfUrl, "cover-letter.pdf");
    if (coverLetter) attachments.push(coverLetter);
  }

  return attachments;
}

async function countSentToday() {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return prisma.jobAgentEmailEvent.count({
    where: {
      eventType: "SENT",
      createdAt: { gte: start },
    },
  });
}

async function sendDraftEmail(draft, setting, request, aiSettings = null) {
  const normalized = validateEmailSettingForSend(setting);
  const appPassword = setting.smtpPasswordEncrypted ? decryptText(setting.smtpPasswordEncrypted) : normalizeString(process.env.SMTP_PASS);
  const transporter = nodemailer.createTransport({
    host: normalized.smtpHost,
    port: normalized.smtpPort,
    secure: normalized.smtpSecure,
    auth: {
      user: normalized.smtpUsername,
      pass: appPassword,
    },
  });

  const from = normalized.fromName
    ? `"${normalized.fromName}" <${normalized.fromEmail}>`
    : normalized.fromEmail;

  return transporter.sendMail({
    from,
    to: draft.toEmail,
    subject: draft.subject,
    text: draft.body,
    html: buildTrackedHtmlEmail(draft, setting, request),
    attachments: aiSettings ? buildDraftAttachments(draft, aiSettings) : [],
  });
}

router.get("/", requireAdmin, async (_request, response) => {
  try {
    const [settings, jobs, cvProfiles, profileContext] = await Promise.all([
      getSettings(),
      prisma.jobPost.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: await getJobInclude(),
      }),
      prisma.cvProfile.findMany({ orderBy: { createdAt: "desc" } }),
      buildJobAgentProfileContext(),
    ]);

    return response.json({
      settings: serializeSettings(settings),
      jobs,
      cvProfiles,
      profileContext,
    });
  } catch (error) {
    console.error("Failed to load job agent:", error.message);
    return response.status(500).json({ message: "Failed to load job agent." });
  }
});

router.get("/overview", requireAdmin, async (_request, response) => {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const gmailClientIdConfigured = Boolean(normalizeString(process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID));
    const gmailClientSecretConfigured = Boolean(normalizeString(process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET));
    const gmailRedirectUriConfigured = Boolean(normalizeString(process.env.GMAIL_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI));
    const [settings, emailSetting, aiSetting, gmailSource, totalJobs, matchedJobs, drafts, sentEmails, openedEmails, clickedEmails, failedEmails, sentToday, gmailImportedCount, boardJobs, manualImports, jobsNeedingDescription, autoDraftedJobs, recentEvents, latestAiDraft] =
      await Promise.all([
        getSettings(),
        getEmailSetting(),
        getJobAgentAiSetting(prisma),
        prisma.jobSource.findFirst({ where: { type: "gmail", provider: "gmail" }, orderBy: { lastSyncedAt: "desc" } }),
        prisma.jobPost.count(),
        prisma.jobMatch.count(),
        prisma.jobEmailDraft.count({ where: { status: { in: ["DRAFT", "READY"] } } }),
        prisma.jobEmailDraft.count({ where: { status: { in: ["SENT", "OPENED", "CLICKED"] } } }),
        prisma.jobEmailDraft.count({ where: { openCount: { gt: 0 } } }),
        prisma.jobEmailDraft.count({ where: { clickCount: { gt: 0 } } }),
        prisma.jobEmailDraft.count({ where: { status: "FAILED" } }),
        prisma.jobAgentEmailEvent.count({ where: { eventType: "SENT", createdAt: { gte: last24Hours } } }),
        prisma.jobPost.count({ where: { sourceType: "gmail" } }),
        prisma.jobPost.count({ where: { importMethod: { in: ["API", "RSS", "PUBLIC_BOARD", "COMPANY_CAREER_SITE"] } } }),
        prisma.jobPost.count({ where: { importMethod: "MANUAL" } }),
        prisma.jobPost.count({ where: { descriptionStatus: "DESCRIPTION_REQUIRED" } }),
        prisma.jobEmailDraft.count({ where: { aiProvider: { not: "" } } }),
        prisma.jobAgentEmailEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          include: { draft: { include: { jobPost: true } } },
        }),
        prisma.jobEmailDraft.findFirst({
          where: { aiProvider: { not: "" } },
          orderBy: { updatedAt: "desc" },
          include: { jobPost: true },
        }),
      ]);
    const serializedAiSetting = serializeJobAgentAiSetting(aiSetting);
    const activeAiKeyConfigured = keyConfigured(aiSetting, serializedAiSetting.aiProvider);
    const gmailOAuthConfigured = gmailClientIdConfigured && gmailClientSecretConfigured;
    const gmailConnected = Boolean(settings.gmailRefreshToken);
    const serializedEmailSetting = serializeEmailSetting(emailSetting);
    const smtpPasswordConfigured = Boolean(serializedEmailSetting.passwordConfigured);
    const smtpReady = Boolean(emailSetting.isEnabled && serializedEmailSetting.fromEmail && serializedEmailSetting.smtpUsername && smtpPasswordConfigured);
    const effectiveDailySendLimit = Math.min(emailSetting.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT, JOB_APPLICATION_DAILY_SEND_LIMIT);

    return response.json({
      overview: {
        totalJobs,
        matchedJobs,
        drafts,
        sentEmails,
        openedEmails,
        clickedEmails,
        failedEmails,
        boardJobs,
        manualImports,
        jobsNeedingDescription,
        autoDraftedJobs,
        sentToday,
        dailySendLimit: effectiveDailySendLimit,
        gmail: {
          oauthConfigured: gmailOAuthConfigured,
          clientIdConfigured: gmailClientIdConfigured,
          clientSecretConfigured: gmailClientSecretConfigured,
          redirectUriConfigured: gmailRedirectUriConfigured,
          connected: gmailConnected,
          email: settings.gmailConnectedEmail || "",
          lastSyncTime: gmailSource?.lastSyncedAt || null,
          importedJobCount: gmailImportedCount,
          status: gmailOAuthConfigured && gmailConnected ? "CONNECTED" : gmailOAuthConfigured ? "READY_TO_CONNECT" : "CONFIG_REQUIRED",
          message: gmailOAuthConfigured
            ? gmailConnected
              ? "Gmail job-alert ingestion is connected."
              : "Google OAuth is configured. Connect Gmail to start importing alerts."
            : "Google OAuth client ID/secret must be configured before Gmail can connect.",
        },
        smtp: {
          isEnabled: Boolean(emailSetting.isEnabled),
          fromEmail: serializedEmailSetting.fromEmail,
          smtpUsername: serializedEmailSetting.smtpUsername,
          smtpHost: serializedEmailSetting.smtpHost,
          smtpPort: serializedEmailSetting.smtpPort,
          smtpSecure: Boolean(serializedEmailSetting.smtpSecure),
          passwordConfigured: smtpPasswordConfigured,
          dailySendLimit: effectiveDailySendLimit,
          ready: smtpReady,
          status: smtpReady ? "READY" : Boolean(emailSetting.isEnabled) ? "CONFIG_REQUIRED" : "DISABLED",
          message: smtpReady
            ? "Dedicated Gmail SMTP sending is ready."
            : Boolean(emailSetting.isEnabled)
              ? "SMTP is enabled but sender, username, or app password is missing."
              : "SMTP sending is disabled.",
        },
        ai: {
          aiProvider: serializedAiSetting.aiProvider,
          aiModel: serializedAiSetting.aiModel,
          providerLabel: serializedAiSetting.providerLabels?.[serializedAiSetting.aiProvider] || serializedAiSetting.aiProvider,
          activeProviderKeyConfigured: activeAiKeyConfigured,
          deepseekKeyConfigured: serializedAiSetting.deepseekKeyConfigured,
          geminiKeyConfigured: serializedAiSetting.geminiKeyConfigured,
          openaiKeyConfigured: serializedAiSetting.openaiKeyConfigured,
          fallbackEnabled: serializedAiSetting.fallbackEnabled,
          fallbackProvider: serializedAiSetting.fallbackProvider,
          status: activeAiKeyConfigured ? "READY" : "CONFIG_REQUIRED",
          message: activeAiKeyConfigured
            ? "Selected AI provider has an encrypted API key configured."
            : "Selected AI provider needs an API key before real AI responses can run.",
          latestResponse: latestAiDraft
            ? {
                draftId: latestAiDraft.id,
                jobTitle: latestAiDraft.jobPost?.title || "",
                company: latestAiDraft.jobPost?.company || "",
                provider: latestAiDraft.aiProvider,
                model: latestAiDraft.aiModel,
                status: latestAiDraft.status,
                updatedAt: latestAiDraft.updatedAt,
              }
            : null,
        },
        tracking: {
          openTrackingEnabled: Boolean(emailSetting.openTrackingEnabled),
          clickTrackingEnabled: Boolean(emailSetting.clickTrackingEnabled),
          status: emailSetting.openTrackingEnabled || emailSetting.clickTrackingEnabled ? "ACTIVE" : "DISABLED",
          message: emailSetting.openTrackingEnabled || emailSetting.clickTrackingEnabled
            ? "Live tracking events are being recorded when email clients allow it."
            : "Open and click tracking are disabled.",
          recentEvents: recentEvents.map((event) => ({
            id: event.id,
            eventType: event.eventType,
            recipientEmail: event.recipientEmail,
            jobTitle: event.draft?.jobPost?.title || "",
            company: event.draft?.jobPost?.company || "",
            url: event.eventType === "CLICKED" ? event.url : "",
            userAgent: event.userAgent,
            createdAt: event.createdAt,
            ipStoredAsHash: Boolean(event.ipHash),
          })),
        },
      },
    });
  } catch (error) {
    console.error("Failed to load Job Agent overview:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent overview." });
  }
});

router.get("/jobs", requireAdmin, async (request, response) => {
  try {
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, Number.parseInt(request.query.limit, 10) || 10));
    const recentHours = Math.max(1, Math.min(168, Number.parseInt(request.query.recentHours, 10) || 24));
    const recentSince = new Date(Date.now() - recentHours * 60 * 60 * 1000);
    const where = { createdAt: { gte: recentSince } };
    const total = await prisma.jobPost.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const jobs = await prisma.jobPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * limit,
      take: limit,
      include: {
        source: true,
        matches: { orderBy: { createdAt: "desc" }, take: 1 },
        emailDrafts: { orderBy: { createdAt: "desc" }, take: 1, include: { recruiterContact: true } },
        recruiterContacts: { orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }], take: 1 },
      },
    });

    return response.json({
      jobs: jobs.map(serializeJob),
      pagination: { page: safePage, limit, total, totalPages, recentHours },
    });
  } catch (error) {
    console.error("Failed to load Job Agent jobs:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent jobs." });
  }
});

router.get("/matches", requireAdmin, async (_request, response) => {
  try {
    const matches = await prisma.jobMatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { jobPost: true },
      take: 100,
    });

    return response.json({ matches: matches.map(serializeMatch) });
  } catch (error) {
    console.error("Failed to load Job Agent matches:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent matches." });
  }
});

router.get("/drafts", requireAdmin, async (_request, response) => {
  try {
    const foundDrafts = await prisma.jobEmailDraft.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        OR: [
          { status: { in: ["DRAFT", "READY", "SENT", "OPENED", "CLICKED", "FAILED"] } },
          { approvalStatus: "REJECTED" },
        ],
      },
      include: { jobPost: true, recruiterContact: true },
      take: 150,
    });
    const drafts = [];

    for (const draft of foundDrafts) {
      const isHistoryDraft = ["SENT", "OPENED", "CLICKED", "FAILED"].includes(String(draft.status || "").toUpperCase()) || draft.approvalStatus === "REJECTED";
      const updatedDraft = isHistoryDraft ? draft : await ensureDraftRecipientEmail(draft);
      if (isUsableRecruiterEmail(updatedDraft.toEmail || updatedDraft.recruiterContact?.email)) {
        drafts.push(updatedDraft);
      }
    }

    return response.json({ drafts: drafts.map(serializeDraft) });
  } catch (error) {
    console.error("Failed to load Job Agent drafts:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent drafts." });
  }
});

router.get("/email/events", requireAdmin, async (_request, response) => {
  try {
    const events = await prisma.jobAgentEmailEvent.findMany({
      orderBy: { createdAt: "desc" },
      include: { draft: { include: { jobPost: true } } },
      take: 150,
    });

    return response.json({ events: events.map(serializeEmailEvent) });
  } catch (error) {
    console.error("Failed to load Job Agent email events:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent email events." });
  }
});

router.get("/profile-context", requireAdmin, async (_request, response) => {
  try {
    const profileContext = await buildJobAgentProfileContext();
    return response.json(profileContext);
  } catch (error) {
    console.error("Failed to build job agent profile context:", error.message);
    return response.status(500).json({ message: "Failed to build profile context." });
  }
});

router.put("/profile-context/notes", requireAdmin, async (request, response) => {
  try {
    const extraNotes = normalizeString(request.body?.extraNotes);
    const targetRoles = parseJsonArray(request.body?.targetRoles);
    const preferredCountries = parseJsonArray(request.body?.preferredCountries);
    const resumeUrl = normalizeString(request.body?.resumeUrl);
    const resumeFileName = normalizeString(request.body?.resumeFileName);

    const existing = await prisma.cvProfile.findFirst({
      where: { isDefault: true },
      orderBy: { updatedAt: "desc" },
    });

    const cvProfile = existing
      ? await prisma.cvProfile.update({
          where: { id: existing.id },
          data: {
            title: "Optional CV Notes",
            extraNotes,
            targetRoles,
            preferredCountries,
            resumeUrl,
            resumeFileName,
            resumeUpdatedAt: resumeUrl || resumeFileName ? new Date() : null,
            isDefault: true,
          },
        })
      : await prisma.cvProfile.create({
          data: {
            title: "Optional CV Notes",
            extraNotes,
            targetRoles,
            preferredCountries,
            resumeUrl,
            resumeFileName,
            resumeUpdatedAt: resumeUrl || resumeFileName ? new Date() : null,
            isDefault: true,
          },
        });

    const profileContext = await buildJobAgentProfileContext();
    return response.json({
      message: "Optional CV notes saved.",
      cvProfile,
      profileContext,
    });
  } catch (error) {
    console.error("Failed to save optional CV notes:", error.message);
    return response.status(500).json({ message: "Failed to save optional CV notes." });
  }
});

router.post("/profile-context/cv", requireAdmin, async (request, response) => {
  cvUpload.single("cv")(request, response, async (error) => {
    if (error) {
      return response.status(400).json({ message: error.message || "Failed to upload Job Agent CV." });
    }

    if (!request.file) {
      return response.status(400).json({ message: "Please choose a CV file to upload." });
    }

    try {
      const existing = await prisma.cvProfile.findFirst({
        where: { isDefault: true },
        orderBy: { updatedAt: "desc" },
      });
      const publicUrl = `/uploads/job-agent/cv/${request.file.filename}`;
      const originalName = normalizeString(request.file.originalname) || request.file.filename;

      if (existing?.resumeUrl && existing.resumeUrl !== publicUrl) {
        deletePublicUploadIfLocal(existing.resumeUrl);
      }

      for (const filename of fs.readdirSync(jobAgentCvUploadDirectory)) {
        if (filename !== request.file.filename) {
          const resolved = path.resolve(jobAgentCvUploadDirectory, filename);
          if (resolved.startsWith(jobAgentCvUploadDirectory) && fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
          }
        }
      }

      const cvProfile = existing
        ? await prisma.cvProfile.update({
            where: { id: existing.id },
            data: {
              title: "Job Agent CV",
              resumeUrl: publicUrl,
              resumeFileName: originalName,
              resumeUpdatedAt: new Date(),
              isDefault: true,
            },
          })
        : await prisma.cvProfile.create({
            data: {
              title: "Job Agent CV",
              extraNotes: "",
              targetRoles: [],
              preferredCountries: [],
              resumeUrl: publicUrl,
              resumeFileName: originalName,
              resumeUpdatedAt: new Date(),
              isDefault: true,
            },
          });

      await prisma.jobEmailDraft.updateMany({
        where: { status: { in: ["DRAFT", "READY"] } },
        data: { cvUrl: publicUrl },
      });

      const profileContext = await buildJobAgentProfileContext();
      return response.json({
        message: "Job Agent CV uploaded. Previous CV was replaced.",
        cvProfile,
        profileContext,
      });
    } catch (uploadError) {
      console.error("Failed to upload Job Agent CV:", uploadError.message);
      deletePublicUploadIfLocal(`/uploads/job-agent/cv/${request.file.filename}`);
      return response.status(500).json({ message: uploadError.message || "Failed to upload Job Agent CV." });
    }
  });
});

router.put("/settings", requireAdmin, async (request, response) => {
  try {
    const existingSettings = await getSettings();
    const existingQuotaState = getInternalQuotaState(existingSettings);
    const approvedApiSources = {
      sources: Array.isArray(request.body?.approvedApiSources)
        ? request.body.approvedApiSources
        : existingQuotaState.sources,
      quotas: existingQuotaState.quotas,
    };
    const dailySendLimit = Math.min(
      JOB_APPLICATION_DAILY_SEND_LIMIT,
      Math.max(1, Number.parseInt(request.body?.dailySendLimit, 10) || existingSettings.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT),
    );
    const settings = await prisma.jobAgentSettings.upsert({
      where: { id: 1 },
      update: {
        gmailQuery: normalizeString(request.body?.gmailQuery) || undefined,
        dailySendLimit,
        autoSendEnabled: false,
        approvedApiSources,
      },
      create: {
        id: 1,
        gmailRefreshToken: "",
        gmailQuery: normalizeString(request.body?.gmailQuery) || undefined,
        dailySendLimit,
        autoSendEnabled: false,
        approvedApiSources,
      },
    });

    return response.json({ message: "Job agent settings saved.", settings: serializeSettings(settings) });
  } catch (error) {
    console.error("Failed to save job agent settings:", error.message);
    return response.status(500).json({ message: "Failed to save job agent settings." });
  }
});

router.get("/email/settings", requireAdmin, async (_request, response) => {
  try {
    const setting = await getEmailSetting();
    return response.json({ setting: serializeEmailSetting(setting) });
  } catch (error) {
    console.error("Failed to load Job Agent email settings:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent email settings." });
  }
});

router.put("/email/settings", requireAdmin, async (request, response) => {
  try {
    const existing = await getEmailSetting();
    const payload = normalizeEmailSettingPayload(request.body || {}, existing);
    const appPassword = normalizeString(request.body?.smtpPassword);
    const setting = await prisma.jobAgentEmailSetting.update({
      where: { id: existing.id },
      data: {
        adminId: Number.parseInt(request.admin?.sub, 10) || existing.adminId || null,
        ...payload,
        ...(appPassword ? { smtpPasswordEncrypted: encryptText(appPassword) } : {}),
      },
    });

    return response.json({
      message: "Job Agent email settings saved.",
      setting: serializeEmailSetting(setting),
    });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to save Job Agent email settings." });
  }
});

router.get("/ai/settings", requireAdmin, async (_request, response) => {
  try {
    const setting = await getJobAgentAiSetting(prisma);
    return response.json({ setting: serializeJobAgentAiSetting(setting) });
  } catch (error) {
    console.error("Failed to load Job Agent AI settings:", error.message);
    return response.status(500).json({ message: "Failed to load Job Agent AI settings." });
  }
});

router.put("/ai/settings", requireAdmin, async (request, response) => {
  try {
    const existing = await getJobAgentAiSetting(prisma);
    const payload = normalizeAiSettingPayload(request.body || {}, existing);
    const setting = await prisma.jobAgentAiSetting.update({
      where: { id: existing.id },
      data: {
        ...payload,
        ...buildEncryptedKeyUpdate(request.body || {}),
      },
    });

    return response.json({
      message: "Job Agent AI settings saved.",
      setting: serializeJobAgentAiSetting(setting),
    });
  } catch (error) {
    console.error("Failed to save Job Agent AI settings:", error.message);
    return response.status(400).json({ message: error.message || "Failed to save Job Agent AI settings." });
  }
});

async function getPreviewJob(body) {
  const jobId = Number.parseInt(body?.jobId, 10);
  if (jobId) {
    const found = await prisma.jobPost.findUnique({ where: { id: jobId } });
    if (found) return found;
  }

  const latest = await prisma.jobPost.findFirst({ orderBy: { createdAt: "desc" } });
  if (latest) return latest;

  return {
    id: 0,
    title: normalizeString(body?.title) || "Frontend Developer",
    company: normalizeString(body?.company) || "Example Company",
    location: normalizeString(body?.location) || "Remote",
    description: normalizeString(body?.description) || "Build reliable web applications with React, Node.js, and clean user experiences.",
    sourceUrl: "",
  };
}

async function previewJobAgentContent(request, response, mode) {
  try {
    const [settings, profileContext, job] = await Promise.all([
      getJobAgentAiSetting(prisma),
      buildJobAgentProfileContext(),
      getPreviewJob(request.body || {}),
    ]);
    const recruiterContact = request.body?.recruiterName
      ? { name: normalizeString(request.body.recruiterName), verified: true, source: "preview" }
      : null;
    const promptPreview = buildFinalPrompts({
      settings,
      profileContext,
      job,
      match: null,
      recruiterContact,
      mode,
    });
    const generated = await generateJobAgentContent({
      settings,
      profileContext,
      job,
      recruiterContact,
      mode,
    });

    return response.json({
      message: generated.mocked ? "Preview generated with mock-safe AI fallback." : "Preview generated.",
      mocked: generated.mocked,
      provider: generated.provider,
      model: generated.model,
      email: {
        subject: generated.emailSubject,
        body: generated.emailBody,
      },
      coverLetterText: generated.coverLetterText,
      promptPreview,
      profileSourceTablesUsed: profileContext.sourceTablesUsed,
    });
  } catch (error) {
    console.error("Failed to preview Job Agent AI content:", error.message);
    return response.status(500).json({ message: error.message || "Failed to preview AI content." });
  }
}

router.post("/ai/preview-email", requireAdmin, async (request, response) => {
  return previewJobAgentContent(request, response, "email");
});

router.post("/ai/preview-cover-letter", requireAdmin, async (request, response) => {
  return previewJobAgentContent(request, response, "coverLetter");
});

router.post("/email/test", requireAdmin, async (request, response) => {
  try {
    const setting = await getEmailSetting();
    const toEmail = normalizeEmail(request.body?.toEmail || setting.fromEmail);

    if (request.body?.mock === true) {
      return response.json({
        message: "Mock Job Agent test email passed. Configure SMTP to send a real test.",
        mocked: true,
        setting: serializeEmailSetting(setting),
      });
    }

    const draft = {
      toEmail,
      subject: "Job Agent Gmail SMTP test",
      body: "This is a test email from the Job Agent dedicated Gmail SMTP settings.",
      trackingId: crypto.randomBytes(16).toString("hex"),
    };
    const sent = await sendDraftEmail(draft, setting, request);

    return response.json({
      message: "Test email sent.",
      mocked: false,
      providerMessageId: normalizeString(sent.messageId),
    });
  } catch (error) {
    console.error("Failed to send Job Agent test email:", error.message);
    return response.status(400).json({ message: error.message || "Failed to send Job Agent test email." });
  }
});

async function markDraftSendFailed(draftId, request = null, message = "") {
  if (!draftId) return null;

  const failedDraft = await prisma.jobEmailDraft.update({
    where: { id: draftId },
    data: {
      status: "FAILED",
      sendStatus: "failed",
      errorMessage: normalizeString(message),
      skipReason: "",
      lastSendAttemptAt: new Date(),
    },
  }).catch(() => null);

  if (failedDraft) {
    await prisma.jobAgentEmailEvent.create({
      data: {
        draftId: failedDraft.id,
        jobPostId: failedDraft.jobPostId,
        recipientEmail: failedDraft.toEmail,
        eventType: "FAILED",
        trackingId: failedDraft.trackingId,
        url: normalizeString(message).slice(0, 500),
        userAgent: normalizeString(request?.headers?.["user-agent"] || "job-agent-auto-send"),
        ipHash: "",
      },
    }).catch(() => null);
  }

  return failedDraft;
}

async function markDraftSendSkipped(draftId, request = null, message = "") {
  if (!draftId) return null;

  const skippedDraft = await prisma.jobEmailDraft.update({
    where: { id: draftId },
    data: {
      sendStatus: "skipped",
      skipReason: normalizeString(message),
      errorMessage: "",
      lastSendAttemptAt: new Date(),
    },
  }).catch(() => null);

  if (skippedDraft) {
    await prisma.jobAgentEmailEvent.create({
      data: {
        draftId: skippedDraft.id,
        jobPostId: skippedDraft.jobPostId,
        recipientEmail: skippedDraft.toEmail,
        eventType: "SKIPPED",
        trackingId: skippedDraft.trackingId,
        url: normalizeString(message).slice(0, 500),
        userAgent: normalizeString(request?.headers?.["user-agent"] || "job-agent-auto-send"),
        ipHash: "",
      },
    }).catch(() => null);
  }

  return skippedDraft;
}

async function hasSentJobEmailToRecipient(email, excludeDraftId = null) {
  const recipientEmail = normalizeEmail(email);
  if (!recipientEmail) return false;

  const existingSentEvent = await prisma.jobAgentEmailEvent.findFirst({
    where: {
      eventType: "SENT",
      recipientEmail,
      ...(excludeDraftId ? { draftId: { not: excludeDraftId } } : {}),
    },
    select: { id: true },
  });

  if (existingSentEvent) return true;

  const existingSentDraft = await prisma.jobEmailDraft.findFirst({
    where: {
      toEmail: recipientEmail,
      status: { in: ["SENT", "OPENED", "CLICKED"] },
      ...(excludeDraftId ? { id: { not: excludeDraftId } } : {}),
    },
    select: { id: true },
  });

  return Boolean(existingSentDraft);
}

async function sendDraftById(draftId, { request = null, toEmail: requestedToEmail = "", triggeredBy = "manual" } = {}) {
  const draft = await prisma.jobEmailDraft.findUnique({
    where: { id: draftId },
    include: { recruiterContact: true, jobPost: true },
  });

  if (!draft) {
    const error = new Error("Draft was not found.");
    error.statusCode = 404;
    throw error;
  }

  await prisma.jobEmailDraft.update({
    where: { id: draft.id },
    data: { lastSendAttemptAt: new Date(), skipReason: "", errorMessage: "" },
  });

  if (["SENT", "OPENED", "CLICKED"].includes(String(draft.status || "").toUpperCase())) {
    const error = new Error("This draft was already sent.");
    error.statusCode = 409;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  const toEmail = normalizeEmail(requestedToEmail || draft.toEmail || draft.recruiterContact?.email);
  if (!toEmail || !isUsableRecruiterEmail(toEmail)) {
    const error = new Error("A valid approved recipient email is required.");
    error.statusCode = 400;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  const contact =
    (draft.recruiterContact?.email && normalizeEmail(draft.recruiterContact.email) === toEmail ? draft.recruiterContact : null) ||
    (await prisma.recruiterContact.findFirst({
      where: {
        jobPostId: draft.jobPostId,
        email: toEmail,
        OR: [
          { validationStatus: { in: ["approved", "valid"] } },
          { contactEmailStatus: "approved" },
        ],
      },
      orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    }));

  if (!contact) {
    const error = new Error("Recipient must be an approved validated contact discovered from public company pages or manually approved by admin.");
    error.statusCode = 400;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  const contactValidation = validateRecruiterEmail(toEmail, {
    companyDomain: contact.companyDomain || getUrlDomain(draft.jobPost?.companyUrl) || getUrlDomain(draft.jobPost?.applyUrl),
  });
  if (!contactValidation.accepted && contact.contactEmailStatus !== "approved") {
    const error = new Error(`Recipient validation failed: ${contactValidation.reasons.join(", ") || "invalid recipient"}.`);
    error.statusCode = 400;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  if (await hasSentJobEmailToRecipient(toEmail, draft.id)) {
    const error = new Error(`Already sent one job email to ${toEmail}. Duplicate sends are blocked.`);
    error.statusCode = 409;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  const setting = await getEmailSetting();
  const aiSettings = await getJobAgentAiSetting(prisma);

  if (aiSettings.requireAdminApproval && draft.approvalStatus !== "APPROVED") {
    const error = new Error("Admin approval required before sending.");
    error.statusCode = 403;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  validateEmailSettingForSend(setting);

  const sendsToday = await countSentToday();
  const effectiveDailySendLimit = Math.min(setting.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT, JOB_APPLICATION_DAILY_SEND_LIMIT);
  if (sendsToday >= effectiveDailySendLimit) {
    const error = new Error("Daily job email sending limit reached.");
    error.statusCode = 429;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  let draftForSend = draft;
  if (aiSettings.attachCoverLetterPdf && !draftForSend.coverLetterPdfUrl && draftForSend.coverLetterText) {
    const profileContext = await buildJobAgentProfileContext();
    draftForSend = await maybeGenerateCoverLetterPdfForDraft(draftForSend, draftForSend.jobPost, profileContext, aiSettings);
  }

  const readyDraft = await prisma.jobEmailDraft.update({
    where: { id: draft.id },
    data: {
      toEmail,
      recruiterContactId: contact.id,
      status: "READY",
    },
  });

  if (await hasSentJobEmailToRecipient(toEmail, draft.id)) {
    const error = new Error(`Already sent one job email to ${toEmail}. Duplicate sends are blocked.`);
    error.statusCode = 409;
    error.skipFailureMark = true;
    error.sendSkipped = true;
    throw error;
  }

  const sent = await sendDraftEmail({ ...draftForSend, ...readyDraft, jobPost: draftForSend.jobPost || draft.jobPost }, setting, request, aiSettings);
  const sentAt = new Date();

  const finalDraft = await prisma.jobEmailDraft.update({
    where: { id: draft.id },
    data: {
      status: "SENT",
      sendStatus: "sent",
      skipReason: "",
      errorMessage: "",
      lastSendAttemptAt: sentAt,
      sentAt,
      providerMessageId: normalizeString(sent.messageId),
    },
  });

  await prisma.jobAgentEmailEvent.create({
    data: {
      draftId: finalDraft.id,
      jobPostId: finalDraft.jobPostId,
      recipientEmail: finalDraft.toEmail,
      eventType: "SENT",
      trackingId: finalDraft.trackingId,
      url: "",
      userAgent: normalizeString(request?.headers?.["user-agent"] || `job-agent-${triggeredBy}-send`),
      ipHash: "",
    },
  });

  return finalDraft;
}

async function sendJobEmailDraft(request, response, draftId) {
  try {
    const finalDraft = await sendDraftById(draftId, {
      request,
      toEmail: request.body?.toEmail,
      triggeredBy: "manual",
    });

    return response.json({ message: "Draft sent with Job Agent Gmail SMTP.", draft: finalDraft });
  } catch (error) {
    console.error("Failed to send Job Agent draft:", error.message);
    if (error.sendSkipped) {
      await markDraftSendSkipped(draftId, request, error.message);
    } else if (!error.skipFailureMark) {
      await markDraftSendFailed(draftId, request, error.message);
    }
    return response.status(error.statusCode || 500).json({ message: error.message || "Failed to send draft." });
  }
}

router.post("/email/send/:draftId", requireAdmin, async (request, response) => {
  const draftId = Number.parseInt(request.params.draftId, 10);
  if (!draftId) {
    return response.status(400).json({ message: "Invalid draft id." });
  }

  return sendJobEmailDraft(request, response, draftId);
});

async function createGmailConnectResponse(request, response) {
  try {
    const oauth2Client = getGmailOAuthClient(request);
    const state = crypto.randomBytes(24).toString("hex");
    oauthStates.set(state, {
      adminId: request.admin.sub,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      state,
    });

    return response.json({ authUrl });
  } catch (error) {
    return response.status(400).json({ message: error.message });
  }
}

async function runGmailJobAlertSync({ request = null, maxResults = 10, triggeredBy = "manual" } = {}) {
  const settings = await getSettings();
  if (!settings.gmailRefreshToken) {
    const error = new Error("Gmail is not connected.");
    error.statusCode = 400;
    throw error;
  }

  const oauth2Client = getGmailOAuthClient(request);
  const gmail = createGmailClient(oauth2Client, settings);
  const source = await ensureGmailSource();
  const maxResultsPerQuery = Math.min(Number.parseInt(maxResults, 10) || 10, 25);
  const imported = [];
  const skipped = [];
  const seenMessageIds = new Set();

  for (const query of SAFE_JOB_ALERT_QUERIES) {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: maxResultsPerQuery,
    });

    for (const item of list.data.messages || []) {
      if (!item.id || seenMessageIds.has(item.id)) {
        continue;
      }
      seenMessageIds.add(item.id);

      const message = await gmail.users.messages.get({ userId: "me", id: item.id, format: "full" });
      const extracted = parseGmailJobAlert(message.data);
      const messageText = getMessageText(message.data);
      const fromEmail = extractEmails(getMessageHeader(message.data, "from"))[0] || "";
      const classifiedUrls = classifyJobAlertUrls(messageText);
      const rawEmailCandidates = extractValidatedEmails(messageText);
      const duplicateByMessageId = extracted.externalId
        ? await prisma.jobPost.findFirst({
            where: {
              sourceType: "gmail",
              externalId: extracted.externalId,
            },
          })
        : null;
      const duplicate = duplicateByMessageId || (await findDuplicateJob(extracted));

      if (duplicate) {
        skipped.push({ id: duplicate.id, reason: "duplicate", sourceUrl: extracted.sourceUrl });
        continue;
      }

      const jobPost = await prisma.jobPost.create({
        data: {
          source: { connect: { id: source.id } },
          sourceType: "gmail",
          externalId: extracted.externalId,
          sourceEmail: normalizeEmail(fromEmail),
          sourceSubject: extracted.emailSubject,
          sourcePlatform: extracted.source,
          emailSubject: extracted.emailSubject,
          title: extracted.title,
          company: extracted.company,
          location: extracted.location,
          sourceUrl: extracted.sourceUrl,
          applyUrl: classifiedUrls.applyUrl || extracted.sourceUrl,
          companyUrl: classifiedUrls.companyUrl,
          extractedUrls: classifiedUrls.urls,
          description: "",
          rawContent: [
            messageText,
            "",
            "Raw email candidates from alert body (not verified recruiter contacts):",
            rawEmailCandidates.join(", "),
          ].join("\n").slice(0, 20000),
          sourceName: "Gmail Job Alerts",
          importMethod: "EMAIL_ALERT",
          descriptionStatus: "DESCRIPTION_REQUIRED",
          receivedAt: extracted.receivedAt,
          status: "DESCRIPTION_REQUIRED",
          contactDiscoveryStatus: "pending",
          contactDiscoveryError: "",
        },
      });

      imported.push(jobPost.id);
    }
  }

  const syncedAt = new Date();
  await prisma.jobSource.update({
    where: { id: source.id },
    data: {
      lastSyncedAt: syncedAt,
      status: imported.length ? `Synced ${imported.length} new Gmail alert(s)` : "Synced",
      config: {
        ...(source.config && typeof source.config === "object" && !Array.isArray(source.config) ? source.config : {}),
        lastSyncTriggeredBy: triggeredBy,
        lastImportedCount: imported.length,
        lastSkippedCount: skipped.length,
      },
    },
  });

  return {
    message: `Imported ${imported.length} Gmail job alert(s).`,
    imported,
    importedCount: imported.length,
    skipped,
    skippedCount: skipped.length,
    queries: SAFE_JOB_ALERT_QUERIES,
    syncedAt,
    triggeredBy,
  };
}

router.get("/gmail/connect", requireAdmin, createGmailConnectResponse);

router.get("/gmail/auth-url", requireAdmin, createGmailConnectResponse);

router.get("/gmail/status", requireAdmin, async (_request, response) => {
  try {
    const [settings, gmailSource, importedJobCount] = await Promise.all([
      getSettings(),
      prisma.jobSource.findFirst({ where: { type: "gmail", provider: "gmail" }, orderBy: { lastSyncedAt: "desc" } }),
      prisma.jobPost.count({ where: { sourceType: "gmail" } }),
    ]);
    return response.json({
      connected: Boolean(settings.gmailRefreshToken),
      email: settings.gmailConnectedEmail || "",
      safeQueries: SAFE_JOB_ALERT_QUERIES,
      lastSyncedAt: gmailSource?.lastSyncedAt || null,
      importedJobCount,
    });
  } catch (error) {
    return response.status(500).json({ message: "Failed to load Gmail status." });
  }
});

router.get("/gmail/callback", async (request, response) => {
  try {
    const state = normalizeString(request.query.state);
    const code = normalizeString(request.query.code);
    const stateRecord = oauthStates.get(state);
    oauthStates.delete(state);

    if (!stateRecord || stateRecord.expiresAt < Date.now() || !code) {
      return response.status(400).send("Invalid or expired Gmail OAuth state.");
    }

    const oauth2Client = getGmailOAuthClient(request);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const me = await oauth2.userinfo.get();

    const existingSettings = await getSettings();
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptText(tokens.refresh_token)
      : existingSettings.gmailRefreshToken;

    if (!encryptedRefreshToken) {
      throw new Error("Google did not return a refresh token. Reconnect with consent prompt.");
    }

    await prisma.jobAgentSettings.upsert({
      where: { id: 1 },
      update: {
        gmailConnectedEmail: normalizeString(me.data.email),
        gmailRefreshToken: encryptedRefreshToken,
      },
      create: {
        id: 1,
        gmailConnectedEmail: normalizeString(me.data.email),
        gmailRefreshToken: encryptedRefreshToken,
        approvedApiSources: [],
      },
    });

    return response.redirect(`${getFrontendUrl().replace(/\/+$/, "")}/admin/job-agent?gmail=connected`);
  } catch (error) {
    console.error("Gmail OAuth callback failed:", error.message);
    return response.redirect(`${getFrontendUrl().replace(/\/+$/, "")}/admin/job-agent?gmail=failed`);
  }
});

router.post("/gmail/disconnect", requireAdmin, async (_request, response) => {
  try {
    const settings = await getSettings();
    await prisma.jobAgentSettings.update({
      where: { id: settings.id },
      data: {
        gmailConnectedEmail: "",
        gmailRefreshToken: "",
        gmailHistoryId: "",
      },
    });

    return response.json({ message: "Gmail disconnected.", connected: false });
  } catch (error) {
    console.error("Failed to disconnect Gmail:", error.message);
    return response.status(500).json({ message: "Failed to disconnect Gmail." });
  }
});

router.post("/gmail/sync", requireAdmin, async (request, response) => {
  try {
    const result = await runGmailJobAlertSync({
      request,
      maxResults: request.body?.maxResults,
      triggeredBy: "manual",
    });

    emitJobAgentUpdate(request, "GMAIL_SYNC", {
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      syncedAt: result.syncedAt,
    });

    return response.json(result);
  } catch (error) {
    console.error("Failed to sync Gmail job alerts:", error.message);
    return response.status(error.statusCode || 500).json({ message: error.message || "Failed to sync Gmail job alerts." });
  }
});

router.post("/jobs/manual", requireAdmin, async (request, response) => {
  try {
    const job = await createManualJob(request.body || {});
    return response.status(201).json({ message: "Manual job saved.", job });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to save manual job." });
  }
});

router.get("/search/preferences", requireAdmin, async (_request, response) => {
  try {
    const preference = await getSearchPreferences();
    return response.json({ preference: serializeSearchPreference(preference) });
  } catch (error) {
    return response.status(500).json({ message: "Failed to load search preferences." });
  }
});

router.put("/search/preferences", requireAdmin, async (request, response) => {
  try {
    const existing = await getSearchPreferences();
    const preference = await prisma.jobSearchPreference.update({
      where: { id: existing.id },
      data: {
        rolesJson: normalizeStringArray(request.body?.rolesJson),
        customKeywordsJson: normalizeStringArray(request.body?.customKeywordsJson),
        jobTypesJson: normalizeStringArray(request.body?.jobTypesJson),
        workModesJson: normalizeStringArray(request.body?.workModesJson),
        regionsJson: normalizeStringArray(request.body?.regionsJson),
        experienceLevelsJson: normalizeStringArray(request.body?.experienceLevelsJson),
        preferredLanguagesJson: normalizeStringArray(request.body?.preferredLanguagesJson),
        maxJobsPerSync: Math.max(1, Math.min(100, Number.parseInt(request.body?.maxJobsPerSync, 10) || 25)),
        minimumMatchScoreToDraft: Math.max(0, Math.min(100, Number.parseInt(request.body?.minimumMatchScoreToDraft, 10) || 60)),
        autoDraftEnabled: Boolean(request.body?.autoDraftEnabled),
      },
    });
    return response.json({ message: "Search preferences saved.", preference: serializeSearchPreference(preference) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to save search preferences." });
  }
});

router.get("/sources", requireAdmin, async (_request, response) => {
  try {
    let sources = await prisma.jobBoardSource.findMany({
      where: { sourceType: { not: "COMPANY_CAREER_SITE" } },
      orderBy: [{ region: "asc" }, { sourceName: "asc" }],
    });
    if (!sources.length) {
      sources = await seedDefaultJobBoardSources();
    }
    return response.json({ sources: sources.map(serializeJobBoardSource) });
  } catch (error) {
    return response.status(500).json({ message: "Failed to load job sources." });
  }
});

router.post("/sources/seed-defaults", requireAdmin, async (_request, response) => {
  try {
    const sources = await seedDefaultJobBoardSources();
    return response.json({ message: "Default job sources seeded.", sources: sources.map(serializeJobBoardSource) });
  } catch (error) {
    return response.status(500).json({ message: "Failed to seed default job sources." });
  }
});

router.put("/sources/:id", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const apiKey = normalizeString(request.body?.apiKey);
    const source = await prisma.jobBoardSource.update({
      where: { id },
      data: {
        sourceName: normalizeString(request.body?.sourceName),
        region: normalizeString(request.body?.region),
        sourceType: normalizeString(request.body?.sourceType),
        baseUrl: normalizeString(request.body?.baseUrl),
        enabled: Boolean(request.body?.enabled),
        notes: normalizeString(request.body?.notes),
        requiresApiKey: Boolean(request.body?.requiresApiKey),
        status: normalizeString(request.body?.status) || "Planned",
        ...(apiKey ? { apiKeyEncrypted: encryptText(apiKey) } : {}),
      },
    });
    return response.json({ message: "Job source saved.", source: serializeJobBoardSource(source) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to save job source." });
  }
});

router.get("/company-sources", requireAdmin, async (_request, response) => {
  try {
    const sources = await prisma.jobBoardSource.findMany({
      where: { sourceType: "COMPANY_CAREER_SITE" },
      orderBy: { updatedAt: "desc" },
    });
    return response.json({ sources: sources.map(serializeJobBoardSource) });
  } catch (error) {
    return response.status(500).json({ message: "Failed to load company career sources." });
  }
});

router.post("/company-sources", requireAdmin, async (request, response) => {
  try {
    const companyName = normalizeString(request.body?.companyName || request.body?.sourceName);
    const careersUrl = validatePublicUrl(request.body?.careersUrl).toString();
    const test = await testCompanyCareerSource({
      companyName,
      careersUrl,
      forceSourceType: normalizeString(request.body?.forceSourceType || "AUTO"),
    });
    const source = await prisma.jobBoardSource.create({
      data: {
        sourceName: companyName,
        companyName,
        region: normalizeString(request.body?.region),
        sourceType: "COMPANY_CAREER_SITE",
        baseUrl: careersUrl,
        careersUrl,
        detectedProvider: test.detectedProvider,
        extractionStatus: test.extractionStatus,
        extractionMessage: test.extractionMessage,
        selectorConfigJson: request.body?.selectorConfigJson || {},
        enabled: true,
        notes: normalizeString(request.body?.notes),
        requiresApiKey: false,
        status: test.extractionStatus,
      },
    });
    return response.status(201).json({ message: "Company career source added.", source: serializeJobBoardSource(source) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to add company career source." });
  }
});

router.put("/company-sources/:id", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const careersUrl = request.body?.careersUrl ? validatePublicUrl(request.body.careersUrl).toString() : undefined;
    const source = await prisma.jobBoardSource.update({
      where: { id },
      data: {
        sourceName: normalizeString(request.body?.companyName || request.body?.sourceName),
        companyName: normalizeString(request.body?.companyName || request.body?.sourceName),
        region: normalizeString(request.body?.region),
        ...(careersUrl ? { careersUrl, baseUrl: careersUrl } : {}),
        enabled: typeof request.body?.enabled === "boolean" ? request.body.enabled : undefined,
        notes: normalizeString(request.body?.notes),
        selectorConfigJson: request.body?.selectorConfigJson || {},
      },
    });
    return response.json({ message: "Company career source saved.", source: serializeJobBoardSource(source) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to save company career source." });
  }
});

router.delete("/company-sources/:id", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    await prisma.jobBoardSource.delete({ where: { id } });
    return response.json({ message: "Company career source deleted." });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to delete company career source." });
  }
});

router.post("/company-sources/:id/test", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const source = await prisma.jobBoardSource.findUnique({ where: { id } });
    if (!source) return response.status(404).json({ message: "Company source was not found." });
    const test = await testCompanyCareerSource({
      companyName: source.companyName,
      careersUrl: source.careersUrl || source.baseUrl,
      forceSourceType: normalizeString(request.body?.forceSourceType || "AUTO"),
    });
    const updated = await prisma.jobBoardSource.update({
      where: { id },
      data: {
        detectedProvider: test.detectedProvider,
        extractionStatus: test.extractionStatus,
        extractionMessage: test.extractionMessage,
        status: test.extractionStatus,
      },
    });
    return response.json({ message: "Company source tested.", source: serializeJobBoardSource(updated) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to test company source." });
  }
});

router.post("/company-sources/:id/import", requireAdmin, async (request, response) => {
  const id = Number.parseInt(request.params.id, 10);
  const startedAt = new Date();
  let run = null;
  try {
    const [source, preferences] = await Promise.all([
      prisma.jobBoardSource.findUnique({ where: { id } }),
      getSearchPreferences(),
    ]);
    if (!source) return response.status(404).json({ message: "Company source was not found." });
    run = await prisma.jobSourceImportRun.create({
      data: { sourceId: source.id, status: "RUNNING", startedAt, errorMessage: "" },
    });
    const result = await importCompanyCareerJobs(source, serializeSearchPreference(preferences));
    let importedCount = 0;
    let duplicateCount = 0;
    let needsDescriptionCount = 0;
    for (const job of result.jobs.slice(0, preferences.maxJobsPerSync)) {
      const duplicate = await findDuplicateBoardJob(job);
      if (duplicate) {
        duplicateCount += 1;
        continue;
      }
      const savedJob = await createImportedJob(job);
      importedCount += 1;
      if (savedJob.descriptionStatus === "DESCRIPTION_REQUIRED") needsDescriptionCount += 1;
      if (savedJob.descriptionStatus === "READY") {
        const generated = await upsertMatchAndDraft(savedJob);
        if (!preferences.autoDraftEnabled || generated.match.score < preferences.minimumMatchScoreToDraft) {
          await prisma.jobEmailDraft.deleteMany({ where: { jobPostId: savedJob.id, status: "DRAFT" } });
        }
      }
    }
    const stats = { importedCount, duplicateCount, needsDescriptionCount };
    const [updatedSource, finishedRun] = await Promise.all([
      prisma.jobBoardSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          lastImportStatsJson: stats,
          extractionStatus: result.status,
          extractionMessage: result.message,
          status: result.status,
        },
      }),
      prisma.jobSourceImportRun.update({
        where: { id: run.id },
        data: { status: "FINISHED", finishedAt: new Date(), importedCount, duplicateCount, needsDescriptionCount },
      }),
    ]);
    return response.json({ message: "Company source import finished.", source: serializeJobBoardSource(updatedSource), run: finishedRun, ...stats });
  } catch (error) {
    if (run) {
      await prisma.jobSourceImportRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: error.message },
      }).catch(() => null);
    }
    return response.status(500).json({ message: error.message || "Failed to import company source." });
  }
});

async function runApprovedJobSourcesSync({ sourceIds = [], onlyDue = false, triggeredBy = "manual" } = {}) {
  const preferences = await getSearchPreferences();
  const requestedIds = Array.isArray(sourceIds) ? sourceIds.map((id) => Number.parseInt(id, 10)).filter(Boolean) : [];
  const dueBefore = new Date(Date.now() - APPROVED_SOURCES_AUTO_SYNC_INTERVAL_MS);
  const sources = await prisma.jobBoardSource.findMany({
    where: {
      enabled: true,
      sourceType: { in: ["API", "RSS", "PUBLIC_BOARD"] },
      ...(requestedIds.length ? { id: { in: requestedIds } } : {}),
      ...(onlyDue ? { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: dueBefore } }] } : {}),
    },
  });
  const imported = [];
  const skipped = [];
  const errors = [];

  for (const source of sources) {
    try {
      let sourceImportedCount = 0;
      let sourceSkippedCount = 0;
      const jobs = await fetchJobsForSource(source, serializeSearchPreference(preferences));
      for (const job of jobs.slice(0, preferences.maxJobsPerSync)) {
        const duplicate = await findDuplicateBoardJob(job);
        if (duplicate) {
          skipped.push({ sourceId: source.id, sourceName: source.sourceName, reason: "duplicate", sourceUrl: job.sourceUrl });
          sourceSkippedCount += 1;
          continue;
        }
        const savedJob = await createImportedJob(job);
        imported.push(savedJob.id);
        sourceImportedCount += 1;
        if (savedJob.descriptionStatus === "READY") {
          const result = await upsertMatchAndDraft(savedJob);
          if (!preferences.autoDraftEnabled || result.match.score < preferences.minimumMatchScoreToDraft) {
            await prisma.jobEmailDraft.deleteMany({ where: { jobPostId: savedJob.id, status: "DRAFT" } });
          }
        }
      }
      await prisma.jobBoardSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          status: "Synced",
          lastImportStatsJson: {
            triggeredBy,
            importedCount: sourceImportedCount,
            skippedCount: sourceSkippedCount,
          },
        },
      });
    } catch (error) {
      errors.push({ sourceId: source.id, sourceName: source.sourceName, message: error.message });
      await prisma.jobBoardSource.update({ where: { id: source.id }, data: { status: "Error" } }).catch(() => null);
    }
  }

  const jobsNeedingDescription = await prisma.jobPost.count({ where: { descriptionStatus: "DESCRIPTION_REQUIRED" } });
  return {
    message: `Imported ${imported.length} job(s).`,
    imported,
    skipped,
    errors,
    importedCount: imported.length,
    skippedDuplicateCount: skipped.filter((item) => item.reason === "duplicate").length,
    jobsNeedingDescription,
    syncedSourceCount: sources.length,
    triggeredBy,
  };
}

router.post("/sources/sync", requireAdmin, async (request, response) => {
  try {
    const result = await runApprovedJobSourcesSync({
      sourceIds: request.body?.sourceIds,
      triggeredBy: "manual",
    });
    emitJobAgentUpdate(request, "APPROVED_SOURCES_SYNC", {
      importedCount: result.importedCount,
      syncedSourceCount: result.syncedSourceCount,
    });
    return response.json(result);
  } catch (error) {
    return response.status(500).json({ message: error.message || "Failed to sync job sources." });
  }
});

router.post("/jobs/manual-import", requireAdmin, async (request, response) => {
  try {
    const manualJob = buildManualJob({
      title: request.body?.title,
      company: request.body?.company,
      location: request.body?.location,
      sourceUrl: request.body?.sourceUrl,
      description: request.body?.description,
      jobType: request.body?.jobType,
      workMode: request.body?.workMode,
      region: request.body?.region,
      experienceLevel: request.body?.experienceLevel,
      sourceName: request.body?.sourceName,
    });
    if (!manualJob.title || !manualJob.company) {
      return response.status(400).json({ message: "Job title and company are required." });
    }
    const recruiterEmail = normalizeEmail(request.body?.recruiterEmail);
    if (!isUsableRecruiterEmail(recruiterEmail)) {
      return response.status(400).json({ message: "A valid HR/recruiter email is required for manual jobs." });
    }
    if (request.body?.recruiterEmailConfirmed !== true) {
      return response.status(400).json({ message: "Confirm the HR/recruiter email before importing a manual job." });
    }
    const preferences = await getSearchPreferences();
    const keywordResult = assertJobInsideSearchKeywords(manualJob, preferences);
    manualJob.searchKeywordMatched = keywordResult.matchedKeywords.slice(0, 5).join(", ");
    const duplicate = await findDuplicateBoardJob(manualJob);
    if (duplicate) {
      return response.status(409).json({ message: "Duplicate job already exists.", job: duplicate });
    }
    const job = await createImportedJob(manualJob);
    await ensureRecruiterContactForEmail(job.id, recruiterEmail, "manual", "Manually provided and confirmed by admin.");
    let match = null;
    let draft = null;
    if (job.descriptionStatus === "READY" && ["match", "draft"].includes(request.body?.nextAction)) {
      const result = await upsertMatchAndDraft(job);
      match = result.match;
      draft = result.draft;
      if (request.body?.nextAction !== "draft") {
        await prisma.jobEmailDraft.deleteMany({ where: { jobPostId: job.id, status: "DRAFT" } });
        draft = null;
      }
    }
    return response.status(201).json({ message: "Manual job imported.", job, match, draft });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to import manual job." });
  }
});

router.put("/jobs/:id/description", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const description = normalizeString(request.body?.description);

    if (!id || !description) {
      return response.status(400).json({ message: "Job id and description are required." });
    }

    const job = await prisma.jobPost.update({
      where: { id },
      data: {
        description,
        rawContent: description,
        descriptionStatus: "READY",
        status: "description_added",
      },
      include: await getJobInclude(),
    });

    return response.json({ message: "Job description saved.", job });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to save job description." });
  }
});

router.post("/jobs/:id/draft", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const job = await prisma.jobPost.findUnique({ where: { id } });

    if (!job) {
      return response.status(404).json({ message: "Job was not found." });
    }

    await upsertMatchAndDraft(job);
    const refreshed = await prisma.jobPost.findUnique({ where: { id }, include: await getJobInclude() });
    return response.json({ message: "Draft generated.", job: refreshed });
  } catch (error) {
    return response.status(500).json({ message: error.message || "Failed to generate draft." });
  }
});

router.delete("/jobs/:id", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    if (!id) {
      return response.status(400).json({ message: "Invalid job id." });
    }

    await prisma.jobPost.delete({ where: { id } });
    return response.json({ message: "Job deleted." });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to delete job." });
  }
});

router.get("/jobs/:id", requireAdmin, async (request, response) => {
  const id = Number.parseInt(request.params.id, 10);
  if (!id) {
    return response.status(400).json({ message: "Invalid job id." });
  }

  const job = await prisma.jobPost.findUnique({ where: { id }, include: await getJobInclude() });
  if (!job) {
    return response.status(404).json({ message: "Job was not found." });
  }
  return response.json({ job });
});

router.post("/jobs/:id/match", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const job = await prisma.jobPost.findUnique({ where: { id } });
    if (!job) {
      return response.status(404).json({ message: "Job was not found." });
    }

    await upsertMatchAndDraft(job);
    const refreshed = await prisma.jobPost.findUnique({ where: { id }, include: await getJobInclude() });
    return response.json({ message: "Job matched and drafts regenerated.", job: refreshed });
  } catch (error) {
    return response.status(500).json({ message: error.message || "Failed to match job." });
  }
});

router.post("/jobs/:id/contact-discovery", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const job = await prisma.jobPost.findUnique({ where: { id } });
    if (!job) {
      return response.status(404).json({ message: "Job was not found." });
    }

    const result = await discoverContactsForJob(prisma, job);
    return response.json({
      message: result.contacts.length
        ? `Found ${result.contacts.length} validated public company contact(s).`
        : result.errorMessage || "No valid public company contact found.",
      ...result,
    });
  } catch (error) {
    const id = Number.parseInt(request.params.id, 10);
    if (id) {
      await prisma.jobPost.update({
        where: { id },
        data: {
          contactDiscoveryStatus: "failed",
          contactDiscoveryError: error.message || "Contact discovery failed.",
          lastContactDiscoveryAt: new Date(),
        },
      }).catch(() => null);
    }
    return response.status(500).json({ message: error.message || "Failed to run contact discovery." });
  }
});

router.post("/contacts/:id/revalidate", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const contact = await prisma.recruiterContact.findUnique({ where: { id }, include: { jobPost: true } });
    if (!contact) {
      return response.status(404).json({ message: "Contact was not found." });
    }

    const validation = validateRecruiterEmail(contact.email, {
      companyDomain: contact.companyDomain || getUrlDomain(contact.jobPost?.companyUrl) || getUrlDomain(contact.jobPost?.applyUrl),
    });
    const updated = await prisma.recruiterContact.update({
      where: { id },
      data: {
        validationStatus: validation.accepted ? "valid" : "rejected",
        contactEmailStatus: validation.accepted ? contact.contactEmailStatus || "pending" : "rejected",
        confidenceScore: validation.confidenceScore,
        isRecruiter: validation.isRecruiter,
        isHiringManager: validation.isHiringManager,
        evidence: { ...(contact.evidence || {}), validation },
        errorMessage: validation.accepted ? "" : validation.reasons.join(", "),
        lastVerifiedAt: new Date(),
      },
    });

    return response.json({ message: "Contact revalidated.", contact: updated });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to revalidate contact." });
  }
});

router.post("/contacts/:id/approve", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const contact = await prisma.recruiterContact.findUnique({ where: { id }, include: { jobPost: true } });
    if (!contact) {
      return response.status(404).json({ message: "Contact was not found." });
    }

    if (!isUsableRecruiterEmail(contact.email)) {
      return response.status(400).json({ message: "Cannot approve no-reply, platform, or invalid recipient email." });
    }

    const updated = await prisma.recruiterContact.update({
      where: { id },
      data: {
        validationStatus: "approved",
        contactEmailStatus: "approved",
        confidenceScore: Math.max(contact.confidenceScore || 0, 85),
        verified: true,
        verification: "admin_approved",
        lastVerifiedAt: new Date(),
        errorMessage: "",
        evidence: {
          ...(contact.evidence || {}),
          adminApprovedBy: normalizeString(request.admin?.email || request.admin?.sub || "admin"),
          adminApprovedAt: new Date().toISOString(),
          note: normalizeString(request.body?.note),
        },
      },
    });

    await prisma.jobEmailDraft.updateMany({
      where: { jobPostId: updated.jobPostId, status: { in: ["DRAFT", "READY"] } },
      data: { toEmail: updated.email, recruiterContactId: updated.id, status: "READY" },
    });

    return response.json({ message: "Contact approved for sending.", contact: updated });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to approve contact." });
  }
});

router.post("/contacts/:id/reject", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const contact = await prisma.recruiterContact.update({
      where: { id },
      data: {
        validationStatus: "rejected",
        contactEmailStatus: "rejected",
        verified: false,
        errorMessage: normalizeString(request.body?.reason) || "Rejected by admin.",
        lastVerifiedAt: new Date(),
      },
    });
    await prisma.jobEmailDraft.updateMany({
      where: { recruiterContactId: id, status: { in: ["DRAFT", "READY"] } },
      data: { toEmail: "", recruiterContactId: null, status: "DRAFT" },
    });
    return response.json({ message: "Contact rejected.", contact });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to reject contact." });
  }
});

router.put("/drafts/:id", requireAdmin, async (request, response) => {
  try {
    const id = Number.parseInt(request.params.id, 10);
    const toEmail = normalizeString(request.body?.toEmail).toLowerCase();
    const recruiterContactId = Number.parseInt(request.body?.recruiterContactId, 10) || null;
    const existing = await prisma.jobEmailDraft.findUnique({ where: { id } });
    if (!existing) {
      return response.status(404).json({ message: "Draft was not found." });
    }
    const contact = toEmail
      ? await ensureRecruiterContactForEmail(existing.jobPostId, toEmail, "admin", "Manually entered by admin in draft editor.")
      : null;
    const nextCoverLetterText =
      request.body?.coverLetterText !== undefined || request.body?.coverLetter !== undefined
        ? normalizeString(request.body?.coverLetterText ?? request.body?.coverLetter)
        : existing.coverLetterText;
    const draft = await prisma.jobEmailDraft.update({
      where: { id },
      data: {
        toEmail,
        recruiterContactId: contact?.id || recruiterContactId,
        subject: normalizeString(request.body?.subject),
        body: normalizeString(request.body?.body),
        coverLetterText: nextCoverLetterText,
        approvalStatus: "PENDING",
        rejectedAt: null,
        rejectionReason: "",
        status: toEmail ? "READY" : "DRAFT",
      },
      include: { recruiterContact: true, jobPost: true },
    });

    return response.json({ message: "Draft saved.", draft: serializeDraft(draft) });
  } catch (error) {
    return response.status(400).json({ message: "Failed to save draft." });
  }
});

router.post("/drafts/collect-emails", requireAdmin, async (_request, response) => {
  try {
    const jobsNeedingContacts = await prisma.jobPost.findMany({
      where: {
        contactDiscoveryStatus: { in: ["pending", "not_found", "failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    let collectedCount = 0;
    let emailReadyCount = 0;
    const errors = [];

    for (const job of jobsNeedingContacts) {
      try {
        const result = await discoverContactsForJob(prisma, job);
        collectedCount += result.contacts.length;
      } catch (error) {
        errors.push({ jobPostId: job.id, message: error.message });
      }
    }

    const readyDrafts = await prisma.jobEmailDraft.findMany({
      where: { status: { in: ["DRAFT", "READY"] } },
      include: { jobPost: true, recruiterContact: true },
      take: 100,
    });
    for (const draft of readyDrafts) {
      const updatedDraft = await ensureDraftRecipientEmail(draft);
      if (isUsableRecruiterEmail(updatedDraft.toEmail || updatedDraft.recruiterContact?.email)) emailReadyCount += 1;
    }

    return response.json({
      message: collectedCount
        ? `Discovered ${collectedCount} public company contact(s).`
        : "No new public company contacts found.",
      collectedCount,
      emailReadyCount,
      errors,
    });
  } catch (error) {
    return response.status(500).json({ message: error.message || "Failed to collect recruiter emails." });
  }
});

router.post("/drafts/approve-all", requireAdmin, async (request, response) => {
  try {
    const foundDrafts = await prisma.jobEmailDraft.findMany({
      where: {
        status: { in: ["DRAFT", "READY"] },
        approvalStatus: { not: "APPROVED" },
      },
      orderBy: { createdAt: "desc" },
      include: { jobPost: true, recruiterContact: true },
      take: 100,
    });
    const approvableIds = [];

    for (const draft of foundDrafts) {
      const updatedDraft = await ensureDraftRecipientEmail(draft);
      if (isUsableRecruiterEmail(updatedDraft.toEmail || updatedDraft.recruiterContact?.email)) {
        approvableIds.push(updatedDraft.id);
      }
    }

    if (!approvableIds.length) {
      return response.json({ message: "No email-ready drafts found for approval.", approvedCount: 0 });
    }

    const result = await prisma.jobEmailDraft.updateMany({
      where: { id: { in: approvableIds } },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: normalizeString(request.admin?.email || request.admin?.sub || "admin"),
        rejectedAt: null,
        rejectionReason: "",
        status: "READY",
      },
    });

    return response.json({ message: `Approved ${result.count} email-ready draft(s).`, approvedCount: result.count });
  } catch (error) {
    return response.status(500).json({ message: error.message || "Failed to approve drafts." });
  }
});

router.post("/drafts/:draftId/approve", requireAdmin, async (request, response) => {
  try {
    const draftId = Number.parseInt(request.params.draftId, 10);
    if (!draftId) {
      return response.status(400).json({ message: "Invalid draft id." });
    }

    const draft = await prisma.jobEmailDraft.update({
      where: { id: draftId },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: normalizeString(request.admin?.email || request.admin?.sub || "admin"),
        rejectedAt: null,
        rejectionReason: "",
        status: "READY",
      },
      include: { jobPost: true, recruiterContact: true },
    });

    return response.json({ message: "Draft approved.", draft: serializeDraft(draft) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to approve draft." });
  }
});

router.post("/drafts/:draftId/reject", requireAdmin, async (request, response) => {
  try {
    const draftId = Number.parseInt(request.params.draftId, 10);
    if (!draftId) {
      return response.status(400).json({ message: "Invalid draft id." });
    }

    const draft = await prisma.jobEmailDraft.update({
      where: { id: draftId },
      data: {
        approvalStatus: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: normalizeString(request.body?.reason) || "Rejected by admin.",
        status: "DRAFT",
      },
      include: { jobPost: true, recruiterContact: true },
    });

    return response.json({ message: "Draft rejected.", draft: serializeDraft(draft) });
  } catch (error) {
    return response.status(400).json({ message: error.message || "Failed to reject draft." });
  }
});

router.post("/drafts/:draftId/generate-cover-letter-pdf", requireAdmin, async (request, response) => {
  try {
    const draftId = Number.parseInt(request.params.draftId, 10);
    if (!draftId) {
      return response.status(400).json({ message: "Invalid draft id." });
    }

    const draft = await prisma.jobEmailDraft.findUnique({
      where: { id: draftId },
      include: { jobPost: true },
    });

    if (!draft) {
      return response.status(404).json({ message: "Draft was not found." });
    }

    const profileContext = await buildJobAgentProfileContext();
    const updatedDraft = await maybeGenerateCoverLetterPdfForDraft(
      draft,
      draft.jobPost,
      profileContext,
      { attachCoverLetterPdf: true },
    );

    return response.json({
      message: "Cover letter PDF generated.",
      draft: serializeDraft({ ...updatedDraft, jobPost: draft.jobPost }),
    });
  } catch (error) {
    console.error("Failed to generate cover letter PDF:", error.message);
    return response.status(500).json({ message: error.message || "Failed to generate cover letter PDF." });
  }
});

router.post("/drafts/:id/approve-send", requireAdmin, async (request, response) => {
  const draftId = Number.parseInt(request.params.id, 10);
  if (!draftId) {
    return response.status(400).json({ message: "Invalid draft id." });
  }

  return sendJobEmailDraft(request, response, draftId);
});

router.post("/sources/api-placeholder", requireAdmin, async (request, response) => {
  try {
    const source = await prisma.jobSource.create({
      data: {
        name: normalizeString(request.body?.name) || "Approved public job API",
        type: "api_placeholder",
        provider: normalizeString(request.body?.provider) || "public-approved",
        status: "placeholder",
        config: {
          baseUrl: normalizeString(request.body?.baseUrl),
          notes: normalizeString(request.body?.notes) || "Placeholder only. Implement with the source provider terms and API docs.",
        },
      },
    });

    return response.status(201).json({ message: "Approved API source placeholder saved.", source });
  } catch (error) {
    return response.status(400).json({ message: "Failed to save API source placeholder." });
  }
});

async function runEmailAutoSendIfDue(io) {
  if (emailAutoSendRunning) {
    return null;
  }

  emailAutoSendRunning = true;
  try {
    const [setting, aiSettings] = await Promise.all([
      getEmailSetting(),
      getJobAgentAiSetting(prisma),
    ]);

    if (!setting.isEnabled || !setting.smtpPasswordEncrypted) {
      return {
        sentCount: 0,
        skippedCount: 0,
        message: "Email auto-send skipped because email sending is not fully configured.",
      };
    }

    validateEmailSettingForSend(setting);

    let sendsToday = await countSentToday();
    const effectiveDailySendLimit = Math.min(setting.dailySendLimit || JOB_APPLICATION_DAILY_SEND_LIMIT, JOB_APPLICATION_DAILY_SEND_LIMIT);
    const remainingToday = Math.max(0, effectiveDailySendLimit - sendsToday);
    const maxPerRun = Math.max(1, Number.parseInt(process.env.JOB_AGENT_EMAIL_AUTO_SEND_MAX_PER_RUN, 10) || 10);
    const take = Math.min(remainingToday, maxPerRun);
    if (take <= 0) {
      return { sentCount: 0, skippedCount: 0, message: "Daily job email sending limit reached." };
    }

    const drafts = await prisma.jobEmailDraft.findMany({
      where: {
        status: { in: ["DRAFT", "READY"] },
        approvalStatus: aiSettings.requireAdminApproval ? "APPROVED" : { not: "REJECTED" },
      },
      orderBy: { createdAt: "asc" },
      include: { jobPost: true, recruiterContact: true },
      take: take * 3,
    });

    let sentCount = 0;
    let skippedCount = 0;
    const errors = [];
    const recipientEmailsUsedThisRun = new Set();

    for (const draft of drafts) {
      if (sentCount >= take) break;

      const updatedDraft = await ensureDraftRecipientEmail(draft, { externalLookup: true });
      const toEmail = normalizeEmail(updatedDraft.toEmail || updatedDraft.recruiterContact?.email);
      if (!isUsableRecruiterEmail(toEmail)) {
        skippedCount += 1;
        continue;
      }

      if (recipientEmailsUsedThisRun.has(toEmail) || await hasSentJobEmailToRecipient(toEmail, updatedDraft.id)) {
        skippedCount += 1;
        continue;
      }

      if (aiSettings.requireAdminApproval && updatedDraft.approvalStatus !== "APPROVED") {
        skippedCount += 1;
        continue;
      }

      try {
        await sendDraftById(updatedDraft.id, { toEmail, triggeredBy: "auto" });
        recipientEmailsUsedThisRun.add(toEmail);
        sentCount += 1;
        sendsToday += 1;
      } catch (error) {
        if (error.statusCode === 429) {
          await markDraftSendSkipped(updatedDraft.id, null, error.message);
          break;
        }
        if (error.skipFailureMark) {
          if (error.sendSkipped) {
            await markDraftSendSkipped(updatedDraft.id, null, error.message);
          }
          skippedCount += 1;
          continue;
        }
        errors.push({ draftId: updatedDraft.id, message: error.message });
        await markDraftSendFailed(updatedDraft.id, null, error.message);
      }
    }

    if (sentCount > 0 || errors.length > 0) {
      io?.to("job-agent:admin").emit("job-agent:updated", {
        eventType: "EMAIL_AUTO_SEND",
        updatedAt: new Date().toISOString(),
        sentCount,
        skippedCount,
        errorCount: errors.length,
      });
    }

    if (sentCount > 0) {
      console.log(`Job Agent email auto-send finished: sent ${sentCount}, skipped ${skippedCount}.`);
    }

    return {
      sentCount,
      skippedCount,
      errors,
      dailySendLimit: effectiveDailySendLimit,
      sendsToday,
      message: `Auto-sent ${sentCount} email(s).`,
    };
  } catch (error) {
    console.error("Job Agent email auto-send failed:", error.message);
    return null;
  } finally {
    emailAutoSendRunning = false;
  }
}

function startJobAgentEmailAutoSend({ io } = {}) {
  if (String(process.env.JOB_AGENT_EMAIL_AUTO_SEND_DISABLED || "").trim().toLowerCase() === "true") {
    return null;
  }

  const initialTimer = setTimeout(() => {
    runEmailAutoSendIfDue(io).catch((error) => {
      console.error("Job Agent email auto-send startup check failed:", error.message);
    });
  }, 90 * 1000);

  const intervalTimer = setInterval(() => {
    runEmailAutoSendIfDue(io).catch((error) => {
      console.error("Job Agent email auto-send interval check failed:", error.message);
    });
  }, EMAIL_AUTO_SEND_INTERVAL_MS);

  return {
    stop() {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    },
  };
}

async function runGmailAutoSyncIfDue(io) {
  if (gmailAutoSyncRunning) {
    return null;
  }

  const settings = await getSettings();
  if (!settings.gmailRefreshToken) {
    return null;
  }

  const source = await ensureGmailSource();
  const lastSyncedAt = source.lastSyncedAt ? new Date(source.lastSyncedAt).getTime() : 0;
  if (lastSyncedAt && Date.now() - lastSyncedAt < GMAIL_AUTO_SYNC_INTERVAL_MS) {
    return null;
  }

  gmailAutoSyncRunning = true;
  try {
    const result = await runGmailJobAlertSync({
      maxResults: Number.parseInt(process.env.JOB_AGENT_GMAIL_AUTO_SYNC_MAX_RESULTS, 10) || 10,
      triggeredBy: "auto",
    });

    io?.to("job-agent:admin").emit("job-agent:updated", {
      eventType: "GMAIL_AUTO_SYNC",
      updatedAt: new Date().toISOString(),
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      syncedAt: result.syncedAt,
    });

    console.log(`Job Agent Gmail auto sync finished: imported ${result.importedCount}, skipped ${result.skippedCount}.`);
    await runEmailAutoSendIfDue(io);
    return result;
  } catch (error) {
    console.error("Job Agent Gmail auto sync failed:", error.message);
    return null;
  } finally {
    gmailAutoSyncRunning = false;
  }
}

function startJobAgentGmailAutoSync({ io } = {}) {
  if (String(process.env.JOB_AGENT_GMAIL_AUTO_SYNC_DISABLED || "").trim().toLowerCase() === "true") {
    return null;
  }

  const initialTimer = setTimeout(() => {
    runGmailAutoSyncIfDue(io).catch((error) => {
      console.error("Job Agent Gmail auto sync startup check failed:", error.message);
    });
  }, 30 * 1000);

  const intervalTimer = setInterval(() => {
    runGmailAutoSyncIfDue(io).catch((error) => {
      console.error("Job Agent Gmail auto sync interval check failed:", error.message);
    });
  }, GMAIL_AUTO_SYNC_INTERVAL_MS);

  return {
    stop() {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    },
  };
}

async function runApprovedSourcesAutoSyncIfDue(io) {
  if (approvedSourcesAutoSyncRunning) {
    return null;
  }

  approvedSourcesAutoSyncRunning = true;
  try {
    const result = await runApprovedJobSourcesSync({
      onlyDue: true,
      triggeredBy: "auto",
    });

    if (result.syncedSourceCount > 0) {
      io?.to("job-agent:admin").emit("job-agent:updated", {
        eventType: "APPROVED_SOURCES_AUTO_SYNC",
        updatedAt: new Date().toISOString(),
        importedCount: result.importedCount,
        syncedSourceCount: result.syncedSourceCount,
      });

      console.log(`Job Agent approved sources auto sync finished: ${result.syncedSourceCount} source(s), imported ${result.importedCount}.`);
    }

    await runEmailAutoSendIfDue(io);
    return result;
  } catch (error) {
    console.error("Job Agent approved sources auto sync failed:", error.message);
    return null;
  } finally {
    approvedSourcesAutoSyncRunning = false;
  }
}

function startJobAgentApprovedSourcesAutoSync({ io } = {}) {
  if (String(process.env.JOB_AGENT_APPROVED_SOURCES_AUTO_SYNC_DISABLED || "").trim().toLowerCase() === "true") {
    return null;
  }

  const initialTimer = setTimeout(() => {
    runApprovedSourcesAutoSyncIfDue(io).catch((error) => {
      console.error("Job Agent approved sources auto sync startup check failed:", error.message);
    });
  }, 45 * 1000);

  const intervalTimer = setInterval(() => {
    runApprovedSourcesAutoSyncIfDue(io).catch((error) => {
      console.error("Job Agent approved sources auto sync interval check failed:", error.message);
    });
  }, APPROVED_SOURCES_AUTO_SYNC_INTERVAL_MS);

  return {
    stop() {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    },
  };
}

module.exports = router;
module.exports.runGmailJobAlertSync = runGmailJobAlertSync;
module.exports.startJobAgentGmailAutoSync = startJobAgentGmailAutoSync;
module.exports.runApprovedJobSourcesSync = runApprovedJobSourcesSync;
module.exports.startJobAgentApprovedSourcesAutoSync = startJobAgentApprovedSourcesAutoSync;
module.exports.runEmailAutoSendIfDue = runEmailAutoSendIfDue;
module.exports.startJobAgentEmailAutoSend = startJobAgentEmailAutoSend;
