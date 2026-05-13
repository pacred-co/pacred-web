import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ForwardersTable } from "./forwarders-table";
import { ForwardersSearchBar } from "./search-bar";
import { Suspense } from "react";

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

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระ", shipped_china: "ออกจีน", in_transit: "กลางทาง",
  arrived_thailand: "ถึงไทย", out_for_delivery: "ส่ง", delivered: "สำเร็จ", cancelled: "ยกเลิก",
};

type SearchParams = {
  status?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export default async function AdminForwardersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
    .limit(300);

  if (sp.status)    q = q.eq("status", sp.status);
  if (sp.date_from) q = q.gte("created_at", sp.date_from);
  if (sp.date_to)   q = q.lte("created_at", sp.date_to + "T23:59:59");

  const { data } = await q;
  type RawRow = Omit<Row, "profile"> & { profile: Row["profile"] | Row["profile"][] | null };
  let rows: Row[] = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // Client-side text search across multiple fields
  if (sp.q) {
    const keyword = sp.q.toLowerCase();
    rows = rows.filter((r) =>
      r.f_no.toLowerCase().includes(keyword) ||
      (r.tracking_chn ?? "").toLowerCase().includes(keyword) ||
      (r.tracking_th  ?? "").toLowerCase().includes(keyword) ||
      (r.profile?.member_code ?? "").toLowerCase().includes(keyword) ||
      (r.profile?.phone ?? "").includes(keyword) ||
      (`${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`).toLowerCase().includes(keyword)
    );
  }

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const filterOpts = [
    { v: undefined, l: `ทั้งหมด (${rows.length})` },
    { v: "pending_payment",  l: `${STATUS_LABEL.pending_payment} (${statusCounts.pending_payment ?? 0})` },
    { v: "shipped_china",    l: `${STATUS_LABEL.shipped_china} (${statusCounts.shipped_china ?? 0})` },
    { v: "in_transit",       l: `${STATUS_LABEL.in_transit} (${statusCounts.in_transit ?? 0})` },
    { v: "arrived_thailand", l: `${STATUS_LABEL.arrived_thailand} (${statusCounts.arrived_thailand ?? 0})` },
    { v: "out_for_delivery", l: `${STATUS_LABEL.out_for_delivery} (${statusCounts.out_for_delivery ?? 0})` },
    { v: "delivered",        l: `${STATUS_LABEL.delivered} (${statusCounts.delivered ?? 0})` },
    { v: "cancelled",        l: `${STATUS_LABEL.cancelled} (${statusCounts.cancelled ?? 0})` },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ฝากนำเข้า — Ops</h1>
          <p className="text-sm text-muted mt-0.5">{rows.length} รายการ</p>
        </div>
      </div>

      {/* Advanced search */}
      <Suspense>
        <ForwardersSearchBar />
      </Suspense>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterOpts.map((o) => {
          const params = new URLSearchParams();
          if (o.v) params.set("status", o.v);
          if (sp.q)         params.set("q", sp.q);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to)   params.set("date_to", sp.date_to);
          const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
          const active = (sp.status ?? "") === (o.v ?? "");
          return (
            <Link key={o.l} href={href}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}>
              {o.l}
            </Link>
          );
        })}
      </div>

      {/* Table with checkboxes + bulk action */}
      <ForwardersTable rows={rows} />
    </main>
  );
}
