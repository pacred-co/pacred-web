/**
 * backlink-staging-committed.test.ts — locks the staging↔live matcher
 * (owner 2026-07-20 "มีในระบบแล้วทำไมยังโชว์ยังไม่เข้าระบบ").
 * Run: tsx lib/admin/backlink-staging-committed.test.ts
 */
import { planStagingBacklinks, type LiveLite, type StagingLite } from "./backlink-staging-committed";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

const live = (id: number, tracking: string, fstatus = "2", userid = "PR9820"): LiveLite => ({ id, tracking, fstatus, userid });
const st = (id: string, tracking: string): StagingLite => ({ id, tracking });

// ── 1. EXACT — the screenshot case: 710092508207-2/2 already live as #52747 ──
{
  const p = planStagingBacklinks([st("s1", "710092508207-2/2")], [live(52747, "710092508207-2/2")]);
  eq("exact match → fid", p.matches[0]?.fid, 52747);
  eq("exact kind", p.matches[0]?.kind, "exact");
}

// ── 2. ANCHOR — box staging vs live BARE (the "-1/n ห้ามซ้อน" case → #52746) ──
{
  const p = planStagingBacklinks([st("s2", "710092508207-1/2")], [live(52746, "710092508207")]);
  eq("anchor match → bare fid", p.matches[0]?.fid, 52746);
  eq("anchor kind", p.matches[0]?.kind, "anchor");
}

// ── 3. BARE→BOX — bare staging vs live box rows (lowest suffix wins) ──
{
  const p = planStagingBacklinks(
    [st("s3", "1784434004")],
    [live(52762, "1784434004-9/25"), live(52761, "1784434004-8/25")],
  );
  eq("bare→box match → lowest-suffix fid", p.matches[0]?.fid, 52761);
  eq("bare→box kind", p.matches[0]?.kind, "bare_to_box");
}

// ── 4. no live match → no stamp (genuinely pending stays pending) ──
{
  const p = planStagingBacklinks([st("s4", "906537142588")], [live(1, "999999")]);
  eq("no match → empty", p.matches.length, 0);
}

// ── 5. cancelled live row must NOT claim the staging row ──
{
  const p = planStagingBacklinks([st("s5", "ABC123")], [live(9, "ABC123", "99")]);
  eq("fstatus 99 ignored", p.matches.length, 0);
}

// ── 6. dup live rows → SKIP + flagged (never guess) ──
{
  const p = planStagingBacklinks([st("s6", "DUP1")], [live(1, "DUP1"), live(2, "DUP1")]);
  eq("dup skipped", p.matches.length, 0);
  eq("dup flagged", p.dupSkipped, ["DUP1"]);
}

// ── 7. exact beats anchor when both exist ──
{
  const p = planStagingBacklinks(
    [st("s7", "555000-2/3")],
    [live(10, "555000"), live(11, "555000-2/3")],
  );
  eq("exact wins over anchor", p.matches[0]?.fid, 11);
}

// ── 8. userid carried from the live row (→ commit_userid stamp) ──
{
  const p = planStagingBacklinks([st("s8", "XYZ9")], [live(20, "XYZ9", "4", "PR075")]);
  eq("userid carried", p.matches[0]?.userid, "PR075");
}

// ── 9. -N (no /M) suffix form also anchors ──
{
  const p = planStagingBacklinks([st("s9", "888000-2")], [live(30, "888000")]);
  eq("-N form anchors to bare", p.matches[0]?.kind, "anchor");
}

console.log(`\nadmin/backlink-staging-committed: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
