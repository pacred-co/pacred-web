"use client";

/**
 * DateTime24Field — an always-EXPANDED 24-hour date+time picker
 * (ปอน 2026-07-15, owner-directed: "กางออกมาเลย จะได้กดง่ายๆ").
 *
 * Replaces the old native `<input type="date">` + two `<select>` (which hid the
 * days/times behind a dropdown, and rendered AM/PM on en-US Chrome). Now:
 *   • date → an inline month calendar grid (click a day · ‹ › to change month)
 *   • time → two up/down spinners (ชม. 00–23 · นาที 00–59) = always 24h, one tap
 * Everything is visible at once so ops can match the slip's transfer time at a
 * glance. value / onChange keep the SAME "YYYY-MM-DDTHH:mm" shape as before, so
 * callers don't change their parse/submit logic.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** local YYYY-MM-DD for a Date */
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "15 กรกฎาคม 2026" for a YYYY-MM-DD date part (empty if none/invalid). */
function thaiDateLabel(datePart: string): string {
  if (!datePart) return "";
  const d = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function DateTime24Field({
  value,
  onChange,
  max,
  disabled,
  className = "",
}: {
  /** "YYYY-MM-DDTHH:mm" (the datetime-local shape) · "" = empty */
  value: string;
  onChange: (next: string) => void;
  /** optional max DATE (YYYY-MM-DD) — days after it are disabled */
  max?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [datePart = "", timePart = ""] = (value || "").split("T");
  const [hh = "", mm = ""] = timePart.split(":");

  // Which month the calendar shows — defaults to the selected date, else today.
  // Remounts (panel re-open) re-init this, which is what we want.
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = datePart ? new Date(`${datePart}T00:00:00`) : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const emit = (d: string, h: string, m: string) => {
    // pick a time first (before a date) → fill today so the value stays valid
    const date = d || (h || m ? ymd(new Date()) : "");
    if (!date) {
      onChange("");
      return;
    }
    onChange(`${date}T${h || "00"}:${m || "00"}`);
  };

  // ── 6×7 calendar grid, leading/trailing months filled (like the mockup) ──
  const firstWeekday = new Date(view.y, view.m, 1).getDay(); // 0 = Sun
  const gridStart = new Date(view.y, view.m, 1 - firstWeekday);
  const cells = Array.from({ length: 42 }, (_, i) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );

  const stepMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // ── time spinners (wrap-around) ──
  const curHour = hh === "" ? 0 : Number(hh);
  const curMin = mm === "" ? 0 : Number(mm);
  const bumpHour = (d: number) => emit(datePart, pad((curHour + d + 24) % 24), pad(curMin));
  const bumpMin = (d: number) => emit(datePart, pad(curHour), pad((curMin + d + 60) % 60));

  // time picker POPUP (owner 2026-07-15: "pop up ไม่กินพื้นที่") — floating card
  // (portal → body · position:fixed · ไม่ดันเลย์เอาต์ · ไม่โดน overflow ตัด ·
  // ปิดเมื่อคลิกนอก/Esc). กริดปุ่มใหญ่ ชม. 00–23 + นาที 00–59.
  const [clockOpen, setClockOpen] = useState(false);
  const clockBtnRef = useRef<HTMLButtonElement>(null);
  const clockPopRef = useRef<HTMLDivElement>(null);
  const [clockPos, setClockPos] = useState<{ top: number; left: number } | null>(null);

  const openClock = () => {
    const r = clockBtnRef.current?.getBoundingClientRect();
    if (r) {
      const w = 316; // w-72 (288) + p-3 (24) + border (2) + buffer
      const estH = 380;
      // right-align to the button → เปิดไปทางซ้าย (ทับปฏิทินได้) ให้เห็นเต็มจอ ไม่ล้นขวา
      let left = r.right - w;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      let top = r.bottom + 6;
      if (top + estH > window.innerHeight - 8) {
        const above = r.top - estH - 6; // not enough below → flip above
        top = above > 8 ? above : Math.max(8, window.innerHeight - estH - 8);
      }
      setClockPos({ top, left });
    }
    setClockOpen(true);
  };

  // after the popup mounts, measure the REAL box and nudge it fully into view
  // (the estimate above can be off → this guarantees no edge is clipped).
  useEffect(() => {
    if (!clockOpen || !clockPos) return;
    const el = clockPopRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const m = 8;
    let left = clockPos.left;
    let top = clockPos.top;
    if (rect.right > window.innerWidth - m) left = Math.max(m, window.innerWidth - rect.width - m);
    if (left < m) left = m;
    if (rect.bottom > window.innerHeight - m) top = Math.max(m, window.innerHeight - rect.height - m);
    if (top < m) top = m;
    if (left !== clockPos.left || top !== clockPos.top) setClockPos({ left, top });
  }, [clockOpen, clockPos]);

  useEffect(() => {
    if (!clockOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (clockPopRef.current?.contains(t) || clockBtnRef.current?.contains(t)) return;
      setClockOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setClockOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [clockOpen]);

  // สรุปวันเวลาที่เลือก (owner 2026-07-15) — บรรทัดยืนยัน วัน/เดือน/ปี + เวลา อีกที.
  const summaryDate = datePart || "-";
  const summaryTime = datePart ? (hh || "00") + ":" + (mm || "00") : "--:--";
  const summaryThai = thaiDateLabel(datePart);

  return (
    <div className={className}>
      {/* ── สรุปวันเวลาที่เลือก (บรรทัดยืนยัน · owner 2026-07-15) ── */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-alt/40 px-3 py-2">
        <span className="text-xs text-muted">วันเวลาที่เลือก (ปี ค.ศ./เดือน/วัน) :</span>
        <span className="font-mono text-base font-bold text-foreground">{summaryDate} {summaryTime} น.</span>
        {summaryThai ? <span className="text-xs text-muted">({summaryThai})</span> : null}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {/* ── calendar (เต็มพื้นที่แบบเดิม · cap 26rem ให้เล็กลงหน่อย · ปอน 2026-07-15) ── */}
        <div className="min-w-[18rem] max-w-[34rem] flex-1 select-none rounded-xl border border-border bg-white p-3 dark:bg-surface">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            disabled={disabled}
            aria-label="เดือนก่อนหน้า"
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {MONTHS[view.m]} {view.y}
          </span>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            disabled={disabled}
            aria-label="เดือนถัดไป"
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-center text-xs font-medium text-muted">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            const iso = ymd(d);
            const inMonth = d.getMonth() === view.m;
            const selected = iso === datePart;
            const isDisabled = disabled || (max ? iso > max : false);
            return (
              <button
                key={i}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!inMonth) setView({ y: d.getFullYear(), m: d.getMonth() });
                  emit(iso, hh, mm);
                }}
                className={[
                  "h-10 w-full rounded-lg text-sm tabular-nums transition-colors",
                  selected
                    ? "bg-primary-500 font-bold text-white"
                    : inMonth
                      ? "text-foreground hover:bg-surface-alt"
                      : "text-muted/50 hover:bg-surface-alt",
                  "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
                ].join(" ")}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── time (24h): กด ▲▼ · พิมพ์ตัวเลข · หรือเปิดหน้าปัดนาฬิกา ── */}
      <div className="flex flex-col items-start gap-2 pt-1">
        <div className="flex items-center gap-2">
          <TimeSpin unit="ชั่วโมง" value={pad(curHour)} max={23} onUp={() => bumpHour(1)} onDown={() => bumpHour(-1)} onSet={(n) => emit(datePart, pad(n), pad(curMin))} disabled={disabled} />
          <span className="text-3xl font-bold text-muted">:</span>
          <TimeSpin unit="นาที" value={pad(curMin)} max={59} onUp={() => bumpMin(1)} onDown={() => bumpMin(-1)} onSet={(n) => emit(datePart, pad(curHour), pad(n))} disabled={disabled} />
          <span className="ml-1 self-center text-[11px] leading-tight text-muted">น.<br />(24 ชม.)</span>
        </div>
        <button
          ref={clockBtnRef}
          type="button"
          onClick={() => (clockOpen ? setClockOpen(false) : openClock())}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-alt disabled:opacity-50 dark:bg-surface"
        >
          <Clock className="h-4 w-4 text-primary-600" /> เลือกเวลาแบบกดปุ่ม
        </button>
        {clockOpen && clockPos && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={clockPopRef}
                style={{ position: "fixed", top: clockPos.top, left: clockPos.left, zIndex: 60, maxHeight: "calc(100vh - 16px)" }}
                className="overflow-y-auto rounded-2xl border border-border bg-white p-3 shadow-2xl dark:bg-surface"
              >
                <GridTimePicker
                  hour={curHour}
                  minute={curMin}
                  onPickHour={(h) => emit(datePart, pad(h), pad(curMin))}
                  onPickMinute={(m) => emit(datePart, pad(curHour), pad(m))}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setClockOpen(false)}
                    className="rounded-lg bg-primary-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-600"
                  >
                    เสร็จ
                  </button>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
      </div>
    </div>
  );
}

// ── one hour/minute spinner column: ▲ / [พิมพ์ได้] / ▼ ──
function TimeSpin({
  unit,
  value,
  max,
  onUp,
  onDown,
  onSet,
  disabled,
}: {
  unit: string;
  value: string;
  /** clamp ceiling — 23 (ชม.) หรือ 59 (นาที) */
  max: number;
  onUp: () => void;
  onDown: () => void;
  /** set a typed value (already clamped to [0, max]) */
  onSet: (n: number) => void;
  disabled?: boolean;
}) {
  // While the box is focused, show the raw typed digits; on blur snap back to the
  // padded value (so typing "9" reads "9", not a fighting controlled "09").
  const [editing, setEditing] = useState<string | null>(null);
  const shown = editing ?? value;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onUp}
        disabled={disabled}
        aria-label={`เพิ่ม${unit}`}
        className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-primary-600 disabled:opacity-50"
      >
        <ChevronUp className="h-6 w-6" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={shown}
        aria-label={unit}
        disabled={disabled}
        onFocus={(e) => { setEditing(value); e.currentTarget.select(); }}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "").slice(0, 2);
          setEditing(d);
          if (d !== "") onSet(Math.min(parseInt(d, 10) || 0, max));
        }}
        onBlur={() => setEditing(null)}
        className="w-16 rounded-lg border border-border bg-white py-2.5 text-center text-3xl font-bold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50 dark:bg-surface"
      />
      <button
        type="button"
        onClick={onDown}
        disabled={disabled}
        aria-label={`ลด${unit}`}
        className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-primary-600 disabled:opacity-50"
      >
        <ChevronDown className="h-6 w-6" />
      </button>
    </div>
  );
}

// ── grid time picker (owner 2026-07-15 · "ใช้ง่ายกว่านี้") ──
// กริดปุ่มใหญ่: ชั่วโมง 00–23 (เห็นครบ) + นาที 00–59 (เลื่อน · เด้งหาเลขที่เลือก).
// กด ชม. แล้ว กด นาที = จบ. ไม่มีวงกลม/สลับหน้า/เข็มให้งง.
function GridTimePicker({
  hour,
  minute,
  onPickHour,
  onPickMinute,
}: {
  hour: number;
  minute: number;
  onPickHour: (h: number) => void;
  onPickMinute: (m: number) => void;
}) {
  const selMinRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selMinRef.current?.scrollIntoView({ block: "nearest" });
  }, [minute]);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="w-72 select-none">
      <div className="mb-2 text-center text-3xl font-bold tabular-nums text-foreground">
        {pad(hour)}<span className="mx-0.5 text-muted">:</span>{pad(minute)}
        <span className="ml-1 text-sm font-normal text-muted">น.</span>
      </div>

      <p className="mb-1 text-xs font-semibold text-foreground">ชั่วโมง (24 ชม.)</p>
      <div className="grid grid-cols-6 gap-1">
        {hours.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onPickHour(h)}
            className={`h-9 rounded-lg text-sm tabular-nums transition-colors ${
              h === hour ? "bg-primary-500 font-bold text-white" : "bg-surface-alt/40 text-foreground hover:bg-surface-alt"
            }`}
          >
            {pad(h)}
          </button>
        ))}
      </div>

      <p className="mb-1 mt-3 text-xs font-semibold text-foreground">นาที</p>
      <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto pr-1">
        {minutes.map((m) => (
          <button
            key={m}
            ref={m === minute ? selMinRef : undefined}
            type="button"
            onClick={() => onPickMinute(m)}
            className={`h-8 rounded-lg text-[13px] tabular-nums transition-colors ${
              m === minute ? "bg-primary-500 font-bold text-white" : "bg-surface-alt/40 text-foreground hover:bg-surface-alt"
            }`}
          >
            {pad(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
