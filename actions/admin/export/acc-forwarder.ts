"use server";

/**
 * "Export all filtered" CSV for /admin/accounting/forwarder (รายงานฝากนำเข้า) —
 * owner directive 2026-06-07 (accounting wants the reconciliation list in a
 * spreadsheet).
 *
 * The page (app/[locale]/(admin)/admin/accounting/forwarder/page.tsx) loads the
 * FULL filtered result set in 6 passes (it does NOT paginate at the DB level —
 * it computes totals over the whole set then client-slices `pageRows` for
 * display, per the PERF comment there). This action re-runs those EXACT same
 * 6 passes with the SAME resolved date range + userType filter, applies the
 * SAME per-row money math, and maps to the SAME CSV columns the page's
 * CsvButton emits — so the export can never drift from the on-screen table.
 * Every full export is audited via admin_export_log (logAdminExport): the rows
 * carry customer name + tax-ID PII.
 *
 * RBAC matches the page: super / accounting.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path. 10,000 comfortably covers a
// single month's cleared forwarder revenue in one file while bounding the
// in-memory build. If a filtered slice ever exceeds this, the export flags
// `truncated` so the operator knows to narrow the date range.
const EXPORT_CAP = 10000;

/** One CSV row for the acc-forwarder export (matches the on-screen columns). */
export type AccForwarderExportRow = Record<string, string | number | null | undefined>;

/** Active filters the page passes through (mirrors the page's resolved filter). */
export type AccForwarderExportFilter = {
  /** Resolved range start (YYYY-MM-DD) — same as the page computes. */
  startDate: string;
  /** Resolved range end (YYYY-MM-DD) — same as the page computes. */
  endDate: string;
  /** all / "1" (ทั่วไป) / "2" (นิติบุคคล). */
  userType: string;
};

// ── Legacy formatter — same as the page's numberFormat2 ──────────────────────
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type WalletForwarderRaw = {
  date: string | null;
  amount: number | string;
  reforder: string;
};

type ForwarderRaw = {
  id: number;
  fdate: string | null;
  ftrackingchn: string;
  fcabinetnumber: string;
  fcosttotalprice: number | string;
  ftotalprice: number | string;
  ftransportprice: number | string;
  fpriceupdate: number | string;
  fshippingservice: number | string | null;
  pricecrate: number | string;
  ftransportpricechnthb: number | string;
  priceother: number | string;
  fdiscount: number | string;
  fusercompany: string | null;
  userid: string;
};

/**
 * Export the ENTIRE filtered รายงานฝากนำเข้า list (all rows, capped at
 * EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's
 * exact 6-pass filtered query (date range + userType), unpaginated. Writes an
 * admin_export_log audit row (name + tax-ID walk-off trail).
 */
export async function exportAccForwarderAll(
  filter: AccForwarderExportFilter,
): Promise<{ rows: AccForwarderExportRow[]; truncated: boolean }> {
  // RBAC — same roles the page gates on.
  const { roles } = await requireAdmin(["super", "accounting"]);
  // MONEY: `cost` + `service_fee` (profit = customerPay − cost) are money-internal.
  // The action MUST self-validate — a direct/crafted call by a `super` user must
  // NOT be able to export cost/profit. Omit those keys server-side when the
  // caller is not ultra/accounting/pricing (owner 2026-06-18, mig 0189).
  const showMoney = canViewCostProfit(roles);

  const admin = createAdminClient();

  const startDate = filter.startDate;
  const endDate = filter.endDate;
  const userType = filter.userType === "1" || filter.userType === "2" ? filter.userType : "all";

  // ── Pass 1: type=4 (ฝากนำเข้า) wallet events in range, cleared status ──
  const walletRes = await admin
    .from("tb_wallet_hs")
    .select("date, amount, reforder")
    .eq("type", "4")
    .not("status", "in", "(1,3)")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true });
  if (walletRes.error) {
    console.error("[exportAccForwarderAll] tb_wallet_hs query failed", {
      code: walletRes.error.code,
      message: walletRes.error.message,
    });
    return { rows: [], truncated: false };
  }
  const walletRows = (walletRes.data ?? []) as unknown as WalletForwarderRaw[];

  const forwarderIds = Array.from(
    new Set(
      walletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );

  // ── Pass 2: tb_forwarder rows for those ids ──────────────────────────
  const forwarderById = new Map<number, ForwarderRaw>();
  if (forwarderIds.length > 0) {
    const fRes = await admin
      .from("tb_forwarder")
      .select(
        "id, fdate, ftrackingchn, fcabinetnumber, fcosttotalprice, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany, userid",
      )
      .in("id", forwarderIds);
    if (fRes.error) {
      console.error("[exportAccForwarderAll] tb_forwarder query failed", {
        code: fRes.error.code,
        message: fRes.error.message,
      });
      return { rows: [], truncated: false };
    }
    for (const f of (fRes.data ?? []) as unknown as ForwarderRaw[]) {
      forwarderById.set(f.id, f);
    }
  }

  // ── Pass 3: tb_users for the customer-name display ───────────────────
  const userIds = Array.from(
    new Set(
      Array.from(forwarderById.values())
        .map((f) => f.userid)
        .filter(Boolean),
    ),
  );
  const userById = new Map<string, { username: string; userlastname: string }>();
  if (userIds.length > 0) {
    const usersRes = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", userIds);
    if (usersRes.error) {
      console.error("[exportAccForwarderAll] tb_users query failed", {
        code: usersRes.error.code,
        message: usersRes.error.message,
      });
    }
    for (const u of (usersRes.data ?? []) as Array<{
      userID: string;
      userName: string;
      userLastName: string;
    }>) {
      userById.set(u.userID, { username: u.userName, userlastname: u.userLastName });
    }
  }

  // ── Pass 4: tb_corporate (LEFT JOIN by userid) — flags นิติบุคคล ──────
  const corporateByUserId = new Map<
    string,
    { corporatenumber: string; corporatename: string }
  >();
  if (userIds.length > 0) {
    const cpRes = await admin
      .from("tb_corporate")
      .select("userid, corporatenumber, corporatename")
      .in("userid", userIds);
    if (cpRes.error) {
      console.error("[exportAccForwarderAll] tb_corporate query failed", {
        code: cpRes.error.code,
        message: cpRes.error.message,
      });
    }
    for (const c of (cpRes.data ?? []) as Array<{
      userid: string;
      corporatenumber: string;
      corporatename: string;
    }>) {
      if (!corporateByUserId.has(c.userid)) {
        corporateByUserId.set(c.userid, {
          corporatenumber: c.corporatenumber,
          corporatename: c.corporatename,
        });
      }
    }
  }

  // ── Pass 5: tb_receipt_item — tax-invoice number per fid ─────────────
  const ridByFid = new Map<number, string>();
  if (forwarderIds.length > 0) {
    const riRes = await admin
      .from("tb_receipt_item")
      .select("fid, rid")
      .in("fid", forwarderIds);
    if (riRes.error) {
      console.error("[exportAccForwarderAll] tb_receipt_item query failed", {
        code: riRes.error.code,
        message: riRes.error.message,
      });
    }
    for (const r of (riRes.data ?? []) as Array<{ fid: number; rid: string }>) {
      if (!ridByFid.has(r.fid)) ridByFid.set(r.fid, r.rid);
    }
  }

  // ── Assemble rows in legacy order (wh.date ASC), one per fid ─────────
  const seenFids = new Set<number>();
  const rows: AccForwarderExportRow[] = [];
  for (const w of walletRows) {
    if (rows.length >= EXPORT_CAP) break;
    const fid = Number(w.reforder);
    if (!Number.isFinite(fid) || fid <= 0) continue;
    if (seenFids.has(fid)) continue;
    const f = forwarderById.get(fid);
    if (!f) continue;

    const cp = corporateByUserId.get(f.userid);
    if (userType === "1" && cp) continue;
    if (userType === "2" && !cp) continue;

    seenFids.add(fid);
    const u = userById.get(f.userid) ?? { username: "", userlastname: "" };

    // SAME per-row math as the page (acc-forwarder.php-faithful).
    const fcosttotalprice = Number(f.fcosttotalprice);
    const ftotalprice = Number(f.ftotalprice);
    const ftransportprice = Number(f.ftransportprice);
    const fpriceupdate = Number(f.fpriceupdate);
    const fshippingservice = Number(f.fshippingservice ?? 0);
    const pricecrate = Number(f.pricecrate);
    const ftransportpricechnthb = Number(f.ftransportpricechnthb);
    const priceother = Number(f.priceother);
    const fdiscount = Number(f.fdiscount);
    const isCompany = f.fusercompany === "1";

    const fCostTotalPrice =
      fcosttotalprice +
      ftransportprice +
      fshippingservice +
      pricecrate +
      priceother +
      fpriceupdate +
      ftransportpricechnthb;
    const fTotalPriceNotDis =
      ftotalprice +
      ftransportprice +
      fpriceupdate +
      fshippingservice +
      pricecrate +
      ftransportpricechnthb +
      priceother;
    const fTotalPrice = fTotalPriceNotDis - fdiscount;
    const walletPayUser = isCompany ? fTotalPrice - fTotalPrice * 0.01 : fTotalPrice;

    const corpNumber = cp?.corporatenumber && cp.corporatenumber !== "" ? cp.corporatenumber : "";
    // Juristic → company name (reuse the Pass-4 tb_corporate row).
    const identity = resolveBillingIdentity({
      userCompany: f.fusercompany,
      userName: u.username,
      userLastName: u.userlastname,
      corp: cp
        ? {
            corporatename: cp.corporatename,
            corporatenumber: cp.corporatenumber,
            corporateaddress: null,
          }
        : null,
    });

    rows.push({
      pay_date: w.date ? String(w.date).slice(0, 10) : "",
      create_date: f.fdate ? String(f.fdate).slice(0, 10) : "",
      order_id: f.id,
      tracking: f.ftrackingchn ?? "",
      cabinet: f.fcabinetnumber ?? "",
      ...(showMoney ? { cost: numberFormat2(fCostTotalPrice) } : {}),
      real_price: numberFormat2(fTotalPriceNotDis),
      discount: numberFormat2(fdiscount),
      goods_value: numberFormat2(fTotalPrice),
      customer_pay: numberFormat2(walletPayUser),
      wht: isCompany ? numberFormat2(fTotalPrice * 0.01) : "-",
      ...(showMoney ? { service_fee: numberFormat2(walletPayUser - fCostTotalPrice) } : {}),
      member_code: f.userid,
      tax_id: corpNumber || "-",
      name: identity.name,
      receipt_no: ridByFid.get(f.id) ?? "",
    });
  }

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "acc-forwarder",
    filters: { startDate, endDate, userType },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
