"use server";

/**
 * Customer's OWN profile cover (owner 2026-06-22) — the "เปลี่ยนพื้นหลัง" button
 * on /profile. Facebook-style: each customer sets their own cover, independent
 * of the GLOBAL admin banner (actions/admin/profile-cover.ts).
 *
 * Storage:     member-docs/members/<auth-uid>/cover/<ts>-<name> (private bucket;
 *              signed on read · same bucket the global cover uses).
 * Persistence: a self-seeding `business_config` row keyed per customer
 *              (customerCoverKey(memberCode) · jsonb value = the path). NO
 *              migration — the exact mechanism the global cover already uses
 *              (actions/admin/profile-cover.ts). `business_config.updated_by_
 *              admin_id` is nullable (0076) so a customer write omits it.
 *              A `profiles.cover_url` column would be a cleaner long-term home;
 *              this avoids a prod schema change for a cosmetic, opt-in feature.
 *
 * Security: the customer mutates ONLY their own key (resolved from the
 * authenticated user.id → their member_code). They can NEVER touch the global
 * banner (that's admin-only · separate key/action). NON-COMMS · no money path.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { invalidateBusinessConfig } from "@/lib/business-config";
import { PROFILE_COVER_BUCKET, customerCoverKey } from "@/actions/admin/profile-cover-keys";
import { revalidatePath } from "next/cache";

export type UpdateCoverResult = { ok: true } | { ok: false; error: string };

/** Resolve the authenticated customer's member_code (the per-customer key id). */
async function myMemberCode(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", userId)
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    console.error("[profile-cover-self myMemberCode] failed", { code: error.code, message: error.message });
    return null;
  }
  return data?.member_code ?? null;
}

function coverRow(key: string, value: string) {
  return {
    key,
    value,
    value_type: "string" as const,
    category: "appearance",
    description: "รูปพื้นหลัง (cover) โปรไฟล์ลูกค้า — ลูกค้าตั้งเอง",
    updated_at: new Date().toISOString(),
  };
}

/** Upload + set the signed-in customer's own cover. */
export async function updateMyCover(formData: FormData): Promise<UpdateCoverResult> {
  const { user } = await requireAuth();
  if (!user?.id) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  if (!file.type.startsWith("image/")) return { ok: false, error: "รับเฉพาะไฟล์รูปภาพ (JPG / PNG / GIF / WEBP)" };

  const memberCode = await myMemberCode(user.id);
  if (!memberCode) return { ok: false, error: "ไม่พบบัญชีลูกค้า" };

  const up = await uploadToBucket(file, PROFILE_COVER_BUCKET, `members/${user.id}/cover`);
  if (!up.ok) return { ok: false, error: up.error };

  const admin = createAdminClient();
  const key = customerCoverKey(memberCode);
  const { error } = await admin.from("business_config").upsert(coverRow(key, up.filename), { onConflict: "key" });
  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` };

  invalidateBusinessConfig(key);
  revalidatePath("/profile");
  return { ok: true };
}

/** Clear the customer's own cover → revert to the global banner / default. */
export async function resetMyCover(): Promise<UpdateCoverResult> {
  const { user } = await requireAuth();
  if (!user?.id) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };

  const memberCode = await myMemberCode(user.id);
  if (!memberCode) return { ok: false, error: "ไม่พบบัญชีลูกค้า" };

  const admin = createAdminClient();
  const key = customerCoverKey(memberCode);
  const { error } = await admin.from("business_config").upsert(coverRow(key, ""), { onConflict: "key" });
  if (error) return { ok: false, error: `รีเซ็ตไม่สำเร็จ: ${error.message}` };

  invalidateBusinessConfig(key);
  revalidatePath("/profile");
  return { ok: true };
}
