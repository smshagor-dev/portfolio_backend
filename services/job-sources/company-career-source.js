const COMMON_JOB_PATHS = ["/jobs/", "/careers/", "/positions/", "/openings/", "/vacancies/", "/apply/"];
const PROVIDERS = ["AUTO", "GREENHOUSE", "LEVER", "ASHBY", "WORKABLE", "SMARTRECRUITERS", "PUBLIC_HTML", "RSS", "UNSUPPORTED"];

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

function validatePublicUrl(value) {
  const url = new URL(normalizeString(value));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Careers URL must be http or https.");
  if (/linkedin\.com/i.test(url.hostname)) throw new Error("LinkedIn pages are not supported. Use Gmail job-alert ingestion only.");
  return url;
}

function detectProvider(careersUrl, contentType = "") {
  const value = normalizeString(careersUrl).toLowerCase();
  if (value.includes("greenhouse.io") || value.includes("boards.greenhouse.io")) return "GREENHOUSE";
  if (value.includes("lever.co") || value.includes("jobs.lever.co")) return "LEVER";
  if (value.includes("ashbyhq.com")) return "ASHBY";
  if (value.includes("workable.com")) return "WORKABLE";
  if (value.includes("smartrecruiters.com")) return "SMARTRECRUITERS";
  if (/(\.xml|\.rss)(?:$|\?)/i.test(value) || /rss|xml/i.test(contentType)) return "RSS";
  return "PUBLIC_HTML";
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "JobAgent/1.0 public careers import" },
      redirect: "follow",
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, contentType: response.headers.get("content-type") || "", text, finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    try {
      const href = new URL(match[1], base);
      if (href.hostname !== base.hostname) continue;
      const path = href.pathname.toLowerCase();
      if (!COMMON_JOB_PATHS.some((item) => path.includes(item))) continue;
      links.push({ url: href.toString(), title: stripHtml(match[2]) });
    } catch (_error) {
      // Ignore malformed links.
    }
  }
  return Array.from(new Map(links.map((link) => [link.url, link])).values()).slice(0, 20);
}

function detectWorkMode(text) {
  if (/remote/i.test(text)) return "Remote";
  if (/hybrid/i.test(text)) return "Hybrid";
  if (/on[-\s]?site/i.test(text)) return "On-site";
  return "";
}

function matchKeyword(text, preferences) {
  const keywords = [
    ...(preferences.rolesJson || []),
    ...(preferences.customKeywordsJson || []),
  ];
  const lowered = text.toLowerCase();
  return keywords.find((keyword) => lowered.includes(String(keyword).toLowerCase())) || "";
}

function applyPreferences(job, preferences) {
  const haystack = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
  const keyword = matchKeyword(haystack, preferences);
  const regions = preferences.regionsJson || [];
  const modes = preferences.workModesJson || [];
  if (keyword) job.searchKeywordMatched = keyword;
  if (!job.workMode) job.workMode = detectWorkMode(haystack);
  if (modes.length && job.workMode && !modes.includes(job.workMode)) return null;
  if (regions.length && job.region && !regions.includes(job.region)) return null;
  return job;
}

function normalizeJob({ title, company, location, sourceUrl, description, provider, source, preferences }) {
  const text = stripHtml(description || "");
  const job = {
    title: normalizeString(title) || "Untitled job",
    company: normalizeString(company || source.companyName || source.sourceName),
    location: normalizeString(location),
    sourceUrl: normalizeString(sourceUrl),
    description: text,
    rawContent: text,
    sourceName: source.sourceName,
    sourceType: provider,
    detectedProvider: provider,
    importMethod: "COMPANY_CAREER_SITE",
    region: source.region || "",
    workMode: detectWorkMode(`${location} ${text}`),
    jobType: "",
    experienceLevel: "",
    descriptionStatus: text ? "READY" : "DESCRIPTION_REQUIRED",
    searchKeywordMatched: "",
  };
  return applyPreferences(job, preferences) || job;
}

async function fetchGreenhouse(source, preferences) {
  const url = source.careersUrl || source.baseUrl;
  const boardMatch = url.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([^/?#]+)/i);
  const endpoint = url.includes("boards-api.greenhouse.io") ? url : boardMatch ? `https://boards-api.greenhouse.io/v1/boards/${boardMatch[1]}/jobs?content=true` : url;
  const response = await fetchText(endpoint);
  if (!response.ok) throw new Error(`Greenhouse public endpoint failed: ${response.status}`);
  const payload = JSON.parse(response.text);
  return (payload.jobs || []).map((job) => normalizeJob({
    title: job.title,
    company: payload.name || source.companyName,
    location: job.location?.name,
    sourceUrl: job.absolute_url,
    description: job.content,
    provider: "GREENHOUSE",
    source,
    preferences,
  }));
}

async function fetchLever(source, preferences) {
  const url = source.careersUrl || source.baseUrl;
  const companyMatch = url.match(/(?:jobs\.)?lever\.co\/([^/?#]+)/i);
  const endpoint = url.includes("api.lever.co") ? url : companyMatch ? `https://api.lever.co/v0/postings/${companyMatch[1]}?mode=json` : url;
  const response = await fetchText(endpoint);
  if (!response.ok) throw new Error(`Lever public endpoint failed: ${response.status}`);
  const jobs = JSON.parse(response.text);
  return (Array.isArray(jobs) ? jobs : []).map((job) => normalizeJob({
    title: job.text,
    company: source.companyName,
    location: job.categories?.location,
    sourceUrl: job.hostedUrl || job.applyUrl,
    description: job.descriptionPlain || job.description,
    provider: "LEVER",
    source,
    preferences,
  }));
}

async function fetchPublicHtml(source, preferences) {
  const response = await fetchText(source.careersUrl || source.baseUrl);
  if (!response.ok) return [];
  const links = extractLinks(response.text, response.finalUrl);
  const jobs = [];
  for (const link of links.slice(0, 10)) {
    const detail = await fetchText(link.url).catch(() => null);
    const description = detail?.ok ? stripHtml(detail.text).slice(0, 8000) : "";
    jobs.push(normalizeJob({
      title: link.title || source.companyName,
      company: source.companyName,
      location: "",
      sourceUrl: link.url,
      description,
      provider: "PUBLIC_HTML",
      source,
      preferences,
    }));
  }
  return jobs;
}

async function testCompanyCareerSource(input) {
  const url = validatePublicUrl(input.careersUrl || input.baseUrl);
  const forced = PROVIDERS.includes(input.forceSourceType) && input.forceSourceType !== "AUTO" ? input.forceSourceType : "";
  const head = await fetchText(url.toString()).catch((error) => ({ ok: false, status: 0, contentType: "", text: "", error: error.message }));
  const detectedProvider = forced || detectProvider(url.toString(), head.contentType);
  const extractionStatus = head.ok || ["GREENHOUSE", "LEVER"].includes(detectedProvider) ? "READY" : "FAILED";
  return {
    detectedProvider,
    extractionStatus,
    extractionMessage: head.ok
      ? `Detected ${detectedProvider}. Public source can be tested/imported safely.`
      : `Could not fetch public careers page: ${head.error || head.status}`,
  };
}

async function importCompanyCareerJobs(source, preferences) {
  const detectedProvider = source.detectedProvider || detectProvider(source.careersUrl || source.baseUrl);
  if (["ASHBY", "WORKABLE", "SMARTRECRUITERS", "RSS"].includes(detectedProvider)) {
    return { jobs: [], status: "UNSUPPORTED", message: `${detectedProvider} adapter is planned. Manual fallback available.` };
  }
  if (detectedProvider === "GREENHOUSE") return { jobs: await fetchGreenhouse(source, preferences), status: "READY", message: "Greenhouse public jobs imported." };
  if (detectedProvider === "LEVER") return { jobs: await fetchLever(source, preferences), status: "READY", message: "Lever public jobs imported." };
  if (detectedProvider === "PUBLIC_HTML") {
    const jobs = await fetchPublicHtml(source, preferences).catch(() => []);
    return {
      jobs,
      status: jobs.length ? "NEEDS_MANUAL_DESCRIPTION" : "UNSUPPORTED",
      message: jobs.length ? "Public HTML job links imported where visible." : "No public job links found with safe static extraction.",
    };
  }
  return { jobs: [], status: "UNSUPPORTED", message: "Unsupported source type." };
}

module.exports = {
  detectProvider,
  importCompanyCareerJobs,
  testCompanyCareerSource,
  validatePublicUrl,
};
