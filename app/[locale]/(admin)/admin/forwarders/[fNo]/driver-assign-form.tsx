"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminAssignDriverToForwarder } from "@/actions/admin/forwarder-drivers";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const STATUS_LABEL: Record<number, string> = {
  1: "รอคนขับรับงาน",
  2: "คนขับรับแล้ว",
  3: "หมดเวลารับงาน",
  4: "ส่งงานเสร็จ",
};
const STATUS_BADGE: Record<number, string> = {
  1: "bg-yellow-50 text-yellow-700 border-yellow-200",
  2: "bg-blue-50 text-blue-700 border-blue-200",
  3: "bg-gray-50 text-gray-600 border-gray-200",
  4: "bg-green-50 text-green-700 border-green-200",
};

type Assignment = {
  id: string;
  status: number;
  fd_date: string;
  accepted_at: string | null;
  completed_at: string | null;
  driver: {
    member_code: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

export function DriverAssignForm({
  forwarderId,
  assignments,
}: {
  forwarderId: string;
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [memberCode, setMemberCode] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // The server action rejects if there's an open assignment (status 1 or 2).
  // Mirror that here so the form is disabled with a clear reason.
  const openAssignment = assignments.find((a) => a.status === 1 || a.status === 2);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await adminAssignDriverToForwarder({
        forwarder_id: forwarderId,
        member_code:  memberCode.trim().toUpperCase(),
        note:         note.trim() || undefined,
      });
      if (res.ok) {
        setMsg("มอบหมายเรียบร้อย — คนขับได้รับการแจ้งเตือนแล้ว");
        setMemberCode("");
        setNote("");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm">คนขับ (Driver assignment)</h3>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* History — most recent first */}
      {assignments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">ประวัติการมอบหมาย</p>
          <ul className="space-y-1.5">
            {assignments.map((a) => {
              const driverName = a.driver
                ? [a.driver.first_name, a.driver.last_name].filter(Boolean).join(" ") || "—"
                : "(โปรไฟล์ถูกลบ)";
              return (
                <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-alt p-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {driverName}
                      {a.driver?.member_code && (
                        <span className="ml-2 font-mono text-muted">{a.driver.member_code}</span>
                      )}
                    </p>
                    <p className="text-muted">
                      มอบหมาย {new Date(a.fd_date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      {a.driver?.phone && <> · ☎ {a.driver.phone}</>}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 ${STATUS_BADGE[a.status] ?? ""}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Assign form — disabled if open assignment exists */}
      {openAssignment ? (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ⚠️ มี assignment เปิดอยู่ — กรุณายกเลิกของเดิม (สถานะ → หมดเวลา หรือ ส่งงานเสร็จ) ที่ <a className="underline" href={`/admin/drivers/${openAssignment.id}`}>หน้านั้น</a> ก่อน
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted">มอบหมายให้คนขับใหม่</p>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Member code คนขับ <span className="text-red-500">*</span></span>
            <input
              value={memberCode}
              onChange={(e) => setMemberCode(e.target.value)}
              className={inputCls}
              placeholder="เช่น PR00042"
              pattern="^[Pp][Rr]\d{5}$"
              required
              disabled={pending}
            />
            <span className="text-[11px] text-muted">รูปแบบ PR + 5 หลัก (เช่น PR00042) — ดู member_code จากหน้า /admin/customers</span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">หมายเหตุ (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              placeholder="เช่น ส่งบ่ายโมง / ระวังของแตก"
              disabled={pending}
            />
          </label>
          <Button type="submit" size="sm" disabled={pending || !memberCode.trim()}>
            {pending ? "กำลังมอบหมาย..." : "📦 มอบหมายงาน"}
          </Button>
        </form>
      )}
    </div>
  );
}
