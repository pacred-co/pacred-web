/**
 * scripts/backfill-momo-forwarder-rates.mjs
 *
 * Problem (พี่ป๊อป / money-path):
 *   MOMO-imported tb_forwarder rows (committed via lib/admin/commit-momo-row-core.ts
 *   BEFORE the auto-pricing wire-in) landed with frefrate=0 / frefprice='0' /
 *   ftotalprice=0 — the commit never ran the China→Thailand rate waterfall. The
 *   admin detail page then shows "ไม่พบข้อมูล" + ฿0.00 for those orders.
 *
 * Fix: replay the SAME rate waterfall the app now runs at commit time
 *   (lib/forwarder/live-rate.ts :: computeAndFillForwarderImportRate, whose
 *   decision logic is lib/forwarder/resolve-rate.ts) over the already-imported
 *   blank rows, and fill ONLY the three transport-rate columns.
 *
 * Scope (fill BLANKS only — NEVER touch a row that already has a rate):
 *   (fwarehousename='8' OR fidorco ILIKE 'MO%')
 *   AND (frefrate IS NULL OR frefrate=0 OR frefrate='0')
 *   AND fstatus <> '0'                       (skip cancelled/void rows)
 *
 * MONEY-ISOLATION: writes ONLY frefrate / frefprice / ftotalprice. Never
 *   userid / status / wallet / commission / selling totals / any adder. Never
 *   persists a silent ฿0 — a row whose rate resolves to 0 / missing is SKIPPED.
 *
 * Per AGENTS.md §11 — dry-run + (no destructive op here, fill-only) FIRST,
 *   then --apply. Dry-run prints the full WOULD-WRITE table; --apply UPDATEs.
 *   Idempotent: re-running after --apply re-selects only rows still at 0, so
 *   already-filled rows are never reconsidered.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/backfill-momo-forwarder-rates.mjs           # dry-run (default)
 *   node --env-file=.env.local scripts/backfill-momo-forwarder-rates.mjs --apply   # actually UPDATE
 *
 * (Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env —
 *  pass them via `node --env-file=.env.local` as shown.)
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const MAX_ROWS = 4000; // cap a few thousand

// ────────────────────────────────────────────────────────────
// Pure helpers — faithful inline copy of lib/forwarder/resolve-rate.ts.
// (`live-rate.ts` is `server-only`, but resolve-rate.ts itself is NOT — if this
//  script is ever run via `tsx` instead of plain node, IMPORT the canonical pure
//  helpers from "@/lib/forwarder/resolve-rate" directly to ELIMINATE this drift
//  twin. ⚠️ DRIFT CONTRACT (audit 2026-06-14 #4): the canonical resolver has 49
//  unit tests, this mirror has ZERO — any edit to resolve-rate.ts's money formula
//  (tier boundaries · priceCbm>=priceKg tie-favours-CBM · round2 · VIP KG→CBM
//  fallback) MUST be mirrored here or the backfill math silently diverges.)
// ────────────────────────────────────────────────────────────
function n(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}
const round2 = (x) => Math.round(x * 100) / 100;

// coid.ts :: isGeneralCoid — 'PR' (canonical) | 'PCS' (legacy alias) | empty.
const GENERAL_COID = "PR";
function isGeneralCoid(coid) {
  const c = (coid ?? "").toString().trim();
  return c === "" || c === GENERAL_COID || c === "PCS";
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

// resolve-rate.ts :: rateForBasis (manual override never applies here — MOMO
// rows have customrate='0', so we only model SVIP / general / VIP).
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

// resolve-rate.ts :: resolveForwarderRate
function resolveForwarderRate(candidates, input) {
  const weight = n(input.weightKg);
  const cbm = n(input.volumeCbm);
  const kgPerCbm = cbm !== 0 ? weight / cbm : 0;
  const comparisonOn = !!input.comparisonEnabled;
  const threshold = n(input.comparisonValue);

  if (comparisonOn) {
    if (kgPerCbm > threshold) {
      let value = weight;
      const probe = rateForBasis("kg", candidates, value);
      if (probe.compare2) value = cbm;
      const finalBasis = probe.compare2 ? "cbm" : "kg";
      const r = finalBasis === "kg" ? probe : rateForBasis("cbm", candidates, value);
      const rate = r.rate;
      return { rate, basis: finalBasis, source: r.source, transportSubtotal: round2(value * rate), refPrice: 1, rateMissing: rate === 0 };
    }
    const value = cbm;
    const r = rateForBasis("cbm", candidates, value);
    return { rate: r.rate, basis: "cbm", source: r.source, transportSubtotal: round2(value * r.rate), refPrice: 2, rateMissing: r.rate === 0 };
  }

  // "ราคามากสุด" — no comparison. priceCBM >= priceKg → CBM (ties favour CBM).
  const kgProbe = rateForBasis("kg", candidates, weight);
  const cbmProbe = rateForBasis("cbm", candidates, cbm);
  const priceKg = round2(weight * kgProbe.rate);
  const priceCbm = round2(cbm * cbmProbe.rate);
  if (priceCbm >= priceKg) {
    return { rate: cbmProbe.rate, basis: "cbm", source: cbmProbe.source, transportSubtotal: priceCbm, refPrice: 2, rateMissing: cbmProbe.rate === 0 && kgProbe.rate === 0 };
  }
  return { rate: kgProbe.rate, basis: "kg", source: kgProbe.source, transportSubtotal: priceKg, refPrice: 1, rateMissing: kgProbe.rate === 0 && cbmProbe.rate === 0 };
}

// ────────────────────────────────────────────────────────────
// SQL waterfall — faithful inline copy of live-rate.ts :: resolveLiveForwarderRate.
// ────────────────────────────────────────────────────────────
async function resolveCandidates(sb, row, coID) {
  const wh = String(row.fwarehousechina ?? "").trim();
  const tt = String(row.ftransporttype ?? "").trim();
  const pt = String(row.fproductstype ?? "").trim() || "1";
  const isGeneral = isGeneralCoid(coID);

  const candidates = {
    isSvip: false, svipKg: null, svipCbm: null,
    isGeneral, generalKg: null, generalCbm: null,
    vipKg: null, vipCbm: null,
  };

  // SVIP probe — ANY tb_rate_custom_cbm row for the user → SVIP.
  const { data: svipProbe } = await sb
    .from("tb_rate_custom_cbm").select("id").eq("userid", row.userid).limit(1).maybeSingle();
  candidates.isSvip = svipProbe != null;

  if (candidates.isSvip) {
    const { data: svipKgRow } = await sb
      .from("tb_rate_custom_kg").select("rkg")
      .eq("userid", row.userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    const { data: svipCbmRow } = await sb
      .from("tb_rate_custom_cbm").select("rcbm")
      .eq("userid", row.userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    candidates.svipKg = svipKgRow?.rkg ?? null;
    candidates.svipCbm = svipCbmRow?.rcbm ?? null;
  } else if (isGeneral) {
    const { data: gKg } = await sb
      .from("tb_rate_g_kg").select("rgkg1, rgkg2, rgkg3")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt).maybeSingle();
    const { data: gCbm } = await sb
      .from("tb_rate_g_cbm").select("rgcbm1, rgcbm2, rgcbm3")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt).maybeSingle();
    candidates.generalKg = gKg ? { tier1: gKg.rgkg1, tier2: gKg.rgkg2, tier3: gKg.rgkg3 } : null;
    candidates.generalCbm = gCbm ? { tier1: gCbm.rgcbm1, tier2: gCbm.rgcbm2, tier3: gCbm.rgcbm3 } : null;
  } else {
    const { data: vKg } = await sb
      .from("tb_rate_vip_kg").select("rkg")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    const { data: vCbm } = await sb
      .from("tb_rate_vip_cbm").select("rcbm")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle();
    candidates.vipKg = vKg?.rkg ?? null;
    candidates.vipCbm = vCbm?.rcbm ?? null;
  }
  return candidates;
}

function fmt(v, w) {
  return String(v).padEnd(w).slice(0, w);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("✗ missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with `node --env-file=.env.local`)");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log("───────────────────────────────────────────────────────────────");
  console.log(`backfill MOMO forwarder import-rates · mode = ${APPLY ? "🔴 APPLY (will UPDATE)" : "🟡 DRY-RUN"}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  // ── Select blank MOMO rows. PostgREST OR across two predicates, plus the
  //    frefrate-is-blank OR group, plus fstatus<>'0'. Supabase `.or()` is one
  //    group; combine via two `.or()`-style filters expressed as `.or(...)`
  //    for the MOMO source and an explicit blank-rate `.or(...)`. To keep it
  //    simple + correct we fetch the MOMO superset then filter blanks in JS.
  // Paginate the MOMO superset — PostgREST caps EACH request at 1000 rows and
  // `.limit()` does NOT override that server cap (the first version silently saw
  // only the first 1000 MOMO rows → blanks beyond it, incl. some DPK siblings,
  // were missed). `.range()` page by page; filter blanks in JS per page.
  const PAGE = 1000;
  const blanks = [];
  let scanned = 0;
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data: page, error } = await sb
      .from("tb_forwarder")
      .select("id, ftrackingchn, fidorco, userid, fweight, fvolume, famount, famountcount, fwarehousechina, ftransporttype, fproductstype, frefrate, fwarehousename, fstatus")
      .or("fwarehousename.eq.8,fidorco.ilike.MO%")
      .neq("fstatus", "0")
      // Exclude already-BILLED rows (fstatus 5=billing raised / 6 / 7) — a backfill
      // must NOT retroactively change ftotalprice on a row an invoice was based on
      // (audit 2026-06-14 #3). An under-billed billed row is a manual accounting
      // decision, not a bulk rewrite. frefrate=0 alone is the already-priced guard
      // only for NON-billed rows.
      .not("fstatus", "in", "(5,6,7)")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error("✗ tb_forwarder select failed:", error.message); process.exit(1); }
    const pageRows = page ?? [];
    scanned += pageRows.length;
    for (const r of pageRows) {
      const rr = r.frefrate;
      if (rr === null || rr === undefined || n(rr) === 0 || String(rr).trim() === "0") blanks.push(r);
    }
    if (pageRows.length < PAGE) break; // last page reached
  }

  console.log(`MOMO rows scanned: ${scanned} · blank-rate (candidates): ${blanks.length}\n`);
  if (blanks.length === 0) {
    console.log("Nothing to backfill. ✓");
    return;
  }

  // Cache coID per user to avoid re-reading tb_users for every row.
  const coCache = new Map();
  async function coIDFor(userid) {
    if (coCache.has(userid)) return coCache.get(userid);
    const { data: u } = await sb.from("tb_users").select("coID, userComparison, userComparisonValue").eq("userID", userid).maybeSingle();
    const val = {
      coID: (u?.coID ?? "").toString().trim() || GENERAL_COID,
      comparison: String(u?.userComparison ?? "0").trim() === "1",
      comparisonValue: n(u?.userComparisonValue),
    };
    coCache.set(userid, val);
    return val;
  }

  console.log(
    fmt("fid", 8) + fmt("tracking", 22) + fmt("kg", 9) + fmt("cbm", 9) +
    fmt("rate", 10) + fmt("total", 12) + "basis/source",
  );
  console.log("─".repeat(86));

  let willWrite = 0, skipMissing = 0, wrote = 0, failed = 0;

  for (const r of blanks) {
    const userMeta = await coIDFor(r.userid);
    const candidates = await resolveCandidates(sb, r, userMeta.coID);

    // CBMProduct: famountcount==1 ? fvolume : fvolume*famount.
    const famountCount = r.famountcount == null ? "" : String(r.famountcount).trim();
    const fvolume = n(r.fvolume);
    const cbmProduct = famountCount === "1" ? fvolume : fvolume * n(r.famount);

    const resolved = resolveForwarderRate(candidates, {
      weightKg: n(r.fweight),
      volumeCbm: cbmProduct,
      comparisonEnabled: userMeta.comparison,
      comparisonValue: userMeta.comparisonValue,
    });

    if (resolved.rateMissing || resolved.rate <= 0) {
      skipMissing++;
      console.log(
        fmt(r.id, 8) + fmt(r.ftrackingchn ?? "-", 22) + fmt(n(r.fweight), 9) + fmt(round2(cbmProduct), 9) +
        fmt("—", 10) + fmt("SKIP (no rate)", 12) + "rate_missing",
      );
      continue;
    }

    willWrite++;
    console.log(
      fmt(r.id, 8) + fmt(r.ftrackingchn ?? "-", 22) + fmt(n(r.fweight), 9) + fmt(round2(cbmProduct), 9) +
      fmt(resolved.rate, 10) + fmt(resolved.transportSubtotal, 12) +
      `${resolved.basis}/${resolved.source}`,
    );

    if (APPLY) {
      const { error: updErr } = await sb
        .from("tb_forwarder")
        .update({
          frefrate:    resolved.rate,
          frefprice:   String(resolved.refPrice),
          ftotalprice: resolved.transportSubtotal,
        })
        .eq("id", r.id);
      if (updErr) { failed++; console.error(`   ✗ update id=${r.id} failed: ${updErr.message}`); }
      else wrote++;
    }
  }

  console.log("\n───────────────────────────────────────────────────────────────");
  console.log(`candidates: ${blanks.length} · would-write: ${willWrite} · skip(no rate): ${skipMissing}`);
  if (APPLY) console.log(`APPLIED: wrote ${wrote} · failed ${failed}`);
  else console.log(`DRY-RUN — no rows written. Re-run with --apply to write the ${willWrite} above.`);
  console.log("───────────────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exit(1); });
