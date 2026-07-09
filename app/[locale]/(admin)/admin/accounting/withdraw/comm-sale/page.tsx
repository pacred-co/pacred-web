import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { canViewProfit } from "@/lib/admin/money-visibility";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { CommBatchCreateForm } from "@/components/admin/comm-batch/comm-batch-create-form";
import {
  getBatchList,
  listCommPayAccounts,
  listCommissionPayees,
} from "@/actions/admin/withdraw-comm-batch";

/**
 * /admin/accounting/withdraw/comm-sale — Sales-rep batch payouts (legacy
 * `tb_withdraw_comm_sale_h` × 25 batches · `_item` × 3,204 line items).
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §2 — the LEGACY batch-payout system
 * was 0% ported (no Pacred reader/writer at all). This page makes the 25 real
 * historical batches visible. CREATE + PAY actions DEFERRED next sitting
 * (money-sensitive · needs ก๊อต co-sign + legacy PHP source verified).
 *
 * Legacy PHP: `pcs-admin/withdraw-commission-sale.php` +
 *             `include/pages/withdraw-commission-sale/home.php`
 *
 * Status legend (VERIFIED from legacy home.php/detail.php · 2026-07-09):
 *   '1' = รอดำเนินการ (created · awaiting slip + pay-out)
 *   '2' = จ่ายแล้ว (slip attached · paid out)
 *   '3' = ไม่สำเร็จ (failed)
 *
 * Roles per ADR-0006 §1.4: accounting | sales_admin (super implicit).
 */

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "จ่ายแล้ว",
  "3": "ไม่สำเร็จ",
};
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-amber-50 text-amber-700 border border-amber-200",
  "2": "bg-green-50 text-green-700 border border-green-200",
  "3": "bg-rose-50 text-rose-700 border border-rose-200",
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

export default async function AdminWithdrawCommSalePage({
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
    kind: "sale",
    status,
    adminId: repId,
    limit: 500,
  });

  // Create + pay are gated ["super","accounting"] (money write). Only load the
  // payee/account lists + render the create button when the viewer can create.
  const canCreate = isGodRole(roles) || roles.includes("accounting");
  const [payeesRes, accountsRes] = canCreate
    ? await Promise.all([listCommissionPayees("sale"), listCommPayAccounts()])
    : [null, null];
  const payees = payeesRes?.ok ? payeesRes.data?.payees ?? [] : [];
  const accounts = accountsRes?.ok ? accountsRes.data?.accounts ?? [] : [];

  const total = (result.counts["1"] ?? 0) + (result.counts["2"] ?? 0) + (result.counts["3"] ?? 0);
  const sumCommBefore = result.rows.reduce((s, r) => s + r.commbefore, 0);
  const sumWHT        = result.rows.reduce((s, r) => s + r.withholding, 0);

  // CSV rows for accounting reconciliation export — the commission money columns
  // (ก่อน WHT / WHT / รับสุทธิ) are omitted for non-cost viewers (data-layer).
  const csvRows: CsvRow[] = result.rows.map((b) => ({
    "Batch #":                 b.id,
    "วันที่สร้าง":             b.date ? new Date(b.date).toLocaleDateString("th-TH") : "",
    "ผู้รับเงิน":              b.adminid,
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
    "Batch #", "วันที่สร้าง", "ผู้รับเงิน", "หัวข้อ",
    ...(showMoney ? ["ค่าคอม (ก่อน WHT)", "หัก WHT", "รับสุทธิ"] : []),
    "สถานะ", "ธนาคารผู้รับ", "เลขที่บัญชี", "สลิป",
  ];

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/accounting/withdraw/comm-sale" />
      <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · BATCH PAYOUT</p>
            <h1 className="mt-1 text-2xl font-bold">เบิกค่าคอม Sales Rep (batch รายเดือน)</h1>
            <p className="text-xs text-muted mt-1">
              ระบบจ่ายค่าคอมยกชุดสำหรับ Sales rep · 1% ของ <code className="bg-surface-alt px-1 rounded">fTotalPriceNetAll</code> หัก WHT 3%
            </p>
            <p className="text-[11px] text-muted mt-1">
              📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_withdraw_comm_sale_h</code> + <code className="bg-surface-alt px-1 rounded">_item</code>
              {" "}(faithful-port ตาม legacy <code className="bg-surface-alt px-1 rounded">withdraw-commission-sale.php</code>) ·
              สร้าง batch + จ่ายเงิน (แนบสลิป) ได้แล้ว
            </p>
          </div>
          {canCreate ? (
            <CommBatchCreateForm kind="sale" payees={payees} accounts={accounts} />
          ) : (
            <span className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-xs font-medium text-muted">
              👁 ดูอย่างเดียว (สร้าง/จ่าย = บัญชี)
            </span>
          )}
        </header>

        {/* Summary band — money stat cards only for cost-allowed viewers */}
        <section className={`grid gap-3 ${showMoney ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
          <Stat label="ทั้งหมด" value={total.toLocaleString("th-TH")} />
          <Stat label="ในตาราง" value={result.rows.length.toLocaleString("th-TH")} />
          {showMoney && <Stat label="ค่าคอมรวม (ก่อนหัก)" value={thb(sumCommBefore)} small />}
          {showMoney && <Stat label="WHT รวม" value={thb(sumWHT)} small />}
        </section>

        {/* Status filter chips */}
        <nav className="flex flex-wrap gap-2">
          <Link
            href="/admin/accounting/withdraw/comm-sale"
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              !status ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
            }`}
          >
            ทั้งหมด <span className="ml-1 text-[11px]">({total})</span>
          </Link>
          {(["1", "2", "3"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/accounting/withdraw/comm-sale?status=${s}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {STATUS_LABEL[s]} <span className="ml-1 text-[11px] opacity-75">({result.counts[s] ?? 0})</span>
            </Link>
          ))}
        </nav>

        {/* Batches table */}
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
                filename={`pacred-comm-sale-batches-${new Date().toISOString().slice(0, 10)}.csv`}
              />
            </div>
          </div>
          {result.rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มี batch {status && ` (status='${status}' = ${STATUS_LABEL[status]})`} ·
              {total === 0 ? " ยังไม่มี historical data" : " ลองเปลี่ยน filter"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[800px] text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-orange-500 text-left text-[11px] uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">ผู้รับเงิน</th>
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
                          href={`/admin/accounting/withdraw/comm-sale/${b.id}`}
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
          🔗 sibling: <Link href="/admin/accounting/withdraw/comm-interpreter" className="underline">เบิกค่าคอมล่าม</Link>
          {" · "}
          ค่าคอมต่อรายการ: <Link href="/admin/commissions" className="underline">/admin/commissions</Link>
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
