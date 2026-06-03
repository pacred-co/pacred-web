"use server";

/**
 * actions/forwarder-quote.ts — customer-facing IMPORT PRICE ESTIMATOR.
 *
 * Owner 2026-06-04: "ตอนลูกค้าจะกดสั่งของ … เลือก ทางรถ/เรือ/แอร์ · ตีลัง/ไม่ตีลัง …
 * ราคาควรเปลี่ยน". This is a NEW Pacred enhancement (legacy PCS set the
 * transport/crate price ADMIN-side after the warehouse measured the goods —
 * the customer never got a live estimate). It gives the customer a live
 * "ราคาประเมิน" as they enter dimensions + pick a transport mode + crate,
 * BEFORE goods exist — the real price is still computed by the warehouse at
 * intake (faithful), this is just guidance.
 *
 * It REUSES the verified, faithful rate engine (Lane C):
 *   - `resolveForwarderRate` (lib/forwarder/resolve-rate.ts) — the legacy
 *     SVIP→VIP→general waterfall + KG-vs-CBM "ราคามากสุด" rule.
 *   - the candidate-read mirrors actions/admin/quote-multimode.ts:readCandidates
 *     (same tb_rate_* tables, keyed by warehouse × transport × product).
 *
 * ⚠️ PRIVACY: this is CUSTOMER-facing. It returns ONLY the customer's own
 * price breakdown (their negotiated rate + the all-in estimate per mode). It
 * MUST NOT leak the internal rate-tier NAMING, the min-sell floor, the CEO
 * margin/profit, or any cost basis (those are admin-only, in quote-multimode).
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveForwarderRate,
  type ResolveRateCandidates,
} from "@/lib/forwarder/resolve-rate";

export type CustomerEstimateInput = {
  warehouse: "1" | "2";          // 1 = กวางโจว · 2 = อี้อู
  productType: "1" | "2" | "3" | "4"; // 1 ทั่วไป · 2 มอก. · 3 อย. · 4 พิเศษ
  basis: "auto" | "kg" | "cbm";
  weightKg: number;
  volumeCbm: number;
  crate: boolean;                // ตีลังไม้
  crateThb: number;              // ค่าตีลัง (THB) — 0 when crate=false
};

/** Per-mode line — CUSTOMER-SAFE (no tier naming, no margin, no floor). */
export type CustomerEstimateMode = {
  transport: "1" | "2" | "3";
  label: string;                 // ทางรถ / ทางเรือ / ทางอากาศ
  comingSoon: boolean;           // air = coming soon (no live booking yet)
  hasRate: boolean;              // a rate is set for this route
  basisUsed: "kg" | "cbm";
  unitRate: number;              // the customer's OWN rate (THB per kg/cbm)
  billableValue: number;
  transportSubtotal: number;     // unitRate × billable (China→TH transport)
  crateThb: number;
  grandTotal: number;            // transportSubtotal + crate
};

export type CustomerEstimateResult =
  | { ok: false; error: string }
  | { ok: true; asOf: string; modes: CustomerEstimateMode[]; cheapest: CustomerEstimateMode | null };

const round2 = (x: number) => Math.round(x * 100) / 100;
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const p = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}

const TRANSPORTS: { id: "1" | "2" | "3"; label: string; comingSoon: boolean }[] = [
  { id: "1", label: "ทางรถ",     comingSoon: false },
  { id: "2", label: "ทางเรือ",    comingSoon: false },
  { id: "3", label: "ทางอากาศ",   comingSoon: true  }, // owner: air = coming soon
];

/**
 * Read the rate candidates for ONE (warehouse, transport, product) for THIS
 * customer. Mirrors actions/admin/quote-multimode.ts:readCandidates — same
 * tables, same waterfall (SVIP per-user → VIP by coID → general PCS tiered).
 */
async function readCandidates(
  admin: ReturnType<typeof createAdminClient>,
  opts: { userid: string; coID: string; isSvip: boolean; isGeneral: boolean; wh: string; tt: string; pt: string },
): Promise<ResolveRateCandidates> {
  const { userid, coID, isSvip, isGeneral, wh, tt, pt } = opts;
  const c: ResolveRateCandidates = {
    manualOverride: false, manualKg: null, manualCbm: null,
    isSvip, svipKg: null, svipCbm: null,
    isGeneral, generalKg: null, generalCbm: null,
    vipKg: null, vipCbm: null,
  };
  if (isSvip) {
    const { data: kg, error: kgErr } = await admin.from("tb_rate_custom_kg").select("rkg")
      .eq("userid", userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle<{ rkg: number | string | null }>();
    if (kgErr) console.error(`[customer-estimate tb_rate_custom_kg] failed`, { code: kgErr.code, message: kgErr.message });
    const { data: cbm, error: cbmErr } = await admin.from("tb_rate_custom_cbm").select("rcbm")
      .eq("userid", userid).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle<{ rcbm: number | string | null }>();
    if (cbmErr) console.error(`[customer-estimate tb_rate_custom_cbm] failed`, { code: cbmErr.code, message: cbmErr.message });
    c.svipKg = kg?.rkg ?? null; c.svipCbm = cbm?.rcbm ?? null;
  } else if (isGeneral) {
    const { data: gKg, error: gKgErr } = await admin.from("tb_rate_g_kg").select("rgkg1, rgkg2, rgkg3")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt).maybeSingle<{ rgkg1: number|string|null; rgkg2: number|string|null; rgkg3: number|string|null }>();
    if (gKgErr) console.error(`[customer-estimate tb_rate_g_kg] failed`, { code: gKgErr.code, message: gKgErr.message });
    const { data: gCbm, error: gCbmErr } = await admin.from("tb_rate_g_cbm").select("rgcbm1, rgcbm2, rgcbm3")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rgtransporttype", tt).eq("rgproductstype", pt).maybeSingle<{ rgcbm1: number|string|null; rgcbm2: number|string|null; rgcbm3: number|string|null }>();
    if (gCbmErr) console.error(`[customer-estimate tb_rate_g_cbm] failed`, { code: gCbmErr.code, message: gCbmErr.message });
    c.generalKg = gKg ? { tier1: gKg.rgkg1, tier2: gKg.rgkg2, tier3: gKg.rgkg3 } : null;
    c.generalCbm = gCbm ? { tier1: gCbm.rgcbm1, tier2: gCbm.rgcbm2, tier3: gCbm.rgcbm3 } : null;
  } else {
    const { data: vKg, error: vKgErr } = await admin.from("tb_rate_vip_kg").select("rkg")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle<{ rkg: number | string | null }>();
    if (vKgErr) console.error(`[customer-estimate tb_rate_vip_kg] failed`, { code: vKgErr.code, message: vKgErr.message });
    const { data: vCbm, error: vCbmErr } = await admin.from("tb_rate_vip_cbm").select("rcbm")
      .eq("coid", coID).eq("sourcewarehouse", wh).eq("rtransporttype", tt).eq("rproductstype", pt).maybeSingle<{ rcbm: number | string | null }>();
    if (vCbmErr) console.error(`[customer-estimate tb_rate_vip_cbm] failed`, { code: vCbmErr.code, message: vCbmErr.message });
    c.vipKg = vKg?.rkg ?? null; c.vipCbm = vCbm?.rcbm ?? null;
  }
  return c;
}

export async function getCustomerImportEstimate(
  input: CustomerEstimateInput,
): Promise<CustomerEstimateResult> {
  const { profile } = await requireAuth();
  const userid = profile?.member_code ?? "";
  if (!userid) return { ok: false, error: "ยังไม่ได้รับ member_code — กรุณาติดต่อทีมงาน" };

  const wh = input.warehouse === "2" ? "2" : "1";
  const pt = ["1", "2", "3", "4"].includes(input.productType) ? input.productType : "1";
  const weightKg = Math.max(0, num(input.weightKg));
  const volumeCbm = Math.max(0, num(input.volumeCbm));
  const crateThb = input.crate ? Math.max(0, num(input.crateThb)) : 0;
  if (weightKg <= 0 && volumeCbm <= 0) {
    return { ok: false, error: "กรอกน้ำหนัก (กก.) หรือ ปริมาตร (คิว) อย่างน้อยหนึ่งอย่าง" };
  }

  const admin = createAdminClient();

  // Customer rate context (their OWN tier) — same probe as quote-multimode.
  const { data: u, error: uErr } = await admin
    .from("tb_users").select("coID").eq("userID", userid).maybeSingle<{ coID: string | null }>();
  if (uErr) console.error(`[customer-estimate tb_users] failed`, { code: uErr.code, message: uErr.message });
  const coID = (u?.coID ?? "PCS").trim() || "PCS";
  const { data: svip, error: svipErr } = await admin
    .from("tb_rate_custom_cbm").select("id").eq("userid", userid).limit(1).maybeSingle<{ id: number }>();
  if (svipErr) console.error(`[customer-estimate svip-probe] failed`, { code: svipErr.code, message: svipErr.message });
  const isSvip = svip != null;
  const isGeneral = !isSvip && coID === "PCS";

  // Pin basis (auto = legacy "ราคามากสุด"; kg/cbm pinned via extreme threshold).
  const pinKg = input.basis === "kg";
  const pinCbm = input.basis === "cbm";
  const comparisonEnabled = pinKg || pinCbm;
  const comparisonValue = pinKg ? 0 : pinCbm ? 1e9 : 0;

  const modes: CustomerEstimateMode[] = [];
  for (const T of TRANSPORTS) {
    const candidates = await readCandidates(admin, { userid, coID, isSvip, isGeneral, wh, tt: T.id, pt });
    const r = resolveForwarderRate(candidates, { weightKg, volumeCbm, comparisonEnabled, comparisonValue });
    const transportSubtotal = r.transportSubtotal;
    const grandTotal = round2(transportSubtotal + crateThb);
    modes.push({
      transport: T.id,
      label: T.label,
      comingSoon: T.comingSoon,
      hasRate: !r.rateMissing,
      basisUsed: r.basis,
      unitRate: r.rate,
      billableValue: r.basis === "kg" ? weightKg : volumeCbm,
      transportSubtotal,
      crateThb,
      grandTotal,
    });
  }

  const withRate = modes.filter((m) => m.hasRate && !m.comingSoon);
  const cheapest = withRate.length
    ? withRate.reduce((a, b) => (b.grandTotal < a.grandTotal ? b : a))
    : null;

  return { ok: true, asOf: new Date().toISOString(), modes, cheapest };
}
