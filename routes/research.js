const express = require("express");
const path = require("path");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");
const {
  buildResearchPublicationWhere,
  hasResearchPublicationModel,
  normalizeString,
  serializeResearchPublication,
} = require("../lib/research-publications");
const {
  getResearchSyncRuntimeState,
  startResearchAutoSync,
  syncResearchPublications,
} = require("../lib/research-sync");

const router = express.Router();
const defaultThumbnailPath = path.resolve(
  process.cwd(),
  "public",
  "research",
  "research-publication.svg",
);

function buildResearchSuccessResponse(message, data, extra = {}) {
  return {
    success: true,
    message,
    data,
    ...extra,
  };
}

function buildResearchErrorResponse(message, data = null) {
  return {
    success: false,
    message,
    data,
  };
}

function getPaginationParams(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 9));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
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

async function incrementResearchPublicationMetric(slug, metricName) {
  const normalizedSlug = normalizeString(slug).toLowerCase();
  const fieldName = {
    views: "views",
    impression_count: "impressionCount",
    share_count: "shareCount",
  }[metricName];

  if (!normalizedSlug || !fieldName) {
    return;
  }

  try {
    await prisma.researchPublication.update({
      where: { slug: normalizedSlug },
      data: {
        [fieldName]: {
          increment: 1,
        },
      },
    });
  } catch (_error) {
    // Metrics should never break the public research experience.
  }
}

router.get("/research-publications/default-thumbnail.svg", (_request, response) => {
  response.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  response.type("image/svg+xml");
  return response.sendFile(defaultThumbnailPath);
});

router.get("/research-publications", async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const { page, limit, skip } = getPaginationParams(request.query);
    const where = buildResearchPublicationWhere(request.query, { publicOnly: true });

    const [items, total, publicationTypes, researchAreas] = await Promise.all([
      prisma.researchPublication.findMany({
        where,
        include: {
          comments: {
            include: {
              replies: true,
            },
          },
        },
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
      buildResearchSuccessResponse(
        "Research publications loaded successfully.",
        items.map(serializeResearchPublication),
        {
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
            featured: normalizeString(request.query.featured),
          },
          options: {
            publicationTypes: publicationTypes.map((item) => item.publicationType).filter(Boolean),
            researchAreas: researchAreas.map((item) => item.researchArea).filter(Boolean),
          },
        },
      ),
    );
  } catch (error) {
    console.error("Failed to load research publications:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to load research publications."));
  }
});

router.get("/research-publications/featured", async (_request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const items = await prisma.researchPublication.findMany({
      where: {
        status: "published",
        isFeatured: true,
      },
      include: {
        comments: {
          include: {
            replies: true,
          },
        },
      },
      orderBy: [{ publishedDate: "desc" }, { createdAt: "desc" }],
      take: 6,
    });

    return response.json(
      buildResearchSuccessResponse(
        "Featured research publications loaded successfully.",
        items.map(serializeResearchPublication),
      ),
    );
  } catch (error) {
    console.error("Failed to load featured research publications:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to load featured research publications."));
  }
});

router.get("/research-publications/:slug", async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const slug = normalizeString(request.params.slug).toLowerCase();
    const publication = await prisma.researchPublication.findFirst({
      where: {
        slug,
        status: "published",
      },
      include: {
        comments: {
          orderBy: { sortOrder: "asc" },
          include: {
            replies: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    await incrementResearchPublicationMetric(slug, "views");
    const updatedPublication = await prisma.researchPublication.findUnique({
      where: { slug },
      include: {
        comments: {
          orderBy: { sortOrder: "asc" },
          include: {
            replies: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    const relatedPublications = await prisma.researchPublication.findMany({
      where: {
        status: "published",
        slug: { not: slug },
      },
      include: {
        comments: {
          include: {
            replies: true,
          },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { publishedDate: "desc" }, { createdAt: "desc" }],
      take: 5,
    });

    const resolved = updatedPublication || publication;
    return response.json(
      buildResearchSuccessResponse(
        "Research publication loaded successfully.",
        {
          ...serializeResearchPublication(resolved),
          comments: (resolved.comments || []).map(serializeResearchComment),
        },
        {
          relatedPublications: relatedPublications.map(serializeResearchPublication),
        },
      ),
    );
  } catch (error) {
    console.error("Failed to load research publication detail:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to load research publication."));
  }
});

router.post("/research-publications/:slug/comments", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const name = normalizeString(request.body?.name);
    const commentText = normalizeString(request.body?.comment);

    if (!name || !commentText) {
      return response.status(400).json(buildResearchErrorResponse("Name and comment are required."));
    }

    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      include: {
        comments: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const savedComment = await prisma.researchComment.create({
      data: {
        publicationId: publication.id,
        name,
        comment: commentText,
        sortOrder: (publication.comments?.[0]?.sortOrder || 0) + 1,
      },
      include: {
        replies: true,
      },
    });

    request.app.get("io")?.to(`research:${slug}`).emit("research:comment_created", {
      publicationSlug: slug,
      comment: serializeResearchComment(savedComment),
    });

    return response.status(201).json({
      success: true,
      message: "Comment saved successfully.",
      comment: serializeResearchComment(savedComment),
    });
  } catch (error) {
    console.error("Failed to save research comment:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to save comment."));
  }
});

router.post("/research-publications/:slug/comments/:commentId/replies", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const commentId = Number.parseInt(request.params.commentId, 10);
    const name = normalizeString(request.body?.name);
    const replyText = normalizeString(request.body?.reply);

    if (!commentId || !name || !replyText) {
      return response.status(400).json(buildResearchErrorResponse("Name and reply are required."));
    }

    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      select: { id: true },
    });

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const comment = await prisma.researchComment.findFirst({
      where: {
        id: commentId,
        publicationId: publication.id,
      },
      include: {
        replies: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!comment) {
      return response.status(404).json(buildResearchErrorResponse("Comment not found."));
    }

    const savedReply = await prisma.researchReply.create({
      data: {
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

    return response.status(201).json({
      success: true,
      message: "Reply saved successfully.",
      reply: serializeResearchReply(savedReply),
    });
  } catch (error) {
    console.error("Failed to save research reply:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to save reply."));
  }
});

router.post("/research-publications/:slug/impression", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      select: { id: true },
    });

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    await incrementResearchPublicationMetric(slug, "impression_count");
    return response.status(201).json(
      buildResearchSuccessResponse("Research publication impression tracked.", { slug }),
    );
  } catch (error) {
    console.error("Failed to track research publication impression:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to track research publication impression."));
  }
});

router.post("/research-publications/:slug/share", async (request, response) => {
  try {
    const slug = normalizeString(request.params.slug).toLowerCase();
    const publication = await prisma.researchPublication.findFirst({
      where: { slug, status: "published" },
      select: { id: true },
    });

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    await incrementResearchPublicationMetric(slug, "share_count");
    return response.status(201).json(
      buildResearchSuccessResponse("Research publication share tracked.", { slug }),
    );
  } catch (error) {
    console.error("Failed to track research publication share:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to track research publication share."));
  }
});

router.get("/admin/research-publications", requireAdmin, async (request, response) => {
  try {
    const where = buildResearchPublicationWhere(request.query, { publicOnly: false });
    const items = await prisma.researchPublication.findMany({
      where,
      include: {
        comments: {
          include: {
            replies: true,
          },
        },
      },
      orderBy: [{ publishedDate: "desc" }, { createdAt: "desc" }],
    });

    return response.json(
      buildResearchSuccessResponse(
        "Research publications loaded successfully.",
        items.map(serializeResearchPublication),
        {
          sync: getResearchSyncRuntimeState(),
          mode: "automatic-orcid-crossref",
        },
      ),
    );
  } catch (error) {
    console.error("Failed to load admin research publications:", error.message);
    return response.status(500).json(buildResearchErrorResponse("Failed to load research publications."));
  }
});

router.get("/admin/research-publications/sync-status", requireAdmin, (_request, response) => {
  return response.json(
    buildResearchSuccessResponse(
      "Research synchronization status loaded.",
      getResearchSyncRuntimeState(),
    ),
  );
});

router.post("/admin/research-publications/sync", requireAdmin, async (request, response) => {
  try {
    const result = await syncResearchPublications({ reason: "admin-manual" });
    request.app.get("io")?.emit("content:updated", {
      scope: "research",
      action: "sync",
      updatedAt: new Date().toISOString(),
      result,
    });

    return response.json(
      buildResearchSuccessResponse("Research publications synchronized successfully.", result, {
        sync: getResearchSyncRuntimeState(),
      }),
    );
  } catch (error) {
    console.error("Failed to synchronize research publications:", error.message);
    return response.status(502).json(
      buildResearchErrorResponse("Failed to synchronize research publications from ORCID/Crossref.", {
        error: error.message,
      }),
    );
  }
});

startResearchAutoSync();

module.exports = router;
