import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminServiceOrderUpdateForm } from "./update-form";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";
import { renderLegacyServiceOrderView } from "./legacy-view";

// Wave 3 cleanup (2026-05-20 ค่ำ): the "Cargo shipments (spine)" section
// was removed when cargo_shipments/cargo_containers were retired under
// D1 Option A. The container view lives at `/admin/report-cnt` (faithful
// port of report-cnt.php) which reads tb_forwarder GROUP BY fCabinetNumber.
//
// Wave 7 (2026-05-21 night): added legacy fallback that reads `tb_header_order`
// when the rebuilt `service_orders` row is missing. Pattern mirrors
// `forwarders/[fNo]/page.tsx` legacy fallback. Without this fallback every
// click from the /admin dashboard tabs + /admin/service-orders list 404'd
// because the rebuilt schema is empty on prod (the real customer data lives
// in `tb_header_order` after the D1 pivot).

export const dynamic = "force-dynamic";

export default async function AdminServiceOrderDetail({ params }: { params: Promise<{ hNo: string }> }) {
  const { hNo } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
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

  if (error) {
    console.error(`[service_orders lookup] failed`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(`Failed to load service_orders (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (!data) {
    // Wave 7 legacy fallback — read tb_header_order by hno
    const legacy = await renderLegacyServiceOrderView(hNo);
    if (legacy) return legacy;
    notFound();
  }
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; account_type: "personal" | "juristic" | null };
  const o = data as unknown as Omit<typeof data, "profile"> & { profile: ProfileShape | ProfileShape[] | null };
  const profile = Array.isArray(o.profile) ? o.profile[0] ?? null : o.profile;

  // F-1: for juristic customers, the PDF/receipt uses corporate.company_name as
  // the default bill-to name. Surface that as the "ชื่อเริ่มต้น" hint in the
  // override panel so the displayed default matches the actual default.
  let corporateName: string | null = null;
  if (profile?.account_type === "juristic") {
    const { data: corp, error: corpErr } = await admin
      .from("corporate")
      .select("company_name")
      .eq("profile_id", o.profile_id)
      .maybeSingle<{ company_name: string | null }>();
    if (corpErr) {
      console.error(`[corporate list] failed`, { code: corpErr.code, message: corpErr.message });
    }
    corporateName = corp?.company_name ?? null;
  }

  const { data: items, error: itemsErr } = await admin
    .from("service_order_items")
    .select("id, provider, shop_name, title, price_cny, amount, url")
    .eq("service_order_id", o.id);
  if (itemsErr) {
    console.error(`[service_order_items list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }

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

          {/* Wave 3 cleanup: spine "Cargo shipments" section removed.
              Container number is on `forwarders.cabinet_number` (per-forwarder);
              for the full container view see /admin/report-cnt. */}

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
