"use client";

/**
 * <ForwarderExceptionPanelClient> — the staff "⚠️ แจ้งปัญหาพัสดุ" control on the
 * ฝากนำเข้า detail page (gap G7 · เดฟ 2026-06-30).
 *
 * SAFE MVP: pick a type + note + optional photo → flagForwarderException. When an
 * exception is already open, shows it + a ปิดเคส (resolve) form. RECORD-ONLY — the
 * action writes ONLY fexception_* (never money/status/ownership). For
 * wrong_pr/not_mine the panel points staff at the EXISTING audited paths (the
 * inline แก้ไขลูกค้า field + the วางบิล button), which owner/accounting drive.
 *
 * §0f confirm-before-mutate: flag + resolve both confirm first.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck, Camera } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import {
  flagForwarderException,
  resolveForwarderException,
} from "@/actions/admin/forwarder-exception";
import {
  EXCEPTION_TYPES,
  EXCEPTION_TYPE_LABEL,
  type ExceptionType,
} from "@/lib/admin/forwarder-exception-types";

type Props = {
  fNo: number;
  /** Current exception state (null = none). */
  currentType: ExceptionType | null;
  currentNote: string | null;
  currentStatus: string | null;
  /** Signed URL for an existing exception photo (null = none). */
  currentPhotoUrl: string | null;
};

export function ForwarderExceptionPanelClient({
  fNo,
  currentType,
  currentNote,
  currentStatus,
  currentPhotoUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isOpen = (currentStatus ?? "") === "open";

  // Flag-form state.
  const [type, setType] = useState<ExceptionType>(currentType ?? "damaged");
  const [note, setNote] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [open, setOpen] = useState(false); // collapse the form until staff clicks

  // Resolve-form state.
  const [resolveNote, setResolveNote] = useState<string>("");

  // wrong_pr / not_mine → remind staff this only RECORDS; the real fix is the
  // existing audited paths.
  const needsOwnerAction = type === "wrong_pr" || type === "not_mine";

  async function onFlag() {
    setError(null);
    const ok = await confirm(
      `บันทึกปัญหา "${EXCEPTION_TYPE_LABEL[type]}" ให้ออเดอร์ #${fNo}?\n\n` +
        `(เป็นการบันทึกไว้ให้ทีมตามต่อเท่านั้น — ไม่เปลี่ยนสถานะ/ราคา/เจ้าของอัตโนมัติ)`,
    );
    if (!ok) return;

    const fd = new FormData();
    fd.set("fNo", String(fNo));
    fd.set("type", type);
    fd.set("note", note);
    if (photo) fd.set("photo", photo);

    startTransition(async () => {
      const res = await flagForwarderException(fd);
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setNote("");
      setPhoto(null);
      setOpen(false);
      router.refresh();
    });
  }

  async function onResolve() {
    setError(null);
    const ok = await confirm(`ปิดเคสปัญหาของออเดอร์ #${fNo}?`);
    if (!ok) return;
    startTransition(async () => {
      const res = await resolveForwarderException({ fNo, note: resolveNote });
      if (!res.ok) {
        setError(res.error ?? "ปิดเคสไม่สำเร็จ");
        return;
      }
      setResolveNote("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-surface shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold tracking-wide text-amber-800 dark:text-amber-300">
          แจ้งปัญหาพัสดุ (ของแตก/ไม่ใช่ของลูกค้า/ตู้ตีกลับ/ติดด่าน)
        </h3>
        {isOpen && (
          <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            🔴 มีปัญหา รอดำเนินการ
          </span>
        )}
      </div>

      {/* Current open exception summary */}
      {isOpen && (
        <div className="rounded-lg border border-red-200 bg-white dark:bg-surface p-3 text-sm space-y-1.5">
          <p className="font-semibold text-red-700">
            {EXCEPTION_TYPE_LABEL[(currentType ?? "other") as ExceptionType]}
          </p>
          {currentNote && <p className="whitespace-pre-wrap text-foreground">{currentNote}</p>}
          {currentPhotoUrl && (
            <a href={currentPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPhotoUrl}
                alt="รูปปัญหาพัสดุ"
                className="mt-1 h-24 w-24 rounded-lg border border-border object-cover"
              />
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>
      )}

      {/* Flag form (collapsed by default · "แจ้งปัญหา"/"แก้ไขปัญหา" toggles it) */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          {isOpen ? "✎ แก้ไขรายละเอียดปัญหา" : "⚠️ แจ้งปัญหาพัสดุนี้"}
        </button>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-amber-200 bg-white dark:bg-surface p-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">ประเภทปัญหา</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ExceptionType)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            >
              {EXCEPTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EXCEPTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {needsOwnerAction && (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              ℹ️ เป็นการ <b>บันทึกไว้</b> เท่านั้น — การเปลี่ยนลูกค้า/ปรับบิลจริง ทำที่ปุ่มเดิม
              (ช่อง “แก้ไข ลูกค้า” ด้านบน · ปุ่ม “สร้างใบวางบิล”) ซึ่งต้องบัญชี/owner เคาะ
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">รายละเอียด</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="อธิบายปัญหา เช่น กล่องบุบ มุมแตก / ตู้ GZS… ตีกลับ / ของติดด่านรอเอกสาร…"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1">
              <Camera className="h-3.5 w-3.5" /> แนบรูป (ถ้ามี · รูป/PDF ≤ 5 MB)
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-amber-100 file:px-3 file:py-1.5 file:text-amber-800 file:font-medium hover:file:bg-amber-200"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onFlag}
              disabled={pending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก..." : "บันทึกปัญหา"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Resolve form — only when an exception is open */}
      {isOpen && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" /> ปิดเคส (เมื่อจัดการเรียบร้อย)
          </p>
          <input
            type="text"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            maxLength={2000}
            placeholder="หมายเหตุการปิดเคส (ถ้ามี)"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={onResolve}
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "กำลังปิดเคส..." : "✓ ปิดเคส (resolved)"}
          </button>
        </div>
      )}
    </section>
  );
}
