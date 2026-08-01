/**
 * activate-no-code-owner.ts — แกนกลาง "ใส่ PR → ส่งงาน NO CODE (fstatus='99')
 * กลับเข้า flow ปกติ" (owner 2026-08-02)
 *
 * แยกออกมาจาก `adminReassignForwarderOwner` (actions/admin/forwarders-field-edits.ts)
 * เพื่อให้มี **สมองก้อนเดียว** สำหรับ 2 ทางเข้า:
 *   1. ปุ่ม "ใส่ PR → กลับเข้า flow" บนหน้ารายการนำเข้า (แอดมินกรอกเอง)
 *   2. cron self-heal (lib/admin/no-code-self-heal.ts) — MOMO อัพเดท PR ตามหลัง
 *      → แถว 99 ที่นำเข้าไปแล้วกลับเข้า flow เองโดยไม่ต้องรอคนไล่กด
 *      (owner: "เวลา MOMO มีอัพเดทอะไร งานที่เราเอาเข้าระบบไปแล้ว จะอัพเดทตามด้วยไหม")
 *
 * เนื้อในเดิมทุกด่าน (ห้ามหย่อน): เจ้าของต้องมีจริงใน tb_users · แถวต้องยังเป็น
 * 99 ไร้เจ้าของ · เงินทุกช่องต้องเป็นศูนย์ (มีเงินก่อนระบุเจ้าของ = หยุดให้บัญชีดู) ·
 * TOCTOU บน UPDATE · คืนค่า crate จาก staging · ตั้งราคา + แตกกล่องผ่านเครื่องเดิม.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { splitAggregatedMomoBoxRows } from "@/lib/integrations/momo-web/split-box-rows";
import { baseOf as baseOfTracking } from "@/lib/integrations/momo-web/split-box-rows-plan";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import { resolveLastUsedCarrier } from "@/lib/forwarder/last-used-carrier";
import { extractCrateFromMomoRaw } from "@/lib/admin/momo-raw-helpers";

export type ActivateNoCodeOwnerResult =
  | {
      ok: true;
      data: {
        nextStatus: string;
        rateOk: boolean;
        shipBy: string;
        cratePrice: number | string | null;
        cabinet: string | null;
        stagingStampFailed: boolean;
      };
    }
  | { ok: false; error: string };

/**
 * ส่งแถว NO CODE (fstatus='99' · ไร้เจ้าของ) กลับเข้า flow ปกติด้วย PR ที่ยืนยันแล้ว.
 * self-contained: อ่าน/ตรวจเองครบ — caller แค่รู้ fId + PR. ไม่แตะ audit-log/
 * revalidate (หน้าที่ของ caller ที่มีบริบทคนกด).
 */
export async function activateNoCodeOwner(
  admin: SupabaseClient,
  args: { fId: number; newUserId: string; legacyAdminId: string },
): Promise<ActivateNoCodeOwnerResult> {
  const fId = args.fId;
  const newUserId = args.newUserId.trim().toUpperCase();
  const legacyAdminId = args.legacyAdminId.slice(0, 10);
  if (!/^PR\d+$/.test(newUserId)) {
    return { ok: false, error: `รหัสลูกค้าไม่ถูกต้อง (${args.newUserId}) — ต้องเป็น PR ตามด้วยตัวเลข` };
  }

  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fstatus, fcabinetnumber, ftrackingchn, fnote, ftotalprice, ftransportprice, ftransportpricechnthb, priceother, pricecrate, fpriceupdate, fdiscount, fshippingservice")
    .eq("id", fId)
    .maybeSingle<{
      id: number;
      userid: string | null;
      fstatus: string | null;
      fcabinetnumber: string | null;
      ftrackingchn: string | null;
      fnote: string | null;
      ftotalprice: number | string | null;
      ftransportprice: number | string | null;
      ftransportpricechnthb: number | string | null;
      priceother: number | string | null;
      pricecrate: number | string | null;
      fpriceupdate: number | string | null;
      fdiscount: number | string | null;
      fshippingservice: number | string | null;
    }>();
  if (fwdErr) {
    console.error("[activateNoCodeOwner read] failed", { code: fwdErr.code, message: fwdErr.message, fId });
    return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
  }
  if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
  if (String(fwd.fstatus ?? "").trim() !== "99" || (fwd.userid ?? "").trim() !== "") {
    return { ok: false, error: "รายการนี้ไม่ใช่ NO CODE ไร้เจ้าของแล้ว (สถานะ/เจ้าของถูกเปลี่ยนไปก่อน)" };
  }

  // เจ้าของใหม่ต้องมีจริง (tb_users.userID camelCase) — ห้ามเดา ห้ามสร้าง.
  const { data: newUser, error: userErr } = await admin
    .from("tb_users")
    .select("userID")
    .eq("userID", newUserId)
    .maybeSingle<{ userID: string }>();
  if (userErr) {
    console.error("[activateNoCodeOwner tb_users] failed", { code: userErr.code, message: userErr.message, newUserId });
    return { ok: false, error: `ตรวจสอบลูกค้าปลายทางไม่สำเร็จ: ${userErr.message}` };
  }
  if (!newUser) return { ok: false, error: `ไม่พบลูกค้ารหัส ${newUserId} ในระบบ (tb_users)` };

  // ด่านเงิน: แถวไร้เจ้าของต้องเงินศูนย์ทุกช่อง — มียอดก่อนระบุเจ้าของ = ผิดปกติ
  // หยุดให้บัญชีตรวจ (เงินบนแถวผีห้ามไหลเข้า flow เงียบๆ).
  const moneyFields = {
    ftotalprice: fwd.ftotalprice,
    ftransportprice: fwd.ftransportprice,
    ftransportpricechnthb: fwd.ftransportpricechnthb,
    priceother: fwd.priceother,
    pricecrate: fwd.pricecrate,
    fpriceupdate: fwd.fpriceupdate,
    fdiscount: fwd.fdiscount,
    fshippingservice: fwd.fshippingservice,
  };
  const nonZero = Object.entries(moneyFields).filter(([, value]) => Math.abs(Number(value) || 0) > 0.000001);
  if (nonZero.length > 0) {
    return {
      ok: false,
      error: `NO CODE รายการนี้มียอดเงินก่อนระบุเจ้าของ (${nonZero.map(([key]) => key).join(", ")}) — หยุดและให้บัญชีตรวจสอบก่อน`,
    };
  }

  // คืนค่าสัญญาณตีลัง/ค่าลังจากต้นทาง MOMO ที่ไม่ถูกแตะ — แถวพิเศษตั้งใจเก็บเงินศูนย์
  // ค่าจริงเข้ามาได้ก็ต่อเมื่อรู้เจ้าของแล้วเท่านั้น.
  const { data: staging, error: stagingErr } = await admin
    .from("momo_import_tracks")
    .select("raw, admin_patch")
    .eq("committed_forwarder_id", fId)
    .limit(1)
    .maybeSingle<{ raw: unknown; admin_patch: Record<string, unknown> | null }>();
  if (stagingErr) {
    console.error("[activateNoCodeOwner staging] failed", { code: stagingErr.code, message: stagingErr.message, fId });
    return { ok: false, error: `อ่านต้นทาง MOMO ไม่สำเร็จ: ${stagingErr.message}` };
  }
  if (!staging) {
    return { ok: false, error: "รายการพิเศษนี้ไม่มีลิงก์ต้นทาง MOMO — ไม่เปลี่ยนสถานะอัตโนมัติ" };
  }
  const raw = staging.raw && typeof staging.raw === "object"
    ? { ...(staging.raw as Record<string, unknown>) }
    : {};
  if (staging.admin_patch?.extra_cost !== undefined) raw.extra_cost = staging.admin_patch.extra_cost;
  const crate = extractCrateFromMomoRaw(raw);
  const shipBy = (await resolveLastUsedCarrier(admin, newUserId)) ?? "";
  const nextStatus = (fwd.fcabinetnumber ?? "").trim() ? "3" : "2";
  const nextNote = (fwd.fnote ?? "")
    .replace(/^NO CODE · รอระบุ PR(?: · )?/, "")
    .trim() || null;

  // TOCTOU: เขียนก็ต่อเมื่อยังเป็น 99 + เจ้าของยังเป็นค่าที่อ่านมา.
  let updateQuery = admin
    .from("tb_forwarder")
    .update({
      userid: newUserId,
      fstatus: nextStatus,
      fshipby: shipBy,
      crate: crate.crate,
      pricecrate: crate.pricecrate,
      fnote: nextNote,
      adminidupdate: legacyAdminId,
    })
    .eq("id", fId)
    .eq("fstatus", "99");
  updateQuery = fwd.userid == null
    ? updateQuery.is("userid", null)
    : updateQuery.eq("userid", fwd.userid);
  const { data: activated, error: updErr } = await updateQuery
    .select("id")
    .maybeSingle<{ id: number }>();
  if (updErr) {
    console.error("[activateNoCodeOwner activate] failed", { code: updErr.code, message: updErr.message, fId });
    return { ok: false, error: `ระบุเจ้าของ NO CODE ไม่สำเร็จ: ${updErr.message}` };
  }
  if (!activated) {
    return { ok: false, error: "สถานะหรือเจ้าของถูกเปลี่ยนพร้อมกัน — โหลดหน้าใหม่แล้วตรวจสอบอีกครั้ง" };
  }

  const { error: stampErr } = await admin
    .from("momo_import_tracks")
    .update({ commit_userid: newUserId, updated_at: new Date().toISOString() })
    .eq("committed_forwarder_id", fId);
  if (stampErr) {
    console.error("[activateNoCodeOwner backlink] failed", { code: stampErr.code, message: stampErr.message, fId });
  }

  // กลับเข้าเส้นตั้งราคา/แตกกล่องที่พิสูจน์แล้ว หลังเจ้าของเป็นตัวจริงเท่านั้น.
  let rateOk = false;
  try {
    const priced = await computeAndFillForwarderImportRate(admin, fId);
    rateOk = priced.ok;
    if (!priced.ok) {
      console.error("[activateNoCodeOwner rate] unresolved", { fId, reason: priced.reason });
    }
  } catch (error) {
    console.error("[activateNoCodeOwner rate] threw after owner activation", { fId, error });
  }
  if (fwd.ftrackingchn) {
    try {
      await splitAggregatedMomoBoxRows(admin, [baseOfTracking(fwd.ftrackingchn)], undefined, { allowPriced: true });
    } catch (error) {
      console.error("[activateNoCodeOwner split] threw after owner activation", { fId, error });
    }
  }

  return {
    ok: true,
    data: {
      nextStatus,
      rateOk,
      shipBy,
      cratePrice: crate.pricecrate,
      cabinet: fwd.fcabinetnumber,
      stagingStampFailed: stampErr != null,
    },
  };
}
