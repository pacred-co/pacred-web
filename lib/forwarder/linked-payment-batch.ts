import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeForwarderDebitBatch,
  type ForwarderDebitBatch,
  type ForwarderDebitRow,
} from "@/lib/forwarder/forwarder-debit-total";
import { resolveMaoAnchorIds } from "@/lib/forwarder/mao-anchor";
import { classifyCorporateProfile } from "@/lib/forwarder/corporate-profile-gate";

type Result =
  | {
      ok: true;
      batch: ForwarderDebitBatch;
      missingIds: string[];
      /**
       * ข้อมูลนิติที่ยังไม่ครบ "สำหรับพิมพ์เอกสาร" แต่ไม่กระทบยอดเงิน (ปัจจุบัน = ที่อยู่นิติ).
       * null = ครบ/ไม่ใช่นิติ. ผู้เรียกควรเอาไปเตือนให้ไปเติม — ไม่ใช่เอาไปบล็อกการรับเงิน.
       */
      corporateProfileWarning: string | null;
    }
  | { ok: false; error: string };

/** Load and calculate one linked forwarder payment with the production money engine. */
export async function loadLinkedForwarderPaymentBatch(
  admin: SupabaseClient,
  args: { userId: string; forwarderIds: ReadonlyArray<string | number> },
): Promise<Result> {
  const ids = Array.from(
    new Set(args.forwarderIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)),
  ).sort((a, b) => a - b);
  if (ids.length === 0) return { ok: false, error: "no_forwarder_ids" };

  const [{ data: user, error: userErr }, { data: corp, error: corpErr }] = await Promise.all([
    admin
      .from("tb_users")
      .select("userCompany")
      .eq("userID", args.userId)
      .maybeSingle<{ userCompany: string | number | null }>(),
    admin
      .from("tb_corporate")
      .select("id,corporatename,corporatenumber,corporateaddress")
      .eq("userid", args.userId)
      .limit(1)
      .maybeSingle<{
        id: number;
        corporatename: string | null;
        corporatenumber: string | null;
        corporateaddress: string | null;
      }>(),
  ]);
  if (userErr) return { ok: false, error: `user_lookup:${userErr.code ?? "unknown"}` };
  if (corpErr) return { ok: false, error: `corporate_lookup:${corpErr.code ?? "unknown"}` };
  if (!user) return { ok: false, error: "user_not_found" };

  // One identity predicate for quote + WHT + receipt class. Any company signal
  // (legacy userCompany flag OR a corporate row/tax ID) means the corporate receipt
  // class + 1% WHT — so the identity that JUSTIFIES that class (ชื่อ + เลขภาษี) must
  // exist, otherwise the old flow could quote 1% WHT but later mint an FRG personal
  // receipt with a blank tax ID. ดูการแยก money-critical vs document-only ข้างล่าง.
  const isCorporate = String(user.userCompany ?? "").trim() === "1" || corp != null;

  // แยก "อะไรคิดเงิน" ออกจาก "อะไรแค่พิมพ์บนเอกสาร" — owner 2026-07-23 (บัญชียืนยันสลิปไม่ได้
  // ทั้งที่ลูกค้าจ่ายมาแล้ว · PR022 บริษัท เจ แนค: ชื่อ ✓ เลขภาษี ✓ แต่ที่อยู่นิติว่าง).
  //
  // ตัวที่คิดเงินคือ `isCorporate` (boolean) ตัวเดียว → ส่งเข้า computeForwarderDebitBatch
  // แล้วไปกำหนด WHT 1% ผ่าน legacyReceiptAmount. **ที่อยู่ไม่ได้เข้าสูตรเงินเลย** — เป็นข้อความ
  // บนเอกสารล้วน. เดิม guard บังคับครบทั้ง 3 ช่องเท่ากันหมด ทำให้ "ที่อยู่ว่าง" บล็อกเส้นเงิน
  // ทั้งเส้นทั้งที่ยอดเท่ากันเป๊ะไม่ว่าจะมีที่อยู่หรือไม่.
  //
  // 🔑 ที่สำคัญกว่า: guard นี้ถูกเรียกทั้ง "ก่อนลูกค้าจ่าย" (quote) และ "หลังเงินเข้าแล้ว" (บัญชี
  // อนุมัติสลิป). บล็อกตอน quote = ป้องกันได้จริง · บล็อกตอนอนุมัติ = เงินเข้าบัญชีไปแล้ว
  // ลูกค้าจ่ายแล้ว แต่ออกใบเสร็จไม่ได้และงานค้าง — กันอะไรไม่ได้เลย มีแต่ทำงานค้าง
  // (คลาสเดียวกับบทเรียน 2026-06-14: guard ที่ port เพิ่มเข้ามาบนเส้นที่ legacy ไม่เคยกั้น).
  let corporateProfileWarning: string | null = null;
  if (isCorporate) {
    const verdict = classifyCorporateProfile(corp);
    if (verdict.blockingMissing.length > 0) {
      return { ok: false, error: `corporate_billing_profile_incomplete:${verdict.blockingMissing.join(",")}` };
    }
    corporateProfileWarning = verdict.warning;
  }

  const { data, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fshipby,paymethod,ftotalprice,ftransportprice,fpriceupdate,fshippingservice,pricecrate,ftransportpricechnthb,priceother,fdiscount,ftrackingchn,fcabinetnumber",
    )
    .eq("userid", args.userId)
    .in("id", ids)
    .order("id", { ascending: true });
  if (error) return { ok: false, error: `forwarder_lookup:${error.code ?? "unknown"}` };

  const rows = (data ?? []) as ForwarderDebitRow[];
  const found = new Set(rows.map((row) => String(row.id)));
  const missingIds = ids.map(String).filter((id) => !found.has(id));
  const maoAnchorIds = await resolveMaoAnchorIds(admin, rows.map((row) => row.ftrackingchn));
  const batch = computeForwarderDebitBatch(rows, {
    userId: args.userId,
    isCorporate,
    maoAnchorIds,
  });
  return { ok: true, batch, missingIds, corporateProfileWarning };
}
