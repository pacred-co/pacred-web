"use client";

/**
 * ฟอร์มสร้าง/ดู ใบเสนอราคา (Quotation) — งานนำเข้า.
 * 2026-07-09 (ปอน · owner brief) — FIRST CUT. หน้าตา: สถานะด้านบน (stepper) + ใบเสนอราคาข้างล่าง
 *   (สไตล์ Peak). รายการราคาเปลี่ยนตามเงื่อนไข (Condition Builder) — TERM/PORT/ประเภทตู้/ENTER.
 *   ราคาที่โชว์ = SELL · COST/PROFIT ไม่โชว์บนใบลูกค้า. ยัง prototype (client-state · ยังไม่ต่อ DB).
 *   ปุ่ม flow (บันทึก/ส่งราคา/คอนเฟิร์ม) จะทำใน step ถัดไป — ตอนนี้ทำแค่ฟอร์ม.
 */

import { useMemo, useState, type ReactNode, type ChangeEvent } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ArrowLeft, Plus, Trash2, Paperclip, X, Ship, Plane, Truck, Package, type LucideIcon } from "lucide-react";
import { BOOKING_STATUS_META, type Booking, type BookingStatus } from "../booking-data";
import {
  SERVICE_OPTIONS, TERM_OPTIONS, PORT_OPTIONS, CONTAINER_OPTIONS, ENTER_OPTIONS, SPECIAL_OPTIONS,
  linesForConditions, computeQuoteTotals, bahtFmt, templateKeyOf, IMPORT_QUOTE_TEMPLATES,
  type QuoteConditions, type QuoteLine,
} from "../quotation-data";
import { lookupMemberByCode } from "@/actions/admin/booking-member-lookup";

// ลำดับ stepper (ตัด "ยกเลิก" ออก — โชว์เป็น banner แยก)
const STEPPER: BookingStatus[] = [
  "customer_created", "pending_pricing", "awaiting_confirm", "awaiting_booking", "booking_confirmed", "success",
];

// บนฟอร์ม (admin สร้างเอง) สถานะ customer_created แสดงเป็น "กำลังสร้าง QT/Booking";
// ป้ายบนบอร์ด (BOOKING_STATUS_META) คงเดิม "ลูกค้าสร้าง Booking" — ไว้สำหรับลูกค้าสร้างจากหน้าเว็บในอนาคต (owner 2026-07-09).
function formStatusLabel(s: BookingStatus): string {
  return s === "customer_created" ? "กำลังสร้าง QT/Booking" : BOOKING_STATUS_META[s].label;
}

function serviceIcon(service: string): LucideIcon {
  if (/AIR/i.test(service)) return Plane;
  if (/TRUCK/i.test(service)) return Truck;
  if (/SEA/i.test(service)) return Ship;
  return Package;
}

function deriveConditions(b: Booking | null): QuoteConditions {
  if (!b) return { service: "IMPORT SEA LCL", term: "CIF", port: "PAT", container: "LCL", enter: "Normal", special: [] };
  const term = (b.term.match(/EXW|FOB|CIF|DDP/i)?.[0] || "CIF").toUpperCase();
  const isFcl = /FCL/i.test(b.fclLcl);
  const service = /AIR/i.test(b.transport) ? "IMPORT AIR" : /TRUCK/i.test(b.transport) ? "IMPORT TRUCK" : isFcl ? "IMPORT SEA FCL" : "IMPORT SEA LCL";
  const container = isFcl ? "1×20'" : "LCL";
  const port = (b.pod.match(/PAT|LCB|BKK|SUV/i)?.[0] || "PAT").toUpperCase();
  return { service, term, port, container, enter: "Normal", special: [] };
}

export function QuotationFormClient({
  booking, isNew, docNo, salesName,
}: {
  booking: Booking | null; isNew: boolean; docNo: string; salesName: string;
}) {
  const initCond = deriveConditions(booking);
  const [cond, setCond] = useState<QuoteConditions>(initCond);
  const [lines, setLines] = useState<QuoteLine[]>(() => linesForConditions(initCond));
  const [doc, setDoc] = useState({
    phone: "",
    memberCode: "",
    billName: booking?.customerName && booking.customerName !== "—" ? booking.customerName : "",
    taxId: "",
    shipper: "",
    consignee: booking?.customerName && booking.customerName !== "—" ? booking.customerName : "",
    product: booking?.product ?? "",
    pol: booking?.pol ?? "",
    pickupAddress: "",
    pod: booking?.pod ?? "",
    address: "",
    carrierAgent: "",
    transportAgent: "",
    useDate: "",
    acceptDate: "",
    validUntil: "",
    reference: "",
    remark: "",
  });
  const [lookupState, setLookupState] = useState<"idle" | "found" | "notfound">("idle");
  const [looking, setLooking] = useState(false);
  async function doLookup() {
    const code = doc.memberCode.trim();
    if (!code || looking) return;
    setLooking(true);
    try {
      const m = await lookupMemberByCode(code);
      if (m.found) {
        setDoc((d) => ({ ...d, memberCode: m.code, billName: m.name, phone: m.phone, taxId: m.taxId, address: m.address }));
        setLookupState("found");
      } else {
        setLookupState("notfound");
      }
    } catch {
      setLookupState("notfound");
    } finally {
      setLooking(false);
    }
  }

  // เอกสารแนบ (prototype: โชว์ชื่อไฟล์ client-state · ยังไม่อัปโหลดจริง)
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list).map((f) => ({ name: f.name, size: f.size }))]);
    e.target.value = "";
  }
  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  const status: BookingStatus = booking?.status ?? "customer_created";
  const meta = BOOKING_STATUS_META[status];
  const totals = useMemo(() => computeQuoteTotals(lines), [lines]);
  const hasTemplate = (IMPORT_QUOTE_TEMPLATES[templateKeyOf(cond)] ?? []).length > 0;
  const SIcon = serviceIcon(cond.service);
  const router = useRouter();
  const canSave = doc.billName.trim() !== "" && doc.product.trim() !== "";

  // บันทึกใบเสนอราคา → รายการเข้าสถานะ "รอดำเนินการ (ทำราคา)" ให้ Pricing ตรวจ
  // (prototype · เก็บ localStorage แล้วบอร์ดโหลดขึ้น · ต่อ DB จริง step ถัดไป)
  function saveQuotation() {
    if (!canSave) return;
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const svc = cond.service;
    const draft: Booking = {
      id: `draft-${now.getTime()}`,
      orderNo: isNew ? `${ymd}-${String(now.getTime()).slice(-3)}` : (booking?.orderNo ?? `${ymd}-000`),
      date: dateStr,
      status: "pending_pricing",
      company: "PACRED",
      customerName: doc.billName || doc.consignee,
      product: doc.product,
      sales: salesName,
      pricing: booking?.pricing || "WEB",
      term: `IM ${cond.term}`,
      transport: /AIR/i.test(svc) ? "AIR" : /TRUCK/i.test(svc) ? "TRUCK" : "SEA",
      fclLcl: cond.container.toUpperCase().includes("LCL") ? "LCL" : "FCL",
      size: cond.container,
      warehouse: "",
      pol: doc.pol,
      pod: doc.pod,
      price: `ยอดเสนอราคา ${bahtFmt(totals.grand)}`,
      hsCode: "",
      note: doc.remark,
    };
    try {
      const raw = localStorage.getItem("pacred_booking_drafts_import");
      const arr: Booking[] = raw ? JSON.parse(raw) : [];
      const next = [draft, ...arr.filter((d) => d?.orderNo !== draft.orderNo)]; // ทำราคาซ้ำ = แทนที่ orderNo เดิม
      localStorage.setItem("pacred_booking_drafts_import", JSON.stringify(next));
    } catch {
      /* ignore */
    }
    router.push("/admin/workspace/booking/import?tab=pending_pricing");
  }

  function setC<K extends keyof QuoteConditions>(k: K, v: QuoteConditions[K]) {
    const next = { ...cond, [k]: v } as QuoteConditions;
    setCond(next);
    // term/ประเภทตู้/service เปลี่ยน → โหลดชุดรายการใหม่จาก template (first cut)
    if (k === "term" || k === "container" || k === "service") setLines(linesForConditions(next));
  }
  function toggleSpecial(s: string) {
    setCond((p) => ({ ...p, special: p.special.includes(s) ? p.special.filter((x) => x !== s) : [...p.special, s] }));
  }
  function editLine(id: string, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { id: `new-${prev.length}-${Math.round(totals.grand)}`, group: "Special", desc: "", qty: 1, unitPrice: 0, vat: true, wht: 0 }]);
  }

  return (
    <div className="space-y-5">
      {/* ── หัว + กลับ ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">WORKSPACE · BOOKING · นำเข้า</p>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            {isNew ? "สร้างใบเสนอราคา (Quotation) ใหม่" : `ใบเสนอราคา · Booking ${booking?.orderNo}`}
          </h1>
        </div>
        <Link href="/admin/workspace/booking/import" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> กลับหน้า Booking
        </Link>
      </div>

      {/* ── สถานะ (stepper) ด้านบน ────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">สถานะ Booking</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.pill}`}>{formStatusLabel(status)}</span>
        </div>
        {status === "cancelled" ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            🛑 รายการนี้ถูกยกเลิก{booking?.note ? ` — ${booking.note}` : ""}
          </div>
        ) : (
          <ol className="flex items-start gap-1 overflow-x-auto scrollbar-x-visible pb-1">
            {STEPPER.map((s, i) => {
              const activeIdx = STEPPER.indexOf(status);
              const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "todo";
              return (
                <li key={s} className="flex min-w-[92px] flex-1 flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : state === "todo" ? "bg-border" : "bg-primary-400"}`} />
                    <span className={[
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      state === "current" ? "bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/40"
                        : state === "done" ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          : "bg-surface-alt text-muted",
                    ].join(" ")}>{i + 1}</span>
                    <span className={`h-0.5 flex-1 ${i === STEPPER.length - 1 ? "opacity-0" : i < activeIdx ? "bg-primary-400" : "bg-border"}`} />
                  </div>
                  <span className={`mt-1.5 text-[11px] leading-tight ${state === "current" ? "font-semibold text-foreground" : "text-muted"}`}>{formStatusLabel(s)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ── 2 คอลัมน์: ใบเสนอราคา (หลัก) + เงื่อนไข Shipment (แถบขวา) ── */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ── ใบเสนอราคา (main · แก้ inline ได้) ─────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
        {/* ── หัวเอกสาร (slim) ─────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary-600">ใบเสนอราคา</span>
            <span className="rounded-md border border-border bg-surface-alt px-2 py-0.5 text-[12px] font-bold text-foreground">{docNo}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{cond.service}</Badge>
            <Badge>{cond.term} · {cond.container}</Badge>
            <Badge>PORT: {cond.port}</Badge>
          </div>
        </div>

        {/* ── info cards 4 กล่อง (compact · reference) ─────── */}
        <div className="grid items-start gap-3 border-b border-border p-5 sm:grid-cols-2">
          {/* ลูกค้า (Customer · สมาชิก) — ซ้าย */}
          <InfoCard title="ลูกค้า (Customer)">
            <div>
              <span className="text-[11px] text-muted">รหัสสมาชิก (PR) — พิมพ์เพื่อค้นหา *</span>
              <div className="mt-0.5 flex gap-1.5">
                <input
                  value={doc.memberCode}
                  onChange={(e) => { setDoc((d) => ({ ...d, memberCode: e.target.value })); setLookupState("idle"); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }}
                  placeholder="เช่น PR10190"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none placeholder:text-muted/60 focus:border-primary-400"
                />
                <button onClick={doLookup} disabled={looking} className="shrink-0 rounded-md bg-primary-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50">{looking ? "…" : "ค้นหา"}</button>
              </div>
              {looking && <p className="mt-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">⏳ กำลังค้นหา…</p>}
              {!looking && lookupState === "found" && <p className="mt-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✓ พบสมาชิก — ดึงข้อมูลให้แล้ว</p>}
              {!looking && lookupState === "notfound" && <p className="mt-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">⚠ ไม่พบ — กรอกชื่อ+เบอร์เพื่อสมัครใหม่ (ได้รหัส PR)</p>}
              {!looking && lookupState === "idle" && <p className="mt-0.5 text-[10px] leading-snug text-muted">สมาชิกเดิม พิมพ์ PR → ข้อมูลขึ้นเอง</p>}
            </div>
            <Field label="ชื่อลูกค้า *" value={doc.billName} onChange={(v) => setDoc((d) => ({ ...d, billName: v }))} placeholder="ชื่อ / บริษัท (ตามสมาชิก)" />
            <Field label="เบอร์โทร *" value={doc.phone} onChange={(v) => setDoc((d) => ({ ...d, phone: v }))} placeholder="08x-xxx-xxxx" />
            <Field label="เลขผู้เสียภาษี" value={doc.taxId} onChange={(v) => setDoc((d) => ({ ...d, taxId: v }))} placeholder="Tax ID" />
            <Field label="ที่อยู่จัดส่ง" value={doc.address} onChange={(v) => setDoc((d) => ({ ...d, address: v }))} placeholder="ที่อยู่ปลายทาง" />
          </InfoCard>

          {/* Shipment (ข้อมูลขนส่ง) — ขวา */}
          <InfoCard title="Shipment (ข้อมูลขนส่ง)">
            <Field label="Shipper (ชื่อลูกค้าต้นทาง)" value={doc.shipper} onChange={(v) => setDoc((d) => ({ ...d, shipper: v }))} placeholder="ผู้ส่งออก / โรงงานต้นทาง" />
            <Field label="Consignee (ชื่อลูกค้าปลายทาง)" value={doc.consignee} onChange={(v) => setDoc((d) => ({ ...d, consignee: v }))} placeholder="ผู้รับปลายทาง (มักเป็นลูกค้า)" />
            <Field label="Description (สินค้า)" value={doc.product} onChange={(v) => setDoc((d) => ({ ...d, product: v }))} placeholder="ชื่อสินค้า" />
            <Field label="POL (ต้นทาง)" value={doc.pol} onChange={(v) => setDoc((d) => ({ ...d, pol: v }))} placeholder="ท่า / เมืองต้นทาง" />
            <Field label="ที่อยู่รับสินค้า (ต้นทาง)" value={doc.pickupAddress} onChange={(v) => setDoc((d) => ({ ...d, pickupAddress: v }))} placeholder="ที่อยู่รับของต้นทาง" />
            <Field label="POD (ปลายทาง)" value={doc.pod} onChange={(v) => setDoc((d) => ({ ...d, pod: v }))} placeholder="ท่าปลายทาง" />
            <Field label="Carrier Agent (ชื่อสายเรือ)" value={doc.carrierAgent} onChange={(v) => setDoc((d) => ({ ...d, carrierAgent: v }))} placeholder="ชื่อสายเรือ" />
            <Field label="Transport Agent (ขนส่งในไทย)" value={doc.transportAgent} onChange={(v) => setDoc((d) => ({ ...d, transportAgent: v }))} placeholder="ชื่อขนส่งในไทย" />
          </InfoCard>
        </div>

        {/* ตารางรายการราคา (dynamic · แก้ได้) */}
        <div className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">รายการราคา (ตามเงื่อนไข)</p>
              <p className="text-[11px] text-muted">template: <span className="font-mono">{templateKeyOf(cond)}</span> · แก้จำนวน/ราคาได้ · เพิ่ม-ลบบรรทัดได้</p>
            </div>
            <button onClick={addLine} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-alt">
              <Plus className="h-3.5 w-3.5" /> เพิ่มบรรทัด
            </button>
          </div>

          {!hasTemplate && lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-alt/40 px-4 py-8 text-center text-sm text-muted">
              ยังไม่มีเรทตั้งต้นสำหรับ <span className="font-mono">{templateKeyOf(cond)}</span> — จะใส่ matrix เต็มใน step ถัดไป<br />
              (ตอนนี้ seed ไว้ CIF_LCL / EXW_LCL) · กด “เพิ่มบรรทัด” เพื่อกรอกเองได้
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">กลุ่ม</th>
                    <th className="px-2 py-2 text-left">คำอธิบาย</th>
                    <th className="w-16 px-2 py-2 text-center">จำนวน</th>
                    <th className="w-28 px-2 py-2 text-right">ราคา/หน่วย</th>
                    <th className="w-28 px-2 py-2 text-right">รวม</th>
                    <th className="w-16 px-2 py-2 text-center">VAT</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const amt = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
                    return (
                      <tr key={l.id} className="even:bg-surface-alt/20">
                        <td className="px-2 py-1.5"><span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-muted">{l.group}</span></td>
                        <td className="px-2 py-1.5">
                          <input value={l.desc} onChange={(e) => editLine(l.id, { desc: e.target.value })}
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground hover:border-border focus:border-primary-400 focus:outline-none" placeholder="คำอธิบายรายการ" />
                          {l.note && <span className="px-1 text-[10px] text-amber-600 dark:text-amber-400">⚠ {l.note}</span>}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <input type="number" value={l.qty} onChange={(e) => editLine(l.id, { qty: Number(e.target.value) })}
                            className="w-14 rounded border border-border bg-background px-1 py-0.5 text-center text-xs tabular-nums focus:border-primary-400 focus:outline-none" />
                        </td>
                        <td className="px-1 py-1.5 text-right">
                          <input type="number" value={l.unitPrice} onChange={(e) => editLine(l.id, { unitPrice: Number(e.target.value) })}
                            className="w-24 rounded border border-border bg-background px-1 py-0.5 text-right text-xs tabular-nums focus:border-primary-400 focus:outline-none" />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{bahtFmt(amt)}</td>
                        <td className="px-2 py-1.5 text-center text-[10px]">{l.receipt ? <span className="text-muted">ทดลองจ่าย</span> : l.vat ? "7%" : "—"}</td>
                        <td className="px-1 py-1.5 text-center">
                          <button onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))} aria-label="ลบบรรทัด" className="text-muted transition-colors hover:text-rose-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* สรุปยอด */}
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:justify-between">
            <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[12px] leading-relaxed text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
              <b>หมายเหตุ:</b> ราคานี้เป็นราคาขาย (SELL) ที่โชว์ลูกค้า — ต้นทุน/กำไร (COST/PROFIT) เป็นข้อมูลภายใน ไม่แสดงบนใบนี้ · “เงินทดลองจ่าย” เก็บตามใบเสร็จจริง (ไม่มี VAT)
            </div>
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface-alt/40 p-4 text-sm">
              <TotalLine k="มูลค่าที่คิด VAT" v={bahtFmt(totals.vatBase)} />
              <TotalLine k="VAT 7%" v={bahtFmt(totals.vat)} />
              {totals.nonVat > 0 && <TotalLine k="บริการไม่คิด VAT" v={bahtFmt(totals.nonVat)} />}
              <TotalLine k="เงินทดลองจ่าย / ใบเสร็จจริง" v={bahtFmt(totals.receiptTotal)} />
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-lg font-bold text-foreground">
                <span>ยอดเสนอราคา</span><span className="tabular-nums">{bahtFmt(totals.grand)}</span>
              </div>
            </div>
          </div>

          {/* หมายเหตุ (แก้ได้) + แนบเอกสาร */}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-muted">หมายเหตุ (แสดงในใบเสนอราคา)</label>
              <textarea
                value={doc.remark} onChange={(e) => setDoc((d) => ({ ...d, remark: e.target.value }))} rows={4}
                placeholder="เงื่อนไข / โน้ตเพิ่มเติม เช่น ยังไม่รวมค่าขนส่งในจีน · ราคายืนยัน 7 วัน · ขอ PL & INV / MSDS …"
                className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted/60 focus:border-primary-400"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted">แนบเอกสาร (PL / INV / MSDS / รูปสินค้า …)</label>
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-alt/40 px-3 py-4 text-xs text-muted transition-colors hover:border-primary-400 hover:text-foreground">
                <Paperclip className="h-4 w-4" /> คลิกเพื่อเลือกไฟล์ (แนบได้หลายไฟล์)
                <input type="file" multiple className="hidden" onChange={onFiles} />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-surface-alt/50 px-2 py-1 text-[11px]">
                      <Paperclip className="h-3 w-3 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-foreground/90">{f.name}</span>
                      <span className="shrink-0 text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => removeFile(i)} aria-label="ลบไฟล์" className="shrink-0 text-muted transition-colors hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[10px] text-muted">⚠️ prototype — โชว์ชื่อไฟล์ · ยังไม่อัปโหลดจริง (ต่อ storage step ถัดไป)</p>
            </div>
          </div>
        </div>

        {/* actions (step ถัดไป) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-alt/30 px-5 py-3">
          <p className="text-[11px] text-muted">💾 บันทึกแล้วรายการเข้าสถานะ <b>“รอดำเนินการ (ทำราคา)”</b> ให้ Pricing ตรวจราคา · prototype เก็บชั่วคราวในเครื่อง (ต่อ DB จริง step ถัดไป)</p>
          <button
            onClick={saveQuotation}
            disabled={!canSave}
            title={canSave ? "" : "กรอก ชื่อผู้ออกบิล + สินค้า ก่อน"}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            บันทึกใบเสนอราคา → ส่ง Pricing
          </button>
        </div>
      </section>

      {/* ── เงื่อนไข Shipment (แถบขวา · sticky) ────────────── */}
      <aside className="self-start rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface lg:sticky lg:top-4">
        <div className="mb-1 flex items-center gap-2">
          <SIcon className="h-4 w-4 text-primary-600" />
          <h2 className="text-sm font-bold text-foreground">เงื่อนไข Shipment</h2>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-muted">เลือกแล้วรายการราคาในใบเปลี่ยนตามเงื่อนไข</p>
        <div className="grid gap-2.5">
          <PillRow label="SERVICE" options={SERVICE_OPTIONS} value={cond.service} onPick={(v) => setC("service", v)} />
          <PillRow label="TERM" options={TERM_OPTIONS} value={cond.term} onPick={(v) => setC("term", v)} />
          <PillRow label="PORT" options={PORT_OPTIONS} value={cond.port} onPick={(v) => setC("port", v)} />
          <PillRow label="ประเภทตู้" options={CONTAINER_OPTIONS} value={cond.container} onPick={(v) => setC("container", v)} />
          <PillRow label="ENTER" options={ENTER_OPTIONS} value={cond.enter} onPick={(v) => setC("enter", v)} />
          <PillRow label="SPECIAL" options={SPECIAL_OPTIONS} multi values={cond.special} onPick={toggleSpecial} />
        </div>
      </aside>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────
function PillRow({
  label, options, value, values, multi, onPick,
}: {
  label: string; options: string[]; value?: string; values?: string[]; multi?: boolean; onPick: (v: string) => void;
}) {
  const isActive = (o: string) => (multi ? (values ?? []).includes(o) : value === o);
  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} onClick={() => onPick(o)}
            className={[
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              isActive(o) ? "border-primary-300 bg-primary-50 font-semibold text-primary-700 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300"
                : "border-border bg-white text-muted hover:text-foreground dark:bg-surface",
            ].join(" ")}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-foreground/70">{children}</span>;
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-alt/30 p-3">
      <h3 className="mb-2 text-[12px] font-bold text-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none placeholder:text-muted/60 focus:border-primary-400" />
    </label>
  );
}

function TotalLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[13px] text-muted">
      <span>{k}</span><span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}
