const PLATFORM_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "facebook.com",
  "mail.linkedin.com",
  "mail.indeed.com",
  "mail.glassdoor.com",
];

const BLOCKED_LOCAL_PARTS = [
  "noreply",
  "no-reply",
  "do-not-reply",
  "donotreply",
  "notification",
  "notifications",
  "alert",
  "alerts",
  "jobs-noreply",
  "mailer-daemon",
  "postmaster",
  "unsubscribe",
];

const STRONG_HIRING_LOCALS = [
  "recruiting",
  "recruiter",
  "talent",
  "careers",
  "jobs",
  "hr",
  "hiring",
  "people",
];

const MEDIUM_CONTACT_LOCALS = ["contact", "info", "hello", "team"];

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeDomain(value) {
  return normalizeString(value).replace(/^www\./i, "").toLowerCase();
}

function getEmailDomain(email) {
  const normalized = normalizeEmail(email);
  const [, domain = ""] = normalized.split("@");
  return normalizeDomain(domain);
}

function getEmailLocalPart(email) {
  return normalizeEmail(email).split("@")[0] || "";
}

function isValidEmailFormat(email) {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalizeEmail(email));
}

function isPlatformDomain(domain) {
  const normalized = normalizeDomain(domain);
  return PLATFORM_DOMAINS.some((platform) => normalized === platform || normalized.endsWith(`.${platform}`));
}

function isNoReplyEmail(email) {
  const local = getEmailLocalPart(email);
  const normalized = normalizeEmail(email);
  return BLOCKED_LOCAL_PARTS.some((blocked) => {
    const escaped = blocked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[._-])${escaped}([._-]|$|@)`, "i").test(local) || normalized.includes(`${blocked}@`);
  });
}

function classifyRoleEmail(email) {
  const local = getEmailLocalPart(email);
  if (STRONG_HIRING_LOCALS.some((item) => local === item || local.includes(item))) {
    return "hiring";
  }
  if (MEDIUM_CONTACT_LOCALS.some((item) => local === item || local.includes(item))) {
    return "general";
  }
  return "person_or_unknown";
}

function validateRecruiterEmail(email, options = {}) {
  const normalizedEmail = normalizeEmail(email);
  const companyDomain = normalizeDomain(options.companyDomain);
  const existingEmails = Array.isArray(options.existingEmails)
    ? options.existingEmails.map(normalizeEmail)
    : [];
  const domain = getEmailDomain(normalizedEmail);
  const reasons = [];

  if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
    reasons.push("invalid_format");
  }
  if (isNoReplyEmail(normalizedEmail)) {
    reasons.push("no_reply_or_system_email");
  }
  if (isPlatformDomain(domain)) {
    reasons.push("platform_sender_domain");
  }
  if (existingEmails.includes(normalizedEmail)) {
    reasons.push("duplicate_email");
  }

  const sameDomain = Boolean(companyDomain && domain === companyDomain);
  const roleType = classifyRoleEmail(normalizedEmail);
  let confidenceScore = 20;

  if (sameDomain) confidenceScore += 45;
  if (roleType === "hiring") confidenceScore += 30;
  if (roleType === "general") confidenceScore += 15;
  if (!sameDomain && companyDomain) confidenceScore -= 25;
  if (reasons.length) confidenceScore = Math.min(confidenceScore, 20);

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  const accepted = reasons.length === 0 && (!companyDomain || sameDomain || confidenceScore >= 55);
  return {
    email: normalizedEmail,
    accepted,
    validationStatus: accepted ? "valid" : "rejected",
    contactEmailStatus: accepted ? "approved" : "rejected",
    reasons,
    domain,
    companyDomain,
    sameDomain,
    roleType,
    confidenceScore,
    isRecruiter: roleType === "hiring",
    isHiringManager: roleType === "hiring",
  };
}

function extractEmails(value) {
  return Array.from(new Set(String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []))
    .map(normalizeEmail);
}

module.exports = {
  BLOCKED_LOCAL_PARTS,
  PLATFORM_DOMAINS,
  classifyRoleEmail,
  extractEmails,
  getEmailDomain,
  isNoReplyEmail,
  isPlatformDomain,
  isValidEmailFormat,
  normalizeDomain,
  normalizeEmail,
  validateRecruiterEmail,
};
