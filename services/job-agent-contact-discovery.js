const {
  extractEmails,
  isPlatformDomain,
  normalizeDomain,
  normalizeEmail,
  validateRecruiterEmail,
} = require("./job-agent-email-validation");

const PUBLIC_PATHS = ["", "/contact", "/about", "/careers", "/jobs"];

function normalizeString(value) {
  return String(value || "").trim();
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getUrlDomain(value) {
  try {
    const url = new URL(normalizeString(value));
    return normalizeDomain(url.hostname);
  } catch (_error) {
    return "";
  }
}

function isPublicCompanyUrl(value) {
  try {
    const url = new URL(normalizeString(value));
    return ["http:", "https:"].includes(url.protocol) && !isPlatformDomain(url.hostname);
  } catch (_error) {
    return false;
  }
}

function inferCompanyDomain(jobPost) {
  const candidates = [
    jobPost?.companyUrl,
    jobPost?.applyUrl,
    jobPost?.sourceUrl,
  ].filter(isPublicCompanyUrl);

  for (const candidate of candidates) {
    const domain = getUrlDomain(candidate);
    if (domain && !isPlatformDomain(domain)) return domain;
  }

  return "";
}

function buildCandidateUrls(jobPost, companyDomain) {
  const urls = [];
  for (const value of [jobPost?.companyUrl, jobPost?.applyUrl, jobPost?.sourceUrl]) {
    if (isPublicCompanyUrl(value)) urls.push(new URL(value).origin);
  }
  if (companyDomain) {
    urls.push(`https://${companyDomain}`);
  }

  const origins = Array.from(new Set(urls));
  return origins.flatMap((origin) => PUBLIC_PATHS.map((path) => `${origin}${path}`));
}

async function fetchPublicPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "JobAgent/1.0 public company contact discovery" },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      return null;
    }
    const text = await response.text();
    return {
      url: response.url || url,
      text: stripHtml(text).slice(0, 30000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverContactsForJob(prisma, jobPost) {
  const companyName = normalizeString(jobPost?.company);
  const companyDomain = inferCompanyDomain(jobPost);
  const evidence = {
    companyName,
    companyDomain,
    checkedUrls: [],
    rejectedCandidates: [],
  };

  await prisma.jobPost.update({
    where: { id: jobPost.id },
    data: {
      contactDiscoveryStatus: "pending",
      contactDiscoveryError: "",
      lastContactDiscoveryAt: new Date(),
    },
  });

  if (!companyDomain) {
    const errorMessage = "Company domain could not be determined from public non-platform URLs.";
    await prisma.jobPost.update({
      where: { id: jobPost.id },
      data: {
        contactDiscoveryStatus: "not_found",
        contactDiscoveryError: errorMessage,
        lastContactDiscoveryAt: new Date(),
      },
    });
    return { status: "not_found", contacts: [], evidence, errorMessage };
  }

  const existingContacts = await prisma.recruiterContact.findMany({
    where: { jobPostId: jobPost.id },
    select: { email: true },
  });
  const existingEmails = existingContacts.map((contact) => normalizeEmail(contact.email));
  const candidates = [];

  for (const url of buildCandidateUrls(jobPost, companyDomain)) {
    try {
      const page = await fetchPublicPage(url);
      evidence.checkedUrls.push({ url, ok: Boolean(page) });
      if (!page) continue;
      for (const email of extractEmails(page.text)) {
        candidates.push({ email, sourceUrl: page.url, context: page.text.slice(0, 1000) });
      }
    } catch (error) {
      evidence.checkedUrls.push({ url, ok: false, error: error.message });
    }
  }

  const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.email, candidate])).values());
  const savedContacts = [];

  for (const candidate of uniqueCandidates) {
    const validation = validateRecruiterEmail(candidate.email, {
      companyDomain,
      existingEmails: [...existingEmails, ...savedContacts.map((contact) => contact.email)],
    });

    if (!validation.accepted) {
      evidence.rejectedCandidates.push({
        email: validation.email,
        reasons: validation.reasons,
        sourceUrl: candidate.sourceUrl,
      });
      continue;
    }

    const contact = await prisma.recruiterContact.create({
      data: {
        jobPostId: jobPost.id,
        email: validation.email,
        name: "",
        companyName,
        companyDomain,
        source: "company_public_page",
        sourceUrl: candidate.sourceUrl,
        discoveryMethod: "public_company_pages",
        validationStatus: validation.validationStatus,
        contactEmailStatus: validation.contactEmailStatus,
        confidenceScore: validation.confidenceScore,
        isRecruiter: validation.isRecruiter,
        isHiringManager: validation.isHiringManager,
        evidence: {
          ...evidence,
          sourceUrl: candidate.sourceUrl,
          roleType: validation.roleType,
          sameDomain: validation.sameDomain,
        },
        lastVerifiedAt: new Date(),
        errorMessage: "",
        verification: "public_company_page",
        verified: false,
        publicContext: candidate.context,
      },
    });
    savedContacts.push(contact);
  }

  const status = savedContacts.length ? "found" : "not_found";
  const errorMessage = savedContacts.length ? "" : "No valid public company-domain contact email found.";
  await prisma.jobPost.update({
    where: { id: jobPost.id },
    data: {
      contactDiscoveryStatus: status,
      contactDiscoveryError: errorMessage,
      lastContactDiscoveryAt: new Date(),
    },
  });

  return { status, contacts: savedContacts, evidence, errorMessage };
}

module.exports = {
  discoverContactsForJob,
  getUrlDomain,
  inferCompanyDomain,
  isPublicCompanyUrl,
};
