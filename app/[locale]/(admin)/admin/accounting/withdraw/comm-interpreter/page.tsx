import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getBatchList } from "@/actions/admin/withdraw-comm-batch";

/**
 * /admin/accounting/withdraw/comm-interpreter — Interpreter (ล่าม) batch
 * payouts (legacy `tb_withdraw_comm_interpreter_h` × 46 batches · `_item` ×
 * 2,947 line items).
 *
 * Mirror of /comm-sale with different per-item math: commission = Σ(diffyaun
 * yuan margin) × `tb_set_comm_interpreter.perCom` (per-interpreter %). Items
 * link to `tb_header_order` by hno (yuan orders) instead of `tb_forwarder`.
 *
 * Per brief §2 — MVP read-only. CREATE + PAY DEFERRED.
 *
 * Roles per ADR-0006 §1.4: accounting | sales_admin (super implicit).
 */

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "สร้างแล้ว",
  "2": "รอจ่าย",
  "3": "จ่ายแล้ว",
};
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-slate-100 text-slate-700 border border-slate-300",
  "2": "bg-amber-50 text-amber-700 border border-amber-200",
  "3": "bg-green-50 text-green-700 border border-green-200",
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function AdminWithdrawCommInterpreterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; rep?: string }>;
}) {
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Commission batch amounts (commbefore/WHT/net) = money-internal (owner
  // 2026-06-18): only ultra/accounting/pricing. Non-cost viewers keep the batch
  // list (date/payee/title/status) but the money columns + summary + CSV drop.
  const showMoney = canViewProfit(roles);
  const sp = await searchParams;
  const status = sp.status === "1" || sp.status === "2" || sp.status === "3" ? sp.status : undefined;
  const repId = (sp.rep ?? "").trim() || undefined;

  const result = await getBatchList({
    kind: "interpreter",
    status,
    adminId: repId,
    limit: 500,
  });

  const total = (result.counts["1"] ?? 0) + (result.counts["2"] ?? 0) + (result.counts["3"] ?? 0);
  const sumCommBefore = result.rows.reduce((s, r) => s + r.commbefore, 0);
  const sumWHT        = result.rows.reduce((s, r) => s + r.withholding, 0);

  // CSV rows for accounting reconciliation export — commission money columns
  // (ก่อน WHT / WHT / รับสุทธิ) omitted for non-cost viewers (data-layer).
  const csvRows: CsvRow[] = result.rows.map((b) => ({
    "Batch #":                 b.id,
    "วันที่สร้าง":             b.date ? new Date(b.date).toLocaleDateString("th-TH") : "",
    "ผู้รับเงิน (ล่าม)":       b.adminid,
    "หัวข้อ":                  b.title,
    ...(showMoney ? {
      "ค่าคอม (ก่อน WHT)":       b.commbefore,
      "หัก WHT":                 b.withholding,
      "รับสุทธิ":                b.amount,
    } : {}),
    "สถานะ":                   STATUS_LABEL[b.status] ?? b.status,
    "ธนาคารผู้รับ":            b.nameuserbank,
    "เลขที่บัญชี":             b.nouserbank,
    "สลิป":                    b.imagesslip,
  }));
  const csvCols = [
    "Batch #", "วันที่สร้าง", "ผู้รับเงิน (ล่าม)", "หัวข้อ",
    ...(showMoney ? ["ค่าคอม (ก่อน WHT)", "หัก WHT", "รับสุทธิ"] : []),
    "สถานะ", "ธนาคารผู้รับ", "เลขที่บัญชี", "สลิป",
  ];

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/accounting/withdraw/comm-interpreter" />
      <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · BATCH PAYOUT</p>
            <h1 className="mt-1 text-2xl font-bold">เบิกค่าคอมล่าม (batch รายเดือน)</h1>
            <p className="text-xs text-muted mt-1">
              ระบบจ่ายค่าคอมยกชุดสำหรับล่ามจีน · Σ(yuan margin) × % per <code className="bg-surface-alt px-1 rounded">tb_set_comm_interpreter</code>
            </p>
            <p className="text-[11px] text-muted mt-1">
              📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_withdraw_comm_interpreter_h</code> + <code className="bg-surface-alt px-1 rounded">_item</code>
              {" "}(legacy 46 batches · 2,947 รายการ) · MVP read-only · ⚠️ สร้าง batch DEFER ครั้งหน้า
            </p>
          </div>
          <span
            className="cursor-not-allowed rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-xs font-medium text-muted"
            title="DEFERRED · สร้าง batch ต้องคุย ก๊อต ก่อน + ต้องดู legacy PHP source"
          >
            + สร้าง batch (เร็วๆ นี้)
          </span>
        </header>

        <section className={`grid gap-3 ${showMoney ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
          <Stat label="ทั้งหมด" value={total.toLocaleString("th-TH")} />
          <Stat label="ในตาราง" value={result.rows.length.toLocaleString("th-TH")} />
          {showMoney && <Stat label="ค่าคอมรวม (ก่อนหัก)" value={thb(sumCommBefore)} small />}
          {showMoney && <Stat label="WHT รวม" value={thb(sumWHT)} small />}
        </section>

        <nav className="flex flex-wrap gap-2">
          <Link
            href="/admin/accounting/withdraw/comm-interpreter"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              !status ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
            }`}
          >
            ทั้งหมด <span className="ml-1 text-[11px]">({total})</span>
          </Link>
          {(["1", "2", "3"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/accounting/withdraw/comm-interpreter?status=${s}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {STATUS_LABEL[s]} <span className="ml-1 text-[11px] opacity-75">({result.counts[s] ?? 0})</span>
            </Link>
          ))}
        </nav>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-sm">📋 รายการ batch</h2>
            <div className="flex items-center gap-3">
              {result.rows.length > 0 && (
                <p className="text-xs text-muted">
                  {result.rows.length} แถว{showMoney && (
                    <> · รวม <span className="font-mono font-bold text-primary-700">{thb(result.sumAmount)}</span></>
                  )}
                </p>
              )}
              <CsvButton
                rows={csvRows}
                cols={csvCols.map((k) => ({ key: k, label: k }))}
                filename={`pacred-comm-interpreter-batches-${new Date().toISOString().slice(0, 10)}.csv`}
              />
            </div>
          </div>
          {result.rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มี batch {status && ` (status='${status}' = ${STATUS_LABEL[status]})`} · {total === 0 ? " ยังไม่มี historical data" : " ลองเปลี่ยน filter"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">ล่าม</th>
                    <th className="px-3 py-2">หัวข้อ</th>
                    {showMoney && <th className="px-3 py-2 text-right">ค่าคอม (ก่อน WHT)</th>}
                    {showMoney && <th className="px-3 py-2 text-right">หัก WHT</th>}
                    {showMoney && <th className="px-3 py-2 text-right">รับสุทธิ</th>}
                    <th className="px-3 py-2 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((b) => (
                    <tr key={b.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/accounting/withdraw/comm-interpreter/${b.id}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          #{b.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmtDate(b.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{b.adminid}</td>
                      <td className="px-3 py-2 text-xs">{b.title || "—"}</td>
                      {showMoney && <td className="px-3 py-2 text-right font-mono text-xs">{thb(b.commbefore)}</td>}
                      {showMoney && <td className="px-3 py-2 text-right font-mono text-xs text-muted">{thb(b.withholding)}</td>}
                      {showMoney && <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">{thb(b.amount)}</td>}
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[b.status]}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted">
          🔗 sibling: <Link href="/admin/accounting/withdraw/comm-sale" className="underline">เบิกค่าคอม Sales</Link>
        </p>
      </main>
    </>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono text-foreground ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
