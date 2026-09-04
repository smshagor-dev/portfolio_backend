require("./config");

const { PrismaClient } = require("@prisma/client");
const { getNextIntIdForDelegate, toDelegateName } = require("./next-id");
const { hasManualResearchOverride } = require("./research-manual-override");

const globalForPrisma = global;
const intIdModels = new Set([
  "ServiceComment",
  "ServiceReply",
  "ProjectComment",
  "ProjectReply",
  "Testimonial",
  "Article",
  "ResearchPublication",
  "ResearchComment",
  "ResearchReply",
  "ArticleComment",
  "ArticleReply",
  "ContactMessage",
  "ContactChatMessage",
  "EmergencyContact",
  "AiProvider",
  "AiTrainingEntry",
  "AnalyticsSession",
  "AnalyticsDailyVisit",
  "AnalyticsPageView",
  "CvProfile",
  "JobSource",
  "JobPost",
  "JobBoardSource",
  "JobSourceImportRun",
  "JobMatch",
  "RecruiterContact",
  "JobEmailDraft",
  "JobAgentEmailEvent",
  "ArticleCategory",
]);

const protectedResearchFields = new Set([
  "title",
  "slug",
  "shortSummary",
  "content",
  "publicationType",
  "researchArea",
  "publisherName",
  "publishedDate",
  "doi",
  "publicationUrl",
  "citationUrl",
  "authors",
  "myAuthorRole",
  "thumbnailImage",
  "isFeatured",
  "status",
]);

const prisma =
  globalForPrisma.prisma ||
  (() => {
    const basePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    return basePrisma.$extends({
      query: {
        $allModels: {
          async create({ model, args, query }) {
            if (model && intIdModels.has(model) && args?.data && args.data.id == null) {
              args.data.id = await getNextIntIdForDelegate(basePrisma[toDelegateName(model)]);
            }

            return query(args);
          },
          async update({ model, args, query }) {
            if (model !== "ResearchPublication" || !args?.where || !args?.data) {
              return query(args);
            }

            const existing = await basePrisma.researchPublication.findUnique({
              where: args.where,
              select: { content: true },
            });

            if (!hasManualResearchOverride(existing?.content)) {
              return query(args);
            }

            const incomingContent = Object.prototype.hasOwnProperty.call(args.data, "content")
              ? args.data.content
              : "";
            const isExplicitAdminWrite =
              hasManualResearchOverride(incomingContent) &&
              Object.prototype.hasOwnProperty.call(args.data, "isFeatured");

            if (isExplicitAdminWrite) {
              return query(args);
            }

            const nextData = { ...args.data };
            for (const fieldName of protectedResearchFields) {
              delete nextData[fieldName];
            }

            if (Object.keys(nextData).length === 0) {
              return basePrisma.researchPublication.findUnique({
                where: args.where,
                ...(args.select ? { select: args.select } : {}),
                ...(args.include ? { include: args.include } : {}),
              });
            }

            return query({
              ...args,
              data: nextData,
            });
          },
          async upsert({ model, args, query }) {
            if (model && intIdModels.has(model) && args?.create && args.create.id == null) {
              args.create.id = await getNextIntIdForDelegate(basePrisma[toDelegateName(model)]);
            }

            return query(args);
          },
          async createMany({ model, args, query }) {
            if (model && intIdModels.has(model) && Array.isArray(args?.data)) {
              const itemsWithoutId = args.data.filter((item) => item && item.id == null);
              if (itemsWithoutId.length > 0) {
                let nextId = await getNextIntIdForDelegate(basePrisma[toDelegateName(model)]);
                for (const item of args.data) {
                  if (item && item.id == null) {
                    item.id = nextId;
                    nextId += 1;
                  }
                }
              }
            }

            return query(args);
          },
        },
      },
    });
  })();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
