"use server";

/**
 * Parcel-exception handling for ฝากนำเข้า (tb_forwarder) — gap G7 · เดฟ 2026-06-30.
 *
 * The SAFE MVP: FLAG + RECORD + RESOLVE only. The China-ops chats constantly
 * surface พัสดุไม่ใช่ของลูกค้า / ของแตก / ตู้ตีกลับ / ของติดด่าน / PR สลับ, but
 * Pacred had no way to mark a row as an exception. These actions let ops/
 * warehouse staff RECORD the exception (type + note + optional photo) and later
 * RESOLVE it — surfacing an open-exceptions queue (/admin/forwarders/exceptions).
 *
 * 🔒 MONEY/OWNERSHIP ISOLATION (AGENTS.md §0e · the whole point of the SAFE MVP):
 *   Both actions write ONLY the fexception_* columns (+ adminidupdate for audit).
 *   They NEVER touch fstatus, any f*price/ftotalprice, fweight/fvolume, userid,
 *   billing, tb_credit, tb_wallet*, or tb_payment. For wrong_pr / not_mine the
 *   action only RECORDS the flag — it does NOT auto-retag the customer or auto-
 *   remove the row from a bill; the UI points staff at the EXISTING audited paths
 *   (the inline แก้ไขลูกค้า field + the วางบิล button), which owner/accounting drive.
 *
 * §0f confirm-before-mutate: the client flag/resolve controls confirm first.
 * mig 0230 adds the columns.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ops/warehouse/super (+ god roles inherit super via requireAdmin's isGodRole).
const ROLES = ["ops", "warehouse", "super"] as const;

// The exception kinds the ops chats actually show. Kept in sync with the
// migration's documented enum + the client labels below.
export const EXCEPTION_TYPES = [
  "not_mine",
  "damaged",
  "container_returned",
  "customs_held",
  "wrong_pr",
  "other",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  not_mine:           "พัสดุไม่ใช่ของลูกค้ารายนี้",
  damaged:            "ของแตก/ชำรุด",
  container_returned: "ตู้ตีกลับ",
  customs_held:       "ของติดด่าน/ศุลกากร",
  wrong_pr:           "PR สลับ/ทักผิดราย",
  other:              "อื่นๆ",
};

// ────────────────────────────────────────────────────────────
// Resolve the caller's legacy admin id (tb_forwarder.fexception_by is
// varchar(50)). Mirrors the helper in forwarders-edit.ts (kept local to
// avoid importing a non-exported function).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[forwarder-exception auth] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[forwarder-exception tb_admin] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 50);
}

// ────────────────────────────────────────────────────────────
// flagForwarderException — RECORD an exception on a forwarder row.
// Accepts FormData (so an optional photo File can ride along) OR a plain object.
// ────────────────────────────────────────────────────────────
const flagSchema = z.object({
  fNo:  z.number().int().positive(),
  type: z.enum(EXCEPTION_TYPES),
  note: z.string().trim().max(2000, "หมายเหตุยาวเกิน 2000 ตัวอักษร").default(""),
});
export type FlagForwarderExceptionInput = z.infer<typeof flagSchema>;

type ParsedFlag = { fNo: number; type: ExceptionType; note: string; photo: File | null };

function parseFlagInput(input: FormData | FlagForwarderExceptionInput): ParsedFlag | { error: string } {
  if (input instanceof FormData) {
    const fNo = Number(input.get("fNo"));
    const type = String(input.get("type") ?? "");
    const note = String(input.get("note") ?? "");
    const fileVal = input.get("photo");
    const photo = fileVal instanceof File && fileVal.size > 0 ? fileVal : null;
    const parsed = flagSchema.safeParse({ fNo, type, note });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
    return { ...parsed.data, photo };
  }
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return { ...parsed.data, photo: null };
}

/**
 * Flag a tb_forwarder row as an exception. Writes ONLY fexception_* columns
 * (+ adminidupdate for audit). Optional photo → uploaded to the slips bucket
 * FIRST so a failed upload aborts BEFORE the record write. Idempotent-friendly:
 * re-flagging overwrites the exception fields (latest staff entry wins) and
 * re-opens a resolved one.
 */
export async function flagForwarderException(
  input: FormData | FlagForwarderExceptionInput,
): Promise<AdminActionResult> {
  const parsed = parseFlagInput(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const { fNo, type, note, photo } = parsed;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 50);

    // Confirm the row exists (and grab the current exception state for audit).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fexception_status, fexception_type")
      .eq("id", fNo)
      .maybeSingle<{ id: number; fexception_status: string | null; fexception_type: string | null }>();
    if (fwdErr) {
      console.error(`[flagForwarderException read] failed`, { code: fwdErr.code, message: fwdErr.message, fNo });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // Optional photo — upload FIRST (a failed upload must not leave a half-flag).
    let photoPath: string | null = null;
    if (photo) {
      const up = await uploadToBucket(photo, "slips", `admin/forwarder-exception/${fNo}`);
      if (!up.ok) return { ok: false, error: up.error };
      photoPath = up.filename;
    }

    // Build the update — write ONLY the exception columns. Keep an existing
    // photo when no new one is supplied (so editing the note doesn't drop it).
    const patch: Record<string, unknown> = {
      fexception_type:   type,
      fexception_note:   note || null,
      fexception_status: "open",
      fexception_at:     new Date().toISOString(),
      fexception_by:     legacyAdminId,
      adminidupdate:     legacyAdminId,
    };
    if (photoPath) patch.fexception_photo = photoPath;

    const { error: updErr } = await admin.from("tb_forwarder").update(patch).eq("id", fNo);
    if (updErr) {
      console.error(`[flagForwarderException update] failed`, { code: updErr.code, message: updErr.message, fNo });
      return { ok: false, error: `บันทึกการแจ้งปัญหาไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.flag_exception", "tb_forwarder", String(fNo), {
      before: { status: fwd.fexception_status, type: fwd.fexception_type },
      after: { status: "open", type, hasPhoto: photoPath != null },
    });

    revalidatePath(`/admin/forwarders/${fNo}`);
    revalidatePath("/admin/forwarders/exceptions");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// resolveForwarderException — close an open exception (sets status='resolved').
// ────────────────────────────────────────────────────────────
const resolveSchema = z.object({
  fNo:  z.number().int().positive(),
  note: z.string().trim().max(2000, "หมายเหตุยาวเกิน 2000 ตัวอักษร").default(""),
});
export type ResolveForwarderExceptionInput = z.infer<typeof resolveSchema>;

/**
 * Mark a forwarder's open exception as resolved. Appends the resolution note to
 * the existing exception note (keeps the trail) and stamps who/when. Writes ONLY
 * the fexception_* columns — never money/status/ownership.
 */
export async function resolveForwarderException(
  rawInput: ResolveForwarderExceptionInput,
): Promise<AdminActionResult> {
  const parsed = resolveSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 50);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fexception_status, fexception_note")
      .eq("id", d.fNo)
      .maybeSingle<{ id: number; fexception_status: string | null; fexception_note: string | null }>();
    if (fwdErr) {
      console.error(`[resolveForwarderException read] failed`, { code: fwdErr.code, message: fwdErr.message, fNo: d.fNo });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    if ((fwd.fexception_status ?? "") !== "open") {
      return { ok: false, error: "รายการนี้ไม่มีปัญหาที่เปิดค้างอยู่" };
    }

    // Append the resolution note (keep the original detail trail).
    const resolveLine = d.note
      ? `\n— ปิดเคส (${legacyAdminId}): ${d.note}`.slice(0, 2000)
      : `\n— ปิดเคส (${legacyAdminId})`;
    const mergedNote = `${fwd.fexception_note ?? ""}${resolveLine}`.slice(0, 2000);

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        fexception_status: "resolved",
        fexception_note:   mergedNote,
        fexception_at:     new Date().toISOString(),
        fexception_by:     legacyAdminId,
        adminidupdate:     legacyAdminId,
      })
      .eq("id", d.fNo);
    if (updErr) {
      console.error(`[resolveForwarderException update] failed`, { code: updErr.code, message: updErr.message, fNo: d.fNo });
      return { ok: false, error: `ปิดเคสไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.resolve_exception", "tb_forwarder", String(d.fNo), {
      note: d.note || null,
    });

    revalidatePath(`/admin/forwarders/${d.fNo}`);
    revalidatePath("/admin/forwarders/exceptions");
    return { ok: true };
  });
}
