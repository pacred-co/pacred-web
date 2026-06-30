"use client";

/**
 * Shared UI kit for the marketing planner — self-contained (no external dialog/
 * toast lib) so the whole feature is a portable module. Badges read colors from
 * the settings store; Modal + ConfirmProvider give every mutation a §0f confirm.
 */
import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { usePlanner } from "@/lib/marketing-planner/store";
import type { SettingGroup } from "@/lib/marketing-planner/types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── Button + input class tokens ──
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-primary-50 hover:text-primary-700";
export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700";
export const iconBtn =
  "inline-flex items-center justify-center rounded-lg p-1.5 text-muted transition hover:bg-primary-50 hover:text-primary-700";
export const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/60 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30";

/** Translucent-bg colored pill. Expects a 6-digit hex color. */
export function Tag({ color, label, dot = true, className }: { color?: string; label: ReactNode; dot?: boolean; className?: string }) {
  const c = color || "#94a3b8";
  const style: CSSProperties = { backgroundColor: `${c}1a`, color: c };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", className)} style={style}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Any setting → colored tag (resolves name+color from the store). */
export function SettingTag({ id, fallback = "—" }: { id?: string; fallback?: string }) {
  const { byId } = usePlanner();
  const s = byId(id);
  if (!s) return <span className="text-[11px] text-muted">{fallback}</span>;
  return <Tag color={s.color} label={s.name} />;
}

export function StatusBadge({ statusId }: { statusId?: string }) {
  return <SettingTag id={statusId} fallback="ไม่มีสถานะ" />;
}

export function OwnerBadge({ ownerId, withName = true }: { ownerId?: string; withName?: boolean }) {
  const { userById, userColor } = usePlanner();
  const u = userById(ownerId);
  if (!u) return null;
  const initial = u.name.trim().charAt(0) || "?";
  return (
    <span className="inline-flex items-center gap-1.5">
      {u.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.avatarUrl} alt={u.name} className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: userColor(u.id) }}>
          {initial}
        </span>
      )}
      {withName && <span className="text-[12px] text-foreground">{u.name}</span>}
    </span>
  );
}

/** Dropdown of real admin/staff accounts (owner). */
export function UserSelect({ value, onChange, placeholder = "— เลือกผู้รับผิดชอบ —", className }: { value?: string; onChange: (v: string | undefined) => void; placeholder?: string; className?: string }) {
  const { users } = usePlanner();
  const selectedMissing = value && !users.some((u) => u.id === value) ? value : undefined;
  return (
    <select className={cx(inputCls, className)} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{placeholder}</option>
      {selectedMissing && <option value={selectedMissing}>(ผู้ใช้เดิม)</option>}
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name}{u.role ? ` · ${u.role}` : ""}</option>
      ))}
    </select>
  );
}

/** Multi-select chips of real admin/staff (co-owners). */
export function UserMultiPicker({ value, onChange, exclude }: { value: string[]; onChange: (ids: string[]) => void; exclude?: string }) {
  const { users } = usePlanner();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  if (users.length === 0) return <span className="text-[11px] text-muted">ยังไม่มีรายชื่อทีมในระบบ (ดึงจาก /admin/admins)</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {users.map((u) => {
        const on = value.includes(u.id);
        return (
          <button key={u.id} type="button" onClick={() => toggle(u.id)} disabled={u.id === exclude}
            className={cx("rounded-full border px-2.5 py-1 text-[12px] transition disabled:opacity-40", on ? "border-primary-300 bg-primary-50 font-semibold text-primary-700" : "border-border text-muted hover:border-primary-200")}>
            {u.name}
          </button>
        );
      })}
    </div>
  );
}

export function MetricCard({ label, value, sub, accent, onClick }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; onClick?: () => void }) {
  const cls = cx(
    "rounded-2xl border border-border bg-white dark:bg-surface p-3.5 text-left shadow-sm transition",
    onClick && "hover:-translate-y-0.5 hover:border-primary-200",
  );
  const body = (
    <>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-black text-foreground" style={accent ? { color: accent } : undefined}>{value}</p>
      {sub != null && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

export function Field({ label, required, hint, children, className }: { label?: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1", className)}>
      {label && (
        <span className="block text-[12px] font-medium text-foreground">
          {label}
          {required && <span className="text-primary-600"> *</span>}
        </span>
      )}
      {children}
      {hint && <span className="block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/** Dropdown driven by a settings group (active options + the currently-selected
 *  inactive one kept visible so editing old data never silently drops a value). */
export function GroupSelect({ group, value, onChange, placeholder = "— เลือก —", className }: { group: SettingGroup; value?: string; onChange: (v: string | undefined) => void; placeholder?: string; className?: string }) {
  const { byGroup, byId } = usePlanner();
  const opts = byGroup(group);
  const selectedInactive = value && !opts.some((o) => o.id === value) ? byId(value) : undefined;
  return (
    <select className={cx(inputCls, className)} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{placeholder}</option>
      {selectedInactive && <option value={selectedInactive.id}>{selectedInactive.name} (ปิดใช้งาน)</option>}
      {opts.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

export function SectionCard({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-sm font-bold text-foreground">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white/50 dark:bg-surface/50 px-6 py-12 text-center">
      {icon && <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/30">{icon}</span>}
      <h4 className="text-sm font-bold text-foreground">{title}</h4>
      {message && <p className="max-w-md text-[12px] leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type ModalSize = "sm" | "md" | "lg" | "xl";
export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: ModalSize }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-md" : "max-w-xl";
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div className={cx("relative my-2 w-full rounded-2xl bg-white shadow-xl dark:bg-surface sm:my-6", w)} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-border bg-white px-5 py-3.5 dark:bg-surface">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className={iconBtn} aria-label="ปิด"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-border bg-white px-5 py-3 dark:bg-surface">{footer}</div>}
      </div>
    </div>
  );
}

// ── Imperative confirm — await confirm({...}) anywhere under <ConfirmProvider> ──
type ConfirmOpts = { title?: string; message?: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean };
const ConfirmContext = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [resolver, setResolver] = useState<{ fn: (v: boolean) => void } | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    setOpts(o);
    setResolver({ fn: resolve });
  }), []);

  const close = useCallback((v: boolean) => {
    resolver?.fn(v);
    setResolver(null);
    setOpts(null);
  }, [resolver]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? "ยืนยันการทำรายการ"}
        size="sm"
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => close(false)}>{opts?.cancelText ?? "ยกเลิก"}</button>
            <button type="button" className={opts?.danger ? btnDanger : btnPrimary} onClick={() => close(true)}>{opts?.confirmText ?? "ยืนยัน"}</button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">{opts?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (o: ConfirmOpts) => Promise<boolean> {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return c;
}
