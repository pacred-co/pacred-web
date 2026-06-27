/**
 * Positions (ตำแหน่ง) read helpers (owner ปอน 2026-06-27).
 *
 * A position belongs to a department (lib/admin/departments.ts) and references a
 * `workspace_role` — an AdminRole menu key (lib/admin/sidebar-menu.ts ROLE_MENUS)
 * that decides the staffer's workspace (which menus/pages they see). Positions
 * are CRUD-able via /admin/positions (actions/admin/positions.ts).
 *
 * server-only: reads the `admin_positions` table via the service-role client.
 * The pure department SOT is in departments.ts (client-safe); this module is the
 * DB-touching half.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/auth/require-admin";

export type AdminPosition = {
  id: string;
  name_th: string;
  department: string;
  workspace_role: AdminRole;
  is_active: boolean;
};

const COLS = "id, name_th, department, workspace_role, is_active";

/** Active positions only — for the create-admin dropdown (grouped by department client-side). */
export async function listActivePositions(): Promise<AdminPosition[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_positions")
    .select(COLS)
    .eq("is_active", true)
    .order("department", { ascending: true })
    .order("name_th", { ascending: true });
  if (error) {
    console.error("[listActivePositions] failed", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as AdminPosition[];
}

/** Every position incl. inactive — for the management page. */
export async function listAllPositions(): Promise<AdminPosition[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_positions")
    .select(COLS)
    .order("is_active", { ascending: false })
    .order("department", { ascending: true })
    .order("name_th", { ascending: true });
  if (error) {
    console.error("[listAllPositions] failed", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as AdminPosition[];
}

/**
 * The workspace-role (menu template) for a STAFFER — resolved via their
 * admin_contact_extras.position_id → admin_positions.workspace_role. Drives the
 * position-scoped sidebar (lib/admin/sidebar-menu.ts menuForStaffer). Returns
 * null when the staffer has no position (or it's inactive) → caller falls back
 * to the role menu (ultra/super see all; normies see all until assigned). Best-
 * effort: a read error returns null (fail-soft → full/role menu, never a blank).
 */
export async function getStafferWorkspaceRole(profileId: string): Promise<AdminRole | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_contact_extras")
    .select("position:admin_positions!position_id ( workspace_role, is_active )")
    .eq("profile_id", profileId)
    .maybeSingle<{ position: { workspace_role: AdminRole; is_active: boolean } | { workspace_role: AdminRole; is_active: boolean }[] | null }>();
  if (error) {
    console.error("[getStafferWorkspaceRole] failed", { code: error.code, message: error.message, profileId });
    return null;
  }
  const pos = Array.isArray(data?.position) ? data?.position[0] : data?.position;
  if (!pos || !pos.is_active) return null;
  return pos.workspace_role;
}

/**
 * The workspace-role (menu template) for a single position id — used by the
 * sidebar/auth wiring to resolve a staffer's menu from their position. Returns
 * null when the position is missing/inactive (caller falls back to the legacy
 * role menu).
 */
export async function getPositionWorkspaceRole(
  positionId: string | null | undefined,
): Promise<AdminRole | null> {
  if (!positionId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_positions")
    .select("workspace_role, is_active")
    .eq("id", positionId)
    .maybeSingle<{ workspace_role: AdminRole; is_active: boolean }>();
  if (error) {
    console.error("[getPositionWorkspaceRole] failed", { code: error.code, message: error.message, positionId });
    return null;
  }
  if (!data || !data.is_active) return null;
  return data.workspace_role;
}
