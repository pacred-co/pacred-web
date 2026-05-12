import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

type Row = {
  id: string;
  f_no: string;
  status: string;
  source_warehouse: string;
  transport_type: string;
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  created_at: string;
  profile: { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
};

const STATUS_BADGE: Record<string, string> = {
  pending_payment:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped_china:     "bg-blue-50 text-blue-700 border-blue-200",
  in_transit:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand:  "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery:  "bg-orange-50 text-orange-700 border-orange-200",
  delivered:         "bg-green-50 text-green-700 border-green-200",
  cancelled:         "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระ", shipped_china: "ออกจีน", in_transit: "กลางทาง",
  arrived_thailand: "ถึงไทย", out_for_delivery: "ส่ง", delivered: "สำเร็จ", cancelled: "ยกเลิก",
};

export default async function AdminForwardersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin
    .from("forwarders")
    .select(`
      id, f_no, status, source_warehouse, transport_type,
      weight_kg, volume_cbm, total_price, tracking_chn, tracking_th, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq("status", sp.status);
  if (sp.q)      q = q.ilike("f_no", `%${sp.q}%`);

  const { data } = await q;
  type RawRow = Omit<Row, "profile"> & { profile: Row["profile"] | Row["profile"][] | null };
  const rows: Row[] = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ฝากนำเข้า — Ops</h1>
        </div>
      </div>

      <FilterBar currentStatus={sp.status} />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก/ปริมาตร</th>
                  <th className="px-4 py-3 text-right">ราคา</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">{r.f_no}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>{r.profile?.first_name} {r.profile?.last_name}</div>
                      <div className="text-muted">{r.profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.source_warehouse} / {r.transport_type}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {Number(r.weight_kg).toFixed(2)} kg<br /><span className="text-muted">{Number(r.volume_cbm).toFixed(3)} cbm</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">฿{Number(r.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.tracking_th && <div>TH: {r.tracking_th}</div>}
                      {r.tracking_chn && <div>CN: {r.tracking_chn}</div>}
                      {!r.tracking_th && !r.tracking_chn && <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function FilterBar({ currentStatus }: { currentStatus?: string }) {
  const opts = [
    { v: undefined, l: "ทั้งหมด" },
    { v: "pending_payment", l: STATUS_LABEL.pending_payment },
    { v: "shipped_china", l: STATUS_LABEL.shipped_china },
    { v: "in_transit", l: STATUS_LABEL.in_transit },
    { v: "arrived_thailand", l: STATUS_LABEL.arrived_thailand },
    { v: "out_for_delivery", l: STATUS_LABEL.out_for_delivery },
    { v: "delivered", l: STATUS_LABEL.delivered },
    { v: "cancelled", l: STATUS_LABEL.cancelled },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link
          key={o.l}
          href={o.v ? `/admin/forwarders?status=${o.v}` : "/admin/forwarders"}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentStatus ?? "") === (o.v ?? "")
              ? "bg-primary-500 text-white border-primary-500"
              : "bg-white border-border hover:bg-surface-alt"
          }`}
        >
          {o.l}
        </Link>
      ))}
    </div>
  );
}
