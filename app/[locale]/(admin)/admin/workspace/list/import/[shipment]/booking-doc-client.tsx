"use client";

/**
 * ใบบุ๊คกิ้ง (booking document) — the shipment work-doc (owner brief 2026-07-08).
 *   Zone 1 หัว: identity + current status + progress.
 *   Zone 2 ข้อมูลงาน: editable shipment fields (แก้ไข → อัพเข้าไป).
 *   Zone 3 ไทม์ไลน์งาน: milestone timeline · each step = แนบรูปหลักฐาน → ระบบลงวันที่+ผู้ทำ
 *          อัตโนมัติ → สถานะเลื่อนขั้นถัดไปเอง (ไม่ต้องพิมพ์วันที่/ต่อเมล).
 * Prototype — client-state only (no DB · evidence preview is local, lost on refresh).
 */

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft, Check, CircleDashed, Upload, Ban, User, CalendarClock, Building2,
  Ship, Plane, Truck, Package, ImageIcon,
} from "lucide-react";
import { flowFor, MILESTONE_HINT, statusPill, type ListItem } from "../list-data";

type Completion = { date: string; user: string; evidenceUrl?: string; evidenceName?: string };

function transportIconEl(t: string, className: string) {
  const u = (t || "").toUpperCase();
  if (u.includes("AIR")) return <Plane className={className} />;
  if (u.includes("SEA")) return <Ship className={className} />;
  if (u.includes("TRUCK")) return <Truck className={className} />;
  return <Package className={className} />;
}

export function BookingDocClient({ item, userName }: { item: ListItem; userName: string }) {
  const flow = useMemo(() => flowFor(item.type), [item.type]);
  const [status, setStatus] = useState(item.status);
  const [data, setData] = useState<ListItem>(item);
  const [completed, setCompleted] = useState<Record<string, Completion>>({});
  const [pending, setPending] = useState<{ url: string; name: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cancelled = status === "ยกเลิก";
  const inFlow = flow.indexOf(status);
  const currentIndex = cancelled ? -1 : Math.max(0, inFlow);
  const set = (k: keyof ListItem) => (v: string) => setData((prev) => ({ ...prev, [k]: v }));

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPending({ url: URL.createObjectURL(f), name: f.name });
  }
  function completeCurrent() {
    if (cancelled || currentIndex < 0) return;
    const key = flow[currentIndex];
    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const date = `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
    setCompleted((prev) => ({ ...prev, [key]: { date, user: userName, evidenceUrl: pending?.url, evidenceName: pending?.name } }));
    const next = flow[currentIndex + 1];
    if (next) setStatus(next);
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/workspace/list/import" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-primary-600">
        <ArrowLeft className="h-3.5 w-3.5" /> กลับรายการนำเข้า
      </Link>

      {/* ── Zone 1 · หัวใบบุ๊คกิ้ง ─────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600">ใบบุ๊คกิ้ง</p>
            <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
              <span className="font-mono">{item.shipment}</span>
              <span className="rounded-md bg-primary-100 px-2 py-0.5 font-mono text-sm font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">{item.pr}</span>
            </h1>
            <p className="mt-1 text-sm text-foreground/80">{item.product}</p>
            <p className="text-xs text-muted">{item.consignee}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusPill(status)}`}>{status}</span>
            {!cancelled && (
              <span className="text-[11px] text-muted">ขั้น {currentIndex + 1} / {flow.length}</span>
            )}
            {confirmCancel ? (
              <span className="inline-flex items-center gap-1 text-[11px]">
                ยกเลิกงาน?
                <button onClick={() => { setStatus("ยกเลิก"); setConfirmCancel(false); }} className="rounded bg-rose-600 px-1.5 py-0.5 font-medium text-white">ยืนยัน</button>
                <button onClick={() => setConfirmCancel(false)} className="rounded border border-border px-1.5 py-0.5 text-muted">ไม่</button>
              </span>
            ) : !cancelled ? (
              <button onClick={() => setConfirmCancel(true)} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-rose-600">
                <Ban className="h-3 w-3" /> ยกเลิกงาน
              </button>
            ) : null}
          </div>
        </div>

        {/* progress bar */}
        {!cancelled && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((currentIndex / (flow.length - 1)) * 100)}%` }} />
          </div>
        )}

        {/* key facts */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Fact icon={<Building2 className="h-3 w-3" />}>{item.company}</Fact>
          <Fact icon={transportIconEl(item.type, "h-3 w-3")}>{item.type}</Fact>
          <Fact>{[item.term, item.size].filter(Boolean).join(" · ")}</Fact>
          <Fact>{item.pol || "—"} → {item.pod || "—"}</Fact>
          {item.carrier && <Fact icon={<Ship className="h-3 w-3" />}>{item.carrier}</Fact>}
          {(item.invNo || item.receiptNo) && <Fact>{[item.invNo, item.receiptNo].filter(Boolean).join(" · ")}</Fact>}
        </div>
      </div>

      {/* ── Zone 2 · ข้อมูลงาน (กรอก/แก้ไข) ───────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">ข้อมูลงาน</h2>
          <span className="text-[11px] text-muted">แก้ไขแล้วอัพเข้าระบบ · ตัวอย่าง (ยังไม่ต่อ DB)</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <F label="สายเรือ"><I value={data.carrier} onChange={set("carrier")} /></F>
          <F label="เรือ / เที่ยว"><I value={data.vessel} onChange={set("vessel")} /></F>
          <F label="B/L - AWB"><I value={data.blNo} onChange={set("blNo")} /></F>
          <F label="เลขตู้"><I value={data.containerNo} onChange={set("containerNo")} /></F>
          <F label="ETD"><I value={data.etd} onChange={set("etd")} placeholder="วว/ดด/ปปปป" /></F>
          <F label="ETA"><I value={data.eta} onChange={set("eta")} placeholder="วว/ดด/ปปปป" /></F>
          <F label="Form E / RCEP"><I value={data.formE} onChange={set("formE")} /></F>
          <F label="POD (ปลายทาง)"><I value={data.pod} onChange={set("pod")} /></F>
          <F label="CTNS"><I value={data.ctns} onChange={set("ctns")} /></F>
          <F label="CBM"><I value={data.cbm} onChange={set("cbm")} /></F>
          <F label="KGM"><I value={data.kgm} onChange={set("kgm")} /></F>
          <F label="ชิปปิ้ง (Doc)"><I value={data.shipping} onChange={set("shipping")} /></F>
        </div>
      </div>

      {/* ── Zone 3 · ไทม์ไลน์งาน + แนบหลักฐาน ─────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">ไทม์ไลน์งาน · แนบหลักฐาน</h2>
          <span className="text-[11px] text-muted">แนบรูป → ระบบลงวันที่ + ผู้ทำอัตโนมัติ → สถานะเลื่อนเอง</span>
        </div>

        {cancelled ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-4 text-center text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            🛑 งานนี้ถูกยกเลิก
          </div>
        ) : (
          <ol className="relative space-y-1">
            {flow.map((m, i) => {
              const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "pending";
              const rec = completed[m];
              return (
                <li key={m} className="flex gap-3">
                  {/* rail */}
                  <div className="flex flex-col items-center">
                    <span className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                      state === "done" ? "border-emerald-500 bg-emerald-500 text-white"
                        : state === "current" ? "border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30"
                          : "border-border bg-surface text-muted",
                    ].join(" ")}>
                      {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "current" ? <span className="h-2 w-2 rounded-full bg-primary-500" /> : <CircleDashed className="h-3.5 w-3.5" />}
                    </span>
                    {i < flow.length - 1 && <span className={`w-0.5 flex-1 ${i < currentIndex ? "bg-emerald-400" : "bg-border"}`} />}
                  </div>

                  {/* content */}
                  <div className={`min-w-0 flex-1 pb-3 ${state === "pending" ? "opacity-50" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPill(m)}`}>{m}</span>
                      {state === "done" && rec && (
                        <span className="inline-flex items-center gap-2 text-[11px] text-muted">
                          <span className="inline-flex items-center gap-0.5"><CalendarClock className="h-3 w-3" />{rec.date}</span>
                          <span className="inline-flex items-center gap-0.5"><User className="h-3 w-3" />{rec.user}</span>
                        </span>
                      )}
                      {state === "done" && !rec && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">เสร็จแล้ว</span>}
                    </div>

                    {/* evidence thumb on done */}
                    {state === "done" && rec?.evidenceUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rec.evidenceUrl} alt={rec.evidenceName ?? "หลักฐาน"} className="mt-1.5 h-16 w-24 rounded border border-border object-cover" />
                    )}

                    {/* current — the action */}
                    {state === "current" && (
                      <div className="mt-1.5 rounded-lg border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-500/30 dark:bg-primary-900/10">
                        <p className="text-xs text-foreground/80">{MILESTONE_HINT[m] ?? "ทำขั้นนี้แล้วแนบหลักฐาน"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button" onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-alt"
                          >
                            <Upload className="h-3.5 w-3.5" /> แนบรูปหลักฐาน
                          </button>
                          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
                          {pending ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={pending.url} alt="preview" className="h-8 w-10 rounded border border-border object-cover" />
                              <span className="max-w-[10rem] truncate">{pending.name}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted"><ImageIcon className="h-3 w-3" /> ยังไม่แนบ (แนบก่อนกดเสร็จ)</span>
                          )}
                          <button
                            type="button" onClick={completeCurrent}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                          >
                            <Check className="h-3.5 w-3.5" /> ทำขั้นนี้เสร็จ
                          </button>
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted">กดเสร็จ → ระบบลงวันที่-เวลา + ชื่อคุณ ({userName}) อัตโนมัติ → เลื่อนไป “{flow[currentIndex + 1] ?? "จบงาน"}”</p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Fact({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-muted">
      {icon}{children}
    </span>
  );
}
function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
function I({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40"
    />
  );
}
