"use client";

/**
 * Triage panel for a single RFQ lead — status update (+ note), assignment, and
 * convert-to-quote. Every mutation is confirm-before-fire (กันคนลั่น · §0f).
 *
 * convert seeds a DRAFT freight_quotes (plural) quotation then routes the
 * salesperson to /admin/freight/quotes/[id] to price + send. No money, no comms.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useRouter as useNextRouter } from "next/navigation";
import { confirm, alert } from "@/components/ui/confirm";
import {
  setFreightLeadStatus,
  assignFreightLead,
  convertLeadToQuote,
} from "@/actions/admin/freight-leads";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new",       label: "ใหม่" },
  { value: "contacted", label: "ติดต่อแล้ว" },
  { value: "quoted",    label: "เสนอราคาแล้ว" },
  { value: "won",       label: "ปิดการขาย" },
  { value: "lost",      label: "ไม่สำเร็จ" },
  { value: "spam",      label: "สแปม" },
];

function statusLabel(v: string): string {
  return STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function LeadTriageClient({
  leadRef,
  status,
  assignedAdminId,
}: {
  leadRef: string;
  status: string;
  assignedAdminId: string | null;
}) {
  const router = useRouter();
  const nextRouter = useNextRouter();
  const [pending, startTransition] = useTransition();

  const [nextStatus, setNextStatus] = useState(status);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(assignedAdminId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function saveStatus() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const ok = await confirm(
        `ปรับสถานะ RFQ ${leadRef} เป็น "${statusLabel(nextStatus)}"${note.trim() ? " พร้อมบันทึก" : ""}?`,
        { title: "ปรับสถานะ", confirmLabel: "บันทึก", cancelLabel: "ยกเลิก" },
      );
      if (!ok) return;
      const res = await setFreightLeadStatus(leadRef, nextStatus, note.trim() || undefined);
      if (res.ok) {
        setMsg("บันทึกสถานะแล้ว");
        setNote("");
        nextRouter.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function saveAssignee() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const ok = await confirm(
        assignee.trim()
          ? `มอบหมาย RFQ ${leadRef} ให้ "${assignee.trim()}"?`
          : `ยกเลิกการมอบหมาย RFQ ${leadRef}?`,
        { title: "มอบหมายผู้ดูแล", confirmLabel: "บันทึก", cancelLabel: "ยกเลิก" },
      );
      if (!ok) return;
      const res = await assignFreightLead(leadRef, assignee.trim());
      if (res.ok) {
        setMsg("บันทึกผู้ดูแลแล้ว");
        nextRouter.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function convert() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const ok = await confirm(
        `สร้างใบเสนอราคา (ร่าง) จาก RFQ ${leadRef}? ` +
          `ระบบจะสร้างใบเสนอราคาฉบับร่างให้ทีมเซลส์ตรวจ/ตั้งราคาก่อนส่ง — ยังไม่มีการส่งให้ลูกค้าหรือเรียกเก็บเงิน`,
        { title: "แปลงเป็นใบเสนอราคา", confirmLabel: "สร้างใบร่าง", cancelLabel: "ยกเลิก" },
      );
      if (!ok) return;
      const res = await convertLeadToQuote(leadRef);
      if (res.ok && res.data) {
        await alert(
          `สร้างใบเสนอราคา ${res.data.quote_no} แล้ว` +
            (res.data.lines_added > 0 ? ` (เติมราคาอัตโนมัติ ${res.data.lines_added} รายการ)` : "") +
            " — กำลังเปิดหน้าแก้ไขใบเสนอราคา",
          { title: "สำเร็จ" },
        );
        router.push(`/admin/freight/quotes/${res.data.freight_quote_id}`);
      } else {
        setErr(res.ok ? "convert_no_data" : res.error);
      }
    });
  }

  const fieldCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm";

  return (
    <section className="rounded-2xl border border-primary-300 bg-primary-50/40 dark:bg-primary-950/10 p-5 space-y-4">
      <h2 className="font-bold text-sm text-primary-800 dark:text-primary-300">🛠 จัดการ / Triage</h2>

      {(msg || err) && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            err ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {err ? `ผิดพลาด: ${err}` : msg}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Status + note */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">สถานะ</label>
          <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className={fieldCls}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="บันทึกการติดตาม (ไม่บังคับ) — จะถูกเก็บพร้อมเวลาและสถานะ"
            rows={2}
            className={fieldCls}
          />
          <button
            type="button"
            onClick={saveStatus}
            disabled={pending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกสถานะ"}
          </button>
        </div>

        {/* Assignee */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">ผู้ดูแล (admin id — เว้นว่าง = ยกเลิกมอบหมาย)</label>
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="เช่น admin_pee"
            className={fieldCls}
          />
          <button
            type="button"
            onClick={saveAssignee}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกผู้ดูแล"}
          </button>
        </div>
      </div>

      {/* Convert */}
      <div className="border-t border-border pt-4">
        <p className="text-xs text-muted mb-2">
          พร้อมเสนอราคาแล้ว? แปลง RFQ นี้เป็นใบเสนอราคาฉบับร่าง (ทีมเซลส์ตรวจ/ตั้งราคา/ส่งเองในขั้นถัดไป)
        </p>
        <button
          type="button"
          onClick={convert}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          📝 แปลงเป็นใบเสนอราคา
        </button>
      </div>
    </section>
  );
}
