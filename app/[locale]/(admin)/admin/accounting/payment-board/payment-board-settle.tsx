"use client";

/**
 * <PaymentBoardSettle> — inline settle actions for an UNPAID payment-board row
 * (owner 2026-06-28 #9 "เอาเลย" + #10 ชำระนอก+แนบสลิป).
 *
 * Two faithful, ALREADY-GUARDED paths (NO new money-mutation · "ห้ามทำงานบัค"):
 *   • ตัดกระเป๋า ชำระ → adminPayForwardersOnBehalf (debit tb_wallet · writes the
 *     settled tb_wallet_hs type='4' · flips fstatus 5→6 · idempotent + rollback).
 *     For customers WITH wallet balance. §0f confirm shows the amount first.
 *   • ชำระนอก + แนบสลิป → deep-link to /admin/wallet/pay-user (the proven admin
 *     topup-with-slip-on-behalf flow · owner #10 "เหมือนแอดมินแนบสลิปแทนลูกค้า")
 *     for a customer who paid the company by bank transfer (no wallet balance).
 *
 * Insufficient balance → the action SKIPS (its own guard) → we surface the reason
 * and steer to the ชำระนอก flow. router.refresh() on success.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Loader2, Wallet, FileUp } from "lucide-react";
import { adminPayForwardersOnBehalf } from "@/actions/admin/pay-user";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

export function PaymentBoardSettle({
  fid,
  userid,
  customerName,
  owed,
}: {
  fid: string;
  userid: string;
  customerName: string;
  owed: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function payFromWallet() {
    setMsg(null);
    // §0f confirm-before-mutate — show exactly what will happen.
    if (!window.confirm(
      `ตัดเงินจากกระเป๋าลูกค้าเพื่อชำระ?\n\nลูกค้า: ${customerName} (${userid})\nออเดอร์: F${fid}\nยอด: ${baht(owed)}\n\n(ตัดจากกระเป๋าลูกค้า · ต้องมียอดในกระเป๋าพอ · ถ้าไม่พอให้ใช้ 'ชำระนอก+สลิป')`,
    )) return;
    startTransition(async () => {
      const res = await adminPayForwardersOnBehalf({ userId: userid, fIds: [fid] });
      if (!res.ok) { setMsg(res.error); return; }
      const skipped = res.data?.skipped ?? [];
      if (skipped.length > 0) { setMsg(`ชำระไม่ได้: ${skipped[0]?.reason ?? "ยอดในกระเป๋าไม่พอ"} — ใช้ 'ชำระนอก+สลิป'`); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={payFromWallet}
        disabled={pending}
        className="inline-flex items-center justify-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wallet className="h-3 w-3" />} ตัดกระเป๋า ชำระ
      </button>
      <Link
        href={`/admin/wallet/pay-user?q=${encodeURIComponent(userid)}`}
        className="inline-flex items-center justify-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
      >
        <FileUp className="h-3 w-3" /> ชำระนอก+สลิป
      </Link>
      {msg && <p className="text-[11px] text-red-600 max-w-[160px]">{msg}</p>}
    </div>
  );
}
