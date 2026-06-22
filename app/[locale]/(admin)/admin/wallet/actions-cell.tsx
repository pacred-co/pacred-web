"use client";

/**
 * ⚠️ TOMBSTONE 2026-05-30 (ADR-0018 D-3 #2 · P0-9/MS-1) — ORPHAN component.
 * Zero inbound callers (verified by grep 2026-05-30). The live per-row
 * action surface is `transactions-view.tsx` which links rows to
 * `/admin/wallet/[id]` (the detail page using `ApproveRejectForm` from
 * `[id]/edit-form.tsx`). Bulk-approve uses `TbWalletBulkBar` from
 * `tb-bulk-bar.tsx`. This `WalletTxActions` cell is dead code from the
 * rebuilt-schema era.
 *
 * Imports swapped from `actions/admin/wallet.ts` → `actions/admin/wallet-hs.ts`
 * tombstone shim. Runtime calls fail loudly with the tombstone error.
 * Delete the file when the rebuilt `wallet_transactions` table is dropped.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateWalletTransaction } from "@/actions/admin/wallet-hs";
import { SlipReviewModal } from "./slip-review-modal";

type Props = {
  id: string;
  status: string;
  kind: string;
  slipUrl?: string | null;
  // Phase C QoL #3 — extra fields the slip-review modal needs.
  amount: number;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  note: string | null;
  slip_transferred_at: string | null;
  created_at: string;
  member_code: string | null;
  customer_name: string;
  phone: string | null;
};

export function WalletTxActions(props: Props) {
  const {
    id, status, kind, slipUrl, amount, bank_name, account_name,
    account_number, note, slip_transferred_at, created_at,
    member_code, customer_name, phone,
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);

  function set(newStatus: "completed" | "failed" | "cancelled") {
    setErr(null);
    if ((newStatus === "failed" || newStatus === "cancelled") && !rejectNote.trim()) {
      setErr("กรุณาระบุเหตุผลใน note");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateWalletTransaction({ id, status: newStatus, note: rejectNote || undefined });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  const label = kind === "deposit" ? "เติม" : kind === "withdraw" ? "ถอน" : kind;
  // Phase C QoL #3 — the rich slip-vs-amount modal is gated to deposits
  // (the one workflow it was designed to speed up). Other kinds still
  // get the legacy inline approve/cancel buttons below.
  const showReviewModal = kind === "deposit" && status === "pending";

  return (
    <div className="space-y-1 min-w-[160px]">
      {/* Phase C QoL #3 — open full slip-review modal for deposits */}
      {showReviewModal && (
        <>
          <Button
            size="sm"
            type="button"
            onClick={() => setReviewOpen(true)}
            disabled={pending}
            fullWidth
          >
            🔍 ตรวจสลิป + อนุมัติ
          </Button>
          <SlipReviewModal
            open={reviewOpen}
            onClose={() => setReviewOpen(false)}
            tx={{
              id,
              amount,
              bank_name,
              account_name,
              account_number,
              note,
              slip_url: slipUrl ?? null,
              slip_transferred_at,
              created_at,
              member_code,
              customer_name,
              phone,
            }}
          />
        </>
      )}

      {/* Withdraw rows + non-deposit pending rows: keep the legacy inline
          approve/cancel pair (the rich modal is deposit-specific). */}
      {!showReviewModal && status === "pending" && (
        <>
          {err && <div className="text-[11px] text-red-700">{err}</div>}
          <input
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="หมายเหตุ (เหตุผลถ้าปฏิเสธ)"
            className="w-full text-[11px] rounded border border-border px-1 py-0.5"
          />
          <div className="flex gap-1">
            <Button size="sm" type="button" onClick={() => set("completed")} disabled={pending}>
              อนุมัติ ({label})
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => set("cancelled")} disabled={pending}>
              ยกเลิก
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
