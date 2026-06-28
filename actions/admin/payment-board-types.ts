/**
 * Customer Payment-Status Board — shared types (owner 2026-06-28).
 *
 * "ดูง่ายๆ ว่าลูกค้าคนไหนจ่ายแล้ว/ยังไม่จ่าย · จ่ายตรงไหม · ขายเท่าไร/ต้นทุนเท่าไร ·
 *  เงินสด/เครดิต · รถ/เรือ/แอร์ · admin ที่เกี่ยวข้อง · สถานะ ยังไม่ชำระ · ค่าอะไร".
 *
 * Co-located NON-"use server" module (the sibling payment-board.ts is "use
 * server" and may only export async functions). One row = one ฝากนำเข้า order
 * (tb_forwarder) — the richest money/payment surface (sell+cost+credit+mode+
 * outstanding+handling-admin all on the row). Read-only board; edits deep-link
 * to the already-guarded forwarder detail page (§0d).
 */

/** Paid lifecycle bucket derived from fstatus (5=รอชำระ · ≥6=ชำระแล้ว/เตรียมส่ง). */
export type PayState = "unpaid" | "paid";

/** One payment-status row (a ฝากนำเข้า order). */
export type PaymentBoardRow = {
  /** tb_forwarder.id (links to /admin/forwarders/[id]). */
  fid: string;
  /** Owner member code + resolved name. */
  userid: string;
  customerName: string;
  /** จ่ายแล้ว/ยังไม่จ่าย (fstatus ≥6 = paid). */
  payState: PayState;
  /** Σ sell (ftotalprice composite outstanding · what the customer owes). */
  owed: number;
  /** ยอดขาย (ftotalprice). */
  sold: number;
  /** ต้นทุน (fcosttotalprice). */
  cost: number;
  /** กำไร = sold − cost (display; the cockpit has the canonical profit). */
  profit: number;
  /** เงินสด/เครดิต — true when this order or the customer is on credit. */
  isCredit: boolean;
  /** วงเงินเครดิตลูกค้า (THB · 0 = ไม่มี). */
  creditRoom: number;
  /** รถ/เรือ/แอร์ label (ftransporttype). */
  modeLabel: string;
  /** ขนส่งไทย label (fshipby · PRF/PRE-rebranded). */
  carrierLabel: string;
  /** Raw fstatus + Thai label + the "ค่าอะไร / next" hint. */
  fstatus: string;
  statusLabel: string;
  /** เซลล์ผู้ดูแล (customer's adminIDSale). */
  repAdmin: string;
  /** แอดมินที่แตะล่าสุด (adminidupdate). */
  lastAdmin: string;
  /** created date ISO. */
  fdate: string | null;
  /** tracking / cabinet for quick scanning. */
  tracking: string;
};

export type PaymentBoardFilters = {
  /** unpaid (default · the chase queue) / paid / all. */
  pay?: "unpaid" | "paid" | "all";
  /** cash / credit / all. */
  money?: "cash" | "credit" | "all";
  /** ftransporttype "1"|"2"|"3" or "all". */
  mode?: string;
  /** free text: customer name / member code / tracking / order id. */
  q?: string;
  limit?: number;
};

export type PaymentBoardResult = {
  rows: PaymentBoardRow[];
  /** Σ owed across the filtered unpaid rows (the money to chase). */
  totalOwed: number;
  unpaidCount: number;
  capped: boolean;
};
