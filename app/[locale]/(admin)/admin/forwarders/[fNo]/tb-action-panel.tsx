"use client";

/**
 * Single-row action panel for /admin/forwarders/[fNo] detail page (legacy
 * tb_forwarder branch).
 *
 * Wave 23 (2026-05-27 ภูม flag · live walkthrough):
 *   Before this, the legacy view rendered the order data + 7-step timeline
 *   + an "✏️ แก้ไขขนาด / น้ำหนัก" link only — admin who drilled into a
 *   row had NO way to advance status / assign cabinet / set tracking-TH
 *   from the detail page. The only path was: leave detail → list → tick
 *   row → use bulk-bar at bottom. That's a UX disaster for single-order
 *   work (the most common flow when CS handles a customer's question).
 *
 * This panel reuses the SAME server action as the bulk-bar
 * (adminBulkUpdateForwarderTbStatus) with `fids: [id]` — keeping one
 * canonical write path. The action's optional fields (cabinet_number,
 * tracking_th, fnote) let this single-row caller send the full set.
 *
 * Layout: status dropdown + cabinet input + tracking-TH input + note
 * textarea + submit button. Mirrors the bulk-bar idiom + extends.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBulkUpdateForwarderTbStatus, adminSaveForwarderNote } from "@/actions/admin/forwarders";
import { confirm } from "@/components/ui/confirm";

type Status = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99";

const STATUS_OPTIONS: ReadonlyArray<{ v: Status; l: string }> = [
  { v: "1",  l: "1 · รอเข้าโกดังจีน" },
  { v: "2",  l: "2 · ถึงโกดังจีนแล้ว" },
  { v: "3",  l: "3 · กำลังส่งมาไทย" },
  { v: "4",  l: "4 · ถึงไทยแล้ว" },
  { v: "5",  l: "5 · รอชำระเงิน" },
  { v: "6",  l: "6 · เตรียมส่ง" },
  { v: "7",  l: "7 · ส่งแล้ว" },
  { v: "99", l: "99 · สถานะพิเศษ" },
];

type Props = {
  fId: number;                       // tb_forwarder.id (primary key)
  fNo: string;                       // for the confirm dialog text
  currentStatus: Status;
  currentCabinet: string;            // "" if unset
  currentTrackingTh: string;         // "-" if legacy unset
  currentNote: string;               // "" if unset
};

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

export function TbForwarderActionPanel(p: Props) {
  const router = useRouter();
  const [status,   setStatus]    = useState<Status>(p.currentStatus);
  const [cabinet,  setCabinet]   = useState<string>(p.currentCabinet);
  const [tracking, setTracking]  = useState<string>(p.currentTrackingTh === "-" ? "" : p.currentTrackingTh);
  const [note,     setNote]      = useState<string>(p.currentNote);
  const [pending,  startTransition] = useTransition();
  const [error,    setError]     = useState<string | null>(null);
  const [success,  setSuccess]   = useState<string | null>(null);

  function dirty(): boolean {
    return (
      status !== p.currentStatus ||
      cabinet.trim() !== p.currentCabinet.trim() ||
      tracking.trim() !== (p.currentTrackingTh === "-" ? "" : p.currentTrackingTh).trim() ||
      note.trim() !== p.currentNote.trim()
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!dirty()) {
      setError("ไม่มีการเปลี่ยนแปลง — กรุณาแก้ไขข้อมูลก่อนบันทึก");
      return;
    }

    const statusLabel = STATUS_OPTIONS.find((o) => o.v === status)?.l ?? status;
    const cab = cabinet.trim();
    const trk = tracking.trim();
    const nt  = note.trim();

    // Compose diff summary for confirm prompt (legacy posture · staff sees
    // exactly what's about to change before committing).
    const lines: string[] = [];
    if (status !== p.currentStatus)
      lines.push(`สถานะ: "${p.currentStatus}" → "${statusLabel}"`);
    if (cab !== p.currentCabinet.trim())
      lines.push(`เลขตู้: "${p.currentCabinet || '—'}" → "${cab || '—'}"`);
    const trackBefore = p.currentTrackingTh === "-" ? "" : p.currentTrackingTh;
    if (trk !== trackBefore.trim())
      lines.push(`Tracking TH: "${trackBefore || '—'}" → "${trk || '—'}"`);
    if (nt !== p.currentNote.trim())
      lines.push(`หมายเหตุ: "${p.currentNote.slice(0, 30) || '—'}..." → "${nt.slice(0, 30) || '—'}..."`);

    if (!(await confirm(`บันทึก #${p.fNo} ?\n\n${lines.join('\n')}`))) return;

    startTransition(async () => {
      const result = await adminBulkUpdateForwarderTbStatus({
        fids:    [p.fId],
        fstatus: status,
        // Only pass fields the admin actually touched — leaving them
        // undefined means "don't touch the column" (action treats
        // `undefined` as no-op and `""` as explicit clear).
        ...(cab !== p.currentCabinet.trim()       ? { cabinet_number: cab } : {}),
        ...(trk !== trackBefore.trim()             ? { tracking_th: trk }    : {}),
        ...(nt  !== p.currentNote.trim()           ? { fnote: nt }            : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSuccess(`บันทึกสำเร็จ — #${p.fNo}`);
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  const isRollback = parseInt(status, 10) < parseInt(p.currentStatus, 10) && p.currentStatus !== "99";

  // 2026-06-04 ภูม UX F1 Issue 2: split status-form + note-form into a
  // responsive 2-col grid (ฟอร์มอัปเดตสถานะซ้าย · ฟอร์มบันทึกหมายเหตุขวา).
  // Previously both stacked vertically which made the page "ดูยืดไปหมดเลย"
  // when used inside the always-open ACTION section on /edit.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-primary-200 bg-primary-50/30 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-primary-100 text-primary-700 px-2.5 py-0.5 text-[11px] font-semibold">
          ขั้นถัดไป
        </span>
        <h3 className="text-sm font-semibold tracking-wide">🚛 อัพเดตสถานะ + ผูกตู้</h3>
      </div>

      <div>
        <label htmlFor="tap_status" className="block text-xs font-medium text-muted mb-1">
          สถานะใหม่
        </label>
        <select
          id="tap_status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          disabled={pending}
          className={INPUT_CLS}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
        {isRollback && (
          <p className="mt-1 text-[11px] text-amber-700">
            ⚠ กำลังย้อนสถานะ — confirm dialog จะถามอีกครั้ง
          </p>
        )}
      </div>

      <div>
        <label htmlFor="tap_cabinet" className="block text-xs font-medium text-muted mb-1">
          เลขตู้ (GZE / GZS)
        </label>
        <input
          id="tap_cabinet"
          type="text"
          value={cabinet}
          onChange={(e) => setCabinet(e.target.value)}
          disabled={pending}
          maxLength={300}
          placeholder="GZE-2026-001 (เว้นว่าง = ยังไม่ผูกตู้)"
          className={`${INPUT_CLS} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="tap_tracking" className="block text-xs font-medium text-muted mb-1">
          Tracking TH (เลขขนส่งในไทย)
        </label>
        <input
          id="tap_tracking"
          type="text"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          disabled={pending}
          maxLength={50}
          placeholder="TH00012345 (กรอกตอนสถานะ 6/7 · เว้นว่าง = ยังไม่มี)"
          className={`${INPUT_CLS} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="tap_note" className="block text-xs font-medium text-muted mb-1">
          หมายเหตุ admin
        </label>
        <textarea
          id="tap_note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          maxLength={2000}
          rows={2}
          placeholder="หมายเหตุ (สำหรับ staff · ลูกค้าไม่เห็น)"
          className={INPUT_CLS}
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          ✓ {success}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !dirty()}
        className="w-full rounded-lg bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังบันทึก..." : "💾 บันทึกการเปลี่ยนแปลง"}
      </button>

      <p className="text-[10px] text-muted text-center leading-relaxed">
        บันทึกแล้วจะอัพเดต fstatus + fcabinetnumber + ftrackingth + fnote ของ
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">tb_forwarder #{p.fNo}</code>
        พร้อม stamp fdatestatusN · adminidupdate · audit log อัตโนมัติ
      </p>
    </form>

    {/* re-sweep A2 #7 — note-only save WITH push (legacy forwarder.php
        saveNote). The status form above only pushes when fstatus changes; a
        pure note edit needs this dedicated path to actually notify. */}
    <NotePushForm fId={p.fId} fNo={p.fNo} currentNote={p.currentNote} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// <NotePushForm> — faithful port of forwarder.php saveNote (note-only +
// push). Lets the admin save a note AND notify either the staff group
// (admin-only) or the customer (in-app + LINE OA + email). Calls
// adminSaveForwarderNote (actions/admin/forwarders.ts) → writes
// tb_forwarder.fnote/fnoteuser/fnoteuserread/fnotedate.
// ─────────────────────────────────────────────────────────────────────

function NotePushForm({ fId, fNo, currentNote }: { fId: number; fNo: string; currentNote: string }) {
  const router = useRouter();
  const [note, setNote] = useState<string>(currentNote);
  const [adminOnly, setAdminOnly] = useState<boolean>(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const target = adminOnly ? "แอดมินเท่านั้น" : "ลูกค้าและแอดมิน";
    if (!(await confirm(`บันทึกหมายเหตุ + แจ้งเตือน (${target}) สำหรับ #${fNo}?`))) return;
    startTransition(async () => {
      const result = await adminSaveForwarderNote({
        fID:       fId,
        fNote:     note,
        fNoteUser: adminOnly ? "1" : "0",
      });
      if (!result.ok) {
        setError(result.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSuccess(adminOnly ? "บันทึก + แจ้งทีมงานแล้ว" : "บันทึก + แจ้งลูกค้าแล้ว");
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[11px] font-semibold">
          หมายเหตุ + แจ้งเตือน
        </span>
        <h3 className="text-sm font-semibold tracking-wide">📝 บันทึกหมายเหตุ (ไม่เปลี่ยนสถานะ)</h3>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
        maxLength={5000}
        rows={2}
        placeholder="หมายเหตุ (เว้นว่าง = แจ้ง 'แก้ไขเรียบร้อยแล้ว')"
        className={INPUT_CLS}
      />

      <div className="flex items-center gap-4 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`noteuser-${fId}`}
            checked={adminOnly}
            onChange={() => setAdminOnly(true)}
            disabled={pending}
          />
          <span>แอดมินเท่านั้น (ลูกค้าไม่เห็น)</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`noteuser-${fId}`}
            checked={!adminOnly}
            onChange={() => setAdminOnly(false)}
            disabled={pending}
          />
          <span>แจ้งลูกค้า</span>
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">✓ {success}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังบันทึก..." : "💾 บันทึกหมายเหตุ + แจ้งเตือน"}
      </button>
    </form>
  );
}
