"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminSetForwarderBillToOverride,
} from "@/actions/admin/forwarders";
import {
  adminSetOrderBillToOverride,
} from "@/actions/admin/service-orders";

// V-C2 — shared inline editor for the bill-header buyer name. Mounts on
// both /admin/forwarders/[fNo] and /admin/service-orders/[hNo]. Empty
// submit clears the override (NULL in DB).

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props =
  | { kind: "forwarder";     fNo: string; defaultName: string; current: string | null }
  | { kind: "service_order"; hNo: string; defaultName: string; current: string | null };

export function BillToOverridePanel(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft]   = useState(props.current ?? "");
  const [err, setErr]       = useState<string | null>(null);
  const [msg, setMsg]       = useState<string | null>(null);

  const hasOverride = (props.current ?? "").length > 0;
  const dirty       = draft.trim() !== (props.current ?? "");

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(null), 4000);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = props.kind === "forwarder"
        ? await adminSetForwarderBillToOverride({ f_no: props.fNo, override: draft.trim() })
        : await adminSetOrderBillToOverride({ h_no: props.hNo, override: draft.trim() });
      if (res.ok) {
        flash(draft.trim() ? "✓ บันทึกชื่อบนบิลแล้ว" : "✓ ล้างค่า — กลับใช้ชื่อเดิม");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function clearAll() {
    setDraft("");
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">🧾 ชื่อบนบิล / ใบเสร็จ</h3>
        {hasOverride && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
            กำลังใช้ override
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted">
        ชื่อเริ่มต้น (จากลูกค้า): <span className="font-medium text-foreground">{props.defaultName || "—"}</span>
      </p>

      <label className="block space-y-1">
        <span className="text-xs font-medium">ชื่อที่จะพิมพ์บนหัวบิล (ปล่อยว่าง = ใช้ชื่อเริ่มต้น)</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={inputCls}
          placeholder="เช่น บริษัท ผู้ซื้อจริง จำกัด หรือ คุณ ก. แทนคุณ ข."
          maxLength={200}
          disabled={pending}
        />
        <span className="text-[11px] text-muted">สูงสุด 200 ตัวอักษร · เก็บ audit ทุกครั้งที่แก้</span>
      </label>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : hasOverride ? "อัปเดต" : "ตั้งค่า"}
        </button>
        {(hasOverride || draft.length > 0) && (
          <button
            type="button"
            onClick={clearAll}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            ล้างค่า
          </button>
        )}
      </div>
    </form>
  );
}
