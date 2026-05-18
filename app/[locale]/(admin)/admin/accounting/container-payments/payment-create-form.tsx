"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload, Loader2, AlertTriangle, Plus } from "lucide-react";
import {
  adminCreatePcsContainerPayment,
  uploadPcsContainerPaymentSlip,
  checkPcsContainerDoublePay,
} from "@/actions/admin/pcs-container-payments";

/**
 * D1 Phase B — legacy `report-cnt.php` addPay form.
 *
 * Records one container PAYMENT into tb_cnt: the เลขตู้ list, the China-
 * side amount + slip image, optional payee bank fields, and the PK/CO +
 * China-tracking fan-out. Reproduces the legacy double-pay guard — before
 * submit it counts existing tb_cnt_pay_trackingchn / _idorco rows and
 * warns "กำลังจะจ่ายซ้ำ".
 *
 * super + accounting only.
 */

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/** Split a textarea blob on newline / comma into a trimmed list. */
function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PcsPaymentCreateForm() {
  const t = useTranslations("pcsContainer");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [cabinetsRaw, setCabinetsRaw] = useState("");
  const [amount, setAmount]           = useState("");
  const [payeeBank, setPayeeBank]     = useState("");
  const [payeeAcctNo, setPayeeAcctNo] = useState("");
  const [payeeAcctName, setPayeeAcctName] = useState("");
  const [idOrCoRaw, setIdOrCoRaw]     = useState("");
  const [trackingRaw, setTrackingRaw] = useState("");
  const [markPaid, setMarkPaid]       = useState(false);

  const [slipFile, setSlipFile]     = useState<File | null>(null);
  const [slipPath, setSlipPath]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);

  const [msg, setMsg]   = useState<string | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [dupWarn, setDupWarn] = useState<string[] | null>(null);

  async function handleUpload() {
    if (!slipFile) return;
    setErr(null);
    setUploading(true);
    const res = await uploadPcsContainerPaymentSlip(slipFile);
    setUploading(false);
    if (res.ok && res.data) {
      setSlipPath(res.data.storage_path);
      setMsg(t("slipUploaded"));
      setTimeout(() => setMsg(null), 3000);
    } else {
      setErr(res.ok ? t("slipUploadFailed") : res.error);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);

    const cabinets = splitList(cabinetsRaw);
    const idOrCo   = splitList(idOrCoRaw);
    const tracking = splitList(trackingRaw);
    const amt      = Number(amount);

    if (cabinets.length === 0) { setErr(t("errNoCabinet")); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setErr(t("errBadAmount")); return; }
    if (!slipPath) { setErr(t("errNoSlip")); return; }

    startTransition(async () => {
      // Legacy double-pay guard — count existing fan-out rows first.
      if (idOrCo.length > 0 || tracking.length > 0) {
        const dup = await checkPcsContainerDoublePay({ id_or_co: idOrCo, tracking_chn: tracking });
        if (dup.ok && dup.data) {
          const hits = [...dup.data.duplicateTracking, ...dup.data.duplicateIdOrCo];
          if (hits.length > 0) {
            // Confirm-once: surface the warning; second click goes through.
            if (dupWarn === null) {
              setDupWarn(hits);
              setErr(t("dupWarnHint"));
              return;
            }
          }
        }
      }

      const res = await adminCreatePcsContainerPayment({
        cabinet_numbers:    cabinets,
        amount:             amt,
        slip_path:          slipPath,
        payee_bank:         payeeBank.trim() || undefined,
        payee_account_no:   payeeAcctNo.trim() || undefined,
        payee_account_name: payeeAcctName.trim() || undefined,
        id_or_co:           idOrCo,
        tracking_chn:       tracking,
        mark_paid:          markPaid,
      });

      if (res.ok) {
        setMsg(t("created"));
        setCabinetsRaw(""); setAmount(""); setPayeeBank("");
        setPayeeAcctNo(""); setPayeeAcctName("");
        setIdOrCoRaw(""); setTrackingRaw(""); setMarkPaid(false);
        setSlipFile(null); setSlipPath(null); setDupWarn(null);
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3"
    >
      <div>
        <h3 className="font-bold text-sm">{t("addFormTitle")}</h3>
        <p className="text-[11px] text-muted">{t("addFormHint")}</p>
      </div>

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {dupWarn && dupWarn.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" /> {t("dupWarnTitle")}
          </p>
          <p className="mt-1 font-mono break-all">{dupWarn.join(", ")}</p>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium">{t("fieldCabinets")}</span>
        <textarea
          value={cabinetsRaw}
          onChange={(e) => setCabinetsRaw(e.target.value)}
          className={inputCls + " min-h-[56px] font-mono"}
          placeholder={t("placeholderCabinets")}
          disabled={pending}
          required
        />
        <span className="block text-[10px] text-muted">{t("multiLineHint")}</span>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">{t("fieldAmount")}</span>
        <input
          type="number" inputMode="decimal" step="0.01" min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls + " font-mono"}
          disabled={pending}
          required
        />
      </label>

      {/* Slip upload — required (legacy cntimagesslip is NOT NULL). */}
      <div className="space-y-1">
        <span className="text-xs font-medium">{t("fieldSlip")}</span>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => { setSlipFile(e.target.files?.[0] ?? null); setSlipPath(null); }}
            className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-surface-alt file:px-2 file:py-1 file:text-xs"
            disabled={pending || uploading}
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={!slipFile || uploading || pending || !!slipPath}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {t("uploadBtn")}
          </button>
        </div>
        {slipPath && <p className="text-[11px] text-green-700">{t("slipReady")}</p>}
      </div>

      {/* Payee bank fields — legacy nameblank / noblank / nameaccount. */}
      <div className="rounded-lg border border-border/70 bg-surface-alt/40 p-2.5 space-y-2">
        <p className="text-[11px] font-medium text-muted">{t("payeeSection")}</p>
        <input
          value={payeeBank}
          onChange={(e) => setPayeeBank(e.target.value)}
          className={inputCls}
          placeholder={t("placeholderPayeeBank")}
          disabled={pending}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={payeeAcctNo}
            onChange={(e) => setPayeeAcctNo(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder={t("placeholderPayeeAcctNo")}
            disabled={pending}
          />
          <input
            value={payeeAcctName}
            onChange={(e) => setPayeeAcctName(e.target.value)}
            className={inputCls}
            placeholder={t("placeholderPayeeAcctName")}
            disabled={pending}
          />
        </div>
      </div>

      {/* Fan-out lists — PK/CO + China tracking. */}
      <label className="block space-y-1">
        <span className="text-xs font-medium">{t("fieldIdOrCo")}</span>
        <textarea
          value={idOrCoRaw}
          onChange={(e) => setIdOrCoRaw(e.target.value)}
          className={inputCls + " min-h-[48px] font-mono"}
          placeholder={t("placeholderIdOrCo")}
          disabled={pending}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">{t("fieldTracking")}</span>
        <textarea
          value={trackingRaw}
          onChange={(e) => setTrackingRaw(e.target.value)}
          className={inputCls + " min-h-[48px] font-mono"}
          placeholder={t("placeholderTracking")}
          disabled={pending}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={markPaid}
          onChange={(e) => setMarkPaid(e.target.checked)}
          disabled={pending}
          className="h-3.5 w-3.5"
        />
        <span>{t("markPaidNow")}</span>
      </label>

      <button
        type="submit"
        disabled={pending || uploading}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Plus className="h-4 w-4" />}
        {dupWarn ? t("confirmCreate") : t("createBtn")}
      </button>
    </form>
  );
}
