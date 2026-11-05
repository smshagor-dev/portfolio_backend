// Shared validation for the founder-led product editor.
// The JSON is stored in the existing SiteSettings MongoDB document.
const text = (value, max = 20000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const urlOk = (url, image = false) => {
  if (!url) return true;
  if (image && /^\/(?:uploads|founder)\/[a-zA-Z0-9_./-]+$/.test(url) && !url.includes("..")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
};
function strings(value, max = 60) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some((v) => typeof v !== "string" || v.length > 10000)) {
    throw new Error("Text list must contain at most 60 text values.");
  }
  return value.map((v) => text(v, 10000));
}
function objects(value, keys, max = 30) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error("Too many content blocks.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Content blocks must be objects.");
    return Object.fromEntries(keys.map((key) => [key, text(item[key])]));
  });
}
function normalizeFounderProject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid founder project.");
  const slug = text(input.slug, 121);
  const name = text(input.name, 161);
  const image = text(input.image, 2001);
  if (!slugPattern.test(slug) || slug.length > 120 || !name || name.length > 160) {
    throw new Error("A unique URL slug and project name are required.");
  }
  if (!image || !urlOk(image, true)) throw new Error("Please provide an uploaded image path or an HTTPS image URL.");
  if (!urlOk(text(input.website, 2001)) || !urlOk(text(input.repository, 2001))) {
    throw new Error("Website and repository links must be HTTPS URLs.");
  }
  if (input.imageAlt && String(input.imageAlt).length > 500) throw new Error("Image alt text is too long.");
  if (input.status !== undefined && typeof input.status !== "boolean") throw new Error("Invalid publish status.");
  const sortOrder = input.sortOrder ?? 0;
  const width = input.imageWidth ?? 1200;
  const height = input.imageHeight ?? 645;
  if (![sortOrder,width,height].every(Number.isInteger) || sortOrder < 0 || sortOrder > 10000 ||
    width < 1 || width > 10000 || height < 1 || height > 10000) throw new Error("Invalid display order or image dimensions.");
  const project = {};
  for (const field of ["slug","name","eyebrow","tagline","summary","website","repository","image",
    "imageAlt","imageNote","overview","journeyIntro","outcome"]) project[field] = text(input[field]);
  for (const field of ["role","focus","context","responsibilities","delivered","ongoing","stack"]) {
    project[field] = strings(input[field]);
  }
  project.principles = objects(input.principles, ["title","description"]);
  project.journey = objects(input.journey, ["step","title","status","lead","result"]).map((stage,i) => ({
    ...stage, details: strings(input.journey[i].details),
  }));
  project.decisions = objects(input.decisions, ["title","situation","approach","tradeoff"]);
  project.status = input.status !== false;
  project.sortOrder = sortOrder;
  project.imageWidth = width;
  project.imageHeight = height;
  return project;
}
function normalizeFounderProjects(value) {
  if (!Array.isArray(value) || value.length > 30) throw new Error("Provide at most 30 founder projects.");
  const projects = value.map(normalizeFounderProject);
  if (new Set(projects.map((p) => p.slug)).size !== projects.length) throw new Error("Project slugs must be unique.");
  return sortFounderProjects(projects);
}
function sortFounderProjects(values) {
  return [...values].sort((a,b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.slug.localeCompare(b.slug));
}
module.exports = { normalizeFounderProject, normalizeFounderProjects, sortFounderProjects };
