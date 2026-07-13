"use client";

/**
 * ฟอร์มสร้าง/ดู ใบเสนอราคา (Quotation) — งานนำเข้า.
 * 2026-07-09 (ปอน · owner brief) — FIRST CUT.
 * 2026-07-09 (ปอน · 1:1) — reproduce quotation_booking_mockup.html เป๊ะ:
 *   topbar + flow 4 ขั้น + grid 3 คอลัมน์ (Condition Builder / เอกสาร Peak / Booking Payload).
 *   สไตล์เอาจาก mockup ตรงๆ ผ่าน CSS Module (quotation-mockup.module.css).
 *   คงส่วน "สถานะ Booking" (stepper) ไว้แบบเดิม (owner: ยกเว้นสถานะ booking).
 *   ราคาที่โชว์ = SELL · COST/PROFIT ไม่โชว์บนใบลูกค้า. ยัง prototype (client-state · ยังไม่ต่อ DB).
 */

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ArrowLeft, Paperclip, Trash2, Settings, ChevronDown, FilePlus2, Calculator, UserRoundCheck, CalendarClock, CalendarCheck2, CircleCheckBig, Search, Ship, Truck, Plane, Clock3, Check, Sparkles, ArrowRight, PackageCheck, ShieldCheck, FileText, Maximize2 } from "lucide-react";
import { BOOKING_STATUS_META, type Booking, type BookingStatus } from "../booking-data";
import {
  TERM_OPTIONS, ENTER_OPTIONS, SPECIAL_OPTIONS, PRODUCT_TYPE_OPTIONS, docModeOptions, LOAD_TYPE_OPTIONS, CONTAINER_OPTIONS, TRANSPORT_TABS, PORT_COUNTRIES, PORT_CATALOG, WAREHOUSE_CATALOG, firstPort, directionOf,
  CARRIER_LABEL, CARRIER_CATALOG, AGENT_OPTIONS, carrierValidFor,
  linesForConditions, computeQuoteTotals, bahtFmt, templateKeyOf, usesLoadType, usesContainer, noteForConditions, PACRED_ISSUER,
  type QuoteConditions, type PortSel, type QuoteLine,
} from "../quotation-data";
import type { CatalogTemplate } from "@/lib/booking/catalog";
import { lookupMemberByCode } from "@/actions/admin/booking-member-lookup";
import { CARGO_PROMO_PACKAGES, rateFor, MIN_CHARGE, DEFAULT_COMPARISON, type QuoteMode, type WarehouseKey, type CargoPromoPackage } from "@/lib/quote/cargo-promo-packages";
import { BookingDraftPreview } from "./booking-draft";
import { FieldHint, TRANSPORT_HINT, LOADTYPE_HINT, TERM_HINT, ENTER_HINT, PRODUCT_HINT, SPECIAL_HINT, DOCMODE_HINT, POL_HINT, POD_HINT, COMMODITY_HINT, CARRIER_HINT, WEIGHT_HINT, CBM_HINT, AGENT_HINT } from "./booking-hints";
import styles from "./quotation-mockup.module.css";

// ลำดับ stepper (ตัด "ยกเลิก" ออก — โชว์เป็น banner แยก)
const STEPPER: BookingStatus[] = [
  "customer_created", "pending_pricing", "awaiting_confirm", "awaiting_booking", "booking_confirmed", "success",
];

// ไอคอนประจำแต่ละสถานะ = Lucide (คลีน · ปรับสีตามสถานะ · ปอน 2026-07-10 แทนรูป PNG)
// เทา = ยังไม่ถึง · ปัจจุบัน = วงแหวนแดง · ผ่านแล้ว = เติมแดงทึบ.
const STEP_ICONS = [FilePlus2, Calculator, UserRoundCheck, CalendarClock, CalendarCheck2, CircleCheckBig];

function formStatusLabel(s: BookingStatus): string {
  return s === "customer_created" ? "กำลังสร้าง QT/Booking" : BOOKING_STATUS_META[s].label;
}

function deriveConditions(b: Booking | null): QuoteConditions {
  const term = (b?.term.match(/EXW|FOB|CIF|DDP/i)?.[0] || "CIF").toUpperCase();
  const service = !b ? "SEA" : /AIR/i.test(b.transport) ? "AIR" : /TRUCK/i.test(b.transport) ? "TRUCK" : "SEA";
  const loadType = service === "SEA" && /FCL/i.test(b?.fclLcl ?? "") ? "FCL" : "LCL"; // FCL เฉพาะทางเรือ
  // POL/POD จิ้มเลือก — default จีน→ไทย (นำเข้า) ตามพอร์ทตัวแรกของขนส่งนั้น
  return {
    service,
    pol: { country: "จีน", port: firstPort("จีน", service) },
    pod: { country: "ไทย", port: firstPort("ไทย", service) },
    loadType, container: "1×20'", carrier: "", weight: "", cbm: "", agent: "", productType: "ทั่วไป", docMode: "ไม่รับเอกสาร",
    term, enter: "Normal", special: [],
  };
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// ประเภทเอกสารที่แนบ — แยกช่องชัดๆ (owner 2026-07-10) · ผูกกับ Booking Payload.
// เอกสารขนส่งขึ้นตามโหมด (owner ปอน 2026-07-10): เรือ=B/L · แอร์=AWB · รถ=Bill(รถ) · +D/O (เรือ/แอร์).
type DocType = { key: string; label: string; short: string };
function docTypesFor(service: string): DocType[] {
  const transport: DocType[] =
    service === "AIR"
      ? [{ key: "awb", label: "AWB — Air Waybill", short: "AWB" }, { key: "do", label: "D/O — Delivery Order", short: "D/O" }]
      : service === "TRUCK"
        ? [{ key: "trucbill", label: "Bill (รถ) — ใบส่งของ", short: "Bill รถ" }]
        : [{ key: "bl", label: "B/L — Bill of Lading", short: "B/L" }, { key: "do", label: "D/O — Delivery Order", short: "D/O" }];
  return [
    { key: "inv", label: "INV — ใบแจ้งหนี้/Invoice", short: "INV" },
    { key: "pl", label: "Packing List — ใบแพ็คกิ้ง", short: "PL" },
    ...transport,
    { key: "msds", label: "MSDS — เอกสารความปลอดภัย", short: "MSDS" },
    { key: "photo", label: "รูปสินค้า", short: "รูป" },
    { key: "other", label: "อื่นๆ", short: "อื่นๆ" },
  ];
}

// สี pill พิเศษ (mockup): ENTER แต่ละตัวมีสีประจำ (Normal=active/แดง)
const ENTER_COLOR: Record<string, string> = { "Change Status": "amber", "Document Amend": "purple", "Direct": "blue", "Indirect": "green" };

export function QuotationFormClient({
  booking, isNew, docNo, salesName, catalog, showCost, showProfit,
}: {
  booking: Booking | null; isNew: boolean; docNo: string; salesName: string;
  catalog: Record<string, CatalogTemplate>; showCost: boolean; showProfit: boolean;
}) {
  const initCond = deriveConditions(booking);
  const [cond, setCond] = useState<QuoteConditions>(initCond);
  const [lines, setLines] = useState<QuoteLine[]>(() => linesForConditions(initCond, catalog));
  const [doc, setDoc] = useState({
    phone: "", memberCode: "",
    billName: booking?.customerName && booking.customerName !== "—" ? booking.customerName : "",
    billTo: "", // ชื่อผู้วางบิล (ถ้าต่างจากลูกค้า)
    taxId: "", shipper: "",
    consignee: booking?.customerName && booking.customerName !== "—" ? booking.customerName : "",
    product: booking?.product ?? "", pol: booking?.pol ?? "", pickupAddress: "",
    pod: booking?.pod ?? "", address: "", carrierAgent: "", transportAgent: "",
    useDate: "", acceptDate: "", validUntil: "", reference: "", remark: noteForConditions(initCond, catalog),
  });
  const [lookupState, setLookupState] = useState<"idle" | "found" | "notfound">("idle");
  const [looking, setLooking] = useState(false);
  // สลับโหมด booking เดียวกัน: แนะนำแพ็กเกจ ↔ สร้างใบเสนอราคา (owner ปอน 2026-07-10)
  // เงื่อนไขงาน (cond) = state ตัวเดียวกัน → สลับไปมาค่าที่เลือกไว้คงอยู่.
  const [mode, setMode] = useState<"recommend" | "create">("recommend");
  const [searched, setSearched] = useState(false);
  const [bookingFull, setBookingFull] = useState(false); // ขยายใบ Booking เต็มความกว้าง (owner ปอน 2026-07-10)
  const [compare, setCompare] = useState<string[]>([]); // แพ็กเกจที่ติ๊กเปรียบเทียบ (owner พี่ป๊อป 2026-07-10)
  function selectPackage(pkg: CargoPromoPackage) {
    // เลือกแพ็กเกจ → ไปหน้าสร้าง (เงื่อนไขเดิม) + จดชื่อแพ็กเกจใน "หมายเหตุ" ถ้ายังว่าง
    setDoc((d) => (d.remark.trim() === "" ? { ...d, remark: `แพ็กเกจ: ${pkg.name} (${pkg.group})` } : d));
    setMode("create");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggleCompare(pkg: CargoPromoPackage) {
    setCompare((prev) => (prev.includes(pkg.id) ? prev.filter((id) => id !== pkg.id) : [...prev, pkg.id]));
  }
  /** เปรียบเทียบใบเสนอราคา = สร้างเป็น "คนละใบ" (owner พี่ป๊อป: หน้าจะดีกว่า) — 1 แพ็กเกจ = 1 draft แยก. */
  function createCompareQuotes() {
    const pkgs = CARGO_PROMO_PACKAGES.filter((p) => compare.includes(p.id));
    const mode: QuoteMode | null = cond.service === "TRUCK" ? "truck" : cond.service === "SEA" ? "ship" : null;
    if (pkgs.length === 0 || !mode) return;
    const licensed = cond.productType === "ลิขสิทธิ์";
    const warehouse: WarehouseKey = /อี้อู|yiwu/i.test(cond.pol.port) ? "yiwu" : "guangzhou";
    const weight = Number(cond.weight) || 0;
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const svc = cond.service;
    const drafts: Booking[] = pkgs.map((pkg, i) => {
      const rate = rateFor(pkg, licensed, warehouse, mode);
      const est = weight > 0 ? Math.max(rate.kg * weight, rate.cbm * (weight / DEFAULT_COMPARISON), MIN_CHARGE) : 0;
      const priceLabel = weight > 0 ? `≈ ${bahtFmt(Math.round(est))}` : `฿${rate.cbm.toLocaleString()}/CBM`;
      return {
        id: `draft-${now.getTime()}-${i}`,
        orderNo: `${ymd}-C${String(now.getTime()).slice(-2)}${i + 1}`,
        date: dateStr, status: "pending_pricing", company: "PACRED",
        customerName: doc.billName || doc.consignee, product: doc.product, sales: salesName,
        pricing: "WEB", term: `IM ${cond.term}`,
        transport: /AIR/i.test(svc) ? "AIR" : /TRUCK/i.test(svc) ? "TRUCK" : "SEA",
        fclLcl: cond.loadType,
        size: usesContainer(cond.loadType) ? cond.container : "ตามขนาดสินค้า", warehouse: "",
        pol: cond.pol.port, pod: cond.pod.port,
        price: `เปรียบเทียบ · ${pkg.name} · ${priceLabel}`, hsCode: "", note: `เปรียบเทียบแพ็กเกจ: ${pkg.name} (${pkg.group})`,
      };
    });
    try {
      const raw = localStorage.getItem("pacred_booking_drafts_import");
      const arr: Booking[] = raw ? JSON.parse(raw) : [];
      const newNos = new Set(drafts.map((d) => d.orderNo));
      const next = [...drafts, ...arr.filter((d) => !newNos.has(d?.orderNo))];
      localStorage.setItem("pacred_booking_drafts_import", JSON.stringify(next));
    } catch { /* ignore */ }
    router.push("/admin/workspace/booking/import?tab=pending_pricing");
  }
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

  // แนบเอกสารแยกประเภท (owner 2026-07-10) — INV / Packing List / MSDS / รูปสินค้า / อื่นๆ
  // ผูกกับ Booking Payload (ด้านขวา) = ตัวเดียวกัน (โชว์สรุปที่แนบไปด้วย).
  const [docFiles, setDocFiles] = useState<Record<string, { name: string; size: number }[]>>({});
  const filesFor = (type: string) => docFiles[type] ?? [];
  function onFilesFor(type: string, e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const added = Array.from(list).map((f) => ({ name: f.name, size: f.size }));
    setDocFiles((prev) => ({ ...prev, [type]: [...(prev[type] ?? []), ...added] }));
    e.target.value = "";
  }
  function removeDocFile(type: string, i: number) {
    setDocFiles((prev) => ({ ...prev, [type]: (prev[type] ?? []).filter((_, idx) => idx !== i) }));
  }
  const docTypes = docTypesFor(cond.service); // เอกสารแนบตามโหมดขนส่ง (เรือ/แอร์/รถ)
  const attachedSummary = docTypes
    .filter((dt) => filesFor(dt.key).length > 0)
    .map((dt) => `${dt.short}×${filesFor(dt.key).length}`)
    .join(" · ");

  const status: BookingStatus = booking?.status ?? "customer_created";
  const meta = BOOKING_STATUS_META[status];
  const totals = useMemo(() => computeQuoteTotals(lines), [lines]);
  const hasTemplate = (catalog[templateKeyOf(cond)]?.lines ?? []).length > 0;
  const canSeeMoney = showCost || showProfit; // viewer = Pricing/Ultra/Super (เห็นต้นทุน/กำไร)
  const isPricingStage = status === "pending_pricing";
  // กำไร/มาร์จิน (ภายใน): cost-viewer = ยอดขาย(ไม่รวม receipt) − ต้นทุน · super = กำไรตั้งต้นจาก catalog
  const sellNonReceipt = totals.vatBase + totals.nonVat;
  const marginTotal = showCost ? sellNonReceipt - totals.costTotal : totals.profitTotal;
  const marginPct = sellNonReceipt > 0 ? (marginTotal / sellNonReceipt) * 100 : 0;
  const lineMargin = (l: QuoteLine) => (showCost ? (Number(l.unitPrice) || 0) - (Number(l.cost) || 0) : Number(l.profit) || 0);
  const router = useRouter();
  const canSave = doc.billName.trim() !== "" && doc.product.trim() !== "";

  function saveQuotation() {
    if (!canSave) return;
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const svc = cond.service;
    const draft: Booking = {
      id: `draft-${now.getTime()}`,
      orderNo: isNew ? `${ymd}-${String(now.getTime()).slice(-3)}` : (booking?.orderNo ?? `${ymd}-000`),
      date: dateStr, status: "pending_pricing", company: "PACRED",
      customerName: doc.billName || doc.consignee, product: doc.product, sales: salesName,
      pricing: booking?.pricing || "WEB", term: `IM ${cond.term}`,
      transport: /AIR/i.test(svc) ? "AIR" : /TRUCK/i.test(svc) ? "TRUCK" : "SEA",
      fclLcl: cond.loadType,
      size: usesContainer(cond.loadType) ? cond.container : "ตามขนาดสินค้า", warehouse: "", pol: cond.pol.port, pod: cond.pod.port,
      price: `ยอดเสนอราคา ${bahtFmt(totals.grand)}`, hsCode: "", note: doc.remark,
    };
    try {
      const raw = localStorage.getItem("pacred_booking_drafts_import");
      const arr: Booking[] = raw ? JSON.parse(raw) : [];
      const next = [draft, ...arr.filter((d) => d?.orderNo !== draft.orderNo)];
      localStorage.setItem("pacred_booking_drafts_import", JSON.stringify(next));
    } catch { /* ignore */ }
    router.push("/admin/workspace/booking/import?tab=pending_pricing");
  }

  function revalidatePort(p: PortSel, service: string): PortSel {
    // สลับขนส่ง → พอร์ทที่มีเปลี่ยน · ถ้าค่าเดิมไม่อยู่ในพอร์ทของขนส่งใหม่ "และไม่ใช่โกดัง" → เด้งไปพอร์ทแรก
    // (โกดัง = cargo · ไม่ผูกกับขนส่ง เลยคงค่าไว้)
    const ports = PORT_CATALOG[p.country]?.[service] ?? [];
    const warehouses = WAREHOUSE_CATALOG[p.country] ?? [];
    return ports.includes(p.port) || warehouses.includes(p.port) ? p : { country: p.country, port: firstPort(p.country, service) };
  }
  function setC<K extends keyof QuoteConditions>(k: K, v: QuoteConditions[K]) {
    let next = { ...cond, [k]: v } as QuoteConditions;
    if (k === "service") {
      const svc = v as string;
      if (!usesLoadType(svc)) next = { ...next, loadType: "LCL" }; // FCL เฉพาะ SEA
      next = { ...next, pol: revalidatePort(next.pol, svc), pod: revalidatePort(next.pod, svc) };
      if (!carrierValidFor(next.carrier, svc)) next = { ...next, carrier: "" }; // สายเรือ/สายการบิน/สายรถ เปลี่ยนตามขนส่ง
    }
    // เอกสารที่ออกได้ขึ้นกับ TERM (owner พี่ป๊อป) — เปลี่ยน TERM แล้ว docMode เดิมใช้ไม่ได้ → reset (เช่น "ใบกำกับเต็ม" ตอนสลับเป็น DDP)
    if (k === "term" && !docModeOptions(next.term).includes(next.docMode)) {
      next = { ...next, docMode: docModeOptions(next.term)[0] };
    }
    setCond(next);
    // template ขึ้นกับ term + ขนส่ง + loadType → reload line + note เมื่อ combo เปลี่ยน
    if (k === "term" || k === "service" || k === "loadType") {
      setLines(linesForConditions(next, catalog));
      // อัปเดตหมายเหตุตามชุดใหม่ ถ้าผู้ใช้ยังไม่แก้เอง (ว่าง หรือ = note ชุดเดิม)
      const prevNote = noteForConditions(cond, catalog);
      setDoc((d) => (d.remark === "" || d.remark === prevNote ? { ...d, remark: noteForConditions(next, catalog) } : d));
    }
  }
  const setPol = (v: PortSel) => setCond((p) => ({ ...p, pol: v }));
  const setPod = (v: PortSel) => setCond((p) => ({ ...p, pod: v }));
  function setLoadType(v: { loadType: string; container: string }) {
    const next = { ...cond, loadType: v.loadType, container: v.container };
    setCond(next);
    // loadType อยู่ใน catalog key → reload line + note
    setLines(linesForConditions(next, catalog));
    const prevNote = noteForConditions(cond, catalog);
    setDoc((d) => (d.remark === "" || d.remark === prevNote ? { ...d, remark: noteForConditions(next, catalog) } : d));
  }
  function toggleSpecial(s: string) {
    setCond((p) => ({ ...p, special: p.special.includes(s) ? p.special.filter((x) => x !== s) : [...p.special, s] }));
  }
  function editLine(id: string, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, {
      id: `new-${prev.length}-${Math.round(totals.grand)}`, group: "Special", desc: "", qty: 1, unitPrice: 0, vat: true, wht: 0,
      ...(showCost ? { cost: 0 } : {}), ...(showProfit ? { profit: 0 } : {}),
    }]);
  }
  const setF = (k: keyof typeof doc) => (v: string) => setDoc((d) => ({ ...d, [k]: v }));

  const webShort = PACRED_ISSUER.web.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="space-y-5">
      {/* ── หัว + กลับ ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">WORKSPACE · BOOKING · นำเข้า</p>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            {mode === "recommend"
              ? "แนะนำแพ็กเกจ (Booking)"
              : isNew ? "สร้างใบเสนอราคา (Quotation) ใหม่" : `ใบเสนอราคา · Booking ${booking?.orderNo}`}
          </h1>
        </div>
        <Link href="/admin/workspace/booking/import" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> กลับหน้า Booking
        </Link>
      </div>

      {/* ── สลับโหมด (หัว booking เดียวกัน): แนะนำแพ็กเกจ ↔ สร้างใบเสนอราคา ── */}
      <div className="inline-flex w-full max-w-md gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:w-auto">
        <button type="button" onClick={() => setMode("recommend")}
          className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold transition-colors sm:flex-none",
            mode === "recommend" ? "bg-primary-600 text-white shadow-sm" : "text-muted hover:text-foreground")}>
          <Sparkles className="h-4 w-4" /> แนะนำแพ็กเกจ
        </button>
        <button type="button" onClick={() => setMode("create")}
          className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold transition-colors sm:flex-none",
            mode === "create" ? "bg-primary-600 text-white shadow-sm" : "text-muted hover:text-foreground")}>
          <FilePlus2 className="h-4 w-4" /> สร้างใบเสนอราคา
        </button>
      </div>

      {/* ══ MOCKUP 1:1 (quotation_booking_mockup.html) — topbar/flow เอาออก · สถานะย้ายเข้าหัวเอกสาร (owner) ══ */}
      <div className={styles.wrap}>
        {/* ── เงื่อนไขงาน (Trip-style · owner 2026-07-10: หัว=ขนส่ง · POL/POD จิ้มเลือก · ตัด "บริการ" [ทิศทางอนุมานจาก POL/POD]) ── */}
        {/* overflow:visible — ให้ popover ของ POL/POD โผล่พ้นการ์ดได้ (ไม่โดน overflow:hidden ตัด) */}
        <div className={styles.card} style={{ marginBottom: 22, overflow: "visible" }}>
          <div className={styles.cardHead}>
            <h2>เงื่อนไขงาน</h2>
            {showCost ? (
              <Link href="/admin/workspace/booking/import/settings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:text-primary-700">
                <Settings className="h-3.5 w-3.5" /> ตั้งค่าเรท
              </Link>
            ) : <small>ฟอร์มฝั่งแอดมิน</small>}
          </div>
          <div className={styles.cardBody}>
            <p className="mb-3 text-[12px] leading-snug text-[#6f7278]"><b className="text-[#1f2937]">กรอกเงื่อนไขการนำเข้า</b> — ระบบใช้แนะนำแพ็กเกจ + คำนวณราคาให้อัตโนมัติ · เอาเมาส์ชี้ <b className="text-[#1f2937]">ⓘ</b> ข้างชื่อฟิลด์เพื่อดูคำอธิบาย</p>
            {/* ขนส่ง — หัวข้อหลัก (Trip-style tab) · กดแล้วพอร์ทด้านในเปลี่ยนตาม */}
            <div className={styles.transportTabs}>
              {TRANSPORT_TABS.map((t) => (
                <button key={t.id} type="button"
                  className={cx(styles.transportTab, cond.service === t.id && styles.transportTabActive)}
                  onClick={() => setC("service", t.id)}>
                  <span className={styles.transportIcon}>{t.icon}</span> {t.label}
                </button>
              ))}
              <FieldHint content={TRANSPORT_HINT} />
            </div>

            {/* ข้อมูลบรรทัดเดียว (owner 2026-07-10): POL → POD · TERM · ENTER · ประเภท · ขนาดตู้ */}
            <div className={styles.condLine}>
              <PortPicker label="ต้นทาง" placeholder="เลือกต้นทาง" value={cond.pol} transport={cond.service} onChange={setPol} hint={<FieldHint content={POL_HINT} />} />
              <div className={styles.routeArrow}>
                <span className={styles.routeArrowIcon}>→</span>
                <span className={styles.routeDir}>{directionOf(cond).label}</span>
              </div>
              <PortPicker label="ปลายทาง" placeholder="เลือกปลายทาง" value={cond.pod} transport={cond.service} onChange={setPod} hint={<FieldHint content={POD_HINT} />} />
              {/* สินค้า (Commodity) + ประเภทสินค้า — owner ปอน 2026-07-10 · ประเภท "ลิขสิทธิ์" → เรทพิเศษในโปร */}
              <div className={styles.ddCell}>
                <div className={styles.label}>สินค้า<FieldHint content={COMMODITY_HINT} /></div>
                <input className={styles.dropdown} type="text" value={doc.product} placeholder="เช่น เสื้อผ้า / อะไหล่"
                  onChange={(e) => setF("product")(e.target.value)} />
              </div>
              <SelRow stack label="ประเภทสินค้า" options={PRODUCT_TYPE_OPTIONS} value={cond.productType} onPick={(v) => setC("productType", v)} hint={<FieldHint content={PRODUCT_HINT} />} />
              <SelRow stack label="TERM" options={TERM_OPTIONS} value={cond.term} onPick={(v) => setC("term", v)} hint={<FieldHint content={TERM_HINT} align="center" />} />
              <SelRow stack label="ENTER" options={ENTER_OPTIONS} value={cond.enter} colorMap={ENTER_COLOR} onPick={(v) => setC("enter", v)} hint={<FieldHint content={ENTER_HINT} align="center" />} />
              {/* เอกสารที่ออก (owner พี่ป๊อป 2026-07-10) — ตัวเลือกขึ้นกับ TERM: DDP เหมาภาษี ไม่มีใบกำกับเต็ม */}
              <SelRow stack label="เอกสาร" options={docModeOptions(cond.term)} value={cond.docMode} onPick={(v) => setC("docMode", v)} hint={<FieldHint content={DOCMODE_HINT} align="center" />} />
              {usesLoadType(cond.service) && (
                <LoadTypePicker loadType={cond.loadType} container={cond.container} onChange={setLoadType} hint={<FieldHint content={LOADTYPE_HINT} align="right" />} />
              )}
              {/* สายเรือ/สายการบิน/สายรถ — ป้าย+ตัวเลือกเปลี่ยนตามขนส่ง */}
              <SelRow stack label={CARRIER_LABEL[cond.service] ?? "สายขนส่ง"} options={CARRIER_CATALOG[cond.service] ?? []} value={cond.carrier} ph="— เลือก —" onPick={(v) => setC("carrier", v)} hint={<FieldHint content={CARRIER_HINT} align="right" />} />
              {/* น้ำหนัก — บอกว่าใช้รถอะไรไปรับ/ลากตู้ */}
              <div className={styles.ddCell}>
                <div className={styles.label}>น้ำหนัก (กก.)<FieldHint content={WEIGHT_HINT} align="right" /></div>
                <input className={styles.dropdown} type="text" inputMode="decimal" value={cond.weight} placeholder="เช่น 5000"
                  onChange={(e) => setC("weight", e.target.value)} />
              </div>
              {/* CBM (ปริมาตร/คิว) — คู่กับน้ำหนัก · ค่าระวางคิดจากค่าที่มากกว่า (owner ปอน 2026-07-13) */}
              <div className={styles.ddCell}>
                <div className={styles.label}>ปริมาตร (CBM)<FieldHint content={CBM_HINT} align="right" /></div>
                <input className={styles.dropdown} type="text" inputMode="decimal" value={cond.cbm} placeholder="เช่น 12.5"
                  onChange={(e) => setC("cbm", e.target.value)} />
              </div>
              {/* เอเจนต์ */}
              <SelRow stack label="เอเจนต์" options={AGENT_OPTIONS} value={cond.agent} ph="— เลือก —" onPick={(v) => setC("agent", v)} hint={<FieldHint content={AGENT_HINT} align="right" />} />
            </div>

            {/* SPECIAL (ชิป) + ค้นหา — แถวเดียวกัน (owner ปอน 2026-07-10): SPECIAL ซ้าย · ค้นหา ขวา */}
            <div style={{ marginTop: 14 }} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1">
                <SelRow label="SPECIAL" options={SPECIAL_OPTIONS} multi values={cond.special} onPick={toggleSpecial} hint={<FieldHint content={SPECIAL_HINT} />} />
              </div>
              {/* ค้นหา — ผูกกับ booking: กดแล้วโปรแพ็กเกจ (TERM=DDP) ไหลมา · เฉพาะโหมดแนะนำ */}
              {mode === "recommend" && (
                <button type="button" onClick={() => setSearched(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700">
                  <Search className="h-4 w-4" /> ค้นหา
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── โหมด "สร้างใบเสนอราคา": สลับตำแหน่ง (owner ปอน 2026-07-13) — กด "ดูเต็ม" Booking → Booking ไปคอลัมน์ซ้าย(ใหญ่) · ใบเสนอราคาย่อไปแถบขวา · แค่สลับที่ ทั้งคู่ยังโชว์ ── */}
        {mode === "create" && (
        <div className={styles.grid}>
          {/* ── คอลัมน์ซ้าย (ใหญ่ · 2fr) — ใบ Booking เต็ม (ถ้า bookingFull) หรือ ใบเสนอราคา ── */}
          {bookingFull ? (
            <div className="min-w-0">
              <BookingDraftPreview full cond={cond} doc={doc} docNo={docNo} salesName={salesName} attachedSummary={attachedSummary} onToggleFull={setBookingFull} />
            </div>
          ) : (
          <div className={styles.doc}>
            {/* docHeader (หัวจดหมาย) — บนสุดของใบ */}
            <div className={styles.docHeader}>
              <div className={styles.docBrand}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/pacred-logo-red.png" alt="Pacred" className={styles.docLogo} />
                <div>
                  <h2>{PACRED_ISSUER.name}</h2>
                  <p>{PACRED_ISSUER.address}<br />Tax ID: {PACRED_ISSUER.taxId} • Tel: {PACRED_ISSUER.tel} • {webShort}</p>
                </div>
              </div>
              <div className={styles.docRight}>
                <div className={styles.docPage}>หน้า 1/1</div>
                <div className={styles.docOrig}>(ต้นฉบับ)</div>
                <h1>ใบเสนอราคา</h1>
                <div className={styles.docSub}>Quotation</div>
                <div className={styles.docNo}>{docNo}</div>
              </div>
            </div>
            {/* สถานะ Booking (stepper) — ย้ายเข้ามาในใบ ใต้หัวจดหมาย (owner 2026-07-10 "ขยับสถานะมาไว้ในใบ") · สีคงที่ (เอกสารสว่างเสมอ) */}
            <div className="border-b border-[#e9e9ee] px-7 py-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#1f2937]">สถานะ Booking</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.pill}`}>{formStatusLabel(status)}</span>
              </div>
              {status === "cancelled" ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  🛑 รายการนี้ถูกยกเลิก{booking?.note ? ` — ${booking.note}` : ""}
                </div>
              ) : (
                <ol className="flex items-start gap-1 overflow-x-auto scrollbar-x-visible py-1">
                  {STEPPER.map((s, i) => {
                    const activeIdx = STEPPER.indexOf(status);
                    const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "todo";
                    const Icon = STEP_ICONS[i];
                    return (
                      <li key={s} className="flex min-w-[92px] flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                          <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : state === "todo" ? "bg-[#e9e9ee]" : "bg-primary-600"}`} />
                          <span aria-label={formStatusLabel(s)}
                            className={cx(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all",
                              state === "todo"
                                ? "bg-[#f1f1f4] text-[#c4c8cf]"
                                : "bg-primary-600 text-white shadow-sm",
                            )}>
                            <Icon className="h-[22px] w-[22px]" strokeWidth={state === "todo" ? 2 : 2.2} />
                          </span>
                          <span className={`h-0.5 flex-1 ${i === STEPPER.length - 1 ? "opacity-0" : i < activeIdx ? "bg-primary-600" : "bg-[#e9e9ee]"}`} />
                        </div>
                        <span className={`mt-1.5 text-[11px] leading-tight ${state === "current" ? "font-semibold text-[#1f2937]" : "text-[#6f7278]"}`}>{formStatusLabel(s)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* info — เฉพาะที่ต้องขึ้นในใบเสนอราคา (ลูกค้า · งาน+เส้นทาง · เอกสาร) · owner 2026-07-10
                Tax ID/ที่อยู่/Shipper/Consignee/ที่อยู่รับ/สายเรือ/ขนส่งไทย = รายละเอียดตอนจอง ไม่ต้องขึ้นในใบเสนอราคา */}
            <div className={styles.info}>
              <div className={styles.ibox}>
                <h3>ลูกค้า / Customer</h3>
                <div className={styles.kv}>
                  <div className={styles.k}>รหัสสมาชิก</div>
                  <div className={styles.v}>
                    <div className={styles.searchRow}>
                      <input className={styles.inp} value={doc.memberCode} placeholder="เช่น PR10190"
                        onChange={(e) => { setF("memberCode")(e.target.value); setLookupState("idle"); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }} />
                      <button type="button" className={styles.searchBtn} onClick={doLookup} disabled={looking}>{looking ? "…" : "ค้นหา"}</button>
                    </div>
                    {looking && <p className={styles.hintTxt} style={{ color: "#0284c7" }}>⏳ กำลังค้นหา…</p>}
                    {!looking && lookupState === "found" && <p className={styles.hintTxt} style={{ color: "#059669" }}>✓ พบสมาชิก — ดึงข้อมูลให้แล้ว</p>}
                    {!looking && lookupState === "notfound" && <p className={styles.hintTxt} style={{ color: "#d97706" }}>⚠ ไม่พบ — กรอกใหม่เพื่อสมัคร (ได้รหัส PR)</p>}
                  </div>
                  <KvInput label="ชื่อลูกค้า" value={doc.billName} onChange={setF("billName")} placeholder="ชื่อ / บริษัท" />
                  <KvInput label="ชื่อผู้วางบิล" value={doc.billTo} onChange={setF("billTo")} placeholder="ชื่อผู้วางบิล (ถ้าต่างจากลูกค้า)" />
                  <KvInput label="เบอร์โทร" value={doc.phone} onChange={setF("phone")} placeholder="08x-xxx-xxxx" />
                </div>
              </div>

              <div className={styles.ibox}>
                <h3>Shipment Data</h3>
                <div className={styles.kv}>
                  <KvInput label="Shipper" value={doc.shipper} onChange={setF("shipper")} placeholder="ผู้ส่งออกต้นทาง" />
                  <KvInput label="Consignee" value={doc.consignee} onChange={setF("consignee")} placeholder="ผู้รับปลายทาง" />
                  <KvInput label="Commodity" value={doc.product} onChange={setF("product")} placeholder="ชื่อสินค้า" />
                  <KvInput label="POL" value={doc.pol} onChange={setF("pol")} placeholder="ท่า/เมืองต้นทาง" />
                  <div className={styles.k}>POD</div>
                  <div className={styles.v}>{cond.pod.country} · {cond.pod.port} <span style={{ color: "#9aa0a8", fontWeight: 400, fontSize: 11 }}>← จาก POD</span></div>
                </div>
              </div>

              <div className={styles.ibox}>
                <h3>เอกสาร / Owner</h3>
                <div className={styles.kv}>
                  <KvInput label="วันที่ออก" value={doc.useDate} onChange={setF("useDate")} placeholder="วว/ดด/ปปปป" />
                  <KvInput label="ใช้ได้ถึง" value={doc.validUntil} onChange={setF("validUntil")} placeholder="วว/ดด/ปปปป" />
                  <div className={styles.k}>Sale</div><div className={styles.v}>{salesName}</div>
                  <div className={styles.k}>Pricing</div><div className={styles.v}>{booking?.pricing || "WEB"}</div>
                </div>
              </div>
            </div>

            {/* quoteTable */}
            <div className={styles.quoteTable}>
              <div className={styles.qtHead}>
                <div>
                  <span className={styles.sectionTag}>Dynamic quotation lines</span>
                  <div className={styles.sub}>รายการขึ้นตามเงื่อนไขที่เลือก · เรทตั้งต้นจาก “ตั้งค่า” (Pricing)</div>
                </div>
                <div className={styles.sourceWrap}>
                  <button type="button" className={styles.addBtn} onClick={addLine}>+ เพิ่มบรรทัด</button>
                </div>
              </div>

              {/* แถบ Pricing — เห็นต้นทุน/กำไร (ภายใน · ไม่โชว์ลูกค้า) */}
              {canSeeMoney && (
                <div style={{
                  border: `1px solid ${isPricingStage ? "#f1d189" : "#cbd5e1"}`,
                  background: isPricingStage ? "#fff9ec" : "#f6f7fa",
                  borderRadius: 12, padding: "9px 13px", marginBottom: 12, fontSize: 12.5, color: "#4b5563", lineHeight: 1.5,
                }}>
                  🧮 <b>โหมด Pricing</b> — เห็น{[showCost && "ต้นทุน", showProfit && "กำไร"].filter(Boolean).join("/")} (ภายใน · ไม่โชว์ลูกค้า)
                  {isPricingStage
                    ? " · สถานะ “รอดำเนินการ (ทำราคา)” — แก้ราคา/เพิ่ม/ลบ ให้ครบ แล้วส่งกลับ Sales"
                    : " · แก้ราคา/ต้นทุน เพิ่ม/ลบ บรรทัดได้"}
                </div>
              )}

              {!hasTemplate && lines.length === 0 ? (
                <div style={{ border: "1px dashed #d9dce3", borderRadius: 16, padding: "28px 16px", textAlign: "center", color: "#6f7278", fontSize: 13 }}>
                  ยังไม่มีเรทตั้งต้นสำหรับ <b>{templateKeyOf(cond)}</b> — กด “เพิ่มบรรทัด” เพื่อกรอกเอง
                  {canSeeMoney && <><br />หรือไปตั้งเรทชุดนี้ที่หน้า <b>ตั้งค่า</b> (Pricing) เพื่อให้ดึงมาอัตโนมัติครั้งต่อไป</>}
                </div>
              ) : (
                <div className={styles.qtScroll}>
                  <table className={styles.qt}>
                    <thead>
                      <tr>
                        <th>#</th><th>คำอธิบาย</th>
                        <th className={styles.center}>Qty</th><th className={styles.money}>ราคาขาย</th>
                        {showCost && <th className={styles.money}>ต้นทุน</th>}
                        {showProfit && <th className={styles.money}>กำไร</th>}
                        <th className={styles.center}>VAT</th><th className={styles.center}>WHT</th><th className={styles.center} />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => {
                        return (
                          <tr key={l.id}>
                            <td className={styles.no}>{idx + 1}</td>
                            <td>
                              <input className={styles.descIn} value={l.desc} onChange={(e) => editLine(l.id, { desc: e.target.value })} placeholder="คำอธิบายรายการ" />
                              {l.note && <span className={styles.descNote}>⚠ {l.note}</span>}
                            </td>
                            <td className={styles.center}>
                              <input type="number" className={cx(styles.cellIn, styles.qtyIn)} value={l.qty} onChange={(e) => editLine(l.id, { qty: Number(e.target.value) })} />
                            </td>
                            <td className={styles.money}>
                              <input type="number" className={cx(styles.cellIn, styles.priceIn)} value={l.unitPrice} onChange={(e) => editLine(l.id, { unitPrice: Number(e.target.value) })} />
                            </td>
                            {showCost && (
                              <td className={styles.money}>
                                {l.receipt ? <span style={{ color: "#9aa0a8" }}>—</span> : (
                                  <input type="number" className={cx(styles.cellIn, styles.priceIn)} value={l.cost ?? 0} onChange={(e) => editLine(l.id, { cost: Number(e.target.value) })} />
                                )}
                              </td>
                            )}
                            {showProfit && (
                              <td className={styles.money}>
                                {l.receipt ? <span style={{ color: "#9aa0a8" }}>—</span> : (
                                  <span style={{ fontWeight: 700, color: lineMargin(l) < 0 ? "#dc2626" : "#159447" }}>{bahtFmt(lineMargin(l))}</span>
                                )}
                              </td>
                            )}
                            <td className={styles.center}>{l.receipt ? "ไม่มี" : l.vat ? "7%" : "—"}</td>
                            <td className={styles.center}>{l.wht ? `${l.wht}%` : "-"}</td>
                            <td className={styles.center}>
                              <button type="button" className={styles.delBtn} onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))} aria-label="ลบบรรทัด"><Trash2 className="h-3.5 w-3.5" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* summary */}
            <div className={styles.summary}>
              <div className={styles.totalBox}>
                <div className={styles.totalLine}><span>มูลค่าที่คำนวณ VAT</span><span className={styles.amt}>{bahtFmt(totals.vatBase)}</span></div>
                <div className={styles.totalLine}><span>VAT 7%</span><span className={styles.amt}>{bahtFmt(totals.vat)}</span></div>
                {totals.nonVat > 0 && <div className={styles.totalLine}><span>บริการไม่คิด VAT</span><span className={styles.amt}>{bahtFmt(totals.nonVat)}</span></div>}
                <div className={styles.totalLine}><span>เงินทดลองจ่าย / ใบเสร็จจริง</span><span className={styles.amt}>{bahtFmt(totals.receiptTotal)}</span></div>
                <div className={cx(styles.totalLine, styles.big)}><span>ยอดเสนอราคา</span><span className={styles.amt}>{bahtFmt(totals.grand)}</span></div>
                {/* ต้นทุน/กำไร (ภายใน · ไม่โชว์ลูกค้า) — Pricing เท่านั้น */}
                {canSeeMoney && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #d9dce3" }}>
                    {showCost && (
                      <div className={styles.totalLine}><span>ต้นทุนรวม 🔒</span><span className={styles.amt}>{bahtFmt(totals.costTotal)}</span></div>
                    )}
                    <div className={styles.totalLine}>
                      <span>กำไรรวม 🔒</span>
                      <span className={styles.amt} style={{ color: marginTotal < 0 ? "#dc2626" : "#159447" }}>
                        {bahtFmt(marginTotal)}{sellNonReceipt > 0 ? ` (${marginPct.toFixed(1)}%)` : ""}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9aa0a8" }}>🔒 ภายใน — ไม่แสดงในใบที่ส่งลูกค้า</p>
                  </div>
                )}
              </div>
            </div>

            {/* sign */}
            <div className={styles.sign}>
              <div className={styles.signBox}>ผู้ออกเอกสาร<b>{salesName}</b></div>
              <div className={styles.signBox}>ผู้อนุมัติ<b>Account Pacred</b></div>
              <div className={styles.signBox}>ผู้รับเอกสาร<b>ลูกค้า / Customer</b></div>
            </div>
          </div>
          )}

          {/* ── แถบขวา (1fr): ใบเสนอราคาย่อ (ตอน Booking เต็ม) หรือ ตัวอย่างใบ Booking ย่อ · + หมายเหตุ ── */}
          <div className={styles.rail}>
          {bookingFull ? (
            <QuotationCompactCard docNo={docNo} doc={doc} cond={cond} grand={totals.grand} status={status} onExpand={() => setBookingFull(false)} />
          ) : (
            <BookingDraftPreview cond={cond} doc={doc} docNo={docNo} salesName={salesName} attachedSummary={attachedSummary} full={false} onToggleFull={setBookingFull} />
          )}

          {/* ── หมายเหตุ + บันทึก (ฟอร์มฝั่งแอดมิน) — ตัวเลือกบริการย้ายขึ้นบนแล้ว ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>หมายเหตุ + บันทึก</h2>
              <small>ฟอร์มฝั่งแอดมิน</small>
            </div>
            <div className={styles.cardBody}>
              {/* หมายเหตุ + แนบไฟล์ + บันทึก (แอดมิน) */}
              <div className={styles.adminBlock}>
                <div>
                  <p className={styles.fieldLbl}>หมายเหตุ (แสดงในใบเสนอราคา)</p>
                  <textarea className={styles.remarkArea} rows={3} value={doc.remark} onChange={(e) => setF("remark")(e.target.value)}
                    placeholder="เงื่อนไข / โน้ตเพิ่มเติม เช่น ยังไม่รวมค่าขนส่งในจีน · ราคายืนยัน 7 วัน · ขอ PL & INV / MSDS …" />
                </div>
                <div>
                  <p className={styles.fieldLbl}>แนบเอกสาร — แยกช่องตามประเภท (โชว์ตรงกับ Booking Payload ด้านขวา)</p>
                  <div className={styles.docSlots}>
                    {docTypes.map((dt) => {
                      const list = filesFor(dt.key);
                      return (
                        <div key={dt.key} className={styles.docSlot}>
                          <div className={styles.docSlotHead}>
                            <span className={styles.docSlotName}>{dt.label}</span>
                            {list.length > 0 && <span className={styles.docSlotCount}>{list.length}</span>}
                          </div>
                          <label className={styles.docUpload}>
                            <Paperclip className="h-3.5 w-3.5" /> {list.length ? "เพิ่มไฟล์" : "แนบไฟล์"}
                            <input type="file" multiple className="hidden" onChange={(e) => onFilesFor(dt.key, e)} />
                          </label>
                          {list.map((f, i) => (
                            <div key={`${f.name}-${i}`} className={styles.docFileItem}>
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span>{f.name}</span>
                              <button type="button" className={styles.delBtn} onClick={() => removeDocFile(dt.key, i)} aria-label="ลบไฟล์">✕</button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button type="button" className={styles.saveBtn} onClick={saveQuotation} disabled={!canSave} title={canSave ? "" : "กรอก ชื่อลูกค้า + สินค้า ก่อน"}>
                  บันทึกใบเสนอราคา → ส่ง Pricing
                </button>
                <p className={styles.saveHint}>💾 บันทึกแล้วเข้าสถานะ “รอดำเนินการ (ทำราคา)” ให้ Pricing ตรวจ · prototype เก็บชั่วคราวในเครื่อง (ต่อ DB จริง step ถัดไป)</p>
              </div>
            </div>
          </div>
          </div>
        </div>
        )}

        {/* ── โหมด "แนะนำแพ็กเกจ" (Trip-style · owner ปอน 2026-07-10) — เงื่อนไขชุดเดียวกับหน้าสร้าง ── */}
        {mode === "recommend" && (
          <RecommendPackages cond={cond} searched={searched} onSelect={selectPackage} compare={compare} onCompareToggle={toggleCompare} onCreateCompare={createCompareQuotes} />
        )}
      </div>
    </div>
  );
}

// ── ใบเสนอราคา (ย่อ) — การ์ดสรุปในแถบขวา ตอนสลับให้ Booking เต็ม (owner ปอน 2026-07-13) ──
function QuotationCompactCard({
  docNo, doc, cond, grand, status, onExpand,
}: {
  docNo: string;
  doc: { billName: string; product: string; consignee: string };
  cond: QuoteConditions;
  grand: number;
  status: BookingStatus;
  onExpand: () => void;
}) {
  const meta = BOOKING_STATUS_META[status];
  const activeIdx = STEPPER.indexOf(status);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-border bg-primary-600/5 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-600">
            <FileText className="h-3.5 w-3.5" /> ใบเสนอราคา (ย่อ)
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">{docNo}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">DRAFT</span>
          <button type="button" onClick={onExpand}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/50">
            <Maximize2 className="h-3 w-3" /> ดูเต็ม
          </button>
        </div>
      </div>
      {/* สถานะ Booking (ย่อ) — stepper เดียวกับใบเต็ม · owner ปอน 2026-07-13 */}
      <div className="border-b border-border px-3 py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-foreground">สถานะ Booking</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.pill}`}>{formStatusLabel(status)}</span>
        </div>
        <ol className="flex items-start gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEPPER.map((s, i) => {
            const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "todo";
            const Icon = STEP_ICONS[i];
            return (
              <li key={s} className="flex min-w-[48px] flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <span className={cx("h-0.5 flex-1", i === 0 ? "opacity-0" : state === "todo" ? "bg-border" : "bg-primary-500")} />
                  <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all", state === "todo" ? "bg-muted/40 text-muted" : "bg-primary-600 text-white")}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className={cx("h-0.5 flex-1", i === STEPPER.length - 1 ? "opacity-0" : i < activeIdx ? "bg-primary-500" : "bg-border")} />
                </div>
                <span className={cx("mt-1 text-[10px] leading-tight", state === "current" ? "font-semibold text-foreground" : "text-muted")}>{formStatusLabel(s)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <dl className="divide-y divide-border text-[13px]">
        <QRow label="ลูกค้า">{doc.billName || doc.consignee || "—"}</QRow>
        <QRow label="สินค้า">{doc.product || "—"}</QRow>
        <QRow label="เส้นทาง"><span className="inline-flex items-center gap-1 font-medium text-foreground">{cond.pol.port} <ArrowRight className="h-3 w-3 text-muted" /> {cond.pod.port}</span></QRow>
        <QRow label="เทอม">{cond.term}</QRow>
        <QRow label="เอกสาร">{cond.docMode}</QRow>
      </dl>
      <div className="border-t border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-muted">ยอดเสนอราคา</span>
          <span className="text-base font-black text-primary-600">{bahtFmt(grand)}</span>
        </div>
        <button type="button" onClick={onExpand} className="mt-2 text-[11px] font-semibold text-primary-600 hover:text-primary-700">ดูใบเสนอราคาเต็ม →</button>
      </div>
    </section>
  );
}

function QRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <dt className="shrink-0 text-[11px] font-medium text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-foreground">{children}</dd>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────
// POL/POD picker — จิ้มเลือก ประเทศ + พอร์ท (ไม่พิมพ์ · Trip-style · owner 2026-07-10).
// พอร์ทที่เลือกได้ขึ้นกับ "ขนส่ง" (transport) ที่เลือกด้านบน.
function PortPicker({
  label, placeholder, value, transport, onChange, hint,
}: {
  label: string; placeholder: string; value: PortSel; transport: string; onChange: (v: PortSel) => void; hint?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeCountry, setActiveCountry] = useState(value.country || PORT_COUNTRIES[0]);
  // โกดัง (cargo) ↔ พอร์ท — ลิสต์ข้างในต่างกัน (owner ปอน 2026-07-13)
  // เดาโหมดจากค่าเดิม: เป็นพอร์ทของขนส่งนี้→พอร์ท · ไม่งั้นอยู่ในโกดัง→โกดัง · ไม่งั้น default พอร์ท
  // (พอร์ทมาก่อน — กันชื่อซ้ำ เช่น "กวางโจว" เป็นทั้งพอร์ทเรือ + โกดัง)
  const modeFor = (v: PortSel): "port" | "warehouse" =>
    (PORT_CATALOG[v.country]?.[transport] ?? []).includes(v.port) ? "port"
      : (WAREHOUSE_CATALOG[v.country] ?? []).includes(v.port) ? "warehouse" : "port";
  const [pickMode, setPickMode] = useState<"port" | "warehouse">(() => modeFor(value));
  const items = pickMode === "warehouse"
    ? (WAREHOUSE_CATALOG[activeCountry] ?? [])
    : (PORT_CATALOG[activeCountry]?.[transport] ?? []);
  return (
    <div className={styles.portField}>
      <div className={styles.portLabel}>{label}{hint}</div>
      <button type="button" className={styles.portBtn}
        onClick={() => {
          setActiveCountry(value.country || PORT_COUNTRIES[0]);
          setPickMode(modeFor(value));
          setOpen((o) => !o);
        }}>
        {value.port
          ? <span className={styles.portVal}><b>{value.country}</b><span className={styles.portSep}>·</span>{value.port}</span>
          : <span className={styles.portPlaceholder}>{placeholder}</span>}
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#9aa0a8" }} />
      </button>
      {open && (
        <>
          <div className={styles.portBackdrop} onClick={() => setOpen(false)} />
          <div className={styles.portPop}>
            <div className={styles.portCountries}>
              {PORT_COUNTRIES.map((c) => (
                <button key={c} type="button"
                  className={cx(styles.portCountry, c === activeCountry && styles.portCountryActive)}
                  onClick={() => setActiveCountry(c)}>{c}</button>
              ))}
            </div>
            <div className={styles.portList}>
              {/* สลับ พอร์ท ↔ โกดัง (cargo) — ลิสต์ข้างในเปลี่ยนตาม */}
              <div className="mb-1.5 flex gap-1 rounded-lg bg-[#f2f3f7] p-0.5">
                <button type="button" onClick={() => setPickMode("port")}
                  className={cx("flex-1 rounded-md px-2 py-1.5 text-[12px] font-bold transition-colors", pickMode === "port" ? "bg-white text-[#b11117] shadow-sm" : "text-[#6f7278] hover:text-[#374151]")}>
                  พอร์ท
                </button>
                <button type="button" onClick={() => setPickMode("warehouse")}
                  className={cx("flex-1 rounded-md px-2 py-1.5 text-[12px] font-bold transition-colors", pickMode === "warehouse" ? "bg-white text-[#b11117] shadow-sm" : "text-[#6f7278] hover:text-[#374151]")}>
                  โกดัง
                </button>
              </div>
              {items.length ? items.map((p) => (
                <button key={p} type="button"
                  className={cx(styles.portItem, value.country === activeCountry && value.port === p && styles.portItemActive)}
                  onClick={() => { onChange({ country: activeCountry, port: p }); setOpen(false); }}>{p}</button>
              )) : <div className={styles.portEmpty}>{pickMode === "warehouse" ? "ยังไม่มีโกดังสำหรับประเทศนี้" : "ยังไม่มีพอร์ทสำหรับขนส่งนี้"}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ประเภท + ขนาดตู้ = picker เดียว (สไตล์เดียวกับ PortPicker · owner 2026-07-10).
// ซ้าย = LCL / FCL · ขวา = ถ้า FCL → ขนาดตู้ให้จิ้มเลย · LCL = รวมตู้ (ไม่มีขนาด → เลือกแล้วปิด).
function LoadTypePicker({
  loadType, container, onChange, hint,
}: {
  loadType: string; container: string; onChange: (v: { loadType: string; container: string }) => void; hint?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState(loadType || "LCL");
  return (
    <div className={styles.portField}>
      <div className={styles.portLabel}>ประเภท / ขนาดตู้{hint}</div>
      <button type="button" className={styles.portBtn}
        onClick={() => { setActiveType(loadType || "LCL"); setOpen((o) => !o); }}>
        <span className={styles.portVal}>
          <b>{loadType}</b>{loadType === "FCL" && container ? <><span className={styles.portSep}>·</span>{container}</> : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#9aa0a8" }} />
      </button>
      {open && (
        <>
          <div className={styles.portBackdrop} onClick={() => setOpen(false)} />
          <div className={styles.portPop}>
            <div className={styles.portCountries}>
              {LOAD_TYPE_OPTIONS.map((lt) => (
                <button key={lt} type="button"
                  className={cx(styles.portCountry, lt === activeType && styles.portCountryActive)}
                  onClick={() => {
                    if (lt === "LCL") { onChange({ loadType: "LCL", container }); setOpen(false); } // LCL = ไม่มีขนาด → เลือกเลย
                    else setActiveType("FCL"); // FCL → โชว์ขนาดตู้ด้านขวา
                  }}>{lt}</button>
              ))}
            </div>
            <div className={styles.portList}>
              {activeType === "FCL" ? (
                CONTAINER_OPTIONS.map((c) => (
                  <button key={c} type="button"
                    className={cx(styles.portItem, loadType === "FCL" && container === c && styles.portItemActive)}
                    onClick={() => { onChange({ loadType: "FCL", container: c }); setOpen(false); }}>{c}</button>
                ))
              ) : (
                <div className={styles.portEmpty}>LCL = รวมตู้ · ไม่มีขนาดตู้</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SelRow({
  label, options, value, values, multi, colorMap, disabledOpts, note, onPick, stack, ph, hint,
}: {
  label: string; options: string[]; value?: string; values?: string[]; multi?: boolean; colorMap?: Record<string, string>; disabledOpts?: string[]; note?: string; onPick: (v: string) => void;
  /** stack = label above the control (top condition bar) · default = label beside (row). */
  stack?: boolean;
  /** placeholder option (dropdown เท่านั้น) — โชว์ "— เลือก —" ตอนค่ายังว่าง. */
  ph?: string;
  /** ⓘ tooltip อธิบายฟิลด์ (owner ปอน 2026-07-10). */
  hint?: ReactNode;
}) {
  const isActive = (o: string) => (multi ? (values ?? []).includes(o) : value === o);
  const isDisabled = (o: string) => (disabledOpts ?? []).includes(o);
  return (
    <div className={stack ? styles.ddCell : styles.selrow}>
      <div className={styles.label}>{label}{hint}</div>
      <div>
        {multi ? (
          // เลือกหลายอย่าง → ชิป (ดร็อปดาวน์ multi ไม่สะดวก)
          <div className={styles.pillWrap}>
            {options.map((o) => {
              const color = colorMap?.[o];
              const dis = isDisabled(o);
              return (
                <button key={o} type="button" disabled={dis} onClick={() => { if (!dis) onPick(o); }}
                  className={cx(styles.pill, dis ? styles.pillDisabled : isActive(o) ? styles.active : color ? styles[color] : undefined)}>{o}</button>
              );
            })}
          </div>
        ) : (
          // เลือกอย่างเดียว → ดร็อปดาวน์ (owner 2026-07-10)
          <select className={styles.dropdown} value={value ?? ""} onChange={(e) => onPick(e.target.value)}>
            {ph ? <option value="">{ph}</option> : null}
            {options.map((o) => (
              <option key={o} value={o} disabled={isDisabled(o)}>{o}</option>
            ))}
          </select>
        )}
        {note && <div className={styles.rowNote}>{note}</div>}
      </div>
    </div>
  );
}

function KvInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <>
      <div className={styles.k}>{label}</div>
      <div className={styles.v}>
        <input className={styles.inp} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </>
  );
}

// ── โหมด "แนะนำแพ็กเกจ" — ผลลัพธ์แบบ Trip.com (owner ปอน 2026-07-10) ──────────────
// เงื่อนไข (ขนส่ง/พอร์ท/น้ำหนัก) = ชุดเดียวกับหน้า "สร้างใบเสนอราคา" · กด "ค้นหา"
// → โชว์แพ็กเกจโปรของเรา พร้อมเรท ฿/CBM + ฿/KG + ระยะเวลา (จาก lib/quote/cargo-promo-packages).
const PKG_HIGHLIGHT: Record<number, { label: string; cls: string }> = {
  1: { label: "ออกบิลได้ · จบง่าย", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  2: { label: "ยอดนิยม · เรทหยวนถูก", cls: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  3: { label: "ครบวงจร · ฝากสั่ง", cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
};

// แถบขวา (แบบ Trip): แบนเนอร์จริง + สรุปราคาที่ตรง Booking (draft · owner ปอน 2026-07-10).
// แบนเนอร์ = placeholder รูปโปรจริงที่เรามี · เปลี่ยนได้ทีหลัง.
function BookingSummaryAside({
  cond, mode, warehouse, licensed, weight, modeLabel,
}: {
  cond: QuoteConditions; mode: QuoteMode; warehouse: WarehouseKey; licensed: boolean; weight: number; modeLabel: string;
}) {
  const rates = CARGO_PROMO_PACKAGES.map((p) => rateFor(p, licensed, warehouse, mode));
  const cbm = rates.map((r) => r.cbm), kg = rates.map((r) => r.kg);
  const minCbm = Math.min(...cbm), maxCbm = Math.max(...cbm);
  const minKg = Math.min(...kg), maxKg = Math.max(...kg);
  const estMin = weight > 0 ? Math.max(minKg * weight, minCbm * (weight / DEFAULT_COMPARISON), MIN_CHARGE) : 0;
  const estMax = weight > 0 ? Math.max(maxKg * weight, maxCbm * (weight / DEFAULT_COMPARISON), MIN_CHARGE) : 0;
  const range = (a: number, b: number) => `฿${a.toLocaleString()}${a !== b ? `–${b.toLocaleString()}` : ""}`;
  return (
    <aside className="space-y-3 lg:sticky lg:top-4">
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/promotion/importlclchina.png" alt="โปรนำเข้า LCL จีน → ไทย" className="w-full" />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-foreground">สรุปราคา (ตาม Booking)</p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">DRAFT</span>
        </div>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex items-start justify-between gap-2"><dt className="shrink-0 text-muted">เส้นทาง</dt><dd className="text-right font-medium text-foreground">{cond.pol.port} → {cond.pod.port}</dd></div>
          <div className="flex items-start justify-between gap-2"><dt className="shrink-0 text-muted">ขนส่ง</dt><dd className="text-right font-medium text-foreground">{modeLabel} · DDP · {cond.loadType}</dd></div>
          <div className="flex items-start justify-between gap-2"><dt className="shrink-0 text-muted">ประเภทสินค้า</dt><dd className="text-right font-medium text-foreground">{cond.productType}{licensed ? " 🔖" : ""}</dd></div>
          <div className="flex items-start justify-between gap-2"><dt className="shrink-0 text-muted">น้ำหนัก</dt><dd className="text-right font-medium text-foreground">{weight > 0 ? `${weight.toLocaleString()} กก.` : "—"}</dd></div>
        </dl>
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-xs text-muted">ช่วงราคา</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-primary-600">{range(minCbm, maxCbm)}</span>
            <span className="text-sm text-muted">/ CBM</span>
          </div>
          <div className="text-xs text-muted">{range(minKg, maxKg)} / กก.</div>
          {weight > 0 && (
            <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-2 text-xs text-foreground">
              ประมาณ <b className="text-primary-600">{range(Math.round(estMin), Math.round(estMax))}</b> <span className="text-muted">· {weight.toLocaleString()} กก.</span>
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">* ราคาเริ่มต้นตามแพ็กเกจ · เลือกแพ็กเกจด้านซ้าย → ทำใบเสนอราคาเต็ม · <b>draft</b> (แบนเนอร์ placeholder เปลี่ยนได้)</p>
      </div>
    </aside>
  );
}

// แถว/ช่องของตารางเปรียบเทียบ (compact).
function Trow({ label, children }: { label: string; children: ReactNode }) {
  return <tr><td className="border-t border-border py-2 pr-2 text-xs font-medium text-muted">{label}</td>{children}</tr>;
}
function Tcell({ children, best }: { children: ReactNode; best?: boolean }) {
  return (
    <td className={`border-t border-l border-border px-2 py-2 text-center ${best ? "bg-emerald-50 font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "text-foreground"}`}>
      {best ? <span className="mr-0.5">🟢</span> : null}{children}
    </td>
  );
}

/**
 * ตารางเปรียบเทียบแพ็กเกจ side-by-side (owner ปอน 2026-07-10 · "ทำให้ใช้ง่ายๆ") —
 * ดูราคา/CBM · /กก. · ระยะเวลา · ประมาณการ เทียบกันเป็นคอลัมน์ + ไฮไลต์ถูกสุด → เลือก/สร้างแยก.
 */
function CompareModal({
  pkgs, mode, warehouse, licensed, weight, onClose, onCreate, onSelectOne, onRemove,
}: {
  pkgs: CargoPromoPackage[]; mode: QuoteMode; warehouse: WarehouseKey; licensed: boolean; weight: number;
  onClose: () => void; onCreate: () => void; onSelectOne: (pkg: CargoPromoPackage) => void; onRemove: (pkg: CargoPromoPackage) => void;
}) {
  const rows = pkgs.map((pkg) => {
    const rate = rateFor(pkg, licensed, warehouse, mode);
    const est = weight > 0 ? Math.max(rate.kg * weight, rate.cbm * (weight / DEFAULT_COMPARISON), MIN_CHARGE) : 0;
    return { pkg, rate, est };
  });
  const minCbm = Math.min(...rows.map((r) => r.rate.cbm));
  const minEst = weight > 0 ? Math.min(...rows.map((r) => r.est)) : 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border bg-primary-600/5 px-4 py-3">
          <p className="text-sm font-bold text-foreground">🆚 เปรียบเทียบแพ็กเกจ ({pkgs.length})</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg px-2 py-0.5 text-lg leading-none text-muted transition-colors hover:bg-muted/50 hover:text-foreground">✕</button>
        </header>
        <div className="overflow-auto p-4">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="w-24 border-b border-border py-2 text-left"></th>
                {rows.map(({ pkg }) => (
                  <th key={pkg.id} className="border-b border-l border-border px-2 py-2 text-center align-top">
                    <div className="flex items-center justify-between gap-1">
                      <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">แพ็ก {pkg.no}</span>
                      <button type="button" onClick={() => onRemove(pkg)} aria-label="นำออก" className="text-[13px] leading-none text-muted transition-colors hover:text-primary-600">✕</button>
                    </div>
                    <div className="mt-1 text-xs font-bold text-foreground">{pkg.name}</div>
                    <div className="text-[11px] text-muted">{pkg.group}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Trow label="ราคา / CBM">{rows.map(({ pkg, rate }) => <Tcell key={pkg.id} best={rate.cbm === minCbm}>฿{rate.cbm.toLocaleString()}</Tcell>)}</Trow>
              <Trow label="ราคา / กก.">{rows.map(({ pkg, rate }) => <Tcell key={pkg.id}>฿{rate.kg.toLocaleString()}</Tcell>)}</Trow>
              <Trow label="ระยะเวลา">{rows.map(({ pkg, rate }) => <Tcell key={pkg.id}>{rate.days}</Tcell>)}</Trow>
              {weight > 0 && <Trow label={`ประมาณ (${weight.toLocaleString()} กก.)`}>{rows.map(({ pkg, est }) => <Tcell key={pkg.id} best={est === minEst}>฿{Math.round(est).toLocaleString()}</Tcell>)}</Trow>}
              <Trow label="เลือก">{rows.map(({ pkg }) => (
                <td key={pkg.id} className="border-t border-l border-border px-2 py-2 text-center">
                  <button type="button" onClick={() => onSelectOne(pkg)} className="rounded-lg bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-primary-700">เลือกใบนี้</button>
                </td>
              ))}</Trow>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">🟢 = ถูกสุดในกลุ่มที่เทียบ · เรทเบื้องต้น ยังไม่รวมค่าบริการเสริม/ภาษี</p>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50">ปิด</button>
          <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700">สร้างใบเสนอราคาแยก {pkgs.length} ใบ <ArrowRight className="h-3.5 w-3.5" /></button>
        </footer>
      </div>
    </div>
  );
}

function RecommendPackages({
  cond, searched, onSelect, compare, onCompareToggle, onCreateCompare,
}: {
  cond: QuoteConditions; searched: boolean; onSelect: (pkg: CargoPromoPackage) => void;
  compare: string[]; onCompareToggle: (pkg: CargoPromoPackage) => void; onCreateCompare: () => void;
}) {
  const isDdp = cond.term === "DDP"; // โปร cargo (LCL) = TERM DDP เท่านั้น (owner ปอน 2026-07-10)
  const licensed = cond.productType === "ลิขสิทธิ์"; // ประเภทสินค้า ลิขสิทธิ์ → ใช้เรท licensed ในโปร
  const mode: QuoteMode | null = cond.service === "TRUCK" ? "truck" : cond.service === "SEA" ? "ship" : null;
  const warehouse: WarehouseKey = /อี้อู|yiwu/i.test(cond.pol.port) ? "yiwu" : "guangzhou";
  const weight = Number(cond.weight) || 0;
  const routeLabel = `${cond.pol.country} · ${cond.pol.port} → ${cond.pod.country} · ${cond.pod.port}`;
  const ModeIcon = mode === "truck" ? Truck : mode === "ship" ? Ship : Plane;
  const modeLabel = mode === "truck" ? "ทางรถ" : mode === "ship" ? "ทางเรือ" : "ทางอากาศ";
  const [showCompare, setShowCompare] = useState(false); // เปิดตารางเปรียบเทียบ side-by-side (owner ปอน 2026-07-10)

  return (
    <div className="space-y-4">
      {showCompare && mode && compare.length > 0 && (
        <CompareModal
          pkgs={CARGO_PROMO_PACKAGES.filter((p) => compare.includes(p.id))}
          mode={mode} warehouse={warehouse} licensed={licensed} weight={weight}
          onClose={() => setShowCompare(false)}
          onCreate={() => { setShowCompare(false); onCreateCompare(); }}
          onSelectOne={(pkg) => { setShowCompare(false); onSelect(pkg); }}
          onRemove={onCompareToggle}
        />
      )}
      {!searched ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <Sparkles className="mb-3 h-9 w-9 text-primary-400" />
          <p className="text-base font-semibold text-foreground">ตั้งเงื่อนไขงานด้านบน แล้วกด “ค้นหา”</p>
          <p className="mt-1 text-sm text-muted">โปรแพ็กเกจ cargo (LCL) จะขึ้นเมื่อเลือก TERM = DDP</p>
        </div>
      ) : !isDdp ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-10 text-center">
          <PackageCheck className="mx-auto mb-2 h-8 w-8 text-muted" />
          <p className="font-semibold text-foreground">โปรแพ็กเกจ cargo มีเฉพาะบริการ LCL · TERM = DDP</p>
          <p className="mt-1 text-sm text-muted">TERM ตอนนี้ = <b className="text-foreground">{cond.term}</b> — เปลี่ยนเป็น <b className="text-primary-600">DDP</b> ที่เงื่อนไขงานด้านบน เพื่อดูแพ็กเกจแนะนำ</p>
        </div>
      ) : mode === null ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
          <Plane className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <p className="font-semibold text-amber-800 dark:text-amber-200">ทางอากาศยังไม่มีแพ็กเกจ cargo สำเร็จรูป</p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300/80">เลือก ทางรถ / ทางเรือ ที่เงื่อนไขงานด้านบน เพื่อดูแพ็กเกจ cargo</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="min-w-0 space-y-3">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-sm text-muted">
            <ModeIcon className="h-4 w-4 text-primary-600" />
            <b className="text-foreground">{CARGO_PROMO_PACKAGES.length} แพ็กเกจ</b> · <b className="text-foreground">{modeLabel} · DDP (LCL)</b> · {cond.productType}{licensed ? " 🔖" : ""} · {routeLabel}
            {warehouse === "yiwu" ? " · โกดังอี้อู" : ""}{weight > 0 ? ` · ${weight.toLocaleString()} กก.` : ""}
          </p>
          {compare.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-100 bg-primary-50/70 px-3 py-2 dark:border-primary-500/30 dark:bg-primary-500/10">
              <span className="text-[13px] font-semibold text-foreground">🆚 เปรียบเทียบ {compare.length} แพ็กเกจ</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowCompare(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-background px-3 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10">
                  📊 ดูตารางเทียบ
                </button>
                <button type="button" onClick={onCreateCompare}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700">
                  สร้างแยก {compare.length} ใบ <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {CARGO_PROMO_PACKAGES.map((pkg) => {
              const rate = rateFor(pkg, licensed, warehouse, mode);
              const est = weight > 0 ? Math.max(rate.kg * weight, rate.cbm * (weight / DEFAULT_COMPARISON), MIN_CHARGE) : 0;
              const hl = PKG_HIGHLIGHT[pkg.no];
              return (
                <article key={pkg.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md md:flex-row md:items-stretch">
                  {/* identity (ซ้าย) */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">แพ็กเกจ {pkg.no}</span>
                      {hl && <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", hl.cls)}><Sparkles className="h-3 w-3" /> {hl.label}</span>}
                    </div>
                    <h3 className="text-base font-bold text-foreground">{pkg.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">{pkg.group}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-primary-500" /> {rate.days}</span>
                      {pkg.productNote && <span className="inline-flex items-center gap-1 text-muted"><PackageCheck className="h-3.5 w-3.5" /> {pkg.productNote}</span>}
                    </div>
                    {pkg.conditions.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {pkg.conditions.map((c, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-muted"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> <span>{c}</span></li>
                        ))}
                      </ul>
                    )}
                    {pkg.licensedRates && !licensed && (
                      <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                        <ShieldCheck className="h-3.5 w-3.5" /> สินค้าลิขสิทธิ์: ฿{rateFor(pkg, true, warehouse, mode).cbm.toLocaleString()}/CBM
                      </p>
                    )}
                  </div>
                  {/* price + cta (ขวา) */}
                  <div className="flex shrink-0 flex-col justify-between gap-3 border-t border-border pt-3 md:w-56 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-primary-600">฿{rate.cbm.toLocaleString()}</span>
                        <span className="text-sm text-muted">/ CBM</span>
                      </div>
                      <div className="text-xs text-muted">฿{rate.kg.toLocaleString()} / กก.</div>
                      {weight > 0 && (
                        <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-foreground">
                          ประมาณ <b className="text-primary-600">฿{Math.round(est).toLocaleString()}</b>
                          <span className="text-muted"> · {weight.toLocaleString()} กก.</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => onSelect(pkg)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700">
                        เลือกแพ็กเกจนี้ <ArrowRight className="h-4 w-4" />
                      </button>
                      <label className="flex cursor-pointer items-center justify-center gap-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground">
                        <input type="checkbox" checked={compare.includes(pkg.id)} onChange={() => onCompareToggle(pkg)} className="h-3.5 w-3.5 accent-primary-600" />
                        เปรียบเทียบ (แยกใบ)
                      </label>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="px-1 pt-1 text-[11px] leading-relaxed text-muted">
            * เรทตั้งต้นจากโปรโมชัน LCL จีน→ไทย · 1 CBM ไม่เกิน {DEFAULT_COMPARISON} กก. (เกินคิดเป็นกิโล) · ขั้นต่ำ ฿{MIN_CHARGE}/shipment · เป็นประมาณการเบื้องต้น ยังไม่รวมค่าบริการเสริม/ภาษี — กด “เลือกแพ็กเกจนี้” เพื่อไปทำใบเสนอราคาเต็ม
          </p>
          </div>
          {/* แถบขวา: สรุปราคาที่ตรง Booking + แบนเนอร์จริง (draft · owner ปอน 2026-07-10) */}
          <BookingSummaryAside cond={cond} mode={mode} warehouse={warehouse} licensed={licensed} weight={weight} modeLabel={modeLabel} />
        </div>
      )}
    </div>
  );
}
