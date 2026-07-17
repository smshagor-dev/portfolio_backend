require("./lib/config");

const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const prisma = require("./lib/prisma");
const { validateAuthConfig, verifyAdminToken } = require("./lib/auth");
const {
  isRemoteStorageEnabled,
  resolveLocalPublicPath,
  toAbsolutePublicUrl,
} = require("./lib/upload-storage");
const adminRoutes = require("./routes/admin");
const assistantRoutes = require("./routes/assistant");
const jobAgentRoutes = require("./routes/job-agent");
const jobAgentTrackingRoutes = require("./routes/job-agent-tracking");
const researchRoutes = require("./routes/research");
const siteRoutes = require("./routes/site");

const app = express();
const port = Number(process.env.PORT || 5000);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const fallbackFrontendOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://smshagor.vercel.app",
];
const serverBaseUrl = process.env.BACKEND_URL || `http://127.0.0.1:${port}`;
let canonicalBackendOrigin = "";

try {
  canonicalBackendOrigin = new URL(serverBaseUrl).origin;
} catch (_error) {
  canonicalBackendOrigin = "";
}
const forceHttps =
  String(process.env.FORCE_HTTPS || "").trim().toLowerCase() === "true";

function getForwardedHeaderValue(header) {
  if (Array.isArray(header)) {
    return String(header[0] || "").split(",")[0].trim();
  }

  return String(header || "").split(",")[0].trim();
}

function isLoopbackHost(host) {
  const normalizedHost = String(host || "").trim().toLowerCase();
  return (
    normalizedHost.startsWith("127.0.0.1") ||
    normalizedHost.startsWith("localhost") ||
    normalizedHost.startsWith("[::1]") ||
    normalizedHost.startsWith("0.0.0.0")
  );
}

function isHttpsForwarded(request) {
  const forwardedProto = getForwardedHeaderValue(request.headers["x-forwarded-proto"]);
  const forwardedSsl = getForwardedHeaderValue(request.headers["x-forwarded-ssl"]);
  const frontendHttps = getForwardedHeaderValue(request.headers["front-end-https"]);

  return (
    request.secure ||
    forwardedProto === "https" ||
    forwardedSsl === "on" ||
    frontendHttps === "on"
  );
}

function isHttpsUrl(url) {
  return String(url || "").trim().toLowerCase().startsWith("https://");
}

function isPhpRequestPath(pathname) {
  return /\.php(?:\/|$)/i.test(String(pathname || "").trim());
}

function toOrigin(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  try {
    return new URL(normalizedValue).origin;
  } catch (_error) {
    return "";
  }
}

function buildAllowedOrigins() {
  const configuredOrigins = [
    ...frontendUrl.split(","),
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
    process.env.CANONICAL_URL,
    ...fallbackFrontendOrigins,
  ];

  return Array.from(
    new Set(
      configuredOrigins
        .map((value) => toOrigin(value))
        .filter(Boolean),
    ),
  );
}

const allowedOrigins = buildAllowedOrigins();
const allowedOriginSet = new Set(allowedOrigins);
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = toOrigin(origin);
    callback(null, allowedOriginSet.has(normalizedOrigin));
  },
  credentials: true,
};

let io = null;
const { Server } = require("socket.io");
const server = http.createServer(app);
io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});
app.set("server", server);

app.set("trust proxy", true);
app.set("io", io);

app.use((request, response, next) => {
  const originalPath = String(request.path || "").trim();

  if (!isPhpRequestPath(originalPath)) {
    return next();
  }

  if (/^\/index\.php\/?$/i.test(originalPath)) {
    const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
    return response.redirect(308, `/${query}`);
  }

  return response.status(404).type("text/plain").send("Not found");
});

if (forceHttps) {
  app.use((request, response, next) => {
    const forwardedHost = getForwardedHeaderValue(request.headers["x-forwarded-host"]);
    const requestHost = String(request.headers.host || "").trim();
    const publicHost = forwardedHost || requestHost;

    if (isHttpsForwarded(request)) {
      return next();
    }

    if (canonicalBackendOrigin && isHttpsUrl(canonicalBackendOrigin)) {
      return response.redirect(308, `${canonicalBackendOrigin}${request.originalUrl}`);
    }

    if (!publicHost || isLoopbackHost(publicHost)) {
      return next();
    }

    return response.redirect(308, `https://${publicHost}${request.originalUrl}`);
  });

  app.use((_request, response, next) => {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    next();
  });
}

app.use(
  cors(corsOptions),
);
app.options(/.*/, cors(corsOptions));
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("Surrogate-Control", "no-store");
  next();
});
app.use(express.json({ limit: "10mb" }));
if (isRemoteStorageEnabled()) {
  app.use("/uploads", (request, response) => {
    response.redirect(307, toAbsolutePublicUrl(request.originalUrl));
  });
} else {
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), "public", "uploads"), {
      fallthrough: false,
      maxAge: "7d",
    }),
  );
}

app.get(/^\/[^/]+\.[A-Za-z0-9_-]+$/, async (request, response, next) => {
  const requestedPath = String(request.path || "").trim();

  if (!requestedPath || requestedPath === "/favicon.ico") {
    return next();
  }

  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
      select: { googleVerificationFilePath: true },
    });
    const verificationPath = String(settings?.googleVerificationFilePath || "").trim();

    if (!verificationPath || verificationPath !== requestedPath) {
      return next();
    }

    const filename = path.basename(verificationPath);
    const resolvedPath = resolveLocalPublicPath(`/${filename}`);

    if (!resolvedPath) {
      return response.status(400).end();
    }

    if (isRemoteStorageEnabled()) {
      return response.redirect(307, toAbsolutePublicUrl(verificationPath));
    }

    return response.sendFile(resolvedPath, (error) => {
      if (error) {
        next(error);
      }
    });
  } catch (_error) {
    return next();
  }
});

function buildReadyPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Server Ready</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Arial, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #1e3a5f, #09111d 55%);
        color: #ecf8ff;
      }
      main {
        width: min(92vw, 640px);
        padding: 40px 32px;
        border: 1px solid rgba(137, 213, 255, 0.24);
        border-radius: 24px;
        background: rgba(8, 18, 32, 0.82);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 3rem);
      }
      p {
        margin: 10px 0;
        line-height: 1.6;
        color: #b8d9ea;
      }
      code {
        color: #8fe3ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Server ready</h1>
      <p>The Node backend is running and ready to accept requests.</p>
      <p>Health check: <code>/health</code></p>
      <p>Base URL: <code>${serverBaseUrl}</code></p>
    </main>
  </body>
</html>`;
}

if (io) {
  io.on("connection", (socket) => {
    socket.on("project:join", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.join(`project:${normalizedSlug}`);
    });

    socket.on("project:leave", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.leave(`project:${normalizedSlug}`);
    });

    socket.on("service:join", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.join(`service:${normalizedSlug}`);
    });

    socket.on("service:leave", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.leave(`service:${normalizedSlug}`);
    });

    socket.on("article:join", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.join(`article:${normalizedSlug}`);
    });

    socket.on("article:leave", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.leave(`article:${normalizedSlug}`);
    });

    socket.on("research:join", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.join(`research:${normalizedSlug}`);
    });

    socket.on("research:leave", (slug) => {
      const normalizedSlug = String(slug || "").trim().toLowerCase();
      if (!normalizedSlug) {
        return;
      }

      socket.leave(`research:${normalizedSlug}`);
    });

    socket.on("testimonials:join", () => {
      socket.join("testimonials");
    });

    socket.on("testimonials:leave", () => {
      socket.leave("testimonials");
    });

    socket.on("job-agent:admin_join", ({ token }) => {
      const normalizedToken = String(token || "").trim();
      if (!normalizedToken) {
        return;
      }

      try {
        verifyAdminToken(normalizedToken);
        socket.join("job-agent:admin");
        socket.emit("job-agent:connected", { connected: true, joinedAt: new Date().toISOString() });
      } catch (_error) {
        // Ignore failed admin socket joins.
      }
    });

    socket.on("job-agent:admin_leave", () => {
      socket.leave("job-agent:admin");
    });

    socket.on("contact:join", async ({ messageId, token }) => {
      const normalizedId = Number.parseInt(messageId, 10);
      const normalizedToken = String(token || "").trim();
      if (!normalizedId || !normalizedToken) {
        return;
      }

      try {
        const ticket = await prisma.contactMessage.findUnique({
          where: { id: normalizedId },
          select: { id: true, ticketToken: true },
        });

        if (!ticket || ticket.ticketToken !== normalizedToken) {
          return;
        }

        socket.join(`contact:ticket:${ticket.id}`);
      } catch (_error) {
        // Ignore failed joins.
      }
    });

    socket.on("contact:leave", ({ messageId }) => {
      const normalizedId = Number.parseInt(messageId, 10);
      if (!normalizedId) {
        return;
      }

      socket.leave(`contact:ticket:${normalizedId}`);
    });

    socket.on("contact:admin_join", async ({ messageId, token }) => {
      const normalizedId = Number.parseInt(messageId, 10);
      const normalizedToken = String(token || "").trim();
      if (!normalizedId || !normalizedToken) {
        return;
      }

      try {
        verifyAdminToken(normalizedToken);
        const ticket = await prisma.contactMessage.findUnique({
          where: { id: normalizedId },
          select: { id: true },
        });

        if (!ticket) {
          return;
        }

        socket.join(`contact:ticket:${ticket.id}`);
      } catch (_error) {
        // Ignore failed joins.
      }
    });

    socket.on("contact:admin_leave", ({ messageId }) => {
      const normalizedId = Number.parseInt(messageId, 10);
      if (!normalizedId) {
        return;
      }

      socket.leave(`contact:ticket:${normalizedId}`);
    });
  });
}

app.get("/", (_request, response) => {
  response.type("html").send(buildReadyPage());
});

app.get("/ready", (_request, response) => {
  response.type("html").send(buildReadyPage());
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok", message: "server ready" });
});

app.use("/api/site", siteRoutes);
app.use("/api/job-agent", jobAgentTrackingRoutes);
app.use("/api/admin/job-agent", jobAgentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", researchRoutes);
app.use("/api", assistantRoutes);

validateAuthConfig();

if (require.main === module) {
  const runtimeServer = app.get("server") || http.createServer(app);

  runtimeServer.listen(port, () => {
    console.log(`Backend server is running on ${serverBaseUrl}`);
  });

  if (typeof jobAgentRoutes.startJobAgentGmailAutoSync === "function") {
    jobAgentRoutes.startJobAgentGmailAutoSync({ io });
    console.log("Job Agent Gmail auto sync is scheduled every 6 hours.");
  }

  if (typeof jobAgentRoutes.startJobAgentApprovedSourcesAutoSync === "function") {
    jobAgentRoutes.startJobAgentApprovedSourcesAutoSync({ io });
    console.log("Job Agent approved sources auto sync is scheduled every 6 hours.");
  }

  if (typeof jobAgentRoutes.startJobAgentEmailAutoSend === "function") {
    jobAgentRoutes.startJobAgentEmailAutoSend({ io });
    console.log("Job Agent email auto-send is scheduled.");
  }
}

server.app = app;
server.io = io;

module.exports = server;
