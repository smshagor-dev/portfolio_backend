const prisma = require("../lib/prisma");
const { buildAssistantContext } = require("../lib/assistant-context");
const { decryptText } = require("../utils/encryption");
const { generateAssistantResponse } = require("./ai");

function normalizeString(value) {
  return String(value || "").trim();
}

function detectMessageLanguage(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "english";
  }

  if (/[\u0980-\u09FF]/.test(normalized)) {
    return "bangla";
  }

  const lowered = normalized.toLowerCase();
  if (
    /\b(ami|amar|apni|tumi|ki|kemon|lagbe|dorkar|chai|asen|ase|hobe|koren|korbo|bolo|bolen|link|cv)\b/.test(lowered)
  ) {
    return "banglish";
  }

  return "english";
}

function cleanAssistantReply(value) {
  const normalized = String(value || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\r\n/g, "\n")
    .trim();

  return normalized;
}

function isGreetingMessage(value) {
  const normalized = normalizeString(value).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return [
    "hi",
    "hello",
    "hey",
    "assalamu alaikum",
    "as salamualaikum",
    "salam",
    "good morning",
    "good afternoon",
    "good evening",
  ].includes(normalized);
}

function getFallbackReply(language) {
  if (language === "bangla") {
    return "মেসেজের জন্য ধন্যবাদ। এই মুহূর্তে পুরো বিষয়টি নিশ্চিত করতে পারছি না, তবে Shagor মেসেজটি দেখে personally reply করবে।";
  }

  if (language === "banglish") {
    return "Message er jonno thanks. Ekhon full details confirm korte parchi na, but Shagor message ta review kore personally reply dibe.";
  }

  return "Thanks for reaching out. I can't confirm the full details from here right now, but Shagor will review your message and reply personally.";
}

function getCollaborationReply(language) {
  if (language === "bangla") {
    return "মেসেজের জন্য ধন্যবাদ। GPS-denied autonomy, drone navigation, AI, cybersecurity এবং advanced software systems নিয়ে কাজ করা মানুষের সাথে connect করতে সবসময় ভালো লাগে। মনে হচ্ছে আমাদের কাজের দিকটা অনেকটা similar. Idea sharing বা possible collaboration নিয়ে আরও কথা বলা যেতে পারে।";
  }

  if (language === "banglish") {
    return "Message tar jonno thanks. GPS-denied autonomy, drone navigation, AI, cybersecurity, ba advanced software systems niye kaj kora people der sathe connect korte always bhalo lage. Mone hocche amader interest onek similar. Idea share ba possible collaboration niye further kotha bola jete pare.";
  }

  return "Really appreciate the message. It's always great connecting with people working on advanced software systems, autonomous technologies, AI, cybersecurity, and GPS-denied navigation research. Sounds like we share similar interests around resilient autonomous systems and real-world engineering challenges. I'd definitely be interested in connecting and exchanging ideas further.";
}

function normalizeIntentText(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF.+#/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countPhraseMatches(value, phrases) {
  return phrases.reduce((count, phrase) => {
    return value.includes(phrase) ? count + 1 : count;
  }, 0);
}

function isCollaborationMessage(value) {
  const normalized = normalizeIntentText(value);
  if (!normalized) {
    return false;
  }

  const strongSignals = [
    "research collaboration",
    "possible collaboration",
    "collaboration",
    "collaborate",
    "work together",
    "team up",
    "partnership",
    "partner with",
    "cofounder",
    "founder looking",
    "startup founder",
    "would love to connect",
    "love to connect",
    "lets connect",
    "let s connect",
    "connect and exchange ideas",
    "project discussion",
    "research discussion",
    "discuss collaboration",
    "discuss research",
    "idea sharing",
    "share ideas",
    "networking",
    "communication request",
    "interested in your work",
    "interested in your research",
    "interested in your portfolio",
    "like your work",
    "love your work",
    "impressive work",
    "your work caught my attention",
    "caught my attention",
  ];

  const hiringSignals = [
    "hire you",
    "can i hire you",
    "want to hire you",
    "hiring",
    "hire for",
    "recruit",
    "recruiting",
    "job opportunity",
    "join our team",
    "contract role",
    "freelance project",
    "consulting project",
  ];

  const positiveSignals = [
    "impressive",
    "great work",
    "amazing work",
    "your portfolio",
    "your project",
    "your research",
    "connect",
    "discussion",
    "discuss",
    "exchange ideas",
    "similar interests",
    "shared interest",
    "same field",
    "same research",
  ];

  const domainSignals = [
    "startup",
    "founder",
    "gps denied",
    "gps-denied",
    "gps free",
    "gps-free",
    "gps denied navigation",
    "gps free drone navigation",
    "drone navigation",
    "uav",
    "drone",
    "swarm",
    "robotics",
    "autonomous systems",
    "autonomous system",
    "autonomy",
    "autonomous technology",
    "ai",
    "artificial intelligence",
    "computer vision",
    "cybersecurity",
    "v2x",
    "blockchain",
    "post quantum",
    "post-quantum",
    "research",
    "web development",
    "full stack",
    "full-stack",
    "laravel",
    "next.js",
    "node.js",
    "react",
  ];

  if (countPhraseMatches(normalized, hiringSignals) > 0) {
    return true;
  }

  if (countPhraseMatches(normalized, strongSignals) > 0) {
    return true;
  }

  const domainMatchCount = countPhraseMatches(normalized, domainSignals);
  if (domainMatchCount >= 2) {
    return true;
  }

  return countPhraseMatches(normalized, positiveSignals) > 0 && domainMatchCount >= 1;
}

function isEmergencyContactMessage(value) {
  const normalized = normalizeIntentText(value);
  if (!normalized) {
    return false;
  }

  const strongEmergencySignals = [
    "emergency",
    "urgent",
    "asap",
    "immediate",
    "need to reach",
    "contact now",
    "call me urgently",
    "জরুরি",
  ];

  const contactSignals = [
    "phone",
    "whatsapp",
    "email",
    "contact number",
    "direct contact",
    "যোগাযোগ",
    "ফোন",
    "ইমেইল",
    "হোয়াটসঅ্যাপ",
  ];

  return (
    countPhraseMatches(normalized, strongEmergencySignals) > 0 ||
    (
      countPhraseMatches(normalized, contactSignals) > 0 &&
      (
        normalized.includes("urgent") ||
        normalized.includes("emergency") ||
        normalized.includes("asap") ||
        normalized.includes("immediate") ||
        normalized.includes("জরুরি")
      )
    )
  );
}

function cleanExtractedValue(value) {
  return normalizeString(value).replace(/[",]+$/g, "").trim();
}

function createSetFromValues(values) {
  return Array.from(new Set((values || []).map(cleanExtractedValue).filter(Boolean)));
}

function extractContactDetails(contextText) {
  const details = {
    emails: [],
    phones: [],
    websites: [],
    whatsapp: [],
  };

  const safeText = String(contextText || "");
  let parsedContext = null;

  try {
    parsedContext = JSON.parse(safeText);
  } catch (_error) {
    parsedContext = null;
  }

  if (parsedContext && typeof parsedContext === "object") {
    const profile = parsedContext?.context?.profile || {};
    const contactInfo = parsedContext?.context?.contact_info || {};
    const relevantProfile = parsedContext?.relevant_matches?.profile?.fields || {};
    const emergencyContacts = Array.isArray(contactInfo?.emergencyContacts) ? contactInfo.emergencyContacts : [];

    details.emails.push(profile.email, contactInfo.contactEmail, relevantProfile.email);
    details.phones.push(profile.phone, contactInfo.mobileNumber, relevantProfile.phone);
    details.websites.push(contactInfo.canonicalUrl, profile.resume);

    for (const item of emergencyContacts) {
      const labelText = normalizeIntentText(`${item?.label || ""} ${item?.name || ""} ${item?.icon || ""}`);
      if (labelText.includes("whatsapp")) {
        details.whatsapp.push(item?.link, item?.name);
      }

      if (labelText.includes("phone") || labelText.includes("call") || labelText.includes("mobile")) {
        details.phones.push(item?.link, item?.name);
      }

      if (labelText.includes("email")) {
        details.emails.push(item?.link, item?.name);
      }

      if (labelText.includes("website") || labelText.includes("contact")) {
        details.websites.push(item?.link);
      }
    }
  }

  const emailMatches = safeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const urlMatches = safeText.match(/https?:\/\/[^\s"']+/gi) || [];
  const phoneMatches = safeText.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const whatsappLines = safeText.match(/[^\n]*whatsapp[^\n]*/gi) || [];
  const whatsappMatches = [];

  for (const line of whatsappLines) {
    whatsappMatches.push(...(line.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []));
    whatsappMatches.push(...(line.match(/https?:\/\/[^\s"']+/gi) || []));
  }

  details.emails.push(...emailMatches);
  details.phones.push(...phoneMatches);
  details.websites.push(...urlMatches.filter((item) => !/mailto:|tel:/i.test(item)));
  details.whatsapp.push(...whatsappMatches);

  details.emails = createSetFromValues(details.emails);
  details.phones = createSetFromValues(details.phones).filter((item) => /\d/.test(item));
  details.websites = createSetFromValues(details.websites);
  details.whatsapp = createSetFromValues(details.whatsapp);

  return details;
}

function buildEmergencyContactReply(contextText, language) {
  const details = extractContactDetails(contextText);
  const phone = details.phones[0] || "";
  const whatsapp = details.whatsapp[0] || phone || "";
  const email = details.emails[0] || "";
  const website = details.websites.find((item) => /^https?:\/\//i.test(item)) || "";

  if (!phone && !whatsapp && !email && !website) {
    return "";
  }

  const lines = [];

  if (language === "bangla") {
    lines.push("সরাসরি যোগাযোগ করতে পারেন:");
    if (phone) {
      lines.push(`Phone: ${phone}`);
    }
    if (whatsapp) {
      lines.push(`WhatsApp: ${whatsapp}`);
    }
    if (email) {
      lines.push(`Email: ${email}`);
    }
    if (website) {
      lines.push(`Website: ${website}`);
    }
    lines.push("");
    lines.push("জরুরি project বা collaboration হলে ছোট করে requirement পাঠালে clear ভাবে reply করা যাবে।");
    return lines.join("\n");
  }

  if (language === "banglish") {
    lines.push("Direct contact korte paren:");
    if (phone) {
      lines.push(`Phone: ${phone}`);
    }
    if (whatsapp) {
      lines.push(`WhatsApp: ${whatsapp}`);
    }
    if (email) {
      lines.push(`Email: ${email}`);
    }
    if (website) {
      lines.push(`Website: ${website}`);
    }
    lines.push("");
    lines.push("Urgent project ba collaboration hole short summary pathale ami clearly reply dite parbo.");
    return lines.join("\n");
  }

  lines.push("You can contact me directly here:");
  if (phone) {
    lines.push(`Phone: ${phone}`);
  }
  if (whatsapp) {
    lines.push(`WhatsApp: ${whatsapp}`);
  }
  if (email) {
    lines.push(`Email: ${email}`);
  }
  if (website) {
    lines.push(`Website: ${website}`);
  }
  lines.push("");
  lines.push("For urgent project or collaboration messages, please share a short summary of what you need so I can respond clearly.");
  return lines.join("\n");
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

async function generatePortfolioAssistantReply(message) {
  const normalizedMessage = normalizeString(message);
  const detectedLanguage = detectMessageLanguage(normalizedMessage);
  const normalizedIntentMessage = normalizeIntentText(normalizedMessage);

  if (!normalizedMessage) {
    return "";
  }

  if (isGreetingMessage(normalizedMessage)) {
    if (detectedLanguage === "bangla") {
      return "হ্যালো! আমার services, projects, skills, experience, pricing, FAQs বা contact details নিয়ে জানতে চাইলে বলুন।";
    }

    if (detectedLanguage === "banglish") {
      return "Hello! Amar services, projects, skills, experience, pricing, FAQs, ba contact details niye jante chaile bolen.";
    }

    return "Hello! Feel free to ask me about my services, projects, skills, experience, pricing, FAQs, or contact details.";
  }

  const settings = await prisma.aiSettings.findUnique({
    where: { id: 1 },
  });

  if (!settings?.activeProvider || !settings?.modelName) {
    return getFallbackReply(detectedLanguage);
  }

  const providerRecord = await prisma.aiProvider.findFirst({
    where: {
      name: settings.activeProvider,
      isActive: true,
    },
  });

  if (!providerRecord?.apiKey) {
    return getFallbackReply(detectedLanguage);
  }

  const apiKey = decryptText(providerRecord.apiKey);
  if (!apiKey) {
    return getFallbackReply(detectedLanguage);
  }

  const { contextText, hasRelevantMatches } = await buildAssistantContext(normalizedMessage);

  if (isEmergencyContactMessage(normalizedMessage)) {
    const contactReply = buildEmergencyContactReply(contextText, detectedLanguage);
    if (contactReply) {
      return contactReply;
    }

    return getFallbackReply(detectedLanguage);
  }

  const isHiringIntent = countPhraseMatches(
    normalizedIntentMessage,
    [
      "hire you",
      "can i hire you",
      "want to hire you",
      "hiring",
      "hire for",
      "freelance project",
      "contract role",
      "need developer",
      "need engineer",
      "backend support",
      "full stack developer",
      "full-stack developer",
      "laravel developer",
      "next.js developer",
      "react developer",
    ],
  ) > 0;

  if (isCollaborationMessage(normalizedMessage) && !hasRelevantMatches && !isHiringIntent) {
    return getCollaborationReply(detectedLanguage);
  }

  const systemPrompt = [
    "You write replies for Shagor's portfolio chat.",
    "Answer only from provided database context.",
    "Never generate fake info.",
    "Write as if Shagor himself is replying in first person when appropriate, using natural and human language.",
    "Do not mention being an AI support bot, virtual assistant, or automated system.",
    "Do not say 'according to the portfolio', 'based on the provided context', or similar robotic phrases.",
    "Avoid sounding scripted, overly formal, or generic.",
    "Keep answers concise, accurate, warm, confident, and realistic.",
    "Use a conversational tone, like a real person replying to a website message.",
    "Sound helpful and approachable, but not salesy or exaggerated.",
    "Answer the visitor's main question first before adding extra detail.",
    "Prefer 1 short paragraph for simple questions and 2 short paragraphs for slightly bigger answers.",
    "For very short or simple questions, keep the reply very short and direct.",
    "Only use a list when the visitor asks for multiple items, links, contact methods, features, or comparisons.",
    "Do not over-explain.",
    "Do not repeat the same point in different words.",
    "If the visitor asks about services, work style, experience, skills, pricing, or contact details, answer directly and naturally.",
    "If the visitor asks for a CV or resume link and profile.resume exists in the context, share that exact link directly.",
    "If the context contains links, emails, phone numbers, uploaded files, or social profiles, share the exact values from the context without changing them.",
    "Be proactive and helpful.",
    "If the visitor wants to discuss a project, service, collaboration, bug, issue, or technical problem, gather the most relevant details from the available context on your own before replying.",
    "If the visitor message sounds like networking, collaboration, startup discussion, hiring, or research discussion, respond naturally and positively before refusing or falling back.",
    "When possible, connect the visitor's request with relevant services, skills, project experience, pricing, FAQ answers, and contact information from the context.",
    "Try to be solution-oriented instead of giving a minimal answer.",
    "If the visitor describes an issue or problem, respond with the most useful relevant information available in the context and suggest a practical next step when appropriate.",
    "If the visitor is asking about a project, try to cover the most relevant scope, experience, tools, and possible direction using only the context.",
    "Do as much as possible from the available context before asking for more information.",
    "Only ask for more details when they are truly needed to continue helpfully.",
    "If the visitor asks about price, package, duration, features, or deliverables, use only the matching pricing data from the context.",
    "Do not promise availability, deadlines, discounts, meetings, delivery dates, or custom offers unless they are clearly present in the context.",
    "If the visitor asks something broad like 'what do you do' or 'tell me about yourself', give a short natural summary from the profile, services, and experience context.",
    "If the visitor asks whether Shagor can help with a project, answer positively only when the relevant skills, services, or project experience exist in the context.",
    "If the visitor asks for contact details, share the most relevant options directly and keep the formatting clean.",
    "If the visitor asks for social links, portfolio links, or website links, provide the direct links from context.",
    "If the visitor seems interested in working together, hiring, or discussing a project, end with a short natural invitation to share project details or requirements.",
    "Reply in the same language the visitor uses whenever possible.",
    "If the visitor writes in Bangla, reply in Bangla. If the visitor writes in English, reply in English. If the visitor uses Banglish, reply in natural Banglish.",
    "Match the visitor's tone loosely: professional if they sound professional, casual if they sound casual, while staying respectful.",
    "Do not switch languages unless the visitor already mixed languages.",
    "If information is limited, respond naturally with the most helpful available details first before suggesting that Shagor can continue the conversation personally if needed.",
    "When you do not know something, say it simply and clearly instead of guessing.",
    "Do not refuse too early if some helpful answer can still be given from the context.",
    "Prefer short paragraphs over long explanations.",
    "If a name is needed, use 'Shagor'.",
    "Use plain text only, not Markdown.",
    "Do not use bold markers like ** or __.",
    "When listing contact details or multiple items, put each item on a new line so the formatting stays clean in chat.",
    "Do not add greetings or sign-offs in every message unless they feel natural for the conversation.",
    "Do not include labels like 'Answer:' or 'Response:'.",
    hasRelevantMatches
      ? "Relevant context matches were found for this message. Prioritize the relevant_matches section first and keep the reply focused on those matched items."
      : "There may not be strong keyword matches for this message, but you should still try to answer helpfully from the available portfolio context before saying you cannot confirm something.",
    "",
    "Portfolio context:",
    contextText,
  ].join("\n");

  const normalizedModelName = normalizeAiModelName(providerRecord.name, settings.modelName);

  try {
    const reply = await generateAssistantResponse({
      provider: providerRecord.name,
      apiKey,
      baseUrl: providerRecord.baseUrl || "",
      modelName: normalizedModelName,
      systemPrompt,
      userMessage: normalizedMessage,
    });

    const cleanedReply = cleanAssistantReply(reply);
    return cleanedReply || getFallbackReply(detectedLanguage);
  } catch (error) {
    console.error("Portfolio assistant reply failed:", error.message);
    return getFallbackReply(detectedLanguage);
  }
}

module.exports = {
  generatePortfolioAssistantReply,
};
