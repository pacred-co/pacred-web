"use server";

/**
 * /admin/accounting/receipts — READ-ONLY server actions (list + detail)
 *
 * ── PURPOSE ───────────────────────────────────────────────────────
 * Backs the NEW `/admin/accounting/receipts` PEAK-style ใบเสร็จรับเงิน
 * surface (2026-05-30 sitting-Phase-B). The legacy money-of-record table
 * `tb_receipt` already powers `/admin/accounting/forwarder-invoice`
 * (Wave 29 pivot — receipt history) but that page is forwarder-scoped
 * and styled with the old indigo chrome. THIS surface is the PEAK-
 * accounting-style ทุกชนิด-receipt explorer with:
 *
 *   - 7-tab nav (ล่าสุด / ทั้งหมด / ร่าง / รอชำระ / ออกแล้ว / ยกเลิก / e-Receipt)
 *   - Default date range = current month
 *   - Server-paginated (10/page) — matches PEAK UX
 *   - IN-batch tb_users join for ลูกค้า display
 *   - WHT split + grand total in the footer
 *
 * ── WHY READ-ONLY ────────────────────────────────────────────────
 * Per the handoff §2 lane boundary, this file lives in ภูม's admin lane
 * (`actions/admin/*`). All MUTATION primitives for tb_receipt already
 * exist:
 *
 *   - `lib/admin/auto-issue-receipt.ts`  — auto INSERT (read-only here)
 *   - `lib/admin/mint-receipt-doc-no.ts` — minter (read-only here)
 *   - `actions/admin/forwarder-invoice.ts:adminIssueForwarderInvoice` — manual
 *   - `actions/admin/forwarder-invoice.ts:adminCancelForwarderInvoice` — cancel
 *   - `actions/admin/forwarder-invoice.ts:adminMarkReceiptPrinted` — print stamp
 *
 * This file ADDS READERS — list + detail. Mutations stay where they live
 * (forwarder-invoice.ts) so the "สร้าง" + "พิมพ์" + "ยกเลิก" buttons on
 * the new surface reuse the existing primitives without duplication.
 *
 * ── SCHEMA REFERENCES ────────────────────────────────────────────
 *   tb_receipt       — supabase/migrations/0081_pcs_legacy_schema.sql L4132-4158
 *     id bigint pk · rstatus varchar(1) DEFAULT '3' NOT NULL · rid varchar(20)
 *     refid varchar(50) · rdatecreate timestamp · rdate timestamp · issuedate timestamp
 *     ramount numeric(10,2) · totalbeforewithholding numeric(10,2)
 *     adminid varchar(30) · userid varchar(30) · statusprint varchar(1)
 *     recompnumber varchar(13) · recompname varchar(300) · recompaddress text
 *     corporatetype varchar(1) — '1'=ลูกค้าบริษัท · '2'=ลูกค้าทั่วไป
 *
 *   tb_receipt_item  — supabase/migrations/0081_pcs_legacy_schema.sql L4275-4279
 *     id bigint pk · rid varchar(30) FK→tb_receipt.rid · fid bigint FK→tb_forwarder.id
 *
 *   tb_users         — post-0113 camelCase (userID / userName / userLastName / userTel)
 *   tb_forwarder     — per-line item: ftrackingchn, fcabinetnumber, famount, fweight
 *
 * ── RSTATUS LEGEND (per forwarder-invoice.ts L54-57 + 0081 L4134 default) ─
 *   '1' = paid / จ่ายแล้ว       (emerald)
 *   '2' = cancelled / ยกเลิก    (red)
 *   '3' = pending / รอชำระเงิน  (amber · the default)
 *   note — legacy stores varchar(1); no '0' (ร่าง) row in current data, but
 *   we still tab-filter for it (forward-compat with a future draft workflow).
 *
 * ── ROLES ─────────────────────────────────────────────────────────
 * super | accounting — money tier. Matches forwarder-invoice.ts.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// Types — public surface (server-action callers use these)
// ────────────────────────────────────────────────────────────

export type ReceiptTab =
  | "recent"     // ล่าสุด — last 10 receipts (any rstatus, any date)
  | "all"        // ทั้งหมด
  | "draft"      // ร่าง — rstatus='0' (placeholder · no rows today)
  | "pending"    // รอชำระ — rstatus='3'
  | "issued"     // ออกแล้ว — rstatus='1' (paid)
  | "cancelled"; // ยกเลิก — rstatus='2'

/**
 * Customer-type filter (legacy `corporatetype` axis · matches nameCorporateType):
 *   all → both · com → corporatetype='1' (นิติบุคคล) · gen → '2' (บุคคลธรรมดา)
 * This composes WITH the status tab + date range (all filters apply together,
 * like the legacy receipt-forwarder-item list).
 */
export type ReceiptCType = "all" | "com" | "gen";

/**
 * Filter input for the list view. Date params are inclusive YYYY-MM-DD
 * strings (page layer defaults to current month). search hits rid +
 * userid + recompname; pageSize defaults to 10 (PEAK convention).
 */
export type GetReceiptListInput = {
  tab?: ReceiptTab;
  cType?: ReceiptCType;  // customer-type tab (all / com / gen)
  dateFrom?: string;     // 'YYYY-MM-DD' — inclusive
  dateTo?: string;       // 'YYYY-MM-DD' — inclusive (we add T23:59:59)
  search?: string;       // ilike on rid, userid, recompname
  page?: number;         // 1-based
  pageSize?: number;     // default 10
};

export type ReceiptListRow = {
  id: number;
  rid: string;
  refid: string | null;
  rdate: string | null;
  rdatecreate: string | null;
  rstatus: string;
  userid: string;
  customerLabel: string;       // recompname OR "userName userLastName" OR userid
  isCorporate: boolean;
  recompnumber: string | null; // เลขผู้เสียภาษี (tb_receipt.recompnumber · varchar(13))
  refwhid: number | null;         // อ้างอิงชำระเงิน (wallet · direct) → /admin/wallet/[refwhid]
  paymentWalletId: number | null; // อ้างอิงชำระเงิน (wallet · derived reforder=fid) → /admin/wallet/[id]
  totalBeforeWithholding: number;
  ramount: number;
  whtAmount: number;           // totalBeforeWithholding − ramount
  itemCount: number;
  // ── Legacy hs-receipt-forwarder.php columns (L277-282 · faithful superset) ──
  // เลขที่ฝากนำเข้า — the forwarder no(s) on this receipt. Legacy builds this
  // from tb_receipt_item.fID (rID → fID list · L224-234) and links each to
  // forwarder/detail/<fID>. fID = tb_forwarder.id → /admin/forwarders/[fNo].
  forwarderIds: number[];
  // สถานะพิมพ์ต้นฉบับ (legacy statusPrint/rDatePrint/adminIDprint · L339-347)
  printOriginal: { done: boolean; date: string | null; adminId: string | null };
  // สถานะพิมพ์สำเนา (legacy statusPrintCopy/rDatePrintCopy/adminIDprintCopy · L348-356)
  printCopy: { done: boolean; date: string | null; adminId: string | null };
};

export type ReceiptTabCounts = {
  recent:    number;
  all:       number;
  draft:     number;
  pending:   number;
  issued:    number;
  cancelled: number;
};

/**
 * Per-customer-type COUNT badges for the ประเภทลูกค้า tab row.
 * Computed within the SAME status/date/search filter as the visible list
 * (so the badge count matches what clicking the tab shows).
 */
export type ReceiptCTypeCounts = {
  all: number;
  com: number;   // corporatetype='1' — นิติบุคคล
  gen: number;   // corporatetype='2' — บุคคลธรรมดา
};

export type GetReceiptListResult = {
  rows: ReceiptListRow[];
  totals: {
    totalBeforeWithholding: number;
    whtAmount: number;
    ramount: number;
  };
  counts: ReceiptTabCounts;
  cTypeCounts: ReceiptCTypeCounts;  // ประเภทลูกค้า tab badges
  totalRowCount: number;       // for pagination — total in current filter
  page: number;
  pageSize: number;
};

export type ReceiptDetailLineItem = {
  itemId: number;
  fid: number;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  perRowRaw: number;           // sum of above buckets (matches grenrateReceiptF L548)
};

export type ReceiptDetail = {
  id: number;
  rid: string;
  refid: string | null;
  rdate: string | null;
  rdatecreate: string | null;
  issuedate: string | null;
  rstatus: string;
  ramount: number;
  totalBeforeWithholding: number;
  whtAmount: number;
  applyJuristic1Pct: boolean;
  adminid: string | null;
  userid: string;
  statusprint: string | null;
  recompnumber: string | null;
  recompname: string | null;
  recompaddress: string | null;
  corporatetype: string | null;
  isCorporate: boolean;
  documentissuer: string | null;
  documentapprover: string | null;
  customer: {
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userTel: string | null;
    userEmail: string | null;
  } | null;
  items: ReceiptDetailLineItem[];
};

// ────────────────────────────────────────────────────────────
// Helpers (private to this file)
// ────────────────────────────────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Tab → rstatus filter value (or null for any). */
const TAB_TO_RSTATUS: Record<ReceiptTab, string | null> = {
  recent:    null,
  all:       null,
  draft:     "0",
  pending:   "3",
  issued:    "1",
  cancelled: "2",
};

function customerLabel(
  recompname: string | null,
  u: { userName: string | null; userLastName: string | null } | undefined,
  userid: string,
): string {
  const rec = (recompname ?? "").trim();
  if (rec) return rec;
  if (!u) return userid;
  const name = [u.userName, u.userLastName].filter(Boolean).join(" ").trim();
  return name || userid;
}

// Defensive YYYY-MM-DD validation — caller may forward URL params.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to:   `${y}-${pad(m + 1)}-${pad(last)}`,
  };
}

// ────────────────────────────────────────────────────────────
// getReceiptList — paginated list + per-tab COUNT badges + totals
// ────────────────────────────────────────────────────────────

/**
 * Read tb_receipt with optional tab/date/search filters. Returns:
 *   - rows: ReceiptListRow[] (the current page · 10/page default)
 *   - totals: aggregated over the filter (NOT just the page · whole filter)
 *   - counts: per-tab COUNT(*) (parallel queries · independent of current tab)
 *   - totalRowCount: COUNT(*) for the current filter (for pagination math)
 *
 * Tab = "recent" returns last 10 by rdatecreate desc — ignoring date range +
 * any tab status filter. Use it as the default landing tab.
 */
export async function getReceiptList(
  input: GetReceiptListInput,
): Promise<GetReceiptListResult> {
  await requireAdmin(["super", "accounting"]);

  const tab: ReceiptTab = input.tab ?? "recent";
  const cType: ReceiptCType = input.cType ?? "all";
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize ?? 10)));
  const search = (input.search ?? "").trim();
  // corporatetype filter value: '1'=นิติบุคคล · '2'=บุคคลธรรมดา · null=both
  const cTypeFilter: string | null = cType === "com" ? "1" : cType === "gen" ? "2" : null;
  // sanitized ilike term (reused by the count + rows builders)
  const searchTerm = search ? search.replace(/[\\%_,]/g, (m) => "\\" + m) : "";

  const range = defaultDateRange();
  const dateFrom = input.dateFrom && DATE_RE.test(input.dateFrom) ? input.dateFrom : range.from;
  const dateTo   = input.dateTo   && DATE_RE.test(input.dateTo)   ? input.dateTo   : range.to;
  const dateToInclusive = `${dateTo}T23:59:59`;

  const admin = createAdminClient();

  // ── COUNTS — 5 parallel HEAD queries (no rows fetched) ─────────
  // `recent` doesn't really have a count of its own — it's "last 10
  // across everything". Mirror the all-count for clarity in the UI.
  // Each builder applies the same date range so the per-tab badges
  // reflect counts within the chosen window (PEAK convention).
  const buildCount = (rstatus?: string) => {
    let q = admin
      .from("tb_receipt")
      .select("id", { count: "exact", head: true })
      .gte("rdate", dateFrom)
      .lte("rdate", dateToInclusive);
    if (rstatus) q = q.eq("rstatus", rstatus);
    return q;
  };

  const [cAll, cDraft, cPending, cIssued, cCancel] = await Promise.all([
    buildCount(),
    buildCount("0"),
    buildCount("3"),
    buildCount("1"),
    buildCount("2"),
  ]);

  // Log any COUNT failures but don't throw — show 0 in the tab badge.
  for (const [label, r] of [
    ["all", cAll], ["draft", cDraft], ["pending", cPending],
    ["issued", cIssued], ["cancelled", cCancel],
  ] as const) {
    if (r.error) {
      console.error(`[tb_receipt count: ${label}] failed`, {
        code: r.error.code, message: r.error.message,
      });
    }
  }

  const counts: ReceiptTabCounts = {
    recent:    cAll.count ?? 0,           // mirror — "recent" is a view, not a count
    all:       cAll.count ?? 0,
    draft:     cDraft.count ?? 0,
    pending:   cPending.count ?? 0,
    issued:    cIssued.count ?? 0,
    cancelled: cCancel.count ?? 0,
  };

  // ── ประเภทลูกค้า COUNTS — within the SAME status(tab)+date+search filter ─
  // so each badge reflects what clicking that customer-type tab will show.
  // (For the "recent" tab there is no date/status window — mirror that by
  // counting corporatetype across all rows, matching the recent rows query.)
  const buildCTypeCount = (corporate?: string) => {
    let q = admin
      .from("tb_receipt")
      .select("id", { count: "exact", head: true });
    if (tab !== "recent") {
      const rstatusFilter = TAB_TO_RSTATUS[tab];
      if (rstatusFilter) q = q.eq("rstatus", rstatusFilter);
      q = q.gte("rdate", dateFrom).lte("rdate", dateToInclusive);
    }
    if (corporate) q = q.eq("corporatetype", corporate);
    if (searchTerm) {
      q = q.or(`rid.ilike.%${searchTerm}%,userid.ilike.%${searchTerm}%,recompname.ilike.%${searchTerm}%`);
    }
    return q;
  };

  const [ctAll, ctCom, ctGen] = await Promise.all([
    buildCTypeCount(),
    buildCTypeCount("1"),
    buildCTypeCount("2"),
  ]);
  for (const [label, r] of [["all", ctAll], ["com", ctCom], ["gen", ctGen]] as const) {
    if (r.error) {
      console.error(`[tb_receipt cType count: ${label}] failed`, {
        code: r.error.code, message: r.error.message,
      });
    }
  }
  const cTypeCounts: ReceiptCTypeCounts = {
    all: ctAll.count ?? 0,
    com: ctCom.count ?? 0,
    gen: ctGen.count ?? 0,
  };

  // ── ROWS query ────────────────────────────────────────────────
  // For "recent" tab: just last 10 by rdatecreate (no date filter, no
  // status filter) — that's the PEAK "ล่าสุด" semantic.
  // For all others: apply tab status + date range + optional search.

  let q = admin.from("tb_receipt").select(
    "id, rid, refid, rdate, rdatecreate, rstatus, userid, ramount, " +
      "totalbeforewithholding, recompname, recompnumber, corporatetype, refwhid, " +
      // legacy print-status columns (0081 L4144-4149) — สถานะพิมพ์ต้นฉบับ/สำเนา
      "statusprint, adminidprint, rdateprint, statusprintcopy, rdateprintcopy, adminidprintcopy",
    { count: "exact" },
  );

  if (tab === "recent") {
    // Last 10 across all time — pagination still works but pageSize is
    // typically the same 10 default the page passes.
    q = q.order("rdatecreate", { ascending: false, nullsFirst: false });
  } else {
    const rstatusFilter = TAB_TO_RSTATUS[tab];
    if (rstatusFilter) q = q.eq("rstatus", rstatusFilter);
    q = q
      .gte("rdate", dateFrom)
      .lte("rdate", dateToInclusive)
      .order("rdate", { ascending: false, nullsFirst: false });
  }

  // ประเภทลูกค้า filter — composes with the tab/date/search (both apply).
  if (cTypeFilter) q = q.eq("corporatetype", cTypeFilter);

  if (searchTerm) {
    q = q.or(`rid.ilike.%${searchTerm}%,userid.ilike.%${searchTerm}%,recompname.ilike.%${searchTerm}%`);
  }

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  q = q.range(from, to);

  const { data: receiptRows, error: rcErr, count: filterCount } = await q;
  if (rcErr) {
    console.error(`[tb_receipt list] failed`, { code: rcErr.code, message: rcErr.message });
    return {
      rows: [],
      totals: { totalBeforeWithholding: 0, whtAmount: 0, ramount: 0 },
      counts,
      cTypeCounts,
      totalRowCount: 0,
      page,
      pageSize,
    };
  }
  type RawReceipt = {
    id: number;
    rid: string;
    refid: string | null;
    rdate: string | null;
    rdatecreate: string | null;
    rstatus: string;
    userid: string;
    ramount: number | string | null;
    totalbeforewithholding: number | string | null;
    recompname: string | null;
    recompnumber: string | null;
    corporatetype: string | null;
    refwhid: number | string | null;
    statusprint: string | null;
    adminidprint: string | null;
    rdateprint: string | null;
    statusprintcopy: string | null;
    rdateprintcopy: string | null;
    adminidprintcopy: string | null;
  };
  const receipts = (receiptRows ?? []) as unknown as RawReceipt[];

  // ── IN-batch users join ───────────────────────────────────────
  const uniqUserIds = Array.from(new Set(receipts.map((r) => r.userid).filter(Boolean)));
  const userMap = new Map<string, { userName: string | null; userLastName: string | null }>();
  if (uniqUserIds.length > 0) {
    const { data: userRows, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", uniqUserIds);
    if (uErr) {
      console.error(`[tb_users IN-batch] failed`, { code: uErr.code, message: uErr.message });
    }
    for (const u of (userRows ?? []) as Array<{ userID: string; userName: string | null; userLastName: string | null }>) {
      userMap.set(u.userID, { userName: u.userName, userLastName: u.userLastName });
    }
  }

  // ── Per-row item counts + forwarder-id list via tb_receipt_item IN-batch ──
  // The fid list backs the เลขที่ฝากนำเข้า column (legacy L224-234 · rID→fID).
  const ridList = receipts.map((r) => r.rid).filter(Boolean);
  const itemCountByRid = new Map<string, number>();
  const fidsByRid = new Map<string, number[]>();
  if (ridList.length > 0) {
    const { data: items, error: itErr } = await admin
      .from("tb_receipt_item")
      .select("rid, fid")
      .in("rid", ridList);
    if (itErr) {
      console.error(`[tb_receipt_item count] failed`, { code: itErr.code, message: itErr.message });
    }
    for (const it of (items ?? []) as Array<{ rid: string; fid: number | null }>) {
      itemCountByRid.set(it.rid, (itemCountByRid.get(it.rid) ?? 0) + 1);
      if (it.fid != null) {
        const arr = fidsByRid.get(it.rid) ?? [];
        arr.push(it.fid);
        fidsByRid.set(it.rid, arr);
      }
    }
  }

  // ── อ้างอิงชำระเงิน fallback → the tb_wallet_hs "รายการชำระเงิน" record that funded
  //    this receipt (LEGACY-FAITHFUL). Legacy home.php L269 links the button ONLY to
  //    `wallet/deposit/[refWHID]` — the wallet payment record — and NOWHERE else.
  //    When tb_receipt.refwhid is unset, we derive it from the forwarder's payment
  //    record (tb_wallet_hs.reforder = fid) so the button still lands on the SAME
  //    wallet-payment page (/admin/wallet/[id]) as legacy — never on a bill. No wallet
  //    record → no button (matches legacy refWHID=0). READ-ONLY · newest wallet_hs wins.
  const walletByRid = new Map<string, number>();
  const allFids = Array.from(new Set([...fidsByRid.values()].flat()));
  if (allFids.length > 0) {
    const { data: whRows, error: whErr } = await admin
      .from("tb_wallet_hs")
      .select("id, reforder")
      .in("reforder", allFids.map(String))
      .order("id", { ascending: false });
    if (whErr) {
      console.error(`[tb_wallet_hs reforder] failed`, { code: whErr.code, message: whErr.message });
    }
    const whByFid = new Map<number, number>();
    for (const w of (whRows ?? []) as Array<{ id: number | null; reforder: string | null }>) {
      const fid = Number(w.reforder);
      if (fid && w.id != null && !whByFid.has(fid)) whByFid.set(fid, Number(w.id)); // newest (id desc) first
    }
    for (const [rid, fids] of fidsByRid) {
      for (const fid of fids) {
        const wh = whByFid.get(fid);
        if (wh) { walletByRid.set(rid, wh); break; }
      }
    }
  }

  // ── Materialise display rows ─────────────────────────────────
  const rows: ReceiptListRow[] = receipts.map((r) => {
    const tb = toNumber(r.totalbeforewithholding);
    const amt = toNumber(r.ramount);
    return {
      id:                     r.id,
      rid:                    r.rid,
      refid:                  r.refid,
      rdate:                  r.rdate,
      rdatecreate:            r.rdatecreate,
      rstatus:                r.rstatus,
      userid:                 r.userid,
      customerLabel:          customerLabel(r.recompname, userMap.get(r.userid), r.userid),
      isCorporate:            r.corporatetype === "1",
      recompnumber:           (r.recompnumber ?? "").trim() || null,
      refwhid:                r.refwhid != null && Number(r.refwhid) > 0 ? Number(r.refwhid) : null,
      paymentWalletId:        walletByRid.get(r.rid) ?? null,
      totalBeforeWithholding: tb,
      ramount:                amt,
      whtAmount:              tb - amt,
      itemCount:              itemCountByRid.get(r.rid) ?? 0,
      forwarderIds:           fidsByRid.get(r.rid) ?? [],
      printOriginal: {
        done:    r.statusprint === "1",
        date:    r.rdateprint,
        adminId: (r.adminidprint ?? "").trim() || null,
      },
      printCopy: {
        done:    r.statusprintcopy === "1",
        date:    r.rdateprintcopy,
        adminId: (r.adminidprintcopy ?? "").trim() || null,
      },
    };
  });

  // ── Page-level totals (filter-wide if available, otherwise sum) ─
  // We sum the visible page; for filter-wide totals the caller can
  // fetch with a larger pageSize when needed (PEAK shows page totals).
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalBeforeWithholding += r.totalBeforeWithholding;
      acc.ramount                 += r.ramount;
      acc.whtAmount               += r.whtAmount;
      return acc;
    },
    { totalBeforeWithholding: 0, whtAmount: 0, ramount: 0 },
  );

  return {
    rows,
    totals,
    counts,
    cTypeCounts,
    totalRowCount: filterCount ?? rows.length,
    page,
    pageSize,
  };
}

// ────────────────────────────────────────────────────────────
// getReceiptDetail — single tb_receipt + items + customer
// ────────────────────────────────────────────────────────────

/**
 * Read one tb_receipt by numeric id, with:
 *   - the customer row (tb_users) for header display
 *   - all tb_receipt_item rows + the linked tb_forwarder line data
 *   - computed per-row totals using the same buckets as
 *     `lib/admin/auto-issue-receipt.ts` (the source of the original sum)
 *
 * Returns null when not found (page should `notFound()`).
 *
 * Note: input `id` is the numeric primary key (`tb_receipt.id`), not the
 * business `rid` (e.g. "FRG2605-00220"). The PEAK URL pattern uses `[rid]`
 * as a route segment but we treat numeric id as the canonical lookup.
 * `getReceiptDetailByRid` (below) covers the rid case.
 */
export async function getReceiptDetail(id: number): Promise<ReceiptDetail | null> {
  await requireAdmin(["super", "accounting"]);

  if (!Number.isFinite(id) || id <= 0) return null;

  const admin = createAdminClient();

  // Header row.
  const { data: receiptData, error: rcErr } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, issuedate, rstatus, ramount, " +
        "totalbeforewithholding, adminid, userid, statusprint, " +
        "recompnumber, recompname, recompaddress, corporatetype, " +
        "documentissuer, documentapprover",
    )
    .eq("id", id)
    .maybeSingle<{
      id: number;
      rid: string;
      refid: string | null;
      rdate: string | null;
      rdatecreate: string | null;
      issuedate: string | null;
      rstatus: string;
      ramount: number | string | null;
      totalbeforewithholding: number | string | null;
      adminid: string | null;
      userid: string;
      statusprint: string | null;
      recompnumber: string | null;
      recompname: string | null;
      recompaddress: string | null;
      corporatetype: string | null;
      documentissuer: string | null;
      documentapprover: string | null;
    }>();
  if (rcErr) {
    console.error(`[tb_receipt detail] failed`, { code: rcErr.code, message: rcErr.message });
    throw new Error(`tb_receipt read failed: ${rcErr.message}`);
  }
  if (!receiptData) return null;

  // Customer.
  let customer: ReceiptDetail["customer"] = null;
  if (receiptData.userid) {
    const { data: u, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userEmail")
      .eq("userID", receiptData.userid)
      .maybeSingle<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userTel: string | null;
        userEmail: string | null;
      }>();
    if (uErr) {
      console.error(`[tb_users detail] failed`, { code: uErr.code, message: uErr.message });
    } else if (u) {
      customer = u;
    }
  }

  // Items + their forwarder line-data.
  const { data: itemRows, error: itErr } = await admin
    .from("tb_receipt_item")
    .select("id, fid")
    .eq("rid", receiptData.rid);
  if (itErr) {
    console.error(`[tb_receipt_item detail] failed`, { code: itErr.code, message: itErr.message });
  }
  const items = (itemRows ?? []) as Array<{ id: number; fid: number }>;

  type FwRow = {
    id: number;
    ftrackingchn: string | null;
    fcabinetnumber: string | null;
    fweight: number | string | null;
    fvolume: number | string | null;
    famount: number | null;
    ftotalprice: number | string | null;
    ftransportprice: number | string | null;
    fpriceupdate: number | string | null;
    fshippingservice: number | string | null;
    pricecrate: number | string | null;
    ftransportpricechnthb: number | string | null;
    priceother: number | string | null;
    fdiscount: number | string | null;
  };
  const fwById = new Map<number, FwRow>();
  if (items.length > 0) {
    const fids = items.map((it) => it.fid);
    const { data: fwRows, error: fwErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, ftrackingchn, fcabinetnumber, fweight, fvolume, famount, " +
          "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
          "pricecrate, ftransportpricechnthb, priceother, fdiscount",
      )
      .in("id", fids);
    if (fwErr) {
      console.error(`[tb_forwarder IN-batch] failed`, { code: fwErr.code, message: fwErr.message });
    }
    for (const r of ((fwRows ?? []) as unknown as FwRow[])) {
      fwById.set(r.id, r);
    }
  }

  const lineItems: ReceiptDetailLineItem[] = items.map((it) => {
    const fw = fwById.get(it.fid);
    const perRowRaw = fw
      ? toNumber(fw.ftotalprice) +
        toNumber(fw.ftransportprice) +
        toNumber(fw.fpriceupdate) +
        toNumber(fw.fshippingservice) +
        toNumber(fw.pricecrate) +
        toNumber(fw.ftransportpricechnthb) +
        toNumber(fw.priceother) -
        toNumber(fw.fdiscount)
      : 0;
    return {
      itemId:                it.id,
      fid:                   it.fid,
      ftrackingchn:          fw?.ftrackingchn ?? null,
      fcabinetnumber:        fw?.fcabinetnumber ?? null,
      fweight:               fw?.fweight ?? null,
      fvolume:               fw?.fvolume ?? null,
      famount:               fw?.famount ?? null,
      ftotalprice:           fw?.ftotalprice ?? null,
      ftransportprice:       fw?.ftransportprice ?? null,
      fpriceupdate:          fw?.fpriceupdate ?? null,
      fshippingservice:      fw?.fshippingservice ?? null,
      pricecrate:            fw?.pricecrate ?? null,
      ftransportpricechnthb: fw?.ftransportpricechnthb ?? null,
      priceother:            fw?.priceother ?? null,
      fdiscount:             fw?.fdiscount ?? null,
      perRowRaw,
    };
  });

  const totalBeforeWithholding = toNumber(receiptData.totalbeforewithholding);
  const ramount                = toNumber(receiptData.ramount);
  const whtAmount              = totalBeforeWithholding - ramount;
  const isCorporate            = receiptData.corporatetype === "1";

  return {
    id:                     receiptData.id,
    rid:                    receiptData.rid,
    refid:                  receiptData.refid,
    rdate:                  receiptData.rdate,
    rdatecreate:            receiptData.rdatecreate,
    issuedate:              receiptData.issuedate,
    rstatus:                receiptData.rstatus,
    ramount,
    totalBeforeWithholding,
    whtAmount,
    applyJuristic1Pct:      isCorporate && totalBeforeWithholding >= 1000,
    adminid:                receiptData.adminid,
    userid:                 receiptData.userid,
    statusprint:            receiptData.statusprint,
    recompnumber:           receiptData.recompnumber,
    recompname:             receiptData.recompname,
    recompaddress:          receiptData.recompaddress,
    corporatetype:          receiptData.corporatetype,
    isCorporate,
    documentissuer:         receiptData.documentissuer,
    documentapprover:       receiptData.documentapprover,
    customer,
    items: lineItems,
  };
}

/**
 * Lookup helper — find a receipt by its business `rid` (e.g. "FRG2605-00220")
 * and return the detail. Falls back to numeric id parsing for legacy URLs.
 * Page route can take either as `[rid]` URL segment.
 */
export async function getReceiptDetailByRid(rid: string): Promise<ReceiptDetail | null> {
  await requireAdmin(["super", "accounting"]);
  const trimmed = (rid ?? "").trim();
  if (!trimmed) return null;

  // numeric id path (URL passed an id, not a business rid)
  if (/^\d+$/.test(trimmed)) {
    return getReceiptDetail(Number.parseInt(trimmed, 10));
  }

  // Resolve rid → id, then re-use getReceiptDetail (one source of truth).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_receipt")
    .select("id")
    .eq("rid", trimmed)
    .maybeSingle<{ id: number }>();
  if (error) {
    console.error(`[tb_receipt rid lookup] failed`, { code: error.code, message: error.message });
    throw new Error(`tb_receipt rid lookup failed: ${error.message}`);
  }
  if (!data) return null;
  return getReceiptDetail(data.id);
}

// ────────────────────────────────────────────────────────────
// adminVoidReceipts — SOFT-cancel (void · KEEP HISTORY) one or many
// receipts from the ใบเสร็จรับเงิน list tick-selection (task 4c · ภูม
// 2026-07-01).
//
// WHY / WHAT:
//   Staff must be able to VOID a receipt even after it is "ออกแล้ว/paid"
//   (rstatus='1') — e.g. it was issued wrong / to the wrong customer. A void
//   is a SOFT cancel: it flips rstatus → '2' (the EXISTING legacy cancelled
//   state · red "ยกเลิก") and NEVER deletes the row, so the document-of-record
//   survives for the audit trail. The existing single-doc
//   `adminCancelForwarderInvoice` only handles pending→cancelled ('3'→'2');
//   this bulk void additionally handles the PAID case ('1'→'2') that the tick-
//   to-void list needs.
//
// MONEY-SAFETY (critical · money lane):
//   - SOFT only. No DELETE — the frozen receipt row + its totals stay intact.
//   - Moves NO money. The receipt is a document; the customer's payment (wallet
//     / bill) already landed on its own ledger. Voiding the DOC must not touch
//     tb_wallet / tb_payment / the bill — so this writes ONLY tb_receipt.rstatus.
//   - Idempotent + race-guarded: `.in("rstatus", ["1","3"])` so an already-
//     voided ('2') row is skipped (no error, no double-write). Re-running is a
//     no-op.
//   - Audit: logs each voided rid with the reason (tb_receipt has no reason
//     column · the reason lives in the admin action log, mirroring
//     adminCancelForwarderInvoice).
// ────────────────────────────────────────────────────────────

const voidReceiptsSchema = z.object({
  receiptIds: z.array(z.number().int().positive()).min(1, "ไม่ได้เลือกใบเสร็จ").max(200, "เลือกได้ครั้งละไม่เกิน 200 ใบ"),
  reason:     z.string().trim().min(3, "กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)").max(500, "เหตุผลยาวเกินไป"),
});
export type AdminVoidReceiptsInput = z.infer<typeof voidReceiptsSchema>;

export async function adminVoidReceipts(
  input: AdminVoidReceiptsInput,
): Promise<AdminActionResult<{ voided: number; skipped: number }>> {
  const parsed = voidReceiptsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { receiptIds, reason } = parsed.data;

  return withAdmin<{ voided: number; skipped: number }>(
    // Same money-tier gate as the other receipt mutations (+ Doc roles per the
    // 2026-06-05 ops-workflow unlock · tb_receipt-only, no wallet write).
    ["super", "accounting", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const uniqueIds = Array.from(new Set(receiptIds));

      // Flip ONLY rows currently ออกแล้ว/paid ('1') or รอชำระ ('3') → ยกเลิก ('2').
      // Already-cancelled ('2') rows are excluded by the WHERE → skipped silently.
      // Returns the rows it actually flipped so we can report voided vs skipped.
      const { data: flipped, error: updErr } = await admin
        .from("tb_receipt")
        .update({ rstatus: "2" })
        .in("id", uniqueIds)
        .in("rstatus", ["1", "3"])
        .select("id, rid");
      if (updErr) {
        console.error("[adminVoidReceipts] failed", { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      const voidedRows = (flipped ?? []) as Array<{ id: number; rid: string }>;
      const voided = voidedRows.length;
      const skipped = uniqueIds.length - voided;

      for (const r of voidedRows) {
        await logAdminAction(adminId, "receipt.void", "tb_receipt", String(r.id), {
          rid: r.rid, reason,
        });
      }

      revalidatePath("/admin/accounting/receipts");
      revalidatePath("/admin/accounting/forwarder-invoice");
      for (const r of voidedRows) {
        revalidatePath(`/admin/accounting/forwarder-invoice/${r.id}`);
      }

      return { ok: true, data: { voided, skipped } };
    },
  );
}
