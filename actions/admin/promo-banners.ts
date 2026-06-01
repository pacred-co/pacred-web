"use server";

/**
 * Admin server actions — promo-banner manager (multi-promo · 2026-06-01 · เดฟ).
 *
 * Super-only. The promo LIST lives as a JSON array in the EXISTING
 * `business_config` table under key `promo.banners` (value_type "json") — NO
 * new table / NO DDL migration (home machine's direct-DB/IPv6 is down; only
 * REST/DML works). Writes go through a REST upsert below.
 *
 * `setBusinessConfig` refuses UNKNOWN keys (schema-by-migration), so we can't
 * use it to first-create `promo.banners`. Instead we upsert the row directly
 * via the admin REST client (DML — allowed even with IPv6-direct-DB down), then
 * invalidate the 60s cache so the next read sees it.
 *
 * Image upload: `uploadToBucket(file, "avatars", "promo")` — the `avatars`
 * bucket is PUBLIC on prod (public read → `<img>` works without a signed URL).
 * Returns the public URL to store in `image_url`.
 *
 * See lib/promo/banners.ts for the read side + the PromoBanner shape.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateBusinessConfig } from "@/lib/business-config";
import {
  PROMO_BANNERS_KEY,
  normalizePromoBanners,
  readLegacySingleImportPromo,
  type PromoBanner,
} from "@/lib/promo/banners";
import { uploadToBucket } from "@/lib/storage/upload";

/** Public bucket for promo images (public read → no signed URL needed). */
const PROMO_IMAGE_BUCKET = "avatars";
const PROMO_IMAGE_PREFIX = "promo";

// ════════════════════════════════════════════════════════════
// Validation
// ════════════════════════════════════════════════════════════

const bannerSchema = z.object({
  id: z.string().trim().min(1).max(64),
  location: z.string().trim().min(1).max(40),
  headline: z.string().max(300).default(""),
  text: z.string().max(2000).default(""),
  amount_thb: z.coerce.number().min(0).max(100_000_000).default(0),
  image_url: z.string().max(2000).default(""),
  enabled: z.boolean().default(false),
  start_date: z.string().max(10).default(""),
  end_date: z.string().max(10).default(""),
  sort: z.coerce.number().int().min(0).max(100_000).default(0),
});

const saveSchema = z.object({
  banners: z.array(bannerSchema).max(200),
});
export type AdminSavePromoBannersInput = z.infer<typeof saveSchema>;

// ════════════════════════════════════════════════════════════
// Upsert helper — write the array into business_config (REST · no DDL)
// ════════════════════════════════════════════════════════════

/**
 * Upsert the `promo.banners` row (REST/DML). Inserts the row (with value_type
 * "json" · category "Promo") if it doesn't exist yet, else updates value +
 * audit columns. Invalidates the 60s cache so reads see the new value.
 */
async function writePromoBanners(
  banners: PromoBanner[],
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { error } = await admin.from("business_config").upsert(
    {
      key: PROMO_BANNERS_KEY,
      value: banners, // jsonb — the array
      value_type: "json",
      category: "Promo",
      description:
        "รายการแบนเนอร์โปรโมชัน (หลายอัน) — แก้ที่ /admin/settings/promos. แต่ละอันมี location/หัวข้อ/ข้อความ/จำนวนเงิน/รูป/เปิด-ปิด/ช่วงวันที่.",
      updated_by_admin_id: adminId,
      updated_at: nowIso,
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error(`[promo.banners upsert] failed`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: `save_failed:${error.message}` };
  }

  invalidateBusinessConfig(PROMO_BANNERS_KEY);
  return { ok: true };
}

/** Revalidate the surfaces that read promos (admin editor + the import page). */
function revalidatePromoSurfaces(): void {
  revalidatePath("/admin/settings/promos");
  revalidatePath("/service-import");
}

// ════════════════════════════════════════════════════════════
// adminSavePromoBanners — save the FULL list (add/edit/delete/reorder/toggle)
// ════════════════════════════════════════════════════════════
// The editor is a single-form "save everything" model: the client holds the
// whole array, mutates it locally (add/edit/delete/reorder/toggle), and posts
// the full array. Simpler + race-free vs per-item mutations on a JSON blob.

type SaveData = { count: number };

export async function adminSavePromoBanners(
  input: AdminSavePromoBannersInput,
): Promise<AdminActionResult<SaveData>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  return withAdmin<SaveData>(["super"], async ({ adminId }) => {
    // Normalise (defensive) + re-pack sort to a clean 0..n-1 per submit.
    const clean = normalizePromoBanners(parsed.data.banners)
      .sort((a, b) => a.sort - b.sort)
      .map((b, i) => ({ ...b, sort: i }));

    const res = await writePromoBanners(clean, adminId);
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "promo_banners.save", "business_config", PROMO_BANNERS_KEY, {
      count: clean.length,
      ids: clean.map((b) => b.id),
    });

    revalidatePromoSurfaces();
    return { ok: true, data: { count: clean.length } };
  });
}

// ════════════════════════════════════════════════════════════
// adminUploadPromoImage — upload one image, return its PUBLIC url
// ════════════════════════════════════════════════════════════
// Multipart FormData with field `file`. The client stores the returned url in
// the banner's image_url. Image-only (no PDF) — these are banner pictures.

type UploadData = { url: string };

export async function adminUploadPromoImage(
  formData: FormData,
): Promise<AdminActionResult<UploadData>> {
  return withAdmin<UploadData>(["super"], async ({ adminId }) => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "ไม่พบไฟล์" };
    }
    if (!/^image\//i.test(file.type)) {
      return { ok: false, error: `ต้องเป็นไฟล์รูปภาพ (${file.type || "unknown"})` };
    }

    const up = await uploadToBucket(file, PROMO_IMAGE_BUCKET, PROMO_IMAGE_PREFIX);
    if (!up.ok) return { ok: false, error: up.error };

    // Public bucket → resolve the public URL (no signing needed).
    const admin = createAdminClient();
    const { data } = admin.storage.from(PROMO_IMAGE_BUCKET).getPublicUrl(up.filename);
    const url = data?.publicUrl ?? "";
    if (!url) return { ok: false, error: "ไม่สามารถสร้าง URL รูปได้" };

    await logAdminAction(adminId, "promo_banners.upload_image", "storage", up.filename, {
      bucket: PROMO_IMAGE_BUCKET,
    });

    return { ok: true, data: { url } };
  });
}

// ════════════════════════════════════════════════════════════
// adminSeedLegacyImportPromo — import the OLD single promo as the first item
// ════════════════════════════════════════════════════════════
// One-click: read the 6 legacy `import.promo.*` keys → push them as the first
// entry in the array (only if the array doesn't already contain it). Lets the
// owner migrate the live banner into the new manager without retyping it.

type SeedData = { added: boolean; count: number };

export async function adminSeedLegacyImportPromo(): Promise<AdminActionResult<SeedData>> {
  return withAdmin<SeedData>(["super"], async ({ adminId }) => {
    const legacy = await readLegacySingleImportPromo();
    if (!legacy) return { ok: false, error: "no_legacy_promo" };

    const { getAllPromoBanners } = await import("@/lib/promo/banners");
    const existing = await getAllPromoBanners();
    if (existing.some((b) => b.id === legacy.id)) {
      return { ok: true, data: { added: false, count: existing.length } };
    }

    const next = [{ ...legacy, sort: 0 }, ...existing.map((b) => ({ ...b, sort: b.sort + 1 }))];
    const res = await writePromoBanners(next, adminId);
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "promo_banners.seed_legacy", "business_config", PROMO_BANNERS_KEY, {
      count: next.length,
    });

    revalidatePromoSurfaces();
    return { ok: true, data: { added: true, count: next.length } };
  });
}
