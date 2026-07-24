"use server";

/**
 * ปักหมุดตำแหน่งจัดส่ง — คนขับยืนอยู่หน้าบ้านลูกค้าแล้วกดบันทึกพิกัด GPS จริง
 * ลงที่อยู่จัดส่งของจุดนั้น (ปอน 2026-07-24).
 *
 * ทำไมต้องมี: ที่อยู่ที่ลูกค้าพิมพ์มาเป็น "ข้อความ" — Google Maps เดาพิกัดจาก
 * ข้อความไทยพลาดบ่อย (ซอยย่อย · หมู่บ้าน · บ้านเลขที่ซ้ำ) คนขับเลยหลง.
 * พอปักหมุดจากจุดที่ยืนอยู่จริง รอบหน้ากด "GoogleMaps" มันจะยิงด้วยพิกัด
 * (`/maps/search/<lat>,<lng>`) แทนข้อความ = ไปถูกจุดแน่นอน.
 *
 * ฝั่งอ่านมีอยู่แล้วในหน้า /admin/drivers/[id] — มันเลือกพิกัดก่อนข้อความอยู่แล้ว
 * (`hasPin ? maps/search/lat,lng : maps/search/<text>`) เลยไม่ต้องแก้อะไรตรงนั้น.
 *
 * เขียน 2 ที่:
 *   1) tb_forwarder (ทุกแถวของจุดส่งนี้) — ให้รอบที่กำลังวิ่งอยู่เห็นผลทันที
 *   2) tb_address ของลูกค้า (แถวที่ตรงกับที่อยู่บนงานนี้) — best-effort · ให้
 *      "ครั้งหน้า" ที่งานใหม่ snapshot ที่อยู่นี้ไป มันติดพิกัดไปด้วย
 *
 * ⚠️ ไม่แตะเงิน / สถานะงาน / สถานะส่ง — เขียนแค่ 2 คอลัมน์พิกัดเท่านั้น.
 * ⚠️ ต้อง apply migration 0278 ก่อน ไม่งั้นลองจิจูดกรุงเทพ (100.5) จะ overflow.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { logger } from "@/lib/logger";

// คนที่ปักหมุดได้ = คนที่อยู่หน้างานจริง (คนขับ/คลัง) + คนคุมงาน.
// ชุดเดียวกับสิทธิ์แก้ภาพส่งสินค้า (driver-work.ts PHOTO_EDIT_ROLES) เพราะเป็น
// การบันทึก "สิ่งที่เห็นตรงหน้า" เหมือนกัน ไม่ใช่การตัดสินใจทางธุรกิจ.
const PIN_ROLES = ["driver", "ops", "super", "warehouse", "manager"] as const;

/**
 * กรอบประเทศไทยแบบเผื่อขอบ — lat 5.0-21.5 · lng 96.5-106.5
 * (จริง: lat 5.6-20.5 · lng 97.3-105.7).
 *
 * ทำไมต้อง refuse ไม่ใช่แค่เตือน: พิกัดนี้จะถูกเขียนทับที่อยู่ของลูกค้าและใช้
 * นำทางในรอบถัดๆ ไป. ถ้า GPS ของเครื่องคนขับเพี้ยน (ในตึก · mock location ·
 * ค่า 0,0 กลางมหาสมุทร) แล้วเราบันทึกไป = ที่อยู่ลูกค้าพังถาวรจนกว่าจะมีคนจับได้
 * — เงียบและหายาก. ยอมให้กดไม่ผ่านแล้วบอกให้ออกมาที่โล่งดีกว่า.
 */
const TH_BOUNDS = { latMin: 5.0, latMax: 21.5, lngMin: 96.5, lngMax: 106.5 } as const;

const pinSchema = z.object({
  // ทุกแถว tb_forwarder ที่อยู่ในจุดส่งเดียวกัน (จุดส่ง 1 จุด = ที่อยู่เดียว
  // แต่มีได้หลายแทรคกิ้ง) — ปักครั้งเดียวต้องติดทั้งจุด ไม่งั้นแถวพี่น้อง
  // ยังนำทางด้วยข้อความอยู่ = จุดเดียวกันแต่ไปคนละที่.
  fids: z.array(z.number().int().positive()).min(1).max(200),
  lat:  z.number().finite(),
  lng:  z.number().finite(),
  /** ความแม่นยำที่ browser รายงาน (เมตร) — เก็บลง audit log เฉยๆ ไม่ตัดสินใจอะไร */
  accuracyM: z.number().finite().nonnegative().optional(),
});

export type PinDeliveryLocationInput = z.input<typeof pinSchema>;

/** รูปแถวที่ดึงกลับมาหลังเขียนพิกัด — ใช้จับคู่กลับไปยังสมุดที่อยู่ของลูกค้า */
type PinnedForwarderRow = {
  id:                  number;
  userid:              string | null;
  faddressno:          string | null;
  faddresssubdistrict: string | null;
  faddressdistrict:    string | null;
  faddressprovince:    string | null;
  faddresszipcode:     string | null;
};

export async function pinDeliveryLocation(
  input: PinDeliveryLocationInput,
): Promise<AdminActionResult<{ updatedForwarders: number; updatedAddressBook: number }>> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "ข้อมูลพิกัดไม่ถูกต้อง" };
  }
  const { fids, lat, lng, accuracyM } = parsed.data;

  if (lat < TH_BOUNDS.latMin || lat > TH_BOUNDS.latMax || lng < TH_BOUNDS.lngMin || lng > TH_BOUNDS.lngMax) {
    return {
      ok: false,
      error:
        `พิกัดที่ได้ (${lat.toFixed(5)}, ${lng.toFixed(5)}) อยู่นอกประเทศไทย — ` +
        `น่าจะเป็นสัญญาณ GPS เพี้ยน ระบบยังไม่บันทึกให้. ` +
        `ลองออกมาที่โล่ง เปิด GPS ให้จับสัญญาณสักครู่ แล้วกดใหม่`,
    };
  }

  // ปัด 8 ตำแหน่งให้ตรงกับ scale ของคอลัมน์ (numeric(11,8) หลัง mig 0278) —
  // ถ้าส่งทศนิยมยาวกว่านั้น Postgres จะปัดให้เองอยู่แล้ว แต่ปัดที่นี่ทำให้
  // ค่าที่ log กับค่าที่เก็บตรงกันเป๊ะ.
  const latVal = Number(lat.toFixed(8));
  const lngVal = Number(lng.toFixed(8));

  return withAdmin<{ updatedForwarders: number; updatedAddressBook: number }>(
    [...PIN_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── 1) เขียนลงงานที่กำลังวิ่ง (ทุกแถวของจุดส่งนี้) ──────────────────
      // .returns<> ระบุรูปแถวเอง เพราะสตริง select ที่ต่อด้วย + ทำให้ตัวแกะ type
      // ของ supabase-js อ่านไม่ออก แล้วมันจะ fallback เป็น GenericStringError
      const { data: updatedRows, error: fwErr } = await admin
        .from("tb_forwarder")
        .update({ faddresslatitude: latVal, faddresslongitude: lngVal })
        .in("id", fids)
        .select("id, userid, faddressno, faddresssubdistrict, faddressdistrict, faddressprovince, faddresszipcode")
        .returns<PinnedForwarderRow[]>();

      if (fwErr) {
        logger.error("driver-pin", "tb_forwarder pin update failed", fwErr, { fids, latVal, lngVal });
        // 22003 = numeric_value_out_of_range → migration 0278 ยังไม่ถูก apply
        const hint = fwErr.code === "22003"
          ? " (คอลัมน์พิกัดยังแคบเกินไป — ต้อง apply migration 0278 ก่อน)"
          : "";
        return { ok: false, error: `บันทึกพิกัดไม่สำเร็จ${hint}` };
      }
      const updatedForwarders = updatedRows?.length ?? 0;
      if (updatedForwarders === 0) {
        return { ok: false, error: "ไม่พบรายการที่จะปักหมุด (อาจถูกลบหรือย้ายไปรอบอื่นแล้ว)" };
      }

      // ── 2) เขียนกลับสมุดที่อยู่ลูกค้า เพื่อให้ "ครั้งหน้า" ติดพิกัดไปด้วย ──
      // best-effort ล้วน: ถ้าหาแถวไม่เจอหรือเขียนพลาด งานหลัก (ข้อ 1) ยังสำเร็จ
      // และคนขับรอบนี้ได้พิกัดไปใช้แล้ว — ไม่ควรทำให้ทั้ง action ล้ม.
      let updatedAddressBook = 0;
      try {
        const first = updatedRows[0];
        const userid = (first?.userid ?? "").trim();
        const no = (first?.faddressno ?? "").trim();
        const zip = (first?.faddresszipcode ?? "").trim();

        // จับคู่ด้วย บ้านเลขที่ + ตำบล + อำเภอ + จังหวัด + ไปรษณีย์ ของลูกค้าคนนั้น
        // (ที่อยู่บนงานเป็น snapshot ที่ copy มาจากสมุดที่อยู่ ไม่มีคอลัมน์ id ชี้กลับ
        //  — tb_forwarder ไม่มี faddressid — เลยต้องจับด้วยเนื้อที่อยู่).
        if (userid && no && zip) {
          const { data: addrRows, error: addrErr } = await admin
            .from("tb_address")
            .select("addressid")
            .eq("userid", userid)
            .eq("addressno", no)
            .eq("addresszipcode", zip)
            .eq("addresssubdistrict", (first?.faddresssubdistrict ?? "").trim())
            .eq("addressdistrict", (first?.faddressdistrict ?? "").trim())
            .eq("addressprovince", (first?.faddressprovince ?? "").trim())
            .limit(20);

          if (!addrErr && addrRows && addrRows.length > 0) {
            const ids = addrRows.map((r) => r.addressid);
            const { data: wrote, error: upErr } = await admin
              .from("tb_address")
              .update({ latitude: latVal, longitude: lngVal })
              .in("addressid", ids)
              .select("addressid");
            if (upErr) {
              logger.error("driver-pin", "tb_address pin update failed", upErr, { userid, ids });
            } else {
              updatedAddressBook = wrote?.length ?? 0;
            }
          }
        }
      } catch (e) {
        logger.error("driver-pin", "address-book pin write threw (ignored)", e, { fids });
      }

      await logAdminAction(adminId, "pin_delivery_location", "tb_forwarder", fids.join(","), {
        lat: latVal,
        lng: lngVal,
        accuracy_m: accuracyM ?? null,
        updated_forwarders: updatedForwarders,
        updated_address_book: updatedAddressBook,
      });

      return { ok: true, data: { updatedForwarders, updatedAddressBook } };
    },
  );
}
