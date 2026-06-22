"use client";

/**
 * Tier A2 fix · 2026-05-29 — admin "Mark as Paid" form against the LEGACY
 * `tb_header_order` table. Sister component to `update-form.tsx`'s mark-paid
 * panel (which targets the REBUILT `service_orders` table — empty on prod).
 *
 * Rendered by `legacy-view.tsx` whenever the order lives in `tb_header_order`
 * (the common D1 path · ~thousands of legacy rows per customer). Clicking
 * "💰 บันทึกชำระจาก wallet" calls `adminMarkServiceOrderPaidTb` which:
 *   1. INSERTs tb_wallet_hs (type=2 · status=2 · amount=hTotalPriceUser)
 *   2. DEBITS tb_wallet.wallettotal by the same amount
 *   3. FLIPS tb_header_order.hstatus 2→3 + stamps hdate3
 * — all atomic enough that a partial failure surfaces in the error message.
 *
 * Only renders when hstatus ∈ {'1', '2'} (pending · awaiting_payment).
 * Other statuses already paid OR ineligible — no button to avoid double-charge.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminMarkServiceOrderPaidTb } from "@/actions/admin/service-orders-tb";

export function MarkPaidTbForm({
  hno,
  status,
  totalThb,
}: {
  hno: string;
  status: string;        // legacy hstatus char(1) — '1'..'6'
  totalThb: number;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only mark-paid eligible when status is pending (1) or awaiting_payment (2).
  if (status !== "1" && status !== "2") return null;

  function markPaid(allowOverdraw: boolean) {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const res = await adminMarkServiceOrderPaidTb({
        hno,
        allow_overdraw: allowOverdraw,
      });
      if (res.ok) {
        if (res.data?.already_paid) {
          setMsg(`ออเดอร์นี้ชำระไปแล้ว (tb_wallet_hs id=${res.data.wallet_hs_id ?? "-"}) — เปลี่ยนสถานะให้แล้ว`);
        } else {
          const debited = res.data?.debited ?? 0;
          const newBal = res.data?.new_balance ?? 0;
          setMsg(
            `ชำระสำเร็จ — หัก wallet ลูกค้า ฿${debited.toLocaleString()} แล้ว (ยอดคงเหลือ ฿${newBal.toLocaleString()})`,
          );
        }
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/20 p-4 shadow-sm space-y-3">
      <div>
        <h3 className="font-bold text-sm">บันทึกการชำระเงิน (Tier A2 · tb_header_order)</h3>
        <p className="text-xs text-muted mt-0.5">
          ยอด ฿{totalThb.toLocaleString()} — กดเพื่อหัก wallet ลูกค้า + เปลี่ยนสถานะเป็น &ldquo;สั่งสินค้าแล้ว&rdquo;
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            if (
              await confirm(
                `ยืนยันหักเงิน ฿${totalThb.toLocaleString()} จาก wallet ลูกค้า และเปลี่ยนสถานะเป็น “สั่งสินค้าแล้ว”?\nรายการนี้มีผลกับยอดเงินจริงของลูกค้า`,
              )
            ) {
              markPaid(false);
            }
          }}
          disabled={pending}
          className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "💰 บันทึกชำระจาก wallet"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (
              await confirm(
                "รับเงินสด/โอนตรงโดยไม่เช็คยอด wallet ใช่ไหม? (ใช้เมื่อลูกค้าโอนนอกระบบ · ยังหัก wallet เช่นเดิม)",
              )
            ) {
              markPaid(true);
            }
          }}
          disabled={pending}
          className="rounded-lg border border-amber-300 text-amber-700 px-3 py-1.5 text-xs hover:bg-amber-50 disabled:opacity-50"
        >
          💵 รับเงินสด/นอกระบบ (override)
        </button>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        ✅ จะ INSERT รายการใน tb_wallet_hs (type=2 · status=2) · หัก tb_wallet.wallettotal ·
        เปลี่ยน tb_header_order.hstatus → 3 (สั่งสินค้าแล้ว) · stamp hdate3
      </p>
    </div>
  );
}
