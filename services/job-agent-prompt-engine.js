function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  return [];
}

function compactLines(lines) {
  return lines.map((line) => normalizeString(line)).filter(Boolean).join("\n");
}

function safeJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

function getCvUrl(profileContext) {
  return normalizeString(profileContext?.optionalCvProfile?.resumeUrl) || normalizeString(profileContext?.profile?.resume);
}

function topProjects(profileContext, limit = 3) {
  return normalizeArray(profileContext?.projects)
    .slice(0, limit)
    .map((project) => ({
      name: project.name,
      description: project.description,
      role: project.role,
      tools: project.tools,
      demo: project.demo,
      code: project.code,
    }));
}

function buildSystemPrompt() {
  return compactLines([
    "You are a safe job application writing agent working for Md Shahanur Islam Shagor.",
    "Write as if Md Shahanur Islam Shagor personally wrote the message: natural, honest, concise, confident, and recruiter-friendly.",
    "Use only the provided portfolio profile, skills, education, projects, experience, CV URL, recruiter context, match context, and job details.",
    "Do not invent employers, degrees, achievements, certifications, skills, project results, job requirements, or recruiter details.",
    "Do not use fake experience. Do not overclaim. Do not mention missing skills negatively.",
    "Avoid generic AI phrases such as 'I am excited to leverage', 'dynamic professional', 'synergy', and 'passionate individual'.",
    "Never use these buzzwords: passionate, dynamic professional, leverage, synergy, fast-paced environment, cutting-edge, world-class, best-in-class, highly motivated.",
    "Keep paragraphs short and easy to scan.",
    "Never include API keys, OAuth tokens, SMTP passwords, encrypted secrets, or internal server paths.",
  ]);
}

function buildContextBlock({ profileContext, job, match, recruiter, settings }) {
  return safeJson({
    applicant: {
      name: profileContext?.profile?.name || "Md Shahanur Islam Shagor",
      designation: profileContext?.profile?.designation,
      summary: profileContext?.summary,
      email: profileContext?.profile?.email,
      portfolio: profileContext?.profile?.devUsername || profileContext?.profile?.github || profileContext?.profile?.linkedIn,
      cvUrl: getCvUrl(profileContext),
      skills: normalizeArray(profileContext?.skills),
      education: normalizeArray(profileContext?.education),
      experience: normalizeArray(profileContext?.experience),
      strongestProjects: topProjects(profileContext),
      optionalNotes: profileContext?.optionalCvProfile?.extraNotes,
      sourceTablesUsed: profileContext?.sourceTablesUsed,
    },
    job: {
      title: job?.title,
      company: job?.company,
      location: job?.location,
      description: job?.description,
      sourceUrl: job?.sourceUrl,
    },
    recruiter: recruiter
      ? {
          name: recruiter.name,
          email: recruiter.email,
          company: recruiter.company || job?.company,
          verified: Boolean(recruiter.verified),
          source: recruiter.source,
        }
      : null,
    match: match
      ? {
          score: match.score,
          matchedSkills: normalizeArray(match.matchedSkills),
          missingSkills: normalizeArray(match.missingSkills),
          summary: match.summary,
        }
      : null,
    settings: {
      tone: settings?.tone || "professional-natural",
      maxEmailWords: settings?.maxEmailWords || 160,
      maxCoverLetterWords: settings?.maxCoverLetterWords || 450,
      attachCv: settings?.attachCv !== false,
      attachCoverLetterPdf: settings?.attachCoverLetterPdf !== false,
    },
  });
}

function buildRecruiterEmailPrompt({ profileContext, job, match, recruiter, settings }) {
  const maxEmailWords = settings?.maxEmailWords || 160;
  const emailWordRule = maxEmailWords < 140
    ? `Email body should be 90-${maxEmailWords} words.`
    : `Email body should be 90-140 words and never exceed ${maxEmailWords} words.`;

  return compactLines([
    "Task: Create a highly customized professional job application email.",
    "Return strict JSON only: {\"emailSubject\":\"...\",\"emailBody\":\"...\"}.",
    "Read the complete job description before writing. Identify job title, company, required skills, preferred skills, responsibilities, domain, seniority, work type, tools, and soft skills.",
    "Compare the job description with the candidate profile in the context. Mention only matching skills, responsibilities, and projects that are supported by the profile.",
    "Do not mention missing skills in the final email.",
    "Select the strongest single positioning based on the job type. Web: Laravel, Next.js, React, JavaScript, HTML, CSS, Tailwind CSS, REST APIs, MySQL, responsive UI, web application development. Backend: Laravel, Node.js, REST APIs, GraphQL, MySQL, PostgreSQL, Redis, authentication, RBAC, API development. Frontend: React, Next.js, JavaScript, TypeScript, HTML, CSS, Tailwind CSS, Bootstrap, responsive UI, SEO-friendly interfaces. Full-stack: Laravel, Next.js, Node.js, React, REST APIs, MySQL, authentication, payment gateway integration, deployment, full application delivery. AI automation: Python, AI-based projects, automation, computer vision, workflow systems, API integration, practical software engineering. Go: use Go only when the job mentions Go, backend systems, decentralized systems, mesh networking, APIs, or high-concurrency systems. DevOps/server: Linux, Docker, Nginx, Apache, CI/CD, AWS, Google Cloud, deployment, monitoring, server maintenance.",
    "Subject format: Application for {jobTitle}.",
    emailWordRule,
    "Greeting format: Hello {Company Name or Hiring Team}. Use recruiter name only if provided.",
    "First sentence: I am writing to express my interest in the {Job Title} position at {Company Name}.",
    "Second paragraph should mention the strongest matched skill group and specific supported responsibilities from the job description.",
    "Add one concise paragraph about previous Web Developer work only when it is relevant to the selected positioning.",
    "Mention one relevant project from the provided profile if it clearly relates to the job. Do not invent project names.",
    "Mention education briefly only if space allows.",
    "If attachments are enabled, include this exact sentence: I've attached my CV and cover letter for your review.",
    "Sound confident, polite, and human.",
    "No emojis.",
    "No markdown tables.",
    "Do not mention missing skills, weak fit, uncertainty, or anything negative.",
    "Avoid generic AI phrases: I am excited to leverage; dynamic professional; synergy; passionate individual; fast-paced environment.",
    "Final quality check before output: every mentioned skill exists in the profile, every mentioned project exists in the profile, every claim is supported, no fake company information is added, and the email is tailored to the job.",
    "Context:",
    buildContextBlock({ profileContext, job, match, recruiter, settings }),
  ]);
}

function buildCoverLetterPrompt({ profileContext, job, match, settings }) {
  return compactLines([
    "Task: Write a customized cover letter for this job.",
    "Return strict JSON only: {\"coverLetterText\":\"...\"}.",
    "Generate only the body paragraphs for a PDF cover letter. Do not include applicant header, contact details, date, greeting line, signature, or footer because the PDF renderer adds those automatically.",
    "Use 4-5 polished paragraphs in the style of a senior, research-capable engineer.",
    "Opening should mention the role/company and direct interest.",
    "Select ONLY ONE role category with the highest match from the job title and description. Do not combine web, drone, AI, cyber, backend, and Go into one generic paragraph.",
    "Never start the important technical paragraphs with: My background aligns with this opportunity; I am excited to apply; I believe I am a strong fit.",
    "Never reuse the same middle paragraphs across different job categories.",
    "Never reuse previously generated role paragraphs. Generate fresh wording for every application even when the role category remains the same.",
    "Before writing, identify the company industry, product/service, mission, customers, and technical domain from the job description. If sufficient information exists, add one concrete sentence explaining why the company/product/domain is interesting. If company information is unavailable, skip this section completely. Do not invent company information.",
    "If the job description explicitly emphasizes startup, fast-growing company, research-driven company, enterprise environment, remote-first culture, or customer-focused culture, add one sentence connecting the applicant's working style to that environment. Skip completely if culture is unclear. Never invent culture information.",
    "Determine seniority from the job description: Intern, Junior, Mid-Level, Senior, Lead, Principal, or Director. Adjust tone accordingly.",
    "Intern/Junior: emphasize learning ability, education, projects, and hands-on development.",
    "Mid-Level: emphasize implementation, ownership, and delivery.",
    "Senior: emphasize architecture, technical decisions, practical mentoring/context sharing, and scalability.",
    "Lead: emphasize cross-team collaboration, project ownership, and technical leadership only if supported by the profile.",
    "Principal/Director: emphasize systems thinking, strategy, automation, process improvement, and business impact only where supported by the profile.",
    "Never claim leadership experience unless supported by the profile. Never claim management experience unless supported by the profile.",
    "Before writing, identify technologies, tools, responsibilities, and domain keywords explicitly mentioned in the job description.",
    "Inside the selected role category, prioritize only skills that appear in BOTH the job description and the candidate profile.",
    "Do not automatically mention all skills from the selected category. Maximum technical mentions: 4 primary technologies and 3 secondary technologies.",
    "If a skill exists in the candidate profile but is not relevant to the job description, do not mention it. If a skill exists in the job description but is not present in the candidate profile, do not mention it.",
    "Select one project dynamically by ranking overlap with job-description technologies, responsibilities, domain, and selected role category. Do not use a fixed project for a category. Do not force a project if no project clearly matches.",
    "Before writing technical paragraphs, determine the evidence source: professional experience, research work, academic work, or project work. Use accurate wording: 'In my professional experience...' for professional evidence; 'Through research and development work...' for research evidence; 'Through hands-on project development...' for academic/personal project evidence.",
    "Never present research work as professional industry experience. Never present academic or personal projects as paid professional experience.",
    "Use accurate experience duration by selected category. Web/full-stack/backend roles: 4 years of professional web/full-stack development experience. Drone/UAV/robotics roles: more than 1 year of drone, AI, and autonomous systems experience. AI/machine learning roles: more than 1 year of applied AI and machine learning experience. Cybersecurity roles: 2 years of cybersecurity and secure communications experience. General roles: mention the split naturally instead of saying four years across every domain.",
    "WEB/FULL-STACK category: emphasize Laravel, PHP, Next.js, React, JavaScript, TypeScript, HTML, CSS, Tailwind CSS, REST APIs, MySQL, authentication, payment integration, responsive UI, real-time features, and database optimization.",
    "BACKEND category: emphasize Laravel, Node.js, Go, APIs, authentication, RBAC, databases, Redis-aware architecture, GraphQL, and performance optimization.",
    "GO category: emphasize Go, high-concurrency systems, APIs, distributed systems, backend services, networking, secure communication workflows, and performance.",
    "AI/MACHINE LEARNING category: emphasize Python, AI engineering, computer vision, YOLOv8-style object detection, machine learning, deep learning, NLP fundamentals, data processing, automation, model evaluation, and production integration.",
    "CYBERSECURITY category: emphasize cybersecurity, OWASP, JWT, OAuth, blockchain, Zero-Knowledge Proofs, post-quantum cryptography, secure systems, privacy, resilience, and risk mitigation.",
    "DRONE/UAV/ROBOTICS category: emphasize UAV systems, autonomous navigation, sensor fusion, EKF, VIO, UWB TDOA, ROS, C++, Go, Python, localization, distributed coordination, and resilient navigation architectures.",
    "Middle paragraphs must be role-specific: first technical paragraph should explain why the selected category fits; second technical paragraph should connect the job responsibilities to matching experience from only that selected category.",
    "The two technical paragraphs are the most important part of the cover letter. Paragraph 1 should describe selected-category technical positioning. Paragraph 2 should connect selected-category responsibilities to APIs/UI/performance/scalability/database/deployment for web; architecture/APIs/security/reliability for backend; distributed systems/performance for Go; real-world deployment and automation impact for AI/ML; privacy/resilience/risk mitigation for cybersecurity; or localization/coordination/navigation/deployment for drone/UAV/robotics.",
    "After the technical section, add this communication paragraph adapted naturally: In addition to my technical experience, I work effectively across multidisciplinary teams and communicate clearly with both technical and non-technical stakeholders. I am fluent in Bengali and English, have working knowledge of Russian and Hindi, and enjoy collaborating in international and cross-cultural environments.",
    "Closing should be polite and mention the attached CV if available.",
    "Keep it recruiter-friendly and ATS-friendly.",
    `Keep it under ${settings?.maxCoverLetterWords || 450} words.`,
    "Prefer natural human wording.",
    "Vary sentence structure. Do not start every paragraph with 'I have', 'My experience', or 'This role'. Mix natural starts such as 'Through...', 'In previous work...', 'One area that particularly interests me...', 'A relevant example is...', and 'What stands out to me...'.",
    "No markdown.",
    "Use plain text paragraphs separated by blank lines.",
    "No fake achievements.",
    "Do not invent facts. Do not exaggerate. Do not mention missing skills negatively.",
    "Avoid generic filler and AI-style language.",
    "Never use these buzzwords: passionate, dynamic professional, leverage, synergy, fast-paced environment, cutting-edge, world-class, best-in-class, highly motivated.",
    "Context:",
    buildContextBlock({ profileContext, job, match, recruiter: null, settings }),
  ]);
}

function buildMatchPrompt({ profileContext, job, settings }) {
  return compactLines([
    "Task: Analyze how well the applicant matches this job.",
    "Return strict JSON only: {\"score\":0,\"matchedSkills\":[],\"missingSkills\":[],\"summary\":\"...\"}.",
    "Score should be 0-100 based only on provided profile and job context.",
    "Matched skills must come from the portfolio/profile context.",
    "Missing skills should be factual and concise, but do not frame them negatively.",
    "Do not invent skills or experience.",
    "Context:",
    buildContextBlock({ profileContext, job, match: null, recruiter: null, settings }),
  ]);
}

module.exports = {
  buildCoverLetterPrompt,
  buildMatchPrompt,
  buildRecruiterEmailPrompt,
  buildSystemPrompt,
};
