import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { GeneralRateRow, NewGeneralRateRow } from "./row-form";

// LP-1: admin edit for rate_general — the per-(group × warehouse × transport
// × product × basis) tiered price table that drives the forwarder calc
// engine (lib/forwarder/calc-price.ts). Read-only summary lives at
// /admin/rates; the full edit table is here.

type CustomerGroup = { code: string; name: string };

export type Row = {
  id:                 string;
  customer_group:     string;
  source_warehouse:   string;
  transport_type:     string;
  product_type:       string;
  basis:              string;
  tier1:              number | null;
  tier2:              number | null;
  tier3:              number | null;
  admin_id_update:    string | null;
  updated_at:         string;
};

const WAREHOUSE_LABEL: Record<string, string> = { guangzhou: "กวางโจว", yiwu: "อี้อู" };
const TRANSPORT_LABEL: Record<string, string> = { truck: "🚚 รถ", ship: "🚢 เรือ", air: "✈️ เครื่องบิน" };
const PRODUCT_LABEL:   Record<string, string> = { general: "ทั่วไป", tisi: "มอก.", fda: "อย.", special: "พิเศษ" };
const BASIS_LABEL:     Record<string, string> = { kg: "กก.", cbm: "CBM" };

type SP = { group?: string };

export default async function AdminRatesGeneralPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: groupsData }, { data: ratesData }] = await Promise.all([
    admin.from("customer_groups").select("code, name").order("code"),
    admin.from("rate_general").select("*").order("customer_group").order("source_warehouse").order("transport_type").order("product_type").order("basis"),
  ]);

  const groups = (groupsData ?? []) as CustomerGroup[];
  const allRows = (ratesData ?? []) as Row[];

  const activeGroup = sp.group ?? (groups[0]?.code ?? "PR");
  const rows = allRows.filter((r) => r.customer_group === activeGroup);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · อัตราขนส่ง (general)</p>
          <h1 className="mt-1 text-2xl font-bold">ตารางเรท General — แก้ไขได้</h1>
          <p className="mt-1 text-sm text-muted">
            เรทตั้งต้นตาม (กลุ่มลูกค้า × โกดัง × ขนส่ง × ประเภทสินค้า × หน่วยคิด) — ใช้ใน
            <code className="ml-1 rounded bg-surface-alt px-1 py-0.5 text-[10px]">lib/forwarder/calc-price.ts</code>
          </p>
        </div>
        <Link href="/admin/rates" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับสรุปอัตรา
        </Link>
      </div>

      {/* Customer group tabs */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted font-medium">กลุ่มลูกค้า:</span>
        {groups.map((g) => (
          <Link
            key={g.code}
            href={`/admin/rates/general?group=${encodeURIComponent(g.code)}`}
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

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">
            {activeGroup} — {rows.length} แถว
          </h2>
          <span className="text-[10px] text-muted">tier1 → tier2 → tier3 = ราคา/หน่วย ตามปริมาณที่ขึ้น</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ยังไม่มีเรทใน {activeGroup} — เพิ่มแถวแรกด้านล่าง
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">โกดัง</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">tier1</th>
                  <th className="px-4 py-3 text-right">tier2</th>
                  <th className="px-4 py-3 text-right">tier3</th>
                  <th className="px-4 py-3">อัพเดทล่าสุด</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <GeneralRateRow
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

      {/* Add new row */}
      <NewGeneralRateRow defaultGroup={activeGroup} />

      <p className="text-[11px] text-muted">
        การคำนวณราคา: เรทที่เลือกไหลตาม waterfall <code>custom_hs → custom_user → vip → general</code>.
        ดู [lib/forwarder/calc-price.ts](#) สำหรับรายละเอียด tier selection logic.
      </p>
    </main>
  );
}
