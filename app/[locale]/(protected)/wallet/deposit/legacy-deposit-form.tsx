"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      className="form-horizontal"
      method="POST"
      action={action}
      autoComplete="off"
      encType="multipart/form-data"
    >
      <div className="form-group pt-1">
        <div className="">
          <label className="form-control-label" htmlFor="amount">
            จำนวนเงิน (บาท)
          </label>
          <input
            className="form-control form-control-lg text-right"
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
              className="btn btn-sm btn-outline-danger round m-1"
              id="myBtn"
              onClick={onGenerateQr}
              disabled={pending || qrPending}
            >
              {qrPending ? "กำลังสร้าง QR..." : "สร้าง QR Code ชำระเงิน"}
            </button>
          </div>
        </div>
        <div className="mb-1 qrcodeMain text-center">
          {/* Legacy wallet.php built the QR via a client-side JS lib into
              this `#qrcode` div (a 250×250 canvas). Pacred replaces the
              lib call with `getDepositQr` (which uses the server-side
              `promptpay-qr` + `qrcode` against the canonical
              `PROMPTPAY_ID` env) and renders the returned PNG data URL
              inside the same wrapper so the surrounding layout (account
              number, PromptPay-id line, company name) is unchanged. */}
          <div
            id="qrcode"
            style={{
              textAlign: "center",
              width: "250px",
              height: "250px",
              display: "inline-block",
            }}
          >
            {qrDataUrl ? (
              <Image
                src={qrDataUrl}
                alt="PromptPay QR"
                width={250}
                height={250}
                unoptimized
              />
            ) : null}
          </div>
          {kind === "credit" ? (
            <>
              <div style={{ textAlign: "center", marginTop: "10px" }}>
                เลขที่บัญชี : <span>225-2-91144-0</span>
              </div>
              <div style={{ textAlign: "center" }}>
                พร้อมเพย์ :{" "}
                <span id="pp-id-show2">0-1055-64077-71-6</span>
              </div>
            </>
          ) : null}
          <h5 className="text-center">บริษัท แพคเรด (ประเทศไทย) จำกัด</h5>
          {/* Legacy `#amount-show` was populated client-side from
              $("#amount").val() once the QR rendered. Pacred mirrors that
              by showing the same amount the QR was generated for (so
              there's no drift if the customer edits the input after
              generating). */}
          <div id="amount-show" style={{ textAlign: "center" }}>
            {qrDataUrl && qrAmount != null ? (
              <>
                <strong>
                  จำนวน {qrAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                </strong>
              </>
            ) : null}
          </div>
          <div className="text-right">
            <a href="/wallet/deposit" target="_blank" rel="noreferrer">
              ดูวิธีการเติมเงิน
            </a>
          </div>
        </div>
        <div className="mb-1">
          <label className="form-control-label" htmlFor="imagesSlip">
            หลักฐานการโอน (สลิปรายการ)
          </label>
          <div className="fallback">
            <input
              type="file"
              name="imagesSlip"
              id="imagesSlip"
              className="dropify"
              accept="image/*"
              data-max-file-size="9M"
              required
              disabled={pending}
            />
          </div>
        </div>
        {kind === "wallet" && (
          <div className="mb-1">
            <div>เงื่อนไขการถอนเงิน ที่ต้องทราบก่อนเติมเงินเข้าระบบ</div>
            <ol className="">
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
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline-secondary round waves-effect"
            data-dismiss="modal"
            disabled={pending}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            className="btn btn-outline-info round waves-effect submit-wait"
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
