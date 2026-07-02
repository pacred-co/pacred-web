/**
 * AP / เบิกจ่าย ledger — pure types + read/aggregate helpers.
 * Spec: docs/research/accounting-ap-2026-07-01/spec.md · mig 0239.
 *
 * This module is PURE (no "use server", no Supabase mutation) so both the
 * page components AND a future server action can import it without the
 * Next-16 "use server" non-async-export restriction biting (AGENTS build-trap).
 * The DB READ helpers here take an already-constructed admin Supabase client
 * as an argument (they run server-side but are plain async functions, not
 * Server Actions).
 *
 * ── MONEY-SAFETY (spec §5 · Slice 1) ──────────────────────────────────
 * NOTHING in this module writes ANY existing money table. It reads/aggregates
 * the NEW ap_disbursement / ap_disbursement_batch / ap_central_fund tables and
 * resolves the source Pacred account via lib/payment/bank-accounts.ts. The
 * transferred pay-flip (a register of an out-of-band transfer) is DEFERRED to
 * Slice 2 — this module only surfaces the READ + the request/approve records.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PACRED_BANK_ACCOUNTS,
  resolvePaymentAccount,
  type PacredAccountKey,
  type PacredBankAccount,
} from "@/lib/payment/bank-accounts";

// ════════════════════════════════════════════════════════════
// Taxonomies — the load-bearing enums (drive accounting treatment).
// Mirror the CHECK constraints in mig 0239 EXACTLY.
// ════════════════════════════════════════════════════════════

/** The disbursement lane = which xlsx sheet/mode the row came from. */
export type ApLane =
  | "sea" | "air" | "truck" | "tr_6699" | "sea_choho"
  | "tua_chon" | "export" | "cn_vat_refund"
  | "general" | "cargo" | "close_inspect" | "nnb";

export type ApEntity = "pacred" | "axelra" | "nnb" | "pcs" | "ttp";

/** หมวดหมู่รายการ — the disbursement taxonomy. */
export type ApCategory = "service_cost" | "advance_passthrough" | "refund_correction";

/** สถานะโอนเงิน — the transfer/register axis. */
export type ApTransferStatus =
  | "requested" | "approved" | "transferred" | "customer_paid" | "rejected";

/** สถานะการตามใบเสร็จ — the receipt-chase axis (independent of transfer). */
export type ApReceiptStatus = "pending" | "received" | "customer_named" | "na";

export type ApBatchStatus = "draft" | "approved" | "paid" | "rejected";

// ── Readable Thai labels (single source of truth for the surfaces) ──

export const AP_LANE_LABEL: Record<ApLane, string> = {
  sea:           "เบิกเงิน SEA (เรือ)",
  air:           "เบิกเงิน AIR (อากาศ)",
  truck:         "เบิกเงิน TRUCK (รถ)",
  tr_6699:       "6699-TR",
  sea_choho:     "โชห่วย (เรือ)",
  tua_chon:      "ตั๋วชน",
  export:        "Export (ส่งออก)",
  cn_vat_refund: "คืนภาษีโกดังจีน",
  general:       "เบิกเงินทั่วไป (OPEX)",
  cargo:         "Cargo",
  close_inspect: "ปิดตรวจ",
  nnb:           "NNB (เบิกซื้อสินค้า)",
};

/** The lane tab order for the list surface (ทั้งหมด is prepended in the page). */
export const AP_LANE_ORDER: ApLane[] = [
  "sea", "air", "truck", "tr_6699", "sea_choho",
  "tua_chon", "export", "cn_vat_refund",
  "general", "cargo", "close_inspect", "nnb",
];

export const AP_ENTITY_LABEL: Record<ApEntity, string> = {
  pacred: "PACRED",
  axelra: "AXELRA",
  nnb:    "NNB",
  pcs:    "PCS",
  ttp:    "TTP",
};

export const AP_CATEGORY_LABEL: Record<ApCategory, string> = {
  service_cost:        "ต้นทุนบริการ",
  advance_passthrough: "เงินทดรองจ่าย",
  refund_correction:   "เบิก/คืนเงิน และอื่นๆ",
};

/** Category pill colours (§0g self-explaining · §0h hierarchy). */
export const AP_CATEGORY_TONE: Record<ApCategory, string> = {
  service_cost:        "bg-blue-50 text-blue-700 border-blue-200",
  advance_passthrough: "bg-amber-50 text-amber-700 border-amber-200",
  refund_correction:   "bg-purple-50 text-purple-700 border-purple-200",
};

/** สถานะโอนเงิน — readable Thai + tone (dual-pill row, spec §4.1). */
export const AP_TRANSFER_STATUS: Record<
  ApTransferStatus,
  { label: string; tone: string }
> = {
  requested:     { label: "ต้องการเบิก",      tone: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  approved:      { label: "อนุมัติแล้ว รอโอน", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  transferred:   { label: "โอนแล้ว",           tone: "bg-green-50 text-green-700 border-green-200" },
  customer_paid: { label: "ลค.ชำระเอง",       tone: "bg-teal-50 text-teal-700 border-teal-200" },
  rejected:      { label: "ยกเลิก",            tone: "bg-gray-100 text-gray-500 border-gray-200" },
};

export const AP_RECEIPT_STATUS: Record<
  ApReceiptStatus,
  { label: string; tone: string }
> = {
  pending:        { label: "รอรับใบเสร็จ",       tone: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  received:       { label: "ได้รับใบเสร็จแล้ว",   tone: "bg-green-50 text-green-700 border-green-200" },
  customer_named: { label: "ใบเสร็จชื่อลูกค้า",   tone: "bg-amber-50 text-amber-700 border-amber-200" },
  na:             { label: "ไม่ต้องมีใบเสร็จ",    tone: "bg-gray-50 text-gray-500 border-gray-200" },
};

/** Next-action hint per transfer status (§0g "ให้พนักงานทำอะไร"). */
export const AP_NEXT_ACTION: Record<ApTransferStatus, string | null> = {
  requested:     "อนุมัติการเบิก",
  approved:      "บันทึกการโอน + แนบสลิป (Slice 2)",
  transferred:   null,
  customer_paid: null,
  rejected:      null,
};

// ════════════════════════════════════════════════════════════
// Row shapes (mirror the mig 0239 columns · normalized for the UI).
// ════════════════════════════════════════════════════════════

export type ApDisbursementRow = {
  id: string;
  batch_id: string | null;
  lane: ApLane;
  entity: ApEntity;
  shipment_no: string | null;
  quotation_no: string | null;
  invoice_no: string | null;
  receipt_no: string | null;
  container_no: string | null;
  customer_id: string | null;
  line_name: string | null;
  category: ApCategory;
  item_label: string;
  expense_category: string | null;
  note: string | null;
  is_customer_named_receipt: boolean;
  amount_withdraw: number;
  amount_refund: number;
  amount_gross: number | null;
  wht_pct: number | null;
  wht_cert_no: string | null;
  source_account_key: PacredAccountKey | null;
  payee_name: string | null;
  payee_account_no: string | null;
  payee_bank: string | null;
  pay_channel: string | null;
  transfer_status: ApTransferStatus;
  transferred_at: string | null;
  transfer_slip_path: string | null;
  receipt_status: ApReceiptStatus;
  requested_by: string | null;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  legacy_admin_id: string | null;
  created_at: string;
};

export type ApCentralFundRow = {
  id: string;
  fund_key: string;
  txn_date: string;
  item_label: string;
  amount_cny: number;
  fx_rate: number;
  amount_thb: number;
  split_thb: number | null;
  balance_cny: number | null;
  slip_th_path: string | null;
  slip_cn_path: string | null;
  note: string | null;
  created_at: string;
};

// ════════════════════════════════════════════════════════════
// PURE aggregate math (unit-tested — no DB).
// ════════════════════════════════════════════════════════════

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * The net money effect of a row = ยอดเบิก − ยอดคืน. A refund/correction row
 * (amount_refund > 0) reduces the net; a normal spend adds to it. Both the
 * per-group Σ and the page Σ are computed from this so they can never
 * double-count a refund as an outflow.
 */
export function rowNetAmount(r: Pick<ApDisbursementRow, "amount_withdraw" | "amount_refund">): number {
  return round2((Number(r.amount_withdraw) || 0) - (Number(r.amount_refund) || 0));
}

export type ApTotals = {
  count: number;
  withdrawSum: number;   // Σ ยอดเบิก
  refundSum: number;     // Σ ยอดคืน
  netSum: number;        // Σ (ยอดเบิก − ยอดคืน)
  serviceCostSum: number;    // Σ net where category = service_cost
  advanceSum: number;        // Σ net where category = advance_passthrough (NOT margin)
  refundCorrectionSum: number; // Σ net where category = refund_correction
};

/**
 * Fold a set of rows into the totals the surface footer shows (spec §4.1).
 * The ต้นทุนบริการ vs เงินทดรองจ่าย split is broken out because a pass-through
 * (advance) must be visibly kept out of cost/margin (gap #10).
 */
export function computeApTotals(rows: ApDisbursementRow[]): ApTotals {
  const t: ApTotals = {
    count: rows.length,
    withdrawSum: 0,
    refundSum: 0,
    netSum: 0,
    serviceCostSum: 0,
    advanceSum: 0,
    refundCorrectionSum: 0,
  };
  for (const r of rows) {
    const w = Number(r.amount_withdraw) || 0;
    const rf = Number(r.amount_refund) || 0;
    const net = w - rf;
    t.withdrawSum += w;
    t.refundSum += rf;
    t.netSum += net;
    if (r.category === "service_cost") t.serviceCostSum += net;
    else if (r.category === "advance_passthrough") t.advanceSum += net;
    else if (r.category === "refund_correction") t.refundCorrectionSum += net;
  }
  t.withdrawSum = round2(t.withdrawSum);
  t.refundSum = round2(t.refundSum);
  t.netSum = round2(t.netSum);
  t.serviceCostSum = round2(t.serviceCostSum);
  t.advanceSum = round2(t.advanceSum);
  t.refundCorrectionSum = round2(t.refundCorrectionSum);
  return t;
}

/** A group of rows sharing a SHIPMENT (spec §4.1 — like report-cnt groups by container). */
export type ApShipmentGroup = {
  /** SHIPMENT key, or a synthetic "(ไม่ระบุ SHIPMENT)" bucket for OPEX rows. */
  shipmentNo: string | null;
  rows: ApDisbursementRow[];
  totals: ApTotals;
};

/**
 * Group rows by SHIPMENT (nulls → one "no-shipment" bucket at the end),
 * newest-first within each group. Pure — the page renders the expandable
 * fan-out from this. Never double-counts (each row lands in exactly one group).
 */
export function groupByShipment(rows: ApDisbursementRow[]): ApShipmentGroup[] {
  const map = new Map<string, ApDisbursementRow[]>();
  const NULL_KEY = " __no_shipment__";
  for (const r of rows) {
    const key = r.shipment_no && r.shipment_no.trim() ? r.shipment_no.trim() : NULL_KEY;
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }
  const groups: ApShipmentGroup[] = [];
  for (const [key, groupRows] of map) {
    if (key === NULL_KEY) continue; // append the no-shipment bucket last
    groupRows.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
    groups.push({ shipmentNo: key, rows: groupRows, totals: computeApTotals(groupRows) });
  }
  // stable order by the group's most-recent requested_at
  groups.sort((a, b) => {
    const ai = a.rows[0]?.requested_at ?? "";
    const bi = b.rows[0]?.requested_at ?? "";
    return bi.localeCompare(ai);
  });
  const noShip = map.get(NULL_KEY);
  if (noShip && noShip.length > 0) {
    noShip.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
    groups.push({ shipmentNo: null, rows: noShip, totals: computeApTotals(noShip) });
  }
  return groups;
}

/**
 * Central-fund THB from ¥ × rate + the half-split (TTP↔PCS หาร2), server-side.
 * Never trust the client's ฿ / หาร2 — recompute from ¥ + เรท.
 */
export function computeCentralFundThb(amountCny: number, fxRate: number): {
  amountThb: number;
  splitThb: number;
} {
  const amountThb = round2((Number(amountCny) || 0) * (Number(fxRate) || 0));
  return { amountThb, splitThb: round2(amountThb / 2) };
}

// ════════════════════════════════════════════════════════════
// 3-account SOT — resolve the source Pacred (OUTFLOW) account.
// ════════════════════════════════════════════════════════════

/**
 * Resolve the source Pacred bank account for a disbursement row.
 * Prefers the stored `source_account_key`; falls back to the routing rule
 * (lib/payment/bank-accounts.ts) — an ออกใบกำกับ export lane pays out of
 * TRADING, a domestic-delivery/logistics lane out of LOGISTICS, else SERVICE.
 * Returns null only if there is nothing to resolve (never guesses silently).
 */
export function resolveApSourceAccount(
  row: Pick<ApDisbursementRow, "source_account_key" | "lane">,
): PacredBankAccount | null {
  if (row.source_account_key) {
    return PACRED_BANK_ACCOUNTS[row.source_account_key] ?? null;
  }
  // Fallback by lane semantics: export → ใบกำกับ (TRADING); truck/cargo domestic
  // legs → LOGISTICS; everything else → SERVICE. This is a display default only;
  // the stored key always wins.
  const issuesTaxInvoice = row.lane === "export";
  const isDomesticDeliveryLeg = row.lane === "truck" || row.lane === "cargo";
  return resolvePaymentAccount({ issuesTaxInvoice, isDomesticDeliveryLeg });
}

// ════════════════════════════════════════════════════════════
// DB READ helpers — plain async fns (take the admin client as an arg).
// These NEVER touch any existing money table (spec §5). READ-only.
// ════════════════════════════════════════════════════════════

const AP_SELECT =
  "id,batch_id,lane,entity,shipment_no,quotation_no,invoice_no,receipt_no,container_no," +
  "customer_id,line_name,category,item_label,expense_category,note,is_customer_named_receipt," +
  "amount_withdraw,amount_refund,amount_gross,wht_pct,wht_cert_no,source_account_key," +
  "payee_name,payee_account_no,payee_bank,pay_channel,transfer_status,transferred_at," +
  "transfer_slip_path,receipt_status,requested_by,requested_at,approved_by,approved_at," +
  "legacy_admin_id,created_at";

export type ApListFilters = {
  lane?: ApLane;
  entity?: ApEntity;
  transferStatus?: ApTransferStatus;
  /** free-text — matches SHIPMENT / QO / payee / item / customer / line_name. */
  search?: string;
  /** requested_at range (YYYY-MM-DD, inclusive). */
  start?: string;
  end?: string;
  limit?: number;
};

function normalizeApRow(raw: Record<string, unknown>): ApDisbursementRow {
  const n = (v: unknown) => Number(v ?? 0);
  const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(raw.id),
    batch_id: s(raw.batch_id),
    lane: raw.lane as ApLane,
    entity: (raw.entity as ApEntity) ?? "pacred",
    shipment_no: s(raw.shipment_no),
    quotation_no: s(raw.quotation_no),
    invoice_no: s(raw.invoice_no),
    receipt_no: s(raw.receipt_no),
    container_no: s(raw.container_no),
    customer_id: s(raw.customer_id),
    line_name: s(raw.line_name),
    category: raw.category as ApCategory,
    item_label: String(raw.item_label ?? ""),
    expense_category: s(raw.expense_category),
    note: s(raw.note),
    is_customer_named_receipt: Boolean(raw.is_customer_named_receipt),
    amount_withdraw: n(raw.amount_withdraw),
    amount_refund: n(raw.amount_refund),
    amount_gross: nn(raw.amount_gross),
    wht_pct: nn(raw.wht_pct),
    wht_cert_no: s(raw.wht_cert_no),
    source_account_key: (s(raw.source_account_key) as PacredAccountKey | null),
    payee_name: s(raw.payee_name),
    payee_account_no: s(raw.payee_account_no),
    payee_bank: s(raw.payee_bank),
    pay_channel: s(raw.pay_channel),
    transfer_status: (raw.transfer_status as ApTransferStatus) ?? "requested",
    transferred_at: s(raw.transferred_at),
    transfer_slip_path: s(raw.transfer_slip_path),
    receipt_status: (raw.receipt_status as ApReceiptStatus) ?? "pending",
    requested_by: s(raw.requested_by),
    requested_at: String(raw.requested_at ?? raw.created_at ?? ""),
    approved_by: s(raw.approved_by),
    approved_at: s(raw.approved_at),
    legacy_admin_id: s(raw.legacy_admin_id),
    created_at: String(raw.created_at ?? ""),
  };
}

/**
 * List disbursement rows for the AP list surface (READ-only). Destructures
 * `error` per §0c; returns [] + logs on failure so the page renders an error
 * banner rather than a silent 404. NO write, NO existing-money-table read.
 */
export async function listApDisbursements(
  admin: SupabaseClient,
  filters: ApListFilters = {},
): Promise<{ rows: ApDisbursementRow[]; error: string | null }> {
  let q = admin
    .from("ap_disbursement")
    .select(AP_SELECT)
    .order("requested_at", { ascending: false })
    .limit(filters.limit ?? 1000);

  if (filters.lane) q = q.eq("lane", filters.lane);
  if (filters.entity) q = q.eq("entity", filters.entity);
  if (filters.transferStatus) q = q.eq("transfer_status", filters.transferStatus);
  if (filters.start) q = q.gte("requested_at", filters.start);
  if (filters.end) q = q.lte("requested_at", filters.end + "T23:59:59");
  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim().replace(/[%,]/g, " ");
    q = q.or(
      [
        `shipment_no.ilike.%${term}%`,
        `quotation_no.ilike.%${term}%`,
        `payee_name.ilike.%${term}%`,
        `item_label.ilike.%${term}%`,
        `customer_id.ilike.%${term}%`,
        `line_name.ilike.%${term}%`,
      ].join(","),
    );
  }

  const { data, error } = await q;
  if (error) {
    console.error("[ap-disbursement list] failed", { code: error.code, message: error.message });
    return { rows: [], error: error.message };
  }
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeApRow);
  return { rows, error: null };
}

/** Fetch a single disbursement row for the detail surface (READ-only). */
export async function getApDisbursement(
  admin: SupabaseClient,
  id: string,
): Promise<{ row: ApDisbursementRow | null; error: string | null }> {
  const { data, error } = await admin
    .from("ap_disbursement")
    .select(AP_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[ap-disbursement get] failed", { code: error.code, message: error.message });
    return { row: null, error: error.message };
  }
  if (!data) return { row: null, error: null };
  return { row: normalizeApRow(data as unknown as Record<string, unknown>), error: null };
}

/** List central-fund rows for the imprest-float surface (READ-only). */
export async function listApCentralFund(
  admin: SupabaseClient,
  opts: { fundKey?: string; start?: string; end?: string; limit?: number } = {},
): Promise<{ rows: ApCentralFundRow[]; error: string | null }> {
  let q = admin
    .from("ap_central_fund")
    .select(
      "id,fund_key,txn_date,item_label,amount_cny,fx_rate,amount_thb,split_thb," +
        "balance_cny,slip_th_path,slip_cn_path,note,created_at",
    )
    .order("txn_date", { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.fundKey) q = q.eq("fund_key", opts.fundKey);
  if (opts.start) q = q.gte("txn_date", opts.start);
  if (opts.end) q = q.lte("txn_date", opts.end);

  const { data, error } = await q;
  if (error) {
    console.error("[ap-central-fund list] failed", { code: error.code, message: error.message });
    return { rows: [], error: error.message };
  }
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((raw) => ({
    id: String(raw.id),
    fund_key: String(raw.fund_key ?? "china_warehouse"),
    txn_date: String(raw.txn_date ?? ""),
    item_label: String(raw.item_label ?? ""),
    amount_cny: Number(raw.amount_cny ?? 0),
    fx_rate: Number(raw.fx_rate ?? 0),
    amount_thb: Number(raw.amount_thb ?? 0),
    split_thb: raw.split_thb === null || raw.split_thb === undefined ? null : Number(raw.split_thb),
    balance_cny: raw.balance_cny === null || raw.balance_cny === undefined ? null : Number(raw.balance_cny),
    slip_th_path: raw.slip_th_path === null || raw.slip_th_path === undefined ? null : String(raw.slip_th_path),
    slip_cn_path: raw.slip_cn_path === null || raw.slip_cn_path === undefined ? null : String(raw.slip_cn_path),
    note: raw.note === null || raw.note === undefined ? null : String(raw.note),
    created_at: String(raw.created_at ?? ""),
  })) as ApCentralFundRow[];
  return { rows, error: null };
}
