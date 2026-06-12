"use server";

/**
 * Customer-profile COVER photo (Facebook-style) — a single GLOBAL cover image
 * shared by every /admin/customers/[id] page. Any admin who can open the page
 * can change it (owner directive 2026-06-12).
 *
 * Storage:    member-docs/admin/customer-cover/<ts>-<name>  (private bucket;
 *             read side re-signs a URL each render — works regardless of bucket
 *             public/private state).
 * Persistence: business_config key `customer_profile.cover_path` (just the
 *             storage path string). We UPSERT it directly (self-seeding) instead
 *             of setBusinessConfig() — which refuses unknown keys — so the
 *             feature needs NO migration and works on dev + prod immediately.
 *             The read falls back to the bundled default GIF when unset, so the
 *             page never breaks on a missing key. This is a cosmetic, non-money
 *             key (the §0e/ADR-0024 "migration-managed keys" rule is about
 *             money/pricing config, not a cover image).
 *
 * NON-COMMS · no money path touched.
 */

import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { invalidateBusinessConfig } from "@/lib/business-config";
import { PROFILE_COVER_BUCKET, PROFILE_COVER_KEY } from "./profile-cover-keys";

function coverRow(value: string, adminId: string) {
  return {
    key: PROFILE_COVER_KEY,
    value,
    value_type: "string" as const,
    category: "appearance",
    description: "รูปพื้นหลัง (cover) หน้าโปรไฟล์ลูกค้า — ปกกลางใช้ร่วมกันทุกหน้า",
    updated_by_admin_id: adminId,
    updated_at: new Date().toISOString(),
  };
}

/** Upload a new cover image + persist its path. Any admin. */
export async function adminSetProfileCover(
  formData: FormData,
): Promise<AdminActionResult<{ path: string }>> {
  return withAdmin<{ path: string }>(undefined, async ({ adminId }) => {
    const file = formData.get("cover");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
    }
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "รับเฉพาะไฟล์รูปภาพ (JPG / PNG / GIF / WEBP)" };
    }

    const up = await uploadToBucket(file, PROFILE_COVER_BUCKET, "admin/customer-cover");
    if (!up.ok) return { ok: false, error: up.error };

    const admin = createAdminClient();
    const { error } = await admin
      .from("business_config")
      .upsert(coverRow(up.filename, adminId), { onConflict: "key" });
    if (error) {
      return { ok: false, error: `บันทึกค่าไม่สำเร็จ: ${error.message}` };
    }

    invalidateBusinessConfig(PROFILE_COVER_KEY);
    await logAdminAction(adminId, "set_profile_cover", "business_config", PROFILE_COVER_KEY, {
      path: up.filename,
    });
    return { ok: true, data: { path: up.filename } };
  });
}

/** Clear the cover → revert to the bundled default. Any admin. */
export async function adminResetProfileCover(): Promise<AdminActionResult> {
  return withAdmin(undefined, async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("business_config")
      .upsert(coverRow("", adminId), { onConflict: "key" });
    if (error) {
      return { ok: false, error: `รีเซ็ตไม่สำเร็จ: ${error.message}` };
    }
    invalidateBusinessConfig(PROFILE_COVER_KEY);
    await logAdminAction(adminId, "reset_profile_cover", "business_config", PROFILE_COVER_KEY);
    return { ok: true };
  });
}
