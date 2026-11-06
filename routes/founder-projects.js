const express = require("express");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../lib/auth");
const { getDefaultSiteSettings } = require("../lib/site-settings");
const {
  normalizeFounderProject, normalizeFounderProjects, sortFounderProjects,
} = require("../lib/founder-projects");

const router = express.Router();

async function getCurrent() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return { settings, projects: Array.isArray(settings?.founderProjects) ? settings.founderProjects : null };
}

async function save(projects) {
  const normalized = normalizeFounderProjects(projects);
  const data = { founderProjects: normalized };
  const existing = await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { id: true } });
  if (existing) {
    await prisma.siteSettings.update({ where: { id: 1 }, data });
  } else {
    await prisma.siteSettings.create({ data: { ...getDefaultSiteSettings(), ...data } });
  }
  return normalized;
}

function failure(response, error) {
  const message = error?.message || "Unable to save founder projects.";
  console.error("[founder-projects]", message);
  return response.status(500).json({ success: false, message: "Founder project operation failed." });
}

router.get("/site/founder-projects", async (_req, res) => {
  try {
    const { projects } = await getCurrent();
    return res.json({ success: true, initialized: projects !== null,
      data: sortFounderProjects((projects || []).filter((p) => p.status !== false)),
      section: (await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { founderSection: true } }))?.founderSection || null });
  } catch (error) { return failure(res, error); }
});
router.get("/admin/founder-projects", requireAdmin, async (_req, res) => {
  try {
    const { projects } = await getCurrent();
    return res.json({ success: true, initialized: projects !== null,
      data: sortFounderProjects(projects || []),
      section: (await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { founderSection: true } }))?.founderSection || null });
  } catch (error) { return failure(res, error); }
});
router.put("/admin/founder-section", requireAdmin, async (req, res) => {
  try {
    const limits = { eyebrow: 120, title: 300, description: 800, badge: 200, footer: 500 };
    const section = {};
    for (const [key,max] of Object.entries(limits)) {
      const value = req.body?.[key];
      if (typeof value !== "string" || value.length > max ||
        (["eyebrow","title","description"].includes(key) && !value.trim())) {
        return res.status(422).json({ success: false, message: "Invalid founder section field: " + key });
      }
      section[key] = value.trim();
    }
    const existing = await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { id: true } });
    if (existing) {
      await prisma.siteSettings.update({ where: { id: 1 }, data: { founderSection: section } });
    } else {
      await prisma.siteSettings.create({ data: { ...getDefaultSiteSettings(), founderSection: section } });
    }
    return res.json({ success: true, message: "Founder section updated.", section });
  } catch (error) { return failure(res, error); }
});
router.put("/admin/founder-projects", requireAdmin, async (req, res) => {
  try {
    const contentLength = Buffer.byteLength(JSON.stringify(req.body || {}));
    if (contentLength > 750000) return res.status(413).json({ message: "Payload exceeds 750 KB." });
    const projects = normalizeFounderProjects(req.body?.projects);
    return res.json({ success: true, initialized: true, data: await save(projects), message: "Founder projects saved." });
  } catch (error) { return res.status(422).json({ success: false, message: error.message }); }
});
router.post("/admin/founder-projects", requireAdmin, async (req, res) => {
  try {
    const next = normalizeFounderProject(req.body);
    const { projects } = await getCurrent();
    if ((projects || []).some((p) => p.slug === next.slug)) return res.status(409).json({ message: "Project slug already exists." });
    await save([...(projects || []), next]);
    return res.status(201).json({ success: true, data: next, message: "Founder project created." });
  } catch (error) { return res.status(422).json({ success: false, message: error.message }); }
});
router.put("/admin/founder-projects/:slug", requireAdmin, async (req, res) => {
  try {
    const next = normalizeFounderProject(req.body);
    const { projects } = await getCurrent();
    if (!(projects || []).some((p) => p.slug === req.params.slug)) return res.status(404).json({ message: "Project not found." });
    if (projects.some((p) => p.slug === next.slug && p.slug !== req.params.slug)) return res.status(409).json({ message: "Project slug already exists." });
    await save(projects.map((p) => p.slug === req.params.slug ? next : p));
    return res.json({ success: true, data: next, message: "Founder project updated." });
  } catch (error) { return res.status(422).json({ success: false, message: error.message }); }
});
router.delete("/admin/founder-projects/:slug", requireAdmin, async (req, res) => {
  try {
    const { projects } = await getCurrent();
    if (!(projects || []).some((p) => p.slug === req.params.slug)) return res.status(404).json({ message: "Project not found." });
    await save(projects.filter((p) => p.slug !== req.params.slug));
    return res.json({ success: true, message: "Founder project deleted." });
  } catch (error) { return failure(res, error); }
});
module.exports = router;
