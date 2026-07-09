"use server";

/**
 * actions/admin/withdraw-comm-batch.ts — list + detail readers for the
 * legacy monthly batch-payout system (per `docs/briefs/poom-wave-2026-06-01.md` §2).
 *
 * Two PARALLEL flows that share an identical header shape but differ on the
 * link table + per-item math:
 *
 *   SALE-rep batch (`tb_withdraw_comm_sale_h` × 25 batches · `_item` × 3,204)
 *     Per item: tb_forwarder by fid; commission = Σ(fTotalPriceNetAll) × 1%.
 *     Legacy reference: `pcs-admin/withdraw-commission-sale.php` +
 *     `pcs-admin/include/pages/withdraw-commission-sale/{home,add}.php`.
 *
 *   INTERPRETER batch (`tb_withdraw_comm_interpreter_h` × 46 · `_item` × 2,947)
 *     Per item: tb_header_order by hno + `diffyaun` (yuan margin); commission =
 *     Σ(diffyaun) × `tb_set_comm_interpreter.perCom` (per-interpreter %).
 *
 * Both share the header shape (per 0081 L6434/L6528):
 *   id · date · dateupdate · title · amount · commbefore · withholding ·
 *   status (1=draft · 2=pending · 3=paid) · adminidcreate · adminidupdate ·
 *   namebank · nameuserbank · nouserbank · imagesslip · adminid (= the
 *   sales-rep or interpreter that owns the batch).
 *
 * Bank source: `tb_account_pcs` (98 company accounts · 0081 L338) — pay-FROM
 * account chosen at create time. (Joined on `namebank` text key per legacy
 * convention.)
 *
 * Status legend — VERIFIED from legacy source (withdraw-commission-sale/
 * home.php case '1'/'3' + detail.php badges · 2026-07-09):
 *   '1' = รอดำเนินการ (created · awaiting slip + pay-out · badge-warning)
 *   '2' = จ่ายแล้ว (slip attached · paid out · badge-success)
 *   '3' = ไม่สำเร็จ (failed · e.g. item-insert rollback · badge-danger)
 *
 * READ surface (list + detail): getBatchList + getBatchDetail below.
 *
 * WRITE surface (2026-07-09 · faithful-port BUILD from PCS source):
 *   listCommPayAccounts · listCommissionPayees · getSaleBatchEligible ·
 *   getInterpreterBatchEligible · createSaleCommBatch ·
 *   createInterpreterCommBatch · payCommBatch — see the "═ WRITE" block.
 *   Legacy source verified line-by-line (see per-function headers):
 *     pcs-admin/withdraw-commission-{sale,interpreter}.php (dispatcher) +
 *     include/pages/withdraw-commission-{sale,interpreter}/{add,listPay*}.php
 *
 * `tb_*` is RLS service-role-only → all reads via `createAdminClient()`.
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { uploadToBucket } from "@/lib/storage/upload";
import {
  computeCommission,
  sumGross,
  SALES_WHT_RATE,
} from "@/lib/sales-commission/calc";

// ────────────────────────────────────────────────────────────────────────
// Public types — shared between sale + interpreter UIs
// ────────────────────────────────────────────────────────────────────────

export type BatchKind = "sale" | "interpreter";

export type BatchHeaderRow = {
  id:              number;
  date:            string | null;
  dateupdate:      string | null;
  title:           string;
  amount:          number;       // net paid (after withholding)
  commbefore:      number;       // commission before WHT
  withholding:     number;       // WHT amount deducted
  status:          string;       // '1' | '2' | '3'
  adminid:         string;       // the payee (rep or interpreter)
  adminidcreate:   string;
  adminidupdate:   string;
  namebank:        string;       // FK to tb_account_pcs (text join key)
  nameuserbank:    string;       // payee bank name (for display)
  nouserbank:      string;       // payee account number
  imagesslip:      string;       // slip filename (empty until status=3)
};

export type BatchListResult = {
  kind:      BatchKind;
  rows:      BatchHeaderRow[];
  counts:    Record<string, number>; // by status
  sumAmount: number;
};

export type BatchSaleItem = {
  id:           number;
  fid:          number;
  forwarder: {
    fid:                string | null; // legacy doc-id (e.g. FW-...)
    fdetail:            string | null;
    ftrackingchn:       string | null;
    fvolume:            number;
    fweight:            number;
    fcosttotalprice:    number;
    ftotalprice:        number;
    fdiscount:          number;
    fstatus:            string | null;
    fdate:              string | null;
  } | null;
};

export type BatchInterpreterItem = {
  id:        number;
  hno:       string;
  diffyaun:  number;
  order: {
    hdate:        string | null;
    hstatus:      string | null;
    userid:       string | null;
  } | null;
};

export type BatchDetail =
  | { kind: "sale";        header: BatchHeaderRow; items: BatchSaleItem[];       totals: { itemCount: number; itemSum: number; salePriceCHN: number } }
  | { kind: "interpreter"; header: BatchHeaderRow; items: BatchInterpreterItem[]; totals: { itemCount: number; itemSum: number; yuanMargin: number } };

// ────────────────────────────────────────────────────────────────────────
// Internal — table picker
// ────────────────────────────────────────────────────────────────────────

const TABLES = {
  sale: {
    header: "tb_withdraw_comm_sale_h" as const,
    item:   "tb_withdraw_comm_sale_item" as const,
    itemFK: "wcsid" as const,
  },
  interpreter: {
    header: "tb_withdraw_comm_interpreter_h" as const,
    item:   "tb_withdraw_comm_interpreter_item" as const,
    itemFK: "wciid" as const,
  },
} as const;

// ────────────────────────────────────────────────────────────────────────
// 1. LIST — getBatchList(kind, filters)
// ────────────────────────────────────────────────────────────────────────

export async function getBatchList(opts: {
  kind:       BatchKind;
  status?:    string;       // '1' | '2' | '3' | undefined (= all)
  adminId?:   string;       // filter by payee adminID
  dateFrom?:  string;       // ISO date (YYYY-MM-DD)
  dateTo?:    string;       // ISO date (YYYY-MM-DD)
  limit?:     number;
}): Promise<BatchListResult> {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const admin = createAdminClient();
  const t = TABLES[opts.kind];

  let q = admin
    .from(t.header)
    .select(
      "id, date, dateupdate, title, amount, commbefore, withholding, status, " +
      "adminid, adminidcreate, adminidupdate, namebank, nameuserbank, nouserbank, imagesslip",
    )
    .order("date", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status)   q = q.eq("status", opts.status);
  if (opts.adminId)  q = q.eq("adminid", opts.adminId);
  if (opts.dateFrom) q = q.gte("date", `${opts.dateFrom}T00:00:00`);
  if (opts.dateTo)   q = q.lte("date", `${opts.dateTo}T23:59:59`);

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error(`[${t.header} list] failed`, { code: error.code, message: error.message });
  }
  type RawRow = {
    id: number;
    date: string | null;
    dateupdate: string | null;
    title: string;
    amount: number | string | null;
    commbefore: number | string | null;
    withholding: number | string | null;
    status: string;
    adminid: string;
    adminidcreate: string;
    adminidupdate: string;
    namebank: string;
    nameuserbank: string;
    nouserbank: string;
    imagesslip: string;
  };
  const rows: BatchHeaderRow[] = ((rowsRaw ?? []) as unknown as RawRow[]).map((r) => ({
    id:             r.id,
    date:           r.date,
    dateupdate:     r.dateupdate,
    title:          r.title,
    amount:         Number(r.amount ?? 0),
    commbefore:     Number(r.commbefore ?? 0),
    withholding:    Number(r.withholding ?? 0),
    status:         r.status,
    adminid:        r.adminid,
    adminidcreate:  r.adminidcreate,
    adminidupdate:  r.adminidupdate,
    namebank:       r.namebank,
    nameuserbank:   r.nameuserbank,
    nouserbank:     r.nouserbank,
    imagesslip:     r.imagesslip,
  }));

  // Counts — separate query (small tables, one extra round-trip is fine)
  const { data: countRowsRaw, error: countErr } = await admin
    .from(t.header)
    .select("status");
  if (countErr) {
    console.error(`[${t.header} counts] failed`, { code: countErr.code, message: countErr.message });
  }
  const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
  for (const r of ((countRowsRaw ?? []) as Array<{ status: string }>)) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  const sumAmount = rows.reduce((s, r) => s + r.amount, 0);

  return { kind: opts.kind, rows, counts, sumAmount };
}

// ────────────────────────────────────────────────────────────────────────
// 2. DETAIL — getBatchDetail(kind, id)
// ────────────────────────────────────────────────────────────────────────

export async function getBatchDetail(
  kind: BatchKind,
  id:   number,
): Promise<BatchDetail | null> {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  if (!Number.isInteger(id) || id <= 0) return null;
  const admin = createAdminClient();
  const t = TABLES[kind];

  // ── Header ──
  const { data: headRaw, error: headErr } = await admin
    .from(t.header)
    .select(
      "id, date, dateupdate, title, amount, commbefore, withholding, status, " +
      "adminid, adminidcreate, adminidupdate, namebank, nameuserbank, nouserbank, imagesslip",
    )
    .eq("id", id)
    .maybeSingle();
  if (headErr) {
    console.error(`[${t.header} detail] failed`, { code: headErr.code, message: headErr.message });
    return null;
  }
  if (!headRaw) return null;
  type RawH = {
    id: number; date: string | null; dateupdate: string | null;
    title: string; amount: number | string | null;
    commbefore: number | string | null; withholding: number | string | null;
    status: string;
    adminid: string; adminidcreate: string; adminidupdate: string;
    namebank: string; nameuserbank: string; nouserbank: string; imagesslip: string;
  };
  const h = headRaw as unknown as RawH;
  const header: BatchHeaderRow = {
    id:             h.id,
    date:           h.date,
    dateupdate:     h.dateupdate,
    title:          h.title,
    amount:         Number(h.amount ?? 0),
    commbefore:     Number(h.commbefore ?? 0),
    withholding:    Number(h.withholding ?? 0),
    status:         h.status,
    adminid:        h.adminid,
    adminidcreate:  h.adminidcreate,
    adminidupdate:  h.adminidupdate,
    namebank:       h.namebank,
    nameuserbank:   h.nameuserbank,
    nouserbank:     h.nouserbank,
    imagesslip:     h.imagesslip,
  };

  if (kind === "sale") {
    // ── SALE items: tb_withdraw_comm_sale_item by wcsid → tb_forwarder by fid ──
    const { data: itemRaw, error: itemErr } = await admin
      .from(t.item)
      .select("id, fid")
      .eq(t.itemFK, id);
    if (itemErr) {
      console.error(`[${t.item} list] failed`, { code: itemErr.code, message: itemErr.message });
    }
    const itemRows = (itemRaw ?? []) as Array<{ id: number; fid: number }>;
    const fIds = Array.from(new Set(itemRows.map((i) => i.fid)));

    type FwdRow = {
      id: number; fid: string | null;
      fdetail: string | null; ftrackingchn: string | null;
      fvolume: number | string | null; fweight: number | string | null;
      fcosttotalprice: number | string | null; ftotalprice: number | string | null;
      fdiscount: number | string | null;
      fstatus: string | null; fdate: string | null;
    };
    let fwdById = new Map<number, FwdRow>();
    if (fIds.length > 0) {
      const { data: fwdRaw, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, fid, fdetail, ftrackingchn, fvolume, fweight, fcosttotalprice, ftotalprice, fdiscount, fstatus, fdate",
        )
        .in("id", fIds);
      if (fwdErr) {
        console.error("[tb_forwarder batch] failed", { code: fwdErr.code, message: fwdErr.message });
      }
      fwdById = new Map(((fwdRaw ?? []) as unknown as FwdRow[]).map((f) => [f.id, f]));
    }

    const items: BatchSaleItem[] = itemRows.map((it) => {
      const f = fwdById.get(it.fid);
      return {
        id:  it.id,
        fid: it.fid,
        forwarder: f
          ? {
              fid:             f.fid,
              fdetail:         f.fdetail,
              ftrackingchn:    f.ftrackingchn,
              fvolume:         Number(f.fvolume ?? 0),
              fweight:         Number(f.fweight ?? 0),
              fcosttotalprice: Number(f.fcosttotalprice ?? 0),
              ftotalprice:     Number(f.ftotalprice ?? 0),
              fdiscount:       Number(f.fdiscount ?? 0),
              fstatus:         f.fstatus,
              fdate:           f.fdate,
            }
          : null,
      };
    });

    const salePriceCHN = items.reduce((s, it) => {
      if (!it.forwarder) return s;
      return s + (it.forwarder.ftotalprice - it.forwarder.fdiscount);
    }, 0);

    return {
      kind:   "sale",
      header,
      items,
      totals: {
        itemCount:    items.length,
        itemSum:      items.reduce((s, it) => s + (it.forwarder?.ftotalprice ?? 0), 0),
        salePriceCHN,
      },
    };
  }

  // ── INTERPRETER items: tb_withdraw_comm_interpreter_item by wciid →
  //    tb_header_order by hno ──
  const { data: itemRaw, error: itemErr } = await admin
    .from(t.item)
    .select("id, hno, diffyaun")
    .eq(t.itemFK, id);
  if (itemErr) {
    console.error(`[${t.item} list] failed`, { code: itemErr.code, message: itemErr.message });
  }
  const itemRows = (itemRaw ?? []) as Array<{ id: number; hno: string; diffyaun: number | string | null }>;
  const hnos = Array.from(new Set(itemRows.map((i) => i.hno)));

  type OrderRow = { hno: string; hdate: string | null; hstatus: string | null; userid: string | null };
  let orderByHno = new Map<string, OrderRow>();
  if (hnos.length > 0) {
    const { data: orderRaw, error: orderErr } = await admin
      .from("tb_header_order")
      .select("hno, hdate, hstatus, userid")
      .in("hno", hnos);
    if (orderErr) {
      console.error("[tb_header_order batch] failed", { code: orderErr.code, message: orderErr.message });
    }
    orderByHno = new Map(((orderRaw ?? []) as unknown as OrderRow[]).map((o) => [o.hno, o]));
  }

  const items: BatchInterpreterItem[] = itemRows.map((it) => {
    const o = orderByHno.get(it.hno);
    return {
      id:       it.id,
      hno:      it.hno,
      diffyaun: Number(it.diffyaun ?? 0),
      order: o
        ? { hdate: o.hdate, hstatus: o.hstatus, userid: o.userid }
        : null,
    };
  });

  const yuanMargin = items.reduce((s, it) => s + it.diffyaun, 0);

  return {
    kind:   "interpreter",
    header,
    items,
    totals: {
      itemCount: items.length,
      itemSum:   items.reduce((s, it) => s + it.diffyaun, 0),
      yuanMargin,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// ═ WRITE — create batch + pay-out (faithful-port · 2026-07-09) ═
// ════════════════════════════════════════════════════════════════════════
//
// Legacy money model (verified from PCS source, cited per-function):
//
//   SALE (withdraw-commission-sale/*):
//     eligible = tb_forwarder rows the rep earned on = a settled wallet event
//       (tb_wallet_hs.status='2', DATE>2023-09-30) referencing the forwarder
//       (wh.reforder=f.id AND wh.userid=f.userid), whose owner's rep
//       (tb_users.adminIDSale) = the selected rep, EXCLUDING forwarders already
//       in tb_withdraw_comm_sale_item (anti-join wcsh.status IS NULL).
//     commission/row = (fTotalPrice − fDiscount) × 1%   (listPayCommForwarder L63/70)
//     commBefore = Σ commission ;  withholding = commBefore × 3% ;
//     amount(net) = commBefore − withholding             (listPayCommForwarder L95-119)
//       → MIRRORS lib/sales-commission/calc.ts computeCommission(gross, 0.01).
//
//   INTERPRETER (withdraw-commission-interpreter/*):
//     eligible = tb_header_order rows the interpreter (h.adminIDIP) earned on =
//       a settled wallet event (status='2', DATE>2023-08-31) referencing the
//       order (wh.reforder=h.hno AND wh.userid=h.userid), EXCLUDING hNos already
//       in tb_withdraw_comm_interpreter_item (defensive anti-join — legacy
//       listPayCommShops OMITS it; the task asks us to ADD it).
//     diffYaun/row = (hTotalPriceCHN + hShippingCHN) − hCostAll ; if <0 OR
//       hStatus==6 → 0                                   (listPayCommShops L70-73)
//     commission(baht)/row = diffYaun × hRateCost × (perCom/100)  (L75)
//       perCom = tb_set_comm_interpreter.perCom for that interpreter.
//     commBefore = Σ commission ; withholding = commBefore × 3% ;
//       amount(net) = commBefore × 0.97                  (L110/124-134)
//     item stores hNo + diffYaun (the yuan margin, NOT the baht commission).
//
// Defensive hardening over legacy (money-safe):
//   - Amounts are RECOMPUTED server-side from the DB rows — the client number
//     is NEVER trusted (legacy trusted the POSTed commBefore/withholding/amount).
//   - Anti-join RE-VERIFIED at create-time right before the INSERT (legacy did
//     it once in the AJAX confirm-builder; a stale tab could double-batch).
//   - Pay-out UPDATE folds `status='1'` into the WHERE (TOCTOU-safe against a
//     concurrent double-click / double-pay); a 0-row result aborts.
//   - Zero destructive DELETE of real data: on an item-insert failure the
//     just-created empty header is marked status='3' (ไม่สำเร็จ — the legacy
//     "failed" status), NOT deleted; on a pay-out race the just-uploaded orphan
//     slip file is removed from storage (never a DB row).
//
// Residual (flagged, out-of-scope): tb_withdraw_comm_*_item have no UNIQUE on
//   fid/hno, so two admins batching the SAME forwarder/order in the same
//   millisecond could both pass the anti-join (a mig 0236-style partial-UNIQUE
//   index would close it, mirroring mig 0183). The re-verify shrinks the window
//   to ~a single request; a UNIQUE index is the real fix.

// ── local helpers ─────────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Resolve the current Supabase user's legacy `tb_admin.adminID` (varchar(30))
 *  for the *Create/*Update audit columns. Mirror of the shop-disbursement helper. */
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) {
    console.error("[withdraw-comm-batch] auth.getUser failed", {
      code: authErr.code,
      message: authErr.message,
    });
  }
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error("[withdraw-comm-batch] tb_admin lookup failed", {
      code: error.code,
      message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20);
}

/**
 * WHT-exemption — legacy: interns (`tb_admin.adminType` ∈ {'3','4'} = เด็กฝึกงาน)
 * pay NO withholding; everyone else pays 3% (listPayCommForwarder L104-109 +
 * listPayCommShops L115-128, identical branch both kinds).
 *
 * tb_admin is CAMELCASE (`adminType`). Prod today has 0 admins of type 3/4
 * (all '1'/'2' → all pay 3%), so this is faithful future-proofing with ZERO
 * effect on any current payee. Fail-SAFE: on any lookup error → treat as
 * NOT exempt (apply 3% — the company-favourable, remittable default).
 */
async function isWhtExemptPayee(
  admin: ReturnType<typeof createAdminClient>,
  payeeAdminId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminType")
    .eq("adminID", payeeAdminId)
    .maybeSingle<{ adminType: string | number | null }>();
  if (error) {
    console.error("[withdraw-comm-batch] adminType lookup failed (defaulting to WHT 3%)", {
      code: error.code,
      message: error.message,
    });
    return false;
  }
  const t = String(data?.adminType ?? "");
  return t === "3" || t === "4";
}

/** Split a commission-before figure into WHT + net given the payee's exemption. */
function applyPayeeWht(commBefore: number, whtExempt: boolean): { withholding: number; net: number } {
  const cb = round2(commBefore);
  if (whtExempt) return { withholding: 0, net: cb };
  const withholding = round2(cb * SALES_WHT_RATE);
  return { withholding, net: round2(cb - withholding) };
}

// Legacy hard date floors (the eligible set never reaches before these).
const SALE_DATE_FLOOR = "2023-09-30";        // withdraw-commission-sale/add.php L92
const INTERPRETER_DATE_FLOOR = "2023-08-31"; // withdraw-commission-interpreter/add.php L87
const PER_ROW_COMM_RATE = 0.01;              // sales 1% (listPayCommForwarder L70)
const IN_CHUNK = 200;                        // PostgREST .in() chunk size

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
/** Default range = current month (legacy "first day of this month" .. "last day"). */
function resolveRange(range?: { start?: string; end?: string }): { start: string; end: string } {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const now = new Date();
  const start =
    range?.start && isoDate.test(range.start)
      ? range.start
      : `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  let end: string;
  if (range?.end && isoDate.test(range.end)) {
    end = range.end;
  } else {
    const [yy, mm] = start.split("-");
    const last = new Date(Number(yy), Number(mm), 0).getDate();
    end = `${yy}-${mm}-${pad2(last)}`;
  }
  return { start, end };
}

// ── shared types ───────────────────────────────────────────────────────────

/** A tb_account_pcs company account (the pay-FROM account chosen at create). */
export type CommPayAccount = {
  id: number;
  bankname: string | null;
  accountname: string | null;
  accountnumber: string | null;
};

/** A payee (sales rep or interpreter) available for a batch. */
export type CommPayee = { adminId: string };

export type EligibleSaleForwarder = {
  /** tb_forwarder.id — the checkbox value the create form posts. */
  fid: number;
  /** tb_forwarder.fid — legacy doc id (display). */
  fdocId: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  fdate: string | null;
  walletDate: string | null;
  ftotalprice: number;
  fdiscount: number;
  priceNet: number;   // ftotalprice − fdiscount
  commission: number; // priceNet × 1%
  fstatus: string | null;
  userid: string;
};

export type SaleBatchEligibleResult = {
  payeeAdminId: string;
  start: string;
  end: string;
  items: EligibleSaleForwarder[];
  totals: { grossAll: number; commBefore: number; withholding: number; net: number };
};

export type EligibleInterpreterOrder = {
  hno: string;
  userid: string | null;
  hdate: string | null;
  walletDate: string | null;
  diffYaun: number;   // (hTotalPriceCHN + hShippingCHN) − hCostAll (floored ≥0 · 0 if hStatus=6)
  hratecost: number;
  perCom: number;
  commission: number; // diffYaun × hratecost × perCom%
  hstatus: string | null;
};

export type InterpreterBatchEligibleResult = {
  payeeAdminId: string;
  perCom: number;
  start: string;
  end: string;
  items: EligibleInterpreterOrder[];
  totals: { diffYaunAll: number; commBefore: number; withholding: number; net: number };
};

// ────────────────────────────────────────────────────────────────────────
// READ — pay-FROM bank accounts (tb_account_pcs) for the create modal.
// ────────────────────────────────────────────────────────────────────────
export async function listCommPayAccounts(): Promise<
  AdminActionResult<{ accounts: CommPayAccount[] }>
> {
  return withAdmin(["super", "accounting"], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_account_pcs")
      .select("id, bankname, accountname, accountnumber")
      .order("id", { ascending: false });
    if (error) {
      console.error("[withdraw-comm-batch] tb_account_pcs list failed", {
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    const accounts = ((data ?? []) as Array<CommPayAccount>).map((a) => ({
      id: Number(a.id),
      bankname: a.bankname,
      accountname: a.accountname,
      accountnumber: a.accountnumber,
    }));
    return { ok: true, data: { accounts } };
  });
}

// ────────────────────────────────────────────────────────────────────────
// READ — payee dropdown (sales reps / interpreters).
//
// SALE (add.php L130-131):
//   tb_admin WHERE (companyType='1' OR '3') AND (department='1' OR '5')
//                  AND (section='18' OR '1' OR '2')
// INTERPRETER (add.php L127):
//   tb_admin WHERE (companyType='3' AND department='2' AND section IN('3','4'))
//                  OR adminID='admin_jeen'
//
// tb_admin is CAMELCASE (adminID, companyType, department, section). The
// migrated tb_admin's companyType/department/section codes DON'T match the
// legacy filter values (prod: the strict filter returns 0). So for SALE we
// fall back to the DATA-DRIVEN source of truth — the distinct tb_users.adminIDSale
// (the reps who actually own customers) — which is EXACTLY what the eligible
// query keys on. INTERPRETER has no reliable data source today (adminidip is
// placeholder 'customer'/'admin_web' + tb_set_comm_interpreter is unseeded) →
// its list stays legacy-filtered + the create is guarded by the empty rate table.
// ────────────────────────────────────────────────────────────────────────
export async function listCommissionPayees(
  kind: BatchKind,
): Promise<AdminActionResult<{ payees: CommPayee[] }>> {
  return withAdmin(["super", "accounting"], async () => {
    const admin = createAdminClient();
    let q = admin.from("tb_admin").select("adminID").order("ID", { ascending: true });
    if (kind === "sale") {
      q = q
        .in("companyType", ["1", "3"])
        .in("department", ["1", "5"])
        .in("section", ["18", "1", "2"]);
    } else {
      // (companyType=3 AND department=2 AND section IN (3,4)) OR adminID=admin_jeen
      q = q.or("and(companyType.eq.3,department.eq.2,section.in.(3,4)),adminID.eq.admin_jeen");
    }
    const { data, error } = await q;
    if (error) {
      console.error(`[withdraw-comm-batch] payee list (${kind}) failed`, {
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    const seen = new Set<string>();
    const payees: CommPayee[] = [];
    for (const r of ((data ?? []) as Array<{ adminID: string | null }>)) {
      const id = (r.adminID ?? "").trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        payees.push({ adminId: id });
      }
    }

    // SALE fallback — legacy org-filter empty on migrated data → use the real
    // reps (distinct tb_users.adminIDSale). Keeps the create form usable §0d.
    if (kind === "sale" && payees.length === 0) {
      const { data: repRows, error: repErr } = await admin
        .from("tb_users")
        .select("adminIDSale")
        .not("adminIDSale", "is", null)
        .neq("adminIDSale", "")
        .limit(9000);
      if (repErr) {
        console.error("[withdraw-comm-batch] sale payee fallback failed", {
          code: repErr.code,
          message: repErr.message,
        });
      } else {
        for (const r of (repRows ?? []) as Array<{ adminIDSale: string | null }>) {
          const id = (r.adminIDSale ?? "").trim();
          if (id && !seen.has(id)) {
            seen.add(id);
            payees.push({ adminId: id });
          }
        }
        payees.sort((a, b) => a.adminId.localeCompare(b.adminId));
      }
    }

    return { ok: true, data: { payees } };
  });
}

// ────────────────────────────────────────────────────────────────────────
// READ — SALE eligible forwarders for a rep (+ date range).
// ────────────────────────────────────────────────────────────────────────
const eligibleQuerySchema = z.object({
  payeeAdminId: z.string().trim().min(1).max(30),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function getSaleBatchEligible(
  input: unknown,
): Promise<AdminActionResult<SaleBatchEligibleResult>> {
  const parsed = eligibleQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { payeeAdminId } = parsed.data;
  const { start, end } = resolveRange(parsed.data);

  return withAdmin(["super", "accounting"], async () => {
    const admin = createAdminClient();

    // (1) the rep's customers → userIDs (tb_users is CAMELCASE).
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID")
      .eq("adminIDSale", payeeAdminId);
    if (userErr) {
      console.error("[withdraw-comm-batch] rep customers query failed", {
        code: userErr.code,
        message: userErr.message,
      });
      return { ok: false, error: userErr.message };
    }
    const userIds = Array.from(
      new Set(((userRows ?? []) as Array<{ userID: string }>).map((u) => u.userID).filter(Boolean)),
    );
    const empty: SaleBatchEligibleResult = {
      payeeAdminId,
      start,
      end,
      items: [],
      totals: { grossAll: 0, commBefore: 0, withholding: 0, net: 0 },
    };
    if (userIds.length === 0) return { ok: true, data: empty };

    // (2) settled wallet events in range for those customers → (userid, fid).
    //   tb_wallet_hs status='2' · reforder = forwarder id (numeric string) ·
    //   date range · date > SALE_DATE_FLOOR.
    const effStart = start > SALE_DATE_FLOOR ? start : SALE_DATE_FLOOR;
    type WalletPair = { userid: string; fid: number; date: string | null };
    const walletPairs: WalletPair[] = [];
    for (let i = 0; i < userIds.length; i += IN_CHUNK) {
      const slice = userIds.slice(i, i + IN_CHUNK);
      const { data: wRows, error: wErr } = await admin
        .from("tb_wallet_hs")
        .select("userid, reforder, date")
        .eq("status", "2")
        .in("userid", slice)
        .not("reforder", "is", null)
        .neq("reforder", "")
        .gt("date", `${effStart}T00:00:00`)
        .lte("date", `${end}T23:59:59`);
      if (wErr) {
        console.error("[withdraw-comm-batch] wallet query failed", {
          code: wErr.code,
          message: wErr.message,
        });
        return { ok: false, error: wErr.message };
      }
      for (const w of (wRows ?? []) as Array<{ userid: string; reforder: string; date: string | null }>) {
        // reforder is polymorphic (forwarder id for cargo · hNo for shop) —
        // keep only integer-looking ids; the tb_forwarder load drops the rest.
        if (!/^\d+$/.test(w.reforder)) continue;
        walletPairs.push({ userid: w.userid, fid: Number(w.reforder), date: w.date });
      }
    }
    if (walletPairs.length === 0) return { ok: true, data: empty };

    // keep the most-recent settled date per (userid|fid) pair.
    const walletDateByPair = new Map<string, string | null>();
    for (const p of walletPairs) {
      const key = `${p.userid}|${p.fid}`;
      const prev = walletDateByPair.get(key);
      if (prev == null || (p.date != null && p.date > prev)) {
        walletDateByPair.set(key, p.date);
      }
    }
    const candidateFids = Array.from(new Set(walletPairs.map((p) => p.fid)));

    // (3) load the candidate forwarders (tb_forwarder is LOWERCASE).
    type FwdRow = {
      id: number;
      fid: string | null;
      ftrackingchn: string | null;
      fcabinetnumber: string | null;
      fdate: string | null;
      ftotalprice: number | string | null;
      fdiscount: number | string | null;
      fstatus: string | null;
      userid: string;
    };
    const fwdRows: FwdRow[] = [];
    for (let i = 0; i < candidateFids.length; i += IN_CHUNK) {
      const slice = candidateFids.slice(i, i + IN_CHUNK);
      const { data, error } = await admin
        .from("tb_forwarder")
        .select(
          "id, fid, ftrackingchn, fcabinetnumber, fdate, ftotalprice, fdiscount, fstatus, userid",
        )
        .in("id", slice);
      if (error) {
        console.error("[withdraw-comm-batch] forwarder load failed", {
          code: error.code,
          message: error.message,
        });
        return { ok: false, error: error.message };
      }
      fwdRows.push(...((data ?? []) as unknown as FwdRow[]));
    }

    // (4) anti-join: exclude forwarders already in a batch.
    const alreadyBatched = new Set<number>();
    for (let i = 0; i < candidateFids.length; i += IN_CHUNK) {
      const slice = candidateFids.slice(i, i + IN_CHUNK);
      const { data, error } = await admin
        .from("tb_withdraw_comm_sale_item")
        .select("fid")
        .in("fid", slice);
      if (error) {
        console.error("[withdraw-comm-batch] sale anti-join failed", {
          code: error.code,
          message: error.message,
        });
        return { ok: false, error: error.message };
      }
      for (const r of (data ?? []) as Array<{ fid: number }>) alreadyBatched.add(Number(r.fid));
    }

    // (5) assemble — only forwarders whose (userid|fid) has a settled wallet
    //     pair (the f.id=wh.reforder AND f.userid=wh.userid join) AND not batched.
    const items: EligibleSaleForwarder[] = [];
    for (const f of fwdRows) {
      if (alreadyBatched.has(Number(f.id))) continue;
      const key = `${f.userid}|${Number(f.id)}`;
      if (!walletDateByPair.has(key)) continue; // no settled payment for this owner
      const ftotalprice = Number(f.ftotalprice ?? 0);
      const fdiscount = Number(f.fdiscount ?? 0);
      const priceNet = round2(ftotalprice - fdiscount);
      items.push({
        fid: Number(f.id),
        fdocId: f.fid,
        ftrackingchn: f.ftrackingchn,
        fcabinetnumber: f.fcabinetnumber,
        fdate: f.fdate,
        walletDate: walletDateByPair.get(key) ?? null,
        ftotalprice,
        fdiscount,
        priceNet,
        commission: round2(priceNet * PER_ROW_COMM_RATE),
        fstatus: f.fstatus,
        userid: f.userid,
      });
    }
    items.sort((a, b) => (b.walletDate ?? "").localeCompare(a.walletDate ?? ""));

    const gross = sumGross(items.map((i) => ({ ftotalprice: i.ftotalprice, fdiscount: i.fdiscount })));
    const c = computeCommission(gross, PER_ROW_COMM_RATE);
    const whtExempt = await isWhtExemptPayee(admin, payeeAdminId);
    const { withholding, net } = applyPayeeWht(c.commission, whtExempt);
    return {
      ok: true,
      data: {
        payeeAdminId,
        start,
        end,
        items,
        totals: { grossAll: c.gross, commBefore: c.commission, withholding, net },
      },
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// READ — INTERPRETER eligible orders for an interpreter (+ date range).
// ────────────────────────────────────────────────────────────────────────
export async function getInterpreterBatchEligible(
  input: unknown,
): Promise<AdminActionResult<InterpreterBatchEligibleResult>> {
  const parsed = eligibleQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { payeeAdminId } = parsed.data;
  const { start, end } = resolveRange(parsed.data);

  return withAdmin(["super", "accounting"], async () => {
    const admin = createAdminClient();

    // (1) the interpreter's commission rate (tb_set_comm_interpreter LOWERCASE).
    const { data: setRow, error: setErr } = await admin
      .from("tb_set_comm_interpreter")
      .select("percom")
      .eq("adminid", payeeAdminId)
      .maybeSingle<{ percom: number | string | null }>();
    if (setErr) {
      console.error("[withdraw-comm-batch] interpreter rate lookup failed", {
        code: setErr.code,
        message: setErr.message,
      });
      return { ok: false, error: setErr.message };
    }
    const perCom = Number(setRow?.percom ?? 0);

    const empty: InterpreterBatchEligibleResult = {
      payeeAdminId,
      perCom,
      start,
      end,
      items: [],
      totals: { diffYaunAll: 0, commBefore: 0, withholding: 0, net: 0 },
    };

    // (2) the interpreter's orders (tb_header_order LOWERCASE · driver = adminidip).
    type OrderRow = {
      hno: string;
      userid: string | null;
      hdate: string | null;
      htotalpricechn: number | string | null;
      hshippingchn: number | string | null;
      hcostall: number | string | null;
      hratecost: number | string | null;
      hstatus: string | null;
    };
    const { data: orderRows, error: orderErr } = await admin
      .from("tb_header_order")
      .select("hno, userid, hdate, htotalpricechn, hshippingchn, hcostall, hratecost, hstatus")
      .eq("adminidip", payeeAdminId)
      .neq("hno", "")
      .order("hdate", { ascending: false })
      .limit(5000);
    if (orderErr) {
      console.error("[withdraw-comm-batch] interpreter orders query failed", {
        code: orderErr.code,
        message: orderErr.message,
      });
      return { ok: false, error: orderErr.message };
    }
    const orders = (orderRows ?? []) as unknown as OrderRow[];
    if (orders.length === 0) return { ok: true, data: empty };
    const orderByHno = new Map<string, OrderRow>();
    for (const o of orders) if (o.hno) orderByHno.set(o.hno, o);
    const hnos = Array.from(orderByHno.keys());

    // (3) settled wallet events in range referencing those orders → settled hNos.
    const effStart = start > INTERPRETER_DATE_FLOOR ? start : INTERPRETER_DATE_FLOOR;
    const walletDateByHno = new Map<string, string | null>();
    for (let i = 0; i < hnos.length; i += IN_CHUNK) {
      const slice = hnos.slice(i, i + IN_CHUNK);
      const { data: wRows, error: wErr } = await admin
        .from("tb_wallet_hs")
        .select("userid, reforder, date")
        .eq("status", "2")
        .in("reforder", slice)
        .gt("date", `${effStart}T00:00:00`)
        .lte("date", `${end}T23:59:59`);
      if (wErr) {
        console.error("[withdraw-comm-batch] interpreter wallet query failed", {
          code: wErr.code,
          message: wErr.message,
        });
        return { ok: false, error: wErr.message };
      }
      for (const w of (wRows ?? []) as Array<{ userid: string; reforder: string; date: string | null }>) {
        const o = orderByHno.get(w.reforder);
        if (!o) continue;
        // faithful join: h.userID = wh.userID.
        if (o.userid != null && o.userid !== w.userid) continue;
        const prev = walletDateByHno.get(w.reforder);
        if (prev == null || (w.date != null && w.date > prev)) {
          walletDateByHno.set(w.reforder, w.date);
        }
      }
    }
    const settledHnos = Array.from(walletDateByHno.keys());
    if (settledHnos.length === 0) return { ok: true, data: empty };

    // (4) anti-join: exclude orders already in an interpreter batch (defensive —
    //     legacy listPayCommShops omits this; we ADD it).
    const alreadyBatched = new Set<string>();
    for (let i = 0; i < settledHnos.length; i += IN_CHUNK) {
      const slice = settledHnos.slice(i, i + IN_CHUNK);
      const { data, error } = await admin
        .from("tb_withdraw_comm_interpreter_item")
        .select("hno")
        .in("hno", slice);
      if (error) {
        console.error("[withdraw-comm-batch] interpreter anti-join failed", {
          code: error.code,
          message: error.message,
        });
        return { ok: false, error: error.message };
      }
      for (const r of (data ?? []) as Array<{ hno: string }>) alreadyBatched.add(r.hno);
    }

    // (5) compute per order.
    const items: EligibleInterpreterOrder[] = [];
    for (const hno of settledHnos) {
      if (alreadyBatched.has(hno)) continue;
      const o = orderByHno.get(hno);
      if (!o) continue;
      const { diffYaun, commission } = computeInterpreterRow(o, perCom);
      items.push({
        hno,
        userid: o.userid,
        hdate: o.hdate,
        walletDate: walletDateByHno.get(hno) ?? null,
        diffYaun,
        hratecost: Number(o.hratecost ?? 0),
        perCom,
        commission,
        hstatus: o.hstatus,
      });
    }
    items.sort((a, b) => (b.walletDate ?? "").localeCompare(a.walletDate ?? ""));

    const commBefore = round2(items.reduce((s, it) => s + it.commission, 0));
    const whtExempt = await isWhtExemptPayee(admin, payeeAdminId);
    const { withholding, net } = applyPayeeWht(commBefore, whtExempt);
    const diffYaunAll = round2(items.reduce((s, it) => s + it.diffYaun, 0));
    return {
      ok: true,
      data: {
        payeeAdminId,
        perCom,
        start,
        end,
        items,
        totals: { diffYaunAll, commBefore, withholding, net },
      },
    };
  });
}

/** Pure per-order interpreter math (listPayCommShops L70-75). */
function computeInterpreterRow(
  o: {
    htotalpricechn: number | string | null;
    hshippingchn: number | string | null;
    hcostall: number | string | null;
    hratecost: number | string | null;
    hstatus: string | null;
  },
  perCom: number,
): { diffYaun: number; commission: number } {
  let diffYaun = round2(
    Number(o.htotalpricechn ?? 0) + Number(o.hshippingchn ?? 0) - Number(o.hcostall ?? 0),
  );
  if (diffYaun < 0 || String(o.hstatus) === "6") diffYaun = 0;
  const commission = round2(diffYaun * Number(o.hratecost ?? 0) * (perCom / 100));
  return { diffYaun, commission };
}

// ── bank-account resolution shared by both create paths ────────────────────
type ResolvedAccount = { namebank: string; nameuserbank: string; nouserbank: string };
async function resolveAccount(
  admin: ReturnType<typeof createAdminClient>,
  accountId: number,
): Promise<{ ok: true; account: ResolvedAccount } | { ok: false; error: string }> {
  const { data: acc, error } = await admin
    .from("tb_account_pcs")
    .select("bankname, accountname, accountnumber")
    .eq("id", accountId)
    .maybeSingle<{ bankname: string | null; accountname: string | null; accountnumber: string | null }>();
  if (error) {
    console.error("[withdraw-comm-batch] account lookup failed", { code: error.code, message: error.message });
    return { ok: false, error: error.message };
  }
  if (!acc) return { ok: false, error: "ไม่พบบัญชีรับเงินที่เลือก" };
  return {
    ok: true,
    account: {
      namebank: (acc.bankname ?? "").slice(0, 2), // namebank varchar(2) — bank code
      nameuserbank: (acc.accountname ?? "").slice(0, 200),
      nouserbank: (acc.accountnumber ?? "").slice(0, 200),
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// CREATE — SALE batch (withdraw-commission-sale.php default POST 'add').
// ════════════════════════════════════════════════════════════════════════
const createSaleSchema = z.object({
  payeeAdminId: z.string().trim().min(1).max(30),
  forwarderIds: z.array(z.number().int().positive()).min(1).max(2000),
  accountId: z.number().int().positive(),
  title: z.string().trim().min(1).max(300),
});

export async function createSaleCommBatch(
  input: unknown,
): Promise<AdminActionResult<{ batchId: number; amount: number; itemCount: number }>> {
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { payeeAdminId, accountId, title } = parsed.data;
  const forwarderIds = Array.from(new Set(parsed.data.forwarderIds));

  return withAdmin<{ batchId: number; amount: number; itemCount: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // (a) re-load the selected forwarders (server-trusted amounts + owner).
      type FwdRow = {
        id: number;
        ftotalprice: number | string | null;
        fdiscount: number | string | null;
        userid: string;
      };
      const fwdRows: FwdRow[] = [];
      for (let i = 0; i < forwarderIds.length; i += IN_CHUNK) {
        const slice = forwarderIds.slice(i, i + IN_CHUNK);
        const { data, error } = await admin
          .from("tb_forwarder")
          .select("id, ftotalprice, fdiscount, userid")
          .in("id", slice);
        if (error) {
          console.error("[withdraw-comm-batch] create-sale load failed", { code: error.code, message: error.message });
          return { ok: false, error: error.message };
        }
        fwdRows.push(...((data ?? []) as unknown as FwdRow[]));
      }
      if (fwdRows.length === 0) return { ok: false, error: "ไม่พบรายการที่เลือก" };
      const foundIds = new Set(fwdRows.map((r) => Number(r.id)));
      const missing = forwarderIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return { ok: false, error: `ไม่พบ forwarder: ${missing.slice(0, 10).join(", ")}` };
      }

      // (a2) ownership RE-VERIFY — every selected forwarder's owner must be a
      //   customer of THIS rep (tb_users.adminIDSale = payee). Guards against a
      //   stale tab batching another rep's forwarders under this payee (legacy
      //   trusted the POSTed ids blindly). tb_users is CAMELCASE.
      const ownerIds = Array.from(new Set(fwdRows.map((r) => r.userid).filter(Boolean)));
      const repByUser = new Map<string, string | null>();
      for (let i = 0; i < ownerIds.length; i += IN_CHUNK) {
        const slice = ownerIds.slice(i, i + IN_CHUNK);
        const { data, error } = await admin
          .from("tb_users")
          .select("userID, adminIDSale")
          .in("userID", slice);
        if (error) {
          console.error("[withdraw-comm-batch] create-sale owner verify failed", { code: error.code, message: error.message });
          return { ok: false, error: error.message };
        }
        for (const u of (data ?? []) as Array<{ userID: string; adminIDSale: string | null }>) {
          repByUser.set(u.userID, u.adminIDSale);
        }
      }
      const crossRep = fwdRows.filter((r) => (repByUser.get(r.userid) ?? "") !== payeeAdminId);
      if (crossRep.length > 0) {
        return {
          ok: false,
          error: `forwarder ต่อไปนี้ไม่ใช่ของเซลล์ '${payeeAdminId}': ${crossRep.map((r) => r.id).slice(0, 10).join(", ")} (โปรดค้นหาใหม่)`,
        };
      }

      // (b) anti-join RE-VERIFY right before insert — abort if ANY selected
      //     forwarder is already in a batch (stale-tab / concurrent double-batch).
      const dup: number[] = [];
      for (let i = 0; i < forwarderIds.length; i += IN_CHUNK) {
        const slice = forwarderIds.slice(i, i + IN_CHUNK);
        const { data, error } = await admin
          .from("tb_withdraw_comm_sale_item")
          .select("fid")
          .in("fid", slice);
        if (error) {
          console.error("[withdraw-comm-batch] create-sale anti-join failed", { code: error.code, message: error.message });
          return { ok: false, error: error.message };
        }
        for (const r of (data ?? []) as Array<{ fid: number }>) dup.push(Number(r.fid));
      }
      if (dup.length > 0) {
        return {
          ok: false,
          error: `ข้อมูลซ้ำ — forwarder ต่อไปนี้ถูกเบิกค่าคอมไปแล้ว: ${dup.slice(0, 10).join(", ")}`,
        };
      }

      // (c) recompute amounts server-side — the client-posted totals are NEVER
      //     trusted. WHT via the payee's tb_admin.adminType: interns (3/4) exempt
      //     (faithful to listPayCommForwarder L104-109), everyone else 3%.
      const gross = sumGross(fwdRows.map((r) => ({ ftotalprice: r.ftotalprice, fdiscount: r.fdiscount })));
      const c = computeCommission(gross, PER_ROW_COMM_RATE);
      const whtExempt = await isWhtExemptPayee(admin, payeeAdminId);
      const commBefore = c.commission;
      const { withholding, net: amount } = applyPayeeWht(commBefore, whtExempt);

      // (d) resolve the pay-FROM account.
      const accRes = await resolveAccount(admin, accountId);
      if (!accRes.ok) return { ok: false, error: accRes.error };
      const { namebank, nameuserbank, nouserbank } = accRes.account;

      // (e) INSERT header (status='1' = รอดำเนินการ).
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 30);
      const nowIso = new Date().toISOString();
      const { data: batchRow, error: batchErr } = await admin
        .from("tb_withdraw_comm_sale_h")
        .insert({
          date: nowIso,
          amount,
          status: "1",
          adminidcreate: legacyAdminId,
          namebank,
          nameuserbank,
          nouserbank,
          title,
          adminid: safeLegacyAdminId(payeeAdminId, 30),
          commbefore: commBefore,
          withholding,
          imagesslip: "",  // filled at pay-out
          adminidupdate: "", // filled at pay-out
          dateupdate: nowIso, // NOT NULL on the migrated schema
        })
        .select("id")
        .single<{ id: number }>();
      if (batchErr) {
        console.error("[withdraw-comm-batch] sale header insert failed", { code: batchErr.code, message: batchErr.message });
        return { ok: false, error: batchErr.message };
      }
      const batchId = Number(batchRow.id);

      // (f) INSERT items (fid, wcsid) × N.
      const itemRows = forwarderIds.map((fid) => ({ fid, wcsid: batchId }));
      const { error: itemErr } = await admin.from("tb_withdraw_comm_sale_item").insert(itemRows);
      if (itemErr) {
        console.error("[withdraw-comm-batch] sale items insert failed", { batchId, code: itemErr.code, message: itemErr.message });
        // Mark the just-created empty header FAILED (status='3' ไม่สำเร็จ) — no
        // destructive DELETE of real data; the failed attempt stays auditable.
        await admin
          .from("tb_withdraw_comm_sale_h")
          .update({ status: "3", adminidupdate: legacyAdminId, dateupdate: new Date().toISOString() })
          .eq("id", batchId)
          .eq("status", "1");
        await logAdminAction(adminId, "comm_batch.sale_create_failed", "tb_withdraw_comm_sale_h", String(batchId), {
          legacy_admin_id: legacyAdminId,
          error: itemErr.message,
          forwarder_count: forwarderIds.length,
        });
        return { ok: false, error: itemErr.message };
      }

      await logAdminAction(adminId, "comm_batch.sale_create", "tb_withdraw_comm_sale_h", String(batchId), {
        legacy_admin_id: legacyAdminId,
        payee: payeeAdminId,
        amount,
        commBefore,
        withholding,
        item_count: forwarderIds.length,
        account_id: accountId,
      });

      revalidatePath("/admin/accounting/withdraw/comm-sale");
      return { ok: true, data: { batchId, amount, itemCount: forwarderIds.length } };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// CREATE — INTERPRETER batch (withdraw-commission-interpreter.php POST 'add').
// ════════════════════════════════════════════════════════════════════════
const createInterpreterSchema = z.object({
  payeeAdminId: z.string().trim().min(1).max(30),
  hnos: z.array(z.string().trim().min(1).max(30)).min(1).max(2000),
  accountId: z.number().int().positive(),
  title: z.string().trim().min(1).max(300),
});

export async function createInterpreterCommBatch(
  input: unknown,
): Promise<AdminActionResult<{ batchId: number; amount: number; itemCount: number }>> {
  const parsed = createInterpreterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { payeeAdminId, accountId, title } = parsed.data;
  const hnos = Array.from(new Set(parsed.data.hnos));

  return withAdmin<{ batchId: number; amount: number; itemCount: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // (a) the interpreter's commission rate.
      const { data: setRow, error: setErr } = await admin
        .from("tb_set_comm_interpreter")
        .select("percom")
        .eq("adminid", payeeAdminId)
        .maybeSingle<{ percom: number | string | null }>();
      if (setErr) {
        console.error("[withdraw-comm-batch] create-interp rate failed", { code: setErr.code, message: setErr.message });
        return { ok: false, error: setErr.message };
      }
      const perCom = Number(setRow?.percom ?? 0);
      if (perCom <= 0) {
        return { ok: false, error: `ล่าม '${payeeAdminId}' ยังไม่ได้ตั้งค่า % ค่าคอม (tb_set_comm_interpreter) — ตั้งค่าก่อนจึงเบิกได้` };
      }

      // (b) re-load the selected orders (server-trusted).
      type OrderRow = {
        hno: string;
        adminidip: string | null;
        htotalpricechn: number | string | null;
        hshippingchn: number | string | null;
        hcostall: number | string | null;
        hratecost: number | string | null;
        hstatus: string | null;
      };
      const orderRows: OrderRow[] = [];
      for (let i = 0; i < hnos.length; i += IN_CHUNK) {
        const slice = hnos.slice(i, i + IN_CHUNK);
        const { data, error } = await admin
          .from("tb_header_order")
          .select("hno, adminidip, htotalpricechn, hshippingchn, hcostall, hratecost, hstatus")
          .in("hno", slice);
        if (error) {
          console.error("[withdraw-comm-batch] create-interp load failed", { code: error.code, message: error.message });
          return { ok: false, error: error.message };
        }
        orderRows.push(...((data ?? []) as unknown as OrderRow[]));
      }
      if (orderRows.length === 0) return { ok: false, error: "ไม่พบรายการที่เลือก" };
      const foundHnos = new Set(orderRows.map((r) => r.hno));
      const missing = hnos.filter((h) => !foundHnos.has(h));
      if (missing.length > 0) return { ok: false, error: `ไม่พบออเดอร์: ${missing.slice(0, 10).join(", ")}` };
      // Every selected order must belong to this interpreter (adminidip).
      const wrongOwner = orderRows.filter((r) => (r.adminidip ?? "") !== payeeAdminId);
      if (wrongOwner.length > 0) {
        return { ok: false, error: `ออเดอร์ต่อไปนี้ไม่ใช่ของล่าม '${payeeAdminId}': ${wrongOwner.map((r) => r.hno).slice(0, 10).join(", ")}` };
      }

      // (c) anti-join RE-VERIFY — abort if ANY selected order already batched.
      const dup: string[] = [];
      for (let i = 0; i < hnos.length; i += IN_CHUNK) {
        const slice = hnos.slice(i, i + IN_CHUNK);
        const { data, error } = await admin
          .from("tb_withdraw_comm_interpreter_item")
          .select("hno")
          .in("hno", slice);
        if (error) {
          console.error("[withdraw-comm-batch] create-interp anti-join failed", { code: error.code, message: error.message });
          return { ok: false, error: error.message };
        }
        for (const r of (data ?? []) as Array<{ hno: string }>) dup.push(r.hno);
      }
      if (dup.length > 0) {
        return { ok: false, error: `ข้อมูลซ้ำ — ออเดอร์ต่อไปนี้ถูกเบิกค่าคอมล่ามไปแล้ว: ${dup.slice(0, 10).join(", ")}` };
      }

      // (d) recompute per-order diffYaun + commission (server-trusted).
      const perOrder = orderRows.map((o) => {
        const { diffYaun, commission } = computeInterpreterRow(o, perCom);
        return { hno: o.hno, diffYaun, commission };
      });
      const commBefore = round2(perOrder.reduce((s, r) => s + r.commission, 0));
      const whtExempt = await isWhtExemptPayee(admin, payeeAdminId);
      const { withholding, net: amount } = applyPayeeWht(commBefore, whtExempt);

      // (e) resolve the pay-FROM account.
      const accRes = await resolveAccount(admin, accountId);
      if (!accRes.ok) return { ok: false, error: accRes.error };
      const { namebank, nameuserbank, nouserbank } = accRes.account;

      // (f) INSERT header (status='1').
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 30);
      const nowIso = new Date().toISOString();
      const { data: batchRow, error: batchErr } = await admin
        .from("tb_withdraw_comm_interpreter_h")
        .insert({
          date: nowIso,
          amount,
          status: "1",
          adminidcreate: legacyAdminId,
          namebank,
          nameuserbank,
          nouserbank,
          title,
          adminid: safeLegacyAdminId(payeeAdminId, 30),
          commbefore: commBefore,
          withholding,
          imagesslip: "",
          adminidupdate: "",
          dateupdate: nowIso,
        })
        .select("id")
        .single<{ id: number }>();
      if (batchErr) {
        console.error("[withdraw-comm-batch] interp header insert failed", { code: batchErr.code, message: batchErr.message });
        return { ok: false, error: batchErr.message };
      }
      const batchId = Number(batchRow.id);

      // (g) INSERT items (hno, diffyaun, wciid) × N.
      const itemRows = perOrder.map((r) => ({ hno: r.hno, diffyaun: r.diffYaun, wciid: batchId }));
      const { error: itemErr } = await admin.from("tb_withdraw_comm_interpreter_item").insert(itemRows);
      if (itemErr) {
        console.error("[withdraw-comm-batch] interp items insert failed", { batchId, code: itemErr.code, message: itemErr.message });
        await admin
          .from("tb_withdraw_comm_interpreter_h")
          .update({ status: "3", adminidupdate: legacyAdminId, dateupdate: new Date().toISOString() })
          .eq("id", batchId)
          .eq("status", "1");
        await logAdminAction(adminId, "comm_batch.interpreter_create_failed", "tb_withdraw_comm_interpreter_h", String(batchId), {
          legacy_admin_id: legacyAdminId,
          error: itemErr.message,
          order_count: hnos.length,
        });
        return { ok: false, error: itemErr.message };
      }

      await logAdminAction(adminId, "comm_batch.interpreter_create", "tb_withdraw_comm_interpreter_h", String(batchId), {
        legacy_admin_id: legacyAdminId,
        payee: payeeAdminId,
        perCom,
        amount,
        commBefore,
        withholding,
        item_count: hnos.length,
        account_id: accountId,
      });

      revalidatePath("/admin/accounting/withdraw/comm-interpreter");
      return { ok: true, data: { batchId, amount, itemCount: hnos.length } };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// PAY-OUT — attach slip + flip status '1' → '2' (both kinds).
// Legacy: withdraw-commission-{sale,interpreter}.php case 'detail' POST 'update'
//   SELECT ID WHERE status=1 AND ID=? → if 1 row: UPDATE SET status='2',
//   imagesSlip, adminIDUpdate, dateUpdate=NOW() WHERE ID=?.
// Hardened: the status='1' guard is FOLDED INTO the UPDATE WHERE (TOCTOU-safe);
//   a 0-row result = already paid by a concurrent request → remove the orphan
//   slip + abort. Slip only accepted image/pdf (uploadToBucket enforces).
// ════════════════════════════════════════════════════════════════════════
export async function payCommBatch(
  kind: BatchKind,
  batchId: number,
  formData: FormData,
): Promise<AdminActionResult<{ id: number }>> {
  if (kind !== "sale" && kind !== "interpreter") return { ok: false, error: "invalid_kind" };
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: "invalid_batch_id" };
  const file = formData.get("slip");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "กรุณาแนบหลักฐานการโอน (สลิปจ่ายเงิน)" };
  }
  const t = TABLES[kind];

  return withAdmin<{ id: number }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // (1) pre-read guard — must still be a pending batch (status='1').
    const { data: row, error: rowErr } = await admin
      .from(t.header)
      .select("id, status")
      .eq("id", batchId)
      .maybeSingle<{ id: number; status: string | null }>();
    if (rowErr) {
      console.error("[withdraw-comm-batch] pay lookup failed", { batchId, code: rowErr.code, message: rowErr.message });
      return { ok: false, error: rowErr.message };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการเบิกค่าคอม" };
    if (row.status === "2") return { ok: false, error: "รายการนี้จ่ายเงินไปแล้ว (status=2)" };
    if (row.status !== "1") return { ok: false, error: `รายการนี้สถานะไม่ใช่ 'รอดำเนินการ' (status=${row.status})` };

    // (2) upload the slip.
    const up = await uploadToBucket(file, "slips", `admin/comm-${kind}-slip/${batchId}`);
    if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };

    // (3) UPDATE '1'→'2' — TOCTOU guard folded into WHERE.
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 30);
    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from(t.header)
      .update({ status: "2", imagesslip: up.filename, adminidupdate: legacyAdminId, dateupdate: nowIso })
      .eq("id", batchId)
      .eq("status", "1")
      .select("id")
      .maybeSingle<{ id: number }>();
    if (updErr) {
      console.error("[withdraw-comm-batch] pay update failed", { batchId, code: updErr.code, message: updErr.message });
      await admin.storage.from("slips").remove([up.filename]);
      return { ok: false, error: updErr.message };
    }
    if (!updated) {
      // 0 rows — a concurrent pay-out won the race; drop the orphan slip file.
      await admin.storage.from("slips").remove([up.filename]);
      return { ok: false, error: "รายการถูกจ่ายไปแล้วโดยผู้อื่น (กรุณารีเฟรช)" };
    }

    await logAdminAction(adminId, `comm_batch.${kind}_pay`, t.header, String(batchId), {
      legacy_admin_id: legacyAdminId,
      filename: up.filename,
      fromStatus: "1",
      toStatus: "2",
    });

    const base = kind === "sale" ? "comm-sale" : "comm-interpreter";
    revalidatePath(`/admin/accounting/withdraw/${base}`);
    revalidatePath(`/admin/accounting/withdraw/${base}/${batchId}`);
    return { ok: true, data: { id: batchId } };
  });
}
