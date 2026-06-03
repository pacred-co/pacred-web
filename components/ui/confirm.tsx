"use client";

/**
 * Global imperative dialogs — drop-in replacements for the native
 * `window.confirm` / `window.alert` / `window.prompt` browser popups, which
 * render ugly, un-styled, top-of-screen boxes. These show a single centered,
 * Pacred-styled `<dialog>` instead.
 *
 * Usage (any client component):
 *   import { confirm, alert, prompt } from "@/components/ui/confirm";
 *   if (!(await confirm("ลบรายการนี้?"))) return;          // → boolean
 *   await alert("บันทึกแล้ว");                              // → void
 *   const reason = await prompt("เหตุผล?");                 // → string | null
 *
 * The host (`<ConfirmDialogHost />`) is mounted ONCE in
 * `app/[locale]/layout.tsx`, so every route group (public / protected / admin /
 * auth) shares it — no per-component wiring. If the host isn't mounted (SSR,
 * tests), the functions fall back to the real `window.*` so nothing breaks.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, PencilLine } from "lucide-react";

type Kind = "confirm" | "alert" | "prompt";

type DialogReq = {
  kind: Kind;
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
};

type DialogResult = { ok: boolean; value?: string };

// Module singleton — the mounted <ConfirmDialogHost/> registers this opener.
let openDialog: ((req: DialogReq) => Promise<DialogResult>) | null = null;

function nativeFallback(req: DialogReq): DialogResult {
  if (typeof window === "undefined") return { ok: false };
  if (req.kind === "alert") {
    window.alert(req.message);
    return { ok: true };
  }
  if (req.kind === "prompt") {
    const v = window.prompt(req.message, req.defaultValue ?? "");
    return v === null ? { ok: false } : { ok: true, value: v };
  }
  return { ok: window.confirm(req.message) };
}

function request(req: DialogReq): Promise<DialogResult> {
  return openDialog ? openDialog(req) : Promise.resolve(nativeFallback(req));
}

type ConfirmOpts = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/** Centered styled confirm — drop-in for `window.confirm`. Resolves true/false. */
export function confirm(message: string, opts?: ConfirmOpts): Promise<boolean> {
  return request({ kind: "confirm", message, ...opts }).then((r) => r.ok);
}

/** Centered styled alert — drop-in for `window.alert`. */
export function alert(message: string, opts?: { title?: string }): Promise<void> {
  return request({ kind: "alert", message, ...opts }).then(() => undefined);
}

/** Centered styled prompt — drop-in for `window.prompt`. Resolves string | null. */
export function prompt(
  message: string,
  defaultValue = "",
  opts?: { title?: string; confirmLabel?: string },
): Promise<string | null> {
  return request({ kind: "prompt", message, defaultValue, ...opts }).then((r) =>
    r.ok ? r.value ?? "" : null,
  );
}

// ──────────────────────────────────────────────────────────────
// Host — mount once at the locale-layout root.
// ──────────────────────────────────────────────────────────────

export function ConfirmDialogHost() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [req, setReq] = useState<
    (DialogReq & { resolve: (r: DialogResult) => void }) | null
  >(null);

  useEffect(() => {
    openDialog = (r) =>
      new Promise<DialogResult>((resolve) => {
        setReq({ ...r, resolve });
        // ref must be attached before showModal() — defer one microtask.
        queueMicrotask(() => {
          dialogRef.current?.showModal();
          if (r.kind === "prompt") {
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        });
      });
    return () => {
      openDialog = null;
    };
  }, []);

  function done(result: DialogResult) {
    req?.resolve(result);
    dialogRef.current?.close();
    setReq(null);
  }

  const isConfirm = req?.kind === "confirm";
  const isAlert = req?.kind === "alert";
  const isPrompt = req?.kind === "prompt";
  const Icon = isAlert ? Info : isPrompt ? PencilLine : AlertTriangle;

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        if (req) {
          req.resolve({ ok: false });
          setReq(null);
        }
      }}
      onClick={(e) => {
        // Backdrop click (target === dialog) cancels.
        if (e.target === dialogRef.current) done({ ok: false });
      }}
      className="m-auto w-[min(440px,92vw)] rounded-2xl border border-gray-200 bg-white p-0 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop:bg-black/50 backdrop:backdrop-blur-[2px] dark:border-border dark:bg-surface"
    >
      {req && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            done(
              isPrompt
                ? { ok: true, value: inputRef.current?.value ?? "" }
                : { ok: true },
            );
          }}
          className="p-5 md:p-6"
        >
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isAlert
                  ? "bg-primary-50 text-primary-600 dark:bg-primary-950/40"
                  : "bg-red-50 text-red-600 dark:bg-red-950/40"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              {req.title && (
                <h2 className="mb-1 text-[15px] font-bold text-gray-900 dark:text-white">
                  {req.title}
                </h2>
              )}
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700 dark:text-foreground/85">
                {req.message}
              </p>
              {isPrompt && (
                <input
                  ref={inputRef}
                  defaultValue={req.defaultValue}
                  className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[14px] text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-border dark:bg-background dark:text-white"
                />
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            {(isConfirm || isPrompt) && (
              <button
                type="button"
                onClick={() => done({ ok: false })}
                className="rounded-lg border border-gray-300 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-border dark:text-foreground dark:hover:bg-surface-alt"
              >
                {req.cancelLabel ?? "ยกเลิก"}
              </button>
            )}
            <button
              type="submit"
              className={`rounded-lg px-4 py-2 text-[13.5px] font-bold text-white shadow-sm transition-colors ${
                isConfirm
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-primary-600 hover:bg-primary-700"
              }`}
            >
              {req.confirmLabel ?? (isConfirm ? "ยืนยัน" : "ตกลง")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
