"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
// 2026-06-05 (E2E audit · §0f confirm-before-mutate) — deposit submits a slip
// + creates pending tb_wallet_hs row; admin reviews. Without confirm the
// customer can't double-check the amount + slip file before commit.
import { confirm } from "@/components/ui/confirm";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { getDepositQr, submitLegacyWalletDeposit } from "@/actions/wallet";

/**
 * Faithful client-side wrapper for the legacy `addData` POST handler
 * (wallet.php L3-51 / wallet-credit.php L3-51).
 *
 * The legacy `<form method="POST" action="/wallet/" name="addData">`
 * (member/wallet.php L233-283) posts back to the same PHP page; on
 * success PHP sets `$sweetalert='successDeposit'` and the page reloads
 * with a SweetAlert toast. In Next.js 16 the equivalent flow is a
 * Server Action (actions/wallet.ts::submitLegacyWalletDeposit) called
 * via useTransition + a router.refresh() so the freshly-inserted row
 * appears in the 4-tab history without a hard reload.
 *
 * Visible DOM kept 1:1 with the legacy modal-body (same labels, same
 * field names, same button text, same legacy CSS classes). The inline
 * `alert()` messages (wallet.php L6/L9/L15) surface as a small bottom
 * banner — same content, less intrusive than a window.alert.
 */
type Kind = "wallet" | "credit";

export function LegacyDepositForm({ kind }: { kind: Kind }) {
  const t = useTranslations("walletDeposit");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // QR generation state — legacy wallet.php uses a client-side library to
  // build the PromptPay QR off the live `amount` input ($("#amount").val).
  // Pacred routes the build through `actions/wallet.ts::getDepositQr` so
  // the EMVCo payload uses the server-side `PROMPTPAY_ID` env (= Pacred
  // tax-id `0105564077716`, the canonical SOT in components/seo/site.ts)
  // — the customer's browser never sees the raw target. Returned as a
  // PNG data URL (lib/promptpay.ts → `qrcode` → `QRCode.toDataURL`).
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrAmount, setQrAmount] = useState<number | null>(null);
  const [qrPending, startQrTransition] = useTransition();
  // Localised error messages for the stable error codes the QR helper
  // returns (lib/promptpay.ts) — kept short so they fit the small
  // qrcodeMain area.
  const qrErrorText: Record<string, string> = {
    promptpay_not_configured: t("qrErrPromptpayNotConfigured"),
    promptpay_invalid_amount: t("qrErrInvalidAmount"),
    qr_failed:                t("qrErrFailed"),
  };

  function onGenerateQr() {
    if (qrPending) return;
    setMsg(null);
    const form = formRef.current;
    const amountStr = (form?.elements.namedItem("amount") as HTMLInputElement | null)?.value ?? "";
    const amount = Number(amountStr);
    if (!amountStr || !Number.isFinite(amount) || amount <= 0) {
      setMsg({ tone: "err", text: t("errEnterAmount") });
      return;
    }
    startQrTransition(async () => {
      const res = await getDepositQr(amount);
      if (!res.ok) {
        setQrDataUrl(null);
        setQrAmount(null);
        setMsg({
          tone: "err",
          text: qrErrorText[res.error] ?? t("qrFailedGeneric"),
        });
        return;
      }
      setQrDataUrl(res.data?.dataUrl ?? null);
      setQrAmount(amount);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setMsg(null);

    const form = e.currentTarget;
    const amountStr = (form.elements.namedItem("amount") as HTMLInputElement | null)?.value ?? "";
    const slipInput = form.elements.namedItem("imagesSlip") as HTMLInputElement | null;
    const slipFile = slipInput?.files?.[0] ?? null;

    // Faithful: replicate the legacy front-of-handler alerts (wallet.php
    // L5-9) so the user gets the same UX as the original.
    const amount = Number(amountStr);
    if (!amountStr || !Number.isFinite(amount) || amount <= 0) {
      setMsg({ tone: "err", text: t("errFillAllFields") });
      return;
    }
    if (!slipFile) {
      setMsg({ tone: "err", text: t("errSelectSlipImage") });
      return;
    }

    // §0f confirm-before-mutate — let the customer double-check the amount +
    // slip filename. ป้องกัน "เผลอกดเติม" ผิดยอด/ผิดสลิป.
    const slipKB = Math.round(slipFile.size / 1024);
    const ok = await confirm(
      t("confirmDepositLine", {
        amount: amount.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
      }) + "\n\n" +
      t("confirmSlipLine", { name: slipFile.name }) + "\n" +
      t("confirmSizeLine", { size: slipKB.toLocaleString("th-TH") }) + "\n\n" +
      t("confirmDepositNote"),
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await submitLegacyWalletDeposit({
        amount,
        slipFile,
        wUserCredit: kind === "credit" ? "1" : "0",
      });
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        return;
      }
      // wallet.php L39 — `$sweetalert = 'successDeposit'` (the legacy
      // SweetAlert reads "เติมเงินสำเร็จ รอเจ้าหน้าที่ตรวจสอบสลิป").
      setMsg({
        tone: "ok",
        text: t("depositSuccessMsg", { id: res.data?.id ?? "" }),
      });
      formRef.current?.reset();
      router.refresh();
    });
  }

  // wallet-credit posts to /wallet-credit; wallet posts to /wallet/.
  // The action is harmless because we override submission in JS — kept
  // for fidelity (same fallback if JS fails as the legacy).
  const action = kind === "credit" ? "/wallet-credit" : "/wallet/";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="w-full"
      method="POST"
      action={action}
      autoComplete="off"
      encType="multipart/form-data"
    >
      <div className="pt-1">
        <div>
          <label
            className="block text-xs font-medium text-muted mb-1"
            htmlFor="amount"
          >
            {t("amountLabel")}
          </label>
          <input
            className="w-full rounded-lg border border-border px-3 py-2 text-right text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-60"
            placeholder="00.00"
            name="amount"
            id="amount"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            disabled={pending}
          />
          <div className="text-center">
            <button
              type="button"
              className="mt-2 inline-flex items-center justify-center rounded-lg border border-red-500 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60"
              id="myBtn"
              onClick={onGenerateQr}
              disabled={pending || qrPending}
            >
              {qrPending ? t("generatingQr") : t("generateQrPay")}
            </button>
          </div>
        </div>
        <div className="qrcodeMain mt-3 mb-1 rounded-xl border border-border bg-surface-alt/40 dark:bg-surface p-4 text-center">
          {/* Legacy wallet.php built the QR via a client-side JS lib into
              this `#qrcode` div (a 250×250 canvas). Pacred replaces the
              lib call with `getDepositQr` (which uses the server-side
              `promptpay-qr` + `qrcode` against the canonical
              `PROMPTPAY_ID` env) and renders the returned PNG data URL
              inside the same wrapper so the surrounding layout (account
              number, PromptPay-id line, company name) is unchanged.
              The inline 250×250 size is load-bearing (QR canvas) — kept. */}
          <div
            id="qrcode"
            style={{
              textAlign: "center",
              width: "250px",
              height: "250px",
              display: "inline-block",
            }}
            className="max-w-full"
          >
            {qrDataUrl ? (
              <Image
                src={qrDataUrl}
                alt="PromptPay QR"
                width={250}
                height={250}
                unoptimized
                className="mx-auto h-auto max-w-full rounded-lg"
              />
            ) : null}
          </div>
          {kind === "credit" ? (
            <>
              <div className="mt-2 text-sm text-foreground">
                {t("accountNo")} : <span className="font-mono">225-2-91144-0</span> · บจก. แพคเรด (ประเทศไทย) · ธนาคารกสิกรไทย
              </div>
              {/* 2026-06-08: removed the stale legacy PromptPay number
                  "0-1055-64077-71-6" (wrong destination) — payment is the static
                  company QR + the bank account above; no PromptPay number shown. */}
            </>
          ) : null}
          <h5 className="mt-2 text-sm font-semibold text-foreground">
            {t("companyName")}
          </h5>
          {/* Legacy `#amount-show` was populated client-side from
              $("#amount").val() once the QR rendered. Pacred mirrors that
              by showing the same amount the QR was generated for (so
              there's no drift if the customer edits the input after
              generating). */}
          <div id="amount-show" className="text-center text-foreground">
            {qrDataUrl && qrAmount != null ? (
              <>
                <strong>
                  {t("amountBaht", { amount: qrAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
                </strong>
              </>
            ) : null}
          </div>
          <div className="mt-2 text-right">
            <a
              href="/wallet/deposit"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-red-600 hover:underline"
            >
              {t("howToDeposit")}
            </a>
          </div>
        </div>
        <div className="mt-3 mb-1">
          <label
            className="block text-xs font-medium text-muted mb-1"
            htmlFor="imagesSlip"
          >
            {t("transferProofLabel")}
          </label>
          <StyledFileInput
            name="imagesSlip"
            id="imagesSlip"
            accept="image/*"
            required
            disabled={pending}
            label="แนบสลิปการโอน (คลิกเพื่อเลือกรูป)"
            hint="รองรับรูปภาพ ไม่เกิน 9 MB"
          />
        </div>
        {kind === "wallet" && (
          <div className="mt-3 mb-1 rounded-lg border border-border bg-surface-alt/40 dark:bg-surface px-3 py-2.5 text-sm text-muted">
            <div className="font-medium text-foreground mb-1">
              {t("withdrawConditionsTitle")}
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                {" "}
                {t("withdrawCondition1")}
              </li>
              <li>
                {" "}
                {t("withdrawCondition2")}
              </li>
              <li> {t("withdrawCondition3")}</li>
              <li>
                {" "}
                {t("withdrawCondition4")}
              </li>
              <li>
                {" "}
                {t("withdrawCondition5")}
              </li>
              <li>
                {" "}
                {t("withdrawCondition6")}
              </li>
            </ol>
          </div>
        )}
        {msg && (
          <div
            className={`mb-1 rounded-lg border px-3 py-2 text-sm ${
              msg.tone === "ok"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
            role="alert"
          >
            {msg.text}
          </div>
        )}
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-alt transition-colors disabled:opacity-60"
            data-dismiss="modal"
            disabled={pending}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="submit-wait inline-flex items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-60"
            name="addData"
            disabled={pending}
          >
            {pending ? t("depositing") : t("deposit")}
          </button>
        </div>
      </div>
    </form>
  );
}
