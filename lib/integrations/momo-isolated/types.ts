/**
 * MOMO Isolated — types + enums for the new Admin MOMO Status Sync.
 *
 * Per brief 2026-05-28 (ปอน): สถานะใหม่ใช้สำหรับ Admin หลังบ้านและ
 * mapper เท่านั้น ยังไม่ต้องนำไปใช้กับหน้าบ้านลูกค้า.
 *
 * 3 PHASES × 14 SHIPMENT STATUSES (TRUCK + LCL).
 *
 * ⚠️ THIS IS A NEW, ISOLATED MODULE — not connected to the existing
 *    `lib/integrations/momo-jmf/types.ts` (which has different status
 *    semantics tied to the legacy cargo spine).
 */

/** 3 phases of a MOMO shipment journey (TRUCK + LCL). */
export type MomoPhase = "ORIGIN" | "TRANSIT" | "DESTINATION";

/** 14 shipment statuses (brief 2026-05-28 §11). */
export type MomoShipmentStatus =
  // PHASE 1: ORIGIN — ต้นทาง / ร้านค้า → โกดังจีน
  | "WAITING_SELLER_SHIP"   // รอต้นทางส่งเข้าโกดัง
  | "AT_WAREHOUSE_CN"       // ถึงโกดังจีนแล้ว
  | "CONSOLIDATING"         // กำลังรวมสินค้า
  | "TRUCK_CLOSED"          // ปิดรอบรถแล้ว
  // PHASE 2: TRANSIT — ระหว่างขนส่ง / รถ + ด่าน + ศุลกากร
  | "CUSTOMS_CN"            // ผ่านศุลกากรต้นทาง
  | "DEPARTED"              // รถออกเดินทางแล้ว
  | "IN_TRANSIT"            // กำลังขนส่งระหว่างทาง
  | "AT_MUKDAHAN"           // ถึงด่านชายแดนไทย
  | "CUSTOMS_TH"            // ผ่านศุลกากรไทย
  // PHASE 3: DESTINATION — ปลายทาง / โกดังไทย → ลูกค้า
  | "AT_WAREHOUSE_TH"       // ของถึงโกดังไทยแล้ว
  | "WAITING_PAYMENT"       // รอชำระเงิน
  | "DISTRIBUTING"          // เตรียมจัดส่ง
  | "DELIVERING"            // กำลังจัดส่ง
  | "DELIVERED";            // ส่งสำเร็จแล้ว

export type MomoBillingStatus = "NOT_BILLED" | "INVOICED" | "PAID";
export type MomoJobStatus     = "ACTIVE" | "CLOSED" | "CANCELLED";
export type MomoIssueStatus   =
  | "NONE"
  | "DELAYED"
  | "CUSTOMS_HOLD"
  | "PAYMENT_PROBLEM"
  | "ADDRESS_PROBLEM"
  | "DAMAGED"
  | "LOST";

/** Badge colour family per brief §12. */
export type MomoBadgeColor = "yellow" | "blue" | "green" | "red";

export const MOMO_STATUS_BADGE: Record<MomoShipmentStatus, MomoBadgeColor> = {
  // PHASE 1
  WAITING_SELLER_SHIP: "yellow",
  AT_WAREHOUSE_CN:     "green",
  CONSOLIDATING:       "blue",
  TRUCK_CLOSED:        "green",
  // PHASE 2
  CUSTOMS_CN:          "blue",
  DEPARTED:            "blue",
  IN_TRANSIT:          "blue",
  AT_MUKDAHAN:         "blue",
  CUSTOMS_TH:          "blue",
  // PHASE 3
  AT_WAREHOUSE_TH:     "green",
  WAITING_PAYMENT:     "yellow",
  DISTRIBUTING:        "blue",
  DELIVERING:          "blue",
  DELIVERED:           "green",
};

export const MOMO_STATUS_TH: Record<MomoShipmentStatus, string> = {
  WAITING_SELLER_SHIP: "รอต้นทางส่งเข้าโกดัง",
  AT_WAREHOUSE_CN:     "ถึงโกดังจีนแล้ว",
  CONSOLIDATING:       "กำลังรวมสินค้า",
  TRUCK_CLOSED:        "ปิดรอบรถแล้ว",
  CUSTOMS_CN:          "ผ่านศุลกากรต้นทาง",
  DEPARTED:            "รถออกเดินทางแล้ว",
  IN_TRANSIT:          "กำลังขนส่งระหว่างทาง",
  AT_MUKDAHAN:         "ถึงด่านชายแดนไทย",
  CUSTOMS_TH:          "ผ่านศุลกากรไทย",
  AT_WAREHOUSE_TH:     "ของถึงโกดังไทยแล้ว",
  WAITING_PAYMENT:     "รอชำระเงิน",
  DISTRIBUTING:        "เตรียมจัดส่ง",
  DELIVERING:          "กำลังจัดส่ง",
  DELIVERED:           "ส่งสำเร็จแล้ว",
};

/** Phase grouping — used by UI for grouping chips. */
export const MOMO_STATUS_PHASE: Record<MomoShipmentStatus, MomoPhase> = {
  WAITING_SELLER_SHIP: "ORIGIN",
  AT_WAREHOUSE_CN:     "ORIGIN",
  CONSOLIDATING:       "ORIGIN",
  TRUCK_CLOSED:        "ORIGIN",
  CUSTOMS_CN:          "TRANSIT",
  DEPARTED:            "TRANSIT",
  IN_TRANSIT:          "TRANSIT",
  AT_MUKDAHAN:         "TRANSIT",
  CUSTOMS_TH:          "TRANSIT",
  AT_WAREHOUSE_TH:     "DESTINATION",
  WAITING_PAYMENT:     "DESTINATION",
  DISTRIBUTING:        "DESTINATION",
  DELIVERING:          "DESTINATION",
  DELIVERED:           "DESTINATION",
};

// ── Internal Admin record — mapper output shape ───────────────
// This is the SHAPE the mapper outputs (brief 2026-05-28 §13).
// `customerStatusText` deliberately NOT included — brief: "ห้ามใช้
//  ชื่อ field ว่า customerStatusText ในรอบนี้ เพราะยังไม่ทำหน้าบ้านลูกค้า".

export type MomoInternalAdminRecord = {
  trackingNo:      string | null;
  sackNo:          string | null;
  containerNo:     string | null;
  phase:           MomoPhase | null;
  shipmentStatus:  MomoShipmentStatus | null;
  billingStatus:   MomoBillingStatus | null;
  jobStatus:       MomoJobStatus | null;
  issueStatus:     MomoIssueStatus;
  adminStatusText: string;
  currentLocation: string | null;
  etd:             string | null;      // ISO timestamptz
  eta:             string | null;
  momoUpdatedAt:   string | null;
  raw:             unknown;             // full MOMO record for debug + remap
};

// ── HTTP client result envelope ───────────────────────────────

export type MomoErrorCode =
  | "MOMO_NOT_CONFIGURED"     // env vars missing
  | "MOMO_AUTH_INVALID"       // 401/403 from MOMO
  | "MOMO_NOT_FOUND"          // 404 from MOMO
  | "MOMO_API_UNAVAILABLE"    // network / 5xx
  | "MOMO_PARSE_ERROR"        // JSON parse failed
  | "MOMO_VALIDATION_ERROR";  // our input bad

export type MomoClientResult<T> =
  | { ok: true;  data: T; status: number }
  | { ok: false; error: MomoErrorCode; message: string; status?: number };
