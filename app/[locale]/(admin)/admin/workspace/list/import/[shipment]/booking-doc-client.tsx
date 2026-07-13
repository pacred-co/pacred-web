"use client";

/**
 * ใบบุ๊คกิ้ง (booking document) — the shipment work-doc (owner brief 2026-07-08).
 *   Zone 1 หัว: identity + current status + progress.
 *   Zone 2 ข้อมูลงาน: editable shipment fields (แก้ไข → อัพเข้าไป).
 *   Zone 3 ไทม์ไลน์งาน: milestone timeline · each step = แนบรูปหลักฐาน → ระบบลงวันที่+ผู้ทำ
 *          อัตโนมัติ → สถานะเลื่อนขั้นถัดไปเอง (ไม่ต้องพิมพ์วันที่/ต่อเมล).
 * Prototype — client-state only (no DB · evidence preview is local, lost on refresh).
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft, Check, Ban, Building2, FileText, Maximize2, Minimize2,
  Ship, Plane, Truck, Package, Mail, Paperclip, Send, Anchor,
} from "lucide-react";
import { flowFor, statusPill, type ListItem } from "../list-data";
import { DraftBarcode } from "@/components/ui/draft-barcode";
import { BookingJourney } from "@/components/workspace/booking-journey";

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
  const [confirmCancel, setConfirmCancel] = useState(false);
  // สลับ ย่อ/เต็ม ระหว่าง "ใบ Booking" กับ "เขียนอีเมล" (เหมือนหน้า booking · มี 2 แผง toggle สลับกัน)
  const [docFull, setDocFull] = useState(true);
  // สถานะอีเมล ยกขึ้นมาไว้ parent → ค้างตอนสลับ ย่อ/เต็ม (ไม่รีเซ็ตร่าง)
  const [email, setEmail] = useState({
    to: "",
    cc: "",
    subject: `[Pacred] Booking Confirmation ${item.shipment} — ${item.product}`,
    body: `เรียน ${item.consignee || "ลูกค้า"}\n\nบริษัท แพคเรด (ประเทศไทย) จำกัด ขอส่งใบ Booking สำหรับชิปเม้น ${item.shipment}\n\n• สินค้า: ${item.product || "-"}\n• เส้นทาง: ${item.pol || "-"} → ${item.pod || "-"} (${[item.type, item.size].filter(Boolean).join(" ")})\n• สายเรือ: ${item.carrier || "-"}${item.vessel ? ` · ${item.vessel}` : ""}\n• ETD: ${item.etd || "-"} · ETA: ${item.eta || "-"}\n\nรายละเอียดตามใบ Booking ที่แนบมา หากมีข้อสงสัยกรุณาติดต่อกลับ\n\nขอแสดงความนับถือ\n${userName}\nทีมงาน Pacred Shipping`,
    sent: false,
  });
  const updEmail = (patch: Partial<typeof email>) => setEmail((e) => ({ ...e, ...patch }));

  const cancelled = status === "ยกเลิก";
  const inFlow = flow.indexOf(status);
  const currentIndex = cancelled ? -1 : Math.max(0, inFlow);
  // 5-stage booking-doc stepper (BK·CT·leg·CU·DL) ← map จาก flow ละเอียด
  const docStage = cancelled ? -1 : flow.length > 1 ? Math.round((currentIndex / (flow.length - 1)) * 4) : 0;

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

      {/* ── ใบ Booking ↔ เขียนอีเมล · สลับ ย่อ/เต็ม (mockup · owner ปอน 2026-07-13) ─── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
        {docFull ? (
          <>
            <BookingConfirmationDoc item={item} status={status} stage={docStage} full onToggle={() => setDocFull((f) => !f)} />
            <EmailComposer item={item} full={false} onToggle={() => setDocFull((f) => !f)} email={email} upd={updEmail} />
          </>
        ) : (
          <>
            <EmailComposer item={item} full onToggle={() => setDocFull((f) => !f)} email={email} upd={updEmail} />
            <BookingConfirmationDoc item={item} status={status} stage={docStage} full={false} onToggle={() => setDocFull((f) => !f)} />
          </>
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
function CRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[11px] text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[11px] font-medium text-foreground">{children}</dd>
    </div>
  );
}

// ═══════════════ ฟอร์มใบ Booking (booking-confirmation · จาก ListItem จริง · แบบหน้า booking) ═══════════════
function legInfo(type: string) {
  const u = (type || "").toUpperCase();
  if (u.includes("AIR")) return { code: "FL", label: "เที่ยวบินออก", typeLabel: "ทางอากาศ", Icon: Plane };
  if (u.includes("TRUCK")) return { code: "TR", label: "รถออกต้นทาง", typeLabel: "ทางรถ", Icon: Truck };
  return { code: "VS", label: "เรือออกต้นทาง", typeLabel: "ทางเรือ", Icon: Ship };
}
function guessCountry(port: string, fallbackName: string) {
  const p = (port || "").toUpperCase();
  const th = ["BKK", "BANGKOK", "PAT", "LAEM", "LCB", "THAI", "แหลม", "กรุงเทพ"];
  if (th.some((k) => p.includes(k.toUpperCase()))) return { code: "TH", name: "ไทย" };
  const cn = ["TIANJIN", "SHANGHAI", "NANSHA", "SHENZHEN", "GUANGZHOU", "NINGBO", "QINGDAO", "XIAMEN", "จีน", "กวางโจว", "เทียนจิน", "อี้อู"];
  if (cn.some((k) => p.includes(k.toUpperCase()))) return { code: "CN", name: "จีน" };
  return { code: fallbackName === "ไทย" ? "TH" : "CN", name: fallbackName };
}

function BookingConfirmationDoc({ item, status, stage, full, onToggle }: { item: ListItem; status: string; stage: number; full: boolean; onToggle: () => void }) {
  const leg = legInfo(item.type);
  const LegIcon = leg.Icon;
  const from = guessCountry(item.pol, "จีน");
  const to = guessCountry(item.pod, "ไทย");

  if (!full) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"><FileText className="h-4 w-4" /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">ใบ Booking</h2>
              <p className="font-mono text-[11px] text-muted">{item.shipment}</p>
            </div>
          </div>
          <button type="button" onClick={onToggle} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/50"><Maximize2 className="h-3.5 w-3.5" /> ดูเต็ม</button>
        </div>
        <div className="mb-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusPill(status)}`}>{status}</span></div>
        <dl className="space-y-1.5">
          <CRow label="เส้นทาง">{item.pol || "—"} → {item.pod || "—"}</CRow>
          <CRow label="ขนส่ง">{[item.type, item.size, item.carrier].filter(Boolean).join(" · ") || "—"}</CRow>
          <CRow label="ETD / ETA">{item.etd || "—"} · {item.eta || "—"}</CRow>
          <CRow label="สินค้า">{item.product || "—"}</CRow>
        </dl>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
      <span aria-hidden className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden">
        <span className="rotate-[-20deg] text-[100px] font-black leading-none tracking-[0.15em] text-foreground/[0.04]">BOOKING</span>
      </span>

      {/* header */}
      <div className="relative z-10 flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">ใบ Booking</h2>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">BOOKING CONFIRMATION • SHIPMENT {item.shipment}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusPill(status)}`}>{status}</span>
          <button type="button" onClick={onToggle} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"><Minimize2 className="h-4 w-4" /> ย่อ</button>
        </div>
      </div>

      <div className="relative z-10 space-y-5 p-5">
        {/* barcode + chips */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DraftBarcode text={item.shipment} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground"><Building2 className="h-3.5 w-3.5" />{item.company || "PACRED"}</span>
            <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">TERM: {item.term || "—"} · IMPORT</span>
            <span className="rounded-md bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{[item.type, item.size].filter(Boolean).join(" ") || "—"}</span>
            {item.carrier && <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted">{item.carrier}</span>}
          </div>
        </div>

        {/* stepper — รูปสถานะจริง · ชุด stage ขึ้นกับ TERM × ขนส่ง (Incoterms) */}
        <BookingJourney term={item.term} mode={item.type} progress={stage < 0 ? 0 : stage / 4} />

        {/* main + route */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-3 text-sm font-black text-primary-600">ข้อมูลหลักของ Booking</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <DocField label="DATE" value={item.date} />
              <DocField label="INV NO." value={item.invNo || item.shipment} />
              <DocField label="SHIPMENT" value={item.shipment} />
              <DocField label="B/L - AWB" value={item.blNo} />
              <DocField label="PRICING / DOC / SALE" value={[item.sales, item.docFreight].filter(Boolean).join(" / ")} />
              <DocField label="TR" value={leg.typeLabel} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-3 text-sm font-black text-primary-600">เส้นทางและการขนส่ง</p>
            <div className="flex items-center gap-3">
              <div className="shrink-0 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">{from.code}</div>
                <div className="mt-1 text-[11px] font-semibold text-foreground">{item.pol || "—"}</div>
                <div className="text-[10px] text-muted">{from.name}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex flex-wrap items-center justify-center gap-1 text-center text-[11px] font-semibold text-primary-600"><LegIcon className="h-4 w-4 shrink-0" /> {item.carrier || leg.typeLabel}{item.size ? ` · ${item.size}` : ""}</div>
                <div className="my-1 h-0.5 w-full bg-primary-500" />
                <div className="text-[10px] text-muted">ETD {item.etd || "—"} · ETA {item.eta || "—"}</div>
              </div>
              <div className="shrink-0 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">{to.code}</div>
                <div className="mt-1 text-[11px] font-semibold text-foreground">{item.pod || "—"}</div>
                <div className="text-[10px] text-muted">{to.name}</div>
              </div>
            </div>
          </div>
        </div>

        {/* customer + freight */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-primary-600"><Building2 className="h-4 w-4 text-primary-500" /> ข้อมูลลูกค้า / ต้นทาง</p>
            <DocLine label="Consignee / Customer" value={item.consignee} strong />
            <DocLine label="บริษัท" value={item.company} />
            <DocLine label="ที่อยู่ปลายทาง" value={item.address} />
            <DocLine label="Form E / RCEP" value={item.formE} />
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-primary-600"><Anchor className="h-4 w-4 text-primary-500" /> ข้อมูล Freight / Port</p>
            <DocLine label="Port of Loading" value={`${from.name} · ${item.pol}`} />
            <DocLine label="Destination" value={`${to.name} · ${item.pod}`} />
            <DocLine label="Shipping Line" value={item.carrier} strong />
            <DocLine label="เรือ / เที่ยว" value={item.vessel} />
            <DocLine label="เลขตู้" value={item.containerNo} />
          </div>
        </div>

        {/* commodity table */}
        <div>
          <p className="mb-2 text-sm font-black text-primary-600">รายการสินค้า / Container</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">INV / Shipment</th>
                  <th className="px-3 py-2 font-semibold">Commodity</th>
                  <th className="px-3 py-2 font-semibold">Load</th>
                  <th className="px-3 py-2 font-semibold">CTNS</th>
                  <th className="px-3 py-2 font-semibold">Weight / CBM</th>
                  <th className="px-3 py-2 font-semibold">POL</th>
                  <th className="px-3 py-2 font-semibold">POD</th>
                  <th className="px-3 py-2 font-semibold">Line</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold text-primary-600">{item.shipment}</td>
                  <td className="px-3 py-2 font-semibold text-primary-600">{item.product || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{item.size || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{item.ctns || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{[item.kgm && `${item.kgm} กก.`, item.cbm && `${item.cbm} CBM`].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{item.pol || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{item.pod || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{item.carrier || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ข้อมูลปฏิบัติการ (เติม ETD/ETA จากข้อมูลจริง · ที่เหลือกรอกตอนดำเนินงาน) */}
        <div>
          <p className="mb-2 text-sm font-black text-primary-600">ข้อมูลปฏิบัติการ</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {[
              { label: "CY Date", value: "" },
              { label: "ETD", value: item.etd },
              { label: "ETA", value: item.eta },
              { label: "Empty Return", value: "" },
              { label: "Local Logistics", value: "" },
              { label: "Manpower", value: "" },
              { label: "Register", value: "" },
              { label: "Duty / VAT", value: "" },
              { label: "Customs Clearance", value: "" },
            ].map((o) => (
              <div key={o.label} className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-1.5 text-center">
                <div className="text-[10px] font-medium text-muted">{o.label}</div>
                <div className="text-xs text-muted">{o.value || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground" title={value}>{value || "—"}</div>
    </div>
  );
}
function DocLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] text-muted">{label}</span>
      <span className={`min-w-0 break-words text-right text-xs ${strong ? "font-semibold text-foreground" : "text-foreground/90"}`}>{value || "—"}</span>
    </div>
  );
}

// ═══════════════ เขียนอีเมลส่งใบ Booking (mockup · state ยกไป parent) ═══════════════
type EmailState = { to: string; cc: string; subject: string; body: string; sent: boolean };
function EmailComposer({ item, full, onToggle, email, upd }: {
  item: ListItem;
  full: boolean;
  onToggle: () => void;
  email: EmailState;
  upd: (patch: Partial<EmailState>) => void;
}) {
  const [confirm, setConfirm] = useState(false);

  if (!full) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"><Mail className="h-4 w-4" /></span>
            <div>
              <h2 className="text-sm font-bold text-foreground">เขียนอีเมล</h2>
              <p className="text-[11px] text-muted">ส่งใบ Booking</p>
            </div>
          </div>
          <button type="button" onClick={onToggle} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/50"><Maximize2 className="h-3.5 w-3.5" /> ดูเต็ม</button>
        </div>
        <dl className="space-y-1.5">
          <CRow label="ถึง">{email.to || "— ยังไม่ระบุ —"}</CRow>
          <CRow label="หัวเรื่อง">{email.subject}</CRow>
          <CRow label="สถานะ">{email.sent ? "✅ ส่งแล้ว (ตัวอย่าง)" : "ร่าง"}</CRow>
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"><Mail className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-bold text-foreground">เขียนอีเมลส่งใบ Booking</h2>
            <p className="text-[11px] text-muted">ส่งใบ Booking ให้ลูกค้า / สายเรือ</p>
          </div>
        </div>
        <button type="button" onClick={onToggle} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"><Minimize2 className="h-4 w-4" /> ย่อ</button>
      </div>

      {email.sent ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-6 text-center text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check className="mx-auto mb-1 h-6 w-6" />
          ส่งอีเมลแล้ว (ตัวอย่าง)
          <button type="button" onClick={() => { upd({ sent: false }); setConfirm(false); }} className="mx-auto mt-2 block text-[11px] font-normal text-muted underline hover:text-foreground">เขียนใหม่</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <MailField label="ถึง (To)"><MailInput value={email.to} onChange={(v) => upd({ to: v })} placeholder="customer@email.com" /></MailField>
          <MailField label="สำเนา (Cc)"><MailInput value={email.cc} onChange={(v) => upd({ cc: v })} placeholder="—" /></MailField>
          <MailField label="หัวเรื่อง"><MailInput value={email.subject} onChange={(v) => upd({ subject: v })} /></MailField>
          <MailField label="ข้อความ">
            <textarea
              value={email.body} onChange={(e) => upd({ body: e.target.value })} rows={9}
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40"
            />
          </MailField>
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
            <Paperclip className="h-3.5 w-3.5 text-muted" />
            <span className="truncate text-[11px] font-medium text-foreground">Booking-{item.shipment}.pdf</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted">แนบอัตโนมัติ</span>
          </div>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-[11px] dark:bg-primary-500/10">
              ส่งอีเมลนี้?
              <button type="button" onClick={() => { upd({ sent: true }); setConfirm(false); }} className="ml-auto rounded bg-primary-600 px-2.5 py-1 font-semibold text-white">ยืนยันส่ง</button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded border border-border px-2.5 py-1 text-muted">ยกเลิก</button>
            </div>
          ) : (
            <button
              type="button" onClick={() => setConfirm(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-700"
            >
              <Send className="h-4 w-4" /> ส่งอีเมล
            </button>
          )}
          <p className="text-center text-[10px] text-muted">prototype (client-state) · ยังไม่ต่อระบบส่งเมลจริง</p>
        </div>
      )}
    </section>
  );
}

function MailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
function MailInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted/60 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40"
    />
  );
}
