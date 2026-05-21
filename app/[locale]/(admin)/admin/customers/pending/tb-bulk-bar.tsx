"use client";

/**
 * Wave 8 Group A — Customers/Pending (tb_users) bulk-approve bar.
 *
 * Same window-event pattern as TbWalletBulkBar but with STRING IDs
 * (member_code PR####). Wires to `adminBulkApproveCustomers` in
 * `actions/admin/tb-bulk.ts`.
 *
 * Events:
 *   tbCustomerBulkSelect — CustomEvent<{ userid: string; selected: boolean }>
 *   tbCustomerBulkClear  — broadcasts after a successful approval
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBulkApproveCustomers } from "@/actions/admin/tb-bulk";

export function TbCustomerBulkBar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onSelect = (e: Event) => {
      const ce = e as CustomEvent<{ userid: string; selected: boolean }>;
      setSelected((prev) => {
        const next = new Set(prev);
        if (ce.detail.selected) next.add(ce.detail.userid);
        else next.delete(ce.detail.userid);
        return next;
      });
    };
    const onClear = () => setSelected(new Set());
    window.addEventListener("tbCustomerBulkSelect", onSelect as EventListener);
    window.addEventListener("tbCustomerBulkClear", onClear);
    return () => {
      window.removeEventListener("tbCustomerBulkSelect", onSelect as EventListener);
      window.removeEventListener("tbCustomerBulkClear", onClear);
    };
  }, []);

  if (selected.size === 0) return null;

  function onApprove() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const user_ids = Array.from(selected);
      const res = await adminBulkApproveCustomers({ user_ids });
      if (res.ok && res.data) {
        const { processed } = res.data;
        setMsg(`✅ อนุมัติ ${processed} สมาชิกแล้ว`);
        setSelected(new Set());
        window.dispatchEvent(new CustomEvent("tbCustomerBulkClear"));
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
        🗳 เลือกแล้ว <span className="font-bold">{selected.size}</span> สมาชิก
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
          window.dispatchEvent(new CustomEvent("tbCustomerBulkClear"));
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

export function TbCustomerRowCheckbox({ userid }: { userid: string }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onClear = () => setChecked(false);
    window.addEventListener("tbCustomerBulkClear", onClear);
    return () => window.removeEventListener("tbCustomerBulkClear", onClear);
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
          new CustomEvent("tbCustomerBulkSelect", { detail: { userid, selected: next } }),
        );
      }}
      aria-label={`เลือกสมาชิก ${userid}`}
    />
  );
}
