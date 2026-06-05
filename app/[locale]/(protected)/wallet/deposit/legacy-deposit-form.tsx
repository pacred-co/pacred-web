"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
// 2026-06-05 (E2E audit · §0f confirm-before-mutate) — deposit submits a slip
// + creates pending tb_wallet_hs row; admin reviews. Without confirm the
// customer can't double-check the amount + slip file before commit.
import { confirm } from "@/components/ui/confirm";
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
    promptpay_not_configured: "ยังไม่ได้ตั้งค่า PromptPay (ติดต่อทีมงาน)",
    promptpay_invalid_amount: "กรุณากรอกจำนวนเงินให้ถูกต้อง",
    qr_failed:                "สร้าง QR ไม่สำเร็จ กรุณาลองใหม่",
  };

  function onGenerateQr() {
    if (qrPending) return;
    setMsg(null);
    const form = formRef.current;
    const amountStr = (form?.elements.namedItem("amount") as HTMLInputElement | null)?.value ?? "";
    const amount = Number(amountStr);
    if (!amountStr || !Number.isFinite(amount) || amount <= 0) {
      setMsg({ tone: "err", text: "กรุณากรอกจำนวนเงิน" });
      return;
    }
    startQrTransition(async () => {
      const res = await getDepositQr(amount);
      if (!res.ok) {
        setQrDataUrl(null);
        setQrAmount(null);
        setMsg({
          tone: "err",
          text: qrErrorText[res.error] ?? "สร้าง QR ไม่สำเร็จ",
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
      setMsg({ tone: "err", text: "กรุณากรอกข้อมูลให้ครบ" });
      return;
    }
    if (!slipFile) {
      setMsg({ tone: "err", text: "กรุณเลือกรูปข้อมูลให้ครบ" });
      return;
    }

    // §0f confirm-before-mutate — let the customer double-check the amount +
    // slip filename. ป้องกัน "เผลอกดเติม" ผิดยอด/ผิดสลิป.
    const slipKB = Math.round(slipFile.size / 1024);
    const ok = await confirm(
      `ยืนยันเติมเงิน ฿${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n\n` +
      `สลิป: ${slipFile.name}\n` +
      `ขนาด: ${slipKB.toLocaleString("th-TH")} KB\n\n` +
      `หลังกดยืนยัน ระบบจะส่งให้แอดมินตรวจสอบสลิป · ยอดจะเข้ากระเป๋าเมื่อแอดมินอนุมัติ`,
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
        text: `เติมเงินสำเร็จ #${res.data?.id ?? ""} — รอเจ้าหน้าที่ตรวจสอบสลิป`,
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
            จำนวนเงิน (บาท)
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
              {qrPending ? "กำลังสร้าง QR..." : "สร้าง QR Code ชำระเงิน"}
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
                เลขที่บัญชี : <span>225-2-91144-0</span>
              </div>
              <div className="text-sm text-foreground">
                พร้อมเพย์ :{" "}
                <span id="pp-id-show2">0-1055-64077-71-6</span>
              </div>
            </>
          ) : null}
          <h5 className="mt-2 text-sm font-semibold text-foreground">
            บริษัท แพคเรด (ประเทศไทย) จำกัด
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
                  จำนวน {qrAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
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
              ดูวิธีการเติมเงิน
            </a>
          </div>
        </div>
        <div className="mt-3 mb-1">
          <label
            className="block text-xs font-medium text-muted mb-1"
            htmlFor="imagesSlip"
          >
            หลักฐานการโอน (สลิปรายการ)
          </label>
          <div className="fallback">
            <input
              type="file"
              name="imagesSlip"
              id="imagesSlip"
              className="dropify block w-full rounded-lg border border-border px-3 py-2 text-base md:text-sm file:mr-3 file:rounded-md file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-60"
              accept="image/*"
              data-max-file-size="9M"
              required
              disabled={pending}
            />
          </div>
        </div>
        {kind === "wallet" && (
          <div className="mt-3 mb-1 rounded-lg border border-border bg-surface-alt/40 dark:bg-surface px-3 py-2.5 text-sm text-muted">
            <div className="font-medium text-foreground mb-1">
              เงื่อนไขการถอนเงิน ที่ต้องทราบก่อนเติมเงินเข้าระบบ
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                {" "}
                สามารถถอนเงินได้เมื่อ
                ท่านเคยชำระเงินบริการฝากสั่งซื้อสินค้าหรือฝากนำเข้าสินค้ากับทางบริษัท
                Pacred มาก่อน
              </li>
              <li>
                {" "}
                การถอนเงินต้องแนบเอกสาร
                บัตรประจำตัวประชาชนและหน้าสมุดบัญชีธนาคาร
              </li>
              <li> ยอดถอนเงินขั้นต่ำ คือ 25 บาท</li>
              <li>
                {" "}
                หากยอดที่ทำรายการถอนเงินน้อยกว่า 500 บาท
                จะมีค่าบริการถอนเงิน 25 บาทต่อครั้ง
              </li>
              <li>
                {" "}
                ระยะเวลาดำเนินการใช้เวลา 7-10 วันทำการ
                (ไม่รวมวันหยุดนักขัตฤกษ์และวันอาทิตย์)
                เนื่องจากทางบริษัทจำเป็นต้องตรวจสอบข้อมูลและยอดเงินเพื่อดำเนินการประสานงานกับทางธนาคารที่ให้บริการ
              </li>
              <li>
                {" "}
                ทางบริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงนโยบายไปตามเงื่อนไขที่บริษัทกำหนด
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
            ยกเลิก
          </button>
          <button
            type="submit"
            className="submit-wait inline-flex items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-60"
            name="addData"
            disabled={pending}
          >
            {pending ? "กำลังเติมเงิน..." : "เติมเงิน"}
          </button>
        </div>
      </div>
    </form>
  );
}
