import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getPcsContainerPaymentDetail } from "@/actions/admin/pcs-container-payments";
import { PCS_CNT_STATUS } from "../constants";
import { PcsPaymentRowControls } from "../payment-row-controls";
import { PcsPaymentSlipViewer } from "../slip-viewer";

/**
 * /admin/accounting/container-payments/[id] — D1 Phase B.
 *
 * One legacy `tb_cnt` container-payment record + its three fan-out lists:
 *   - tb_cnt_item            → the เลขตู้ strings this payment covers
 *   - tb_cnt_pay_idorco      → the PK/CO numbers (forwarders.f_no)
 *   - tb_cnt_pay_trackingchn → the China tracking numbers
 *
 * Spec: docs/research/d1-fidelity-admin.md §6.3. RBAC: super + accounting.
 */

export const dynamic = "force-dynamic";

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminPcsContainerPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const t = await getTranslations("pcsContainer");

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const res = await getPcsContainerPaymentDetail(numId);
  if (!res.ok) {
    if (res.error === "not_found") notFound();
    return (
      <main className="p-6 lg:p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {t("loadError")}: {res.error}
        </div>
      </main>
    );
  }
  const p = res.data!;
  const paid = p.cntStatus === PCS_CNT_STATUS.PAID;

  return (
    <main className="space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            ADMIN · ACCOUNTING
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold">
            {p.cntName || `#${p.ID}`}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("detailSubtitle")} · #{p.ID}
          </p>
        </div>
        <Link
          href="/admin/accounting/container-payments"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          {t("backToLedger")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Payment overview */}
          <div className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{t("colAmount")}</p>
                <p className="mt-0.5 font-mono text-2xl font-bold">{thb(p.cntAmount)}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  paid
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {paid ? t("statusPaid") : t("statusUnpaid")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
              <Cell label={t("colDate")} value={p.date ? new Date(p.date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"} />
              <Cell label={t("fieldUpdatedAt")} value={p.dateUpdate ? new Date(p.dateUpdate).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"} />
              <Cell label={t("fieldCreatedBy")} value={p.adminIDCreate || "—"} mono />
            </div>
          </div>

          {/* Payee bank fields */}
          {(p.nameBlank || p.noBlank || p.nameAccount) && (
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface">
              <h2 className="mb-2 text-sm font-bold">{t("payeeSection")}</h2>
              <dl className="grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-3">
                <Cell label={t("payeeBank")}      value={p.nameBlank   || "—"} />
                <Cell label={t("payeeAcctNo")}    value={p.noBlank     || "—"} mono />
                <Cell label={t("payeeAcctName")}  value={p.nameAccount || "—"} />
              </dl>
            </div>
          )}

          {/* Cabinet numbers — tb_cnt_item */}
          <FanOutCard
            title={`${t("cabinetSection")} (${p.cabinetNumbers.length})`}
            items={p.cabinetNumbers}
            empty={t("noCabinet")}
          />

          {/* PK/CO numbers — tb_cnt_pay_idorco */}
          <FanOutCard
            title={`${t("idOrCoSection")} (${p.idOrCo.length})`}
            items={p.idOrCo}
            empty={t("noIdOrCo")}
            linkPrefix="/admin/forwarders/"
          />

          {/* China tracking — tb_cnt_pay_trackingchn */}
          <FanOutCard
            title={`${t("trackingSection")} (${p.trackingChn.length})`}
            items={p.trackingChn}
            empty={t("noTracking")}
          />
        </div>

        {/* Side panel — slip viewers + status flip */}
        <aside className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface">
            <h2 className="text-sm font-bold">{t("statusPanelTitle")}</h2>
            <PcsPaymentRowControls paymentId={p.ID} currentStatus={p.cntStatus} />
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface">
            <h2 className="text-sm font-bold">{t("fieldSlip")}</h2>
            {p.cntImagesSlip ? (
              <PcsPaymentSlipViewer paymentId={p.ID} kind="slip" />
            ) : (
              <p className="text-xs text-muted">{t("slipMissing")}</p>
            )}
            {p.cntFile && (
              <div className="border-t border-border pt-3">
                <p className="mb-1 text-xs font-medium">{t("extraDoc")}</p>
                <PcsPaymentSlipViewer paymentId={p.ID} kind="doc" />
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Cell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function FanOutCard({
  title,
  items,
  empty,
  linkPrefix,
}: {
  title: string;
  items: string[];
  empty: string;
  linkPrefix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 p-4">
          {items.map((it, i) =>
            linkPrefix ? (
              <li key={`${it}-${i}`}>
                <Link
                  href={`${linkPrefix}${encodeURIComponent(it)}`}
                  className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-700 hover:bg-amber-100"
                >
                  {it}
                </Link>
              </li>
            ) : (
              <li
                key={`${it}-${i}`}
                className="rounded border border-border bg-surface-alt px-1.5 py-0.5 font-mono text-[11px]"
              >
                {it}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
