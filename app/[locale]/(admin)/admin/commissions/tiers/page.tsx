import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ROLE_KIND_LABEL,
  SOURCE_KIND_LABEL,
  type RoleKind,
  type SourceKind,
} from "@/lib/validators/commission";
import { TierForm } from "./tier-form";
import { TierRowActions } from "./row-actions";

/**
 * V-E8 — /admin/commissions/tiers — manage commission tier lookup table.
 *
 * Each row defines: role_kind × service_kind → rate_pct OR flat_thb.
 * Snapshotted into commission_accruals.tier_id at accrual time so historical
 * rates are frozen on each accrual record.
 *
 * Roles: super, accounting.
 */

export const dynamic = "force-dynamic";

type Row = {
  id:                string;
  role_kind:         RoleKind;
  service_kind:      SourceKind;
  tier_name:         string;
  rate_pct:          number | null;
  flat_thb:          number | null;
  min_base_thb:      number | null;
  effective_from:    string;
  effective_to:      string | null;
  is_active:         boolean;
  notes:             string | null;
  created_at:        string;
  updated_at:        string;
};

function thb(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminCommissionTiersPage() {
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("commission_tiers")
    .select(`
      id, role_kind, service_kind, tier_name, rate_pct, flat_thb, min_base_thb,
      effective_from, effective_to, is_active, notes, created_at, updated_at
    `)
    .order("is_active",    { ascending: false })
    .order("role_kind",    { ascending: true })
    .order("service_kind", { ascending: true })
    .order("created_at",   { ascending: false })
    .returns<Row[]>();
  if (error) {
    console.error(`[admin/commissions/tiers list] failed`, { code: error.code, message: error.message });
    throw new Error(`commission_tiers list failed: ${error.message}`);
  }

  const rows = data ?? [];
  const activeCount   = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header>
        <Link href="/admin/commissions" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้าค่าคอม
        </Link>
        <p className="mt-1 text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ค่าคอม + Payouts
        </p>
        <h1 className="mt-1 text-2xl font-bold">อัตราค่าคอม (Tiers)</h1>
        <p className="mt-1 text-sm text-muted">
          ตั้งค่าอัตรา % หรือยอดเหมา (THB) ต่อบทบาท × ประเภทออเดอร์.
          การปรับ tier ไม่กระทบ accruals เก่า — ระบบ snapshot tier_id ตอน mint accrual.
        </p>
        <p className="mt-1 text-xs text-muted">
          {activeCount} active · {inactiveCount} inactive · รวม {rows.length} รายการ
        </p>
      </header>

      {/* Tier list */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มี tier — เริ่มสร้าง tier แรกที่ฟอร์มด้านล่าง</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">บทบาท</th>
                  <th className="px-4 py-3">ประเภทออเดอร์</th>
                  <th className="px-4 py-3">ชื่อ tier</th>
                  <th className="px-4 py-3 text-right">อัตรา</th>
                  <th className="px-4 py-3 text-right">ขั้นต่ำ Base</th>
                  <th className="px-4 py-3">เริ่มใช้</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-border align-top ${!r.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 text-xs">{ROLE_KIND_LABEL[r.role_kind]}</td>
                    <td className="px-4 py-3 text-xs">{SOURCE_KIND_LABEL[r.service_kind]}</td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <div>{r.tier_name}</div>
                      {r.notes && <div className="text-[10px] text-muted mt-1">📝 {r.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {r.rate_pct !== null
                        ? `${Number(r.rate_pct).toFixed(3)}%`
                        : <span className="text-primary-700">{thb(r.flat_thb)}/job</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.min_base_thb)}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.effective_from}
                      {r.effective_to && <> → {r.effective_to}</>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          r.is_active
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {r.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TierRowActions
                        id={r.id}
                        isActive={r.is_active}
                        initial={{
                          role_kind:      r.role_kind,
                          service_kind:   r.service_kind,
                          tier_name:      r.tier_name,
                          rate_pct:       r.rate_pct ?? null,
                          flat_thb:       r.flat_thb ?? null,
                          min_base_thb:   r.min_base_thb ?? null,
                          effective_from: r.effective_from,
                          effective_to:   r.effective_to ?? null,
                          notes:          r.notes ?? "",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create panel */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-3">+ เพิ่ม tier ใหม่</h2>
        <TierForm mode="create" />
      </div>
    </main>
  );
}
