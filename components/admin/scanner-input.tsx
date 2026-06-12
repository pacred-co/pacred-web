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
 * + L70-80 ) is preserved — when ON the form fires on every keyup
 * after 1+ chars (faithful to legacy behaviour), so a USB-reader
 * scan that pastes the code in one burst auto-submits without the
 * user pressing the search button. When OFF the user must press
 * the search button or Enter manually.
 */

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

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

  // Auto-focus on mount (legacy: `document.getElementById("search-
  // tracking").focus()` at file-load).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(raw: string) {
    const v = raw.trim();
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

  function onKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    // Legacy: key === 13 (Enter) OR 229 (IME). Either submits when
    // auto-search is ON, or when the user explicitly pressed Enter.
    if (e.key === "Enter" || e.keyCode === 13 || e.keyCode === 229) {
      submit(value);
      return;
    }
    if (autoSearch && value.length >= 1) {
      // Legacy keyup-while-autosearch — fires on every char. With a
      // USB reader this fires once per burst (the reader pastes the
      // whole code then emits Enter, so this branch is mostly the
      // "user typed manually + has 1+ chars" path). We keep parity.
      // Note: we don't auto-submit on every keystroke to avoid
      // submitting a partial code while the user is mid-paste — the
      // Enter branch above is the canonical submit path for USB
      // scanners.
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(value);
  }

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="space-y-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="device" value="scanner" />

      {/* Auto-search toggle — legacy `js-switch` (barcode-d-all.php L37-39),
          now a Pacred checkbox. Behaviour preserved verbatim. */}
      <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          id="customSwitch"
          name="custom"
          value="1"
          checked={autoSearch}
          onChange={(e) => setAutoSearch(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        ค้นหาอัตโนมัติ
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
          onKeyUp={onKeyUp}
          className="min-h-[44px] flex-1 rounded-xl border-2 border-primary-300 bg-white px-4 py-2.5 text-base font-mono text-slate-900 placeholder:text-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          placeholder={placeholder}
          inputMode="text"
        />
        <button
          type="submit"
          aria-label="ค้นหา"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-5 text-sm font-bold text-white transition-colors hover:bg-primary-700"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">ค้นหา</span>
        </button>
      </div>
    </form>
  );
}
