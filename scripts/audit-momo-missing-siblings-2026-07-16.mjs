#!/usr/bin/env node
/**
 * AUDIT — READ-ONLY sweep for MOMO "แตกกล่องหาย" (missing sibling / stranded
 * aggregate) — ภูม flag 2026-07-16 (เคส 0001779 / fwd 52135 · "มันต้องมี 0001779-2").
 *
 * NO WRITES. SELECT only. This is the standing detector for the class of bug where
 * MOMO Live shows a base as N boxes ("0001779" + "0001779-2") but tb_forwarder has
 * only the ONE bare aggregate row (18 boxes folded) — because momo_box_detail (the
 * split's ONLY candidate source) never captured the extra box, so no pass ever split
 * it. Run this periodically so a stranded aggregate is CAUGHT before it mis-bills.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ROW GOES MISSING (confirmed 2026-07-16 · 3-agent source trace)
 *   • Sibling rows are created by EXACTLY ONE path: splitAggregatedMomoBoxRows()
 *     (lib/integrations/momo-web/split-box-rows.ts), from commit + cron pass 5 +
 *     the backfill script split-aggregated-momo-boxes-2026-07-02.ts.
 *   • It splits ONLY a base that findMultiBoxBases() flags = a base with >1 row in
 *     `momo_box_detail`. That table's ONLY auto-populator is the MOMO Live web-board
 *     scrape (box-detail.ts fillMomoBoxDetails). Once a parcel advances to fstatus 4
 *     (ถึงไทย) it DROPS off the China boards, so a 2nd box that advanced before the
 *     scrape saw it is NEVER persisted → the base is invisible to the splitter, and
 *     the aggregate stays whole. (famount=18 came from momo_import_tracks.quantity /
 *     container_closed Σ — a DIFFERENT source that knew 18 pieces but didn't seed
 *     box_detail.)
 *   • The DURABLE truth of "how many boxes this base really has" lives in
 *     momo_container_closed.raw.track_details[] (one {reTrack, kg, cbm, width,
 *     height, length, total_quantity} per box). This audit uses THAT as the truth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLASSES (see docs/handoff-dave-momo-missing-sibling-0001779-2026-07-16.md):
 *   MS-A  SPLITTABLE-NOW — momo_box_detail already has >1 box for a base, but
 *         tb_forwarder still has the bare aggregate + NO "-N" sibling. box_detail is
 *         COMPLETE → the split just never ran. Fix = run the split backfill on it.
 *   MS-B  BOX_DETAIL-INCOMPLETE (the 0001779 class) — container_closed.track_details
 *         shows >1 box for a base, but momo_box_detail has FEWER (missing the box),
 *         and tb_forwarder has a bare aggregate + fewer sibling rows than the truth.
 *         Fix = rebuild momo_box_detail from track_details (convention-verified),
 *         THEN split. box_detail must be seeded FIRST — the splitter can't invent it.
 *   (billed rows fstatus 5/6/7 are flagged OWNER-REVIEW — never auto-fixed.)
 *
 * RUN (read-only · env-based · no hard-coded password):
 *   node --env-file=.env.local scripts/audit-momo-missing-siblings-2026-07-16.mjs
 *
 * Optional: FOCUS=0001779,1783582989 to add extra focus dumps.
 */
import { createClient } from "@supabase/supabase-js";

// ── env ─────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
  console.error("Run: node --env-file=.env.local scripts/audit-momo-missing-siblings-2026-07-16.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const EXTRA_FOCUS = (process.env.FOCUS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ALWAYS_FOCUS = ["0001779"]; // the ภูม-reported base
const FOCUS_BASES = Array.from(new Set([...ALWAYS_FOCUS, ...EXTRA_FOCUS]));

// ── pure helpers (mirror split-box-rows-plan.ts / momo-raw-helpers.ts) ──
const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
/** Strip a numeric "-i/n" (or "-i") split-suffix → the BASE tracking (SEA isn't digits). */
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const suffixOf = (t) => {
  const m = /-(\d+)(?:\/\d+)?$/.exec((t ?? "").trim());
  return m ? Number(m[1]) : 0;
};
const piecesOf = (q) => {
  const n = Math.round(num(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
};
const r2 = (n) => Number(num(n).toFixed(2));
const r6 = (n) => Number(num(n).toFixed(6));
const BILLED = new Set(["5", "6", "7"]);

// ────────────────────────────────────────────────────────────────────
async function main() {
  const out = [];
  const log = (s = "") => out.push(s);

  log("═══════════════════════════════════════════════════════════════════════");
  log("AUDIT — MOMO missing-sibling / stranded-aggregate (READ-ONLY · prod)");
  log("═══════════════════════════════════════════════════════════════════════");
  log(`Target: ${url}\n`);

  // ── 1. momo_box_detail → boxes per base ──
  const { data: boxRows, error: boxErr } = await admin
    .from("momo_box_detail")
    .select("base_tracking, box_tracking, weight_kg, cbm, width, length, height, quantity");
  if (boxErr) { console.error("FATAL momo_box_detail:", boxErr); process.exit(2); }
  const boxDetailByBase = new Map(); // base -> [{box_tracking, weight_kg, cbm, w,l,h, qty}]
  for (const b of boxRows ?? []) {
    const base = (b.base_tracking ?? "").trim();
    if (!base) continue;
    if (!boxDetailByBase.has(base)) boxDetailByBase.set(base, []);
    boxDetailByBase.get(base).push(b);
  }

  // ── 2. momo_container_closed.raw.track_details[] → DURABLE truth per base ──
  //     (one box per reTrack; the base = baseOf(reTrack); sum across a base's boxes)
  const { data: closedRows, error: closedErr } = await admin
    .from("momo_container_closed")
    .select("momo_container_no, raw");
  if (closedErr) { console.error("FATAL momo_container_closed:", closedErr); process.exit(3); }
  const truthByBase = new Map(); // base -> Map(reTrack -> {kg, cbm, w,l,h, qty, cid})
  for (const row of closedRows ?? []) {
    const raw = row.raw;
    if (!raw || typeof raw !== "object") continue;
    const cid = typeof raw.cid === "string" ? raw.cid.trim() : "";
    const td = Array.isArray(raw.track_details) ? raw.track_details : [];
    for (const t of td) {
      if (!t || typeof t !== "object") continue;
      const re = typeof t.reTrack === "string" ? t.reTrack.trim() : "";
      if (!re) continue;
      const base = baseOf(re);
      if (!truthByBase.has(base)) truthByBase.set(base, new Map());
      // newest container wins for the same reTrack (defensive; usually unique)
      truthByBase.get(base).set(re, {
        reTrack: re, kg: num(t.kg), cbm: num(t.cbm),
        width: num(t.width), length: num(t.length), height: num(t.height),
        qty: piecesOf(t.total_quantity), cid: cid || null,
      });
    }
  }

  // ── 3. tb_forwarder rows for every base momo knows (durable OR box_detail) ──
  const allBases = Array.from(new Set([...boxDetailByBase.keys(), ...truthByBase.keys()]));
  const fwdByBase = new Map(); // base -> [tb_forwarder rows]
  const CHUNK = 150;
  for (let i = 0; i < allBases.length; i += CHUNK) {
    const slice = allBases.slice(i, i + CHUNK);
    // Match the bare base OR any "-%" sibling for every base in the slice.
    const ors = slice.flatMap((b) => {
      const esc = b.replace(/[%_,()\\]/g, "\\$&");
      return [`ftrackingchn.eq.${esc}`, `ftrackingchn.like.${esc}-%`];
    });
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, famount, famountcount, fweight, fvolume, ftotalprice, reforder, userid, fcabinetnumber")
      .or(ors.join(","));
    if (fwdErr) { console.error(`  tb_forwarder chunk ${i} failed:`, fwdErr.message); continue; }
    for (const r of fwd ?? []) {
      const base = baseOf(r.ftrackingchn);
      // guard the .like prefix trap (base "178055573" vs "1780555731")
      if (!allBases.includes(base)) continue;
      if (!fwdByBase.has(base)) fwdByBase.set(base, []);
      fwdByBase.get(base).push(r);
    }
  }

  // ── 4. Classify each base ──
  const msA = []; // splittable-now (box_detail complete, not split)
  const msB = []; // box_detail incomplete (0001779 class)
  const billedFlag = []; // stranded but billed → owner review

  for (const base of allBases) {
    const fwd = fwdByBase.get(base) ?? [];
    if (fwd.length === 0) continue; // momo knows it but no tb_forwarder row — not our class
    const bareRows = fwd.filter((r) => suffixOf(r.ftrackingchn) === 0);
    const sibRows = fwd.filter((r) => suffixOf(r.ftrackingchn) > 0);
    // The class needs a single bare aggregate that has NOT been split into siblings.
    if (bareRows.length !== 1) continue;         // 0 or >1 bare → not the clean stranded shape
    const bare = bareRows[0];
    if (sibRows.length > 0) continue;            // already split (has siblings) → not our class

    const boxDetailBoxes = boxDetailByBase.get(base) ?? [];
    const truthMap = truthByBase.get(base);
    const truthBoxes = truthMap ? truthMap.size : 0;
    const bdCount = boxDetailBoxes.length;

    const billed = BILLED.has(String(bare.fstatus ?? "").trim());
    const hasRef = String(bare.reforder ?? "").trim() !== "";
    const famount = Math.round(num(bare.famount));

    const record = {
      base, id: bare.id, tracking: bare.ftrackingchn, userid: bare.userid,
      fstatus: bare.fstatus, famount, famountcount: bare.famountcount,
      fweight: num(bare.fweight), fvolume: num(bare.fvolume), ftotalprice: num(bare.ftotalprice),
      cabinet: bare.fcabinetnumber, reforder: bare.reforder || "",
      bdCount, truthBoxes, hasRef, billed,
    };

    if (bdCount > 1) {
      // box_detail ALREADY has the boxes → the split just never ran.
      if (billed) billedFlag.push({ ...record, klass: "MS-A(billed)" });
      else msA.push(record);
    } else if (truthBoxes > 1 && famount > 1) {
      // durable truth says multi-box, but box_detail is missing them → the 0001779 class.
      if (billed) billedFlag.push({ ...record, klass: "MS-B(billed)" });
      else msB.push(record);
    }
    // else: single-box base, or truth unknown → nothing to split. skip.
  }

  // ────────────────────────────── REPORT ──────────────────────────────
  log(`momo_box_detail bases: ${boxDetailByBase.size} · container_closed truth bases: ${truthByBase.size}`);
  log(`tb_forwarder bases matched: ${fwdByBase.size}\n`);

  // MS-A
  log("───────────────────────────────────────────────────────────────────────");
  log(`MS-A · SPLITTABLE-NOW (box_detail has >1 box · bare aggregate · no sibling · UNBILLED): ${msA.length}`);
  log(`   FIX = run the split backfill; box_detail is already complete.`);
  log(`   node --env-file=.env.local scripts/split-aggregated-momo-boxes-2026-07-02.ts   (DRY-RUN → --priced --apply)`);
  log("───────────────────────────────────────────────────────────────────────");
  for (const r of msA.sort((a, b) => b.truthBoxes - a.truthBoxes)) {
    log(`  fwd ${r.id} | ${r.base} | ${r.userid} | fstatus=${r.fstatus} | famount=${r.famount} fweight=${r.fweight} fvolume=${r.fvolume} price=${r.ftotalprice}`);
    log(`      box_detail boxes=${r.bdCount} · durable(track_details) boxes=${r.truthBoxes} · cabinet=${r.cabinet || "—"}${r.hasRef ? " · ⚠ reforder=" + r.reforder : ""}`);
  }
  log("");

  // MS-B
  log("───────────────────────────────────────────────────────────────────────");
  log(`MS-B · BOX_DETAIL-INCOMPLETE = the 0001779 class (durable truth >1 box · box_detail ≤1 · bare aggregate famount>1 · UNBILLED): ${msB.length}`);
  log(`   FIX = rebuild momo_box_detail from container_closed.track_details (convention-verified) FIRST, then split.`);
  log(`   (the splitter CANNOT create the missing box — box_detail must be seeded first.)`);
  log("───────────────────────────────────────────────────────────────────────");
  for (const r of msB.sort((a, b) => b.truthBoxes - a.truthBoxes)) {
    log(`  fwd ${r.id} | ${r.base} | ${r.userid} | fstatus=${r.fstatus} | famount=${r.famount} fweight=${r.fweight} fvolume=${r.fvolume} price=${r.ftotalprice}`);
    log(`      box_detail boxes=${r.bdCount} · durable(track_details) boxes=${r.truthBoxes} · cabinet=${r.cabinet || "—"}${r.hasRef ? " · ⚠ reforder=" + r.reforder : ""}`);
  }
  log("");

  // billed / owner-review
  log("───────────────────────────────────────────────────────────────────────");
  log(`OWNER-REVIEW · stranded aggregate but BILLED (fstatus 5/6/7 · do NOT auto-fix · ยกเลิกบิล+คืนเงินก่อน): ${billedFlag.length}`);
  log("───────────────────────────────────────────────────────────────────────");
  for (const r of billedFlag) {
    log(`  fwd ${r.id} | ${r.base} | ${r.userid} | fstatus=${r.fstatus} 🔴BILLED | ${r.klass} | famount=${r.famount} price=${r.ftotalprice} | box_detail=${r.bdCount} durable=${r.truthBoxes}`);
  }
  log("");

  // ── FOCUS dumps (the ภูม-reported base + any FOCUS=… extras) ──
  log("═══════════════════════════════════════════════════════════════════════");
  log("FOCUS — side-by-side (tb_forwarder · momo_box_detail · container_closed truth)");
  log("   ⭐ Read the CONVENTION here: compare a box's track_details.kg÷qty vs its");
  log("      momo_box_detail.weight_kg — that resolves per-piece-vs-box-total before");
  log("      any box_detail rebuild (see the handoff doc §5).");
  log("═══════════════════════════════════════════════════════════════════════");
  for (const base of FOCUS_BASES) {
    log(`\n▸ base ${base}`);
    const fwd = (fwdByBase.get(base) ?? []).sort((a, b) => suffixOf(a.ftrackingchn) - suffixOf(b.ftrackingchn));
    log(`  tb_forwarder rows: ${fwd.length}`);
    for (const r of fwd) {
      log(`    fwd ${r.id} | ${r.ftrackingchn} | fstatus=${r.fstatus} famount=${Math.round(num(r.famount))} famountcount=${r.famountcount ?? ""} fweight=${num(r.fweight)} fvolume=${num(r.fvolume)} price=${num(r.ftotalprice)} reforder='${r.reforder || ""}' cabinet='${r.fcabinetnumber || ""}'`);
    }
    const bd = boxDetailByBase.get(base) ?? [];
    log(`  momo_box_detail boxes: ${bd.length}`);
    for (const b of bd.sort((a, z) => suffixOf(a.box_tracking) - suffixOf(z.box_tracking))) {
      const qty = piecesOf(b.quantity);
      log(`    box ${b.box_tracking} | weight_kg=${num(b.weight_kg)} (×qty=${qty} → ${r2(num(b.weight_kg) * qty)}) | cbm=${num(b.cbm)} (×qty → ${r6(num(b.cbm) * qty)}) | dims=${num(b.width)}x${num(b.length)}x${num(b.height)}`);
    }
    const truth = truthByBase.get(base);
    log(`  container_closed.track_details (DURABLE truth): ${truth ? truth.size : 0} box(es)`);
    if (truth) {
      let sumKg = 0, sumCbm = 0, sumQty = 0;
      for (const t of Array.from(truth.values()).sort((a, z) => suffixOf(a.reTrack) - suffixOf(z.reTrack))) {
        sumKg += t.kg; sumCbm += t.cbm; sumQty += t.qty;
        log(`    reTrack ${t.reTrack} | kg=${t.kg} | cbm=${t.cbm} | dims=${t.width}x${t.length}x${t.height} | total_quantity=${t.qty} | cid=${t.cid || "—"}`);
      }
      log(`    Σ track_details: kg=${r2(sumKg)} cbm=${r6(sumCbm)} qty=${sumQty}   ← compare to the bare fweight/fvolume/famount above`);
    }
  }

  log("\n✅ Audit done (READ-ONLY · nothing was written).");
  console.log(out.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
