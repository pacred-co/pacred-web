"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LeaderPicker({
  leaders,
  currentLeaderId,
  status,
  dateFrom,
  dateTo,
}: {
  leaders:         { id: string; display: string; commission_pct: number }[];
  currentLeaderId: string;
  status:          string;
  dateFrom:        string;
  dateTo:          string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function update(field: "leader" | "status", value: string) {
    const params = new URLSearchParams();
    if (field === "leader" ? value : currentLeaderId) {
      params.set("leader", field === "leader" ? value : currentLeaderId);
    }
    params.set("status", field === "status" ? value : status);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo)   params.set("date_to",   dateTo);
    startTransition(() => router.push(`/admin/forwarder-sales?${params}`));
  }

  const cls =
    "rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">หัวหน้าทีม</span>
        <select
          value={currentLeaderId}
          onChange={(e) => update("leader", e.target.value)}
          className={cls}
        >
          <option value="">— ทั้งหมด —</option>
          {leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.display} · {(l.commission_pct * 100).toFixed(1)}%
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">สถานะ</span>
        {(["all", "unpaid", "paid", "cancelled"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => update("status", s)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              status === s
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-border bg-white dark:bg-surface text-muted hover:text-foreground"
            }`}
          >
            {s === "all"
              ? "ทั้งหมด"
              : s === "unpaid"
                ? "รอเบิก"
                : s === "paid"
                  ? "เบิกแล้ว"
                  : "ยกเลิก"}
          </button>
        ))}
      </div>
    </div>
  );
}
