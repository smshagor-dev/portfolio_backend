const prisma = require("./prisma");

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 3;
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

function truncate(value, maxLength = 480) {
  const normalized = normalizeString(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getOpenAlexConfig() {
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
          "User-Agent": "smshagor-portfolio-research-abstract-sync/1.0",
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

  throw lastError || new Error("OpenAlex request failed.");
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
  return positionedWords
    .map(([, word]) => normalizeString(word))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getOpenAlexAbstract(work) {
  if (!work || typeof work !== "object") {
    return "";
  }

  const directAbstract = normalizeString(work.abstract);
  if (directAbstract) {
    return directAbstract.replace(/\s+/g, " ").trim();
  }

  return reconstructAbstract(work.abstract_inverted_index);
}

function extractStoredAbstract(content) {
  const normalizedContent = String(content || "");
  if (!normalizedContent.trim()) {
    return "";
  }

  const match = normalizedContent.match(/(?:^|\n)Abstract\s*\n+([\s\S]*?)(?=\n+Publication Details(?:\n|$)|$)/i);
  return normalizeString(match?.[1]).replace(/\s+/g, " ").trim();
}

function replaceStoredAbstract(content, abstractText) {
  const normalizedContent = String(content || "").trim();
  const normalizedAbstract = normalizeString(abstractText).replace(/\s+/g, " ").trim();

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

function shouldUseOpenAlexAbstract(currentAbstract, openAlexAbstract) {
  const current = normalizeString(currentAbstract);
  const candidate = normalizeString(openAlexAbstract);

  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }

  const currentKey = current.toLowerCase().replace(/\s+/g, " ");
  const candidateKey = candidate.toLowerCase().replace(/\s+/g, " ");
  if (currentKey === candidateKey) {
    return false;
  }

  // Keep an existing rich abstract if it is clearly more complete. Otherwise
  // prefer the OpenAlex version over short ORCID descriptions or generated text.
  if (current.length >= 700 && current.length > candidate.length * 1.15) {
    return false;
  }

  return candidate.length >= Math.max(120, current.length * 0.9);
}

async function findOpenAlexWorkByDoi(doi, config) {
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
    return await fetchJson(directUrl, { timeoutMs: config.timeoutMs, retries: 1 });
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
  }

  const filterUrl = new URL("https://api.openalex.org/works");
  filterUrl.searchParams.set("filter", `doi:${directId}`);
  filterUrl.searchParams.set("per_page", "1");
  if (config.apiKey) {
    filterUrl.searchParams.set("api_key", config.apiKey);
  }

  const payload = await fetchJson(filterUrl.toString(), {
    timeoutMs: config.timeoutMs,
    retries: 1,
  });
  return payload?.results?.[0] || null;
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
  return results.find((item) => normalizeTitleKey(item?.title || item?.display_name) === normalizedTitle) || null;
}

async function resolveOpenAlexWork(publication, config) {
  const doi = normalizeDoi(publication?.doi);
  if (doi) {
    const byDoi = await findOpenAlexWorkByDoi(doi, config);
    if (byDoi) {
      return byDoi;
    }
  }

  return findOpenAlexWorkByTitle(publication?.title, config);
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
  const config = getOpenAlexConfig();
  const result = {
    reason,
    source: "OpenAlex",
    enabled: config.enabled,
    checked: 0,
    found: 0,
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
      shortSummary: true,
      content: true,
    },
  });

  result.checked = publications.length;

  await mapWithConcurrency(publications, DEFAULT_CONCURRENCY, async (publication) => {
    try {
      const openAlexWork = await resolveOpenAlexWork(publication, config);
      const openAlexAbstract = getOpenAlexAbstract(openAlexWork);

      if (!openAlexAbstract) {
        result.unchanged += 1;
        return;
      }

      result.found += 1;
      const currentAbstract = extractStoredAbstract(publication.content);
      if (!shouldUseOpenAlexAbstract(currentAbstract, openAlexAbstract)) {
        result.unchanged += 1;
        return;
      }

      const nextContent = replaceStoredAbstract(publication.content, openAlexAbstract);
      const nextSummary = truncate(openAlexAbstract, 480);

      await prisma.researchPublication.update({
        where: { id: publication.id },
        data: {
          content: nextContent,
          shortSummary: nextSummary,
        },
      });

      result.updated += 1;
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
  extractStoredAbstract,
  getOpenAlexAbstract,
  reconstructAbstract,
  replaceStoredAbstract,
};
