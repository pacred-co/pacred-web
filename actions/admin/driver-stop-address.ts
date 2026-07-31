"use server";

/**
 * แก้/เปลี่ยนที่อยู่จัดส่งของ "จุดส่ง" (stop) บนหน้ามอบงานคนขับ /admin/drivers/[id]
 * (ภูม 2026-07-31).
 *
 * ทำไมต้องมี: หน้าคนขับจับกลุ่มพัสดุเป็น "จุดส่ง" ตาม (ลูกค้า + ที่อยู่) — 1 จุด
 * มีได้หลายแทรคกิ้ง. เดิมที่อยู่บนจุดส่งเป็น "อ่านอย่างเดียว" (พิมพ์มาผิด/ยังไม่ใส่
 * ต้องไปแก้ที่อื่น). ปุ่มดินสอนี้ให้ ops/คลัง เลือกที่อยู่จากสมุดที่อยู่ของลูกค้า
 * (หรือกด "+ เพิ่มที่อยู่" ใน <CustomerAddressPicker> ซึ่งเขียนเข้าสมุดที่อยู่จริง
 * → โผล่หน้าโปรไฟล์ลูกค้าเอง) แล้ว snapshot ลง tb_forwarder ของ "ทุกแถวในจุดนี้".
 *
 * แนวเดียวกับ pinDeliveryLocation (ปอน 2026-07-24):
 *   - เขียน .in("id", fids) = ทุกแถวของจุดส่งนี้ (จุดเดียว = ที่อยู่เดียว
 *     แต่มีหลายแทรคกิ้ง/กล่อง) ไม่งั้นแถวพี่น้องยังชี้ที่อยู่เก่า = ไปคนละที่.
 *   - ⚠️ เขียนแค่ที่อยู่ (faddress*) เท่านั้น — ไม่แตะ ขนส่ง (fshipby) / วิธีเก็บเงิน
 *     (paymethod) / ค่าส่งไทย (ftransportprice) / สถานะ / เงิน. งานคนขับถูกสร้าง
 *     ตอนออเดอร์คิดเงินเสร็จแล้ว การ reprice/เปลี่ยนขนส่งตรงนี้จะทำเงินเพี้ยน.
 *     (การเปลี่ยนขนส่ง+คิดเงินใหม่ ทำที่หน้า forwarder detail ก่อนวางบิลเท่านั้น.)
 *   - ล้าง GPS pin เก่า (faddresslatitude/longitude) เป็นพิกัดของที่อยู่ใหม่ (ถ้ามีใน
 *     สมุด) หรือ null — กันคนขับนำทางไปพิกัดเดิมทั้งที่ที่อยู่เปลี่ยนแล้ว.
 *
 * สมุดที่อยู่ = SOT เดียว: ที่อยู่ที่ apply มาจากแถว tb_address ของลูกค้า (สมุด) เสมอ
 * → tb_forwarder ถือ "สำเนา" ของแถวนั้น. การแก้/เพิ่มที่อยู่จริง ทำที่โปรไฟล์ลูกค้า
 * (adminAddCustomerAddress → saveCustomerAddress). ตรงตามกติกา owner 2026-07-21
 * "แก้ที่อยู่ที่หน้าโปรไฟล์ลูกค้า" — ที่นี่ = เลือก/ผูกเข้างาน ไม่ใช่ต้นทางแก้.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseCustomerAddressRow } from "@/lib/admin/customer-address-book";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { logger } from "@/lib/logger";

// คนที่แก้ที่อยู่จัดส่งบนจุดส่งได้ = คนคุมงาน/คลัง (ไม่รวมคนขับเปล่าๆ — คนขับ
// "ปักหมุด GPS" ได้ แต่ไม่ควรเขียนทับที่อยู่ลูกค้า). god (ultra) ผ่าน requireAdmin.
const EDIT_ROLES = ["ops", "super", "warehouse", "manager"] as const;

const schema = z.object({
  // ทุกแถว tb_forwarder ในจุดส่งเดียวกัน (ต้อง ≥1) — apply ที่อยู่ครั้งเดียวทั้งจุด.
  fids: z.array(z.number().int().positive()).min(1).max(200),
  // addressid ในสมุดที่อยู่ของลูกค้า (แถว tb_address) ที่จะ snapshot มาลงงาน.
  addressId: z.number().int().positive(),
  // เลขรอบจัดส่ง — ใช้ revalidate หน้าให้เห็นผลทันที (optional).
  batchId: z.number().int().positive().optional(),
});

export type ApplyStopDeliveryAddressInput = z.input<typeof schema>;

async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error("[driver-stop-address.resolveLegacyAdminId] failed", { code: error.code, message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error("[driver-stop-address tb_admin lookup] failed", { code: aErr.code, message: aErr.message });
  return data?.adminID ?? email.slice(0, 10);
}

export async function applyStopDeliveryAddress(
  input: ApplyStopDeliveryAddressInput,
): Promise<AdminActionResult<{ updated: number }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
  const { fids, addressId, batchId } = parsed.data;

  return withAdmin<{ updated: number }>([...EDIT_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // 1. อ่านแถวในจุดส่ง — ยืนยันว่าเป็นลูกค้าคนเดียวกันทั้งจุด (กันจุดที่ลูกค้าปนกัน).
    const { data: fwds, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid")
      .in("id", fids);
    if (fwdErr) {
      logger.error("driver-stop-address", "read forwarders failed", fwdErr, { fids });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwds || fwds.length === 0) {
      return { ok: false, error: "ไม่พบรายการในจุดส่งนี้ (อาจถูกลบหรือย้ายรอบแล้ว)" };
    }
    const userids = Array.from(
      new Set((fwds as { id: number; userid: string | null }[]).map((f) => (f.userid ?? "").trim()).filter(Boolean)),
    );
    if (userids.length !== 1) {
      return { ok: false, error: "จุดส่งนี้มีลูกค้าปนกัน — แก้ที่อยู่รวมทั้งจุดไม่ได้" };
    }
    const userid = userids[0];

    // 2. อ่านที่อยู่ที่เลือก — ต้องเป็นของลูกค้าคนนี้ + ยัง active (ownership guard).
    const { data: addr, error: addrErr } = await admin
      .from("tb_address")
      .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote, latitude, longitude")
      .eq("addressid", addressId)
      .eq("userid", userid)
      .eq("addressstatus", "1")
      .maybeSingle<{
        addressname: string | null; addresslastname: string | null;
        addresstel: string | null; addresstel2: string | null; addressno: string | null;
        addresssubdistrict: string | null; addressdistrict: string | null;
        addressprovince: string | null; addresszipcode: string | null; addressnote: string | null;
        latitude: number | null; longitude: number | null;
      }>();
    if (addrErr) {
      logger.error("driver-stop-address", "read tb_address failed", addrErr, { addressId, userid });
      return { ok: false, error: `อ่านที่อยู่ไม่สำเร็จ: ${addrErr.message}` };
    }
    if (!addr) return { ok: false, error: "ไม่พบที่อยู่ของลูกค้ารายนี้ (หรือถูกลบไปแล้ว)" };
    const usable = parseCustomerAddressRow(addr);
    if (!usable.data) return { ok: false, error: `ที่อยู่ของลูกค้าไม่ครบถ้วน: ${usable.error}` };
    const a = usable.data;

    // 3. snapshot ที่อยู่ลง tb_forwarder.faddress* ของทุกแถวในจุด + พิกัดของที่อยู่ใหม่
    //    (null ถ้าที่อยู่ในสมุดยังไม่เคยปักหมุด → หน้าคนขับ fallback ไปค้นด้วยข้อความ).
    const newLat = typeof addr.latitude === "number" ? addr.latitude : null;
    const newLng = typeof addr.longitude === "number" ? addr.longitude : null;
    const { data: wrote, error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        faddressname:        a.addressname,
        faddresslastname:    a.addresslastname,
        faddressno:          a.addressno,
        faddresssubdistrict: a.addresssubdistrict,
        faddressdistrict:    a.addressdistrict,
        faddressprovince:    a.addressprovince,
        faddresszipcode:     a.addresszipcode,
        faddressnote:        a.addressnote,
        faddresstel:         a.addresstel,
        faddresstel2:        a.addresstel2,
        faddresslatitude:    newLat,
        faddresslongitude:   newLng,
        adminidupdate:       legacyAdminId,
      })
      .in("id", fids)
      .select("id");
    if (updErr) {
      logger.error("driver-stop-address", "snapshot update failed", updErr, { fids, addressId });
      return { ok: false, error: `บันทึกที่อยู่ไม่สำเร็จ: ${updErr.message}` };
    }
    const updated = wrote?.length ?? 0;
    if (updated === 0) {
      return { ok: false, error: "ไม่พบรายการที่จะแก้ที่อยู่ (อาจถูกลบไปแล้ว)" };
    }

    await logAdminAction(adminId, "apply_stop_delivery_address", "tb_forwarder", fids.join(","), {
      addressId,
      userid,
      to: `${a.addressname} ${a.addresslastname} · ${a.addressprovince} ${a.addresszipcode}`,
      updated,
    });

    if (batchId) revalidatePath(`/admin/drivers/${batchId}`);
    return { ok: true, data: { updated } };
  });
}
