// Export every route/URL in the Next.js App Router to a CSV.
//
// Walks app/, finds page + route-handler + metadata files, derives the public
// URL by stripping route groups `(...)` and the `[locale]` i18n segment, then
// classifies each (public / auth / protected / admin / api / system) and writes
// site-urls.csv at the repo root (UTF-8 BOM so Excel opens it cleanly).
//
// Run:  node scripts/export-site-urls.mjs
//
// Note: dynamic segments are kept as patterns ([id], [slug], [[...slug]]).
// The concrete instances they generate (each article / service / customer)
// are data/DB-driven and not enumerated here — use sitemap.xml for those.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "app");
const SITE_URL = "https://pacred.co"; // production canonical (components/seo/site.ts)

const ROUTE_FILES = new Set([
  "page.tsx", "page.ts", "page.jsx", "page.js",
  "route.ts", "route.tsx", "route.js",
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

// Turn the directory segments under app/ into a URL path + metadata.
function segsToUrl(dirParts) {
  let localized = false;
  let group = "";
  const segs = [];
  for (const s of dirParts) {
    if (s === "[locale]") { localized = true; continue; }      // i18n prefix — not in URL
    if (s.startsWith("(") && s.endsWith(")")) { group = s.slice(1, -1); continue; } // route group — not in URL
    segs.push(s);
  }
  const url = "/" + segs.join("/");
  return { url: url === "/" ? "/" : url.replace(/\/+$/, ""), group, localized };
}

function classify(group, type, url) {
  if (type === "page") {
    if (["public", "auth", "protected", "admin"].includes(group)) return group;
    return "top-level"; // localized page with no route group (reset-password, complete-profile, liff/*)
  }
  if (url.startsWith("/api")) return "api";
  return "system"; // /line, /auth/*, /feed.xml, /sitemap.xml, /robots.txt
}

const rows = [];
const seen = new Set();

for (const file of walk(APP_DIR)) {
  const relParts = path.relative(APP_DIR, file).split(path.sep);
  const filename = relParts.at(-1);
  const dirParts = relParts.slice(0, -1);

  let type;
  let urlOverride = null;
  if (ROUTE_FILES.has(filename)) {
    type = filename.startsWith("route") ? "route-handler" : "page";
  } else if (filename === "sitemap.ts") {
    type = "metadata"; urlOverride = "/sitemap.xml";
  } else if (filename === "robots.ts") {
    type = "metadata"; urlOverride = "/robots.txt";
  } else {
    continue; // layout / loading / not-found / og-image / components etc.
  }

  const { url: derived, group, localized } = segsToUrl(dirParts);
  const url = urlOverride ?? derived;
  const access = classify(group, type, url);
  const dynamic = /\[.+?\]/.test(url) ? "yes" : "no";
  const fullUrl = SITE_URL + (url === "/" ? "/" : url);

  const key = url + "|" + type;
  if (seen.has(key)) continue;
  seen.add(key);

  rows.push({
    url_path: url,
    full_url: fullUrl,
    type,
    access,
    dynamic,
    localized: localized ? "yes" : "no",
    source_file: path.relative(ROOT, file).split(path.sep).join("/"),
  });
}

const ORDER = { public: 0, "top-level": 1, auth: 2, protected: 3, admin: 4, api: 5, system: 6, metadata: 7 };
rows.sort((a, b) =>
  (ORDER[a.access] ?? 9) - (ORDER[b.access] ?? 9) ||
  a.url_path.localeCompare(b.url_path) ||
  a.type.localeCompare(b.type),
);

function esc(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const headers = ["url_path", "full_url", "type", "access", "dynamic", "localized", "source_file"];
const lines = [headers.join(",")];
for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
fs.writeFileSync(path.join(ROOT, "site-urls.csv"), "﻿" + lines.join("\r\n") + "\r\n", "utf8");

const byAccess = {};
const byType = {};
for (const r of rows) {
  byAccess[r.access] = (byAccess[r.access] ?? 0) + 1;
  byType[r.type] = (byType[r.type] ?? 0) + 1;
}
console.log(`Wrote ${rows.length} routes -> site-urls.csv`);
console.log("by access:", JSON.stringify(byAccess));
console.log("by type:", JSON.stringify(byType));
const dyn = rows.filter((r) => r.dynamic === "yes").length;
const loc = rows.filter((r) => r.localized === "yes").length;
console.log(`dynamic patterns: ${dyn} · localized (have /en variant): ${loc}`);
