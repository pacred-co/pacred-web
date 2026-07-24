"use client";

/**
 * <ScannerInput>
 *
 * Shared client component for the 4 driver-side barcode pages — the
 * faithful 1:1 port of the legacy `barcode-d-*.php` scanner forms
 * (`barcode-d-all.php` · `-from.php` · `-import.php` · `-prepare.php`).
 *
 * These pages are NOT camera scanners — they're USB **handheld
 * scanner** forms. A barcode reader plugged into a workstation
 * "types" the scanned code into the focused input + emits Enter
 * (`\r`); the legacy `.php` listens for `keyup → key === 13` (or
 * `229` IME) and submits a GET to `/pcs-admin/gateway.php?type=…
 * &device=scanner&tracking=…`.
 *
 * Pacred parity — same auto-focus, same auto-submit on Enter, same
 * GET redirect to `/admin/barcode/gateway` (Agent 3's route). No
 * `<video>`, no MediaDevices, no `BarcodeDetector` — those live in
 * the camera-mode `<ScanForm>` in `app/[locale]/(admin)/admin/
 * barcode/scan-form.tsx` which the existing `/admin/barcode` and
 * `/admin/barcode/driver` pages use.
 *
 * Legacy `keyCode` notes (carried verbatim from `barcode-d-import.
 * php` L179-184):
 *   - `13` — Enter (USB reader auto-emits after each scan)
 *   - `229` — IME composition end (some Thai/CJK keyboards emit
 *             this in place of 13). Legacy treats both as "submit".
 *
 * Auto-search toggle (the `js-switch` in `barcode-d-all.php` L37-39
 * + L70-80 ). Legacy fired `form.submit()` on EVERY keyup with ≥1
 * char — which is a bug: a USB scanner pastes "60527103087" char by
 * char, and the first keyup ("6") submits before the rest arrives
 * (ภูม 2026-06-16: a scan navigated with tracking="6"). We keep the
 * toggle's INTENT (scan → auto-search, no button press) but implement
 * it correctly with **burst detection**: a HID scanner emits keys
 * <~15ms apart — a speed no human sustains — so we only auto-submit
 * when the recent keys arrived in a tight machine-speed burst AND the
 * input then goes idle (= the scan finished). This covers scanners
 * configured WITHOUT an Enter/CR suffix, without ever submitting a
 * partial code from manual typing. Enter (13) stays the primary,
 * immediate submit path for the common CR-suffix scanners.
 */

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

// A HID barcode reader fires keystrokes this fast (ms between keys). A human
// typing char-by-char never sustains it → the gap tells "scanner" from "person".
const SCANNER_MAX_GAP_MS = 30;
// How many consecutive machine-speed keys before we trust it's a real scan.
const SCANNER_MIN_FAST_KEYS = 4;
// Idle time after the last key that marks "the burst finished" → auto-submit.
const BURST_END_MS = 80;

type ScannerType = "all" | "from" | "4" | "6";

export function ScannerInput({
  type,
  placeholder = "ค้นหาหมายเลข Tracking...",
}: {
  type: ScannerType;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [autoSearch, setAutoSearch] = useState(true);
  const [value, setValue] = useState("");

  // Burst-detection state (refs, not state — these must not trigger re-renders
  // and must hold the latest value synchronously during a fast scan burst).
  const lastKeyAt   = useRef(0);   // timestamp of the previous keydown
  const fastKeys    = useRef(0);   // consecutive machine-speed keys so far
  const burstTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // autoSearch can change between renders; read the live value inside the
  // timeout via a ref so a toggle mid-scan is honoured. (Synced in an effect —
  // assigning a ref during render is disallowed.)
  const autoSearchRef = useRef(autoSearch);
  useEffect(() => {
    autoSearchRef.current = autoSearch;
  }, [autoSearch]);

  function clearBurst() {
    if (burstTimer.current) {
      clearTimeout(burstTimer.current);
      burstTimer.current = null;
    }
  }

  // Auto-focus on mount (legacy: `document.getElementById("search-
  // tracking").focus()` at file-load) + clear any pending burst timer on unmount.
  useEffect(() => {
    inputRef.current?.focus();
    return () => clearBurst();
  }, []);

  function submit(raw?: string) {
    // Read the LIVE DOM value (a fast USB scanner fills the <input> before
    // React commits `value` state, so the ref is the authoritative latest).
    const v = (raw ?? inputRef.current?.value ?? value).trim();
    if (!v) return;
    // Legacy GET → /pcs-admin/gateway.php?type=<t>&device=scanner&
    //                                   tracking=<v>
    // Pacred port → /admin/barcode/gateway?type=<t>&device=scanner
    //                                       &tracking=<v>
    const qs = new URLSearchParams({
      type,
      device: "scanner",
      tracking: v,
    });
    window.location.href = `/admin/barcode/gateway?${qs.toString()}`;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Time the gap between keys to tell a machine burst from human typing.
    // (Ignore modifier/navigation keys — only count keys that add a char.)
    if (e.key.length !== 1) return;
    const now = Date.now();
    const gap = now - lastKeyAt.current;
    lastKeyAt.current = now;
    // First key has a huge gap (idle before) → resets the counter, then the
    // rest of a real scan burst arrives <30ms apart and builds it up.
    if (gap > 0 && gap < SCANNER_MAX_GAP_MS) fastKeys.current += 1;
    else fastKeys.current = 0;
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return; // never submit mid IME-composition

    // Primary path — a real Enter (the USB scanner's CR terminator, the most
    // common config). Fires immediately.
    // ⚠️ Do NOT submit on keyCode 229 — see import-scanner-panel.tsx for the
    // full bug story (ภูม 2026-06-16: scanning "60527103087" navigated with
    // tracking="6"). 229 = "key handled by IME"; on Windows Chrome + Thai
    // layout + a fast HID scanner an intermediate char key-up reports 229,
    // firing submit mid-scan → the GET redirect ran with just the first digit.
    if (e.key === "Enter" || e.keyCode === 13) {
      clearBurst();
      fastKeys.current = 0;
      submit();
      return;
    }

    // Auto-search path (the "ค้นหาอัตโนมัติ" toggle) — for scanners that DON'T
    // append an Enter. Re-arm an end-of-burst timer on every key; when the
    // input goes idle for BURST_END_MS, submit ONLY if the recent keys came in
    // a tight machine-speed burst (fastKeys ≥ threshold = a real scanner, never
    // a human). This keeps the toggle's intent while avoiding the legacy
    // partial-submit bug.
    if (!autoSearchRef.current) return;
    clearBurst();
    burstTimer.current = setTimeout(() => {
      burstTimer.current = null;
      if (fastKeys.current >= SCANNER_MIN_FAST_KEYS) {
        fastKeys.current = 0;
        submit();
      }
    }, BURST_END_MS);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="space-y-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="device" value="scanner" />

      {/* Auto-search toggle — legacy `js-switch` (barcode-d-all.php L37-39).
          ON = a scanner burst auto-searches when it finishes (no Enter needed);
          OFF = search only via Enter or the button. Burst detection lives in
          onKeyDown/onKeyUp. */}
      {/* ป้ายบรรทัดเดียว (ปอน 2026-07-24) — ตัดคำอธิบายยาว "แม้เครื่องไม่เคาะ Enter"
          ออก (ยังอธิบายไว้ที่ docstring/หัวข้อหน้า) + whitespace-nowrap กันตกบรรทัด
          บนการ์ดมือถือแคบ. */}
      <label className="inline-flex cursor-pointer select-none items-center gap-2 whitespace-nowrap text-sm text-slate-600">
        <input
          type="checkbox"
          id="customSwitch"
          name="custom"
          value="1"
          checked={autoSearch}
          onChange={(e) => setAutoSearch(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        ค้นหาอัตโนมัติ · ยิงเสร็จค้นหาเอง
      </label>

      {/* USB-handheld-scanner input — big, auto-focused, mono. USB scanners
          paste the code + emit Enter (handled in onKeyUp). */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          id="search-tracking"
          name="tracking"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          className="min-h-[44px] min-w-0 flex-1 rounded-full border-2 border-primary-300 bg-white px-5 py-2.5 text-base font-mono text-slate-900 placeholder:text-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          placeholder={placeholder}
          inputMode="text"
        />
        <button
          type="submit"
          aria-label="ค้นหา"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary-600 px-5 text-sm font-bold text-white transition-colors hover:bg-primary-700"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">ค้นหา</span>
        </button>
      </div>
    </form>
  );
}
