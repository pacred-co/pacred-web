"use client";

/**
 * <PrintAllPicker> + <AutoPrintOnLoad> — make /admin/printAll a usable tool.
 *
 * พี่ป๊อป 2026-06-12 ("เอาแบบ PCS มาได้เลย"): legacy PCS's convenient flow is
 * SCAN a box → the label PDF opens to print immediately (gateway.php case
 * "from" → printAll/?print=1). Pacred lost that — scanning went to the
 * forwarder detail, and printAll was only reachable via รายงานตู้ (3 clicks).
 *
 * This island restores PCS's fast path IN the printAll page itself, so staff
 * never bounce to รายงานตู้:
 *   1. สแกน/พิมพ์เลขแทร็กกิ้ง (ทีละกล่อง) → routes through the barcode gateway
 *      (type=from), which resolves tracking → forwarder → /admin/printAll?fNo
 *      → the box label opens (PCS scan→print). Auto-focused for a USB scanner.
 *   2. เลขตู้ (พิมพ์ทั้งตู้) → /admin/printAll?cabinet=<c> → every box's label.
 *
 * No money / DB write — pure client navigation to the existing label render.
 */

import { useEffect, useRef, useState } from "react";
import { ScanLine, Boxes, Search } from "lucide-react";

export function PrintAllPicker({ compact = false }: { compact?: boolean }) {
  const [tracking, setTracking] = useState("");
  const [cabinet, setCabinet] = useState("");
  const trackingRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the scan field on mount (USB scanners "type" into the focused
  // input + emit Enter) — the legacy printAll/gateway scan-to-print habit.
  useEffect(() => {
    if (!compact) trackingRef.current?.focus();
  }, [compact]);

  function submitTracking(e: React.FormEvent) {
    e.preventDefault();
    const t = tracking.trim();
    if (!t) return;
    // Always resolve the scanned tracking via the gateway (type=from) — it
    // matches ftrackingchn → forwarder → printAll?fNo (with auto-print), and
    // handles the 0-match / many-match cases faithfully.
    window.location.href = `/admin/barcode/gateway?type=from&device=scanner&tracking=${encodeURIComponent(t)}`;
  }

  function submitCabinet(e: React.FormEvent) {
    e.preventDefault();
    const c = cabinet.trim();
    if (!c) return;
    window.location.href = `/admin/printAll?cabinet=${encodeURIComponent(c)}`;
  }

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-end gap-2"
          : "grid gap-3 sm:grid-cols-2"
      }
    >
      {/* 1 — scan a box's tracking → print its label (PCS scan→print) */}
      <form onSubmit={submitTracking} autoComplete="off" className="space-y-1.5">
        {!compact && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <ScanLine className="h-4 w-4 text-primary-600" aria-hidden />
            สแกน/พิมพ์เลขแทร็กกิ้ง — พิมพ์ป้ายทันที (ทีละกล่อง)
          </label>
        )}
        <div className="flex gap-2">
          <input
            ref={trackingRef}
            type="text"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="ยิงบาร์โค้ด / พิมพ์เลขแทร็กกิ้ง…"
            inputMode="text"
            className="min-h-[44px] flex-1 rounded-xl border-2 border-primary-300 bg-white px-3 py-2 text-base font-mono text-slate-900 placeholder:text-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 text-sm font-bold text-white transition-colors hover:bg-primary-700"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">พิมพ์ป้าย</span>
          </button>
        </div>
      </form>

      {/* 2 — cabinet → print every box label in the container */}
      <form onSubmit={submitCabinet} autoComplete="off" className="space-y-1.5">
        {!compact && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Boxes className="h-4 w-4 text-indigo-600" aria-hidden />
            เลขตู้ — พิมพ์ป้ายทั้งตู้
          </label>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={cabinet}
            onChange={(e) => setCabinet(e.target.value)}
            placeholder="เช่น GZS260529-1"
            className="min-h-[44px] flex-1 rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-base font-mono text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
          >
            <Boxes className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">ทั้งตู้</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * <AutoPrintOnLoad> — opens the browser print dialog once on mount. Rendered
 * only when printAll is reached with ?autoprint=1 (the scan→print fast path),
 * so a warehouse worker scans a box and the label is ready to print without a
 * second click. Fires once (guarded) after a short paint delay.
 */
export function AutoPrintOnLoad() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* print dialog blocked — staff can use the on-screen button */
      }
    }, 450);
    return () => clearTimeout(t);
  }, []);
  return null;
}
