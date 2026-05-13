"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const STATUSES = ["preparing","sealed","in_transit","arrived_port","cleared_customs","delivered","cancelled"] as const;

const createSchema = z.object({
  vendor_container_id: z.string().trim().max(100).optional(),
  vessel:              z.string().trim().max(200).optional(),
  carrier:             z.string().trim().max(200).optional(),
  origin_warehouse:    z.enum(["guangzhou","yiwu","other"]).default("guangzhou"),
  transport_type:      z.enum(["truck","ship","air"]).default("truck"),
  eta:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note:                z.string().trim().max(2000).optional(),
});

export async function adminCreateContainer(input: z.infer<typeof createSchema>): Promise<AdminActionResult<{ id: string; container_no: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("containers")
      .insert({
        vendor_container_id: d.vendor_container_id ?? null,
        vessel:              d.vessel ?? null,
        carrier:             d.carrier ?? null,
        origin_warehouse:    d.origin_warehouse,
        transport_type:      d.transport_type,
        eta:                 d.eta ?? null,
        note:                d.note ?? null,
        admin_id_create:     adminId,
      })
      .select("id, container_no")
      .single<{ id: string; container_no: string }>();
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "container.create", "container", data.id, d);
    revalidatePath("/admin/containers");
    return { ok: true, data };
  });
}

const updateSchema = z.object({
  id:                  z.string().uuid(),
  status:              z.enum(STATUSES).optional(),
  vendor_container_id: z.string().trim().max(100).optional(),
  vessel:              z.string().trim().max(200).optional(),
  carrier:             z.string().trim().max(200).optional(),
  eta:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note:                z.string().trim().max(2000).optional(),
});

const STATUS_DATE_COL: Record<string, string> = {
  sealed:           "date_sealed",
  in_transit:       "date_in_transit",
  arrived_port:     "date_arrived_port",
  cleared_customs:  "date_cleared",
  delivered:        "date_delivered",
};

export async function adminUpdateContainer(input: z.infer<typeof updateSchema>): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const update: Record<string, unknown> = { admin_id_update: adminId };
    if (d.status) {
      update.status = d.status;
      const dateCol = STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = new Date().toISOString();
    }
    if (d.vendor_container_id != null) update.vendor_container_id = d.vendor_container_id || null;
    if (d.vessel != null)              update.vessel              = d.vessel || null;
    if (d.carrier != null)             update.carrier             = d.carrier || null;
    if (d.eta != null)                 update.eta                 = d.eta || null;
    if (d.note != null)                update.note                = d.note || null;

    const { error } = await admin.from("containers").update(update).eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "container.update", "container", d.id, update);
    revalidatePath("/admin/containers");
    revalidatePath(`/admin/containers/${d.id}`);
    return { ok: true };
  });
}

// ── Link / unlink forwarders to a container ──────────────────────────────

const linkSchema = z.object({
  container_id: z.string().uuid(),
  f_nos:        z.array(z.string()).min(1).max(200),
});

/**
 * Bulk-link forwarders to a container (sets forwarders.container_id).
 * Only forwarders not already linked to another container are accepted —
 * silently ignores rows already linked (caller can refetch to see).
 */
export async function adminLinkForwardersToContainer(
  input: z.infer<typeof linkSchema>,
): Promise<AdminActionResult<{ linked: number }>> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { container_id, f_nos } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Only update rows that don't already have a container
    const { data: updated, error } = await admin
      .from("forwarders")
      .update({ container_id, admin_id_update: adminId })
      .in("f_no", f_nos)
      .is("container_id", null)
      .select("id");

    if (error) return { ok: false, error: error.message };

    const linked = updated?.length ?? 0;
    await logAdminAction(adminId, "container.link_forwarders", "container", container_id, { f_nos, linked });
    revalidatePath("/admin/containers");
    revalidatePath(`/admin/containers/${container_id}`);
    revalidatePath("/admin/forwarders");
    return { ok: true, data: { linked } };
  });
}

const unlinkSchema = z.object({
  forwarder_id: z.string().uuid(),
});

/** Unlink a single forwarder from its container (sets container_id = NULL). */
export async function adminUnlinkForwarder(
  input: z.infer<typeof unlinkSchema>,
): Promise<AdminActionResult> {
  const parsed = unlinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { forwarder_id } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("forwarders")
      .select("id, f_no, container_id")
      .eq("id", forwarder_id)
      .maybeSingle<{ id: string; f_no: string | null; container_id: string | null }>();
    if (!before) return { ok: false, error: "not_found" };

    const { error } = await admin
      .from("forwarders")
      .update({ container_id: null, admin_id_update: adminId })
      .eq("id", forwarder_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "container.unlink_forwarder", "forwarder", forwarder_id, {
      f_no:          before.f_no,
      from_container: before.container_id,
    });
    revalidatePath("/admin/containers");
    if (before.container_id) revalidatePath(`/admin/containers/${before.container_id}`);
    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}
