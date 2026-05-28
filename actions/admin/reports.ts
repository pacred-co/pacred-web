/**
 * Gap #8 — Admin reports data layer (faithful ports of legacy PCS Cargo
 * `report-*.php` SQL → Supabase reads).
 *
 * Every fetcher:
 *   - Reads via `createAdminClient()` (RLS-bypass — admin only).
 *   - Returns `{ ok: true, data } | { ok: false; error }` per house conventions.
 *   - Matches the legacy SQL's column set + sort order + status filters.
 *   - Date-range as `{ from: YYYY-MM-DD, to: YYYY-MM-DD }` (inclusive).
 *
 *   See: docs/research/d1-deep-audit-2026-05-24.md §1 Gap #8.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";

type Ok<T>  = { ok: true; data: T };
type Err    = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const LIMIT = 10_000;

// ════════════════════════════════════════════════════════════════════════
// 1) Monthly sales-by-rep — legacy: report-sale.php
//    SQL group: (MONTH(created_at), sales rep). Commission = 1% of revenue.
// ════════════════════════════════════════════════════════════════════════

export type SalesMonthlyRow = {
  rep_id:        string;        // profiles.sales_admin_id
  month:         string;        // YYYY-MM
  order_count:   number;
  weight_kg:     number;
  volume_cbm:    number;
  revenue_thb:   number;        // matches legacy fTotalPrice+fTransportPrice+fPriceUpdate ≈ our total_price
  commission_thb: number;       // 1% of revenue (legacy: row.price * 0.01)
};

export async function getSalesMonthlyReport(range: DateRange): Promise<Result<SalesMonthlyRow[]>> {
  try {
    const admin = createAdminClient();

    // Pull "delivered" forwarders (legacy fStatus=7 → status='delivered')
    // in the window — these are the orders that pay sales commission.
    // Legacy joins `tb_sales_report.srDate` (= fDateStatus7) → our
    // `date_delivered` column. Join customer→sales rep.
    const { data, error } = await admin
      .from("forwarders")
      .select("id, weight_kg, volume_cbm, total_price, status, created_at, date_delivered, profile_id, profiles!profile_id(sales_admin_id)")
      .eq("status", "delivered")
      .gte("date_delivered", dayStartIso(range.from))
      .lte("date_delivered", dayEndIso(range.to))
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "sales-monthly query failed", error);
      return { ok: false, error: error.message };
    }

    // The Supabase relationship returns `profiles` as the joined object;
    // type it loosely + normalise to a string rep ID (or "(ไม่มี sales rep)").
    type Row = {
      weight_kg:      number | null;
      volume_cbm:     number | null;
      total_price:    number | null;
      date_delivered: string | null;
      profiles:       { sales_admin_id: string | null } | { sales_admin_id: string | null }[] | null;
    };

    function repOf(r: Row): string {
      const p = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
      return p?.sales_admin_id ?? "(ไม่มี sales rep)";
    }
    function monthOf(iso: string | null): string {
      if (!iso) return "—";
      return iso.slice(0, 7); // YYYY-MM
    }

    const aggMap = new Map<string, SalesMonthlyRow>();
    for (const r of (data ?? []) as Row[]) {
      const rep   = repOf(r);
      const month = monthOf(r.date_delivered);
      const key   = `${month}::${rep}`;
      const a = aggMap.get(key) ?? {
        rep_id: rep, month,
        order_count: 0, weight_kg: 0, volume_cbm: 0,
        revenue_thb: 0, commission_thb: 0,
      };
      a.order_count    += 1;
      a.weight_kg      += Number(r.weight_kg  ?? 0);
      a.volume_cbm     += Number(r.volume_cbm ?? 0);
      a.revenue_thb    += Number(r.total_price ?? 0);
      a.commission_thb = a.revenue_thb * 0.01;       // legacy: 1 %
      aggMap.set(key, a);
    }

    // Newest month first, then highest revenue.
    const rows = Array.from(aggMap.values()).sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return b.revenue_thb - a.revenue_thb;
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "sales-monthly threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2) Forwarder profit — legacy: report-forwarder-profit.php
//    Order-by-order P&L. Cost = `cost_total_price` (legacy fCostTotalPrice).
//    Profit = `profit_total` if set, else (total_price - cost_total_price).
// ════════════════════════════════════════════════════════════════════════

export type ForwarderProfitRow = {
  id:             string;
  f_no:           string;
  member_code:    string;
  customer_name:  string;
  source_warehouse: string;
  transport_type: string;
  weight_kg:      number;
  volume_cbm:     number;
  cost_total:     number;
  sale_total:     number;
  profit:         number;
  vat7:           number;        // legacy: profit * 0.07
  status:         string;
  created_at:     string;
};

export async function getForwarderProfitReport(range: DateRange): Promise<Result<ForwarderProfitRow[]>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("forwarders")
      .select(`id, f_no, status, source_warehouse, transport_type, weight_kg, volume_cbm,
        total_price, cost_total_price, profit_total, created_at,
        profiles!profile_id(member_code, first_name, last_name)`)
      .gte("created_at", dayStartIso(range.from))
      .lte("created_at", dayEndIso(range.to))
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "forwarder-profit query failed", error);
      return { ok: false, error: error.message };
    }

    type Row = {
      id: string; f_no: string | null; status: string;
      source_warehouse: string; transport_type: string;
      weight_kg: number | null; volume_cbm: number | null;
      total_price: number | null;
      cost_total_price: number | null;
      profit_total: number | null;
      created_at: string;
      profiles: { member_code: string | null; first_name: string | null; last_name: string | null }
              | { member_code: string | null; first_name: string | null; last_name: string | null }[]
              | null;
    };

    const rows: ForwarderProfitRow[] = ((data ?? []) as Row[]).map((r) => {
      const p = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
      const sale = Number(r.total_price ?? 0);
      const cost = Number(r.cost_total_price ?? 0);
      const profit = r.profit_total != null ? Number(r.profit_total) : (sale - cost);
      return {
        id: r.id,
        f_no: r.f_no ?? "",
        member_code:   p?.member_code ?? "",
        customer_name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—",
        source_warehouse: r.source_warehouse,
        transport_type:   r.transport_type,
        weight_kg:        Number(r.weight_kg ?? 0),
        volume_cbm:       Number(r.volume_cbm ?? 0),
        cost_total: cost,
        sale_total: sale,
        profit,
        vat7: profit > 0 ? profit * 0.07 : 0,
        status: r.status,
        created_at: r.created_at,
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "forwarder-profit threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 3) Shops profit — legacy: report-shops-profit.php
//    Order-by-order P&L for ฝากสั่งซื้อ.
//    Cost = `cost_all_thb` (legacy hCostAllTH).
//    Sale = `total_thb`     (legacy hTotalPriceUser).
//    Profit = sale - cost. VAT 7% = profit * 0.07.
// ════════════════════════════════════════════════════════════════════════

export type ShopsProfitRow = {
  id:            string;
  h_no:          string;
  member_code:   string;
  customer_name: string;
  title:         string;
  item_count:    number;
  cost_thb:      number;
  sale_thb:      number;
  service_fee:   number;      // profit (legacy: priceUser - pricePCS)
  vat7:          number;
  status:        string;
  created_at:    string;
};

export async function getShopsProfitReport(range: DateRange): Promise<Result<ShopsProfitRow[]>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("service_orders")
      .select(`id, h_no, status, title, item_count, total_thb, cost_all_thb, created_at,
        profiles!profile_id(member_code, first_name, last_name)`)
      .gte("created_at", dayStartIso(range.from))
      .lte("created_at", dayEndIso(range.to))
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "shops-profit query failed", error);
      return { ok: false, error: error.message };
    }

    type Row = {
      id: string; h_no: string | null; status: string;
      title: string | null; item_count: number | null;
      total_thb: number | null; cost_all_thb: number | null;
      created_at: string;
      profiles: { member_code: string | null; first_name: string | null; last_name: string | null }
              | { member_code: string | null; first_name: string | null; last_name: string | null }[]
              | null;
    };

    const rows: ShopsProfitRow[] = ((data ?? []) as Row[]).map((r) => {
      const p = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
      const sale = Number(r.total_thb ?? 0);
      const cost = Number(r.cost_all_thb ?? 0);
      const profit = sale - cost;
      return {
        id: r.id,
        h_no: r.h_no ?? "",
        member_code:   p?.member_code ?? "",
        customer_name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—",
        title:        r.title ?? "—",
        item_count:   Number(r.item_count ?? 0),
        cost_thb:     cost,
        sale_thb:     sale,
        service_fee:  profit,
        vat7:         profit > 0 ? profit * 0.07 : 0,
        status:       r.status,
        created_at:   r.created_at,
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "shops-profit threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 4) Yuan-transfer profit — legacy: report-payments-profit.php
//    Cost = `cost_thb` (legacy payTHBCost). Sale = `thb_amount` (legacy payTHB).
//    Profit = sale - cost. Same VAT 7% rule.
// ════════════════════════════════════════════════════════════════════════

export type YuanProfitRow = {
  id:            string;
  member_code:   string;
  customer_name: string;
  channel:       string;
  yuan_amount:   number;
  cost_rate:     number | null;
  exchange_rate: number;
  cost_thb:      number;
  sale_thb:      number;
  profit:        number;
  vat7:          number;
  status:        string;
  created_at:    string;
};

export async function getYuanProfitReport(range: DateRange): Promise<Result<YuanProfitRow[]>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("yuan_payments")
      .select(`id, channel, yuan_amount, exchange_rate, cost_rate, thb_amount, cost_thb, profit_thb,
        status, created_at,
        profiles!profile_id(member_code, first_name, last_name)`)
      .gte("created_at", dayStartIso(range.from))
      .lte("created_at", dayEndIso(range.to))
      .not("status", "in", "(cancelled,rejected,failed)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "yuan-profit query failed", error);
      return { ok: false, error: error.message };
    }

    type Row = {
      id: string; channel: string | null;
      yuan_amount: number | null; exchange_rate: number | null;
      cost_rate: number | null; thb_amount: number | null;
      cost_thb: number | null; profit_thb: number | null;
      status: string; created_at: string;
      profiles: { member_code: string | null; first_name: string | null; last_name: string | null }
              | { member_code: string | null; first_name: string | null; last_name: string | null }[]
              | null;
    };

    const rows: YuanProfitRow[] = ((data ?? []) as Row[]).map((r) => {
      const p = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
      const sale = Number(r.thb_amount ?? 0);
      const cost = Number(r.cost_thb ?? 0);
      const profit = r.profit_thb != null ? Number(r.profit_thb) : (sale - cost);
      return {
        id: r.id,
        member_code:   p?.member_code ?? "",
        customer_name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—",
        channel:       r.channel ?? "—",
        yuan_amount:   Number(r.yuan_amount ?? 0),
        exchange_rate: Number(r.exchange_rate ?? 0),
        cost_rate:     r.cost_rate != null ? Number(r.cost_rate) : null,
        cost_thb:      cost,
        sale_thb:      sale,
        profit,
        vat7: profit > 0 ? profit * 0.07 : 0,
        status: r.status,
        created_at: r.created_at,
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "yuan-profit threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 5) OTP success — legacy: report-otp-success.php
//    List of customers who completed OTP verification (any purpose).
//    Pacred: `otp_codes` table keyed by phone — we join to `profiles.phone`.
//    Legacy table: tb_users_otp (userID-keyed). Closest faithful port given
//    the schema rebuild.
// ════════════════════════════════════════════════════════════════════════

export type OtpSuccessRow = {
  id:           string;
  date:         string;        // ISO timestamp
  phone:        string;
  member_code:  string;
  customer_name: string;
  purpose:      string;
};

export async function getOtpSuccessReport(range: DateRange): Promise<Result<OtpSuccessRow[]>> {
  try {
    const admin = createAdminClient();

    // Step 1 — pull the OTPs (by phone, used=true, within window).
    const { data: otps, error } = await admin
      .from("otp_codes")
      .select("id, phone, purpose, created_at, used")
      .eq("used", true)
      .gte("created_at", dayStartIso(range.from))
      .lte("created_at", dayEndIso(range.to))
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "otp-success query failed", error);
      return { ok: false, error: error.message };
    }

    const otpRows = (otps ?? []) as Array<{
      id: string; phone: string; purpose: string; created_at: string;
    }>;

    // Step 2 — join phone → profile (separate query is cheaper than a big OR).
    const phones = Array.from(new Set(otpRows.map((o) => o.phone)));
    let phoneToProfile = new Map<string, { member_code: string | null; first_name: string | null; last_name: string | null }>();
    if (phones.length > 0) {
      const { data: profs, error: profsErr } = await admin
        .from("profiles")
        .select("phone, member_code, first_name, last_name")
        .in("phone", phones)
        .limit(LIMIT);
      if (profsErr) {
        console.error(`[profiles list] failed`, { code: profsErr.code, message: profsErr.message });
      }
      phoneToProfile = new Map((profs ?? []).map((p) => [p.phone as string, p]));
    }

    const rows: OtpSuccessRow[] = otpRows.map((o) => {
      const p = phoneToProfile.get(o.phone);
      return {
        id:   o.id,
        date: o.created_at,
        phone: o.phone,
        member_code:   p?.member_code ?? "",
        customer_name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—",
        purpose: o.purpose,
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "otp-success threw", err);
    return { ok: false, error: err.message };
  }
}
