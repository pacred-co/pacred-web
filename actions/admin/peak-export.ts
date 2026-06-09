"use server";

/**
 * actions/admin/peak-export.ts — PEAK / FlowAccount CSV export reader.
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.5 (PEAK module sub-surface) —
 * Pacred has the complete AR/AP ledger sitting in `tb_receipt` + `tb_bill` +
 * `tb_withdraw_comm_{sale,interpreter}_*`; accountants need it as CSV they
 * can import into PEAK / FlowAccount / Excel for reconciliation.
 *
 * 4 datasets exposed (one CSV download per dataset):
 *   1. รับชำระเงิน (Receipts) ← tb_receipt + tb_users hydration
 *   2. ใบรวมบิล (Combine bills) ← tb_bill + per-bill item count
 *   3. เบิกค่าคอม Sales batches ← tb_withdraw_comm_sale_h
 *   4. เบิกค่าคอมล่าม batches ← tb_withdraw_comm_interpreter_h
 *
 * Date range is required (defaults to current month at the page level). All
 * queries scope by `date`/`issuedate` field in the matching table; rows
 * returned are pure-read aggregations suitable for export.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessConfig } from "@/lib/business-config";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export type PeakExportRange = {
  dateFrom: string;
  dateTo:   string;
};

export type ReceiptExportRow = {
  rid:                    string;
  rdate:                  string | null;
  issuedate:              string | null;
  userid:                 string;
  customerName:           string;
  taxId:                  string;
  corporateType:          string;
  ramount:                number;
  totalBeforeWithholding: number;
  wht:                    number;
  rstatus:                string;
};

export type BillExportRow = {
  billid:        number;
  date:          string | null;
  adminid:       string;
  printstatus:   string;
  itemCount:     number;
};

export type CommBatchExportRow = {
  id:             number;
  kind:           "sale" | "interpreter";
  date:           string | null;
  dateupdate:     string | null;
  payee:          string;
  title:          string;
  commbefore:     number;
  withholding:    number;
  amount:         number;
  status:         string;
  imagesslip:     string;
  nameuserbank:   string;
  nouserbank:     string;
};

// ── W9 (tax-invoice P4) — CARGO tax-doc job 3-number rollup ──────────────
// One row per tb_cargo_taxdoc_job: the SELLING / COST / DECLARED triple +
// per-number GL account placeholders (config-driven). This is the PEAK CSV
// structure for the 3-number model. The GL account CODES come from the
// accountant (business_config peak.gl_accounts) — until they supply real
// chart-of-accounts codes the map is empty and the export flags it.
export type TaxDocRollupRow = {
  jobId:        string;
  source:       "forwarder" | "shop";
  orderRef:     string;            // #fid or hno
  userid:       string;
  cabinetNo:    string;
  docMode:      string;
  selling:      number;            // SELLING — AR / revenue (→ ใบกำกับ + VAT)
  cost:         number;            // COST — stock-in / COGS (→ PEAK)
  declared:     number;            // DECLARED — customs สำแดง (→ ใบขนรวม · memo)
  grossProfit:  number;            // selling − cost (display)
  csStatus:     string;
  pricingStatus:string;
  docsStatus:   string;
  accountStatus:string;
  glSelling:    string;            // GL account code (placeholder until accountant supplies)
  glCost:       string;
  glDeclared:   string;
};

/** PEAK GL chart-of-accounts map (config-driven). Real codes come from the
 *  accountant; until seeded these are empty + the export carries a flag. */
export type PeakGlAccounts = {
  selling:  string;   // revenue / AR account
  cost:     string;   // COGS / stock-in account
  declared: string;   // (memo only — no GL posting for declared value)
  pending:  boolean;  // true = accountant has NOT supplied real codes yet
};

export type PeakExportBundle = {
  receipts:           ReceiptExportRow[];
  bills:              BillExportRow[];
  saleBatches:        CommBatchExportRow[];
  interpreterBatches: CommBatchExportRow[];
  // W9 — CARGO 3-number rollup + the GL map (flagged pending real codes).
  taxDocRollup:       TaxDocRollupRow[];
  glAccounts:         PeakGlAccounts;
};

// ────────────────────────────────────────────────────────────────────────
// 1. Receipts — tb_receipt + tb_users hydration
// ────────────────────────────────────────────────────────────────────────

async function loadReceipts(
  admin: ReturnType<typeof createAdminClient>,
  range: PeakExportRange,
): Promise<ReceiptExportRow[]> {
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;

  type RawReceipt = {
    rid:                    string;
    rdate:                  string | null;
    issuedate:              string | null;
    userid:                 string;
    ramount:                number | string | null;
    totalbeforewithholding: number | string | null;
    rstatus:                string;
    corporatetype:          string | null;
    recompnumber:           string | null;
    recompname:             string | null;
  };
  const { data: rawRows, error: rowsErr } = await admin
    .from("tb_receipt")
    .select(
      "rid, rdate, issuedate, userid, ramount, totalbeforewithholding, rstatus, corporatetype, recompnumber, recompname",
    )
    .gte("issuedate", gte)
    .lte("issuedate", lte)
    .order("issuedate", { ascending: false })
    .limit(20_000);
  if (rowsErr) {
    console.error("[peak-export tb_receipt] failed", { code: rowsErr.code, message: rowsErr.message });
  }
  const rows = (rawRows ?? []) as RawReceipt[];

  // Hydrate customer names for rows missing recompname (personal customers).
  const userIdsNeedingName = Array.from(
    new Set(rows.filter((r) => !r.recompname).map((r) => r.userid)),
  );
  type UserRow = { userID: string; userName: string | null; userLastName: string | null };
  let userByID = new Map<string, UserRow>();
  if (userIdsNeedingName.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", userIdsNeedingName);
    if (usersErr) {
      console.error("[peak-export tb_users] failed", { code: usersErr.code, message: usersErr.message });
    }
    userByID = new Map(((usersRaw ?? []) as unknown as UserRow[]).map((u) => [u.userID, u]));
  }

  return rows.map((r) => {
    const ramount     = Number(r.ramount ?? 0);
    const totalBefore = Number(r.totalbeforewithholding ?? 0);
    const wht         = Math.max(0, totalBefore - ramount);
    const u           = !r.recompname ? userByID.get(r.userid) : undefined;
    const personalName = u ? [u.userName, u.userLastName].filter(Boolean).join(" ").trim() : "";
    const customerName = r.recompname?.trim() || personalName || r.userid;
    return {
      rid:                    r.rid,
      rdate:                  r.rdate,
      issuedate:              r.issuedate,
      userid:                 r.userid,
      customerName,
      taxId:                  r.recompnumber ?? "",
      corporateType:          r.corporatetype === "1" ? "นิติบุคคล" : r.corporatetype === "2" ? "ทั่วไป" : "",
      ramount,
      totalBeforeWithholding: totalBefore,
      wht,
      rstatus:                r.rstatus,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// 2. Combine bills — tb_bill + per-bill item count
// ────────────────────────────────────────────────────────────────────────

async function loadBills(
  admin: ReturnType<typeof createAdminClient>,
  range: PeakExportRange,
): Promise<BillExportRow[]> {
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;

  type RawBill = { billid: number; date: string | null; adminid: string; printstatus: string };
  const { data: billsRaw, error: billsErr } = await admin
    .from("tb_bill")
    .select("billid, date, adminid, printstatus")
    .gte("date", gte)
    .lte("date", lte)
    .order("date", { ascending: false })
    .limit(20_000);
  if (billsErr) {
    console.error("[peak-export tb_bill] failed", { code: billsErr.code, message: billsErr.message });
  }
  const bills = (billsRaw ?? []) as RawBill[];

  // Item-count per billid (batched single query)
  type ItemCountRow = { billid: number };
  const billIds = bills.map((b) => b.billid);
  const itemCount = new Map<number, number>();
  if (billIds.length > 0) {
    const { data: itemsRaw, error: itemsErr } = await admin
      .from("tb_bill_item")
      .select("billid")
      .in("billid", billIds);
    if (itemsErr) {
      console.error("[peak-export tb_bill_item] failed", { code: itemsErr.code, message: itemsErr.message });
    }
    for (const r of ((itemsRaw ?? []) as unknown as ItemCountRow[])) {
      itemCount.set(r.billid, (itemCount.get(r.billid) ?? 0) + 1);
    }
  }

  return bills.map((b) => ({
    billid:      b.billid,
    date:        b.date,
    adminid:     b.adminid,
    printstatus: b.printstatus,
    itemCount:   itemCount.get(b.billid) ?? 0,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// 3 + 4. Commission batches — both kinds use identical header shape
// ────────────────────────────────────────────────────────────────────────

async function loadCommBatches(
  admin: ReturnType<typeof createAdminClient>,
  table: "tb_withdraw_comm_sale_h" | "tb_withdraw_comm_interpreter_h",
  kind:  "sale" | "interpreter",
  range: PeakExportRange,
): Promise<CommBatchExportRow[]> {
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;

  type RawHeader = {
    id: number;
    date: string | null;
    dateupdate: string | null;
    adminid: string;
    title: string;
    commbefore: number | string | null;
    withholding: number | string | null;
    amount: number | string | null;
    status: string;
    imagesslip: string;
    nameuserbank: string;
    nouserbank: string;
  };
  const { data: raw, error } = await admin
    .from(table)
    .select(
      "id, date, dateupdate, adminid, title, commbefore, withholding, amount, status, imagesslip, nameuserbank, nouserbank",
    )
    .gte("date", gte)
    .lte("date", lte)
    .order("date", { ascending: false })
    .limit(10_000);
  if (error) {
    console.error(`[peak-export ${table}] failed`, { code: error.code, message: error.message });
  }
  return ((raw ?? []) as RawHeader[]).map((r) => ({
    id:             r.id,
    kind,
    date:           r.date,
    dateupdate:     r.dateupdate,
    payee:          r.adminid,
    title:          r.title,
    commbefore:     Number(r.commbefore ?? 0),
    withholding:    Number(r.withholding ?? 0),
    amount:         Number(r.amount ?? 0),
    status:         r.status,
    imagesslip:     r.imagesslip,
    nameuserbank:   r.nameuserbank,
    nouserbank:     r.nouserbank,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// 5. W9 — CARGO tax-doc job 3-number rollup (SELLING / COST / DECLARED).
//    Reads tb_cargo_taxdoc_job + each job's source order numbers. This is the
//    PEAK CSV structure for the 3-number model. SELLING ≠ COST ≠ DECLARED —
//    the three are read from their authoritative sources, never auto-equalled.
// ────────────────────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v) || 0;
}
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

async function loadTaxDocRollup(
  admin: ReturnType<typeof createAdminClient>,
  range: PeakExportRange,
  gl: PeakGlAccounts,
): Promise<TaxDocRollupRow[]> {
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;

  type JobRow = {
    id: string; fid: number | null; hno: string | null; doc_mode: string;
    cs_status: string; pricing_status: string; docs_status: string; account_status: string;
    cabinet_no: string | null;
  };
  const { data: jobsRaw, error: jobsErr } = await admin
    .from("tb_cargo_taxdoc_job")
    .select("id, fid, hno, doc_mode, cs_status, pricing_status, docs_status, account_status, cabinet_no, created_at")
    .gte("created_at", gte)
    .lte("created_at", lte)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (jobsErr) {
    console.error("[peak-export tb_cargo_taxdoc_job] failed", { code: jobsErr.code, message: jobsErr.message });
  }
  const jobs = (jobsRaw ?? []) as unknown as JobRow[];
  if (jobs.length === 0) return [];

  // Batch-read the forwarder + shop headers + the per-line cost/declared sums.
  const fids = jobs.filter((j) => j.fid != null).map((j) => j.fid!);
  const hnos = jobs.filter((j) => j.hno != null).map((j) => j.hno!);

  // Forwarder headers (SELLING ftotalprice · COST header fcosttotalprice).
  const fwdById = new Map<number, { userid: string | null; ftotalprice: number; fcosttotalprice: number; cabinet: string | null }>();
  if (fids.length > 0) {
    const { data: fwds, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fcabinetnumber, ftotalprice, fcosttotalprice")
      .in("id", fids);
    if (fwdErr) console.error("[peak-export taxdoc fwd] failed", { code: fwdErr.code, message: fwdErr.message });
    for (const f of (fwds ?? []) as Array<{ id: number; userid: string | null; fcabinetnumber: string | null; ftotalprice: number | string | null; fcosttotalprice: number | string | null }>) {
      fwdById.set(f.id, { userid: f.userid, ftotalprice: num(f.ftotalprice), fcosttotalprice: num(f.fcosttotalprice), cabinet: f.fcabinetnumber?.trim() || null });
    }
  }
  // Forwarder per-line cost (fallback) + declared sums.
  const fwdLineSums = new Map<number, { lineCost: number; declared: number }>();
  if (fids.length > 0) {
    const { data: items, error: itErr } = await admin
      .from("tb_forwarder_item")
      .select("fid, productqty, cost_unit_thb, declared_value_thb")
      .in("fid", fids)
      .limit(20_000);
    if (itErr) console.error("[peak-export taxdoc fwd items] failed", { code: itErr.code, message: itErr.message });
    for (const it of (items ?? []) as Array<{ fid: number; productqty: number | string | null; cost_unit_thb: number | string | null; declared_value_thb: number | string | null }>) {
      const cur = fwdLineSums.get(it.fid) ?? { lineCost: 0, declared: 0 };
      const qty = Math.max(0, num(it.productqty));
      cur.lineCost += num(it.cost_unit_thb) * (qty > 0 ? qty : 1);
      cur.declared += num(it.declared_value_thb);
      fwdLineSums.set(it.fid, cur);
    }
  }

  // Shop headers (SELLING htotalpriceuser · COST htotalpricechn fallback).
  const hdrByHno = new Map<string, { userid: string | null; htotalpriceuser: number; htotalpricechn: number }>();
  if (hnos.length > 0) {
    const { data: hdrs, error: hdrErr } = await admin
      .from("tb_header_order")
      .select("hno, userid, htotalpriceuser, htotalpricechn")
      .in("hno", hnos);
    if (hdrErr) console.error("[peak-export taxdoc hdr] failed", { code: hdrErr.code, message: hdrErr.message });
    for (const h of (hdrs ?? []) as Array<{ hno: string; userid: string | null; htotalpriceuser: number | string | null; htotalpricechn: number | string | null }>) {
      hdrByHno.set(h.hno, { userid: h.userid, htotalpriceuser: num(h.htotalpriceuser), htotalpricechn: num(h.htotalpricechn) });
    }
  }
  // Shop per-line cost (THB) + declared sums.
  const shopLineSums = new Map<string, { lineCost: number; declared: number }>();
  if (hnos.length > 0) {
    const { data: orders, error: ordErr } = await admin
      .from("tb_order")
      .select("hno, orderqty, cost_unit_cny, cost_rate_cny, declared_value_thb")
      .in("hno", hnos)
      .limit(20_000);
    if (ordErr) console.error("[peak-export taxdoc orders] failed", { code: ordErr.code, message: ordErr.message });
    for (const o of (orders ?? []) as Array<{ hno: string; orderqty: number | string | null; cost_unit_cny: number | string | null; cost_rate_cny: number | string | null; declared_value_thb: number | string | null }>) {
      const cur = shopLineSums.get(o.hno) ?? { lineCost: 0, declared: 0 };
      const qty = Math.max(0, num(o.orderqty));
      const rate = num(o.cost_rate_cny);
      cur.lineCost += num(o.cost_unit_cny) * (qty > 0 ? qty : 1) * (rate > 0 ? rate : 1);
      cur.declared += num(o.declared_value_thb);
      shopLineSums.set(o.hno, cur);
    }
  }

  return jobs.map((j) => {
    let userid = ""; let selling = 0; let cost = 0; let declared = 0; let cabinet = j.cabinet_no ?? "";
    let source: "forwarder" | "shop" = "forwarder"; let orderRef = "";
    if (j.fid != null) {
      source = "forwarder"; orderRef = `#${j.fid}`;
      const h = fwdById.get(j.fid);
      const ls = fwdLineSums.get(j.fid) ?? { lineCost: 0, declared: 0 };
      userid = h?.userid ?? "";
      cabinet = cabinet || (h?.cabinet ?? "");
      selling = h?.ftotalprice ?? 0;
      cost = (h?.fcosttotalprice ?? 0) > 0 ? (h?.fcosttotalprice ?? 0) : ls.lineCost;
      declared = ls.declared;
    } else if (j.hno != null) {
      source = "shop"; orderRef = j.hno;
      const h = hdrByHno.get(j.hno);
      const ls = shopLineSums.get(j.hno) ?? { lineCost: 0, declared: 0 };
      userid = h?.userid ?? "";
      selling = h?.htotalpriceuser ?? 0;
      cost = ls.lineCost > 0 ? ls.lineCost : (h?.htotalpricechn ?? 0);
      declared = ls.declared;
    }
    selling = r2(selling); cost = r2(cost); declared = r2(declared);
    return {
      jobId: j.id,
      source,
      orderRef,
      userid,
      cabinetNo: cabinet,
      docMode: j.doc_mode,
      selling, cost, declared,
      grossProfit: r2(selling - cost),
      csStatus: j.cs_status,
      pricingStatus: j.pricing_status,
      docsStatus: j.docs_status,
      accountStatus: j.account_status,
      glSelling: gl.selling,
      glCost: gl.cost,
      glDeclared: gl.declared,
    } satisfies TaxDocRollupRow;
  });
}

// ────────────────────────────────────────────────────────────────────────
// Public entry — load everything in parallel
// ────────────────────────────────────────────────────────────────────────

export async function getPeakExportBundle(
  range: PeakExportRange,
): Promise<PeakExportBundle> {
  const admin = createAdminClient();

  // GL account map — config-driven; accountant supplies real chart-of-accounts
  // codes via business_config `peak.gl_accounts`. Until then the map is empty
  // and `pending` flags the export ("รหัสบัญชี GL รอนักบัญชี").
  const gl = await getBusinessConfig<PeakGlAccounts>("peak.gl_accounts", {
    selling: "", cost: "", declared: "", pending: true,
  });

  const [receipts, bills, saleBatches, interpreterBatches, taxDocRollup] = await Promise.all([
    loadReceipts(admin, range),
    loadBills(admin, range),
    loadCommBatches(admin, "tb_withdraw_comm_sale_h",        "sale",        range),
    loadCommBatches(admin, "tb_withdraw_comm_interpreter_h", "interpreter", range),
    loadTaxDocRollup(admin, range, gl),
  ]);
  return { receipts, bills, saleBatches, interpreterBatches, taxDocRollup, glAccounts: gl };
}
