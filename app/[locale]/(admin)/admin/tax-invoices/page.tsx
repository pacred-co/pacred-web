import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/**
 * Admin tax invoices list — ภูม T-P4 G2c starter scaffold.
 *
 * Resilient: if migration 0034 hasn't been applied yet (no `tax_invoices`
 * table), shows a friendly "ระบบใบกำกับภาษีกำลังเตรียมการ" message
 * instead of crashing.
 *
 * ภูม follow-ups (T-P4 G2c):
 *   - `/admin/tax-invoices/[id]/page.tsx` — detail view + issue/cancel
 *     buttons calling `adminIssueTaxInvoice` / `adminCancelTaxInvoice`
 *   - `actions/admin/tax-invoices.ts` — admin action handlers (mirror of
 *     adminMarkServiceOrderPaid; calls next_tax_invoice_serial() Postgres
 *     function for atomic serial reservation; renders PDF; uploads to
 *     Storage bucket `tax-invoices/`)
 *   - `components/pdf/tax-invoice.tsx` — react-pdf template forked from
 *     forwarder-receipt.tsx with the RD Code 86 required fields
 *
 * @see actions/tax-invoice.ts — customer-side `requestTaxInvoice` (shipped)
 * @see docs/decisions/0006-tax-invoice-flow.md — design contract
 * @see supabase/migrations/0034_tax_invoices.sql — schema
 */

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  issued:    "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending:   "รอออก",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};

type Row = {
  id:             string;
  profile_id:     string;
  order_h_no:     string | null;
  forwarder_f_no: string | null;
  buyer_name:     string;
  buyer_tax_id:   string;
  status:         string;
  serial_no:      string | null;
  total_thb:      number;
  vat_thb:        number;
  vat_mode:       string;
  created_at:     string;
  issued_at:      string | null;
};

export default async function AdminTaxInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp    = await searchParams;
  const admin = createAdminClient();

  let rows:        Row[]  = [];
  let tableMissing: boolean = false;
  let fetchError:  string | null = null;

  try {
    let q = admin
      .from("tax_invoices")
      .select(`id, profile_id, order_h_no, forwarder_f_no, buyer_name, buyer_tax_id,
               status, serial_no, total_thb, vat_thb, vat_mode, created_at, issued_at`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (sp.status) q = q.eq("status", sp.status);
    const { data, error } = await q;

    if (error) {
      // "relation \"public.tax_invoices\" does not exist" — migration not yet applied
      if (error.message.includes("does not exist") || error.code === "42P01") {
        tableMissing = true;
      } else {
        fetchError = error.message;
      }
    } else {
      rows = (data ?? []) as Row[];
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  // ── Pre-migration state ──
  if (tableMissing) {
    return (
      <main className="p-6 lg:p-8 max-w-2xl">
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ใบกำกับภาษี</h1>
        <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm">
          <p className="font-semibold text-yellow-900">⚠️ ระบบใบกำกับภาษีกำลังเตรียมการ</p>
          <p className="mt-2 text-yellow-800">
            Migration <code className="font-mono text-xs">0034_tax_invoices.sql</code> ยังไม่ได้
            apply บน Supabase project ตอนนี้.
          </p>
          <p className="mt-2 text-yellow-800">
            <strong>วิธีเปิดใช้งาน:</strong> apply migration ผ่าน Supabase Dashboard → SQL Editor
            หรือ <code className="font-mono text-xs">supabase db push</code>. ดู runbook
            ที่{" "}
            <Link href="/admin" className="text-primary-600 hover:underline">
              /admin
            </Link>
            {" "}สำหรับ checklist เต็ม.
          </p>
        </div>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="p-6 lg:p-8 max-w-2xl">
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ใบกำกับภาษี</h1>
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm">
          <p className="font-semibold text-red-900">⚠️ Failed to load tax invoices</p>
          <p className="mt-2 font-mono text-xs text-red-800">{fetchError}</p>
        </div>
      </main>
    );
  }

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const filterOpts = [
    { v: undefined,    l: `ทั้งหมด (${rows.length})` },
    { v: "pending",    l: `${STATUS_LABEL.pending} (${statusCounts.pending ?? 0})` },
    { v: "issued",     l: `${STATUS_LABEL.issued} (${statusCounts.issued ?? 0})` },
    { v: "cancelled",  l: `${STATUS_LABEL.cancelled} (${statusCounts.cancelled ?? 0})` },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ใบกำกับภาษี</h1>
        <p className="mt-1 text-sm text-muted">
          ลูกค้านิติบุคคล / ผู้มี Tax ID ขอออกใบกำกับภาษีเมื่อชำระเสร็จ — admin ตรวจสอบและกดออกที่หน้า detail
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {filterOpts.map((o) => {
          const isActive = sp.status === o.v;
          const href = o.v ? `/admin/tax-invoices?status=${o.v}` : "/admin/tax-invoices";
          return (
            <Link
              key={o.l}
              href={href}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border bg-white dark:bg-surface text-muted hover:text-foreground"
              }`}
            >
              {o.l}
            </Link>
          );
        })}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            {sp.status ? `ไม่มีรายการที่สถานะ "${STATUS_LABEL[sp.status] ?? sp.status}"` : "ยังไม่มีใบกำกับภาษีในระบบ"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">ลูกค้า / Tax ID</th>
                  <th className="px-4 py-3">อ้างอิงออเดอร์</th>
                  <th className="px-4 py-3 text-right">ยอด (บาท)</th>
                  <th className="px-4 py-3">VAT</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่ขอ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-4 py-3 text-xs">
                      {r.serial_no ? (
                        <Link href={`/admin/tax-invoices/${r.id}`} className="font-mono text-primary-600 hover:underline">
                          {r.serial_no}
                        </Link>
                      ) : (
                        <Link href={`/admin/tax-invoices/${r.id}`} className="font-mono text-primary-600 hover:underline">
                          {r.id.slice(0, 8)}...
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{r.buyer_name}</div>
                      <div className="font-mono text-muted">{r.buyer_tax_id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.order_h_no && (
                        <Link href={`/admin/service-orders/${r.order_h_no}`} className="text-primary-600 hover:underline">
                          ฝากสั่ง {r.order_h_no}
                        </Link>
                      )}
                      {r.forwarder_f_no && (
                        <Link href={`/admin/forwarders/${r.forwarder_f_no}`} className="text-primary-600 hover:underline">
                          ฝากนำเข้า {r.forwarder_f_no}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      ฿{Number(r.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-muted">{r.vat_mode === "inclusive" ? "รวมใน" : "แยก"}</div>
                      <div className="font-mono">฿{Number(r.vat_thb).toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_BADGE[r.status] ?? "bg-gray-50 text-gray-600 border-gray-200"
                      }`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("th-TH")}
                      {r.issued_at && (
                        <div className="text-[10px]">ออก {new Date(r.issued_at).toLocaleDateString("th-TH")}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="rounded-xl border border-border bg-surface-alt/30 px-4 py-3 text-xs text-muted space-y-1">
        <p>• <strong>รอออก (pending)</strong> = ลูกค้าขอแล้ว — admin ตรวจสอบและกดออกใบกำกับ → status flips to <strong>ออกแล้ว (issued)</strong> พร้อม serial INV-YYYYMM-NNNN + PDF</p>
        <p>• ใบที่ออกแล้วเปลี่ยนแก้ไขไม่ได้ (RD Code 86) — แก้ไขด้วยการ <strong>cancel + ออกใบลดหนี้ใหม่</strong> (credit note)</p>
        <p>• Detail page + issue/cancel actions = ภูม T-P4 G2c/G2e</p>
      </div>
    </main>
  );
}
