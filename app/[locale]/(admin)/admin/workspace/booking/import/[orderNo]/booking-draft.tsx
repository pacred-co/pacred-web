"use client";

/**
 * ตัวอย่างใบ Booking (Draft preview) — owner ปอน 2026-07-10.
 *   • สลับ "ย่อ" (ในแถบขวา) ↔ "เต็ม" (เต็มความกว้าง · หน้าตาใบ Booking จริง).
 *   • เป็นแค่ตัวอย่าง (DRAFT · ยังไม่ประมวลผล/ยังไม่จองจริง) — ให้ลูกค้าดูว่าตรงใจไหมก่อนยืนยัน.
 *   • อ่านค่าจากเงื่อนไขงาน (cond) + ข้อมูลเอกสาร (doc) ที่เลือกด้านบน แล้ว "อธิบาย"
 *     ว่าที่เลือกแต่ละอย่างคืออะไร → ใครมาทำก็เข้าใจ + ตรวจว่าตรงกับที่ลูกค้าต้องการ.
 */

import type { ReactNode } from "react";
import {
  Ship, Plane, Truck, Maximize2, Minimize2, ScanBarcode, MapPin, ArrowRight,
  Boxes, ClipboardCheck, Warehouse, Info, CircleCheckBig, FileText, Users, Building2, Anchor,
} from "lucide-react";
import { directionOf, usesContainer, usesLoadType, CARRIER_LABEL, type QuoteConditions } from "../quotation-data";
import { DraftBarcode } from "@/components/ui/draft-barcode";
import { BookingJourney } from "@/components/workspace/booking-journey";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** ฟิลด์ของ doc ที่ใบ Booking ใช้ (parent ส่ง doc เต็มมา · เอาเฉพาะที่ใช้). */
export type BookingDoc = {
  product: string; billName: string; consignee: string; phone: string;
  shipper: string; pickupAddress: string; address: string; remark: string;
};

// ── คำอธิบายสิ่งที่ลูกค้าเลือก (ให้ตรวจว่าตรงใจไหม · ใครมาทำก็เข้าใจ) ──────────────
const TERM_EXPLAIN: Record<string, string> = {
  EXW: "หน้าโรงงานผู้ขาย — ผู้ซื้อจัดการขนส่ง + ภาษีเองทั้งหมด (ผู้ซื้อรับภาระมากสุด)",
  FOB: "ผู้ขายส่งของขึ้นยานพาหนะต้นทาง + ผ่านพิธีการส่งออกให้ — ผู้ซื้อจ่ายค่าระวาง + ปลายทาง + อากรนำเข้าเอง",
  CIF: "ผู้ขายจ่ายค่าระวาง + ประกัน ถึงท่าปลายทาง — ผู้ซื้อจ่ายอากร + ค่าในประเทศ",
  DDP: "ส่งถึงมือ จ่ายอากร + ภาษีปลายทางครบ — ลูกค้าจบที่เดียว (แพ็กเกจ cargo ของเรา)",
};
const SERVICE_EXPLAIN: Record<string, string> = {
  SEA: "ทางเรือ — ประหยัดสุด · ~15-20 วัน · เหมาะของหนัก/ชิ้นใหญ่/ไม่รีบ",
  AIR: "ทางอากาศ — เร็วสุด · ค่าส่งสูง · เหมาะของด่วน/มูลค่าสูง/น้ำหนักเบา",
  TRUCK: "ทางรถ (จีน-ไทย) — ~5-7 วัน · เร็ว-ราคากลาง · นิยมสำหรับ cargo",
};
const LOAD_EXPLAIN: Record<string, string> = {
  LCL: "รวมตู้ (แชร์ตู้กับเจ้าอื่น) — คิดตามปริมาตร/น้ำหนัก · เหมาะของไม่เต็มตู้",
  FCL: "เต็มตู้ (เหมาทั้งตู้) — จ่ายเป็นตู้ · เหมาะของเยอะ · ของไม่ปนเจ้าอื่น",
};
const PRODUCT_EXPLAIN: Record<string, string> = {
  "ทั่วไป": "สินค้าทั่วไป — ไม่ต้องขออนุญาตพิเศษ",
  "มอก.": "ต้องมีใบรับรอง มอก. (มาตรฐานอุตสาหกรรม) เช่น ของเล่น เครื่องใช้ไฟฟ้า",
  "อย.": "ต้องขออนุญาต อย. (อาหาร/ยา/เครื่องสำอาง/อาหารเสริม)",
  "ลิขสิทธิ์": "สินค้าแบรนด์/ลิขสิทธิ์ — ใช้เรทพิเศษ + ต้องมีเอกสารสิทธิ์ (กันของปลอม)",
};
const SPECIAL_EXPLAIN: Record<string, string> = {
  License: "ขอใบอนุญาตนำเข้า (สินค้าควบคุม)",
  Manpower: "จ้างแรงงานขน/แพ็คเพิ่ม",
  "Local Transport": "ค่าขนส่งในประเทศปลายทาง (ส่งถึงที่)",
  Overtime: "ทำงานนอกเวลา/เร่งด่วน",
  "เปิดใบขน": "บริการเปิดใบขนสินค้าแยก (ออกใบขนอย่างเดียว)",
  "ใบขนพ่วง": "เปิดใบขนพ่วง — พ่วงกับใบขนอีกใบ (นำเข้าในชื่อ/ใบอนุญาตของอีกเจ้า)",
};

/** คำอธิบายเอกสารที่เลือก (owner พี่ป๊อป 2026-07-10) — ขึ้นกับ docMode + term. */
function docModeDesc(docMode: string, term: string): string {
  if (/ใบกำกับ/.test(docMode)) return "ออกใบกำกับภาษีเต็มรูปแบบ (VAT 7%) — นำเข้าในชื่อลูกค้า";
  if (/ใบขน/.test(docMode)) return "ออกใบขนสินค้าในชื่อลูกค้า";
  return term === "DDP" ? "เหมาภาษี — นำเข้าในชื่อชิปปิ้ง · ลูกค้าไม่ได้เอกสาร (ราคารวมภาษีแล้ว)" : "ไม่ออกเอกสารให้ลูกค้า";
}

function serviceMeta(service: string) {
  if (service === "AIR") return { Icon: Plane, label: "ทางอากาศ", legOut: "เที่ยวบินออก", legCode: "FL" };
  if (service === "TRUCK") return { Icon: Truck, label: "ทางรถ", legOut: "รถออกต้นทาง", legCode: "TR" };
  return { Icon: Ship, label: "ทางเรือ", legOut: "เรือออกต้นทาง", legCode: "VS" };
}

function countryCode(country: string): string {
  if (/จีน|china/i.test(country)) return "CN";
  if (/ไทย|thai/i.test(country)) return "TH";
  return (country || "?").slice(0, 2).toUpperCase();
}

// ── Journey stepper (5 ขั้น · draft = ขั้น "เปิด Booking" คือปัจจุบัน) ──────────────
function journeyStages(service: string) {
  const m = serviceMeta(service);
  return [
    { code: "BK", label: "เปิด Booking", desc: "สร้าง/ยืนยันใบจอง", Icon: FileText },
    { code: "CT", label: "จัดตู้/บรรจุ", desc: "แพ็คลงตู้ต้นทาง", Icon: Boxes },
    { code: m.legCode, label: m.legOut, desc: `${m.label}ออกจากต้นทาง`, Icon: m.Icon },
    { code: "CU", label: "เคลียร์ศุลกากร", desc: "พิธีการ + ชำระอากร", Icon: ClipboardCheck },
    { code: "DL", label: "ส่งปลายทาง", desc: "กระจายส่งถึงลูกค้า", Icon: Warehouse },
  ];
}

function JourneyStrip({ service, size = "full" }: { service: string; size?: "full" | "compact" }) {
  const stages = journeyStages(service);
  const currentIdx = 0; // draft = ยังอยู่ขั้นเปิด Booking
  const dot = size === "compact" ? "h-8 w-8" : "h-11 w-11";
  const iconSz = size === "compact" ? "h-4 w-4" : "h-5 w-5";
  return (
    <ol className="flex items-start gap-1 overflow-x-auto scrollbar-x-visible py-1">
      {stages.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
        const StageIcon = s.Icon;
        return (
          <li key={`${s.code}-${i}`} className={cx("flex flex-1 flex-col items-center text-center", size === "compact" ? "min-w-[62px]" : "min-w-[92px]")}>
            <div className="flex w-full items-center">
              <span className={cx("h-0.5 flex-1", i === 0 ? "opacity-0" : state === "todo" ? "bg-border" : "bg-primary-500")} />
              <span className={cx("flex shrink-0 items-center justify-center rounded-xl transition-all", dot,
                state === "todo" ? "border border-dashed border-border bg-muted/40 text-muted" : "bg-primary-600 text-white shadow-sm")}>
                <StageIcon className={iconSz} strokeWidth={2} />
              </span>
              <span className={cx("h-0.5 flex-1", i === stages.length - 1 ? "opacity-0" : state === "done" ? "bg-primary-500" : "bg-border")} />
            </div>
            <span className={cx("mt-1.5 font-semibold leading-tight", size === "compact" ? "text-[10px]" : "text-[11px]", state === "current" ? "text-foreground" : "text-muted")}>{s.label}</span>
            {size === "full" && <span className="mt-0.5 hidden text-[10px] leading-tight text-muted sm:block">{s.desc}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function BookingDraftPreview({
  cond, doc, docNo, salesName, attachedSummary, full, onToggleFull,
}: {
  cond: QuoteConditions; doc: BookingDoc; docNo: string; salesName: string;
  attachedSummary: string; full: boolean; onToggleFull: (v: boolean) => void;
}) {
  const svc = serviceMeta(cond.service);
  const Svc = svc.Icon;
  const dir = directionOf(cond);
  const serviceType = usesLoadType(cond.service) ? `${cond.service} ${cond.loadType}` : cond.service;
  const routeFrom = `${cond.pol.country} · ${cond.pol.port}`;
  const routeTo = `${cond.pod.country} · ${cond.pod.port}`;
  const consignee = doc.consignee || doc.billName || "—";
  const commodity = doc.product || "—";
  const carrierLabel = CARRIER_LABEL[cond.service] ?? "สายขนส่ง";
  const licensed = cond.productType === "ลิขสิทธิ์";

  // คำอธิบายสิ่งที่เลือก (สำหรับ section "อธิบาย")
  const explains: { label: string; value: string; desc: string }[] = [
    { label: "ทิศทาง", value: dir.label, desc: dir.code === "IMPORT" ? "นำเข้า: ต่างประเทศ → ไทย" : dir.code === "EXPORT" ? "ส่งออก: ไทย → ต่างประเทศ" : "ยังระบุทิศทางไม่ได้ — ตรวจต้นทาง/ปลายทาง" },
    { label: "ขนส่ง", value: svc.label, desc: SERVICE_EXPLAIN[cond.service] ?? "" },
    ...(usesLoadType(cond.service) ? [{ label: "ประเภทตู้", value: cond.loadType, desc: LOAD_EXPLAIN[cond.loadType] ?? "" }] : []),
    { label: "เทอม (Incoterm)", value: cond.term, desc: TERM_EXPLAIN[cond.term] ?? "" },
    { label: "ประเภทสินค้า", value: cond.productType, desc: PRODUCT_EXPLAIN[cond.productType] ?? "" },
    { label: "เอกสาร", value: cond.docMode, desc: docModeDesc(cond.docMode, cond.term) },
    ...cond.special.map((s) => ({ label: "บริการเสริม", value: s, desc: SPECIAL_EXPLAIN[s] ?? "" })),
  ].filter((e) => e.desc);

  // ═══════════════ COMPACT (ในแถบขวา) ═══════════════
  if (!full) {
    return (
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-start justify-between gap-2 border-b border-border bg-primary-600/5 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-600">
              <ScanBarcode className="h-3.5 w-3.5" /> ตัวอย่างใบ Booking
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">{docNo}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">DRAFT</span>
            <button type="button" onClick={() => onToggleFull(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/50">
              <Maximize2 className="h-3 w-3" /> ดูเต็ม
            </button>
          </div>
        </div>
        <div className="border-b border-border px-3 py-3"><JourneyStrip service={cond.service} size="compact" /></div>
        <dl className="divide-y divide-border text-[13px]">
          <Row label="เส้นทาง"><span className="inline-flex items-center gap-1 font-medium text-foreground"><MapPin className="h-3.5 w-3.5 text-primary-500" />{cond.pol.port} <ArrowRight className="h-3 w-3 text-muted" /> {cond.pod.port}</span></Row>
          <Row label="ขนส่ง"><span className="inline-flex items-center gap-1 font-medium text-foreground"><Svc className="h-3.5 w-3.5 text-primary-500" />{svc.label}{usesLoadType(cond.service) ? ` · ${cond.loadType}` : ""}</span></Row>
          <Row label="เทอม">{cond.term}</Row>
          <Row label="เอกสาร">{cond.docMode}</Row>
          <Row label="สินค้า"><span className="text-foreground">{commodity}</span>{cond.productType ? <span className={cx("ml-1 rounded px-1 text-[11px]", licensed ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-muted text-muted")}>{cond.productType}{licensed ? " 🔖" : ""}</span> : null}</Row>
          <Row label="น้ำหนัก">{cond.weight ? `${cond.weight} กก.` : "—"}</Row>
          <Row label="ปริมาตร">{cond.cbm ? `${cond.cbm} CBM` : "—"}</Row>
          <Row label={carrierLabel}>{cond.carrier || "—"}</Row>
          <Row label="ลูกค้า">{consignee}</Row>
        </dl>
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-foreground"><Info className="h-3.5 w-3.5 text-primary-500" /> ที่เลือกไว้ = อะไร</p>
          <ul className="space-y-1">
            {explains.slice(0, 3).map((e, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted"><b className="text-foreground">{e.value}</b> — {e.desc}</li>
            ))}
          </ul>
          <button type="button" onClick={() => onToggleFull(true)} className="mt-2 text-[11px] font-semibold text-primary-600 hover:text-primary-700">ดูใบ Booking เต็ม + อธิบายครบ →</button>
        </div>
      </section>
    );
  }

  // ═══════════════ FULL — booking-confirmation document (แบบ mockup 100% · owner ปอน 2026-07-13) ═══════════════
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
      {/* DRAFT watermark */}
      <span aria-hidden className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden">
        <span className="rotate-[-20deg] text-[110px] font-black leading-none tracking-[0.15em] text-foreground/[0.04]">DRAFT</span>
      </span>

      {/* ── header ── */}
      <div className="relative z-10 flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">ดราฟต์ใบ Booking</h2>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">BOOKING CONFIRMATION • SHIPMENT {docNo}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted">สถานะ: ดราฟต์ใบจอง / รอตรวจสอบ</span>
          <span className="rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white">DRAFT</span>
          <button type="button" onClick={() => onToggleFull(false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50">
            <Minimize2 className="h-4 w-4" /> ย่อ
          </button>
        </div>
      </div>

      <div className="relative z-10 space-y-5 p-5">
        {/* barcode + chips */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DraftBarcode text={docNo} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"><Users className="h-3.5 w-3.5" />ผู้ดูแล: {salesName || "WEB"}</span>
            <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">TERM: {cond.term} · {dir.code}</span>
            <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted">ไม่โชว์ราคาในดราฟต์</span>
            <span className="rounded-md bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{serviceType}{usesContainer(cond.loadType) ? ` · ${cond.container}` : ""}</span>
            {attachedSummary && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><FileText className="h-3.5 w-3.5" />เอกสารแนบ: {attachedSummary}</span>}
          </div>
        </div>

        {/* journey — รูปสถานะจริง · ชุด stage ขึ้นกับ TERM × ขนส่ง (Incoterms · ดราฟต์ = เพิ่งเริ่ม) */}
        <BookingJourney term={cond.term} mode={cond.service} progress={0} />

        {/* ข้อมูลหลัก + เส้นทาง (2-col) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-3 text-sm font-black text-primary-600">ข้อมูลหลักของ Booking</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="DATE" value="—" />
              <Field label="INV NO." value={docNo} />
              <Field label="SHIPMENT" value={docNo} />
              <Field label="TEL NUMBER" value={doc.phone || "—"} />
              <Field label="PRICING / DOC / SALE" value={`WEB / ${salesName || "—"}`} />
              <Field label="TR" value={svc.label} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-3 text-sm font-black text-primary-600">เส้นทางและการขนส่ง</p>
            <div className="flex items-center gap-3">
              <div className="shrink-0 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">{countryCode(cond.pol.country)}</div>
                <div className="mt-1 text-[11px] font-semibold text-foreground">{cond.pol.port}</div>
                <div className="text-[10px] text-muted">{cond.pol.country}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex flex-wrap items-center justify-center gap-1 text-center text-[11px] font-semibold text-primary-600"><Svc className="h-4 w-4 shrink-0" /> {cond.carrier || svc.label}{usesLoadType(cond.service) ? ` · ${cond.loadType}` : ""}{usesContainer(cond.loadType) ? ` · ${cond.container}` : ""}</div>
                <div className="my-1 h-0.5 w-full bg-primary-500" />
                <div className="text-[10px] text-muted">Direct / Indirect: {cond.enter === "Normal" ? "ยังไม่ระบุ" : cond.enter}</div>
              </div>
              <div className="shrink-0 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">{countryCode(cond.pod.country)}</div>
                <div className="mt-1 text-[11px] font-semibold text-foreground">{cond.pod.port}</div>
                <div className="text-[10px] text-muted">{cond.pod.country}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ข้อมูลลูกค้า/ต้นทาง + Freight/Port */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-primary-600"><Building2 className="h-4 w-4 text-primary-500" /> ข้อมูลลูกค้า / ต้นทาง</p>
            <FieldLine label="Consignee / Customer" value={consignee} strong />
            <FieldLine label="ที่อยู่ต้นทาง (FROM)" value={doc.pickupAddress || doc.address || "—"} />
            <FieldLine label="Destination Address" value={doc.address || "—"} />
            <FieldLine label="เบอร์โทร" value={doc.phone || "—"} />
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-primary-600"><Anchor className="h-4 w-4 text-primary-500" /> ข้อมูล Freight / Port</p>
            <FieldLine label="Shipper Load / Freight" value={doc.shipper || cond.agent || "—"} strong />
            <FieldLine label="Port of Loading" value={routeFrom} />
            <FieldLine label="Destination" value={routeTo} />
            <FieldLine label="Shipping Line" value={cond.carrier || "—"} />
            <FieldLine label="Loading Type" value={usesLoadType(cond.service) ? cond.loadType : "—"} />
          </div>
        </div>

        {/* รายการสินค้า / Container */}
        <div>
          <p className="mb-2 text-sm font-black text-primary-600">รายการสินค้า / Container</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">INV / Shipment</th>
                  <th className="px-3 py-2 font-semibold">Commodity</th>
                  <th className="px-3 py-2 font-semibold">Load</th>
                  <th className="px-3 py-2 font-semibold">Qty / Cont.</th>
                  <th className="px-3 py-2 font-semibold">Weight</th>
                  <th className="px-3 py-2 font-semibold">POL</th>
                  <th className="px-3 py-2 font-semibold">POD</th>
                  <th className="px-3 py-2 font-semibold">Line</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold text-primary-600">{docNo}</td>
                  <td className="px-3 py-2 font-semibold text-primary-600">{commodity}</td>
                  <td className="px-3 py-2 text-foreground">{usesLoadType(cond.service) ? cond.loadType : "—"}</td>
                  <td className="px-3 py-2 text-foreground">{usesContainer(cond.loadType) ? cond.container : "ตามขนาด"}</td>
                  <td className="px-3 py-2 text-foreground">{cond.weight ? `${cond.weight} กก.` : "0.00 กก."}{cond.cbm ? ` · ${cond.cbm} CBM` : ""}</td>
                  <td className="px-3 py-2 text-foreground">{cond.pol.port}</td>
                  <td className="px-3 py-2 text-foreground">{cond.pod.port}</td>
                  <td className="px-3 py-2 text-foreground">{cond.carrier || "—"}</td>
                  <td className="px-3 py-2 text-muted">ไม่มีการแสดงราคาในดราฟต์นี้</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ข้อมูลปฏิบัติการที่ยังไม่ระบุ */}
        <div>
          <p className="mb-2 text-sm font-black text-primary-600">ข้อมูลปฏิบัติการที่ยังไม่ระบุ</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {["CY Date", "ETD", "ETA", "Empty Return", "Local Logistics", "Manpower", "Register", "Duty / VAT", "Customs Clearance"].map((o) => (
              <div key={o} className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-1.5 text-center">
                <div className="text-[10px] font-medium text-muted">{o}</div>
                <div className="text-xs text-muted">—</div>
              </div>
            ))}
          </div>
        </div>

        {/* EXPLANATIONS — the big ask */}
        <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4 dark:border-primary-500/20 dark:bg-primary-500/5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-foreground"><Info className="h-4 w-4 text-primary-600" /> อธิบายสิ่งที่เลือก — ตรวจว่าตรงใจลูกค้าไหม</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {explains.map((e, i) => (
              <div key={i} className="flex gap-2 rounded-lg bg-background/70 p-2.5">
                <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground">{e.label}: <span className="text-primary-600">{e.value}</span></div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">{e.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* footer — actions (แบบ mockup) */}
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white"><ScanBarcode className="h-4 w-4" /> บันทึกดราฟต์</span>
            <button type="button" onClick={() => { if (typeof window !== "undefined") window.print(); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-primary-600 transition-colors hover:bg-muted/50">
              <FileText className="h-4 w-4" /> ดาวน์โหลด Booking
            </button>
          </div>
          <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white">ส่งต่อทีมเอกสาร <ArrowRight className="h-4 w-4" /></span>
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          📋 นี่คือ <b className="text-foreground">ตัวอย่างใบ Booking (Draft)</b> — สร้างจากเงื่อนไขที่เลือกด้านบน · <b>ยังไม่ประมวลผล / ยังไม่จองจริง</b> · ปุ่ม &ldquo;บันทึก/ส่งต่อ&rdquo; จริงใช้ปุ่มในฟอร์มด้านบน · prototype (client-state)
        </p>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <dt className="shrink-0 text-[11px] font-medium text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-foreground">{children}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{value || "—"}</div>
    </div>
  );
}

function FieldLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-[11px] text-muted">{label}</span>
      <span className={cx("min-w-0 break-words text-right", strong ? "font-bold text-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}
