"use server";

/**
 * ลายเซ็น + ตรายางอิเล็กทรอนิกส์ ของลูกค้า (owner 2026-07-24).
 *
 * "ทำช่องแนบลายเซ็น และตรายาง อิเล็คทรอนิกส์ ให้ใน profile ลูกค้า เก็บเป็น data
 *  ให้ลูกค้า ตอนออกเอกสารได้เลยครับ"
 *
 * เก็บเป็นรูปใน bucket `member-docs` (private · อ่านผ่าน signed URL) → path ลง
 * `tb_users.signature_path` / `stamp_path` (mig 0278). ผู้บริโภคตัวแรก =
 * ฟอร์ม 50 ทวิ (/r/[token]/wht-form) แปะลงช่อง "ลงชื่อผู้จ่ายเงิน" + "ประทับตรา".
 *
 * ⚠️ ไม่แตะเงิน/สถานะใดๆ — เป็น data เอกสารล้วน. ลูกค้าแก้ของตัวเองเท่านั้น
 * (ownership = member_code จาก session) · แอดมิน (WRITE roles) แก้แทนได้.
 */

import { revalidatePath } from "next/cache";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "member-docs";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — เกิน bodySizeLimit จะพังก่อนถึงเราอยู่แล้ว
const KIND_COL = { signature: "signature_path", stamp: "stamp_path" } as const;
export type EsignKind = keyof typeof KIND_COL;

type Result = { ok: true } | { ok: false; error: string };

function extOf(file: File): string | null {
  const t = file.type.toLowerCase();
  if (t === "image/png") return "png";
  if (t === "image/jpeg" || t === "image/jpg") return "jpg";
  if (t === "image/webp") return "webp";
  return null;
}

/** upload + เขียน path — core ที่ทั้งลูกค้าและแอดมินใช้ร่วม (identity ถูกตรวจก่อนเรียก). */
async function saveEsign(memberCode: string, kind: EsignKind, file: File): Promise<Result> {
  if (!(kind in KIND_COL)) return { ok: false, error: "ประเภทไฟล์ไม่ถูกต้อง" };
  if (file.size <= 0) return { ok: false, error: "ไฟล์ว่าง" };
  if (file.size > MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 5MB — ลองถ่าย/ครอปใหม่" };
  const ext = extOf(file);
  if (!ext) return { ok: false, error: "รองรับเฉพาะรูปภาพ PNG / JPG / WebP" };

  const admin = createAdminClient();
  const path = `esign/${memberCode}/${kind}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    console.error("[customer-esign upload] failed", { memberCode, kind, message: upErr.message });
    return { ok: false, error: "อัพโหลดไม่สำเร็จ กรุณาลองใหม่" };
  }

  const { error: updErr } = await admin
    .from("tb_users")
    .update({ [KIND_COL[kind]]: path })
    .eq("userID", memberCode);
  if (updErr) {
    console.error("[customer-esign update] failed", { memberCode, kind, code: updErr.code, message: updErr.message });
    // best-effort ลบไฟล์กำพร้า (การเซฟล้ม = ลูกค้าไม่เห็นรูป — อย่าทิ้งขยะใน bucket)
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
  }
  return { ok: true };
}

/** ลูกค้าอัพลายเซ็น/ตรายางของตัวเอง (จากหน้า /profile). */
export async function uploadMyEsign(kind: EsignKind, formData: FormData): Promise<Result> {
  const data = await getCurrentUserWithProfile();
  const memberCode = data?.profile?.member_code ?? "";
  if (!memberCode) return { ok: false, error: "ไม่พบบัญชีของคุณ" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  const res = await saveEsign(memberCode, kind, file);
  if (res.ok) revalidatePath("/profile");
  return res;
}

/** ลูกค้าลบของตัวเอง (เคลียร์ path — ไฟล์เก่าปล่อยไว้ใน bucket เป็นประวัติ). */
export async function removeMyEsign(kind: EsignKind): Promise<Result> {
  const data = await getCurrentUserWithProfile();
  const memberCode = data?.profile?.member_code ?? "";
  if (!memberCode) return { ok: false, error: "ไม่พบบัญชีของคุณ" };
  if (!(kind in KIND_COL)) return { ok: false, error: "ประเภทไม่ถูกต้อง" };
  const { error } = await createAdminClient()
    .from("tb_users")
    .update({ [KIND_COL[kind]]: null })
    .eq("userID", memberCode);
  if (error) {
    console.error("[customer-esign remove] failed", { memberCode, kind, message: error.message });
    return { ok: false, error: "ลบไม่สำเร็จ กรุณาลองใหม่" };
  }
  revalidatePath("/profile");
  return { ok: true };
}

/** แอดมิน (sales/CS ทำแทนลูกค้าได้ — เช่น ลูกค้าส่งรูปมาทางไลน์). */
export async function adminUploadCustomerEsign(
  userid: string,
  kind: EsignKind,
  formData: FormData,
): Promise<Result> {
  await requireAdmin(["super", "accounting", "sales", "sales_admin", "ops"]);
  const memberCode = userid.trim();
  if (!/^PR\d+$/i.test(memberCode)) return { ok: false, error: "รหัสลูกค้าไม่ถูกต้อง" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  const res = await saveEsign(memberCode, kind, file);
  if (res.ok) revalidatePath(`/admin/customers/${memberCode}`);
  return res;
}

/** signed URL สำหรับ preview (bucket private) — เจ้าของ หรือ แอดมิน เท่านั้น. */
export async function getEsignPreviewUrl(path: string): Promise<string | null> {
  const data = await getCurrentUserWithProfile();
  const memberCode = data?.profile?.member_code ?? "";
  // path ของตัวเองเท่านั้น (esign/<PR>/…) — แอดมินมีทางอ่านผ่านหน้า admin แยก
  if (!memberCode || !path.startsWith(`esign/${memberCode}/`)) return null;
  const { data: signed, error } = await createAdminClient()
    .storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) {
    console.error("[customer-esign signed-url] failed", { path, message: error.message });
    return null;
  }
  return signed?.signedUrl ?? null;
}
