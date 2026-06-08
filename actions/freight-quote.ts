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
