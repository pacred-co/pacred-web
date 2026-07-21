/**
 * SINGLE source of truth for "which tb_forwarder rows make up ONE shipment".
 *
 * A split parcel = several tb_forwarder rows that share (baseTracking, userid)
 * — MOMO `-N/M` boxes or a manually-split order. The detail page renders the
 * landed row's order, but the รายการสินค้า table AND the ยอดเก็บจริง collect calc
 * must BOTH span the whole sibling set, or they disagree on scope.
 *
 * ภูม 2026-06-23: that exact drift was a money bug — the ยอดเก็บจริง box summed
 * the ONE landed row (฿410) while the items table summed all 6 siblings (฿4,424).
 * Routing both surfaces through this one helper makes them physically unable to
 * disagree again.
 *
 * Logic mirrors the original inline fetch in forwarder-import-items-table.tsx:
 * narrow by a prefix ILIKE, keep EXACT baseTracking matches (so "178055573"
 * doesn't absorb "1780555731"), drop the MOMO หัวบิล bill-header
 * (filterCountableForwarderRows), and sort by box suffix. On ANY db error or an
 * empty result, fall back to `[landed]` — never lose the landed row.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  baseTracking,
  trackingSuffix,
  filterCountableForwarderRows,
} from "./momo-bill-header";

// The column superset both callers need: the items-table display fields + the
// collect-calc pricing fields (fshipby drives the เหมาๆ/PCSF detection). A caller
// may pass a narrower select; the default covers everything.
export const FORWARDER_SIBLING_SELECT =
  "id, userid, fshipby, paymethod, ftrackingchn, reforder, fdetail, fproductstype, famount, famountcount, " +
  "fweight, fvolume, fwidth, flength, fheight, fwarehousename, frefprice, frefrate, ftotalprice, " +
  "fpriceupdate, pricecrate, ftransportpricechnthb, ftransportprice, fshippingservice, priceother, fdiscount";

/**
 * Fetch the countable sibling tracking rows for a landed forwarder order.
 *
 * Generic over the landed row type `T` — each caller passes its own row shape
 * (+ matching `select`) and gets the same shape back, reading whatever subset it
 * needs. The shared part (which rows ARE siblings, drop the หัวบิล, sort) lives
 * here so it can never drift between the two surfaces.
 */
export async function fetchCountableForwarderSiblings<
  T extends {
    id: number;
    ftrackingchn?: string | null;
    fweight?: number | string | null;
    userid?: string | null;
  },
>(admin: SupabaseClient, landed: T, select: string = FORWARDER_SIBLING_SELECT): Promise<T[]> {
  const base = baseTracking(landed.ftrackingchn);
  let rows: T[] = [landed];
  if (base && landed.userid) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(select)
      .eq("userid", landed.userid)
      .ilike("ftrackingchn", `${base}%`)
      .limit(200);
    if (error) {
      console.error("[fetchCountableForwarderSiblings]", {
        code: error.code, message: error.message, base, userid: landed.userid,
      });
    } else {
      const exact = ((data ?? []) as unknown as T[]).filter(
        (row) => baseTracking(row.ftrackingchn) === base,
      );
      if (exact.length > 0) rows = exact;
    }
  }
  const num = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const countable = filterCountableForwarderRows(rows, {
    tracking: (row) => row.ftrackingchn,
    weight: (row) => Number(row.fweight ?? 0),
    userid: (row) => row.userid ?? "",
    // A row carrying billable money is NEVER a หัวบิล placeholder — protects a MOMO
    // box-split anchor whose own box is dims-only (fweight=0 · has ftotalprice) from being
    // dropped from ยอดเก็บจริง / ใบวางบิล (money review 2026-07-03). FORWARDER_SIBLING_SELECT
    // carries these columns; a narrower caller-select reads 0 → falls back to weight-only.
    money: (row) => {
      const r = row as Record<string, unknown>;
      return (
        num(r.ftotalprice) + num(r.ftransportprice) + num(r.fpriceupdate) +
        num(r.fshippingservice) + num(r.pricecrate) + num(r.ftransportpricechnthb) + num(r.priceother)
      );
    },
  });
  return (countable.length > 0 ? countable : rows)
    .slice()
    .sort(
      (a, b) =>
        trackingSuffix(a.ftrackingchn) - trackingSuffix(b.ftrackingchn) || a.id - b.id,
    );
}

/**
 * ── SHIPMENT-LEVEL edit propagation (owner/ภูม 2026-07-21) ────────────────────
 * A MOMO box-split shipment is several tb_forwarder rows (base + `-N/M`) that are
 * ONE physical shipment — "โต๊ะสนุ๊ก" split into legs + body. Legacy had 1 row per
 * shipment, so address/carrier/เหมาๆ were naturally one unit; Pacred's N-row split
 * broke that (edit ONE box → the others kept a stale/different address+carrier →
 * "หลายขนส่ง" + a shipment billed with 2 addresses).
 *
 * This applies a shipment-level edit from the landed row to its SIBLINGS so the
 * whole shipment stays consistent:
 *   • `address` fields  → ALL siblings (delivery info · money-neutral · a driver
 *                          must see one address; issued docs snapshot separately).
 *   • `money`   fields  → UNBILLED siblings only (fstatus ≤ 5) — carrier / paymethod
 *                          / re-priced ค่าส่งไทย. Billed rows (≥ 6) are settled; never
 *                          re-touch their money. The เหมาๆ ฿100 stays charged ONCE
 *                          per shipment by the mao-anchor (this only makes the rows
 *                          agree on the carrier so the anchor is unambiguous).
 *
 * The landed row itself is excluded (the caller already wrote it). Best-effort:
 * any db error is logged and swallowed — it must never fail the caller's primary
 * single-row edit that already succeeded. Returns how many siblings each half hit.
 */
export async function propagateShipmentEdit(
  admin: SupabaseClient,
  landed: { id: number; ftrackingchn?: string | null; userid?: string | null },
  fields: {
    address?: Record<string, string | number>;
    money?: Record<string, string | number>;
  },
  legacyAdminId: string,
): Promise<{ addressSiblings: number; moneySiblings: number }> {
  const out = { addressSiblings: 0, moneySiblings: 0 };
  const base = baseTracking(landed.ftrackingchn);
  const userid = (landed.userid ?? "").trim();
  const hasAddress = fields.address && Object.keys(fields.address).length > 0;
  const hasMoney = fields.money && Object.keys(fields.money).length > 0;
  if (!base || !userid || (!hasAddress && !hasMoney)) return out;

  try {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus")
      .eq("userid", userid)
      .ilike("ftrackingchn", `${base}%`)
      .neq("id", landed.id)
      .limit(200);
    if (error) {
      console.error("[propagateShipmentEdit read]", { code: error.code, message: error.message, base, userid });
      return out;
    }
    // EXACT base match only — "178055573" must not absorb "1780555731".
    const siblings = (data ?? []).filter(
      (r) => baseTracking((r as { ftrackingchn?: string | null }).ftrackingchn) === base,
    ) as { id: number; fstatus: string | null }[];
    if (siblings.length === 0) return out;

    const addressIds = siblings.map((s) => s.id);
    const moneyIds = siblings
      .filter((s) => (parseInt(s.fstatus ?? "0", 10) || 0) <= 5)
      .map((s) => s.id);

    if (hasAddress && addressIds.length > 0) {
      const { error: aErr } = await admin
        .from("tb_forwarder")
        .update({ ...fields.address, adminidupdate: legacyAdminId })
        .in("id", addressIds);
      if (aErr) console.error("[propagateShipmentEdit address]", { code: aErr.code, message: aErr.message });
      else out.addressSiblings = addressIds.length;
    }
    if (hasMoney && moneyIds.length > 0) {
      const { error: mErr } = await admin
        .from("tb_forwarder")
        .update({ ...fields.money, adminidupdate: legacyAdminId })
        .in("id", moneyIds);
      if (mErr) console.error("[propagateShipmentEdit money]", { code: mErr.code, message: mErr.message });
      else out.moneySiblings = moneyIds.length;
    }
  } catch (e) {
    console.error("[propagateShipmentEdit]", e instanceof Error ? e.message : String(e));
  }
  return out;
}
