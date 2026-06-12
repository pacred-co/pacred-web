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
 * Same controls (L43-87): Stop button + Barcode-Type select (12 options,
 * Code 128 default) + Camera select (filled in by enumerateVideoDevices)
 * + hidden Zoom/Torch toggles (revealed via checkCapabilities).
 *
 * Bootstrap-4 classes scoped under `.pcs-legacy` (see admin-base.css).
 *
 * `@ericblade/quagga2` (1.12.x) IS installed (package.json + lockfile +
 * node_modules) — the dynamic require below is wrapped in try/catch purely as a
 * defensive fallback (a future dep removal surfaces a friendly in-UI error
 * instead of crashing the scan page).
 */

import { useEffect, useRef, useState } from "react";

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
    <section id="container" className="container">
      <div className="controls">
        <fieldset className="input-group">
          <button type="button" className="stop btn btn-outline-secondary" onClick={handleStop}>
            Stop
          </button>
          {!running && !error && (
            <span className="ml-2 text-muted small">Camera stopped — change settings to restart.</span>
          )}
        </fieldset>
        <fieldset className="reader-config-group">
          <label>
            <span>Barcode-Type</span>
            <select
              name="decoder_readers"
              value={reader}
              onChange={(e) => setReader(e.target.value)}
            >
              {BARCODE_READERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Camera</span>
            <select
              name="input-stream_constraints"
              id="deviceSelection"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
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
          {/* Zoom + Torch hidden by default; legacy reveals them via checkCapabilities
              (L150-157). Not wired into the React component — Wave 3 backlog item. */}
          <label style={{ display: "none" }}>
            <span>Zoom</span>
            <select name="settings_zoom"></select>
          </label>
          <label style={{ display: "none" }}>
            <span>Torch</span>
            <input type="checkbox" name="settings_torch" />
          </label>
        </fieldset>
      </div>
      {error && (
        <div className="alert alert-danger mt-2" role="alert">
          {error}
        </div>
      )}
      <div id="result_strip">
        <ul className="thumbnails"></ul>
        <ul className="collector"></ul>
      </div>
      <div id="interactive" className="viewport" ref={viewportRef}></div>
    </section>
  );
}
