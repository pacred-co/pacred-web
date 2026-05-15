"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminBulkApproveDeposits } from "@/actions/admin/wallet";

/**
 * T-P3: Bulk-approve sticky bar for /admin/wallet (pending deposits).
 *
 * Uses a window-event "store" so the parent server-component table can
 * render row checkboxes (`WalletRowCheckbox` below) without lifting state
 * across the RSC boundary.  Event shape:
 *   walletBulkSelect — CustomEvent<{ id: string; selected: boolean }>
 *   walletBulkClear  — broadcasts after a successful approval
 *
 * Simple by design — only this one page uses it; not worth a Provider.
 */

export function WalletBulkApproveBar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onSelect = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; selected: boolean }>;
      setSelected((prev) => {
        const next = new Set(prev);
        if (ce.detail.selected) next.add(ce.detail.id);
        else next.delete(ce.detail.id);
        return next;
      });
    };
    const onClear = () => setSelected(new Set());
    window.addEventListener("walletBulkSelect", onSelect as EventListener);
    window.addEventListener("walletBulkClear", onClear);
    return () => {
      window.removeEventListener("walletBulkSelect", onSelect as EventListener);
      window.removeEventListener("walletBulkClear", onClear);
    };
  }, []);

  if (selected.size === 0) return null;

  function onApprove() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      const res = await adminBulkApproveDeposits({ ids });
      if (res.ok && res.data) {
        const { approved, skipped, errors } = res.data;
        const parts: string[] = [`✅ อนุมัติ ${approved} รายการ`];
        if (skipped > 0) parts.push(`⏭ ข้าม ${skipped} (ไม่ใช่ pending deposit)`);
        if (errors.length > 0) parts.push(`❌ พลาด ${errors.length}`);
        setMsg(parts.join(" · "));
        setSelected(new Set());
        window.dispatchEvent(new CustomEvent("walletBulkClear"));
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else if (!res.ok) {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="sticky top-0 z-20 -mx-2 mb-3 rounded-2xl border border-primary-200 bg-primary-50 dark:bg-primary-950/30 p-3 shadow-sm flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium">
        🗳 เลือกแล้ว <span className="font-bold">{selected.size}</span> รายการ
      </span>
      <Button size="sm" onClick={onApprove} disabled={pending}>
        {pending ? "กำลังอนุมัติ..." : `✅ อนุมัติทั้งหมด (${selected.size})`}
      </Button>
      <button
        type="button"
        onClick={() => {
          setSelected(new Set());
          window.dispatchEvent(new CustomEvent("walletBulkClear"));
        }}
        disabled={pending}
        className="text-xs text-muted hover:underline disabled:opacity-50"
      >
        ล้างที่เลือก
      </button>
      {msg && <span className="text-xs text-green-700 dark:text-green-400">{msg}</span>}
      {err && <span className="text-xs text-red-700 dark:text-red-400">❌ {err}</span>}
    </div>
  );
}

/**
 * Per-row checkbox — emits a window event on change.  Used by /admin/wallet
 * page only for rows where kind='deposit' AND status='pending' (the only
 * shape that adminBulkApproveDeposits can actually approve).
 */
export function WalletRowCheckbox({ id }: { id: string }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onClear = () => setChecked(false);
    window.addEventListener("walletBulkClear", onClear);
    return () => window.removeEventListener("walletBulkClear", onClear);
  }, []);

  return (
    <input
      type="checkbox"
      className="size-4 cursor-pointer accent-primary-500"
      checked={checked}
      onChange={(e) => {
        const next = e.target.checked;
        setChecked(next);
        window.dispatchEvent(
          new CustomEvent("walletBulkSelect", { detail: { id, selected: next } }),
        );
      }}
      aria-label={`เลือก deposit ${id.slice(0, 8)}`}
    />
  );
}
