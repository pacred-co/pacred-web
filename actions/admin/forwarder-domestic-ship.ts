"use server";

/**
 * adminSetForwarderDomesticShipping — apply the zone-aware in-Thailand delivery
 * choice to a forwarder order (owner 2026-06-22: smart selector · ต่างจังหวัด
 * บังคับเก็บปลายทาง).
 *
 * Writes ONLY the delivery decision on tb_forwarder:
 *   - fshipby          = carrier code (PRF เหมาๆ / '2' Flash / '24' J&T / PCS / …)
 *   - paymethod        = '1' ต้นทาง · '2' ปลายทาง(COD) — upcountry is FORCED to '2'
 *   - ftransportprice  = the in-Thailand delivery cost (ค่าขนส่งไทย)
 * It does NOT touch the China→TH freight (the per-tracking editor owns that and
 * round-trips ftransportprice on its next save, so the two never clobber).
 *
 * The carrier/cost/payMethod are RE-DERIVED server-side from the order's own
 * delivery address (never trust the client) via domesticShippingOptions, so a
 * tampered client can't, e.g., bill an upcountry parcel as ต้นทาง or pick เหมาๆ
 * out of zone. For a manual carrier (J&T/ไปรษณีย์/PCS Express) the admin-typed
 * cost is accepted; for Flash/เหมาๆ the server cost wins.
 *
 * Casing: tb_forwarder columns are lowercase. RBAC: ops/accounting/super/warehouse
 * (+ god roles via withAdmin). Audit-logged.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { domesticShippingOptions } from "@/lib/forwarder/domestic-shipping";

const schema = z.object({
  fId: z.number().int().positive(),
  carrier: z.string().trim().min(1).max(10),
  /** admin-typed cost — only honored for a manual carrier; server cost wins otherwise */
  manualCost: z.number().min(0).max(999_999).optional(),
});
export type SetDomesticShipInput = z.infer<typeof schema>;

async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error("[forwarder-domestic-ship admin]", error.message);
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin.from("tb_admin").select("adminID").eq("adminEmail", email).maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error("[forwarder-domestic-ship tb_admin]", aErr.message);
  return data?.adminID ?? email.slice(0, 10);
}

export async function adminSetForwarderDomesticShipping(
  raw: SetDomesticShipInput,
): Promise<AdminActionResult<{ carrier: string; cost: number; payMethod: string; zone: string }>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { fId, carrier, manualCost } = parsed.data;

  return withAdmin(["ops", "accounting", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // 1. Read the order's delivery address + parcel (server is the source of truth).
    const { data: fwd, error: readErr } = await admin
      .from("tb_forwarder")
      .select("id, faddresszipcode, faddressprovince, faddressdistrict, fweight, fvolume")
      .eq("id", fId)
      .maybeSingle<{
        id: number; faddresszipcode: string | null; faddressprovince: string | null;
        faddressdistrict: string | null; fweight: number | string | null; fvolume: number | string | null;
      }>();
    if (readErr) {
      console.error("[adminSetForwarderDomesticShipping read]", { code: readErr.code, message: readErr.message, fId });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${readErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // 2. Re-derive the eligible options for THIS address; the chosen carrier must
    //    be one of them (else a stale/tampered pick).
    const { zone, options } = domesticShippingOptions({
      addressID: null,
      zip: fwd.faddresszipcode,
      province: fwd.faddressprovince,
      amphoe: fwd.faddressdistrict,
      weightKg: Number(fwd.fweight) || 0,
    });
    const chosen = options.find((o) => o.carrier === carrier);
    if (!chosen) {
      return { ok: false, error: `ตัวเลือกขนส่งไม่ถูกต้องสำหรับที่อยู่นี้ (เขต: ${zone})` };
    }

    // 3. Cost: server cost for auto carriers; admin-typed for manual ones.
    const cost = chosen.manual ? Math.max(0, Number(manualCost) || 0) : chosen.cost;
    // payMethod: upcountry is FORCED to COD ('2') regardless of carrier default.
    const payMethod = chosen.forceCod ? "2" : chosen.payMethod;
    if (chosen.manual && cost <= 0 && carrier !== "PCS") {
      return { ok: false, error: "กรุณากรอกค่าส่งสำหรับขนส่งนี้ (มากกว่า 0)" };
    }

    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
    const { data: updated, error: updErr } = await admin
      .from("tb_forwarder")
      .update({ fshipby: carrier, paymethod: payMethod, ftransportprice: cost, adminidupdate: legacyAdminId })
      .eq("id", fId)
      .select("id");
    if (updErr) {
      console.error("[adminSetForwarderDomesticShipping update]", { code: updErr.code, message: updErr.message, fId });
      return { ok: false, error: `บันทึกการจัดส่งไม่สำเร็จ: ${updErr.message}` };
    }
    if (!updated || updated.length === 0) return { ok: false, error: "ไม่พบรายการ (อาจถูกแก้ไขพร้อมกัน)" };

    await logAdminAction(adminId, "tb_forwarder.set_domestic_ship", "tb_forwarder", String(fId), {
      zone, carrier, cost, payMethod, manual: chosen.manual,
    });
    revalidatePath(`/admin/forwarders/${fId}`);
    revalidatePath("/admin/forwarders");

    return { ok: true, data: { carrier, cost, payMethod, zone } };
  });
}
