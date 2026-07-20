/**
 * backlink-staging-committed.test.ts — locks the staging↔live matcher
 * (owner 2026-07-20 "มีในระบบแล้วทำไมยังโชว์ยังไม่เข้าระบบ").
 * Run: tsx lib/admin/backlink-staging-committed.test.ts
 */
import { planStagingBacklinks, stagingFamilyWeights, type LiveLite, type StagingLite } from "./backlink-staging-committed";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

const live = (id: number, tracking: string, fstatus = "2", userid = "PR9820", fweight = 0): LiveLite =>
  ({ id, tracking, fstatus, userid, fweight });
const st = (id: string, tracking: string, weightKg = 0, committed = false): StagingLite =>
  ({ id, tracking, weightKg, committed });

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


// ── 10. 🔴 VALUE-COVERAGE (owner 2026-07-20 "กล่องหาย") — a proper-split family that is
//        SHORT this box's weight must NOT be stamped (stays visible in the queue) ──
{
  // live family = the -2 box only (43.5 kg). staging family = bare 38.5 + -2 43.5 = 82.
  // live 43.5 < 82 → the bare's value is genuinely missing → uncovered, no stamp.
  const p = planStagingBacklinks(
    [st("s10", "1784190161", 38.5), st("s10b", "1784190161-2", 43.5, true)],
    [live(52852, "1784190161-2", "3", "PR208", 43.5)],
  );
  eq("uncovered bare NOT stamped", p.matches.length, 0);
  eq("uncovered flagged", p.uncovered, ["1784190161"]);
}
{
  // anchor direction: live bare holds ONLY its own box (10) · staging family = 10 + 5 → short
  const p = planStagingBacklinks(
    [st("s11", "555111-2", 5), st("s11b", "555111", 10, true)],
    [live(40, "555111", "3", "PR001", 10)],
  );
  eq("uncovered box NOT stamped onto the bare", p.matches.length, 0);
  eq("uncovered box flagged", p.uncovered, ["555111-2"]);
}
{
  // AGGREGATE anchor: the live bare carries the WHOLE family Σ (15) → stamping is safe
  const p = planStagingBacklinks(
    [st("s12", "555222-2", 5), st("s12b", "555222", 10, true)],
    [live(41, "555222", "3", "PR001", 15)],
  );
  eq("covered aggregate anchor stamped", p.matches[0]?.kind, "anchor");
  eq("no uncovered", p.uncovered.length, 0);
}
{
  // committed staging rows feed the Σ but are never re-matched
  const p = planStagingBacklinks(
    [st("s13", "555333", 10, true)],
    [live(42, "555333-2", "3", "PR001", 10)],
  );
  eq("committed staging never re-stamped", p.matches.length, 0);
}
{
  // no weight signal anywhere → legacy behavior (stamp) — fail-quiet in the safe direction
  const p = planStagingBacklinks([st("s14", "555444-2")], [live(43, "555444")]);
  eq("no-weight anchor still stamps (legacy)", p.matches[0]?.kind, "anchor");
}


// ── 15. AGGREGATE-HEADER rule in the staging Σ (absorbed/box-split families) ──
{
  // staged bare 36.5 ≈ Σ suffixed (16.5+20) → header → family truth = 36.5 not 73
  const m = stagingFamilyWeights([
    { tracking: "519218029029", weightKg: 36.5 },
    { tracking: "519218029029-1/2", weightKg: 16.5 },
    { tracking: "519218029029-2/2", weightKg: 20 },
  ]);
  eq("header bare dropped from the Σ", m.get("519218029029"), 36.5);
}
{
  // proper-split: bare 38.5 ≉ Σ suffixed 543.5 → bare is a REAL box → counts
  const m = stagingFamilyWeights([
    { tracking: "1784190161", weightKg: 38.5 },
    { tracking: "1784190161-2", weightKg: 543.5 },
  ]);
  eq("proper-split bare counted", m.get("1784190161"), 582);
}
{
  // absorbed family + live carrying the true Σ → covered → box stamps normally
  const p = planStagingBacklinks(
    [st("s15", "519218029029-1/2", 16.5), st("s15b", "519218029029", 36.5, true), st("s15c", "519218029029-2/2", 20, true)],
    [live(52380, "519218029029", "3", "PR050", 36.5)],
  );
  eq("absorbed family covered → anchor stamp", p.matches[0]?.kind, "anchor");
  eq("absorbed family no uncovered", p.uncovered.length, 0);
}

console.log(`\nadmin/backlink-staging-committed: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
