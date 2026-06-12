"use client";

/**
 * AdminToolsPinGate — collapses the whole "เครื่องมือผู้ดูแล · Pacred" tools block
 * (Margin Profile · ค่าเทียบ/เครดิต · แท็ก/กิจกรรม · นิติบุคคล · Danger Zone) behind a
 * light-gray "V" dropdown. Clicking it pops a PIN dialog; the tools reveal only
 * after the correct PIN is entered.
 *
 * ⚠️ This is a UX DETERRENT, not a security boundary — the PIN lives in the client
 * bundle and the children are still in the RSC payload. Real protection stays at the
 * server: each editor re-checks the admin role + the page is requireAdmin-gated. This
 * just keeps casual viewers from fiddling with the money/danger tools at a glance.
 *
 * The children (a mix of server + client components) are passed through the React
 * `children` slot, so no server data-fetch moves to the client.
 */

import { useState } from "react";
import { Lock, ChevronDown, X } from "lucide-react";

const TOOLS_PIN = "0948782006";

export function AdminToolsPinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.trim() === TOOLS_PIN) {
      setUnlocked(true);
      setAsk(false);
      setPin("");
      setErr(false);
    } else {
      setErr(true);
    }
  }

  // ── Unlocked: show everything + a "ซ่อน" re-lock affordance ──
  if (unlocked) {
    return (
      <div className="space-y-5">
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={() => setUnlocked(false)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-alt"
          >
            <Lock className="h-3.5 w-3.5" /> ซ่อนเครื่องมือ
          </button>
        </div>
        {children}
      </div>
    );
  }

  // ── Collapsed: the light-gray "V" dropdown trigger ──
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAsk(true);
          setErr(false);
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt/60 px-2.5 py-1 text-xs font-semibold text-muted transition hover:bg-surface-alt"
        aria-label="เปิดเครื่องมือผู้ดูแล (ต้องใส่ PIN)"
      >
        <Lock className="h-3.5 w-3.5" />
        <span>V</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {ask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAsk(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-border bg-white p-5 shadow-xl dark:bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Lock className="h-4 w-4 text-primary-600" /> ใส่ PIN
              </h3>
              <button
                type="button"
                onClick={() => setAsk(false)}
                className="text-muted hover:text-foreground"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted">
              ใส่รหัส PIN เพื่อเปิดเครื่องมือผู้ดูแล · Pacred
            </p>
            <form onSubmit={submit} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setErr(false);
                }}
                placeholder="••••••••••"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-center font-mono tracking-widest text-foreground focus:border-primary-600 focus:outline-none dark:bg-surface"
              />
              {err && <p className="text-xs text-red-600">PIN ไม่ถูกต้อง</p>}
              <button
                type="submit"
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
              >
                ปลดล็อก
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
