"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateContactStatus } from "@/actions/admin/contact-messages";

const NEXT_STATUS: Record<string, { value: "read" | "replied" | "closed"; label: string; variant?: "primary" | "outline" }[]> = {
  new:     [
    { value: "read",    label: "✓ อ่านแล้ว",    variant: "primary" },
    { value: "closed",  label: "ปิด",          variant: "outline" },
  ],
  read:    [
    { value: "replied", label: "✓ ตอบกลับแล้ว", variant: "primary" },
    { value: "closed",  label: "ปิด",          variant: "outline" },
  ],
  replied: [
    { value: "closed",  label: "✓ ปิดเรื่อง",   variant: "primary" },
  ],
  closed:  [
    { value: "read",    label: "↻ เปิดอีกครั้ง", variant: "outline" },
  ],
};

export function ContactMessageActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const next = NEXT_STATUS[status] ?? [];

  function set(newStatus: "read" | "replied" | "closed") {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateContactStatus({ id, status: newStatus });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
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
