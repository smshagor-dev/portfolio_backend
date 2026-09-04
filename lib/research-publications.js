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

function serializeResearchPublication(publication) {
  const comments = Array.isArray(publication.comments) ? publication.comments : [];
  const replyCount = comments.reduce(
    (sum, item) => sum + ((item?.replies || []).length || 0),
    0,
  );

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
      ? { status: status || "published" }
      : status
      ? { status }
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
            { doi: { contains: normalizedSearch } },
          ],
        }
      : {}),
  };
}

module.exports = {
  buildResearchPublicationWhere,
  hasResearchPublicationModel,
  normalizeString,
  serializeResearchPublication,
  slugify,
};
