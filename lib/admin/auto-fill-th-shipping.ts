import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveAutoThShippingFill,
  type AutoThShippingFill,
} from "@/lib/forwarder/domestic-shipping";
import { isMaoCarrier } from "@/lib/forwarder/mao-fee";

/**
 * autoFillThShippingForForwarder — พี่ป๊อป spec #7 (owner 2026-07-08 · "ต้อง auto").
 *
 * The billing surface (report-cnt "แจ้งหนี้ลูกค้า" / forwarder-check bulk-bill)
 * must let the operator go ตรวจตู้ → เก็บเงิน CONTINUOUSLY. Today a ฿0 ค่าส่งไทย
 * (ftransportprice) blocks that — the operator has to detour to the domestic-ship
 * editor first. This reads the order's OWN delivery address and, if a TH cost is
 * still owed (฿0 + a delivery leg), auto-fills the recommended zone default
 * (เหมาๆ ฿100 in-zone · Flash by weight upcountry) so the bill just works.
 *
 * MONEY-SAFE by construction:
 *   • pure zone logic lives in `resolveAutoThShippingFill` (returns null when it
 *     can't/shouldn't auto — already set · self-pickup · manual carrier · no addr)
 *   • the UPDATE re-guards `ftransportprice IS NULL OR = 0` so a concurrent manual
 *     fill is never clobbered (TOCTOU-safe)
 *   • best-effort: an update error returns null → the caller bills with the row's
 *     existing cost + the "ห้ามลืมค่าส่งไทย" gate stays as the backstop
 *
 * Returns the fill that was applied (for a UI toast), or null when nothing changed.
 * The caller should treat a non-null return's `.cost` as the row's TH cost when it
 * computes the outstanding balance (the in-memory row it already read is stale).
 */
export async function autoFillThShippingForForwarder(
  admin: ReturnType<typeof createAdminClient>,
  fId: number,
  /** owner 2026-07-18 ("เรทค่าขนส่งไม่ยอมขึ้น auto · Flash/J&T เก็บตามจริง") — the
   *  measure-save + carrier-select hooks pass `costOnly: true`: fill ONLY the quoted
   *  ftransportprice (fill-when-empty) and NEVER rewrite the carrier/paymethod the
   *  admin just chose (the full rewrite is reserved for the billing surfaces). */
  opts?: { costOnly?: boolean },
): Promise<AutoThShippingFill | null> {
  const { data: row, error } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, fcabinetnumber, fshipby, ftransportprice, faddresszipcode, faddressprovince, faddressdistrict, fweight, fwidth, flength, fheight",
    )
    .eq("id", fId)
    .maybeSingle<{
      id: number;
      userid: string | null;
      fcabinetnumber: string | null;
      fshipby: string | null;
      ftransportprice: number | string | null;
      faddresszipcode: string | null;
      faddressprovince: string | null;
      faddressdistrict: string | null;
      fweight: number | string | null;
      fwidth: number | string | null;
      flength: number | string | null;
      fheight: number | string | null;
    }>();
  if (error || !row) return null;

  // 🔴 GUARD (owner 2026-07-18 "ค่าบริการอื่นๆ 7,004 ไม่มีค่านี้") — a เหมาๆ own-fleet
  // shipment's domestic delivery IS the ฿100 flat maoFee. Do NOT auto-fill a per-tracking
  // ftransportprice on it (the pay-modal sums it ON TOP of the ฿100 = double-charge). The
  // shipment is เหมาๆ if the row's own carrier is PCSF/PRF, OR (empty carrier) a sibling of
  // the SAME (customer, container) is — the empty-carrier siblings inherit the เหมาๆ delivery.
  const cab = (row.fcabinetnumber ?? "").trim();
  let shipmentIsMao = isMaoCarrier(row.fshipby);
  if (!shipmentIsMao && (row.fshipby ?? "").trim() === "" && cab && row.userid) {
    const { data: sib } = await admin
      .from("tb_forwarder")
      .select("id")
      .eq("userid", row.userid)
      .eq("fcabinetnumber", cab)
      .in("fshipby", ["PCSF", "PRF"])
      .limit(1);
    shipmentIsMao = !!(sib && sib.length > 0);
  }
  if (shipmentIsMao) return null; // เหมาๆ = ฿100 flat only · never a per-tracking domestic leg

  // girth (w+l+h, cm) — Flash prices by max(kg, size); pass it so a light/bulky
  // parcel isn't under-quoted. 0 when dims are unknown (weight-only path is safe).
  const sizeCm =
    (Number(row.fwidth) || 0) + (Number(row.flength) || 0) + (Number(row.fheight) || 0);

  const fill = resolveAutoThShippingFill({
    fshipby: row.fshipby,
    ftransportprice: row.ftransportprice,
    zip: row.faddresszipcode,
    province: row.faddressprovince,
    amphoe: row.faddressdistrict,
    weightKg: Number(row.fweight) || 0,
    sizeCm,
  });
  if (!fill) return null;

  // Write only the delivery decision. The re-guard (ftransportprice still ฿0/null)
  // makes a concurrent manual fill win — 0 rows updated → we return null so the
  // caller doesn't over-report a cost that didn't land.
  // costOnly (measure/carrier hooks): record ONLY the quoted cost — the carrier +
  // paymethod the admin chose stay untouched. Skip a ฿0 quote (nothing to record).
  if (opts?.costOnly && !(fill.cost > 0)) return null;
  const patch = opts?.costOnly
    ? { ftransportprice: fill.cost }
    : { fshipby: fill.carrier, paymethod: fill.payMethod, ftransportprice: fill.cost };
  const { data: updated, error: updErr } = await admin
    .from("tb_forwarder")
    .update(patch)
    .eq("id", fId)
    .or("ftransportprice.is.null,ftransportprice.eq.0")
    .select("id");
  if (updErr || !updated || updated.length === 0) return null;

  return fill;
}
