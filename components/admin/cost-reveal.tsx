"use client";

/**
 * Cost-reveal blur gate — owner ภูม 2026-06-16:
 *   "อะไรที่แสดงเกี่ยวกับข้อมูลราคาต้นทุน ให้ใส่เบลอไปก่อน · หากใครจะดู ให้กดลูกตา
 *    ใส่รหัส 0948782006 → ขึ้นทั้งหมด · รีเฟรช/ออกจากระบบแล้วเข้าใหม่ ต้องใส่รหัสใหม่"
 *
 * This is a VISUAL blur layer that sits ON TOP OF the existing server-side role
 * gate (dave 2026-06-15 — cost renders only to super/accounting/pricing +
 * freight managers). For the roles that DO see cost, every cost number is
 * blurred until the viewer enters the PIN — protects against shoulder-surfing /
 * casual viewing on shared warehouse + office screens.
 *
 * State lives in React memory (`CostRevealProvider`, mounted in the admin
 * layout) → it is SHARED across client-side navigations (unlock once, see cost
 * on every admin page) but RESET on a hard refresh or re-login, because the
 * layout unmounts — exactly the owner's "รีเฟรช/หลุด → ใส่รหัสใหม่".
 *
 * The PIN is verified SERVER-SIDE (`verifyCostRevealPin`) so the literal code
 * never ships in the client bundle. The blur is CSS-only (the value stays in
 * the DOM) — the server role gate is the real access control.
 *
 * Building blocks:
 *   <CostRevealProvider>  — mount once in the admin layout
 *   <CostRevealToggle />  — the eye button (place in a cost-section header)
 *   <CostValue>{n}</CostValue>        — blur a single inline cost number
 *   <CostRevealRegion>…</CostRevealRegion> — blur a whole cost panel/editor
 *   useCostReveal()       — { revealed, toggle } for custom call sites
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { verifyCostRevealPin } from "@/actions/admin/cost-reveal";

type CostRevealCtx = {
  /** true once the PIN has been entered correctly this session. */
  revealed: boolean;
  /** Eye toggle: relock when revealed, else open the PIN dialog. */
  toggle: () => void;
  /** true for the cost-owner roles (super / accounting / pricing) — they see
   *  cost PLAIN, never blurred, and the eye is hidden for them. */
  bypass: boolean;
};

const Ctx = createContext<CostRevealCtx | null>(null);

/** Safe default when used outside a provider → stays hidden (fail-closed). */
export function useCostReveal(): CostRevealCtx {
  return useContext(Ctx) ?? { revealed: false, toggle: () => {}, bypass: false };
}

/**
 * @param bypass — true for super/accounting/pricing (owner ภูม 2026-06-17:
 *   "เบลอต้นทุนทุก role ยกเว้น super/บัญชี/pricing"). Those roles see cost plain
 *   (revealed by default, no PIN, no eye). Every OTHER cost-seeing role gets the
 *   blur + PIN gate. Roles dave's server gate hides entirely stay hidden.
 */
export function CostRevealProvider({
  children,
  bypass = false,
}: {
  children: ReactNode;
  bypass?: boolean;
}) {
  const [revealed, setRevealed] = useState(bypass);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-created when `revealed` flips — fine; consumers don't memoize on it.
  const toggle = useCallback(() => {
    if (revealed) {
      setRevealed(false); // relock immediately
      return;
    }
    setPin("");
    setError(null);
    // guard double-open (React StrictMode / double-click): showModal() throws
    // if the dialog is already open.
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, [revealed]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyCostRevealPin(pin);
      if (res.ok) {
        setRevealed(true);
        dialogRef.current?.close();
        setPin("");
      } else {
        setError("รหัสไม่ถูกต้อง");
      }
    } catch {
      setError("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider value={{ revealed, toggle, bypass }}>
      {children}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="rounded-xl p-0 border border-gray-200 shadow-xl backdrop:bg-black/50 w-[min(380px,95vw)]"
      >
        <form onSubmit={onSubmit} className="p-5">
          <div className="flex items-center gap-2 text-gray-900">
            <Lock className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <h2 className="text-base font-semibold">ดูข้อมูลต้นทุน</h2>
          </div>
          <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
            กรอกรหัสเพื่อแสดงข้อมูลต้นทุนทั้งหมด · ระบบจะซ่อนอีกครั้งเมื่อรีเฟรชหน้าหรือออกจากระบบ
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="รหัสผ่าน"
            aria-label="รหัสผ่านดูต้นทุน"
            className="mt-3 w-full h-11 rounded-lg border-2 border-gray-300 px-3 text-base tracking-widest focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          />
          {error && (
            <p className="mt-2 text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy || pin.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              ปลดล็อก
            </button>
          </div>
        </form>
      </dialog>
    </Ctx.Provider>
  );
}

/**
 * Blur a single inline cost value. When locked, renders blurred + non-selectable
 * (aria-hidden so screen readers don't leak it). For interactive controls or
 * whole panels use <CostRevealRegion>.
 */
export function CostValue({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { revealed } = useCostReveal();
  if (revealed) return <span className={className}>{children}</span>;
  return (
    <span
      className={`select-none blur-[6px] ${className}`}
      aria-hidden="true"
      title="ซ่อนต้นทุน — กดปุ่ม “ดูต้นทุน” เพื่อแสดง"
    >
      {children}
    </span>
  );
}

/**
 * Blur a whole cost panel / editor block. When locked the region is blurred AND
 * non-interactive (pointer-events-none) so a blurred cost editor can't be
 * tabbed into + edited without unlocking.
 */
export function CostRevealRegion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { revealed } = useCostReveal();
  return (
    <div
      className={`${revealed ? "" : "select-none blur-[6px] pointer-events-none"} ${className}`}
      aria-hidden={!revealed}
    >
      {children}
    </div>
  );
}

/**
 * The eye toggle button — place in a cost-section header. Amber when locked
 * ("ดูต้นทุน"), emerald when revealed ("ซ่อนต้นทุน").
 */
export function CostRevealToggle({ className = "" }: { className?: string }) {
  const { revealed, toggle, bypass } = useCostReveal();
  // super / accounting / pricing see cost plain → no eye, no PIN.
  if (bypass) return null;
  return (
    <button
      type="button"
      // stopPropagation so the eye is safe inside a clickable parent (e.g. a
      // collapsible <summary> header) — clicking it must not toggle the parent.
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-pressed={revealed}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        revealed
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
          : "bg-amber-100 text-amber-800 hover:bg-amber-200"
      } ${className}`}
    >
      {revealed ? (
        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {revealed ? "ซ่อนต้นทุน" : "ดูต้นทุน"}
    </button>
  );
}
