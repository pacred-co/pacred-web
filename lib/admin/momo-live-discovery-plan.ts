/**
 * MOMO Live DISCOVERY — pure diff + materialize-payload builders (NO "server-only").
 *
 * WHY THIS EXISTS (owner/ภูม 2026-07-03 · "ตกหล่นไม่จบ")
 * ─────────────────────────────────────────────────────
 * MOMO's PARTNER token (`import/track`, the feed behind the Review & Commit queue)
 * DROPS a parcel once it advances past "ออกจากโกดังจีน". A ฝากสั่งซื้อ shop tracking
 * that MOMO Live shows "กำลังส่งมาไทย" WITH a real container is therefore NOT in
 * momo_import_tracks, has NO tb_forwarder row, so the shop badge stays stuck at
 * "รอเข้าโกดังจีน" — invisible to BOTH the Review queue AND the "พัสดุตกหล่น" page
 * (which reads the แต้ม packing list, not MOMO Live). Verified on prod 2026-07-03:
 * YT2590231382196 (PR043 · order P22328 · MOMO Live = กำลังส่งมาไทย · ตู้ GZS260628-2)
 * has ZERO tb_forwarder rows AND is absent from momo_import_tracks; in P22328 alone
 * 10 of 16 shop trackings have no forwarder row.
 *
 * THE FIX: scrape the MOMO Live "coming-to-Thailand" board(s), LEFT-diff every
 * parcel against tb_forwarder (base + exact tracking), and surface the ones MOMO
 * Live shows advanced (has weight) but which have NO tb_forwarder row → a one-click
 * commit that MATERIALIZES the parcel into momo_import_tracks then reuses the
 * EXISTING commitMomoRowCore (its 51-column atomic INSERT + double-commit claim +
 * best-effort rate-fill + the 0235 shop-arrival trigger that unsticks the ฝากสั่งซื้อ).
 *
 * 💰 MONEY-SAFETY (the metrics feed the SELL price — be conservative)
 * ──────────────────────────────────────────────────────────────────
 *   - Live reports PER-PIECE kg/cbm + a separate quantity; the TOTAL = per-piece ×
 *     quantity, aggregated across "-i/n" split siblings (aggregateLiveMetricsByBase).
 *     The synthetic `raw` we materialize carries the AGGREGATE TOTAL in raw.kg/cbm/
 *     quantity — because extractMetricsFromMomoRaw reads raw.kg AS-IS (the partner-feed
 *     convention = already-total). Putting a per-piece figure there would under-bill ×qty.
 *   - COMMIT-ELIGIBLE ONLY WHEN WEIGHTED: a candidate with weightKg ≤ 0 is skipped
 *     (never commit an un-weighed parcel → the auto-rate would land ฿0).
 *   - The diff SUPPRESSES any tracking already present in tb_forwarder (base OR exact,
 *     ANY status incl. billed) — never mint a SECOND billable row; defer to the
 *     propagate-* paths to refresh an existing row.
 *
 * These helpers hold ONLY pure logic (no DB · no MOMO login) so they are unit-testable
 * under tsx. The DB orchestration lives in lib/admin/momo-live-discovery.ts (server-only).
 *
 * @see lib/integrations/momo-web/live-parcel-metrics.ts — the per-piece→total math
 * @see lib/admin/commit-momo-row-core.ts                — the reused commit body
 * @see supabase/migrations/0235_shop_order_3stage_rederive.sql — the trigger that unsticks the shop
 */

import { MOMO_LIVE_STATUSES, type MomoLiveParcel } from "@/lib/integrations/momo-web/types";
import {
  aggregateLiveMetricsByBase,
  baseTrackingOf,
} from "@/lib/integrations/momo-web/live-parcel-metrics";
import { derivePayMethod } from "@/lib/forwarder/pay-method";

/** Round to 2dp (weight — tb_forwarder numeric(14,2)). */
function r2(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}
/** Round to 6dp (cbm — tb_forwarder numeric(14,6) since mig 0192). */
function r6(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(6));
}
function numOr0(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * The Live boards the discovery scan acts on — ALL 6 (owner/ภูม 2026-07-03: "เอาของทุก
 * สถานะมาเลย · ยกเว็บ MOMO มาแปะที่ระบบ · จะได้เช็คว่าแทรคนี้จริงๆอยู่ถึงไหน"). The scan
 * fetches every board, but the queue surfaces ONLY the parcels that are (a) weighted and
 * (b) NOT already in tb_forwarder AND (c) NOT in the partner Review queue (momo_import_tracks) —
 * i.e. the GENUINELY dropped/orphaned ones, at whatever status MOMO shows. Parcels still in
 * the partner feed (waiting/arrival_kodang) are excluded so we don't duplicate the normal
 * Review & Commit queue nor overwrite its rows. Every commit lands at the China-side '3'/'2'
 * cap via the core's hasContainer logic — never a Thailand-side/billing status, whatever board.
 */
export const DISCOVERY_BOARDS = MOMO_LIVE_STATUSES;

/**
 * MOMO product `type` → Pacred fProductsType. Pacred's legacy dropdown (review-client):
 *   '1' ทั่วไป · '2' มอก. · '3' อย./น้ำยา · '4' พิเศษ.
 * MOMO's `type` values seen on prod: general · tis (มอก.) · fda (อย.) · control (ควบคุม).
 * The old default hardcoded '1' for every row (owner flag) — this maps the REAL MOMO type.
 */
const MOMO_TYPE_TO_PRODUCT: Record<string, "1" | "2" | "3" | "4"> = {
  general: "1",
  tis: "2", // มาตรฐาน มอก.
  fda: "3", // อย.
  // "special" = น้ำยา/ของเหลว (2026-07-20 · prod มี 18 แถว): เดิมไม่อยู่ใน map →
  // ตกไป '1' ทั่วไป = ผิดทั้งป้ายทั้ง tier เรทตั้งต้น. legacy tier '3' คือ
  // "อย./น้ำยา" → น้ำยา price บน tier เดียวกับ อย. (default — admin แก้ได้ที่ review)
  special: "3",
  control: "4", // สินค้าควบคุม → พิเศษ
};
export function momoTypeToProductType(momoType: string | null | undefined): "1" | "2" | "3" | "4" {
  return MOMO_TYPE_TO_PRODUCT[(momoType ?? "").trim().toLowerCase()] ?? "1";
}

/** MOMO product `type` → readable Thai chip label (unknown → the raw string). */
// owner 2026-07-20 "อย ก็ อย น้ำยา ก็ น้ำยา" — labels stay DISTINCT per MOMO code
// (the legacy dropdown's lumped "อย./น้ำยา" is only the shared RATE tier, not the label).
const MOMO_TYPE_LABEL: Record<string, string> = {
  general: "ทั่วไป",
  tis: "มอก.",
  fda: "อย.",
  special: "น้ำยา",
  control: "ควบคุม",
};
export function momoTypeLabel(momoType: string | null | undefined): string {
  const t = (momoType ?? "").trim().toLowerCase();
  return MOMO_TYPE_LABEL[t] ?? (t || "—");
}

/** Normalize a Live memberCode → the PR#### form tb_users.userID uses. */
export function normalizeMemberCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** Split a member code ("PR043") into { group:"PR", code:"043" } for the promoted cols. */
export function splitMemberCode(memberCode: string): { group: string; code: string } {
  const m = normalizeMemberCode(memberCode);
  const match = m.match(/^([A-Z]+)(.*)$/);
  if (!match) return { group: "", code: m };
  return { group: match[1] ?? "", code: match[2] ?? "" };
}

/** A tracking MOMO Live shows advanced but which has NO tb_forwarder row. */
export type DiscoveryCandidate = {
  /** BASE tracking (split "-i/n" suffix stripped). */
  baseTracking: string;
  /** Σ TOTAL weight (kg) across split siblings — feeds fweight. */
  weightKg: number;
  /** Σ TOTAL volume (คิว) — feeds fvolume. */
  cbm: number;
  /** Σ pieces — feeds famount. */
  quantity: number;
  /** How many Live parcels rolled into this base (1 = no split; >1 = box-split). */
  parcelCount: number;
  /** Real cabinet (เลขตู้ GZS…/GZE…) or "" — drives fstatus '3' vs '2' + transport. */
  container: string;
  /** True when a real cabinet is present (มาไทยแล้ว). */
  hasContainer: boolean;
  /** MOMO routing batch (PR…-SEA…) — audit only. */
  routingBatch: string;
  /** Live ship_by ("ship"/"truck"/…) — transport fallback when no cabinet. */
  shipBy: string;
  /** MOMO product type ("general"…) — display only; fProductsType defaults '1'. */
  productType: string;
  /** Customer member code (PR043) — validated against tb_users at commit. */
  memberCode: string;
  /** Single-parcel dims (0 for a multi-box aggregate — dims aren't additive). */
  width: number;
  length: number;
  height: number;
  /** Parcel thumbnail (Live cn_image[0]) or null. */
  imageUrl: string | null;
  /** The Live board this came from (statusText) — display. */
  liveStatusText: string;
  /** The warehouse-phase dates from Live (kodang/exported/…) for the synthetic raw. */
  statusDate: Record<string, string>;
};

/**
 * One of the customer's saved delivery addresses — the picker the admin chooses from
 * per discovery row. `carriers` is the province/zip-eligible carrier list PRE-COMPUTED
 * server-side (getShipByOptionsForAddress) so the client never imports a server-only
 * module to recompute on address-change (owner/ภูม 2026-07-03: "ช่องบริษัทขนส่งจะจับจาก
 * เลขไปรษณีย์ว่าอยู่จังหวัดไหน และเลือกบริษัทขนส่งในจังหวัดนั้นให้เลย").
 */
export type DeliveryAddressOption = {
  addressID: number;
  /** "ชื่อ · จังหวัด · zip" — a human label for the <select>. */
  label: string;
  province: string;
  zip: string;
  /** The carriers eligible for THIS address (id + Thai name) — the reused legacy rule. */
  carriers: Array<{ id: string; name: string }>;
};

/**
 * Delivery fields added to each discovery row — the customer's saved addresses + the
 * suggested {address, carrier, payMethod} pre-resolved from their SET data (mirrors
 * resolveAutoCommitDelivery). All fail-soft: no saved address → empty list + blank
 * suggestion (the commit core writes EMPTY_ADDRESS, the admin fills later at /review).
 */
export type DiscoveryDelivery = {
  addresses: DeliveryAddressOption[];
  /** the customer's default/eligible address to seed the picker (null → none saved). */
  suggestedAddressId: number | null;
  /** the seeded carrier (their saved carrier when eligible, else the address's first). */
  suggestedFShipBy: string;
  /** derivePayMethod(suggestedFShipBy) — '1' ต้นทาง (BKK) / '2' ปลายทาง COD (ตจว). */
  suggestedPayMethod: "1" | "2";
};

/**
 * Pick the carrier to SEED for an address: prefer the customer's saved carrier when it's
 * eligible for that address's province (their choice wins), else the first eligible option,
 * else "" (no eligible carrier / no address → admin picks manually). Pure — mirrors the
 * resolveAutoCommitDelivery eligibility gate (auto-commit-momo.ts) minus the DB.
 */
export function pickSuggestedCarrier(
  savedCarrier: string | null | undefined,
  eligible: ReadonlyArray<{ id: string }>,
): string {
  const saved = (savedCarrier ?? "").trim();
  if (saved && eligible.some((o) => o.id === saved)) return saved;
  return eligible[0]?.id ?? "";
}

/**
 * derivePayMethod re-exported through the plan module so the client can compute the
 * COD/ต้นทาง chip on carrier-change WITHOUT importing a server-only module. '1'=ต้นทาง
 * (BKK/ปริมณฑล origin) · '2'=ปลายทาง COD (ต่างจังหวัด — the upcountry rule). The province
 * coupling is EMERGENT from carrier-eligibility ∘ this map (see pay-method.ts).
 */
export function payMethodForCarrier(fShipBy: string | null | undefined): "1" | "2" {
  return derivePayMethod(fShipBy);
}

export type DiscoveryClassification = {
  candidates: DiscoveryCandidate[];
  /** Trackings that ALREADY have a tb_forwarder row → never surfaced (correct). */
  alreadyInSystem: number;
  /** Weighted-eligible check failed (weightKg ≤ 0) → skipped (money-safe). */
  skippedNoWeight: number;
  /** Distinct base trackings seen across the scanned boards. */
  baseTrackingsSeen: number;
};

/**
 * Classify scraped Live parcels against the set of base trackings already in
 * tb_forwarder. Returns only the commit-eligible candidates (weighted + NOT in the
 * system). PURE — the caller supplies both the parcels and the existing-set.
 *
 * @param parcels               the Live parcels (all scanned boards)
 * @param existingBaseTrackings the BASE forms of every tb_forwarder.ftrackingchn that
 *                              could match a scanned tracking (base + exact, normalised
 *                              through baseTrackingOf on BOTH sides by the caller)
 */
export function classifyDiscovery(
  parcels: readonly MomoLiveParcel[],
  existingBaseTrackings: ReadonlySet<string>,
): DiscoveryClassification {
  const byBase = aggregateLiveMetricsByBase(parcels);

  // Representative parcel + best (non-empty) cabinet per base for the identity fields
  // (aggregateLiveMetricsByBase keeps only the money metrics).
  const repByBase = new Map<string, MomoLiveParcel>();
  const cabinetByBase = new Map<string, string>();
  for (const p of parcels) {
    const t = (p.tracking ?? "").trim();
    if (!t) continue;
    const base = baseTrackingOf(t);
    if (!repByBase.has(base)) repByBase.set(base, p);
    const cab = (p.containerName ?? "").trim();
    if (cab && !cabinetByBase.get(base)) cabinetByBase.set(base, cab);
  }

  const candidates: DiscoveryCandidate[] = [];
  let alreadyInSystem = 0;
  let skippedNoWeight = 0;

  for (const [base, agg] of byBase) {
    if (existingBaseTrackings.has(base)) {
      alreadyInSystem += 1;
      continue;
    }
    // money-safe: never commit an un-weighed parcel (auto-rate would land ฿0).
    if (!(agg.weightKg > 0)) {
      skippedNoWeight += 1;
      continue;
    }
    const rep = repByBase.get(base);
    if (!rep) continue;
    const container = cabinetByBase.get(base) ?? "";
    const single = agg.parcelCount === 1;
    candidates.push({
      baseTracking: base,
      weightKg: r2(agg.weightKg),
      cbm: r6(agg.cbm),
      quantity: agg.quantity,
      parcelCount: agg.parcelCount,
      container,
      hasContainer: container.length > 0,
      routingBatch: (rep.containerNo ?? "").trim(),
      shipBy: (rep.shipBy ?? "").trim(),
      productType: (rep.type ?? "").trim(),
      memberCode: normalizeMemberCode(rep.memberCode),
      width: single ? r2(numOr0(rep.width)) : 0,
      length: single ? r2(numOr0(rep.length)) : 0,
      height: single ? r2(numOr0(rep.height)) : 0,
      imageUrl: rep.imageUrl ?? null,
      liveStatusText: (rep.statusText ?? "").trim(),
      statusDate: rep.statusDate && typeof rep.statusDate === "object" ? rep.statusDate : {},
    });
  }

  // Deterministic order: has-container (มาไทยแล้ว) first, then by tracking.
  candidates.sort((a, b) => {
    if (a.hasContainer !== b.hasContainer) return a.hasContainer ? -1 : 1;
    return a.baseTracking.localeCompare(b.baseTracking);
  });

  return {
    candidates,
    alreadyInSystem,
    skippedNoWeight,
    baseTrackingsSeen: byBase.size,
  };
}

/**
 * Build the synthetic momo_import_tracks `raw` for a candidate so the REUSED
 * commit body reads the correct TOTAL metrics + cabinet + transport + dates.
 *
 * ⚠️ raw.kg / raw.cbm carry the AGGREGATE TOTAL (extractMetricsFromMomoRaw reads them
 * AS-IS — the partner-feed convention). raw.quantity = Σ pieces (→ famount). Dims only
 * for a single-parcel tracking. `status_date` is passed through so the warehouse-IN/OUT
 * dates populate. NO crate signal (Live doesn't carry wooden_create) → the commit
 * default-safes to "not crated".
 */
export function buildDiscoveryRaw(c: DiscoveryCandidate): Record<string, unknown> {
  const { group, code } = splitMemberCode(c.memberCode);
  return {
    // identity (display readers use these; the commit uses the input userID)
    user_group: group,
    user_code: code,
    tracking: c.baseTracking,
    // metrics — TOTAL, already aggregated (per-piece × qty summed across siblings)
    kg: c.weightKg,
    cbm: c.cbm,
    quantity: c.quantity,
    width: c.width,
    length: c.length,
    height: c.height,
    // transport (fallback — the commit prefers the GZS/GZE cabinet)
    ship_by: c.shipBy,
    type: c.productType,
    container_no: c.routingBatch,
    status_date: c.statusDate,
    // provenance marker (this row was materialized from a MOMO Live discovery)
    source: "live_discovery",
    live_status: c.liveStatusText,
  };
}

/** The full momo_import_tracks upsert payload for a candidate (keyed on momo_tracking_no). */
export function buildImportTrackRow(c: DiscoveryCandidate): Record<string, unknown> {
  const { group, code } = splitMemberCode(c.memberCode);
  // Best manifest date: exported (ออกจากจีน) → kodang (เข้าโกดัง) → any phase → null.
  const sd = c.statusDate ?? {};
  const manifest =
    (typeof sd.exported === "string" && sd.exported.trim()) ||
    (typeof sd.prepare_export === "string" && sd.prepare_export.trim()) ||
    (typeof sd.kodang === "string" && sd.kodang.trim()) ||
    null;
  return {
    momo_tracking_no: c.baseTracking,
    // container_batch_no = the REAL cabinet → the commit's hasContainer='3' + GZS/GZE transport.
    container_batch_no: c.container || null,
    momo_container_no: c.routingBatch || null,
    ship_by: c.shipBy || null,
    weight_kg: c.weightKg,
    cbm: c.cbm,
    quantity: c.quantity,
    momo_user_code: code || null,
    momo_user_group: group || null,
    shipment_status: c.liveStatusText || null,
    momo_updated_at: manifest,
    raw: buildDiscoveryRaw(c),
    // committed_at left NULL (default) so commitMomoRowCore's step-4b claim can fire.
  };
}
