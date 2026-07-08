/**
 * นำเข้า Booking — data model + PLACEHOLDER seed.
 *
 * 2026-07-08 (ปอน) — the "สถานะ Booking · นำเข้า" board (/admin/workspace/booking/import)
 * mirrors the legacy "ส่งสอบถามราคา PRICING" Google-Sheet = the Booking / quotation-request
 * log (Sales → Pricing quote → customer confirm → becomes a job in "รายการ").
 *
 * The seed below is SAMPLE data derived from real rows of that sheet (import jobs only),
 * mapped onto the 5 booking statuses. It is NOT persisted — ปอน is finalizing the real
 * data model ("เคาะข้อมูลใหม่"). When the real table/action lands, swap SEED_IMPORT_BOOKINGS
 * for a server query in page.tsx; the board consumes this same Booking[] shape.
 *   See memory: pacred-booking-flow.
 */

/** The 5 Booking statuses (owner mockup 2026-07-08). */
export type BookingStatus =
  | "quote_requested" // ขอใบเสนอราคา — Sales ขอราคา · Pricing ยังไม่เริ่ม
  | "quote_in_progress" // กำลังทำใบเสนอราคา — Pricing กำลังทำ
  | "awaiting_confirm" // รอคอนเฟิร์ม — ส่งราคาให้ลูกค้าแล้ว รอเคาะ
  | "success" // สำเร็จ — ลูกค้าเฟิร์ม → เปิดงาน (มีเลข Shipment)
  | "failed"; // ไม่สำเร็จ — ยกเลิก / ไม่รับงาน / ไม่มีบริการ

export type Booking = {
  id: string;
  orderNo: string; // YYYYMMDD-NNN (เลข booking)
  date: string; // วันที่ (display)
  status: BookingStatus;
  company: string; // PACRED / PCS / AXELRA
  customerName: string;
  product: string;
  sales: string; // ชื่อเซล
  pricing: string; // ชื่อ pricing
  term: string; // IM CIF / IM EXW / EX FOB ...
  transport: string; // SEA / AIR / TRUCK / SEA&TRUCK ...
  fclLcl: string; // FCL / LCL
  size: string; // 40HQ / 20HQ / ตามขนาดสินค้า
  warehouse: string; // คลัง
  pol: string; // ต้นทาง
  pod: string; // ปลายทาง
  price: string; // ราคา / ใบเสนอราคา (free text จาก sheet)
  hsCode: string;
  note: string;
  shipmentNo?: string; // PRxxxxxx — มีเมื่อสถานะ success (เปิดงานแล้ว)
};

export type StatusMeta = {
  label: string;
  next: string; // ขั้นถัดไปที่พนักงานต้องทำ (§0g)
  pill: string; // Tailwind: bg/text ของ pill สถานะ
  dot: string; // สีแถบ accent ด้านซ้ายการ์ด
  ring: string; // ring ของแท็บที่ active
};

export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "quote_requested",
  "quote_in_progress",
  "awaiting_confirm",
  "success",
  "failed",
];

export const BOOKING_STATUS_META: Record<BookingStatus, StatusMeta> = {
  quote_requested: {
    label: "ขอใบเสนอราคา",
    next: "Pricing รับงาน → เริ่มทำใบเสนอราคา",
    pill: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    dot: "bg-slate-400",
    ring: "ring-slate-400",
  },
  quote_in_progress: {
    label: "กำลังทำใบเสนอราคา",
    next: "Pricing ทำราคา → ส่งกลับให้ Sales",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
    ring: "ring-amber-400",
  },
  awaiting_confirm: {
    label: "รอคอนเฟิร์ม",
    next: "Sales ตามลูกค้าให้เคาะราคา",
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
    ring: "ring-sky-400",
  },
  success: {
    label: "สำเร็จ",
    next: "เปิดงาน → ดูต่อในหน้า “รายการ”",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
    ring: "ring-emerald-400",
  },
  failed: {
    label: "ไม่สำเร็จ",
    next: "—",
    pill: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-400",
    ring: "ring-rose-400",
  },
};

/** SAMPLE seed — 15 real-shaped rows from the ส่งสอบถามราคา sheet (import), across all 5 statuses. */
export const SEED_IMPORT_BOOKINGS: Booking[] = [
  // ── ขอใบเสนอราคา ───────────────────────────────────────────
  {
    id: "b-20260427-005", orderNo: "20260427-005", date: "27/04/2026", status: "quote_requested",
    company: "PACRED", customerName: "—", product: "เครื่องฟอกอากาศ", sales: "JEEN", pricing: "WEB",
    term: "IM DDP", transport: "SEA", fclLcl: "FCL", size: "20HQ", warehouse: "เรือ", pol: "", pod: "กรุงเทพ",
    price: "", hsCode: "", note: "ขอที่อยู่ปลายทาง และ PL & INV",
  },
  {
    id: "b-20260429-002", orderNo: "20260429-002", date: "29/04/2026", status: "quote_requested",
    company: "PACRED", customerName: "—", product: "เคลมสินค้าเครื่องจักร", sales: "BAM", pricing: "",
    term: "EX EXW", transport: "AIR", fclLcl: "LCL", size: "ตามขนาดสินค้า", warehouse: "รถ",
    pol: "แกรนด์ เลเบิล วัดเทียนดัด สามพราน", pod: "", price: "", hsCode: "", note: "ขอที่อยู่ปลายทางและต้นทาง",
  },
  {
    id: "b-20260505-003", orderNo: "20260505-003", date: "05/05/2026", status: "quote_requested",
    company: "PACRED", customerName: "TT", product: "สว่านไฟฟ้า แบตเตอรี่ ตลับเมตร", sales: "JEEN", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "20HQ & 40HQ", warehouse: "เรือ",
    pol: "佛山市南海区盐步", pod: "กรุงเทพ", price: "", hsCode: "",
    note: "ขอใบ MSDS / รายงานผลทดสอบขนส่งทางทะเล / เอกสารแบตเตอรี่ UN38.3",
  },
  // ── กำลังทำใบเสนอราคา ──────────────────────────────────────
  {
    id: "b-20260522-004", orderNo: "20260522-004", date: "22/05/2026", status: "quote_in_progress",
    company: "PACRED", customerName: "K. มิ้น", product: "อุปกรณ์ออกกำลังกาย", sales: "Pee", pricing: "WEB",
    term: "IM FOB", transport: "SEA", fclLcl: "FCL", size: "40HQ", warehouse: "ยังไม่ทราบ",
    pol: "เทียนจิน", pod: "ปัตตานี", price: "", hsCode: "", note: "Pricing แก้ไขราคา",
  },
  {
    id: "b-20260507-002", orderNo: "20260507-002", date: "07/05/2026", status: "quote_in_progress",
    company: "PACRED", customerName: "—", product: "อุปกรณ์บ่อปลา 2", sales: "PLOY", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "40HQ", warehouse: "เรือ",
    pol: "山东省临沂市", pod: "ลูกค้ามารับเอง", price: "", hsCode: "", note: "เสนอราคาแล้ว / ปรับราคาใหม่",
  },
  // ── รอคอนเฟิร์ม ────────────────────────────────────────────
  {
    id: "b-20260423-001", orderNo: "20260423-001", date: "23/04/2026", status: "awaiting_confirm",
    company: "PACRED", customerName: "—", product: "การ์ดโปเกม่อน", sales: "JEEN", pricing: "WEB",
    term: "IM CIF", transport: "AIR", fclLcl: "LCL", size: "ตามขนาดสินค้า", warehouse: "ไทย", pol: "", pod: "",
    price: "3,000 × 3 = 9,000\nเข้าพิกัดการ์ดได้เลย 9504.40.00", hsCode: "9504.40.00", note: "",
  },
  {
    id: "b-20260430-001", orderNo: "20260430-001", date: "30/04/2026", status: "awaiting_confirm",
    company: "PACRED", customerName: "Eim", product: "เฟอร์นิเจอร์ 2", sales: "JEEN", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "20HQ", warehouse: "เรือ",
    pol: "Guangzhou United Ocean", pod: "หัวหิน", price: "เสนอราคาแล้ว DDP ขาย 135,000",
    hsCode: "", note: "ขอราคาปิดตู้เหมาภาษี และ ไม่เหมา · รอลูกค้าตัดสินใจ",
  },
  {
    id: "b-20260520-002", orderNo: "20260520-002", date: "20/05/2026", status: "awaiting_confirm",
    company: "PACRED", customerName: "FB-", product: "เครื่องยนต์มือ 2 / ขอแบบ 32", sales: "Pee", pricing: "WEB",
    term: "IM EXW", transport: "SEA&TRUCK", fclLcl: "LCL", size: "ตามขนาดสินค้า", warehouse: "ยังไม่ทราบ",
    pol: "", pod: "", price: "เรือ CARGO CBM 2.178 × 2,900 = 6,316.2\nเรือ CARGO น้ำหนัก 1,300 × 10 = 13,000",
    hsCode: "", note: "ยังไม่รวมค่าขนส่งในจีน/ไทย · ขอที่อยู่ต้นทาง-ปลายทาง",
  },
  {
    id: "b-20260526-001", orderNo: "20260526-001", date: "26/05/2026", status: "awaiting_confirm",
    company: "PACRED", customerName: "—", product: "ทรายแมว", sales: "Pee", pricing: "WEB",
    term: "IM CIF", transport: "SEA", fclLcl: "FCL", size: "20HQ", warehouse: "PAT",
    pol: "Dalian, Liaoning", pod: "ภูเก็ต", price: "8 ตู้ๆละ 1,036,000฿\n10 ตู้ๆละ 1,356,000฿",
    hsCode: "", note: "",
  },
  // ── สำเร็จ (เปิดงานแล้ว → รายการ) ──────────────────────────
  {
    id: "b-20260425-003", orderNo: "20260425-003", date: "25/04/2026", status: "success",
    company: "PACRED", customerName: "บริษัท ซุปเปอร์ซิป จำกัด", product: "ถุงพลาสติก 14", sales: "MEW", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "40HQ", warehouse: "PAT",
    pol: "潮州市潮安区", pod: "PAT BKK", price: "", hsCode: "", note: "ตู้ 14", shipmentNo: "PR26040014",
  },
  {
    id: "b-20260427-004", orderNo: "20260427-004", date: "27/04/2026", status: "success",
    company: "PACRED", customerName: "ไทย-ไชนิส พร็อพเพอร์ตี้ส์ โฮลดิ้งส์", product: "Google Chromecast", sales: "JEEN", pricing: "WEB",
    term: "IM CIF", transport: "AIR", fclLcl: "LCL", size: "ตามขนาดสินค้า", warehouse: "ไทย",
    pol: "", pod: "ภูเก็ต (SUV UPS)", price: "ทำราคาเสียภาษี 5,000 เคลียร์ 20,000 × 3 = 60,000 /ชิปเม้น",
    hsCode: "8543.70.90", note: "3 ชิปเม้น · เปลี่ยนพิกัดจากชิปเม้นเดิม", shipmentNo: "PR26040022",
  },
  {
    id: "b-20260427-001", orderNo: "20260427-001", date: "27/04/2026", status: "success",
    company: "PACRED", customerName: "บริษัท ติ๊ อควาเรี่ยม จำกัด", product: "อุปกรณ์บ่อปลา", sales: "BAM", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "40HQ", warehouse: "เรือ",
    pol: "山东省临沂市", pod: "PAT BKK T1", price: "", hsCode: "", note: "", shipmentNo: "PR26040009",
  },
  {
    id: "b-20260430-002", orderNo: "20260430-002", date: "30/04/2026", status: "success",
    company: "PACRED", customerName: "อิน789", product: "เครื่องมือช่าง 3", sales: "BAM", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "20HQ", warehouse: "PAT",
    pol: "河南省许昌市", pod: "ลำลูกกา ปทุมธานี", price: "", hsCode: "", note: "สั่งมาเหมือนเดิมเลย", shipmentNo: "PR26050050",
  },
  // ── ไม่สำเร็จ ──────────────────────────────────────────────
  {
    id: "b-20260505-001", orderNo: "20260505-001", date: "05/05/2026", status: "failed",
    company: "PACRED", customerName: "MITS LOGISTICS", product: "Flame Retardants (วัตถุดิบกันไฟ)", sales: "Win", pricing: "WEB",
    term: "IM EXW", transport: "SEA&TRUCK&AIR", fclLcl: "LCL", size: "ตามขนาดสินค้า", warehouse: "ยังไม่ทราบ",
    pol: "Hangzhou JLS", pod: "สมุทรปราการ", price: "", hsCode: "", note: "ไม่มีเฟรทรับ · ยังไม่มีบริการ",
  },
  {
    id: "b-20260526-004", orderNo: "20260526-004", date: "26/05/2026", status: "failed",
    company: "PACRED", customerName: "ภัสสร ธารพานิช", product: "อาหารสัตว์", sales: "Win", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "20HQ", warehouse: "เรือ",
    pol: "山东省泰安市", pod: "สุพรรณบุรี", price: "", hsCode: "", note: "ไม่รับงาน",
  },
  {
    // ลูกค้าไม่คอนเฟิร์มราคา — เคสที่ "ทำราคาใหม่" ได้ (เด้งกลับ กำลังทำใบเสนอราคา)
    id: "b-20260512-001", orderNo: "20260512-001", date: "12/05/2026", status: "failed",
    company: "PCS", customerName: "—", product: "รถ ATV", sales: "MEW", pricing: "WEB",
    term: "IM EXW", transport: "SEA", fclLcl: "FCL", size: "20HQ", warehouse: "เรือ",
    pol: "广州市白云区江高镇", pod: "นครสวรรค์", price: "เสนอ 20HQ ปิดตู้เหมา 185,000",
    hsCode: "", note: "ลูกค้าว่าราคาสูงไป · ยังไม่คอนเฟิร์ม (พิจารณาทำราคาใหม่)",
  },
];
