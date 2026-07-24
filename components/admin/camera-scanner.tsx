"use client";

/**
 * <CameraScanner>
 *
 * Mobile barcode/QR scanner shared by the 4 cargo camera pages
 * (`/admin/barcode/cargo/{all,from,prepare,import}`). It decodes a tracking
 * code from the back camera and either calls the `onDetected` prop (the
 * parent owns the response — e.g. cargo/import → `adminBarcodeImportScan`)
 * or, when no callback is given, redirects to the legacy gateway route
 * `/admin/barcode/gateway?type=…&device=mobile&tracking=<code>`.
 *
 * ENGINE: the native `window.BarcodeDetector` API (same proven approach as
 * `app/[locale]/(admin)/admin/barcode/scan-form.tsx`) — NOT a 3rd-party lib.
 * The previous build used `@ericblade/quagga2`, a 1D-only engine defaulted to
 * `code_128`; it could not read the QR codes on the real warehouse labels
 * (收货单 / PR receipt labels), so the camera never decoded them. BarcodeDetector
 * reads `qr_code` + `code_128` + many 1D formats out of the box and auto-detects
 * the format (no barcode-type picker needed); `facingMode:'environment'` picks
 * the back camera (no camera picker needed) — both legacy dropdowns are gone.
 *
 * FALLBACK: an always-present, auto-focused text input. Staff can TYPE the
 * tracking number OR point a USB scanner at it (USB scanners emit keystrokes +
 * Enter) — submitting fires the exact same onDetected/gateway path as a camera
 * decode. This guarantees the page works even where BarcodeDetector is
 * unavailable (Safari / Firefox / desktop without a webcam), in which case we
 * surface a small note and still attempt the camera preview best-effort.
 *
 * The camera lifecycle is bound to React mount/unmount (start on mount, stop +
 * release the MediaStream tracks on unmount). UI = Pacred Tailwind (framed
 * aspect-video viewport with crosshair corners, a live status dot, rounded
 * card, lucide icons) per AGENTS.md §0a. Mobile-first: tap targets ≥44px, the
 * manual input ≥16px text. ภูม warehouse-polish 2026-06-12.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, AlertTriangle, Keyboard } from "lucide-react";

// Native BarcodeDetector (Chrome/Android). Typed here because TS lib.dom
// does not yet ship the declaration. Mirrors scan-form.tsx.
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
    };
  }
}

/** type values match legacy `gateway.php?type=…` values verbatim:
 *   all     → barcode-c-all.php L401     (gateway?type=all)
 *   from    → barcode-c-from.php L401    (gateway?type=from)
 *   "4"     → barcode-c-import.php L400  (gateway?type=4)
 *   "6"     → barcode-c-prepare.php L401 (gateway?type=6)
 */
export type GatewayType = "all" | "from" | "4" | "6";

// qr_code FIRST — the real warehouse labels carry QR codes. The 1D formats
// follow so USB-printed Code128/Code39 box labels keep decoding too.
const BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "itf",
  "data_matrix",
];

/**
 * Props:
 *   gatewayType  — required only when `onDetected` is not supplied. If
 *                  `onDetected` is provided, the scanner does NOT bounce
 *                  to /admin/barcode/gateway — instead the parent owns
 *                  the response (e.g. calling a server action like
 *                  `adminBarcodeImportScan` on `cargo/import`).
 *   onDetected   — optional callback fired on the first successful decode
 *                  of a NEW code (dedupe inside). When set, suppresses
 *                  the legacy gateway redirect.
 */
export function CameraScanner({
  gatewayType,
  onDetected: onDetectedProp,
}: {
  gatewayType?: GatewayType;
  onDetected?: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<NonNullable<Window["BarcodeDetector"]>> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCodeRef = useRef<string>("");
  const lastCodeTimeRef = useRef<number>(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [manual, setManual] = useState("");
  const [running, setRunning] = useState(false);
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  // ── Dispatch (camera decode OR manual submit both flow through here) ───────
  // Stable identity: depends only on the props. Dedupe the same raw code within
  // ~2.5s so one parcel held in front of the lens fires exactly once.
  const dispatch = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const now = Date.now();
      if (code === lastCodeRef.current && now - lastCodeTimeRef.current < 2500) return;
      lastCodeRef.current = code;
      lastCodeTimeRef.current = now;

      if (onDetectedProp) {
        // Parent owns the response (cargo/import calls the server action).
        onDetectedProp(code);
        return;
      }

      if (!gatewayType) {
        console.warn("[CameraScanner] no gatewayType + no onDetected; ignoring scan");
        return;
      }

      // Legacy fallback: gateway?type=…&device=mobile&tracking=<code>
      const params = new URLSearchParams({
        type: gatewayType,
        device: "mobile",
        tracking: code,
      });
      window.location.href = `/admin/barcode/gateway?${params.toString()}`;
    },
    [gatewayType, onDetectedProp],
  );

  // Keep the camera loop calling the latest dispatch without re-binding the
  // camera (the detection interval reads this ref, not dispatch directly).
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // ── Camera lifecycle — start on mount, release tracks on unmount ──────────
  useEffect(() => {
    let cancelled = false;

    async function start() {
      // BarcodeDetector missing → keep the manual input usable, attempt the
      // preview best-effort so a sighted-camera browser without the API still
      // shows video.
      if (typeof window === "undefined" || !window.BarcodeDetector) {
        queueMicrotask(() => setUnsupported(true));
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraErr(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (window.BarcodeDetector) {
          detectorRef.current = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
          setRunning(true);

          // ~200ms detection loop (mirrors scan-form.tsx).
          intervalRef.current = setInterval(async () => {
            const video = videoRef.current;
            const detector = detectorRef.current;
            if (!video || !detector) return;
            try {
              const codes = await detector.detect(video);
              if (!codes.length) return;
              const raw = codes[0].rawValue;
              if (raw) dispatchRef.current(raw);
            } catch {
              // transient detect errors (frame not ready) — ignore
            }
          }, 200);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "ไม่สามารถเปิดกล้องได้";
        setCameraErr(
          msg.includes("Permission") || msg.includes("denied")
            ? "ไม่ได้รับอนุญาตเปิดกล้อง — กรุณาอนุญาตใน browser settings (หรือพิมพ์/ยิงเครื่องสแกนแทน)"
            : msg,
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      detectorRef.current = null;
      setRunning(false);
    };
  }, []);

  // Auto-focus the manual input so a USB scanner (types + Enter) lands here.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual("");
    dispatch(code);
  }

  return (
    <div className="space-y-3">
      {/* Camera viewport */}
      <div className="relative w-full aspect-video overflow-hidden rounded-2xl bg-black shadow-sm">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Crosshair frame (decorative · matches the USB-scanner page) */}
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="relative h-36 w-56">
            <span className="absolute left-0 top-0 h-5 w-5 rounded-tl border-l-2 border-t-2 border-primary-400" />
            <span className="absolute right-0 top-0 h-5 w-5 rounded-tr border-r-2 border-t-2 border-primary-400" />
            <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl border-b-2 border-l-2 border-primary-400" />
            <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br border-b-2 border-r-2 border-primary-400" />
          </div>
        </div>

        {/* Idle / not-running overlay */}
        {!running && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-white/80">
            <Camera className="h-10 w-10" aria-hidden="true" />
            <span className="text-sm font-medium">
              {cameraErr ? "กล้องไม่พร้อม" : unsupported ? "กล้องสแกนไม่ได้บนเบราว์เซอร์นี้" : "กำลังเปิดกล้อง…"}
            </span>
          </div>
        )}
      </div>

      {/* Camera error alert */}
      {cameraErr && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <div className="font-semibold">เปิดกล้องไม่ได้</div>
              <div className="mt-0.5">{cameraErr}</div>
            </div>
          </div>
        </div>
      )}

      {/* Status + manual input card */}
      <div className="space-y-3 rounded-2xl border-2 border-primary-200 bg-primary-50/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${running ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
            {running ? "กล้องกำลังสแกน…" : "กล้องไม่ทำงาน"}
          </span>
        </div>

        {unsupported && !running && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            เบราว์เซอร์นี้สแกนกล้องไม่ได้ — พิมพ์เลข tracking หรือยิงเครื่องสแกน USB ลงช่องด้านล่างแทน
          </p>
        )}

        {/* Manual / USB-scanner input — fires the SAME path as a camera decode */}
        <form onSubmit={onManualSubmit} className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            พิมพ์ / ยิงเครื่องสแกน
          </label>
          <div className="flex gap-2">
            {/* min-w-0 = ให้ input ย่อได้ต่ำกว่าความกว้างเนื้อหา · shrink-0 = ปุ่ม OK
                ไม่ถูกบีบ → แถวไม่ล้นกรอบบนการ์ดแคบ (ปอน 2026-07-24). */}
            <input
              ref={inputRef}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="min-h-[44px] min-w-0 flex-1 rounded-full border-2 border-primary-300 bg-white px-5 py-2.5 text-base font-mono focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="เลข tracking / บาร์โค้ด…"
              autoComplete="off"
              inputMode="text"
            />
            <button
              type="submit"
              disabled={!manual.trim()}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-primary-600 px-5 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </form>

        <p className="text-xs text-muted">
          เล็งบาร์โค้ด/คิวอาร์เข้ากรอบ — ระบบจะอ่านอัตโนมัติ หรือพิมพ์/ยิงเครื่องสแกนลงช่องด้านบน
        </p>
      </div>
    </div>
  );
}
