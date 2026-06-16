import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getBusinessConfig } from "@/lib/business-config";
import {
  freightInvoiceTotalThb,
  roundThb,
} from "@/lib/validators/freight-payment";
import {
  FREIGHT_TRANSPORT_MODE_LABEL,
  type FreightTransportMode,
} from "@/lib/validators/freight-shipment";
import { FREIGHT_COMMISSION } from "@/lib/freight/rate-model";

/**
 * W5 — /admin/freight/shipments/[id]/p-and-l
 *
 * Freight P&L dashboard for a single shipment. Surfaces the cost / revenue /
 * profit picture that the rate engine computed at compose time + snapshotted
 * onto the shipment at quote→convert, plus the REALISED revenue from any issued
 * invoice.
 *
 * ⚠️ MONEY/TAX SAFETY: read-only. NO mutation of wallet / payment / invoice /
 * commercial_value / vat / duty. The cost/profit shown is the INTERNAL SELL−COST
 * margin (3-number model: this is NOT the DECLARED สำแดง value, NOT customer-
 * visible). The ≤15k/container cap is ADVISORY — a flag + banner only.
 *
 * Gate: super / accounting / freight roles (the profit/cost view is internal).
 */

export const dynamic = "force-dynamic";

const thb = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `฿${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ShipmentRow = {
  id:                               string;
  job_no:                           string | null;
  status:                           string;
  transport_mode:                   FreightTransportMode;
  incoterm:                         string | null;
  source_quote_id:                  string | null;
  commercial_value_thb:             number | null;
  cost_china_freight_thb:           number | null;
  cost_local_thb:                   number | null;
  cost_total_thb:                   number | null;
  profit_margin_thb:                number | null;
  margin_exceeds_cap_at_conversion: boolean | null;
  margin_cap_thb:                   number | null;
};

type QuoteRow = {
  quote_no:                string | null;
  subtotal:                number | null;
  total:                   number | null;
  profit_margin_thb:       number | null;
  margin_exceeds_cap:      boolean | null;
  china_cost_lookup_error: boolean | null;
  commission_calc_status:  string | null;
  cost_china_freight_thb:  number | null;
  cost_local_thb:          number | null;
  cost_total_thb:          number | null;
};

type QuoteItemRow = {
  description:           string;
  line_total_thb:        number | null;
  commission_scope:      string | null;
  commission_pct:        number | null;
  commission_amount_thb: number | null;
};

type InvoiceRow = {
  invoice_no:           string | null;
  status:               string;
  commercial_value_thb: number | null;
  duty_thb:             number | null;
  vat_thb:              number | null;
  payment_status:       string | null;
};

export default async function FreightShipmentPnlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 2026-06-15 (owner "พนักงานไม่ควรเห็นต้นทุน") — P&L = cost/margin. Restricted
  // to cost-owners + freight MANAGERS (who close on margin). Dropped the line
  // freight roles (freight_sales · freight_*_clearance) + sales_admin.
  await requireAdmin([
    "super", "accounting", "ops", "pricing",
    "freight_sales_manager", "freight_import_manager", "freight_export_manager",
  ]);
  const { id } = await params;
  const admin = createAdminClient();

  // 1) Shipment cost/margin snapshot.
  const { data: ship, error: shipErr } = await admin
    .from("freight_shipments")
    .select(`
      id, job_no, status, transport_mode, incoterm, source_quote_id,
      commercial_value_thb,
      cost_china_freight_thb, cost_local_thb, cost_total_thb, profit_margin_thb,
      margin_exceeds_cap_at_conversion, margin_cap_thb
    `)
    .eq("id", id)
    .maybeSingle<ShipmentRow>();
  if (shipErr) {
    console.error(`[freight/shipments/[id]/p-and-l shipment lookup] id=${id}`, {
      code: shipErr.code, message: shipErr.message, details: shipErr.details, hint: shipErr.hint,
    });
    throw new Error(`Failed to load freight_shipments (${shipErr.code}): ${shipErr.message}`);
  }
  if (!ship) notFound();

  // 2) Source quote (the sell side + persisted commission split).
  let quote: QuoteRow | null = null;
  let quoteItems: QuoteItemRow[] = [];
  if (ship.source_quote_id) {
    const { data: q, error: qErr } = await admin
      .from("freight_quotes")
      .select(`
        quote_no, subtotal, total, profit_margin_thb, margin_exceeds_cap,
        china_cost_lookup_error, commission_calc_status,
        cost_china_freight_thb, cost_local_thb, cost_total_thb
      `)
      .eq("id", ship.source_quote_id)
      .maybeSingle<QuoteRow>();
    if (qErr) {
      console.error(`[freight/shipments/[id]/p-and-l quote lookup] quoteId=${ship.source_quote_id}`, {
        code: qErr.code, message: qErr.message, details: qErr.details, hint: qErr.hint,
      });
      throw new Error(`Failed to load freight_quotes (${qErr.code}): ${qErr.message}`);
    }
    quote = q ?? null;

    const { data: items, error: itemsErr } = await admin
      .from("freight_quote_items")
      .select("description, line_total_thb, commission_scope, commission_pct, commission_amount_thb")
      .eq("freight_quote_id", ship.source_quote_id)
      .order("position", { ascending: true });
    if (itemsErr) {
      console.error(`[freight/shipments/[id]/p-and-l quote items lookup] quoteId=${ship.source_quote_id}`, {
        code: itemsErr.code, message: itemsErr.message, details: itemsErr.details, hint: itemsErr.hint,
      });
      throw new Error(`Failed to load freight_quote_items (${itemsErr.code}): ${itemsErr.message}`);
    }
    quoteItems = (items ?? []) as QuoteItemRow[];
  }

  // 3) Realised revenue from the active (non-cancelled) invoice, if issued.
  const { data: invoicesRaw, error: invErr } = await admin
    .from("freight_invoices")
    .select("invoice_no, status, commercial_value_thb, duty_thb, vat_thb, payment_status")
    .eq("freight_shipment_id", id)
    .order("created_at", { ascending: false });
  if (invErr) {
    console.error(`[freight/shipments/[id]/p-and-l invoices lookup] id=${id}`, {
      code: invErr.code, message: invErr.message, details: invErr.details, hint: invErr.hint,
    });
    throw new Error(`Failed to load freight_invoices (${invErr.code}): ${invErr.message}`);
  }
  const invoices = (invoicesRaw ?? []) as InvoiceRow[];
  const activeInvoice = invoices.find((i) => i.status !== "cancelled") ?? null;
  const invoiceTotalThb = activeInvoice
    ? freightInvoiceTotalThb({
        commercial_value_thb: activeInvoice.commercial_value_thb,
        duty_thb:             activeInvoice.duty_thb,
        vat_thb:              activeInvoice.vat_thb,
      })
    : null;

  // ── Derived figures (display-only) ─────────────────────────────────
  // Cost = the shipment snapshot, falling back to the quote snapshot.
  const costChina = ship.cost_china_freight_thb ?? quote?.cost_china_freight_thb ?? null;
  const costLocal = ship.cost_local_thb ?? quote?.cost_local_thb ?? null;
  const costTotal = ship.cost_total_thb ?? quote?.cost_total_thb ?? null;
  // Revenue (sell) = quote subtotal (pre-VAT) — the operating revenue line.
  const sellSubtotal = quote?.subtotal ?? null;
  const sellTotal = quote?.total ?? null;
  const profit = ship.profit_margin_thb ?? quote?.profit_margin_thb ?? null;
  const marginCapThb = ship.margin_cap_thb ?? (await getBusinessConfig<number>("freight.margin_cap_thb", 15_000));
  const marginExceedsCap =
    ship.margin_exceeds_cap_at_conversion ?? quote?.margin_exceeds_cap ?? false;
  const chinaCostLookupError = quote?.china_cost_lookup_error ?? false;

  // Commission rollup from the persisted per-line splits.
  const commByScope = new Map<string, number>();
  let commGross = 0;
  for (const it of quoteItems) {
    const amt = Number(it.commission_amount_thb ?? 0);
    if (amt <= 0) continue;
    commGross += amt;
    const scope = it.commission_scope ?? "other";
    commByScope.set(scope, (commByScope.get(scope) ?? 0) + amt);
  }
  commGross = roundThb(commGross);
  const commWht = roundThb((commGross * FREIGHT_COMMISSION.whtPct) / 100);
  const commNet = roundThb(commGross - commWht);
  const SCOPE_LABEL: Record<string, string> = {
    freight: "ค่าเฟรท (1%)",
    thai_customs: "เคลียร์ศุลกากร (5%)",
    origin: "เอกสารต้นทาง (5%)",
    thai_transport: "ขนส่งในไทย",
    import_tax: "ภาษีนำเข้า",
    other: "อื่นๆ",
  };

  const hasCostData = costTotal != null || profit != null;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="space-y-1">
        <Link
          href={`/admin/freight/shipments/${id}`}
          className="text-xs text-primary-500 hover:underline"
        >
          ← กลับหน้างานขนส่ง
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          P&amp;L · งาน <span className="font-mono">{ship.job_no ?? "—"}</span>
        </h1>
        <p className="text-xs text-muted">
          {FREIGHT_TRANSPORT_MODE_LABEL[ship.transport_mode]}
          {ship.incoterm ? ` · ${ship.incoterm}` : ""}
          {quote?.quote_no ? ` · จากใบเสนอราคา ${quote.quote_no}` : ""}
        </p>
        <p className="text-[11px] text-amber-700">
          🔒 ข้อมูลภายใน — แสดงต้นทุน/กำไรเพื่อการบริหารเท่านั้น ไม่ใช่ยอดที่ลูกค้าเห็นและไม่ใช่มูลค่าสำแดง (declared)
        </p>
      </div>

      {!hasCostData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ยังไม่มีข้อมูลต้นทุน/กำไรของงานนี้ — ใบเสนอราคาต้นทางยังไม่ได้คำนวณราคาจาก rate card
          (ใช้ปุ่ม “คำนวณจาก rate card” ในใบเสนอราคา) หรืองานนี้สร้างขึ้นเอง.
        </div>
      )}

      {chinaCostLookupError && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
          ⚠️ ไม่พบเรทต้นทุนเฟรทจีนสำหรับเส้นทางนี้ → ตัวเลข “กำไร” เป็น <strong>กำไรขั้นต้น</strong> (ก่อนหักต้นทุนเฟรทจีน).
          เพิ่มเรทที่ <Link href="/admin/freight/rates" className="text-primary-600 hover:underline">/admin/freight/rates</Link> แล้วคำนวณใบเสนอราคาใหม่.
        </div>
      )}

      {/* COST block */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2">
        <h2 className="font-bold text-sm">💸 ต้นทุน (Cost)</h2>
        <dl className="text-sm divide-y divide-border/60">
          <Row label="ต้นทุนเฟรทจีน (FX-converted)" value={thb(costChina)} />
          <Row label="ต้นทุนในไทย (ศุลกากร + ขนส่ง)" value={thb(costLocal)} />
          <Row label="รวมต้นทุน" value={thb(costTotal)} strong />
        </dl>
      </section>

      {/* REVENUE block */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2">
        <h2 className="font-bold text-sm">💰 รายได้ (Revenue)</h2>
        <dl className="text-sm divide-y divide-border/60">
          <Row label="ยอดขาย (ก่อน VAT)" value={thb(sellSubtotal)} />
          <Row label="ยอดขายรวม VAT" value={thb(sellTotal)} />
          <Row
            label={`รายได้จริง (ใบแจ้งหนี้${activeInvoice?.invoice_no ? ` ${activeInvoice.invoice_no}` : ""})`}
            value={activeInvoice ? thb(invoiceTotalThb) : "ยังไม่ออกใบแจ้งหนี้"}
            strong={!!activeInvoice}
          />
        </dl>
      </section>

      {/* PROFIT block + margin-cap status */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">📈 กำไร (Profit)</h2>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] text-muted">กำไรสุทธิ (SELL − COST)</p>
            <p className={`text-3xl font-bold tabular-nums ${profit != null && profit < 0 ? "text-red-600" : "text-green-700"}`}>
              {thb(profit)}
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>เพดานกำไร (CEO): {thb(marginCapThb)}/ตู้</p>
          </div>
        </div>
        {profit != null && (
          marginExceedsCap ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ กำไรเกินเพดาน ≤{thb(marginCapThb)}/ตู้ (คำเตือนเชิงนโยบาย — ไม่บล็อกการบันทึก)
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              ✓ กำไรอยู่ในเพดานนโยบาย ≤{thb(marginCapThb)}/ตู้
            </div>
          )
        )}
      </section>

      {/* COMMISSION block (read-only) */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-2">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">🧮 คอมมิชชั่น (อ้างอิง · ก่อนจ่ายจริง)</h2>
          <span className="text-[10px] text-muted">
            จาก rate engine — บัญชี ledger คอมมิชชั่นจริงอยู่เวฟถัดไป
          </span>
        </div>
        {commGross <= 0 ? (
          <p className="text-xs text-muted">ยังไม่มีข้อมูลคอมมิชชั่น (ใบเสนอราคายังไม่ได้คำนวณจาก rate card)</p>
        ) : (
          <dl className="text-sm divide-y divide-border/60">
            {Array.from(commByScope.entries()).map(([scope, amt]) => (
              <Row key={scope} label={SCOPE_LABEL[scope] ?? scope} value={thb(amt)} />
            ))}
            <Row label="รวม (gross)" value={thb(commGross)} />
            <Row label={`หัก WHT ${FREIGHT_COMMISSION.whtPct}%`} value={`− ${thb(commWht)}`} />
            <Row label="คอมมิชชั่นสุทธิ" value={thb(commNet)} strong />
          </dl>
        )}
      </section>

      {/* Cross-links */}
      <div className="flex flex-wrap gap-3 text-xs">
        {ship.source_quote_id && (
          <Link href={`/admin/freight/quotes/${ship.source_quote_id}`} className="text-primary-600 hover:underline">
            → เปิดใบเสนอราคาต้นทาง
          </Link>
        )}
        <Link href={`/admin/freight/operations/${id}`} className="text-primary-600 hover:underline">
          → เปิด cockpit งานนี้
        </Link>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : ""}`}>{value}</dd>
    </div>
  );
}
