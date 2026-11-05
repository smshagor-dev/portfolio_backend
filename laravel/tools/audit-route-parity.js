#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const originals = [
  ["routes/admin.js", "admin"],
  ["routes/site.js", "site"],
  ["routes/research.js", ""],
  ["routes/research-admin-crud.js", ""],
  ["routes/job-agent.js", "admin/job-agent"],
  ["routes/job-agent-tracking.js", "job-agent"],
  ["routes/assistant.js", ""],
];
function normalize(method, p) {
  return method.toUpperCase() + " /" + p.replace(/^\/+|\/+$/g, "")
    .replace(/:\w+/g, "{}").replace(/\{[^}]+\}/g, "{}");
}
const original = [];
for (const [file, prefix] of originals) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  const routePattern = /\brouter\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
  for (const match of code.matchAll(routePattern)) {
    original.push({
      method: match[1].toUpperCase(),
      path: "/" + [prefix, match[2]].filter(Boolean).map(p => p.replace(/^\/|\/$/g, "")).join("/"),
      source: file,
    });
  }
}
const php = fs.readFileSync(path.join(root, "laravel/routes/api.php"), "utf8");
const regions = [
  ["site", php.slice(php.indexOf("Route::prefix('site')"), php.indexOf("Route::prefix('research-publications')"))],
  ["research-publications", php.slice(php.indexOf("Route::prefix('research-publications')"), php.indexOf("Route::get('job-agent/track/"))],
  ["", php.slice(php.indexOf("Route::get('job-agent/track/"), php.indexOf("Route::middleware(['auth:sanctum'])"))],
  ["admin", php.slice(php.indexOf("Route::middleware(['auth:sanctum'])"))],
];
const phpRoutes = [];
for (const [prefix, chunk] of regions) {
  const pattern = /Route::(get|post|put|patch|delete)\('([^']+)'/g;
  for (const match of chunk.matchAll(pattern)) {
    phpRoutes.push({
      method: match[1].toUpperCase(),
      path: "/" + [prefix, match[2]].filter(Boolean).map(p => p.replace(/^\/|\/$/g, "")).join("/"),
    });
  }
}
const matching = new Set(phpRoutes.map(({method,path}) => normalize(method,path)));
function equivalentSiteRoute(entry) {
  if (!entry.path.startsWith("/site/")) return false;
  const match = entry.path.match(/^\/site\/(projects|services|articles)\/[^/]+\/(impression|comments)(?:\/[^/]+\/replies)?$/);
  if (!match) return false;
  const kind = match[1], suffix = match[2];
  return phpRoutes.some(p => p.method === entry.method &&
    p.path.includes("{type}/{slug}/" + suffix));
}
const missing = original.filter(r => !matching.has(normalize(r.method,r.path)) && !equivalentSiteRoute(r));
const report = {
  disclaimer: "Static method/path audit only; not a runtime or JSON contract test.",
  expressRoutesParsed: original.length,
  laravelRoutesParsed: phpRoutes.length,
  missingCount: missing.length,
  missing,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (missing.length) process.exitCode = 1;
