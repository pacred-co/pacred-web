"use client";

/**
 * Countdown clock for a driver batch (endtime - now). Updates every second.
 * Renders a red "หมดเวลา" pill once the deadline passes.
 *
 * Faithful port of the legacy `<div class="counter">` block at
 * forwarder-driver.php line 1652.
 *
 * `size` (ปอน 2026-07-24):
 *   "sm" (default · เดสก์ท็อป) = pill กลมมี badge (กรอบ+พื้นหลัง) เหมือนเดิม.
 *   "lg" (หัวมือถือ) = ข้อความล้วน ไม่มี badge/กรอบ/พื้นหลัง · ตัวเวลาแดงเข้ม (#B30000).
 */

import { useEffect, useState } from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export function BatchCountdown({
  endTimeIso,
  /** batch fdstatus — '1' running (tick) · '2' สำเร็จ · '3' ไม่สำเร็จ (both freeze). */
  status = "1",
  size = "sm",
}: {
  endTimeIso: string;
  status?: string;
  size?: "sm" | "lg";
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  // The clock ticks ONLY while the run is still open. Once the batch is สำเร็จ ('2')
  // or ไม่สำเร็จ ('3') the job is done → freeze it, no live clock (ภูม 2026-07-10:
  // "สำเร็จแล้วก็ควรหยุดเวลาไปเลย"). Legacy stops its setInterval on a closed run too.
  const isOpen = status !== "2" && status !== "3";

  useEffect(() => {
    if (!isOpen) return; // closed run → don't start the interval
    const tgt = new Date(endTimeIso).getTime();
    function tick() {
      setRemainingMs(tgt - Date.now());
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endTimeIso, isOpen]);

  const isLg = size === "lg";
  const ic = isLg ? "h-6 w-6" : "h-3.5 w-3.5";
  // lg (หัวมือถือ · ปอน 2026-07-24) = ข้อความล้วน ไม่มีกรอบ/พื้นหลัง ตัวใหญ่
  // (text-2xl · พอดีกับปุ่ม "ดูใบส่งสินค้า" ข้างๆ) · sm = pill กลมเหมือนเดิม.
  const box = isLg ? "text-2xl" : "rounded-full border px-3 py-1 text-xs";

  // ── Closed run → a STATIC terminal label (frozen), never a live clock. ──
  if (status === "2") {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold ${box} ${
        isLg ? "text-emerald-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
      }`}>
        <CheckCircle2 className={ic} />
        จบงานแล้ว
      </span>
    );
  }
  if (status === "3") {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold ${box} ${
        isLg ? "text-rose-700" : "bg-rose-50 border-rose-200 text-rose-700"
      }`}>
        <AlertTriangle className={ic} />
        หมดเวลาแล้ว
      </span>
    );
  }

  if (remainingMs === null) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono ${box} ${
        isLg ? "text-[#B30000] font-bold" : "bg-amber-50 border-amber-200 text-amber-700"
      }`}>
        <Clock className={ic} />
        --:--:--
      </span>
    );
  }

  if (remainingMs <= 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold ${box} ${
        isLg ? "text-rose-700" : "bg-rose-50 border-rose-200 text-rose-700"
      }`}>
        <AlertTriangle className={ic} />
        หมดเวลาแล้ว
      </span>
    );
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const days     = Math.floor(totalSec / 86400);
  const hours    = Math.floor((totalSec % 86400) / 3600);
  const minutes  = Math.floor((totalSec % 3600) / 60);
  const seconds  = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  const isUrgent = remainingMs < 3_600_000;   // last hour

  // lg = แดงเข้ม #B30000 เสมอ (ข้อความล้วน) · sm = amber/rose ตาม urgent (pill).
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono font-bold ${box} ${
      isLg
        ? "text-[#B30000]"
        : isUrgent
          ? "bg-rose-50 border-rose-200 text-rose-700"
          : "bg-amber-50 border-amber-200 text-amber-700"
    }`}>
      <Clock className={ic} />
      {days > 0 && <>{days}d </>}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}
