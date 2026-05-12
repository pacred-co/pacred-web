import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminForwarderUpdateForm } from "./update-form";

export default async function AdminForwarderDetail({ params }: { params: Promise<{ fNo: string }> }) {
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

        <aside>
          <AdminForwarderUpdateForm
            fNo={f.f_no}
            status={f.status}
            tracking_chn={f.tracking_chn}
            tracking_th={f.tracking_th}
            cabinet_number={f.cabinet_number}
            partner_warehouse={f.partner_warehouse}
            note_admin={f.note_admin}
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
