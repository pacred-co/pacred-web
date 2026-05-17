"use server";

import { z } from "zod";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * U1-1 (commit 185adfd) unified `containers` (0016 phase-H) into
 * `cargo_containers` (0033 spine). Following the audit finding (HIGH#1)
 * from the 871450b/0e652f0/185adfd batch review, every WRITE entrypoint
 * in this file now returns a deprecation error so the spine mirror does
 * not drift.
 *
 * Replacements:
 *   adminCreateContainer        → adminCreateContainer in actions/admin/warehouse.ts
 *   adminUpdateContainer        → adminSetContainerStatus / adminAttachShipmentToContainer / adminUpdateContainerMeta
 *   adminLinkForwardersToContainer → adminAttachShipmentToContainer (spine-side)
 *   adminUnlinkForwarder        → flip forwarders.cargo_container_id NULL via warehouse action (TBD)
 *
 * The legacy DETAIL page (/admin/containers/[id]) is being redirected
 * in a sibling change so callers naturally end up on the spine. The
 * stubs below are kept so any code that still imports them (e.g. mid-flight
 * client component bundles) returns a clear error instead of silently
 * writing to a deprecated table.
 *
 * The full file removal will land in a follow-up commit once the legacy
 * detail-page redirect is verified in prod.
 */

const DEPRECATION_ERROR =
  "ฟังก์ชันเดิม (legacy containers) ถูกยกเลิกแล้วตาม U1-1 — โปรดใช้ /admin/warehouse/containers (spine) แทน";

const createSchema = z.object({
  vendor_container_id: z.string().trim().max(100).optional(),
  vessel:              z.string().trim().max(200).optional(),
  carrier:             z.string().trim().max(200).optional(),
  origin_warehouse:    z.enum(["guangzhou","yiwu","other"]).default("guangzhou"),
  transport_type:      z.enum(["truck","ship","air"]).default("truck"),
  eta:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note:                z.string().trim().max(2000).optional(),
});

export async function adminCreateContainer(
  input: z.infer<typeof createSchema>,
): Promise<AdminActionResult<{ id: string; container_no: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["ops"], async ({ adminId }) => {
    await logAdminAction(adminId, "container.create_blocked_legacy", "container", "", {
      reason: "U1-1 deprecation",
      attempted_input: parsed.data,
    });
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

const STATUSES = ["preparing","sealed","in_transit","arrived_port","cleared_customs","delivered","cancelled"] as const;

const updateSchema = z.object({
  id:                  z.string().uuid(),
  status:              z.enum(STATUSES).optional(),
  vendor_container_id: z.string().trim().max(100).optional(),
  vessel:              z.string().trim().max(200).optional(),
  carrier:             z.string().trim().max(200).optional(),
  eta:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note:                z.string().trim().max(2000).optional(),
});

export async function adminUpdateContainer(
  input: z.infer<typeof updateSchema>,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["ops"], async ({ adminId }) => {
    await logAdminAction(adminId, "container.update_blocked_legacy", "container", parsed.data.id, {
      reason: "U1-1 deprecation",
      attempted_input: parsed.data,
    });
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

const linkSchema = z.object({
  container_id: z.string().uuid(),
  f_nos:        z.array(z.string()).min(1).max(200),
});

export async function adminLinkForwardersToContainer(
  input: z.infer<typeof linkSchema>,
): Promise<AdminActionResult<{ linked: number }>> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["ops"], async ({ adminId }) => {
    await logAdminAction(adminId, "container.link_forwarders_blocked_legacy", "container", parsed.data.container_id, {
      reason: "U1-1 deprecation",
      attempted_input: parsed.data,
    });
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

const unlinkSchema = z.object({
  forwarder_id: z.string().uuid(),
});

export async function adminUnlinkForwarder(
  input: z.infer<typeof unlinkSchema>,
): Promise<AdminActionResult> {
  const parsed = unlinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin(["ops"], async ({ adminId }) => {
    await logAdminAction(adminId, "container.unlink_forwarder_blocked_legacy", "forwarder", parsed.data.forwarder_id, {
      reason: "U1-1 deprecation",
    });
    return { ok: false, error: DEPRECATION_ERROR };
  });
}
