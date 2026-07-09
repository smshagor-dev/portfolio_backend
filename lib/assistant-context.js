const prisma = require("./prisma");

function normalizeString(value) {
  return String(value || "").trim();
}

function buildBackendPublicUrl(value, siteSettings) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const backendBase = String(
    process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || siteSettings?.canonicalUrl || "",
  )
    .trim()
    .replace(/\/+$/, "");

  let path = normalized;
  if (!path.startsWith("/")) {
    path = path.startsWith("uploads/") ? `/${path}` : `/uploads/${path}`;
  }

  return backendBase ? `${backendBase}${path}` : path;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return Array.from(
    new Set(
      normalizeString(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 3 || item === "cv"),
    ),
  );
}

function scoreEntry(entryText, keywords) {
  if (!keywords.length) {
    return 0;
  }

  const haystack = normalizeString(entryText).toLowerCase();
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

function pickRelevantItems(items, keywords, textBuilder, limit = 4) {
  const preparedItems = (items || [])
    .map((item) => ({
      item,
      score: scoreEntry(textBuilder(item), keywords),
    }))
    .filter(({ score }) => score > 0);

  if (preparedItems.length) {
    return preparedItems
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item);
  }

  return (items || []).slice(0, limit);
}

function pickRelevantItemsWithScores(items, keywords, textBuilder, limit = 4) {
  const preparedItems = (items || [])
    .map((item) => ({
      item,
      score: scoreEntry(textBuilder(item), keywords),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return preparedItems;
}

function countRelevantItems(items, keywords, textBuilder) {
  return (items || []).reduce((count, item) => {
    return count + (scoreEntry(textBuilder(item), keywords) > 0 ? 1 : 0);
  }, 0);
}

function truncateByLength(value, maxLength) {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized.length <= maxLength) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return String(serialized).slice(0, maxLength);
  }

  const entries = Object.entries(value);
  const truncated = {};

  for (const [key, entryValue] of entries) {
    const candidate = { ...truncated, [key]: entryValue };
    if (JSON.stringify(candidate, null, 2).length <= maxLength) {
      truncated[key] = entryValue;
      continue;
    }

    if (Array.isArray(entryValue)) {
      const trimmedItems = [];
      for (const item of entryValue) {
        const nextCandidate = { ...truncated, [key]: [...trimmedItems, item] };
        if (JSON.stringify(nextCandidate, null, 2).length > maxLength) {
          break;
        }

        trimmedItems.push(item);
      }

      if (trimmedItems.length > 0) {
        truncated[key] = trimmedItems;
      }
      continue;
    }

    if (entryValue && typeof entryValue === "object") {
      const nestedMaxLength = Math.max(200, maxLength - JSON.stringify(truncated, null, 2).length - 50);
      const nestedTruncated = truncateByLength(entryValue, nestedMaxLength);
      const nestedCandidate = { ...truncated, [key]: nestedTruncated };
      if (JSON.stringify(nestedCandidate, null, 2).length <= maxLength) {
        truncated[key] = nestedTruncated;
      }
    }
  }

  return Object.keys(truncated).length ? truncated : { summary: serialized.slice(0, maxLength) };
}

async function buildAssistantContext(message) {
  const keywords = tokenize(message);
  const [profile, siteSettings, skills, projects, services, experiences, educations, articles, faqs, emergencyContacts, achievements, pricings, trainingEntries] = await Promise.all([
    prisma.profile.findUnique({ where: { id: 1 } }),
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.skill.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.project.findMany({ orderBy: [{ sortOrder: "asc" }] }),
    prisma.service.findMany({ where: { status: true }, orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }] }),
    prisma.experience.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.education.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.article.findMany({
      where: {
        status: "published",
        OR: [{ publishDate: null }, { publishDate: { lte: new Date() } }],
      },
      orderBy: [{ isFeatured: "desc" }, { publishDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.faq.findMany({ where: { status: true }, orderBy: { sortOrder: "asc" } }),
    prisma.emergencyContact.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
    prisma.achievement.findMany({ orderBy: { sortOrder: "asc" } }).catch(() => []),
    prisma.pricing.findMany({ where: { status: true }, orderBy: [{ isPopular: "desc" }, { sortOrder: "asc" }] }).catch(() => []),
    prisma.aiTrainingEntry.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } }).catch(() => []),
  ]);

  const profileKeywordsText = [
    profile?.name,
    profile?.designation,
    profile?.description,
    profile?.email,
    profile?.phone,
    profile?.address,
    profile?.resume,
    "resume cv portfolio contact email phone linkedin github website",
  ]
    .filter(Boolean)
    .join(" ");

  const context = {
    profile: profile
      ? {
          name: profile.name,
          designation: profile.designation,
          description: profile.description,
          email: profile.email,
          phone: profile.phone,
          address: profile.address,
          resume: buildBackendPublicUrl(profile.resume, siteSettings),
          socialLinks: Array.isArray(profile.socialLinks) ? profile.socialLinks : [],
          heroSkills:
            profile.heroSkills && typeof profile.heroSkills === "object" ? profile.heroSkills : [],
        }
      : null,
    contact_info: {
      websiteTitle: siteSettings?.websiteTitle || "",
      websiteDescription: siteSettings?.websiteDescription || "",
      contactEmail: siteSettings?.contactEmail || profile?.email || "",
      mobileNumber: siteSettings?.mobileNumber || profile?.phone || "",
      canonicalUrl: siteSettings?.canonicalUrl || "",
      emergencyContacts: emergencyContacts.map((item) => ({
        label: item.label,
        name: item.name,
        icon: item.icon,
        link: item.link,
      })),
    },
    skills: pickRelevantItems(
      skills.map((item) => ({
        name: item.name,
        percentage: item.percentage,
      })),
      keywords,
      (item) => `${item.name} ${item.percentage}`,
      8,
    ),
    projects: pickRelevantItems(
      projects.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        content: stripHtml(item.content),
        role: item.role,
        tools: Array.isArray(item.tools) ? item.tools : [],
        buttons: Array.isArray(item.buttons) ? item.buttons : [],
      })),
      keywords,
      (item) => [item.name, item.slug, item.description, item.content, item.role, (item.tools || []).join(" ")].join(" "),
      4,
    ),
    services: pickRelevantItems(
      services.map((item) => ({
        name: item.name,
        slug: item.slug,
        impression: item.impression,
        description: item.description,
        content: stripHtml(item.content),
        isFeatured: item.isFeatured,
      })),
      keywords,
      (item) => [item.name, item.slug, item.impression, item.description, item.content].join(" "),
      4,
    ),
    experience: pickRelevantItems(
      experiences.map((item) => ({
        title: item.title,
        company: item.company,
        location: item.location,
        duration: item.duration,
        description: stripHtml(item.description),
      })),
      keywords,
      (item) => [item.title, item.company, item.location, item.duration, item.description].join(" "),
      4,
    ),
    education: pickRelevantItems(
      educations.map((item) => ({
        title: item.title,
        institution: item.institution,
        department: item.department,
        duration: item.duration,
        achievement: stripHtml(item.achievement),
      })),
      keywords,
      (item) => [item.title, item.institution, item.department, item.duration, item.achievement].join(" "),
      3,
    ),
    blogs: pickRelevantItems(
      articles.map((item) => ({
        title: item.title,
        slug: item.slug,
        shortDescription: item.shortDescription,
        category: item.category,
        tags: Array.isArray(item.tags) ? item.tags : [],
      })),
      keywords,
      (item) => [item.title, item.slug, item.shortDescription, item.category, (item.tags || []).join(" ")].join(" "),
      4,
    ),
    faqs: pickRelevantItems(
      faqs.map((item) => ({
        question: item.question,
        answer: stripHtml(item.answer),
      })),
      keywords,
      (item) => `${item.question} ${item.answer}`,
      6,
    ),
    pricing: pickRelevantItems(
      pricings.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        duration: item.duration,
        price: item.price?.toString?.() || String(item.price || ""),
        features: Array.isArray(item.features) ? item.features : [],
      })),
      keywords,
      (item) => [item.name, item.slug, item.description, item.duration, item.price, (item.features || []).join(" ")].join(" "),
      3,
    ),
    achievements: pickRelevantItems(
      achievements.map((item) => ({
        title: item.title,
        issuer: item.issuer,
        date: item.date,
        type: item.type,
      })),
      keywords,
      (item) => [item.title, item.issuer, item.date, item.type].join(" "),
      4,
    ),
    training_examples: pickRelevantItems(
      trainingEntries.map((item) => ({
        question: item.question,
        answer: stripHtml(item.answer),
      })),
      keywords,
      (item) => `${item.question} ${item.answer}`,
      8,
    ),
  };

  const relevantMatches = {
    profile:
      scoreEntry(profileKeywordsText, keywords) > 0
        ? {
            score: scoreEntry(profileKeywordsText, keywords),
            fields: {
              name: profile?.name || "",
              designation: profile?.designation || "",
              description: profile?.description || "",
              email: profile?.email || "",
              phone: profile?.phone || "",
              address: profile?.address || "",
              resume: buildBackendPublicUrl(profile?.resume, siteSettings),
            },
          }
        : null,
    skills: pickRelevantItemsWithScores(
      skills.map((item) => ({
        name: item.name,
        percentage: item.percentage,
      })),
      keywords,
      (item) => `${item.name} ${item.percentage}`,
      8,
    ),
    projects: pickRelevantItemsWithScores(
      projects.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        content: stripHtml(item.content),
        role: item.role,
        tools: Array.isArray(item.tools) ? item.tools : [],
        buttons: Array.isArray(item.buttons) ? item.buttons : [],
      })),
      keywords,
      (item) => [item.name, item.slug, item.description, item.content, item.role, (item.tools || []).join(" ")].join(" "),
      4,
    ),
    services: pickRelevantItemsWithScores(
      services.map((item) => ({
        name: item.name,
        slug: item.slug,
        impression: item.impression,
        description: item.description,
        content: stripHtml(item.content),
        isFeatured: item.isFeatured,
      })),
      keywords,
      (item) => [item.name, item.slug, item.impression, item.description, item.content].join(" "),
      4,
    ),
    experience: pickRelevantItemsWithScores(
      experiences.map((item) => ({
        title: item.title,
        company: item.company,
        location: item.location,
        duration: item.duration,
        description: stripHtml(item.description),
      })),
      keywords,
      (item) => [item.title, item.company, item.location, item.duration, item.description].join(" "),
      4,
    ),
    education: pickRelevantItemsWithScores(
      educations.map((item) => ({
        title: item.title,
        institution: item.institution,
        department: item.department,
        duration: item.duration,
        achievement: stripHtml(item.achievement),
      })),
      keywords,
      (item) => [item.title, item.institution, item.department, item.duration, item.achievement].join(" "),
      3,
    ),
    blogs: pickRelevantItemsWithScores(
      articles.map((item) => ({
        title: item.title,
        slug: item.slug,
        shortDescription: item.shortDescription,
        category: item.category,
        tags: Array.isArray(item.tags) ? item.tags : [],
      })),
      keywords,
      (item) => [item.title, item.slug, item.shortDescription, item.category, (item.tags || []).join(" ")].join(" "),
      4,
    ),
    faqs: pickRelevantItemsWithScores(
      faqs.map((item) => ({
        question: item.question,
        answer: stripHtml(item.answer),
      })),
      keywords,
      (item) => `${item.question} ${item.answer}`,
      6,
    ),
    pricing: pickRelevantItemsWithScores(
      pricings.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        duration: item.duration,
        price: item.price?.toString?.() || String(item.price || ""),
        features: Array.isArray(item.features) ? item.features : [],
      })),
      keywords,
      (item) => [item.name, item.slug, item.description, item.duration, item.price, (item.features || []).join(" ")].join(" "),
      3,
    ),
    achievements: pickRelevantItemsWithScores(
      achievements.map((item) => ({
        title: item.title,
        issuer: item.issuer,
        date: item.date,
        type: item.type,
      })),
      keywords,
      (item) => [item.title, item.issuer, item.date, item.type].join(" "),
      4,
    ),
    training_examples: pickRelevantItemsWithScores(
      trainingEntries.map((item) => ({
        question: item.question,
        answer: stripHtml(item.answer),
      })),
      keywords,
      (item) => `${item.question} ${item.answer}`,
      8,
    ),
  };

  const enrichedContext = {
    keywords,
    relevant_matches: relevantMatches,
    context,
  };
  const serializedContext = truncateByLength(enrichedContext, 12000);
  const matchCount =
    scoreEntry(profileKeywordsText, keywords) +
    countRelevantItems(
      skills.map((item) => ({
        name: item.name,
        percentage: item.percentage,
      })),
      keywords,
      (item) => `${item.name} ${item.percentage}`,
    ) +
    countRelevantItems(
      projects.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        content: stripHtml(item.content),
        role: item.role,
        tools: Array.isArray(item.tools) ? item.tools : [],
      })),
      keywords,
      (item) => [item.name, item.slug, item.description, item.content, item.role, (item.tools || []).join(" ")].join(" "),
    ) +
    countRelevantItems(
      services.map((item) => ({
        name: item.name,
        slug: item.slug,
        impression: item.impression,
        description: item.description,
        content: stripHtml(item.content),
      })),
      keywords,
      (item) => [item.name, item.slug, item.impression, item.description, item.content].join(" "),
    ) +
    countRelevantItems(
      experiences.map((item) => ({
        title: item.title,
        company: item.company,
        location: item.location,
        duration: item.duration,
        description: stripHtml(item.description),
      })),
      keywords,
      (item) => [item.title, item.company, item.location, item.duration, item.description].join(" "),
    ) +
    countRelevantItems(
      educations.map((item) => ({
        title: item.title,
        institution: item.institution,
        department: item.department,
        duration: item.duration,
        achievement: stripHtml(item.achievement),
      })),
      keywords,
      (item) => [item.title, item.institution, item.department, item.duration, item.achievement].join(" "),
    ) +
    countRelevantItems(
      articles.map((item) => ({
        title: item.title,
        slug: item.slug,
        shortDescription: item.shortDescription,
        category: item.category,
        tags: Array.isArray(item.tags) ? item.tags : [],
      })),
      keywords,
      (item) => [item.title, item.slug, item.shortDescription, item.category, (item.tags || []).join(" ")].join(" "),
    ) +
    countRelevantItems(
      faqs.map((item) => ({
        question: item.question,
        answer: stripHtml(item.answer),
      })),
      keywords,
      (item) => `${item.question} ${item.answer}`,
    ) +
    countRelevantItems(
      emergencyContacts.map((item) => ({
        label: item.label,
        name: item.name,
        icon: item.icon,
        link: item.link,
      })),
      keywords,
      (item) => [item.label, item.name, item.icon, item.link].join(" "),
    ) +
    countRelevantItems(
      pricings.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        duration: item.duration,
        price: item.price?.toString?.() || String(item.price || ""),
        features: Array.isArray(item.features) ? item.features : [],
      })),
      keywords,
      (item) => [item.name, item.slug, item.description, item.duration, item.price, (item.features || []).join(" ")].join(" "),
    ) +
    countRelevantItems(
      achievements.map((item) => ({
        title: item.title,
        issuer: item.issuer,
        date: item.date,
        type: item.type,
      })),
      keywords,
      (item) => [item.title, item.issuer, item.date, item.type].join(" "),
    ) +
    countRelevantItems(
      trainingEntries.map((item) => ({
        question: item.question,
        answer: stripHtml(item.answer),
      })),
      keywords,
      (item) => `${item.question} ${item.answer}`,
    );

  return {
    context: serializedContext,
    contextText:
      typeof serializedContext === "string"
        ? serializedContext
        : JSON.stringify(serializedContext, null, 2),
    hasRelevantMatches: matchCount > 0,
  };
}

module.exports = {
  buildAssistantContext,
};
