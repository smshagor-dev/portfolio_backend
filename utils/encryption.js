const crypto = require("crypto");

function getEncryptionSecret() {
  const rawSecret = String(
    process.env.AI_ENCRYPTION_KEY || process.env.ADMIN_JWT_SECRET || "",
  ).trim();

  if (!rawSecret) {
    throw new Error("AI encryption secret is not configured.");
  }

  return crypto.createHash("sha256").update(rawSecret).digest();
}

function encryptText(value) {
  const plainText = String(value || "");
  if (!plainText) {
    return "";
  }

  const secret = getEncryptionSecret();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptText(value) {
  const serialized = String(value || "").trim();
  if (!serialized) {
    return "";
  }

  const [ivHex, authTagHex, encryptedHex] = serialized.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Encrypted value has an invalid format.");
  }

  const secret = getEncryptionSecret();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    secret,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  decryptText,
  encryptText,
};
