"use server";

import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";
import { VIEW_AS_COOKIE, isPreviewableRole } from "@/lib/admin/view-as-role";

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
  const { roles } = await requireAdmin();
  if (!isGodRole(roles)) {
    return { ok: false, error: "เฉพาะ Ultra / Super เท่านั้นที่ดูมุมมอง role อื่นได้" };
  }
  if (!isPreviewableRole(role)) {
    return { ok: false, error: "role ที่เลือกไม่ถูกต้อง" };
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
