"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateDriverAssignmentStatus } from "@/actions/admin/forwarder-drivers";

type Status = 1 | 2 | 3 | 4;

const NEXT_STATUS: Record<Status, { value: Status; label: string; variant?: "primary" | "outline" }[]> = {
  1: [
    { value: 2, label: "✓ บังคับรับงาน",  variant: "primary" },
    { value: 3, label: "หมดเวลา",        variant: "outline" },
  ],
  2: [
    { value: 4, label: "✓ ส่งงานเสร็จ",   variant: "primary" },
    { value: 3, label: "ยกเลิก",         variant: "outline" },
  ],
  3: [
    { value: 1, label: "↻ มอบหมายใหม่",  variant: "outline" },
  ],
  4: [],   // Terminal state — no further actions
};

export function DriverAssignmentActions({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const next = NEXT_STATUS[status] ?? [];
  if (next.length === 0) {
    return <span className="text-[11px] text-muted">—</span>;
  }

  function set(newStatus: Status) {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateDriverAssignmentStatus({ id, status: newStatus });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 min-w-[130px]">
      {err && <div className="text-[11px] text-red-700">{err}</div>}
      {next.map((n) => (
        <Button
          key={n.value}
          size="sm"
          type="button"
          variant={n.variant ?? "outline"}
          onClick={() => set(n.value)}
          disabled={pending}
        >
          {n.label}
        </Button>
      ))}
    </div>
  );
}
