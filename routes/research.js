const express = require("express");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");
const {
  buildResearchPublicationWhere,
  hasResearchPublicationModel,
  normalizeString,
  serializeResearchPublication,
} = require("../lib/research-publications");
const {
  getResearchSyncStatus,
  syncResearchPublications,
} = require("../services/research-sync");

const router = express.Router();

function ok(message, data, extra = {}) {
  return { success: true, message, data, ...extra };
}

function fail(message, data = null) {
  return { success: false, message, data };
}

function getPaginationParams(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 9));
  return { page, limit, skip: (page - 1) * limit };
}

function serializeResearchReply(reply) {
  return {
    id: reply.id,
    commentId: reply.commentId,
    name: reply.name || "",
    reply: reply.reply,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt,
  };
}

function serializeResearchComment(comment) {
  return {
    id: comment.id,
    publicationId: comment.publicationId,
    name: comment.name || "",
    comment: comment.comment,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies: (comment.replies || []).map(serializeResearchReply),
  };
}

async function incrementMetric(slug, field) {
  const normalizedSlug = normalizeString(slug).toLowerCase();
  const allowedFields = new Set(["views", "impressionCount", "shareCount"]);
  if (!normalizedSlug || !allowedFields.has(field)) {
    return null;
  }

  try {
    return await prisma.researchPublication.update({
      where: { slug: normalizedSlug },
      data: { [field]: { increment: 1 } },
    });
  } catch (_error) {
    return null;
  }
}

router.get("/research-publications", async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(fail("Research publication model is not available."));
    }

    const { page, limit, skip } = getPaginationParams(request.query);
    const where = buildResearchPublicationWhere(request.query, { publicOnly: true });

    const [items, total, publicationTypes, researchAreas] = await Promise.all([
      prisma.researchPublication.findMany({
        where,
        include: { comments: { include: { replies: true } } },
        orderBy: [{ publishedDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.researchPublication.count({ where }),
      prisma.researchPublication.findMany({
        where: { status: "published" },
        select: { publicationType: true },
        distinct: ["publicationType"],
        orderBy: { publicationType: "asc" },
      }),
      prisma.researchPublication.findMany({
        where: { status: "published" },
        select: { researchArea: true },
        distinct: ["researchArea"],
        orderBy: { researchArea: "asc" },
      }),
    ]);

    return response.json(
      ok("Research publications loaded successfully.", items.map(serializeResearchPublication), {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        filters: {
          search: normalizeString(request.query.search),
          publicationType: normalizeString(request.query.publicationType),
          researchArea: normalizeString(request.query.researchArea),
          status: "published",
          featured: normalizeString(request.query.featured),
        },
        options: {
          publicationTypes: publicationTypes.map((item) => item.publicationType).filter(Boolean),
          researchAreas: researchAreas.map((item) => item.researchArea).filter(Boolean),
          statuses: ["published"],
        },
        sync: {
          source: "ORCID + Crossref",
          intervalHours: 12,
        },
      }),
    );
  } catch (error) {
    console.error("Failed to load research publications:", error.message);
    return response.status(500).json(fail("Failed to load research publications."));
  }
});

router.get("/research-publications/featured", async (_request, response) => {
  try {
    const items = await prisma.researchPublication.findMany({
      where: { status: "published", isFeatured: true },
      include: { comments: { include: { replies: true } } },
      orderBy: [{ publishedDate: "desc" }, { createdAt: "desc" }],
      take: 6,
    });

    return response.json(ok("Featured research publications loaded successfully.", items.map(serializeResearchPublication)));
  } catch (error) {
    console.error("Failed to load featured research publications:", error.message);
    return response.status(500).json(fail("Failed to load featured research publications."));
  }
});

router.get("/research-publications/:slug", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      include: {
        comments: {
          orderBy: { sortOrder: "asc" },
          include: { replies: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (!publication) {
      return response.status(404).json(fail("Research publication not found."));
    }

    await incrementMetric(slug, "views");

    const relatedPublications = await prisma.researchPublication.findMany({
      where: { status: "published", slug: { not: slug } },
      include: { comments: { include: { replies: true } } },
      orderBy: [{ isFeatured: "desc" }, { publishedDate: "desc" }],
      take: 5,
    });

    return response.json(
      ok(
        "Research publication loaded successfully.",
        {
          ...serializeResearchPublication({ ...publication, views: (publication.views || 0) + 1 }),
          comments: (publication.comments || []).map(serializeResearchComment),
        },
        { relatedPublications: relatedPublications.map(serializeResearchPublication) },
      ),
    );
  } catch (error) {
    console.error("Failed to load research publication detail:", error.message);
    return response.status(500).json(fail("Failed to load research publication."));
  }
});

router.post("/research-publications/:slug/comments", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const name = normalizeString(request.body?.name);
    const commentText = normalizeString(request.body?.comment);

    if (!name || !commentText) {
      return response.status(400).json(fail("Name and comment are required."));
    }

    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      include: { comments: { orderBy: { sortOrder: "desc" }, take: 1 } },
    });

    if (!publication) {
      return response.status(404).json(fail("Research publication not found."));
    }

    const savedComment = await prisma.researchComment.create({
      data: {
        id: Date.now(),
        publicationId: publication.id,
        name,
        comment: commentText,
        sortOrder: (publication.comments?.[0]?.sortOrder || 0) + 1,
      },
      include: { replies: true },
    });

    request.app.get("io")?.to(`research:${slug}`).emit("research:comment_created", {
      publicationSlug: slug,
      comment: serializeResearchComment(savedComment),
    });

    return response.status(201).json(ok("Comment saved successfully.", serializeResearchComment(savedComment)));
  } catch (error) {
    console.error("Failed to save research comment:", error.message);
    return response.status(500).json(fail("Failed to save comment."));
  }
});

router.post("/research-publications/:slug/comments/:commentId/replies", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const commentId = Number.parseInt(request.params.commentId, 10);
    const name = normalizeString(request.body?.name);
    const replyText = normalizeString(request.body?.reply);

    if (!commentId || !name || !replyText) {
      return response.status(400).json(fail("Name and reply are required."));
    }

    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      select: { id: true },
    });
    if (!publication) {
      return response.status(404).json(fail("Research publication not found."));
    }

    const comment = await prisma.researchComment.findFirst({
      where: { id: commentId, publicationId: publication.id },
      include: { replies: { orderBy: { sortOrder: "desc" }, take: 1 } },
    });
    if (!comment) {
      return response.status(404).json(fail("Comment not found."));
    }

    const savedReply = await prisma.researchReply.create({
      data: {
        id: Date.now(),
        commentId: comment.id,
        name,
        reply: replyText,
        sortOrder: (comment.replies?.[0]?.sortOrder || 0) + 1,
      },
    });

    request.app.get("io")?.to(`research:${slug}`).emit("research:reply_created", {
      publicationSlug: slug,
      commentId: comment.id,
      reply: serializeResearchReply(savedReply),
    });

    return response.status(201).json(ok("Reply saved successfully.", serializeResearchReply(savedReply)));
  } catch (error) {
    console.error("Failed to save research reply:", error.message);
    return response.status(500).json(fail("Failed to save reply."));
  }
});

router.post("/research-publications/:slug/impression", async (request, response) => {
  const slug = normalizeString(request.params.slug).toLowerCase();
  const updated = await incrementMetric(slug, "impressionCount");
  if (!updated) {
    return response.status(404).json(fail("Research publication not found."));
  }
  return response.status(201).json(ok("Research publication impression tracked.", { slug }));
});

router.post("/research-publications/:slug/share", async (request, response) => {
  const slug = normalizeString(request.params.slug).toLowerCase();
  const updated = await incrementMetric(slug, "shareCount");
  if (!updated) {
    return response.status(404).json(fail("Research publication not found."));
  }
  return response.status(201).json(ok("Research publication share tracked.", { slug }));
});

router.get("/admin/research-publications", requireAdmin, async (request, response) => {
  try {
    const where = buildResearchPublicationWhere(request.query, { publicOnly: false });
    const items = await prisma.researchPublication.findMany({
      where,
      orderBy: [{ publishedDate: "desc" }, { createdAt: "desc" }],
    });
    return response.json(ok("Synced research publications loaded successfully.", items.map(serializeResearchPublication), {
      sync: getResearchSyncStatus(),
    }));
  } catch (error) {
    console.error("Failed to load admin research publications:", error.message);
    return response.status(500).json(fail("Failed to load research publications."));
  }
});

router.get("/admin/research-sync/status", requireAdmin, (_request, response) => {
  return response.json(ok("Research sync status loaded.", getResearchSyncStatus()));
});

router.post("/admin/research-sync", requireAdmin, async (request, response) => {
  try {
    const result = await syncResearchPublications();
    request.app.get("io")?.emit("content:updated", {
      scope: "research",
      action: "synced",
      updatedAt: new Date().toISOString(),
    });
    return response.json(ok("Research publications synchronized successfully.", result));
  } catch (error) {
    console.error("Manual research sync failed:", error.message);
    return response.status(502).json(fail("Research synchronization failed.", { error: error.message }));
  }
});

router.all("/admin/research-publications/:id", requireAdmin, (request, response, next) => {
  if (request.method === "GET") {
    return next();
  }
  return response.status(405).json(fail("Research publications are source-managed by ORCID/Crossref and cannot be modified manually."));
});

router.get("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  const publicationId = Number.parseInt(request.params.id, 10);
  if (!publicationId) {
    return response.status(400).json(fail("A valid publication id is required."));
  }
  const publication = await prisma.researchPublication.findUnique({ where: { id: publicationId } });
  if (!publication) {
    return response.status(404).json(fail("Research publication not found."));
  }
  return response.json(ok("Research publication loaded successfully.", serializeResearchPublication(publication)));
});

router.post("/admin/research-publications", requireAdmin, (_request, response) => {
  return response.status(405).json(fail("Manual publication creation is disabled. Use the research sync endpoint."));
});

module.exports = router;
