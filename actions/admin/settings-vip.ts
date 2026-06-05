"use server";

// ────────────────────────────────────────────────────────────────────
// VIP member-tier (ประเภทสมาชิก VIP) admin CRUD — faithful port of legacy
// `pcs-admin/settings-vip.php` (+ `settings-vip/deleteCo.php` · `editCo.php`).
// ────────────────────────────────────────────────────────────────────
// A "tier" lives in `tb_co` (ID autoincrement PK · coID = the short code,
// e.g. "VIP"/"SVIP" · coName = the display name · coStatus '1'=active).
// Every customer carries a `tb_users.coID`; the forwarder pricing engine
// (lib/forwarder/resolve-rate.ts) reads per-tier overrides from
// `tb_rate_vip_kg` + `tb_rate_vip_cbm` (16 rows each per tier — keyed by
// coid × sourcewarehouse(1,2) × rtransporttype(1,2) × rproductstype(1..4)).
//
// Faithful behaviours reproduced from legacy:
//   • CREATE (settings-vip.php L3-58) — INSERT tb_co(coID,coName) UPPERCASEs
//     coID, refuses a duplicate coID, then AUTO-SEEDS the 16+16 rate rows
//     (rkg/rcbm left at their column DEFAULT 0 = "no override" — exactly the
//     legacy seed, which omits the rate column). adminidupdate stamped.
//   • RENAME (settings-vip.php L62-83) — UPDATE tb_co SET coName WHERE ID
//     (coID is immutable, like legacy editCo).
//   • DELETE (deleteCo.php) — REFUSE if any tb_users.coID still uses the
//     tier ("การลบจะมีผลต่อบัญชีผู้ใช้ในประเภทนี้"), else hard-DELETE the
//     tb_co row + its tb_rate_vip_kg/cbm rows.
//
// Casing note (camelCase pilot batch 1): tb_co is camelCased (ID/coStatus/
// coID/coName) BUT tb_rate_vip_kg/cbm were NOT in the pilot → they keep the
// original lowercase columns (coid/sourcewarehouse/rtransporttype/
// rproductstype/rkg|rcbm/adminidupdate).
//
// RBAC: super + accounting (legacy gated CEO/Manager/QAAndQC/Accounting/ITDT).
// confirm-before-mutate is enforced in the UI (§0f); every write is audit-logged.
// ────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Short tier code — letters/digits, ≤10 (tb_co.coID is varchar(10)).
const coIdField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]+$/, "ตัวย่อ VIP ใช้ได้เฉพาะตัวอักษร/ตัวเลข")
  .max(10);
const coNameField = z.string().trim().min(1, "กรุณากรอกชื่อเต็มประเภท").max(200);

// The legacy seed grid (settings-vip.php L17-58): 2 warehouses × 2 transport
// types × 4 product types = 16 rows for EACH of kg + cbm. The legacy INSERT
// omits the rate column, relying on the MySQL column DEFAULT (0). The migrated
// Supabase schema declares rkg/rcbm NOT NULL with NO default, so we seed them
// EXPLICITLY at 0 — which is exactly "no override" (the pricing engine /
// rate-edits.ts treats 0 / rkgbefore=0 as the no-override sentinel). adminidupdate
// is stamped with the acting admin's legacy id.
const SOURCE_WAREHOUSES = ["1", "2"] as const;
const TRANSPORT_TYPES = ["1", "2"] as const; // legacy seeds only รถ(1)/เรือ(2)
const PRODUCT_TYPES = ["1", "2", "3", "4"] as const;

/** Build the 16 seed rows for one rate table. `rateCol` = "rkg" | "rcbm". */
function buildVipRateSeed(coid: string, adminLegacyId: string, rateCol: "rkg" | "rcbm") {
  const rows: Record<string, string | number>[] = [];
  for (const sourcewarehouse of SOURCE_WAREHOUSES) {
    for (const rtransporttype of TRANSPORT_TYPES) {
      for (const rproductstype of PRODUCT_TYPES) {
        rows.push({
          coid,
          sourcewarehouse,
          rtransporttype,
          rproductstype,
          [rateCol]: 0,
          adminidupdate: adminLegacyId,
        });
      }
    }
  }
  return rows;
}

// ── CREATE tier ───────────────────────────────────────────────────────
const createTierSchema = z.object({ coID: coIdField, coName: coNameField });
export type AdminCreateVipTierInput = z.infer<typeof createTierSchema>;

/** Create a VIP tier + auto-seed its 16+16 rate-override rows (legacy faithful). */
export async function adminCreateVipTier(
  input: AdminCreateVipTierInput,
): Promise<AdminActionResult> {
  const parsed = createTierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const coID = parsed.data.coID.toUpperCase();
  const coName = parsed.data.coName;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Refuse a duplicate coID (legacy: "มีบัญชีผู้ใช้สำหรับบัญชีนี้แล้ว").
    const { data: existing, error: existErr } = await admin
      .from("tb_co")
      .select("ID")
      .eq("coID", coID)
      .maybeSingle<{ ID: number }>();
    if (existErr) {
      console.error(`[settings-vip create dup-check] failed`, { coID, code: existErr.code, message: existErr.message });
      return { ok: false, error: `db_error:${existErr.code ?? "unknown"}` };
    }
    if (existing) return { ok: false, error: `มีประเภทสมาชิก "${coID}" อยู่แล้ว` };

    // Insert the tier. coStatus defaults to '1' (active) in the schema.
    const { error: insErr } = await admin.from("tb_co").insert({ coID, coName });
    if (insErr) {
      console.error(`[settings-vip create insert] failed`, { coID, code: insErr.code, message: insErr.message });
      return { ok: false, error: insErr.message };
    }

    // Resolve the acting admin's legacy id for the adminidupdate stamp
    // (tb_rate_vip_*.adminidupdate = a legacy tb_admin id, varchar(10)).
    // Reuse the shared G6 lookup (admin_contact_extras.legacy_admin_id); the
    // seed rows are "no override" placeholders, so a missing id is non-fatal —
    // fall back to a stable sentinel so the NOT NULL column is satisfied.
    const adminLegacyId = ((await getAdminLegacyId(adminId)) ?? "").slice(0, 10) || "admin";

    // Auto-seed the rate-override grid (best-effort — the tier already exists;
    // a seed failure shouldn't roll back the tier, but we surface it loudly).
    const seedKg = buildVipRateSeed(coID, adminLegacyId, "rkg");
    const seedCbm = buildVipRateSeed(coID, adminLegacyId, "rcbm");
    const { error: kgErr } = await admin.from("tb_rate_vip_kg").insert(seedKg);
    if (kgErr) console.error(`[settings-vip seed kg] failed`, { coID, code: kgErr.code, message: kgErr.message });
    const { error: cbmErr } = await admin.from("tb_rate_vip_cbm").insert(seedCbm);
    if (cbmErr) console.error(`[settings-vip seed cbm] failed`, { coID, code: cbmErr.code, message: cbmErr.message });

    await logAdminAction(adminId, "tb_co.create_tier", "tb_co", coID, {
      coID,
      coName,
      seededKgRows: kgErr ? 0 : seedKg.length,
      seededCbmRows: cbmErr ? 0 : seedCbm.length,
    });
    revalidatePath("/admin/settings/vip-tiers");
    return { ok: true };
  });
}

// ── RENAME tier ───────────────────────────────────────────────────────
const renameTierSchema = z.object({ coID: coIdField, coName: coNameField });
export type AdminRenameVipTierInput = z.infer<typeof renameTierSchema>;

/** Rename a tier's display name (coID immutable — legacy editCo updates coName only). */
export async function adminRenameVipTier(
  input: AdminRenameVipTierInput,
): Promise<AdminActionResult> {
  const parsed = renameTierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const coID = parsed.data.coID.toUpperCase();
  const coName = parsed.data.coName;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: readErr } = await admin
      .from("tb_co")
      .select("ID, coName")
      .eq("coID", coID)
      .maybeSingle<{ ID: number; coName: string | null }>();
    if (readErr) {
      console.error(`[settings-vip rename read] failed`, { coID, code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "ไม่พบประเภทสมาชิกนี้" };

    const { error: updErr } = await admin.from("tb_co").update({ coName }).eq("coID", coID);
    if (updErr) {
      console.error(`[settings-vip rename update] failed`, { coID, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "tb_co.rename_tier", "tb_co", coID, {
      coID,
      before: before.coName,
      after: coName,
    });
    revalidatePath("/admin/settings/vip-tiers");
    return { ok: true };
  });
}

// ── DELETE tier ───────────────────────────────────────────────────────
/**
 * Delete a tier — REFUSE while any customer still belongs to it (legacy
 * deleteCo.php returns '1' = "in use" and aborts), else hard-DELETE the
 * tb_co row + its tb_rate_vip_kg/cbm rows.
 */
export async function adminDeleteVipTier(
  input: { coID: string },
): Promise<AdminActionResult> {
  const parsed = coIdField.safeParse(input.coID);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const coID = parsed.data.toUpperCase();

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: readErr } = await admin
      .from("tb_co")
      .select("ID, coName")
      .eq("coID", coID)
      .maybeSingle<{ ID: number; coName: string | null }>();
    if (readErr) {
      console.error(`[settings-vip delete read] failed`, { coID, code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "ไม่พบประเภทสมาชิกนี้" };

    // Guard: refuse if any customer uses this tier (legacy deleteCo.php '1').
    const { count: inUse, error: useErr } = await admin
      .from("tb_users")
      .select("userID", { count: "exact", head: true })
      .eq("coID", coID);
    if (useErr) {
      console.error(`[settings-vip delete in-use-check] failed`, { coID, code: useErr.code, message: useErr.message });
      return { ok: false, error: `db_error:${useErr.code ?? "unknown"}` };
    }
    if ((inUse ?? 0) > 0) {
      return {
        ok: false,
        error: `ลบไม่ได้ — ยังมีลูกค้า ${inUse} รายอยู่ในประเภท "${coID}" (ย้ายลูกค้าออกก่อนจึงจะลบได้)`,
      };
    }

    // Hard-delete the tier + its rate-override rows (legacy deleteCo.php).
    const { error: delCoErr } = await admin.from("tb_co").delete().eq("coID", coID);
    if (delCoErr) {
      console.error(`[settings-vip delete tb_co] failed`, { coID, code: delCoErr.code, message: delCoErr.message });
      return { ok: false, error: delCoErr.message };
    }
    const { error: delKgErr } = await admin.from("tb_rate_vip_kg").delete().eq("coid", coID);
    if (delKgErr) console.error(`[settings-vip delete tb_rate_vip_kg] failed`, { coID, code: delKgErr.code, message: delKgErr.message });
    const { error: delCbmErr } = await admin.from("tb_rate_vip_cbm").delete().eq("coid", coID);
    if (delCbmErr) console.error(`[settings-vip delete tb_rate_vip_cbm] failed`, { coID, code: delCbmErr.code, message: delCbmErr.message });

    await logAdminAction(adminId, "tb_co.delete_tier", "tb_co", coID, {
      coID,
      coName: before.coName,
    });
    revalidatePath("/admin/settings/vip-tiers");
    return { ok: true };
  });
}
