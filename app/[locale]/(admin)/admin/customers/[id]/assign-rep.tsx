"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { adminAssignSalesRep } from "@/actions/admin/admins";

type Rep = {
  profile_id: string;
  display:    string;     // pretty name e.g. "เซลล์ มิว (PR00012, 066-...)"
};

export function AssignRepForm({ customerId, currentRepId, reps }: {
  customerId: string;
  currentRepId: string | null;
  reps: Rep[];
}) {
  const router = useRouter();
  const [repId, setRepId] = useState(currentRepId ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setMsg(null); setError(null);
    startTransition(async () => {
      const res = await adminAssignSalesRep({
        customer_id:    customerId,
        sales_admin_id: repId || null,
      });
      if (res.ok) {
        setMsg(repId ? "ผูกเซลล์แล้ว" : "ยกเลิกการผูกแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-sm">เซลล์ที่ดูแลลูกค้า</h3>
        <Link
          href={`/admin/customers/${customerId}/transfer-rep`}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          ใช้โอนแบบ workflow (มีเหตุผล + notify) →
        </Link>
      </div>
      {msg   && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <select
        value={repId}
        onChange={(e) => setRepId(e.target.value)}
        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
      >
        <option value="">— ไม่ผูกเซลล์ —</option>
        {reps.map((r) => (
          <option key={r.profile_id} value={r.profile_id}>{r.display}</option>
        ))}
      </select>
      <Button type="button" onClick={save} disabled={pending} fullWidth>
        {pending ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
    </div>
  );
}
