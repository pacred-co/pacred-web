"use client";

/**
 * <CargoImportScanner> — Wave 17 P1-7 client wrapper for the camera-mode
 * cargo/import page.
 *
 * Wraps <CameraScanner> with an `onDetected` callback that calls the
 * `adminBarcodeImportScan` Server Action directly (instead of bouncing
 * to /admin/barcode/gateway). Shares the same result-card visual /
 * sound feedback as the USB-scanner sibling at
 * `app/[locale]/(admin)/admin/barcode/driver/import/import-scanner-panel.tsx`.
 *
 * The camera page has no `fPallet` input (mobile UX simplification),
 * so we read fPallet from the same cookie used by the driver page
 * (set_fPallet) — if absent, default to "MOBILE" so the orphan-scan
 * path still works. Operators set the pallet on the desk first via
 * the USB scanner, then carry the phone to scan parcels.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CameraScanner } from "@/components/admin/camera-scanner";
import { Link } from "@/i18n/navigation";
import {
  adminBarcodeImportScan,
  type BarcodeImportScanOk,
} from "@/actions/admin/barcode-import";

const COOKIE_NAME = "set_fPallet";
const SOUND_SUCCESS = "/legacy/pcs/assets/audio/sSave.mp4";
const SOUND_NOT_FOUND = "/legacy/pcs/assets/audio/notFoundSave.mp4";

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)"),
  );
  return m ? decodeURIComponent(m[1]) : "";
}

function ResultCard({ data }: { data: BarcodeImportScanOk }) {
  const overCount = data.countTotal > 0 && data.countScanned > data.countTotal;
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
        {data.fTrackingCHN ?? data.fIDorCO ?? "-"}
      </div>
      <div className="text-center font-semibold mt-1">{data.message}</div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
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
          location : <span className="font-semibold">{data.pallet}</span>
        </div>
        <div>
          สถานะ :{" "}
          <span className="font-semibold">
            {data.statusFlipped ? "ถึงโกดังไทย (4)" : "บันทึกแล้ว"}
          </span>
        </div>
      </div>

      {overCount && (
        <div className="mt-3 text-xs font-semibold text-red-700">
          เพิ่มเกินจำนวน ({data.countScanned - data.countTotal} เกิน)
        </div>
      )}
    </div>
  );
}

export function CargoImportScanner() {
  const [fPallet, setFPallet] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeImportScanOk | null>(null);
  const [isPending, startTransition] = useTransition();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Keep fPallet up-to-date in a ref so the onDetected callback (which is
  // a stable identity) reads the latest value without re-binding.
  const fPalletRef = useRef<string>("");

  useEffect(() => {
    const cached = readCookie(COOKIE_NAME);
    if (cached) {
      queueMicrotask(() => setFPallet(cached));
      fPalletRef.current = cached;
    }
  }, []);

  useEffect(() => {
    fPalletRef.current = fPallet;
  }, [fPallet]);

  function playSound(src: string) {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.src = src;
      void el.play().catch(() => {
        // ignore autoplay rejections
      });
    } catch {
      // ignore
    }
  }

  // Stable identity — useCallback so the parent doesn't re-init Quagga
  // on every render.
  const handleDetected = useCallback((code: string) => {
    setError(null);
    const keysearch = code.trim();
    const pallet = fPalletRef.current || "MOBILE";

    startTransition(async () => {
      const res = await adminBarcodeImportScan({
        keysearch,
        keyType: 1,
        fPallet: pallet,
      });

      if (!res.ok) {
        setError(res.error);
        setResult(null);
        playSound(SOUND_NOT_FOUND);
        return;
      }
      if (!res.data) {
        setError("ไม่ได้รับข้อมูลตอบกลับจากเซิร์ฟเวอร์");
        setResult(null);
        playSound(SOUND_NOT_FOUND);
        return;
      }

      const data = res.data;
      setResult(data);
      if (!data.matched) {
        playSound(SOUND_NOT_FOUND);
      } else {
        playSound(SOUND_SUCCESS);
      }
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Location :</span>
          <span className="font-mono">{fPallet || "MOBILE (ค่าเริ่มต้น)"}</span>
        </div>
        <div className="mt-1 text-xs text-slate-600">
          ตั้งค่า location จากหน้าเครื่องสแกน USB
          (<Link href="/admin/barcode/driver/import" className="text-primary-600 hover:underline">/admin/barcode/driver/import</Link>)
          แล้ว cookie จะแชร์มาที่หน้านี้
        </div>
      </div>

      <CameraScanner onDetected={handleDetected} />

      {isPending && (
        <div className="text-center py-2">
          <div className="lds-ring inline-block">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>
      )}

      {result && !isPending && <ResultCard data={result} />}

      {error && (
        <div
          className="rounded-xl border-2 border-red-300 bg-red-50 text-red-900 p-4 text-sm"
          role="alert"
        >
          <div className="text-center font-semibold">ผิดพลาด</div>
          <div className="text-center mt-1">{error}</div>
        </div>
      )}

      <audio
        ref={audioRef}
        preload="none"
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
