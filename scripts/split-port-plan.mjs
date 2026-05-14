// One-shot script to split docs/PORT_PLAN.md into:
//   - docs/PORT_PLAN.md          (top + Parts O–S = current/active work)
//   - docs/sprints/archive-a-to-n.md  (Parts A–N = historic survey + earlier sprint plans)
//
// Split point: first line matching `^# Part O` (Sprint 5+ plan onwards).
//
// Adds a clear pointer at the top of the trimmed PORT_PLAN.md so future
// agents can find archived context without grepping.
//
// Safe to re-run: detects "already split" by checking if a marker line is
// already at the top.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "docs/PORT_PLAN.md");
const ARCHIVE = path.join(ROOT, "docs/sprints/archive-a-to-n.md");
const ARCHIVE_DIR = path.dirname(ARCHIVE);

const MARKER = "<!-- PORT_PLAN_SPLIT_MARKER_2026_05_16 -->";

const src = fs.readFileSync(SRC, "utf8");
if (src.includes(MARKER)) {
  console.log("Already split — marker present in PORT_PLAN.md. No-op.");
  process.exit(0);
}

const lines = src.split(/\r?\n/);

// Find the split boundary
let splitIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^# Part O\b/.test(lines[i])) {
    splitIdx = i;
    break;
  }
}
if (splitIdx === -1) {
  console.error("Couldn't find `# Part O` in PORT_PLAN.md — aborting.");
  process.exit(1);
}

// Carve out the pre-Part-O section (header + TL;DR + Parts A–N) for the archive
const headLines = [];
const archiveLines = [];

// Header detection: keep everything before the first `# Part A` in PORT_PLAN
let firstPartIdx = -1;
for (let i = 0; i < splitIdx; i++) {
  if (/^# Part A\b/.test(lines[i])) {
    firstPartIdx = i;
    break;
  }
}
if (firstPartIdx === -1) {
  console.error("Couldn't find `# Part A` either — aborting.");
  process.exit(1);
}

// PORT_PLAN.md (trimmed) = header lines [0, firstPartIdx) + pointer + Parts O–S
const header = lines.slice(0, firstPartIdx).join("\n");
const currentParts = lines.slice(splitIdx).join("\n");

const pointer = `${MARKER}

> 📚 **Historic context (Parts A–N) moved 2026-05-16** to
> [\`docs/sprints/archive-a-to-n.md\`](sprints/archive-a-to-n.md) to keep
> this file under the 2000-line agent-read limit. Open the archive when
> auditing the PHP-port survey, gap analysis, earlier sprint plans
> (D–H), env decisions (Part J), tracking (K–L), or production-readiness
> audits (M–N). **Current sprint + hand-off batches stay here (Parts O–S below).**

---

`;

const trimmed = header + "\n" + pointer + currentParts;

// Archive file = everything between Part A header (inclusive) and Part O (exclusive)
// Plus a small header note at the top.
const archiveHeader = `# Pacred PORT_PLAN — historic archive (Parts A–N)

> Split out from \`docs/PORT_PLAN.md\` 2026-05-16 to keep that file under
> the 2000-line agent-read limit. **Current sprint + active hand-offs**
> live in [\`docs/PORT_PLAN.md\`](../PORT_PLAN.md) (Parts O–S there).

This archive covers:

- **Part A** — Status snapshot at port-start
- **Part B** — PHP feature inventory (reference catalogue from legacy \`pcs-cargo\`)
- **Part C** — Gap analysis (what was missing in initial Pacred build)
- **Part D** — Phased priority plan (P0 pre-launch / P1 beta / P2 ops excellence / P3 integrations)
- **Part E** — Per-dev assignment (early sprint plans)
- **Part F** — Workflow rules (consolidated into [\`docs/team.md\`](../team.md))
- **Part G** — Migration checklist
- **Part H** — Env vars (consolidated into [\`docs/env.md\`](../env.md))
- **Part I** — Reference links
- **Part J** — Open decisions (consolidated into [\`docs/decisions/\`](../decisions/) ADRs)
- **Part K** — Status tracking history
- **Part L** — Merge state snapshot (2026-05-13)
- **Part M** — Audit update (post-Poom-merge sweep 2026-05-13)
- **Part N** — Production-readiness deep audit (2026-05-13)

Treat this as **read-only**. New work should land in the parts of
\`PORT_PLAN.md\` that remain, not here.

---

`;

const archiveContent = archiveHeader + lines.slice(firstPartIdx, splitIdx).join("\n");

// Ensure archive dir exists
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// Write
fs.writeFileSync(ARCHIVE, archiveContent + "\n");
fs.writeFileSync(SRC, trimmed + "\n");

const newSrcLines = trimmed.split(/\r?\n/).length;
const archiveLineCount = archiveContent.split(/\r?\n/).length;

console.log(`✓ PORT_PLAN.md trimmed: ${lines.length} → ${newSrcLines} lines`);
console.log(`✓ Archive written: docs/sprints/archive-a-to-n.md (${archiveLineCount} lines)`);
console.log(`  Both files are within the 2000-line limit:`);
console.log(`    PORT_PLAN.md       — ${newSrcLines <= 2000 ? "✓" : "⚠ STILL OVER"}`);
console.log(`    archive-a-to-n.md  — ${archiveLineCount <= 2000 ? "✓" : "⚠ STILL OVER"}`);
