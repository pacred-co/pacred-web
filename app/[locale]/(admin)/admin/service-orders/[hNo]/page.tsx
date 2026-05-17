import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminServiceOrderUpdateForm } from "./update-form";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  received_cn:         "รับเข้าโกดังจีน",
  packed_cn:           "บรรจุแล้ว (จีน)",
  sealed_in_container: "ปิดตู้แล้ว (จีน)",
  in_transit:          "กำลังเดินทาง",
  arrived_th:          "ถึงไทยแล้ว",
  unloaded:            "ลงจากตู้ (ไทย)",
  out_for_delivery:    "กำลังจัดส่ง",
  delivered:           "ส่งสำเร็จ",
};

export default async function AdminServiceOrderDetail({ params }: { params: Promise<{ hNo: string }> }) {
  const { hNo } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("service_orders")
    .select(`
      id, h_no, profile_id, status, title, item_count, total_thb, subtotal_cny, yuan_rate_locked,
      warehouse_china, transport_type, pay_method, crate, free_shipping, ship_by, note_admin, note_user,
      payment_due_at, created_at,
      ship_first_name, ship_last_name, ship_phone, ship_address_line, ship_sub_district, ship_district, ship_province, ship_postal_code,
      bill_to_name_override,
      acknowledged_at, acknowledged_note,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email, account_type )
    `)
    .eq("h_no", hNo)
    .maybeSingle();

  if (!data) notFound();
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; account_type: "personal" | "juristic" | null };
  const o = data as unknown as Omit<typeof data, "profile"> & { profile: ProfileShape | ProfileShape[] | null };
  const profile = Array.isArray(o.profile) ? o.profile[0] ?? null : o.profile;

  // F-1: for juristic customers, the PDF/receipt uses corporate.company_name as
  // the default bill-to name. Surface that as the "ชื่อเริ่มต้น" hint in the
  // override panel so the displayed default matches the actual default.
  let corporateName: string | null = null;
  if (profile?.account_type === "juristic") {
    const { data: corp } = await admin
      .from("corporate")
      .select("company_name")
      .eq("profile_id", o.profile_id)
      .maybeSingle<{ company_name: string | null }>();
    corporateName = corp?.company_name ?? null;
  }

  const { data: items } = await admin
    .from("service_order_items")
    .select("id, provider, shop_name, title, price_cny, amount, url")
    .eq("service_order_id", o.id);

  // Surface cargo_shipments linked to this service-order (V-D2/D3 + V-C3 visibility)
  const { data: shipmentsRaw } = await admin
    .from("cargo_shipments")
    .select(`
      id, shipment_code, status, box_count, received_box_count, cargo_type, weight_kg, volume_cbm, created_at,
      container:cargo_containers!cargo_container_id ( code, transport_mode, status, eta, close_at, carrier_container_no )
    `)
    .eq("service_order_h_no", o.h_no)
    .order("created_at", { ascending: false });
  type ContainerEmbed = { code: string | null; transport_mode: string | null; status: string; eta: string | null; close_at: string | null; carrier_container_no: string | null };
  type RawShipment = { id: string; shipment_code: string; status: string; box_count: number; received_box_count: number; cargo_type: string | null; weight_kg: number | null; volume_cbm: number | null; created_at: string; container: ContainerEmbed | ContainerEmbed[] | null };
  const shipments = ((shipmentsRaw ?? []) as RawShipment[]).map((s) => ({
    ...s,
    container: Array.isArray(s.container) ? (s.container[0] ?? null) : s.container,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ฝากสั่ง</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{o.h_no}</h1>
        </div>
        <Link href="/admin/service-orders" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรายการ
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <Section title="ลูกค้า">
            <Row label="รหัสสมาชิก" value={profile?.member_code ?? "—"} />
            <Row label="ชื่อ" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`} />
            <Row label="เบอร์" value={profile?.phone ?? "—"} />
            <Link href={`/admin/customers/${o.profile_id}`} className="text-xs text-primary-500 hover:underline">→ ดูโปรไฟล์</Link>
          </Section>

          <Section title="ที่อยู่จัดส่ง">
            <p className="text-sm">{o.ship_first_name} {o.ship_last_name}</p>
            <p className="text-xs text-muted">📞 {o.ship_phone}</p>
            <p className="text-sm">{o.ship_address_line} ต.{o.ship_sub_district} อ.{o.ship_district} จ.{o.ship_province} {o.ship_postal_code}</p>
          </Section>

          <Section title="ตัวเลือกการขนส่ง">
            <Row label="โกดังต้นทาง" value={o.warehouse_china === "yiwu" ? "อี้อู" : "กวางโจว"} />
            <Row label="การขนส่ง" value={o.transport_type} />
            <Row label="วิธีเก็บเงิน" value={o.pay_method === "origin" ? "ต้นทาง" : "ปลายทาง"} />
            {o.crate && <Row label="ตีลังไม้" value="✓" />}
            {o.free_shipping && <Row label="ส่งฟรี" value="✓ (Pacred zone)" />}
            {o.ship_by && <Row label="ship_by" value={o.ship_by} />}
          </Section>

          <Section title={`รายการสินค้า (${items?.length ?? 0})`}>
            <ul className="text-sm space-y-2">
              {(items ?? []).map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3 border-b border-border pb-2">
                  <div>
                    <div className="text-xs font-medium">{it.title ?? "—"}</div>
                    <div className="text-[10px] text-muted">{it.provider} · {it.shop_name}</div>
                    {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary-500 hover:underline">→ source</a>}
                  </div>
                  <div className="text-right font-mono text-xs whitespace-nowrap">
                    ¥{Number(it.price_cny).toFixed(2)} × {it.amount}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="ราคา">
            <Row label="ยอดสินค้า" value={`¥${Number(o.subtotal_cny).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} />
            {o.yuan_rate_locked && <Row label="เรท" value={`฿${Number(o.yuan_rate_locked).toFixed(4)}/¥`} />}
            <div className="flex justify-between pt-2 border-t border-border text-base font-bold">
              <span>รวม</span>
              <span className="font-mono">฿{Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </Section>

          {/* Cargo shipments linked to this service-order */}
          {shipments.length > 0 && (
            <Section title={`📦 Cargo shipments (${shipments.length})`}>
              <ul className="text-sm space-y-2">
                {shipments.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border p-3 space-y-1">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-mono text-xs font-medium">{s.shipment_code}</p>
                        <p className="text-[10px] text-muted">
                          {SHIPMENT_STATUS_LABEL[s.status] ?? s.status}
                          {" · "}
                          <span className={s.received_box_count >= s.box_count ? "text-green-700" : ""}>
                            {s.received_box_count}/{s.box_count} กล่อง
                          </span>
                          {s.weight_kg != null && <> · {Number(s.weight_kg).toFixed(1)} kg</>}
                        </p>
                        {s.cargo_type && (
                          <p className="text-[10px] text-blue-700">🏷️ {s.cargo_type}</p>
                        )}
                      </div>
                      {s.container?.code ? (
                        <Link
                          href={`/admin/warehouse/containers/${s.container.code}`}
                          className="rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-[10px] text-primary-700 hover:bg-primary-100"
                        >
                          ↗ ตู้ <span className="font-mono">{s.container.code}</span>
                        </Link>
                      ) : (
                        <span className="text-[10px] text-muted">ยังไม่ assign ตู้</span>
                      )}
                    </div>
                    {s.container?.carrier_container_no && (
                      <p className="text-[10px] text-muted">B/L: <span className="font-mono">{s.container.carrier_container_no}</span></p>
                    )}
                    {s.container?.eta && (
                      <p className="text-[10px] text-muted">
                        ETA {new Date(s.container.eta).toLocaleDateString("th-TH")}
                        {s.container.close_at && <> · ตัดตู้ {new Date(s.container.close_at).toLocaleDateString("th-TH")}</>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(o as { acknowledged_at: string | null }).acknowledged_at && (
            <Section title="✅ ลูกค้ายืนยันรับสินค้าแล้ว (U4-3a)">
              <p className="text-xs text-muted">
                {new Date((o as { acknowledged_at: string }).acknowledged_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {(o as { acknowledged_note: string | null }).acknowledged_note && (
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  <span className="text-muted text-xs">โน้ตจากลูกค้า:</span> {(o as { acknowledged_note: string }).acknowledged_note}
                </p>
              )}
            </Section>
          )}

          {o.note_user && (
            <Section title="โน้ตจากลูกค้า">
              <p className="text-sm whitespace-pre-wrap">{o.note_user}</p>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <AdminServiceOrderUpdateForm hNo={o.h_no!} status={o.status} note_admin={o.note_admin} totalThb={Number(o.total_thb)} />
          <BillToOverridePanel
            kind="service_order"
            hNo={o.h_no!}
            defaultName={
              // F-1: juristic uses company_name in PDF/receipt; non-juristic uses first+last
              (corporateName ?? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")) || ""
            }
            current={(o as { bill_to_name_override: string | null }).bill_to_name_override ?? null}
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
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
