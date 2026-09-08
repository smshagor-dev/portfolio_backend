const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");

// Augment the existing cached routers so the feature works without duplicating
// the main site/admin route modules.
const siteRouter = require("./site");
const adminRouter = require("./admin");

const COLLECTION = "linkedin_posts";
const DEFAULT_LINKEDIN_EMBED_URL =
  "https://www.linkedin.com/embed/feed/update/urn:li:share:7502991980113838081?collapsed=1";
const DEFAULT_POST_ID = "linkedin-default-7502991980113838081";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, fallback = true) {
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

function normalizeSortOrder(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createPostId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `linkedin-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function extractLinkedInEmbedUrl(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  const iframeMatch = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  const candidate = normalizeString(iframeMatch?.[1] || raw).replace(/&amp;/gi, "&");

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (!["linkedin.com", "www.linkedin.com"].includes(hostname)) {
      return "";
    }

    if (!/^\/embed\/feed\/update\/urn:li:(?:share|activity|ugcpost):\d+\/?$/i.test(url.pathname)) {
      return "";
    }

    url.protocol = "https:";
    url.hostname = "www.linkedin.com";
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function deriveLinkedInPostUrl(embedUrl) {
  try {
    const url = new URL(embedUrl);
    const match = url.pathname.match(
      /^\/embed\/feed\/update\/(urn:li:(?:share|activity|ugcpost):\d+)\/?$/i,
    );
    return match ? `https://www.linkedin.com/feed/update/${match[1]}/` : "";
  } catch (_error) {
    return "";
  }
}

function serializeLinkedInPost(document) {
  const embedUrl = extractLinkedInEmbedUrl(document?.embedUrl || "");
  return {
    id: normalizeString(document?._id),
    title: normalizeString(document?.title) || "LinkedIn Post",
    embedUrl,
    postUrl: normalizeString(document?.postUrl) || deriveLinkedInPostUrl(embedUrl),
    status: document?.status !== false,
    sortOrder: normalizeSortOrder(document?.sortOrder, 1),
    createdAt: document?.createdAt || "",
    updatedAt: document?.updatedAt || "",
  };
}

function buildDefaultDocument() {
  const now = new Date().toISOString();
  return {
    _id: DEFAULT_POST_ID,
    title: "Featured LinkedIn Post",
    embedUrl: DEFAULT_LINKEDIN_EMBED_URL,
    postUrl: deriveLinkedInPostUrl(DEFAULT_LINKEDIN_EMBED_URL),
    status: true,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  };
}

async function findLinkedInPosts(filter = {}) {
  const result = await prisma.$runCommandRaw({
    find: COLLECTION,
    filter,
    sort: { sortOrder: 1, createdAt: -1 },
  });
  return Array.isArray(result?.cursor?.firstBatch) ? result.cursor.firstBatch : [];
}

async function findLinkedInPostById(id) {
  const items = await findLinkedInPosts({ _id: id });
  return items[0] || null;
}

async function ensureDefaultLinkedInPost() {
  const existing = await findLinkedInPosts();
  if (existing.length > 0) {
    return existing;
  }

  const document = buildDefaultDocument();
  try {
    await prisma.$runCommandRaw({
      insert: COLLECTION,
      documents: [document],
    });
    return [document];
  } catch (error) {
    // A concurrent request may have seeded the collection first.
    const current = await findLinkedInPosts();
    if (current.length > 0) {
      return current;
    }
    throw error;
  }
}

function buildPublicFallback() {
  return [serializeLinkedInPost(buildDefaultDocument())];
}

function emitLinkedInUpdated(request, action, post = null) {
  request.app.get("io")?.emit("content:updated", {
    scope: "linkedin-posts",
    action,
    postId: post?.id || "",
    updatedAt: new Date().toISOString(),
  });
}

siteRouter.get("/linkedin-posts", async (_request, response) => {
  try {
    const documents = await ensureDefaultLinkedInPost();
    const posts = documents
      .map(serializeLinkedInPost)
      .filter((post) => post.status && post.embedUrl);

    return response.json({
      success: true,
      data: posts,
    });
  } catch (error) {
    console.error("Failed to load LinkedIn posts:", error.message);
    return response.json({
      success: true,
      data: buildPublicFallback(),
      degraded: true,
    });
  }
});

adminRouter.get("/linkedin-posts", requireAdmin, async (_request, response) => {
  try {
    const documents = await ensureDefaultLinkedInPost();
    return response.json({
      success: true,
      data: documents.map(serializeLinkedInPost),
    });
  } catch (error) {
    console.error("Failed to load admin LinkedIn posts:", error.message);
    return response.status(500).json({
      success: false,
      message: "Failed to load LinkedIn posts.",
      data: [],
    });
  }
});

adminRouter.post("/linkedin-posts", requireAdmin, async (request, response) => {
  try {
    const embedUrl = extractLinkedInEmbedUrl(
      request.body?.embedUrl ||
        request.body?.embedInput ||
        request.body?.embedCode ||
        request.body?.iframe,
    );

    if (!embedUrl) {
      return response.status(400).json({
        success: false,
        message: "Paste a valid LinkedIn embed URL or iframe code.",
      });
    }

    const now = new Date().toISOString();
    const document = {
      _id: createPostId(),
      title: normalizeString(request.body?.title).slice(0, 140) || "LinkedIn Post",
      embedUrl,
      postUrl: deriveLinkedInPostUrl(embedUrl),
      status: normalizeBoolean(request.body?.status, true),
      sortOrder: normalizeSortOrder(request.body?.sortOrder, 1),
      createdAt: now,
      updatedAt: now,
    };

    await prisma.$runCommandRaw({
      insert: COLLECTION,
      documents: [document],
    });

    const post = serializeLinkedInPost(document);
    emitLinkedInUpdated(request, "created", post);
    return response.status(201).json({
      success: true,
      message: "LinkedIn post added successfully.",
      data: post,
    });
  } catch (error) {
    console.error("Failed to create LinkedIn post:", error.message);
    return response.status(500).json({
      success: false,
      message: "Failed to add LinkedIn post.",
    });
  }
});

adminRouter.put("/linkedin-posts/:postId", requireAdmin, async (request, response) => {
  try {
    const postId = normalizeString(request.params.postId);
    if (!postId) {
      return response.status(400).json({ success: false, message: "Post id is required." });
    }

    const existing = await findLinkedInPostById(postId);
    if (!existing) {
      return response.status(404).json({ success: false, message: "LinkedIn post not found." });
    }

    const suppliedEmbed =
      request.body?.embedUrl ||
      request.body?.embedInput ||
      request.body?.embedCode ||
      request.body?.iframe;
    const embedUrl = suppliedEmbed
      ? extractLinkedInEmbedUrl(suppliedEmbed)
      : extractLinkedInEmbedUrl(existing.embedUrl);

    if (!embedUrl) {
      return response.status(400).json({
        success: false,
        message: "Paste a valid LinkedIn embed URL or iframe code.",
      });
    }

    const update = {
      title: normalizeString(request.body?.title || existing.title).slice(0, 140) || "LinkedIn Post",
      embedUrl,
      postUrl: deriveLinkedInPostUrl(embedUrl),
      status: normalizeBoolean(request.body?.status, existing.status !== false),
      sortOrder: normalizeSortOrder(request.body?.sortOrder, existing.sortOrder || 1),
      updatedAt: new Date().toISOString(),
    };

    await prisma.$runCommandRaw({
      update: COLLECTION,
      updates: [
        {
          q: { _id: postId },
          u: { $set: update },
          upsert: false,
          multi: false,
        },
      ],
    });

    const saved = serializeLinkedInPost({ ...existing, ...update });
    emitLinkedInUpdated(request, "updated", saved);
    return response.json({
      success: true,
      message: "LinkedIn post updated successfully.",
      data: saved,
    });
  } catch (error) {
    console.error("Failed to update LinkedIn post:", error.message);
    return response.status(500).json({
      success: false,
      message: "Failed to update LinkedIn post.",
    });
  }
});

adminRouter.delete("/linkedin-posts/:postId", requireAdmin, async (request, response) => {
  try {
    const postId = normalizeString(request.params.postId);
    if (!postId) {
      return response.status(400).json({ success: false, message: "Post id is required." });
    }

    const existing = await findLinkedInPostById(postId);
    if (!existing) {
      return response.status(404).json({ success: false, message: "LinkedIn post not found." });
    }

    await prisma.$runCommandRaw({
      delete: COLLECTION,
      deletes: [{ q: { _id: postId }, limit: 1 }],
    });

    const post = serializeLinkedInPost(existing);
    emitLinkedInUpdated(request, "deleted", post);
    return response.json({
      success: true,
      message: "LinkedIn post deleted successfully.",
      data: post,
    });
  } catch (error) {
    console.error("Failed to delete LinkedIn post:", error.message);
    return response.status(500).json({
      success: false,
      message: "Failed to delete LinkedIn post.",
    });
  }
});

module.exports = {
  DEFAULT_LINKEDIN_EMBED_URL,
  extractLinkedInEmbedUrl,
};
