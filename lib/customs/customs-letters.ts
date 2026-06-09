/**
 * W11 — Customs-letter kit: the DO-release LOI per carrier + the customs-letter
 * templates (45-day waiver · POA · amend · lost-doc).
 *
 * Source: `Project dev/FORM/` doc-kit + the customs-docs evidence
 * (`docs/research/freight-knowledge-2026-06-01/04-customs-docs-accounting.md`
 * §1.2 + PART 3 #2/#9) + `docs/learnings/customs-brokerage-kit.md` §5.
 *
 * These are PURE TEMPLATING DEFINITIONS over shipment + parties data — no DB,
 * no actions, no network. The PDF generator (`components/pdf/customs-letter.tsx`)
 * consumes a `CustomsLetterData` to render the right A4 Thai letter.
 *
 * Importable from server + client (no directive).
 */

// ── Carriers / shipping lines (DO-release LOI variants) ────────────────

export type CustomsCarrierCode =
  | "ZIM"
  | "RCL"
  | "COSCO"
  | "HEDE"
  | "FUJIT"
  | "UPS"
  | "CULINES"
  | "SINOKOR"
  | "OTHER";

export type CustomsCarrier = {
  code: CustomsCarrierCode;
  nameTh: string;
  nameEn: string;
  /** B/L number prefix(es) that map to this carrier (for auto-detect). */
  blPrefixes?: readonly string[];
  /** Whether the carrier uses a Split-DO variant (ZIM). */
  supportsSplitDo?: boolean;
};

export const CUSTOMS_CARRIERS: readonly CustomsCarrier[] = [
  { code: "ZIM",     nameTh: "ZIM Lines",            nameEn: "ZIM Integrated Shipping",     supportsSplitDo: true },
  { code: "RCL",     nameTh: "RCL (Regional Container Lines)", nameEn: "Regional Container Lines" },
  { code: "COSCO",   nameTh: "COSCO Shipping",       nameEn: "COSCO Shipping Lines",        blPrefixes: ["COSU"] },
  { code: "HEDE",    nameTh: "HEDE (เหอเต๋อ)",        nameEn: "Hede Shipping" },
  { code: "FUJIT",   nameTh: "FUJI Trans",           nameEn: "Fuji Trans (FUJIT)" },
  { code: "UPS",     nameTh: "UPS",                  nameEn: "UPS / Tyler" },
  { code: "CULINES", nameTh: "CULINES",              nameEn: "CU Lines",                    blPrefixes: ["CULU"] },
  { code: "SINOKOR", nameTh: "Sinokor Lines",        nameEn: "Sinokor Merchant Marine",     blPrefixes: ["SLVU"] },
  { code: "OTHER",   nameTh: "อื่นๆ (ระบุเอง)",       nameEn: "Other (manual)" },
] as const;

const CARRIER_INDEX: ReadonlyMap<CustomsCarrierCode, CustomsCarrier> = new Map(
  CUSTOMS_CARRIERS.map((c) => [c.code, c]),
);

export function findCarrier(code: string | null | undefined): CustomsCarrier | null {
  if (!code) return null;
  return CARRIER_INDEX.get(code as CustomsCarrierCode) ?? null;
}

/** Auto-detect carrier from a B/L number prefix (best-effort; OTHER fallback). */
export function carrierFromBlPrefix(blNo: string | null | undefined): CustomsCarrierCode {
  if (!blNo) return "OTHER";
  const prefix = blNo.trim().slice(0, 4).toUpperCase();
  for (const c of CUSTOMS_CARRIERS) {
    if (c.blPrefixes?.some((p) => p.toUpperCase() === prefix)) return c.code;
  }
  return "OTHER";
}

// ── Letter types (the customs-letter kit) ──────────────────────────────

export type CustomsLetterType =
  | "do_release"   // DO-release Letter of Indemnity (per carrier)
  | "do_split"     // ZIM Split-DO (multi-set) — variant of do_release
  | "waiver_45"    // 45-day overdue-goods waiver (Form 304 04 15)
  | "poa"          // Power of Attorney to collect D/O
  | "amend"        // Amendment letter (consignee/BL correction)
  | "lost_doc";    // Lost-document police-report cover letter (กศก.122)

export type CustomsLetterTypeMeta = {
  type: CustomsLetterType;
  titleTh: string;
  /** Subject line ("เรื่อง ...") on the letter. */
  subjectTh: string;
  /** Short description for the picker. */
  descTh: string;
  /** Whether a carrier selection is required for this letter. */
  needsCarrier: boolean;
};

export const CUSTOMS_LETTER_TYPES: readonly CustomsLetterTypeMeta[] = [
  {
    type: "do_release",
    titleTh: "จดหมายแลก D/O (Letter of Indemnity)",
    subjectTh: "ขอแลกใบสั่งปล่อยสินค้า (Delivery Order)",
    descTh: "ขอให้สายเรือ/ตัวแทนออก D/O โดยไม่มี B/L ต้นฉบับ (กรณี Surrender/Telex/Sea-Waybill) พร้อมข้อความรับผิดชอบ (indemnity)",
    needsCarrier: true,
  },
  {
    type: "do_split",
    titleTh: "ZIM Split D/O (แยกชุด)",
    subjectTh: "ขอแยกใบสั่งปล่อยสินค้า (Split Delivery Order)",
    descTh: "แยกสินค้าใน B/L เดียวเป็นหลายชุด D/O (ตั๋วพ่วง / ตู้หลายผู้รับ) — เฉพาะ ZIM",
    needsCarrier: true,
  },
  {
    type: "waiver_45",
    titleTh: "หนังสือผ่อนผันของเกิน 45 วัน",
    subjectTh: "ขอผ่อนผันการนำของออกจากอารักขาศุลกากร (เกิน 45 วัน · แบบ 304 04 15)",
    descTh: "ขอเคลียร์ของค้าง/ตกค้างเกินกำหนดก่อนถูกขายทอดตลาด (วางประกัน 25% อากรประเมิน)",
    needsCarrier: false,
  },
  {
    type: "poa",
    titleTh: "หนังสือมอบอำนาจรับ D/O",
    subjectTh: "หนังสือมอบอำนาจรับใบสั่งปล่อยสินค้า (Delivery Order)",
    descTh: "มอบอำนาจให้บุคคล (เลขบัตร ปชช.) รับ D/O แทน — ทาง AIR/SEA",
    needsCarrier: false,
  },
  {
    type: "amend",
    titleTh: "หนังสือขอแก้ไข (Amend) ชื่อผู้รับ/เลข B/L",
    subjectTh: "ขอแก้ไขข้อมูลในเอกสารขนส่ง (Amendment)",
    descTh: "แก้ชื่อผู้รับ (consignee) หรือเลข AWB/BL หลังของถึง",
    needsCarrier: true,
  },
  {
    type: "lost_doc",
    titleTh: "หนังสือแจ้งเอกสารหาย (กศก.122)",
    subjectTh: "แจ้งเอกสารใบเสร็จรับเงินศุลกากร (กศก.122) สูญหาย",
    descTh: "หนังสือแนบรายงานประจำวันตำรวจ กรณีใบเสร็จศุลกากรหายระหว่างขนส่ง เพื่อขอออกใหม่",
    needsCarrier: false,
  },
] as const;

const LETTER_TYPE_INDEX: ReadonlyMap<CustomsLetterType, CustomsLetterTypeMeta> = new Map(
  CUSTOMS_LETTER_TYPES.map((t) => [t.type, t]),
);

export function findLetterType(type: string | null | undefined): CustomsLetterTypeMeta | null {
  if (!type) return null;
  return LETTER_TYPE_INDEX.get(type as CustomsLetterType) ?? null;
}

// ── B/L release status (drives the DO-release decision logic, §1.5) ─────

export type BlReleaseStatus = "OBL" | "SWB" | "TLX" | "SURRENDER";

export const BL_RELEASE_STATUS_LABEL: Record<BlReleaseStatus, string> = {
  OBL:       "OBL — มี B/L ต้นฉบับ",
  SWB:       "SWB — Sea Waybill",
  TLX:       "TLX — Telex Release",
  SURRENDER: "Surrender — เวนคืนต้นทาง",
};

/**
 * Whether a DO-release Letter of Indemnity is REQUIRED for this B/L status.
 * OBL = no LOI needed (surrender the original); the rest = LOI needed.
 * (§1.5 of the customs-docs evidence.)
 */
export function loiRequiredForStatus(status: BlReleaseStatus): boolean {
  return status !== "OBL";
}

// ── The data contract the PDF generator consumes ───────────────────────

export type CustomsLetterData = {
  letterType: CustomsLetterType;
  /** Carrier (for DO-release / split / amend). */
  carrierCode: CustomsCarrierCode | null;
  carrierNameOverride: string | null;

  /** Reference / job context. */
  jobNo: string | null;
  refNo: string | null;          // e.g. declaration_no or invoice_no
  issueDateIso: string;          // ISO date for the letter date

  /** Sender — the company writing the letter (default = Pacred / NNB shipping). */
  senderName: string;
  senderAddress: string;
  senderTaxId: string | null;
  /** Director/signatory line. */
  signatoryName: string | null;
  signatoryTitle: string | null;

  /** Consignee (Thai importer). */
  consigneeName: string;
  consigneeAddress: string;
  consigneeTaxId: string | null;

  /** Logistics block. */
  blNo: string | null;
  blStatus: BlReleaseStatus | null;
  vesselVoyage: string | null;
  portLoading: string | null;
  portDischarge: string | null;
  placeDelivery: string | null;
  containerNo: string | null;       // physical carrier container no
  containerCodeInternal: string | null; // Pacred GZE/GZS code
  cargoDescription: string | null;
  totalCartons: number | null;
  totalWeightKg: number | null;
  totalVolumeCbm: number | null;

  /** POA-specific. */
  granteeName: string | null;
  granteeIdCardNo: string | null;
  awbTrackingNo: string | null;

  /** Amend-specific. */
  amendOldValue: string | null;
  amendNewValue: string | null;
  amendField: string | null;       // "ชื่อผู้รับ" | "เลข B/L" | ...

  /** Lost-doc-specific. */
  lostReceiptNumbers: string[] | null;  // list of กศก.122 numbers
  courierName: string | null;
  courierTrackingNo: string | null;
  policeReportNote: string | null;

  /** Split-DO sets (ZIM). */
  splitSets: Array<{
    setNo: number;
    consignee: string;
    marksAndNumbers: string | null;
    packages: string | null;
    description: string | null;
    containerNo: string | null;
    weightKg: number | null;
    volumeCbm: number | null;
  }> | null;

  /** Waiver-45-specific. */
  customsOffice: string | null;
  arrivalDateIso: string | null;
  estimatedDutyThb: number | null;
};
