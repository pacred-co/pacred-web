/**
 * Cargo LCL (จีน → ไทย) promotion packages — the source-of-truth promo data
 * the per-customer "ใบเสนอราคา" generator builds from (owner ปอน 2026-06-20).
 *
 * This is a faithful transcription of the owner's published LCL promo. The
 * quote generator (app/.../customers/[id]/quote-tab.tsx) lets a CS/Sales pick
 * a package, optionally tweak the per-CBM/KG numbers ("ตัวปรับราคา"), and
 * render a screenshot/copy/print-ready quotation with the conditions + notes
 * + service steps so they stop typing it out by hand in chat.
 *
 * ⚠️ Numbers are the owner's published rates. If a rate changes, edit it HERE
 * (single source) — the generator + card + copy/print all read from this file.
 *
 * 🟢 อี้อู-รถ surcharge (owner ปอน 2026-06-21): = +600 บาท/CBM, FOLDED into the
 * displayed รถ-อี้อู rate (e.g. 4,900 → 5,500) via rateFor() — NOT a separate
 * condition or line. The single constant YIWU_TRUCK_SURCHARGE_CBM = 600.
 */

export type QuoteMode = "truck" | "ship";

export interface PackageRate {
  /** ฿ per CBM (คิว). */
  cbm: number;
  /** ฿ per KG. */
  kg: number;
  /** Transit-time label, e.g. "5–7 วัน". */
  days: string;
}

export interface CargoPromoPackage {
  id: string;
  /** Display number (แพ็คเกจที่ N). */
  no: number;
  /** Section group header. */
  group: string;
  /** Package title. */
  name: string;
  /** truck (ทางรถ) + ship (ทางเรือ) base rates. */
  rates: Record<QuoteMode, PackageRate>;
  /** Optional ลิขสิทธิ์ (licensed-goods) rate variant — Package 3 only. */
  licensedRates?: Record<QuoteMode, PackageRate>;
  /** Product-coverage note, e.g. "สินค้าทั่วไป อย. มอก.". */
  productNote?: string;
  /** Package-specific conditions (เงื่อนไข). */
  conditions: string[];
}

export const QUOTE_HEADER = "LCL นำเข้าสินค้าจากจีน (โกดังอี้อู / กว่างโจว)";

export const CARGO_PROMO_PACKAGES: CargoPromoPackage[] = [
  {
    id: "tax-bundle",
    no: 1,
    group: "เหมาภาษี (จบง่าย / ไม่มีเอกสาร / ออกบิลได้)",
    name: "เปิดใบกำกับ / ใบขน",
    rates: {
      truck: { cbm: 4900, kg: 17, days: "5–7 วัน" },
      ship: { cbm: 2900, kg: 10, days: "15–20 วัน" },
    },
    conditions: [
      "ต้องฝากชำระและโอนเงินกับทางบริษัทเท่านั้น ในกรณีเปิดใบกำกับภาษี (สินค้าทั่วไป / มอก.)",
    ],
  },
  {
    id: "transfer",
    no: 2,
    group: "นำเข้า + ฝากโอน",
    name: "นำเข้า + ฝากโอน",
    rates: {
      truck: { cbm: 5300, kg: 18, days: "5–7 วัน" },
      ship: { cbm: 3300, kg: 11, days: "15–20 วัน" },
    },
    conditions: [
      "ลูกค้าโอนชำระเอง — ใช้แพ็คเกจนี้เท่านั้น",
      "เรทหยวนถูกมาก",
    ],
  },
  {
    id: "shop",
    no: 3,
    group: "นำเข้า + ฝากสั่ง",
    name: "นำเข้า + ฝากสั่ง",
    productNote: "สินค้าทั่วไป อย. / มอก.",
    rates: {
      truck: { cbm: 5500, kg: 20, days: "5–7 วัน" },
      ship: { cbm: 3500, kg: 15, days: "15–20 วัน" },
    },
    licensedRates: {
      truck: { cbm: 7500, kg: 40, days: "5–7 วัน" },
      ship: { cbm: 6500, kg: 30, days: "15–20 วัน" },
    },
    conditions: [],
  },
];

/** หมายเหตุ ที่ใช้ร่วมทุกแพ็คเกจ. */
export const QUOTE_NOTES: string[] = [
  // "อี้อู (ทางรถ) +เพิ่ม 2–3 วัน" — removed: the extra transit days are now folded
  // straight into the อี้อู·ทางรถ "ระยะเวลา" column (owner 2026-07-10 · ไม่เขียนแยก).
  "1 CBM ไม่เกิน 250 กก. (เกินคิดเป็นกิโล)",
  "ส่งปลายทาง กทม. / ปริมณฑล เริ่มต้น 100 บาท (ไม่มีขั้นต่ำ)",
  "ขั้นต่ำ 50 บาท / shipment",
  "ออกใบกำกับภาษี / ใบขนเสียภาษี ในชื่อลูกค้าได้",
];

export interface ServiceStep {
  text: string;
  link?: string;
}

/** วิธีการใช้บริการ. */
export const QUOTE_HOW_TO: ServiceStep[] = [
  { text: "สมัครสมาชิก แล้วนำรหัสส่งให้ Sale", link: "https://pacred.co/register" },
  { text: "Shipping Mark — เอารหัสติดข้างกล่อง" },
  { text: "ส่งที่อยู่โกดังให้โรงงาน เพื่อจัดส่งสินค้าเข้าคลัง", link: "https://pacred.co/warehouses/guangzhou" },
  { text: "ติดตามสถานะได้บนระบบ หรือ CS ช่วยอัพเดทตลอดชิปเม้น" },
];

export interface CustomsCostLine {
  label: string;
  amount: number;
  note?: string;
  /** true = บวก VAT 7% เมื่อออกใบกำกับ (Pacred service fee) · false = ค่าผ่านรัฐ. */
  vat: boolean;
}

/** บริการเสริม — งานใบขนสินค้า (ทางรถ). */
export const CUSTOMS_ADDON = {
  title: "บริการเสริม — งานใบขนสินค้า (ทางรถ)",
  intro: [
    "สามารถออกใบขนได้ ทั้งมีสินค้า / ไม่มีสินค้า",
    "ไม่ว่าสินค้ามาทางไหน ก็นำมาออกใบขนทางรถได้",
  ],
  costs: [
    { label: "ลงทะเบียนกรมศุลกากร", amount: 1500, note: "ครั้งแรก ครั้งเดียว", vat: true },
    { label: "พิธีการศุลกากร (ใบขน)", amount: 2500, note: "/ shipment", vat: true },
    { label: "FORM E", amount: 1500, note: "/ shipment", vat: true },
    { label: "ค่าส่งตั๋ว", amount: 350, note: "/ shipment", vat: true },
    { label: "ค่าธรรมเนียมกรมศุล", amount: 200, note: "/ shipment", vat: false },
    { label: "พิธีการ อย. / มอก. / เกษตร / ประมง / อื่นๆ", amount: 2500, note: "/ shipment (ถ้ามี)", vat: true },
  ] as CustomsCostLine[],
  taxNote: "ภาษี: คิดตามมูลค่าสินค้าจริง (ตามที่ลูกค้าต้องการสำแดง)",
  summary: "รวมประมาณ 4,500 – 6,000 บาท / shipment (ไม่รวมภาษี)",
  conditions: [
    "ลูกค้าเลือกได้: โอนค่าสินค้าผ่านบริษัท หรือ โอนเองก็เปิดใบขนได้ (ใบขนเป็นชื่อลูกค้า)",
    "แนะนำ: ฝากโอนค่าสินค้าผ่านบริษัท เพื่อให้มีเอกสารครบชุด (ใบเสร็จชำระเงิน + ใบขนสินค้า) → เอกสารถูกต้อง ใช้ในระบบบัญชีได้ครบ 👍",
  ],
  requiredDocs: [
    "หนังสือรับรองบริษัท (ไม่เกิน 3 เดือน)",
    "บัตรประชาชนกรรมการผู้จัดการ",
    "INVOICE + PACKING LIST",
    "รูปภาพสินค้า (ถ้ามี) + ชนิดสินค้าคร่าวๆ",
  ],
} as const;

export const MODE_LABEL: Record<QuoteMode, string> = {
  truck: "ทางรถ 🚛",
  ship: "ทางเรือ 🚢",
};

// ── Calculator defaults (owner ปอน 2026-06-21) ────────────────────────────
/** ค่าเทียบ — kg ต่อ 1 คิว เส้นแบ่ง บิล KG vs CBM (1 CBM ไม่เกินกี่ กก.).
 *  Default 250 (owner 2026-07-06 "ทุกคน 250 · แก้ได้ max 350") — ตรงกับ
 *  COMPARISON_DEFAULT ใน lib/forwarder/resolve-rate.ts (auto-calc ก็ใช้ 250).
 *  ใช้ในเครื่องมือใบเสนอราคา + rate-editor เมื่อลูกค้ายังไม่มี userComparisonValue
 *  เฉพาะตัว (=0 → แสดง/ใช้ 250 · บิลจริงยังอ่าน tb_users.userComparisonValue ต่อคน).
 *  เพดานยังคง 350 (COMPARISON_CAP / COMPARISON_MAX). */
export const DEFAULT_COMPARISON = 250;
/** ค่าขั้นต่ำต่อ shipment (บาท) — quote/ใบประเมิน เท่านั้น (owner 2026-07-10: 25 → 50). */
export const MIN_CHARGE = 50;
/** อี้อู เฉพาะทางรถ — บาท/คิว ที่พับเข้าราคารถ-อี้อู (owner ปอน: +600 · 4,900→5,500). */
export const YIWU_TRUCK_SURCHARGE_CBM = 600;
/** ปลายทาง กทม./ปริมณฑล เริ่มต้น (บาท · ไม่มีขั้นต่ำ). */
export const BKK_DELIVERY_START = 100;

export const WAREHOUSE_LABEL = { guangzhou: "กว่างโจว", yiwu: "อี้อู" } as const;
export type WarehouseKey = keyof typeof WAREHOUSE_LABEL;
export const WAREHOUSE_KEYS = ["guangzhou", "yiwu"] as const;
export const MODE_KEYS = ["truck", "ship"] as const;

/**
 * Effective rate for a package × warehouse × mode. Folds the +600 อี้อู-รถ
 * surcharge straight INTO the CBM rate (owner: ไม่ใช่เงื่อนไข ใส่ในราคาเลย),
 * so อี้อู·ทางรถ shows e.g. 5,500 not "4,900 + surcharge". KG + เรือ unchanged.
 */
export function rateFor(
  pkg: CargoPromoPackage,
  licensed: boolean,
  warehouse: WarehouseKey,
  mode: QuoteMode,
): PackageRate {
  const base = (licensed && pkg.licensedRates ? pkg.licensedRates : pkg.rates)[mode];
  const cbm = warehouse === "yiwu" && mode === "truck" ? base.cbm + YIWU_TRUCK_SURCHARGE_CBM : base.cbm;
  return { cbm, kg: base.kg, days: base.days };
}
