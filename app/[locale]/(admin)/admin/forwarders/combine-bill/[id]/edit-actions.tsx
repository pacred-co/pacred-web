"use client";

/**
 * Client island for the editable combine-bill detail page
 * (`/admin/forwarders/combine-bill/[id]`).
 *
 * Carries the three in-place edit actions the Server Component page
 * delegates to:
 *   - AddForwardersForm     → adminAddForwardersToBill (append line items)
 *   - RemoveLineButton      → adminRemoveForwarderFromBill (drop one line)
 *   - DeleteBillButton      → adminDeleteCombineBill (drop the whole bill)
 *
 * Same UX kit as the list-page row actions (`combine-bill-row-actions.tsx`):
 * `useConfirmDialogs()` for confirm/alert (Pacred brand chrome, not native
 * window.confirm), `useTransition()` for pending state, `router.refresh()`
 * after success so the Server Component re-fetches.
 *
 * The detail page only renders these when the user has the mutation roles
 * (super/ops/warehouse/accounting); the Server Actions enforce auth again
 * per ADR-0002.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  adminAddForwardersToBill,
  adminRemoveForwarderFromBill,
  adminDeleteCombineBill,
} from "@/actions/admin/combine-bill";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

// ────────────────────────────────────────────────────────────
// Add forwarders to this bill
// ────────────────────────────────────────────────────────────
export function AddForwardersForm({ billId }: { billId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { alert, dialogs } = useConfirmDialogs();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const raw = value.trim();
    if (!raw) {
      setError("กรุณากรอกเลขที่ออเดอร์อย่างน้อย 1 รายการ");
      return;
    }
    start(async () => {
      const res = await adminAddForwardersToBill({ billId, forwarderIds: raw });
      if (!res.ok) {
        setError(res.error ?? "กรุณาลองใหม่ภายหลัง");
        return;
      }
      setValue("");
      await alert("สำเร็จ\nเพิ่มรายการเข้าบิลแล้ว");
      router.refresh();
    });
  }

  return (
    <form className="space-y-2" autoComplete="off" onSubmit={handleSubmit}>
      <p className="text-xs text-muted">
        เพิ่มเลขที่ออเดอร์นำเข้าเข้าบิลนี้ — คั่นหลายรายการด้วยคอมมา EX. 1,5,6
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="ID"
          className="flex-1 min-w-[220px] rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          placeholder="กรอกเลขที่ออเดอร์ EX. 1,5,6"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <button
          type="submit"
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={pending}
        >
          {pending ? "กำลังเพิ่ม…" : "เพิ่มเข้าบิล"}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {dialogs}
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Remove one line item from this bill
// ────────────────────────────────────────────────────────────
export function RemoveLineButton({
  billId,
  forwarderId,
}: {
  billId: number;
  forwarderId: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function handleRemove() {
    const ok = await confirm(
      `นำออเดอร์ #${forwarderId} ออกจากบิลรวม #${billId} ?\nรายการฝากนำเข้าจะไม่ถูกลบ แค่ถอดออกจากบิลนี้`,
    );
    if (!ok) return;

    start(async () => {
      const res = await adminRemoveForwarderFromBill({ billId, forwarderId });
      if (!res.ok) {
        await alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      if (res.data?.billDeleted) {
        // The last line was removed — the bill no longer exists. Send the
        // user back to the list instead of re-rendering an empty detail.
        await alert("ถอดรายการสุดท้ายแล้ว — บิลรวมนี้ถูกลบอัตโนมัติ");
        router.push("/admin/forwarders/combine-bill");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "กำลังนำออก…" : "นำออกจากบิล"}
      </button>
      {dialogs}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Delete the whole bill
// ────────────────────────────────────────────────────────────
export function DeleteBillButton({ billId }: { billId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function handleDelete() {
    const ok = await confirm(
      `ลบบิลรวม #${billId} ทั้งบิล ?\nรายการฝากนำเข้าในบิลนี้จะถูกถอดออก แต่ไม่ลบรายการฝากนำเข้าเอง`,
    );
    if (!ok) return;

    start(async () => {
      const res = await adminDeleteCombineBill({ billId });
      if (!res.ok) {
        await alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      router.push("/admin/forwarders/combine-bill");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "กำลังลบ…" : "ลบบิลทั้งหมด"}
      </button>
      {dialogs}
    </>
  );
}
