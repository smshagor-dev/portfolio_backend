const express = require("express");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");
const {
  buildResearchPublicationWhere,
  hasResearchPublicationModel,
  normalizeResearchPublicationPayload,
  normalizeString,
  serializeResearchPublication,
  validateResearchPublicationPayload,
} = require("../lib/research-publications");

const router = express.Router();

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

function emitResearchContentUpdated(request, action, publication) {
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

async function incrementResearchPublicationMetric(slug, fieldName) {
  const normalizedSlug = normalizeString(slug).toLowerCase();
  if (!normalizedSlug || !["views", "impression_count", "share_count"].includes(fieldName)) {
    return;
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE research_publications SET ${fieldName} = COALESCE(${fieldName}, 0) + 1 WHERE slug = ?`,
      normalizedSlug,
    );
  } catch (_error) {
    // Ignore until the metric columns are available in the database.
  }
}

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

    const [items, total, publicationTypes, researchAreas, statuses] = await Promise.all([
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
      prisma.researchPublication.findMany({
        select: { status: true },
        distinct: ["status"],
        orderBy: { status: "asc" },
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
            status: normalizeString(request.query.status) || "published",
            featured: normalizeString(request.query.featured),
          },
          options: {
            publicationTypes: publicationTypes
              .map((item) => item.publicationType)
              .filter(Boolean),
            researchAreas: researchAreas
              .map((item) => item.researchArea)
              .filter(Boolean),
            statuses: statuses
              .map((item) => item.status)
              .filter(Boolean),
          },
        },
      ),
    );
  } catch (error) {
    console.error("Failed to load research publications:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to load research publications."));
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
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to load featured research publications."));
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
    const [publication, relatedPublications] = await Promise.all([
      prisma.researchPublication.findFirst({
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
      }),
      prisma.researchPublication.findMany({
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
      }),
    ]);

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    await incrementResearchPublicationMetric(slug, "views");
    const updatedPublication = await prisma.researchPublication.findFirst({
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

    return response.json(
      buildResearchSuccessResponse(
        "Research publication loaded successfully.",
        {
          ...serializeResearchPublication(updatedPublication || publication),
          comments: ((updatedPublication || publication)?.comments || []).map(serializeResearchComment),
        },
        {
          relatedPublications: relatedPublications.map(serializeResearchPublication),
        },
      ),
    );
  } catch (error) {
    console.error("Failed to load research publication detail:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to load research publication."));
  }
});

router.post("/research-publications/:slug/comments", async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const slug = normalizeString(request.params.slug).toLowerCase();
    const name = normalizeString(request.body?.name);
    const commentText = normalizeString(request.body?.comment);

    if (!name || !commentText) {
      return response.status(400).json(buildResearchErrorResponse("Name and comment are required."));
    }

    const publication = await prisma.researchPublication.findFirst({
      where: {
        slug,
        status: "published",
      },
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
    if (!hasResearchPublicationModel()) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const slug = normalizeString(request.params.slug).toLowerCase();
    const commentId = Number.parseInt(request.params.commentId, 10);
    const name = normalizeString(request.body?.name);
    const replyText = normalizeString(request.body?.reply);

    if (!commentId || !name || !replyText) {
      return response.status(400).json(buildResearchErrorResponse("Name and reply are required."));
    }

    const publication = await prisma.researchPublication.findFirst({
      where: {
        slug,
        status: "published",
      },
      select: {
        id: true,
      },
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
    if (!hasResearchPublicationModel()) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const slug = normalizeString(request.params.slug).toLowerCase();
    const publication = await prisma.researchPublication.findFirst({
      where: {
        slug,
        status: "published",
      },
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
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to track research publication impression."));
  }
});

router.post("/research-publications/:slug/share", async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const slug = normalizeString(request.params.slug).toLowerCase();
    const publication = await prisma.researchPublication.findFirst({
      where: {
        slug,
        status: "published",
      },
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
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to track research publication share."));
  }
});

router.get("/admin/research-publications", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const where = buildResearchPublicationWhere(request.query, { publicOnly: false });
    const items = await prisma.researchPublication.findMany({
      where,
      orderBy: [{ publishedDate: "desc" }, { createdAt: "desc" }],
    });

    return response.json(
      buildResearchSuccessResponse(
        "Admin research publications loaded successfully.",
        items.map(serializeResearchPublication),
      ),
    );
  } catch (error) {
    console.error("Failed to load admin research publications:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to load research publications."));
  }
});

router.get("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const publicationId = Number.parseInt(request.params.id, 10);
    if (!publicationId) {
      return response.status(400).json(buildResearchErrorResponse("A valid publication id is required."));
    }

    const publication = await prisma.researchPublication.findUnique({
      where: { id: publicationId },
    });

    if (!publication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    return response.json(
      buildResearchSuccessResponse(
        "Admin research publication loaded successfully.",
        serializeResearchPublication(publication),
      ),
    );
  } catch (error) {
    console.error("Failed to load admin research publication:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to load research publication."));
  }
});

router.post("/admin/research-publications", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const payload = normalizeResearchPublicationPayload(request.body);
    const validationError = validateResearchPublicationPayload(payload);

    if (validationError) {
      return response.status(400).json(buildResearchErrorResponse(validationError));
    }

    const createdPublication = await prisma.researchPublication.create({
      data: payload,
    });

    emitResearchContentUpdated(request, "created", createdPublication);

    return response.status(201).json(
      buildResearchSuccessResponse(
        "Research publication created successfully.",
        serializeResearchPublication(createdPublication),
      ),
    );
  } catch (error) {
    if (error?.code === "P2002") {
      return response
        .status(409)
        .json(buildResearchErrorResponse("A research publication with this slug already exists."));
    }

    console.error("Failed to create research publication:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to create research publication."));
  }
});

router.put("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const publicationId = Number.parseInt(request.params.id, 10);
    if (!publicationId) {
      return response.status(400).json(buildResearchErrorResponse("A valid publication id is required."));
    }

    const existingPublication = await prisma.researchPublication.findUnique({
      where: { id: publicationId },
    });

    if (!existingPublication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    const payload = normalizeResearchPublicationPayload(request.body, existingPublication);
    const validationError = validateResearchPublicationPayload(payload);

    if (validationError) {
      return response.status(400).json(buildResearchErrorResponse(validationError));
    }

    const updatedPublication = await prisma.researchPublication.update({
      where: { id: publicationId },
      data: payload,
    });

    emitResearchContentUpdated(request, "updated", updatedPublication);

    return response.json(
      buildResearchSuccessResponse(
        "Research publication updated successfully.",
        serializeResearchPublication(updatedPublication),
      ),
    );
  } catch (error) {
    if (error?.code === "P2002") {
      return response
        .status(409)
        .json(buildResearchErrorResponse("A research publication with this slug already exists."));
    }

    console.error("Failed to update research publication:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to update research publication."));
  }
});

router.delete("/admin/research-publications/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasResearchPublicationModel()) {
      return response.status(503).json(
        buildResearchErrorResponse(
          "Research publication model is not available yet. Restart the backend after generating the Prisma client.",
        ),
      );
    }

    const publicationId = Number.parseInt(request.params.id, 10);
    if (!publicationId) {
      return response.status(400).json(buildResearchErrorResponse("A valid publication id is required."));
    }

    const existingPublication = await prisma.researchPublication.findUnique({
      where: { id: publicationId },
      select: {
        id: true,
        slug: true,
        status: true,
        isFeatured: true,
      },
    });

    if (!existingPublication) {
      return response.status(404).json(buildResearchErrorResponse("Research publication not found."));
    }

    await prisma.researchPublication.delete({
      where: { id: publicationId },
    });

    emitResearchContentUpdated(request, "deleted", existingPublication);

    return response.json(
      buildResearchSuccessResponse("Research publication deleted successfully.", { id: publicationId }),
    );
  } catch (error) {
    console.error("Failed to delete research publication:", error.message);
    return response
      .status(500)
      .json(buildResearchErrorResponse("Failed to delete research publication."));
  }
});

module.exports = router;
