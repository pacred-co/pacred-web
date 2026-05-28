"use client";

/**
 * Action buttons for one driver-work card. Mobile-first — buttons are
 * full-width on small screens, side-by-side from sm: up. Tap targets are
 * ≥ 44px (per docs/mobile-first-playbook.md).
 *
 * Wave 12-B (2026-05-23) — photo capture on "ขึ้นรถ" / "ส่งสำเร็จ"
 * --------------------------------------------------------------------
 * The flow:
 *   1. Driver taps "ขึ้นรถ" → opens phone camera (capture="environment"
 *      = rear camera, picks the truck/parcel framing).
 *   2. Photo preview appears in a sticky panel with "ยืนยัน" / "ถ่ายใหม่"
 *      / "ยกเลิก" buttons.
 *   3. On confirm: client-side downscales the image to ≤ 1600 px on the
 *      long edge + JPEG quality 0.82. This keeps the request well under
 *      the 5 MB cap on Group A's `uploadToBucket` even for high-res
 *      modern phone cameras (10+ MP raw → typically 200-400 KB after
 *      downscale).
 *   4. FormData submission → Server Action uploads + flips status + writes
 *      filename into fdipictureon / fdipictureoff in one UPDATE.
 *
 * Mobile UX choices:
 *   - BIG (≥ 56px) primary action buttons — drivers wear gloves / are in a hurry.
 *   - Preview thumbnail is ~ 320px tall so the driver can see the photo
 *     clearly enough to decide "ถ่ายใหม่".
 *   - "ถ่ายใหม่" is a same-size button next to "ยืนยัน" — no tiny links.
 *   - Loading state covers the WHOLE card (overlay) so the driver can't
 *     double-tap.
 *   - Optimistic UI is NOT used — the upload can fail; we wait for the
 *     server response then revalidatePath redraws the card with the new
 *     photo / status / chip.
 *
 * The "ส่งไม่ได้" path still uses the lightweight inline window.prompt
 * for the reason — legacy doesn't capture a photo on failure, and a
 * richer modal is Wave 13.
 */

import { useRef, useState, useTransition } from "react";
import {
  markDriverItemLoaded,
  markDriverItemDelivered,
  markDriverItemFailed,
} from "@/actions/admin/driver-work";

type Props = {
  itemId:   number;
  /** legacy fdistatus value — '' / '1' / '2' / '3' */
  status:   string;
};

type CaptureMode = null | "load" | "deliver";

const CAPTURE_COPY: Record<"load" | "deliver", { title: string; verb: string; cta: string }> = {
  load:    { title: "ถ่ายรูปตอนขึ้นรถ", verb: "ขึ้นรถ", cta: "ยืนยันขึ้นรถ" },
  deliver: { title: "ถ่ายรูปตอนส่ง",   verb: "ส่งสำเร็จ", cta: "ยืนยันส่งสำเร็จ" },
};

export function DriverItemActionButtons({ itemId, status }: Props) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<CaptureMode>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showLoad    = status === "";        // not yet loaded
  const showDeliver = status === "1";       // loaded, can be delivered
  const showFail    = status === "" || status === "1"; // can fail any pre-delivery state

  // ── Start a capture session — open the camera. The actual photo
  // arrives in `onFileChange` when the driver finishes capturing.
  function startCapture(next: "load" | "deliver") {
    setErr(null);
    setMode(next);
    // Defer to the next paint so React commits the mode change before
    // we click the hidden input — some Android browsers ignore the click
    // if it happens in the same tick as a setState.
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  // ── User finished capturing a photo — generate a preview blob URL.
  // We DO NOT upload yet; the driver must confirm or retake.
  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";              // allow re-select of same file later
    if (!f) {
      setMode(null);
      return;
    }
    // Downscale upfront so the preview is fast AND the eventual upload
    // is small. If downscale fails (e.g. HEIC on a browser that can't
    // decode it), fall back to the raw file and let the server validate.
    const downscaled = await downscaleImage(f).catch(() => null);
    const finalFile = downscaled ?? f;
    setPreviewFile(finalFile);
    const url = URL.createObjectURL(finalFile);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  // ── Driver clicked "ถ่ายใหม่" — reopen the camera, keep mode.
  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  // ── Driver clicked "ยกเลิก" — discard preview + close capture.
  function cancel() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setMode(null);
  }

  // ── Driver clicked the confirm button — submit FormData.
  function confirm() {
    if (!mode || !previewFile) return;
    const fd = new FormData();
    fd.append("itemId", String(itemId));
    fd.append("photo", previewFile, previewFile.name || `${mode}.jpg`);
    setErr(null);
    start(async () => {
      const action = mode === "load" ? markDriverItemLoaded : markDriverItemDelivered;
      const res = await action(fd);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // success — revalidatePath on the server redraws the card
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewFile(null);
      setMode(null);
    });
  }

  // ── "ส่งไม่ได้" stays as a quick inline prompt (no photo per legacy).
  function runFail() {
    setErr(null);
    const reason = typeof window !== "undefined"
      ? window.prompt("เหตุผลที่ส่งไม่ได้?")
      : null;
    if (!reason || !reason.trim()) return;
    start(async () => {
      const res = await markDriverItemFailed({ itemId, reason: reason.trim() });
      if (!res.ok) setErr(res.error);
    });
  }

  // Already terminal (delivered or failed) — show nothing actionable.
  if (status === "2" || status === "3") return null;

  // ── Preview panel — shown after the camera returns a photo. Replaces
  // the action-button row until the driver decides confirm / retake.
  if (mode && previewUrl) {
    const copy = CAPTURE_COPY[mode];
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <div className="relative rounded-xl border border-border bg-gray-50 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={copy.title}
            className="w-full h-auto max-h-[400px] object-contain"
          />
          {pending && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="rounded-lg bg-white/90 px-4 py-2 text-base font-medium">
                ⏳ กำลังอัปโหลด...
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="flex-1 rounded-xl bg-green-600 text-white font-semibold text-base px-4 py-3.5 min-h-[56px] hover:bg-green-700 active:bg-green-800 disabled:opacity-60"
          >
            ✅ {copy.cta}
          </button>
          <button
            type="button"
            onClick={retake}
            disabled={pending}
            className="flex-1 rounded-xl border-2 border-border bg-white text-foreground font-semibold text-base px-4 py-3.5 min-h-[56px] hover:bg-surface-alt disabled:opacity-60"
          >
            📷 ถ่ายใหม่
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-xl border border-red-300 bg-white text-red-700 font-medium text-base px-4 py-3.5 min-h-[56px] hover:bg-red-50 disabled:opacity-60"
          >
            ยกเลิก
          </button>
        </div>
        {err && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-2">
            {err}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Hidden file input — opens the camera. Single instance reused for
          both load + deliver — the active mode in state controls the
          downstream UPDATE / column. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="sr-only"
        aria-hidden="true"
      />

      <div className="flex flex-col sm:flex-row gap-2">
        {showLoad && (
          <button
            type="button"
            onClick={() => startCapture("load")}
            disabled={pending}
            className="flex-1 rounded-xl bg-blue-600 text-white font-semibold text-base px-4 py-3.5 min-h-[56px] hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
          >
            📦 ขึ้นรถ (ถ่ายรูป)
          </button>
        )}
        {showDeliver && (
          <button
            type="button"
            onClick={() => startCapture("deliver")}
            disabled={pending}
            className="flex-1 rounded-xl bg-green-600 text-white font-semibold text-base px-4 py-3.5 min-h-[56px] hover:bg-green-700 active:bg-green-800 disabled:opacity-60"
          >
            ✅ ส่งสำเร็จ (ถ่ายรูป)
          </button>
        )}
        {showFail && (
          <button
            type="button"
            onClick={runFail}
            disabled={pending}
            className="rounded-xl border border-red-300 bg-white text-red-700 font-semibold text-base px-4 py-3 min-h-[48px] hover:bg-red-50 active:bg-red-100 disabled:opacity-60"
          >
            ⚠️ ส่งไม่ได้
          </button>
        )}
      </div>

      {pending && (
        <p className="text-xs text-muted">⏳ กำลังบันทึก...</p>
      )}
      {err && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-2">
          {err}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Client-side image downscale — runs in a <canvas> to keep the upload
// fast on a phone with slow LTE. Targets ≤ 1600 px on the long edge +
// JPEG quality 0.82 (visibly identical to a 10 MP camera frame; ~250 KB
// typical). Rejects non-images gracefully so HEIC / weird MIMEs fall
// through to the raw file path.
//
// Returns the downscaled File (named like the original with `.jpg`) or
// null on failure (caller falls back to raw).
// ─────────────────────────────────────────────────────────────────────
async function downscaleImage(file: File): Promise<File | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const MAX = 1600;
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longEdge > MAX ? MAX / longEdge : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82),
    );
    if (!blob) return null;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
