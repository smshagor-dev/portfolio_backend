const prisma = require("./prisma");

function normalizeString(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = normalizeString(value).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return fallback;
}

function normalizeAuthors(value, fallbackValue = []) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return normalizeString(item);
        }

        return normalizeString(item?.name || item?.fullName || item?.label);
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return [];
    }

    if (normalizedValue.startsWith("[")) {
      try {
        return normalizeAuthors(JSON.parse(normalizedValue), fallbackValue);
      } catch (_error) {
        // Fall through to delimiter parsing.
      }
    }

    return normalizedValue
      .split(/\r?\n|,/)
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }

  if (value == null) {
    return Array.isArray(fallbackValue) ? fallbackValue : [];
  }

  return Array.isArray(fallbackValue) ? fallbackValue : [];
}

function normalizePublishedDate(value, fallbackValue = null) {
  const rawValue = value ?? fallbackValue;
  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(rawValue);
  return Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
}

function serializeResearchPublication(publication) {
  const comments = Array.isArray(publication.comments) ? publication.comments : [];
  const replyCount = comments.reduce((sum, item) => sum + ((item?.replies || []).length || 0), 0);

  return {
    id: publication.id,
    title: publication.title,
    slug: publication.slug,
    shortSummary: publication.shortSummary || "",
    content: publication.content || "",
    publicationType: publication.publicationType,
    researchArea: publication.researchArea,
    publisherName: publication.publisherName,
    publishedDate: publication.publishedDate,
    doi: publication.doi || "",
    publicationUrl: publication.publicationUrl,
    citationUrl: publication.citationUrl || "",
    authors: Array.isArray(publication.authors) ? publication.authors : [],
    myAuthorRole: publication.myAuthorRole || "",
    thumbnailImage: publication.thumbnailImage || "",
    views: Math.max(0, Number.parseInt(publication.views, 10) || 0),
    impressionCount: Math.max(0, Number.parseInt(publication.impressionCount, 10) || 0),
    shareCount: Math.max(0, Number.parseInt(publication.shareCount, 10) || 0),
    commentCount: comments.length,
    replyCount,
    isFeatured: Boolean(publication.isFeatured),
    status: publication.status,
    createdAt: publication.createdAt,
    updatedAt: publication.updatedAt,
  };
}

function hasResearchPublicationModel() {
  return Boolean(
    prisma?.researchPublication &&
      typeof prisma.researchPublication.findMany === "function",
  );
}

function buildResearchPublicationWhere(query = {}, options = {}) {
  const normalizedSearch = normalizeString(query.search);
  const publicationType = normalizeString(query.publicationType);
  const researchArea = normalizeString(query.researchArea);
  const status = normalizeString(query.status);
  const featuredOnly = normalizeBoolean(query.featured, false);

  return {
    ...(options.publicOnly
      ? {
          status: status || "published",
        }
      : status
      ? {
          status,
        }
      : {}),
    ...(publicationType ? { publicationType } : {}),
    ...(researchArea ? { researchArea } : {}),
    ...(featuredOnly ? { isFeatured: true } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { title: { contains: normalizedSearch } },
            { shortSummary: { contains: normalizedSearch } },
            { researchArea: { contains: normalizedSearch } },
            { publisherName: { contains: normalizedSearch } },
          ],
        }
      : {}),
  };
}

function normalizeResearchPublicationPayload(payload = {}, fallbackPublication = null) {
  const title = normalizeString(payload.title ?? fallbackPublication?.title);
  const slug = slugify(payload.slug || payload.title || fallbackPublication?.slug || fallbackPublication?.title);
  const shortSummary = normalizeString(payload.shortSummary ?? fallbackPublication?.shortSummary);
  const content = String(payload.content ?? fallbackPublication?.content ?? "").trim();
  const publicationType = normalizeString(payload.publicationType ?? fallbackPublication?.publicationType);
  const researchArea = normalizeString(payload.researchArea ?? fallbackPublication?.researchArea);
  const publisherName = normalizeString(payload.publisherName ?? fallbackPublication?.publisherName);
  const publishedDate = normalizePublishedDate(payload.publishedDate, fallbackPublication?.publishedDate);
  const doi = normalizeString(payload.doi ?? fallbackPublication?.doi);
  const publicationUrl = normalizeString(payload.publicationUrl ?? fallbackPublication?.publicationUrl);
  const citationUrl = normalizeString(payload.citationUrl ?? fallbackPublication?.citationUrl);
  const authors = normalizeAuthors(payload.authors, fallbackPublication?.authors);
  const myAuthorRole = normalizeString(payload.myAuthorRole ?? fallbackPublication?.myAuthorRole);
  const thumbnailImage = normalizeString(payload.thumbnailImage ?? fallbackPublication?.thumbnailImage);
  const status = normalizeString(payload.status ?? fallbackPublication?.status).toLowerCase();

  return {
    title,
    slug,
    shortSummary,
    content,
    publicationType,
    researchArea,
    publisherName,
    publishedDate,
    doi,
    publicationUrl,
    citationUrl,
    authors,
    myAuthorRole,
    thumbnailImage,
    isFeatured: normalizeBoolean(payload.isFeatured, fallbackPublication?.isFeatured ?? false),
    status,
  };
}

function validateResearchPublicationPayload(payload) {
  const requiredFields = [
    ["title", payload.title],
    ["shortSummary", payload.shortSummary],
    ["publicationType", payload.publicationType],
    ["researchArea", payload.researchArea],
    ["publisherName", payload.publisherName],
    ["publishedDate", payload.publishedDate],
    ["publicationUrl", payload.publicationUrl],
    ["status", payload.status],
  ];

  const missingField = requiredFields.find(([, value]) => {
    if (value instanceof Date) {
      return !Number.isFinite(value.getTime());
    }

    return !value;
  });

  if (missingField) {
    return `Missing required field: ${missingField[0]}.`;
  }

  if (!payload.slug) {
    return "A valid slug could not be generated from the title.";
  }

  if (!["published", "draft", "archived", "under_review"].includes(payload.status)) {
    return "Status must be one of: published, draft, archived, under_review.";
  }

  return "";
}

module.exports = {
  buildResearchPublicationWhere,
  hasResearchPublicationModel,
  normalizeResearchPublicationPayload,
  normalizeString,
  serializeResearchPublication,
  validateResearchPublicationPayload,
};
