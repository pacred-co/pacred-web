/**
 * BK-1 — per-service booking-flow configuration.
 *
 * The booking detail page (`/book/[service]/[route]`) reads this manifest
 * to decide:
 *
 *   1. Which of the 5 option selectors to render (§4.3 — labor / tractor /
 *      pin / doc-attach / doc-handling).  A `customs-clearance` booking
 *      shows all five; a `yuan-transfer` (a money service) shows only
 *      `doc_mode`; a `china-shopping` shows attach + doc-mode.
 *   2. Which upgrade-plan add-ons appear in the side rail (§4.5).
 *   3. Which related-article tags link into `/knowledge` (§4.5).
 *   4. The headline label + a short hero sub-line per service.
 *   5. The default transport mode (so `BookingCalculator` re-hydrates).
 *
 * Design: docs/research/booking-flow-system-2026-05-18.md §4.3 + §4.5.
 *
 * This file is **static config** — it does not own pricing (those are in
 * `booking_rates` per §6.6) or layout (those are in the page components).
 * Keep this file declarative; add a service by appending a row.
 */

import type {
  BookingSelectorKey,
  BookingServiceSlug,
  TabMode,
} from "@/types/booking";

export interface ServiceConfig {
  slug: BookingServiceSlug;
  /** TH label for the page title + hero. */
  titleTh: string;
  /** EN label. */
  titleEn: string;
  /** Short hero sub-line — what this service does (one line). */
  subTh: string;
  subEn: string;
  /** Which of the 5 selectors render for this service. */
  selectors: BookingSelectorKey[];
  /** rate_key set the upgrade-plan side-rail card offers (subset of
   *  booking_rates.scope='upgrade').  Empty = no upgrade card. */
  upgrades: string[];
  /** /knowledge tag slugs the related-article rail links to. */
  relatedTags: string[];
  /** Default transport mode (so the BookingCalculator value re-hydrates
   *  if a customer arrives without query-string carry).  Null = the
   *  service has no transport mode (money services + sourcing). */
  defaultTransportMode: TabMode | null;
  /** The "what's included / not included" body — short bullet list,
   *  rendered in the main column.  i18n is light here (TH/EN both shown
   *  side-by-side in code; the booking page picks based on locale). */
  includesTh: string[];
  includesEn: string[];
  /** The 3-step "how it works" explainer (§4.2 #6) — sets the rep-
   *  confirmed-price expectation. */
  howItWorksTh: [string, string, string];
  howItWorksEn: [string, string, string];
}

export const SERVICE_CONFIGS: Record<BookingServiceSlug, ServiceConfig> = {
  // ── customs-clearance — the showcase service: all 5 selectors apply ──
  "customs-clearance": {
    slug: "customs-clearance",
    titleTh: "เคลียร์ศุลกากร",
    titleEn: "Customs clearance",
    subTh: "เคลียร์สินค้าติดด่าน / ออกใบขนสินค้า / ติดต่อด่านศุลกากร",
    subEn:
      "Clear stuck goods · issue customs declarations · liaise with customs",
    selectors: ["labor", "tractor", "pin", "doc_attach", "doc_mode"],
    upgrades: ["insurance", "door_to_door", "priority"],
    relatedTags: ["customs-clearance", "customs-declaration", "import-tax"],
    defaultTransportMode: "customs",
    includesTh: [
      "ติดต่อด่านศุลกากรแทนลูกค้า",
      "ตรวจสอบเอกสารและ HS code",
      "ออกใบขนสินค้า (ถ้าเลือก)",
      "ประสานงานขนส่งจากด่านไปคลัง",
    ],
    includesEn: [
      "Liaise with customs on the customer's behalf",
      "Verify documents + HS code",
      "Issue customs declaration (if selected)",
      "Coordinate dock-to-warehouse transport",
    ],
    howItWorksTh: [
      "จองออนไลน์ — เลือกบริการ + ใส่ข้อมูลคร่าวๆ",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริงและรายละเอียดงาน",
      "เริ่มงาน — Pacred ดำเนินการให้ทั้งหมด",
    ],
    howItWorksEn: [
      "Book online — pick the service + share rough details",
      "Sales rep follows up to confirm the real price + job specifics",
      "Job begins — Pacred handles everything",
    ],
  },

  // ── import-china (LCL / FCL / Truck / Air) — full cargo path ─────────
  "import-china-lcl": {
    slug: "import-china-lcl",
    titleTh: "ฝากนำเข้าสินค้าจากจีน · LCL",
    titleEn: "Import from China · LCL",
    subTh: "ส่งทางเรือ LCL · เหมาะสำหรับสินค้าน้อยกว่า 1 ตู้",
    subEn: "Sea LCL — for shipments smaller than one container",
    selectors: ["labor", "tractor", "pin", "doc_attach", "doc_mode"],
    upgrades: ["insurance", "fumigation", "door_to_door"],
    relatedTags: ["import-china", "sea-shipping", "lcl"],
    defaultTransportMode: "sea",
    includesTh: [
      "ขนส่งจีน → ไทย ทางเรือ LCL",
      "เคลียร์ศุลกากรขาเข้า",
      "เก็บเข้าโกดังที่ไทยพร้อมแจ้งลูกค้า",
    ],
    includesEn: [
      "China → Thailand sea LCL",
      "Inbound customs clearance",
      "Warehouse intake with customer notification",
    ],
    howItWorksTh: [
      "จองออนไลน์ — เลือก LCL + ใส่น้ำหนัก/CBM คร่าวๆ",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริงและสรุปนัดวันรับสินค้า",
      "Pacred นำเข้าให้ตั้งแต่ต้นทางจีนถึงโกดังไทย",
    ],
    howItWorksEn: [
      "Book online — pick LCL + share rough weight/CBM",
      "Sales rep follows up to confirm price + pickup date",
      "Pacred ships from China origin to Thailand warehouse",
    ],
  },
  "import-china-fcl": {
    slug: "import-china-fcl",
    titleTh: "ฝากนำเข้าสินค้าจากจีน · FCL",
    titleEn: "Import from China · FCL",
    subTh: "ตู้คอนเทนเนอร์ 20ft / 40ft · เหมาทั้งตู้",
    subEn: "Full container — 20ft / 40ft",
    selectors: ["labor", "tractor", "pin", "doc_attach", "doc_mode"],
    upgrades: ["insurance", "fumigation", "door_to_door", "priority"],
    relatedTags: ["import-china", "sea-shipping", "fcl"],
    defaultTransportMode: "sea",
    includesTh: [
      "เหมาทั้งตู้ 20ft หรือ 40ft จีน → ไทย",
      "เคลียร์ศุลกากร + ลากตู้เข้าโกดังลูกค้า",
      "ทีมงานปลายทางพร้อมรับและกระจาย",
    ],
    includesEn: [
      "Full 20ft / 40ft container, China → Thailand",
      "Customs clearance + container haul to customer warehouse",
      "Destination team ready for receive + distribute",
    ],
    howItWorksTh: [
      "จองออนไลน์ — เลือก FCL + ขนาดตู้",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริง + นัดเก็บตู้",
      "Pacred จัดตู้ทั้งกระบวนการให้",
    ],
    howItWorksEn: [
      "Book online — pick FCL + container size",
      "Sales rep follows up to confirm price + container pickup",
      "Pacred handles the whole container journey",
    ],
  },
  "import-china-truck": {
    slug: "import-china-truck",
    titleTh: "ฝากนำเข้าสินค้าจากจีน · รถ",
    titleEn: "Import from China · Truck",
    subTh: "ส่งทางรถ จีน-ไทย · เร็วกว่าเรือ ถูกกว่าเครื่อง",
    subEn: "Truck overland China-Thailand — faster than sea, cheaper than air",
    selectors: ["labor", "tractor", "pin", "doc_attach", "doc_mode"],
    upgrades: ["insurance", "door_to_door", "priority"],
    relatedTags: ["import-china", "truck-shipping"],
    defaultTransportMode: "truck",
    includesTh: [
      "ขนส่งทางรถจีน → ไทย",
      "เคลียร์ศุลกากร + นำเข้าโกดัง",
    ],
    includesEn: [
      "Truck overland China → Thailand",
      "Customs clearance + warehouse intake",
    ],
    howItWorksTh: [
      "จองออนไลน์ — เลือกรถ + ใส่ปริมาณคร่าวๆ",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริง",
      "Pacred ขับให้ถึงปลายทางไทย",
    ],
    howItWorksEn: [
      "Book online — pick truck + share rough quantities",
      "Sales rep follows up to confirm price",
      "Pacred drives it through to Thailand",
    ],
  },
  "import-china-air": {
    slug: "import-china-air",
    titleTh: "ฝากนำเข้าสินค้าจากจีน · แอร์",
    titleEn: "Import from China · Air",
    subTh: "ส่งทางเครื่อง · เร็วที่สุด เหมาะกับของด่วน",
    subEn: "Air freight — the fastest option for urgent goods",
    selectors: ["labor", "tractor", "doc_attach", "doc_mode"],
    upgrades: ["insurance", "door_to_door", "priority"],
    relatedTags: ["import-china", "air-shipping"],
    defaultTransportMode: "air",
    includesTh: [
      "ขนส่งทางเครื่อง จีน → ไทย",
      "เคลียร์ศุลกากร + ส่งถึงโกดังหรือถึงบ้าน (อัปเกรด)",
    ],
    includesEn: [
      "Air freight China → Thailand",
      "Customs clearance + warehouse / door delivery (upgrade)",
    ],
    howItWorksTh: [
      "จองออนไลน์ — เลือกแอร์ + ใส่น้ำหนัก/ขนาด",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริง",
      "Pacred จัดให้ถึงไทยอย่างเร็วที่สุด",
    ],
    howItWorksEn: [
      "Book online — pick air + share weight/dimensions",
      "Sales rep follows up to confirm price",
      "Pacred speeds it through to Thailand",
    ],
  },

  // ── china-shopping (sourcing / ฝากสั่งซื้อ) — no labor / tractor / pin ──
  "china-shopping": {
    slug: "china-shopping",
    titleTh: "ฝากสั่งซื้อสินค้าจากจีน",
    titleEn: "China shopping (sourcing)",
    subTh: "Pacred สั่งซื้อแทน + จัดส่งให้ครบกระบวนการ",
    subEn: "Pacred orders on your behalf + handles the whole delivery",
    selectors: ["doc_attach", "doc_mode"],
    upgrades: ["insurance"],
    relatedTags: ["china-shopping", "sourcing", "alibaba"],
    defaultTransportMode: "sourcing",
    includesTh: [
      "สั่งซื้อสินค้าจากร้านจีน (Taobao / 1688 / Alibaba)",
      "ตรวจรับที่โกดังจีน + ส่งกลับไทย",
      "ออกใบกำกับภาษีให้ (ถ้าเลือก)",
    ],
    includesEn: [
      "Order from Chinese shops (Taobao / 1688 / Alibaba)",
      "Inspect at China warehouse + ship to Thailand",
      "Issue tax invoice (if selected)",
    ],
    howItWorksTh: [
      "จองออนไลน์ — แชร์ลิงก์สินค้า + จำนวน",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริง + วางมัดจำ",
      "Pacred สั่งซื้อ + จัดส่งให้ครบ",
    ],
    howItWorksEn: [
      "Book online — share product link + quantity",
      "Sales rep follows up to confirm price + deposit",
      "Pacred orders + delivers end-to-end",
    ],
  },

  // ── yuan-transfer (money service) — doc-mode ONLY ──
  "yuan-transfer": {
    slug: "yuan-transfer",
    titleTh: "ฝากโอนชำระสินค้าจีน (โอนหยวน)",
    titleEn: "Yuan transfer (pay-on-behalf)",
    subTh: "โอนเงินหยวนให้ร้านจีนแทนลูกค้า · เรทดี · มีใบเสร็จ",
    subEn:
      "Pay Chinese sellers in yuan on the customer's behalf — good rate, with receipt",
    selectors: ["doc_mode"],
    upgrades: [],
    relatedTags: ["yuan-transfer", "alipay", "china-payment"],
    defaultTransportMode: "remit",
    includesTh: [
      "โอนเงินไปบัญชีจีน (Alipay / โอนตรงร้าน)",
      "ออกใบเสร็จ / ใบกำกับภาษีให้ (ถ้าเลือก)",
    ],
    includesEn: [
      "Transfer to a China account (Alipay / direct to merchant)",
      "Issue receipt / tax invoice (if selected)",
    ],
    howItWorksTh: [
      "จองออนไลน์ — ใส่จำนวนหยวน + ปลายทาง",
      "ทีมขายติดต่อกลับเพื่อยืนยันเรท + บัญชีปลายทาง",
      "โอนทันทีหลังลูกค้าโอนบาทเข้า",
    ],
    howItWorksEn: [
      "Book online — enter yuan amount + destination",
      "Sales rep confirms rate + destination account",
      "Transferred the moment customer's THB arrives",
    ],
  },

  // ── export — full selector set ──
  export: {
    slug: "export",
    titleTh: "ส่งออกสินค้า (Export)",
    titleEn: "Export shipping",
    subTh: "ส่งออกจากไทยไปต่างประเทศ · ทุก term · ทุกโหมด",
    subEn: "Export from Thailand worldwide — every term, every mode",
    selectors: ["labor", "tractor", "pin", "doc_attach", "doc_mode"],
    upgrades: ["insurance", "fumigation", "priority"],
    relatedTags: ["export", "customs-declaration", "international-shipping"],
    defaultTransportMode: null,
    includesTh: [
      "เคลียร์ศุลกากรขาออก",
      "ออกใบขนสินค้าขาออก",
      "ขนส่งทางเรือ / เครื่อง / รถ ตามที่เลือก",
    ],
    includesEn: [
      "Outbound customs clearance",
      "Export declaration document",
      "Sea / air / truck shipping per selection",
    ],
    howItWorksTh: [
      "จองออนไลน์ — เลือกปลายทาง + โหมดขนส่ง",
      "ทีมขายติดต่อกลับเพื่อยืนยันราคาจริง + เอกสาร",
      "Pacred ดำเนินการส่งออกให้ครบ",
    ],
    howItWorksEn: [
      "Book online — pick destination + mode",
      "Sales rep confirms price + paperwork",
      "Pacred runs the full export",
    ],
  },
};

/** Type-safe accessor — returns null for an unknown slug. */
export function getServiceConfig(
  slug: string | undefined | null,
): ServiceConfig | null {
  if (!slug) return null;
  return (
    (SERVICE_CONFIGS as Record<string, ServiceConfig | undefined>)[slug] ?? null
  );
}

/** All bookable slugs (for the /book hub grid + validation). */
export function listBookableServices(): ServiceConfig[] {
  return Object.values(SERVICE_CONFIGS);
}

/**
 * Map a `BookingCalculator` TabMode + sea-sub-mode to a booking service
 * slug.  Used by `ResultBox` → "เปิดบุ๊กกิ้ง" CTA to build the booking URL.
 * Returns null when the mode does not map cleanly.
 */
export function mapCalculatorModeToServiceSlug(
  mode: TabMode,
  seaMode?: "lcl" | "fcl" | null,
): BookingServiceSlug | null {
  switch (mode) {
    case "sea":
      return seaMode === "fcl" ? "import-china-fcl" : "import-china-lcl";
    case "truck":
      return "import-china-truck";
    case "air":
      return "import-china-air";
    case "customs":
      return "customs-clearance";
    case "sourcing":
      return "china-shopping";
    case "remit":
      return "yuan-transfer";
    default:
      return null;
  }
}
