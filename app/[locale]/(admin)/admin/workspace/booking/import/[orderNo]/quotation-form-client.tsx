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

import { useMemo, useState, type ReactNode, type ChangeEvent } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ArrowLeft, Paperclip, Trash2, Settings, ChevronDown } from "lucide-react";
import { BOOKING_STATUS_META, type Booking, type BookingStatus } from "../booking-data";
import {
  TERM_OPTIONS, ENTER_OPTIONS, SPECIAL_OPTIONS, LOAD_TYPE_OPTIONS, CONTAINER_OPTIONS, TRANSPORT_TABS, PORT_COUNTRIES, PORT_CATALOG, firstPort, directionOf,
  linesForConditions, computeQuoteTotals, bahtFmt, templateKeyOf, usesLoadType, usesContainer, noteForConditions, PACRED_ISSUER,
  type QuoteConditions, type PortSel, type QuoteLine,
} from "../quotation-data";
import type { CatalogTemplate } from "@/lib/booking/catalog";
import { lookupMemberByCode } from "@/actions/admin/booking-member-lookup";
import styles from "./quotation-mockup.module.css";

// ลำดับ stepper (ตัด "ยกเลิก" ออก — โชว์เป็น banner แยก)
const STEPPER: BookingStatus[] = [
  "customer_created", "pending_pricing", "awaiting_confirm", "awaiting_booking", "booking_confirmed", "success",
];

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
    loadType, container: "1×20'", term, enter: "Normal", special: [],
  };
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

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
    taxId: "", shipper: "",
    consignee: booking?.customerName && booking.customerName !== "—" ? booking.customerName : "",
    product: booking?.product ?? "", pol: booking?.pol ?? "", pickupAddress: "",
    pod: booking?.pod ?? "", address: "", carrierAgent: "", transportAgent: "",
    useDate: "", acceptDate: "", validUntil: "", reference: "", remark: noteForConditions(initCond, catalog),
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
  const hasGroup = (g: string) => lines.some((l) => l.group === g);

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
    // สลับขนส่ง → พอร์ทที่มีเปลี่ยน · ถ้าพอร์ทเดิมไม่อยู่ในขนส่งใหม่ ให้เด้งไปพอร์ทแรก
    const ports = PORT_CATALOG[p.country]?.[service] ?? [];
    return ports.includes(p.port) ? p : { country: p.country, port: firstPort(p.country, service) };
  }
  function setC<K extends keyof QuoteConditions>(k: K, v: QuoteConditions[K]) {
    let next = { ...cond, [k]: v } as QuoteConditions;
    if (k === "service") {
      const svc = v as string;
      if (!usesLoadType(svc)) next = { ...next, loadType: "LCL" }; // FCL เฉพาะ SEA
      next = { ...next, pol: revalidatePort(next.pol, svc), pod: revalidatePort(next.pod, svc) };
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
            {isNew ? "สร้างใบเสนอราคา (Quotation) ใหม่" : `ใบเสนอราคา · Booking ${booking?.orderNo}`}
          </h1>
        </div>
        <Link href="/admin/workspace/booking/import" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> กลับหน้า Booking
        </Link>
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
            {/* ขนส่ง — หัวข้อหลัก (Trip-style tab) · กดแล้วพอร์ทด้านในเปลี่ยนตาม */}
            <div className={styles.transportTabs}>
              {TRANSPORT_TABS.map((t) => (
                <button key={t.id} type="button"
                  className={cx(styles.transportTab, cond.service === t.id && styles.transportTabActive)}
                  onClick={() => setC("service", t.id)}>
                  <span className={styles.transportIcon}>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>

            {/* ข้อมูลบรรทัดเดียว (owner 2026-07-10): POL → POD · TERM · ENTER · ประเภท · ขนาดตู้ */}
            <div className={styles.condLine}>
              <PortPicker label="ต้นทาง (POL)" placeholder="เลือกต้นทาง" value={cond.pol} transport={cond.service} onChange={setPol} />
              <div className={styles.routeArrow}>
                <span className={styles.routeArrowIcon}>→</span>
                <span className={styles.routeDir}>{directionOf(cond).label}</span>
              </div>
              <PortPicker label="ปลายทาง (POD)" placeholder="เลือกปลายทาง" value={cond.pod} transport={cond.service} onChange={setPod} />
              <SelRow stack label="TERM" options={TERM_OPTIONS} value={cond.term} onPick={(v) => setC("term", v)} />
              <SelRow stack label="ENTER" options={ENTER_OPTIONS} value={cond.enter} colorMap={ENTER_COLOR} onPick={(v) => setC("enter", v)} />
              {usesLoadType(cond.service) && (
                <LoadTypePicker loadType={cond.loadType} container={cond.container} onChange={setLoadType} />
              )}
            </div>

            {/* SPECIAL — ชิป (เลือกหลายอย่าง) */}
            <div style={{ marginTop: 14 }}>
              <SelRow label="SPECIAL" options={SPECIAL_OPTIONS} multi values={cond.special} onPick={toggleSpecial} />
            </div>
          </div>
        </div>

        {/* grid: เอกสาร (ซ้าย · หลัก) + แถบขวา (หมายเหตุ/บันทึก + Booking Payload) */}
        <div className={styles.grid}>
          {/* ── เอกสาร Peak (ใบเสนอราคา) — คอลัมน์ซ้าย (หลัก) ── */}
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
                <ol className="flex items-start gap-1 overflow-x-auto scrollbar-x-visible pb-1">
                  {STEPPER.map((s, i) => {
                    const activeIdx = STEPPER.indexOf(status);
                    const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "todo";
                    return (
                      <li key={s} className="flex min-w-[92px] flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                          <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : state === "todo" ? "bg-[#e9e9ee]" : "bg-primary-400"}`} />
                          <span className={[
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                            state === "current" ? "bg-primary-600 text-white ring-4 ring-primary-100"
                              : state === "done" ? "bg-primary-100 text-primary-700"
                                : "bg-[#f2f3f7] text-[#6f7278]",
                          ].join(" ")}>{i + 1}</span>
                          <span className={`h-0.5 flex-1 ${i === STEPPER.length - 1 ? "opacity-0" : i < activeIdx ? "bg-primary-400" : "bg-[#e9e9ee]"}`} />
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

          {/* ── แถบขวา: ย้าย Condition Builder มากองรวมกับ Booking Payload (owner: ซ้าย→ขวา) ── */}
          <div className={styles.rail}>
          {/* ── Booking Payload (สลับขึ้นบน · owner 2026-07-10) ── */}
          <div className={styles.card}>
            <div className={styles.cardHead}><h2>Booking Payload</h2><span className={styles.sync}>Auto Sync</span></div>
            <div className={styles.cardBody}>
              <div className={styles.payloadTitle}>
                <span className={styles.sectionTag}>Fields sent to Booking</span>
                <small style={{ color: "#6f7278", fontSize: 12 }}>ไม่เอาราคาไป Booking</small>
              </div>
              <table className={styles.mapTable}>
                <thead><tr><th>Booking Field</th><th>Value</th></tr></thead>
                <tbody>
                  <PayRow field="booking_ref" value={docNo} src="Quote Header" />
                  <PayRow field="direction" value={directionOf(cond).code || "—"} src="POL/POD" />
                  <PayRow field="service_type" value={usesLoadType(cond.service) ? `${cond.service} ${cond.loadType}` : cond.service} src="ขนส่ง" />
                  <PayRow field="term" value={cond.term} src="Term" />
                  <PayRow field="port_of_loading" value={`${cond.pol.country} · ${cond.pol.port}`} src="POL" />
                  <PayRow field="destination_port" value={`${cond.pod.country} · ${cond.pod.port}`} src="POD" />
                  <PayRow field="container" value={usesContainer(cond.loadType) ? cond.container : "—"} src="ขนาดตู้" />
                  <PayRow field="commodity" value={doc.product || "—"} src="Description" />
                  <PayRow field="local_logistics" value={hasGroup("Transport") ? "Yes" : "—"} ok={hasGroup("Transport")} src="Transport line item" />
                  <PayRow field="customs_clearance" value={hasGroup("Customs") ? "Yes" : "—"} ok={hasGroup("Customs")} src="Customs line item" />
                  <PayRow field="paperless_doc" value={hasGroup("Document") ? "Required" : "—"} ok={hasGroup("Document")} src="Document line item" />
                  <PayRow field="warehouse_rent" value={hasGroup("Receipt") ? "Estimate / collect actual" : "—"} src="Receipt line item" />
                  <PayRow field="remark" value={doc.remark || "ตรวจใบอนุญาต / ปัญหาเฉพาะ shipment"} src="Special rules" />
                </tbody>
              </table>
            </div>
          </div>

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
                  <p className={styles.fieldLbl}>แนบเอกสาร (PL / INV / MSDS / รูปสินค้า …)</p>
                  <label className={styles.attach}>
                    <Paperclip className="h-4 w-4" /> คลิกเพื่อเลือกไฟล์ (แนบได้หลายไฟล์)
                    <input type="file" multiple className="hidden" onChange={onFiles} />
                  </label>
                  {files.length > 0 && (
                    <ul className={styles.fileList}>
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className={styles.fileItem}>
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span>{f.name}</span>
                          <button type="button" className={styles.delBtn} onClick={() => removeFile(i)} aria-label="ลบไฟล์">✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
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
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────
// POL/POD picker — จิ้มเลือก ประเทศ + พอร์ท (ไม่พิมพ์ · Trip-style · owner 2026-07-10).
// พอร์ทที่เลือกได้ขึ้นกับ "ขนส่ง" (transport) ที่เลือกด้านบน.
function PortPicker({
  label, placeholder, value, transport, onChange,
}: {
  label: string; placeholder: string; value: PortSel; transport: string; onChange: (v: PortSel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeCountry, setActiveCountry] = useState(value.country || PORT_COUNTRIES[0]);
  const ports = PORT_CATALOG[activeCountry]?.[transport] ?? [];
  return (
    <div className={styles.portField}>
      <div className={styles.portLabel}>{label}</div>
      <button type="button" className={styles.portBtn}
        onClick={() => { setActiveCountry(value.country || PORT_COUNTRIES[0]); setOpen((o) => !o); }}>
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
              {ports.length ? ports.map((p) => (
                <button key={p} type="button"
                  className={cx(styles.portItem, value.country === activeCountry && value.port === p && styles.portItemActive)}
                  onClick={() => { onChange({ country: activeCountry, port: p }); setOpen(false); }}>{p}</button>
              )) : <div className={styles.portEmpty}>ยังไม่มีพอร์ทสำหรับขนส่งนี้</div>}
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
  loadType, container, onChange,
}: {
  loadType: string; container: string; onChange: (v: { loadType: string; container: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState(loadType || "LCL");
  return (
    <div className={styles.portField}>
      <div className={styles.portLabel}>ประเภท / ขนาดตู้</div>
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
  label, options, value, values, multi, colorMap, disabledOpts, note, onPick, stack,
}: {
  label: string; options: string[]; value?: string; values?: string[]; multi?: boolean; colorMap?: Record<string, string>; disabledOpts?: string[]; note?: string; onPick: (v: string) => void;
  /** stack = label above the control (top condition bar) · default = label beside (row). */
  stack?: boolean;
}) {
  const isActive = (o: string) => (multi ? (values ?? []).includes(o) : value === o);
  const isDisabled = (o: string) => (disabledOpts ?? []).includes(o);
  return (
    <div className={stack ? styles.ddCell : styles.selrow}>
      <div className={styles.label}>{label}</div>
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

function PayRow({ field, value, ok }: { field: string; value: ReactNode; src?: string; ok?: boolean }) {
  return (
    <tr>
      <td className={styles.field}>{field}</td>
      <td className={ok ? styles.ok : undefined}>{value}</td>
    </tr>
  );
}
