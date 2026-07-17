import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import {
  freightInvoiceTotalThb,
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
  type FreightInvoicePaymentStatus,
} from "@/lib/validators/freight-payment";

/**
 * Freight ใบแจ้งหนี้ — admin LIST.
 *
 * Surfaces the existing freight invoice backend (table `freight_invoices`,
 * actions in actions/admin/freight-invoices.ts + freight-invoice-payments.ts)
 * into a real admin grid. Faithful to legacy hs-forwarder-invoice.php
 * ("ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า"): invoice no · customer · shipment ref ·
 * amount · VAT · WHT · status · date.
 *
 * §0e money-isolation: reads the CANONICAL `freight_invoices` table only.
 * §0c: { data, error } destructured + console.error on every read.
 *
 * Gate: super / accounting / freight doc + sales roles (mirrors the freight
 * invoice PDF route's visibility set in /api/freight-invoice/[id]).
 */

export const dynamic = "force-dynamic";

const DOC_STATUS_BADGE: Record<string, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  issued:    "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};
const DOC_STATUS_LABEL: Record<string, string> = {
  draft:     "ร่าง",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};

const PAY_STATUS_BADGE: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "bg-amber-50 text-amber-700 border-amber-200",
  partial:  "bg-orange-50 text-orange-700 border-orange-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  overpaid: "bg-purple-50 text-purple-700 border-purple-200",
};

const DOC_STATUSES = ["draft", "issued", "cancelled"] as const;

type Row = {
  id:                   string;
  invoice_no:           string | null;
  status:               string;
  payment_status:       FreightInvoicePaymentStatus | null;
  freight_shipment_id:  string;
  commercial_value_thb: number | null;
  duty_thb:             number | null;
  vat_thb:              number | null;
  issued_at:            string | null;
  created_at:           string;
  shipment: { job_no: string | null } | null;
  profile: {
    member_code:  string | null;
    first_name:   string | null;
    last_name:    string | null;
    company_name: string | null;
  } | null;
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function customerName(p: Row["profile"]): string {
  if (!p) return "—";
  const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return p.company_name ?? full ?? "—";
}

export default async function AdminFreightInvoicesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin([
    "super",
    "accounting",
    "freight_sales_manager",
    "freight_sales",
    "freight_export_doc",
    "freight_import_doc",
    "freight_clearance_both",
  ]);

  const sp = await searchParams;
  const status = (DOC_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as string)
    : null;
  const q = sp.q?.trim() ?? "";
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  const admin = createAdminClient();

  // ── Main list (canonical freight_invoices) ──────────────────────────────
  let query = admin
    .from("freight_invoices")
    .select(
      `
      id, invoice_no, status, payment_status, freight_shipment_id,
      commercial_value_thb, duty_thb, vat_thb, issued_at, created_at,
      shipment:freight_shipments!freight_shipment_id ( job_no ),
      profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("invoice_no", `%${q}%`);

  const { data: raw, error: rawErr, count: total } = await query;
  if (rawErr) {
    console.error(`[freight_invoices list] failed`, { code: rawErr.code, message: rawErr.message });
  }

  type Ship = NonNullable<Row["shipment"]>;
  type Prof = NonNullable<Row["profile"]>;
  const rows: Row[] = (
    (raw ?? []) as unknown as (Omit<Row, "shipment" | "profile"> & {
      shipment: Ship | Ship[] | null;
      profile: Prof | Prof[] | null;
    })[]
  ).map((r) => ({
    ...r,
    shipment: Array.isArray(r.shipment) ? r.shipment[0] ?? null : r.shipment,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // ── Status counts ──────────────────────────────────────────────────────
  const counts: Record<string, number> = { draft: 0, issued: 0, cancelled: 0 };
  const { data: countRows, error: countErr } = await admin
    .from("freight_invoices")
    .select("status");
  if (countErr) {
    console.error(`[freight_invoices count] failed`, { code: countErr.code, message: countErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: string }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const allCount = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-6xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
        <h1 className="mt-1 text-2xl font-bold">ใบแจ้งหนี้ Freight</h1>
        <p className="text-xs text-muted mt-1">
          ประวัติการออกใบแจ้งหนี้ฝากนำเข้า (freight) — เลขที่ · ลูกค้า · งานขนส่ง · ยอดเงิน · VAT · หัก ณ ที่จ่าย · สถานะ · วันที่
        </p>
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/accounting/freight/invoices"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[11px]">({allCount})</span>
        </Link>
        {DOC_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/accounting/freight/invoices?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? DOC_STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {DOC_STATUS_LABEL[s]} <span className="ml-1 text-[11px] opacity-75">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/admin/accounting/freight/invoices" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          placeholder="ค้นหาเลขที่ใบแจ้งหนี้ (เช่น FI260612-0001)"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-x-auto scrollbar-x-visible">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>🧾</div>
            <p className="text-sm font-medium text-foreground">
              ไม่มีใบแจ้งหนี้{status && ` สถานะ "${DOC_STATUS_LABEL[status]}"`}{q && ` ตรงกับ "${q}"`}
            </p>
            <p className="text-xs text-muted max-w-md mx-auto">
              ใบแจ้งหนี้ freight ถูกสร้างจากหน้างานขนส่ง (shipment) — เปิด shipment แล้วกด &ldquo;สร้างใบแจ้งหนี้&rdquo;
            </p>
            <Link href="/admin/freight/shipments" className="inline-block text-xs font-medium text-primary-600 hover:underline">
              ไปที่งานขนส่ง (shipments) →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[760px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">ลูกค้า</th>
                <th className="px-3 py-2">งานขนส่ง</th>
                <th className="px-3 py-2 text-right">ยอดรวม (THB)</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">หัก ณ ที่จ่าย</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const total = freightInvoiceTotalThb({
                  commercial_value_thb: r.commercial_value_thb,
                  duty_thb: r.duty_thb,
                  vat_thb: r.vat_thb,
                });
                // WHT (หัก ณ ที่จ่าย) is captured on withholding_tax_entries,
                // not on the invoice row — displayed on the detail page. The
                // list shows a dash to keep the column faithful without a join.
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/accounting/freight/invoices/${r.id}`}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        {r.invoice_no ?? "(ร่าง)"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-sm">{customerName(r.profile)}</p>
                      {r.profile?.member_code && (
                        <CustomerCodeLink code={r.profile.member_code} className="text-[11px]" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/freight/shipments/${r.freight_shipment_id}`}
                        className="font-mono text-[11px] text-primary-600 hover:underline"
                      >
                        {r.shipment?.job_no ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(total)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.vat_thb)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted">—</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] ${DOC_STATUS_BADGE[r.status] ?? ""}`}>
                          {DOC_STATUS_LABEL[r.status] ?? r.status}
                        </span>
                        {r.status === "issued" && r.payment_status && (
                          <span className={`inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] ${PAY_STATUS_BADGE[r.payment_status] ?? ""}`}>
                            {FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[r.payment_status]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {(r.issued_at ?? r.created_at)
                        ? new Date(r.issued_at ?? r.created_at).toLocaleDateString("th-TH")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={total ?? 0}
        basePath="/admin/accounting/freight/invoices"
        params={{ status: status ?? undefined, q: q || undefined }}
      />
    </main>
  );
}
