"use server";

/**
 * Exec-cockpit PER-SERVICE P&L (owner 2026-06-28 · "แยกแต่ละบริการที่เข้ามา · มีรวม").
 *
 * The cockpit headline reads tb_forwarder (ฝากนำเข้า) ONLY — so it HID the other
 * services (shop alone is ~3× the import revenue MTD). This surfaces all four as
 * one overview with a รวมทุกบริการ total:
 *   • ฝากสั่งซื้อ (shop)   tb_header_order  rev=htotalpriceuser cost=hcostallth
 *   • โอนหยวน (yuan)       tb_payment       rev=paythb         cost=paythbcost
 *   • ฝากนำเข้า (import)   tb_forwarder     rev=ftotalprice    cost=fcosttotalprice
 *   • freight (เหมาตู้/แชร์ตู้) freight_shipments cost=cost_total_thb profit=profit_margin_thb
 *
 * Cost-once (owner #6): a shop order that spawns a forwarder would double-count —
 * but tb_forwarder.reforder is empty on all current rows (0 linked), so the four
 * buckets don't overlap today. If shop→forwarder linking returns, dedup the
 * forwarder COST whose reforder points at a shop order (TODO · check PCS model).
 * Import cost reuses the cockpit's anomaly-guard so a corrupt cost row can't tank
 * a service card (the F52093-style poison · owner 2026-06-27).
 *
 * Read-only · cost/profit gated by canViewCostProfit · degrades per service (§0c).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { logger } from "@/lib/logger";
import type { ServicePnlRow } from "./reports-cockpit-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };

const LIMIT = 20_000;
const ANOMALY_ABS_THB = 50_000;
const ANOMALY_RATIO = 5;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function getCockpitServiceBreakdown(): Promise<Ok<{ rows: ServicePnlRow[]; showCost: boolean }> | Err> {
  const { roles } = await requireAdmin(["super", "accounting", "ops", "sales", "sales_admin"]);
  const showCost = canViewCostProfit(roles);
  try {
    const admin = createAdminClient();
    const m = monthStartIso();
    const mTs = `${m}T00:00:00Z`;

    const [shopRes, yuanRes, impRes, frRes] = await Promise.all([
      admin.from("tb_header_order").select("htotalpriceuser, hcostallth, hstatus").gte("hdate", m).neq("hstatus", "6").limit(LIMIT),
      admin.from("tb_payment").select("paythb, paythbcost, paystatus").gte("paydate", m).neq("paystatus", "3").limit(LIMIT),
      admin.from("tb_forwarder").select("ftotalprice, fcosttotalprice").gte("fdate", mTs).neq("fstatus", "99").limit(LIMIT),
      admin.from("freight_shipments").select("cost_total_thb, profit_margin_thb").gte("created_at", mTs).limit(LIMIT),
    ]);

    const rows: ServicePnlRow[] = [];
    const push = (key: string, label: string, res: { data: unknown[] | null; error: unknown }, rev: (r: Record<string, unknown>) => number, cost: (r: Record<string, unknown>) => number, prof?: (r: Record<string, unknown>) => number) => {
      if (res.error) { logger.error("reports", `cockpit-service ${key} failed`, res.error); rows.push({ key, label, count: 0, revenue: 0, cost: 0, profit: 0, margin_pct: 0, failed: true }); return; }
      const data = (res.data ?? []) as Record<string, unknown>[];
      let R = 0, C = 0, P = 0;
      for (const r of data) {
        const rv = rev(r), cv = cost(r);
        // import anomaly-guard (corrupt cost ≫ rev) — skip from the money sum.
        if (key === "import" && cv > ANOMALY_ABS_THB && !(rv > 0 && cv <= rv * ANOMALY_RATIO)) continue;
        R += rv; C += cv; P += prof ? prof(r) : rv - cv;
      }
      rows.push({ key, label, count: data.length, revenue: R, cost: showCost ? C : 0, profit: showCost ? P : 0, margin_pct: R > 0 ? (P / R) * 100 : 0, failed: false });
    };

    push("shop", "ฝากสั่งซื้อ", shopRes, (r) => num(r.htotalpriceuser), (r) => num(r.hcostallth));
    push("yuan", "โอนหยวน", yuanRes, (r) => num(r.paythb), (r) => num(r.paythbcost), (r) => num(r.paythb) - num(r.paythbcost));
    push("import", "ฝากนำเข้า", impRes, (r) => num(r.ftotalprice), (r) => num(r.fcosttotalprice));
    push("freight", "Freight (เหมาตู้/แชร์ตู้)", frRes, (r) => num(r.cost_total_thb) + num(r.profit_margin_thb), (r) => num(r.cost_total_thb), (r) => num(r.profit_margin_thb));

    return { ok: true, data: { rows, showCost } };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "cockpit-service threw", err);
    return { ok: false, error: err.message };
  }
}
