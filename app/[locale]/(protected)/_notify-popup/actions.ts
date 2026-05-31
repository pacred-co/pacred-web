"use server";

/**
 * Customer login-popup — mark a `tb_notify` announcement as read.
 *
 * 2026-06-01 — Faithful port of `pcs-admin/include/pages/index/userReadNotify.php`:
 *   INSERT INTO `tb_notify_read` (`userID`,`popID`) VALUES ('$userID','$popID')
 *
 * The customer's `userid` is the authenticated user's member_code (never trust
 * a client-passed id). `tb_notify_read` columns are lowercase (migration 0081):
 * userid varchar(10) · popid bigint.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

export async function markNotifyRead(popId: number): Promise<Result> {
  const { profile } = await requireAuth();
  const userId = profile?.member_code ?? "";
  if (!userId) return { ok: false, error: "no_member_code" };

  const id = Number(popId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "bad_popid" };

  const admin = createAdminClient();

  // Idempotent — don't double-insert if the customer acknowledges twice
  // (e.g. clicks "ดูรายละเอียด" then re-opens). Legacy didn't guard this, but a
  // duplicate read receipt is harmless and a quick existence check avoids row
  // bloat without changing the observable behaviour (still "read").
  const { data: existing, error: chkErr } = await admin
    .from("tb_notify_read")
    .select("id")
    .eq("userid", userId)
    .eq("popid", id)
    .maybeSingle<{ id: number }>();
  if (chkErr) {
    console.error(`[tb_notify_read check] failed`, { code: chkErr.code, message: chkErr.message, userId, popid: id });
  }
  if (existing) return { ok: true };

  const { error: insErr } = await admin
    .from("tb_notify_read")
    .insert({ userid: userId, popid: id });
  if (insErr) {
    console.error(`[tb_notify_read insert] failed`, { code: insErr.code, message: insErr.message, userId, popid: id });
    return { ok: false, error: "insert_failed" };
  }

  return { ok: true };
}
