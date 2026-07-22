"use server";

import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevCockpitAdmin } from "@/lib/admin/dev-cockpit";
import { VIEW_AS_COOKIE, isPreviewableRole, wouldGrantMoneyVisibility } from "@/lib/admin/view-as-role";

/**
 * 👁 VIEW-AS-ROLE actions (ภูม 2026-07-22) — set/clear the display-only preview.
 * See lib/admin/view-as-role.ts for the safety contract. These only write the
 * cookie; the (admin) layout reads it to pick the SIDEBAR + cost-blur. No auth
 * gate, RLS, or data query ever reads it — a preview can't change real access.
 * The client calls router.refresh() after these so the layout re-renders.
 */

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8, // 8h · auto-expires so a forgotten preview doesn't linger forever
};

export async function setViewAsRole(
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  // Real god-role check (ultra/super) — a non-god who crafts this call is refused.
  const { user, roles } = await requireAdmin();
  if (!isGodRole(roles)) {
    return { ok: false, error: "เฉพาะ Ultra / Super เท่านั้นที่ดูมุมมอง role อื่นได้" };
  }
  // 2026-07-22 (ภูม) — this audit tool is scoped to ภูม's OWN account (the same
  // allowlist as the dev cockpit · AD008/admin_poom). Even another god (พี่ป๊อป)
  // is refused here, so the preview cookie can only ever be set for ภูม → nobody
  // else sees the picker OR the exit banner. Display-only either way.
  const admin = createAdminClient();
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("member_code, admin_login_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) {
    console.error("[setViewAsRole profile probe] failed", {
      code: profErr.code,
      message: profErr.message,
    });
    return { ok: false, error: "ตรวจสอบสิทธิ์ไม่สำเร็จ" };
  }
  if (!isDevCockpitAdmin(prof?.member_code, prof?.admin_login_id)) {
    return { ok: false, error: "เครื่องมือนี้เฉพาะบัญชีผู้ดูแลที่กำหนด" };
  }
  if (!isPreviewableRole(role)) {
    return { ok: false, error: "role ที่เลือกไม่ถูกต้อง" };
  }
  // MONEY-TIER GATE — refuse a target that would reveal COST/PROFIT this god's
  // REAL roles lack (e.g. a super previewing accounting/pricing). `ultra` passes
  // every tier, so an ultra operator is never restricted; this future-proofs the
  // day a super/normies account is allow-listed. See lib/admin/view-as-role.ts.
  if (wouldGrantMoneyVisibility(role, roles)) {
    return {
      ok: false,
      error: "ดูมุมมอง role นี้ไม่ได้ — จะเห็นข้อมูลต้นทุน/กำไรเกินสิทธิ์จริงของคุณ",
    };
  }
  const c = await cookies();
  c.set(VIEW_AS_COOKIE, role, COOKIE_OPTS);
  return { ok: true };
}

export async function clearViewAsRole(): Promise<{ ok: boolean }> {
  // Clearing is always safe (it only ever REMOVES the display override) — still
  // require an admin session so a random request can't poke cookies.
  await requireAdmin();
  const c = await cookies();
  c.delete(VIEW_AS_COOKIE);
  return { ok: true };
}
