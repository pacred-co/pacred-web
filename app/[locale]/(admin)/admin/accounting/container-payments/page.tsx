import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listPcsContainerPayments } from "@/actions/admin/pcs-container-payments";
import { PCS_CNT_STATUS } from "./constants";
import { PcsPaymentCreateForm } from "./payment-create-form";
import { PcsPaymentRowControls } from "./payment-row-controls";

/**
 * /admin/accounting/container-payments — D1 Phase B.
 *
 * The legacy PCS Cargo `tb_cnt` "ตารางจ่ายเงินค่าตู้" ledger — restored
 * per docs/research/d1-fidelity-admin.md §6.3. A list keyed by `cntname`
 * (เลขตู้): columns ยอด / สถานะ (รอจ่าย·จ่ายแล้ว) / สลิป / วันที่ / by.
 * NOT a logistics state-machine — the "status" is the payment paid/unpaid
 * flag (`cntstatus` 1/2). Legacy ground truth: pcs-admin/report-cnt.php.
 *
 * RBAC: super + accounting (finance territory — ADR-0005 K-7 / W-1).
 *
 * NOTE: distinct from /admin/accounting/container-costs (rate-card editor)
 * and /admin/warehouse/containers (the 0033 logistics spine). This page is
 * the missing China-side payment ledger the accounting team's PCS workflow
 * runs on.
 */

export const dynamic = "force-dynamic";

type SP = { status?: string; q?: string };

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminPcsContainerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const t  = await getTranslations("pcsContainer");
  const sp = await searchParams;

  const statusFilter =
    sp.status === "unpaid" || sp.status === "paid" ? sp.status : "all";

  const res = await listPcsContainerPayments({
    status: statusFilter,
    q:      sp.q || undefined,
    limit:  200,
  });

  const rows        = res.ok ? res.data!.rows : [];
  const unpaidCount = res.ok ? res.data!.unpaidCount : 0;
  const error       = res.ok ? null : res.error;

  const totalAmount = rows.reduce((acc, r) => acc + r.cntamount, 0);

  return (
    <main className="space-y-5 p-6 lg:p-8">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ACCOUNTING
        </p>
        <h1 className="mt-1 text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("pageSubtitle")}</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <StatCard label={t("statTotal")} value={String(rows.length)} />
        <StatCard
          label={t("statUnpaid")}
          value={String(unpaidCount)}
          tone={unpaidCount > 0 ? "warn" : "ok"}
        />
        <StatCard label={t("statAmount")} value={thb(totalAmount)} />
      </div>

      {/* Status filter */}
      <FilterChips current={statusFilter} q={sp.q} tAll={t("filterAll")} tUnpaid={t("statusUnpaid")} tPaid={t("statusPaid")} />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t("loadError")}: {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Ledger table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-bold">{t("ledgerTitle")} ({rows.length})</h2>
          </div>
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">{t("ledgerEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">{t("colCabinet")}</th>
                    <th className="px-4 py-3 text-right">{t("colAmount")}</th>
                    <th className="px-4 py-3">{t("colStatus")}</th>
                    <th className="px-4 py-3">{t("colSlip")}</th>
                    <th className="px-4 py-3">{t("colDate")}</th>
                    <th className="px-4 py-3">{t("colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const paid = r.cntstatus === PCS_CNT_STATUS.PAID;
                    return (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/accounting/container-payments/${r.id}`}
                            className="font-mono text-xs text-primary-600 hover:underline"
                          >
                            {r.cntname || `#${r.id}`}
                          </Link>
                          <p className="mt-0.5 text-[10px] text-muted">#{r.id}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {thb(r.cntamount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              paid
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {paid ? t("statusPaid") : t("statusUnpaid")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {r.cntimagesslip
                            ? <span className="text-green-700">{t("slipYes")}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {r.date
                            ? new Date(r.date).toLocaleDateString("th-TH")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <PcsPaymentRowControls
                            paymentId={r.id}
                            currentStatus={r.cntstatus}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* addPay form */}
        <aside>
          <PcsPaymentCreateForm />
        </aside>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const toneCls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : tone === "ok"
      ? "border-green-200 bg-green-50"
      : "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneCls}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-bold">{value}</p>
    </div>
  );
}

function FilterChips({
  current,
  q,
  tAll,
  tUnpaid,
  tPaid,
}: {
  current: string;
  q?: string;
  tAll: string;
  tUnpaid: string;
  tPaid: string;
}) {
  const build = (status: string) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return `/admin/accounting/container-payments${qs ? "?" + qs : ""}`;
  };
  const items: Array<{ key: string; label: string }> = [
    { key: "all", label: tAll },
    { key: "unpaid", label: tUnpaid },
    { key: "paid", label: tPaid },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {items.map((it) => (
        <Link
          key={it.key}
          href={build(it.key)}
          className={`rounded-full border px-2.5 py-1 ${
            current === it.key
              ? "border-primary-500 bg-primary-500 text-white"
              : "border-border bg-white hover:bg-surface-alt dark:bg-surface"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
