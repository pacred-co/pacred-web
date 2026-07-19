/**
 * scripts/reprice-stale-cargo-comparison-2026-07-10.mjs
 *
 * Problem (ภูม 2026-07-10 · money-path):
 *   Orders imported BEFORE the 2026-07-08 "ค่าเทียบ 250 = SYSTEM DEFAULT" change
 *   were priced with the old 2026-06-23 "default = คิดตามคิว (CBM)" rule. Dense
 *   cargo (KGPerCBM > 250) was billed by CBM (the CHEAPER basis) instead of by
 *   weight — e.g. #52184 (LJ20464732): 110kg / 0.29952คิว = 367 KGPerCBM stored
 *   CBM ฿1,108.22 when it should be weight ฿1,650 (110 × ฿15). The forwarder
 *   detail preview (per-tracking editor) already computes the CORRECT weight
 *   price; only the STORED ftotalprice is stale.
 *
 * The APP is already correct — commit-momo-row-core.ts → computeAndFillForwarder
 * ImportRate runs the CURRENT resolver (comparisonEnabled=true always, threshold
 * clamped to 250) so EVERY order imported after 2026-07-08 prices dense cargo by
 * weight. This script REPLAYS that CURRENT logic over the already-priced-but-
 * stale rows and rewrites ONLY the three transport-rate columns.
 *
 * Scope (RE-PRICE already-priced rows whose basis/price is now stale):
 *   (fwarehousename='8' OR fidorco ILIKE 'MO%')   — MOMO cargo
 *   AND fstatus NOT IN ('0','5','6','7')          — skip cancelled + BILLED rows
 *   AND customrate <> '1'                          — never touch a manual override
 *   AND frefrate > 0                               — already priced (stale, not blank)
 *   AND the recomputed price DIFFERS from the stored ftotalprice by > ฿0.01
 *
 * MONEY-ISOLATION: writes ONLY frefrate / frefprice / ftotalprice. Never
 *   userid / status / wallet / commission / selling totals / any adder. Never
 *   persists a silent ฿0 (a row whose rate resolves missing is SKIPPED). Never
 *   touches a BILLED row (an invoice was raised on its ftotalprice — changing it
 *   retroactively is a manual accounting decision, not a bulk rewrite).
 *
 * ⚠️ DRIFT CONTRACT — the pure resolver below is an inline mirror of
 *   lib/forwarder/resolve-rate.ts (server-only live-rate.ts can't be imported by
 *   plain node). It reproduces the CURRENT decision (comparisonEnabled=true,
 *   clampComparison→250, the comparison KG-vs-CBM branch). It intentionally does
 *   NOT model the owner-locked doc-tier discount (ฝากโอน + ใบกำกับ · −฿800/คิว) —
 *   those orders are re-priced when the pricer saves, not here. Any edit to the
 *   canonical money formula MUST be mirrored here.
 *
 * Per AGENTS.md §11 — dry-run FIRST (prints the full before→after table + the Σ
 *   delta), then --apply. Idempotent: a re-run after --apply finds no diff.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/reprice-stale-cargo-comparison-2026-07-10.mjs           # dry-run
 *   node --env-file=.env.local scripts/reprice-stale-cargo-comparison-2026-07-10.mjs --apply   # UPDATE
 *   node --env-file=.env.local scripts/reprice-stale-cargo-comparison-2026-07-10.mjs --only 52184  # one row
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const ONLY_IDX = process.argv.indexOf("--only");
const ONLY_ID = ONLY_IDX >= 0 ? Number(process.argv[ONLY_IDX + 1]) : null;
const MAX_ROWS = 8000;

// ── numeric coercion ──
function n(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}
const round2 = (x) => Math.round(x * 100) / 100;

// coid.ts :: isGeneralCoid
const GENERAL_COID = "PR";
function isGeneralCoid(coid) {
  const c = (coid ?? "").toString().trim();
  return c === "" || c === GENERAL_COID || c === "PCS";
}

// resolve-rate.ts :: clampComparison — 0/blank → 250 (default), else [250, 350].
const COMPARISON_DEFAULT = 250, COMPARISON_MIN = 250, COMPARISON_MAX = 350;
function clampComparison(v) {
  const x = n(v);
  if (!(x > 0)) return COMPARISON_DEFAULT;
  return Math.max(COMPARISON_MIN, Math.min(x, COMPARISON_MAX));
}

// resolve-rate.ts :: generalTierRate
function generalTierRate(basis, value, tiers) {
  if (!tiers) return 0;
  if (basis === "kg") {
    if (value <= 100) return n(tiers.tier1);
    if (value > 100 && value < 500) return n(tiers.tier2);
    return n(tiers.tier3);
  }
  if (value <= 2) return n(tiers.tier1);
  if (value > 2 && value < 5) return n(tiers.tier2);
  return n(tiers.tier3);
}

// resolve-rate.ts :: rateForBasis (customrate='1' rows are excluded from scope).
function rateForBasis(basis, c, value) {
  if (c.isSvip) {
    const rate = basis === "kg" ? n(c.svipKg) : n(c.svipCbm);
    return { rate, source: "svip", compare2: false };
  }
  if (c.isGeneral) {
    const rate = generalTierRate(basis, value, basis === "kg" ? c.generalKg : c.generalCbm);
    return { rate, source: "general", compare2: false };
  }
  if (basis === "kg") {
    const rKg = n(c.vipKg);
    if (rKg === 0) return { rate: n(c.vipCbm), source: "vip", compare2: true };
    return { rate: rKg, source: "vip", compare2: false };
  }
  return { rate: n(c.vipCbm), source: "vip", compare2: false };
}

// resolve-rate.ts :: resolveForwarderRate — CURRENT logic: comparisonEnabled is
// ALWAYS on (2026-07-08), threshold clamped to 250. Dense (KGPerCBM > threshold)
// → bill by weight; else by CBM. (No doc-tier discount — see DRIFT CONTRACT.)
function resolveForwarderRate(candidates, input) {
  const weight = n(input.weightKg);
  const cbm = n(input.volumeCbm);
  const kgPerCbm = cbm !== 0 ? weight / cbm : 0;
  // SHIPMENT-level ค่าเทียบ (owner 2026-07-19): decide KG-vs-CBM on the shipment-total
  // density when the caller supplies it (comparisonKgPerCbm > 0), else this row's own —
  // mirror of resolve-rate.ts L362-367. The BILLED amount still uses the row's own w/cbm.
  const decisionKgPerCbm =
    Number.isFinite(input.comparisonKgPerCbm) && input.comparisonKgPerCbm > 0
      ? input.comparisonKgPerCbm
      : kgPerCbm;
  const threshold = clampComparison(input.comparisonValue);

  if (decisionKgPerCbm > threshold) {
    // bill by KG (refPrice=1)
    let value = weight;
    const probe = rateForBasis("kg", candidates, value);
    if (probe.compare2) value = cbm; // legacy VIP KG→CBM fallback
    const finalBasis = probe.compare2 ? "cbm" : "kg";
    const r = finalBasis === "kg" ? probe : rateForBasis("cbm", candidates, value);
    return { rate: r.rate, basis: finalBasis, source: r.source, transportSubtotal: round2(value * r.rate), refPrice: 1, rateMissing: r.rate === 0 };
  }
  // bill by CBM (refPrice=2)
  const value = cbm;
  const r = rateForBasis("cbm", candidates, value);
  return { rate: r.rate, basis: "cbm", source: r.source, transportSubtotal: round2(value * r.rate), refPrice: 2, rateMissing: r.rate === 0 };
}

// live-rate.ts :: resolveLiveForwarderRate SQL waterfall (candidate probe).
async function resolveCandidates(sb, row, coID) {
  const wh = String(row.fwarehousechina ?? "").trim();
  const tt = String(row.ftransporttype ?? "").trim();
  const pt = String(row.fproductstype ?? "").trim() || "1";
  const isGeneral = isGeneralCoid(coID);
  const candidates = { isSvip: false, svipKg: null, svipCbm: null, isGeneral, generalKg: null, generalCbm: null, vipKg: null, vipCbm: null };

  const { data: svipProbe } = await sb.from("tb_rate_custom_cbm").select("id").eq("userid", row.userid).limit(1).maybeSingle();
  candidates.isSvip = svipProbe != null;
  if (candidates.isSvip) {
    const { data: sKg } = await sb.from("tb_rate_custom_kg").select("rkg").eq("userid", row.userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    const { data: sCbm } = await sb.from("tb_rate_custom_cbm").select("rcbm").eq("userid", row.userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    candidates.svipKg = sKg?.rkg ?? null; candidates.svipCbm = sCbm?.rcbm ?? null;
  } else if (isGeneral) {
    const { data: gKg } = await sb.from("tb_rate_g_kg").select("rgkg1, rgkg2, rgkg3").eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt).maybeSingle();
    const { data: gCbm } = await sb.from("tb_rate_g_cbm").select("rgcbm1, rgcbm2, rgcbm3").eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt).maybeSingle();
    candidates.generalKg = gKg ? { tier1: gKg.rgkg1, tier2: gKg.rgkg2, tier3: gKg.rgkg3 } : null;
    candidates.generalCbm = gCbm ? { tier1: gCbm.rgcbm1, tier2: gCbm.rgcbm2, tier3: gCbm.rgcbm3 } : null;
  } else {
    const { data: vKg } = await sb.from("tb_rate_vip_kg").select("rkg").eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    const { data: vCbm } = await sb.from("tb_rate_vip_cbm").select("rcbm").eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    candidates.vipKg = vKg?.rkg ?? null; candidates.vipCbm = vCbm?.rcbm ?? null;
  }
  return candidates;
}

const fmt = (v, w) => String(v).padEnd(w).slice(0, w);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("✗ missing SUPABASE env (run with `node --env-file=.env.local`)"); process.exit(1); }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log("───────────────────────────────────────────────────────────────");
  console.log(`re-price stale cargo (ค่าเทียบ 250) · mode = ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}${ONLY_ID ? ` · only fid ${ONLY_ID}` : ""}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  const PAGE = 1000;
  const candidatesRows = [];
  let scanned = 0;
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = sb.from("tb_forwarder")
      .select("id, ftrackingchn, fidorco, userid, fweight, fvolume, famount, famountcount, fwarehousechina, ftransporttype, fproductstype, frefrate, frefprice, ftotalprice, customrate, fwarehousename, fstatus")
      .neq("fstatus", "0").not("fstatus", "in", "(6,7)") // 1-5 · fstatus=5 w/o an invoice is still un-collected (owner 2026-07-19); real "billed" = on-invoice (checked below) OR 6/7
      .order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (ONLY_ID) q = q.eq("id", ONLY_ID);
    else q = q.or("fwarehousename.eq.8,fwarehousename.eq.9,fidorco.ilike.MO%"); // +TTW(9) อี้อู · owner 2026-07-19
    const { data: page, error } = await q;
    if (error) { console.error("✗ select failed:", error.message); process.exit(1); }
    const rows = page ?? [];
    scanned += rows.length;
    for (const r of rows) {
      if (String(r.customrate ?? "0").trim() === "1") continue; // never touch manual
      if (n(r.frefrate) <= 0) continue;                          // blank → the other backfill handles it
      candidatesRows.push(r);
    }
    if (rows.length < PAGE || ONLY_ID) break;
  }
  // NEVER re-price a row already on a real invoice (an invoice was raised on its
  // ftotalprice — changing it retroactively is an accounting decision). fstatus=5
  // without an invoice = queued for payment but NOT yet billed → safe to fix.
  {
    const allF = candidatesRows.map((r) => r.id);
    const invoiced = new Set();
    for (let i = 0; i < allF.length; i += 500) {
      const { data: ii, error: iErr } = await sb.from("tb_forwarder_invoice_item").select("forwarder_id").in("forwarder_id", allF.slice(i, i + 500));
      if (iErr) { console.error("✗ invoice_item read:", iErr.message); process.exit(1); }
      for (const x of ii ?? []) invoiced.add(x.forwarder_id);
    }
    const before = candidatesRows.length;
    for (let i = candidatesRows.length - 1; i >= 0; i--) if (invoiced.has(candidatesRows[i].id)) candidatesRows.splice(i, 1);
    console.log(`on-invoice (skipped · already billed): ${before - candidatesRows.length}`);
  }

  console.log(`scanned: ${scanned} · already-priced system rows (candidates): ${candidatesRows.length}\n`);
  if (candidatesRows.length === 0) { console.log("Nothing to re-price. ✓"); return; }

  // ── SHIPMENT grouping (owner 2026-07-19: "เก็บตามชิปเม้น ไม่ใช่แยกแทรค") ──
  // A shipment = the tb_forwarder_tran_th_sub batch (ftthhid) — the SAME grouping the
  // customer "รวมทุกแทรคกิง" summary uses. The ค่าเทียบ (KG-vs-CBM) decision is made on
  // the shipment TOTAL density; each row is then billed by its OWN weight/cbmProduct at
  // the chosen basis (Σ rows = shipment total). Rows with no sub-batch = own shipment.
  const allFids = candidatesRows.map((r) => r.id);
  const subMap = new Map(); // fid → ftthhid
  for (let i = 0; i < allFids.length; i += 500) {
    const { data: subs, error: subErr } = await sb.from("tb_forwarder_tran_th_sub").select("fid, ftthhid").in("fid", allFids.slice(i, i + 500));
    if (subErr) { console.error("✗ tran_th_sub read:", subErr.message); process.exit(1); }
    for (const s of subs ?? []) if (s.ftthhid != null && s.ftthhid !== "") subMap.set(s.fid, String(s.ftthhid));
  }
  const shipKey = (r) => (subMap.has(r.id) ? `S${subMap.get(r.id)}` : `R${r.id}`);
  const cbmProductOf = (r) => { const fc = r.famountcount == null ? "" : String(r.famountcount).trim(); const v = n(r.fvolume); return fc === "1" ? v : v * n(r.famount); };
  const shipAgg = new Map(); // key → { w, cbm }
  for (const r of candidatesRows) { const k = shipKey(r); const a = shipAgg.get(k) ?? { w: 0, cbm: 0 }; a.w += n(r.fweight); a.cbm += cbmProductOf(r); shipAgg.set(k, a); }
  const shipDensity = (r) => { const a = shipAgg.get(shipKey(r)); return a && a.cbm > 0 ? a.w / a.cbm : 0; };
  console.log(`shipments (sub-batches): ${new Set(candidatesRows.map(shipKey)).size}\n`);

  const coCache = new Map();
  async function coIDFor(userid) {
    if (coCache.has(userid)) return coCache.get(userid);
    const { data: u } = await sb.from("tb_users").select("coID, userComparisonValue").eq("userID", userid).maybeSingle();
    const val = { coID: (u?.coID ?? "").toString().trim() || GENERAL_COID, comparisonValue: n(u?.userComparisonValue) };
    coCache.set(userid, val); return val;
  }

  console.log(fmt("fid", 8) + fmt("tracking", 20) + fmt("stored", 12) + fmt("→ correct", 12) + fmt("Δ", 11) + "basis (was→now)");
  console.log("─".repeat(90));

  let diffCount = 0, skipMissing = 0, wrote = 0, failed = 0, deltaSum = 0;
  for (const r of candidatesRows) {
    const meta = await coIDFor(r.userid);
    const cand = await resolveCandidates(sb, r, meta.coID);
    const famountCount = r.famountcount == null ? "" : String(r.famountcount).trim();
    const fvolume = n(r.fvolume);
    const cbmProduct = famountCount === "1" ? fvolume : fvolume * n(r.famount);
    // SHIPMENT-level ค่าเทียบ: decide KG-vs-CBM on the shipment-total density, bill the
    // row on its own weight/cbm (resolve-rate.ts comparisonKgPerCbm · ภูม 2026-06-18).
    const resolved = resolveForwarderRate(cand, { weightKg: n(r.fweight), volumeCbm: cbmProduct, comparisonValue: meta.comparisonValue, comparisonKgPerCbm: shipDensity(r) });
    if (resolved.rateMissing || resolved.rate <= 0) { skipMissing++; continue; }

    // owner 2026-07-19 · TARGETED: only fix the genuine bug — a row billed by WEIGHT
    // (frefprice='1') on a shipment the ค่าเทียบ says is CBM (ของเบา · density < 250).
    // Deliberately SKIP same-basis rows: (a) already-CBM rows churning by ฿0.20 rounding,
    // (b) ฿50-minimum kg rows the raw w×rate would push BELOW the min (no min-floor here).
    // A KG→CBM flip on bulky cargo is always well above any min, so it's collateral-free.
    const wasKg = String(r.frefprice) === "1";
    if (!(wasKg && resolved.basis === "cbm")) continue;

    const stored = n(r.ftotalprice);
    const correct = resolved.transportSubtotal;
    if (Math.abs(correct - stored) <= 0.01) continue; // already correct

    diffCount++;
    const delta = round2(correct - stored);
    deltaSum = round2(deltaSum + delta);
    const wasBasis = String(r.frefprice) === "1" ? "kg" : "cbm";
    console.log(
      fmt(r.id, 8) + fmt(r.ftrackingchn ?? "-", 20) + fmt(stored.toFixed(2), 12) + fmt(correct.toFixed(2), 12) +
      fmt((delta >= 0 ? "+" : "") + delta.toFixed(2), 11) + `${wasBasis}→${resolved.basis}`,
    );

    if (APPLY) {
      const { error: uErr } = await sb.from("tb_forwarder")
        .update({ frefrate: resolved.rate, frefprice: String(resolved.refPrice), ftotalprice: resolved.transportSubtotal })
        .eq("id", r.id);
      if (uErr) { failed++; console.error(`   ✗ update id=${r.id} failed: ${uErr.message}`); } else wrote++;
    }
  }

  console.log("\n───────────────────────────────────────────────────────────────");
  console.log(`candidates: ${candidatesRows.length} · STALE (would re-price): ${diffCount} · skip(no rate): ${skipMissing}`);
  console.log(`Σ price delta on stale rows: ${deltaSum >= 0 ? "+" : ""}${deltaSum.toFixed(2)} บาท (positive = recovered under-charge)`);
  if (APPLY) console.log(`APPLIED: wrote ${wrote} · failed ${failed}`);
  else console.log(`DRY-RUN — no rows written. Re-run with --apply (or --only <fid>) to write.`);
  console.log("───────────────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exit(1); });
