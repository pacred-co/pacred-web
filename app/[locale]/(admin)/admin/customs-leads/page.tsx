import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { CustomsLeadRow } from "./customs-lead-client";

/**
 * /admin/customs-leads — ลูกค้าที่ใช้ใบขน (คิวเซลโทรตาม · owner 2026-07-16).
 *
 * From the NetBay ใบขน import (customs_importer_lead · migration 0256). Sales
 * calls these importers to open ใบขน with Pacred. Existing customers (matched by
 * นิติ tax id) show their phone + assigned sale; new leads sales chases. Filter by
 * existing/new · transport · status · sale.
 */
export const dynamic = "force-dynamic";

type Lead = {
  tax_id: string;
  name_th: string | null;
  name_en: string | null;
  address: string | null;
  province: string | null;
  transports: string[] | null;
  decl_count: number;
  total_cif: number | string | null;
  total_tax: number | string | null;
  first_decl_date: string | null;
  last_decl_date: string | null;
  hs_codes: string[] | null;
  suppliers: string[] | null;
  matched_userid: string | null;
  matched_phone: string | null;
  matched_name: string | null;
  matched_sale: string | null;
  is_existing: boolean;
  lead_status: string;
  assigned_sale: string | null;
  call_note: string | null;
  called_at: string | null;
};

type SP = { view?: string; transport?: string; status?: string; sale?: string; q?: string };

const FILTER_INPUT =
  "w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

export default async function CustomsLeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin(["super", "sales", "sales_admin", "ops"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin
    .from("customs_importer_lead")
    .select("*")
    .order("decl_count", { ascending: false })
    .limit(1000);

  const view = sp.view ?? "all"; // all | existing | new | call
  if (view === "existing") q = q.eq("is_existing", true);
  else if (view === "new") q = q.eq("is_existing", false).neq("lead_status", "our_own");
  else if (view === "call") q = q.in("lead_status", ["new", "called", "interested"]).neq("lead_status", "our_own");
  if (sp.transport) q = q.contains("transports", [sp.transport]);
  if (sp.status) q = q.eq("lead_status", sp.status);
  if (sp.sale) q = q.eq("assigned_sale", sp.sale);
  if (sp.q && sp.q.trim()) {
    const s = sp.q.trim();
    q = q.or(`name_th.ilike.%${s}%,name_en.ilike.%${s}%,tax_id.ilike.%${s}%,matched_phone.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) console.error("[customs-leads list] failed", { code: error.code, message: error.message });
  const rows = (data ?? []) as Lead[];

  // summary counts (over the whole table, not the filtered view)
  const { data: allRows } = await admin.from("customs_importer_lead").select("is_existing, lead_status, decl_count, total_cif");
  const all = (allRows ?? []) as Array<{ is_existing: boolean; lead_status: string; decl_count: number; total_cif: number | string }>;
  const existingCount = all.filter((r) => r.is_existing).length;
  const newCount = all.filter((r) => !r.is_existing && r.lead_status !== "our_own").length;
  const toCall = all.filter((r) => ["new", "called", "interested"].includes(r.lead_status) && r.lead_status !== "our_own").length;
  const converted = all.filter((r) => r.lead_status === "converted").length;
  const totalDecl = all.reduce((s, r) => s + (r.decl_count || 0), 0);

  const TABS: Array<{ key: string; label: string; count: number }> = [
    { key: "call", label: "🔔 ต้องโทร", count: toCall },
    { key: "existing", label: "🟢 ลูกค้าเดิม (มีเบอร์)", count: existingCount },
    { key: "new", label: "🔵 ลูกค้าใหม่", count: newCount },
    { key: "all", label: "ทั้งหมด", count: all.length },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · SALES · ใบขน"
        title="ลูกค้าที่ใช้ใบขน — คิวโทรตาม"
        subtitle={
          <>ดึงจากใบขน NetBay (รถ/เรือ/แอร์) · <strong>{all.length}</strong> บริษัท · <strong>{totalDecl}</strong> ใบขน · เซลโทรตามมาเปิดใบขนกับเรา</>
        }
        actions={
          <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← Admin</Link>
        }
      />

      {/* summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-rose-300 bg-rose-500 text-white font-bold px-3 py-1.5">🔔 ต้องโทร {toCall}</span>
        <span className="rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 px-3 py-1.5">🟢 ลูกค้าเดิม {existingCount}</span>
        <span className="rounded-full border border-blue-300 bg-blue-50 text-blue-700 px-3 py-1.5">🔵 ใหม่ {newCount}</span>
        <span className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5">✅ ปิดได้ {converted}</span>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = view === t.key;
          const params = new URLSearchParams();
          params.set("view", t.key);
          if (sp.transport) params.set("transport", sp.transport);
          return (
            <Link
              key={t.key}
              href={`/admin/customs-leads?${params.toString()}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium border ${active ? "bg-primary-600 text-white border-primary-700" : "bg-white dark:bg-surface border-border hover:bg-surface-alt"}`}
            >
              {t.label} <span className={active ? "opacity-90" : "text-muted"}>({t.count})</span>
            </Link>
          );
        })}
      </div>

      {/* filter form */}
      <form action="/admin/customs-leads" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
        <input type="hidden" name="view" value={view} />
        <label className="space-y-1">
          <span className="text-[11px] text-muted">ขนส่ง</span>
          <select name="transport" defaultValue={sp.transport ?? ""} className={FILTER_INPUT}>
            <option value="">— ทุกทาง —</option>
            <option value="road">🚚 รถ</option>
            <option value="sea">🚢 เรือ</option>
            <option value="air">✈️ แอร์</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">สถานะโทร</span>
          <select name="status" defaultValue={sp.status ?? ""} className={FILTER_INPUT}>
            <option value="">— ทุกสถานะ —</option>
            <option value="new">ยังไม่โทร</option>
            <option value="called">โทรแล้ว</option>
            <option value="interested">สนใจ</option>
            <option value="converted">เปิดใบขนแล้ว</option>
            <option value="not_interested">ไม่สนใจ</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">เซล</span>
          <input name="sale" defaultValue={sp.sale ?? ""} placeholder="admin_xxx" className={FILTER_INPUT} />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">ค้นหา (ชื่อ/นิติ/เบอร์)</span>
          <input name="q" defaultValue={sp.q ?? ""} className={FILTER_INPUT} />
        </label>
        <div className="self-end">
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">กรอง</button>
        </div>
      </form>

      {/* rows */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">{rows.length} บริษัท (เรียงตามจำนวนใบขน)</h2>
          <span className="text-[11px] text-muted">ใบขนเยอะ = โอกาสสูง</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบตามตัวกรอง</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <CustomsLeadRow key={r.tax_id} lead={r} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
