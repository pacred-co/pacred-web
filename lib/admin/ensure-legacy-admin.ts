import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ensureLegacyAdminRow — connect a Pacred-native staff (profiles + admins) to the
 * LEGACY `tb_admin` table (2026-06-22 · owner: "เพิ่มพนักงาน role sales → auto
 * การ์ดหน้าบ้าน + auto ระบบหลังบ้าน · ไม่ใช่ account กลวงๆ").
 *
 * THE DISCONNECTION it fixes: `adminCreateNew` provisions auth + profiles + admins
 * but NEVER writes `tb_admin`. Yet every legacy-keyed sales surface — the rep
 * roster (`getActiveSalesReps`), the round-robin pool (`assign-sales-rep`), the
 * customer-360 sale-rep dropdown (`listSalesAdmins`), and the sales-team toggle
 * (`listStaffSalesFlags`) — reads `tb_admin.adminStatusSale='1' AND adminStatusA='1'`.
 * So a newly-created staff is "hollow": invisible to all of them. This helper
 * gives every staff a `tb_admin` row keyed by their login id, so they connect.
 *
 * Idempotent: if the row exists it only (re)asserts adminStatusA='1' (+ the sales
 * flag when explicitly requested true — it never silently UN-flags an existing
 * rep). When absent it CLONES a known-good active row's column shape (robust
 * against the table's ~30 NOT-NULL legacy columns incl. ones not in any TS type),
 * then overrides identity + clears every secret/personal/CS field. The PK `"ID"`
 * is set to MAX+1 (the legacy load left the sequence behind), and the UNIQUE
 * `adminTel` gets a collision-free placeholder.
 *
 * Best-effort by contract: callers wrap it so a failure NEVER breaks staff
 * creation — the staff still exists in profiles+admins; the tb_admin mirror is
 * additive. Returns {ok, created} so the caller can log.
 */
export async function ensureLegacyAdminRow(
  admin: SupabaseClient,
  opts: {
    adminID: string; // = the staff login id (e.g. "admin_pupu") — the tb_admin key
    adminName: string;
    adminLastName?: string | null;
    adminEmail?: string | null;
    adminNickname?: string | null;
    isSales?: boolean; // true → flag as a sales rep (card + dropdown + round-robin)
    createdBy?: string;
  },
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  const adminID = (opts.adminID ?? "").trim();
  if (!adminID) return { ok: false, created: false, error: "missing adminID" };

  // Already present → only assert active + (optionally) the sales flag.
  const { data: existing, error: exErr } = await admin
    .from("tb_admin")
    .select("adminID, adminStatusSale")
    .eq("adminID", adminID)
    .maybeSingle();
  if (exErr) return { ok: false, created: false, error: exErr.message };
  if (existing) {
    const patch: Record<string, string> = { adminStatusA: "1" };
    if (opts.isSales === true) patch.adminStatusSale = "1";
    const { error: upErr } = await admin.from("tb_admin").update(patch).eq("adminID", adminID);
    return { ok: !upErr, created: false, error: upErr?.message };
  }

  // Absent → clone a template active row for the full NOT-NULL column shape.
  const { data: tmpl, error: tErr } = await admin
    .from("tb_admin")
    .select("*")
    .eq("adminStatusA", "1")
    .limit(1)
    .maybeSingle();
  if (tErr) return { ok: false, created: false, error: tErr.message };
  if (!tmpl) return { ok: false, created: false, error: "no template tb_admin row" };

  const { data: maxRow, error: maxErr } = await admin
    .from("tb_admin")
    .select("ID")
    .order("ID", { ascending: false })
    .limit(1)
    .maybeSingle<{ ID: number | string | null }>();
  if (maxErr) return { ok: false, created: false, error: maxErr.message };
  const nextId = (Number(maxRow?.ID) || 0) + 1;

  // UNIQUE adminTel — '' if free, else a non-phone placeholder.
  let tel = "";
  const { data: telHit, error: telErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminTel", "")
    .limit(1)
    .maybeSingle();
  if (telErr) return { ok: false, created: false, error: telErr.message };
  if (telHit) tel = `na-${nextId}`;

  const row: Record<string, unknown> = {
    ...(tmpl as Record<string, unknown>),
    ID: nextId,
    adminID,
    adminName: opts.adminName || adminID,
    adminLastName: opts.adminLastName ?? "",
    adminEmail: opts.adminEmail || `${adminID}@pacred.co.th`,
    adminNickname: opts.adminNickname ?? "",
    adminTel: tel,
    // identity / status — never inherit the template's
    adminStatusA: "1",
    adminStatusSale: opts.isSales ? "1" : "0",
    adminStatusCS: "0",
    adminDel: "0",
    adminIDCreate: opts.createdBy || "system",
    // never inherit the template row's avatar — a new staff has no photo, and a
    // bare legacy filename ("user.jpg" or another admin's upload) is what crashed
    // next/image on 2026-06-22. Empty = "no photo" → UI fallback (see
    // lib/admin/usable-image-src.ts).
    adminPicture: "",
    // clear every secret / personal / numeric-org field copied from the template
    adminPass: "",
    bearer_token: "",
    adminLineTokenNotify: "",
    adminEmailOrg: 0,
    adminTelOrg: 0,
    salary: 0,
    nationalIDCard: "",
    nationalIDCardFile: "",
    copyHouseRegistrationFile: "",
    resumeFile: "",
  };

  const { error: insErr } = await admin.from("tb_admin").insert(row);
  if (insErr) return { ok: false, created: false, error: insErr.message };
  return { ok: true, created: true };
}
