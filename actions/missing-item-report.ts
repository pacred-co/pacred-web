"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";

// ────────────────────────────────────────────────────────────────
// Customer "แจ้งของไม่ครบ/เสียหาย" missing-item report (2026-06-08 gap #4)
// ────────────────────────────────────────────────────────────────
//
// After a tb_forwarder reaches fstatus='7' (delivered), the customer can
// report missing or damaged goods from /service-import/[fNo]. This creates
// an ops ticket on the cross-department work-board via the idempotent
// ensure_work_item() RPC (entity_type='forwarder', entity_ref=fid,
// type='cs_followup'). The work-board (/admin/board) + per-role inbox then
// surface it to the ops/CS team. Re-submitting reuses the existing open
// ticket (ensure_work_item is find-or-create) and appends a note row, so a
// customer who submits twice doesn't spawn duplicate jobs.
//
// Ownership gate: the caller must own the forwarder
// (tb_forwarder.userid === profile.member_code). Reads/writes go through the
// admin client because the tb_* legacy lane is service_role-locked.

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const REPORT_KINDS = ["missing", "damaged", "both"] as const;

const submitMissingItemReportSchema = z.object({
  fid: z.number().int().positive(),
  kind: z.enum(REPORT_KINDS),
  detail: z
    .string()
    .trim()
    .min(5, "กรุณาอธิบายรายละเอียดอย่างน้อย 5 ตัวอักษร")
    .max(1000, "รายละเอียดยาวเกิน 1000 ตัวอักษร"),
});
export type SubmitMissingItemReportInput = z.infer<typeof submitMissingItemReportSchema>;

const KIND_LABEL: Record<(typeof REPORT_KINDS)[number], string> = {
  missing: "ของไม่ครบ/หาย",
  damaged: "ของเสียหาย",
  both: "ของไม่ครบและเสียหาย",
};

/**
 * Customer files a missing/damaged report on a delivered forwarder. Creates
 * (or reuses) a cs_followup work_item via ensure_work_item, then records the
 * customer's description as a comment on that work_item's thread so ops sees
 * the detail in /admin/board. Best-effort staff LINE ping after.
 */
export async function submitMissingItemReport(
  input: SubmitMissingItemReportInput,
): Promise<ActionResult<{ workItemId: string }>> {
  // Impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = submitMissingItemReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `validation: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  }
  const { fid, kind, detail } = parsed.data;

  const userData = await getCurrentUserWithProfile();
  if (!userData?.profile) return { ok: false, error: "not_signed_in" };
  const memberCode = userData.profile.member_code ?? "";
  if (!memberCode) return { ok: false, error: "missing_member_code" };

  const admin = createAdminClient();

  // Ownership + delivered-status gate (mirrors submitDeliveryFeedback).
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fstatus, ftrackingchn")
    .eq("id", fid)
    .maybeSingle<{
      id: number;
      userid: string | null;
      fstatus: string | null;
      ftrackingchn: string | null;
    }>();
  if (fwdErr) {
    console.error(`[missing-item-report fwd lookup] fid=${fid}`, {
      code: fwdErr.code, message: fwdErr.message,
    });
    return { ok: false, error: `fwd_lookup: ${fwdErr.message}` };
  }
  if (!fwd) return { ok: false, error: "not_found" };
  if ((fwd.userid ?? "") !== memberCode) {
    return { ok: false, error: "forbidden — รายการนี้ไม่ใช่ของคุณ" };
  }
  if ((fwd.fstatus ?? "") !== "7") {
    return { ok: false, error: "not_delivered — แจ้งได้หลังรายการอยู่สถานะ ส่งแล้ว" };
  }

  // Find-or-create the ops work_item for this forwarder. entity_ref is the
  // numeric forwarder id as text (per the prompt: entity_type='forwarder',
  // entity_ref=fid). type='cs_followup' = a customer ticket.
  const title = `ลูกค้าแจ้ง${KIND_LABEL[kind]} — F#${fid}`.slice(0, 200);
  const { data: wiId, error: rpcErr } = await admin.rpc("ensure_work_item", {
    p_entity_type:   "forwarder",
    p_entity_ref:    String(fid),
    p_type:          "cs_followup",
    p_title:         title,
    p_assigned_role: "ops",
    p_priority:      "high",
    p_due_at:        null,
  });
  if (rpcErr || !wiId) {
    console.error(`[missing-item-report ensure_work_item] fid=${fid}`, {
      code: rpcErr?.code, message: rpcErr?.message,
    });
    return { ok: false, error: rpcErr?.message ?? "work_item_create_failed" };
  }
  const workItemId = wiId as string;

  // Record the customer's description on the work_item thread (so ops reads
  // the detail in /admin/board). This is a customer-originated note, not an
  // admin message → author_admin_id is null, which the 0086 CHECK
  // `work_item_messages_system_kind_consistent` requires to pair with
  // kind='system' (a NULL author must be a machine/system row). Best-effort:
  // a failure here must not lose the already-created ticket.
  const noteBody =
    `📦 ลูกค้าแจ้ง${KIND_LABEL[kind]} (รหัสลูกค้า ${memberCode}` +
    `${fwd.ftrackingchn ? ` · Track ${fwd.ftrackingchn}` : ""})\n${detail}`;
  const { error: msgErr } = await admin.from("work_item_messages").insert({
    work_item_id:    workItemId,
    author_admin_id: null,
    kind:            "system",
    body:            noteBody.slice(0, 4000),
  });
  if (msgErr) {
    // Non-fatal — the ticket exists; ops will still see it on the board.
    console.error(`[missing-item-report work_item_messages] wi=${workItemId}`, {
      code: msgErr.code, message: msgErr.message,
    });
  }

  // Best-effort staff LINE ping (fire-and-forget; never fails the report).
  void notifyStaffGroup(
    `⚠️ ลูกค้าแจ้ง${KIND_LABEL[kind]} — F#${fid}\n` +
      `ลูกค้า ${memberCode}${fwd.ftrackingchn ? ` · Track ${fwd.ftrackingchn}` : ""}\n` +
      `รายละเอียด: ${detail.slice(0, 200)}`,
    {
      title:    `⚠️ แจ้ง${KIND_LABEL[kind]} — F#${fid}`,
      url:      `/admin/board/${workItemId}`,
      urlLabel: "เปิดดูงานในบอร์ด",
    },
  );

  revalidatePath(`/service-import/${fid}`);
  return { ok: true, data: { workItemId } };
}
