/**
 * รายการนำเข้า — data model + PLACEHOLDER seed.
 *
 * 2026-07-08 (ปอน) — the "รายการ · นำเข้า" tracking board (/admin/workspace/list/import)
 * mirrors the legacy "3.1 DOC DATA / COMMISSION / ข้อมูลงาน" Google-Sheet: the confirmed-job
 * / shipment operational tracking. Data FLOWS from the Booking board — when a ใบเสนอราคา is
 * confirmed (สำเร็จ), the customer registers → gets a PR code + a shipment no (auto-run) →
 * the job appears here. The top status-chip bar = the sheet's "สถานะ" column (owner: "เอา
 * คอลัมน์สถานะมาเป็นแถบข้างบน").
 *
 * The seed below is SAMPLE data derived from real rows of that sheet, with statuses assigned
 * across the workflow so the chips have data. NOT persisted — ปอน is finalizing the model.
 * When the real table/action lands, swap SEED_IMPORT_LIST for a server query in page.tsx.
 * See memory: pacred-booking-flow.
 */

export type StatusTone = "china" | "transit" | "thai" | "pay" | "done" | "cancel";

/** Canonical operational statuses (owner's list · ordered by workflow phase).
 *  ⚠️ some names are ปอน's best-effort transcription — confirm the exact wording. */
export const LIST_STATUSES: { key: string; tone: StatusTone }[] = [
  // จีน (China origin)
  { key: "รอปิดตู้จีน", tone: "china" },
  { key: "ศุลกากรจีน", tone: "china" },
  { key: "รอเรือออก", tone: "china" },
  { key: "คอนเฟิร์ม BL แล้ว", tone: "china" },
  { key: "รอเอกสาร FE", tone: "china" },
  // ระหว่างทาง (transit)
  { key: "รอเข้าเวียดนาม", tone: "transit" },
  { key: "เวียดนาม", tone: "transit" },
  { key: "อยู่ลาว/รถเข้าไทย", tone: "transit" },
  // ไทย (Thailand clearance)
  { key: "รอยิงใบขน", tone: "thai" },
  { key: "รอ ENTER", tone: "thai" },
  { key: "รอตรวจปล่อย", tone: "thai" },
  { key: "แลก D/O", tone: "thai" },
  { key: "รอค่าใช้จ่าย D/O", tone: "thai" },
  { key: "รอถอนเพิ่ม BL", tone: "thai" },
  // เงิน + จบ
  { key: "รอชำระเงิน", tone: "pay" },
  { key: "สำเร็จ", tone: "done" },
  { key: "ยกเลิก", tone: "cancel" },
];

export const TONE_PILL: Record<StatusTone, string> = {
  china: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  transit: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  thai: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  pay: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  cancel: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-300",
};

const TONE_BY_STATUS: Record<string, StatusTone> = Object.fromEntries(
  LIST_STATUSES.map((s) => [s.key, s.tone]),
);

/** pill classes for a status (unknown → neutral gray). */
export function statusPill(status: string): string {
  const tone = TONE_BY_STATUS[status];
  return tone ? TONE_PILL[tone] : "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-300";
}

// ── ใบบุ๊คกิ้ง — milestone flow (owner brief 2026-07-08) ──────────────────
// The detail page = a timeline: กรอกงาน + แนบรูปหลักฐาน → สถานะเลื่อนไปขั้นถัดไปเอง.
/** ordered operational flow for a SEA import shipment. */
export const SEA_IMPORT_FLOW: string[] = [
  "รอปิดตู้จีน", "ศุลกากรจีน", "รอเรือออก", "คอนเฟิร์ม BL แล้ว", "รอเอกสาร FE",
  "เวียดนาม", "อยู่ลาว/รถเข้าไทย", "รอยิงใบขน", "รอ ENTER", "แลก D/O",
  "รอตรวจปล่อย", "รอชำระเงิน", "สำเร็จ",
];
/** short flow for TRUCK / AIR (no vessel / B/L / transit). */
export const ROAD_AIR_IMPORT_FLOW: string[] = [
  "รอยิงใบขน", "รอตรวจปล่อย", "รอชำระเงิน", "สำเร็จ",
];
export function flowFor(type: string): string[] {
  return (type || "").toUpperCase().includes("SEA") ? SEA_IMPORT_FLOW : ROAD_AIR_IMPORT_FLOW;
}
/** what to do + attach as evidence at each milestone (owner: "แคปรูป + แนบวันที่"). */
export const MILESTONE_HINT: Record<string, string> = {
  "รอปิดตู้จีน": "ปิดตู้ที่โกดังจีน — แนบรูปใบปิดตู้ / เลขตู้",
  "ศุลกากรจีน": "ผ่านพิธีการศุลกากรจีน — แนบหลักฐาน",
  "รอเรือออก": "เรือออกจากต้นทาง (ETD/ATD) — แนบ booking / ตารางเรือ",
  "คอนเฟิร์ม BL แล้ว": "ได้เลข B/L แล้ว — แนบ B/L",
  "รอเอกสาร FE": "ได้ Form E / RCEP — แนบเอกสาร",
  "เวียดนาม": "ทรานซิตเวียดนาม — แนบหลักฐาน",
  "อยู่ลาว/รถเข้าไทย": "ลาว / รถเข้าไทย — แนบหลักฐาน",
  "รอยิงใบขน": "ยิงใบขนแล้ว — แนบใบขน",
  "รอ ENTER": "ENTER จากสายเรือเสร็จ — แคปหน้า ENTER (ระบบลงวันที่ให้)",
  "แลก D/O": "แลก D/O แล้ว — แนบ D/O",
  "รอตรวจปล่อย": "ตรวจปล่อยตู้แล้ว — แนบใบตรวจปล่อย",
  "รอชำระเงิน": "ลูกค้าชำระเงินแล้ว — แนบสลิป",
  "สำเร็จ": "ส่งของถึงลูกค้าแล้ว — แนบรูปส่งของ / ใบเซ็นรับ",
  "ยกเลิก": "ยกเลิกงาน",
};

export type ListItem = {
  id: string;
  date: string;
  pr: string; // MEMBER ID — รหัสลูกค้า PR (auto เมื่อลูกค้าสมัคร)
  shipment: string; // SHIPMENT / INV — เลข Shipment (auto-run)
  status: string; // สถานะ (คอลัมน์สถานะ)
  product: string;
  consignee: string; // ชื่อ - บริษัท ลูกค้า
  company: string; // PACRED / AXELRA / PCS
  type: string; // SEA / AIR / TRUCK
  term: string; // CIF / EXW / FOB / DDP
  size: string; // FCL 40 / FCL 20 / LCL
  pol: string; // ต้นทาง
  pod: string; // ปลายทาง
  carrier: string; // สายเรือ
  ctns: string;
  cbm: string;
  kgm: string;
  blNo: string; // B/L - AWB
  vessel: string; // VESS/VOY
  containerNo: string; // เลขตู้ (CTRN NO)
  formE: string; // ขอ FORM E
  etd: string;
  eta: string;
  shipping: string; // ชิปปิ้ง (เช่น "PLOY / SEA")
  sales: string;
  docFreight: string; // DOC FREIGHT
  invNo: string; // (AR) เลขที่ใบแจ้งหนี้
  receiptNo: string; // (AR) ใบเสร็จรับเงิน
  address: string;
  note: string;
};

/** blank-field helper to keep the seed compact. */
const E = "";

/** SAMPLE seed — real-shaped rows from the DOC DATA sheet, statuses spread across the workflow. */
export const SEED_IMPORT_LIST: ListItem[] = [
  {
    id: "L-PR26040001", date: "22/04/2026", pr: "PR555", shipment: "PR26040001", status: "รอตรวจปล่อย",
    product: "ตู้ 13", consignee: "อภิรัตน์ อินดัสตรีส์ จำกัด", company: "PACRED", type: "SEA", term: "CIF", size: "FCL 20",
    pol: "BELGIUM", pod: "PAT BKK T2", carrier: "CEVA", ctns: "436", cbm: "30", kgm: "11,054",
    blNo: "MSNU2438700", vessel: "MSC THAIS / FW609W", containerNo: "ONEU2111885", formE: E, etd: "28/05/2026", eta: "15/06/2026",
    shipping: "PLOY / SEA", sales: "PLOY", docFreight: "PLOY", invNo: "IV-20260500005", receiptNo: "RE-20260500001",
    address: "25 ซอยเพชรเกษม 68 แขวงบางแคเหนือ เขตบางแค กรุงเทพฯ 10160", note: E,
  },
  {
    id: "L-PR26040009", date: "22/04/2026", pr: "PR10611", shipment: "PR26040009", status: "รอเอกสาร FE",
    product: "อุปกรณ์กรองบ่อปลา", consignee: "บริษัท ติ๊ อควาเรี่ยม จำกัด", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40 HQ",
    pol: "QINGDAO", pod: "PAT BKK T1", carrier: "Heung-A Line", ctns: "1502", cbm: "58", kgm: "28,220",
    blNo: "WSDS2026050228", vessel: "SAWASDEE MIMOSA / 2605S", containerNo: "HLHU8201224", formE: "ขอแล้ว", etd: "13/05/2026", eta: "22/05/2026",
    shipping: "PLOY / SEA", sales: "BAM", docFreight: "PLOY", invNo: "IV-20260500019", receiptNo: "RT-20260500042",
    address: "399/101 ซอยพงษ์เพชรนิเวศน์ จตุจักร กรุงเทพฯ", note: E,
  },
  {
    id: "L-PR26040014", date: "24/04/2026", pr: "PR008", shipment: "PR26040014", status: "รอตรวจปล่อย",
    product: "ซุปเปอร์ซิปตู้14", consignee: "บริษัท ซุปเปอร์ซิป จำกัด", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "NANSHA", pod: "PAT BKK", carrier: "ASL", ctns: "350", cbm: "68", kgm: "8,330",
    blNo: "ASKBKCE6213565", vessel: "M. ODYSSEY V.2621S", containerNo: "AXEU6066183", formE: "ขอFE", etd: "21/05/2026", eta: "28/05/2026",
    shipping: "PLOY / SEA", sales: "Mayjang", docFreight: "PLOY", invNo: "IV-20260600001", receiptNo: "RT-20260600012",
    address: "ซุปเปอร์ซิป 125/4 ซ.อนามัยงามเจริญ แขวงท่าข้าม", note: E,
  },
  {
    id: "L-PR26040015", date: "24/04/2026", pr: "PR008", shipment: "PR26040015", status: "รอเรือออก",
    product: "ซุปเปอร์ซิปตู้15", consignee: "บริษัท ซุปเปอร์ซิป จำกัด", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "NANSHA", pod: "PAT BKK", carrier: "WAN HAI", ctns: "350", cbm: "58", kgm: "7,850",
    blNo: "132G506828", vessel: "WAN HAI 315 / S264", containerNo: "WHSU8009989", formE: "ขอFE", etd: "09/06/2026", eta: "25/06/2026",
    shipping: "PLOY / SEA", sales: "Mayjang", docFreight: "PLOY", invNo: E, receiptNo: E,
    address: "ซุปเปอร์ซิป 125/4 ซ.อนามัยงามเจริญ แขวงท่าข้าม", note: E,
  },
  {
    id: "L-PR26040016", date: "24/04/2026", pr: "PR011", shipment: "PR26040016", status: "รอ ENTER",
    product: "ซุปเปอร์ซิปตู้16", consignee: "บริษัท หุ้นคอร์ปอเรชั่น จำกัด", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "SHENZHEN", pod: "PAT BKK", carrier: "PIL", ctns: "440", cbm: "56.61", kgm: "16,143",
    blNo: "SZX601761100", vessel: "JARU BHUM 172S", containerNo: "PCIU9318250", formE: "ขอFE", etd: "06/06/2026", eta: "13/06/2026",
    shipping: "PLOY / SEA", sales: "Mayjang", docFreight: "PLOY", invNo: E, receiptNo: E,
    address: E, note: "2/6/2569 CONFIRM B/L",
  },
  {
    id: "L-AS26040008", date: "30/04/2026", pr: "PR000000", shipment: "AS26040008", status: "คอนเฟิร์ม BL แล้ว",
    product: "เครื่องล้างรถ", consignee: "iTrust", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "TIANJIN", pod: "PAT BKK", carrier: "HMM", ctns: "10", cbm: "24.77", kgm: "5,248",
    blNo: "MYSH2604486", vessel: "HMM DREAM 0061W", containerNo: E, formE: E, etd: "23/04/2026", eta: "24/05/2026",
    shipping: "PLOY / SEA", sales: "BAM", docFreight: "PLOY", invNo: "IV-20260500018", receiptNo: "RT-20260500041",
    address: "382/44 หมู่ 1 เทพารักษ์ บางเสาธง สมุทรปราการ", note: E,
  },
  {
    id: "L-AS26030010", date: "30/04/2026", pr: "PR019", shipment: "AS26030010", status: "สำเร็จ",
    product: "ฟิตเนสชิป2 (2 ตู้)", consignee: "HURACAN FITNESS", company: "PACRED", type: "SEA", term: "FOB", size: "FCL 40",
    pol: "XINGANG", pod: "LCB B2", carrier: "EVERGREEN LINE", ctns: "200", cbm: "130", kgm: "22,690",
    blNo: "MYSH2603550", vessel: "ITAL UNICA V.0844-189S", containerNo: "EGHU9367520", formE: E, etd: "22/04/2026", eta: "27-28/04/2026",
    shipping: "PLOY / SEA", sales: "BAM", docFreight: "PLOY", invNo: "IV-20260500002", receiptNo: "RT-20260500019",
    address: "372 M5, AONANG, KRABI 81000", note: E,
  },
  {
    id: "L-A2600300019", date: "11/03/2026", pr: "PR008", shipment: "A2600300019", status: "สำเร็จ",
    product: "ถุงพลาสติก ตู้12", consignee: "บริษัท ซุปเปอร์ซิป จำกัด", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "XINGANG", pod: "PAT BKK", carrier: "ONE", ctns: "735", cbm: "20.26", kgm: "24,420",
    blNo: "ONEYTSNG15587600", vessel: "IRENES RALLY / 0010S", containerNo: "TGBU9832157", formE: E, etd: "10/05/2026", eta: "10/05/2026",
    shipping: "PLOY / SEA", sales: "BAM", docFreight: "PLOY", invNo: "IV-20260500004", receiptNo: "RT-20260500022",
    address: "ซุปเปอร์ซิป 125/4 ซ.อนามัยงามเจริญ", note: E,
  },
  {
    id: "L-PR26040022", date: "28/04/2026", pr: "PR080", shipment: "PR26040022", status: "สำเร็จ",
    product: "Google Chromecast", consignee: "ไทย-ไชนิส พร็อพเพอร์ตี้ส์ โฮลดิ้งส์", company: "PACRED", type: "AIR", term: "CIF", size: "AIR",
    pol: E, pod: "SUV UPS", carrier: "UPS", ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "GRING / AIR", sales: "JEEN", docFreight: "GRING", invNo: "IV-20260500015", receiptNo: "RT-20260500045",
    address: "Radisson Blu Resort Phuket Maikhao Beach", note: E,
  },
  {
    id: "L-PR26040007", date: "22/04/2026", pr: "PR005", shipment: "PR26040007", status: "สำเร็จ",
    product: "Jewelry", consignee: "B.F.F AROMA CO. LTD", company: "PACRED", type: "TRUCK", term: "CIF", size: "TRUCK",
    pol: E, pod: "มุกดาหาร", carrier: "ไปรษณีย์", ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "GRING / TRUCK", sales: "Mayjang", docFreight: E, invNo: E, receiptNo: E,
    address: "27/3 Bang Khun Non, Bangkok Noi, Bangkok 10700", note: "ส่งสินค้า 27/5/2026",
  },
  {
    id: "L-PR26040025", date: "28/04/2026", pr: "PR666", shipment: "PR26040025", status: "รอยิงใบขน",
    product: "อุปกรณ์เครื่องจักร", consignee: "บริษัท นิว เวิลด์ เทรดดิ้ง (ไทยแลนด์)", company: "PACRED", type: "TRUCK", term: "CIF", size: "TRUCK",
    pol: E, pod: "มุกดาหาร", carrier: "ไปรษณีย์", ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "GRING / TRUCK", sales: "MAY", docFreight: "GRING", invNo: E, receiptNo: E,
    address: "ซอยโชคชัย 4 ซอย 78 ลาดพร้าว กรุงเทพฯ", note: E,
  },
  {
    id: "L-PR26040006", date: "22/04/2026", pr: "PR9585", shipment: "PR26040006", status: "รอยิงใบขน",
    product: "สายกีต้า ชิป10", consignee: "KIT CHAREON MUSICAL LTD., PART.", company: "PACRED", type: "TRUCK", term: "CIF", size: "TRUCK",
    pol: E, pod: "มุกดาหาร", carrier: "ไปรษณีย์", ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "PLOY / TRUCK", sales: "Pupu", docFreight: "PLOY", invNo: E, receiptNo: E,
    address: "73 ASADANG ROAD, PRANAKORN, BANGKOK 10200", note: E,
  },
  {
    id: "L-PR26050013", date: "20/05/2026", pr: "PR000000", shipment: "PR26050013", status: "รอชำระเงิน",
    product: "เครื่องล้างรถ ตู้ 2", consignee: "iTrust", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "TIANJIN", pod: "PAT BKK", carrier: "ONE", ctns: "17", cbm: "39.9", kgm: "6,935",
    blNo: "MYSH2606278", vessel: "BIG GEORGE 26023E", containerNo: "ONEU5807368", formE: "ขอFE", etd: "06/06/2026", eta: "05/07/2026",
    shipping: "PLOY / SEA", sales: "pupu", docFreight: "PLOY", invNo: E, receiptNo: E,
    address: "382/44 หมู่ 1 เทพารักษ์ บางเสาธง สมุทรปราการ", note: "จัดชุดปล่อย · เคลียร์ 9/7/26",
  },
  {
    id: "L-PR26050009", date: "10/05/2026", pr: "PR234", shipment: "PR26050009", status: "รอปิดตู้จีน",
    product: "ทิชชู่แห้งตู้3", consignee: "บริษัท ไตรภาคย์พาณิช จำกัด", company: "PACRED", type: "SEA", term: "FOB", size: "FCL 40",
    pol: "XIAMEN", pod: "PAT BKK", carrier: "ZIM", ctns: "1768", cbm: "73.19", kgm: "7,514",
    blNo: "MYSH2605428", vessel: "XIN AN 66S", containerNo: "ZCSU6625802", formE: "ขอRCEP", etd: "14/05/2026", eta: "18/05/2026",
    shipping: "PLOY / SEA", sales: "PLOY", docFreight: "PLOY", invNo: "IV-20260500010", receiptNo: "RT-20260500035",
    address: "160/4-5 หมู่ 9 ต.โพธิ์เสด็จ อ.เมือง นครศรีธรรมราช", note: E,
  },
  {
    id: "L-PR26050014", date: "20/05/2026", pr: "PR10611", shipment: "PR26050014", status: "เวียดนาม",
    product: "อุปกรณ์กรองบ่อปลา ตู้2", consignee: "บริษัท ติ๊ อควาเรี่ยม จำกัด", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 40",
    pol: "QINGDAO", pod: "LCB", carrier: "JJ", ctns: "1549", cbm: "58", kgm: "28,500",
    blNo: "JJCQDLCA6500316", vessel: "MV. ZHONG GU NAN HAI", containerNo: "TWCU8178691", formE: "ขอFE", etd: "12/06/2026", eta: "19-20/06/2026",
    shipping: "PLOY / SEA", sales: "PLOY", docFreight: "PLOY", invNo: E, receiptNo: E,
    address: "399/101 ซอยพงษ์เพชรนิเวศน์ จตุจักร กรุงเทพฯ", note: "ลูกค้ารับเอง",
  },
  {
    id: "L-A2600300010", date: "10/03/2026", pr: "AX035", shipment: "A2600300010", status: "อยู่ลาว/รถเข้าไทย",
    product: "เส้นด้าย", consignee: "บริษัท ศิลปทอไทย จำกัด", company: "AXELRA", type: "SEA", term: "EXW", size: "LCL",
    pol: "NANSHA", pod: "PAT BKK", carrier: E, ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "WIN / SEA", sales: "BAM", docFreight: "WIN", invNo: E, receiptNo: E,
    address: "10 หมู่ 2 ซอยวัดไร่ขิง สามพราน นครปฐม 73210", note: E,
  },
  {
    id: "L-PR26040021", date: "28/04/2026", pr: "PR014", shipment: "PR26040021", status: "ยกเลิก",
    product: "เครื่องฟอกอากาศ", consignee: "mrnonaki", company: "PACRED", type: "SEA", term: "EXW", size: "FCL 20",
    pol: E, pod: E, carrier: E, ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "PLOY / SEA", sales: "JEEN", docFreight: "PLOY", invNo: E, receiptNo: E,
    address: "38/68-69 ต.คูคต อ.ลำลูกกา ปทุมธานี 12130", note: E,
  },
  {
    id: "L-PR26040026", date: "29/04/2026", pr: "PR016", shipment: "PR26040026", status: "ยกเลิก",
    product: "ของตกแต่ง ไม้,หิน", consignee: "Wisarut", company: "PACRED", type: "SEA", term: "CIF", size: "LCL",
    pol: E, pod: "PAT BKK", carrier: E, ctns: E, cbm: E, kgm: E,
    blNo: E, vessel: E, containerNo: E, formE: E, etd: E, eta: E,
    shipping: "— / SEA", sales: "JEEN", docFreight: E, invNo: E, receiptNo: E,
    address: E, note: "งานศิลปะ",
  },
];
