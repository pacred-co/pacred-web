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
 * Status legend (per legacy convention, matches sale-payouts-tb status enum):
 *   '1' = สร้างแล้ว · รอแนบสลิป (draft after create)
 *   '2' = รอจ่าย (slip uploaded · pending bank push)
 *   '3' = จ่ายแล้ว (paid out)
 *
 * NOTE — MVP scope (this sitting): READ-ONLY surface (list + detail).
 * Brief §2 lists 25 + 46 historical batches that are invisible in Pacred
 * today; just surfacing them is the immediate trust win + reconciliation
 * value. The CREATE-BATCH + PAY-SLIP write paths are money-sensitive (server-
 * recompute · dedup-guard · status-guard against double-pay) and DEFER to a
 * next sitting with ก๊อต co-sign + legacy PHP source verified (the brief gave
 * the math but the line-by-line guards need PCS source for fidelity).
 *
 * `tb_*` is RLS service-role-only → all reads via `createAdminClient()`.
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

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
