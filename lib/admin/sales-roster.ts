/**
 * Sales-roster SOT — the LIVE set of active sales reps, data-driven.
 *
 * Owner directive (2026-06-15): "ให้มันผูกกันหมดออโต้" — stop hardcoding the
 * sales team count. EVERY sales surface (the customer-facing team carousel, the
 * round-robin lead assignment, admin rep filters/dropdowns) must read this ONE
 * source, so designating a rep (toggle `adminStatusSale`) auto-updates all of
 * them with zero code change.
 *
 * The pool is the LEGACY model the round-robin already uses
 * (`lib/admin/assign-sales-rep.ts`): `tb_admin` WHERE adminStatusA='1' (active
 * staff) AND adminStatusSale='1' (flagged as a sales rep). The picked
 * `tb_admin.adminID` is exactly what `tb_users.adminIDSale` stores, so it
 * round-trips into the customer's assigned-rep display.
 *
 * Server-only — reads `tb_admin` (camelCase per migration 0113).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const SCOPE = "sales-roster";

export type SalesRep = {
  /** Legacy `tb_admin.adminID` — the value stored in `tb_users.adminIDSale`. */
  adminID: string;
  /** Short display name — nickname when set, else first name. */
  name: string;
  /** Full name (first + last) for formal contexts. */
  fullName: string;
  /** Raw phone (tel: href after stripping). */
  phone: string;
  /** Display phone (0xx-xxx-xxxx). */
  phoneDisplay: string;
  /** `tb_admin.adminPicture` when set, else null (UI supplies a fallback). */
  photo: string | null;
};

/** "0617799299" → "061-779-9299" (Thai mobile/landline display). */
function displayPhone(s: string): string {
  const d = s.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("0")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return s.trim();
}

type Row = {
  adminID: string | null;
  adminName: string | null;
  adminLastName: string | null;
  adminNickname: string | null;
  adminTel: string | null;
  adminPicture: string | null;
};

/**
 * The LIVE active sales pool — flagged reps, ordered for stable display +
 * deterministic round-robin tie-breaks. Returns [] (never throws) on a read
 * error so a consuming page degrades gracefully (the round-robin keeps its own
 * never-null central fallback in assign-sales-rep.ts).
 */
export async function getActiveSalesReps(): Promise<SalesRep[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID, adminName, adminLastName, adminNickname, adminTel, adminPicture")
    .eq("adminStatusA", "1")
    .eq("adminStatusSale", "1")
    .order("adminID", { ascending: true });
  if (error) {
    logger.warn(SCOPE, "active sales reps lookup failed", { reason: error.message });
    return [];
  }

  const reps: SalesRep[] = [];
  for (const r of (data ?? []) as Row[]) {
    const id = r.adminID?.trim();
    if (!id) continue;
    const nick = r.adminNickname?.trim();
    const first = r.adminName?.trim() ?? "";
    const last = r.adminLastName?.trim() ?? "";
    const tel = (r.adminTel ?? "").trim();
    const pic = r.adminPicture?.trim();
    reps.push({
      adminID: id,
      name: nick || first || id,
      fullName: `${first} ${last}`.trim() || nick || id,
      phone: tel,
      phoneDisplay: tel ? displayPhone(tel) : "",
      photo: pic && pic !== "" ? pic : null,
    });
  }
  return reps;
}
