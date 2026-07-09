function normalizeString(value) {
  return String(value || "").trim();
}

function toBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultSiteSettings() {
  const appUrl =
    normalizeString(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeString(process.env.FRONTEND_URL) ||
    "http://localhost:3000";

  return {
    id: 1,
    websiteTitle: "Portfolio Website",
    websiteDescription: "Professional portfolio website.",
    navTitle: "Portfolio Website",
    navSubtitle: "Software Developer",
    seoTitle: "Portfolio Website",
    seoDescription: "Professional portfolio website.",
    seoKeywords: "portfolio",
    seoImage: "/profile.png",
    websiteIcon: "/favicon.ico",
    heroHeaderText: "",
    heroDescription: "",
    heroImage: "",
    contactEmail: "",
    mobileNumber: "",
    footerText: "All rights reserved.",
    privacyPolicyHtml:
      "<p>This privacy policy explains how this portfolio website handles visitor information, contact form submissions, analytics, and communication data.</p>",
    termsConditionsHtml:
      "<p>These terms and conditions explain the acceptable use of this portfolio website, its content, contact forms, and services information.</p>",
    canonicalUrl: appUrl,
    googleSiteVerification: "",
    googleVerificationFilePath: "",
    googleAnalyticsId: normalizeString(process.env.NEXT_PUBLIC_GA_ID),
    googleTagManagerId: normalizeString(process.env.NEXT_PUBLIC_GTM),
    adsenseHeadCode: "",
    adsensePageTopCode: "",
    adsenseBetweenSectionsCode: "",
    adsensePageBottomCode: "",
    robotsIndexingEnabled: true,
    robotsFollowEnabled: true,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpSecure: false,
    smtpFromEmail: "",
    smtpFromName: "Portfolio Website",
    smtpReplyToEmail: "",
    smtpToEmail: "",
  };
}

function normalizeSiteSettings(value, fallback = {}) {
  const defaults = {
    ...getDefaultSiteSettings(),
    ...fallback,
  };

  return {
    id: 1,
    websiteTitle: normalizeString(value?.websiteTitle ?? defaults.websiteTitle),
    websiteDescription: normalizeString(value?.websiteDescription ?? defaults.websiteDescription),
    navTitle: normalizeString(value?.navTitle ?? defaults.navTitle),
    navSubtitle: normalizeString(value?.navSubtitle ?? defaults.navSubtitle),
    seoTitle: normalizeString(value?.seoTitle ?? defaults.seoTitle),
    seoDescription: normalizeString(value?.seoDescription ?? defaults.seoDescription),
    seoKeywords: normalizeString(value?.seoKeywords ?? defaults.seoKeywords),
    seoImage: normalizeString(value?.seoImage ?? defaults.seoImage),
    websiteIcon: normalizeString(value?.websiteIcon ?? defaults.websiteIcon),
    heroHeaderText: normalizeString(value?.heroHeaderText ?? defaults.heroHeaderText),
    heroDescription: normalizeString(value?.heroDescription ?? defaults.heroDescription),
    heroImage: normalizeString(value?.heroImage ?? defaults.heroImage),
    contactEmail: normalizeString(value?.contactEmail ?? defaults.contactEmail),
    mobileNumber: normalizeString(value?.mobileNumber ?? defaults.mobileNumber),
    footerText: normalizeString(value?.footerText ?? defaults.footerText),
    privacyPolicyHtml: String(
      value?.privacyPolicyHtml ?? defaults.privacyPolicyHtml,
    ).trim(),
    termsConditionsHtml: String(
      value?.termsConditionsHtml ?? defaults.termsConditionsHtml,
    ).trim(),
    canonicalUrl: normalizeString(value?.canonicalUrl ?? defaults.canonicalUrl),
    googleSiteVerification: normalizeString(
      value?.googleSiteVerification ?? defaults.googleSiteVerification,
    ),
    googleVerificationFilePath: normalizeString(
      value?.googleVerificationFilePath ?? defaults.googleVerificationFilePath,
    ),
    googleAnalyticsId: normalizeString(value?.googleAnalyticsId ?? defaults.googleAnalyticsId),
    googleTagManagerId: normalizeString(value?.googleTagManagerId ?? defaults.googleTagManagerId),
    adsenseHeadCode: String(value?.adsenseHeadCode ?? (defaults.adsenseHeadCode || "")).trim(),
    adsensePageTopCode: String(
      value?.adsensePageTopCode ?? (defaults.adsensePageTopCode || ""),
    ).trim(),
    adsenseBetweenSectionsCode: String(
      value?.adsenseBetweenSectionsCode ?? (defaults.adsenseBetweenSectionsCode || ""),
    ).trim(),
    adsensePageBottomCode: String(
      value?.adsensePageBottomCode ?? (defaults.adsensePageBottomCode || ""),
    ).trim(),
    robotsIndexingEnabled: toBoolean(
      value?.robotsIndexingEnabled,
      defaults.robotsIndexingEnabled,
    ),
    robotsFollowEnabled: toBoolean(value?.robotsFollowEnabled, defaults.robotsFollowEnabled),
    smtpHost: normalizeString(value?.smtpHost ?? defaults.smtpHost),
    smtpPort: Math.max(1, toInteger(value?.smtpPort, defaults.smtpPort)),
    smtpUser: normalizeString(value?.smtpUser ?? defaults.smtpUser),
    smtpPass: normalizeString(value?.smtpPass ?? defaults.smtpPass),
    smtpSecure: toBoolean(value?.smtpSecure, defaults.smtpSecure),
    smtpFromEmail: normalizeString(value?.smtpFromEmail ?? defaults.smtpFromEmail),
    smtpFromName: normalizeString(value?.smtpFromName ?? defaults.smtpFromName),
    smtpReplyToEmail: normalizeString(value?.smtpReplyToEmail ?? defaults.smtpReplyToEmail),
    smtpToEmail: normalizeString(value?.smtpToEmail ?? defaults.smtpToEmail),
  };
}

function serializeSiteSettings(settings, options = {}) {
  const normalized = normalizeSiteSettings(settings);

  if (options.includeSensitive) {
    return normalized;
  }

  return {
    ...normalized,
    smtpPass: normalized.smtpPass ? "********" : "",
  };
}

function isSmtpConfigured(settings) {
  const normalized = normalizeSiteSettings(settings);
  return Boolean(
    normalized.smtpHost &&
      normalized.smtpPort &&
      normalized.smtpFromEmail &&
      normalized.smtpToEmail &&
      (normalized.smtpUser || normalized.smtpPass || !normalized.smtpSecure),
  );
}

module.exports = {
  getDefaultSiteSettings,
  isSmtpConfigured,
  normalizeSiteSettings,
  serializeSiteSettings,
};
