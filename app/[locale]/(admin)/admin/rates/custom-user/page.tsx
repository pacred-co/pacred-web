import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CustomUserRateRow, NewCustomUserRateRow } from "./row-form";

// LP-1c1: admin edit for rate_custom_user — flat per-customer override.
// Wins over rate_vip and rate_general in calc-price.ts waterfall.
//
// Page shows two views:
//   - default: all current overrides grouped by customer (member_code)
//   - ?member=PR0XXXX: focused on one customer + add-rate form pre-keyed

type Row = {
  id:                 string;
  profile_id:         string;
  source_warehouse:   string;
  transport_type:     string;
  product_type:       string;
  basis:              string;
  rate:               number;
  admin_id_update:    string | null;
  updated_at:         string;
  profile?:           { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
};

export type FlatRow = Omit<Row, "profile"> & {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
};

const WAREHOUSE_LABEL: Record<string, string> = { guangzhou: "กวางโจว", yiwu: "อี้อู" };
const TRANSPORT_LABEL: Record<string, string> = { truck: "🚚 รถ", ship: "🚢 เรือ", air: "✈️ เครื่องบิน" };
const PRODUCT_LABEL:   Record<string, string> = { general: "ทั่วไป", tisi: "มอก.", fda: "อย.", special: "พิเศษ" };
const BASIS_LABEL:     Record<string, string> = { kg: "กก.", cbm: "CBM" };

type SP = { member?: string };

function profileToFields(p: Row["profile"]): { member_code: string | null; first_name: string | null; last_name: string | null } {
  const norm = Array.isArray(p) ? (p[0] ?? null) : p ?? null;
  return {
    member_code: norm?.member_code ?? null,
    first_name:  norm?.first_name  ?? null,
    last_name:   norm?.last_name   ?? null,
  };
}

export default async function AdminRatesCustomUserPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  // Pull all custom_user rates with their owner profile in one query
  let q = admin
    .from("rate_custom_user")
    .select(`*, profile:profiles!profile_id(member_code, first_name, last_name)`)
    .order("profile_id")
    .order("source_warehouse")
    .order("transport_type")
    .order("product_type")
    .order("basis");

  // Optional filter by member_code
  if (sp.member) {
    const ref = sp.member.trim().toUpperCase();
    // Resolve to profile_id first so the inline filter is exact
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("member_code", ref)
      .maybeSingle<{ id: string }>();
    if (profile) q = q.eq("profile_id", profile.id);
  }

  const { data } = await q;
  const rows: FlatRow[] = ((data ?? []) as Row[]).map((r) => {
    const p = profileToFields(r.profile);
    return { ...r, ...p, profile: undefined as never };
  });

  // Group by member_code for display
  type Group = { profile_id: string; member_code: string | null; name: string; rows: FlatRow[] };
  const groups: Group[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
    if (last && last.profile_id === r.profile_id) {
      last.rows.push(r);
    } else {
      groups.push({ profile_id: r.profile_id, member_code: r.member_code, name, rows: [r] });
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · อัตราขนส่ง (per-customer)</p>
          <h1 className="mt-1 text-2xl font-bold">ตารางเรท Custom (รายลูกค้า) — แก้ไขได้</h1>
          <p className="mt-1 text-sm text-muted">
            เรท flat ที่ผูกกับลูกค้าคนเดียว — แทนที่ VIP/general เมื่อลูกค้านี้ใช้เส้นทาง+ประเภทตามคีย์
          </p>
        </div>
        <Link href="/admin/rates" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับสรุปอัตรา
        </Link>
      </div>

      {/* Filter chip */}
      {sp.member && (
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-primary-700">
            กรอง: <span className="font-mono">{sp.member}</span>
          </span>
          <Link href="/admin/rates/custom-user" className="text-muted hover:underline">ล้างตัวกรอง</Link>
        </div>
      )}

      {/* Existing rates grouped by customer */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">
            ลูกค้า {groups.length} ราย · {rows.length} แถวรวม
          </h2>
          <span className="text-[10px] text-muted">จัดเรียงตามลูกค้า → คีย์</span>
        </div>
        {groups.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            {sp.member ? `ลูกค้า "${sp.member}" ยังไม่มี custom rate` : "ยังไม่มี custom rate ใครเลย — เพิ่มด้านล่าง"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">โกดัง</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">rate</th>
                  <th className="px-4 py-3">อัพเดท</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) =>
                  g.rows.map((r, i) => (
                    <CustomUserRateRow
                      key={r.id}
                      row={r}
                      memberCell={i === 0 ? { code: g.member_code, name: g.name } : null}
                      warehouseLabel={WAREHOUSE_LABEL[r.source_warehouse] ?? r.source_warehouse}
                      transportLabel={TRANSPORT_LABEL[r.transport_type] ?? r.transport_type}
                      productLabel={PRODUCT_LABEL[r.product_type] ?? r.product_type}
                      basisLabel={BASIS_LABEL[r.basis] ?? r.basis}
                    />
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewCustomUserRateRow defaultMember={sp.member ?? ""} />
    </main>
  );
}
