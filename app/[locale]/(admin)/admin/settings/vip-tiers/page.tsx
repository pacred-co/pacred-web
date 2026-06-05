import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { VipTiersClient, type VipTierRow } from "./vip-tiers-client";

// ────────────────────────────────────────────────────────────────────
// /admin/settings/vip-tiers — "ประเภทสมาชิก VIP"
// Faithful port of legacy pcs-admin `settings-vip.php`:
//   list tb_co tiers (coStatus='1') + create / rename / delete. Creating a
//   tier auto-seeds 16+16 tb_rate_vip_kg/cbm rows (the per-tier rate-override
//   grid); deleting refuses while any customer still uses the tier, then
//   hard-deletes the tier + its rate rows. All via actions/admin/settings-vip.ts.
//
// tb_co casing (camelCase pilot batch 1): ID / coStatus / coID / coName.
// RBAC: super + accounting (legacy gated CEO/Manager/QA/Accounting/ITDT).
//
// Each tier's per-cell kg/cbm rates are edited on the existing VIP-rate editor
// (/admin/rates/custom-user → tb_rate_vip_*); this page manages the TIERS only.
// ────────────────────────────────────────────────────────────────────

export default async function AdminVipTiersPage() {
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  // Legacy list: WHERE coStatus='1' AND ID<>'0' (the ID=0 sentinel = ลูกค้าทั่วไป).
  const { data: rowsRaw, error: rowsErr } = await admin
    .from("tb_co")
    .select("ID, coID, coName")
    .eq("coStatus", "1")
    .neq("ID", 0)
    .order("ID", { ascending: true });
  if (rowsErr) {
    console.error(`[vip-tiers list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }
  type CoRow = { ID: number; coID: string; coName: string | null };
  const coRows = (rowsRaw ?? []) as CoRow[];
  const coIds = coRows.map((c) => c.coID);

  // Count how many customers belong to each tier (so the UI can warn / disable
  // delete before the action refuses — same guard as legacy deleteCo.php).
  const usageByCoid = new Map<string, number>();
  for (const coid of coIds) {
    const { count, error: cntErr } = await admin
      .from("tb_users")
      .select("userID", { count: "exact", head: true })
      .eq("coID", coid);
    if (cntErr) {
      console.error(`[vip-tiers usage count] failed`, { coid, code: cntErr.code, message: cntErr.message });
    }
    usageByCoid.set(coid, count ?? 0);
  }

  const rows: VipTierRow[] = coRows.map((c) => ({
    id: c.ID,
    coID: c.coID,
    coName: c.coName ?? "",
    memberCount: usageByCoid.get(c.coID) ?? 0,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ตั้งค่า</p>
          <h1 className="mt-1 text-2xl font-bold">ประเภทสมาชิก VIP</h1>
          <p className="mt-1 text-sm text-muted">
            จัดการประเภทสมาชิก (VIP/SVIP) — เพิ่มประเภทใหม่จะสร้างตารางเรทราคา (กก./คิว) ให้อัตโนมัติ ·
            แก้เรทรายช่องที่ <Link href="/admin/rates/custom-user" className="text-primary-600 hover:underline">Rate Override ตามกลุ่ม VIP</Link>
          </p>
        </div>
        <Link href="/admin/settings" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt">← ตั้งค่าระบบ</Link>
      </div>

      <VipTiersClient rows={rows} />
    </main>
  );
}
