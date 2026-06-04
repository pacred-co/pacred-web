"use server";

/**
 * Customer profile avatar upload (2026-06-04 — no-death fix).
 *
 * The legacy `profile.php` #edit-img-profile / #uploadimageModal (dropify +
 * croppie + magnific-popup jQuery) was transcribed 1:1 into the profile page
 * but left UNWIRED — those plugins are not in the staged vendor bundle, so the
 * avatar-edit button opened a modal whose crop + `upload.php` POST never fired
 * (a dead click — exactly the "ทุกฟังก์ชันต้องใช้ได้" gap the owner flagged).
 *
 * This wires a clean Pacred upload (AGENTS.md §0a — copy the workflow, our
 * own design): pick an image → upload to the PUBLIC `avatars` bucket
 * (migration 0012) → store the public URL in `profiles.avatar_url`. The
 * profile page + account-settings already render `profile.avatar_url ||`
 * the legacy filename, so the new picture shows immediately.
 *
 * NON-COMMS — no notify / SMS / LINE / email. Customer mutates only their own
 * avatar (keyed by the authenticated `user.id`).
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { revalidatePath } from "next/cache";

export type UpdateAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function updateMyAvatar(
  formData: FormData,
): Promise<UpdateAvatarResult> {
  const { user } = await requireAuth();
  if (!user?.id) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "กรุณาเลือกรูปโปรไฟล์" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "รับเฉพาะไฟล์รูปภาพ (JPG / PNG / WEBP)" };
  }

  // uploadToBucket caps at 5 MB + re-validates the mime, returns the in-bucket
  // path. Scope each customer's avatars under members/<auth-uid>/.
  const up = await uploadToBucket(file, "avatars", `members/${user.id}`);
  if (!up.ok) return { ok: false, error: up.error };

  const admin = createAdminClient();
  const { data: pub } = admin.storage.from("avatars").getPublicUrl(up.filename);
  const publicUrl = pub?.publicUrl ?? "";
  if (!publicUrl) return { ok: false, error: "สร้างลิงก์รูปไม่สำเร็จ" };

  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  if (error) {
    console.error(`[updateMyAvatar profiles.update] failed`, {
      code: error.code,
      message: error.message,
      id: user.id,
    });
    return { ok: false, error: `บันทึกรูปไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/profile");
  // The sidebar/header avatar is served from the 60s-TTL `pcs-chrome`
  // unstable_cache; we do NOT revalidateTag it here — Next 16's revalidateTag
  // now requires a cache-profile arg (same call dropped in actions/forwarder.ts
  // + forwarders-edit.ts). The 60s TTL refreshes it; /profile shows it at once.
  return { ok: true, url: publicUrl };
}
