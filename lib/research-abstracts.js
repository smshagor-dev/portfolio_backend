const prisma = require("./prisma");

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 3;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const INTERNAL_SYNC_SLUG = "research-sync-internal-state";

function normalizeString(value) {
  return String(value || "").trim();
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

function titleSimilarity(left, right) {
  const a = normalizeTitleKey(left);
  const b = normalizeTitleKey(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }

  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (aTokens.size + bTokens.size);
}

function truncate(value, maxLength = 480) {
  const normalized = normalizeString(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeAbstractText(value) {
  return normalizeString(value)
    .replace(/<\/?jats:[^>]+>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*abstract\s*[:.\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAbstractSyncConfig() {
  return {
    apiKey: normalizeString(process.env.OPENALEX_API_KEY),
    timeoutMs: Math.max(
      3_000,
      Number.parseInt(process.env.RESEARCH_SYNC_HTTP_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS,
    ),
    enabled: !["0", "false", "no", "off"].includes(
      normalizeString(process.env.RESEARCH_ABSTRACT_SYNC_ENABLED || "true").toLowerCase(),
    ),
  };
}

function withOpenAlexAuth(url, apiKey) {
  const parsed = new URL(url);
  if (apiKey) {
    parsed.searchParams.set("api_key", apiKey);
  }
  return parsed.toString();
}

async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "smshagor-portfolio-research-abstract-sync/2.0",
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
      const retryable =
        error?.name === "AbortError" ||
        error?.status === 408 ||
        error?.status === 429 ||
        Number(error?.status) >= 500;

      if (!retryable || attempt >= retries) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Abstract metadata request failed.");
}

async function fetchHtml(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "Mozilla/5.0 compatible; smshagor-portfolio-research-abstract-sync/2.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} while resolving publication page`);
      error.status = response.status;
      throw error;
    }

    const finalUrl = new URL(response.url || url);
    if (finalUrl.protocol !== "https:") {
      throw new Error("Refusing non-HTTPS publication metadata response.");
    }

    const contentType = normalizeString(response.headers.get("content-type")).toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { html: "", url: finalUrl.toString() };
    }

    const declaredLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
      return { html: "", url: finalUrl.toString() };
    }

    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return { html: "", url: finalUrl.toString() };
    }

    return { html, url: finalUrl.toString() };
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(value) {
  return normalizeString(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    });
}

function parseTagAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function extractJsonLdAbstract(html) {
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptPattern.exec(html))) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];

      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== "object") {
          continue;
        }
        if (Array.isArray(item)) {
          queue.push(...item);
          continue;
        }

        const candidate = normalizeAbstractText(item.abstract || item.description);
        const type = normalizeString(item["@type"]).toLowerCase();
        if (candidate.length >= 120 && /article|scholarly|creativework|report|preprint/.test(type)) {
          return candidate;
        }

        if (Array.isArray(item["@graph"])) {
          queue.push(...item["@graph"]);
        }
      }
    } catch (_error) {
      // Ignore malformed JSON-LD and continue with other metadata sources.
    }
  }

  return "";
}

function extractPublisherAbstract(html) {
  const normalizedHtml = String(html || "");
  if (!normalizedHtml) {
    return "";
  }

  const preferredKeys = new Set([
    "citation_abstract",
    "dc.description",
    "dcterms.abstract",
    "prism.abstract",
  ]);
  const secondaryKeys = new Set(["description", "og:description", "twitter:description"]);
  const preferred = [];
  const secondary = [];
  const metaPattern = /<meta\b[^>]*>/gi;
  let metaMatch;

  while ((metaMatch = metaPattern.exec(normalizedHtml))) {
    const attrs = parseTagAttributes(metaMatch[0]);
    const key = normalizeString(attrs.name || attrs.property || attrs.itemprop).toLowerCase();
    const content = normalizeAbstractText(attrs.content);
    if (!key || content.length < 120) {
      continue;
    }

    if (preferredKeys.has(key)) {
      preferred.push(content);
    } else if (secondaryKeys.has(key)) {
      secondary.push(content);
    }
  }

  if (preferred.length > 0) {
    return preferred.sort((a, b) => b.length - a.length)[0];
  }

  const jsonLd = extractJsonLdAbstract(normalizedHtml);
  if (jsonLd) {
    return jsonLd;
  }

  if (secondary.length > 0) {
    return secondary.sort((a, b) => b.length - a.length)[0];
  }

  return "";
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== "object" || Array.isArray(invertedIndex)) {
    return "";
  }

  const positionedWords = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) {
      continue;
    }

    for (const position of positions) {
      const numericPosition = Number.parseInt(position, 10);
      if (Number.isFinite(numericPosition)) {
        positionedWords.push([numericPosition, word]);
      }
    }
  }

  positionedWords.sort((a, b) => a[0] - b[0]);
  return normalizeAbstractText(
    positionedWords
      .map(([, word]) => normalizeString(word))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([([{])\s+/g, "$1")
      .replace(/\s+([)\]}])/g, "$1"),
  );
}

function getOpenAlexAbstract(work) {
  if (!work || typeof work !== "object") {
    return "";
  }

  const directAbstract = normalizeAbstractText(work.abstract);
  if (directAbstract) {
    return directAbstract;
  }

  return reconstructAbstract(work.abstract_inverted_index);
}

function extractStoredAbstract(content) {
  const normalizedContent = String(content || "");
  if (!normalizedContent.trim()) {
    return "";
  }

  const match = normalizedContent.match(/(?:^|\n)Abstract\s*\n+([\s\S]*?)(?=\n+Publication Details(?:\n|$)|$)/i);
  return normalizeAbstractText(match?.[1]);
}

function replaceStoredAbstract(content, abstractText) {
  const normalizedContent = String(content || "").trim();
  const normalizedAbstract = normalizeAbstractText(abstractText);

  if (!normalizedAbstract) {
    return normalizedContent;
  }

  const pattern = /(?:^|\n)Abstract\s*\n+[\s\S]*?(?=\n+Publication Details(?:\n|$)|$)/i;
  if (pattern.test(normalizedContent)) {
    return normalizedContent.replace(pattern, (matched) => {
      const leadingNewline = matched.startsWith("\n") ? "\n" : "";
      return `${leadingNewline}Abstract\n\n${normalizedAbstract}\n`;
    }).trim();
  }

  return `Abstract\n\n${normalizedAbstract}\n\n${normalizedContent}`.trim();
}

function shouldUseCandidateAbstract(currentAbstract, candidateAbstract) {
  const current = normalizeAbstractText(currentAbstract);
  const candidate = normalizeAbstractText(candidateAbstract);

  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }
  if (current.toLowerCase() === candidate.toLowerCase()) {
    return false;
  }
  if (current.length >= 700 && current.length > candidate.length * 1.15) {
    return false;
  }

  return candidate.length >= Math.max(120, current.length * 0.9);
}

function isWorkTitleCompatible(work, publicationTitle) {
  const candidateTitle = normalizeString(work?.title || work?.display_name);
  if (!candidateTitle) {
    return false;
  }
  return titleSimilarity(candidateTitle, publicationTitle) >= 0.72;
}

async function findOpenAlexWorkByDoi(doi, publicationTitle, config) {
  const normalizedDoi = normalizeDoi(doi);
  if (!normalizedDoi) {
    return null;
  }

  const directId = `https://doi.org/${normalizedDoi}`;
  const directUrl = withOpenAlexAuth(
    `https://api.openalex.org/works/${encodeURIComponent(directId)}`,
    config.apiKey,
  );

  try {
    const direct = await fetchJson(directUrl, { timeoutMs: config.timeoutMs, retries: 1 });
    if (isWorkTitleCompatible(direct, publicationTitle)) {
      return direct;
    }
  } catch (error) {
    if (!(Number(error?.status) >= 400 && Number(error?.status) < 500 && error?.status !== 429)) {
      throw error;
    }
  }

  const filterUrl = new URL("https://api.openalex.org/works");
  filterUrl.searchParams.set("filter", `doi:${directId}`);
  filterUrl.searchParams.set("per_page", "3");
  if (config.apiKey) {
    filterUrl.searchParams.set("api_key", config.apiKey);
  }

  const payload = await fetchJson(filterUrl.toString(), {
    timeoutMs: config.timeoutMs,
    retries: 1,
  });
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.find((item) => isWorkTitleCompatible(item, publicationTitle)) || null;
}

async function findOpenAlexWorkByTitle(title, config) {
  const normalizedTitle = normalizeTitleKey(title);
  if (!normalizedTitle) {
    return null;
  }

  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", normalizeString(title));
  url.searchParams.set("per_page", "5");
  if (config.apiKey) {
    url.searchParams.set("api_key", config.apiKey);
  }

  const payload = await fetchJson(url.toString(), {
    timeoutMs: config.timeoutMs,
    retries: 1,
  });

  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.find((item) => isWorkTitleCompatible(item, title)) || null;
}

async function resolveOpenAlexWork(publication, config) {
  const doi = normalizeDoi(publication?.doi);
  if (doi) {
    const byDoi = await findOpenAlexWorkByDoi(doi, publication?.title, config);
    if (byDoi) {
      return byDoi;
    }
  }

  return findOpenAlexWorkByTitle(publication?.title, config);
}

async function fetchPublisherAbstract(publication, config) {
  const doi = normalizeDoi(publication?.doi);
  const candidates = [];

  if (doi) {
    candidates.push(`https://doi.org/${doi}`);
    candidates.push(`https://sciety.org/articles/activity/${doi}`);
  }

  const publicationUrl = normalizeString(publication?.publicationUrl);
  if (publicationUrl) {
    try {
      const parsed = new URL(publicationUrl);
      if (parsed.protocol === "https:" && !candidates.includes(parsed.toString())) {
        candidates.push(parsed.toString());
      }
    } catch (_error) {
      // Ignore malformed stored publication URLs.
    }
  }

  for (const url of candidates.slice(0, 3)) {
    try {
      const { html, url: resolvedUrl } = await fetchHtml(url, { timeoutMs: config.timeoutMs });
      const abstract = extractPublisherAbstract(html);
      if (abstract) {
        return { abstract, url: resolvedUrl };
      }
    } catch (error) {
      if (error?.name === "AbortError" || error?.status === 429 || Number(error?.status) >= 500) {
        console.warn(`Publisher abstract fallback failed for ${doi || publication?.slug}: ${error.message}`);
      }
    }
  }

  return null;
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

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, () => worker()),
  );
  return results;
}

async function enrichResearchAbstracts({ reason = "research-sync" } = {}) {
  const config = getAbstractSyncConfig();
  const result = {
    reason,
    source: "OpenAlex + publisher metadata",
    enabled: config.enabled,
    checked: 0,
    found: 0,
    openAlexFound: 0,
    publisherFound: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    failures: [],
  };

  if (!config.enabled) {
    return {
      ...result,
      skipped: true,
      skipReason: "disabled",
    };
  }

  const publications = await prisma.researchPublication.findMany({
    where: {
      status: "published",
      slug: { not: INTERNAL_SYNC_SLUG },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      doi: true,
      publicationUrl: true,
      shortSummary: true,
      content: true,
    },
  });

  result.checked = publications.length;

  await mapWithConcurrency(publications, DEFAULT_CONCURRENCY, async (publication) => {
    try {
      const currentAbstract = extractStoredAbstract(publication.content);
      let candidateAbstract = "";
      let source = "";

      const openAlexWork = await resolveOpenAlexWork(publication, config);
      const openAlexAbstract = getOpenAlexAbstract(openAlexWork);
      if (openAlexAbstract) {
        candidateAbstract = openAlexAbstract;
        source = "OpenAlex";
        result.openAlexFound += 1;
      }

      if (!candidateAbstract || !shouldUseCandidateAbstract(currentAbstract, candidateAbstract)) {
        const publisher = await fetchPublisherAbstract(publication, config);
        if (publisher?.abstract) {
          const publisherAbstract = normalizeAbstractText(publisher.abstract);
          if (!candidateAbstract || publisherAbstract.length > candidateAbstract.length) {
            candidateAbstract = publisherAbstract;
            source = "publisher";
          }
          result.publisherFound += 1;
        }
      }

      if (!candidateAbstract) {
        result.unchanged += 1;
        return;
      }

      result.found += 1;
      if (!shouldUseCandidateAbstract(currentAbstract, candidateAbstract)) {
        result.unchanged += 1;
        return;
      }

      const nextContent = replaceStoredAbstract(publication.content, candidateAbstract);
      const nextSummary = truncate(candidateAbstract, 480);

      await prisma.researchPublication.update({
        where: { id: publication.id },
        data: {
          content: nextContent,
          shortSummary: nextSummary,
        },
      });

      result.updated += 1;
      console.log(`Research abstract updated from ${source}: ${publication.slug}`);
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        slug: publication.slug,
        title: publication.title,
        message: error.message,
      });
    }
  });

  return result;
}

module.exports = {
  enrichResearchAbstracts,
  extractPublisherAbstract,
  extractStoredAbstract,
  getOpenAlexAbstract,
  normalizeAbstractText,
  reconstructAbstract,
  replaceStoredAbstract,
  titleSimilarity,
};
