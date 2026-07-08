import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveAutoThShippingFill,
  type AutoThShippingFill,
} from "@/lib/forwarder/domestic-shipping";

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
): Promise<AutoThShippingFill | null> {
  const { data: row, error } = await admin
    .from("tb_forwarder")
    .select(
      "id, fshipby, ftransportprice, faddresszipcode, faddressprovince, faddressdistrict, fweight",
    )
    .eq("id", fId)
    .maybeSingle<{
      id: number;
      fshipby: string | null;
      ftransportprice: number | string | null;
      faddresszipcode: string | null;
      faddressprovince: string | null;
      faddressdistrict: string | null;
      fweight: number | string | null;
    }>();
  if (error || !row) return null;

  const fill = resolveAutoThShippingFill({
    fshipby: row.fshipby,
    ftransportprice: row.ftransportprice,
    zip: row.faddresszipcode,
    province: row.faddressprovince,
    amphoe: row.faddressdistrict,
    weightKg: Number(row.fweight) || 0,
  });
  if (!fill) return null;

  // Write only the delivery decision. The re-guard (ftransportprice still ฿0/null)
  // makes a concurrent manual fill win — 0 rows updated → we return null so the
  // caller doesn't over-report a cost that didn't land.
  const { data: updated, error: updErr } = await admin
    .from("tb_forwarder")
    .update({
      fshipby: fill.carrier,
      paymethod: fill.payMethod,
      ftransportprice: fill.cost,
    })
    .eq("id", fId)
    .or("ftransportprice.is.null,ftransportprice.eq.0")
    .select("id");
  if (updErr || !updated || updated.length === 0) return null;

  return fill;
}
