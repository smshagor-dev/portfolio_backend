const prisma = require("./prisma");
const { normalizeString, slugify } = require("./research-publications");

const DEFAULT_ORCID_ID = "0009-0003-7730-3202";
const DEFAULT_RESEARCH_IMAGE = "/api/research-publications/default-thumbnail.svg";
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15_000;

let runningSync = null;
let backgroundTimer = null;
let initialTimer = null;

const runtimeState = {
  enabled: true,
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastSuccessAt: null,
  lastError: "",
  lastResult: null,
};

function parseBoolean(value, fallback = true) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function getResearchSyncConfig() {
  const hours = Number.parseFloat(process.env.RESEARCH_SYNC_INTERVAL_HOURS || "12");
  const intervalMs = Number.isFinite(hours) && hours > 0
    ? Math.max(60_000, Math.round(hours * 60 * 60 * 1000))
    : DEFAULT_INTERVAL_MS;

  return {
    enabled: parseBoolean(process.env.RESEARCH_SYNC_ENABLED, true),
    orcidId: normalizeString(process.env.RESEARCH_ORCID_ID) || DEFAULT_ORCID_ID,
    intervalMs,
    initialDelayMs: Math.max(
      0,
      Number.parseInt(process.env.RESEARCH_SYNC_INITIAL_DELAY_MS || "3000", 10) || 0,
    ),
    timeoutMs: Math.max(
      3_000,
      Number.parseInt(process.env.RESEARCH_SYNC_HTTP_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS,
    ),
    crossrefMailto: normalizeString(process.env.CROSSREF_MAILTO || process.env.SMTP_FROM_EMAIL),
  };
}

function normalizeDoi(value) {
  return normalizeString(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
}

function normalizeTitleKey(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(value) {
  return normalizeString(value)
    .replace(/<\/?jats:[^>]+>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength = 480) {
  const normalized = normalizeString(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function readOrcidValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return normalizeString(value);
  }
  if (typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
    return normalizeString(value.value);
  }
  return "";
}

function orcidPublicationDateToDate(publicationDate) {
  const year = Number.parseInt(readOrcidValue(publicationDate?.year), 10);
  if (!Number.isFinite(year) || year < 1000) {
    return null;
  }
  const month = Math.min(12, Math.max(1, Number.parseInt(readOrcidValue(publicationDate?.month), 10) || 1));
  const day = Math.min(28, Math.max(1, Number.parseInt(readOrcidValue(publicationDate?.day), 10) || 1));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function crossrefDateToDate(message) {
  const candidates = [
    message?.["published-print"],
    message?.["published-online"],
    message?.published,
    message?.issued,
    message?.created,
  ];

  for (const candidate of candidates) {
    if (candidate?.["date-time"]) {
      const parsed = new Date(candidate["date-time"]);
      if (Number.isFinite(parsed.getTime())) {
        return parsed;
      }
    }

    const parts = candidate?.["date-parts"]?.[0];
    if (Array.isArray(parts) && parts.length > 0) {
      const [year, month = 1, day = 1] = parts.map((item) => Number.parseInt(item, 10));
      if (Number.isFinite(year)) {
        const parsed = new Date(Date.UTC(year, Math.max(1, month) - 1, Math.max(1, day)));
        if (Number.isFinite(parsed.getTime())) {
          return parsed;
        }
      }
    }
  }

  return null;
}

function normalizeOrcidExternalIds(work) {
  return (work?.["external-ids"]?.["external-id"] || [])
    .map((item) => ({
      type: normalizeString(item?.["external-id-type"]).toLowerCase(),
      value: normalizeString(item?.["external-id-value"]),
      url: readOrcidValue(item?.["external-id-url"]),
      relationship: normalizeString(item?.["external-id-relationship"]).toLowerCase(),
    }))
    .filter((item) => item.type && item.value);
}

function getExternalId(externalIds, type) {
  const normalizedType = normalizeString(type).toLowerCase();
  return normalizeString(externalIds.find((item) => item.type === normalizedType)?.value);
}

function normalizeCrossrefAuthors(message) {
  return (message?.author || [])
    .map((author) => {
      const name = [author?.given, author?.family]
        .map((item) => normalizeString(item))
        .filter(Boolean)
        .join(" ");
      return {
        name,
        sequence: normalizeString(author?.sequence),
        orcid: normalizeString(author?.ORCID),
        affiliation: (author?.affiliation || [])
          .map((item) => normalizeString(item?.name))
          .filter(Boolean),
      };
    })
    .filter((item) => item.name);
}

function normalizeOrcidContributors(work) {
  return (work?.contributors?.contributor || [])
    .map((contributor) => ({
      name: readOrcidValue(contributor?.["credit-name"]),
      role: normalizeString(contributor?.["contributor-attributes"]?.["contributor-role"]),
      sequence: normalizeString(contributor?.["contributor-attributes"]?.["contributor-sequence"]),
    }))
    .filter((item) => item.name);
}

function getAuthorAliases() {
  const configured = normalizeString(process.env.RESEARCH_AUTHOR_NAMES);
  const names = configured
    ? configured.split("|")
    : [
        "Md Shahanur Islam Shagor",
        "Shahanur Islam Shagor",
        "Md. Shahanur Islam Shagor",
        "M Shahanur Islam Shagor",
      ];

  return names
    .map((name) => normalizeTitleKey(name))
    .filter(Boolean);
}

function determineMyAuthorRole(authors) {
  const aliases = getAuthorAliases();
  const index = authors.findIndex((author) => {
    const key = normalizeTitleKey(typeof author === "string" ? author : author?.name);
    return key && aliases.some((alias) => key === alias || key.includes(alias) || alias.includes(key));
  });

  if (index === 0) {
    return "First Author";
  }
  if (index > 0) {
    return "Co-author";
  }
  return "Author";
}

function mapPublicationType(orcidType, crossrefType) {
  const raw = normalizeString(orcidType || crossrefType).toLowerCase();
  const map = {
    "journal-article": "Journal Article",
    "journal article": "Journal Article",
    article: "Journal Article",
    "conference-paper": "Conference Paper",
    "conference-abstract": "Conference Paper",
    proceedings: "Conference Paper",
    "proceedings-article": "Conference Paper",
    "book-chapter": "Book Chapter",
    "book chapter": "Book Chapter",
    book: "Book",
    dissertation: "Thesis / Dissertation",
    thesis: "Thesis / Dissertation",
    "posted-content": "Preprint",
    preprint: "Preprint",
    report: "Research Report",
    dataset: "Dataset",
    software: "Software / Research Artifact",
    other: "Research Publication",
  };

  if (map[raw]) {
    return map[raw];
  }
  if (raw.includes("journal")) {
    return "Journal Article";
  }
  if (raw.includes("conference") || raw.includes("proceeding")) {
    return "Conference Paper";
  }
  if (raw.includes("preprint") || raw.includes("posted")) {
    return "Preprint";
  }
  return raw
    ? raw.split(/[-_ ]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ")
    : "Research Publication";
}

function classifyResearchArea({ title, abstractText, subjects = [] }) {
  const haystack = `${title || ""} ${abstractText || ""} ${(subjects || []).join(" ")}`.toLowerCase();

  if (/federated|byzantine|distributed learning|zero[- ]trust|differential privacy|model poisoning/.test(haystack)) {
    return "Federated Learning & Trustworthy AI";
  }
  if (/v2x|vehicular|vehicle|smart mobility|transportation|automotive/.test(haystack)) {
    return "Intelligent Transportation & V2X";
  }
  if (/uav|drone|swarm|gps[- ]denied|autonomous|robot|navigation|vio|uwb|lidar|localization/.test(haystack)) {
    return "Autonomous Systems & Robotics";
  }
  if (/cyber|security|secure|trust|firmware|anti[- ]rollback|resilien|attack|authentication|authorization/.test(haystack)) {
    return "Cybersecurity & Resilient Systems";
  }
  if (/computer vision|vision|image|yolo|object detection|assistive|edge ai|multimodal/.test(haystack)) {
    return "Computer Vision & Edge AI";
  }
  if (/artificial intelligence|machine learning|deep learning|neural|agentic|large language|llm/.test(haystack)) {
    return "Artificial Intelligence & Machine Learning";
  }
  return "Computer Science & Engineering";
}

function buildPublicationContent(metadata) {
  const lines = [];

  if (metadata.abstractText) {
    lines.push("Abstract", metadata.abstractText);
  }

  lines.push("Publication Details");
  const details = [
    ["Title", metadata.title],
    ["Type", metadata.publicationType],
    ["Research area", metadata.researchArea],
    ["Journal / venue", metadata.journalName],
    ["Publisher", metadata.publisherName],
    ["Published", metadata.publishedDate?.toISOString()?.slice(0, 10)],
    ["Volume", metadata.volume],
    ["Issue", metadata.issue],
    ["Pages / article number", metadata.pages],
    ["Language", metadata.language],
    ["DOI", metadata.doi],
    ["ORCID work ID", metadata.putCode ? String(metadata.putCode) : ""],
    ["ORCID record", metadata.orcidUrl],
  ];

  for (const [label, value] of details) {
    if (normalizeString(value)) {
      lines.push(`${label}: ${normalizeString(value)}`);
    }
  }

  if (metadata.authors.length > 0) {
    lines.push("Authors", metadata.authors.join(", "));
  }

  if (metadata.subjects.length > 0) {
    lines.push("Subjects", metadata.subjects.join(", "));
  }

  if (metadata.issn.length > 0) {
    lines.push(`ISSN: ${metadata.issn.join(", ")}`);
  }

  if (metadata.isbn.length > 0) {
    lines.push(`ISBN: ${metadata.isbn.join(", ")}`);
  }

  if (metadata.externalIds.length > 0) {
    lines.push(
      "External Identifiers",
      ...metadata.externalIds.map((item) => `${item.type.toUpperCase()}: ${item.value}${item.url ? ` (${item.url})` : ""}`),
    );
  }

  if (metadata.citationText) {
    lines.push("Citation", metadata.citationText);
  }

  if (Number.isFinite(metadata.referenceCount)) {
    lines.push(`Crossref reference count: ${metadata.referenceCount}`);
  }
  if (Number.isFinite(metadata.citationCount)) {
    lines.push(`Crossref citation count: ${metadata.citationCount}`);
  }

  lines.push("Metadata sources: ORCID public record and Crossref DOI metadata when available.");
  return lines.filter(Boolean).join("\n\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, { timeoutMs, headers = {}, retries = 2 } = {}) {
  const effectiveTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "smshagor-portfolio-research-sync/1.0",
          ...headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable = error?.name === "AbortError" || error?.status === 429 || error?.status >= 500;
      if (!retryable || attempt >= retries) {
        throw error;
      }
      await sleep(350 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Failed to fetch JSON.");
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

async function fetchOrcidWorks(orcidId, timeoutMs) {
  const worksUrl = `https://pub.orcid.org/v3.0/${encodeURIComponent(orcidId)}/works`;
  const summary = await fetchJson(worksUrl, { timeoutMs });
  const putCodes = [];

  for (const group of summary?.group || []) {
    const summaries = group?.["work-summary"] || [];
    for (const item of summaries) {
      const putCode = Number.parseInt(item?.["put-code"], 10);
      if (Number.isFinite(putCode)) {
        putCodes.push(putCode);
      }
    }
  }

  const uniquePutCodes = Array.from(new Set(putCodes));
  return mapWithConcurrency(uniquePutCodes, 4, async (putCode) => {
    const url = `https://pub.orcid.org/v3.0/${encodeURIComponent(orcidId)}/work/${putCode}`;
    return fetchJson(url, { timeoutMs });
  });
}

async function fetchCrossrefWork(doi, config) {
  if (!doi) {
    return null;
  }

  const query = config.crossrefMailto
    ? `?mailto=${encodeURIComponent(config.crossrefMailto)}`
    : "";
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${query}`;

  try {
    const payload = await fetchJson(url, { timeoutMs: config.timeoutMs, retries: 1 });
    return payload?.message || null;
  } catch (error) {
    console.warn(`Crossref metadata unavailable for ${doi}: ${error.message}`);
    return null;
  }
}

function normalizeWorkMetadata(work, crossref, orcidId) {
  const externalIds = normalizeOrcidExternalIds(work);
  const doi = normalizeDoi(getExternalId(externalIds, "doi") || crossref?.DOI);
  const orcidTitle = readOrcidValue(work?.title?.title);
  const crossrefTitle = normalizeString(crossref?.title?.[0]);
  const title = orcidTitle || crossrefTitle || "Untitled research publication";
  const abstractText = htmlToText(crossref?.abstract || work?.["short-description"] || "");
  const crossrefAuthors = normalizeCrossrefAuthors(crossref);
  const orcidContributors = normalizeOrcidContributors(work);
  const authors = (crossrefAuthors.length > 0 ? crossrefAuthors : orcidContributors)
    .map((item) => item.name)
    .filter(Boolean);
  const safeAuthors = authors.length > 0 ? authors : ["Md Shahanur Islam Shagor"];
  const subjects = (crossref?.subject || []).map((item) => normalizeString(item)).filter(Boolean);
  const journalName = readOrcidValue(work?.["journal-title"]) || normalizeString(crossref?.["container-title"]?.[0]);
  const publisherName = normalizeString(crossref?.publisher) || journalName || "Research Publication";
  const publishedDate =
    crossrefDateToDate(crossref) ||
    orcidPublicationDateToDate(work?.["publication-date"]) ||
    (() => {
      const created = Number.parseInt(readOrcidValue(work?.["created-date"]), 10);
      const parsed = new Date(created);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    })() ||
    new Date();
  const publicationType = mapPublicationType(work?.type, crossref?.type);
  const researchArea = classifyResearchArea({ title, abstractText, subjects });
  const putCode = Number.parseInt(work?.["put-code"], 10) || null;
  const orcidUrl = `https://orcid.org/${orcidId}`;
  const doiUrl = doi ? `https://doi.org/${doi}` : "";
  const publicationUrl = doiUrl || readOrcidValue(work?.url) || normalizeString(crossref?.URL) || orcidUrl;
  const citationText = normalizeString(work?.citation?.["citation-value"]);
  const issn = Array.from(new Set((crossref?.ISSN || []).map((item) => normalizeString(item)).filter(Boolean)));
  const isbn = Array.from(new Set((crossref?.ISBN || []).map((item) => normalizeString(item)).filter(Boolean)));
  const volume = normalizeString(crossref?.volume);
  const issue = normalizeString(crossref?.issue);
  const pages = normalizeString(crossref?.page || crossref?.["article-number"]);
  const language = normalizeString(crossref?.language || work?.["language-code"]);
  const referenceCount = Number.isFinite(Number(crossref?.["reference-count"]))
    ? Number(crossref["reference-count"])
    : null;
  const citationCount = Number.isFinite(Number(crossref?.["is-referenced-by-count"]))
    ? Number(crossref["is-referenced-by-count"])
    : null;

  const metadata = {
    title,
    abstractText,
    authors: safeAuthors,
    subjects,
    journalName,
    publisherName,
    publishedDate,
    publicationType,
    researchArea,
    putCode,
    orcidUrl,
    doi,
    doiUrl,
    publicationUrl,
    citationText,
    externalIds,
    issn,
    isbn,
    volume,
    issue,
    pages,
    language,
    referenceCount,
    citationCount,
  };

  return {
    ...metadata,
    shortSummary: truncate(
      abstractText ||
      readOrcidValue(work?.["short-description"]) ||
      `${title}. ${journalName || publisherName}.`,
      480,
    ),
    content: buildPublicationContent(metadata),
    myAuthorRole: determineMyAuthorRole(safeAuthors),
  };
}

function buildUniqueSlug(title, putCode, occupiedSlugs, preferredSlug = "") {
  if (preferredSlug) {
    occupiedSlugs.add(preferredSlug);
    return preferredSlug;
  }

  const base = slugify(title) || `research-publication-${putCode || Date.now()}`;
  let candidate = base;
  if (occupiedSlugs.has(candidate)) {
    candidate = `${base}-orcid-${putCode || "work"}`;
  }
  let suffix = 2;
  while (occupiedSlugs.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  occupiedSlugs.add(candidate);
  return candidate;
}

async function runResearchSync({ reason = "background" } = {}) {
  const config = getResearchSyncConfig();
  runtimeState.enabled = config.enabled;
  runtimeState.intervalMs = config.intervalMs;

  if (!config.enabled) {
    const result = { skipped: true, reason: "disabled", orcidId: config.orcidId };
    runtimeState.lastResult = result;
    return result;
  }

  runtimeState.running = true;
  runtimeState.lastStartedAt = new Date().toISOString();
  runtimeState.lastError = "";

  const works = await fetchOrcidWorks(config.orcidId, config.timeoutMs);
  const prepared = await mapWithConcurrency(works, 3, async (work) => {
    const externalIds = normalizeOrcidExternalIds(work);
    const doi = normalizeDoi(getExternalId(externalIds, "doi"));
    const crossref = await fetchCrossrefWork(doi, config);
    return normalizeWorkMetadata(work, crossref, config.orcidId);
  });

  const existing = await prisma.researchPublication.findMany();
  const byDoi = new Map();
  const byTitle = new Map();
  const occupiedSlugs = new Set();

  for (const publication of existing) {
    const doiKey = normalizeDoi(publication.doi);
    const titleKey = normalizeTitleKey(publication.title);
    if (doiKey && !byDoi.has(doiKey)) {
      byDoi.set(doiKey, publication);
    }
    if (titleKey && !byTitle.has(titleKey)) {
      byTitle.set(titleKey, publication);
    }
    if (publication.slug) {
      occupiedSlugs.add(publication.slug);
    }
  }

  const result = {
    reason,
    orcidId: config.orcidId,
    fetched: prepared.length,
    created: 0,
    updated: 0,
    failed: 0,
    failures: [],
    syncedAt: new Date().toISOString(),
  };

  for (const metadata of prepared) {
    try {
      const existingPublication =
        (metadata.doi && byDoi.get(metadata.doi)) ||
        byTitle.get(normalizeTitleKey(metadata.title)) ||
        null;

      const slug = buildUniqueSlug(
        metadata.title,
        metadata.putCode,
        occupiedSlugs,
        existingPublication?.slug || "",
      );

      const data = {
        title: metadata.title,
        slug,
        shortSummary: metadata.shortSummary,
        content: metadata.content,
        publicationType: metadata.publicationType,
        researchArea: metadata.researchArea,
        publisherName: metadata.publisherName,
        publishedDate: metadata.publishedDate,
        doi: metadata.doi || null,
        publicationUrl: metadata.publicationUrl,
        citationUrl: metadata.doiUrl || metadata.publicationUrl,
        authors: metadata.authors,
        myAuthorRole: metadata.myAuthorRole,
        thumbnailImage: existingPublication?.thumbnailImage || DEFAULT_RESEARCH_IMAGE,
        status: "published",
      };

      let saved;
      if (existingPublication) {
        saved = await prisma.researchPublication.update({
          where: { id: existingPublication.id },
          data,
        });
        result.updated += 1;
      } else {
        saved = await prisma.researchPublication.create({
          data: {
            ...data,
            isFeatured: false,
          },
        });
        result.created += 1;
      }

      if (metadata.doi) {
        byDoi.set(metadata.doi, saved);
      }
      byTitle.set(normalizeTitleKey(metadata.title), saved);
    } catch (error) {
      result.failed += 1;
      result.failures.push({ title: metadata.title, message: error.message });
    }
  }

  runtimeState.lastSuccessAt = new Date().toISOString();
  runtimeState.lastResult = result;
  return result;
}

function syncResearchPublications(options = {}) {
  if (runningSync) {
    return runningSync;
  }

  runningSync = runResearchSync(options)
    .catch((error) => {
      runtimeState.lastError = error.message;
      throw error;
    })
    .finally(() => {
      runtimeState.running = false;
      runtimeState.lastFinishedAt = new Date().toISOString();
      runningSync = null;
    });

  return runningSync;
}

function getResearchSyncRuntimeState() {
  const config = getResearchSyncConfig();
  const lastAnchor = runtimeState.lastFinishedAt || runtimeState.lastStartedAt;
  const nextSyncAt = lastAnchor
    ? new Date(new Date(lastAnchor).getTime() + config.intervalMs).toISOString()
    : null;

  return {
    ...runtimeState,
    enabled: config.enabled,
    orcidId: config.orcidId,
    intervalMs: config.intervalMs,
    intervalHours: config.intervalMs / 60 / 60 / 1000,
    nextSyncAt,
  };
}

function startResearchAutoSync() {
  const config = getResearchSyncConfig();
  runtimeState.enabled = config.enabled;
  runtimeState.intervalMs = config.intervalMs;

  if (!config.enabled || backgroundTimer) {
    return getResearchSyncRuntimeState();
  }

  const execute = () => {
    syncResearchPublications({ reason: "12-hour-background" }).catch((error) => {
      console.error("Research auto sync failed:", error.message);
    });
  };

  initialTimer = setTimeout(execute, config.initialDelayMs);
  if (typeof initialTimer.unref === "function") {
    initialTimer.unref();
  }

  backgroundTimer = setInterval(execute, config.intervalMs);
  if (typeof backgroundTimer.unref === "function") {
    backgroundTimer.unref();
  }

  return getResearchSyncRuntimeState();
}

function stopResearchAutoSync() {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
  }
}

module.exports = {
  DEFAULT_RESEARCH_IMAGE,
  classifyResearchArea,
  getResearchSyncRuntimeState,
  mapPublicationType,
  normalizeDoi,
  normalizeWorkMetadata,
  startResearchAutoSync,
  stopResearchAutoSync,
  syncResearchPublications,
};
