// Audits every markdown file in the repo for broken local links.
// Skips node_modules, .next, .git, .claude.
//
// Usage: node scripts/md-link-audit.mjs
//
// Exits 1 if any local link can't be resolved on the filesystem.

import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude"]);
const root = process.cwd();

/** @param {string} dir @param {string[]} acc */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

const mds = walk(root);
const linkRe = /\[[^\]]+\]\(([^)\s]+)\)/g;
const broken = [];
let checked = 0;

for (const md of mds) {
  const src = fs.readFileSync(md, "utf8");
  const dir = path.dirname(md);
  let m;
  while ((m = linkRe.exec(src))) {
    const href = m[1].split("#")[0]; // strip anchor
    if (!href) continue;
    if (href.startsWith("http") || href.startsWith("mailto:")) continue;
    checked++;
    const target = href.startsWith("/")
      ? path.join(root, href.slice(1))
      : path.join(dir, href);
    if (!fs.existsSync(target)) {
      const rel = path.relative(root, md).replace(/\\/g, "/");
      broken.push({ from: rel, href, target: path.relative(root, target).replace(/\\/g, "/") });
    }
  }
}

console.log(`Checked ${checked} local links across ${mds.length} md files`);
if (broken.length === 0) {
  console.log("All links resolve ✓");
  process.exit(0);
}

console.log(`\nBROKEN (${broken.length}):`);
for (const b of broken) {
  console.log(`  ${b.from} → ${b.href}`);
  console.log(`    resolves to: ${b.target}`);
}
process.exit(1);
