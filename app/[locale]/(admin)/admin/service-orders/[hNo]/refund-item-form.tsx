"use client";

/**
 * Sitting G — UI mount for sitting-F P0-16 per-item refund
 * (actions/admin/service-orders-refund.ts adminRefundShopOrderItem).
 *
 * Closes the §0d reachability gap from sitting F (server-side wired
 * but no admin button). Shows refundable items as a compact table
 * with per-row "คืนเงิน" button. Modal collects qty + reason then
 * calls the action. On success: router.refresh() so the items + the
 * page wallet totals re-flow.
 *
 * Status gate: hides entirely if `refundableItems` is empty (no
 * remaining qty across any line) — admins don't see a refund panel
 * for orders that have nothing left to refund.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminRefundShopOrderItem } from "@/actions/admin/service-orders-refund";

type RefundableItem = {
  id:        number;
  title:     string;
  cprice:    number;
  camount:   number;  // remaining qty (already-refunded subtracted)
  cnameshop: string;
};

type Props = {
  hNo:              string;
  hstatus:          string;
  refundableItems:  RefundableItem[];
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function AdminRefundItemPanel(props: Props) {
  const { refundableItems } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok,  setOk]  = useState<string | null>(null);

  // Refund only valid for orders past payment (hstatus 3/4/5 per
  // server-side guard). Hide panel for not-yet-paid / cancelled.
  const refundAllowedStatuses = new Set(["3", "4", "5"]);
  if (!refundAllowedStatuses.has(props.hstatus)) return null;
  // Hide if no refundable items remain.
  if (refundableItems.length === 0) return null;

  const activeItem = openItemId
    ? refundableItems.find((it) => it.id === openItemId) ?? null
    : null;

  function openRefund(item: RefundableItem) {
    setErr(null);
    setOk(null);
    setOpenItemId(item.id);
    setQty(item.camount);  // pre-fill full-qty (most common case)
    setReason("");
  }

  function closeRefund() {
    setOpenItemId(null);
    setQty(1);
    setReason("");
  }

  function fire() {
    if (!activeItem) return;
    if (qty < 1 || qty > activeItem.camount) {
      setErr(`จำนวนต้องอยู่ระหว่าง 1 - ${activeItem.camount}`);
      return;
    }
    const trimReason = reason.trim();
    if (!trimReason) {
      setErr("กรุณากรอกเหตุผลคืนเงิน");
      return;
    }
    startTransition(async () => {
      const res = await adminRefundShopOrderItem({
        orderItemId: activeItem.id,
        refundQty:   qty,
        reason:      trimReason,
      });
      if (res.ok) {
        setOk(`คืนเงิน ฿${res.data?.refundAmountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} เข้ากระเป๋าลูกค้าแล้ว · ยอดใหม่: ฿${res.data?.newWalletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`);
        closeRefund();
        router.refresh();
      } else setErr(res.error);
    });
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-50/5 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-amber-700">
          คืนเงินรายการสินค้า ({refundableItems.length} รายการ)
        </p>
        <p className="text-[10px] text-muted">
          ใช้กรณีร้านจีนงดสินค้า / สั่งผิด / ลูกค้าเปลี่ยนใจ — เงินคืนเข้ากระเป๋าทันที
        </p>
      </div>

      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
      {ok  && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</div>}

      <div className="rounded-md border border-border bg-white dark:bg-surface overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-1.5">รายการ</th>
              <th className="px-2 py-1.5">ร้าน</th>
              <th className="px-2 py-1.5 text-right">ราคา/ชิ้น</th>
              <th className="px-2 py-1.5 text-right">เหลือ</th>
              <th className="px-2 py-1.5 text-right">ยอดรวม</th>
              <th className="px-2 py-1.5"> </th>
            </tr>
          </thead>
          <tbody>
            {refundableItems.map((it) => {
              const lineTotal = it.cprice * it.camount;
              return (
                <tr key={it.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-2 py-1.5 max-w-[300px] truncate" title={it.title}>{it.title || "—"}</td>
                  <td className="px-2 py-1.5 text-muted text-[10px]">{it.cnameshop || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{thb(it.cprice)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{it.camount}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{thb(lineTotal)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" variant="outline" type="button" onClick={() => openRefund(it)} disabled={pending}>
                      คืน
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeItem && (
        <div className="rounded-md border border-amber-300 bg-white dark:bg-surface p-3 space-y-2 text-xs">
          <p className="font-semibold">คืนเงิน — {activeItem.title}</p>
          <p className="text-muted">
            ราคา ฿{activeItem.cprice.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต่อชิ้น · เหลือ {activeItem.camount} ชิ้น
          </p>
          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-muted text-[10px]">จำนวนที่คืน</span>
              <input
                type="number"
                min={1}
                max={activeItem.camount}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(activeItem.camount, Number(e.target.value) || 1)))}
                className="rounded border px-2 py-1.5 w-full"
              />
            </label>
            <p className="text-right text-muted">
              ยอดคืน: ฿{(activeItem.cprice * qty).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-muted text-[10px]">เหตุผลคืนเงิน (จำเป็น · เก็บไว้ใน audit)</span>
            <input
              className="rounded border px-2 py-1.5 w-full"
              placeholder="เช่น ร้านจีนสินค้าหมด / ลูกค้าเปลี่ยนใจ"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex gap-2 flex-wrap pt-1">
            <Button size="sm" type="button" onClick={fire} disabled={pending}>
              {pending ? "กำลังคืนเงิน..." : `ยืนยันคืน ${qty} ชิ้น = ฿${(activeItem.cprice * qty).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={closeRefund} disabled={pending}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
