"use server";

/**
 * จ่ายเงินแทนลูกค้า (pay-on-behalf) — READ-ONLY display loaders.
 *
 * Faithful port of the DISPLAY side of legacy `pcs-admin/pay-users.php`:
 *   • LIST mode history table  → `listPayUserHistory`  (tb_wallet_hs L753)
 *   • ADD mode forwarder table → `getPayUserForwarderView` (getItem.php keyType==2)
 *   • ADD mode shop table      → `getPayUserShopView`      (getItem.php keyType!=2)
 *
 * The MONEY WRITES live in `actions/admin/pay-user.ts` (untouched · tested):
 * `adminPayForwardersOnBehalf` / `adminPayForwardersWithTopUp` / `adminPayOrders*`.
 * This file only READS + shapes rows for the UI + the PDF summary — no mutation.
 *
 * SCHEMA CASING (verified · matches pay-user.ts + forwarders/page.tsx):
 *   tb_users / tb_admin = camelCase (userID/userName); tb_wallet / tb_wallet_hs /
 *   tb_forwarder / tb_header_order = lowercase (userid/wallettotal/fstatus/hstatus).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import {
  computeForwarderDebitBatch,
  type ForwarderDebitRow,
  type ForwarderCollectBreakdown,
} from "@/lib/forwarder/forwarder-debit-total";
import { computeShopOrderDebitTotal } from "@/lib/service-order/debit-total";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { SHIP_BY_LABEL } from "@/actions/admin/reports-profit-types";

// ── legacy label maps (function.php · faithful) ──────────────
/** nameProductsType — fproductstype code → label. */
const PRODUCTS_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป", "2": "มอก.", "3": "อย.", "4": "พิเศษ",
};
/** nameTransportType2 — ftransporttype code → label (1=รถ · 2=เรือ). */
const TRANSPORT_TYPE_LABEL: Record<string, string> = {
  "1": "ทางรถ", "2": "ทางเรือ", "3": "ทางอากาศ",
};

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// ════════════════════════════════════════════════════════════
// F5 — linked-document resolver (owner 2026-07-15 · PR178 · "pay-user
// ต้องกดดูใบวางบิล/ใบเสร็จได้ตรงๆ"). Reuses the F9 doc-join pattern from
// forwarders/[fNo]/page.tsx: for a set of forwarder ids, resolve the
// ใบวางบิล (tb_forwarder_invoice_item.forwarder_id → tb_forwarder_invoice)
// + ใบเสร็จ (tb_receipt_item.fid → tb_receipt) that cover each fid.
// READ-ONLY joins · soft-fail (a doc-lookup can NEVER blank the page).
// ════════════════════════════════════════════════════════════

export type PayUserLinkedBill = { id: number; docNo: string; status: string };
export type PayUserLinkedReceipt = { id: number; rid: string; status: string };

async function resolveForwarderDocsByFid(
  admin: ReturnType<typeof createAdminClient>,
  fids: number[],
): Promise<{
  billsByFid: Map<number, PayUserLinkedBill[]>;
  receiptsByFid: Map<number, PayUserLinkedReceipt[]>;
}> {
  const billsByFid = new Map<number, PayUserLinkedBill[]>();
  const receiptsByFid = new Map<number, PayUserLinkedReceipt[]>();
  const ids = Array.from(new Set(fids.filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) return { billsByFid, receiptsByFid };

  // ── ใบวางบิล: tb_forwarder_invoice_item.forwarder_id → tb_forwarder_invoice ──
  const { data: biItems, error: biErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("invoice_id, forwarder_id")
    .in("forwarder_id", ids);
  if (biErr) console.error("[resolveForwarderDocsByFid bill items] failed", { code: biErr.code, message: biErr.message });
  const biRows = (biItems ?? []) as Array<{ invoice_id: number; forwarder_id: number }>;
  const invIds = Array.from(new Set(biRows.map((x) => x.invoice_id)));
  const invById = new Map<number, PayUserLinkedBill>();
  if (invIds.length > 0) {
    const { data: invs, error: invErr } = await admin
      .from("tb_forwarder_invoice")
      .select("id, doc_no, status")
      .in("id", invIds)
      .order("id", { ascending: false });
    if (invErr) console.error("[resolveForwarderDocsByFid bill headers] failed", { code: invErr.code, message: invErr.message });
    for (const iv of (invs ?? []) as Array<{ id: number; doc_no: string | null; status: string | null }>)
      invById.set(iv.id, { id: iv.id, docNo: (iv.doc_no ?? "").trim() || `#${iv.id}`, status: (iv.status ?? "").trim() });
  }
  for (const row of biRows) {
    const bill = invById.get(row.invoice_id);
    if (!bill) continue;
    const list = billsByFid.get(row.forwarder_id) ?? [];
    if (!list.some((b) => b.id === bill.id)) list.push(bill);
    billsByFid.set(row.forwarder_id, list);
  }

  // ── ใบเสร็จ: tb_receipt_item.fid → tb_receipt ──
  const { data: rItems, error: riErr } = await admin
    .from("tb_receipt_item")
    .select("rid, fid")
    .in("fid", ids);
  if (riErr) console.error("[resolveForwarderDocsByFid receipt items] failed", { code: riErr.code, message: riErr.message });
  const riRows = (rItems ?? []) as Array<{ rid: string | null; fid: number }>;
  const rids = Array.from(new Set(riRows.map((x) => (x.rid ?? "").trim()).filter(Boolean)));
  const recByRid = new Map<string, PayUserLinkedReceipt>();
  if (rids.length > 0) {
    const { data: recs, error: recErr } = await admin
      .from("tb_receipt")
      .select("id, rid, rstatus")
      .in("rid", rids)
      .order("id", { ascending: false });
    if (recErr) console.error("[resolveForwarderDocsByFid receipt headers] failed", { code: recErr.code, message: recErr.message });
    for (const rc of (recs ?? []) as Array<{ id: number; rid: string | null; rstatus: string | null }>)
      recByRid.set((rc.rid ?? "").trim(), { id: rc.id, rid: (rc.rid ?? "").trim() || `#${rc.id}`, status: (rc.rstatus ?? "").trim() });
  }
  for (const row of riRows) {
    const rec = recByRid.get((row.rid ?? "").trim());
    if (!rec) continue;
    const list = receiptsByFid.get(row.fid) ?? [];
    if (!list.some((r) => r.id === rec.id)) list.push(rec);
    receiptsByFid.set(row.fid, list);
  }

  return { billsByFid, receiptsByFid };
}

// ════════════════════════════════════════════════════════════
// PANEL — customer + wallet + juristic flag (getWallet.php)
// ════════════════════════════════════════════════════════════

export type PayUserPanel = {
  user: { userid: string; name: string; tel: string | null };
  wallet_balance: number;
  cashback: number;
  /** true = a tb_corporate row exists (drives the 1% ≥฿1,000 preview). */
  is_corporate: boolean;
  /** true = tb_users.userCompany==1 (nิติบุคคล — cannot use wallet on ฝากนำเข้า). */
  is_juristic: boolean;
  /** tb_users.coID — customer tier code (per-customer, NOT on tb_forwarder). */
  coid: string | null;
  /** tb_users.adminIDSale — assigned sales rep (per-customer, NOT on tb_forwarder). */
  adminid_sale: string | null;
};

async function loadPanel(
  admin: ReturnType<typeof createAdminClient>,
  code: string,
): Promise<{ panel: PayUserPanel } | { error: string }> {
  const { data: u, error: uErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userCompany, coID, adminIDSale")
    .eq("userID", code)
    .maybeSingle<{
      userID: string; userName: string | null; userLastName: string | null;
      userTel: string | null; userCompany: string | number | null;
      coID: string | null; adminIDSale: string | null;
    }>();
  if (uErr) {
    console.error("[pay-user-view loadPanel tb_users] failed", { code: uErr.code, message: uErr.message, userid: code });
    return { error: `db_error:${uErr.code ?? "unknown"}` };
  }
  if (!u) return { error: `ไม่พบลูกค้า ${code}` };

  const { data: w, error: wErr } = await admin
    .from("tb_wallet").select("wallettotal").eq("userid", code)
    .maybeSingle<{ wallettotal: number | string | null }>();
  if (wErr) console.error("[pay-user-view loadPanel tb_wallet] failed", { code: wErr.code, message: wErr.message, userid: code });

  const { data: cb, error: cbErr } = await admin
    .from("tb_cash_back").select("cbtotal").eq("userid", code)
    .maybeSingle<{ cbtotal: number | string | null }>();
  if (cbErr && cbErr.code !== "PGRST116") console.error("[pay-user-view loadPanel tb_cash_back] failed", { code: cbErr.code, message: cbErr.message, userid: code });

  const { data: corp, error: corpErr } = await admin
    .from("tb_corporate").select("id").eq("userid", code).limit(1)
    .maybeSingle<{ id: number }>();
  if (corpErr && corpErr.code !== "PGRST116") console.error("[pay-user-view loadPanel tb_corporate] failed", { code: corpErr.code, message: corpErr.message, userid: code });

  return {
    panel: {
      user: {
        userid: u.userID,
        name: [u.userName, u.userLastName].filter(Boolean).join(" ").trim() || u.userID,
        tel: u.userTel,
      },
      wallet_balance: num(w?.wallettotal),
      cashback: num(cb?.cbtotal),
      is_corporate: corp != null,
      is_juristic: String(u.userCompany ?? "") === "1",
      coid: (u.coID ?? "").trim() || null,
      adminid_sale: (u.adminIDSale ?? "").trim() || null,
    },
  };
}

// ════════════════════════════════════════════════════════════
// FORWARDER (ฝากนำเข้า) VIEW — the rich unpaid-items table
// getItem.php keyType==2 · WHERE fStatus='5' OR fCredit=1
// ════════════════════════════════════════════════════════════

export type PayUserFwdRow = {
  fid: string;
  fdate: string | null;            // วันที่สร้าง
  /** ยอดค้างชำระ (net · calcForwarderOutstanding) + its breakdown. */
  price_thb: number;
  breakdown: ForwarderCollectBreakdown;
  is_credit: boolean;
  // customer badges
  coid: string | null;
  is_svip: boolean;
  is_juristic: boolean;
  adminid_sale: string | null;
  fdatetothai: string | null;
  ftransporttype: string | null;   // for the จะมาถึงไทย window + label
  // รายละเอียด
  cover_url: string | null;
  fdetail: string | null;
  products_type_label: string;
  provenance: string | null;       // ฝากนำเข้า:{adminidcreator} / ฝากสั่งซื้อ:{reforder}
  reforder: string | null;
  fnote: string | null;
  fnote_admin_only: boolean;
  // measures
  weight: number;
  cbm: number;
  boxes: number;
  adminid_key: string | null;
  // เลขพัสดุจีน
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  transport_label: string;
  fdatecontainerclose: string | null;
  fpallet: string | null;
  // เลขพัสดุไทย
  ship_by_label: string;
  ftrackingth: string | null;
  // warehouse dates
  fdatestatus2: string | null;     // เข้าโกดัง
  fdatestatus3: string | null;     // ออกโกดัง
  fdatestatus4: string | null;     // ถึงไทย
  // สถานะ / อัปเดต — WHO (adminidupdate) did the last change and WHEN
  // (fdateadminstatus · the "ทำรายการล่าสุด" timestamp the forwarders table shows).
  fstatus: string | null;
  adminid_update: string | null;
  fdateadminstatus: string | null;
  // F5 — เอกสารที่ครอบออเดอร์นี้ (ใบวางบิล / ใบเสร็จ) — pill links (owner PR178).
  bills: PayUserLinkedBill[];
  receipts: PayUserLinkedReceipt[];
};

const FWD_VIEW_COLS =
  "id, fdate, fshipby, paymethod, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, " +
  "ftransportpricechnthb, priceother, fdiscount, fusercompany, ftrackingchn, fstatus, fcredit, " +
  "fdatetothai, ftransporttype, fcover, fdetail, fproductstype, adminidcreator, reforder, " +
  "fnote, fnoteuser, fweight, fvolume, famount, famountcount, adminidkey, fcabinetnumber, " +
  "fdatecontainerclose, fpallet, ftrackingth, fdatestatus2, fdatestatus3, fdatestatus4, adminidupdate, fdateadminstatus";

type FwdRaw = ForwarderDebitRow & {
  fdate: string | null; ftrackingchn: string | null; fstatus: string | null; fcredit: string | null;
  fusercompany: string | number | null;
  fdatetothai: string | null; ftransporttype: string | null; fcover: string | null; fdetail: string | null;
  fproductstype: string | null; adminidcreator: string | null; reforder: string | null; fnote: string | null;
  fnoteuser: string | number | null; fweight: number | string | null; fvolume: number | string | null;
  famount: number | string | null; famountcount: number | string | null; adminidkey: string | null;
  fcabinetnumber: string | null; fdatecontainerclose: string | null; fpallet: string | null;
  ftrackingth: string | null; fdatestatus2: string | null; fdatestatus3: string | null;
  fdatestatus4: string | null; adminidupdate: string | null; fdateadminstatus: string | null;
};

export async function getPayUserForwarderView(
  userCode: string,
): Promise<AdminActionResult<{ panel: PayUserPanel; rows: PayUserFwdRow[]; pendingByStatus?: Array<{ fstatus: string; n: number }> }>> {
  return withAdmin(undefined, async () => {
    const code = (userCode ?? "").trim().toUpperCase();
    if (!code) return { ok: false, error: "กรุณากรอกรหัสลูกค้า" };
    const admin = createAdminClient();

    const p = await loadPanel(admin, code);
    if ("error" in p) return { ok: false, error: p.error };

    // SVIP = a row in tb_rate_custom_cbm (legacy getItem.php).
    const { data: svipRow, error: svipErr } = await admin
      .from("tb_rate_custom_cbm").select("id").eq("userid", code).limit(1)
      .maybeSingle<{ id: number }>();
    if (svipErr && svipErr.code !== "PGRST116") console.error("[getPayUserForwarderView tb_rate_custom_cbm] failed", { code: svipErr.code, message: svipErr.message, userid: code });
    const isSvip = svipRow != null;

    const { data: raw, error: fErr } = await admin
      .from("tb_forwarder")
      .select(FWD_VIEW_COLS)
      .eq("userid", code)
      .or("fstatus.eq.5,fcredit.eq.1")
      .order("id", { ascending: true })
      .limit(500);
    if (fErr) {
      console.error("[getPayUserForwarderView tb_forwarder] failed", { code: fErr.code, message: fErr.message, userid: code });
      return { ok: false, error: `db_error:${fErr.code ?? "unknown"}` };
    }
    const rows = (raw ?? []) as unknown as FwdRaw[];

    // Authoritative per-row price (เหมาๆ ฿50 + 1% นิติ if batch ≥ ฿1000) — same
    // engine the pay action debits, on the SAME eligible set.
    const batch = computeForwarderDebitBatch(rows, { userId: code, isCorporate: p.panel.is_corporate });
    const lineById = new Map(batch.lines.map((l) => [l.id, l]));

    // Batch-resolve the cover thumbnails (parallel).
    const coverMap = await resolveLegacyUrlMap(
      rows.map((r) => ({ id: r.id, filename: r.fcover })),
      "cover",
    );

    // F5 — batch-resolve ใบวางบิล/ใบเสร็จ that cover these fids (an unpaid item
    // may already carry an issued-but-unpaid ใบวางบิล) · soft-fail.
    const { billsByFid, receiptsByFid } = await resolveForwarderDocsByFid(
      admin,
      rows.map((r) => Number(r.id)),
    );

    const out: PayUserFwdRow[] = rows.map((r) => {
      const line = lineById.get(String(r.id));
      const creator = (r.adminidcreator ?? "").trim();
      const refO = (r.reforder ?? "").trim();
      const provenance = refO
        ? `ฝากสั่งซื้อ : ${refO}`
        : creator
          ? `ฝากนำเข้า : ${creator}`
          : "ฝากนำเข้าจาก : ลูกค้า";
      // CBM: if famountcount==1 the fvolume is already the whole-box total.
      const cbm = String(r.famountcount ?? "") === "1"
        ? num(r.fvolume)
        : num(r.fvolume) * (num(r.famount) || 1);
      return {
        fid: String(r.id),
        fdate: r.fdate,
        price_thb: line?.price_thb ?? NaN,
        breakdown: line?.breakdown ?? { freight: 0, otherCharges: 0, discount: 0, maoFee: 0, wht1pct: 0, total: NaN },
        is_credit: (r.fcredit ?? "").trim() === "1",
        coid: p.panel.coid,
        is_svip: isSvip,
        is_juristic: String(r.fusercompany ?? "") === "1" || p.panel.is_juristic,
        adminid_sale: p.panel.adminid_sale,
        fdatetothai: r.fdatetothai && r.fdatetothai !== "0000-00-00" ? r.fdatetothai : null,
        ftransporttype: r.ftransporttype,
        cover_url: coverMap[String(r.id)] ?? null,
        fdetail: r.fdetail,
        products_type_label: PRODUCTS_TYPE_LABEL[String(r.fproductstype ?? "")] ?? "",
        provenance,
        reforder: refO || null,
        fnote: (r.fnote ?? "").trim() || null,
        fnote_admin_only: String(r.fnoteuser ?? "") === "1",
        weight: num(r.fweight),
        cbm,
        boxes: num(r.famount),
        adminid_key: (r.adminidkey ?? "").trim() || null,
        ftrackingchn: (r.ftrackingchn ?? "").trim() || null,
        fcabinetnumber: (r.fcabinetnumber ?? "").trim() || null,
        transport_label: TRANSPORT_TYPE_LABEL[String(r.ftransporttype ?? "")] ?? "",
        fdatecontainerclose: r.fdatecontainerclose && r.fdatecontainerclose !== "0000-00-00" ? r.fdatecontainerclose : null,
        fpallet: (r.fpallet ?? "").trim() || null,
        ship_by_label: SHIP_BY_LABEL[String(r.fshipby ?? "")] ?? (r.fshipby ?? ""),
        ftrackingth: (r.ftrackingth ?? "").trim() || null,
        fdatestatus2: r.fdatestatus2 && r.fdatestatus2 !== "0000-00-00 00:00:00" ? r.fdatestatus2 : null,
        fdatestatus3: r.fdatestatus3 && r.fdatestatus3 !== "0000-00-00 00:00:00" ? r.fdatestatus3 : null,
        fdatestatus4: r.fdatestatus4 && r.fdatestatus4 !== "0000-00-00 00:00:00" ? r.fdatestatus4 : null,
        fstatus: r.fstatus,
        adminid_update: (r.adminidupdate ?? "").trim() || null,
        fdateadminstatus: r.fdateadminstatus && r.fdateadminstatus !== "0000-00-00 00:00:00" ? r.fdateadminstatus : null,
        bills: billsByFid.get(Number(r.id)) ?? [],
        receipts: receiptsByFid.get(Number(r.id)) ?? [],
      };
    }).filter((r) => Number.isFinite(r.price_thb) && r.price_thb > 0);

    // §0g self-explaining (owner 2026-07-16 PR139 "ทำไมกดจ่ายไม่ได้"): when the
    // payable list is EMPTY, tell the staff WHY — the customer's orders exist but
    // sit at an earlier fstatus (e.g. '3' กำลังส่งมาไทย → ยังตั้งราคา/ชำระไม่ได้).
    // One cheap aggregate over the customer's non-final rows; read-only.
    let pendingByStatus: Array<{ fstatus: string; n: number }> = [];
    if (out.length === 0) {
      const { data: allRows, error: allErr } = await admin
        .from("tb_forwarder")
        .select("fstatus")
        .eq("userid", code)
        .in("fstatus", ["1", "2", "3", "4", "5", "6"])
        .limit(2000);
      if (allErr) {
        console.error("[getPayUserForwarderView status-summary] failed", { code: allErr.code, message: allErr.message, userid: code });
      } else {
        const cnt = new Map<string, number>();
        for (const r of (allRows ?? []) as Array<{ fstatus: string | null }>) {
          const s = (r.fstatus ?? "").trim();
          if (s) cnt.set(s, (cnt.get(s) ?? 0) + 1);
        }
        pendingByStatus = [...cnt.entries()].map(([fstatus, n]) => ({ fstatus, n })).sort((a, b) => a.fstatus.localeCompare(b.fstatus));
      }
    }

    return { ok: true, data: { panel: p.panel, rows: out, pendingByStatus } };
  });
}

// ════════════════════════════════════════════════════════════
// SHOP (ฝากสั่งซื้อ) VIEW — getItem.php keyType!=2
// WHERE hStatus='2' AND hDatePayment > NOW()
// ════════════════════════════════════════════════════════════

export type PayUserShopRow = {
  hno: string;
  hdate: string | null;
  title: string | null;
  cover_url: string | null;
  hdatepayment: string | null;
  price_thb: number;
  chprohno: string | null;
};

export async function getPayUserShopView(
  userCode: string,
): Promise<AdminActionResult<{ panel: PayUserPanel; rows: PayUserShopRow[] }>> {
  return withAdmin(undefined, async () => {
    const code = (userCode ?? "").trim().toUpperCase();
    if (!code) return { ok: false, error: "กรุณากรอกรหัสลูกค้า" };
    const admin = createAdminClient();

    const p = await loadPanel(admin, code);
    if ("error" in p) return { ok: false, error: p.error };

    const nowIso = new Date().toISOString();
    const { data: raw, error: oErr } = await admin
      .from("tb_header_order")
      .select("hno, hdate, htitle, hcover, hdatepayment, hstatus, htotalpriceuser, htotalpricechn, hshippingchn, hshippingservice, hrate, chprohno")
      .eq("userid", code)
      .eq("hstatus", "2")
      .gt("hdatepayment", nowIso)
      .order("hdatepayment", { ascending: true })
      .limit(300);
    if (oErr) {
      console.error("[getPayUserShopView tb_header_order] failed", { code: oErr.code, message: oErr.message, userid: code });
      return { ok: false, error: `db_error:${oErr.code ?? "unknown"}` };
    }
    const rows = (raw ?? []) as Array<{
      hno: string; hdate: string | null; htitle: string | null; hcover: string | null;
      hdatepayment: string | null; chprohno: string | null;
    } & Parameters<typeof computeShopOrderDebitTotal>[0]>;

    const coverMap = await resolveLegacyUrlMap(
      rows.map((r) => ({ id: r.hno, filename: r.hcover })),
      "cover",
    );

    const out: PayUserShopRow[] = rows
      .map((r) => ({
        hno: String(r.hno),
        hdate: r.hdate,
        title: r.htitle,
        cover_url: coverMap[String(r.hno)] ?? null,
        hdatepayment: r.hdatepayment,
        price_thb: computeShopOrderDebitTotal(r),
        chprohno: (r.chprohno ?? "").trim() || null,
      }))
      .filter((r) => Number.isFinite(r.price_thb) && r.price_thb > 0);

    return { ok: true, data: { panel: p.panel, rows: out } };
  });
}

// ════════════════════════════════════════════════════════════
// LIST — pay-on-behalf history (pay-users.php L753)
// tb_wallet_hs WHERE adminidcrate<>'' AND type IN (2,4) ORDER date DESC
// ════════════════════════════════════════════════════════════

export type PayUserHistoryRow = {
  id: number;
  date: string | null;
  userid: string | null;
  name: string;
  service_label: string;       // ฝากสั่งซื้อ (type 2) / ฝากนำเข้า (type 4)
  amount: number;
  reforder: string | null;     // รายการอ้างอิง (hNo / forwarder id)
  status: string | null;       // 1 รอดำเนินการ · 2 สำเร็จ · 3 ไม่สำเร็จ
  admin_crate: string | null;  // ผู้ทำรายการ
  /** F5 — ใบวางบิลที่ครอบออเดอร์นี้ (เฉพาะ ฝากนำเข้า type='4'). */
  bills: PayUserLinkedBill[];
  /** F5 — ใบเสร็จที่ครอบออเดอร์นี้ (เฉพาะ ฝากนำเข้า type='4'). */
  receipts: PayUserLinkedReceipt[];
};

const HISTORY_PAGE_SIZE = 50;

export async function listPayUserHistory(
  opts: { page?: number; q?: string; pageSize?: number } = {},
): Promise<AdminActionResult<{ rows: PayUserHistoryRow[]; total: number; page: number; pageSize: number }>> {
  return withAdmin(undefined, async () => {
    const admin = createAdminClient();
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const q = (opts.q ?? "").trim();
    const pageSize = opts.pageSize && opts.pageSize > 0 ? Math.floor(opts.pageSize) : HISTORY_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("tb_wallet_hs")
      .select("id, date, userid, amount, type, status, reforder, adminidcrate", { count: "exact" })
      .neq("adminidcrate", "")
      .not("adminidcrate", "is", null)
      .in("type", ["2", "4"])
      .order("date", { ascending: false });

    if (q) {
      // search on member code OR reference (order/forwarder id) OR admin.
      query = query.or(`userid.ilike.%${q}%,reforder.ilike.%${q}%,adminidcrate.ilike.%${q}%`);
    }
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) {
      console.error("[listPayUserHistory tb_wallet_hs] failed", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    const raw = (data ?? []) as Array<{
      id: number; date: string | null; userid: string | null; amount: number | string | null;
      type: string | null; status: string | null; reforder: string | null; adminidcrate: string | null;
    }>;

    // Resolve customer names in one batched query (join done in JS).
    const userIds = Array.from(new Set(raw.map((r) => (r.userid ?? "").trim()).filter(Boolean)));
    const nameByUser = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users, error: uErr } = await admin
        .from("tb_users").select("userID, userName, userLastName").in("userID", userIds);
      if (uErr) console.error("[listPayUserHistory tb_users] failed", { code: uErr.code, message: uErr.message });
      for (const u of (users ?? []) as Array<{ userID: string; userName: string | null; userLastName: string | null }>) {
        const full = [u.userName, u.userLastName].filter(Boolean).join(" ").trim();
        // avoid "คุณคุณ..." when the stored name already carries the honorific.
        nameByUser.set(u.userID, full ? (full.startsWith("คุณ") ? full : `คุณ${full}`) : u.userID);
      }
    }

    // F5 — resolve ใบวางบิล/ใบเสร็จ per ฝากนำเข้า (type='4') row so staff jump
    // straight to the covering docs (owner PR178 · "ต้องกดดูเอกสารได้ตรงๆ").
    // Scope = type='4' only (reforder=forwarder id); type='2' shop rows keep the
    // order-detail link (their docs live off the header, not a forwarder fid).
    const fwdFids = Array.from(
      new Set(
        raw
          .filter((r) => String(r.type) === "4")
          .map((r) => Number((r.reforder ?? "").trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    );
    const { billsByFid, receiptsByFid } = await resolveForwarderDocsByFid(admin, fwdFids);

    const rows: PayUserHistoryRow[] = raw.map((r) => {
      const isFwd = String(r.type) === "4";
      const fid = isFwd ? Number((r.reforder ?? "").trim()) : NaN;
      return {
        id: r.id,
        date: r.date,
        userid: r.userid,
        name: nameByUser.get((r.userid ?? "").trim()) ?? (r.userid ?? "—"),
        service_label: String(r.type) === "2" ? "ฝากสั่งซื้อ" : String(r.type) === "4" ? "ฝากนำเข้า" : "—",
        amount: num(r.amount),
        reforder: (r.reforder ?? "").trim() || null,
        status: r.status,
        admin_crate: (r.adminidcrate ?? "").trim() || null,
        bills: isFwd && Number.isInteger(fid) ? billsByFid.get(fid) ?? [] : [],
        receipts: isFwd && Number.isInteger(fid) ? receiptsByFid.get(fid) ?? [] : [],
      };
    });

    return { ok: true, data: { rows, total: count ?? rows.length, page, pageSize } };
  });
}
