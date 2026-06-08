"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";

// ────────────────────────────────────────────────────────────────
// Customer delivery feedback — ops-workflow audit 2026-06-05 §32 Phase 4a
// ────────────────────────────────────────────────────────────────
//
// After a tb_forwarder reaches fstatus='7' (delivered), the customer can
// optionally rate the delivery, leave a comment, and/or attach a photo
// from /service-import/[fNo]. All three are optional but the action
// requires ≥1 to be set (matches the DB CHECK constraint — `at_least_one`).
//
// Ownership gate: the caller must own the forwarder
// (tb_forwarder.userid === profile.member_code). Reads/writes go through
// the admin client because the entire tb_* legacy lane is service_role-
// locked (see CLAUDE_TECHNICAL.md `DB schema — two coexisting worlds`).
//
// Edit window: feedback is open until 7 days after tb_forwarder.fdatestatus7
// (or current time if fdatestatus7 is null — soft-fallback so a delivered
// forwarder without the timestamp filled in still accepts feedback).

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const FEEDBACK_EDIT_DAYS = 7;

// ────────────────────────────────────────────────────────────────
// 1) Photo upload — mirrors uploadForwarderSlip in actions/forwarder.ts.
//    Lands in the existing private `slips` bucket under the per-user
//    folder so the bucket RLS (`auth.uid()::text =
//    (storage.foldername(name))[1]`) authorises the write. The path
//    template `{auth.uid()}/delivery_feedback/{ts}.{ext}` mirrors the
//    `{auth.uid()}/forwarder_payment/{ts}.{ext}` slip template.
// ────────────────────────────────────────────────────────────────
export async function uploadDeliveryFeedbackPhoto(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  // Impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[delivery-feedback uploadPhoto auth] failed`, {
      code: authErr.code, message: authErr.message,
    });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "photo_missing — กรุณาแนบรูป" };
  }
  // Customer feedback photos are image-only (no PDF — this is damage
  // evidence, not a transfer slip).
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "photo_type — ต้องเป็นรูปภาพเท่านั้น" };
  }
  // 5 MB cap (matches the slips bucket default + customer phone uploads).
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "photo_too_large — ไฟล์ใหญ่เกิน 5 MB" };
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${user.id}/delivery_feedback/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("slips")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) {
    return { ok: false, error: `photo_upload: ${upErr.message}` };
  }
  return { ok: true, data: { path } };
}

// ────────────────────────────────────────────────────────────────
// 2) Submit feedback — UPSERT one row per fid. Validates ownership +
//    fstatus=7 + edit window + at-least-one-field-set.
// ────────────────────────────────────────────────────────────────
const submitDeliveryFeedbackSchema = z.object({
  fid: z.number().int().positive(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  comment: z
    .string()
    .max(500, "comment_too_long — ความคิดเห็นยาวเกิน 500 ตัวอักษร")
    .trim()
    .nullable()
    .optional(),
  photoPath: z.string().min(1).max(500).nullable().optional(),
});

export async function submitDeliveryFeedback(
  input: z.infer<typeof submitDeliveryFeedbackSchema>,
): Promise<ActionResult<{ id: number; updated: boolean }>> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = submitDeliveryFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `validation: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  }
  const { fid, rating, comment, photoPath } = parsed.data;

  // At least one content field must be set (matches DB CHECK constraint).
  const hasContent =
    (rating !== null && rating !== undefined) ||
    (comment !== null && comment !== undefined && comment !== "") ||
    (photoPath !== null && photoPath !== undefined && photoPath !== "");
  if (!hasContent) {
    return {
      ok: false,
      error: "empty_feedback — กรุณาให้คะแนน เขียนความคิดเห็น หรือแนบรูป อย่างน้อย 1 อย่าง",
    };
  }

  const userData = await getCurrentUserWithProfile();
  if (!userData?.profile) return { ok: false, error: "not_signed_in" };
  const memberCode = userData.profile.member_code ?? "";
  if (!memberCode) return { ok: false, error: "missing_member_code" };

  const admin = createAdminClient();

  // Ownership + delivered-status + edit-window gate.
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fstatus, fdatestatus7")
    .eq("id", fid)
    .maybeSingle<{
      id: number;
      userid: string | null;
      fstatus: string | null;
      fdatestatus7: string | null;
    }>();
  if (fwdErr) {
    console.error(`[delivery-feedback fwd lookup] fid=${fid}`, {
      code: fwdErr.code, message: fwdErr.message,
    });
    return { ok: false, error: `fwd_lookup: ${fwdErr.message}` };
  }
  if (!fwd) return { ok: false, error: "not_found" };
  if ((fwd.userid ?? "") !== memberCode) {
    return { ok: false, error: "forbidden — รายการนี้ไม่ใช่ของคุณ" };
  }
  if ((fwd.fstatus ?? "") !== "7") {
    return { ok: false, error: "not_delivered — รายการยังไม่ได้สถานะ ส่งแล้ว" };
  }
  // 7-day edit window from fdatestatus7. If fdatestatus7 is missing
  // (legacy data quirk on some prod rows), fall back to allowing the
  // submission — better than blocking a real delivered customer.
  if (fwd.fdatestatus7) {
    const deliveredAt = new Date(fwd.fdatestatus7.replace(" ", "T"));
    if (!isNaN(deliveredAt.getTime())) {
      const ageDays =
        (Date.now() - deliveredAt.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > FEEDBACK_EDIT_DAYS) {
        return {
          ok: false,
          error: `window_closed — feedback ปิดรับหลังส่งแล้ว ${FEEDBACK_EDIT_DAYS} วัน`,
        };
      }
    }
  }

  // UPSERT on the unique fid (one feedback per forwarder). We do the
  // existence probe first so we can return whether this was an UPDATE
  // (the UI shows different success copy for first-submit vs edit).
  const { data: existing, error: existErr } = await admin
    .from("delivery_feedback")
    .select("id")
    .eq("fid", fid)
    .maybeSingle<{ id: number }>();
  if (existErr) {
    console.error(`[delivery-feedback exist probe] fid=${fid}`, {
      code: existErr.code, message: existErr.message,
    });
    return { ok: false, error: `exist_probe: ${existErr.message}` };
  }

  const cleanComment =
    comment !== null && comment !== undefined && comment !== ""
      ? comment
      : null;
  const cleanRating = rating ?? null;
  const cleanPhoto =
    photoPath !== null && photoPath !== undefined && photoPath !== ""
      ? photoPath
      : null;

  if (existing) {
    const { data: updated, error: upErr } = await admin
      .from("delivery_feedback")
      .update({
        rating: cleanRating,
        comment: cleanComment,
        photo_path: cleanPhoto,
        // updated_at handled by the trigger.
      })
      .eq("id", existing.id)
      .select("id")
      .maybeSingle<{ id: number }>();
    if (upErr) {
      console.error(`[delivery-feedback update] fid=${fid}`, {
        code: upErr.code, message: upErr.message,
      });
      return { ok: false, error: `update: ${upErr.message}` };
    }
    revalidatePath(`/service-import/${fid}`);
    return { ok: true, data: { id: updated?.id ?? existing.id, updated: true } };
  }

  const { data: inserted, error: insErr } = await admin
    .from("delivery_feedback")
    .insert({
      fid,
      userid: memberCode,
      rating: cleanRating,
      comment: cleanComment,
      photo_path: cleanPhoto,
    })
    .select("id")
    .maybeSingle<{ id: number }>();
  if (insErr) {
    console.error(`[delivery-feedback insert] fid=${fid}`, {
      code: insErr.code, message: insErr.message,
    });
    return { ok: false, error: `insert: ${insErr.message}` };
  }
  revalidatePath(`/service-import/${fid}`);
  return { ok: true, data: { id: inserted?.id ?? 0, updated: false } };
}

// ────────────────────────────────────────────────────────────────
// 3) Read existing feedback for a forwarder (called from the [fNo] page).
//    Returns null when none exists. Validates ownership in the same shape
//    as submitDeliveryFeedback so a guest URL-paste cannot probe another
//    user's data.
// ────────────────────────────────────────────────────────────────
export async function getDeliveryFeedbackForFwd(
  fid: number,
): Promise<
  | { ok: true; data: null | { rating: number | null; comment: string | null; photoPath: string | null; createdAt: string; updatedAt: string } }
  | { ok: false; error: string }
> {
  if (!Number.isFinite(fid) || fid <= 0) return { ok: false, error: "bad_fid" };

  const userData = await getCurrentUserWithProfile();
  if (!userData?.profile) return { ok: false, error: "not_signed_in" };
  const memberCode = userData.profile.member_code ?? "";
  if (!memberCode) return { ok: false, error: "missing_member_code" };

  const admin = createAdminClient();

  // Same ownership check as submit (prevents cross-user reads).
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("userid")
    .eq("id", fid)
    .maybeSingle<{ userid: string | null }>();
  if (fwdErr) {
    console.error(`[delivery-feedback read fwd] fid=${fid}`, {
      code: fwdErr.code, message: fwdErr.message,
    });
    return { ok: false, error: `fwd_lookup: ${fwdErr.message}` };
  }
  if (!fwd || (fwd.userid ?? "") !== memberCode) {
    return { ok: false, error: "forbidden" };
  }

  const { data, error } = await admin
    .from("delivery_feedback")
    .select("rating, comment, photo_path, created_at, updated_at")
    .eq("fid", fid)
    .maybeSingle<{
      rating: number | null;
      comment: string | null;
      photo_path: string | null;
      created_at: string;
      updated_at: string;
    }>();
  if (error) {
    console.error(`[delivery-feedback read] fid=${fid}`, {
      code: error.code, message: error.message,
    });
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      rating: data.rating,
      comment: data.comment,
      photoPath: data.photo_path,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}
