"use server";

/**
 * Export-all (CSV) for /admin/forwarder-check — the bulk-bill-customer queue.
 *
 * The page (app/[locale]/(admin)/admin/forwarder-check/page.tsx) lists the
 * tb_check_forwarder queue joined to tb_forwarder (fstatus<5) + tb_users
 * (name/credit/company) + tb_forwarder_import2 (partial-import) + tb_promotion,
 * filtered by the ?q= tab ('' all · 'c' credit · 'n' normal). The on-screen
 * "⬇ CSV หน้านี้" downloads only the rows currently rendered; this action
 * backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered queue (capped at
 * EXPORT_CAP), then writes an admin_export_log audit row (PII: customer names +
 * delivery address · MONEY: cost/profit columns — owner directive 2026-06-07).
 *
 * DRIFT-FREE (AGENTS rule A): the page builds its rows INLINE (no shared
 * paginated fetch to parameterize), so this helper REPLICATES the page's
 * pipeline byte-for-byte:
 *   1. tb_check_forwarder .order("date",desc) — same, but cap lifted from the
 *      page's .limit(500) window to EXPORT_CAP (the only difference).
 *   2. tb_forwarder .in("id", fids) with the IDENTICAL select cols, then the
 *      same post-fetch `parseInt(fstatus)<5` filter.
 *   3. tb_users join, tb_forwarder_import2 + tb_promotion optional joins.
 *   4. The same row shaping (calcForwarderOutstanding · onePercent · profit).
 *   5. The same ?q= tab filter (all / credit / normal).
 *
 * COLUMN-IDENTICAL (AGENTS rule B): the CSV row keys + value mapping mirror the
 * page's CsvButton 1:1, and the money columns (cost/1%/profit) are included
 * ONLY when `showMoneyColumns` is true — the SAME gate the page applies.
 *
 * PLACEMENT (AGENTS rule D): new co-located file; the page wires it via an
 * inline "use server" closure capturing `tab` + `showMoneyColumns`. Does NOT
 * touch csv-button.tsx / export-log.ts / leads.* / any other surface.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { logAdminExport } from "@/actions/admin/export-log";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors leads EXPORT_CAP).
const EXPORT_CAP = 10000;

type CheckQueueRow = {
  fID: number;
  date: string | null;
  adminID: string | null;
};

type ForwarderRawRow = {
  id: number;
  fstatus: string;
  fidorco: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  userid: string;
  famount: number | null;
  famountcount: string | null;
  fvolume: number | null;
  fweight: number | null;
  ftransporttype: string;
  frefrate: number | null;
  frefprice: string;
  fdetail: string | null;
  fnote: string | null;
  fcover: string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  fusercompany: number | string | null;
  fcosttotalprice: number | string | null;
  fcosttotalpricesheet: number | string | null;
  fshipby: string | null;
  paymethod: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
};

type UserRawRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userCredit: string | null;
};


/**
 * Export the entire filtered forwarder-check queue as CSV rows.
 *
 * @param tab               the page's resolved ?q= tab: 'all' | 'c' | 'n'
 * @param showMoneyColumns  the page's role-gated money-column flag (must be
 *                          passed in identically — the export NEVER recomputes
 *                          the gate independently)
 */
export async function exportForwarderCheckAll(
  tab: "all" | "c" | "n",
  showMoneyColumns: boolean,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same role gate as the page (super · ops · accounting). `requireAdmin` here
  // re-asserts auth on the server-action boundary.
  const { roles } = await requireAdmin(["super", "ops", "accounting"]);
  // MONEY: never trust the client-passed `showMoneyColumns` — re-validate against
  // the caller's real roles so a `super`/`ops` caller can't set it true to export
  // cost/profit. Money columns ship ONLY for ultra/accounting/pricing (mig 0189).
  const showMoney = showMoneyColumns && canViewCostProfit(roles);

  const admin = createAdminClient();

  // ── Step 1: Load the queue (same order as page · cap lifted to EXPORT_CAP) ──
  const { data: queueRaw, error: queueErr } = await admin
    .from("tb_check_forwarder")
    .select("fID, date, adminID")
    .order("date", { ascending: false, nullsFirst: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (queueErr) {
    console.error(`[exportForwarderCheckAll tb_check_forwarder] failed`, {
      code: queueErr.code,
      message: queueErr.message,
    });
    return { rows: [], truncated: false };
  }
  const allQueue = (queueRaw ?? []) as unknown as CheckQueueRow[];
  // truncated if the queue itself overflowed the cap (the "all" tab is the
  // queue size · honest truncation flag on the largest possible result).
  const truncated = allQueue.length > EXPORT_CAP;
  const queue = truncated ? allQueue.slice(0, EXPORT_CAP) : allQueue;
  const queueByFid = new Map<number, CheckQueueRow>(queue.map((q) => [q.fID, q]));
  const fids = queue.map((q) => q.fID);

  if (fids.length === 0) {
    await logAdminExport({
      dataset: "forwarder-check",
      filters: { tab, showMoneyColumns },
      rowCount: 0,
      truncated: false,
    });
    return { rows: [], truncated: false };
  }

  // ── Step 2: Load the forwarder rows (IDENTICAL select · same fstatus<5) ──
  const { data: forwarderRaw, error: forwarderErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fstatus, fidorco, ftrackingchn, fcabinetnumber, userid, " +
        "famount, famountcount, fvolume, fweight, ftransporttype, frefrate, frefprice, " +
        "fdetail, fnote, fcover, " +
        "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
        "pricecrate, ftransportpricechnthb, priceother, fdiscount, " +
        "fusercompany, fcosttotalprice, fcosttotalpricesheet, " +
        "fshipby, paymethod, faddressdistrict, faddressprovince, faddresszipcode",
    )
    .in("id", fids);
  if (forwarderErr) {
    console.error(`[exportForwarderCheckAll tb_forwarder] failed`, {
      code: forwarderErr.code,
      message: forwarderErr.message,
    });
    return { rows: [], truncated: false };
  }
  const forwarders = ((forwarderRaw ?? []) as unknown as ForwarderRawRow[])
    // Same race-defensive legacy fStatus<5 filter as the page.
    .filter((r) => parseInt(r.fstatus, 10) < 5);

  // ── Step 3: Join tb_users ──
  const uniqueUserIds = Array.from(
    new Set(forwarders.map((r) => r.userid).filter(Boolean)),
  );
  let usersById = new Map<string, UserRawRow>();
  if (uniqueUserIds.length > 0) {
    const { data: userRaw, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany, userCredit")
      .in("userID", uniqueUserIds);
    if (userErr) {
      console.error(`[exportForwarderCheckAll tb_users] failed`, {
        code: userErr.code,
        message: userErr.message,
      });
    }
    usersById = new Map(
      ((userRaw ?? []) as unknown as UserRawRow[]).map((u) => [u.userID, u]),
    );
  }

  // NOTE: the page also joins tb_forwarder_import2 (partial-import amount) +
  // tb_promotion (promo badge) for its on-screen cells, but NEITHER is a CSV
  // column, so the export omits both joins (dead weight for the file). The
  // exported column set still matches the page's CsvButton cols exactly.

  // ── Step 6: Shape the same intermediate values the page computes ──
  // (cover thumbnails are display-only · omitted from CSV)
  type Shaped = {
    id: number;
    fno_cargo: string | null;
    tracking_chn: string | null;
    cabinet_number: string | null;
    userid: string;
    customer_name: string;
    customer_company: number;
    user_credit: string;
    amount: number;
    weight_kg: number;
    volume_cbm: number;
    transport_type: string;
    outstanding_thb: number;
    ship_by: string;
    pay_method: string | null;
    address_district: string | null;
    address_province: string | null;
    address_zipcode: string | null;
    check_added_at: string | null;
    check_added_by: string | null;
    cost_total_price: number;
    one_percent: number;
    profit_item: number;
  };

  let shaped: Shaped[] = forwarders.map((r) => {
    const user = usersById.get(r.userid);
    const queueRow = queueByFid.get(r.id);
    const customerName = user
      ? `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim()
      : "";
    const customerCompany = user?.userCompany === "1" ? 1 : 0;
    const outstanding = calcForwarderOutstanding(r);
    const priceFull =
      Number(r.ftotalprice ?? 0) +
      Number(r.ftransportprice ?? 0) +
      Number(r.fpriceupdate ?? 0) +
      Number(r.fshippingservice ?? 0) +
      Number(r.pricecrate ?? 0) +
      Number(r.ftransportpricechnthb ?? 0) +
      Number(r.priceother ?? 0) -
      Number(r.fdiscount ?? 0);
    const onePercent =
      customerCompany === 1 && priceFull >= 1000
        ? Math.round(priceFull * 0.01 * 100) / 100
        : 0;
    const profit =
      priceFull -
      onePercent -
      (Number(r.fcosttotalprice ?? 0) +
        Number(r.fshippingservice ?? 0) +
        Number(r.pricecrate ?? 0) +
        Number(r.ftransportpricechnthb ?? 0) +
        Number(r.ftransportprice ?? 0));

    return {
      id: r.id,
      fno_cargo: r.fidorco,
      tracking_chn: r.ftrackingchn,
      cabinet_number: r.fcabinetnumber,
      userid: r.userid,
      customer_name: customerName,
      customer_company: customerCompany,
      user_credit: user?.userCredit ?? "0",
      amount: Number(r.famount ?? 0),
      weight_kg: Number(r.fweight ?? 0),
      volume_cbm: Number(r.fvolume ?? 0),
      transport_type: r.ftransporttype,
      outstanding_thb: outstanding,
      ship_by: r.fshipby ?? "",
      pay_method: r.paymethod,
      address_district: r.faddressdistrict,
      address_province: r.faddressprovince,
      address_zipcode: r.faddresszipcode,
      check_added_at: queueRow?.date ?? null,
      check_added_by: queueRow?.adminID ?? null,
      cost_total_price: Number(r.fcosttotalprice ?? 0),
      one_percent: onePercent,
      profit_item: Math.round(profit * 100) / 100,
    };
  });

  // ── Step 7: Apply the same ?q= tab filter (legacy WHERE userCredit=1 / <>1) ──
  if (tab === "c") {
    shaped = shaped.filter((r) => r.user_credit === "1");
  } else if (tab === "n") {
    shaped = shaped.filter((r) => r.user_credit !== "1");
  }

  // ── Step 8: Map to CSV rows — IDENTICAL keys/value-mapping to the page ──
  const rows: CsvRow[] = shaped.map((r) => {
    const row: CsvRow = {
      id: r.id,
      fno_cargo: r.fno_cargo ?? "",
      tracking_chn: r.tracking_chn ?? "",
      cabinet_number: r.cabinet_number ?? "",
      userid: r.userid,
      customer_name: r.customer_name,
      customer_type: r.customer_company === 1 ? "นิติบุคคล" : "บุคคล",
      credit_type: r.user_credit === "1" ? "เครดิต" : "ปกติ",
      amount: r.amount,
      weight_kg: r.weight_kg.toFixed(2),
      volume_cbm: r.volume_cbm.toFixed(4),
      transport:
        r.transport_type === "1"
          ? "รถ"
          : r.transport_type === "2"
            ? "เรือ"
            : r.transport_type === "3"
              ? "แอร์"
              : r.transport_type,
      outstanding_thb: r.outstanding_thb.toFixed(2),
      ship_by: r.ship_by,
      pay_method: r.pay_method ?? "",
      address: [r.address_district, r.address_province, r.address_zipcode]
        .filter(Boolean)
        .join(" "),
      check_added_at: r.check_added_at ?? "",
      check_added_by: r.check_added_by ?? "",
      // Money columns — included ONLY for a caller who may see cost/profit
      // (server-re-validated, NOT the raw client flag).
      ...(showMoney
        ? {
            cost_total_price: r.cost_total_price.toFixed(2),
            one_percent: r.one_percent.toFixed(2),
            profit_item: r.profit_item.toFixed(2),
          }
        : {}),
    };
    return row;
  });

  await logAdminExport({
    dataset: "forwarder-check",
    filters: { tab, showMoneyColumns },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
