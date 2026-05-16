import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { VipRateRow, NewVipRateRow } from "./row-form";

// LP-1b: admin edit for rate_vip — flat per-(group × warehouse × transport
// × product × basis) override. Wins over rate_general in calc-price.ts
// waterfall (general → vip → custom_user → custom_hs).

type CustomerGroup = { code: string; name: string };

export type Row = {
  id:                 string;
  customer_group:     string;
  source_warehouse:   string;
  transport_type:     string;
  product_type:       string;
  basis:              string;
  rate:               number;
  admin_id_update:    string | null;
  updated_at:         string;
};

const WAREHOUSE_LABEL: Record<string, string> = { guangzhou: "กวางโจว", yiwu: "อี้อู" };
const TRANSPORT_LABEL: Record<string, string> = { truck: "🚚 รถ", ship: "🚢 เรือ", air: "✈️ เครื่องบิน" };
const PRODUCT_LABEL:   Record<string, string> = { general: "ทั่วไป", tisi: "มอก.", fda: "อย.", special: "พิเศษ" };
const BASIS_LABEL:     Record<string, string> = { kg: "กก.", cbm: "CBM" };

type SP = { group?: string };

export default async function AdminRatesVipPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: groupsData }, { data: ratesData }] = await Promise.all([
    admin.from("customer_groups").select("code, name").order("code"),
    admin.from("rate_vip").select("*").order("customer_group").order("source_warehouse").order("transport_type").order("product_type").order("basis"),
  ]);

  const groups = (groupsData ?? []) as CustomerGroup[];
  const allRows = (ratesData ?? []) as Row[];
  const activeGroup = sp.group ?? (groups[0]?.code ?? "PR");
  const rows = allRows.filter((r) => r.customer_group === activeGroup);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · อัตราขนส่ง (VIP)</p>
          <h1 className="mt-1 text-2xl font-bold">ตารางเรท VIP — แก้ไขได้</h1>
          <p className="mt-1 text-sm text-muted">
            เรท flat (ราคาเดียว ไม่ tier) — ใช้แทน general เมื่อกลุ่มลูกค้านี้มี VIP rate ตามคีย์
          </p>
        </div>
        <Link href="/admin/rates" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับสรุปอัตรา
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted font-medium">กลุ่มลูกค้า:</span>
        {groups.map((g) => (
          <Link
            key={g.code}
            href={`/admin/rates/vip?group=${encodeURIComponent(g.code)}`}
            className={`rounded-full border px-3 py-1 ${
              g.code === activeGroup
                ? "bg-primary-500 text-white border-primary-500"
                : "bg-white border-border hover:bg-surface-alt"
            }`}
          >
            {g.code} <span className="opacity-80">— {g.name}</span>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">{activeGroup} — {rows.length} แถว</h2>
          <span className="text-[10px] text-muted">rate flat — แทนที่ general เมื่อจับคู่คีย์</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มี VIP rate ใน {activeGroup} — เพิ่มด้านล่าง</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">โกดัง</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">rate</th>
                  <th className="px-4 py-3">อัพเดทล่าสุด</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <VipRateRow
                    key={r.id}
                    row={r}
                    warehouseLabel={WAREHOUSE_LABEL[r.source_warehouse] ?? r.source_warehouse}
                    transportLabel={TRANSPORT_LABEL[r.transport_type] ?? r.transport_type}
                    productLabel={PRODUCT_LABEL[r.product_type] ?? r.product_type}
                    basisLabel={BASIS_LABEL[r.basis] ?? r.basis}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewVipRateRow defaultGroup={activeGroup} />
    </main>
  );
}
