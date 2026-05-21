import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminForwarderUpdateForm } from "./update-form";
import { DriverAssignForm } from "./driver-assign-form";
import { CostAdjustmentsPanel, type CostAdjustmentRow } from "./cost-adjustments-panel";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";

// W-1: requireAdmin reads auth cookies; a page under a dynamic [fNo]
// segment that reads cookies MUST be force-dynamic (AGENTS.md §11).
//
// Wave 3 cleanup (2026-05-20 ค่ำ): the "Cargo shipments (spine)" section
// was removed when cargo_shipments/cargo_containers were retired under
// D1 Option A. The forwarder's container number is on the `cabinet_number`
// column directly (rendered in the AdminForwarderUpdateForm) and `tracking_th`
// gives the in-Thailand parcel ID; full container-level view lives at
// `/admin/report-cnt` (faithful port of report-cnt.php).
export const dynamic = "force-dynamic";

export default async function AdminForwarderDetail({ params }: { params: Promise<{ fNo: string }> }) {
  // W-1 (gap-admin H-1): same gate as the list page — import-order
  // detail + cost adjustments is ops + accounting only.
  await requireAdmin(["ops", "accounting"]);

  const { fNo } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("forwarders")
    .select(`
      id, f_no, profile_id, status, source_warehouse, transport_type, product_type, rate_basis,
      box_count, weight_kg, volume_cbm, width_cm, length_cm, height_cm,
      total_price, transport_price, service_fee, crate, crate_price, qc, qc_price,
      domestic_china_thb, thailand_delivery_thb, other_price,
      tracking_chn, tracking_th, cabinet_number, partner_warehouse, note_admin, note_user, detail,
      ship_first_name, ship_last_name, ship_phone, ship_phone2, ship_address_line, ship_sub_district, ship_district, ship_province, ship_postal_code, ship_note,
      bill_to_name_override,
      acknowledged_at, acknowledged_note,
      created_at, date_arrived_thailand, date_delivered,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email )
    `)
    .eq("f_no", fNo)
    .maybeSingle();

  if (!data) notFound();
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
  const f = data as unknown as Omit<typeof data, "profile"> & { profile: ProfileShape | ProfileShape[] | null };
  const profile = Array.isArray(f.profile) ? f.profile[0] ?? null : f.profile;

  const { data: items } = await admin
    .from("forwarder_items")
    .select("id, product_name, product_tracking, product_qty")
    .eq("forwarder_id", f.id);

  // U2-4: load cost adjustments for this forwarder
  const { data: costAdjRaw } = await admin
    .from("forwarder_cost_adjustments")
    .select("id, kind, amount_thb, note, status, created_at, paid_at, cancellation_reason")
    .eq("forwarder_id", f.id)
    .order("created_at", { ascending: false })
    .returns<CostAdjustmentRow[]>();
  const costAdjustments = costAdjRaw ?? [];

  // T-P1: load all driver assignments (history + active) for this forwarder
  const { data: assignmentsRaw } = await admin
    .from("forwarder_driver")
    .select(`
      id, status, fd_date, accepted_at, completed_at,
      driver:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .eq("forwarder_id", f.id)
    .order("fd_date", { ascending: false });
  type DriverShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  const assignments = ((assignmentsRaw ?? []) as Array<{
    id: string; status: number; fd_date: string;
    accepted_at: string | null; completed_at: string | null;
    driver: DriverShape | DriverShape[] | null;
  }>).map((a) => ({
    ...a,
    driver: Array.isArray(a.driver) ? (a.driver[0] ?? null) : a.driver,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ฝากนำเข้า</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{f.f_no}</h1>
        </div>
        <Link href="/admin/forwarders" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรายการ
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          {/* Customer */}
          <Section title="ลูกค้า">
            <Row label="รหัสสมาชิก" value={profile?.member_code ?? "—"} mono />
            <Row label="ชื่อ" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`} />
            <Row label="เบอร์" value={profile?.phone ?? "—"} />
            <Row label="อีเมล" value={profile?.email ?? "—"} />
            <Link href={`/admin/customers/${f.profile_id}`} className="text-xs text-primary-500 hover:underline">→ ดูโปรไฟล์ลูกค้า</Link>
          </Section>

          {/* Address */}
          <Section title="ที่อยู่จัดส่ง">
            <p className="text-sm">{f.ship_first_name} {f.ship_last_name}</p>
            <p className="text-xs text-muted">📞 {f.ship_phone}{f.ship_phone2 ? ` / ${f.ship_phone2}` : ""}</p>
            <p className="text-sm">{f.ship_address_line} ต.{f.ship_sub_district} อ.{f.ship_district} จ.{f.ship_province} {f.ship_postal_code}</p>
            {f.ship_note && <p className="text-xs text-muted">📝 {f.ship_note}</p>}
          </Section>

          {/* Dimensions */}
          <Section title="ขนาด / น้ำหนัก">
            <Row label="กล่อง" value={`${f.box_count}`} />
            <Row label="น้ำหนัก" value={`${Number(f.weight_kg).toFixed(2)} kg`} mono />
            <Row label="ขนาดกล่อง" value={`${Number(f.width_cm)}×${Number(f.length_cm)}×${Number(f.height_cm)} cm`} mono />
            <Row label="ปริมาตร" value={`${Number(f.volume_cbm).toFixed(3)} cbm`} mono />
          </Section>

          {/* Items */}
          {items && items.length > 0 && (
            <Section title={`รายการสินค้า (${items.length})`}>
              <ul className="text-sm space-y-1">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between border-b border-border pb-1">
                    <span>{it.product_name}{it.product_tracking ? ` · ${it.product_tracking}` : ""}</span>
                    <span className="font-mono text-xs">× {it.product_qty}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Pricing */}
          <Section title="ราคา">
            <Row label="ค่าขนส่ง" value={`฿${Number(f.transport_price).toFixed(2)}`} mono />
            <Row label="ค่าบริการ" value={`฿${Number(f.service_fee).toFixed(2)}`} mono />
            {f.crate && <Row label="ค่าตีลังไม้" value={`฿${Number(f.crate_price).toFixed(2)}`} mono />}
            {f.qc && <Row label="ค่า QC" value={`฿${Number(f.qc_price).toFixed(2)}`} mono />}
            {f.domestic_china_thb > 0 && <Row label="ค่าขนส่งในจีน" value={`฿${Number(f.domestic_china_thb).toFixed(2)}`} mono />}
            {f.thailand_delivery_thb > 0 && <Row label="ค่าขนส่งในไทย" value={`฿${Number(f.thailand_delivery_thb).toFixed(2)}`} mono />}
            {f.other_price > 0 && <Row label="อื่นๆ" value={`฿${Number(f.other_price).toFixed(2)}`} mono />}
            <div className="flex justify-between pt-2 border-t border-border text-base font-bold">
              <span>รวม</span>
              <span className="font-mono">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </Section>

          {/* Container info — Wave 3: the spine join was removed; the
              container number lives directly on `forwarders.cabinet_number`
              and is shown in the AdminForwarderUpdateForm. For the full
              container view + รายงานตู้, jump to /admin/report-cnt. */}
          {f.cabinet_number && (
            <Section title="📦 ตู้คอนเทนเนอร์">
              <Row label="หมายเลขตู้" value={f.cabinet_number} mono />
              <Link href="/admin/report-cnt" className="text-xs text-primary-500 hover:underline">→ ดูในรายงานตู้</Link>
            </Section>
          )}

          {(f as { acknowledged_at: string | null }).acknowledged_at && (
            <Section title="✅ ลูกค้ายืนยันรับสินค้าแล้ว (U4-3a)">
              <p className="text-xs text-muted">
                {new Date((f as { acknowledged_at: string }).acknowledged_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {(f as { acknowledged_note: string | null }).acknowledged_note && (
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  <span className="text-muted text-xs">โน้ตจากลูกค้า:</span> {(f as { acknowledged_note: string }).acknowledged_note}
                </p>
              )}
            </Section>
          )}

          {f.note_user && (
            <Section title="หมายเหตุจากลูกค้า">
              <p className="text-sm whitespace-pre-wrap">{f.note_user}</p>
            </Section>
          )}
          {f.detail && (
            <Section title="รายละเอียดสินค้า">
              <p className="text-sm whitespace-pre-wrap">{f.detail}</p>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <AdminForwarderUpdateForm
            fNo={f.f_no}
            status={f.status}
            totalPrice={Number(f.total_price)}
            tracking_chn={f.tracking_chn}
            tracking_th={f.tracking_th}
            cabinet_number={f.cabinet_number}
            partner_warehouse={f.partner_warehouse}
            note_admin={f.note_admin}
          />
          <DriverAssignForm
            forwarderId={f.id}
            assignments={assignments}
          />
          <CostAdjustmentsPanel
            forwarderId={f.id}
            fNo={f.f_no}
            existing={costAdjustments}
          />
          <BillToOverridePanel
            kind="forwarder"
            fNo={f.f_no}
            defaultName={[f.ship_first_name, f.ship_last_name].filter(Boolean).join(" ") || ""}
            current={f.bill_to_name_override ?? null}
          />
        </aside>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
      <h3 className="font-bold text-sm">{title}</h3>
      {children}
    </div>
  );
}
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
