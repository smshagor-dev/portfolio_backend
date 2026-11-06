const { generateAssistantResponse } = require("./ai");
const { decryptText, encryptText } = require("../utils/encryption");
const {
  buildCoverLetterPrompt,
  buildMatchPrompt,
  buildRecruiterEmailPrompt,
  buildSystemPrompt,
} = require("./job-agent-prompt-engine");

const PROVIDERS = ["DEEPSEEK", "GEMINI", "OPENAI"];

const PROVIDER_LABELS = {
  DEEPSEEK: "DeepSeek \u2014 Recommended / Cost-effective",
  GEMINI: "Gemini \u2014 Fast fallback",
  OPENAI: "OpenAI \u2014 Premium quality",
};

const AVAILABLE_MODELS = {
  DEEPSEEK: ["deepseek-chat", "deepseek-reasoner"],
  GEMINI: ["gemini-1.5-flash", "gemini-1.5-pro"],
  OPENAI: ["gpt-4o-mini", "gpt-4o"],
};

const RECOMMENDED_MODELS = {
  DEEPSEEK: "deepseek-chat",
  GEMINI: "gemini-1.5-flash",
  OPENAI: "gpt-4o-mini",
};

const DEFAULT_SYSTEM_PROMPT =
  "You are writing on behalf of Md Shahanur Islam Shagor. Write naturally, professionally, and honestly, as if Md Shahanur Islam Shagor personally wrote the message. Use only the provided portfolio profile, skills, education, projects, experience, CV link, and job details. Do not invent experience, employers, degrees, achievements, certifications, or skills. Be concise, confident, respectful, and recruiter-friendly. Avoid generic AI-sounding phrases, exaggeration, buzzwords, and robotic wording. Never use: passionate, dynamic professional, leverage, synergy, fast-paced environment, cutting-edge, world-class, best-in-class, highly motivated. The message should feel human, specific, and easy for a recruiter to read quickly.";

const DEFAULT_RECRUITER_EMAIL_PROMPT =
  "Create a concise, professional, highly customized recruiter outreach email. First read the complete job description and identify the job title, company, required skills, preferred skills, responsibilities, domain, seniority, work type, tools, and soft skills. Then compare the job description with the candidate profile and mention only skills, responsibilities, and projects that are supported by the provided resume/profile context. Do not mention missing skills. Select the strongest positioning for the role: Web, Backend, Frontend, Full-Stack, AI Automation, Go, DevOps/Server, Drone/UAV, Cybersecurity, or general software. Do not generate a generic email. Keep it under {{maxEmailWords}} words. Use a clear subject: Application for {jobTitle}. Include that CV and cover letter are attached if attachments are enabled. Do not invent facts, overclaim, or mention every skill.";

const DEFAULT_COVER_LETTER_PROMPT =
  "Write only the body paragraphs for a customized cover letter using the provided real portfolio context and job description. The PDF renderer will add the applicant header and signature footer automatically, so do not include contact details, greeting, or signature. Select only one highest-matching role category: web/full-stack, backend, Go, AI/machine learning, drone/UAV/robotics, cybersecurity, embedded/IoT, or general software engineering. Determine seniority from the job description and adapt tone: intern/junior should emphasize learning, education, projects, and hands-on development; mid-level should emphasize implementation, ownership, and delivery; senior should emphasize architecture, technical decisions, practical context sharing, and scalability; lead/principal/director should mention leadership, strategy, process, or management only when supported by the profile. Mention only skills that appear in both the job description and candidate profile, capped at 4 primary technologies and 3 secondary technologies. Select one project dynamically by overlap with JD technologies, responsibilities, domain, and role category; do not force a project if no clear match exists. If the job description provides sufficient company information, add one concrete sentence explaining why the company/product/domain is interesting; otherwise skip it completely. If the JD explicitly emphasizes startup, fast-growing, research-driven, enterprise, remote-first, or customer-focused culture, add one sentence connecting working style to that environment; otherwise skip it and do not invent culture. Use accurate evidence wording: professional experience, research and development work, or hands-on project development. Never present research or academic/personal projects as paid professional experience. Never write 'My background aligns with this opportunity', 'I am excited to apply', or 'I believe I am a strong fit'. Never reuse previously generated role paragraphs; generate fresh wording for every application even when the role category remains the same. Avoid buzzwords: passionate, dynamic professional, leverage, synergy, fast-paced environment, cutting-edge, world-class, best-in-class, highly motivated. Use accurate experience duration: 4 years for web/full-stack/backend, more than 1 year for drone/AI/autonomous systems or AI/ML, and 2 years for cybersecurity/secure communications. Add a communication paragraph mentioning Bengali and English fluency plus working knowledge of Russian and Hindi. Do not invent facts. Keep it under {{maxCoverLetterWords}} words.";

function normalizeString(value) {
  return String(value || "").trim();
}

function promptOverrideAllowed() {
  return String(process.env.JOB_AGENT_ALLOW_PROMPT_OVERRIDE || "").trim().toLowerCase() === "true";
}

function normalizeProvider(value, fallback = "DEEPSEEK") {
  const normalized = normalizeString(value || fallback).toUpperCase();
  return PROVIDERS.includes(normalized) ? normalized : fallback;
}

function getDefaultModel(provider) {
  return RECOMMENDED_MODELS[normalizeProvider(provider)] || RECOMMENDED_MODELS.DEEPSEEK;
}

function normalizeModelForProvider(provider, model) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedModel = normalizeString(model);
  return normalizedModel || getDefaultModel(normalizedProvider);
}

function providerToServiceName(provider) {
  return normalizeProvider(provider).toLowerCase();
}

function getEncryptedKeyField(provider) {
  switch (normalizeProvider(provider)) {
    case "OPENAI":
      return "openaiApiKeyEncrypted";
    case "GEMINI":
      return "geminiApiKeyEncrypted";
    case "DEEPSEEK":
    default:
      return "deepseekApiKeyEncrypted";
  }
}

function keyConfigured(settings, provider) {
  return Boolean(settings?.[getEncryptedKeyField(provider)]);
}

function serializeJobAgentAiSetting(settings) {
  const aiProvider = normalizeProvider(settings?.aiProvider);
  const allowPromptOverride = promptOverrideAllowed();
  return {
    id: settings?.id || 1,
    aiProvider,
    aiModel: normalizeModelForProvider(aiProvider, settings?.aiModel),
    deepseekKeyConfigured: Boolean(settings?.deepseekApiKeyEncrypted),
    geminiKeyConfigured: Boolean(settings?.geminiApiKeyEncrypted),
    openaiKeyConfigured: Boolean(settings?.openaiApiKeyEncrypted),
    providerLabels: PROVIDER_LABELS,
    availableModels: AVAILABLE_MODELS,
    recommendedModels: RECOMMENDED_MODELS,
    fallbackProvider: settings?.fallbackProvider ? normalizeProvider(settings.fallbackProvider) : "",
    fallbackEnabled: Boolean(settings?.fallbackEnabled),
    allowPromptOverride,
    systemPrompt: allowPromptOverride ? settings?.systemPrompt || "" : "",
    recruiterEmailPrompt: allowPromptOverride ? settings?.recruiterEmailPrompt || "" : "",
    coverLetterPrompt: allowPromptOverride ? settings?.coverLetterPrompt || "" : "",
    tone: settings?.tone || "professional-natural",
    maxEmailWords: settings?.maxEmailWords || 160,
    maxCoverLetterWords: settings?.maxCoverLetterWords || 450,
    requireAdminApproval: settings?.requireAdminApproval !== false,
    attachCv: settings?.attachCv !== false,
    attachCoverLetterPdf: settings?.attachCoverLetterPdf !== false,
    autoGenerateCoverLetter: settings?.autoGenerateCoverLetter !== false,
    createdAt: settings?.createdAt || null,
    updatedAt: settings?.updatedAt || null,
  };
}

function buildDefaultAiSettingCreate() {
  return {
    id: 1,
    aiProvider: "DEEPSEEK",
    aiModel: "deepseek-chat",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    recruiterEmailPrompt: DEFAULT_RECRUITER_EMAIL_PROMPT,
    coverLetterPrompt: DEFAULT_COVER_LETTER_PROMPT,
    tone: "professional-natural",
    maxEmailWords: 160,
    maxCoverLetterWords: 450,
    requireAdminApproval: true,
    attachCv: true,
    attachCoverLetterPdf: true,
    autoGenerateCoverLetter: true,
  };
}

async function getJobAgentAiSetting(prisma) {
  return prisma.jobAgentAiSetting.upsert({
    where: { id: 1 },
    update: {},
    create: buildDefaultAiSettingCreate(),
  });
}

function normalizeAiSettingPayload(body, existing) {
  const aiProvider = normalizeProvider(body?.aiProvider || existing?.aiProvider);
  const fallbackProvider = normalizeString(body?.fallbackProvider)
    ? normalizeProvider(body.fallbackProvider)
    : null;

  const payload = {
    aiProvider,
    aiModel: normalizeModelForProvider(aiProvider, body?.aiModel),
    fallbackProvider,
    fallbackEnabled: typeof body?.fallbackEnabled === "boolean" ? body.fallbackEnabled : Boolean(existing?.fallbackEnabled),
    tone: normalizeString(body?.tone || existing?.tone) || "professional-natural",
    maxEmailWords: Math.max(40, Number.parseInt(body?.maxEmailWords, 10) || existing?.maxEmailWords || 160),
    maxCoverLetterWords: Math.max(120, Number.parseInt(body?.maxCoverLetterWords, 10) || existing?.maxCoverLetterWords || 450),
    requireAdminApproval:
      typeof body?.requireAdminApproval === "boolean"
        ? body.requireAdminApproval
        : existing?.requireAdminApproval !== false,
    attachCv: typeof body?.attachCv === "boolean" ? body.attachCv : existing?.attachCv !== false,
    attachCoverLetterPdf:
      typeof body?.attachCoverLetterPdf === "boolean"
        ? body.attachCoverLetterPdf
        : existing?.attachCoverLetterPdf !== false,
    autoGenerateCoverLetter:
      typeof body?.autoGenerateCoverLetter === "boolean"
        ? body.autoGenerateCoverLetter
        : existing?.autoGenerateCoverLetter !== false,
  };

  if (promptOverrideAllowed()) {
    payload.systemPrompt = normalizeString(body?.systemPrompt ?? existing?.systemPrompt) || DEFAULT_SYSTEM_PROMPT;
    payload.recruiterEmailPrompt =
      normalizeString(body?.recruiterEmailPrompt ?? existing?.recruiterEmailPrompt) || DEFAULT_RECRUITER_EMAIL_PROMPT;
    payload.coverLetterPrompt =
      normalizeString(body?.coverLetterPrompt ?? existing?.coverLetterPrompt) || DEFAULT_COVER_LETTER_PROMPT;
  }

  return payload;
}

function buildEncryptedKeyUpdate(body) {
  const update = {};
  for (const provider of PROVIDERS) {
    const lower = provider.toLowerCase();
    const value = normalizeString(body?.[`${lower}ApiKey`]);
    if (value) {
      update[getEncryptedKeyField(provider)] = encryptText(value);
    }
  }
  return update;
}

function applyPromptTemplate(prompt, settings) {
  return normalizeString(prompt)
    .replaceAll("{{maxEmailWords}}", String(settings.maxEmailWords || 160))
    .replaceAll("{{maxCoverLetterWords}}", String(settings.maxCoverLetterWords || 450));
}

function getSystemPrompt(settings) {
  if (promptOverrideAllowed() && normalizeString(settings?.systemPrompt)) {
    return settings.systemPrompt;
  }

  return buildSystemPrompt();
}

function buildFinalPrompts({ settings, profileContext, job, match, recruiterContact, mode }) {
  const systemPrompt = getSystemPrompt(settings);
  const emailPrompt =
    promptOverrideAllowed() && normalizeString(settings?.recruiterEmailPrompt)
      ? applyPromptTemplate(settings.recruiterEmailPrompt, settings)
      : buildRecruiterEmailPrompt({
          profileContext,
          job,
          match,
          recruiter: recruiterContact,
          settings,
        });
  const coverLetterPrompt =
    promptOverrideAllowed() && normalizeString(settings?.coverLetterPrompt)
      ? applyPromptTemplate(settings.coverLetterPrompt, settings)
      : buildCoverLetterPrompt({
          profileContext,
          job,
          match,
          settings,
        });
  const matchPrompt = buildMatchPrompt({ profileContext, job, settings });

  return {
    systemPrompt,
    emailPrompt: mode === "email" || mode === "both" ? emailPrompt : "",
    coverLetterPrompt: mode === "coverLetter" || mode === "both" ? coverLetterPrompt : "",
    matchPrompt,
  };
}

function parseJsonFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseAiJson(value) {
  return JSON.parse(parseJsonFence(value));
}

function topSkills(profileContext, job, limit = 4) {
  const haystack = `${job?.title || ""} ${job?.company || ""} ${job?.description || ""}`.toLowerCase();
  const skills = Array.isArray(profileContext?.skills) ? profileContext.skills : [];
  const matched = skills.filter((skill) => haystack.includes(String(skill).toLowerCase()));
  return (matched.length ? matched : skills).slice(0, limit);
}

function keywordScore(haystack, keywords) {
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

function deterministicIndex(seed, length) {
  if (!length) return 0;
  let hash = 0;
  for (const char of String(seed || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % length;
}

const coverLetterParagraphVariants = {
  cyber: [
    [
      "My strongest connection to this role is security-focused engineering: building software with careful attention to OWASP risks, JWT/OAuth authentication flows, blockchain security concepts, Zero-Knowledge Proofs, and post-quantum cryptography.",
      "I approach secure system design with privacy, resilience, and risk mitigation as core architecture concerns, not late-stage additions. That mindset fits roles where secure communication, reliable access control, and defensive engineering are central to the work.",
    ],
    [
      "This position fits my experience designing and reasoning about secure software systems, including authentication workflows, application hardening, blockchain-based trust models, Zero-Knowledge Proofs, and post-quantum cryptographic ideas.",
      "The responsibilities connect directly with the way I build: reducing risk through clear architecture, protecting user and system data, and making security part of implementation decisions from the beginning.",
    ],
    [
      "For a cybersecurity-focused role, I bring practical software engineering experience together with research exposure in secure communications, OWASP-aware development, JWT/OAuth, blockchain security, and post-quantum cryptography.",
      "I am especially interested in roles where privacy, resilience, and secure architecture matter in production systems, because my project work has required balancing implementation quality with real threat and reliability concerns.",
    ],
  ],
  drone: [
    [
      "This role closely matches my research and engineering work in autonomous UAV systems, GPS-denied navigation, sensor fusion, VIO, UWB TDOA localization, EKF-based estimation, and real-time development using C++, Go, and Python.",
      "The responsibilities connect with my experience translating robotics and localization concepts into working architectures for navigation, coordination, and resilient operation under real-world constraints.",
    ],
    [
      "For drone, UAV, and robotics roles, my strongest experience is in autonomous navigation pipelines, sensor-fusion design, localization, VIO, UWB TDOA, EKF estimation, and implementation across C++, Go, and Python.",
      "I have worked on systems where navigation quality, distributed coordination, and deployment constraints all matter, which gives me a practical view of how research ideas become reliable autonomous-system components.",
    ],
    [
      "This opportunity fits my work at the intersection of UAV research and engineering, especially GPS-denied navigation, VIO, UWB-based localization, EKF fusion, ROS-adjacent robotics workflows, and real-time system implementation.",
      "The role's focus on autonomy and robotics reflects the kind of problems I have been solving: coordinating sensors, improving localization, and building navigation architectures that remain useful outside controlled lab conditions.",
    ],
  ],
  aiMl: [
    [
      "This role fits my applied AI engineering experience across Python, machine learning, computer vision, YOLOv8-style object detection workflows, data processing, automation, model evaluation, and practical software integration.",
      "I focus on turning AI concepts into usable systems by connecting models with APIs, workflows, and deployment constraints so the result supports real decisions rather than remaining only a prototype.",
    ],
    [
      "For AI and machine learning roles, I bring experience with Python-based automation, computer vision, object detection workflows, data preparation, model evaluation, and integrating intelligent features into broader software systems.",
      "The responsibilities connect with my interest in practical AI delivery: building pipelines that process real data, support useful automation, and fit into maintainable application architecture.",
    ],
    [
      "This position aligns with my AI-focused project work involving Python, computer vision, machine learning, automation, data processing, and evaluation of model behavior in applied settings.",
      "I am strongest where AI work meets software engineering: designing workflows, connecting models with APIs or embedded systems, and making intelligent features dependable enough for real use.",
    ],
  ],
  go: [
    [
      "This opportunity connects with my Go-based systems work, API-driven backend development, distributed coordination research, secure communication architecture, and performance-conscious service design.",
      "The role's focus on reliability and system behavior matches my experience building backend workflows where concurrency, efficient communication, and maintainable architecture directly affect the quality of the final system.",
    ],
    [
      "For Go engineering roles, I focus on backend services, APIs, distributed systems thinking, networking workflows, and performance-aware implementation rather than only feature-level coding.",
      "The responsibilities fit my experience with systems that need clear interfaces, reliable data flow, secure communication, and practical engineering decisions around efficiency and maintainability.",
    ],
    [
      "This role matches my interest in Go, backend system design, distributed coordination, secure networking concepts, and performance-oriented software architecture.",
      "I approach this kind of work by keeping services understandable, communication paths reliable, and implementation details efficient enough to support real production or research constraints.",
    ],
  ],
  backend: [
    [
      "This role aligns with my backend engineering experience in Laravel, Node.js, Go, REST APIs, GraphQL, authentication, RBAC, relational databases, Redis-aware architecture, and performance optimization.",
      "The responsibilities connect with my work designing API-driven systems, securing access flows, optimizing data paths, and keeping backend services reliable, maintainable, and ready for production use.",
    ],
    [
      "For backend roles, I bring experience building application architecture around APIs, authentication, RBAC, database design, Laravel, Node.js, Go, GraphQL, and performance-sensitive data workflows.",
      "The job responsibilities fit the kind of backend work I have delivered: reliable service logic, clean interfaces, secure access control, and systems that stay maintainable as features grow.",
    ],
    [
      "This position fits my backend development background across Laravel, Node.js, API design, GraphQL, SQL databases, authentication flows, RBAC, and service-level performance improvement.",
      "I connect strongly with roles that require scalable APIs, dependable business logic, secure user workflows, and thoughtful database decisions because those are recurring themes in my production work.",
    ],
  ],
  web: [
    [
      "This opportunity fits my full-stack web application experience using Laravel, PHP, Next.js, React, JavaScript, TypeScript, REST APIs, MySQL, authentication, payment integrations, responsive UI, real-time features, and database optimization.",
      "The responsibilities outlined in the job description strongly connect with my work on production web platforms, API integrations, real-time communication systems, deployment pipelines, and user-focused interfaces.",
    ],
    [
      "For web and full-stack roles, I bring hands-on experience building production applications with Laravel, PHP, React, Next.js, JavaScript, TypeScript, Tailwind CSS, REST APIs, MySQL, authentication, and payment workflows.",
      "The role's focus on UI quality, APIs, scalability, performance, deployment, and database optimization matches the kind of end-to-end product work I have delivered for client and platform projects.",
    ],
    [
      "This role connects directly with my web development background: building responsive interfaces, integrating APIs, implementing authentication, working with MySQL, and delivering features across Laravel, Next.js, React, JavaScript, and TypeScript.",
      "I am strongest in web roles where UI/UX, performance, scalability, database design, payment integration, real-time behavior, and deployment all need to come together in a maintainable application.",
    ],
  ],
  embedded: [
    [
      "This opportunity connects with my work in embedded hardware, IoT systems, sensor integration, real-time computation, assistive navigation technology, and practical software deployment.",
      "The role reflects my experience translating sensor-driven concepts into working systems where reliability, cost, usability, and deployment constraints all matter.",
    ],
    [
      "For embedded and IoT roles, I bring experience connecting sensors, software logic, real-time processing, and practical hardware constraints into complete systems.",
      "The responsibilities fit my work on assistive and sensor-based projects where the engineering challenge is not only writing code, but making the system dependable and usable in real environments.",
    ],
  ],
  general: [
    [
      "This opportunity connects with my broader software engineering background across production web development, applied AI, autonomous systems research, secure communications, and maintainable technical delivery.",
      "The role reflects the type of engineering work I value most: solving practical problems, building reliable systems, and balancing implementation quality with real-world constraints.",
    ],
    [
      "This role fits my combined experience in production software, applied AI, secure systems, and research-driven engineering, while still allowing me to focus on the requirements described in the job.",
      "I bring a practical engineering approach: understand the problem clearly, choose the right tools, build maintainable systems, and keep user impact and reliability visible throughout the work.",
    ],
  ],
};

function applyCoverLetterVariant(focus, job) {
  const variants = coverLetterParagraphVariants[focus.key] || coverLetterParagraphVariants.general;
  const styleIndex = deterministicIndex(`${job?.title || ""}|${job?.company || ""}|${job?.description || ""}`, variants.length);
  return {
    ...focus,
    styleIndex,
  };
}

const verifiedCandidateSkills = [
  "PHP", "Laravel", "Node.js", "Python", "Flask", "REST APIs", "GraphQL", "WebSockets", "Go", "C++", "C#", "React",
  "Next.js", "Vue.js", "Angular", "React Native", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Bootstrap",
  "MySQL", "PostgreSQL", "MongoDB", "Redis", "Docker", "Linux", "Nginx", "Apache", "GitHub", "AWS", "Google Cloud",
  "OWASP", "JWT", "OAuth", "Blockchain", "Zero-Knowledge Proofs", "Post-Quantum Cryptography", "UWB TDOA", "EKF", "VIO",
  "Sensor Fusion", "Computer Vision", "Machine Learning", "YOLOv8", "Data Processing", "Automation", "Model Evaluation",
];

const skillAliases = {
  "REST APIs": ["rest api", "restful", "api development", "apis"],
  "Next.js": ["next.js", "nextjs"],
  "Node.js": ["node.js", "nodejs"],
  "Tailwind CSS": ["tailwind", "tailwind css"],
  "Responsive UI": ["responsive", "responsive ui", "responsive design"],
  "Payment Integration": ["payment", "payment gateway", "payment integration"],
  "Real-Time Features": ["real-time", "real time", "websocket", "pusher"],
  "Database Optimization": ["database optimization", "query optimization", "performance optimization"],
  "Authentication": ["authentication", "auth", "login"],
  "RBAC": ["rbac", "role-based", "role based"],
  "Post-Quantum Cryptography": ["post-quantum", "post quantum", "pq crypto"],
  "Zero-Knowledge Proofs": ["zero-knowledge", "zero knowledge", "zkp"],
  "UWB TDOA": ["uwb", "tdoa", "uwb tdoa"],
  "Sensor Fusion": ["sensor fusion", "fusion"],
  "Computer Vision": ["computer vision", "vision"],
  "Machine Learning": ["machine learning", " ml "],
  "Data Processing": ["data processing", "data pipeline"],
  "Model Evaluation": ["model evaluation", "evaluation"],
};

const categorySkillCatalog = {
  web: ["Laravel", "PHP", "React", "Next.js", "JavaScript", "TypeScript", "HTML", "CSS", "Tailwind CSS", "REST APIs", "MySQL", "Responsive UI", "Authentication", "Payment Integration", "Real-Time Features", "Database Optimization", "Docker", "Nginx"],
  backend: ["Laravel", "Node.js", "Go", "REST APIs", "GraphQL", "MySQL", "PostgreSQL", "Redis", "RBAC", "Authentication", "JWT", "OAuth", "Performance Optimization"],
  go: ["Go", "REST APIs", "Distributed Systems", "Concurrency", "Networking", "Performance", "System Design", "Secure Communication"],
  aiMl: ["Python", "Machine Learning", "Computer Vision", "YOLOv8", "Data Processing", "Automation", "Model Evaluation", "AI System Integration"],
  drone: ["UAV Systems", "Autonomous Navigation", "Sensor Fusion", "VIO", "UWB TDOA", "EKF", "ROS", "C++", "Go", "Python", "Localization", "Distributed Coordination"],
  cyber: ["OWASP", "JWT", "OAuth", "Blockchain", "Zero-Knowledge Proofs", "Post-Quantum Cryptography", "Secure Systems", "Privacy", "Authentication", "Risk Mitigation"],
  embedded: ["Python", "C++", "Sensor Fusion", "IoT", "Real-Time Features", "Embedded Systems", "Data Processing"],
  general: ["REST APIs", "Python", "React", "Node.js", "Docker", "Authentication", "Performance"],
};

const knownCandidateProjects = [
  { name: "AI Powered Financial App", source: "project", keywords: ["ai", "python", "automation", "data processing", "model", "finance", "api"] },
  { name: "SyncChat - Real-Time Communication Engine", source: "project", keywords: ["websocket", "real-time", "chat", "node", "api", "backend", "redis"] },
  { name: "Multivendor E-commerce Management Platform", source: "professional", keywords: ["laravel", "php", "ecommerce", "payment", "mysql", "authentication", "web", "react", "api"] },
  { name: "Server Monitor - Real-Time Health Dashboard", source: "project", keywords: ["server", "monitoring", "linux", "docker", "nginx", "dashboard", "performance"] },
  { name: "Privacy-Preserving Blockchain for Autonomous Vehicles", source: "research", keywords: ["blockchain", "zero-knowledge", "post-quantum", "privacy", "secure", "v2x", "cyber"] },
  { name: "Wireless Vision-Aid System for the Blind", source: "research", keywords: ["embedded", "sensor", "navigation", "computer vision", "assistive", "iot", "python"] },
  { name: "Decentralized Coordination in Secure Autonomous Drone Swarms", source: "research", keywords: ["drone", "uav", "swarm", "distributed", "coordination", "secure", "go", "python"] },
  { name: "Acoustic Localization for GPS-Denied Environments", source: "research", keywords: ["localization", "gps-denied", "sensor", "navigation", "uwb", "tdoa", "ekf"] },
];

function normalizedHaystack(value) {
  return ` ${String(value || "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ")} `;
}

function termAppears(haystack, term) {
  const normalized = normalizedHaystack(haystack);
  const aliases = [term, ...(skillAliases[term] || [])];
  return aliases.some((alias) => normalized.includes(normalizedHaystack(alias)));
}

function candidateHasSkill(profileContext, term) {
  const profileSkills = [
    ...verifiedCandidateSkills,
    ...topSkills(profileContext, { title: "", company: "", description: "" }, 200),
  ];
  return profileSkills.some((skill) => String(skill).toLowerCase() === String(term).toLowerCase() || termAppears(skill, term));
}

function getMatchedTechnicalTerms(job, profileContext, focus) {
  const catalog = categorySkillCatalog[focus.key] || categorySkillCatalog.general;
  const jobText = `${job?.title || ""} ${job?.company || ""} ${job?.description || ""}`;
  const matched = catalog.filter((term) => termAppears(jobText, term) && candidateHasSkill(profileContext, term));
  return {
    primary: matched.slice(0, 4),
    secondary: matched.slice(4, 7),
  };
}

function selectRelevantProject(job, focus, matchedTerms) {
  const jobText = normalizedHaystack(`${job?.title || ""} ${job?.company || ""} ${job?.description || ""}`);
  const matched = [...matchedTerms.primary, ...matchedTerms.secondary].map((term) => normalizedHaystack(term).trim());
  const ranked = knownCandidateProjects
    .map((project) => {
      const projectKeywords = project.keywords.map((keyword) => normalizedHaystack(keyword).trim());
      const jobOverlap = projectKeywords.filter((keyword) => jobText.includes(keyword)).length;
      const skillOverlap = matched.filter((term) => projectKeywords.some((keyword) => keyword.includes(term) || term.includes(keyword))).length;
      const roleOverlap = projectKeywords.includes(focus.key) || projectKeywords.includes(focus.label) ? 1 : 0;
      return { ...project, score: jobOverlap + skillOverlap + roleOverlap };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0] : null;
}

function evidenceIntro(source) {
  if (source === "professional") return "In my professional experience";
  if (source === "research") return "Through research and development work";
  return "Through hands-on project development";
}

function listTerms(terms, fallback) {
  return terms.length ? terms.join(", ") : fallback;
}

function inferCompanyInterest(job) {
  const text = normalizedHaystack(`${job?.title || ""} ${job?.company || ""} ${job?.description || ""}`);
  const signals = [
    {
      keywords: ["fintech", "finance", "financial", "payment", "banking", "wallet", "trading"],
      sentence: "One area that particularly interests me is the company's focus on modern financial technology and scalable digital products.",
    },
    {
      keywords: ["ai", "machine learning", "automation", "computer vision", "model", "data"],
      sentence: "One area that particularly interests me is contributing to a team applying AI solutions to real business and engineering problems.",
    },
    {
      keywords: ["cyber", "security", "privacy", "secure", "risk", "threat", "compliance"],
      sentence: "I am drawn to organizations that treat security, privacy, and resilient system design as core product requirements.",
    },
    {
      keywords: ["robot", "robotics", "drone", "uav", "autonomous", "perception", "navigation"],
      sentence: "What stands out to me about the company domain is the intersection of autonomous systems, perception, and real-world deployment.",
    },
    {
      keywords: ["health", "medical", "healthcare", "patient", "clinic"],
      sentence: "One area that particularly interests me is building reliable software for healthcare workflows where usability and trust matter.",
    },
    {
      keywords: ["saas", "crm", "dashboard", "platform", "marketplace", "e-commerce", "ecommerce"],
      sentence: "What stands out to me is the product focus on practical digital platforms that need reliable architecture, clear user flows, and scalable delivery.",
    },
  ];
  const matched = signals.find((signal) => signal.keywords.some((keyword) => text.includes(normalizedHaystack(keyword))));
  return matched?.sentence || "";
}

function inferCompanyCultureMatch(job) {
  const text = normalizedHaystack(`${job?.title || ""} ${job?.company || ""} ${job?.description || ""}`);
  const signals = [
    {
      keywords: ["startup", "start up", "early stage", "rapid iteration", "ownership"],
      sentence: "I enjoy environments where rapid iteration, ownership, and practical problem-solving are valued.",
    },
    {
      keywords: ["fast-growing", "fast growing", "scale up", "scale-up", "growth company"],
      sentence: "A growing engineering environment appeals to me because it rewards clear execution, adaptability, and thoughtful technical decisions.",
    },
    {
      keywords: ["research-driven", "research driven", "r&d", "experimentation", "lab", "scientific"],
      sentence: "I am particularly interested in environments where experimentation and engineering implementation work closely together.",
    },
    {
      keywords: ["enterprise", "large-scale", "large scale", "mission critical", "long-term", "long term"],
      sentence: "I appreciate engineering environments that emphasize reliability, maintainability, and long-term system quality.",
    },
    {
      keywords: ["remote-first", "remote first", "distributed team", "asynchronous", "async"],
      sentence: "I am comfortable collaborating across distributed teams and communicating clearly in asynchronous environments.",
    },
    {
      keywords: ["customer-focused", "customer focused", "customer-centric", "user-focused", "user focused", "client-facing"],
      sentence: "I value customer-focused engineering where technical decisions stay connected to practical user and business needs.",
    },
  ];
  const matched = signals.find((signal) => signal.keywords.some((keyword) => text.includes(normalizedHaystack(keyword))));
  return matched?.sentence || "";
}

function inferSeniority(job) {
  const text = normalizedHaystack(`${job?.title || ""} ${job?.description || ""}`);
  if (/( director | head of | vp | vice president )/i.test(text)) return "director";
  if (/( principal | staff engineer | architect )/i.test(text)) return "principal";
  if (/( lead | team lead | tech lead )/i.test(text)) return "lead";
  if (/( senior | sr\.? )/i.test(text)) return "senior";
  if (/( mid | mid-level | intermediate )/i.test(text)) return "mid";
  if (/( junior | jr\.? | entry level | entry-level | graduate )/i.test(text)) return "junior";
  if (/( intern | internship | trainee )/i.test(text)) return "intern";
  return "mid";
}

function senioritySentence(job) {
  switch (inferSeniority(job)) {
    case "intern":
    case "junior":
      return "At this level, I would emphasize learning quickly, applying my university foundation, and contributing through hands-on development and project work.";
    case "senior":
    case "principal":
      return "For a senior-level role, I would focus on sound architecture, careful technical decisions, scalability, and sharing practical context with teammates without overstating formal leadership experience.";
    case "lead":
      return "For a lead-oriented role, I would contribute through project ownership, clear technical communication, and cross-team collaboration while staying precise about my hands-on engineering background.";
    case "director":
      return "For a director-level context, I can speak to systems thinking, automation opportunities, process improvement, and business impact, while avoiding unsupported claims about people-management experience.";
    case "mid":
    default:
      return "For a mid-level role, I would focus on implementation quality, ownership of assigned work, and reliable delivery against product and engineering requirements.";
  }
}

function buildDynamicCoverLetterParagraphs(focus, job, profileContext) {
  const matchedTerms = getMatchedTechnicalTerms(job, profileContext, focus);
  const project = selectRelevantProject(job, focus, matchedTerms);
  const source = project?.source || (["web", "backend", "go"].includes(focus.key) ? "professional" : ["drone", "cyber"].includes(focus.key) ? "research" : "project");
  const intro = evidenceIntro(source);
  const primary = listTerms(matchedTerms.primary, focus.label);
  const secondary = listTerms(matchedTerms.secondary, focus.key === "web" ? "performance, scalability, deployment, and maintainable delivery" : "reliability, maintainability, and real-world implementation");
  const styleIndex = focus.styleIndex || 0;

  const firstParagraphs = [
    `${intro}, I have worked with ${primary} in contexts that relate directly to the requirements described in this role. I focus on using the technologies that matter for the job rather than listing every tool I know, so my application is centered on the strongest overlap with your description.`,
    `${intro}, the strongest overlap I see is around ${primary}. Those areas match the way I approach engineering work: understand the role's actual requirements, choose the relevant tools, and build systems that remain clear, reliable, and maintainable.`,
    `${intro}, I can connect this role most directly to ${primary}. My focus is on practical implementation, clean architecture, and careful execution around the exact technologies and responsibilities present in the job description.`,
  ];
  const projectClause = project
    ? `A relevant example is ${project.name}, which connects to the role through ${secondary}.`
    : `The responsibilities in the job description connect most closely with my experience around ${secondary}.`;
  const secondParagraphs = [
    `${projectClause} I would bring that same attention to supported requirements, implementation quality, and realistic delivery constraints in this position.`,
    `${projectClause} This gives me a concrete basis for contributing to similar responsibilities without overstating skills that are not part of my profile or not requested in the role.`,
    `${projectClause} It reflects how I move from requirements to working systems while keeping performance, reliability, and maintainability visible throughout the work.`,
  ];

  return {
    value: firstParagraphs[styleIndex % firstParagraphs.length],
    responsibility: `${secondParagraphs[styleIndex % secondParagraphs.length]} ${senioritySentence(job)}`,
    emailLine: listTerms(matchedTerms.primary.slice(0, 3), focus.emailLine),
    project: project?.name || "",
  };
}

function inferApplicationFocus(job, profileContext = {}) {
  const haystack = `${job?.title || ""} ${job?.company || ""} ${job?.description || ""}`.toLowerCase();
  const categories = [
    {
      key: "cyber",
      keywords: ["cyber", "security", "secure", "cryptograph", "post-quantum", "blockchain", "v2x", "owasp", "threat", "zero-knowledge", "zkp", "jwt", "oauth"],
      label: "cybersecurity and secure systems",
      duration: "2 years of focused cybersecurity and secure communications experience",
      value: "This role connects most strongly with my cybersecurity-focused software engineering work, including OWASP-aware application hardening, JWT/OAuth authentication flows, blockchain security concepts, Zero-Knowledge Proofs, and post-quantum cryptography.",
      responsibility: "The responsibilities described in the role closely reflect my experience building systems where security, privacy, resilience, and risk mitigation are fundamental design requirements.",
      emailLine: "cybersecurity-focused software engineering, authentication, OWASP-aware hardening, blockchain security concepts, and secure communication systems",
      project: "Privacy-Preserving Blockchain for Autonomous Vehicles",
    },
    {
      key: "drone",
      keywords: ["drone", "uav", "autonomous", "robot", "robotics", "navigation", "sensor fusion", "vio", "uwb", "tdoa", "ekf", "slam", "ros", "localization"],
      label: "drone, UAV, and robotics systems",
      duration: "more than 1 year of drone, AI, and autonomous systems experience",
      value: "This opportunity aligns with my work in autonomous drone systems, sensor fusion, GPS-denied navigation, VIO, UWB TDOA localization, EKF-based estimation, and real-time engineering using C++, Go, and Python.",
      responsibility: "The position closely reflects my ongoing research and development work in autonomous UAV systems, distributed coordination, localization, and resilient navigation architectures under real-world constraints.",
      emailLine: "autonomous UAV systems, sensor fusion, GPS-denied navigation, VIO, UWB TDOA, EKF-based estimation, and real-time engineering",
      project: "Decentralized Coordination in Secure Autonomous Drone Swarms",
    },
    {
      key: "aiMl",
      keywords: ["ai", "machine learning", "ml", "deep learning", "computer vision", "yolo", "yolov8", "nlp", "model", "data processing", "automation", "neural"],
      label: "AI and machine learning engineering",
      duration: "more than 1 year of applied AI and machine learning experience",
      value: "This role matches my applied AI engineering experience across Python, machine learning, computer vision, YOLOv8-style object detection workflows, data processing, automation, model evaluation, and intelligent decision-support systems.",
      responsibility: "The position closely connects with my experience designing end-to-end AI solutions, integrating models into practical software environments, and turning research ideas into systems that solve real operational problems.",
      emailLine: "Python, AI automation, computer vision, machine learning, data processing, model evaluation, and practical software integration",
      project: "AI Powered Financial App",
    },
    {
      key: "go",
      keywords: ["golang", " go ", "go developer", "go engineer", "concurrency", "distributed", "networking", "backend service", "microservice"],
      label: "Go backend and distributed systems",
      duration: "4 years of web development experience with focused Go systems work",
      value: "This opportunity connects with my Go-based backend development, API-driven platform work, distributed systems research, secure communication architecture, and performance-conscious service design.",
      responsibility: "The role strongly matches my experience building scalable backend services, designing reliable communication workflows, and solving engineering problems where concurrency, efficiency, and maintainability matter.",
      emailLine: "Go-based backend development, APIs, distributed systems, secure communication workflows, and performance-conscious service design",
      project: "Decentralized Coordination in Secure Autonomous Drone Swarms",
    },
    {
      key: "backend",
      keywords: ["backend", "back-end", "api", "rest", "graphql", "node", "laravel", "database", "mysql", "redis", "rbac", "authentication", "server"],
      label: "backend software engineering",
      duration: "4 years of professional backend and full-stack web development experience",
      value: "This role aligns with my backend engineering experience in Laravel, Node.js, Go, REST APIs, GraphQL, authentication, RBAC, relational databases, Redis-aware architecture, and performance optimization.",
      responsibility: "The responsibilities connect with my work designing API-driven systems, securing access flows, optimizing data paths, and keeping backend services reliable, maintainable, and ready for production use.",
      emailLine: "Laravel, Node.js, REST APIs, GraphQL, authentication, RBAC, relational databases, and performance optimization",
      project: "SyncChat - Real-Time Communication Engine",
    },
    {
      key: "web",
      keywords: ["web", "frontend", "front-end", "full-stack", "full stack", "react", "next", "javascript", "typescript", "html", "css", "tailwind", "php", "ecommerce", "e-commerce", "payment", "responsive", "ui"],
      label: "full-stack web development",
      duration: "4 years of professional full-stack web development experience",
      value: "This opportunity fits my full-stack web application experience using Laravel, PHP, Next.js, React, JavaScript, TypeScript, REST APIs, MySQL, authentication, payment integrations, responsive UI, real-time features, and database optimization.",
      responsibility: "The responsibilities outlined in the job description strongly connect with my work on production web platforms, API integrations, real-time communication systems, deployment pipelines, and user-focused interfaces.",
      emailLine: "Laravel, PHP, Next.js, React, JavaScript, TypeScript, REST APIs, MySQL, responsive UI, payment workflows, real-time features, and database optimization",
      project: "Multivendor E-commerce Management Platform",
    },
    {
      key: "embedded",
      keywords: ["embedded", "iot", "microcontroller", "firmware", "hardware", "real-time", "assistive", "raspberry", "arduino", "sensor"],
      label: "embedded, IoT, and real-time systems",
      duration: "more than 1 year of embedded, IoT, AI, and sensor-system experience",
      value: "This opportunity connects with my work in embedded hardware, IoT systems, sensor integration, real-time computation, assistive navigation technology, and practical software deployment.",
      responsibility: "The role reflects my experience translating sensor-driven concepts into working systems where reliability, cost, usability, and deployment constraints all matter.",
      emailLine: "embedded systems, IoT, sensor integration, real-time computation, assistive navigation, and practical deployment",
      project: "Wireless Vision-Aid System for the Blind",
    },
  ];
  const scored = categories
    .map((category) => ({ ...category, score: keywordScore(` ${haystack} `, category.keywords) }))
    .sort((a, b) => b.score - a.score);
  const selected = scored.find((category) => category.score > 0) || {
    key: "general",
    label: "software engineering",
    duration: "4 years of web development, more than 1 year of drone/AI work, and 2 years of cybersecurity-focused experience",
    value: "This opportunity connects with my broader software engineering background across production web development, applied AI, autonomous systems research, secure communications, and maintainable technical delivery.",
    responsibility: "The role reflects the type of engineering work I value most: solving practical problems, building reliable systems, and balancing implementation quality with real-world constraints.",
    emailLine: "production web development, applied AI, secure systems, APIs, and maintainable technical delivery",
    project: "AI Powered Financial App",
  };
  const focus = applyCoverLetterVariant(selected, job);
  return {
    ...focus,
    ...buildDynamicCoverLetterParagraphs(focus, job, profileContext),
  };
}

function mockHumanEmail({ job, profileContext, settings, attachmentState, recruiterName }) {
  const greeting = recruiterName ? `Hello ${recruiterName},` : "Hello,";
  const role = normalizeString(job?.title) || "the role";
  const company = normalizeString(job?.company) || "your team";
  const focus = inferApplicationFocus(job, profileContext);
  const project = focus.project || profileContext?.projects?.[0]?.name || "";
  const attachmentLine = attachmentState?.attachmentsEnabled
    ? "I have attached my CV and cover letter for your review."
    : "I would be happy to share any additional details you need.";

  return [
    greeting,
    "",
    `I am writing to express my interest in the ${role} position at ${company}. After reviewing the job description, I found that the role closely matches my experience in ${focus.emailLine}.`,
    "",
    project
      ? `One relevant project is ${project}, where I worked on practical systems connected to the responsibilities described in the role.`
      : "My previous work includes practical software systems connected to the responsibilities described in the role.",
    "",
    `${attachmentLine} I would welcome the opportunity to discuss how my skills and project experience can contribute to your team.`,
    "",
    "Best regards,",
    "Md Shahanur Islam Shagor",
  ].join("\n");
}

function mockCoverLetter({ job, profileContext }) {
  const focus = inferApplicationFocus(job, profileContext);
  const role = normalizeString(job?.title) || "software engineering";
  const company = normalizeString(job?.company) || "your organization";
  const companyInterest = inferCompanyInterest(job);
  const cultureMatch = inferCompanyCultureMatch(job);
  const opening = [
    `I am writing to express my strong interest in the ${role} role at ${company}. With ${focus.duration}, I bring a combination of production-grade development skill and research-driven engineering judgment.`,
    companyInterest,
    cultureMatch,
  ].filter(Boolean).join("\n\n");
  return [
    opening,
    "",
    focus.value,
    "",
    focus.responsibility,
    "",
    "In addition to my technical experience, I work effectively across multidisciplinary teams and communicate clearly with both technical and non-technical stakeholders. I am fluent in Bengali and English, have working knowledge of Russian and Hindi, and enjoy collaborating in international and cross-cultural environments.",
  ].join("\n");
}

async function callProvider(settings, provider, userMessage, maxTokens, systemPrompt) {
  const keyField = getEncryptedKeyField(provider);
  const encryptedKey = settings?.[keyField];
  if (!encryptedKey) {
    throw new Error(`${provider} API key is not configured.`);
  }

  return generateAssistantResponse({
    provider: providerToServiceName(provider),
    apiKey: decryptText(encryptedKey),
    baseUrl: "",
    modelName: settings.aiModel || getDefaultModel(provider),
    systemPrompt: systemPrompt || getSystemPrompt(settings),
    userMessage,
    temperature: 0.35,
    maxTokens,
  });
}

async function generateWithFallback(settings, userMessage, maxTokens, systemPrompt) {
  const primary = normalizeProvider(settings.aiProvider);
  const attempts = [primary];
  if (settings.fallbackEnabled && settings.fallbackProvider) {
    const fallback = normalizeProvider(settings.fallbackProvider);
    if (!attempts.includes(fallback)) {
      attempts.push(fallback);
    }
  }

  const errors = [];
  for (const provider of attempts) {
    try {
      const text = await callProvider(settings, provider, userMessage, maxTokens, systemPrompt);
      return {
        text,
        provider,
        model: settings.aiModel || getDefaultModel(provider),
        mocked: false,
        errors,
      };
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | ") || "No AI provider could generate content.");
}

async function generateJobAgentContent({ settings, profileContext, job, recruiterContact, mode = "both" }) {
  const prompts = buildFinalPrompts({
    settings,
    profileContext,
    job,
    match: null,
    recruiterContact,
    mode,
  });
  const attachmentState = {
    attachCv: settings.attachCv,
    attachCoverLetterPdf: settings.attachCoverLetterPdf,
    attachmentsEnabled: Boolean(settings.attachCv || settings.attachCoverLetterPdf),
  };
  const payload = {
    instructions: {
      systemPrompt: prompts.systemPrompt,
      recruiterEmailPrompt: prompts.emailPrompt,
      coverLetterPrompt: prompts.coverLetterPrompt,
      matchPrompt: prompts.matchPrompt,
      tone: settings.tone,
      maxEmailWords: settings.maxEmailWords,
      maxCoverLetterWords: settings.maxCoverLetterWords,
      output: "Return strict JSON with emailSubject, emailBody, coverLetterText, score, matchedSkills, missingSkills, summary.",
    },
    safety: [
      "Use only provided portfolio and job context.",
      "Do not invent facts.",
      "Do not scrape or describe LinkedIn page content.",
      "Do not guess recruiter emails.",
    ],
    attachmentState,
    recruiterContact: recruiterContact
      ? {
          name: recruiterContact.name,
          emailVerified: Boolean(recruiterContact.verified),
          source: recruiterContact.source,
        }
      : null,
    profileContext,
    job,
  };

  try {
    const generated = await generateWithFallback(settings, JSON.stringify(payload), 2400, prompts.systemPrompt);
    const parsed = parseAiJson(generated.text);
    return {
      emailSubject: normalizeString(parsed.emailSubject) || `Application for ${job.title}`,
      emailBody: normalizeString(parsed.emailBody),
      coverLetterText: normalizeString(parsed.coverLetterText),
      score: Number.parseInt(parsed.score, 10),
      matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills : [],
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
      summary: normalizeString(parsed.summary),
      provider: generated.provider,
      model: generated.model,
      mocked: false,
      errors: generated.errors,
      systemPromptUsed: prompts.systemPrompt,
      emailPromptUsed: prompts.emailPrompt,
      coverLetterPromptUsed: prompts.coverLetterPrompt,
      matchPromptUsed: prompts.matchPrompt,
    };
  } catch (error) {
    const emailBody = mockHumanEmail({
      job,
      profileContext,
      settings,
      attachmentState,
      recruiterName: recruiterContact?.name || "",
    });
    const coverLetterText = mockCoverLetter({ job, profileContext });
    return {
      emailSubject: `Application for ${job.title}`,
      emailBody,
      coverLetterText,
      score: 50,
      matchedSkills: topSkills(profileContext, job, 4),
      missingSkills: [],
      summary: "Mock-safe content generated because no configured AI provider succeeded.",
      provider: normalizeProvider(settings.aiProvider),
      model: settings.aiModel || getDefaultModel(settings.aiProvider),
      mocked: true,
      errors: [error.message],
      systemPromptUsed: prompts.systemPrompt,
      emailPromptUsed: prompts.emailPrompt,
      coverLetterPromptUsed: prompts.coverLetterPrompt,
      matchPromptUsed: prompts.matchPrompt,
    };
  }
}

module.exports = {
  DEFAULT_COVER_LETTER_PROMPT,
  DEFAULT_RECRUITER_EMAIL_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  buildEncryptedKeyUpdate,
  buildFinalPrompts,
  generateJobAgentContent,
  getJobAgentAiSetting,
  keyConfigured,
  normalizeAiSettingPayload,
  normalizeProvider,
  serializeJobAgentAiSetting,
};
