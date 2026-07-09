require("./config");

const { PrismaClient } = require("@prisma/client");
const { getNextIntIdForDelegate, toDelegateName } = require("./next-id");

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
