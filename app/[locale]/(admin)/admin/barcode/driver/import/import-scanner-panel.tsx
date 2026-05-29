"use client";

/**
 * <ImportScannerPanel> — Wave 29 #213 (rewritten from Wave 17 P1-7)
 *
 * Faithful-port of `barcode-d-import.php` L80-256 with the legacy AJAX write
 * wired to `adminBarcodeImportScan` (the server action that ports
 * `include/pages/barcode-import/index.php`).
 *
 * **Workflow stolen from legacy · UI = Pacred Tailwind mobile-first design**
 * per AGENTS.md §0a + §6. Warehouse staff use this DAILY on mobile — every
 * tap target ≥ 44px, text ≥ 16px, scanner input thumb-reachable, sticky
 * pallet card prominently visible.
 *
 * Behaviour preserved from legacy (unchanged from Wave 17):
 *   1. fPallet (location) input — sticky via cookie `set_fPallet` (100-min TTL,
 *      exactly matches legacy 100*60*1000ms).
 *   2. Auto-set fPallet when the scanned code matches one of the 46 hardcoded
 *      LOCATION_CODES — input clears + plays sSave sound + cookie refreshes.
 *      Does NOT fire the writer.
 *   3. Validation: fPallet required first, then keysearch required (legacy
 *      SweetAlert prompts → inline `setError`).
 *   4. On scan submit: call server action; render the result panel
 *      (green/orange/red Tailwind card) inside the result area; play
 *      sSave (matched) or notFoundSave (orphan-saved) sound; clear input +
 *      refocus so the operator can keep scanning.
 *
 * Wave 29 #213 changes (UI only, zero workflow change):
 *   - Removed all Bootstrap-4 markup (col-md-* · badge badge-pill · form-control
 *     br-30 · btn btn-main r0 · feather-search SVG · lds-ring 4-div spinner)
 *   - Replaced with mobile-first Tailwind: stacked layout · `max-w-md mx-auto`
 *   - Prominent sticky pallet card (green pill when set · amber alert when not)
 *   - Large scanner input (h-14 · text-lg · rounded-2xl) with brand-red focus
 *   - 56px primary submit button with lucide-react <Search /> icon
 *   - lucide-react <Loader2 /> spinner replaces 4-div lds-ring
 *   - History link + help modal trigger styled as clean pill chips
 *   - Inline help-modal trigger button now properly accessible
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { Search, Loader2, MapPin, Info, History, AlertTriangle } from "lucide-react";
import {
  adminBarcodeImportScan,
  type BarcodeImportScanOk,
} from "@/actions/admin/barcode-import";
import { PacredDialog } from "@/components/ui/pacred-dialog";
import { fstatusBadge } from "@/lib/admin/forwarder-status";

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

// Audio paths — files exist at the legacy bundle location.
// `audio/mpeg` per legacy `<source type="audio/mpeg">`.
const SOUND_SUCCESS = "/legacy/pcs/assets/audio/sSave.mp4";
const SOUND_NOT_FOUND = "/legacy/pcs/assets/audio/notFoundSave.mp4";

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

/**
 * Result card — Tailwind, three colour variants driven by server's
 * cardColor + count overflow detection. Mirrors legacy L190-216 in
 * INFORMATION shown (header msg / tracking / IDCO / fid link / count
 * badge / cabinet link / location / status / userid link / datetime)
 * but with Pacred chrome (rounded-xl borders, no Bootstrap rows).
 */
function ResultCard({ data }: { data: BarcodeImportScanOk }) {
  const overCount = data.countTotal > 0 && data.countScanned > data.countTotal;
  // Override server's "green" to "orange" when over-count (legacy used
  // bg-success-2 border but added bg-danger to the count badge — we
  // promote the whole card to orange so the operator clearly sees the
  // overshoot).
  const color: "green" | "orange" | "red" =
    overCount && data.cardColor === "green" ? "orange" : data.cardColor;

  const colorClasses: Record<typeof color, string> = {
    green: "border-emerald-300 bg-emerald-50 text-emerald-900",
    orange: "border-amber-300 bg-amber-50 text-amber-900",
    red: "border-red-300 bg-red-50 text-red-900",
  };

  const badgeClasses = overCount
    ? "bg-red-600 text-white"
    : "bg-slate-100 text-slate-800";

  return (
    <div
      className={`rounded-xl border-2 ${colorClasses[color]} p-4 text-sm`}
      role="status"
      aria-live="polite"
    >
      <div className="text-center font-semibold text-base">
        คำค้นหา : {data.fTrackingCHN ?? data.fIDorCO ?? "-"}
      </div>
      <div className="text-center font-semibold mt-1">{data.message}</div>

      {data.fTrackingCHN && (
        <div className="mt-3 font-semibold">
          เลขแทรคกิ้ง : <span className="font-mono">{data.fTrackingCHN}</span>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          ID CO : <span className="font-mono">{data.fIDorCO ?? "-"}</span>
        </div>
        <div>
          เลขออเดอร์ :{" "}
          {data.fid !== null ? (
            <Link
              href={`/admin/forwarders/${data.fid}`}
              target="_blank"
              className="text-primary-600 hover:underline font-semibold"
            >
              #{data.fid}
            </Link>
          ) : (
            "-"
          )}
        </div>
        <div>
          <span
            className={`inline-block px-2 py-0.5 rounded ${badgeClasses}`}
          >
            จำนวน : {data.countScanned}/{data.countTotal}
          </span>
        </div>
        <div>
          เลขตู้ :{" "}
          {data.fCabinetNumber ? (
            <Link
              href={`/admin/report-cnt/${data.fCabinetNumber}`}
              target="_blank"
              className="text-primary-600 hover:underline"
            >
              {data.fCabinetNumber}
            </Link>
          ) : (
            "-"
          )}
        </div>
        <div>
          location : <span className="font-semibold">{data.pallet}</span>
        </div>
        <div>
          สถานะ :{" "}
          {data.statusFlipped ? (
            // Wave 28 (2026-05-29 · audit fix): use canonical fstatusBadge from
            // lib/admin/forwarder-status so the result pill matches the color
            // staff trained on PCS (legacy statusForwarderBadge palette). Plain
            // text was missing the visual state cue.
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${fstatusBadge("4").chip}`}>
              ถึงไทยแล้ว (4)
            </span>
          ) : (
            <span className="font-semibold text-emerald-700">บันทึกแล้ว</span>
          )}
        </div>
        {data.userId && (
          <div>
            รหัส :{" "}
            <Link
              href={`/admin/customers/${encodeURIComponent(data.userId)}`}
              target="_blank"
              className="text-primary-600 hover:underline"
            >
              {data.userId}
            </Link>
          </div>
        )}
        <div className="col-span-2 text-xs text-slate-600">
          วันที่บันทึก : {new Date(data.dateSave).toLocaleString("th-TH")}
        </div>
      </div>

      {data.productName && (
        <div className="mt-3 text-xs text-slate-700 line-clamp-2">
          <span className="font-semibold">สินค้า : </span>
          {data.productName}
        </div>
      )}

      {overCount && (
        <div className="mt-3 text-xs font-semibold text-red-700">
          เพิ่มเกินจำนวน ({data.countScanned - data.countTotal} เกิน)
        </div>
      )}
    </div>
  );
}

export function ImportScannerPanel() {
  // fPallet — the sticky location code. Cookie-restored on mount.
  const [fPallet, setFPallet] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeImportScanOk | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recomDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const cached = readCookie(COOKIE_NAME);
    // Defer setState to a microtask so the effect doesn't trigger a
    // synchronous re-render (react-hooks/set-state-in-effect lint).
    if (cached) queueMicrotask(() => setFPallet(cached));
    inputRef.current?.focus();
  }, []);

  // Play one of the two sounds. The audio element is mounted once;
  // we swap .src + .play() per call. Legacy did `<audio autoplay>`
  // inside a <div class="music"> with `controls style="display:none"`.
  function playSound(src: string) {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.src = src;
      void el.play().catch(() => {
        // Browsers throw on autoplay-without-user-gesture; ignore
        // (the first scan already counts as a gesture).
      });
    } catch {
      // ignore
    }
  }

  function focusInput() {
    // Use a microtask so React commits the empty value before we focus.
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function submit() {
    setError(null);
    const keysearch = search.trim();

    // Legacy L200-205 — if the scanned code is a LOCATION code,
    // store it as fPallet + cookie + reset the input. Don't fire
    // the writer.
    if (LOCATION_SET.has(keysearch)) {
      writeCookie(COOKIE_NAME, keysearch, 100); // legacy "100 * 60 * 1000ms" = 100 min
      setFPallet(keysearch);
      setSearch("");
      playSound(SOUND_SUCCESS); // legacy L205
      focusInput();
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

    // Wave 17 P1-7 — call the server action (replaces the legacy gateway
    // GET-redirect). The action does the actual UPSERT + auto-flip.
    startTransition(async () => {
      const res = await adminBarcodeImportScan({
        keysearch,
        keyType: 1,
        fPallet,
      });

      if (!res.ok) {
        setError(res.error);
        setResult(null);
        playSound(SOUND_NOT_FOUND);
        return;
      }
      if (!res.data) {
        // Shouldn't happen — server action always populates data on ok.
        setError("ไม่ได้รับข้อมูลตอบกลับจากเซิร์ฟเวอร์");
        setResult(null);
        playSound(SOUND_NOT_FOUND);
        return;
      }

      const data = res.data;
      setResult(data);

      // Sound selection — mirror legacy L226-230:
      //   statusData=2 && statusSave=1  → notFoundSave (orphan saved)
      //   else                           → sSave        (matched + saved)
      if (!data.matched) {
        playSound(SOUND_NOT_FOUND);
      } else {
        playSound(SOUND_SUCCESS);
      }

      // Clear input + refocus so the operator can keep scanning.
      setSearch("");
      focusInput();
    });
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    // Legacy L179-184 — Enter (13) OR IME composition end (229) = submit.
    if (e.key === "Enter" || e.keyCode === 13 || e.keyCode === 229) {
      submit();
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Quick-action chips: history link + help modal trigger.
          min-h-[44px] guarantees finger-tap target per AGENTS.md §6. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/admin/forwarder-import-warehouse"
          className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100 active:bg-sky-200 px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px]"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          ประวัติการเข้าโกดัง
        </Link>
        <button
          type="button"
          onClick={() => recomDialogRef.current?.showModal()}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px]"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          คำอธิบายระบบ
        </button>
      </div>

      {/* Sticky pallet card — prominent at all times */}
      {fPallet ? (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                LOCATION
              </div>
              <div className="text-lg font-bold text-emerald-900 truncate">
                {fPallet}
              </div>
            </div>
          </div>
          <div className="text-xs text-emerald-700 text-right">
            ยิง location ใหม่
            <br />
            เพื่อเปลี่ยน
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-amber-900">
              กรุณาตั้ง location ก่อนสแกน
            </div>
            <div className="mt-0.5 text-xs text-amber-800">
              ยิงรหัสตำแหน่ง เช่น A1, B2, M1-1 ลงในช่องด้านล่าง
            </div>
          </div>
        </div>
      )}

      {/* Scanner input + submit button */}
      <div className="flex items-stretch gap-2">
        <input
          ref={inputRef}
          type="text"
          id="search-tracking"
          name="tracking"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyUp={onKeyUp}
          autoComplete="off"
          disabled={isPending}
          inputMode="text"
          className="flex-1 h-14 px-4 text-lg rounded-2xl border-2 border-slate-300 bg-white focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none disabled:bg-slate-50 disabled:cursor-not-allowed placeholder:text-slate-400"
          placeholder="ค้นหาหมายเลข Tracking..."
          aria-label="หมายเลข Tracking หรือรหัส location"
        />
        <button
          type="button"
          id="send"
          disabled={isPending}
          onClick={submit}
          aria-label="บันทึก"
          className="h-14 w-14 shrink-0 flex items-center justify-center rounded-2xl bg-primary-600 hover:bg-primary-700 active:scale-95 text-white shadow-lg transition disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <Search className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {/* Inline error banner (red) — legacy L243-245 + L248 SweetAlert errors */}
      {error && (
        <div
          className="rounded-xl border-2 border-red-300 bg-red-50 text-red-900 p-4 text-sm"
          role="alert"
        >
          <div className="text-center font-semibold">ผิดพลาด</div>
          <div className="text-center mt-1">{error}</div>
        </div>
      )}

      {/* Loading spinner — Pacred Loader2 replaces legacy lds-ring 4-div */}
      {isPending && (
        <div className="flex justify-center py-6">
          <Loader2
            className="h-12 w-12 animate-spin text-primary-600"
            aria-label="กำลังบันทึก"
          />
        </div>
      )}

      {/* Result card (already Pacred Tailwind ✅ from Wave 17) */}
      {!isPending && result && <ResultCard data={result} />}

      {/* Hidden audio element — swapped src per call. Legacy used an inline
          <audio autoplay> rebuilt every scan; we keep one instance + change
          .src so we don't pile DOM nodes. */}
      <audio
        ref={audioRef}
        preload="none"
        className="hidden"
        aria-hidden="true"
      />

      {/* "คำอธิบายระบบ" native <dialog> via PacredDialog. Help content
          unchanged from barcode-d-import.php L135-161 (the 8-rule guide).
          Wave 29 #213: nested <ol> uses Tailwind list-decimal/list-[lower-alpha]
          + space-y for clean typography (replaces legacy CSS counter-reset). */}
      <PacredDialog
        dialogRef={recomDialogRef}
        title="การใช้งานระบบบันทึกรายการเข้าโกดัง"
        size="lg"
      >
        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
          <li>
            ต้องระบุ location เริ่มต้นก่อนทำรายการ
            ครั้งต่อ ๆ ไประบบจะจำค่าล่าสุดที่เคยใช้ไว้
          </li>
          <li>
            หากต้องการเปลี่ยน location ให้ยิงรายการใหม่
            ระบบจะอ่านค่าอัตโนมัติโดยดูจากข้อมูลที่กรอกไปในช่องค้นหา
            หากข้อมูลอยู่ระหว่าง A1, A2, A3, B1, B2, B3, C1, C2, C3, D1, D2,
            D3, E1, E2, E3, F1, F2, F3, G1, G2, G3, H1, H2, H3, I1, I2, I3,
            J1, J2, J3, K1, K2, K3, L2, L3, M1-1, M1-2, M1-3, M2, M3, Z1, Z2,
            Z3, Z4, Z5 and Z6 ระบบจะมองว่าเป็น location
          </li>
          <li>
            ระบบจะเปลี่ยนสถานะรายการถึงไทยแล้ว
            เมื่อจำนวนกล่องที่ยิงมากกว่าหรือเท่ากับจำนวนกล่องจริงในระบบ
          </li>
          <li>
            กรณีระบบขึ้นกรอบสีเขียว
            มาหลังจากการยิงแสดงว่าระบบบันทึกสำเร็จและทำการเชื่อมโยงออเดอร์นำเข้าได้
          </li>
          <li>
            กรณีระบบขึ้นเป็นสีส้ม และมีเสียงแจ้งไม่พบรายการ บันทึกสำเร็จ
            นั่นแสดงว่า เจ้าหน้าที่ฝ่ายที่อยู่หน้าประวัติสินค้าเข้าโกดังจะต้องทำการเชื่อมรายการนั้น
            โดยจะอธิบายในหน้าดังกล่าวอีกครั้ง
          </li>
          <li>
            การค้นหารายการระบบจะรับค่ามาจากช่องค้นหา
            แล้วแบ่งการทำงานเป็นลำดับดังนี้
            <ol className="list-[lower-alpha] pl-5 mt-2 space-y-1">
              <li>
                ค้นหารายการที่ตรงกันด้วยเลข ID CO หรือ เลขแทรคกิ้ง
                โดยที่สถานะจะต้องน้อยกว่ารอชำระเงินลงมา
                ข้อมูลที่เจอมากกว่า 1 รายการ ระบบจะใช้ รายการจากระบบ
                รายการจากแอดมินและรายการจากลูกค้าตามลำดับ
              </li>
              <li>
                หากไม่เจอข้างต้น จะทำการ ตัดข้อมูลตัวอักษรนำหน้า 2 ตัวออกแล้วเทียบรายการ
                แต่ในกรณีที่เลขเป็น SF1234 SF1234-001 SF1234-002 ระบบจะมองว่ารายการเป็นของ
                SF1234 หากผิดพลาดให้แก้ไขในหน้าประวัติเข้าโกดังไทย
              </li>
            </ol>
          </li>
          <li>หากต้องการลบประวัติการยิงเข้าให้ไปที่หน้าประวัติเข้าโกดังไทย</li>
          <li>
            หากยิงไม่เข้าให้ตรวจสอบว่ารายการนั้นมี เลขแทรคนี้มากกว่า 2 รายการหรือไม่
          </li>
        </ol>
        <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => recomDialogRef.current?.close()}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            เข้าใจแล้ว
          </button>
        </div>
      </PacredDialog>
    </div>
  );
}
