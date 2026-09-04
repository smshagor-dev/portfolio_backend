const prisma = require("../lib/prisma");

const DEFAULT_ORCID_ID = "0009-0003-7730-3202";
const DEFAULT_AUTHOR_NAME = "Md Shahanur Islam Shagor";
const DEFAULT_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const ORCID_API_BASE = "https://pub.orcid.org/v3.0";
const CROSSREF_API_BASE = "https://api.crossref.org/works";

let syncInFlight = null;
let backgroundTimer = null;
let lastSyncResult = null;

function normalizeString(value) {
  return String(value || "").trim();
}

function stripHtml(value) {
  return normalizeString(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function normalizeDoi(value) {
  return normalizeString(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

function getExternalId(summary = {}) {
  const ids = Array.isArray(summary["external-ids"]?.["external-id"])
    ? summary["external-ids"]["external-id"]
    : [];

  const doi = ids.find((item) => normalizeString(item?.["external-id-type"]).toLowerCase() === "doi");
  const doiValue = normalizeDoi(doi?.["external-id-value"]);
  if (doiValue) {
    return { type: "doi", value: doiValue };
  }

  return {
    type: "orcid",
    value: normalizeString(summary?.["put-code"] || summary?.putCode),
  };
}

function toDate(parts) {
  const year = Number.parseInt(parts?.year?.value || parts?.year, 10);
  const month = Number.parseInt(parts?.month?.value || parts?.month || 1, 10);
  const day = Number.parseInt(parts?.day?.value || parts?.day || 1, 10);
  if (!year) {
    return null;
  }

  const date = new Date(Date.UTC(year, Math.max(0, month - 1), Math.max(1, day)));
  return Number.isFinite(date.getTime()) ? date : null;
}

function publicationTypeLabel(value) {
  const raw = normalizeString(value).toLowerCase();
  const labels = {
    "journal-article": "Journal Article",
    "conference-paper": "Conference Paper",
    "book-chapter": "Book Chapter",
    book: "Book",
    "preprint": "Preprint",
    "report": "Report",
    "dissertation-thesis": "Dissertation / Thesis",
    "working-paper": "Working Paper",
  };
  return labels[raw] || raw.split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") || "Research Publication";
}

function firstText(value) {
  if (Array.isArray(value)) {
    return firstText(value[0]);
  }
  return normalizeString(value);
}

function buildAuthorName(author = {}) {
  const literal = normalizeString(author?.name || author?.literal);
  if (literal) {
    return literal;
  }

  return [normalizeString(author?.given), normalizeString(author?.family)].filter(Boolean).join(" ").trim();
}

function getAuthorRole(authors, configuredAuthorName) {
  if (!Array.isArray(authors) || authors.length === 0) {
    return "Author";
  }

  const needle = normalizeString(configuredAuthorName).toLowerCase();
  const index = authors.findIndex((name) => normalizeString(name).toLowerCase() === needle);
  if (index === 0) {
    return "First Author";
  }
  if (index > 0) {
    return "Co-author";
  }
  return "Author";
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "smshagor-portfolio-research-sync/1.0 (https://smshagor.com)",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOrcidWorks(orcidId) {
  const payload = await fetchJson(`${ORCID_API_BASE}/${encodeURIComponent(orcidId)}/works`);
  const groups = Array.isArray(payload?.group) ? payload.group : [];
  return groups
    .map((group) => {
      const summaries = Array.isArray(group?.["work-summary"]) ? group["work-summary"] : [];
      return summaries[0] || null;
    })
    .filter(Boolean);
}

async function fetchOrcidWork(orcidId, putCode) {
  if (!putCode) {
    return null;
  }
  return fetchJson(`${ORCID_API_BASE}/${encodeURIComponent(orcidId)}/work/${encodeURIComponent(putCode)}`);
}

async function fetchCrossrefWork(doi) {
  if (!doi) {
    return null;
  }
  try {
    const payload = await fetchJson(`${CROSSREF_API_BASE}/${encodeURIComponent(doi)}`);
    return payload?.message || null;
  } catch (error) {
    console.warn(`Crossref enrichment skipped for ${doi}:`, error.message);
    return null;
  }
}

function getOrcidUrl(work) {
  const url = normalizeString(work?.url?.value);
  if (url) {
    return url;
  }

  const externalIds = Array.isArray(work?.["external-ids"]?.["external-id"])
    ? work["external-ids"]["external-id"]
    : [];
  const preferred = externalIds.find((item) => normalizeString(item?.["external-id-url"]?.value));
  return normalizeString(preferred?.["external-id-url"]?.value);
}

function mapPublication({ summary, work, crossref, configuredAuthorName }) {
  const externalId = getExternalId(summary);
  const doi = externalId.type === "doi" ? externalId.value : normalizeDoi(
    (Array.isArray(work?.["external-ids"]?.["external-id"])
      ? work["external-ids"]["external-id"]
      : []).find((item) => normalizeString(item?.["external-id-type"]).toLowerCase() === "doi")?.["external-id-value"],
  );

  const title = firstText(crossref?.title) || normalizeString(work?.title?.title?.value) || normalizeString(summary?.title?.title?.value);
  if (!title) {
    return null;
  }

  const crossrefAuthors = Array.isArray(crossref?.author)
    ? crossref.author.map(buildAuthorName).filter(Boolean)
    : [];
  const contributors = Array.isArray(work?.contributors?.contributor)
    ? work.contributors.contributor
        .map((item) => normalizeString(item?.["credit-name"]?.value))
        .filter(Boolean)
    : [];
  const authors = crossrefAuthors.length ? crossrefAuthors : contributors;

  const publishedDate =
    toDate(crossref?.published?.["date-parts"]?.[0] ? {
      year: crossref.published["date-parts"][0][0],
      month: crossref.published["date-parts"][0][1],
      day: crossref.published["date-parts"][0][2],
    } : null) ||
    toDate(work?.["publication-date"]) ||
    toDate(summary?.["publication-date"]) ||
    new Date();

  const publisherName =
    normalizeString(crossref?.publisher) ||
    normalizeString(work?.["journal-title"]?.value) ||
    normalizeString(summary?.["journal-title"]?.value) ||
    "Independent Research";

  const subject = Array.isArray(crossref?.subject) ? crossref.subject.map(normalizeString).filter(Boolean) : [];
  const abstract = stripHtml(crossref?.abstract);
  const shortSummary = abstract
    ? abstract.slice(0, 500)
    : `Research publication by ${configuredAuthorName}, published by ${publisherName}.`;
  const publicationUrl =
    normalizeString(crossref?.URL) ||
    getOrcidUrl(work) ||
    (doi ? `https://doi.org/${doi}` : `https://orcid.org/${process.env.RESEARCH_ORCID_ID || DEFAULT_ORCID_ID}`);

  const baseSlug = slugify(title) || `research-${externalId.value || Date.now()}`;

  return {
    title,
    slug: baseSlug,
    shortSummary,
    content: abstract,
    publicationType: publicationTypeLabel(crossref?.type || work?.type || summary?.type),
    researchArea: subject[0] || "Research",
    publisherName,
    publishedDate,
    doi: doi || "",
    publicationUrl,
    citationUrl: doi ? `https://doi.org/${doi}` : publicationUrl,
    authors,
    myAuthorRole: getAuthorRole(authors, configuredAuthorName),
    thumbnailImage: "",
    status: "published",
    isFeatured: false,
  };
}

async function nextNumericId() {
  const latest = await prisma.researchPublication.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return (latest?.id || 0) + 1;
}

async function findExistingPublication(mapped) {
  if (mapped.doi) {
    const byDoi = await prisma.researchPublication.findFirst({ where: { doi: mapped.doi } });
    if (byDoi) {
      return byDoi;
    }
  }

  return prisma.researchPublication.findUnique({ where: { slug: mapped.slug } });
}

function buildUpdateData(mapped, existing) {
  return {
    title: mapped.title,
    shortSummary: mapped.shortSummary,
    content: mapped.content || existing.content || "",
    publicationType: mapped.publicationType,
    researchArea: mapped.researchArea === "Research" && existing.researchArea ? existing.researchArea : mapped.researchArea,
    publisherName: mapped.publisherName,
    publishedDate: mapped.publishedDate,
    doi: mapped.doi || existing.doi || null,
    publicationUrl: mapped.publicationUrl,
    citationUrl: mapped.citationUrl || existing.citationUrl || null,
    authors: mapped.authors.length ? mapped.authors : existing.authors || [],
    myAuthorRole: mapped.myAuthorRole || existing.myAuthorRole || null,
    thumbnailImage: existing.thumbnailImage || mapped.thumbnailImage || null,
    status: "published",
    isFeatured: existing.isFeatured,
  };
}

async function upsertMappedPublication(mapped) {
  const existing = await findExistingPublication(mapped);
  if (existing) {
    const updated = await prisma.researchPublication.update({
      where: { id: existing.id },
      data: buildUpdateData(mapped, existing),
    });
    return { action: "updated", publication: updated };
  }

  let slug = mapped.slug;
  let suffix = 2;
  while (await prisma.researchPublication.findUnique({ where: { slug } })) {
    slug = `${mapped.slug}-${suffix}`;
    suffix += 1;
  }

  const created = await prisma.researchPublication.create({
    data: {
      ...mapped,
      id: await nextNumericId(),
      slug,
      doi: mapped.doi || null,
      citationUrl: mapped.citationUrl || null,
      authors: mapped.authors,
      myAuthorRole: mapped.myAuthorRole || null,
      thumbnailImage: mapped.thumbnailImage || null,
    },
  });
  return { action: "created", publication: created };
}

async function syncResearchPublications(options = {}) {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const startedAt = new Date();
    const orcidId = normalizeString(options.orcidId || process.env.RESEARCH_ORCID_ID || DEFAULT_ORCID_ID);
    const configuredAuthorName = normalizeString(
      options.authorName || process.env.RESEARCH_AUTHOR_NAME || DEFAULT_AUTHOR_NAME,
    );

    const result = {
      source: "ORCID + Crossref",
      orcidId,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const summaries = await fetchOrcidWorks(orcidId);
      result.fetched = summaries.length;

      for (const summary of summaries) {
        try {
          const putCode = normalizeString(summary?.["put-code"]);
          const externalId = getExternalId(summary);
          const [work, crossref] = await Promise.all([
            fetchOrcidWork(orcidId, putCode).catch(() => null),
            externalId.type === "doi" ? fetchCrossrefWork(externalId.value) : Promise.resolve(null),
          ]);

          const mapped = mapPublication({ summary, work, crossref, configuredAuthorName });
          if (!mapped) {
            result.skipped += 1;
            continue;
          }

          const saved = await upsertMappedPublication(mapped);
          result[saved.action] += 1;
        } catch (error) {
          result.errors.push(error.message);
        }
      }
    } finally {
      result.finishedAt = new Date().toISOString();
      lastSyncResult = result;
    }

    return result;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

function startResearchAutoSync(options = {}) {
  if (backgroundTimer) {
    return backgroundTimer;
  }

  const intervalMs = Math.max(
    60 * 60 * 1000,
    Number.parseInt(options.intervalMs || process.env.RESEARCH_SYNC_INTERVAL_MS, 10) || DEFAULT_SYNC_INTERVAL_MS,
  );

  const run = () => {
    syncResearchPublications(options)
      .then((result) => {
        console.log(
          `[research-sync] completed: fetched=${result.fetched}, created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, errors=${result.errors.length}`,
        );
      })
      .catch((error) => {
        console.error("[research-sync] failed:", error.message);
      });
  };

  setTimeout(run, 5000).unref?.();
  backgroundTimer = setInterval(run, intervalMs);
  backgroundTimer.unref?.();
  console.log(`[research-sync] background refresh scheduled every ${Math.round(intervalMs / 3600000)} hours.`);
  return backgroundTimer;
}

function stopResearchAutoSync() {
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
  }
}

function getResearchSyncStatus() {
  return {
    running: Boolean(syncInFlight),
    backgroundEnabled: Boolean(backgroundTimer),
    intervalHours: Math.round(DEFAULT_SYNC_INTERVAL_MS / 3600000),
    lastSyncResult,
  };
}

module.exports = {
  DEFAULT_SYNC_INTERVAL_MS,
  getResearchSyncStatus,
  startResearchAutoSync,
  stopResearchAutoSync,
  syncResearchPublications,
};
