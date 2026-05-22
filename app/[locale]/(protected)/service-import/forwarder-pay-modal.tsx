"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getForwarderPaymentQr,
  submitForwarderPayment,
  uploadForwarderSlip,
} from "@/actions/forwarder";
import type { ForwarderRow } from "./forwarder-row-view";

/**
 * `#list-payment2` — the multi-bill forwarder payment modal.
 *
 * A faithful 1:1 transcription of the legacy
 * `member/include/pages/index/getListPayForwarder.php` modal body
 * (L54-329) + the `paymentForwarderNew` POST handler it submits to
 * (`forwarder.php` L161-427) — D1 / ADR-0017.
 *
 * The customer ticks forwarder rows on `/service-import?q=5`, presses
 * "ชำระเงิน" on the bottom pay-bar → `<ForwarderInteractivity>` opens
 * this modal. It shows:
 *   - the red "wallet disabled for this service" banner (legacy L67-68)
 *   - one itemized block per selected forwarder — เลขออเดอร์ /
 *     เลขแทรคกิ้ง / the price breakdown rows / ราคารวม (legacy L120-173)
 *   - the bill summary: ยอดรวม + PCSF +50฿ + LESS WITHHOLDING TAX 1%
 *     (juristic) (legacy L207-248)
 *   - a PromptPay QR at the amount due, target id `0105560160694`
 *     (legacy L276 + makeCode() L388) + a copyable account number
 *     fallback (legacy L277/L288-289)
 *   - the KBank account block for juristic customers (legacy L280-300)
 *   - a slip-upload `<input type="file">` (legacy L305-308)
 *   - the "ยืนยัน" submit (legacy L316 `name="paymentForwarderNew"`)
 *
 * Wallet is DISABLED for this service — payment is PromptPay-QR +
 * slip only; the submit action only RECORDS a pending-verification
 * `tb_wallet_hs` row, it does NOT move wallet balance or flip the
 * forwarder status (admin verifies the slip later).
 *
 * Cross-RSC contract — every prop is plain-serializable (ForwarderRow
 * is a primitive-only object; isJuristic is a boolean). NO function
 * props cross the boundary — the Server Actions imported above are
 * the allowed exception (the fix-pattern that replaced the earlier
 * `renderRow={...}` RSC violation).
 */

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Human-readable PromptPay id grouping — a 13-digit tax/national id
// reads X-XXXX-XXXXX-XX-X; a 10-digit phone reads XXX-XXX-XXXX. Any
// other length is shown as-is. Cosmetic only — `copyText` always
// copies the raw digits so the customer's banking app gets a clean id.
function formatPromptPayId(id: string): string {
  const d = id.replace(/\D/g, "");
  if (d.length === 13) {
    return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
  }
  if (d.length === 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return id;
}

// getListPayForwarder.php L116 — the per-row total (BEFORE the bill-
// level +50฿ / -1% adjustments). The legacy formula verbatim:
//   (fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService
//    + priceCrate + fTransportPriceCHNTHB + priceOther) - fDiscount
function perRowTotal(row: ForwarderRow): number {
  return (
    row.ftotalprice +
    row.ftransportprice +
    row.fpriceupdate +
    row.fshippingservice +
    row.pricecrate +
    row.ftransportpricechnthb +
    row.priceother -
    row.fdiscount
  );
}

export type ForwarderPayModalProps = {
  /** Selected forwarder rows — the primitive-only subset of rowsData
   *  the customer ticked on the pay-bar. */
  rows: ForwarderRow[];
  /** Whether the customer is a juristic account — drives the 1% WHT
   *  line + the KBank account block (legacy `userCompany==1`). */
  isJuristic: boolean;
  /** Open/close — owned by <ForwarderInteractivity>. */
  open: boolean;
  onClose: () => void;
};

export function ForwarderPayModal({
  rows,
  isJuristic,
  open,
  onClose,
}: ForwarderPayModalProps) {
  const router = useRouter();

  // ── bill arithmetic — getListPayForwarder.php L96-247 ──
  const bill = useMemo(() => {
    let totalPriceAll = 0;
    for (const r of rows) totalPriceAll += perRowTotal(r);

    // L96-104 — count PCSF rows (fShipBy='PCSF' AND fTransportPrice=0).
    const countPricePCSF = rows.filter(
      (r) => r.fshipby === "PCSF" && r.ftransportprice === 0,
    ).length;
    // L220-225 — +50฿ flat fee when ≥1 PCSF row qualifies.
    const sumPricePCSF = countPricePCSF > 0 ? 50 : 0;
    totalPriceAll += sumPricePCSF;

    // L243-247 — juristic WHT 1% when total ≥ 1000.
    const totalNiTi =
      isJuristic && totalPriceAll >= 1000 ? totalPriceAll * 0.01 : 0;

    // L270 — the amount actually transferred (wallet=0 for this
    // service, so it is total − WHT).
    const payAmount = totalPriceAll - totalNiTi;

    return { totalPriceAll, sumPricePCSF, totalNiTi, payAmount };
  }, [rows, isJuristic]);

  // ── PromptPay QR — getListPayForwarder.php L276 + makeCode() ──
  // The QR fetch is the effect's external-system sync. State is only
  // set inside the async resolution (never synchronously in the effect
  // body) so it doesn't trigger cascading renders. The component is
  // mounted fresh each time the pay-bar opens it (the parent gives it
  // a `key` derived from the selected ids) — so no reset effect is
  // needed; `useState` initializers cover the fresh-mount reset.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  // The Pacred PromptPay id the QR resolved to (from PROMPTPAY_ID env
  // via getForwarderPaymentQr) — shown as the human-readable number.
  // null until the action returns / when PROMPTPAY_ID is unconfigured.
  const [promptPayId, setPromptPayId] = useState<string | null>(null);

  useEffect(() => {
    if (bill.payAmount <= 0) return;
    let cancelled = false;
    void getForwarderPaymentQr(bill.payAmount).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setQrDataUrl(res.data.dataUrl);
        setPromptPayId(res.data.promptPayId);
        setQrError(null);
      } else {
        setQrDataUrl(null);
        setPromptPayId(null);
        // promptpay_not_configured → owner hasn't set PROMPTPAY_ID on
        // Vercel yet; any other code → a transient QR-render failure.
        // `res.ok ? null : res.error` narrows the ActionResult union —
        // res.error only exists on the !ok variant.
        const code = res.ok ? null : res.error;
        setQrError(
          code === "promptpay_not_configured"
            ? "ยังไม่ได้ตั้งค่าพร้อมเพย์ของบริษัท กรุณาติดต่อแอดมินเพื่อชำระเงิน"
            : "ไม่สามารถสร้าง QR ได้ กรุณาติดต่อแอดมิน",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bill.payAmount]);

  // ── slip upload — getListPayForwarder.php L305-308 ──
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipDate, setSlipDate] = useState("");
  const [slipUploading, setSlipUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSlipUploading(true);
    const fd = new FormData();
    fd.append("slip", file);
    const res = await uploadForwarderSlip(fd);
    setSlipUploading(false);
    if (res.ok && res.data) {
      setSlipPath(res.data.path);
    } else {
      setSlipPath(null);
      setError(res.ok ? "อัปโหลดสลิปไม่สำเร็จ" : res.error);
    }
  }

  // getListPayForwarder.php L450 — the legacy `confirm()` gate before
  // the submit fires.
  function onConfirm() {
    if (rows.length === 0) return;
    if (!slipPath) {
      setError("กรุณาแนบหลักฐานการโอน (สลิปรายการ)");
      return;
    }
    const ok = window.confirm(
      "กรุณาตรวจสอบยอดเงินและสลิปก่อนยืนยันการชำระเงิน",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await submitForwarderPayment({
        ids: rows.map((r) => r.id),
        slipPath,
        slipDate: slipDate || undefined,
      });
      if (res.ok) {
        setDone(true);
        // Legacy: the modal hides + the page reloads (forwarder.php
        // re-renders the list with the rows now pending verification).
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function copyText(value: string) {
    if (navigator.clipboard) void navigator.clipboard.writeText(value);
  }

  if (!open) return null;

  return (
    <>
      {/* Legacy `.modal-backdrop` — BS4 renders it as a sibling. */}
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div
        id="list-payment2"
        className="modal fade show"
        tabIndex={-1}
        role="dialog"
        aria-hidden="false"
        style={{ display: "block" }}
      >
        <div className="modal-dialog" role="document">
          <div className="modal-content header-from">
            <div className="modal-header">
              <h4 className="modal-title">ชำระเงินออเดอร์ฝากนำเข้าสินค้า</h4>
              <button
                type="button"
                className="close"
                aria-label="Close"
                onClick={onClose}
              >
                <i className="la la-close"> </i>
              </button>
            </div>
            <div className="modal-body header-from">
              {/* NOTE — the legacy getListPayForwarder.php L63-72 showed a
                  red "ระบบกระเป๋าตังใช้กับบริการนี้ไม่ได้แล้ว / ไปที่ระบบ
                  ถอนเงิน" banner. That banner only made sense in the legacy
                  where this modal still had a wallet-pay control to disable.
                  The Pacred port never renders a wallet-pay option here at
                  all (forwarder bills are PromptPay-QR + slip only), so the
                  banner is pure noise — removed (owner directive 2026-05-22).
                  Reaching the wallet is the /wallet screen's job. */}

              {done ? (
                /* forwarder.php 'sPay' success state. */
                <div className="form-group">
                  <h4 className="pt-3 text-center text-success">
                    ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว
                  </h4>
                  <p className="text-center">
                    ระบบได้บันทึกรายการชำระเงิน {rows.length} รายการ
                    รอเจ้าหน้าที่ตรวจสอบสลิปและยืนยัน
                  </p>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-color-main waves-effect round"
                      onClick={onClose}
                    >
                      ปิด
                    </button>
                  </div>
                </div>
              ) : rows.length === 0 ? (
                /* getListPayForwarder.php L321 — empty-state. */
                <h4 className="pt-3 text-danger">
                  ไม่พบรายการที่ต้องชำระเงินกรุณาตรวจสอบ
                </h4>
              ) : (
                <div className="form-group">
                  {/* L94 — "มี N รายการที่ต้องชำระเงิน". */}
                  <h5 className="pt-2 text-right">
                    <b className="text-danger">
                      มี {rows.length} รายการที่ต้องชำระเงิน
                    </b>
                  </h5>

                  {error && (
                    <div className="bg-danger p05 text-white font-14 m-1">
                      {error}
                    </div>
                  )}

                  {/* ── per-forwarder itemized blocks — L118-173.
                      Each block is one clean bordered card (the legacy
                      stacked 3 hr-dashed lines per item which read as
                      visual noise — owner flagged 2026-05-22). One card
                      = one item, even 8px gap between, header centered. */}
                  {rows.map((row) => {
                    const rowTotal = perRowTotal(row);
                    return (
                      <div
                        key={row.id}
                        style={{
                          border: "1px solid #e5e5e5",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          marginBottom: "10px",
                        }}
                      >
                        {row.fcredit === "1" && (
                          <div className="text-color text-center font-12">
                            ชำระรายการเครดิต
                          </div>
                        )}
                        <h5 className="text-center mb-0">
                          เลขออเดอร์ :{" "}
                          <span className="text-color-main">
                            <b>{row.id}</b>
                          </span>{" "}
                          เลขแทรคกิ้ง :{" "}
                          <span className="text-color-main">
                            {row.ftrackingchn2 && row.ftrackingchn2 !== ""
                              ? row.ftrackingchn2
                              : row.ftrackingchn}
                          </span>
                        </h5>
                        <div className="hr-dashed" />
                        <div
                          className={`row ${row.fcredit === "1" ? "bg-danger3" : ""}`}
                        >
                          {/* L125-126 — ราคานำเข้าจีน-ไทย. */}
                          <div className="col-6">
                            <h5 className="text-right">
                              <b>ราคานำเข้าจีน-ไทย : </b>
                            </h5>
                          </div>
                          <div className="col-6">
                            <h5 className="text-right">
                              <span>{numberFormat2(row.ftotalprice)}</span> บาท
                            </h5>
                          </div>
                          {/* L128-131 — ค่าตีลัง. */}
                          {row.pricecrate > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>ค่าตีลัง : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <span>{numberFormat2(row.pricecrate)}</span> บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L134-137 — ค่าขนส่งในจีน. */}
                          {row.ftransportpricechnthb > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>ค่าขนส่งในจีน : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <span>
                                    {numberFormat2(row.ftransportpricechnthb)}
                                  </span>{" "}
                                  บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L140-143 — เพิ่ม/ลด (ยอดจากฝากสั่งซื้อ). */}
                          {row.fpriceupdate > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>เพิ่ม/ลด : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <span>{numberFormat2(row.fpriceupdate)}</span>{" "}
                                  บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L146-149 — ค่าบริการขนส่ง. */}
                          {row.fshippingservice > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>ค่าบริการขนส่ง : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  {numberFormat2(row.fshippingservice)} บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L152-155 — ค่าจัดส่งในไทย. */}
                          {row.ftransportprice > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>ค่าจัดส่งในไทย : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <span>
                                    {numberFormat2(row.ftransportprice)}
                                  </span>{" "}
                                  บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L158-161 — ค่าอื่นๆ. */}
                          {row.priceother > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>ค่าอื่นๆ : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <span>{numberFormat2(row.priceother)}</span>{" "}
                                  บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L164-167 — ส่วนลด. */}
                          {row.fdiscount > 0 && (
                            <>
                              <div className="col-6">
                                <h5 className="text-right">
                                  <b>ส่วนลด : </b>
                                </h5>
                              </div>
                              <div className="col-6">
                                <h5 className="text-right">
                                  {numberFormat2(row.fdiscount)} บาท
                                </h5>
                              </div>
                            </>
                          )}
                          {/* L171-172 — ราคารวม (per row). */}
                          <div className="col-6">
                            <h5 className="text-right mb-0">
                              <b>ราคารวม : </b>
                            </h5>
                          </div>
                          <div className="col-6">
                            <h5 className="text-right mb-0">
                              <span>{numberFormat2(rowTotal)}</span> บาท
                            </h5>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* ── bill summary — getListPayForwarder.php L207-248 ── */}
                  <div className="row pt-05 bg-danger2">
                    <div className="col-12">
                      <h5>
                        <b>สรุปรายการทั้งหมด</b>
                      </h5>
                      <div className="mt-05 mb-1 hr-dashed" />
                    </div>
                    {/* L224-225 — รวมบิล PCS เหมาๆ (+50฿). */}
                    {bill.sumPricePCSF > 0 && (
                      <>
                        <div className="col-7">
                          <h5 className="text-right">
                            <b>รวมบิล PR เหมาๆ : </b>
                          </h5>
                        </div>
                        <div className="col-5">
                          <h5 className="text-right">
                            {numberFormat2(bill.sumPricePCSF)} บาท
                          </h5>
                        </div>
                      </>
                    )}
                    {/* L239-240 — ยอดรวม. */}
                    <div className="col-7 mb-1">
                      <h5 className="text-right">
                        <b>ยอดรวม : </b>
                      </h5>
                    </div>
                    <div className="col-5 mb-1">
                      <h5 className="text-right">
                        {numberFormat2(bill.totalPriceAll)} บาท
                      </h5>
                    </div>
                    {/* L246-247 — LESS WITHHOLDING TAX 1% (juristic). */}
                    {bill.totalNiTi > 0 && (
                      <>
                        <div className="col-7">
                          <h6 className="text-right">
                            <b>LESS WITHHOLDING TAX 1% : </b>
                          </h6>
                        </div>
                        <div className="col-5">
                          <h5 className="text-right totalNiTi">
                            {numberFormat2(bill.totalNiTi)} บาท
                          </h5>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── pay block — getListPayForwarder.php L264-310 ── */}
                  <div className="pay-more">
                    {/* L265-272 — ยอดเงินที่ต้องชำระจริง. */}
                    <div className="row pt-1 bg-main text-white">
                      <div className="col-6">
                        <h5 className="text-right text-white">
                          <b>ยอดเงินที่ต้องชำระจริง : </b>
                        </h5>
                      </div>
                      <div className="col-6">
                        <h5 className="text-right text-white font-2rem">
                          <b>
                            <span className="totalPriceAll">
                              {numberFormat2(bill.payAmount)}
                            </span>
                          </b>{" "}
                          บาท
                        </h5>
                      </div>
                    </div>

                    {/* L274-302 — the QR + PromptPay number. */}
                    <div className="row pt-1">
                      <div className="col-12 text-center">
                        <div
                          id="qrcode"
                          style={{
                            textAlign: "center",
                            width: 250,
                            height: 250,
                            margin: "0 auto",
                          }}
                        >
                          {qrDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={qrDataUrl}
                              width={250}
                              height={250}
                              alt="PromptPay QR"
                            />
                          ) : (
                            <div className="pt-3 text-muted">
                              {qrError ?? "กำลังสร้าง QR..."}
                            </div>
                          )}
                        </div>
                        <h4 className="text-danger pt-1">
                          ยอดเงิน :{" "}
                          <span id="amount-show">
                            {numberFormat2(bill.payAmount)} บาท
                          </span>
                        </h4>
                        {/* The PromptPay id as copyable text (legacy
                            L288-289 showed it too). Resolved from the
                            PROMPTPAY_ID env via getForwarderPaymentQr —
                            Pacred's OWN collection id, not the legacy
                            PCS Cargo account. Hidden until the action
                            returns it (and absent when PROMPTPAY_ID is
                            unconfigured — the QR-area notice covers
                            that case). */}
                        {promptPayId && (
                          <div className="pt-1">
                            พร้อมเพย์{" "}
                            <span id="text-pp" className="font-2rem mr-0-3">
                              {formatPromptPayId(promptPayId)}
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm2 btn-rounded btn-secondary"
                              onClick={() => copyText(promptPayId)}
                            >
                              คัดลอก
                            </button>
                          </div>
                        )}
                      </div>
                      {/* NOTE — the legacy showed a hard-coded KBank
                          account block (getListPayForwarder.php L280-300,
                          acct 064-174-3836 = PCS Cargo's bank). That
                          routes money to the predecessor company, so it
                          is NOT reproduced. Pacred collects via the
                          PromptPay QR above (the bank-agnostic channel).
                          If Pacred later wants a named bank account
                          shown, add it env-driven — never hard-code a
                          collection account. */}
                    </div>

                    {/* L304-309 — slip upload + the optional transfer
                        date, grouped in one bordered panel so the form
                        controls read as a coherent block (owner flagged
                        the bare inputs 2026-05-22). */}
                    <div
                      style={{
                        border: "1px solid #e5e5e5",
                        borderRadius: "8px",
                        padding: "12px 14px",
                        marginTop: "12px",
                      }}
                    >
                      <div>
                        <label
                          className="form-control-label"
                          htmlFor="imagesSlip"
                          style={{ fontWeight: 600 }}
                        >
                          หลักฐานการโอน (สลิปรายการ){" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          ref={fileRef}
                          id="imagesSlip"
                          type="file"
                          name="imagesSlip"
                          className="form-control"
                          accept="image/*"
                          onChange={onSlipChange}
                        />
                        {slipUploading && (
                          <div className="font-12 pt-05 text-warning">
                            กำลังอัปโหลดสลิป...
                          </div>
                        )}
                        {slipPath && !slipUploading && (
                          <div className="font-12 pt-05 text-success">
                            ✓ แนบสลิปเรียบร้อยแล้ว
                          </div>
                        )}
                      </div>

                      {/* Optional transfer date (legacy stores it as
                          tb_wallet_hs.dateslip). */}
                      <div className="pt-1">
                        <label
                          className="form-control-label"
                          htmlFor="slipDate"
                          style={{ fontWeight: 600 }}
                        >
                          วันเวลาที่โอน{" "}
                          <span className="font-12 text-muted">(ไม่บังคับ)</span>
                        </label>
                        <input
                          id="slipDate"
                          type="datetime-local"
                          className="form-control"
                          value={slipDate}
                          onChange={(e) => setSlipDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* L314-317 — modal footer. */}
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary waves-effect round"
                      onClick={onClose}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="btn btn-color-main waves-effect round"
                      onClick={onConfirm}
                      disabled={pending || slipUploading || !slipPath}
                    >
                      {pending ? "กำลังบันทึก..." : "ยืนยัน"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
