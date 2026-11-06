const crypto = require("crypto");
const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function normalizeString(value) {
  return String(value || "").trim();
}

function getIpHash(request) {
  const forwarded = normalizeString(request.headers["x-forwarded-for"]).split(",")[0].trim();
  const ip = forwarded || normalizeString(request.ip) || normalizeString(request.socket?.remoteAddress);
  const secret = normalizeString(process.env.ADMIN_JWT_SECRET || "portfolio-admin-secret");

  if (!ip) {
    return "";
  }

  return crypto.createHmac("sha256", secret).update(ip).digest("hex");
}

function getUserAgent(request) {
  return normalizeString(request.headers["user-agent"]).slice(0, 2000);
}

function emitTrackingUpdate(request, eventType) {
  request.app.get("io")?.to("job-agent:admin").emit("job-agent:updated", {
    eventType,
    path: request.originalUrl,
    method: request.method,
    updatedAt: new Date().toISOString(),
  });
}

async function getDraftAndSetting(trackingId) {
  const draft = await prisma.jobEmailDraft.findUnique({
    where: { trackingId },
    select: {
      id: true,
      jobPostId: true,
      toEmail: true,
      trackingId: true,
      status: true,
      openedAt: true,
      clickedAt: true,
    },
  });

  if (!draft) {
    return { draft: null, setting: null };
  }

  const setting = await prisma.jobAgentEmailSetting.findUnique({
    where: { id: 1 },
  });

  return { draft, setting };
}

router.get("/track/open/:trackingId.png", async (request, response) => {
  response.setHeader("Content-Type", "image/png");
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  try {
    const trackingId = normalizeString(request.params.trackingId);
    const { draft, setting } = await getDraftAndSetting(trackingId);

    if (draft && setting?.openTrackingEnabled) {
      const now = new Date();
      await prisma.$transaction([
        prisma.jobEmailDraft.update({
          where: { id: draft.id },
          data: {
            status: draft.status === "CLICKED" ? "CLICKED" : "OPENED",
            openedAt: draft.openedAt || now,
            lastOpenedAt: now,
            openCount: { increment: 1 },
          },
        }),
        prisma.jobAgentEmailEvent.create({
          data: {
            draftId: draft.id,
            jobPostId: draft.jobPostId,
            recipientEmail: draft.toEmail,
            eventType: "OPENED",
            trackingId,
            url: "",
            userAgent: getUserAgent(request),
            ipHash: getIpHash(request),
          },
        }),
      ]);
      emitTrackingUpdate(request, "OPENED");
    }
  } catch (_error) {
    // Tracking should never break image loading.
  }

  return response.end(TRANSPARENT_PNG);
});

router.get("/track/click/:trackingId", async (request, response) => {
  const targetUrl = normalizeString(request.query.url);
  let parsedUrl;

  try {
    parsedUrl = new URL(targetUrl);
  } catch (_error) {
    return response.status(400).send("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return response.status(400).send("Invalid URL.");
  }

  try {
    const trackingId = normalizeString(request.params.trackingId);
    const { draft, setting } = await getDraftAndSetting(trackingId);

    if (draft && setting?.clickTrackingEnabled) {
      const now = new Date();
      await prisma.$transaction([
        prisma.jobEmailDraft.update({
          where: { id: draft.id },
          data: {
            status: "CLICKED",
            clickedAt: draft.clickedAt || now,
            clickCount: { increment: 1 },
          },
        }),
        prisma.jobAgentEmailEvent.create({
          data: {
            draftId: draft.id,
            jobPostId: draft.jobPostId,
            recipientEmail: draft.toEmail,
            eventType: "CLICKED",
            trackingId,
            url: parsedUrl.toString(),
            userAgent: getUserAgent(request),
            ipHash: getIpHash(request),
          },
        }),
      ]);
      emitTrackingUpdate(request, "CLICKED");
    }
  } catch (_error) {
    // Redirect should still happen even if tracking storage fails.
  }

  return response.redirect(302, parsedUrl.toString());
});

module.exports = router;
