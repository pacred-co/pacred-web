"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateYuanPayment } from "@/actions/admin/yuan-payments";
import { YuanRefundModal } from "./refund-modal";
import { confirm } from "@/components/ui/confirm";

type Props = {
  id:     string;
  status: string;
  // Phase C QoL #4 — refund modal needs these fields to render the
  // customer/amount summary + decide whether to warn about wallet reversal.
  yuan_amount?:   number;
  thb_amount?:    number;
  member_code?:   string | null;
  customer_name?: string;
  phone?:         string | null;
  paid_via_wallet?: boolean;
};

export function YuanPaymentActions(props: Props) {
  const { id, status } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  function set(newStatus: "completed" | "failed", opts?: { acknowledgeDuplicate?: boolean }) {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateYuanPayment({
        id, status: newStatus, acknowledgeDuplicate: opts?.acknowledgeDuplicate,
      });
      if (res.ok) { router.refresh(); return; }
      // A5 ชั้น-1 dup-gate (owner 2026-06-21): a same-customer/day/amount yuan slip
      // exists → let the accountant eyeball it + re-confirm to override.
      if (res.error?.includes("อาจซ้ำ") && !opts?.acknowledgeDuplicate) {
        if (await confirm(`${res.error}\n\nตรวจสอบแล้วยืนยันว่าไม่ใช่รายการซ้ำ — อนุมัติต่อ?`)) {
          set(newStatus, { acknowledgeDuplicate: true });
        }
        return;
      }
      setErr(res.error);
    });
  }

  const canRefund = status === "pending" || status === "processing" || status === "completed";

  return (
    <div className="space-y-1">
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      <div className="flex flex-wrap gap-1">
        {/* Legacy payment.php is a 2-step pending → completed (no in-flight
            "processing" state). Approve flips paystatus 1→2 directly via
            adminUpdateYuanPayment (same no-wallet-move behavior as the list
            bulk-bar — wallet was already debited at submit). Reject → failed. */}
        {status === "pending" && (
          <>
            <Button size="sm" type="button" onClick={async () => { if (await confirm("ยืนยันอนุมัติรายการฝากโอนนี้ (สำเร็จ)?")) set("completed"); }} disabled={pending}>อนุมัติ (สำเร็จ)</Button>
            <Button size="sm" variant="outline" type="button" onClick={async () => { if (await confirm("ยืนยันปฏิเสธรายการฝากโอนนี้?")) set("failed"); }} disabled={pending}>ปฏิเสธ</Button>
          </>
        )}
        {/* Phase C QoL #4 — refund now requires a slip. Opens a modal
            instead of a one-click status flip. Available on any non-
            terminal, non-failed status (matches isYuanTransitionAllowed). */}
        {canRefund && (
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => setRefundOpen(true)}
            disabled={pending}
          >
            คืนเงิน + แนบสลิป
          </Button>
        )}
      </div>

      {canRefund && (
        <YuanRefundModal
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          yuanPayment={{
            id,
            yuan_amount:   Number(props.yuan_amount ?? 0),
            thb_amount:    Number(props.thb_amount ?? 0),
            member_code:   props.member_code ?? null,
            customer_name: props.customer_name ?? "—",
            phone:         props.phone ?? null,
            paid_via_wallet: props.paid_via_wallet ?? false,
            status,
          }}
        />
      )}
    </div>
  );
}
