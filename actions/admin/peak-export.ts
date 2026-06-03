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

export type PeakExportBundle = {
  receipts:           ReceiptExportRow[];
  bills:              BillExportRow[];
  saleBatches:        CommBatchExportRow[];
  interpreterBatches: CommBatchExportRow[];
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
// Public entry — load everything in parallel
// ────────────────────────────────────────────────────────────────────────

export async function getPeakExportBundle(
  range: PeakExportRange,
): Promise<PeakExportBundle> {
  const admin = createAdminClient();
  const [receipts, bills, saleBatches, interpreterBatches] = await Promise.all([
    loadReceipts(admin, range),
    loadBills(admin, range),
    loadCommBatches(admin, "tb_withdraw_comm_sale_h",        "sale",        range),
    loadCommBatches(admin, "tb_withdraw_comm_interpreter_h", "interpreter", range),
  ]);
  return { receipts, bills, saleBatches, interpreterBatches };
}
