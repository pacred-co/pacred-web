/**
 * Static prototype data for the Booking settings hub (ตั้งค่าระบบ).
 *
 * Plain module (NOT "use server") — transcribed from the design mockup
 * (pacred-settings-mockup-v4-vehicle-types.html). These master lists (สายเรือ ·
 * ประเทศ · เอเจนต์ · ท่า · เอกสาร · รถ · ตู้ · บริการ) are PROTOTYPE reference data
 * driving the hub's read-only tables until the real Supabase-backed catalog lands.
 * The Term & Pricing tab is the ONE real surface — it renders <BookingCatalogSettings/>.
 */

export type StatusFlag = "active" | "inactive";

export type StatTone = "blue" | "green" | "orange" | "purple" | "teal";

export type StatCardData = {
  key: string;
  tone: StatTone;
  title: string;
  value: number;
  unit: string;
  active: number;
};

/** สรุปยอด (stats row) — ตัวเลขตัวอย่างตาม mockup. */
export const STATS: StatCardData[] = [
  { key: "shipping", tone: "blue", title: "สายเรือทั้งหมด", value: 28, unit: "รายการ", active: 26 },
  { key: "countries", tone: "green", title: "ประเทศทั้งหมด", value: 42, unit: "ประเทศ", active: 40 },
  { key: "agents", tone: "orange", title: "เอเจนต์ทั้งหมด", value: 156, unit: "รายการ", active: 142 },
  { key: "ports", tone: "purple", title: "ท่าเรือ/สนามบิน", value: 87, unit: "รายการ", active: 81 },
  { key: "documents", tone: "teal", title: "เอกสารทั้งหมด", value: 23, unit: "รายการ", active: 21 },
];

// ═══════════════ MASTER DATA (แหล่งจริง Pacred) — form ใบเสนอราคาดึงไปใช้ผ่าน quotation-data ═══════════════
// owner ปอน 2026-07-14: "ตั้งค่าเรท" = source of truth ของตัวเลือกในฟอร์ม (ท่า/สายเรือ/เอเจนต์/คลัง).
export const BOOKING_COUNTRIES = ["จีน", "ไทย"];

export const BOOKING_PORTS: Record<string, Record<string, string[]>> = {
  จีน: {
    SEA: ["กวางโจว", "อี้อู", "หนิงโบ", "หนานซา", "เซินเจิ้น", "เซี่ยงไฮ้", "ชิงเต่า"],
    TRUCK: ["กวางโจว", "คุนหมิง", "หนานหนิง"],
    AIR: ["กวางโจว (CAN)", "เซินเจิ้น (SZX)", "เซี่ยงไฮ้ (PVG)", "ปักกิ่ง (PEK)"],
  },
  ไทย: {
    SEA: ["แหลมฉบัง", "กรุงเทพ (คลองเตย)"],
    TRUCK: ["กรุงเทพฯ", "เชียงของ", "นครพนม", "มุกดาหาร"],
    AIR: ["สุวรรณภูมิ (BKK)", "ดอนเมือง (DMK)"],
  },
};

export const BOOKING_WAREHOUSES: Record<string, string[]> = {
  จีน: ["กวางโจว", "อี้อู"],
  ไทย: ["โกดังเพชรเกษม 118"],
};

export const BOOKING_CARRIERS: Record<string, string[]> = {
  SEA: ["Maersk", "MSC", "ONE", "Evergreen", "Wan Hai", "COSCO", "Yang Ming", "OOCL", "Hapag-Lloyd", "SITC", "อื่นๆ"],
  AIR: ["Thai Airways (TG)", "Cathay Pacific (CX)", "China Airlines (CI)", "EVA Air (BR)", "Emirates (EK)", "Singapore (SQ)", "อื่นๆ"],
  TRUCK: ["รถบริษัท (Pacred)", "รถร่วม", "Kerry", "อื่นๆ"],
};

export const BOOKING_AGENTS = ["Pacred", "TTP", "AXELRA", "HUAHAI", "FEISHENG", "อื่นๆ"];

const PORT_TYPE_BY_MODE: Record<string, string> = { SEA: "ท่าเรือ", AIR: "สนามบิน", TRUCK: "ด่านรถ" };
const MODE_LABEL: Record<string, string> = { SEA: "Sea", AIR: "Air", TRUCK: "Truck" };

// ── สายเรือ (shipping lines) ─────────────────────────────────────────────
export type ShippingLine = {
  name: string;
  code: string;
  country: string;
  flag: string;
  status: StatusFlag;
  website: string;
  phone: string;
  email: string;
  routes: string[];
  created: string;
  updated: string;
};

export const SHIPPING_LINES: ShippingLine[] = [
  { name: "Maersk Line", code: "MAEU", country: "เดนมาร์ก", flag: "🇩🇰", status: "active", website: "https://www.maersk.com", phone: "+45 3363 3363", email: "info@maersk.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ", "อเมริกาใต้", "ตะวันออกกลาง", "แอฟริกา", "ออสเตรเลีย"], created: "01/01/2024 10:00", updated: "15/06/2024 14:30" },
  { name: "Mediterranean Shipping Co.", code: "MSCU", country: "สวิตเซอร์แลนด์", flag: "🇨🇭", status: "active", website: "https://www.msc.com", phone: "+41 22 703 8888", email: "info@msc.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ", "แอฟริกา"], created: "03/01/2024 11:20", updated: "10/06/2024 09:15" },
  { name: "COSCO Shipping", code: "COSU", country: "จีน", flag: "🇨🇳", status: "active", website: "https://lines.coscoshipping.com", phone: "+86 21 3512 4888", email: "service@coscon.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ"], created: "04/01/2024 09:40", updated: "09/06/2024 13:10" },
  { name: "CMA CGM", code: "CMACGM", country: "ฝรั่งเศส", flag: "🇫🇷", status: "active", website: "https://www.cma-cgm.com", phone: "+33 4 88 91 90 00", email: "support@cma-cgm.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ", "แอฟริกา"], created: "05/01/2024 13:10", updated: "08/06/2024 16:20" },
  { name: "Evergreen Line", code: "EGLV", country: "ไต้หวัน", flag: "🇹🇼", status: "active", website: "https://www.evergreen-line.com", phone: "+886 2 2505 7766", email: "info@evergreen-line.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ", "ออสเตรเลีย"], created: "06/01/2024 10:15", updated: "07/06/2024 11:00" },
  { name: "Hapag-Lloyd", code: "HLCU", country: "เยอรมนี", flag: "🇩🇪", status: "active", website: "https://www.hapag-lloyd.com", phone: "+49 40 3001 0", email: "info@hlag.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ", "อเมริกาใต้"], created: "07/01/2024 14:10", updated: "06/06/2024 17:10" },
  { name: "ONE (Ocean Network Express)", code: "ONEY", country: "ญี่ปุ่น", flag: "🇯🇵", status: "active", website: "https://www.one-line.com", phone: "+65 6371 8900", email: "support@one-line.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ", "ออสเตรเลีย"], created: "08/01/2024 08:50", updated: "05/06/2024 10:45" },
  { name: "HMM", code: "HMMU", country: "เกาหลีใต้", flag: "🇰🇷", status: "inactive", website: "https://www.hmm21.com", phone: "+82 2 3706 5114", email: "info@hmm21.com", routes: ["เอเชีย", "ยุโรป", "อเมริกาเหนือ"], created: "09/01/2024 15:20", updated: "04/06/2024 12:30" },
];

// ── generic master rows (ประเทศ · เอเจนต์ · ท่า · เอกสาร · บริการ) ─────────
// cells = every column EXCEPT status; the status pill is rendered from `active`.
export type SimpleRow = { cells: string[]; active: boolean };

export const COUNTRY_ROWS: SimpleRow[] = [
  { cells: ["จีน", "CN", "15 เอเจนต์", "12 ท่าเรือ / 5 สนามบิน"], active: true },
  { cells: ["ไทย", "TH", "18 เอเจนต์", "4 ท่าเรือ / 3 สนามบิน"], active: true },
  { cells: ["เวียดนาม", "VN", "7 เอเจนต์", "5 ท่าเรือ / 3 สนามบิน"], active: true },
  { cells: ["ญี่ปุ่น", "JP", "8 เอเจนต์", "9 ท่าเรือ / 6 สนามบิน"], active: true },
  { cells: ["เกาหลีใต้", "KR", "6 เอเจนต์", "4 ท่าเรือ / 4 สนามบิน"], active: true },
  { cells: ["เยอรมนี", "DE", "5 เอเจนต์", "5 ท่าเรือ / 7 สนามบิน"], active: true },
];
export const COUNTRY_HEADERS = ["ประเทศ", "รหัส ISO", "จำนวนเอเจนต์", "ท่าเรือ / สนามบิน"];

// เอเจนต์จริง Pacred (มาจาก BOOKING_AGENTS)
export const AGENT_ROWS: SimpleRow[] = BOOKING_AGENTS.filter((a) => a !== "อื่นๆ").map((name) => ({
  cells: [name, "จีน / ไทย", "รถ / เรือ / แอร์", "—"],
  active: true,
}));
export const AGENT_HEADERS = ["ชื่อเอเจนต์", "ประเทศ", "ประเภทขนส่ง", "พื้นที่ให้บริการ"];

// ท่า/คลังจริง Pacred (มาจาก BOOKING_PORTS · จีน/ไทย × ทะเล/อากาศ/รถ)
export const PORT_ROWS: SimpleRow[] = BOOKING_COUNTRIES.flatMap((country) =>
  (["SEA", "AIR", "TRUCK"] as const).flatMap((mode) =>
    (BOOKING_PORTS[country]?.[mode] ?? []).map((name) => ({
      cells: [name, "—", country, PORT_TYPE_BY_MODE[mode], MODE_LABEL[mode]],
      active: true,
    })),
  ),
);
export const PORT_HEADERS = ["ชื่อ", "รหัส", "ประเทศ", "ประเภท", "Mode"];

export const DOCUMENT_ROWS: SimpleRow[] = [
  { cells: ["INV", "ใบแจ้งหนี้ / Invoice", "Import / Export", "บังคับตามเงื่อนไข"], active: true },
  { cells: ["PL", "Packing List / ใบแพ็คกิ้ง", "Import / Export", "บังคับตามเงื่อนไข"], active: true },
  { cells: ["BL", "Bill of Lading", "Sea", "บังคับ"], active: true },
  { cells: ["AWB", "Air Waybill", "Air", "บังคับ"], active: true },
  { cells: ["DO", "Delivery Order", "Import", "บังคับตามเงื่อนไข"], active: true },
  { cells: ["MSDS", "เอกสารความปลอดภัย", "Dangerous Goods", "บังคับตามประเภทสินค้า"], active: true },
];
export const DOCUMENT_HEADERS = ["รหัส", "ชื่อเอกสาร", "ใช้กับงาน", "เงื่อนไข"];

export const SERVICE_ROWS: SimpleRow[] = [
  { cells: ["Customs Registration Service", "ค่าบริการจดทะเบียนกรมศุลกากร", "1,500", "800", "7%"], active: true },
  { cells: ["Customs Clearance", "ค่าบริการด้านพิธีการศุลกากร", "3,500", "500", "7%"], active: true },
  { cells: ["Import Declaration Paperless", "บริการนำเข้าแบบอิเล็กทรอนิกส์", "350", "200", "7%"], active: true },
  { cells: ["Delivery Order Receiving Fee", "ค่าบริการรับใบ D/O", "421", "0", "7%"], active: true },
  { cells: ["Gate Charge", "ค่าผ่านท่า", "190", "0", "7%"], active: true },
  { cells: ["Labor Loading Service", "ค่าบริการแรงงานขึ้นของ", "450", "0", "7%"], active: true },
];
export const SERVICE_HEADERS = ["บริการ", "คำอธิบาย", "ราคาขาย", "ต้นทุน", "VAT"];

// ── ประเภทรถ/ขนส่ง (vehicle master) ─────────────────────────────────────
export type VehicleCategory = "GENERAL" | "CONTAINER" | "SPECIAL";
export type Vehicle = {
  category: VehicleCategory;
  categoryLabel: string;
  code: string;
  name: string;
  body: string;
  capacity: string;
  size: string;
  use: string;
  container: string;
  mode: string;
  pricing: string;
  active: boolean;
};

export const VEHICLES: Vehicle[] = [
  { category: "GENERAL", categoryLabel: "ขนส่งทั่วไป", code: "PICKUP", name: "รถกระบะ", body: "กระบะเปิด / ตู้ทึบ", capacity: "ประมาณ 800–1,200 กก.", size: "พื้นที่บรรทุกประมาณ 1.7 × 2.4 ม.", use: "กล่อง พัสดุ สินค้าขนาดเล็ก", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "GENERAL", categoryLabel: "ขนส่งทั่วไป", code: "4W", name: "รถ 4 ล้อ", body: "ตู้ทึบ / คอก", capacity: "ประมาณ 1,000–1,500 กก.", size: "ตู้ประมาณ 2.1 × 3.0–3.2 ม.", use: "สินค้า LCL และงานส่งในเมือง", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "GENERAL", categoryLabel: "ขนส่งทั่วไป", code: "4W_JUMBO", name: "รถ 4 ล้อจัมโบ้", body: "ตู้ทึบ / คอกสูง", capacity: "ประมาณ 2,000–2,500 กก.", size: "ตู้ประมาณ 2.1 × 4.2 ม.", use: "สินค้าปริมาตรสูง น้ำหนักไม่มาก", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "GENERAL", categoryLabel: "ขนส่งทั่วไป", code: "6W", name: "รถ 6 ล้อ", body: "ตู้ทึบ / คอก / ผ้าใบ", capacity: "ประมาณ 5,000–7,000 กก.", size: "กระบะประมาณ 2.3 × 5.5–6.5 ม.", use: "สินค้าโรงงาน พาเลต และ LCL จำนวนมาก", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "GENERAL", categoryLabel: "ขนส่งทั่วไป", code: "6W_JUMBO", name: "รถ 6 ล้อจัมโบ้", body: "ตู้ทึบยาว / คอกสูง", capacity: "ประมาณ 6,000–8,000 กก.", size: "กระบะประมาณ 2.3 × 7.0–7.5 ม.", use: "งานปริมาตรสูงและพาเลตหลายชุด", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "GENERAL", categoryLabel: "ขนส่งทั่วไป", code: "10W", name: "รถ 10 ล้อ", body: "พื้นเรียบ / คอก / ผ้าใบ", capacity: "ประมาณ 12,000–15,000 กก.", size: "กระบะประมาณ 2.4 × 6.5–7.5 ม.", use: "สินค้าโรงงานหนัก เครื่องจักร และพาเลต", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "CONTAINER", categoryLabel: "รถลากตู้", code: "TRACTOR", name: "หัวลาก", body: "Tractor Head", capacity: "ขึ้นอยู่กับหางและน้ำหนักตู้", size: "หัวลากสำหรับต่อหาง", use: "ลากตู้คอนเทนเนอร์จากท่าเรือ/ICD", container: "รองรับหาง 20/40/45 ฟุต", mode: "Port / ICD / Road", pricing: "ต่อเที่ยว + ค่ารอ + คืนตู้", active: true },
  { category: "CONTAINER", categoryLabel: "รถลากตู้", code: "TRAILER_20", name: "หัวลาก + หาง 20 ฟุต", body: "Container Chassis 20FT", capacity: "ตามน้ำหนักตู้และกฎหมายเส้นทาง", size: "รองรับ 20’GP / 20’RF / 20’OT / 20’FR", use: "ลากตู้ 20 ฟุตจากท่าเรือหรือ ICD", container: "20 ฟุต", mode: "Port / ICD / Road", pricing: "ต่อเที่ยว + Lift On/Off + Detention", active: true },
  { category: "CONTAINER", categoryLabel: "รถลากตู้", code: "TRAILER_40", name: "หัวลาก + หาง 40 ฟุต", body: "Container Chassis 40FT", capacity: "ตามน้ำหนักตู้และกฎหมายเส้นทาง", size: "รองรับ 40’GP / 40’HQ / 40’RF / 40’OT / 40’FR / 45’HQ", use: "ลากตู้ 40–45 ฟุตจากท่าเรือหรือ ICD", container: "40–45 ฟุต", mode: "Port / ICD / Road", pricing: "ต่อเที่ยว + Lift On/Off + Detention", active: true },
  { category: "SPECIAL", categoryLabel: "รถงานพิเศษ", code: "LOWBED", name: "รถโลว์เบด", body: "Low Bed Trailer", capacity: "ตามรุ่นรถและใบอนุญาต", size: "พื้นต่ำสำหรับเครื่องจักรหนัก/Oversize", use: "เครื่องจักรหนัก สินค้าสูง หรือ OOG", container: "ไม่ใช่ตู้มาตรฐาน", mode: "Project Cargo / Road", pricing: "สำรวจหน้างาน + ต่อเที่ยว + ใบอนุญาต", active: true },
  { category: "SPECIAL", categoryLabel: "รถงานพิเศษ", code: "WINGVAN", name: "รถตู้ทึบ / Wing Van", body: "เปิดข้างได้", capacity: "ประมาณ 8,000–15,000 กก.", size: "เหมาะกับพาเลตและโหลดด้านข้าง", use: "สินค้าโรงงานและพาเลตจำนวนมาก", container: "ไม่รองรับลากตู้", mode: "Local / Road", pricing: "ต่อเที่ยว / ระยะทาง / โซน", active: true },
  { category: "SPECIAL", categoryLabel: "รถควบคุมอุณหภูมิ", code: "REFRIGERATED", name: "รถห้องเย็น", body: "Refrigerated Truck", capacity: "ตามขนาด 4/6/10 ล้อ", size: "กำหนดช่วงอุณหภูมิได้", use: "อาหาร ยา วัตถุดิบ และสินค้า Cold Chain", container: "ไม่รองรับลากตู้", mode: "Cold Chain / Road", pricing: "ต่อเที่ยว + ค่าอุณหภูมิ + ชั่วโมงรอ", active: true },
];

export const VEHICLE_PRICING_METHODS = [
  { label: "วิธีคิดราคา 1", value: "ราคาเหมารายเที่ยว" },
  { label: "วิธีคิดราคา 2", value: "ราคาเริ่มต้น + บาท/กม." },
  { label: "วิธีคิดราคา 3", value: "ราคาตามโซน/จังหวัด" },
  { label: "ค่าใช้จ่ายเสริม", value: "ค่ารอ, Lift On/Off, คืนตู้, Overtime" },
];

// ── ประเภท/ขนาดตู้ (container master) ────────────────────────────────────
export type ContainerType = {
  type: string;
  typeLabel: string;
  code: string;
  size: string;
  equipment: string;
  inside: string;
  max: string;
  mode: string;
  active: boolean;
};

export const CONTAINERS: ContainerType[] = [
  { type: "LCL", typeLabel: "แชร์ตู้", code: "LCL", size: "คิดตาม CBM / KG", equipment: "ไม่ใช้ตู้เฉพาะ", inside: "-", max: "ตามเงื่อนไขสายเรือ", mode: "Sea", active: true },
  { type: "FCL", typeLabel: "ตู้แห้งมาตรฐาน", code: "20'GP", size: "20 ฟุต", equipment: "General Purpose", inside: "5.90 × 2.35 × 2.39 ม.", max: "ประมาณ 28,000 กก.", mode: "Sea", active: true },
  { type: "FCL", typeLabel: "ตู้แห้งมาตรฐาน", code: "40'GP", size: "40 ฟุต", equipment: "General Purpose", inside: "12.03 × 2.35 × 2.39 ม.", max: "ประมาณ 28,500 กก.", mode: "Sea", active: true },
  { type: "FCL", typeLabel: "ตู้สูง", code: "40'HQ", size: "40 ฟุต High Cube", equipment: "High Cube", inside: "12.03 × 2.35 × 2.69 ม.", max: "ประมาณ 28,500 กก.", mode: "Sea", active: true },
  { type: "FCL", typeLabel: "ตู้สูงพิเศษ", code: "45'HQ", size: "45 ฟุต High Cube", equipment: "High Cube", inside: "13.55 × 2.35 × 2.69 ม.", max: "ตามสายเรือ", mode: "Sea", active: true },
  { type: "SPECIAL", typeLabel: "ตู้ควบคุมอุณหภูมิ", code: "20'RF", size: "20 ฟุต Reefer", equipment: "Reefer", inside: "ประมาณ 5.45 × 2.29 × 2.26 ม.", max: "ตามช่วงอุณหภูมิ", mode: "Sea", active: true },
  { type: "SPECIAL", typeLabel: "ตู้ควบคุมอุณหภูมิ", code: "40'RF", size: "40 ฟุต Reefer", equipment: "Reefer High Cube", inside: "ประมาณ 11.58 × 2.29 × 2.55 ม.", max: "ตามช่วงอุณหภูมิ", mode: "Sea", active: true },
  { type: "SPECIAL", typeLabel: "ตู้เปิดด้านบน", code: "20'OT", size: "20 ฟุต Open Top", equipment: "Open Top", inside: "สำหรับสินค้าสูงเกินตู้", max: "ตามสายเรือ", mode: "Sea", active: true },
  { type: "SPECIAL", typeLabel: "ตู้เปิดด้านบน", code: "40'OT", size: "40 ฟุต Open Top", equipment: "Open Top", inside: "สำหรับสินค้าสูงเกินตู้", max: "ตามสายเรือ", mode: "Sea", active: true },
  { type: "SPECIAL", typeLabel: "ตู้พื้นราบ", code: "20'FR", size: "20 ฟุต Flat Rack", equipment: "Flat Rack", inside: "สำหรับเครื่องจักร/ของ Oversize", max: "ตามสายเรือ", mode: "Sea", active: true },
  { type: "SPECIAL", typeLabel: "ตู้พื้นราบ", code: "40'FR", size: "40 ฟุต Flat Rack", equipment: "Flat Rack", inside: "สำหรับเครื่องจักร/ของ Oversize", max: "ตามสายเรือ", mode: "Sea", active: true },
  { type: "AIR", typeLabel: "สินค้าทางอากาศ", code: "AIR", size: "คิด Chargeable Weight", equipment: "ULD / Loose Cargo", inside: "ตามสายการบิน", max: "ตามเที่ยวบิน", mode: "Air", active: true },
  { type: "TRUCK", typeLabel: "รถข้ามแดน", code: "TRUCK", size: "4W / 6W / 10W / Trailer", equipment: "Truck Equipment", inside: "ตามประเภทรถ", max: "ตามกฎหมายเส้นทาง", mode: "Road", active: true },
];
