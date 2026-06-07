"use client";

/**
 * FreightQuoteWizard — the public freight RFQ funnel (ported from AX BOOKING).
 *
 * 5 steps:
 *   1. ประเภทลูกค้า + บริการ          (customer type + service)
 *   2. ขนส่ง + Incoterm + ปลายทาง     (transport + incoterm + POD)
 *   3. รายละเอียดสินค้า               (FCL size/qty | LCL CBM+weight | AIR volumetric=CBM×167)
 *   4. บริการเสริม + เอกสารตามบริบท    (add-ons + doc checklist by context)
 *   5. ใบเสนอราคาประมาณการ + ติดต่อ    (rough estimate + contact → submit)
 *
 * The estimate is a rough client-side number (doc 02 §2.5 rate hints) marked
 * "ประมาณการ"; sales confirms. On submit → submitFreightQuote → shows the ref.
 *
 * Pacred Tailwind (brand red primary-600), mobile-first (360/390px),
 * Thai labels. NOT a copy of the prototype's markup.
 */

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  User, Building2, Package, Rocket, FileText, ShoppingBag, Unlock,
  Ship, Plane, Truck, Anchor, MapPin, Boxes, Layers, Zap,
  ShieldCheck, Warehouse, Wrench, Languages, FileCheck2, HandCoins,
  CheckCircle2, ArrowRight, ArrowLeft, Phone, MessageCircle, Loader2, PartyPopper,
} from "lucide-react";
import { submitFreightQuote } from "@/actions/freight-quote";
import type {
  FreightRfqInput, CustomerType, RfqService, RfqTransport, RfqIncoterm,
  RfqLoadType, RfqContainerSize, RfqContactPref,
} from "@/lib/validators/freight-rfq";

// ── static option data ─────────────────────────────────────────────────────
const SERVICES: { val: RfqService; icon: typeof Package; label: string; sub: string }[] = [
  { val: "import",    icon: Package,    label: "นำเข้า (Import)",      sub: "นำสินค้าเข้าไทย ครบพิธีการ" },
  { val: "export",    icon: Rocket,     label: "ส่งออก (Export)",       sub: "ส่งออกจากไทย ทุกท่าทั่วโลก" },
  { val: "customs",   icon: FileText,   label: "ออกใบขนสินค้า",         sub: "ทำพิธีการศุลกากรอย่างเดียว" },
  { val: "nondoc",    icon: ShoppingBag,label: "ฝากสั่ง / ไม่รับเอกสาร", sub: "เหมาตู้ NON ไม่ต้องมีบริษัท" },
  { val: "clearance", icon: Unlock,     label: "เคลียร์สินค้าติดด่าน",    sub: "ติดใบอนุญาต มอก/อย/กสทช" },
];

const TRANSPORTS: { val: RfqTransport; icon: typeof Ship; label: string; sub: string }[] = [
  { val: "sea",   icon: Ship,  label: "ทางเรือ (SEA)",   sub: "FCL / LCL · 20' · 40' · 40HQ" },
  { val: "air",   icon: Plane, label: "ทางอากาศ (AIR)",  sub: "Express / General · คิดตาม kg" },
  { val: "truck", icon: Truck, label: "ทางรถ (TRUCK)",   sub: "หัวลาก / ข้ามแดนจีน-ไทย" },
];

const INCOTERMS: { val: RfqIncoterm; name: string; desc: string; tag?: string }[] = [
  { val: "EXW", name: "Ex Works",                  desc: "ผู้ซื้อรับผิดชอบทุกอย่างตั้งแต่โรงงาน",         tag: "ครบเอกสาร" },
  { val: "FOB", name: "Free on Board",             desc: "รับช่วงตั้งแต่ขึ้นเรือต้นทาง",                 tag: "จีน+ไทย" },
  { val: "CIF", name: "Cost·Insurance·Freight",    desc: "ทำพิธีไทยอย่างเดียว — ง่ายที่สุด",            tag: "แนะนำ" },
  { val: "DDP", name: "Delivered Duty Paid",       desc: "ผู้ขายรับทุกอย่างถึงปลายทาง (แชร์ตู้ NNB)",   tag: "NON" },
  { val: "CFR", name: "Cost & Freight",            desc: "จองค่าขนส่ง + รถไทย เคลียร์เอง" },
];

const CONTAINER_SIZES: { val: RfqContainerSize; label: string; sub: string }[] = [
  { val: "20GP", label: "20' GP", sub: "≈35 CBM / 15 ตัน" },
  { val: "40GP", label: "40' GP", sub: "≈65 CBM / 25 ตัน" },
  { val: "40HC", label: "40' HC", sub: "≈76 CBM / 25 ตัน" },
  { val: "45HC", label: "45' HC", sub: "≈80 CBM / 28 ตัน" },
];

const ADDONS: { name: string; icon: typeof Truck; sub: string; price: number }[] = [
  { name: "หัวลาก",       icon: Truck,       sub: "รถหัวลากรับตู้ส่งถึงโกดัง",       price: 2500 },
  { name: "แรงงาน",       icon: HandCoins,   sub: "ยกขนสินค้าขึ้น-ลง / เปิดตู้",     price: 500 },
  { name: "ประกันสินค้า",  icon: ShieldCheck, sub: "คุ้มครองความเสียหายระหว่างขนส่ง", price: 800 },
  { name: "จัดเก็บสินค้า", icon: Warehouse,   sub: "พักสินค้าที่คลังเรา รายวัน",      price: 300 },
  { name: "แพคกิ้ง",      icon: Boxes,       sub: "ห่อหุ้ม / เปลี่ยนกล่อง / นับสต็อก", price: 400 },
  { name: "ล้างตู้/อบควัน", icon: Wrench,     sub: "Fumigation สำหรับสินค้าเกษตร",    price: 600 },
  { name: "ล่ามจีน",      icon: Languages,   sub: "ประสานงานซัพพลายเออร์จีนแทนคุณ",   price: 800 },
];

// Stable display-only slug for each addon's Thai `name` value (the `name` stays
// the identity/key used in state + payload + lookups; this only maps to an i18n key).
const ADDON_KEYS: Record<string, string> = {
  "หัวลาก": "tractor",
  "แรงงาน": "labor",
  "ประกันสินค้า": "insurance",
  "จัดเก็บสินค้า": "storage",
  "แพคกิ้ง": "packing",
  "ล้างตู้/อบควัน": "fumigation",
  "ล่ามจีน": "interpreter",
};

const ORIGIN_CITIES = ["อี้อู (Yiwu)", "กว่างโจว (Guangzhou)", "เซินเจิ้น (Shenzhen)", "เซี่ยงไฮ้ (Shanghai)", "หนิงโป (Ningbo)", "อื่นๆ"];
const PODS = ["กรุงเทพ / สุวรรณภูมิ", "แหลมฉบัง (LCB)", "มุกดาหาร", "อื่นๆ / ทั่วไทย"];

// Display-only slug for each POD value (the value stays the submitted/compared identity).
const POD_KEYS: Record<string, string> = {
  "กรุงเทพ / สุวรรณภูมิ": "bangkok",
  "แหลมฉบัง (LCB)": "laemChabang",
  "มุกดาหาร": "mukdahan",
  "อื่นๆ / ทั่วไทย": "other",
};

// Docs required by context (service + customer type + incoterm).
function docsFor(s: State, t: Translator): { name: string; req: boolean }[] {
  const out: { name: string; req: boolean }[] = [
    { name: "Invoice", req: true },
    { name: "Packing List", req: true },
  ];
  if (s.customerType === "company") {
    out.push({ name: "ภพ.20", req: true }, { name: t("doc.companyCert"), req: true }, { name: t("doc.directorId"), req: true });
  } else {
    out.push({ name: t("doc.idCard"), req: true });
  }
  if (s.transport === "sea") out.push({ name: "Bill of Lading (B/L)", req: true });
  if (s.transport === "air") out.push({ name: "Air Waybill (AWB)", req: true });
  if (s.incoterm === "EXW" || s.incoterm === "FOB") out.push({ name: t("doc.originCert"), req: false });
  if (s.incoterm === "CIF") out.push({ name: "Insurance Certificate", req: false });
  if (s.service === "clearance") out.push({ name: t("doc.powerOfAttorney"), req: true }, { name: t("doc.importLicense"), req: false });
  // dedup by name
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.name) ? false : (seen.add(d.name), true)));
}

type State = {
  customerType: CustomerType;
  service: RfqService;
  transport?: RfqTransport;
  incoterm?: RfqIncoterm;
  loadType?: RfqLoadType;
  containerSize?: RfqContainerSize;
  containerQty: number;
  origin: string;
  destination: string;
  product: string;
  goodsValueUsd: string;
  cbm: string;
  weightKg: string;
  addons: string[];
  contactName: string;
  contactPhone: string;
  contactLine: string;
  contactEmail: string;
  contactPref: RfqContactPref;
  note: string;
};

const STEP_KEYS = ["jobType", "transportTerm", "productDetail", "addonsDocs", "quote"] as const;

// ── rough estimate (doc 02 §2.5 hints) ──────────────────────────────────────
type Translator = (key: string, values?: Record<string, string | number>) => string;

function estimate(s: State, t: Translator): { lines: { k: string; v: number }[]; total: number } {
  const lines: { k: string; v: number }[] = [];
  const cbm = parseFloat(s.cbm) || 0;
  const wt = parseFloat(s.weightKg) || 0;
  let base = 0;
  let baseLabel = "";

  if (s.service === "customs" || s.service === "clearance") {
    base = 3500; baseLabel = t("estimate.lineCustomsService");
  } else if (s.transport === "sea") {
    if (s.loadType === "FCL") {
      const flat: Record<string, number> = { "20GP": 55000, "40GP": 75000, "40HC": 80000, "45HC": 95000 };
      base = (flat[s.containerSize ?? "20GP"] ?? 55000) * Math.max(1, s.containerQty);
      baseLabel = t("estimate.lineFcl");
    } else {
      // LCL เรือ ฿2,000/CBM (DDP/ฝากสั่ง = ฿3,500/CBM bundled)
      const rate = s.incoterm === "DDP" || s.service === "nondoc" ? 3500 : 2000;
      base = cbm * rate; baseLabel = t("estimate.lineLcl");
    }
  } else if (s.transport === "truck") {
    // รถ ฿5,500/CBM
    base = cbm ? cbm * 5500 : 8000; baseLabel = t("estimate.lineTruck");
  } else if (s.transport === "air") {
    // AIR volumetric = CBM × 167; chargeable = max(actual, volumetric); ~฿120/kg
    const volW = cbm * 167;
    const chargeable = Math.max(wt, volW);
    base = chargeable * 120; baseLabel = t("estimate.lineAir");
  }

  if (base > 0) {
    if (base < 3500) base = 3500;
    lines.push({ k: baseLabel, v: Math.round(base) });
    // +฿1,500 customs +฿500 docs (skip for pure remit/no transport)
    if (s.service !== "nondoc" || s.transport) {
      lines.push({ k: t("estimate.lineCustomsClearance"), v: 1500 });
      lines.push({ k: t("estimate.lineDocs"), v: 500 });
    }
  }

  for (const name of s.addons) {
    const a = ADDONS.find((x) => x.name === name);
    if (a && a.price > 0) lines.push({ k: t("estimate.lineAddon", { name: ADDON_KEYS[name] ? t(`addon.${ADDON_KEYS[name]}.name`) : name }), v: a.price });
  }

  const total = lines.reduce((sum, l) => sum + l.v, 0);
  return { lines, total };
}

// ── small UI helpers ────────────────────────────────────────────────────────
function SecCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 mb-4 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-3.5 text-primary-700 dark:text-primary-300 text-[12px] md:text-[13px] font-black tracking-wide uppercase">
        <span className="w-1 h-4 rounded bg-primary-600" /> {title}
      </div>
      {children}
    </div>
  );
}

function ChoiceBtn({ selected, onClick, icon: Icon, label, sub }: {
  selected: boolean; onClick: () => void; icon?: typeof Package; label: string; sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 text-center rounded-xl border p-3 md:p-4 min-h-[88px] transition-all ${
        selected
          ? "border-primary-600 bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-600 shadow-[0_6px_18px_rgba(179,0,0,0.18)]"
          : "border-gray-200 dark:border-border bg-white dark:bg-surface hover:border-primary-300 hover:bg-primary-50/40"
      }`}
    >
      {Icon && <Icon className={`w-6 h-6 md:w-7 md:h-7 ${selected ? "text-primary-600" : "text-foreground/55"}`} strokeWidth={2} />}
      <span className={`text-[12.5px] md:text-[13.5px] font-bold leading-tight ${selected ? "text-primary-700 dark:text-primary-200" : "text-foreground/85"}`}>{label}</span>
      {sub && <span className="text-[10.5px] md:text-[11px] text-muted leading-tight">{sub}</span>}
    </button>
  );
}

const inputCls =
  "w-full h-11 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-surface text-foreground text-[14px] font-medium px-3.5 transition-all focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15 placeholder:text-muted/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] md:text-[12.5px] font-bold text-foreground/75">{label}</span>
      {children}
    </label>
  );
}

// ── main component ───────────────────────────────────────────────────────────
export function FreightQuoteWizard({ phone, phoneDisplay, lineUrl }: {
  phone: string; phoneDisplay: string; lineUrl: string;
}) {
  const t = useTranslations("freightQuoteWizard");
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState<{ ref: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<State>({
    customerType: "person",
    service: "import",
    containerQty: 1,
    origin: "",
    destination: "",
    product: "",
    goodsValueUsd: "",
    cbm: "",
    weightKg: "",
    addons: [],
    contactName: "",
    contactPhone: "",
    contactLine: "",
    contactEmail: "",
    contactPref: "form",
    note: "",
  });

  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const { lines, total } = useMemo(() => estimate(s, t), [s, t]);
  const docs = useMemo(() => docsFor(s, t), [s, t]);
  const volW = useMemo(() => (parseFloat(s.cbm) || 0) * 167, [s.cbm]);

  const canSubmit = s.contactName.trim().length > 0 && s.contactPhone.trim().length >= 6;

  function toggleAddon(name: string) {
    set({ addons: s.addons.includes(name) ? s.addons.filter((x) => x !== name) : [...s.addons, name] });
  }

  function goto(n: number) {
    setStep(Math.min(5, Math.max(1, n)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function doSubmit() {
    if (!canSubmit) { setError(t("error.missingContact")); return; }
    setError(null);
    const payload: FreightRfqInput = {
      customerType: s.customerType,
      service: s.service,
      transport: s.transport,
      incoterm: s.incoterm,
      loadType: s.loadType,
      containerSize: s.containerSize,
      origin: s.origin || undefined,
      destination: s.destination || undefined,
      product: s.product || undefined,
      goodsValueUsd: s.goodsValueUsd || undefined,
      cbm: s.cbm || undefined,
      weightKg: s.weightKg || undefined,
      addons: s.addons,
      estTotalThb: total || undefined,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      contactLine: s.contactLine || undefined,
      contactEmail: s.contactEmail || undefined,
      contactPref: s.contactPref,
      note: s.note || undefined,
    };
    startTransition(async () => {
      const res = await submitFreightQuote(payload);
      if (res.ok) setSubmitted({ ref: res.ref });
      else setError(res.error === "rate_limit" ? t("error.rateLimit") : t("error.submitFailed"));
    });
  }

  // ── success screen ──
  if (submitted) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-10">
        <div className="rounded-2xl border border-primary-200 dark:border-border bg-white dark:bg-surface p-7 md:p-9 text-center shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mb-4">
            <PartyPopper className="w-8 h-8 text-primary-600" strokeWidth={2} />
          </div>
          <h2 className="text-[22px] md:text-[26px] font-black text-foreground">{t("success.title")}</h2>
          <p className="mt-2 text-[13.5px] md:text-[15px] text-foreground/75 leading-relaxed">
            {t("success.line1")}<br />{t("success.line2")}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/60 dark:bg-primary-900/15 px-5 py-2.5">
            <span className="text-[12px] text-muted font-semibold">{t("success.refLabel")}</span>
            <span className="text-[18px] font-black tracking-wider text-primary-600">{submitted.ref}</span>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
            <a href={`tel:${phone}`} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-primary-600 text-white font-bold text-[14px] hover:bg-primary-700 transition-colors">
              <Phone className="w-4 h-4" /> {t("success.callNow", { phone: phoneDisplay })}
            </a>
            <a href={lineUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#06C755] text-white font-bold text-[14px] hover:bg-[#05B04C] transition-colors">
              <MessageCircle className="w-4 h-4" /> {t("success.lineChat")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-6 pb-4">
      {/* progress */}
      <div className="flex items-center justify-center mb-6 overflow-x-auto pb-1 scrollbar-x-visible">
        <div className="inline-flex items-center gap-1 rounded-full border border-primary-100 dark:border-border bg-white dark:bg-surface px-2 py-1.5">
          {STEP_KEYS.map((stepKey, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <span key={stepKey} className="flex items-center">
                <button
                  type="button"
                  onClick={() => goto(n)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] md:text-[12px] font-bold whitespace-nowrap transition-colors ${
                    active ? "bg-primary-600 text-white" : done ? "text-primary-600" : "text-muted"
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${
                    active ? "bg-white/25" : done ? "bg-primary-100 text-primary-600 dark:bg-primary-900/40" : "bg-gray-100 dark:bg-white/10"
                  }`}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
                  </span>
                  <span className="hidden sm:inline">{t(`step.${stepKey}`)}</span>
                </button>
                {n < 5 && <span className="w-3 md:w-5 h-px bg-gray-200 dark:bg-border mx-0.5" />}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <>
          <SecCard title={t("sec.customerType")}>
            <div className="grid grid-cols-2 gap-3">
              <ChoiceBtn selected={s.customerType === "person"} onClick={() => set({ customerType: "person" })} icon={User} label={t("customerType.person.label")} sub={t("customerType.person.sub")} />
              <ChoiceBtn selected={s.customerType === "company"} onClick={() => set({ customerType: "company" })} icon={Building2} label={t("customerType.company.label")} sub={t("customerType.company.sub")} />
            </div>
          </SecCard>
          <SecCard title={t("sec.serviceType")}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {SERVICES.map((sv) => (
                <ChoiceBtn key={sv.val} selected={s.service === sv.val} onClick={() => set({ service: sv.val })} icon={sv.icon} label={t(`service.${sv.val}.label`)} sub={t(`service.${sv.val}.sub`)} />
              ))}
            </div>
          </SecCard>
        </>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <SecCard title={t("sec.transport")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TRANSPORTS.map((tr) => (
                <ChoiceBtn key={tr.val} selected={s.transport === tr.val} onClick={() => set({ transport: tr.val })} icon={tr.icon} label={t(`transport.${tr.val}.label`)} sub={t(`transport.${tr.val}.sub`)} />
              ))}
            </div>
          </SecCard>
          <SecCard title={t("sec.incoterm")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INCOTERMS.map((it) => {
                const sel = s.incoterm === it.val;
                return (
                  <button
                    key={it.val}
                    type="button"
                    onClick={() => set({ incoterm: it.val })}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      sel ? "border-primary-600 bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-600" : "border-gray-200 dark:border-border hover:border-primary-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[18px] font-black tracking-wide ${sel ? "text-primary-600" : "text-foreground"}`}>{it.val}</span>
                      {it.tag && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">{t(`incoterm.${it.val}.tag`)}</span>}
                    </div>
                    <div className="text-[11.5px] text-muted font-semibold mt-0.5">{it.name}</div>
                    <div className="text-[11.5px] text-foreground/65 leading-snug mt-1">{t(`incoterm.${it.val}.desc`)}</div>
                  </button>
                );
              })}
            </div>
          </SecCard>
          <SecCard title={t("sec.destination")}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
              {PODS.map((p) => (
                <ChoiceBtn key={p} selected={s.destination === p} onClick={() => set({ destination: p })} icon={p.includes("แหลม") ? Anchor : MapPin} label={t(`pod.${POD_KEYS[p]}`)} />
              ))}
            </div>
            <Field label={t("field.customDestination")}>
              <input className={inputCls} placeholder={t("placeholder.customDestination")} value={PODS.includes(s.destination) ? "" : s.destination} onChange={(e) => set({ destination: e.target.value })} />
            </Field>
          </SecCard>
        </>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <>
          {(s.transport === "sea" || !s.transport) && (
            <SecCard title={t("sec.loadType")}>
              <div className="grid grid-cols-2 gap-3">
                <ChoiceBtn selected={s.loadType === "FCL"} onClick={() => set({ loadType: "FCL" })} icon={Package} label={t("loadType.fcl.label")} sub={t("loadType.fcl.sub")} />
                <ChoiceBtn selected={s.loadType === "LCL"} onClick={() => set({ loadType: "LCL" })} icon={Layers} label={t("loadType.lcl.label")} sub={t("loadType.lcl.sub")} />
              </div>
            </SecCard>
          )}

          {s.transport === "sea" && s.loadType === "FCL" && (
            <SecCard title={t("sec.containerSize")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
                {CONTAINER_SIZES.map((c) => (
                  <ChoiceBtn key={c.val} selected={s.containerSize === c.val} onClick={() => set({ containerSize: c.val })} icon={Package} label={c.label} sub={t(`containerSize.${c.val}.sub`)} />
                ))}
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <Field label={t("field.containerQty")}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => set({ containerQty: Math.max(1, s.containerQty - 1) })} className="w-9 h-9 rounded-lg border border-gray-200 dark:border-border text-foreground text-lg font-bold hover:border-primary-400">−</button>
                    <span className="w-9 text-center text-[16px] font-black">{s.containerQty}</span>
                    <button type="button" onClick={() => set({ containerQty: s.containerQty + 1 })} className="w-9 h-9 rounded-lg border border-gray-200 dark:border-border text-foreground text-lg font-bold hover:border-primary-400">+</button>
                  </div>
                </Field>
              </div>
            </SecCard>
          )}

          {((s.transport === "sea" && s.loadType === "LCL") || s.transport === "truck") && (
            <SecCard title={t("sec.cargoInfoLclTruck")}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label={t("field.cbm")}><input type="number" inputMode="decimal" className={inputCls} placeholder={t("placeholder.cbm")} value={s.cbm} onChange={(e) => set({ cbm: e.target.value })} /></Field>
                <Field label={t("field.totalWeight")}><input type="number" inputMode="decimal" className={inputCls} placeholder={t("placeholder.totalWeight")} value={s.weightKg} onChange={(e) => set({ weightKg: e.target.value })} /></Field>
                <Field label={t("field.productType")}><input className={inputCls} placeholder={t("placeholder.productType")} value={s.product} onChange={(e) => set({ product: e.target.value })} /></Field>
              </div>
            </SecCard>
          )}

          {s.transport === "air" && (
            <SecCard title={t("sec.cargoInfoAir")}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label={t("field.actualWeight")}><input type="number" inputMode="decimal" className={inputCls} placeholder={t("placeholder.actualWeight")} value={s.weightKg} onChange={(e) => set({ weightKg: e.target.value })} /></Field>
                <Field label={t("field.cbmShort")}><input type="number" inputMode="decimal" className={inputCls} placeholder={t("placeholder.cbmAir")} value={s.cbm} onChange={(e) => set({ cbm: e.target.value })} /></Field>
                <Field label={t("field.volumetricWeight")}><input className={`${inputCls} bg-gray-50 dark:bg-white/5`} readOnly value={volW ? volW.toFixed(1) : ""} placeholder={t("placeholder.autoCalc")} /></Field>
              </div>
              <p className="mt-2 text-[11px] text-muted flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary-600/70" />{t("air.chargeableNote")}</p>
            </SecCard>
          )}

          <SecCard title={t("sec.originValue")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label={t("field.originCity")}>
                <select className={inputCls} value={s.origin} onChange={(e) => set({ origin: e.target.value })}>
                  <option value="">{t("option.selectPlaceholder")}</option>
                  {ORIGIN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={t("field.commodity")}><input className={inputCls} placeholder={t("placeholder.commodity")} value={s.product} onChange={(e) => set({ product: e.target.value })} /></Field>
              <Field label={t("field.goodsValueUsd")}><input type="number" inputMode="decimal" className={inputCls} placeholder={t("placeholder.goodsValueUsd")} value={s.goodsValueUsd} onChange={(e) => set({ goodsValueUsd: e.target.value })} /></Field>
            </div>
          </SecCard>
        </>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <>
          <SecCard title={t("sec.addons")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ADDONS.map((a) => {
                const on = s.addons.includes(a.name);
                return (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => toggleAddon(a.name)}
                    className={`flex items-start gap-3 text-left rounded-xl border p-3 transition-all ${
                      on ? "border-primary-600 bg-primary-50 dark:bg-primary-900/25" : "border-gray-200 dark:border-border hover:border-primary-300"
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${on ? "bg-primary-600 text-white" : "bg-primary-50 text-primary-600 dark:bg-primary-900/30"}`}>
                      <a.icon className="w-4.5 h-4.5" strokeWidth={2} />
                    </span>
                    <span className="flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-foreground/90">{t(`addon.${ADDON_KEYS[a.name]}.name`)}</span>
                        {a.price > 0 && <span className="text-[11px] font-bold text-primary-600">+฿{a.price.toLocaleString()}</span>}
                      </span>
                      <span className="block text-[11px] text-muted leading-snug mt-0.5">{t(`addon.${ADDON_KEYS[a.name]}.sub`)}</span>
                    </span>
                    {on && <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </SecCard>

          <SecCard title={t("sec.docs")}>
            <div className="flex flex-wrap gap-2">
              {docs.map((d) => (
                <span key={d.name} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold ${
                  d.req ? "border-primary-200 bg-primary-50/60 text-foreground/85 dark:bg-primary-900/15 dark:border-border" : "border-gray-200 dark:border-border text-muted"
                }`}>
                  <FileCheck2 className={`w-3.5 h-3.5 ${d.req ? "text-primary-600" : "text-muted"}`} />
                  {d.name}
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${d.req ? "bg-primary-600 text-white" : "bg-gray-100 text-muted dark:bg-white/10"}`}>
                    {d.req ? t("doc.required") : t("doc.optional")}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted leading-relaxed">
              {t("doc.attachLaterNote")}
            </p>
            {(s.incoterm === "EXW" || s.incoterm === "FOB") && (
              <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50/60 dark:bg-primary-900/15 dark:border-border p-3 text-[11.5px] text-foreground/80 leading-relaxed">
                {t.rich("doc.incotermWarning", { incoterm: s.incoterm, b: (chunks) => <b>{chunks}</b> })}
              </div>
            )}
          </SecCard>
        </>
      )}

      {/* ── STEP 5 ── */}
      {step === 5 && (
        <>
          <SecCard title={t("sec.quoteEstimate")}>
            {lines.length > 0 ? (
              <div className="rounded-xl border border-primary-200 dark:border-border bg-primary-50/30 dark:bg-primary-900/10 p-4">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-[13px] py-1">
                    <span className="text-foreground/75">{l.k}</span>
                    <span className="font-semibold text-foreground/85">฿{l.v.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-primary-200 dark:border-border mt-2.5 pt-2.5">
                  <span className="font-black text-foreground">{t("quote.approxTotal")}</span>
                  <span className="text-[22px] font-black text-primary-600">฿{total.toLocaleString()}</span>
                </div>
                <p className="mt-2 text-[10.5px] text-muted leading-relaxed">{t("quote.disclaimer")}</p>
              </div>
            ) : (
              <p className="text-[13px] text-muted">{t("quote.empty")}</p>
            )}
          </SecCard>

          <SecCard title={t("sec.contact")}>
            <div className="flex flex-wrap gap-2 mb-4">
              {([
                { val: "form" as const, label: "📋 กรอกฟอร์มรับใบเสนอราคา" },
                { val: "call" as const, label: "📞 ให้เซลส์โทรหาด่วน" },
                { val: "line" as const, label: "💚 แจ้งทาง LINE" },
              ]).map((c) => (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => set({ contactPref: c.val })}
                  className={`rounded-full border px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    s.contactPref === c.val ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-200" : "border-gray-200 dark:border-border text-muted hover:border-primary-300"
                  }`}
                >
                  {t(`contactPref.${c.val}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t("field.contactName")}><input className={inputCls} placeholder={t("placeholder.contactName")} value={s.contactName} onChange={(e) => set({ contactName: e.target.value })} /></Field>
              <Field label={t("field.contactPhone")}><input type="tel" inputMode="tel" className={inputCls} placeholder="081-xxx-xxxx" value={s.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></Field>
              <Field label="LINE ID"><input className={inputCls} placeholder="@lineid" value={s.contactLine} onChange={(e) => set({ contactLine: e.target.value })} /></Field>
              <Field label={t("field.contactEmail")}><input type="email" inputMode="email" className={inputCls} placeholder="example@email.com" value={s.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></Field>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[12px] md:text-[12.5px] font-bold text-foreground/75">{t("field.note")}</span>
                <textarea className={`${inputCls} h-auto py-2.5 min-h-[72px]`} placeholder={t("placeholder.note")} value={s.note} onChange={(e) => set({ note: e.target.value })} />
              </label>
            </div>
          </SecCard>

          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/15 dark:border-red-900/40 px-4 py-3 text-[13px] font-semibold text-red-700 dark:text-red-300">{error}</div>}
        </>
      )}

      {/* nav buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => goto(step - 1)}
          className={`inline-flex items-center gap-1.5 h-12 px-5 rounded-xl border border-gray-200 dark:border-border text-foreground/70 font-bold text-[14px] hover:border-primary-300 transition-colors ${step === 1 ? "invisible" : ""}`}
        >
          <ArrowLeft className="w-4 h-4" /> {t("nav.back")}
        </button>

        {step < 5 ? (
          <button
            type="button"
            onClick={() => goto(step + 1)}
            className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-primary-600 text-white font-black text-[15px] hover:bg-primary-700 transition-colors shadow-[0_8px_22px_rgba(179,0,0,0.28)]"
          >
            {t("nav.next")} <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
          </button>
        ) : (
          <button
            type="button"
            onClick={doSubmit}
            disabled={pending}
            className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-primary-600 text-white font-black text-[15px] hover:bg-primary-700 transition-colors shadow-[0_8px_22px_rgba(179,0,0,0.28)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("nav.submitting")}</> : <>{t("nav.submit")} <ArrowRight className="w-4 h-4" strokeWidth={2.6} /></>}
          </button>
        )}
      </div>
    </div>
  );
}
