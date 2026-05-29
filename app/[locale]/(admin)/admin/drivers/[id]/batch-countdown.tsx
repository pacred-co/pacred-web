"use client";

/**
 * Countdown clock for a driver batch (endtime - now). Updates every second.
 * Renders a red "หมดเวลา" pill once the deadline passes.
 *
 * Faithful port of the legacy `<div class="counter">` block at
 * forwarder-driver.php line 1652.
 */

import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

export function BatchCountdown({ endTimeIso }: { endTimeIso: string }) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const tgt = new Date(endTimeIso).getTime();
    function tick() {
      setRemainingMs(tgt - Date.now());
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endTimeIso]);

  if (remainingMs === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 text-xs font-mono">
        <Clock className="h-3.5 w-3.5" />
        --:--:--
      </span>
    );
  }

  if (remainingMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1 text-xs font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" />
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

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${
      isUrgent
        ? "bg-rose-50 border-rose-200 text-rose-700"
        : "bg-amber-50 border-amber-200 text-amber-700"
    }`}>
      <Clock className="h-3.5 w-3.5" />
      {days > 0 && <>{days}d </>}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}
