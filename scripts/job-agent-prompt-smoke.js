require("../lib/config");

const prisma = require("../lib/prisma");
const { buildJobAgentProfileContext } = require("../services/job-agent-profile-builder");
const {
  buildCoverLetterPrompt,
  buildMatchPrompt,
  buildRecruiterEmailPrompt,
  buildSystemPrompt,
} = require("../services/job-agent-prompt-engine");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const profileContext = await buildJobAgentProfileContext();
  const job = {
    title: "Frontend Engineer",
    company: "Prompt Smoke Company",
    location: "Remote",
    description: "React, Next.js, Node.js, API dashboard role.",
    sourceUrl: "https://example.com/job",
  };
  const settings = {
    tone: "professional-natural",
    maxEmailWords: 160,
    maxCoverLetterWords: 450,
    attachCv: true,
    attachCoverLetterPdf: true,
  };
  const match = {
    score: 72,
    matchedSkills: ["React", "Next.js"],
    missingSkills: ["Kubernetes"],
    summary: "Strong frontend and API dashboard overlap.",
  };
  const recruiter = {
    name: "Hiring Team",
    email: "recruiter@example.com",
    company: job.company,
    verified: true,
    source: "manual",
  };

  const prompts = [
    buildSystemPrompt(),
    buildRecruiterEmailPrompt({ profileContext, job, match, recruiter, settings }),
    buildCoverLetterPrompt({ profileContext, job, match, settings }),
    buildMatchPrompt({ profileContext, job, settings }),
  ];
  const joined = prompts.join("\n");

  assert(joined.includes("Md Shahanur Islam Shagor"), "Prompt missing applicant identity.");
  assert(joined.includes(job.title), "Prompt missing job title.");
  assert(joined.includes(job.company), "Prompt missing company.");
  assert(joined.includes("React"), "Prompt missing profile/job skill context.");
  assert(joined.includes("Do not invent"), "Prompt missing anti-fabrication rule.");
  assert(joined.toLowerCase().includes("cover letter"), "Prompt missing cover letter context.");
  assert(joined.includes("Hello"), "Prompt missing fallback greeting rule.");
  assert(joined.includes("90-140 words") || joined.includes("90–140 words"), "Prompt missing recruiter email word range.");
  assert(joined.includes("No markdown"), "Prompt missing no-markdown rule.");
  assert(joined.includes("No markdown tables"), "Prompt missing no-markdown-tables rule.");
  assert(joined.includes("Do not mention missing skills"), "Prompt missing missing-skills exclusion rule.");
  assert(joined.includes("Select ONLY ONE role category"), "Prompt missing role-category selection rule.");
  assert(joined.includes("No emojis"), "Prompt missing no-emojis rule.");
  assert(joined.includes("Application for"), "Prompt missing subject format.");
  assert(
    joined.includes("I've attached my CV and cover letter") || joined.includes("I’ve attached my CV and cover letter"),
    "Prompt missing attachment sentence.",
  );
  assert(!/sk-[A-Za-z0-9_-]{12,}/.test(joined), "Prompt includes an OpenAI-like raw key.");
  assert(!/[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]{32,}/i.test(joined), "Prompt includes encrypted secret material.");
  assert(!/ya29\.[A-Za-z0-9_-]+/.test(joined), "Prompt includes an OAuth-like token.");

  const previous = await prisma.jobAgentAiSetting.findUnique({ where: { id: 1 } });
  let createdForSmoke = false;

  if (!previous) {
    await prisma.jobAgentAiSetting.create({
      data: {
        id: 1,
        aiProvider: "DEEPSEEK",
        aiModel: "deepseek-chat",
        systemPrompt: "",
        recruiterEmailPrompt: "",
        coverLetterPrompt: "",
      },
    });
    createdForSmoke = true;
  }

  await prisma.jobAgentAiSetting.update({
    where: { id: 1 },
    data: {
      systemPrompt: "",
      recruiterEmailPrompt: "",
      coverLetterPrompt: "",
    },
  });

  const emptyPromptSetting = await prisma.jobAgentAiSetting.findUnique({ where: { id: 1 } });
  assert(emptyPromptSetting, "AI setting missing after empty prompt update.");

  if (previous) {
    await prisma.jobAgentAiSetting.update({
      where: { id: 1 },
      data: {
        systemPrompt: previous.systemPrompt,
        recruiterEmailPrompt: previous.recruiterEmailPrompt,
        coverLetterPrompt: previous.coverLetterPrompt,
      },
    });
  } else if (createdForSmoke) {
    await prisma.jobAgentAiSetting.delete({ where: { id: 1 } });
  }

  console.log("Job Agent prompt smoke checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
