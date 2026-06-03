"use client";

/**
 * Single-row "record payment (debit wallet)" panel for the legacy
 * tb_forwarder detail branch of /admin/forwarders/[fNo].
 *
 * Theme A · 2026-05-31 (เดฟ · owner "ปิด money dead-write" + reachability §0d):
 *   The detail page's real-row (legacy) branch had NO way to record a
 *   forwarder payment — the old "mark paid" lived on the rebuilt-UUID branch
 *   (`update-form.tsx`) wired to `adminMarkForwarderPaid`, a money DEAD-WRITE
 *   (read/wrote the empty rebuilt `forwarders`/`wallet_transactions`). That
 *   action is now tombstoned. This panel routes single-row payment through the
 *   FAITHFUL, tested path `adminPayForwardersOnBehalf` (actions/admin/pay-user.ts):
 *     debit tb_wallet → settle tb_wallet_hs (type='4'/typenew='6') →
 *     flip tb_forwarder.fstatus 5→6. Same money math as /admin/wallet/pay-user.
 *
 *   Only renders when the row is payable (fStatus='5' รอชำระเงิน OR fCredit='1'),
 *   mirroring the action's own eligibility (`.or("fstatus.eq.5,fcredit.eq.1")`).
 *   On insufficient balance the action returns a clear reason; staff are pointed
 *   to /admin/wallet/pay-user for the slip-top-up flow.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { adminPayForwardersOnBehalf } from "@/actions/admin/pay-user";
import { adminMarkForwarderCredit } from "@/actions/admin/forwarders-field-edits";
import { confirm } from "@/components/ui/confirm";

type Props = {
  fId: number;            // tb_forwarder.id
  userId: string;         // tb_forwarder.userid (customer legacy code)
  customerName: string;   // for the confirm prompt
  amountEstimate: number; // tb_forwarder.ftotalprice (action recomputes authoritatively)
  walletBalance: number;  // tb_wallet.wallettotal (display only)
  isCredit: boolean;      // fCredit==='1'
};

export function TbForwarderPaymentPanel(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creditDate, setCreditDate] = useState<string>("");

  const shortfall = !p.isCredit && p.walletBalance < p.amountEstimate;

  // Credit-out: grant credit instead of debiting the wallet (forwarder.php
  // fStatus='c' branch). Faithful: gated on the customer's tb_users.userCreditValue
  // limit; adds the order to tb_credit.creditvalue. Only offered when not already
  // on credit.
  async function onCredit() {
    setError(null);
    setSuccess(null);
    if (!creditDate) { setError("กรุณาเลือกวันครบกำหนดชำระ (เครดิต)"); return; }
    if (!(await confirm(
      `ให้เครดิตรายการ #${p.fId} แก่ ${p.customerName} [${p.userId}] ?\n\n` +
      `ระบบจะบันทึกเป็นหนี้ค้างในวงเงินเครดิตลูกค้า (tb_credit) + เลื่อนสถานะเป็น 'เตรียมส่ง' โดยยังไม่ตัดเงิน\n` +
      `ครบกำหนดชำระ: ${creditDate}`,
    ))) return;
    startTransition(async () => {
      const res = await adminMarkForwarderCredit({ fId: p.fId, creditDueDate: creditDate });
      if (!res.ok) { setError(res.error ?? "ให้เครดิตไม่สำเร็จ"); return; }
      setSuccess(`ให้เครดิตสำเร็จ ฿${(res.data?.priceCredited ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} — ยอดค้างรวม ฿${(res.data?.outstanding ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`);
      router.refresh();
    });
  }

  async function onPay() {
    setError(null);
    setSuccess(null);

    const msg =
      `บันทึกชำระค่าฝากนำเข้า #${p.fId} ?\n\n` +
      `ลูกค้า: ${p.customerName} [${p.userId}]\n` +
      `ยอดประมาณ: ฿${p.amountEstimate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n` +
      `ยอดกระเป๋า: ฿${p.walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n\n` +
      `ระบบจะตัดเงินจากกระเป๋าลูกค้า (tb_wallet) + บันทึก tb_wallet_hs + เลื่อนสถานะ 5→6`;
    if (!(await confirm(msg))) return;

    startTransition(async () => {
      const res = await adminPayForwardersOnBehalf({
        userId: p.userId,
        fIds: [String(p.fId)],
      });
      if (!res.ok) {
        setError(res.error ?? "บันทึกชำระไม่สำเร็จ");
        return;
      }
      const d = res.data;
      if (!d) {
        setError("บันทึกชำระไม่สำเร็จ (ไม่มีข้อมูลตอบกลับ)");
        return;
      }
      if (d.paid.length === 0) {
        // every row skipped — surface the reason (usually insufficient balance)
        setError(
          d.skipped.map((s) => s.reason).join(" · ") ||
            "ไม่มีรายการที่ชำระได้",
        );
        return;
      }
      setSuccess(`ตัดเงินสำเร็จ ฿${d.total_debited.toLocaleString("th-TH", { minimumFractionDigits: 2 })} — สถานะเลื่อนเป็น 'เตรียมส่ง'`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold">
          ชำระเงิน
        </span>
        <h3 className="text-sm font-semibold tracking-wide">💰 บันทึกชำระเงิน (ตัดกระเป๋า)</h3>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">ยอดที่ต้องชำระ (ประมาณ)</dt>
          <dd className="font-mono font-semibold">
            ฿{p.amountEstimate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">ยอดกระเป๋าลูกค้า</dt>
          <dd className={`font-mono ${shortfall ? "text-red-600" : ""}`}>
            ฿{p.walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </dd>
        </div>
        {p.isCredit && (
          <p className="text-[11px] text-red-700">💳 รายการเครดิตสินค้า — ตัดได้แม้กระเป๋าไม่พอ</p>
        )}
      </dl>

      {shortfall && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          ⚠ ยอดกระเป๋าไม่พอ — ถ้าลูกค้าโอนเพิ่ม ใช้หน้า{" "}
          <Link href="/admin/wallet/pay-user" className="font-medium underline">ตัดเงินลูกค้า</Link>{" "}
          (เติม slip ส่วนต่างแล้วจ่ายจังหวะเดียว)
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">✓ {success}</div>
      )}

      <button
        type="button"
        onClick={onPay}
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังตัดเงิน..." : "💰 ตัดเงินจากกระเป๋า + เลื่อนสถานะ"}
      </button>

      <p className="text-[10px] text-muted text-center leading-relaxed">
        เขียน <code className="rounded bg-surface-alt px-1 font-mono">tb_wallet</code> +{" "}
        <code className="rounded bg-surface-alt px-1 font-mono">tb_wallet_hs</code> จริง · ผ่าน
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">adminPayForwardersOnBehalf</code>
        (เดียวกับหน้าตัดเงินลูกค้า)
      </p>

      {/* Credit-out alternative (forwarder.php fStatus='c') — only when not already on credit. */}
      {!p.isCredit && (
        <div className="border-t border-emerald-200 pt-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">💳 หรือ ให้เครดิต (จ่ายทีหลัง)</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={creditDate}
              onChange={(e) => setCreditDate(e.target.value)}
              disabled={pending}
              className="flex-1 rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs disabled:opacity-60"
              aria-label="วันครบกำหนดชำระ"
            />
            <button
              type="button"
              onClick={onCredit}
              disabled={pending || !creditDate}
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              💳 ติดเครดิต
            </button>
          </div>
          <p className="text-[10px] text-muted">
            ตามวงเงิน <code className="rounded bg-surface-alt px-1 font-mono">tb_users.userCreditValue</code> ·
            บันทึกหนี้ <code className="rounded bg-surface-alt px-1 font-mono">tb_credit</code> · ไม่ตัดเงินกระเป๋า
          </p>
        </div>
      )}
    </section>
  );
}
