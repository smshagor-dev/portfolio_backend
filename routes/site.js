const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const prisma = require("../lib/prisma");
const { getNextIntId } = require("../lib/next-id");
const { getBearerToken, verifyAdminToken } = require("../lib/auth");
const {
  getDefaultSiteSettings,
  isSmtpConfigured,
  normalizeSiteSettings,
  serializeSiteSettings,
} = require("../lib/site-settings");
const {
  buildMessageActionUrl,
  createAdminNotification,
  emitAdminNotification,
} = require("../lib/admin-notifications");
const { generatePortfolioAssistantReply } = require("../services/contact-assistant");
const {
  buildEmailAttachment,
  createMemoryUpload,
  deleteStoredFile,
  storeUploadedFile,
} = require("../lib/upload-storage");

const router = express.Router();

function buildContactChatHash(ticketId, token) {
  const normalizedId = String(ticketId || "").trim();
  const normalizedToken = String(token || "").trim();

  if (!normalizedId || !normalizedToken) {
    return "";
  }

  return `${normalizedId}.${normalizedToken}`;
}

function buildContactChatUrl(canonicalUrl, ticketId, token) {
  const chatHash = buildContactChatHash(ticketId, token);
  const normalizedBaseUrl = String(canonicalUrl || "").trim();

  if (!chatHash || !normalizedBaseUrl) {
    return "";
  }

  try {
    return new URL(`/chat/${chatHash}`, normalizedBaseUrl).toString();
  } catch (_error) {
    return "";
  }
}

const upload = createMemoryUpload({
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed."));
      return;
    }

    callback(null, true);
  },
});

const contactUpload = createMemoryUpload({
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname === "photo" && !file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed for photo upload."));
      return;
    }

    callback(null, true);
  },
});

const contactChatUpload = createMemoryUpload({
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname === "photo" && !file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed for photo upload."));
      return;
    }

    callback(null, true);
  },
});

function serializeService(service) {
  return {
    ...service,
    comments: (service.comments || []).map((comment) => ({
      ...comment,
      replies: comment.replies || [],
    })),
  };
}

function serializePricing(pricing) {
  return {
    ...pricing,
    features: Array.isArray(pricing?.features) ? pricing.features : [],
  };
}

function serializeFaq(faq) {
  return {
    ...faq,
    answer: faq?.answer || "",
    status: typeof faq?.status === "boolean" ? faq.status : true,
  };
}

function serializeTestimonial(testimonial) {
  return {
    ...testimonial,
    image: testimonial?.image || "/DefaultUser.png",
    position: testimonial?.position || "",
    stars: Math.max(1, Math.min(5, Number(testimonial?.stars) || 5)),
  };
}

function serializeArticle(article) {
  const comments = (article?.comments || []).map(serializeArticleComment);
  const replyCount = comments.reduce((sum, item) => sum + (item.replies?.length || 0), 0);

  return {
    ...article,
    tags: Array.isArray(article?.tags) ? article.tags : [],
    categories: (article?.categories || []).map((item) => ({
      id: item.category?.id ?? item.id,
      name: item.category?.name ?? item.name,
      slug: item.category?.slug ?? item.slug,
    })),
    featuredImage: article?.featuredImage || "",
    metaTitle: article?.metaTitle || "",
    metaDescription: article?.metaDescription || "",
    commentsEnabled: typeof article?.commentsEnabled === "boolean" ? article.commentsEnabled : true,
    isFeatured: typeof article?.isFeatured === "boolean" ? article.isFeatured : false,
    views: Math.max(0, Number.parseInt(article?.views, 10) || 0),
    impressionCount: Math.max(0, Number.parseInt(article?.impressionCount, 10) || 0),
    shareCount: Math.max(0, Number.parseInt(article?.shareCount, 10) || 0),
    commentCount: comments.length,
    replyCount,
    comments,
  };
}

function normalizeString(value) {
  return String(value || "").trim();
}

function createTicketToken() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeTrackingPath(value) {
  const pathValue = String(value || "").trim();
  if (!pathValue || !pathValue.startsWith("/")) {
    return "/";
  }

  return pathValue.slice(0, 191);
}

function normalizeTrackingSessionId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 120);
}

function getUtcDateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getRequestIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = String(request.headers["x-real-ip"] || "").trim();
  if (realIp) {
    return realIp;
  }

  const socketAddress = String(request.socket?.remoteAddress || "").trim();
  return socketAddress.replace(/^::ffff:/, "");
}

function mergeGeoDetails(primary = {}, fallback = {}) {
  return {
    country: normalizeString(primary.country) || normalizeString(fallback.country),
    region: normalizeString(primary.region) || normalizeString(fallback.region),
    city: normalizeString(primary.city) || normalizeString(fallback.city),
  };
}

function isPublicIp(ip) {
  if (!ip) {
    return false;
  }

  const value = ip.replace(/^::ffff:/, "");
  return !(
    value === "127.0.0.1" ||
    value === "::1" ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value)
  );
}

async function lookupGeoDetails(request, ipAddress) {
  const headerCountry = normalizeString(request.headers["x-vercel-ip-country"]);
  const headerRegion = normalizeString(request.headers["x-vercel-ip-country-region"]);
  const headerCity = normalizeString(request.headers["x-vercel-ip-city"]);

  if (headerCountry || headerRegion || headerCity) {
    return {
      country: headerCountry,
      region: headerRegion,
      city: headerCity,
    };
  }

  if (!isPublicIp(ipAddress)) {
    return { country: "", region: "", city: "" };
  }

  try {
    const geoResponse = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ipAddress)}?fields=status,country,regionName,city`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!geoResponse.ok) {
      return { country: "", region: "", city: "" };
    }

    const geoData = await geoResponse.json();
    if (geoData?.status !== "success") {
      return { country: "", region: "", city: "" };
    }

    return {
      country: normalizeString(geoData.country),
      region: normalizeString(geoData.regionName),
      city: normalizeString(geoData.city),
    };
  } catch (_error) {
    return { country: "", region: "", city: "" };
  }
}

function buildGeoUpdateData(geoDetails = {}) {
  const country = normalizeString(geoDetails.country);
  const region = normalizeString(geoDetails.region);
  const city = normalizeString(geoDetails.city);

  return {
    ...(country ? { country } : {}),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
  };
}

async function recordAnalyticsDailyVisit(sessionRef, visitDate, path) {
  const updateResult = await prisma.analyticsDailyVisit.updateMany({
    where: {
      sessionRef,
      visitDate,
    },
    data: {
      path,
    },
  });

  if (updateResult.count > 0) {
    return;
  }

  try {
    await prisma.analyticsDailyVisit.create({
      data: {
        sessionRef,
        visitDate,
        path,
      },
    });
  } catch (error) {
    if (error?.code !== "P2002") {
      throw error;
    }

    await prisma.analyticsDailyVisit.updateMany({
      where: {
        sessionRef,
        visitDate,
      },
      data: {
        path,
      },
    });
  }
}

async function recordAnalyticsPageView(sessionRef, path, now) {
  const updateResult = await prisma.analyticsPageView.updateMany({
    where: {
      sessionRef,
      path,
    },
    data: {
      lastViewedAt: now,
      viewCount: {
        increment: 1,
      },
    },
  });

  if (updateResult.count > 0) {
    return;
  }

  try {
    await prisma.analyticsPageView.create({
      data: {
        sessionRef,
        path,
        firstViewedAt: now,
        lastViewedAt: now,
        viewCount: 1,
      },
    });
  } catch (error) {
    if (error?.code !== "P2002") {
      throw error;
    }

    await prisma.analyticsPageView.updateMany({
      where: {
        sessionRef,
        path,
      },
      data: {
        lastViewedAt: now,
        viewCount: {
          increment: 1,
        },
      },
    });
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function convertPlainTextToHtml(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");
}

function serializeProject(project) {
  return {
    ...project,
    tools: Array.isArray(project?.tools) ? project.tools : [],
    buttons: Array.isArray(project?.buttons) ? project.buttons : [],
    comments: (project.comments || []).map((comment) => ({
      ...comment,
      replies: comment.replies || [],
    })),
  };
}

function serializeContactChatMessage(message) {
  return {
    id: message.id,
    contactMessageId: message.contactMessageId,
    senderType: message.senderType,
    senderName: message.senderName || "",
    message: message.message,
    photo: message.photo || "",
    file: message.file || "",
    createdAt: message.createdAt,
  };
}

function serializeContactTicket(contactMessage) {
  return {
    id: contactMessage.id,
    name: contactMessage.name,
    email: contactMessage.email,
    subject: contactMessage.subject || "",
    photo: contactMessage.photo || "",
    file: contactMessage.file || "",
    status: contactMessage.status || "not_solved",
    createdAt: contactMessage.createdAt,
    chatMessages: (contactMessage.chatMessages || []).map(serializeContactChatMessage),
  };
}

async function createAssistantChatReply(contactMessageId, visitorMessage) {
  const normalizedMessage = normalizeString(visitorMessage);

  if (!contactMessageId || !normalizedMessage) {
    return null;
  }

  const reply = await generatePortfolioAssistantReply(normalizedMessage).catch((error) => {
    console.error("Failed to generate assistant chat reply:", error.message);
    return "";
  });

  const normalizedReply = normalizeString(reply);
  if (!normalizedReply) {
    return null;
  }

  return prisma.contactChatMessage.create({
    data: {
      contactMessageId,
      senderType: "assistant",
      senderName: "Shagor Assistant",
      message: normalizedReply,
      photo: "",
      file: "",
    },
  });
}

async function getContactTicketById(id) {
  return prisma.contactMessage.findUnique({
    where: { id },
    include: {
      chatMessages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

function hasPricingModel() {
  return Boolean(prisma?.pricing && typeof prisma.pricing.findMany === "function");
}

function hasFaqModel() {
  return Boolean(prisma?.faq && typeof prisma.faq.findMany === "function");
}

function hasTestimonialModel() {
  return Boolean(prisma?.testimonial && typeof prisma.testimonial.findMany === "function");
}

function hasArticleModel() {
  return Boolean(prisma?.article && typeof prisma.article.findMany === "function");
}

function hasEmergencyContactModel() {
  return Boolean(prisma?.emergencyContact && typeof prisma.emergencyContact.findMany === "function");
}

function getPublishedArticleWhere() {
  return {
    status: "published",
    OR: [{ publishDate: null }, { publishDate: { lte: new Date() } }],
  };
}

function serializeArticleReply(reply) {
  return {
    id: reply.id,
    commentId: reply.commentId,
    name: reply.name || "",
    reply: reply.reply,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt,
  };
}

function serializeArticleComment(comment) {
  return {
    id: comment.id,
    articleId: comment.articleId,
    name: comment.name || "",
    comment: comment.comment,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies: (comment.replies || []).map(serializeArticleReply),
  };
}

function normalizeArticleMetricRecord(record) {
  return {
    id: Number.parseInt(record?.id, 10) || 0,
    views: Math.max(0, Number.parseInt(record?.views, 10) || 0),
    impressionCount: Math.max(0, Number.parseInt(record?.impressionCount, 10) || 0),
    shareCount: Math.max(0, Number.parseInt(record?.shareCount, 10) || 0),
  };
}

async function getArticleMetricsByIds(articleIds) {
  const normalizedIds = Array.from(
    new Set(
      (articleIds || [])
        .map((item) => Number.parseInt(item, 10))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );

  if (!normalizedIds.length) {
    return new Map();
  }

  const rows = await prisma.article.findMany({
    where: {
      id: {
        in: normalizedIds,
      },
    },
    select: {
      id: true,
      views: true,
      impressionCount: true,
      shareCount: true,
    },
  });

  return new Map(rows.map((row) => {
    const normalized = normalizeArticleMetricRecord(row);
    return [normalized.id, normalized];
  }));
}

async function attachArticleMetrics(articles) {
  const metricsMap = await getArticleMetricsByIds((articles || []).map((item) => item?.id));
  return (articles || []).map((article) => {
    const metrics = metricsMap.get(article.id);
    return {
      ...article,
      views: metrics?.views || 0,
      impressionCount: metrics?.impressionCount || 0,
      shareCount: metrics?.shareCount || 0,
    };
  });
}

async function incrementArticleMetric(slug, fieldName) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  if (!normalizedSlug || !["views", "impressionCount", "shareCount"].includes(fieldName)) {
    return;
  }

  await prisma.article.updateMany({
    where: { slug: normalizedSlug },
    data: {
      [fieldName]: {
        increment: 1,
      },
    },
  }).catch(() => {
    // Ignore until the article metric fields are available.
  });
}

function isMissingTableError(error, modelName) {
  return error?.code === "P2021" && error?.meta?.modelName === modelName;
}

async function getAchievementsSafely() {
  try {
    return await prisma.achievement.findMany({ orderBy: { sortOrder: "asc" } });
  } catch (error) {
    if (isMissingTableError(error, "Achievement")) {
      return [];
    }

    throw error;
  }
}

async function getTestimonialsSafely() {
  if (!hasTestimonialModel()) {
    return [];
  }

  try {
    const publishedTestimonials = await prisma.testimonial.findMany({
      where: { status: true },
      orderBy: { sortOrder: "asc" },
    });

    if (publishedTestimonials.length > 0) {
      return publishedTestimonials;
    }

    return await prisma.testimonial.findMany({
      orderBy: { sortOrder: "asc" },
    });
  } catch (error) {
    if (isMissingTableError(error, "Testimonial")) {
      return [];
    }

    throw error;
  }
}

async function getNextTestimonialSortOrder() {
  if (!hasTestimonialModel()) {
    return 1;
  }

  const latestItem = await prisma.testimonial.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return (latestItem?.sortOrder || 0) + 1;
}

async function getSiteSettingsRecord() {
  const existingSettings = await prisma.siteSettings.findUnique({
    where: { id: 1 },
  });

  if (existingSettings) {
    return existingSettings;
  }

  const defaults = getDefaultSiteSettings();
  return prisma.siteSettings.create({
    data: defaults,
  });
}

async function sendContactEmails(siteSettings, message) {
  const normalizedSettings = normalizeSiteSettings(siteSettings);
  if (!isSmtpConfigured(normalizedSettings)) {
    return;
  }
  const chatUrl = buildContactChatUrl(
    normalizedSettings.canonicalUrl,
    message.id,
    message.ticketToken,
  );

  const transporter = nodemailer.createTransport({
    host: normalizedSettings.smtpHost,
    port: normalizedSettings.smtpPort,
    secure: normalizedSettings.smtpSecure,
    auth:
      normalizedSettings.smtpUser || normalizedSettings.smtpPass
        ? {
            user: normalizedSettings.smtpUser,
            pass: normalizedSettings.smtpPass,
          }
        : undefined,
  });

  const from = normalizedSettings.smtpFromName
    ? `"${normalizedSettings.smtpFromName}" <${normalizedSettings.smtpFromEmail}>`
    : normalizedSettings.smtpFromEmail;

  const replyTo = normalizedSettings.smtpReplyToEmail || message.email;

  const attachments = [message.photo, message.file]
    .filter(Boolean)
    .map((filePath) => buildEmailAttachment(filePath))
    .filter(Boolean);

  await transporter.sendMail({
    from,
    to: normalizedSettings.smtpToEmail,
    replyTo,
    subject: message.subject
      ? `New contact message: ${message.subject}`
      : `New contact message from ${message.name}`,
    text: [
      `Name: ${message.name}`,
      `Email: ${message.email}`,
      message.subject ? `Subject: ${message.subject}` : null,
      message.photo ? `Photo: ${message.photo}` : null,
      message.file ? `File: ${message.file}` : null,
      "",
      "Message:",
      message.message,
    ].filter((item) => item !== null).join("\n"),
    attachments,
  });

  await transporter.sendMail({
    from,
    to: message.email,
    replyTo: normalizedSettings.smtpReplyToEmail || normalizedSettings.smtpFromEmail,
    subject: `We received your message${normalizedSettings.websiteTitle ? ` | ${normalizedSettings.websiteTitle}` : ""}`,
    text: [
      `Hi ${message.name},`,
      "",
      "Thanks for reaching out. Your message has been received successfully.",
      "We will get back to you as soon as possible.",
      chatUrl ? "You can reopen your private chat any time using this link:" : null,
      chatUrl || null,
      "",
      "Your message:",
      message.message,
    ].filter(Boolean).join("\n"),
  });
}

async function getOptionalAdmin(request) {
  try {
    const token = getBearerToken(request.headers);
    if (!token) {
      return null;
    }

    const payload = verifyAdminToken(token);
    if (!payload?.email) {
      return null;
    }

    return prisma.adminUser.findUnique({
      where: { email: payload.email },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  } catch (_error) {
    return null;
  }
}

async function getBlogs(devUsername) {
  if (!devUsername) {
    return [];
  }

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 4000);
    let response;

    try {
      response = await fetch(
        `https://dev.to/api/articles?username=${encodeURIComponent(devUsername)}`,
        {
          headers: {
            Accept: "application/json",
          },
          signal: abortController.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return [];
    }

    const blogs = await response.json();

    return blogs.filter((blog) => blog?.cover_image);
  } catch (error) {
    console.error("Failed to fetch blogs:", error.message);
    return [];
  }
}

async function getFaqsSafely() {
  if (!hasFaqModel()) {
    return [];
  }

  try {
    const publishedFaqs = await prisma.faq.findMany({
      where: { status: true },
      orderBy: { sortOrder: "asc" },
    });

    if (publishedFaqs.length > 0) {
      return publishedFaqs;
    }

    return await prisma.faq.findMany({
      orderBy: { sortOrder: "asc" },
    });
  } catch (error) {
    if (isMissingTableError(error, "Faq")) {
      return [];
    }

    throw error;
  }
}

router.get("/home", async (_request, response) => {
  try {
    const [profile, siteSettings, serviceSection, services, statsCounters, achievements, skills, experiences, projects, educations, pricings, faqs, testimonials, articles, emergencyContacts] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
      prisma.serviceSection.findUnique({ where: { id: 1 } }),
      prisma.service.findMany({
        where: { status: true },
        orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          impressionCount: true,
          description: true,
          isFeatured: true,
          icon: true,
          views: true,
          sortOrder: true,
          _count: {
            select: {
              comments: true,
            },
          },
        },
      }),
      prisma.statsCounter.findMany({ orderBy: { sortOrder: "asc" } }),
      getAchievementsSafely(),
      prisma.skill.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.experience.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.project.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          tools: true,
          role: true,
          image: true,
          views: true,
          impressionCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.education.findMany({ orderBy: { sortOrder: "asc" } }),
      hasPricingModel()
        ? prisma.pricing.findMany({
            where: { status: true },
            orderBy: [{ isPopular: "desc" }, { sortOrder: "asc" }],
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              price: true,
              duration: true,
              features: true,
              isPopular: true,
              sortOrder: true,
            },
          })
        : Promise.resolve([]),
      getFaqsSafely(),
      getTestimonialsSafely(),
        hasArticleModel()
          ? prisma.article.findMany({
              where: getPublishedArticleWhere(),
              select: {
                id: true,
                title: true,
                slug: true,
                shortDescription: true,
                category: true,
                featuredImage: true,
                author: true,
                publishDate: true,
                status: true,
                categories: {
                  select: {
                    category: {
                      select: {
                        id: true,
                        name: true,
                        slug: true,
                      },
                    },
                  },
                },
                _count: {
                  select: {
                    comments: true,
                  },
                },
              },
              orderBy: [{ publishDate: "desc" }, { createdAt: "desc" }],
              take: 6,
            })
        : Promise.resolve([]),
      hasEmergencyContactModel()
        ? prisma.emergencyContact.findMany({
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          })
        : Promise.resolve([]),
    ]);

    if (!profile) {
      return response.status(404).json({ message: "Profile not found." });
    }

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      serviceSection,
      services: services.map((service) => ({
        id: service.id,
        slug: service.slug,
        name: service.name,
        impressionCount: service.impressionCount,
        description: service.description,
        isFeatured: service.isFeatured,
        icon: service.icon,
        views: service.views,
        sortOrder: service.sortOrder,
        commentCount: service._count?.comments || 0,
      })),
      statsCounters,
      achievements,
      skills,
      experiences,
      projects,
      educations,
      pricings: pricings.map(serializePricing),
      faqs: faqs.map(serializeFaq),
      testimonials: testimonials.map(serializeTestimonial),
      blogs: [],
      articles: (await attachArticleMetrics(articles)).map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        shortDescription: article.shortDescription,
        category: article.category,
        featuredImage: article.featuredImage || "",
        author: article.author,
        publishDate: article.publishDate,
        views: article.views || 0,
        impressionCount: article.impressionCount || 0,
        shareCount: article.shareCount || 0,
        commentCount: article._count?.comments || 0,
        replyCount: 0,
        categories: (article.categories || []).map((item) => ({
          id: item.category?.id ?? item.id,
          name: item.category?.name ?? item.name,
          slug: item.category?.slug ?? item.slug,
        })),
      })),
      emergencyContacts,
    });
  } catch (error) {
    console.error("Failed to load homepage data:", error.message);
    return response.status(500).json({ message: "Failed to load homepage data." });
  }
});

router.get("/pricing", async (_request, response) => {
  try {
    const [profile, siteSettings, pricings] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
      hasPricingModel()
        ? prisma.pricing.findMany({
            where: { status: true },
            orderBy: [{ isPopular: "desc" }, { sortOrder: "asc" }],
          })
        : Promise.resolve([]),
    ]);

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      pricings: pricings.map(serializePricing),
    });
  } catch (error) {
    console.error("Failed to load pricing data:", error.message);
    return response.status(500).json({ message: "Failed to load pricing data." });
  }
});

router.get("/pricing/:slug", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();

    const [profile, siteSettings, pricing, relatedPricings] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
      hasPricingModel()
        ? prisma.pricing.findUnique({
            where: { slug },
          })
        : Promise.resolve(null),
      hasPricingModel()
        ? prisma.pricing.findMany({
            where: { status: true, slug: { not: slug } },
            orderBy: [{ isPopular: "desc" }, { sortOrder: "asc" }],
            take: 3,
          })
        : Promise.resolve([]),
    ]);

    if (!pricing || !pricing.status) {
      return response.status(404).json({ message: "Pricing plan not found." });
    }

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      pricing: serializePricing(pricing),
      relatedPricings: relatedPricings.map(serializePricing),
    });
  } catch (error) {
    console.error("Failed to load pricing detail:", error.message);
    return response.status(500).json({ message: "Failed to load pricing detail." });
  }
});

router.get("/projects/:slug", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();

    const [profile, siteSettings, existingProject, relatedProjects] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
      prisma.project.findUnique({
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
      }),
      prisma.project.findMany({
        where: { slug: { not: slug } },
        orderBy: [{ sortOrder: "asc" }],
        take: 5,
      }),
    ]);

    if (!existingProject) {
      return response.status(404).json({ message: "Project not found." });
    }

    const project = await prisma.project.update({
      where: { slug },
      data: {
        views: {
          increment: 1,
        },
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

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      project: serializeProject(project),
      relatedProjects: relatedProjects.map(serializeProject),
    });
  } catch (error) {
    console.error("Failed to load project detail:", error.message);
    return response.status(500).json({ message: "Failed to load project detail." });
  }
});

router.post("/projects/:slug/impression", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();
    const project = await prisma.project.findUnique({
      where: { slug },
      select: {
        id: true,
      },
    });

    if (!project) {
      return response.status(404).json({ message: "Project not found." });
    }

    await prisma.project.update({
      where: { slug },
      data: {
        impressionCount: {
          increment: 1,
        },
      },
    });

    return response.status(201).json({ message: "Project impression tracked." });
  } catch (error) {
    console.error("Failed to track project impression:", error.message);
    return response.status(500).json({ message: "Failed to track project impression." });
  }
});

router.post("/projects/:slug/comments", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();
    const name = String(request.body?.name || "").trim();
    const commentText = String(request.body?.comment || "").trim();

    if (!name || !commentText) {
      return response.status(400).json({ message: "Name and comment are required." });
    }

    const project = await prisma.project.findUnique({
      where: { slug },
      include: {
        comments: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!project) {
      return response.status(404).json({ message: "Project not found." });
    }

    const savedComment = await prisma.projectComment.create({
      data: {
        projectId: project.id,
        name,
        comment: commentText,
        sortOrder: (project.comments?.[0]?.sortOrder || 0) + 1,
      },
      include: {
        replies: true,
      },
    });

    request.app.get("io")?.to(`project:${slug}`).emit("project:comment_created", {
      projectSlug: slug,
      comment: savedComment,
    });

    return response.status(201).json({
      message: "Comment saved successfully.",
      comment: savedComment,
    });
  } catch (error) {
    console.error("Failed to save project comment:", error.message);
    return response.status(500).json({ message: "Failed to save comment." });
  }
});

router.post("/projects/:slug/comments/:commentId/replies", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();
    const commentId = Number.parseInt(request.params.commentId, 10);
    const name = String(request.body?.name || "").trim();
    const replyText = String(request.body?.reply || "").trim();

    if (!commentId || !name || !replyText) {
      return response.status(400).json({ message: "Name and reply are required." });
    }

    const project = await prisma.project.findUnique({
      where: { slug },
      select: {
        id: true,
      },
    });

    if (!project) {
      return response.status(404).json({ message: "Project not found." });
    }

    const comment = await prisma.projectComment.findFirst({
      where: {
        id: commentId,
        projectId: project.id,
      },
      include: {
        replies: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!comment) {
      return response.status(404).json({ message: "Comment not found." });
    }

    const savedReply = await prisma.projectReply.create({
      data: {
        commentId: comment.id,
        name,
        reply: replyText,
        sortOrder: (comment.replies?.[0]?.sortOrder || 0) + 1,
      },
    });

    request.app.get("io")?.to(`project:${slug}`).emit("project:reply_created", {
      projectSlug: slug,
      commentId: comment.id,
      reply: savedReply,
    });

    return response.status(201).json({
      message: "Reply saved successfully.",
      reply: savedReply,
    });
  } catch (error) {
    console.error("Failed to save project reply:", error.message);
    return response.status(500).json({ message: "Failed to save reply." });
  }
});

router.get("/services", async (_request, response) => {
  try {
    const [profile, siteSettings, serviceSection, services] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
      prisma.serviceSection.findUnique({ where: { id: 1 } }),
      prisma.service.findMany({
        where: { status: true },
        orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
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
    ]);

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      serviceSection,
      services: services.map(serializeService),
    });
  } catch (error) {
    console.error("Failed to load services:", error.message);
    return response.status(500).json({ message: "Failed to load services." });
  }
});

router.get("/services/:slug", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();

    const [profile, siteSettings, serviceSection, existingService, relatedServices] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
      prisma.serviceSection.findUnique({ where: { id: 1 } }),
      prisma.service.findUnique({
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
      }),
      prisma.service.findMany({
        where: { status: true, slug: { not: slug } },
        orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
        take: 3,
        select: {
          id: true,
          slug: true,
          name: true,
          icon: true,
          views: true,
          impressionCount: true,
          _count: {
            select: {
              comments: true,
            },
          },
        },
      }),
    ]);

    if (!existingService || !existingService.status) {
      return response.status(404).json({ message: "Service not found." });
    }

    const service = await prisma.service.update({
      where: { slug },
      data: {
        views: {
          increment: 1,
        },
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

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      serviceSection,
      service: serializeService(service),
      relatedServices,
    });
  } catch (error) {
    console.error("Failed to load service detail:", error.message);
    return response.status(500).json({ message: "Failed to load service detail." });
  }
});

router.post("/services/:slug/impression", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();
    const service = await prisma.service.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
      },
    });

    if (!service || !service.status) {
      return response.status(404).json({ message: "Service not found." });
    }

    await prisma.service.update({
      where: { slug },
      data: {
        impressionCount: {
          increment: 1,
        },
      },
    });

    return response.status(201).json({ message: "Impression tracked." });
  } catch (error) {
    console.error("Failed to track service impression:", error.message);
    return response.status(500).json({ message: "Failed to track service impression." });
  }
});

router.post(
  "/services/upload-image",
  (request, response, next) => {
    upload.single("image")(request, response, (error) => {
      if (error) {
        return response.status(400).json({ message: error.message || "Upload failed." });
      }

      return next();
    });
  },
  async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "Please choose an image to upload." });
    }

    const uploadedFile = await storeUploadedFile(request.file, {
      directory: "uploads",
      fallbackBaseName: "service-image",
    });

    return response.status(201).json({
      message: "Image uploaded successfully.",
      path: uploadedFile.publicPath,
      publicUrl: uploadedFile.publicUrl,
    });
  },
);

router.post("/services/:slug/comments", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();
    const name = String(request.body?.name || "").trim();
    const photo = String(request.body?.photo || "").trim();
    const commentText = String(request.body?.comment || "").trim();

    if (!name || !commentText) {
      return response.status(400).json({ message: "Name and comment are required." });
    }

    const service = await prisma.service.findUnique({
      where: { slug },
      include: {
        comments: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!service || !service.status) {
      return response.status(404).json({ message: "Service not found." });
    }

    const savedComment = await prisma.serviceComment.create({
      data: {
        serviceId: service.id,
        photo: photo || "/profile.png",
        comment: commentText,
        impression: name,
        sortOrder: (service.comments?.[0]?.sortOrder || 0) + 1,
      },
      include: {
        replies: true,
      },
    });

    request.app.get("io")?.to(`service:${slug}`).emit("service:comment_created", {
      serviceSlug: slug,
      comment: savedComment,
    });

    return response.status(201).json({
      message: "Comment saved successfully.",
      comment: savedComment,
    });
  } catch (error) {
    console.error("Failed to save service comment:", error.message);
    return response.status(500).json({ message: "Failed to save comment." });
  }
});

router.post("/services/:slug/comments/:commentId/replies", async (request, response) => {
  try {
    const slug = String(request.params.slug || "").trim().toLowerCase();
    const commentId = Number.parseInt(request.params.commentId, 10);
    const replyText = String(request.body?.reply || "").trim();
    const fallbackName = String(request.body?.name || "").trim();
    const admin = await getOptionalAdmin(request);

    if (!commentId || !replyText) {
      return response.status(400).json({ message: "Reply is required." });
    }

    if (!admin && !fallbackName) {
      return response.status(400).json({ message: "Name is required for replies." });
    }

    const service = await prisma.service.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
      },
    });

    if (!service || !service.status) {
      return response.status(404).json({ message: "Service not found." });
    }

    const comment = await prisma.serviceComment.findFirst({
      where: {
        id: commentId,
        serviceId: service.id,
      },
      include: {
        replies: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!comment) {
      return response.status(404).json({ message: "Comment not found." });
    }

    const savedReply = await prisma.serviceReply.create({
      data: {
        commentId: comment.id,
        reply: replyText,
        impression: admin?.name || fallbackName,
        sortOrder: (comment.replies?.[0]?.sortOrder || 0) + 1,
      },
    });

    request.app.get("io")?.to(`service:${slug}`).emit("service:reply_created", {
      serviceSlug: slug,
      commentId: comment.id,
      reply: savedReply,
    });

    return response.status(201).json({
      message: "Reply saved successfully.",
      reply: savedReply,
      isAdminReply: Boolean(admin),
    });
  } catch (error) {
    console.error("Failed to save service reply:", error.message);
    return response.status(500).json({ message: "Failed to save reply." });
  }
});

router.get("/blogs", async (_request, response) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: 1 } });
    const blogs = await getBlogs(profile?.devUsername);
    return response.json(blogs);
  } catch (error) {
    console.error("Failed to load blogs:", error.message);
    return response.status(500).json({ message: "Failed to load blogs." });
  }
});

router.get("/articles", async (_request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.json([]);
    }

      const articles = await prisma.article.findMany({
        where: getPublishedArticleWhere(),
        include: {
          categories: {
            include: {
              category: true,
            },
          },
          comments: {
            orderBy: { sortOrder: "asc" },
            include: {
              replies: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
        orderBy: [{ publishDate: "desc" }, { createdAt: "desc" }],
      });

    return response.json((await attachArticleMetrics(articles)).map(serializeArticle));
  } catch (error) {
    console.error("Failed to load articles:", error.message);
    return response.status(500).json({ message: "Failed to load articles." });
  }
});

router.get("/articles/:slug", async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(404).json({ message: "Article not found." });
    }

    const slug = String(request.params.slug || "").trim().toLowerCase();
    const [profile, siteSettings, existingArticle] = await Promise.all([
      prisma.profile.findUnique({ where: { id: 1 } }),
      getSiteSettingsRecord(),
        prisma.article.findUnique({
          where: { slug },
          include: {
            categories: {
              include: {
                category: true,
              },
            },
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
    ]);

    if (!existingArticle || existingArticle.status !== "published" || (existingArticle.publishDate && existingArticle.publishDate > new Date())) {
      return response.status(404).json({ message: "Article not found." });
    }

    await incrementArticleMetric(slug, "views");

    const article = {
      ...existingArticle,
      ...(await attachArticleMetrics([existingArticle]))[0],
    };

    const relatedArticles = await prisma.article.findMany({
      where: {
        ...getPublishedArticleWhere(),
        slug: { not: slug },
      },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        comments: {
          orderBy: { sortOrder: "asc" },
          include: {
            replies: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { publishDate: "desc" }, { createdAt: "desc" }],
      take: 5,
    });

    return response.json({
      profile,
      siteSettings: serializeSiteSettings(siteSettings),
      article: serializeArticle(article),
      relatedArticles: (await attachArticleMetrics(relatedArticles)).map(serializeArticle),
    });
  } catch (error) {
    console.error("Failed to load article detail:", error.message);
    return response.status(500).json({ message: "Failed to load article detail." });
  }
});

router.post("/articles/:slug/impression", async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(404).json({ message: "Article not found." });
    }

    const slug = String(request.params.slug || "").trim().toLowerCase();
    const article = await prisma.article.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
        publishDate: true,
      },
    });

    if (!article || article.status !== "published" || (article.publishDate && article.publishDate > new Date())) {
      return response.status(404).json({ message: "Article not found." });
    }

    await incrementArticleMetric(slug, "impressionCount");

    return response.status(201).json({ message: "Impression tracked." });
  } catch (error) {
    console.error("Failed to track article impression:", error.message);
    return response.status(500).json({ message: "Failed to track article impression." });
  }
});

router.post("/articles/:slug/share", async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(404).json({ message: "Article not found." });
    }

    const slug = String(request.params.slug || "").trim().toLowerCase();
    const article = await prisma.article.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
        publishDate: true,
      },
    });

    if (!article || article.status !== "published" || (article.publishDate && article.publishDate > new Date())) {
      return response.status(404).json({ message: "Article not found." });
    }

    await incrementArticleMetric(slug, "shareCount");

    return response.status(201).json({ message: "Share tracked." });
  } catch (error) {
    console.error("Failed to track article share:", error.message);
    return response.status(500).json({ message: "Failed to track article share." });
  }
});

router.post("/articles/:slug/comments", async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(404).json({ message: "Article not found." });
    }

    const slug = String(request.params.slug || "").trim().toLowerCase();
    const name = String(request.body?.name || "").trim();
    const commentText = String(request.body?.comment || "").trim();

    if (!name || !commentText) {
      return response.status(400).json({ message: "Name and comment are required." });
    }

    const article = await prisma.article.findUnique({
      where: { slug },
      include: {
        comments: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!article || article.status !== "published" || (article.publishDate && article.publishDate > new Date())) {
      return response.status(404).json({ message: "Article not found." });
    }

    if (!article.commentsEnabled) {
      return response.status(409).json({ message: "Comments are disabled for this article." });
    }

    const savedComment = await prisma.articleComment.create({
      data: {
        articleId: article.id,
        name,
        comment: commentText,
        sortOrder: (article.comments?.[0]?.sortOrder || 0) + 1,
      },
      include: {
        replies: true,
      },
    });

    const serializedComment = serializeArticleComment(savedComment);
    request.app.get("io")?.to(`article:${slug}`).emit("article:comment_created", {
      articleSlug: slug,
      comment: serializedComment,
    });

    return response.status(201).json({
      message: "Comment saved successfully.",
      comment: serializedComment,
    });
  } catch (error) {
    console.error("Failed to save article comment:", error.message);
    return response.status(500).json({ message: "Failed to save comment." });
  }
});

router.post("/articles/:slug/comments/:commentId/replies", async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(404).json({ message: "Article not found." });
    }

    const slug = String(request.params.slug || "").trim().toLowerCase();
    const commentId = Number.parseInt(request.params.commentId, 10);
    const name = String(request.body?.name || "").trim();
    const replyText = String(request.body?.reply || "").trim();

    if (!commentId || !name || !replyText) {
      return response.status(400).json({ message: "Name and reply are required." });
    }

    const article = await prisma.article.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
        publishDate: true,
        commentsEnabled: true,
      },
    });

    if (!article || article.status !== "published" || (article.publishDate && article.publishDate > new Date())) {
      return response.status(404).json({ message: "Article not found." });
    }

    if (!article.commentsEnabled) {
      return response.status(409).json({ message: "Comments are disabled for this article." });
    }

    const comment = await prisma.articleComment.findFirst({
      where: {
        id: commentId,
        articleId: article.id,
      },
      include: {
        replies: {
          orderBy: { sortOrder: "desc" },
          take: 1,
        },
      },
    });

    if (!comment) {
      return response.status(404).json({ message: "Comment not found." });
    }

    const savedReply = await prisma.articleReply.create({
      data: {
        commentId: comment.id,
        name,
        reply: replyText,
        sortOrder: (comment.replies?.[0]?.sortOrder || 0) + 1,
      },
    });

    const serializedReply = serializeArticleReply(savedReply);
    request.app.get("io")?.to(`article:${slug}`).emit("article:reply_created", {
      articleSlug: slug,
      commentId: comment.id,
      reply: serializedReply,
    });

    return response.status(201).json({
      message: "Reply saved successfully.",
      reply: serializedReply,
    });
  } catch (error) {
    console.error("Failed to save article reply:", error.message);
    return response.status(500).json({ message: "Failed to save reply." });
  }
});

router.get("/settings", async (_request, response) => {
  try {
    const siteSettings = await getSiteSettingsRecord();
    return response.json(serializeSiteSettings(siteSettings));
  } catch (error) {
    console.error("Failed to load site settings:", error.message);
    return response.status(500).json({ message: "Failed to load site settings." });
  }
});

router.post("/analytics/heartbeat", async (request, response) => {
  try {
    const sessionId = normalizeTrackingSessionId(request.body?.sessionId);
    const path = normalizeTrackingPath(request.body?.path);
    const eventType = normalizeString(request.body?.eventType).toLowerCase() || "heartbeat";

    if (!sessionId) {
      return response.status(400).json({ message: "Session id is required." });
    }

    const now = new Date();
    const today = getUtcDateOnly(now);
    const userAgent = String(request.headers["user-agent"] || "").slice(0, 2000);
    const requestIpAddress = getRequestIp(request);
    const bodyIpAddress = normalizeString(request.body?.ipAddress);
    const resolvedIpAddress = isPublicIp(bodyIpAddress) ? bodyIpAddress : requestIpAddress;
    const ipAddress = resolvedIpAddress.slice(0, 191);
    const requestGeoDetails = await lookupGeoDetails(request, ipAddress);
    const bodyGeoDetails = {
      country: normalizeString(request.body?.country),
      region: normalizeString(request.body?.region),
      city: normalizeString(request.body?.city),
    };
    const geoDetails = mergeGeoDetails(bodyGeoDetails, requestGeoDetails);
    const geoUpdateData = buildGeoUpdateData(geoDetails);

    const session = await prisma.analyticsSession.upsert({
      where: { sessionId },
      update: {
        lastPath: path,
        lastSeenAt: now,
        userAgent: userAgent || undefined,
        ipAddress,
        ...geoUpdateData,
      },
      create: {
        sessionId,
        firstPath: path,
        lastPath: path,
        lastSeenAt: now,
        userAgent: userAgent || undefined,
        ipAddress,
        country: normalizeString(geoDetails.country),
        region: normalizeString(geoDetails.region),
        city: normalizeString(geoDetails.city),
      },
      select: {
        id: true,
      },
    });

    await recordAnalyticsDailyVisit(session.id, today, path);

    if (eventType === "pageview") {
      await recordAnalyticsPageView(session.id, path, now);
    }

    return response.status(201).json({ success: true });
  } catch (error) {
    if (error?.code === "P2021") {
      return response.status(202).json({ success: false, message: "Analytics tables are not ready yet." });
    }

    console.error("Failed to track analytics heartbeat:", error.message);
    return response.status(500).json({ message: "Failed to track analytics heartbeat." });
  }
});

router.post(
  "/testimonials/upload-image",
  (request, response, next) => {
    upload.single("image")(request, response, (error) => {
      if (error) {
        return response.status(400).json({ message: error.message || "Upload failed." });
      }

      return next();
    });
  },
  async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "Please choose an image to upload." });
    }

    const uploadedFile = await storeUploadedFile(request.file, {
      directory: "uploads",
      fallbackBaseName: "testimonial-image",
    });

    return response.status(201).json({
      message: "Image uploaded successfully.",
      path: uploadedFile.publicPath,
      publicUrl: uploadedFile.publicUrl,
    });
  },
);

router.post("/testimonials", async (request, response) => {
  try {
    if (!hasTestimonialModel()) {
      return response.status(503).json({ message: "Testimonials are not available yet." });
    }

    const name = normalizeString(request.body?.name);
    const company = normalizeString(request.body?.company);
    const position = normalizeString(request.body?.position);
    const image = normalizeString(request.body?.image) || "/DefaultUser.png";
    const contentSource = normalizeString(request.body?.content);
    const stars = Math.max(1, Math.min(5, Number.parseInt(request.body?.stars, 10) || 5));

    if (!name || !company || !contentSource) {
      return response.status(400).json({
        message: "Name, company, and review content are required.",
      });
    }

    const testimonial = await prisma.testimonial.create({
      data: {
        name,
        company,
        position,
        image,
        content: convertPlainTextToHtml(contentSource),
        stars,
        status: true,
        sortOrder: await getNextTestimonialSortOrder(),
      },
    });

    const serializedTestimonial = serializeTestimonial(testimonial);
    request.app.get("io")?.to("testimonials").emit("testimonial:created", {
      testimonial: serializedTestimonial,
    });

    return response.status(201).json({
      message: "Review published successfully.",
      testimonial: serializedTestimonial,
    });
  } catch (error) {
    console.error("Failed to save testimonial:", error.message);
    return response.status(500).json({ message: "Failed to save review." });
  }
});

router.post(
  "/contact",
  (request, response, next) => {
    contactUpload.fields([
      { name: "photo", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ])(request, response, (error) => {
      if (error) {
        return response.status(400).json({ message: error.message || "Upload failed." });
      }

      return next();
    });
  },
  async (request, response) => {
  let storedPhoto = null;
  let storedAttachment = null;

  try {
    const { name, email, subject, message } = request.body || {};

    if (!name || !email || !subject || !message) {
      return response.status(400).json({ message: "Name, email, subject, and message are required." });
    }

    const photoFile = request.files?.photo?.[0];
    const attachedFile = request.files?.file?.[0];
    storedPhoto = photoFile
      ? await storeUploadedFile(photoFile, {
          directory: "uploads",
          fallbackBaseName: "contact-photo",
        })
      : null;
    storedAttachment = attachedFile
      ? await storeUploadedFile(attachedFile, {
          directory: "uploads",
          fallbackBaseName: "contact-file",
        })
      : null;
    const siteSettings = await getSiteSettingsRecord();
    const ticketToken = createTicketToken();
    const initialChatMessageId = await getNextIntId(prisma, "ContactChatMessage");
    const savedMessage = await prisma.contactMessage.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim(),
        subject: String(subject || "").trim(),
        message: String(message).trim(),
        photo: storedPhoto?.publicPath || "",
        file: storedAttachment?.publicPath || "",
        ticketToken,
        chatMessages: {
          create: {
            id: initialChatMessageId,
            senderType: "visitor",
            senderName: String(name).trim(),
            message: String(message).trim(),
            photo: storedPhoto?.publicPath || "",
            file: storedAttachment?.publicPath || "",
          },
        },
      },
      include: {
        chatMessages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    try {
      await sendContactEmails(siteSettings, savedMessage);
    } catch (mailError) {
      console.error("Failed to send contact email:", mailError.message);
    }

    try {
      const newMessageNotification = await createAdminNotification({
        type: "NEW_MESSAGE",
        visitorName: savedMessage.name,
        visitorEmail: savedMessage.email,
        visitorPhone: "",
        messageId: savedMessage.id,
        conversationId: savedMessage.id,
        subject: savedMessage.subject,
        preview: savedMessage.message,
        actionUrl: buildMessageActionUrl(savedMessage.id),
      });
      await emitAdminNotification(request.app.get("io"), "admin:new-message", newMessageNotification);
    } catch (notificationError) {
      console.error("Failed to create admin notification:", notificationError.message);
    }

    request.app.get("io")?.to(`contact:ticket:${savedMessage.id}`).emit("contact:assistant_typing", {
      ticketId: savedMessage.id,
      isTyping: true,
    });

    const assistantReply = await createAssistantChatReply(savedMessage.id, String(message).trim());
    const ticketWithAssistantReply = assistantReply
      ? {
          ...savedMessage,
          chatMessages: [...(savedMessage.chatMessages || []), assistantReply],
        }
      : savedMessage;

    request.app.get("io")?.emit("contact:ticket_created", {
      ticket: serializeContactTicket(ticketWithAssistantReply),
    });

    if (assistantReply) {
      request.app.get("io")?.to(`contact:ticket:${savedMessage.id}`).emit("contact:message_created", {
        ticketId: savedMessage.id,
        message: serializeContactChatMessage(assistantReply),
      });
    }

    request.app.get("io")?.to(`contact:ticket:${savedMessage.id}`).emit("contact:assistant_typing", {
      ticketId: savedMessage.id,
      isTyping: false,
    });

    return response.status(201).json({
      message: "Message sent successfully.",
      data: serializeContactTicket(ticketWithAssistantReply),
      assistantReply: assistantReply ? serializeContactChatMessage(assistantReply) : null,
      ticket: {
        id: savedMessage.id,
        token: ticketToken,
      },
    });
  } catch (error) {
    await Promise.all(
      [storedPhoto?.publicPath, storedAttachment?.publicPath]
        .filter(Boolean)
        .map((item) => deleteStoredFile(item).catch(() => {})),
    );
    console.error("Failed to save contact message:", error.message);
    return response.status(500).json({ message: "Failed to send message." });
  }
});

router.get("/contact-ticket/:messageId", async (request, response) => {
  try {
    const messageId = Number.parseInt(request.params.messageId, 10);
    const ticketToken = normalizeString(request.query?.token);

    if (!messageId || !ticketToken) {
      return response.status(400).json({ message: "Ticket token is required." });
    }

    const ticket = await getContactTicketById(messageId);
    if (!ticket || ticket.ticketToken !== ticketToken) {
      return response.status(404).json({ message: "Ticket not found." });
    }

    return response.json({
      ticket: serializeContactTicket(ticket),
    });
  } catch (error) {
    console.error("Failed to load contact ticket:", error.message);
    return response.status(500).json({ message: "Failed to load ticket." });
  }
});

router.post(
  "/contact-ticket/:messageId/messages",
  (request, response, next) => {
    contactChatUpload.fields([
      { name: "photo", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ])(request, response, (error) => {
      if (error) {
        return response.status(400).json({ message: error.message || "Upload failed." });
      }

      return next();
    });
  },
  async (request, response) => {
  let storedPhoto = null;
  let storedAttachment = null;

  try {
    const messageId = Number.parseInt(request.params.messageId, 10);
    const ticketToken = normalizeString(request.query?.token);
    const message = normalizeString(request.body?.message);

    if (!messageId || !ticketToken || (!message && !request.files?.photo?.[0] && !request.files?.file?.[0])) {
      return response.status(400).json({ message: "Ticket token and a message or attachment are required." });
    }

    const ticket = await prisma.contactMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        ticketToken: true,
        status: true,
      },
    });

    if (!ticket || ticket.ticketToken !== ticketToken) {
      return response.status(404).json({ message: "Ticket not found." });
    }

    if (ticket.status === "solved") {
      return response.status(409).json({ message: "This ticket is closed. Please create a new ticket." });
    }

    const photoFile = request.files?.photo?.[0];
    const attachedFile = request.files?.file?.[0];
    storedPhoto = photoFile
      ? await storeUploadedFile(photoFile, {
          directory: "uploads",
          fallbackBaseName: "chat-photo",
        })
      : null;
    storedAttachment = attachedFile
      ? await storeUploadedFile(attachedFile, {
          directory: "uploads",
          fallbackBaseName: "chat-file",
        })
      : null;
    const savedChatMessage = await prisma.contactChatMessage.create({
      data: {
        contactMessageId: ticket.id,
        senderType: "visitor",
        senderName: ticket.name || "Visitor",
        message,
        photo: storedPhoto?.publicPath || "",
        file: storedAttachment?.publicPath || "",
      },
    });

    try {
      const replyNotification = await createAdminNotification({
        type: "MESSAGE_REPLY",
        visitorName: ticket.name,
        visitorEmail: ticket.email,
        visitorPhone: "",
        messageId: ticket.id,
        conversationId: ticket.id,
        subject: ticket.subject,
        preview: message,
        actionUrl: buildMessageActionUrl(ticket.id),
      });
      await emitAdminNotification(request.app.get("io"), "admin:message-reply", replyNotification);
    } catch (notificationError) {
      console.error("Failed to create admin notification:", notificationError.message);
    }

    request.app.get("io")?.to(`contact:ticket:${ticket.id}`).emit("contact:message_created", {
      ticketId: ticket.id,
      message: serializeContactChatMessage(savedChatMessage),
    });

    request.app.get("io")?.to(`contact:ticket:${ticket.id}`).emit("contact:assistant_typing", {
      ticketId: ticket.id,
      isTyping: true,
    });

    const assistantReply = await createAssistantChatReply(ticket.id, message);

    if (assistantReply) {
      request.app.get("io")?.to(`contact:ticket:${ticket.id}`).emit("contact:message_created", {
        ticketId: ticket.id,
        message: serializeContactChatMessage(assistantReply),
      });
    }

    request.app.get("io")?.to(`contact:ticket:${ticket.id}`).emit("contact:assistant_typing", {
      ticketId: ticket.id,
      isTyping: false,
    });

    return response.status(201).json({
      message: "Reply sent successfully.",
      data: serializeContactChatMessage(savedChatMessage),
      assistantReply: assistantReply ? serializeContactChatMessage(assistantReply) : null,
    });
  } catch (error) {
    await Promise.all(
      [storedPhoto?.publicPath, storedAttachment?.publicPath]
        .filter(Boolean)
        .map((item) => deleteStoredFile(item).catch(() => {})),
    );
    console.error("Failed to save contact ticket reply:", error.message);
    return response.status(500).json({ message: "Failed to send reply." });
  }
});

module.exports = router;
