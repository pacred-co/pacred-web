"use server";

/**
 * Product-photo upload for the "ไม่มีลิงก์สินค้า" manual entry (/cart/add/manual).
 *
 * owner 2026-08-03: a no-link order is described by a PICTURE — without one the
 * buying team has nothing to shop from. Lands in the existing private `carts`
 * bucket (created for exactly this, never wired until now) under a per-user
 * folder, mirroring `uploadDeliveryFeedbackPhoto` in actions/delivery-feedback.ts.
 *
 * WHY a signed URL and not the storage path: `tb_cart.cimages` is copied VERBATIM
 * downstream (tb_order.cimages → tb_header_order.hcover → tb_forwarder.fcover) and
 * every surface renders it through `shopImageUrl`, which cannot sign a private
 * path — storing a bare path would save "fine" and then show a broken image on
 * every downstream screen (the §0e silent-write trap). A long-lived signed URL is
 * an absolute https URL, so it passes `isDirectImageUrl` and renders through the
 * existing resolver with ZERO downstream changes. Measured length 373 chars,
 * well under the 1000-char column/validator ceiling.
 *
 * NO money here — this only returns a URL. The cart write stays
 * `addCartItemsBulk` → tb_cart.
 */

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type Result =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** 10 MB — the ceiling the upload panel advertises to the customer. */
const MAX_BYTES = 10 * 1024 * 1024;
/** ~10 years. Effectively permanent: the stored value must outlive the order. */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365 * 10;

export async function uploadCartProductImage(formData: FormData): Promise<Result> {
  // Impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return { ok: false, error: impErr.error };

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error("[cart-manual-image auth] failed", { code: authErr.code, message: authErr.message });
  }
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป" };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ยังไม่ได้เลือกไฟล์รูป" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "ต้องเป็นไฟล์รูปภาพเท่านั้น (JPG / PNG)" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "ไฟล์ใหญ่เกิน 10 MB กรุณาย่อรูปก่อน" };
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("carts")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) {
    console.error("[cart-manual-image upload] failed", { message: upErr.message });
    return { ok: false, error: `อัปโหลดรูปไม่สำเร็จ: ${upErr.message}` };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("carts")
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    // The object exists but we cannot hand back something renderable — say so
    // rather than return a path the downstream surfaces would render as broken.
    console.error("[cart-manual-image sign] failed", { message: signErr?.message });
    return { ok: false, error: "อัปโหลดได้แต่สร้างลิงก์รูปไม่สำเร็จ กรุณาลองใหม่" };
  }

  return { ok: true, url: signed.signedUrl };
}
