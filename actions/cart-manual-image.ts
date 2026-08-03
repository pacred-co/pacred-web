"use server";

/**
 * Product-photo upload for the "ไม่มีลิงก์สินค้า" manual entry (/cart/add/manual).
 *
 * owner 2026-08-03: a no-link order is described by a PICTURE — without one the
 * buying team has nothing to shop from. Lands in the existing private `carts`
 * bucket (created for exactly this, never wired until now) under a per-user
 * folder, mirroring `uploadDeliveryFeedbackPhoto` in actions/delivery-feedback.ts.
 *
 * WHY a public URL and not a storage path or a signed one: `tb_cart.cimages` is
 * copied VERBATIM downstream (tb_order.cimages → tb_header_order.hcover →
 * tb_forwarder.fcover) and every surface renders it through `shopImageUrl`,
 * which can neither sign a private path nor refresh an expired token — storing
 * either would save "fine" and then show a broken image on every downstream
 * screen (the §0e silent-write trap).
 *
 * The `carts` bucket was made PUBLIC on 2026-08-03 for exactly this (same posture
 * as the existing public `avatars` bucket; paths carry a uuid + timestamp + random
 * suffix so they are not enumerable, and the bucket is capped to images ≤10 MB):
 *   • permanent — no expiry to rot, unlike a signed URL
 *   • 88 chars vs 364 — so FIVE photos fit the varchar(1000) `cimages` column
 *     under the legacy comma-separated convention (owner 2026-08-03 asked for
 *     several photos: "ไม่ต้องไปจำกัดลิงก์อะไร เอาแบบดีๆ")
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

  const { data: pub } = supabase.storage.from("carts").getPublicUrl(path);
  if (!pub?.publicUrl) {
    // The object exists but we cannot hand back something renderable — say so
    // rather than return a path the downstream surfaces would render as broken.
    console.error("[cart-manual-image publicUrl] empty", { path });
    return { ok: false, error: "อัปโหลดได้แต่สร้างลิงก์รูปไม่สำเร็จ กรุณาลองใหม่" };
  }

  return { ok: true, url: pub.publicUrl };
}
