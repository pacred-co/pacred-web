"use client";

/**
 * Wave 8 Group A — Wallet (tb_wallet_hs) bulk-approve bar.
 *
 * Mirror of `bulk-approve-bar.tsx` (rebuilt schema · uuid IDs) but for the
 * legacy `tb_wallet_hs` schema (bigint IDs · status='1' → '2'). Wires to
 * `adminBulkApproveWalletHs` in `actions/admin/tb-bulk.ts`.
 *
 * Window-event store pattern (decouple checkbox state from sticky bar):
 *   tbWalletBulkSelect — CustomEvent<{ id: number; selected: boolean }>
 *   tbWalletBulkClear  — broadcasts after a successful approval
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBulkApproveWalletHs } from "@/actions/admin/tb-bulk";

export function TbWalletBulkBar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onSelect = (e: Event) => {
      const ce = e as CustomEvent<{ id: number; selected: boolean }>;
      setSelected((prev) => {
        const next = new Set(prev);
        if (ce.detail.selected) next.add(ce.detail.id);
        else next.delete(ce.detail.id);
        return next;
      });
    };
    const onClear = () => setSelected(new Set());
    window.addEventListener("tbWalletBulkSelect", onSelect as EventListener);
    window.addEventListener("tbWalletBulkClear", onClear);
    return () => {
      window.removeEventListener("tbWalletBulkSelect", onSelect as EventListener);
      window.removeEventListener("tbWalletBulkClear", onClear);
    };
  }, []);

  if (selected.size === 0) return null;

  function onApprove() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      const res = await adminBulkApproveWalletHs({ ids });
      if (res.ok && res.data) {
        const { processed, failed, errors } = res.data;
        const parts: string[] = [`✅ อนุมัติ ${processed} รายการ`];
        if (failed > 0) parts.push(`❌ พลาด ${failed}`);
        if (errors.length > 0) parts.push(`(${errors[0]})`);
        setMsg(parts.join(" · "));
        setSelected(new Set());
        window.dispatchEvent(new CustomEvent("tbWalletBulkClear"));
        router.refresh();
        setTimeout(() => setMsg(null), 8000);
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
      <button
        type="button"
        onClick={onApprove}
        disabled={pending}
        className="rounded-md bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังอนุมัติ..." : `✅ อนุมัติทั้งหมด (${selected.size})`}
      </button>
      <button
        type="button"
        onClick={() => {
          setSelected(new Set());
          window.dispatchEvent(new CustomEvent("tbWalletBulkClear"));
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

export function TbWalletRowCheckbox({ id }: { id: number }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onClear = () => setChecked(false);
    window.addEventListener("tbWalletBulkClear", onClear);
    return () => window.removeEventListener("tbWalletBulkClear", onClear);
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
          new CustomEvent("tbWalletBulkSelect", { detail: { id, selected: next } }),
        );
      }}
      aria-label={`เลือกรายการ wallet ${id}`}
    />
  );
}
