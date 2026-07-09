const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { google } = require("googleapis");
const multer = require("multer");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const prisma = require("../lib/prisma");
const { getNextIntId } = require("../lib/next-id");
const {
  buildTwoFactorOtpAuthUrl,
  generateTwoFactorSecret,
  requireAdmin,
  signAdminToken,
  verifyTwoFactorCode,
} = require("../lib/auth");
const { decryptText, encryptText } = require("../utils/encryption");
const { generateAssistantResponse } = require("../services/ai");
const {
  countUnreadAdminNotificationGroups,
  deleteAdminNotificationGroup,
  listAdminNotificationGroups,
  markAdminNotificationGroupRead,
} = require("../lib/admin-notifications");
const {
  getDefaultSiteSettings,
  isSmtpConfigured,
  normalizeSiteSettings,
  serializeSiteSettings,
} = require("../lib/site-settings");

const router = express.Router();
const publicDirectory = path.resolve(process.cwd(), "public");
const uploadDirectory = path.resolve(process.cwd(), "public", "uploads");
const contactReplyReminderTimers = new Map();

function emitContentUpdated(request, scope = "content", extra = {}) {
  request.app.get("io")?.emit("content:updated", {
    scope,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
}

function isArticleLive(article) {
  if (!article || article.status !== "published") {
    return false;
  }

  if (!article.publishDate) {
    return true;
  }

  const publishDate = new Date(article.publishDate);
  return Number.isFinite(publishDate.getTime()) && publishDate <= new Date();
}

function emitArticlePublished(request, article) {
  if (!isArticleLive(article)) {
    return;
  }

  request.app.get("io")?.emit("article:published", {
    articleId: article.id,
    slug: article.slug,
    title: article.title,
    publishDate: article.publishDate,
    url: `/artical/${article.slug}`,
    publishedAt: new Date().toISOString(),
  });
}

if (!fs.existsSync(publicDirectory)) {
  fs.mkdirSync(publicDirectory, { recursive: true });
}

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_request, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeBaseName = path
      .basename(file.originalname || "profile-image", ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "profile-image";

    callback(null, `${Date.now()}-${safeBaseName}${ext}`);
  },
});

const upload = multer({
  storage,
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

const contactChatUpload = multer({
  storage,
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

const resumeUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname || "").toLowerCase() === ".pdf";

    if (!isPdf) {
      callback(new Error("Only PDF files are allowed."));
      return;
    }

    callback(null, true);
  },
});

const verificationFileStorage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, publicDirectory);
  },
  filename: (_request, file, callback) => {
    const extension = path
      .extname(file.originalname || "")
      .trim()
      .replace(/[^a-zA-Z0-9.]/g, "")
      .slice(0, 20);
    const safeBaseName = path
      .basename(file.originalname || "google-verification", extension)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "google-verification";

    callback(null, `${safeBaseName}${extension.toLowerCase()}`);
  },
});

const verificationFileUpload = multer({
  storage: verificationFileStorage,
  limits: {
    fileSize: 1024 * 1024,
  },
});

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizePositiveInt(value, fallback, { max = 100 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeAiModelName(provider, modelName) {
  const normalizedProvider = normalizeString(provider).toLowerCase();
  const normalizedModel = normalizeString(modelName);

  if (!normalizedModel) {
    return "";
  }

  if (normalizedProvider !== "deepseek") {
    return normalizedModel;
  }

  const loweredModel = normalizedModel.toLowerCase();

  if (["deepseek-v4-pro", "deepseek-v4-flash"].includes(loweredModel)) {
    return loweredModel;
  }

  if (["deepseek-v4", "deepseek", "deepseek-chat"].includes(loweredModel)) {
    return "deepseek-v4-pro";
  }

  return normalizedModel;
}

const ARTICLE_AI_AUTHOR = "Md Shahanur Islam Shagor";
const ARTICLE_TARGET_WORD_COUNT = 2000;
const ARTICLE_MIN_WORD_COUNT = 1800;
const ARTICLE_SHORT_DESCRIPTION_MIN = 180;
const ARTICLE_SHORT_DESCRIPTION_MAX = 200;
const ARTICLE_MIN_HEADING_COUNT = 3;
const ALLOWED_ARTICLE_HTML_TAGS = new Set([
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "blockquote",
  "code",
  "pre",
]);
const FORBIDDEN_AI_PHRASES = [
  "in today’s fast-paced world",
  "in today's fast-paced world",
  "cutting-edge",
  "seamless",
  "robust",
  "leveraging",
  "furthermore",
  "it is important to note",
  "this article explores",
  "as we move forward",
  "revolutionary",
  "game changer",
  "innovative solution",
];

class ArticleGenerationValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArticleGenerationValidationError";
  }
}

function cleanJsonFence(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeGeneratedArticlePayload(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    title: normalizeString(source.title),
    shortDescription: normalizeString(source.shortDescription),
    content: String(source.content || "").trim(),
    metaTitle: normalizeString(source.metaTitle),
    metaDescription: normalizeString(source.metaDescription),
    tags: normalizeGeneratedTags(source.tags),
    author: ARTICLE_AI_AUTHOR,
  };
}

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripHtmlTags(value) {
  return String(value || "")
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectMarkdown(value) {
  const normalized = String(value || "");
  return (
    /(^|\n)\s{0,3}#{1,6}\s+\S+/m.test(normalized) ||
    /(^|\n)\s*[-*]\s+\S+/m.test(normalized) ||
    /(^|\n)\s*\d+\.\s+\S+/m.test(normalized) ||
    /\*\*[^*]+\*\*/.test(normalized) ||
    /(^|\n)\s*>+\s*\S+/m.test(normalized)
  );
}

function validateAllowedHtmlTags(value) {
  const tags = String(value || "").match(/<\/?([a-z0-9]+)\b[^>]*>/gi) || [];

  for (const rawTag of tags) {
    const tagMatch = rawTag.match(/<\/?([a-z0-9]+)/i);
    const tagName = String(tagMatch?.[1] || "").toLowerCase();
    if (tagName && !ALLOWED_ARTICLE_HTML_TAGS.has(tagName)) {
      throw new ArticleGenerationValidationError("AI returned HTML content with unsupported tags.");
    }
  }
}

function normalizeGeneratedTags(tags) {
  return [...new Set(normalizeStringList(Array.isArray(tags) ? tags : []))];
}

function isLikelyConclusionContent(value) {
  const normalized = stripHtmlTags(value).toLowerCase();
  return normalized.includes("conclusion") || normalized.includes("to wrap up") || normalized.includes("in closing");
}

function buildFriendlyGenerationErrorMessage(error) {
  const message = String(error?.message || "").trim();

  if (message === "No active AI provider configured.") {
    return message;
  }

  if (message.includes("invalid JSON")) {
    return "AI provider returned invalid JSON.";
  }

  if (message.includes("short description")) {
    return "Generated short description did not meet the required length.";
  }

  if (message.includes("shorter than")) {
    return "AI response was too short. Please try again.";
  }

  if (message.includes("structured sections") || message.includes("headings")) {
    return "Generated article structure was incomplete. Please try again.";
  }

  if (message.includes("markdown")) {
    return "AI returned markdown instead of clean HTML. Please try again.";
  }

  if (message.includes("meta title") || message.includes("meta description") || message.includes("tags")) {
    return "Generated article metadata was invalid. Please retry.";
  }

  if (message.includes("empty")) {
    return "Failed to generate article. Please retry.";
  }

  return "Failed to generate article. Please retry.";
}

function validateGeneratedArticlePayload(article) {
  const shortDescriptionLength = article.shortDescription.length;
  const contentWordCount = countWords(stripHtmlTags(article.content));
  const headingCount = (article.content.match(/<h[23]\b[^>]*>/gi) || []).length;
  const contentText = stripHtmlTags(article.content);
  const lowerContent = contentText.toLowerCase();

  if (!article.title) {
    throw new ArticleGenerationValidationError("AI returned an empty title.");
  }

  if (!article.content) {
    throw new ArticleGenerationValidationError("AI returned empty content.");
  }

  if (detectMarkdown(article.content)) {
    throw new ArticleGenerationValidationError("AI returned markdown content.");
  }

  validateAllowedHtmlTags(article.content);

  if (!/<p\b[^>]*>/i.test(article.content)) {
    throw new ArticleGenerationValidationError("AI returned HTML content without readable paragraphs.");
  }

  if (
    shortDescriptionLength < ARTICLE_SHORT_DESCRIPTION_MIN ||
    shortDescriptionLength > ARTICLE_SHORT_DESCRIPTION_MAX
  ) {
    throw new ArticleGenerationValidationError("AI returned a short description outside the 180-200 character range.");
  }

  if (contentWordCount < ARTICLE_MIN_WORD_COUNT) {
    throw new ArticleGenerationValidationError("AI returned article content shorter than 1800 words.");
  }

  if (headingCount < ARTICLE_MIN_HEADING_COUNT) {
    throw new ArticleGenerationValidationError("AI returned article content without enough structured sections.");
  }

  if (!/<h[23]\b[^>]*>\s*introduction\s*<\/h[23]>/i.test(article.content) && !lowerContent.startsWith("introduction")) {
    throw new ArticleGenerationValidationError("AI returned article content without a strong introduction.");
  }

  if (!isLikelyConclusionContent(article.content)) {
    throw new ArticleGenerationValidationError("AI returned article content without a clear conclusion section.");
  }

  if (!article.metaTitle || article.metaTitle.length >= 60) {
    throw new ArticleGenerationValidationError("AI returned an invalid meta title.");
  }

  if (!article.metaDescription || article.metaDescription.length >= 160) {
    throw new ArticleGenerationValidationError("AI returned an invalid meta description.");
  }

  if (article.tags.length < 5 || article.tags.length > 8) {
    throw new ArticleGenerationValidationError("AI returned an invalid number of tags.");
  }

  for (const phrase of FORBIDDEN_AI_PHRASES) {
    if (lowerContent.includes(phrase)) {
      throw new ArticleGenerationValidationError("AI returned content with forbidden AI phrasing.");
    }
  }
}

function parseGeneratedArticleResponse(value) {
  const normalized = cleanJsonFence(value);

  if (!normalized) {
    throw new ArticleGenerationValidationError("AI returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (_error) {
    throw new ArticleGenerationValidationError("AI returned invalid JSON.");
  }

  const article = normalizeGeneratedArticlePayload(parsed);
  validateGeneratedArticlePayload(article);
  return article;
}

async function generateValidatedArticlePreview(aiConfig, prompts) {
  const attempts = [
    prompts.baseUserMessage,
    [
      prompts.baseUserMessage,
      "",
      "The previous response failed validation.",
      "Return cleaner JSON.",
      "Generate longer and more detailed human-written HTML content.",
      "Do not use markdown.",
      "Do not shorten the article.",
    ].join("\n"),
  ];

  let lastError = null;

  for (const userMessage of attempts) {
    try {
      const aiResponse = await generateAssistantResponse({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        baseUrl: aiConfig.baseUrl,
        modelName: aiConfig.modelName,
        systemPrompt: prompts.systemPrompt,
        userMessage,
        temperature: 0.6,
        maxTokens: 5000,
      });

      return parseGeneratedArticleResponse(aiResponse);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ArticleGenerationValidationError)) {
        break;
      }
    }
  }

  throw lastError || new Error("Failed to generate article.");
}

async function getActiveAiConfiguration() {
  if (!hasAiSettingsModel() || !hasAiProviderModel()) {
    throw new Error("No active AI provider configured.");
  }

  const settings = await prisma.aiSettings.findUnique({
    where: { id: 1 },
  });

  if (!settings?.activeProvider || !settings?.modelName) {
    throw new Error("No active AI provider configured.");
  }

  const provider = await prisma.aiProvider.findFirst({
    where: {
      name: normalizeString(settings.activeProvider).toLowerCase(),
      isActive: true,
    },
  });

  if (!provider?.apiKey) {
    throw new Error("No active AI provider configured.");
  }

  const apiKey = decryptText(provider.apiKey);
  if (!apiKey) {
    throw new Error("No active AI provider configured.");
  }

  return {
    provider: provider.name,
    apiKey,
    baseUrl: provider.baseUrl || "",
    modelName: normalizeAiModelName(provider.name, settings.modelName),
  };
}

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

async function sendContactReplyReminderEmail(siteSettings, ticket) {
  const normalizedSettings = normalizeSiteSettings(siteSettings);
  if (!isSmtpConfigured(normalizedSettings) || !ticket?.email) {
    return;
  }

  const chatUrl = buildContactChatUrl(
    normalizedSettings.canonicalUrl,
    ticket.id,
    ticket.ticketToken,
  );

  if (!chatUrl) {
    return;
  }

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

  await transporter.sendMail({
    from,
    to: ticket.email,
    replyTo: normalizedSettings.smtpReplyToEmail || normalizedSettings.smtpFromEmail,
    subject: `New reply to your chat${normalizedSettings.websiteTitle ? ` | ${normalizedSettings.websiteTitle}` : ""}`,
    text: [
      `Hi ${ticket.name || "there"},`,
      "",
      "There is a new admin reply waiting in your chat.",
      "You can continue the conversation using this private link:",
      chatUrl,
      "",
      ticket.subject ? `Subject: ${ticket.subject}` : null,
      "Reply whenever you are ready.",
    ].filter(Boolean).join("\n"),
  });
}

function scheduleContactReplyReminder(ticketId, replyId, replyCreatedAt) {
  if (!ticketId || !replyId || !replyCreatedAt) {
    return;
  }

  const timerKey = `${ticketId}:${replyId}`;
  const existingTimer = contactReplyReminderTimers.get(timerKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const reminderDelayMs = 10 * 60 * 1000;
  const timer = setTimeout(async () => {
    contactReplyReminderTimers.delete(timerKey);

    try {
      const latestMessage = await prisma.contactChatMessage.findFirst({
        where: {
          contactMessageId: ticketId,
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          senderType: true,
        },
      });

      if (!latestMessage || latestMessage.id !== replyId || latestMessage.senderType !== "admin") {
        return;
      }

      const visitorReply = await prisma.contactChatMessage.findFirst({
        where: {
          contactMessageId: ticketId,
          senderType: "visitor",
          createdAt: {
            gt: replyCreatedAt,
          },
        },
        select: {
          id: true,
        },
      });

      if (visitorReply) {
        return;
      }

      const siteSettings = await prisma.siteSettings.findUnique({
        where: { id: 1 },
      });
      const ticket = await prisma.contactMessage.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          name: true,
          email: true,
          subject: true,
          ticketToken: true,
        },
      });

      if (!ticket?.ticketToken) {
        return;
      }

      await sendContactReplyReminderEmail(siteSettings || getDefaultSiteSettings(), ticket);
    } catch (error) {
      console.error("Failed to send contact reply reminder email:", error.message);
    }
  }, reminderDelayMs);

  contactReplyReminderTimers.set(timerKey, timer);
}

function normalizeStringList(items) {
  return (items || [])
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeHeroSkills(value) {
  if (Array.isArray(value)) {
    return {
      title: "",
      items: value
        .map((item) => {
          if (typeof item === "string") {
            const name = normalizeString(item);
            return name ? { name, image: "" } : null;
          }

          const name = normalizeString(item?.name);
          const image = normalizeString(item?.image);
          return name ? { name, image } : null;
        })
        .filter(Boolean),
    };
  }

  const title = normalizeString(value?.title);
  const items = (value?.items || [])
    .map((item) => {
      const name = normalizeString(item?.name);
      const image = normalizeString(item?.image);
      return name ? { name, image } : null;
    })
    .filter(Boolean);

  return {
    title,
    items,
  };
}

function normalizeSocialLinks(value, fallbackProfile = null) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const icon = normalizeString(item?.icon).toLowerCase();
        const label = normalizeString(item?.label);
        const image = normalizeString(item?.image);
        const link = normalizeString(item?.link);
        if (!link) {
          return null;
        }

        if (icon === "custom") {
          return image ? { icon, label, image, link } : null;
        }

        return icon ? { icon, label, image: "", link } : null;
      })
      .filter(Boolean);
  }

  if (Array.isArray(fallbackProfile?.socialLinks)) {
    return fallbackProfile.socialLinks
      .map((item) => {
        const icon = normalizeString(item?.icon).toLowerCase();
        const label = normalizeString(item?.label);
        const image = normalizeString(item?.image);
        const link = normalizeString(item?.link);
        return icon && link ? { icon, label, image, link } : null;
      })
      .filter(Boolean);
  }

  return [
    { icon: "facebook", label: "Facebook", image: "", link: normalizeString(fallbackProfile?.facebook) },
    { icon: "github", label: "GitHub", image: "", link: normalizeString(fallbackProfile?.github) },
    { icon: "linkedin", label: "LinkedIn", image: "", link: normalizeString(fallbackProfile?.linkedIn) },
    { icon: "twitter", label: "Twitter", image: "", link: normalizeString(fallbackProfile?.twitter) },
    { icon: "stackoverflow", label: "Stack Overflow", image: "", link: normalizeString(fallbackProfile?.stackOverflow) },
    { icon: "leetcode", label: "LeetCode", image: "", link: normalizeString(fallbackProfile?.leetcode) },
  ].filter((item) => item.link);
}

function normalizeStatsCounters(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const label = normalizeString(item?.label);
        const highlight = normalizeString(item?.highlight);
        const count = normalizeString(item?.count);
        const icon = normalizeString(item?.icon).toLowerCase();

        return label && count ? { label, highlight, count, icon } : null;
      })
      .filter(Boolean);
  }

  return [];
}

function normalizeProjectButtons(items, fallbackProject = null) {
  if (Array.isArray(items)) {
    return items
      .map((item) => {
        const text = normalizeString(item?.text);
        const link = normalizeString(item?.link);

        return text && link ? { text, link } : null;
      })
      .filter(Boolean);
  }

  const fallbackButtons = [];
  const code = normalizeString(fallbackProject?.code);
  const demo = normalizeString(fallbackProject?.demo);

  if (code) {
    fallbackButtons.push({ text: "Code", link: code });
  }

  if (demo) {
    fallbackButtons.push({ text: "Live Demo", link: demo });
  }

  return fallbackButtons;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeProjectPayload(payload, fallbackProject = null) {
  return {
    slug: slugify(payload?.slug || payload?.name || fallbackProject?.slug || fallbackProject?.name),
    name: normalizeString(payload?.name ?? fallbackProject?.name),
    description: normalizeString(payload?.description ?? fallbackProject?.description),
    content: String(payload?.content ?? fallbackProject?.content ?? "").trim(),
    role: normalizeString(payload?.role ?? fallbackProject?.role),
    code: normalizeString(payload?.code ?? fallbackProject?.code),
    demo: normalizeString(payload?.demo ?? fallbackProject?.demo),
    image: normalizeString(payload?.image ?? fallbackProject?.image),
    views: Math.max(0, Number.parseInt(payload?.views ?? fallbackProject?.views, 10) || 0),
    impressionCount: Math.max(
      0,
      Number.parseInt(payload?.impressionCount ?? fallbackProject?.impressionCount, 10) || 0,
    ),
    tools: normalizeStringList(payload?.tools ?? fallbackProject?.tools ?? []),
    buttons: normalizeProjectButtons(payload?.buttons, payload || fallbackProject),
  };
}

function normalizeArticlePayload(payload, fallbackArticle = null) {
  const title = normalizeString(payload?.title ?? fallbackArticle?.title);
  const slug = slugify(payload?.slug || payload?.title || fallbackArticle?.slug || fallbackArticle?.title);
  const shortDescription = normalizeString(payload?.shortDescription ?? fallbackArticle?.shortDescription);
  const content = String(payload?.content ?? fallbackArticle?.content ?? "").trim();
  const category = normalizeString(payload?.category ?? fallbackArticle?.category);
  const tags = normalizeStringList(
    Array.isArray(payload?.tags)
      ? payload.tags
      : typeof payload?.tags === "string"
      ? payload.tags.split(",")
      : Array.isArray(fallbackArticle?.tags)
      ? fallbackArticle.tags
      : [],
  );
  const featuredImage = normalizeString(payload?.featuredImage ?? fallbackArticle?.featuredImage);
  const metaTitle = normalizeString(payload?.metaTitle ?? fallbackArticle?.metaTitle);
  const metaDescription = normalizeString(payload?.metaDescription ?? fallbackArticle?.metaDescription);
  const author = normalizeString(payload?.author ?? fallbackArticle?.author);
  const normalizedStatus = normalizeString(payload?.status ?? fallbackArticle?.status).toLowerCase();
  const publishDateValue = payload?.publishDate ?? fallbackArticle?.publishDate ?? null;
  const publishDate = publishDateValue ? new Date(publishDateValue) : null;
  const categoryIds = (payload?.categoryIds || fallbackArticle?.categoryIds || [])
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item > 0);

  return {
    title,
    slug,
    shortDescription,
    content,
    category,
    tags,
    featuredImage,
    metaTitle,
    metaDescription,
    author,
    status: ["draft", "published"].includes(normalizedStatus) ? normalizedStatus : "draft",
    publishDate: publishDate && Number.isFinite(publishDate.getTime()) ? publishDate : null,
    categoryIds,
    commentsEnabled:
      typeof payload?.commentsEnabled === "boolean"
        ? payload.commentsEnabled
        : fallbackArticle?.commentsEnabled ?? true,
    isFeatured:
      typeof payload?.isFeatured === "boolean"
        ? payload.isFeatured
        : fallbackArticle?.isFeatured ?? false,
  };
}

function normalizeServiceSection(value, fallbackSection = null) {
  return {
    id: 1,
    title: normalizeString(value?.title ?? fallbackSection?.title),
    subtitle: normalizeString(value?.subtitle ?? fallbackSection?.subtitle),
  };
}

function normalizeServices(items) {
  return normalizeCollection(items, (item, index) => {
    const name = normalizeString(item?.name);
    const slug = normalizeString(item?.slug).toLowerCase();
    const impression = normalizeString(item?.impression);
    const description = normalizeString(item?.description);
    const content = String(item?.content || "").trim();

    if (!name || !slug || !description) {
      return null;
    }

    return {
      id: index + 1,
      slug,
      name,
      impression,
      description,
      content,
      isFeatured: Boolean(item?.isFeatured),
      icon: normalizeString(item?.icon) || "briefcase",
      status: typeof item?.status === "boolean" ? item.status : true,
      impressionCount: Math.max(0, Number.parseInt(item?.impressionCount, 10) || 0),
      views: Math.max(0, Number.parseInt(item?.views, 10) || 0),
      sortOrder: index + 1,
      comments: normalizeCollection(item?.comments || [], (comment, commentIndex) => {
        const commentText = normalizeString(comment?.comment);

        if (!commentText) {
          return null;
        }

        return {
          photo: normalizeString(comment?.photo) || "/profile.png",
          comment: commentText,
          impression: normalizeString(comment?.impression),
          sortOrder: commentIndex + 1,
          replies: normalizeCollection(comment?.replies || [], (reply, replyIndex) => {
            const replyText = normalizeString(reply?.reply);

            if (!replyText) {
              return null;
            }

            return {
              reply: replyText,
              impression: normalizeString(reply?.impression),
              sortOrder: replyIndex + 1,
            };
          }),
        };
      }),
    };
  });
}

function normalizePricings(items) {
  return normalizeCollection(items, (item, index) => {
    const slug = slugify(item?.slug || item?.name);
    const name = normalizeString(item?.name);
    const description = normalizeString(item?.description);
    const duration = normalizeString(item?.duration);
    const content = String(item?.content || "").trim();
    const parsedPrice = Number.parseFloat(item?.price);
    const price = Number.isFinite(parsedPrice) ? parsedPrice : Number.NaN;
    const features = normalizeStringList(item?.features);

    if (!slug || !name || !description || !duration || !content || !Number.isFinite(price)) {
      return null;
    }

    return {
      id: index + 1,
      slug,
      name,
      description,
      price,
      duration,
      content,
      features,
      status: typeof item?.status === "boolean" ? item.status : true,
      isPopular: Boolean(item?.isPopular),
      sortOrder: index + 1,
    };
  });
}

function normalizeFaqs(items) {
  return normalizeCollection(items, (item, index) => {
    const question = normalizeString(item?.question);
    const answer = String(item?.answer || "").trim();

    if (!question || !answer) {
      return null;
    }

    return {
      id: index + 1,
      question,
      answer,
      status: typeof item?.status === "boolean" ? item.status : true,
      sortOrder: index + 1,
    };
  });
}

function normalizeTestimonials(items) {
  return normalizeCollection(items, (item, index) => {
    const name = normalizeString(item?.name);
    const content = String(item?.content || "").trim();
    const company = normalizeString(item?.company);
    const position = normalizeString(item?.position);
    const stars = Math.max(1, Math.min(5, Number.parseInt(item?.stars, 10) || 5));

    if (!name || !content || !company) {
      return null;
    }

    return {
      id: index + 1,
      name,
      content,
      image: normalizeString(item?.image),
      company,
      position,
      stars,
      status: typeof item?.status === "boolean" ? item.status : true,
      sortOrder: index + 1,
    };
  });
}

function normalizeCollection(items, mapper) {
  return (items || []).map((item, index) => mapper(item, index)).filter(Boolean);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countFilled(items, predicate) {
  return (items || []).filter(predicate).length;
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

function serializeContactMessageSummary(message) {
  const latestReply = message.chatMessages?.[0] ? serializeContactChatMessage(message.chatMessages[0]) : null;
  const hasAdminReply = (message.chatMessages || []).some((item) => item.senderType === "admin");
  const status = message.status || "not_solved";
  const isNew = status === "solved" ? false : !hasAdminReply;
  const messageType = status === "solved" ? "none" : isNew ? "new" : "open";

  return {
    id: message.id,
    name: message.name,
    email: message.email,
    subject: message.subject || "",
    message: message.message,
    photo: message.photo || "",
    file: message.file || "",
    status,
    isNew,
    messageType,
    createdAt: message.createdAt,
    lastMessageAt: latestReply?.createdAt || message.createdAt,
    messageCount: message._count?.chatMessages || 0,
    latestReply,
  };
}

function serializeContactMessageDetail(message) {
  return {
    ...serializeContactMessageSummary(message),
    chatMessages: (message.chatMessages || []).map(serializeContactChatMessage),
  };
}

function serializeArticle(article) {
  return {
    ...article,
    tags: Array.isArray(article?.tags) ? article.tags : [],
    categories: (article?.categories || []).map((item) => ({
      id: item.category?.id ?? item.id,
      name: item.category?.name ?? item.name,
      slug: item.category?.slug ?? item.slug,
    })),
    categoryIds: (article?.categories || []).map((item) => item.category?.id ?? item.id).filter(Boolean),
    featuredImage: article?.featuredImage || "",
    metaTitle: article?.metaTitle || "",
    metaDescription: article?.metaDescription || "",
    commentsEnabled: typeof article?.commentsEnabled === "boolean" ? article.commentsEnabled : true,
    isFeatured: typeof article?.isFeatured === "boolean" ? article.isFeatured : false,
    views: Math.max(0, Number.parseInt(article?.views, 10) || 0),
    impressionCount: Math.max(0, Number.parseInt(article?.impressionCount, 10) || 0),
  };
}

function serializeArticleCategory(category) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function serializeEmergencyContact(contact) {
  return {
    id: contact.id,
    label: contact.label,
    name: contact.name,
    icon: contact.icon,
    link: contact.link,
    sortOrder: Math.max(1, Number.parseInt(contact.sortOrder, 10) || 1),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

function serializeAdminUser(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    twoFactorEnabled: Boolean(admin.twoFactorEnabled),
  };
}

function serializeAiProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl || "",
    isActive: Boolean(provider.isActive),
    createdAt: provider.createdAt,
    hasApiKey: Boolean(normalizeString(provider.apiKey)),
  };
}

function serializeAiTrainingEntry(entry) {
  return {
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    isActive: Boolean(entry.isActive),
    createdAt: entry.createdAt,
  };
}

function buildDashboardSummary(data) {
  const services = data.services || [];
  const projects = data.projects || [];
  const pricings = data.pricings || [];
  const faqs = data.faqs || [];
  const testimonials = data.testimonials || [];
  const skills = data.skills || [];
  const experiences = data.experiences || [];
  const educations = data.educations || [];
  const achievements = data.achievements || [];
  const statsCounters = data.statsCounters || [];
  const messages = data.messages || [];
  const siteSettings = data.siteSettings || {};
  const profile = data.profile || {};

  const activeServices = countFilled(services, (item) => item?.status);
  const featuredServices = countFilled(services, (item) => item?.isFeatured);
  const totalProjects = projects.length;
  const totalProjectViews = projects.reduce((sum, item) => sum + (Number(item?.views) || 0), 0);
  const totalProjectImpressions = projects.reduce((sum, item) => sum + (Number(item?.impressionCount) || 0), 0);
  const activePricings = countFilled(pricings, (item) => item?.status);
  const popularPricings = countFilled(pricings, (item) => item?.isPopular);
  const activeFaqs = countFilled(faqs, (item) => item?.status);
  const activeTestimonials = countFilled(testimonials, (item) => item?.status);
  const totalSkills = countFilled(skills, (item) => normalizeString(item?.name));
  const averageSkillPercentage = totalSkills
    ? Math.round(
        skills.reduce((sum, item) => sum + Math.max(0, Math.min(100, Number(item?.percentage) || 0)), 0) /
          totalSkills,
      )
    : 0;
  const socialLinksCount = countFilled(profile?.socialLinks || [], (item) => normalizeString(item?.link));
  const settingsCompletionCount = [
    siteSettings.websiteTitle,
    siteSettings.contactEmail,
    siteSettings.canonicalUrl,
    siteSettings.googleAnalyticsId || siteSettings.googleTagManagerId,
    siteSettings.smtpHost,
  ].filter((item) => normalizeString(item)).length;
  const settingsCompletionPercentage = Math.round((settingsCompletionCount / 5) * 100);
  const totalContentItems =
    services.length +
    projects.length +
    pricings.length +
    faqs.length +
    testimonials.length +
    skills.length +
    experiences.length +
    educations.length +
    achievements.length +
    statsCounters.length;
  const topService = [...services].sort((a, b) => (Number(b?.views) || 0) - (Number(a?.views) || 0))[0];
  const topProject = [...projects].sort((a, b) => (Number(b?.views) || 0) - (Number(a?.views) || 0))[0];
  const latestMessage = messages[0];
  const latestPublishedTestimonial = testimonials.find((item) => item?.status);

  return {
    configuredPercentage: settingsCompletionPercentage,
    workspace: {
      title: profile?.name
        ? `${profile.name}'s portfolio command center`
        : "Portfolio command center",
      description: [
        `${totalContentItems} content items are available across your portfolio.`,
        topProject?.name ? `Top project: ${topProject.name}.` : null,
        topService?.name ? `Top service: ${topService.name}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      badge: siteSettings?.websiteTitle || "Portfolio Admin",
    },
    quickActions: [
      {
        label: topService?.name ? `Service: ${topService.name}` : "Manage services",
        description: topService?.name
          ? `${Number(topService.views) || 0} views and ${Number(topService.impressionCount) || 0} impressions`
          : `${activeServices}/${services.length || 0} services are live`,
        href: "/admin/services",
        icon: "services",
      },
      {
        label: topProject?.name ? `Project: ${topProject.name}` : "Review projects",
        description: topProject?.name
          ? `${Number(topProject.views) || 0} views and ${Number(topProject.impressionCount) || 0} impressions`
          : `${totalProjectViews} tracked views across ${totalProjects} projects`,
        href: "/admin/projects",
        icon: "projects",
      },
      {
        label: latestMessage?.name ? `Inbox: ${latestMessage.name}` : "Open inbox",
        description: latestMessage?.email
          ? `${latestMessage.email} sent the latest contact message`
          : `${messages.length} contact messages collected from the site`,
        href: "/admin/messages",
        icon: "messages",
      },
      {
        label: latestPublishedTestimonial?.name
          ? `Review: ${latestPublishedTestimonial.name}`
          : "Check settings",
        description: latestPublishedTestimonial?.company
          ? `${latestPublishedTestimonial.company} review is currently published`
          : `${settingsCompletionPercentage}% of key site settings are configured`,
        href: latestPublishedTestimonial?.name ? "/admin/testimonials" : "/admin/settings",
        icon: latestPublishedTestimonial?.name ? "testimonials" : "settings",
      },
    ],
    statusCards: [
      {
        label: "Tracking IDs",
        value: siteSettings.googleAnalyticsId || siteSettings.googleTagManagerId ? "Saved" : "Missing",
        detail:
          siteSettings.googleAnalyticsId || siteSettings.googleTagManagerId || "GA4 or GTM is not configured yet",
      },
      {
        label: "Mail Delivery",
        value: siteSettings.smtpHost ? "Configured" : "Pending",
        detail: siteSettings.smtpFromEmail || "SMTP sender email is not saved yet",
      },
      {
        label: "FAQs",
        value: `${activeFaqs}/${faqs.length || 0}`,
        detail: `${countFilled(faqs, (item) => stripHtml(item?.answer))} answers are ready for visitors`,
      },
      {
        label: "Testimonials",
        value: `${activeTestimonials}/${testimonials.length || 0}`,
        detail: `${countFilled(testimonials, (item) => normalizeString(item?.image))} testimonials include a client image`,
      },
      {
        label: "Featured Services",
        value: `${featuredServices}`,
        detail: `${services.length || 0} total services available on the portfolio`,
      },
    ],
    collectionHealth: [
      {
        label: "Services",
        value: activeServices,
        total: services.length,
        accentClass: "from-[#38bdf8] to-[#0ea5e9]",
      },
      {
        label: "Projects",
        value: totalProjects,
        total: totalProjects,
        accentClass: "from-[#22c55e] to-[#14b8a6]",
      },
      {
        label: "Pricing",
        value: activePricings,
        total: pricings.length,
        accentClass: "from-[#f59e0b] to-[#f97316]",
      },
      {
        label: "FAQs",
        value: activeFaqs,
        total: faqs.length,
        accentClass: "from-[#14b8a6] to-[#06b6d4]",
      },
      {
        label: "Testimonials",
        value: activeTestimonials,
        total: testimonials.length,
        accentClass: "from-[#a78bfa] to-[#6366f1]",
      },
    ],
    snapshot: [
      { label: "Content library", value: totalContentItems },
      { label: "Project impressions", value: totalProjectImpressions },
      { label: "Average skill strength", value: `${averageSkillPercentage}%` },
      { label: "Social links", value: socialLinksCount },
      { label: "Popular pricing plans", value: popularPricings },
      { label: "Published FAQs", value: activeFaqs },
      { label: "Stats counters", value: statsCounters.length },
    ],
    recentMessages: messages.filter((item) => item.status !== "solved").slice(0, 4),
  };
}

function hasPricingModel() {
  return Boolean(prisma?.pricing && typeof prisma.pricing.findMany === "function");
}

function hasAiProviderModel() {
  return Boolean(prisma?.aiProvider && typeof prisma.aiProvider.findMany === "function");
}

function hasAiSettingsModel() {
  return Boolean(prisma?.aiSettings && typeof prisma.aiSettings.findUnique === "function");
}

function hasAiTrainingEntryModel() {
  return Boolean(prisma?.aiTrainingEntry && typeof prisma.aiTrainingEntry.findMany === "function");
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

function hasArticleCategoryModel() {
  return Boolean(prisma?.articleCategory && typeof prisma.articleCategory.findMany === "function");
}

function hasEmergencyContactModel() {
  return Boolean(prisma?.emergencyContact && typeof prisma.emergencyContact.findMany === "function");
}

function isMissingTableError(error, modelName) {
  return error?.code === "P2021" && error?.meta?.modelName === modelName;
}

async function hasAchievementTable() {
  try {
    await prisma.achievement.count();
    return true;
  } catch (error) {
    if (isMissingTableError(error, "Achievement")) {
      return false;
    }

    throw error;
  }
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
    return await prisma.testimonial.findMany({ orderBy: { sortOrder: "asc" } });
  } catch (error) {
    if (isMissingTableError(error, "Testimonial")) {
      return [];
    }

    throw error;
  }
}

async function getFaqsSafely() {
  if (!hasFaqModel()) {
    return [];
  }

  try {
    return await prisma.faq.findMany({ orderBy: { sortOrder: "asc" } });
  } catch (error) {
    if (isMissingTableError(error, "Faq")) {
      return [];
    }

    throw error;
  }
}

async function getDashboardData() {
  const [profile, siteSettings, serviceSection, services, statsCounters, achievements, skills, experiences, educations, projects, pricings, faqs, testimonials, messages] = await Promise.all([
    prisma.profile.findUnique({ where: { id: 1 } }),
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.serviceSection.findUnique({ where: { id: 1 } }),
    prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
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
    prisma.statsCounter.findMany({ orderBy: { sortOrder: "asc" } }),
    getAchievementsSafely(),
    prisma.skill.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.experience.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.education.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.project.findMany({ orderBy: { sortOrder: "asc" } }),
    hasPricingModel()
      ? prisma.pricing.findMany({ orderBy: { sortOrder: "asc" } })
      : Promise.resolve([]),
    getFaqsSafely(),
    getTestimonialsSafely(),
    prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        chatMessages: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            chatMessages: true,
          },
        },
      },
    }),
  ]);

  const data = {
    profile,
    siteSettings: serializeSiteSettings(siteSettings, { includeSensitive: true }),
    serviceSection,
    services,
    statsCounters,
    achievements,
    skills,
    experiences,
    educations,
    projects,
    pricings,
    faqs,
    testimonials,
    messages: messages.map(serializeContactMessageSummary),
  };

  return {
    ...data,
    dashboardSummary: buildDashboardSummary({
      ...data,
      siteSettings: serializeSiteSettings(siteSettings, { includeSensitive: true }),
    }),
  };
}

function parsePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDateLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatWeekdayLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function seededValue(seed, min, max) {
  const raw = Math.sin(seed) * 10000;
  const normalized = raw - Math.floor(raw);
  return Math.round(min + normalized * (max - min));
}

function buildFallbackAnalytics(reason = "Google Analytics credentials are not configured.") {
  const today = new Date();
  const growth = [];

  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    const trendBase = 90 + (29 - offset) * 4;
    const users = trendBase + seededValue(offset + 11, 0, 34);
    growth.push({
      date: formatIsoDate(date),
      label: formatShortDateLabel(date),
      users,
    });
  }

  const weekly = growth.slice(-7).map((entry) => {
    const date = new Date(`${entry.date}T00:00:00.000Z`);
    return {
      label: formatWeekdayLabel(date),
      users: entry.users,
    };
  });

  return {
    source: "simulated",
    connected: false,
    propertyId: process.env.GA4_PROPERTY_ID || "",
    measurementId: "",
    activeUsers: growth[growth.length - 1]?.users || 0,
    todayUsers: growth[growth.length - 1]?.users || 0,
    last7DaysUsers: growth.slice(-7).reduce((sum, item) => sum + item.users, 0),
    last30DaysUsers: growth.reduce((sum, item) => sum + item.users, 0),
    growth,
    weekly,
    visitors: [],
    fetchedAt: new Date().toISOString(),
    vercel: getVercelAnalyticsMeta(),
    speedInsights: getVercelSpeedInsightsMeta(),
    note: reason,
  };
}


function getVercelAnalyticsMeta() {
  const environment = String(process.env.VERCEL_ENV || "").trim();
  const isVercelRuntime = Boolean(
    String(process.env.VERCEL || "").trim() ||
    String(process.env.VERCEL_URL || "").trim() ||
    environment,
  );

  return {
    enabled: true,
    collecting: isVercelRuntime,
    environment,
    note: isVercelRuntime
      ? "The @vercel/analytics package is installed and the runtime looks like a Vercel deployment."
      : "The @vercel/analytics package is installed, but this runtime does not look like a Vercel deployment, so dashboard data may not be available there.",
  };
}

function getVercelSpeedInsightsMeta() {
  const environment = String(process.env.VERCEL_ENV || "").trim();
  const isVercelRuntime = Boolean(
    String(process.env.VERCEL || "").trim() ||
    String(process.env.VERCEL_URL || "").trim() ||
    environment,
  );

  return {
    enabled: true,
    collecting: isVercelRuntime,
    environment,
    note: isVercelRuntime
      ? "The @vercel/speed-insights package is installed and the runtime looks like a Vercel deployment."
      : "The @vercel/speed-insights package is installed, but this runtime does not look like a Vercel deployment, so dashboard data may not be available there.",
  };
}

function getUtcDateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

const internalAnalyticsLiveWindowMs = 2 * 60 * 1000;

function isPublicIp(ip) {
  if (!ip) {
    return false;
  }

  const value = String(ip).replace(/^::ffff:/, "");
  return !(
    value === "127.0.0.1" ||
    value === "::1" ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value)
  );
}

async function lookupGeoDetailsByIp(ipAddress) {
  const normalizedIp = normalizeString(ipAddress).replace(/^::ffff:/, "");

  if (!isPublicIp(normalizedIp)) {
    return { country: "", region: "", city: "" };
  }

  try {
    const geoResponse = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalizedIp)}?fields=status,country,regionName,city`,
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

async function enrichAnalyticsVisitorsGeo(visitors = []) {
  const cache = new Map();

  return Promise.all(
    (visitors || []).map(async (visitor) => {
      const currentCountry = normalizeString(visitor.country);
      const currentRegion = normalizeString(visitor.region);
      const currentCity = normalizeString(visitor.city);

      if (currentCountry || currentRegion || currentCity) {
        return visitor;
      }

      const normalizedIp = normalizeString(visitor.ipAddress);
      if (!isPublicIp(normalizedIp)) {
        return visitor;
      }

      if (!cache.has(normalizedIp)) {
        cache.set(normalizedIp, lookupGeoDetailsByIp(normalizedIp));
      }

      const geoDetails = await cache.get(normalizedIp);
      if (!geoDetails.country && !geoDetails.region && !geoDetails.city) {
        return visitor;
      }

      await prisma.analyticsSession.update({
        where: { id: visitor.id },
        data: {
          ...(geoDetails.country ? { country: geoDetails.country } : {}),
          ...(geoDetails.region ? { region: geoDetails.region } : {}),
          ...(geoDetails.city ? { city: geoDetails.city } : {}),
        },
      }).catch(() => null);

      return {
        ...visitor,
        country: geoDetails.country || currentCountry,
        region: geoDetails.region || currentRegion,
        city: geoDetails.city || currentCity,
      };
    }),
  );
}

async function getInternalAnalyticsData() {
  const now = new Date();
  const today = getUtcDateOnly(now);
  const thirtyDaysAgo = addUtcDays(today, -29);
  const sevenDaysAgo = addUtcDays(today, -6);
  const activeThreshold = new Date(now.getTime() - internalAnalyticsLiveWindowMs);

  try {
    const [activeUsers, todayUsers, last7DaysUsers, last30DaysUsers, growthRows, visitors] = await Promise.all([
      prisma.analyticsSession.count({
        where: {
          lastSeenAt: {
            gte: activeThreshold,
          },
        },
      }),
      prisma.analyticsDailyVisit.count({
        where: {
          visitDate: today,
        },
      }),
      prisma.analyticsDailyVisit.count({
        where: {
          visitDate: {
            gte: sevenDaysAgo,
          },
        },
      }),
      prisma.analyticsDailyVisit.count({
        where: {
          visitDate: {
            gte: thirtyDaysAgo,
          },
        },
      }),
      prisma.analyticsDailyVisit.groupBy({
        by: ["visitDate"],
        where: {
          visitDate: {
            gte: thirtyDaysAgo,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          visitDate: "asc",
        },
      }),
      prisma.analyticsSession.findMany({
        orderBy: {
          lastSeenAt: "desc",
        },
        take: 20,
        include: {
          pageViews: {
            orderBy: {
              lastViewedAt: "desc",
            },
          },
        },
      }),
    ]);

    const visitorsWithGeo = await enrichAnalyticsVisitorsGeo(visitors);

    const growthMap = new Map(
      growthRows.map((row) => [formatIsoDate(new Date(row.visitDate)), row._count.id]),
    );
    const growth = [];

    for (let offset = 0; offset < 30; offset += 1) {
      const date = addUtcDays(thirtyDaysAgo, offset);
      const key = formatIsoDate(date);
      growth.push({
        date: key,
        label: formatShortDateLabel(date),
        users: growthMap.get(key) || 0,
      });
    }

    const weekly = growth.slice(-7).map((entry) => {
      const date = new Date(`${entry.date}T00:00:00.000Z`);
      return {
        label: formatWeekdayLabel(date),
        users: entry.users,
      };
    });

    return {
      source: "internal",
      connected: true,
      propertyId: "",
      measurementId: "",
      activeUsers,
      todayUsers,
      last7DaysUsers,
      last30DaysUsers,
      growth,
      weekly,
      visitors: visitorsWithGeo.map((visitor) => {
        const isLive = visitor.lastSeenAt >= activeThreshold;
        const country = normalizeString(visitor.country);
        const region = normalizeString(visitor.region);
        const city = normalizeString(visitor.city);

        return {
          id: visitor.id,
          userId: visitor.sessionId,
          ipAddress: visitor.ipAddress || "",
          country,
          region,
          city,
          geo: {
            country,
            region,
            city,
          },
          location: [city, region].filter(Boolean).join(", "),
          currentPage: visitor.lastPath || visitor.firstPath || "/",
          status: isLive ? "live" : "away",
          isLive,
          lastSeenAt: visitor.lastSeenAt,
          createdAt: visitor.createdAt,
          pageViews: (visitor.pageViews || []).map((page) => ({
            id: page.id,
            path: page.path,
            firstViewedAt: page.firstViewedAt,
            lastViewedAt: page.lastViewedAt,
            viewCount: page.viewCount,
          })),
        };
      }),
      fetchedAt: now.toISOString(),
      vercel: getVercelAnalyticsMeta(),
      speedInsights: getVercelSpeedInsightsMeta(),
      speedInsights: getVercelSpeedInsightsMeta(),
      note: "Live traffic data collected directly from your portfolio frontend.",
    };
  } catch (error) {
    if (error?.code === "P2021") {
      return buildFallbackAnalytics("Apply the latest Prisma migration to enable internal analytics tracking.");
    }

    throw error;
  }
}

function getMetricValue(result) {
  return Number.parseInt(result?.data?.rows?.[0]?.metricValues?.[0]?.value || "0", 10) || 0;
}

function mapDateRow(row) {
  const raw = String(row?.dimensionValues?.[0]?.value || "");
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);

  return {
    date: formatIsoDate(date),
    label: formatShortDateLabel(date),
    users: Number.parseInt(row?.metricValues?.[0]?.value || "0", 10) || 0,
  };
}

async function getAnalyticsData() {
  const propertyId = String(process.env.GA4_PROPERTY_ID || "").trim();
  const clientEmail = String(process.env.GA4_CLIENT_EMAIL || "").trim();
  const privateKey = parsePrivateKey(process.env.GA4_PRIVATE_KEY);
  const siteSettings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const measurementId = siteSettings?.googleAnalyticsId || "";

  if (!propertyId || !clientEmail || !privateKey) {
    return getInternalAnalyticsData().catch(() =>
      buildFallbackAnalytics(
      measurementId
        ? "GA4 measurement ID is saved, but Data API credentials are missing."
        : "Connect GA4 credentials or use internal analytics tracking for live data.",
    ));
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });

    await auth.authorize();

    const analyticsdata = google.analyticsdata({
      version: "v1beta",
      auth,
    });
    const property = `properties/${propertyId}`;

    const [realtime, today, last7Days, last30Days, growthReport] = await Promise.all([
      analyticsdata.properties.runRealtimeReport({
        property,
        requestBody: {
          metrics: [{ name: "activeUsers" }],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: "today", endDate: "today" }],
          metrics: [{ name: "activeUsers" }],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: "6daysAgo", endDate: "today" }],
          metrics: [{ name: "activeUsers" }],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
          metrics: [{ name: "activeUsers" }],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
        },
      }),
    ]);

    const growth = (growthReport?.data?.rows || []).map(mapDateRow);
    const weekly = growth.slice(-7).map((entry) => {
      const date = new Date(`${entry.date}T00:00:00.000Z`);
      return {
        label: formatWeekdayLabel(date),
        users: entry.users,
      };
    });
    const internalAnalytics = await getInternalAnalyticsData().catch(() => ({ visitors: [] }));

    return {
      source: "ga4",
      connected: true,
      propertyId,
      measurementId,
      activeUsers: getMetricValue(realtime),
      todayUsers: getMetricValue(today),
      last7DaysUsers: getMetricValue(last7Days),
      last30DaysUsers: getMetricValue(last30Days),
      growth,
      weekly,
      visitors: internalAnalytics.visitors || [],
      fetchedAt: new Date().toISOString(),
      vercel: getVercelAnalyticsMeta(),
      speedInsights: getVercelSpeedInsightsMeta(),
      note: "Live data from the Google Analytics Data API.",
    };
  } catch (error) {
    console.error("Failed to load Google Analytics data:", error.message);
    return getInternalAnalyticsData().catch(() =>
      buildFallbackAnalytics("Google Analytics data is unavailable right now, so simulated data is shown."),
    );
  }
}

router.post("/login", async (request, response) => {
  try {
    const email = normalizeString(request.body?.email).toLowerCase();
    const password = String(request.body?.password || "");
    const twoFactorCode = String(request.body?.twoFactorCode || "");

    if (!email || !password) {
      return response.status(400).json({ message: "Email and password are required." });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin) {
      return response.status(401).json({ message: "Invalid email or password." });
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);

    if (!isValid) {
      return response.status(401).json({ message: "Invalid email or password." });
    }

    if (admin.twoFactorEnabled) {
      if (!admin.twoFactorSecret) {
        return response.status(500).json({ message: "Two-factor authentication is not configured correctly." });
      }

      if (!twoFactorCode) {
        return response.status(200).json({
          requiresTwoFactor: true,
          message: "Enter your 2FA code to continue.",
        });
      }

      if (!verifyTwoFactorCode(admin.twoFactorSecret, twoFactorCode)) {
        return response.status(401).json({ message: "Invalid 2FA code." });
      }
    }

    const token = signAdminToken(admin);

    return response.json({
      token,
      admin: serializeAdminUser(admin),
    });
  } catch (error) {
    console.error("Admin login failed:", error.message);
    return response.status(500).json({ message: "Login failed." });
  }
});

router.get("/me", requireAdmin, async (request, response) => {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { email: request.admin.email },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
      },
    });

    return response.json(admin);
  } catch (error) {
    return response.status(500).json({ message: "Failed to load admin." });
  }
});

router.put("/me", requireAdmin, async (request, response) => {
  try {
    const name = normalizeString(request.body?.name);
    const email = normalizeString(request.body?.email).toLowerCase();

    if (!name || !email) {
      return response.status(400).json({ message: "Name and email are required." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(400).json({ message: "Enter a valid email address." });
    }

    const currentAdmin = await prisma.adminUser.findUnique({
      where: { email: request.admin.email },
      select: {
        id: true,
        email: true,
      },
    });

    if (!currentAdmin) {
      return response.status(404).json({ message: "Admin not found." });
    }

    const existingAdmin = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingAdmin && existingAdmin.id !== currentAdmin.id) {
      return response.status(409).json({ message: "Another admin already uses this email address." });
    }

    const updatedAdmin = await prisma.adminUser.update({
      where: { id: currentAdmin.id },
      data: {
        name,
        email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
      },
    });

    return response.json({
      success: true,
      message: "Admin profile updated successfully.",
      admin: updatedAdmin,
      token: signAdminToken(updatedAdmin),
    });
  } catch (error) {
    console.error("Failed to update admin profile:", error.message);
    return response.status(500).json({ message: "Failed to update admin profile." });
  }
});

router.put("/me/password", requireAdmin, async (request, response) => {
  try {
    const currentPassword = String(request.body?.currentPassword || "");
    const newPassword = String(request.body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return response.status(400).json({ message: "Current password and new password are required." });
    }

    if (newPassword.length < 8) {
      return response.status(400).json({ message: "New password must be at least 8 characters long." });
    }

    if (currentPassword === newPassword) {
      return response.status(400).json({ message: "New password must be different from the current password." });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: request.admin.email },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!admin) {
      return response.status(404).json({ message: "Admin not found." });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, admin.passwordHash);

    if (!isValidPassword) {
      return response.status(401).json({ message: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash,
      },
    });

    return response.json({
      success: true,
      message: "Admin password changed successfully.",
    });
  } catch (error) {
    console.error("Failed to change admin password:", error.message);
    return response.status(500).json({ message: "Failed to change admin password." });
  }
});

router.get("/2fa/setup", requireAdmin, async (request, response) => {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { email: request.admin.email },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!admin) {
      return response.status(404).json({ message: "Admin not found." });
    }

    if (admin.twoFactorEnabled) {
      return response.status(409).json({ message: "2FA is already enabled for this admin account." });
    }

    let secret = admin.twoFactorSecret;

    if (!secret) {
      const generatedSecret = generateTwoFactorSecret(admin);
      secret = generatedSecret.base32;

      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          twoFactorSecret: secret,
          twoFactorEnabled: false,
        },
      });
    }

    const otpAuthUrl = buildTwoFactorOtpAuthUrl(admin, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return response.json({
      manualEntryKey: secret,
      otpAuthUrl,
      qrCodeDataUrl,
    });
  } catch (error) {
    console.error("Failed to prepare 2FA setup:", error.message);
    return response.status(500).json({ message: "Failed to prepare 2FA setup." });
  }
});

router.post("/2fa/enable", requireAdmin, async (request, response) => {
  try {
    const code = String(request.body?.code || "");
    const admin = await prisma.adminUser.findUnique({
      where: { email: request.admin.email },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!admin) {
      return response.status(404).json({ message: "Admin not found." });
    }

    if (admin.twoFactorEnabled) {
      return response.status(409).json({ message: "2FA is already enabled." });
    }

    if (!admin.twoFactorSecret) {
      return response.status(400).json({ message: "Start 2FA setup first." });
    }

    if (!verifyTwoFactorCode(admin.twoFactorSecret, code)) {
      return response.status(400).json({ message: "Invalid 2FA code." });
    }

    const updatedAdmin = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        twoFactorEnabled: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
      },
    });

    return response.json({
      admin: updatedAdmin,
      message: "2FA enabled successfully.",
    });
  } catch (error) {
    console.error("Failed to enable 2FA:", error.message);
    return response.status(500).json({ message: "Failed to enable 2FA." });
  }
});

router.post("/2fa/disable", requireAdmin, async (request, response) => {
  try {
    const code = String(request.body?.code || "");
    const admin = await prisma.adminUser.findUnique({
      where: { email: request.admin.email },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!admin) {
      return response.status(404).json({ message: "Admin not found." });
    }

    if (!admin.twoFactorEnabled || !admin.twoFactorSecret) {
      return response.status(400).json({ message: "2FA is not enabled." });
    }

    if (!verifyTwoFactorCode(admin.twoFactorSecret, code)) {
      return response.status(400).json({ message: "Invalid 2FA code." });
    }

    const updatedAdmin = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
      },
    });

    return response.json({
      admin: updatedAdmin,
      message: "2FA disabled successfully.",
    });
  } catch (error) {
    console.error("Failed to disable 2FA:", error.message);
    return response.status(500).json({ message: "Failed to disable 2FA." });
  }
});

router.get("/dashboard", requireAdmin, async (_request, response) => {
  try {
    return response.json(await getDashboardData());
  } catch (error) {
    console.error("Failed to load dashboard:", error.message);
    return response.status(500).json({ message: "Failed to load dashboard data." });
  }
});

router.get("/ai/providers", requireAdmin, async (_request, response) => {
  try {
    if (!hasAiProviderModel()) {
      return response.status(503).json({ message: "AI provider model is not available yet." });
    }

    const providers = await prisma.aiProvider.findMany({
      orderBy: { createdAt: "asc" },
    });

    return response.json({
      providers: providers.map(serializeAiProvider),
    });
  } catch (error) {
    console.error("Failed to load AI providers:", error.message);
    return response.status(500).json({ message: "Failed to load AI providers." });
  }
});

router.put("/ai/providers/:name", requireAdmin, async (request, response) => {
  try {
    if (!hasAiProviderModel()) {
      return response.status(503).json({ message: "AI provider model is not available yet." });
    }

    const name = normalizeString(request.params.name).toLowerCase();
    const apiKey = normalizeString(request.body?.apiKey);
    const baseUrl = normalizeString(request.body?.baseUrl);
    const isActive =
      typeof request.body?.isActive === "boolean" ? request.body.isActive : undefined;

    if (!["openai", "deepseek", "gemini"].includes(name)) {
      return response.status(400).json({ message: "Unsupported AI provider name." });
    }

    const existingProvider = await prisma.aiProvider.findUnique({
      where: { name },
    });
    let encryptedApiKey;

    if (apiKey) {
      try {
        encryptedApiKey = encryptText(apiKey);
      } catch (error) {
        console.error("Failed to encrypt AI provider API key:", error.message);
        return response.status(500).json({
          message: error.message || "AI provider encryption is not configured correctly.",
        });
      }
    }

    const provider = await prisma.aiProvider.upsert({
      where: { name },
      update: {
        baseUrl,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(encryptedApiKey ? { apiKey: encryptedApiKey } : {}),
      },
      create: {
        name,
        baseUrl,
        isActive: Boolean(isActive),
        apiKey: encryptedApiKey || existingProvider?.apiKey || "",
      },
    });

    return response.json({
      message: "AI provider updated successfully.",
      provider: serializeAiProvider(provider),
    });
  } catch (error) {
    console.error("Failed to update AI provider:", error.message);
    return response.status(500).json({ message: "Failed to update AI provider." });
  }
});

router.get("/ai/settings", requireAdmin, async (_request, response) => {
  try {
    if (!hasAiSettingsModel()) {
      return response.status(503).json({ message: "AI settings model is not available yet." });
    }

    const settings = await prisma.aiSettings.findUnique({
      where: { id: 1 },
    });

    return response.json({
      settings: settings || {
        id: 1,
        activeProvider: "",
        modelName: "",
      },
    });
  } catch (error) {
    console.error("Failed to load AI settings:", error.message);
    return response.status(500).json({ message: "Failed to load AI settings." });
  }
});

router.put("/ai/settings", requireAdmin, async (request, response) => {
  try {
    if (!hasAiSettingsModel() || !hasAiProviderModel()) {
      return response.status(503).json({ message: "AI settings are not available yet." });
    }

    const activeProvider = normalizeString(request.body?.activeProvider).toLowerCase();
    const modelName = normalizeAiModelName(
      request.body?.activeProvider,
      request.body?.modelName,
    );

    if (!["openai", "deepseek", "gemini"].includes(activeProvider)) {
      return response.status(400).json({ message: "A valid active provider is required." });
    }

    if (!modelName) {
      return response.status(400).json({ message: "Model name is required." });
    }

    const provider = await prisma.aiProvider.findUnique({
      where: { name: activeProvider },
    });

    if (!provider) {
      return response.status(404).json({ message: "Selected AI provider was not found." });
    }

    const settings = await prisma.$transaction(async (tx) => {
      await tx.aiProvider.update({
        where: { name: activeProvider },
        data: {
          isActive: true,
        },
      });

      return tx.aiSettings.upsert({
        where: { id: 1 },
        update: {
          activeProvider,
          modelName,
        },
        create: {
          id: 1,
          activeProvider,
          modelName,
        },
      });
    });

    return response.json({
      message: "AI settings updated successfully.",
      settings,
    });
  } catch (error) {
    console.error("Failed to update AI settings:", error.message);
    return response.status(500).json({ message: "Failed to update AI settings." });
  }
});

router.get("/ai/training", requireAdmin, async (_request, response) => {
  try {
    if (!hasAiTrainingEntryModel()) {
      return response.status(503).json({ message: "AI training model is not available yet." });
    }

    const entries = await prisma.aiTrainingEntry.findMany({
      orderBy: { createdAt: "desc" },
    });

    return response.json({
      entries: entries.map(serializeAiTrainingEntry),
    });
  } catch (error) {
    console.error("Failed to load AI training entries:", error.message);
    return response.status(500).json({ message: "Failed to load AI training entries." });
  }
});

router.post("/ai/training", requireAdmin, async (request, response) => {
  try {
    if (!hasAiTrainingEntryModel()) {
      return response.status(503).json({ message: "AI training model is not available yet." });
    }

    const question = normalizeString(request.body?.question);
    const answer = String(request.body?.answer || "").trim();
    const isActive =
      typeof request.body?.isActive === "boolean" ? request.body.isActive : true;

    if (!question || !answer) {
      return response.status(400).json({ message: "Training question and answer are required." });
    }

    const entry = await prisma.aiTrainingEntry.create({
      data: {
        question,
        answer,
        isActive,
      },
    });

    return response.status(201).json({
      message: "AI training entry saved successfully.",
      entry: serializeAiTrainingEntry(entry),
    });
  } catch (error) {
    console.error("Failed to save AI training entry:", error.message);
    return response.status(500).json({ message: "Failed to save AI training entry." });
  }
});

router.delete("/ai/training/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasAiTrainingEntryModel()) {
      return response.status(503).json({ message: "AI training model is not available yet." });
    }

    const id = Number.parseInt(request.params.id, 10);
    if (!id) {
      return response.status(400).json({ message: "A valid training entry id is required." });
    }

    await prisma.aiTrainingEntry.delete({
      where: { id },
    });

    return response.json({
      message: "AI training entry deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete AI training entry:", error.message);
    return response.status(500).json({ message: "Failed to delete AI training entry." });
  }
});

router.get("/legal-pages", requireAdmin, async (_request, response) => {
  try {
    const existing = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    const settings = normalizeSiteSettings(existing || getDefaultSiteSettings());

    return response.json({
      privacyPolicyHtml: settings.privacyPolicyHtml,
      termsConditionsHtml: settings.termsConditionsHtml,
    });
  } catch (error) {
    console.error("Failed to load legal pages:", error.message);
    return response.status(500).json({ message: "Failed to load legal pages." });
  }
});

router.put("/legal-pages", requireAdmin, async (request, response) => {
  try {
    const existing = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    const normalized = normalizeSiteSettings(
      {
        ...(existing || getDefaultSiteSettings()),
        privacyPolicyHtml: String(request.body?.privacyPolicyHtml || "").trim(),
        termsConditionsHtml: String(request.body?.termsConditionsHtml || "").trim(),
      },
      existing || {},
    );

    const settings = await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {
        privacyPolicyHtml: normalized.privacyPolicyHtml,
        termsConditionsHtml: normalized.termsConditionsHtml,
      },
      create: normalized,
    });

    emitContentUpdated(request, "legal-pages", {});

    return response.json({
      message: "Legal pages saved successfully.",
      privacyPolicyHtml: settings.privacyPolicyHtml,
      termsConditionsHtml: settings.termsConditionsHtml,
    });
  } catch (error) {
    console.error("Failed to save legal pages:", error.message);
    return response.status(500).json({ message: "Failed to save legal pages." });
  }
});

router.get("/articles", requireAdmin, async (_request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(503).json({ message: "Article model is not available yet. Restart the backend after generating Prisma client." });
    }

    const articles = await prisma.article.findMany({
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { publishDate: "desc" }, { createdAt: "desc" }],
    });

    return response.json({
      articles: articles.map(serializeArticle),
    });
  } catch (error) {
    console.error("Failed to load articles:", error.message);
    return response.status(500).json({ message: "Failed to load articles." });
  }
});

router.get("/article-categories", requireAdmin, async (_request, response) => {
  try {
    if (!hasArticleCategoryModel()) {
      return response.status(503).json({ message: "Article category model is not available yet. Restart the backend after generating Prisma client." });
    }

    const categories = await prisma.articleCategory.findMany({
      orderBy: { name: "asc" },
    });

    return response.json({
      categories: categories.map(serializeArticleCategory),
    });
  } catch (error) {
    console.error("Failed to load article categories:", error.message);
    return response.status(500).json({ message: "Failed to load article categories." });
  }
});

router.post("/article-categories", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleCategoryModel()) {
      return response.status(503).json({ message: "Article category model is not available yet. Restart the backend after generating Prisma client." });
    }

    const name = normalizeString(request.body?.name);
    const slug = slugify(request.body?.slug || name);

    if (!name || !slug) {
      return response.status(400).json({ message: "Category name is required." });
    }

    const category = await prisma.articleCategory.create({
      data: { name, slug },
    });
    const serializedCategory = serializeArticleCategory(category);
    emitContentUpdated(request, "article-categories", {
      categoryId: serializedCategory.id,
    });

    return response.status(201).json({
      message: "Article category created successfully.",
      category: serializedCategory,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return response.status(409).json({ message: "An article category with this name or slug already exists." });
    }

    console.error("Failed to create article category:", error.message);
    return response.status(500).json({ message: "Failed to create article category." });
  }
});

router.put("/article-categories/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleCategoryModel()) {
      return response.status(503).json({ message: "Article category model is not available yet. Restart the backend after generating Prisma client." });
    }

    const categoryId = Number.parseInt(request.params.id, 10);
    const name = normalizeString(request.body?.name);
    const slug = slugify(request.body?.slug || name);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return response.status(400).json({ message: "A valid category id is required." });
    }

    if (!name || !slug) {
      return response.status(400).json({ message: "Category name is required." });
    }

    const existingCategory = await prisma.articleCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) {
      return response.status(404).json({ message: "Article category not found." });
    }

    const category = await prisma.articleCategory.update({
      where: { id: categoryId },
      data: { name, slug },
    });
    const serializedCategory = serializeArticleCategory(category);
    emitContentUpdated(request, "article-categories", {
      categoryId: serializedCategory.id,
    });

    return response.json({
      message: "Article category updated successfully.",
      category: serializedCategory,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return response.status(409).json({ message: "An article category with this name or slug already exists." });
    }

    console.error("Failed to update article category:", error.message);
    return response.status(500).json({ message: "Failed to update article category." });
  }
});

router.delete("/article-categories/:id", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleCategoryModel()) {
      return response.status(503).json({ message: "Article category model is not available yet. Restart the backend after generating Prisma client." });
    }

    const categoryId = Number.parseInt(request.params.id, 10);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return response.status(400).json({ message: "A valid category id is required." });
    }

    const existingCategory = await prisma.articleCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) {
      return response.status(404).json({ message: "Article category not found." });
    }

    await prisma.articleCategory.delete({
      where: { id: categoryId },
    });
    emitContentUpdated(request, "article-categories", {
      categoryId,
    });

    return response.json({
      message: "Article category deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete article category:", error.message);
    return response.status(500).json({ message: "Failed to delete article category." });
  }
});

router.get("/emergency-contacts", requireAdmin, async (_request, response) => {
  try {
    if (!hasEmergencyContactModel()) {
      return response.status(503).json({ message: "Emergency contact model is not available yet. Restart the backend after generating Prisma client." });
    }

    const contacts = await prisma.emergencyContact.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return response.json({
      contacts: contacts.map(serializeEmergencyContact),
    });
  } catch (error) {
    console.error("Failed to load emergency contacts:", error.message);
    return response.status(500).json({ message: "Failed to load emergency contacts." });
  }
});

router.post("/emergency-contacts", requireAdmin, async (request, response) => {
  try {
    if (!hasEmergencyContactModel()) {
      return response.status(503).json({ message: "Emergency contact model is not available yet. Restart the backend after generating Prisma client." });
    }

    const label = normalizeString(request.body?.label);
    const name = normalizeString(request.body?.name);
    const icon = normalizeString(request.body?.icon).toLowerCase();
    const link = normalizeString(request.body?.link);

    if (!label || !name || !icon || !link) {
      return response.status(400).json({ message: "Label, name, icon, and link are required." });
    }

    const lastContact = await prisma.emergencyContact.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const contact = await prisma.emergencyContact.create({
      data: {
        label,
        name,
        icon,
        link,
        sortOrder: Math.max(1, Number.parseInt(lastContact?.sortOrder, 10) || 0) + 1,
      },
    });
    const serializedContact = serializeEmergencyContact(contact);
    emitContentUpdated(request, "emergency-contacts", {
      contactId: serializedContact.id,
    });

    return response.status(201).json({
      message: "Emergency contact created successfully.",
      contact: serializedContact,
    });
  } catch (error) {
    console.error("Failed to create emergency contact:", error.message);
    return response.status(500).json({ message: "Failed to create emergency contact." });
  }
});

router.put("/emergency-contacts/:contactId", requireAdmin, async (request, response) => {
  try {
    if (!hasEmergencyContactModel()) {
      return response.status(503).json({ message: "Emergency contact model is not available yet. Restart the backend after generating Prisma client." });
    }

    const contactId = Number.parseInt(request.params.contactId, 10);
    if (!contactId) {
      return response.status(400).json({ message: "Contact id is required." });
    }

    const existingContact = await prisma.emergencyContact.findUnique({
      where: { id: contactId },
    });

    if (!existingContact) {
      return response.status(404).json({ message: "Emergency contact not found." });
    }

    const label = normalizeString(request.body?.label ?? existingContact.label);
    const name = normalizeString(request.body?.name ?? existingContact.name);
    const icon = normalizeString(request.body?.icon ?? existingContact.icon).toLowerCase();
    const link = normalizeString(request.body?.link ?? existingContact.link);

    if (!label || !name || !icon || !link) {
      return response.status(400).json({ message: "Label, name, icon, and link are required." });
    }

    const contact = await prisma.emergencyContact.update({
      where: { id: contactId },
      data: {
        label,
        name,
        icon,
        link,
      },
    });
    const serializedContact = serializeEmergencyContact(contact);
    emitContentUpdated(request, "emergency-contacts", {
      contactId: serializedContact.id,
    });

    return response.json({
      message: "Emergency contact updated successfully.",
      contact: serializedContact,
    });
  } catch (error) {
    console.error("Failed to update emergency contact:", error.message);
    return response.status(500).json({ message: "Failed to update emergency contact." });
  }
});

router.delete("/emergency-contacts/:contactId", requireAdmin, async (request, response) => {
  try {
    if (!hasEmergencyContactModel()) {
      return response.status(503).json({ message: "Emergency contact model is not available yet. Restart the backend after generating Prisma client." });
    }

    const contactId = Number.parseInt(request.params.contactId, 10);
    if (!contactId) {
      return response.status(400).json({ message: "Contact id is required." });
    }

    await prisma.emergencyContact.delete({
      where: { id: contactId },
    });
    emitContentUpdated(request, "emergency-contacts", {
      contactId,
    });

    return response.json({
      message: "Emergency contact deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete emergency contact:", error.message);
    return response.status(500).json({ message: "Failed to delete emergency contact." });
  }
});

router.get("/articles/:articleId", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(503).json({ message: "Article model is not available yet. Restart the backend after generating Prisma client." });
    }

    const articleId = Number.parseInt(request.params.articleId, 10);
    if (!articleId) {
      return response.status(400).json({ message: "Article id is required." });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!article) {
      return response.status(404).json({ message: "Article not found." });
    }

    return response.json({
      article: serializeArticle(article),
    });
  } catch (error) {
    console.error("Failed to load article:", error.message);
    return response.status(500).json({ message: "Failed to load article." });
  }
});

router.post("/articles/generate", requireAdmin, async (request, response) => {
  try {
    const topic = normalizeString(request.body?.topic);

    if (!topic) {
      return response.status(400).json({ message: "Topic is required." });
    }

    const aiConfig = await getActiveAiConfiguration().catch((error) => {
      if (error?.message === "No active AI provider configured.") {
        return null;
      }

      throw error;
    });

    if (!aiConfig) {
      return response.status(400).json({ message: "No active AI provider configured." });
    }

    const userMessage = [
      "Generate a professional article for a developer portfolio based on this topic:",
      "",
      `Topic: ${topic}`,
      "",
      "Return only valid JSON:",
      "{",
      '  "title": "",',
      '  "shortDescription": "",',
      '  "content": "",',
      '  "metaTitle": "",',
      '  "metaDescription": "",',
      '  "tags": [],',
      '  "author": "Md Shahanur Islam Shagor"',
      "}",
      "",
      "Rules:",
      "- Write in a natural human voice.",
      "- Do not mention AI.",
      "- Do not say the article was generated.",
      "- Avoid robotic phrases and generic filler.",
      "- Make the content practical, technical, and easy to read.",
      "- Return clean HTML in the content field only.",
      "- Use only these HTML tags in content: h2, h3, p, ul, ol, li, strong, em, blockquote, code, pre.",
      "- Do not use markdown.",
      "- Keep the title clear and attractive.",
      `- Main article content should be at least ${ARTICLE_TARGET_WORD_COUNT} words.`,
      "- shortDescription must be between 180 and 200 characters.",
      "- The shortDescription must feel natural, readable, and not like SEO spam.",
      "- The content must include a strong introduction.",
      "- The content must include multiple structured sections with headings.",
      "- The content must include practical explanations.",
      "- Add examples where relevant.",
      "- Use natural transitions between sections.",
      "- End with a clear conclusion.",
      "- Avoid repetitive phrasing.",
      "- Avoid generic AI writing patterns.",
      "- Do not use filler text.",
      "- Do not sound robotic.",
      "- Write like an experienced developer or researcher personally explaining the topic.",
      "- Maintain human-like sentence variation.",
      "- Use a conversational but professional tone.",
      "- Avoid overly formal academic wording.",
      "- Avoid obvious AI phrases.",
      "- Return detailed content and do not shorten the article.",
      "- Do not summarize sections too aggressively.",
      "- Ensure the article body is rich and readable.",
      "- metaTitle should be under 60 characters.",
      "- metaDescription should be under 160 characters.",
      "- tags should contain 5-8 relevant tags.",
      "- author must always be Md Shahanur Islam Shagor.",
    ].join("\n");

    const systemPrompt = [
      "You write polished portfolio articles for Md Shahanur Islam Shagor.",
      "Return valid JSON only with no markdown fences, no explanation, and no extra keys.",
      "The writing must feel human, natural, clear, and professional.",
      "Do not mention AI or generation.",
      "Avoid these phrases: In today's fast-paced world, cutting-edge, seamless, robust, leveraging, furthermore, it is important to note, this article explores, as we move forward.",
      "Avoid generic filler, exaggerated marketing language, keyword stuffing, repetitive sentence openings, and predictable AI rhythm.",
      "Write like an experienced developer or researcher explaining the topic from practical understanding and real-world engineering perspective.",
      `The article body should be at least ${ARTICLE_TARGET_WORD_COUNT} words and should feel rich, detailed, and readable rather than padded.`,
      "Open with a strong introduction that creates interest quickly and frames the topic with confidence.",
      "The content field must contain clean CKEditor-compatible HTML only.",
      "Do not use markdown headings, markdown lists, or markdown emphasis.",
      "Use only these tags in the content field: h2, h3, p, ul, ol, li, strong, em, blockquote, code, pre.",
      "Build multiple substantial sections with natural transitions, practical explanations, and examples where they genuinely help.",
      "End with a clear conclusion that feels earned, not generic.",
      "Vary sentence length and phrasing so the voice feels personally written.",
      "Keep the tone conversational but professional.",
      "Avoid overly formal academic wording unless the topic truly requires it.",
      "The content should suit a developer portfolio and feel like it was written by Md Shahanur Islam Shagor.",
      `The shortDescription must be between ${ARTICLE_SHORT_DESCRIPTION_MIN} and ${ARTICLE_SHORT_DESCRIPTION_MAX} characters.`,
      "Always return tags as an array of strings.",
      `Always set author to "${ARTICLE_AI_AUTHOR}".`,
    ].join("\n");

    const generatedArticle = await generateValidatedArticlePreview(aiConfig, {
      baseUserMessage: userMessage,
      systemPrompt,
    });

    return response.json(generatedArticle);
  } catch (error) {
    console.error("Failed to generate article content:", error.message);
    const friendlyMessage = buildFriendlyGenerationErrorMessage(error);
    const statusCode = friendlyMessage === "No active AI provider configured." ? 400 : 500;
    return response.status(statusCode).json({ message: friendlyMessage });
  }
});

router.post("/articles", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(503).json({ message: "Article model is not available yet. Restart the backend after generating Prisma client." });
    }

    const articleData = normalizeArticlePayload(request.body);
    if (
      !articleData.title ||
      !articleData.slug ||
      !articleData.shortDescription ||
      !articleData.content ||
      !articleData.categoryIds.length ||
      !articleData.author
    ) {
      return response.status(400).json({
        message: "Title, slug, short description, content, at least one category, and author are required.",
      });
    }

    const categories = await prisma.articleCategory.findMany({
      where: {
        id: { in: articleData.categoryIds },
      },
    });

    if (!categories.length) {
      return response.status(400).json({ message: "Please select at least one valid category." });
    }

    const article = await prisma.article.create({
      data: {
        title: articleData.title,
        slug: articleData.slug,
        shortDescription: articleData.shortDescription,
        content: articleData.content,
        category: categories.map((item) => item.name).join(", "),
        tags: articleData.tags,
        featuredImage: articleData.featuredImage,
        metaTitle: articleData.metaTitle,
        metaDescription: articleData.metaDescription,
        author: articleData.author,
        status: articleData.status,
        publishDate: articleData.publishDate,
        commentsEnabled: articleData.commentsEnabled,
        isFeatured: articleData.isFeatured,
        categories: {
          create: categories.map((item) => ({
            categoryId: item.id,
          })),
        },
      },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
    });
    const serializedArticle = serializeArticle(article);
    emitContentUpdated(request, "articles", {
      articleId: serializedArticle.id,
      slug: serializedArticle.slug,
    });
    emitArticlePublished(request, serializedArticle);

    return response.status(201).json({
      message: "Article created successfully.",
      article: serializedArticle,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return response.status(409).json({ message: "An article with this slug already exists." });
    }

    console.error("Failed to create article:", error.message);
    return response.status(500).json({ message: "Failed to create article." });
  }
});

router.put("/articles/:articleId", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(503).json({ message: "Article model is not available yet. Restart the backend after generating Prisma client." });
    }

    const articleId = Number.parseInt(request.params.articleId, 10);
    if (!articleId) {
      return response.status(400).json({ message: "Article id is required." });
    }

    const existingArticle = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!existingArticle) {
      return response.status(404).json({ message: "Article not found." });
    }

    const articleData = normalizeArticlePayload(request.body, existingArticle);
    if (
      !articleData.title ||
      !articleData.slug ||
      !articleData.shortDescription ||
      !articleData.content ||
      !articleData.categoryIds.length ||
      !articleData.author
    ) {
      return response.status(400).json({
        message: "Title, slug, short description, content, at least one category, and author are required.",
      });
    }

    const categories = await prisma.articleCategory.findMany({
      where: {
        id: { in: articleData.categoryIds },
      },
    });

    if (!categories.length) {
      return response.status(400).json({ message: "Please select at least one valid category." });
    }

    const articleWasLive = isArticleLive(existingArticle);

    const article = await prisma.$transaction(async (tx) => {
      await tx.articleCategoryAssignment.deleteMany({
        where: { articleId },
      });

      return tx.article.update({
        where: { id: articleId },
        data: {
          title: articleData.title,
          slug: articleData.slug,
          shortDescription: articleData.shortDescription,
          content: articleData.content,
          category: categories.map((item) => item.name).join(", "),
          tags: articleData.tags,
          featuredImage: articleData.featuredImage,
          metaTitle: articleData.metaTitle,
          metaDescription: articleData.metaDescription,
          author: articleData.author,
          status: articleData.status,
          publishDate: articleData.publishDate,
          commentsEnabled: articleData.commentsEnabled,
          isFeatured: articleData.isFeatured,
          categories: {
            create: categories.map((item) => ({
              categoryId: item.id,
            })),
          },
        },
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      });
    });
    const serializedArticle = serializeArticle(article);
    emitContentUpdated(request, "articles", {
      articleId: serializedArticle.id,
      slug: serializedArticle.slug,
    });
    if (!articleWasLive && isArticleLive(serializedArticle)) {
      emitArticlePublished(request, serializedArticle);
    }

    return response.json({
      message: "Article updated successfully.",
      article: serializedArticle,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return response.status(409).json({ message: "An article with this slug already exists." });
    }

    console.error("Failed to update article:", error.message);
    return response.status(500).json({ message: "Failed to update article." });
  }
});

router.delete("/articles/:articleId", requireAdmin, async (request, response) => {
  try {
    if (!hasArticleModel()) {
      return response.status(503).json({ message: "Article model is not available yet. Restart the backend after generating Prisma client." });
    }

    const articleId = Number.parseInt(request.params.articleId, 10);
    if (!articleId) {
      return response.status(400).json({ message: "Article id is required." });
    }

    const existingArticle = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });

    if (!existingArticle) {
      return response.status(404).json({ message: "Article not found." });
    }

    await prisma.article.delete({
      where: { id: articleId },
    });
    emitContentUpdated(request, "articles", {
      articleId,
    });

    return response.json({
      message: "Article deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete article:", error.message);
    return response.status(500).json({ message: "Failed to delete article." });
  }
});

router.get("/analytics", requireAdmin, async (_request, response) => {
  try {
    return response.json(await getAnalyticsData());
  } catch (error) {
    console.error("Failed to load analytics:", error.message);
    return response.status(500).json({ message: "Failed to load analytics data." });
  }
});

router.get("/notifications", requireAdmin, async (request, response) => {
  try {
    const page = normalizePositiveInt(request.query?.page, 1, { max: 1000 });
    const limit = normalizePositiveInt(request.query?.limit, 12, { max: 50 });
    const { notifications, total } = await listAdminNotificationGroups({ page, limit });

    return response.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Failed to load admin notifications:", error.message);
    return response.status(500).json({ message: "Failed to load notifications." });
  }
});

router.get("/notifications/unread-count", requireAdmin, async (_request, response) => {
  try {
    const count = await countUnreadAdminNotificationGroups();

    return response.json({ count });
  } catch (error) {
    console.error("Failed to load unread admin notification count:", error.message);
    return response.status(500).json({ message: "Failed to load unread notification count." });
  }
});

router.patch("/notifications/read-all", requireAdmin, async (_request, response) => {
  try {
    await prisma.adminNotification.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });

    return response.json({ message: "All notifications marked as read." });
  } catch (error) {
    console.error("Failed to mark all admin notifications as read:", error.message);
    return response.status(500).json({ message: "Failed to mark notifications as read." });
  }
});

router.patch("/notifications/:id/read", requireAdmin, async (request, response) => {
  try {
    const groupId = normalizeString(request.params.id);
    if (!groupId) {
      return response.status(400).json({ message: "Notification group id is required." });
    }

    const notification = await markAdminNotificationGroupRead(groupId);
    if (!notification) {
      return response.status(404).json({ message: "Notification group not found." });
    }

    return response.json({
      message: "Notification group marked as read.",
      notification,
    });
  } catch (error) {
    console.error("Failed to mark admin notification as read:", error.message);
    return response.status(500).json({ message: "Failed to mark notification as read." });
  }
});

router.delete("/notifications/:id", requireAdmin, async (request, response) => {
  try {
    const groupId = normalizeString(request.params.id);
    if (!groupId) {
      return response.status(400).json({ message: "Notification group id is required." });
    }

    const deletedGroup = await deleteAdminNotificationGroup(groupId);
    if (!deletedGroup) {
      return response.status(404).json({ message: "Notification group not found." });
    }

    return response.json({
      message: "Notification group deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete admin notification:", error.message);
    return response.status(500).json({ message: "Failed to delete notification." });
  }
});

router.get("/messages/:messageId", requireAdmin, async (request, response) => {
  try {
    const messageId = Number.parseInt(request.params.messageId, 10);
    if (!messageId) {
      return response.status(400).json({ message: "Message id is required." });
    }

    const message = await prisma.contactMessage.findUnique({
      where: { id: messageId },
      include: {
        chatMessages: {
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            chatMessages: true,
          },
        },
      },
    });

    if (!message) {
      return response.status(404).json({ message: "Message not found." });
    }

    return response.json({
      message: serializeContactMessageDetail(message),
    });
  } catch (error) {
    console.error("Failed to load message thread:", error.message);
    return response.status(500).json({ message: "Failed to load message thread." });
  }
});

router.post(
  "/messages/:messageId/replies",
  requireAdmin,
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
  try {
    const messageId = Number.parseInt(request.params.messageId, 10);
    const messageText = normalizeString(request.body?.message);

    if (!messageId || (!messageText && !request.files?.photo?.[0] && !request.files?.file?.[0])) {
      return response.status(400).json({ message: "Message text or attachment is required." });
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

    if (!ticket) {
      return response.status(404).json({ message: "Message not found." });
    }

    if (ticket.status === "solved") {
      return response.status(409).json({ message: "Reopen this ticket before sending a reply." });
    }

    const photoFile = request.files?.photo?.[0];
    const attachedFile = request.files?.file?.[0];
    const reply = await prisma.contactChatMessage.create({
      data: {
        contactMessageId: ticket.id,
        senderType: "admin",
        senderName: request.admin?.email || "Admin",
        message: messageText,
        photo: photoFile ? `/uploads/${photoFile.filename}` : "",
        file: attachedFile ? `/uploads/${attachedFile.filename}` : "",
      },
    });

    request.app.get("io")?.to(`contact:ticket:${ticket.id}`).emit("contact:message_created", {
      ticketId: ticket.id,
      message: serializeContactChatMessage(reply),
    });

    scheduleContactReplyReminder(ticket.id, reply.id, reply.createdAt);

    return response.status(201).json({
      message: "Reply sent successfully.",
      data: serializeContactChatMessage(reply),
    });
  } catch (error) {
    console.error("Failed to send admin reply:", error.message);
    return response.status(500).json({ message: "Failed to send reply." });
  }
});

router.patch("/messages/:messageId/status", requireAdmin, async (request, response) => {
  try {
    const messageId = Number.parseInt(request.params.messageId, 10);
    const nextStatus = normalizeString(request.body?.status).toLowerCase();

    if (!messageId || !["not_solved", "solved"].includes(nextStatus)) {
      return response.status(400).json({ message: "Valid status is required." });
    }

    const message = await prisma.contactMessage.update({
      where: { id: messageId },
      data: {
        status: nextStatus,
      },
      include: {
        chatMessages: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            chatMessages: true,
          },
        },
      },
    });

    return response.json({
      message: "Ticket status updated successfully.",
      data: serializeContactMessageSummary(message),
    });
  } catch (error) {
    console.error("Failed to update ticket status:", error.message);
    return response.status(500).json({ message: "Failed to update ticket status." });
  }
});

router.delete("/messages/:messageId", requireAdmin, async (request, response) => {
  try {
    const messageId = Number.parseInt(request.params.messageId, 10);
    if (!messageId) {
      return response.status(400).json({ message: "Message id is required." });
    }

    await prisma.contactMessage.delete({
      where: { id: messageId },
    });

    return response.json({
      message: "Ticket deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete ticket:", error.message);
    return response.status(500).json({ message: "Failed to delete ticket." });
  }
});

router.post(
  "/upload-image",
  requireAdmin,
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

    const uploadedPath = `/uploads/${request.file.filename}`;

    return response.status(201).json({
      message: "Image uploaded successfully.",
      path: uploadedPath,
    });
  },
);

router.post(
  "/upload-resume",
  requireAdmin,
  (request, response, next) => {
    resumeUpload.single("resume")(request, response, (error) => {
      if (error) {
        return response.status(400).json({ message: error.message || "Upload failed." });
      }

      return next();
    });
  },
  async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "Please choose a PDF to upload." });
    }

    return response.status(201).json({
      message: "Resume uploaded successfully.",
      path: `/uploads/${request.file.filename}`,
    });
  },
);

router.post(
  "/upload-verification-file",
  requireAdmin,
  (request, response, next) => {
    verificationFileUpload.single("verificationFile")(request, response, (error) => {
      if (error) {
        return response.status(400).json({ message: error.message || "Upload failed." });
      }

      return next();
    });
  },
  async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "Please choose a verification file to upload." });
    }

    const relativePath = `/${request.file.filename}`;
    const siteSettings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
    });
    const canonicalBase = String(
      siteSettings?.canonicalUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || "",
    ).trim().replace(/\/+$/, "");

    return response.status(201).json({
      message: "Verification file uploaded successfully.",
      path: relativePath,
      publicUrl: canonicalBase ? `${canonicalBase}${relativePath}` : relativePath,
    });
  },
);

router.post("/projects", requireAdmin, async (request, response) => {
  try {
    const normalizedProject = normalizeProjectPayload(request.body);

    if (!normalizedProject.slug || !normalizedProject.name || !normalizedProject.description || !normalizedProject.content) {
      return response.status(400).json({
        message: "Project name, description, content, and slug are required.",
      });
    }

    const [maxIdProject, maxSortOrderProject] = await Promise.all([
      prisma.project.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      }),
      prisma.project.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      }),
    ]);

    const createdProject = await prisma.project.create({
      data: {
        id: (maxIdProject?.id || 0) + 1,
        sortOrder: (maxSortOrderProject?.sortOrder || 0) + 1,
        ...normalizedProject,
      },
    });

    emitContentUpdated(request, "projects", {
      action: "created",
      projectId: createdProject.id,
      slug: createdProject.slug,
    });

    return response.status(201).json({
      message: "Project created successfully.",
      data: createdProject,
    });
  } catch (error) {
    console.error("Failed to create project:", error.message);
    return response.status(500).json({ message: "Failed to create project." });
  }
});

router.put("/projects/:projectId", requireAdmin, async (request, response) => {
  try {
    const projectId = Number.parseInt(request.params.projectId, 10);
    if (!projectId) {
      return response.status(400).json({ message: "Project id is required." });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!existingProject) {
      return response.status(404).json({ message: "Project not found." });
    }

    const normalizedProject = normalizeProjectPayload(request.body, existingProject);

    if (!normalizedProject.slug || !normalizedProject.name || !normalizedProject.description || !normalizedProject.content) {
      return response.status(400).json({
        message: "Project name, description, content, and slug are required.",
      });
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: normalizedProject,
    });

    emitContentUpdated(request, "projects", {
      action: "updated",
      projectId: updatedProject.id,
      slug: updatedProject.slug,
    });

    return response.json({
      message: "Project updated successfully.",
      data: updatedProject,
    });
  } catch (error) {
    console.error("Failed to update project:", error.message);
    return response.status(500).json({ message: "Failed to update project." });
  }
});

router.delete("/projects/:projectId", requireAdmin, async (request, response) => {
  try {
    const projectId = Number.parseInt(request.params.projectId, 10);
    if (!projectId) {
      return response.status(400).json({ message: "Project id is required." });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, slug: true },
    });

    if (!existingProject) {
      return response.status(404).json({ message: "Project not found." });
    }

    await prisma.project.delete({
      where: { id: projectId },
    });

    emitContentUpdated(request, "projects", {
      action: "deleted",
      projectId: existingProject.id,
      slug: existingProject.slug,
    });

    return response.json({
      message: "Project deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete project:", error.message);
    return response.status(500).json({ message: "Failed to delete project." });
  }
});

router.put("/content", requireAdmin, async (request, response) => {
  try {
    const profile = request.body?.profile || {};
    const siteSettings = request.body?.siteSettings || {};
    const serviceSection = request.body?.serviceSection || {};
    const hasSkills = Object.prototype.hasOwnProperty.call(request.body || {}, "skills");
    const hasExperiences = Object.prototype.hasOwnProperty.call(request.body || {}, "experiences");
    const hasEducations = Object.prototype.hasOwnProperty.call(request.body || {}, "educations");
    const hasProjects = Object.prototype.hasOwnProperty.call(request.body || {}, "projects");
    const hasStatsCounters = Object.prototype.hasOwnProperty.call(request.body || {}, "statsCounters");
    const hasAchievements = Object.prototype.hasOwnProperty.call(request.body || {}, "achievements");
    const hasServiceSection = Object.prototype.hasOwnProperty.call(request.body || {}, "serviceSection");
    const hasServices = Object.prototype.hasOwnProperty.call(request.body || {}, "services");
    const hasPricings = Object.prototype.hasOwnProperty.call(request.body || {}, "pricings");
    const hasFaqs = Object.prototype.hasOwnProperty.call(request.body || {}, "faqs");
    const hasTestimonials = Object.prototype.hasOwnProperty.call(request.body || {}, "testimonials");
    const hasSiteSettings = Object.prototype.hasOwnProperty.call(request.body || {}, "siteSettings");
    const skills = request.body?.skills || [];
    const experiences = request.body?.experiences || [];
    const educations = request.body?.educations || [];
    const projects = request.body?.projects || [];
    const statsCounters = request.body?.statsCounters || [];
    const achievements = request.body?.achievements || [];
    const services = request.body?.services || [];
    const pricings = request.body?.pricings || [];
    const faqs = request.body?.faqs || [];
    const testimonials = request.body?.testimonials || [];
    const existingProfile = await prisma.profile.findUnique({
      where: { id: 1 },
    });
    const existingSiteSettings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
    });
    const existingServiceSection = await prisma.serviceSection.findUnique({
      where: { id: 1 },
    });

    const normalizedProfile = {
      id: 1,
      name: normalizeString(profile.name ?? existingProfile?.name),
      profile: normalizeString(profile.profile ?? existingProfile?.profile) || "/profile.png",
      designation: normalizeString(profile.designation ?? existingProfile?.designation),
      description: normalizeString(profile.description ?? existingProfile?.description),
      email: normalizeString(profile.email ?? existingProfile?.email),
      phone: normalizeString(profile.phone ?? existingProfile?.phone),
      address: normalizeString(profile.address ?? existingProfile?.address),
      github: normalizeString(profile.github ?? existingProfile?.github),
      facebook: normalizeString(profile.facebook ?? existingProfile?.facebook),
      linkedIn: normalizeString(profile.linkedIn ?? existingProfile?.linkedIn),
      twitter: normalizeString(profile.twitter ?? existingProfile?.twitter),
      stackOverflow: normalizeString(profile.stackOverflow ?? existingProfile?.stackOverflow),
      leetcode: normalizeString(profile.leetcode ?? existingProfile?.leetcode),
      socialLinks: normalizeSocialLinks(profile.socialLinks, existingProfile),
      devUsername: normalizeString(profile.devUsername ?? existingProfile?.devUsername),
      resume: normalizeString(profile.resume ?? existingProfile?.resume),
      heroSkills: normalizeHeroSkills(profile.heroSkills ?? existingProfile?.heroSkills),
      hardWorker:
        typeof profile.hardWorker === "boolean"
          ? profile.hardWorker
          : existingProfile?.hardWorker ?? true,
      quickLearner:
        typeof profile.quickLearner === "boolean"
          ? profile.quickLearner
          : existingProfile?.quickLearner ?? true,
      problemSolver:
        typeof profile.problemSolver === "boolean"
          ? profile.problemSolver
          : existingProfile?.problemSolver ?? true,
    };
    const normalizedSiteSettings = normalizeSiteSettings(siteSettings, existingSiteSettings || {});

    const normalizedSkills = normalizeCollection(skills, (item, index) => {
      const name = normalizeString(item.name || item);
      if (!name) {
        return null;
      }

      return {
        id: index + 1,
        name,
        image: normalizeString(item?.image),
        percentage: Math.max(0, Math.min(100, Number.parseInt(item?.percentage, 10) || 0)),
        sortOrder: index + 1,
      };
    });

    const normalizedExperiences = normalizeCollection(experiences, (item, index) => ({
      id: index + 1,
      title: normalizeString(item.title),
      company: normalizeString(item.company),
      location: normalizeString(item.location),
      duration: normalizeString(item.duration),
      description: String(item?.description || "").trim(),
      sortOrder: index + 1,
    }));

    const normalizedEducations = normalizeCollection(educations, (item, index) => ({
      id: index + 1,
      title: normalizeString(item.title),
      duration: normalizeString(item.duration),
      institution: normalizeString(item.institution),
      department: normalizeString(item.department),
      achievement: String(item?.achievement || "").trim(),
      sortOrder: index + 1,
    }));

    const normalizedProjects = normalizeCollection(projects, (item, index) => ({
      id: Math.max(1, Number.parseInt(item?.id, 10) || index + 1),
      slug: slugify(item?.slug || item?.name),
      name: normalizeString(item.name),
      description: normalizeString(item.description),
      content: String(item?.content || "").trim(),
      role: normalizeString(item.role),
      code: normalizeString(item.code),
      demo: normalizeString(item.demo),
      image: normalizeString(item.image),
      views: Math.max(0, Number.parseInt(item?.views, 10) || 0),
      impressionCount: Math.max(0, Number.parseInt(item?.impressionCount, 10) || 0),
      buttons: normalizeProjectButtons(item?.buttons, item),
      tools: normalizeStringList(item.tools),
      sortOrder: index + 1,
    }));

    const normalizedStatsCounters = normalizeCollection(statsCounters, (item, index) => {
      const label = normalizeString(item.label);
      const count = normalizeString(item.count);

      if (!label || !count) {
        return null;
      }

      return {
        id: index + 1,
        label,
        highlight: normalizeString(item.highlight),
        count,
        icon: normalizeString(item.icon).toLowerCase(),
        sortOrder: index + 1,
      };
    });

    const normalizedAchievements = normalizeCollection(achievements, (item, index) => {
      const title = normalizeString(item.title);
      const issuer = normalizeString(item.issuer);
      const date = normalizeString(item.date);
      const type = normalizeString(item.type);

      if (!title || !issuer || !date || !type) {
        return null;
      }

      return {
        id: index + 1,
        title,
        issuer,
        date,
        type,
        image: normalizeString(item.image),
        sortOrder: index + 1,
      };
    });

    const normalizedServiceSection = normalizeServiceSection(serviceSection, existingServiceSection);
    const normalizedServices = normalizeServices(services);
    const normalizedPricings = normalizePricings(pricings);
    const normalizedFaqs = normalizeFaqs(faqs);
    const normalizedTestimonials = normalizeTestimonials(testimonials);

    if (hasPricings && !hasPricingModel()) {
      return response.status(503).json({
        message: "Pricing model is not available yet. Please restart the backend so Prisma reloads the new schema.",
      });
    }

    if (hasTestimonials && !hasTestimonialModel()) {
      return response.status(503).json({
        message: "Testimonial model is not available yet. Please restart the backend so Prisma reloads the new schema.",
      });
    }

    if (hasFaqs && !hasFaqModel()) {
      return response.status(503).json({
        message: "FAQ model is not available yet. Please restart the backend so Prisma reloads the new schema.",
      });
    }

    if (hasAchievements && !(await hasAchievementTable())) {
      return response.status(503).json({
        message: "Achievement table is not available yet. Apply the latest Prisma migration and restart the backend.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.profile.upsert({
        where: { id: 1 },
        update: normalizedProfile,
        create: normalizedProfile,
      });

      if (hasSiteSettings) {
        await tx.siteSettings.upsert({
          where: { id: 1 },
          update: normalizedSiteSettings,
          create: normalizedSiteSettings,
        });
      }

      if (hasStatsCounters) {
        await tx.statsCounter.deleteMany();
        if (normalizedStatsCounters.length) {
          await tx.statsCounter.createMany({ data: normalizedStatsCounters });
        }
      }

      if (hasAchievements) {
        await tx.achievement.deleteMany();
        if (normalizedAchievements.length) {
          await tx.achievement.createMany({ data: normalizedAchievements });
        }
      }

      if (hasServiceSection) {
        await tx.serviceSection.upsert({
          where: { id: 1 },
          update: normalizedServiceSection,
          create: normalizedServiceSection,
        });
      }

      if (hasServices) {
        await tx.serviceReply.deleteMany();
        await tx.serviceComment.deleteMany();
        await tx.service.deleteMany();
        if (normalizedServices.length) {
          let nextServiceCommentId = 1;
          let nextServiceReplyId = 1;
          for (const service of normalizedServices) {
            await tx.service.create({
              data: {
                id: service.id,
                slug: service.slug,
                name: service.name,
                impression: service.impression,
                description: service.description,
                content: service.content,
                isFeatured: service.isFeatured,
                icon: service.icon,
                status: service.status,
                impressionCount: service.impressionCount,
                views: service.views,
                sortOrder: service.sortOrder,
                comments: {
                  create: service.comments.map((comment) => ({
                    id: nextServiceCommentId++,
                    photo: comment.photo,
                    comment: comment.comment,
                    impression: comment.impression,
                    sortOrder: comment.sortOrder,
                    replies: {
                      create: comment.replies.map((reply) => ({
                        id: nextServiceReplyId++,
                        reply: reply.reply,
                        impression: reply.impression,
                        sortOrder: reply.sortOrder,
                      })),
                    },
                  })),
                },
              },
            });
          }
        }
      }

      if (hasSkills) {
        await tx.skill.deleteMany();
        if (normalizedSkills.length) {
          await tx.skill.createMany({ data: normalizedSkills });
        }
      }

      if (hasExperiences) {
        await tx.experience.deleteMany();
        if (normalizedExperiences.length) {
          await tx.experience.createMany({ data: normalizedExperiences });
        }
      }

      if (hasEducations) {
        await tx.education.deleteMany();
        if (normalizedEducations.length) {
          await tx.education.createMany({ data: normalizedEducations });
        }
      }

      if (hasProjects) {
        await tx.project.deleteMany();
        if (normalizedProjects.length) {
          await tx.project.createMany({ data: normalizedProjects });
        }
      }

      if (hasPricings) {
        await tx.pricing.deleteMany();
        if (normalizedPricings.length) {
          await tx.pricing.createMany({ data: normalizedPricings });
        }
      }

      if (hasFaqs) {
        await tx.faq.deleteMany();
        if (normalizedFaqs.length) {
          await tx.faq.createMany({ data: normalizedFaqs });
        }
      }

      if (hasTestimonials) {
        await tx.testimonial.deleteMany();
        if (normalizedTestimonials.length) {
          await tx.testimonial.createMany({ data: normalizedTestimonials });
        }
      }
    });
    emitContentUpdated(request, "content");

    return response.json({
      message: "Content updated successfully.",
      data: await getDashboardData(),
    });
  } catch (error) {
    console.error("Failed to update content:", error.message);
    return response.status(500).json({ message: "Failed to update content." });
  }
});

module.exports = router;
