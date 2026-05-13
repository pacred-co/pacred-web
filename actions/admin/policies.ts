"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const CATEGORY = z.enum(["general", "hr", "it", "finance", "operations", "compliance", "safety", "data_privacy"]);

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^\w฀-๿\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || `policy-${Date.now()}`;

const upsertSchema = z.object({
  id:           z.string().uuid().optional(),
  title:        z.string().trim().min(2).max(200),
  category:     CATEGORY,
  version:      z.string().trim().max(20).optional(),
  body:         z.string().trim().max(50_000).optional().nullable(),
  external_url: z.string().trim().max(500).optional().nullable(),
  requires_ack: z.boolean().optional(),
  is_published: z.boolean().optional(),
  effective_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expires_at:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function adminUpsertPolicy(input: z.infer<typeof upsertSchema>): Promise<AdminActionResult<{ id: string }>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const wasPublished = d.is_published;

    if (d.id) {
      const patch: Record<string, unknown> = {
        title:        d.title,
        category:     d.category,
        version:      d.version       ?? "1.0",
        body:         d.body          ?? null,
        external_url: d.external_url  ?? null,
        requires_ack: d.requires_ack  ?? false,
        is_published: wasPublished ?? false,
        effective_at: d.effective_at  ?? null,
        expires_at:   d.expires_at    ?? null,
      };
      if (wasPublished) patch.published_at = new Date().toISOString();

      const { error } = await admin.from("policies").update(patch).eq("id", d.id);
      if (error) return { ok: false, error: error.message };
      await logAdminAction(adminId, "policy.update", "policy", d.id, d);
      revalidatePath("/admin/hr/policies");
      return { ok: true, data: { id: d.id } };
    }

    const slug = `${slugify(d.title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await admin
      .from("policies")
      .insert({
        slug,
        title:        d.title,
        category:     d.category,
        version:      d.version       ?? "1.0",
        body:         d.body          ?? null,
        external_url: d.external_url  ?? null,
        requires_ack: d.requires_ack  ?? false,
        is_published: wasPublished    ?? false,
        published_at: wasPublished ? new Date().toISOString() : null,
        effective_at: d.effective_at  ?? null,
        expires_at:   d.expires_at    ?? null,
        created_by:   adminId,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "policy.create", "policy", data.id, d);
    revalidatePath("/admin/hr/policies");
    return { ok: true, data: { id: data.id } };
  });
}

const togglePublishSchema = z.object({
  id:          z.string().uuid(),
  is_published: z.boolean(),
});

export async function adminTogglePublishPolicy(input: z.infer<typeof togglePublishSchema>): Promise<AdminActionResult> {
  const parsed = togglePublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("policies")
      .update({
        is_published: parsed.data.is_published,
        published_at: parsed.data.is_published ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, parsed.data.is_published ? "policy.publish" : "policy.unpublish", "policy", parsed.data.id);
    revalidatePath("/admin/hr/policies");
    return { ok: true };
  });
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function adminDeletePolicy(input: z.infer<typeof deleteSchema>): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin.from("policies").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(adminId, "policy.delete", "policy", parsed.data.id);
    revalidatePath("/admin/hr/policies");
    return { ok: true };
  });
}
