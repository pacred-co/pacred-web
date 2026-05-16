import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  FREIGHT_SHIPMENT_STATUSES, FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODE_LABEL,
  type FreightShipmentStatus, type FreightTransportMode,
} from "@/lib/validators/freight-shipment";

/**
 * V-E1 — /admin/freight/shipments list.
 *
 * Status filter chips + search by job_no / container_code / consignee name.
 *
 * Roles: super, ops, sales_admin, accounting.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<FreightShipmentStatus, string> = {
  draft:       "bg-gray-50 text-gray-600 border-gray-200",
  confirmed:   "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  cleared:     "bg-purple-50 text-purple-700 border-purple-200",
  delivered:   "bg-green-50 text-green-700 border-green-200",
  cancelled:   "bg-red-50 text-red-700 border-red-200",
};

type Row = {
  id:                  string;
  job_no:              string | null;
  status:              FreightShipmentStatus;
  transport_mode:      FreightTransportMode;
  container_code:      string | null;
  carrier_container_no: string | null;
  bl_no:               string | null;
  commercial_value_thb: number | null;
  created_at:          string;
  source_quote_id:     string | null;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
    company_name: string | null;
  } | null;
};

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminFreightShipmentsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);
  const sp = await searchParams;
  const status = (FREIGHT_SHIPMENT_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as FreightShipmentStatus)
    : null;
  const q = sp.q?.trim() ?? "";

  const admin = createAdminClient();
  let query = admin
    .from("freight_shipments")
    .select(`
      id, job_no, status, transport_mode, container_code, carrier_container_no,
      bl_no, commercial_value_thb, created_at, source_quote_id,
      profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
    `)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `job_no.ilike.%${q}%,container_code.ilike.%${q}%,carrier_container_no.ilike.%${q}%,bl_no.ilike.%${q}%`,
    );
  }
  const { data: raw } = await query;

  type Profile = NonNullable<Row["profile"]>;
  const rows: Row[] = ((raw ?? []) as unknown as (Omit<Row, "profile"> & { profile: Profile | Profile[] | null })[]).map((r) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    return { ...r, profile };
  });

  // Counts per status.
  const counts: Record<FreightShipmentStatus, number> = {} as Record<FreightShipmentStatus, number>;
  for (const s of FREIGHT_SHIPMENT_STATUSES) counts[s] = 0;
  const { data: countRows } = await admin
    .from("freight_shipments")
    .select("status");
  for (const r of (countRows ?? []) as Array<{ status: FreightShipmentStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold">งานขนส่ง freight (shipments)</h1>
          <p className="text-xs text-muted mt-1">
            workflow: draft → ยืนยัน → ขนส่ง → ผ่านศุลฯ → ส่งมอบ · มาจาก quotation (V-E6) หรือสร้างตรง
          </p>
        </div>
        <Link
          href="/admin/freight/shipments/new"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          ➕ สร้างงานใหม่
        </Link>
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/freight/shipments"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({Object.values(counts).reduce((s, n) => s + n, 0)})</span>
        </Link>
        {FREIGHT_SHIPMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/freight/shipments?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {FREIGHT_SHIPMENT_STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/admin/freight/shipments" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          placeholder="ค้นหา: job_no, container code, B/L"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มี shipment{status && ` สถานะ "${FREIGHT_SHIPMENT_STATUS_LABEL[status]}"`}{q && ` ตรงกับ "${q}"`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Job no.</th>
                <th className="px-3 py-2">ลูกค้า</th>
                <th className="px-3 py-2">ขนส่ง</th>
                <th className="px-3 py-2">Container / B/L</th>
                <th className="px-3 py-2 text-right">มูลค่า (THB)</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">สร้าง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/freight/shipments/${r.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                      {r.job_no ?? "—"}
                    </Link>
                    {r.source_quote_id && (
                      <p className="text-[10px] text-muted">↗ มาจาก quotation</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-sm">
                      {r.profile?.company_name ?? `${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`.trim() ?? "—"}
                    </p>
                    {r.profile?.member_code && (
                      <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{FREIGHT_TRANSPORT_MODE_LABEL[r.transport_mode]}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">
                    {r.container_code && <p>{r.container_code}</p>}
                    {r.carrier_container_no && <p className="text-muted">{r.carrier_container_no}</p>}
                    {r.bl_no && <p className="text-muted">B/L: {r.bl_no}</p>}
                    {!r.container_code && !r.carrier_container_no && !r.bl_no && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.commercial_value_thb)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}>
                      {FREIGHT_SHIPMENT_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(r.created_at).toLocaleDateString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
