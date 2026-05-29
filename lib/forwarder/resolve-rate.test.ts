// Unit tests for the LIVE forwarder rate resolver (lib/forwarder/resolve-rate.ts).
// Run: tsx lib/forwarder/resolve-rate.test.ts
//
// Faithful to forwarder.php `update_data` getPrice() waterfall + KG/CBM
// selection. Covers each waterfall branch (manual · SVIP · general-tiered ·
// VIP) + KG-vs-CBM selection (ราคามากสุด + comparison) + the SVIP-but-
// warehouse-missing edge (legacy returns rate 0 → rateMissing flag).
import { resolveForwarderRate, type ResolveRateCandidates, type ResolveRateInput } from "./resolve-rate";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  console.log(`${ok ? "✓" : "✗"} ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  if (ok) pass++; else fail++;
}
function near(label: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}  got=${got} want=${want}`);
  if (ok) pass++; else fail++;
}

// Helper: build a candidate set with everything "off" by default.
function cand(over: Partial<ResolveRateCandidates> = {}): ResolveRateCandidates {
  return {
    manualOverride: false, manualKg: null, manualCbm: null,
    isSvip: false, svipKg: null, svipCbm: null,
    isGeneral: false, generalKg: null, generalCbm: null,
    vipKg: null, vipCbm: null,
    ...over,
  };
}
function inp(over: Partial<ResolveRateInput> = {}): ResolveRateInput {
  return {
    weightKg: 0, volumeCbm: 0,
    comparisonEnabled: false, comparisonValue: null,
    ...over,
  };
}

// ── 1. Manual override — highest precedence (forwarder.php L1801-1818) ──
{
  // weight 300kg, cbm 1 → KGPerCBM=300; no comparison → ราคามากสุด.
  // manual KG=20 → priceKg=6000 ; manual CBM=5000 → priceCbm=5000 → KG wins.
  const r = resolveForwarderRate(
    cand({ manualOverride: true, manualKg: 20, manualCbm: 5000, isSvip: true, svipKg: 999, svipCbm: 999 }),
    inp({ weightKg: 300, volumeCbm: 1 }),
  );
  eq("manual: source=manual (beats SVIP)", r.source, "manual");
  eq("manual: basis=kg (6000>5000)", r.basis, "kg");
  near("manual: rate=20", r.rate, 20);
  near("manual: subtotal=6000", r.transportSubtotal, 6000);
  eq("manual: refPrice=1", r.refPrice, 1);
  eq("manual: rateMissing=false", r.rateMissing, false);
}

// ── 2. SVIP — per-user flat, beats general/VIP (forwarder.php L1906-1929) ──
{
  // SVIP KG=15, CBM=4000. weight 100, cbm 1 → priceKg=1500, priceCbm=4000 → CBM.
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: 15, svipCbm: 4000, isGeneral: true, generalKg: { tier1: 99, tier2: 99, tier3: 99 } }),
    inp({ weightKg: 100, volumeCbm: 1 }),
  );
  eq("svip: source=svip (beats general)", r.source, "svip");
  eq("svip: basis=cbm (4000>1500)", r.basis, "cbm");
  near("svip: rate=4000", r.rate, 4000);
  near("svip: subtotal=4000", r.transportSubtotal, 4000);
  eq("svip: refPrice=2", r.refPrice, 2);
}

// ── 3a. General tiered KG — tier boundaries (forwarder.php L1845-1862) ──
{
  const g = { generalKg: { tier1: 50, tier2: 40, tier3: 30 } as const, generalCbm: { tier1: 0, tier2: 0, tier3: 0 } as const };
  // value<=100 → tier1
  let r = resolveForwarderRate(cand({ isGeneral: true, ...g }), inp({ weightKg: 100, volumeCbm: 1 }));
  near("general KG tier1 (w=100 → rate 50)", r.rate, 50);
  eq("general KG tier1 basis=kg", r.basis, "kg");
  // value>100 && value<500 → tier2
  r = resolveForwarderRate(cand({ isGeneral: true, ...g }), inp({ weightKg: 300, volumeCbm: 1 }));
  near("general KG tier2 (w=300 → rate 40)", r.rate, 40);
  // value>=500 → tier3
  r = resolveForwarderRate(cand({ isGeneral: true, ...g }), inp({ weightKg: 500, volumeCbm: 1 }));
  near("general KG tier3 (w=500 → rate 30)", r.rate, 30);
}

// ── 3b. General tiered CBM — tier boundaries (forwarder.php L1863-1880) ──
{
  // Make CBM win by zeroing KG. cbm<=2 → tier1 ; >2&&<5 → tier2 ; >=5 → tier3.
  const base = (over: Partial<ResolveRateCandidates>) => cand({ isGeneral: true, generalKg: { tier1: 0, tier2: 0, tier3: 0 }, ...over });
  const g = { generalCbm: { tier1: 5000, tier2: 4500, tier3: 4000 } as const };
  let r = resolveForwarderRate(base(g), inp({ weightKg: 1, volumeCbm: 2 }));
  near("general CBM tier1 (cbm=2 → 5000)", r.rate, 5000);
  eq("general CBM basis=cbm", r.basis, "cbm");
  r = resolveForwarderRate(base(g), inp({ weightKg: 1, volumeCbm: 3 }));
  near("general CBM tier2 (cbm=3 → 4500)", r.rate, 4500);
  r = resolveForwarderRate(base(g), inp({ weightKg: 1, volumeCbm: 5 }));
  near("general CBM tier3 (cbm=5 → 4000)", r.rate, 4000);
}

// ── 4. VIP group flat (forwarder.php L1883-1905) ──
{
  // VIP KG=12, CBM=3500. weight 100, cbm 1 → priceKg=1200, priceCbm=3500 → CBM.
  const r = resolveForwarderRate(
    cand({ isGeneral: false, vipKg: 12, vipCbm: 3500 }),
    inp({ weightKg: 100, volumeCbm: 1 }),
  );
  eq("vip: source=vip", r.source, "vip");
  eq("vip: basis=cbm (3500>1200)", r.basis, "cbm");
  near("vip: rate=3500", r.rate, 3500);
}

// ── 4b. VIP KG-rate==0 → CBM fallback (compare2) under comparison (L1890-1896) ──
{
  // comparison ON, threshold 150, KGPerCBM = 300/1 = 300 > 150 → KG branch.
  // But VIP rKG=0 → fallback to rCBM=3000, switch value to CBMProduct(=1).
  const r = resolveForwarderRate(
    cand({ isGeneral: false, vipKg: 0, vipCbm: 3000 }),
    inp({ weightKg: 300, volumeCbm: 1, comparisonEnabled: true, comparisonValue: 150 }),
  );
  eq("vip-fallback: basis flips to cbm", r.basis, "cbm");
  near("vip-fallback: rate=3000 (rCBM)", r.rate, 3000);
  near("vip-fallback: subtotal = 1*3000", r.transportSubtotal, 3000);
}

// ── 5. KG vs CBM selection — ราคามากสุด picks the LARGER total (L1993) ──
{
  // SVIP KG=50, CBM=2000. weight 50 → priceKg=2500 ; cbm 1 → priceCbm=2000.
  // priceCbm(2000) >= priceKg(2500)? NO → KG wins.
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: 50, svipCbm: 2000 }),
    inp({ weightKg: 50, volumeCbm: 1 }),
  );
  eq("ราคามากสุด: KG wins (2500>2000)", r.basis, "kg");
  near("ราคามากสุด: subtotal=2500", r.transportSubtotal, 2500);
  eq("ราคามากสุด: refPrice=1", r.refPrice, 1);
}

// ── 5b. KG vs CBM tie → CBM wins (legacy `>=`, L1993) ──
{
  // SVIP KG=10 (×100=1000), CBM=1000 (×1=1000) → tie → priceCbm>=priceKg → CBM.
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: 10, svipCbm: 1000 }),
    inp({ weightKg: 100, volumeCbm: 1 }),
  );
  eq("tie → CBM (legacy >=)", r.basis, "cbm");
  near("tie subtotal=1000", r.transportSubtotal, 1000);
}

// ── 6. Comparison ON, KGPerCBM > threshold → KG (forwarder.php L1947-1968) ──
{
  // weight 400, cbm 1 → KGPerCBM=400 > 200 → KG. SVIP KG=30 → 400*30=12000.
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: 30, svipCbm: 99999 }),
    inp({ weightKg: 400, volumeCbm: 1, comparisonEnabled: true, comparisonValue: 200 }),
  );
  eq("comparison>thr: basis=kg", r.basis, "kg");
  near("comparison>thr: subtotal=12000 (ignores higher CBM)", r.transportSubtotal, 12000);
  eq("comparison>thr: refPrice=1", r.refPrice, 1);
}

// ── 6b. Comparison ON, KGPerCBM <= threshold → CBM ──
{
  // weight 100, cbm 1 → KGPerCBM=100 <= 200 → CBM. SVIP CBM=5000.
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: 99999, svipCbm: 5000 }),
    inp({ weightKg: 100, volumeCbm: 1, comparisonEnabled: true, comparisonValue: 200 }),
  );
  eq("comparison<=thr: basis=cbm", r.basis, "cbm");
  near("comparison<=thr: subtotal=5000 (ignores higher KG)", r.transportSubtotal, 5000);
}

// ── 6c. customComparison forces threshold 200 (fresh) / 150 (refOrder) ──
{
  // KGPerCBM = 175. fresh → thr 200 → 175<=200 → CBM. refOrder → thr 150 → 175>150 → KG.
  const c = cand({ isSvip: true, svipKg: 10, svipCbm: 5000 });
  const fresh = resolveForwarderRate(c, inp({ weightKg: 175, volumeCbm: 1, customComparison: true, hasRefOrder: false }));
  eq("customComparison fresh (thr200): CBM", fresh.basis, "cbm");
  const linked = resolveForwarderRate(c, inp({ weightKg: 175, volumeCbm: 1, customComparison: true, hasRefOrder: true }));
  eq("customComparison refOrder (thr150): KG", linked.basis, "kg");
}

// ── 7. SVIP-but-warehouse-missing EDGE → rate 0 → rateMissing flag ──
//      (legacy: getPrice() returns rate 0 when the per-user row for the tuple
//       is absent · $error[] 'ไม่มีเรทราคา … SVIP'; the save writes fTotalPrice 0.)
{
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: null, svipCbm: null }), // no row for this warehouse/tuple
    inp({ weightKg: 100, volumeCbm: 1 }),
  );
  near("svip-missing: rate=0", r.rate, 0);
  near("svip-missing: subtotal=0", r.transportSubtotal, 0);
  eq("svip-missing: rateMissing=TRUE (flag, do not persist silently)", r.rateMissing, true);
}

// ── 7b. General-missing (no tier rows) → rateMissing ──
{
  const r = resolveForwarderRate(
    cand({ isGeneral: true, generalKg: null, generalCbm: null }),
    inp({ weightKg: 100, volumeCbm: 1 }),
  );
  eq("general-missing: rateMissing=true", r.rateMissing, true);
}

// ── 7c. Manual override with a real rate is NOT flagged missing ──
{
  const r = resolveForwarderRate(
    cand({ manualOverride: true, manualKg: 25, manualCbm: 0 }),
    inp({ weightKg: 10, volumeCbm: 1 }),
  );
  // priceKg = 250, priceCbm = 0 → KG wins.
  eq("manual KG-only: basis=kg", r.basis, "kg");
  near("manual KG-only: subtotal=250", r.transportSubtotal, 250);
  eq("manual KG-only: rateMissing=false", r.rateMissing, false);
}

// ── 8. Zero volume guard (KGPerCBM /0 → 0, no throw) ──
{
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: 10, svipCbm: 20 }),
    inp({ weightKg: 100, volumeCbm: 0, comparisonEnabled: true, comparisonValue: 200 }),
  );
  // KGPerCBM=0 (guarded), 0<=200 → CBM, value=cbm=0 → subtotal 0, rate 20.
  eq("zero-vol: basis=cbm", r.basis, "cbm");
  near("zero-vol: subtotal=0", r.transportSubtotal, 0);
  // rate is non-zero (20) so NOT flagged missing — value is what's 0.
  eq("zero-vol: rateMissing=false (rate exists, qty is 0)", r.rateMissing, false);
}

// ── 9. varchar coercion (legacy stores rates/measurements as strings) ──
{
  const r = resolveForwarderRate(
    cand({ isSvip: true, svipKg: "12.50", svipCbm: "0" }),
    inp({ weightKg: "200", volumeCbm: "1" }),
  );
  eq("coerce: basis=kg", r.basis, "kg");
  near("coerce: subtotal = 200*12.5 = 2500", r.transportSubtotal, 2500);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
