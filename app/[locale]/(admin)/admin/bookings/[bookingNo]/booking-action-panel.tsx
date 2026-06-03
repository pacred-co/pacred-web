"use client";

/**
 * G2 / BK-2 · Admin booking action panel.
 *
 * Wires the 5 transitions in actions/admin/bookings.ts to a status-aware
 * button strip on the admin detail page.  Buttons render conditionally per
 * the current status (per the lifecycle in migration 0079):
 *
 *   draft      → no actions (customer has not submitted yet)
 *   submitted  → [Mark contacted] [Mark lost] [Cancel]
 *   contacted  → [Mark quoted]    [Mark lost] [Cancel]
 *   quoted     → [Mark won]       [Mark lost] [Cancel]
 *   won / lost / cancelled → terminal — no actions
 *
 * Confirmation prompts protect destructive transitions (won/lost/cancel).
 * The page calls router.refresh() after success so the server-component
 * panel above re-renders with the new status + work_item state.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import {
  adminMarkBookingContacted,
  adminMarkBookingQuoted,
  adminMarkBookingWon,
  adminMarkBookingLost,
  adminCancelBooking,
} from "@/actions/admin/bookings";
import type { BookingStatus } from "@/lib/validators/booking";

interface BookingActionPanelProps {
  bookingId: string;
  bookingNo: string | null;
  status: BookingStatus;
  freightQuoteId: string | null;
}

export function BookingActionPanel({
  bookingId,
  bookingNo,
  status,
  freightQuoteId,
}: BookingActionPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state for transitions that take input.
  const [quoteIdInput, setQuoteIdInput] = useState(freightQuoteId ?? "");
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [reasonInput, setReasonInput] = useState("");
  const [showReasonForm, setShowReasonForm] = useState<"lost" | "cancel" | null>(null);

  if (!bookingNo) {
    return (
      <section className="rounded-2xl border border-border bg-surface-alt p-5 space-y-1">
        <h2 className="font-bold text-sm">การจัดการ</h2>
        <p className="text-xs text-muted">
          ลูกค้ายังไม่ submit (สถานะ <code className="font-mono">draft</code>) — ยังไม่มี action ให้กด
        </p>
      </section>
    );
  }

  const isTerminal = status === "won" || status === "lost" || status === "cancelled";
  if (isTerminal) {
    const label =
      status === "won"  ? "ปิดดีลแล้ว · won" :
      status === "lost" ? "ปิด · ลูกค้าไม่เอา · lost" :
                          "ยกเลิก · cancelled";
    return (
      <section className="rounded-2xl border border-border bg-surface-alt p-5 space-y-1">
        <h2 className="font-bold text-sm">การจัดการ</h2>
        <p className="text-xs text-muted">
          การจองนี้ถึงสถานะสุดท้ายแล้ว ({label}) — ไม่สามารถเปลี่ยนสถานะได้
        </p>
      </section>
    );
  }

  function handleResult(label: string) {
    return (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        setError(null);
        setSuccess(`${label} ✓`);
        // Reset transient input state.
        setQuoteIdInput("");
        setReasonInput("");
        setShowQuoteForm(false);
        setShowReasonForm(null);
        router.refresh();
        // Clear success toast after 3s.
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setSuccess(null);
        setError(translateError(res.error ?? "unknown_error"));
      }
    };
  }

  function fireMarkContacted() {
    setError(null);
    startTransition(async () => {
      const res = await adminMarkBookingContacted({ bookingId });
      handleResult("ติดต่อแล้ว")(res);
    });
  }

  function fireMarkQuoted() {
    setError(null);
    const trimmed = quoteIdInput.trim();
    if (!isUuid(trimmed)) {
      setError("กรุณาใส่ freight_quote_id เป็น UUID ที่ถูกต้อง");
      return;
    }
    startTransition(async () => {
      const res = await adminMarkBookingQuoted({ bookingId, freightQuoteId: trimmed });
      handleResult("เชื่อมใบเสนอราคาแล้ว")(res);
    });
  }

  async function fireMarkWon() {
    if (!(await confirm("ยืนยันปิดดีลเป็น 'won'?\n(ปิดสถานะถาวร — แก้ไขย้อนหลังไม่ได้)"))) return;
    setError(null);
    startTransition(async () => {
      const res = await adminMarkBookingWon({ bookingId });
      handleResult("ปิดดีล · won")(res);
    });
  }

  async function fireClose(kind: "lost" | "cancel") {
    setError(null);
    const reason = reasonInput.trim();
    if (reason.length < 3) {
      setError("กรุณาใส่เหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }
    const label = kind === "lost" ? "ลูกค้าไม่เอา · lost" : "ยกเลิก · cancelled";
    if (!(await confirm(`ยืนยัน ${label}?\n\nเหตุผล: ${reason}\n\n(ปิดสถานะถาวร — แก้ไขย้อนหลังไม่ได้)`))) return;
    startTransition(async () => {
      const res = kind === "lost"
        ? await adminMarkBookingLost({ bookingId, reason })
        : await adminCancelBooking({ bookingId, reason });
      handleResult(label)(res);
    });
  }

  // ── Render — buttons depend on status ──
  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/30 dark:bg-primary-950/10 p-5 space-y-3">
      <h2 className="font-bold text-sm">การจัดการ</h2>

      {/* Status-specific primary actions */}
      {status === "submitted" && (
        <button
          type="button"
          onClick={fireMarkContacted}
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "📞 ติดต่อแล้ว → contacted"}
        </button>
      )}

      {(status === "submitted" || status === "contacted") && (
        <div className="space-y-2">
          {!showQuoteForm ? (
            <button
              type="button"
              onClick={() => setShowQuoteForm(true)}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              📄 ทำใบเสนอราคาแล้ว → quoted
            </button>
          ) : (
            <div className="rounded-lg border border-primary-200 bg-white dark:bg-surface p-3 space-y-2">
              <label className="text-xs font-semibold text-foreground">
                freight_quote_id (UUID ของใบเสนอราคาที่สร้างแล้ว)
              </label>
              <input
                type="text"
                value={quoteIdInput}
                onChange={(e) => setQuoteIdInput(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs font-mono"
                disabled={pending}
              />
              <p className="text-[10px] text-muted">
                สร้างใบเสนอราคาจาก{" "}
                <a href="/admin/freight/quotes/new" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                  /admin/freight/quotes/new
                </a>{" "}
                ก่อน แล้ว copy UUID มาวาง
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fireMarkQuoted}
                  disabled={pending || !quoteIdInput.trim()}
                  className="flex-1 inline-flex items-center justify-center min-h-[40px] rounded bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {pending ? "กำลังบันทึก…" : "เชื่อมใบเสนอราคา"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowQuoteForm(false); setQuoteIdInput(""); }}
                  disabled={pending}
                  className="inline-flex items-center justify-center min-h-[40px] rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {status === "quoted" && (
        <button
          type="button"
          onClick={fireMarkWon}
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "🏆 ปิดดีล → won"}
        </button>
      )}

      {/* Lost / Cancel — available on all non-terminal states */}
      <div className="pt-2 border-t border-primary-200">
        {!showReasonForm ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowReasonForm("lost")}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg border border-red-300 bg-white dark:bg-surface px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              ลูกค้าไม่เอา · lost
            </button>
            <button
              type="button"
              onClick={() => setShowReasonForm("cancel")}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-xs text-muted hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก · cancelled
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-white dark:bg-surface p-3 space-y-2">
            <label className="text-xs font-semibold text-foreground">
              เหตุผล{showReasonForm === "lost" ? " (ลูกค้าทำไมไม่เอา?)" : " (ทำไมยกเลิก?)"}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder={showReasonForm === "lost" ? "เช่น ราคาแพงเกิน, ไปใช้เจ้าอื่น, เปลี่ยนใจ" : "เช่น ลูกค้าขอยกเลิก"}
              maxLength={500}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
              disabled={pending}
            />
            <p className="text-[10px] text-muted">{reasonInput.length} / 500 · อย่างน้อย 3 ตัวอักษร</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fireClose(showReasonForm)}
                disabled={pending || reasonInput.trim().length < 3}
                className="flex-1 inline-flex items-center justify-center min-h-[40px] rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "กำลังบันทึก…" : `ยืนยัน ${showReasonForm === "lost" ? "lost" : "cancel"}`}
              </button>
              <button
                type="button"
                onClick={() => { setShowReasonForm(null); setReasonInput(""); }}
                disabled={pending}
                className="inline-flex items-center justify-center min-h-[40px] rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 text-xs text-red-800 dark:text-red-200">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 p-3 text-xs text-green-800 dark:text-green-200">
          ✓ {success}
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function translateError(err: string): string {
  // Map known server-action error strings to friendly TH messages.
  if (err === "not_found") return "ไม่พบการจอง (อาจถูกลบ — refresh หน้า)";
  if (err === "draft_cannot_transition") return "การจองยังเป็น draft — ยังไม่ submit";
  if (err === "freight_quote_not_found") return "ไม่พบใบเสนอราคาที่ระบุ — เช็ค UUID อีกครั้ง";
  if (err === "invalid_freight_quote_id") return "UUID ของใบเสนอราคาไม่ถูกต้อง";
  if (err === "reason_too_short") return "เหตุผลต้องมีอย่างน้อย 3 ตัวอักษร";
  if (err === "reason_too_long") return "เหตุผลยาวเกิน 500 ตัวอักษร";
  if (err.startsWith("bad_status:")) {
    const actual = err.split(":")[1];
    return `สถานะเปลี่ยนไปแล้ว (ตอนนี้คือ ${actual}) — refresh หน้าเพื่อดูสถานะปัจจุบัน`;
  }
  if (err.startsWith("update_failed:")) return "บันทึกไม่สำเร็จ: " + err.replace("update_failed:", "").trim();
  if (err === "forbidden") return "สิทธิ์ไม่พอ (ต้องเป็น sales_admin / ops / accounting / super)";
  return `เกิดข้อผิดพลาด: ${err}`;
}
