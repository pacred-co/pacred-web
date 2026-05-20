"use client";

/**
 * <ImportScannerPanel>
 *
 * Faithful 1:1 port of the legacy `barcode-d-import.php` JS panel
 * (L80-256) — the warehouse-intake workstation scanner. Differs
 * from the simpler `<ScannerInput>` (used by `barcode-d-{all,
 * from,prepare}.php`) in that it ADDS:
 *
 *   1. A `fPallet` (LOCATION) input — sticky via `document.cookie`
 *      ("set_fPallet"). Required before any scan is accepted.
 *      Auto-set when the user types one of the 46 hardcoded
 *      location codes (`A1`..`Z6`) — verbatim from legacy L192-199.
 *   2. A "บันทึกเข้าโกดัง" result panel below the input — shows
 *      the loading ring (`.lds-ring`) while the scan resolves, then
 *      renders an HTML response from the gateway.
 *
 * The Pacred Wave 2 behaviour is to GET-redirect to Agent 3's
 * `/admin/barcode/gateway?type=4&device=scanner&tracking=…&
 * pallet=…` (matching the other 3 `barcode-d-*` siblings). The
 * legacy AJAX-fetch + `#result` HTML injection + audio playback is
 * Wave 3 follow-up — see the inline "Wave 3 TODO" markers.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

// Legacy L192-199 — the 46 hardcoded location codes that switch
// `fPallet` when scanned.
const LOCATION_CODES = [
  "A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3",
  "D1", "D2", "D3", "E1", "E2", "E3", "F1", "F2", "F3",
  "G1", "G2", "G3", "H1", "H2", "H3", "I1", "I2", "I3",
  "J1", "J2", "J3", "K1", "K2", "K3", "L2", "L3", "M1-1",
  "M1-2", "M1-3", "M2", "M3", "Z1", "Z2", "Z3", "Z4",
  "Z5", "Z6",
];
const LOCATION_SET = new Set(LOCATION_CODES);

const COOKIE_NAME = "set_fPallet";

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)"),
  );
  return m ? decodeURIComponent(m[1]) : "";
}

function writeCookie(name: string, value: string, minutes: number) {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + minutes * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/`;
}

export function ImportScannerPanel() {
  // fPallet — the sticky location code. Cookie-restored on mount.
  const [fPallet, setFPallet] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const cached = readCookie(COOKIE_NAME);
    // Defer setState to a microtask so the effect doesn't trigger a
    // synchronous re-render (react-hooks/set-state-in-effect lint).
    if (cached) queueMicrotask(() => setFPallet(cached));
    inputRef.current?.focus();
  }, []);

  function submit() {
    setError(null);
    const keysearch = search.trim();

    // Legacy L200-205 — if the scanned code is a LOCATION code,
    // store it as fPallet + cookie + reset the input. Don't fire
    // the AJAX scan.
    if (LOCATION_SET.has(keysearch)) {
      writeCookie(COOKIE_NAME, keysearch, 100); // legacy "100 * 60 * 1000ms" = 100 min
      setFPallet(keysearch);
      setSearch("");
      inputRef.current?.focus();
      // Wave 3 TODO — legacy plays /assets/audio/sSave.mp4 here.
      return;
    }

    // Legacy L235-251 — validate fPallet + keysearch before submit.
    if (!fPallet) {
      setError("กรุณากรอก location!!!");
      return;
    }
    if (!keysearch) {
      setError("กรุณากรอกข้อมูล!!!");
      return;
    }

    // Wave 2 behaviour — GET-redirect through Agent 3's gateway.
    // Legacy L211-234 instead AJAX-POSTs to /pcs-admin/include/
    // pages/barcode-import/index.php with {keysearch, keyType=1,
    // fiPallet} and renders the JSON {HTML, statusData, statusSave}
    // result inline (Wave 3 follow-up).
    const qs = new URLSearchParams({
      type: "4",
      device: "scanner",
      tracking: keysearch,
      pallet: fPallet,
    });
    window.location.href = `/admin/barcode/gateway?${qs.toString()}`;
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    // Legacy L179-184 — Enter (13) OR IME composition end (229) =
    // submit.
    if (e.key === "Enter" || e.keyCode === 13 || e.keyCode === 229) {
      submit();
    }
  }

  return (
    <div className="row">
      {/* Top bar — barcode-d-import.php L84-104 */}
      <div className="col-md-6 offset-md-3 filtered-list-search barcode pl-2 pr-2">
        <div
          className="my-lg-0 justify-content-center im"
          id="form"
        >
          <div className="row">
            <div className="col-12 pb-1">
              <Link
                href="/admin/forwarder-import-warehouse"
                className=""
              >
                <span className="badge badge-info badge-pill">
                  ไปยังประวัติรายการเข้าโกดัง
                </span>
              </Link>
            </div>
            <div className="col-7">
              <div className="input-group mb-2">
                <span
                  className="badge badge-success badge-pill cursor-pointer"
                  data-toggle="modal"
                  data-target="#recom"
                >
                  คำอธิบายระบบ
                </span>
              </div>
            </div>
            <div className="col-5">
              <div className="input-group mb-2">
                <div className="w-100">
                  location :{" "}
                  <span className="result-fPallet">
                    {fPallet || "ยังไม่ระบุ"}
                  </span>
                  <input
                    type="hidden"
                    name="fPallet"
                    id="fPallet"
                    value={fPallet}
                    readOnly
                    className="w-100 form-control2 product-search br-30"
                    style={{ padding: "5px 16px" }}
                    placeholder="location"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Scan input — L105-110 */}
          <div className="input-group">
            <div className="w-100">
              <input
                ref={inputRef}
                type="text"
                id="search-tracking"
                name="tracking"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyUp={onKeyUp}
                autoComplete="off"
                className="w-100 form-control product-search br-30"
                placeholder="ค้นหาหมายเลข Tracking..."
              />
              <button
                className="btn btn-main r0"
                id="send"
                type="button"
                onClick={submit}
              >
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

          {error && (
            <p
              className="text-danger pt-2"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Result panel — L113-121. Wave 3 TODO: the gateway should
          target this panel via AJAX (legacy `#result` + audio +
          `lds-ring`) instead of redirecting away. For Wave 2 the
          panel renders a placeholder. */}
      <div className="pt-2 col-md-6 offset-md-3">
        <div className="resultPCS">
          <div
            className="text-center"
            style={{ display: "none" }}
          >
            <div className="lds-ring">
              <div></div>
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>
          <div id="result"></div>
          <div className="music"></div>
        </div>
      </div>
    </div>
  );
}
