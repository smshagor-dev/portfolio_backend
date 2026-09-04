const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");
const {
  hasResearchPublicationModel,
  normalizeString,
  serializeResearchPublication,
  slugify,
} = require("../lib/research-publications");
const { markManualResearchOverride } = require("../lib/research-manual-override");

// Load the canonical research router and augment the same cached router instance.
// api/index.js loads this module before the main server, so the routes below are
// present when index.js later mounts routes/research.js at /api.
const router = require("./research");

function buildSuccess(message, data) {
  return { success: true, message, data };
}

function buildError(message, data = null) {
  return { success: false, message, data };
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeString(value).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
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
    const normalized = value.trim();
    if (!normalized) {
      return [];
    }

    if (normalized.startsWith("[")) {
      try {
        return normalizeAuthors(JSON.parse(normalized), fallbackValue);
      } catch (_error) {
        // Continue with comma/newline parsing.
      }
    }

    return normalized
      .split(/\r?\n|,/)
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }

  return Array.isArray(fallbackValue) ? fallbackValue : [];
}

function normalizePublishedDate(value, fallbackValue = null) {
  const rawValue = value ?? fallbackValue;
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizePayload(payload = {}, fallback = null) {
  const title = normalizeString(payload.title ?? fallback?.title);
  const slug = slugify(
    payload.slug || payload.title || fallback?.slug || fallback?.title,
  );
  const shortSummary = normalizeString(payload.shortSummary ?? fallback?.shortSummary);
  const rawContent = String(payload.content ?? fallback?.content ?? "").trim();
  const publicationType = normalizeString(
    payload.publicationType ?? fallback?.publicationType,
  );
  const researchArea = normalizeString(payload.researchArea ?? fallback?.researchArea);
  const publisherName = normalizeString(payload.publisherName ?? fallback?.publisherName);
  const publishedDate = normalizePublishedDate(
    payload.publishedDate,
    fallback?.publishedDate,
  );
  const doi = normalizeString(payload.doi ?? fallback?.doi);
  const publicationUrl = normalizeString(payload.publicationUrl ?? fallback?.publicationUrl);
  const citationUrl = normalizeString(payload.citationUrl ?? fallback?.citationUrl);
  const authors = normalizeAuthors(payload.authors, fallback?.authors);
  const myAuthorRole = normalizeString(payload.myAuthorRole ?? fallback?.myAuthorRole);
  const thumbnailImage = normalizeString(payload.thumbnailImage ?? fallback?.thumbnailImage);
  const status = normalizeString(payload.status ?? fallback?.status ?? "published").toLowerCase();

  return {
    title,
    slug,
    shortSummary,
    content: markManualResearchOverride(rawContent),
    publicationType,
    researchArea,
    publisherName,
    publishedDate,
    doi: doi || null,
    publicationUrl,
    citationUrl: citationUrl || null,
    authors,
    myAuthorRole,
    thumbnailImage,
    isFeatured: normalizeBoolean(payload.isFeatured, fallback?.isFeatured ?? false),
    status,
  };
}

function validatePayload(payload) {
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

  const missing = requiredFields.find(([, value]) => {
    if (value instanceof Date) {
      return !Number.isFinite(value.getTime());
    }
    return !value;
  });

  if (missing) {
    return `Missing required field: ${missing[0]}.`;
  }
  if (!payload.slug) {
    return "A valid slug could not be generated from the title.";
  }
  if (!["published", "draft", "archived", "under_review"].includes(payload.status)) {
    return "Status must be one of: published, draft, archived, under_review.";
  }

  return "";
}

function emitUpdated(request, action, publication) {
  request.app.get("io")?.emit("content:updated", {
    scope: "research",
    action,
    updatedAt: new Date().toISOString(),
    publicationId: publication?.id || null,
    slug: publication?.slug || "",
    status: publication?.status || "",
    isFeatured: Boolean(publication?.isFeatured),
  });
}

router.get("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(buildError("Research publication model is not available."));
    }

    const id = Number.parseInt(request.params.id, 10);
    if (!id) {
      return response.status(400).json(buildError("A valid publication id is required."));
    }

    const publication = await prisma.researchPublication.findUnique({ where: { id } });
    if (!publication) {
      return response.status(404).json(buildError("Research publication not found."));
    }

    return response.json(
      buildSuccess(
        "Admin research publication loaded successfully.",
        serializeResearchPublication(publication),
      ),
    );
  } catch (error) {
    console.error("Failed to load admin research publication:", error.message);
    return response.status(500).json(buildError("Failed to load research publication."));
  }
});

router.post("/admin/research-publications", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(buildError("Research publication model is not available."));
    }

    const payload = normalizePayload(request.body);
    const validationError = validatePayload(payload);
    if (validationError) {
      return response.status(400).json(buildError(validationError));
    }

    const created = await prisma.researchPublication.create({ data: payload });
    emitUpdated(request, "created", created);

    return response.status(201).json(
      buildSuccess(
        "Research publication created successfully. Manual changes are protected from automatic metadata sync.",
        serializeResearchPublication(created),
      ),
    );
  } catch (error) {
    if (error?.code === "P2002") {
      return response.status(409).json(buildError("A research publication with this slug already exists."));
    }
    console.error("Failed to create research publication:", error.message);
    return response.status(500).json(buildError("Failed to create research publication."));
  }
});

router.put("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(buildError("Research publication model is not available."));
    }

    const id = Number.parseInt(request.params.id, 10);
    if (!id) {
      return response.status(400).json(buildError("A valid publication id is required."));
    }

    const existing = await prisma.researchPublication.findUnique({ where: { id } });
    if (!existing) {
      return response.status(404).json(buildError("Research publication not found."));
    }

    const payload = normalizePayload(request.body, existing);
    const validationError = validatePayload(payload);
    if (validationError) {
      return response.status(400).json(buildError(validationError));
    }

    const updated = await prisma.researchPublication.update({
      where: { id },
      data: payload,
    });
    emitUpdated(request, "updated", updated);

    return response.json(
      buildSuccess(
        "Research publication updated successfully. This manual version is protected from automatic metadata and abstract overwrite.",
        serializeResearchPublication(updated),
      ),
    );
  } catch (error) {
    if (error?.code === "P2002") {
      return response.status(409).json(buildError("A research publication with this slug already exists."));
    }
    console.error("Failed to update research publication:", error.message);
    return response.status(500).json(buildError("Failed to update research publication."));
  }
});

router.delete("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(buildError("Research publication model is not available."));
    }

    const id = Number.parseInt(request.params.id, 10);
    if (!id) {
      return response.status(400).json(buildError("A valid publication id is required."));
    }

    const existing = await prisma.researchPublication.findUnique({
      where: { id },
      select: { id: true, slug: true, status: true, isFeatured: true },
    });
    if (!existing) {
      return response.status(404).json(buildError("Research publication not found."));
    }

    await prisma.researchPublication.delete({ where: { id } });
    emitUpdated(request, "deleted", existing);

    return response.json(
      buildSuccess("Research publication deleted successfully.", { id }),
    );
  } catch (error) {
    console.error("Failed to delete research publication:", error.message);
    return response.status(500).json(buildError("Failed to delete research publication."));
  }
});

module.exports = router;
