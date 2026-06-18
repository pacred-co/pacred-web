/**
 * ════════════════════════════════════════════════════════════════════════
 * report-cnt -N sibling grouping — unit tests (FIX 3 · 2026-06-18).
 *
 * Locks the grouping rule that lets ONE "เรียกเก็บเงินลูกค้า" bill a whole
 * split shipment: rows sharing (userid, baseTracking) collapse into one group,
 * combined Σ are summed, and only fstatus-4 members are collect-eligible.
 *
 * SAFETY — pure · no DB · no IO. Runs in test:unit.
 * RUN:  pnpm tsx lib/admin/report-cnt-grouping.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import { groupRowsBySibling, type GroupableRow } from "./report-cnt-grouping";

function row(p: Partial<GroupableRow> & Pick<GroupableRow, "id" | "userid">): GroupableRow {
  return {
    ftrackingchn: null,
    username: null,
    famount: 1,
    fvolume: 0,
    fweight: 0,
    priceGetUser: 0,
    fcosttotalprice: 0,
    profitItem: 0,
    fstatus: "4",
    ...p,
  };
}

let passed = 0;
function ok(label: string, cond: boolean) {
  assert.ok(cond, label);
  passed += 1;
}

// ── 1. -N siblings (same user) collapse into ONE group ──
{
  const rows = [
    row({ id: 1, userid: "PR100", ftrackingchn: "1779955936-2", fvolume: 0.5, fweight: 10, priceGetUser: 100, fcosttotalprice: 60, profitItem: 40, famount: 1 }),
    row({ id: 2, userid: "PR100", ftrackingchn: "1779955936-3", fvolume: 0.7, fweight: 12, priceGetUser: 140, fcosttotalprice: 80, profitItem: 60, famount: 1 }),
    row({ id: 3, userid: "PR100", ftrackingchn: "1779955936-4", fvolume: 0.3, fweight: 5,  priceGetUser: 60,  fcosttotalprice: 40, profitItem: 20, famount: 1 }),
  ];
  const groups = groupRowsBySibling(rows);
  ok("3 -N siblings → 1 group", groups.length === 1);
  ok("group isSplit", groups[0].isSplit === true);
  ok("members preserved", groups[0].members.length === 3);
  ok("baseTracking stripped", groups[0].baseTracking === "1779955936");
  ok("combined volume", Math.abs(groups[0].combined.fvolume - 1.5) < 1e-9);
  ok("combined weight", groups[0].combined.fweight === 27);
  ok("combined pieces (famount)", groups[0].combined.famount === 3);
  ok("combined sell", groups[0].combined.priceGetUser === 300);
  ok("combined cost", groups[0].combined.fcosttotalprice === 180);
  ok("combined profit", groups[0].combined.profitItem === 120);
  ok("all 3 billable (fstatus 4)", groups[0].billableIds.length === 3);
}

// ── 2. base row (no suffix) joins its -N children ──
{
  const rows = [
    row({ id: 10, userid: "PR200", ftrackingchn: "ABC123" }),
    row({ id: 11, userid: "PR200", ftrackingchn: "ABC123-1" }),
    row({ id: 12, userid: "PR200", ftrackingchn: "ABC123-2" }),
  ];
  const groups = groupRowsBySibling(rows);
  ok("base + 2 children → 1 group", groups.length === 1 && groups[0].members.length === 3);
}

// ── 3. different users NEVER group, even with same baseTracking ──
{
  const rows = [
    row({ id: 20, userid: "PR300", ftrackingchn: "SAME-1" }),
    row({ id: 21, userid: "PR301", ftrackingchn: "SAME-2" }),
  ];
  const groups = groupRowsBySibling(rows);
  ok("two users → two groups", groups.length === 2);
  ok("group A user", groups[0].userid === "PR300");
  ok("group B user", groups[1].userid === "PR301");
  ok("neither isSplit", !groups[0].isSplit && !groups[1].isSplit);
}

// ── 4. -N/M (box-of-boxes) form strips the same as -N ──
{
  const rows = [
    row({ id: 30, userid: "PR400", ftrackingchn: "302098539663-1/7" }),
    row({ id: 31, userid: "PR400", ftrackingchn: "302098539663-2/7" }),
  ];
  const groups = groupRowsBySibling(rows);
  ok("-N/M groups", groups.length === 1 && groups[0].baseTracking === "302098539663");
}

// ── 5. null / "-" tracking rows stay separate singletons ──
{
  const rows = [
    row({ id: 40, userid: "PR500", ftrackingchn: null }),
    row({ id: 41, userid: "PR500", ftrackingchn: "-" }),
    row({ id: 42, userid: "PR500", ftrackingchn: "" }),
  ];
  const groups = groupRowsBySibling(rows);
  ok("3 un-groupable rows → 3 singleton groups", groups.length === 3);
  ok("none isSplit", groups.every((g) => !g.isSplit));
}

// ── 6. order preserved (group at first-member position) ──
{
  const rows = [
    row({ id: 50, userid: "PRX", ftrackingchn: "T1" }),
    row({ id: 51, userid: "PRY", ftrackingchn: "T2-1" }),
    row({ id: 52, userid: "PRX", ftrackingchn: "T1-2" }), // joins group at pos 0
    row({ id: 53, userid: "PRY", ftrackingchn: "T2-2" }), // joins group at pos 1
  ];
  const groups = groupRowsBySibling(rows);
  ok("two groups in first-seen order", groups.length === 2 && groups[0].userid === "PRX" && groups[1].userid === "PRY");
}

// ── 7. collect-eligibility: only fstatus 4 members are billable ──
{
  const rows = [
    row({ id: 60, userid: "PR600", ftrackingchn: "Q-1", fstatus: "4" }),
    row({ id: 61, userid: "PR600", ftrackingchn: "Q-2", fstatus: "5" }), // already billed
    row({ id: 62, userid: "PR600", ftrackingchn: "Q-3", fstatus: "3" }), // still in china
  ];
  const groups = groupRowsBySibling(rows);
  ok("group has 3 members", groups[0].members.length === 3);
  ok("only fstatus-4 is billable", groups[0].billableIds.length === 1 && groups[0].billableIds[0] === 60);
}

console.log(`✓ report-cnt-grouping.test.ts — ${passed} assertions passed`);
