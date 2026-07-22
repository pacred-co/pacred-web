import assert from "node:assert/strict";
import {
  momoSettlementDocNoFor,
  nextMomoSettlementSeq,
  yyMmToken,
  selectSettleableLines,
  decideDoublePayRefusal,
  round2,
  type SettlePreviewLine,
  type SettleableLine,
} from "./momo-invoice-settlement-core";

// ── doc_no format + monthly sequence ─────────────────────────────────────────
{
  assert.equal(momoSettlementDocNoFor("2607", 1), "MCS2607-0001", "first doc of month");
  assert.equal(momoSettlementDocNoFor("2607", 42), "MCS2607-0042", "zero-padded to 4");
  assert.equal(momoSettlementDocNoFor("2611", 1234), "MCS2611-1234", "4-digit seq");
  assert.equal(yyMmToken(new Date(2026, 6, 22)), "2607", "July 2026 → 2607");
  assert.equal(yyMmToken(new Date(2026, 11, 1)), "2612", "Dec 2026 → 2612");
}

// ── nextMomoSettlementSeq — max+1, month-scoped, pad-agnostic ─────────────────
{
  assert.equal(nextMomoSettlementSeq([], "2607"), 1, "no docs → 1");
  assert.equal(nextMomoSettlementSeq(["MCS2607-0001", "MCS2607-0002"], "2607"), 3, "→ 3");
  // ignores other months + malformed
  assert.equal(
    nextMomoSettlementSeq(["MCS2606-0009", "MCS2607-0003", null, "GARBAGE", "MCS2607-x"], "2607"),
    4,
    "other-month + malformed ignored → 4",
  );
  // pad-agnostic: a hypothetical unpadded row still bumps by numeric value
  assert.equal(nextMomoSettlementSeq(["MCS2607-7"], "2607"), 8, "numeric max, not lexicographic");
}

// ── selectSettleableLines ────────────────────────────────────────────────────
const line = (over: Partial<SettlePreviewLine> & { fid: number | null }): SettlePreviewLine => ({
  fid: over.fid,
  tracking: over.tracking ?? `T${over.fid}`,
  fcabinetnumber: over.fcabinetnumber ?? "GZE260707-1",
  invoiceCost: over.invoiceCost ?? 100,
  currentCost: over.currentCost ?? null,
  matched: over.matched ?? true,
  cabinetConflict: over.cabinetConflict ?? false,
  duplicateFid: over.duplicateFid ?? false,
});

{
  // ทั้งบิล (no requestedFids) — every positively-identified line is eligible; blocked lines
  // are NOT surfaced as errors (they simply aren't billable here).
  const rows: SettlePreviewLine[] = [
    line({ fid: 1, invoiceCost: 2500, currentCost: 2500 }), // cost already written
    line({ fid: 2, invoiceCost: 4700, currentCost: 0 }), // cost not yet written
    line({ fid: null, matched: false, tracking: "UNKNOWN" }), // unmatched → skipped
    line({ fid: 3, cabinetConflict: true }), // conflict → skipped
    line({ fid: 4, duplicateFid: true }), // dup → skipped
  ];
  const { eligible, blocked } = selectSettleableLines(rows);
  assert.equal(eligible.length, 2, "only the 2 positively-identified rows are eligible");
  assert.equal(blocked.length, 0, "ทั้งบิล mode surfaces no blocked noise");
  const byFid = new Map(eligible.map((e) => [e.fid, e]));
  assert.equal(byFid.get(1)!.costWritten, true, "fid1 cost matched → costWritten");
  assert.equal(byFid.get(2)!.costWritten, false, "fid2 cost differs → not written");
  assert.equal(byFid.get(2)!.amount, 4700, "amount = invoice line total");
}

{
  // per-line: request a specific fid — only it settles.
  const rows: SettlePreviewLine[] = [line({ fid: 1 }), line({ fid: 2 })];
  const { eligible } = selectSettleableLines(rows, [2]);
  assert.equal(eligible.length, 1, "only requested fid");
  assert.equal(eligible[0].fid, 2);
}

{
  // requesting a BLOCKED fid explicitly → it's reported in `blocked` with a reason.
  const rows: SettlePreviewLine[] = [line({ fid: 5, cabinetConflict: true, tracking: "SF999" })];
  const { eligible, blocked } = selectSettleableLines(rows, [5]);
  assert.equal(eligible.length, 0, "conflicted fid can't settle");
  assert.equal(blocked.length, 1, "explicitly-requested blocked fid is surfaced");
  assert.equal(blocked[0].fid, 5);
  assert.match(blocked[0].reason, /ตู้ไม่ตรง/, "reason names the conflict");
}

{
  // requesting a fid that isn't in the (re-derived) preview at all → stale-selection error.
  const rows: SettlePreviewLine[] = [line({ fid: 1 })];
  const { eligible, blocked } = selectSettleableLines(rows, [999]);
  assert.equal(eligible.length, 0);
  assert.equal(blocked.length, 1, "stale fid surfaced");
  assert.match(blocked[0].reason, /โหลดใบใหม่|ไม่พบ/, "reason tells them to reload");
}

// ── decideDoublePayRefusal ───────────────────────────────────────────────────
const settleable = (fid: number, tracking = `T${fid}`): SettleableLine => ({
  fid, tracking, cabinet: "GZE260707-1", amount: 100, costWritten: false,
});

{
  assert.equal(decideDoublePayRefusal([settleable(1), settleable(2)], new Map()), null, "no prior payment → clear");
  const paid = new Map<number, string>([[2, "MCS2607-0005"]]);
  const refusal = decideDoublePayRefusal([settleable(1), settleable(2, "SF222")], paid);
  assert.ok(refusal, "already-paid fid → refusal");
  assert.match(refusal!, /MCS2607-0005/, "names the covering doc_no");
  assert.match(refusal!, /SF222/, "names the tracking");
  // a fid covered only by a voided settlement is NOT in the map → no refusal
  assert.equal(decideDoublePayRefusal([settleable(3)], new Map()), null, "voided coverage frees the fid");
}

// ── round2 ───────────────────────────────────────────────────────────────────
{
  assert.equal(round2(10858.245), 10858.25, "half-up 2dp");
  assert.equal(round2(0.1 + 0.2), 0.3, "float noise cleaned");
}

console.log("momo-invoice-settlement-core.test.ts — all assertions passed");
