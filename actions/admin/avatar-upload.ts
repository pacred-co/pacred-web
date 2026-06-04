"use server";

/**
 * Admin avatar image upload (2026-06-04 — staff side of the owner's "ตั้งรูป
 * profile ใช้ไม่ได้จริง" fix). The /admin/admins/[id]/edit form had an Avatar
 * URL text field with "(file upload — Wave 23)" deferred — staff could only
 * paste a URL, never upload a file. This action just UPLOADS the image and
 * returns its public URL; the edit-form's existing submit
 * (adminUpdateProfileFields, super-only) persists it to the target admin's
 * profiles.avatar_url. No persistence here → reusable for /admins/new too.
 *
 * Gated to `super` (same as adminUpdateProfileFields — only super edits admins).
 * NON-COMMS.
 */

import { withAdmin, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";

export type UploadedAvatar = { url: string };

export async function adminUploadAvatarImage(
  formData: FormData,
): Promise<AdminActionResult<UploadedAvatar>> {
  return withAdmin<UploadedAvatar>(["super"], async () => {
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
    }
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "รับเฉพาะไฟล์รูปภาพ (JPG / PNG / WEBP)" };
    }

    const up = await uploadToBucket(file, "avatars", "admins");
    if (!up.ok) return { ok: false, error: up.error };

    const admin = createAdminClient();
    const { data: pub } = admin.storage.from("avatars").getPublicUrl(up.filename);
    const url = pub?.publicUrl ?? "";
    if (!url) return { ok: false, error: "สร้างลิงก์รูปไม่สำเร็จ" };

    return { ok: true, data: { url } };
  });
}
