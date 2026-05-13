"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminBarcodeScan, type BarcodeScanResult } from "@/actions/admin/barcode";

// Extend Window for BarcodeDetector (Chrome/Android native API)
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
    };
  }
}

type Mode = "intake" | "prepare" | "driver";

type LogEntry = {
  ts: string;
  code: string;
  ok: boolean;
  msg: string;
  detail: BarcodeScanResult | null;
};

const MODE_LABEL: Record<Mode, string> = {
  intake:  "📦 รับเข้าโกดัง",
  prepare: "🚚 เตรียมส่ง",
  driver:  "🛻 ปล่อยให้คนขับ",
};

const BARCODE_FORMATS = [
  "code_128", "code_39", "code_93", "qr_code",
  "ean_13", "ean_8", "itf", "data_matrix",
];

function playBeep(success: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = success ? 880 : 220;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

export function ScanForm({
  defaultMode = "intake",
  availableModes = ["intake", "prepare"],
}: {
  defaultMode?: Mode;
  availableModes?: Mode[];
}) {
  const [mode, setMode]         = useState<Mode>(defaultMode);
  const [code, setCode]         = useState("");
  const [log, setLog]           = useState<LogEntry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LogEntry | null>(null);
  const [pending, startTransition] = useTransition();

  const inputRef     = useRef<HTMLInputElement | null>(null);
  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const detectorRef  = useRef<InstanceType<NonNullable<Window["BarcodeDetector"]>> | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCodeRef  = useRef<string>("");
  const lastCodeTimeRef = useRef<number>(0);
  const submittingRef = useRef(false);
  // Ref to latest handleSubmitCode so the camera detection loop can invoke
  // it without forcing startCamera to recreate (and tear the camera down).
  const handleSubmitCodeRef = useRef<((raw: string) => void) | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!cameraOn) inputRef.current?.focus();
  }, [mode, cameraOn]);

  // ── Submit logic ─────────────────────────────────────────────────────────

  const handleSubmitCode = useCallback((raw: string) => {
    if (!raw || submittingRef.current) return;
    submittingRef.current = true;
    setCode(raw);
    startTransition(async () => {
      const res = await adminBarcodeScan({ mode, code: raw });
      const entry: LogEntry = {
        ts:     new Date().toLocaleTimeString("th-TH"),
        code:   raw,
        ok:     res.ok,
        msg:    res.ok ? (res.data?.message ?? "บันทึกแล้ว") : (res.error ?? "error"),
        detail: res.ok ? (res.data ?? null) : null,
      };
      playBeep(res.ok);
      setLog((prev) => [entry, ...prev.slice(0, 49)]);
      setLastResult(entry);
      setCode("");
      submittingRef.current = false;
      if (res.ok) router.refresh();
      if (!cameraOn) inputRef.current?.focus();
    });
  }, [mode, cameraOn, router]);

  // Keep ref pointing at latest handleSubmitCode — lets startCamera's
  // detection loop call it without listing it as a dep (which would
  // rebuild startCamera on every mode/cameraOn change → camera flicker).
  useEffect(() => {
    handleSubmitCodeRef.current = handleSubmitCode;
  }, [handleSubmitCode]);

  // ── Camera controls ──────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    lastCodeRef.current = "";
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      // Clear any previous error AFTER first await so setState happens
      // in a microtask (avoids React Compiler "setState sync in effect").
      setCameraErr(null);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Initialise BarcodeDetector
      if (window.BarcodeDetector) {
        detectorRef.current = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
      } else {
        setCameraErr("กล้องเปิดแล้ว แต่ browser นี้ไม่รองรับ BarcodeDetector — กรุณาพิมพ์โค้ดด้วยมือ หรือใช้ Chrome บน Android");
        // Camera still shows; user can type manually
      }

      // Start detection loop (200ms interval)
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || !detectorRef.current || submittingRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (!barcodes.length) return;

          const raw = barcodes[0].rawValue.trim();
          if (!raw) return;

          const now = Date.now();
          // Debounce: ignore same code within 2.5 seconds
          if (raw === lastCodeRef.current && now - lastCodeTimeRef.current < 2500) return;

          lastCodeRef.current = raw;
          lastCodeTimeRef.current = now;
          handleSubmitCodeRef.current?.(raw);
        } catch {}
      }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ไม่สามารถเปิดกล้องได้";
      setCameraErr(msg.includes("Permission") ? "ไม่ได้รับอนุญาตเปิดกล้อง — กรุณาอนุญาตใน browser settings" : msg);
      setCameraOn(false);
    }
  }, []);

  useEffect(() => {
    if (cameraOn) {
      // Defer startCamera to a macrotask — even though it's async, the
      // synchronous prelude (any setState before first await) would be
      // flagged by React Compiler as "setState sync within effect".
      const id = setTimeout(() => { startCamera(); }, 0);
      return () => { clearTimeout(id); stopCamera(); };
    }
    stopCamera();
  }, [cameraOn, startCamera, stopCamera]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    handleSubmitCode(code.trim());
  }

  const sessionOk  = log.filter((e) => e.ok).length;
  const sessionErr = log.filter((e) => !e.ok).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      {availableModes.length > 1 && (
        <div className="flex gap-2">
          {availableModes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                mode === m
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      {/* Current mode badge (single-mode) */}
      {availableModes.length === 1 && (
        <div className="rounded-xl bg-primary-500 text-white px-4 py-3 text-sm font-bold text-center">
          {MODE_LABEL[availableModes[0]]}
        </div>
      )}

      {/* Camera + text input */}
      <div className="rounded-2xl border-2 border-primary-200 bg-primary-50/30 p-5 shadow-sm space-y-3">
        {/* Camera toggle */}
        <button
          type="button"
          onClick={() => setCameraOn((v) => !v)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
            cameraOn
              ? "bg-primary-500 text-white border-primary-500"
              : "bg-white border-border text-foreground hover:bg-surface-alt"
          }`}
        >
          {cameraOn ? "📷 กล้องเปิดอยู่ — แตะเพื่อปิด" : "📷 เปิดกล้องสแกน"}
        </button>

        {/* Camera preview */}
        {cameraOn && (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Scan crosshair overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-32 border-2 border-white/60 rounded-lg">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary-400 rounded-br" />
              </div>
            </div>
            {pending && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <span className="text-white text-sm font-bold">กำลังบันทึก...</span>
              </div>
            )}
          </div>
        )}

        {cameraErr && (
          <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">{cameraErr}</p>
        )}

        {/* Manual input */}
        <form onSubmit={onSubmit} className="space-y-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              {cameraOn ? "หรือพิมพ์เลขด้วยมือ" : "สแกนหรือพิมพ์เลข tracking / f_no / h_no"}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 rounded-lg border-2 border-primary-300 bg-white px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              placeholder="F260513-1, O260513-12, หรือ tracking..."
              autoComplete="off"
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || !code.trim()}
              className="px-5 rounded-lg bg-primary-500 text-white font-bold text-sm hover:bg-primary-600 disabled:opacity-40"
            >
              {pending ? "..." : "OK"}
            </button>
          </div>
        </form>
      </div>

      {/* Last result card */}
      {lastResult && (
        <div className={`rounded-xl border-2 px-4 py-3 text-sm ${
          lastResult.ok
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-bold">{lastResult.ok ? "✓" : "✗"} </span>
              <span className="font-mono text-xs">{lastResult.code}</span>
              <span className="ml-2">{lastResult.msg}</span>
              {lastResult.detail?.customer_name && (
                <div className="text-xs mt-0.5 opacity-75">
                  {lastResult.detail.member_code && <span className="font-mono mr-2">{lastResult.detail.member_code}</span>}
                  {lastResult.detail.customer_name}
                </div>
              )}
            </div>
            <span className="text-xs opacity-60 shrink-0">{lastResult.ts}</span>
          </div>
        </div>
      )}

      {/* Session stats */}
      {log.length > 0 && (
        <div className="flex gap-3 text-xs">
          <span className="rounded-full bg-green-100 text-green-700 px-3 py-1 font-semibold">✓ {sessionOk} สำเร็จ</span>
          {sessionErr > 0 && (
            <span className="rounded-full bg-red-100 text-red-700 px-3 py-1 font-semibold">✗ {sessionErr} ผิดพลาด</span>
          )}
          <span className="rounded-full bg-surface-alt text-muted px-3 py-1">รวม {log.length}</span>
        </div>
      )}

      {/* Scan log */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-surface-alt/30 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">บันทึกเซสชั่นนี้</h3>
          <span className="text-xs text-muted">{log.length}/50</span>
        </div>
        {log.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">รอสแกนรายการแรก...</p>
        ) : (
          <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {log.map((entry, i) => (
              <li
                key={i}
                className={`px-4 py-2.5 text-xs ${entry.ok ? "" : "bg-red-50 dark:bg-red-950/20"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`font-bold mr-1 ${entry.ok ? "text-green-600" : "text-red-600"}`}>
                      {entry.ok ? "✓" : "✗"}
                    </span>
                    <span className="font-mono">{entry.code}</span>
                    <span className={`ml-2 ${entry.ok ? "text-green-700" : "text-red-700"}`}>{entry.msg}</span>
                    {entry.detail?.customer_name && (
                      <span className="ml-2 text-muted">{entry.detail.member_code} {entry.detail.customer_name}</span>
                    )}
                  </div>
                  <span className="text-muted shrink-0">{entry.ts}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
