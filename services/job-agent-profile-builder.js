const prisma = require("../lib/prisma");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (Array.isArray(item)) {
        return item.length > 0;
      }

      return item !== undefined && item !== null && item !== "";
    }),
  );
}

function serializeProfile(profile) {
  if (!profile) {
    return null;
  }

  return compactObject({
    name: profile.name,
    profile: profile.profile,
    designation: profile.designation,
    summary: profile.description,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    github: profile.github,
    linkedIn: profile.linkedIn,
    stackOverflow: profile.stackOverflow,
    leetcode: profile.leetcode,
    devUsername: profile.devUsername,
    resume: profile.resume,
    heroSkills: normalizeArray(profile.heroSkills),
    traits: [
      profile.hardWorker ? "hard worker" : "",
      profile.quickLearner ? "quick learner" : "",
      profile.problemSolver ? "problem solver" : "",
    ].filter(Boolean),
  });
}

function serializeProject(project) {
  return compactObject({
    name: project.name,
    slug: project.slug,
    description: project.description,
    role: project.role,
    tools: normalizeArray(project.tools),
    demo: project.demo,
    code: project.code,
    content: normalizeString(project.content).slice(0, 1200),
  });
}

function serializeExperience(experience) {
  return compactObject({
    title: experience.title,
    company: experience.company,
    location: experience.location,
    duration: experience.duration,
    description: experience.description,
  });
}

function serializeEducation(education) {
  return compactObject({
    title: education.title,
    duration: education.duration,
    institution: education.institution,
    department: education.department,
    achievement: education.achievement,
  });
}

function buildMissingFields(context) {
  const missingFields = [];

  if (!context.summary) missingFields.push("summary");
  if (!context.skills.length) missingFields.push("skills");
  if (!context.education.length) missingFields.push("education");
  if (!context.projects.length) missingFields.push("projects");
  if (!context.experience.length) missingFields.push("experience");

  return missingFields;
}

async function loadDefaultCvProfile() {
  return prisma.cvProfile.findFirst({
    where: { isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
}

async function buildJobAgentProfileContext() {
  const [profile, skills, education, projects, experience, cvProfile] = await Promise.all([
    prisma.profile.findFirst(),
    prisma.skill.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.education.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.project.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: 20,
    }),
    prisma.experience.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    loadDefaultCvProfile(),
  ]);

  const sourceTablesUsed = [];
  if (profile) sourceTablesUsed.push("Profile");
  if (skills.length) sourceTablesUsed.push("Skill");
  if (education.length) sourceTablesUsed.push("Education");
  if (projects.length) sourceTablesUsed.push("Project");
  if (experience.length) sourceTablesUsed.push("Experience");
  if (cvProfile) sourceTablesUsed.push("CvProfile optional notes");

  const context = {
    summary:
      normalizeString(profile?.description) ||
      normalizeString(profile?.designation) ||
      normalizeString(profile?.profile),
    profile: serializeProfile(profile),
    skills: skills.map((skill) => skill.name).filter(Boolean),
    education: education.map(serializeEducation),
    projects: projects.map(serializeProject),
    experience: experience.map(serializeExperience),
    optionalCvProfile: cvProfile
      ? {
          id: cvProfile.id,
          title: cvProfile.title,
          extraNotes: cvProfile.extraNotes,
          targetRoles: normalizeArray(cvProfile.targetRoles),
          preferredCountries: normalizeArray(cvProfile.preferredCountries),
          resumeUrl: cvProfile.resumeUrl,
          resumeFileName: cvProfile.resumeFileName,
          resumeUpdatedAt: cvProfile.resumeUpdatedAt,
        }
      : null,
    sourceTablesUsed,
  };

  return {
    ...context,
    missingFields: buildMissingFields(context),
  };
}

module.exports = {
  buildJobAgentProfileContext,
};
