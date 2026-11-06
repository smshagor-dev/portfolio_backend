const { fetchArbeitnowJobs } = require("./arbeitnow-source");
const { fetchRemotiveJobs } = require("./remotive-source");
const { fetchRemoteOkJobs } = require("./remoteok-source");
const { fetchGreenhouseJobs } = require("./greenhouse-source");
const { fetchLeverJobs } = require("./lever-source");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeJob(source, job) {
  const description = normalizeString(job.description);
  return {
    title: normalizeString(job.title) || "Untitled job",
    company: normalizeString(job.company) || "Unknown company",
    location: normalizeString(job.location),
    sourceUrl: normalizeString(job.sourceUrl),
    description,
    rawContent: normalizeString(job.rawContent || description),
    jobType: normalizeString(job.jobType),
    workMode: normalizeString(job.workMode),
    region: normalizeString(job.region || source.region),
    experienceLevel: normalizeString(job.experienceLevel),
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    importMethod: source.sourceType,
    descriptionStatus: description ? "READY" : "DESCRIPTION_REQUIRED",
    searchKeywordMatched: normalizeString(job.searchKeywordMatched),
  };
}

function sourceKey(source) {
  return normalizeString(source.sourceName).toLowerCase();
}

async function fetchJobsForSource(source, preferences) {
  const key = sourceKey(source);
  if (key.includes("arbeitnow")) return (await fetchArbeitnowJobs(source, preferences)).map((job) => normalizeJob(source, job));
  if (key.includes("remotive")) return (await fetchRemotiveJobs(source, preferences)).map((job) => normalizeJob(source, job));
  if (key.includes("remoteok")) return (await fetchRemoteOkJobs(source, preferences)).map((job) => normalizeJob(source, job));
  if (key.includes("greenhouse")) return (await fetchGreenhouseJobs(source, preferences)).map((job) => normalizeJob(source, job));
  if (key.includes("lever")) return (await fetchLeverJobs(source, preferences)).map((job) => normalizeJob(source, job));

  return [];
}

function defaultJobBoardSources() {
  const planned = "Planned / Manual import only. Enable only after confirming the source terms or adding an approved adapter.";
  return [
    { sourceName: "Arbeitnow", region: "Europe", sourceType: "API", baseUrl: "https://www.arbeitnow.com/api/job-board-api", enabled: false, notes: "Public API. Sync imports metadata and available descriptions.", requiresApiKey: false, status: "Ready" },
    { sourceName: "EU Remote Jobs", region: "Europe", sourceType: "RSS", baseUrl: "", enabled: false, notes: planned, requiresApiKey: false, status: "Planned" },
    { sourceName: "RemoteOK", region: "Europe", sourceType: "API", baseUrl: "https://remoteok.com/api", enabled: false, notes: "Public API. Respect source terms and rate limits.", requiresApiKey: false, status: "Ready" },
    { sourceName: "We Work Remotely", region: "Europe", sourceType: "RSS", baseUrl: "", enabled: false, notes: planned, requiresApiKey: false, status: "Planned" },
    { sourceName: "Wellfound", region: "Europe", sourceType: "MANUAL", baseUrl: "https://wellfound.com", enabled: false, notes: planned, requiresApiKey: false, status: "Manual import only" },
    { sourceName: "Greenhouse public boards", region: "Europe", sourceType: "PUBLIC_BOARD", baseUrl: "https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs", enabled: false, notes: "Requires configured public board token in base URL.", requiresApiKey: false, status: "Ready with board URL" },
    { sourceName: "Lever public boards", region: "Europe", sourceType: "PUBLIC_BOARD", baseUrl: "https://api.lever.co/v0/postings/{company}?mode=json", enabled: false, notes: "Requires configured public company slug in base URL.", requiresApiKey: false, status: "Ready with company URL" },
    { sourceName: "Reed public/search source", region: "United Kingdom", sourceType: "API", baseUrl: "https://www.reed.co.uk/developers/jobseeker", enabled: false, notes: "Requires API credentials and compliance review before implementation.", requiresApiKey: true, status: "Planned" },
    { sourceName: "CV-Library manual/import source", region: "United Kingdom", sourceType: "MANUAL", baseUrl: "https://www.cv-library.co.uk", enabled: false, notes: "Manual import only unless approved API access is configured.", requiresApiKey: false, status: "Manual import only" },
    { sourceName: "Otta / Welcome to the Jungle manual/import source", region: "United Kingdom", sourceType: "MANUAL", baseUrl: "https://www.welcometothejungle.com", enabled: false, notes: "Manual import only.", requiresApiKey: false, status: "Manual import only" },
    { sourceName: "Remotive", region: "United States", sourceType: "API", baseUrl: "https://remotive.com/api/remote-jobs", enabled: false, notes: "Public API.", requiresApiKey: false, status: "Ready" },
    { sourceName: "RemoteOK", region: "United States", sourceType: "API", baseUrl: "https://remoteok.com/api", enabled: false, notes: "Public API. Respect source terms and rate limits.", requiresApiKey: false, status: "Ready" },
    { sourceName: "We Work Remotely", region: "United States", sourceType: "RSS", baseUrl: "", enabled: false, notes: planned, requiresApiKey: false, status: "Planned" },
    { sourceName: "Wellfound", region: "United States", sourceType: "MANUAL", baseUrl: "https://wellfound.com", enabled: false, notes: planned, requiresApiKey: false, status: "Manual import only" },
    { sourceName: "Greenhouse public boards", region: "United States", sourceType: "PUBLIC_BOARD", baseUrl: "https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs", enabled: false, notes: "Requires configured public board token in base URL.", requiresApiKey: false, status: "Ready with board URL" },
    { sourceName: "Lever public boards", region: "United States", sourceType: "PUBLIC_BOARD", baseUrl: "https://api.lever.co/v0/postings/{company}?mode=json", enabled: false, notes: "Requires configured public company slug in base URL.", requiresApiKey: false, status: "Ready with company URL" },
    { sourceName: "Indeed job-alert emails only", region: "Global", sourceType: "EMAIL_ALERT", baseUrl: "", enabled: true, notes: "Use Gmail job-alert ingestion only. Do not scrape Indeed pages.", requiresApiKey: false, status: "Email alerts only" },
    { sourceName: "LinkedIn job-alert emails only", region: "Global", sourceType: "EMAIL_ALERT", baseUrl: "", enabled: true, notes: "Use Gmail job-alert ingestion only. Do not scrape LinkedIn pages.", requiresApiKey: false, status: "Email alerts only" },
    { sourceName: "Glassdoor job-alert emails only", region: "Global", sourceType: "EMAIL_ALERT", baseUrl: "", enabled: true, notes: "Use Gmail job-alert ingestion only. Do not scrape Glassdoor pages.", requiresApiKey: false, status: "Email alerts only" },
  ];
}

module.exports = {
  defaultJobBoardSources,
  fetchJobsForSource,
  normalizeJob,
};
