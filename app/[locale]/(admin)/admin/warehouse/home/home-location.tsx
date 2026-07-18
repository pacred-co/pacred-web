"use client";

/**
 * Home location (fPallet) control — the "location M1-2 / ยังไม่ระบุ" line the
 * legacy PCS warehouse home shows. The worker sets their current warehouse zone
 * here; it's stored in the SAME `set_fPallet` cookie (100-min TTL) the barcode
 * scan-in page (`/admin/barcode/driver/import`) reads — so setting it here
 * carries straight into scanning (owner: "ระบบยิงรับเข้ามาแล้ว มันก็เหมือนกัน").
 */

import { useEffect, useState } from "react";
import { MapPin, Pencil, Check } from "lucide-react";

// Same 46 hardcoded location codes as the scan-in page (legacy L192-199).
const LOCATION_CODES = [
  "A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3",
  "D1", "D2", "D3", "E1", "E2", "E3", "F1", "F2", "F3",
  "G1", "G2", "G3", "H1", "H2", "H3", "I1", "I2", "I3",
  "J1", "J2", "J3", "K1", "K2", "K3", "L2", "L3", "M1-1",
  "M1-2", "M1-3", "M2", "M3", "Z1", "Z2", "Z3", "Z4",
  "Z5", "Z6",
];

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

export function HomeLocation() {
  const [loc, setLoc] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const cached = readCookie(COOKIE_NAME);
    if (cached) queueMicrotask(() => setLoc(cached));
  }, []);

  function pick(v: string) {
    writeCookie(COOKIE_NAME, v, 100); // legacy 100-min TTL, shared with scan-in
    setLoc(v);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-[#cc3333]" strokeWidth={2} />
      <span className="text-gray-500">location</span>
      {editing ? (
        <select
          autoFocus
          value={loc}
          onChange={(e) => pick(e.target.value)}
          onBlur={() => setEditing(false)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 focus:border-[#cc3333] focus:outline-none"
        >
          <option value="">— เลือกโซน —</option>
          {LOCATION_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold active:bg-gray-100"
        >
          {loc ? (
            <span className="text-[#1f7a1f]">
              <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={2.5} />
              {loc}
            </span>
          ) : (
            <span className="text-gray-400">ยังไม่ระบุ</span>
          )}
          <Pencil className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
