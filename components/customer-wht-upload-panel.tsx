"use client";

/**
 * V-A6.1 — Customer-side WHT cert upload form.
 *
 * Renders on /service-(import|order)/[id]/receipt when the WHT entry
 * exists and status='pending'. Lets the customer self-upload their
 * 50 ทวิ cert PDF/JPG.
 *
 * Server action: actions/wht.ts::customerUploadWhtCert (RLS-scoped).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { customerUploadWhtCert } from "@/actions/wht";
import { StyledFileInput } from "@/components/ui/styled-file-input";

type Props = {
  whtEntryId: string;
};

export function CustomerWhtUploadPanel({ whtEntryId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certNo, setCertNo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function fire() {
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("กรุณาเลือกไฟล์ใบ 50 ทวิ (PDF / JPG / PNG)");
      return;
    }
    startTransition(async () => {
      const res = await customerUploadWhtCert(whtEntryId, file, certNo.trim() || undefined);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  if (!open) {
    return (
      <div className="no-print mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
        <p className="text-xs font-bold text-amber-900">📤 มีหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) แล้ว?</p>
        <p className="text-[11px] text-amber-800">
          อัพโหลดได้เลย — Pacred จะออกใบกำกับภาษีให้คุณทันทีหลัง verify
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
        >
          อัพโหลดไฟล์ →
        </button>
      </div>
    );
  }

  return (
    <div className="no-print mt-3 rounded-lg border border-amber-300 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold text-amber-900">📤 อัพโหลดใบ 50 ทวิ</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          disabled={pending}
          className="text-xs text-muted hover:underline"
        >
          ปิด
        </button>
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs text-muted">ไฟล์ใบรับรอง</span>
          <StyledFileInput
            ref={fileRef}
            accept="application/pdf,image/jpeg,image/png"
            label="เลือกไฟล์ใบรับรอง"
            hint="รองรับ PDF / JPG / PNG (ไม่เกิน 10 MB)"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted">เลขที่ใบ 50 ทวิ (ถ้ามี)</span>
          <input
            type="text"
            placeholder="เช่น 2026/12345"
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
            maxLength={100}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs"
          />
        </label>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "กำลังอัพโหลด..." : "✓ ส่งใบรับรอง"}
        </button>
      </div>

      <p className="text-[10px] text-muted">
        ⚠️ Pacred จะตรวจสอบใบรับรองและออกใบกำกับภาษีให้คุณภายใน 1-2 วันทำการ
      </p>
    </div>
  );
}

function translateError(code: string): string {
  if (code.startsWith("upload_failed")) return `อัพโหลดล้มเหลว: ${code}`;
  if (code.startsWith("update_failed")) return `บันทึกล้มเหลว: ${code}`;
  switch (code) {
    case "invalid_input":             return "ข้อมูลไม่ถูกต้อง";
    case "not_signed_in":             return "กรุณา login ก่อน";
    case "no_file":                   return "กรุณาเลือกไฟล์";
    case "file_too_large":            return "ไฟล์ใหญ่เกิน 10 MB";
    case "invalid_mime_type":         return "ไฟล์ต้องเป็น PDF / JPG / PNG เท่านั้น";
    case "not_found_or_unauthorised": return "ไม่พบรายการ WHT ของคุณ";
    case "not_owner":                 return "รายการนี้ไม่ใช่ของคุณ";
    case "already_received":          return "Pacred รับใบรับรองแล้ว — ไม่ต้องอัพโหลดซ้ำ";
    case "already_waived":            return "รายการนี้ได้รับการยกเว้นแล้ว";
    default:                          return code;
  }
}
