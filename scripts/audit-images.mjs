// Pacred image-weight audit.
// Flags oversized images in public/ — heavy hero/banner art delays LCP, which
// lowers the Google Ads Quality Score, which raises cost-per-click. A slow
// landing literally costs more per ad click.
//
// Usage:  pnpm audit:images   (or: node scripts/audit-images.mjs)
//
// This is a REPORT — it always exits 0. Run it before pushing a landing page
// or before an ads launch.
//
// Companion: .claude/skills/landing-conversion-audit/SKILL.md
//            docs/research/podeng-tooling-2026-05-20.md

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const PUBLIC = path.join(root, "public");
const WARN_KB = 300; // a landing image above this is worth optimising
const BAD_KB = 800; // above this is an LCP problem
const IMG_RE = /\.(png|jpe?g|webp|avif|gif)$/i;

const findings = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (IMG_RE.test(e.name)) {
      const kb = Math.round(fs.statSync(p).size / 1024);
      if (kb >= WARN_KB) {
        findings.push({ rel: path.relative(root, p), kb, ext: path.extname(e.name).toLowerCase() });
      }
    }
  }
}
walk(PUBLIC);
findings.sort((a, b) => b.kb - a.kb);

console.log(`\n═══ Image-weight audit — public/ (warn ≥ ${WARN_KB} KB) ═══`);

if (!findings.length) {
  console.log("  ✅ No images over the threshold.\n");
  process.exit(0);
}

let totalKb = 0;
for (const f of findings) {
  totalKb += f.kb;
  const icon = f.kb >= BAD_KB ? "❌" : "⚠️ ";
  const hint = f.ext === ".png" || /\.jpe?g$/.test(f.ext) ? "  → convert to WebP/AVIF" : "";
  console.log(`  ${icon} ${String(f.kb).padStart(6)} KB  ${f.rel}${hint}`);
}

console.log(
  `\n  ${findings.length} image(s) over ${WARN_KB} KB · ${(totalKb / 1024).toFixed(1)} MB total` +
    "\n  Heavy images delay LCP → lower Google Ads Quality Score → higher CPC." +
    "\n  Convert PNG/JPG to WebP/AVIF; serve via next/image, not CSS background-url.\n",
);
process.exit(0);
