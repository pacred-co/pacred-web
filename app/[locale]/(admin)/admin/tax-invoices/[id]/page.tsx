import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { IssueButton } from "./issue-button";
import { CancelButton } from "./cancel-button";
import { CreditNoteButton } from "./credit-note-button";
import { WhtPanel, type WhtPanelEntry } from "./wht-panel";

// W-1: requireAdmin reads auth cookies; a page under a dynamic [id]
// segment that reads cookies MUST be force-dynamic (AGENTS.md §11 —
// else DYNAMIC_SERVER_USAGE 500 at request time).
export const dynamic = "force-dynamic";

/**
 * /admin/tax-invoices/[id] — detail view (T-P4 G2c).
 *
 * Shows the full header + lines + buyer/financial snapshot for review.
 *
 * For status='pending': renders the IssueButton which calls
 * `issueTaxInvoice` (reserves serial → renders PDF → uploads → flips
 * status). The button confirms before firing because issuance is
 * irreversible (RD Code 86 — once a serial is consumed, the row is
 * immutable; corrections require cancellation + credit note).
 *
 * For status='issued': shows serial_no + issued_at + download link.
 *
 * For status='cancelled': shows cancellation metadata + watermarked
 * download link (PDF re-rendered with overlay each request, see
 * /api/tax-invoice/[id] route).
 */

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  issued:    "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending:   "รออนุมัติ",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};

type Header = {
  id:                  string;
  profile_id:          string;
  status:              "pending" | "issued" | "cancelled";
  serial_no:           string | null;
  order_h_no:          string | null;
  forwarder_f_no:      string | null;
  buyer_name:          string;
  buyer_address:       string;
  buyer_tax_id:        string;
  buyer_branch:        string;
  subtotal_thb:        number;
  vat_thb:             number;
  total_thb:           number;
  vat_mode:            "inclusive" | "exclusive";
  payment_method:      string;
  pdf_storage_path:    string | null;
  cancelled_at:        string | null;
  cancellation_reason: string | null;
  /** G2e-2 — when this invoice was cancelled AND a credit note has been issued, points at the credit-note row. */
  credit_note_id:      string | null;
  /** G2e-2 — when this row IS a credit note (ใบลดหนี้), points back at the cancelled original. */
  credit_note_for_id:  string | null;
  issued_at:           string | null;
  created_at:          string;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
    email:       string | null;
    phone:       string | null;
  } | null;
};

type Line = {
  id:             string;
  position:       number;
  description:    string;
  qty:            number;
  unit_price_thb: number;
  amount_thb:     number;
  vat_thb:        number;
};

export default async function AdminTaxInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // W-1 (gap-admin H-1): same gate as the list page — tax-invoice
  // detail (RD Code 86 + buyer tax ID) is accounting-only.
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles also issue
  // tax invoices as part of documentation workflow
  // (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["accounting", "freight_export_doc", "freight_import_doc"]);

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tax_invoices")
    .select(`
      id, profile_id, status, serial_no, order_h_no, forwarder_f_no,
      buyer_name, buyer_address, buyer_tax_id, buyer_branch,
      subtotal_thb, vat_thb, total_thb, vat_mode, payment_method,
      pdf_storage_path, cancelled_at, cancellation_reason, issued_at, created_at,
      credit_note_id, credit_note_for_id,
      profile:profiles!profile_id ( member_code, first_name, last_name, email, phone )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[tax_invoices lookup] failed`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(`Failed to load tax_invoices (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (!data) notFound();

  // Normalise profile shape (Supabase typing returns array vs object inconsistency for FK joins)
  type ProfileShape = NonNullable<Header["profile"]>;
  const rawProfile = data.profile as ProfileShape | ProfileShape[] | null;
  const header: Header = {
    ...data,
    profile: Array.isArray(rawProfile) ? rawProfile[0] ?? null : rawProfile,
  } as Header;

  const { data: lines, error: linesErr } = await admin
    .from("tax_invoice_lines")
    .select("id, position, description, qty, unit_price_thb, amount_thb, vat_thb")
    .eq("tax_invoice_id", header.id)
    .order("position", { ascending: true });
  if (linesErr) {
    console.error(`[tax_invoice_lines list] failed`, { code: linesErr.code, message: linesErr.message });
  }

  const lineRows = (lines ?? []) as Line[];

  // ── WHT panel data (ADR-0015 / V-A6) ──
  // Look up an existing entry by the parent order. A single row per parent
  // order is enforced by partial-unique indexes; we read it (or null).
  const whtQuery = admin
    .from("withholding_tax_entries")
    .select(
      "id, cert_status, gross_invoice_thb, wht_base_thb, wht_rate_pct, wht_amount_thb, net_expected_thb, cert_number, cert_storage_path, cert_received_at, waived_reason, waived_at",
    )
    .limit(1);
  const whtRes = header.forwarder_f_no
    ? await whtQuery.eq("forwarder_f_no", header.forwarder_f_no).maybeSingle<WhtPanelEntry>()
    : header.order_h_no
    ? await whtQuery.eq("order_h_no",     header.order_h_no    ).maybeSingle<WhtPanelEntry>()
    : { data: null };
  const whtEntry: WhtPanelEntry | null = whtRes.data ?? null;

  // Suggested rate: forwarder (cargo/freight) → 1%, service-order (shop) → 3%
  const suggestedRate: 1 | 3 = header.forwarder_f_no ? 1 : 3;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/tax-invoices" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            ใบกำกับภาษี — {header.serial_no ?? "(รออนุมัติ)"}
          </h1>
          <p className="text-xs text-muted">
            ส่งคำขอเมื่อ {new Date(header.created_at).toLocaleString("th-TH")}
            {header.issued_at && (
              <> · ออกเมื่อ {new Date(header.issued_at).toLocaleString("th-TH")}</>
            )}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
          {STATUS_LABEL[header.status] ?? header.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Customer */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2">ลูกค้า (เจ้าของออเดอร์)</h2>
          <p className="text-sm">
            <span className="font-mono">{header.profile?.member_code ?? "—"}</span>{" "}
            · {header.profile?.first_name} {header.profile?.last_name}
          </p>
          {header.profile?.phone && <p className="text-xs text-muted">📞 {header.profile.phone}</p>}
          {header.profile?.email && <p className="text-xs text-muted">✉️ {header.profile.email}</p>}
          <p className="text-xs text-muted mt-3">
            อ้างอิงออเดอร์:{" "}
            {header.order_h_no
              ? <Link href={`/admin/service-orders/${header.order_h_no}`} className="font-mono text-primary-500 hover:underline">
                  ฝากสั่ง · {header.order_h_no}
                </Link>
              : header.forwarder_f_no
                ? <Link href={`/admin/forwarders/${header.forwarder_f_no}`} className="font-mono text-primary-500 hover:underline">
                    ฝากนำเข้า · {header.forwarder_f_no}
                  </Link>
                : "—"}
          </p>
        </section>

        {/* Buyer (immutable snapshot) */}
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2 flex items-center gap-2">
            ผู้ซื้อ (snapshot)
            <span className="text-[10px] text-muted font-normal">— ตามกรมสรรพากร มาตรา 86 ห้ามแก้</span>
          </h2>
          <p className="font-medium">{header.buyer_name}</p>
          <p className="text-xs whitespace-pre-line">{header.buyer_address}</p>
          <p className="text-xs">
            <span className="text-muted">เลขประจำตัวผู้เสียภาษี:</span>{" "}
            <span className="font-mono">{header.buyer_tax_id}</span>
          </p>
          <p className="text-xs">
            <span className="text-muted">สาขา:</span> {header.buyer_branch}
          </p>
        </section>
      </div>

      {/* Lines */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">รายการ</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-xs uppercase tracking-wide text-muted">
            <tr className="text-left">
              <th className="px-4 py-2 w-12">#</th>
              <th className="px-4 py-2">รายละเอียด</th>
              <th className="px-4 py-2 text-right w-20">จำนวน</th>
              <th className="px-4 py-2 text-right w-32">ราคา/หน่วย</th>
              <th className="px-4 py-2 text-right w-32">รวม</th>
              <th className="px-4 py-2 text-right w-28">VAT</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-3 text-xs text-muted">{l.position}</td>
                <td className="px-4 py-3">{l.description}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{Number(l.qty).toLocaleString("en-US")}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">฿{Number(l.unit_price_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">฿{Number(l.amount_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">฿{Number(l.vat_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-alt/30 text-sm">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted">มูลค่าสินค้า/บริการ</td>
              <td className="px-4 py-2 text-right font-mono">฿{Number(header.subtotal_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted">
                ภาษีมูลค่าเพิ่ม 7%
                {header.vat_mode === "inclusive" && <span className="text-[10px] ml-1">(รวมในราคา)</span>}
              </td>
              <td className="px-4 py-2 text-right font-mono">฿{Number(header.vat_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
            <tr className="border-t border-border font-bold">
              <td colSpan={4} className="px-4 py-3 text-right">รวมทั้งสิ้น</td>
              <td className="px-4 py-3 text-right font-mono text-base text-primary-700">฿{Number(header.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td className="px-4 py-3 text-right text-xs text-muted">{header.payment_method}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* WHT panel (juristic-customer flow per ADR-0015) — shown for pending
          invoices so admin can record/clear the WHT entry before issuing.
          Also shown for issued (read-only display) if a WHT row exists. */}
      {(header.status === "pending" || (header.status === "issued" && whtEntry)) && (
        <WhtPanel
          taxInvoiceId={header.id}
          orderType={header.forwarder_f_no ? "forwarder" : "service_order"}
          orderId={header.forwarder_f_no ?? header.order_h_no ?? ""}
          suggestedGross={Number(header.total_thb)}
          suggestedRate={suggestedRate}
          entry={whtEntry}
        />
      )}

      {/* Action zone */}
      {header.status === "pending" && (
        <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3">
          <h2 className="font-bold text-sm">การดำเนินการ</h2>
          <ul className="text-xs text-yellow-900 list-disc pl-5 space-y-0.5">
            <li>ตรวจสอบชื่อ/ที่อยู่/เลขผู้เสียภาษี ของผู้ซื้อให้ตรงกับเอกสารจริง</li>
            <li>ตรวจสอบยอด + รายการ ให้ตรงกับออเดอร์อ้างอิง</li>
            <li>เมื่อกด &quot;ออกใบกำกับภาษี&quot; ระบบจะจองเลขที่ + สร้าง PDF + lock ข้อมูลทั้งใบ — แก้ไม่ได้อีก</li>
            <li>หากต้องแก้ไขภายหลัง: ยกเลิกใบเดิม + ออกใบลดหนี้ + ออกใบใหม่ (ตามกฎ มาตรา 86)</li>
            <li>หากข้อมูลผู้ซื้อ/ยอดผิด สามารถปฏิเสธคำขอได้ที่ปุ่มยกเลิก (ลูกค้าต้องส่งคำขอใหม่)</li>
          </ul>
          <div className="flex flex-wrap items-start gap-3">
            <IssueButton id={header.id} />
            <CancelButton id={header.id} status="pending" />
          </div>
        </section>
      )}

      {header.status === "issued" && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-bold text-green-800">ออกใบกำกับภาษีเรียบร้อย</p>
              <p className="text-xs text-green-700 mt-0.5">
                เลขที่ <span className="font-mono">{header.serial_no}</span>
                {header.issued_at && (
                  <> · ออกเมื่อ {new Date(header.issued_at).toLocaleString("th-TH")}</>
                )}
              </p>
            </div>
            {/* This page reads the World-A `tax_invoices` store; the PDF route
                now reads the LIVE tb_* stores. Pass the route's default store
                (forwarder) — World-A ids won't resolve there, so the link 404s
                cleanly until this admin LIST page is repointed to tb_* (separate task). */}
            <a
              href={`/api/tax-invoice/${header.id}?store=forwarder`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
            >
              ดาวน์โหลด PDF →
            </a>
          </div>
          <div className="border-t border-green-200 pt-3">
            <p className="text-xs text-green-800 mb-2">
              พบข้อผิดพลาด? ยกเลิกใบนี้ → ลูกค้าจะขอใบใหม่ได้ทันที (จะได้เลขใหม่)
            </p>
            <CancelButton id={header.id} status="issued" />
          </div>
        </section>
      )}

      {header.status === "cancelled" && (
        <section className="rounded-2xl border border-gray-200 bg-gray-50 dark:bg-surface-alt p-5 space-y-3">
          <div>
            <p className="text-sm font-bold">ใบกำกับภาษีถูกยกเลิก</p>
            {header.cancelled_at && (
              <p className="text-xs text-muted">
                ยกเลิกเมื่อ {new Date(header.cancelled_at).toLocaleString("th-TH")}
              </p>
            )}
            {header.cancellation_reason && (
              <p className="text-xs mt-1">เหตุผล: {header.cancellation_reason}</p>
            )}
          </div>
          <a
            href={`/api/tax-invoice/${header.id}?store=forwarder`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
          >
            ดู PDF (มีลายน้ำ CANCELLED) →
          </a>

          {/* G2e-2 (R3) — credit-note issuance for refund cases.
              Only show when:
                · was previously issued (has serial_no) AND
                · no credit note has been issued yet (credit_note_id null) */}
          {header.serial_no && !header.credit_note_id && (
            <div className="pt-3 border-t border-gray-300">
              <CreditNoteButton
                originalInvoiceId={header.id}
                originalSerial={header.serial_no}
                totalThb={Number(header.total_thb)}
              />
            </div>
          )}

          {/* Already credited — link to the credit note */}
          {header.credit_note_id && (
            <div className="pt-3 border-t border-gray-300">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                📝 ออกใบลดหนี้แล้ว —{" "}
                <Link
                  href={`/admin/tax-invoices/${header.credit_note_id}`}
                  className="text-primary-600 hover:underline font-medium"
                >
                  ดูใบลดหนี้ →
                </Link>
              </p>
            </div>
          )}
        </section>
      )}

      {/* G2e-2 — when this row IS a credit note, link back to the original */}
      {header.credit_note_for_id && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-2">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
            📝 ใบลดหนี้ (Credit Note)
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            ใบนี้เป็นใบลดหนี้ที่ออกเพื่อยกเลิกใบกำกับภาษีต้นฉบับ —{" "}
            <Link
              href={`/admin/tax-invoices/${header.credit_note_for_id}`}
              className="text-amber-900 dark:text-amber-100 hover:underline font-medium"
            >
              ดูใบกำกับภาษีต้นฉบับ →
            </Link>
          </p>
        </section>
      )}
    </main>
  );
}
