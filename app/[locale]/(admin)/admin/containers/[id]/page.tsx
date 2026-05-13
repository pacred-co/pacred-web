import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContainerEditForm } from "./edit-form";
import { LinkForwardersForm } from "./link-form";
import { UnlinkButton } from "./unlink-button";
import { StatusActions } from "../actions-cell";

const STATUS_BADGE: Record<string, string> = {
  preparing:       "bg-gray-50 text-gray-700 border-gray-200",
  sealed:          "bg-yellow-50 text-yellow-700 border-yellow-200",
  in_transit:      "bg-blue-50 text-blue-700 border-blue-200",
  arrived_port:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  cleared_customs: "bg-purple-50 text-purple-700 border-purple-200",
  delivered:       "bg-green-50 text-green-700 border-green-200",
  cancelled:       "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  preparing: "เตรียมตู้", sealed: "ปิดตู้แล้ว", in_transit: "ขนส่งกลางทาง",
  arrived_port: "ถึงท่าไทย", cleared_customs: "ผ่านศุลฯ", delivered: "ส่งมอบ", cancelled: "ยกเลิก",
};

export default async function AdminContainerDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch container
  const { data: container } = await admin
    .from("containers")
    .select(`
      id, container_no, vendor_container_id, vessel, carrier,
      origin_warehouse, transport_type, status, eta, note,
      date_sealed, date_in_transit, date_arrived_port, date_cleared, date_delivered,
      created_at, updated_at
    `)
    .eq("id", id)
    .maybeSingle();

  if (!container) notFound();

  type Container = {
    id: string;
    container_no: string | null;
    vendor_container_id: string | null;
    vessel: string | null;
    carrier: string | null;
    origin_warehouse: string;
    transport_type: string;
    status: string;
    eta: string | null;
    note: string | null;
    date_sealed: string | null;
    date_in_transit: string | null;
    date_arrived_port: string | null;
    date_cleared: string | null;
    date_delivered: string | null;
    created_at: string;
  };
  const c = container as Container;

  // Linked forwarders
  const { data: linked } = await admin
    .from("forwarders")
    .select("id, f_no, status, weight_kg, volume_cbm, box_count, total_price, ship_first_name, ship_last_name, ship_province")
    .eq("container_id", id)
    .order("created_at", { ascending: false });

  // Eligible forwarders to link — same origin + transport, NOT yet in any container,
  // and status not cancelled/delivered (no point linking already-delivered)
  const { data: eligible } = await admin
    .from("forwarders")
    .select("id, f_no, status, weight_kg, volume_cbm, box_count, ship_first_name, ship_last_name, profiles:profile_id(member_code)")
    .is("container_id", null)
    .eq("source_warehouse", c.origin_warehouse === "guangzhou" ? "guangzhou" : c.origin_warehouse === "yiwu" ? "yiwu" : c.origin_warehouse)
    .eq("transport_type", c.transport_type)
    .not("status", "in", "(cancelled,delivered)")
    .order("created_at", { ascending: false })
    .limit(100);

  type EligibleProfile = { member_code: string | null };
  type EligibleRow = {
    id: string;
    f_no: string | null;
    status: string;
    weight_kg: number;
    volume_cbm: number;
    box_count: number;
    ship_first_name: string | null;
    ship_last_name: string | null;
    profiles: EligibleProfile | EligibleProfile[] | null;
  };
  const eligibleRows: Array<EligibleRow & { member_code: string | null }> = ((eligible ?? []) as EligibleRow[]).map((r) => ({
    ...r,
    member_code: Array.isArray(r.profiles) ? (r.profiles[0]?.member_code ?? null) : (r.profiles?.member_code ?? null),
  }));

  const totals = (linked ?? []).reduce(
    (acc, f) => ({
      boxes:  acc.boxes  + Number(f.box_count),
      weight: acc.weight + Number(f.weight_kg),
      volume: acc.volume + Number(f.volume_cbm),
      thb:    acc.thb    + Number(f.total_price),
    }),
    { boxes: 0, weight: 0, volume: 0, thb: 0 },
  );

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/containers" className="hover:text-foreground">← รายการตู้ทั้งหมด</Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">CONTAINER</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{c.container_no ?? "—"}</h1>
          <p className="mt-1 text-sm text-muted">
            {c.origin_warehouse === "yiwu" ? "อี้อู" : c.origin_warehouse === "other" ? "อื่นๆ" : "กวางโจว"}
            {" → ไทย ("}
            {c.transport_type === "truck" ? "🚚 ทางรถ" : c.transport_type === "ship" ? "🚢 ทางเรือ" : "✈️ ทางอากาศ"}
            )
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[c.status]}`}>
            {STATUS_LABEL[c.status] ?? c.status}
          </span>
          <StatusActions id={c.id} status={c.status} />
        </div>
      </div>

      {/* 2-column: edit form + status timeline */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <ContainerEditForm
          id={c.id}
          vendor_container_id={c.vendor_container_id}
          vessel={c.vessel}
          carrier={c.carrier}
          eta={c.eta}
          note={c.note}
        />

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-bold mb-3">ไทม์ไลน์สถานะ</h3>
          <ul className="space-y-2 text-xs">
            <TimelineRow label="สร้างตู้" date={c.created_at} done />
            <TimelineRow label="ปิดตู้" date={c.date_sealed} done={!!c.date_sealed} />
            <TimelineRow label="ออกเดินทาง" date={c.date_in_transit} done={!!c.date_in_transit} />
            <TimelineRow label="ถึงท่า" date={c.date_arrived_port} done={!!c.date_arrived_port} />
            <TimelineRow label="ผ่านศุลฯ" date={c.date_cleared} done={!!c.date_cleared} />
            <TimelineRow label="ส่งมอบ" date={c.date_delivered} done={!!c.date_delivered} />
          </ul>
          {c.eta && (
            <div className="mt-3 pt-3 border-t border-border text-xs">
              <span className="text-muted">ETA: </span>
              <span className="font-mono font-bold">{c.eta}</span>
            </div>
          )}
        </div>
      </div>

      {/* Linked forwarders */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-alt/50">
          <h2 className="font-bold text-sm">
            ฝากนำเข้าในตู้นี้ ({linked?.length ?? 0})
          </h2>
          {linked && linked.length > 0 && (
            <div className="flex gap-4 text-xs text-muted font-mono">
              <span>{totals.boxes} กล่อง</span>
              <span>{totals.weight.toFixed(2)} kg</span>
              <span>{totals.volume.toFixed(3)} cbm</span>
              <span className="text-primary-600 font-bold">฿{totals.thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
        {(linked ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ยังไม่มีฝากนำเข้าผูกกับตู้นี้ — เลือกจากรายการด้านล่าง</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/30 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">f_no</th>
                <th className="px-4 py-2">ลูกค้า</th>
                <th className="px-4 py-2 text-right">น้ำหนัก/CBM</th>
                <th className="px-4 py-2">สถานะ</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {(linked ?? []).map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{f.f_no}</td>
                  <td className="px-4 py-2 text-xs">
                    {f.ship_first_name} {f.ship_last_name}
                    <div className="text-muted">{f.ship_province}</div>
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-mono">
                    {Number(f.weight_kg).toFixed(2)} kg / {Number(f.volume_cbm).toFixed(3)} cbm
                  </td>
                  <td className="px-4 py-2 text-xs">{f.status}</td>
                  <td className="px-4 py-2 text-right">
                    <UnlinkButton id={f.id} fNo={f.f_no ?? "—"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Eligible forwarders to link */}
      {c.status !== "delivered" && c.status !== "cancelled" && (
        <LinkForwardersForm containerId={c.id} eligible={eligibleRows} />
      )}
    </main>
  );
}

function TimelineRow({ label, date, done }: { label: string; date?: string | null; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={done ? "text-green-600" : "text-gray-300"}>{done ? "●" : "○"}</span>
      <span className={done ? "text-foreground" : "text-muted"}>{label}</span>
      {date && <span className="ml-auto text-muted text-[10px]">{new Date(date).toLocaleDateString("th-TH")}</span>}
    </li>
  );
}
