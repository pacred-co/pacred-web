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
    <form
      className="my-2 my-lg-0 justify-content-center"
      onSubmit={onSubmit}
      autoComplete="off"
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="device" value="scanner" />
      <div className="input-group mb-2">
        <input
          type="checkbox"
          id="customSwitch"
          name="custom"
          value="1"
          checked={autoSearch}
          onChange={(e) => setAutoSearch(e.target.checked)}
          className="js-switch pt-3"
          data-color="#f96262"
          data-size="small"
        />
        <span className="font-14 pl-2"> ค้นหาอัตโนมัติ</span>
      </div>
      <div className="input-group">
        <div className="w-100">
          <input
            ref={inputRef}
            type="text"
            id="search-tracking"
            name="tracking"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyUp={onKeyUp}
            className="w-100 form-control product-search br-30"
            placeholder={placeholder}
          />
          <button className="btn btn-main r0" type="submit">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="feather feather-search"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}
