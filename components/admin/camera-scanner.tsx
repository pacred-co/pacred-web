"use client";

/**
 * <CameraScanner>
 *
 * Faithful 1:1 port of the legacy PCS Cargo mobile barcode-scanner UI
 * shared by `pcs-admin/barcode-c-{all,from,import,prepare}.php` (L106-407 of
 * each — the inline <script> + the `.controls` markup at L43-87). The PHP
 * page invoked Quagga.js via a global `<script src=".../quagga.js">` tag;
 * here we import `@ericblade/quagga2` (the maintained ESM fork) inside a
 * client component so the camera lifecycle binds to React mount/unmount.
 *
 * Behaviour mirrored exactly from the legacy `Quagga.onDetected` handler
 * (L391-404 of each barcode-c-*.php): on first successful decode of a NEW
 * code (App.lastResult dedupe), navigate to `gateway.php?type=…&device=mobile&tracking=<code>`.
 * Here we redirect to `/admin/barcode/gateway?type=…&device=mobile&tracking=<code>`
 * — Agent 3's gateway route handles the dispatch.
 *
 * Same Quagga config as legacy state{} block (L341-364): LiveStream,
 * environment-facing camera, 640x480 min, code_128 default reader,
 * 2 workers, frequency 10, medium half-sample locator.
 *
 * Controls = the SAME knobs as legacy (Stop · Barcode-Type select · Camera
 * select filled by enumerateVideoDevices) but the UI is **Pacred Tailwind
 * design** per AGENTS.md §0a — we steal the workflow, not the Bootstrap-4
 * chrome. Framed `aspect-video` viewport with a crosshair overlay (matches the
 * USB-scanner page), a live "กำลังสแกน" status dot, and a rounded controls card.
 * The legacy dead `#result_strip`/`.thumbnails` (never populated) + the unwired
 * hidden Zoom/Torch toggles are dropped. ภูม warehouse-polish 2026-06-12.
 *
 * NOTE: legacy shipped NO sizing CSS for `#interactive`/`.viewport` — the
 * injected <video>/<canvas> are sized here via Tailwind arbitrary child
 * variants (`[&_video]:object-cover` etc.), which the raw port lacked.
 *
 * `@ericblade/quagga2` (1.12.x) IS installed (package.json + lockfile +
 * node_modules) — the dynamic require below is wrapped in try/catch purely as a
 * defensive fallback (a future dep removal surfaces a friendly in-UI error
 * instead of crashing the scan page).
 */

import { useEffect, useRef, useState } from "react";
import { Camera, Square, AlertTriangle } from "lucide-react";

// quagga2 is installed; this dynamic require + try/catch is a defensive guard
// only (keeps a hypothetical missing-dep state from hard-crashing the page).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Quagga: any;
try {
  // dynamic require so missing dep doesn't break the build entirely
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Quagga = require("@ericblade/quagga2").default;
} catch {
  Quagga = null;
}

/** type values match legacy `gateway.php?type=…` values verbatim:
 *   all     → barcode-c-all.php L401     (gateway?type=all)
 *   from    → barcode-c-from.php L401    (gateway?type=from)
 *   "4"     → barcode-c-import.php L400  (gateway?type=4)
 *   "6"     → barcode-c-prepare.php L401 (gateway?type=6)
 */
export type GatewayType = "all" | "from" | "4" | "6";

const BARCODE_READERS = [
  { value: "code_128", label: "Code 128" },
  { value: "code_39", label: "Code 39" },
  { value: "code_39_vin", label: "Code 39 VIN" },
  { value: "ean", label: "EAN" },
  { value: "ean_extended", label: "EAN-extended" },
  { value: "ean_8", label: "EAN-8" },
  { value: "upc", label: "UPC" },
  { value: "upc_e", label: "UPC-E" },
  { value: "codabar", label: "Codabar" },
  { value: "i2of5", label: "Interleaved 2 of 5" },
  { value: "2of5", label: "Standard 2 of 5" },
  { value: "code_93", label: "Code 93" },
] as const;

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastResultRef = useRef<string | null>(null);
  const [reader, setReader] = useState<string>("code_128");
  const [deviceId, setDeviceId] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Build the reader-config object from the selected dropdown value
  // mirroring legacy inputMapper.decoder.readers (L322-339).
  const buildReaders = (value: string) => {
    if (value === "ean_extended") {
      return [
        {
          format: "ean_reader",
          config: { supplements: ["ean_5_reader", "ean_2_reader"] },
        },
      ];
    }
    return [{ format: `${value}_reader`, config: {} }];
  };

  // Init Quagga — legacy state{} block (L341-364).
  useEffect(() => {
    if (!Quagga) {
      // Defer setError to a microtask so the effect doesn't trigger a
      // synchronous re-render (react-hooks/set-state-in-effect lint).
      queueMicrotask(() => setError("Quagga library not installed. Run: pnpm add @ericblade/quagga2"));
      return;
    }
    if (!viewportRef.current) return;

    const constraints: MediaTrackConstraints = {
      width: { min: 640 },
      height: { min: 480 },
      facingMode: "environment",
      aspectRatio: { min: 1, max: 2 },
    };
    if (deviceId) {
      (constraints as MediaTrackConstraints & { deviceId?: string }).deviceId = deviceId;
    }

    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: viewportRef.current,
          constraints,
        },
        locator: { patchSize: "medium", halfSample: true },
        numOfWorkers: 2,
        frequency: 10,
        decoder: { readers: buildReaders(reader) },
        locate: true,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: any) => {
        if (err) {
          console.error("[CameraScanner] Quagga.init failed:", err);
          setError(typeof err === "string" ? err : (err?.message ?? "Camera init failed"));
          return;
        }
        Quagga.start();
        setRunning(true);

        // Populate camera dropdown — legacy initCameraSelection (L194-214).
        Quagga.CameraAccess.enumerateVideoDevices()
          .then((d: MediaDeviceInfo[]) => setDevices(d))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .catch((e: any) => console.warn("[CameraScanner] enumerate failed:", e));
      },
    );

    // onDetected — the redirect-on-scan handler. Legacy L391-404.
    //
    // Wave 17 P1-7: when `onDetected` prop is provided, hand the code
    // up to the parent (e.g. for cargo/import which calls the server
    // action `adminBarcodeImportScan` to do the WRITE). When no
    // callback is provided, fall back to the legacy gateway redirect.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDetected = (result: any) => {
      const code: string | undefined = result?.codeResult?.code;
      if (!code) return;
      if (lastResultRef.current === code) return;
      lastResultRef.current = code;

      if (onDetectedProp) {
        onDetectedProp(code);
        return;
      }

      if (!gatewayType) {
        console.warn(
          "[CameraScanner] no gatewayType + no onDetected; ignoring scan",
        );
        return;
      }

      // Legacy fallback: gateway?type=…&device=mobile&tracking=<code>
      const params = new URLSearchParams({
        type: gatewayType,
        device: "mobile",
        tracking: code,
      });
      window.location.href = `/admin/barcode/gateway?${params.toString()}`;
    };
    Quagga.onDetected(onDetected);

    // onProcessed — overlay boxes. Legacy L368-390.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onProcessed = (result: any) => {
      const drawingCtx = Quagga.canvas?.ctx?.overlay;
      const drawingCanvas = Quagga.canvas?.dom?.overlay;
      if (!result || !drawingCtx || !drawingCanvas) return;

      if (result.boxes) {
        drawingCtx.clearRect(
          0,
          0,
          parseInt(drawingCanvas.getAttribute("width") ?? "0"),
          parseInt(drawingCanvas.getAttribute("height") ?? "0"),
        );
        result.boxes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((box: any) => box !== result.box)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .forEach((box: any) => {
            Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
              color: "green",
              lineWidth: 2,
            });
          });
      }
      if (result.box) {
        Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
          color: "#00F",
          lineWidth: 2,
        });
      }
      if (result.codeResult?.code) {
        Quagga.ImageDebug.drawPath(result.line, { x: "x", y: "y" }, drawingCtx, {
          color: "red",
          lineWidth: 3,
        });
      }
    };
    Quagga.onProcessed(onProcessed);

    return () => {
      try {
        Quagga.offDetected(onDetected);
        Quagga.offProcessed(onProcessed);
        Quagga.stop();
      } catch (e) {
        console.warn("[CameraScanner] cleanup error:", e);
      }
      setRunning(false);
    };
    // Re-init on reader/deviceId change — mirrors legacy setState() → init() loop (L286-303).
  }, [reader, deviceId, gatewayType, onDetectedProp]);

  // Manual Stop button — mirrors legacy `.controls button.stop` (L46-48, L219-223).
  const handleStop = () => {
    if (!Quagga) return;
    try {
      Quagga.stop();
      setRunning(false);
    } catch (e) {
      console.warn("[CameraScanner] stop error:", e);
    }
  };

  return (
    <div className="space-y-3">
      {/* Camera viewport — Quagga injects <video> + <canvas> into this node,
          so we keep id="interactive" + the ref. Legacy shipped NO sizing CSS
          for these; the arbitrary child variants below size the injected
          video/overlay responsively (a real improvement, not just a reskin). */}
      <div
        ref={viewportRef}
        id="interactive"
        className="relative w-full aspect-video overflow-hidden rounded-2xl bg-black shadow-sm
          [&_video]:absolute [&_video]:inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover
          [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full"
      >
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
              {error ? "กล้องไม่พร้อม" : "กำลังเปิดกล้อง…"}
            </span>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <div className="font-semibold">เปิดกล้องไม่ได้</div>
              <div className="mt-0.5">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Controls card */}
      <div className="space-y-3 rounded-2xl border-2 border-primary-200 bg-primary-50/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${running ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
            {running ? "กล้องกำลังสแกน…" : "กล้องหยุด"}
          </span>
          <button
            type="button"
            onClick={handleStop}
            disabled={!running}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-border bg-white px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-alt disabled:opacity-50"
          >
            <Square className="h-4 w-4" aria-hidden="true" /> หยุด
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">ชนิดบาร์โค้ด</span>
            <select
              value={reader}
              onChange={(e) => setReader(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              {BARCODE_READERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">กล้อง</span>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">— เลือกกล้อง —</option>
              {devices.map((d) => {
                const id = d.deviceId || (d as MediaDeviceInfo & { id?: string }).id || "";
                const label = (d.label || id).slice(0, 30);
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <p className="text-xs text-muted">
          เล็งบาร์โค้ดเข้ากรอบ — ระบบจะอ่านอัตโนมัติแล้วพาไปยังรายการ
        </p>
      </div>
    </div>
  );
}
