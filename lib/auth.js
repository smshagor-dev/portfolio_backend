const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");

const DEFAULT_SECRET = "portfolio-admin-secret";
const DEFAULT_TWO_FACTOR_APP_NAME = "Portfolio Admin";

function isDefaultSecret(value) {
  return !value || value === DEFAULT_SECRET || value === "change-this-admin-secret";
}

function getJwtSecret() {
  if (process.env.NODE_ENV === "production" && isDefaultSecret(process.env.ADMIN_JWT_SECRET)) {
    throw new Error("ADMIN_JWT_SECRET must be set to a strong custom value in production.");
  }

  return process.env.ADMIN_JWT_SECRET || DEFAULT_SECRET;
}

function validateAuthConfig() {
  getJwtSecret();
}

function getTwoFactorAppName() {
  return process.env.TWO_FACTOR_APP_NAME || DEFAULT_TWO_FACTOR_APP_NAME;
}

function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: "admin",
    },
    getJwtSecret(),
    {
      expiresIn: "7d",
    },
  );
}

function verifyAdminToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function getTwoFactorLabel(admin) {
  const email = String(admin?.email || "").trim() || "admin";
  return `${getTwoFactorAppName()}:${email}`;
}

function generateTwoFactorSecret(admin) {
  return speakeasy.generateSecret({
    length: 20,
    name: getTwoFactorLabel(admin),
    issuer: getTwoFactorAppName(),
  });
}

function buildTwoFactorOtpAuthUrl(admin, secret) {
  return speakeasy.otpauthURL({
    secret,
    encoding: "base32",
    label: getTwoFactorLabel(admin),
    issuer: getTwoFactorAppName(),
  });
}

function normalizeTwoFactorCode(code) {
  return String(code || "").replace(/\s+/g, "").trim();
}

function verifyTwoFactorCode(secret, code) {
  const normalizedCode = normalizeTwoFactorCode(code);

  if (!secret || !/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: normalizedCode,
    window: 1,
  });
}

function getBearerToken(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

function requireAdmin(request, response, next) {
  try {
    const token = getBearerToken(request.headers);

    if (!token) {
      return response.status(401).json({ message: "Unauthorized." });
    }

    request.admin = verifyAdminToken(token);
    return next();
  } catch (error) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }
}

module.exports = {
  buildTwoFactorOtpAuthUrl,
  generateTwoFactorSecret,
  getBearerToken,
  normalizeTwoFactorCode,
  requireAdmin,
  signAdminToken,
  validateAuthConfig,
  verifyTwoFactorCode,
  verifyAdminToken,
};
