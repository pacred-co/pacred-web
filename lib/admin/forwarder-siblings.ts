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
  isAdditiveLotBare,
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
 *   • `money`   fields  → UNBILLED siblings only — carrier / paymethod / ค่าส่งไทย.
 *                          The เหมาๆ ฿100 stays charged ONCE per shipment by the
 *                          mao-anchor (this only makes the rows agree on the carrier
 *                          so the anchor is unambiguous).
 *
 * 💰 "UNBILLED" = TWO conditions, both required (เดฟ 2026-07-21 integration review):
 *   1. fstatus ≤ 5 (a row ≥ 6 is paid/settled — never re-touch its money), AND
 *   2. the row is on NO live (non-cancelled) ใบวางบิล — a row can sit at fstatus 5
 *      and ALREADY be on an ISSUED bill whose total is frozen (verified prod
 *      2026-07-21: 43 such rows across 7 shipments · e.g. PR179 1782453952 = 31 rows
 *      on FRI2607-00091 "issued", one carrying ค่าส่งไทย ฿200). Re-pricing those
 *      silently drifts the row away from the document the customer was billed with.
 *      This mirrors the residue-absorb hard guard (split-box-rows.ts "on an invoice
 *      — accounting must resolve") — the same money rule, one behaviour.
 *   Fail-CLOSED: if the invoice lookup errors we skip the MONEY half entirely
 *   (address still propagates — it is display/delivery only).
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
    const READ_CAP = 500;
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, ftransportprice, paydeposit, fweight")
      .eq("userid", userid)
      .ilike("ftrackingchn", `${base}%`)
      .neq("id", landed.id)
      .limit(READ_CAP);
    if (error) {
      console.error("[propagateShipmentEdit read]", { code: error.code, message: error.message, base, userid });
      return out;
    }
    // The cap is applied BEFORE the exact-base filter, so a near-prefix crowd could
    // hide real siblings — say so loudly instead of writing a silent subset.
    if ((data ?? []).length >= READ_CAP) {
      console.error("[propagateShipmentEdit read] hit the row cap — propagation may be partial", { base, userid, cap: READ_CAP });
    }
    // EXACT base match only — "178055573" must not absorb "1780555731".
    const siblings = (data ?? []).filter(
      (r) => baseTracking((r as { ftrackingchn?: string | null }).ftrackingchn) === base,
    ) as {
      id: number;
      ftrackingchn: string | null;
      fstatus: string | null;
      ftransportprice: number | string | null;
      paydeposit: string | null;
      fweight: number | string | null;
    }[];
    if (siblings.length === 0) return out;

    // Address goes to every sibling still IN OUR HANDS. A row already out for
    // delivery / delivered (fstatus >= 7) or cancelled ('99') is history — the
    // driver already has its stop and the docs are snapshotted; silently rewriting
    // its address would rewrite that history (เดฟ 2026-07-21 integration review).
    const addressIds = siblings
      .filter((s) => {
        const st = parseInt(s.fstatus ?? "", 10);
        return Number.isFinite(st) && st >= 1 && st <= 6;
      })
      .map((s) => s.id);
    // Money candidates: unpaid by status AND not advance-paid.
    // ⚠️ fstatus >= 6 is NOT the only "already collected" marker — a PAID วางบิลล่วงหน้า
    // deliberately KEEPS fstatus 2/3/4 (goods still in China) and marks paydeposit='1'
    // (actions/admin/billing-run.ts). Those rows are settled money; re-pricing them
    // silently deletes a domestic leg the customer already paid (เดฟ 2026-07-21 review).
    let moneyIds = siblings
      .filter((s) => {
        const st = parseInt(s.fstatus ?? "", 10);
        if (!(Number.isFinite(st) && st >= 1 && st <= 5)) return false; // ''/null/'0'/'99'
        return String(s.paydeposit ?? "").trim() !== "1"; // advance-billed + PAID → hands off
      })
      .map((s) => s.id);

    // ── DISJOINT LOTS — a bare + "-N" pair is NOT always one shipment ───────────
    // MOMO sometimes keys ONE tracking as TWO REAL LOTS (prod PR9820 908007350691 =
    // a 5-box bare lot + "-2" a separate 1-box lot · same class 60527103087). Those
    // lots can legitimately differ in carrier/price. Prefix grouping fuses them, so a
    // MONEY write on one lot would overwrite the other's charge. Detect the shape with
    // the SAME discriminator the ตรวจตู้ Σ + the commit guard use (isAdditiveLotBare)
    // and, when it holds, SKIP the money half entirely (address still propagates —
    // both lots go to the same customer). Fail-CLOSED: a lookup error → skip money.
    if (hasMoney && moneyIds.length > 0) {
      const all = [
        ...siblings,
        { id: landed.id, ftrackingchn: landed.ftrackingchn ?? "", fweight: null as number | string | null },
      ];
      const bareRow = all.find((r) => (r.ftrackingchn ?? "").trim() === base);
      const sufRows = all.filter((r) => (r.ftrackingchn ?? "").trim() !== base);
      if (bareRow && sufRows.length > 0) {
        // The DISJOINT signal is the bare's OWN box line carrying MORE THAN ONE piece:
        // a proper box-split lists the bare as box #1 (quantity 1), a disjoint lot lists
        // it as its own multi-box lot (prod 908007350691 = 5 ชิ้น). Requiring qty > 1
        // keeps normal split families propagating (they are one shipment).
        const { data: bareBox, error: boxErr } = await admin
          .from("momo_box_detail")
          .select("box_tracking, quantity")
          .eq("base_tracking", base)
          .eq("box_tracking", base)
          .limit(1);
        if (boxErr) {
          console.error("[propagateShipmentEdit disjoint-check]", { code: boxErr.code, message: boxErr.message, base });
          moneyIds = [];
        } else if (
          (bareBox ?? []).length > 0 &&
          Math.round(Number((bareBox as Array<{ quantity: number | string | null }>)[0]?.quantity) || 0) > 1
        ) {
          const bareW = Number((bareRow as { fweight?: number | string | null }).fweight) || 0;
          const sufW = sufRows.reduce((s, r) => s + (Number((r as { fweight?: number | string | null }).fweight) || 0), 0);
          if (bareW > 0 && isAdditiveLotBare({ bareValue: bareW, siblingValueSum: sufW, bareHasOwnBox: true })) {
            console.warn("[propagateShipmentEdit] disjoint lots — ไม่ propagate ฝั่งเงินข้ามล็อต", { base, bareW, sufW });
            moneyIds = [];
          }
        }
      }
    }
    // … AND not already carried on a live ใบวางบิล (frozen total · see the header note).
    if (hasMoney && moneyIds.length > 0) {
      // Embed shape mirrors the proven lib/forwarder/open-bill.ts reader (status is
      // filtered in JS — PostgREST returns the embed as object OR 1-element array).
      const { data: onBill, error: billErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("forwarder_id, tb_forwarder_invoice!inner(status)")
        .in("forwarder_id", moneyIds);
      if (billErr) {
        // fail-CLOSED — an unverifiable bill state must not let a re-price through.
        console.error("[propagateShipmentEdit invoice-guard]", { code: billErr.code, message: billErr.message, base });
        moneyIds = [];
      } else {
        const billed = new Set<number>();
        for (const row of (onBill ?? []) as unknown as Array<{
          forwarder_id: number;
          tb_forwarder_invoice?: { status?: string } | { status?: string }[] | null;
        }>) {
          const inv = Array.isArray(row.tb_forwarder_invoice)
            ? row.tb_forwarder_invoice[0]
            : row.tb_forwarder_invoice;
          if (inv && inv.status !== "cancelled") billed.add(Number(row.forwarder_id));
        }
        if (billed.size > 0) moneyIds = moneyIds.filter((id) => !billed.has(id));
      }
    }

    if (hasAddress && addressIds.length > 0) {
      const { error: aErr } = await admin
        .from("tb_forwarder")
        .update({ ...fields.address, adminidupdate: legacyAdminId })
        .in("id", addressIds);
      if (aErr) console.error("[propagateShipmentEdit address]", { code: aErr.code, message: aErr.message });
      else out.addressSiblings = addressIds.length;
    }
    // 💰 paymethod is the ONE lever that decides whether a row's ค่าส่งไทย enters the
    // bill (`domesticLeg = paymethod===2 ? 0 : ftransportprice` · outstanding.ts +
    // forwarder-debit-total.ts). Flipping it on a sibling that still carries its OWN
    // non-zero quote silently moves money (6 boxes × ฿311 appearing/disappearing —
    // the 2026-07-18 phantom-domestic-leg class). So paymethod only rides along when
    // the write ALSO normalises that row's price (the flat own-fleet ftransportprice:0
    // case) or the row's price is already 0 → then the propagation is money-NEUTRAL by
    // construction. Rows with a live own quote keep their วิธีเก็บเงิน; the carrier
    // still propagates so the shipment reads as one carrier (เดฟ 2026-07-21 review).
    const moneyFields = { ...(fields.money ?? {}) };
    const setsPrice = Object.prototype.hasOwnProperty.call(moneyFields, "ftransportprice");
    const carriesPaymethod = Object.prototype.hasOwnProperty.call(moneyFields, "paymethod");
    let neutralIds = moneyIds;
    let pricedIds: number[] = [];
    if (hasMoney && carriesPaymethod && !setsPrice) {
      const priceById = new Map(siblings.map((s) => [s.id, Number(s.ftransportprice) || 0]));
      neutralIds = moneyIds.filter((id) => (priceById.get(id) ?? 0) === 0);
      pricedIds = moneyIds.filter((id) => (priceById.get(id) ?? 0) > 0);
    }
    // Rows that keep their own quote: everything EXCEPT paymethod (money-neutral).
    if (pricedIds.length > 0) {
      const withoutPay: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(moneyFields)) if (k !== "paymethod") withoutPay[k] = v;
      if (Object.keys(withoutPay).length > 0) {
        const { error: pErr } = await admin
          .from("tb_forwarder")
          .update({ ...withoutPay, adminidupdate: legacyAdminId })
          .in("id", pricedIds);
        if (pErr) console.error("[propagateShipmentEdit money-keep-pay]", { code: pErr.code, message: pErr.message });
        else out.moneySiblings += pricedIds.length;
      }
      console.warn("[propagateShipmentEdit] วิธีเก็บเงิน ไม่ propagate ไปแถวที่มีค่าส่งไทยของตัวเอง (กันยอดบิลขยับเงียบๆ)", { base, kept: pricedIds });
    }
    moneyIds = neutralIds;
    if (hasMoney && moneyIds.length > 0) {
      const { error: mErr } = await admin
        .from("tb_forwarder")
        .update({ ...moneyFields, adminidupdate: legacyAdminId })
        .in("id", moneyIds);
      if (mErr) console.error("[propagateShipmentEdit money]", { code: mErr.code, message: mErr.message });
      else out.moneySiblings += moneyIds.length;
    }
  } catch (e) {
    console.error("[propagateShipmentEdit]", e instanceof Error ? e.message : String(e));
  }
  return out;
}
