"use server";

/**
 * PUBLIC freight quote-request (RFQ) submission — opens the FREIGHT revenue
 * line.  Ported from the AXELRA "AX BOOKING" 5-step wizard prototype.
 *
 * A visitor (anon or logged-in) completes the `/freight-quote` wizard → this
 * action validates, mints a public `AX-YYYY-NNNNN` ref, stores one
 * `freight_quote` row (the singular PUBLIC lead — NOT the admin-issued plural
 * `freight_quotes` quotation), and best-effort pings the sales LINE group so
 * a rep can phone the lead and turn it into a real B2B quotation.
 *
 * MVP scope: lead capture only. The live pricing-waterfall / auto-quotation
 * is a follow-on (the rate-card engine in docs/research/freight-knowledge…
 * §2.4). The client shows a rough "ประมาณการ" estimate; sales confirms.
 *
 * Defenses (mirror submitContactMessage):
 *   - IP rate-limit (reuses the "contact" 5/h/IP bucket — same anti-spam need)
 *   - admin client insert so anon RLS doesn't block the submit
 *   - notify is wrapped + never throws (a failed staff ping must not fail the
 *     customer's submit)
 */

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { freightRfqSchema, type FreightRfqInput } from "@/lib/validators/freight-rfq";
import { composeFreightQuote } from "@/lib/freight/rate-engine";
import type { Incoterm, TransportMode } from "@/lib/validators/freight-quote";
import type {
  RfqService, RfqTransport, RfqIncoterm, RfqLoadType, RfqContainerSize,
} from "@/lib/validators/freight-rfq";

export type FreightQuoteResult =
  | { ok: true; ref: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

/** Human labels for the staff-ping (Thai). */
const SERVICE_LABEL: Record<string, string> = {
  import:    "นำเข้า",
  export:    "ส่งออก",
  customs:   "ออกใบขน",
  nondoc:    "ฝากสั่ง/ไม่รับเอกสาร",
  clearance: "เคลียร์ด่าน",
};
const TRANSPORT_LABEL: Record<string, string> = {
  sea:   "เรือ",
  air:   "แอร์",
  truck: "รถ",
};

/** Mint a public ref: AX-YYYY-NNNNN (5-digit random tail, like the prototype). */
function mintRef(): string {
  const year = new Date().getFullYear();
  const tail = Math.floor(10000 + Math.random() * 90000);
  return `AX-${year}-${tail}`;
}

export async function submitFreightQuote(
  input: FreightRfqInput,
): Promise<FreightQuoteResult> {
  const parsed = freightRfqSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Request meta (best-effort — none of these block the insert)
  const h = await headers();
  const referer   = h.get("referer");
  const userAgent = h.get("user-agent");
  const ip        = getClientIpFromHeaders(h);

  // Defense — IP-based rate limit (anti-spam). Reuse the contact bucket.
  const blocked = await checkRateLimit("contact", ip);
  if (blocked) return { ok: false, error: "rate_limit", retryAfterSeconds: blocked.retryAfterSeconds };

  // Soft-link to the profile if signed in (so they can see it later)
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    console.error(`[freight-quote getUser] failed`, { code: userErr.code, message: userErr.message });
  }

  const admin = createAdminClient();

  // Insert with up to a few ref-collision retries (unique constraint on ref).
  let ref = "";
  let insertedId: string | null = null;
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    ref = mintRef();
    const { data: inserted, error } = await admin
      .from("freight_quote")
      .insert({
        ref,
        customer_type:   d.customerType,
        service:         d.service,
        transport:       d.transport ?? null,
        incoterm:        d.incoterm ?? null,
        load_type:       d.loadType ?? null,
        container_size:  d.containerSize ?? null,
        carrier:         d.carrier ?? null,
        origin:          d.origin ?? null,
        destination:     d.destination ?? null,
        product:         d.product ?? null,
        goods_value_usd: d.goodsValueUsd ?? null,
        cbm:             d.cbm ?? null,
        weight_kg:       d.weightKg ?? null,
        addons:          d.addons ?? [],
        est_total_thb:   d.estTotalThb ?? null,
        contact_name:    d.contactName,
        contact_phone:   d.contactPhone,
        contact_line:    d.contactLine ?? null,
        contact_email:   d.contactEmail ?? null,
        contact_pref:    d.contactPref,
        note:            d.note ?? null,
        profile_id:      user?.id ?? null,
        source_url:      referer,
        user_agent:      userAgent,
        ip:              ip === "unknown" ? null : ip,
      })
      .select("id")
      .single<{ id: string }>();

    if (!error && inserted) {
      insertedId = inserted.id;
      break;
    }
    lastErr = error?.message ?? "insert_failed";
    // 23505 = unique_violation on ref → retry with a fresh ref; else give up.
    if (error?.code !== "23505") break;
  }

  if (!insertedId) {
    return { ok: false, error: lastErr ?? "insert_failed" };
  }

  // Best-effort staff ping (never throws, never fails the submit).
  try {
    const svc = SERVICE_LABEL[d.service] ?? d.service;
    const lines = [
      `📦 ขอราคา Freight ใหม่ · ${ref}`,
      `บริการ: ${svc}${d.transport ? ` · ${TRANSPORT_LABEL[d.transport] ?? d.transport}` : ""}` +
        `${d.incoterm ? ` · ${d.incoterm}` : ""}${d.loadType ? ` · ${d.loadType}` : ""}` +
        `${d.containerSize ? ` ${d.containerSize}` : ""}`,
      d.origin || d.destination ? `เส้นทาง: ${d.origin ?? "-"} → ${d.destination ?? "-"}` : null,
      d.product ? `สินค้า: ${d.product}` : null,
      d.estTotalThb ? `ประมาณการ: ฿${Math.round(d.estTotalThb).toLocaleString()}` : null,
      `ติดต่อ: ${d.contactName} · ${d.contactPhone}` +
        `${d.contactLine ? ` · LINE ${d.contactLine}` : ""}`,
      d.contactPref === "call" ? "⚡ ลูกค้าขอให้โทรกลับด่วน" : null,
    ].filter(Boolean) as string[];

    // 2026-06-08 — the RFQ leads inbox shipped (/admin/freight/leads). Deep-link
    // staff straight to the lead so they can triage/convert in one tap.
    await notifyStaffGroup(lines.join("\n"), {
      title: "ขอราคา Freight ใหม่ 📦",
      url: `/admin/freight/leads/${ref}`,
    });
  } catch {
    /* swallow — lead is saved; sales sees it on next dashboard load */
  }

  return { ok: true, ref };
}

// ────────────────────────────────────────────────────────────────────────────
// Public, CUSTOMER-SAFE freight estimate — wraps the verified rate engine.
// ────────────────────────────────────────────────────────────────────────────
/**
 * The public `/freight-quote` wizard used to show a HARDCODED client-side
 * estimate (`FreightQuoteWizard.estimate()`) whose numbers did NOT match the
 * AXELRA rate engine (`lib/freight/rate-engine.composeFreightQuote`) that staff
 * quotes are built from — customers saw prices that diverged from the real
 * quotation. This action repoints the displayed estimate to the SAME engine, so
 * the customer sees the engine's customer-facing total.
 *
 * ⚠️ CUSTOMER-SAFE — it returns ONLY the customer-facing figures (per-line SELL
 * + the VAT-inclusive total). It MUST NOT leak any internal: cost (`unitCost`,
 * `cost`, `subtotalCost`, `chinaFreightCostThb`), `profit`, the CEO margin cap
 * (`marginCapThb`, `marginExceedsCap`), the commission split, or the
 * `chinaCostPending` gross/net internal — those are admin-only.
 *
 * When the engine can't price the request faithfully (a service it doesn't
 * model — standalone customs/clearance/non-doc/export — truck mode which has no
 * modelled freight rate, an incoterm/mode it can't scope, or a missing volume
 * driver), it degrades gracefully: `precise:false` + empty lines so the wizard
 * shows "ติดต่อทีมเพื่อราคาแม่นยำ" instead of inventing a misleading number.
 */

export type PublicFreightEstimateInput = {
  service: RfqService;
  transport?: RfqTransport;
  incoterm?: RfqIncoterm;
  loadType?: RfqLoadType;
  containerSize?: RfqContainerSize;
  containerQty?: number;
  /** CBM volume (sea LCL / truck / air volumetric base). */
  cbm?: number;
  /** actual weight in kg (air). */
  weightKg?: number;
};

/** A single customer-facing line — label + SELL only. No cost, no margin. */
export type PublicFreightEstimateLine = { label: string; amountThb: number };

export type PublicFreightEstimateResult = {
  /** true → the engine priced it; the figures are the real engine numbers.
   *  false → can't price faithfully → wizard shows "ติดต่อทีมเพื่อราคาแม่นยำ". */
  precise: boolean;
  /** Why it isn't precise (customer-friendly Thai hint). null when precise. */
  reason: string | null;
  /** Customer-facing line items (freight/customs/transport SELL prices). */
  lines: PublicFreightEstimateLine[];
  /** Σ of `lines` before VAT. */
  subtotalThb: number;
  vatPct: number;
  vatThb: number;
  /** subtotal + VAT — the headline customer total. */
  totalThb: number;
};

const round2pub = (n: number) => Math.round(n * 100) / 100;

/** wizard transport + loadType → engine TransportMode (null = can't map). */
function toEngineMode(
  transport: RfqTransport | undefined,
  loadType: RfqLoadType | undefined,
): TransportMode | null {
  if (transport === "air") return "air";
  if (transport === "sea") return loadType === "FCL" ? "sea_fcl" : "sea_lcl";
  // "truck" maps to the engine's "truck" mode, but that mode's freight rate is
  // 0 (a cross-border rate not yet modelled) → handled as not-precise below.
  if (transport === "truck") return "truck";
  return null;
}

/** Approx CBM for an FCL container size — used as the volumetric default when
 *  the customer didn't type a CBM (FCL pricing is per-container, not per-CBM,
 *  so this only feeds any volumetric line; engine FCL lines are per-container). */
const FCL_APPROX_CBM: Record<RfqContainerSize, number> = {
  "20GP": 30, "40GP": 60, "40HC": 68, "45HC": 76,
};

export async function getPublicFreightEstimate(
  input: PublicFreightEstimateInput,
): Promise<PublicFreightEstimateResult> {
  const empty = (reason: string): PublicFreightEstimateResult => ({
    precise: false, reason, lines: [], subtotalThb: 0, vatPct: 7, vatThb: 0, totalThb: 0,
  });

  // The engine models the IMPORT freight waterfall only. Standalone customs /
  // clearance / non-doc / export are bespoke jobs → sales prices them.
  if (input.service !== "import") {
    return empty("งานนี้คิดราคาเฉพาะแต่ละเคส — กรอกข้อมูลด้านล่างให้ทีมเซลส์ตีราคาให้");
  }

  const mode = toEngineMode(input.transport, input.loadType);
  if (!mode) {
    return empty("เลือกรูปแบบการขนส่งก่อน เพื่อดูราคาประมาณการ");
  }
  if (mode === "truck") {
    // Cross-border truck rate is a per-route negotiation (not in the rate card).
    return empty("ค่าขนส่งทางรถข้ามแดนคิดตามเส้นทางจริง — ทีมเซลส์ยืนยันราคาให้");
  }

  const incoterm: Incoterm = (input.incoterm ?? "CIF") as Incoterm;
  const containers = Math.max(1, Math.floor(input.containerQty ?? 1));
  const cbmIn = Math.max(0, Number(input.cbm) || 0);
  const weightIn = Math.max(0, Number(input.weightKg) || 0);

  // Per-mode volume driver. Missing a required driver → ask the customer for it
  // rather than pricing on a fabricated volume.
  let cbm: number | undefined;
  let kgm: number | undefined;
  if (mode === "sea_lcl") {
    if (cbmIn <= 0) return empty("กรอกปริมาตร (CBM) เพื่อคำนวณราคาแชร์ตู้");
    cbm = cbmIn;
  } else if (mode === "air") {
    // chargeable kg = max(actual, volumetric = CBM × 167).
    const chargeable = Math.max(weightIn, cbmIn * 167);
    if (chargeable <= 0) return empty("กรอกน้ำหนัก (กก.) หรือ CBM เพื่อคำนวณราคาทางอากาศ");
    kgm = chargeable;
  } else if (mode === "sea_fcl") {
    // FCL freight is per-container; pass an approximate CBM only for any
    // volumetric line (the default rate card has none for FCL).
    cbm = input.containerSize ? FCL_APPROX_CBM[input.containerSize] : undefined;
  }

  let q;
  try {
    q = composeFreightQuote({
      mode,
      incoterm,
      deliveryTruck: "4W", // wizard doesn't collect truck size → sheet default
      tier: "regular",     // never expose tier choice to a public visitor
      cbm,
      kgm,
      containers,
    });
  } catch (err) {
    console.error("[getPublicFreightEstimate] composeFreightQuote failed", err);
    return empty("คำนวณราคาไม่สำเร็จ — กรอกข้อมูลให้ทีมเซลส์ตีราคาให้");
  }

  // Map engine lines → customer-safe lines (SELL only; cost/profit stripped).
  const lines: PublicFreightEstimateLine[] = q.lines
    .filter((l) => l.sell > 0)
    .map((l) => ({ label: l.labelTh, amountThb: round2pub(l.sell) }));

  if (lines.length === 0) {
    return empty("กรอกข้อมูลสินค้าเพิ่มเพื่อดูราคาประมาณการ");
  }

  return {
    precise: true,
    reason: null,
    lines,
    subtotalThb: round2pub(q.subtotalSell),
    vatPct: q.vatPct,
    vatThb: round2pub(q.vat),
    totalThb: round2pub(q.total),
  };
}
