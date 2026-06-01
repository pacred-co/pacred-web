"use client";

/**
 * Rep-filter — "แสดงเฉพาะลูกค้าของเซล X". A <select> over the assignable reps
 * that drives the `?rep=<legacyId>` query param (preserving the selected
 * conversation + channel). Server re-renders the conversation list filtered to
 * that rep's customers.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import type { CrmRep } from "@/lib/admin/crm-types";

export function RepFilter({ reps, current }: { reps: CrmRep[]; current: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("rep", value);
    else params.delete("rep");
    // Changing the rep filter resets the selected conversation (it may no
    // longer be in the filtered list).
    params.delete("c");
    router.push(`/admin/crm?${params.toString()}`);
  }

  if (reps.length === 0) return null;

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <Filter className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">เฉพาะลูกค้าของเซล</span>
      <select
        value={current ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm max-w-[180px]"
      >
        <option value="">ทุกเซล</option>
        {reps.map((r) => (
          <option key={r.legacyId} value={r.legacyId}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
