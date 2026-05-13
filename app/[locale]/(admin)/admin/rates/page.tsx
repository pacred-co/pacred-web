import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";

type Settings = {
  yuan_rate: number;
  service_fee: number;
  juristic_discount_threshold: number;
  juristic_discount_pct: number;
  qc_fee_per_item: number;
  crate_fee_base: number;
  free_shipping_enabled: boolean;
  free_shipping_threshold: number | null;
};

export default async function AdminRatesPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select(`
      yuan_rate, service_fee,
      juristic_discount_threshold, juristic_discount_pct,
      qc_fee_per_item, crate_fee_base,
      free_shipping_enabled, free_shipping_threshold
    `)
    .eq("id", 1)
    .maybeSingle();

  if (!data) notFound();
  const s = data as Settings;

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">อัตราค่าบริการ</h1>
          <p className="mt-1 text-sm text-muted">อัตราปัจจุบันที่ใช้คำนวณราคาออเดอร์ใหม่</p>
        </div>
        <Link
          href="/admin/settings"
          className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          แก้ไขค่า →
        </Link>
      </div>

      {/* Exchange rate */}
      <RateSection title="อัตราแลกเปลี่ยน">
        <BigRateCard
          label="อัตราหยวน (CNY → THB)"
          value={`1 ¥ = ฿${Number(s.yuan_rate).toFixed(4)}`}
          note="ใช้ทุกครั้งที่คำนวณค่าฝากโอนหยวน"
        />
      </RateSection>

      {/* Service fees */}
      <RateSection title="ค่าบริการ (Service fees)">
        <div className="grid sm:grid-cols-3 gap-3">
          <RateCard
            label="ค่าดำเนินการ"
            value={`฿${Number(s.service_fee).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            note="ต่อรายการ"
          />
          <RateCard
            label="ค่า QC / ตรวจของ"
            value={`฿${Number(s.qc_fee_per_item).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            note="ต่อชิ้น"
          />
          <RateCard
            label="ค่าไม้ + กล่อง"
            value={`฿${Number(s.crate_fee_base).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            note="ฐาน (ขึ้นอยู่กับน้ำหนัก)"
          />
        </div>
      </RateSection>

      {/* Juristic discount */}
      <RateSection title="ส่วนลดลูกค้านิติบุคคล">
        <div className="grid sm:grid-cols-2 gap-3">
          <RateCard
            label="ยอดขั้นต่ำที่ได้ส่วนลด"
            value={`฿${Number(s.juristic_discount_threshold).toLocaleString("th-TH")}`}
            note="ต่อออเดอร์"
          />
          <RateCard
            label="เปอร์เซ็นต์ส่วนลด"
            value={`${Number(s.juristic_discount_pct).toFixed(1)}%`}
            note="หักจากค่าดำเนินการ"
          />
        </div>
      </RateSection>

      {/* Free shipping */}
      <RateSection title="ค่าขนส่งฟรี (Promo)">
        <div className="flex items-center gap-4">
          <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            s.free_shipping_enabled
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-gray-200 bg-gray-50 text-gray-500"
          }`}>
            {s.free_shipping_enabled ? "✓ เปิดใช้งาน" : "ปิดใช้งาน"}
          </div>
          {s.free_shipping_enabled && s.free_shipping_threshold != null && (
            <div className="text-sm text-muted">
              ยอดสั่งซื้อ ≥ <span className="font-semibold text-foreground">
                ฿{Number(s.free_shipping_threshold).toLocaleString("th-TH")}
              </span> รับค่าขนส่งฟรี
            </div>
          )}
        </div>
      </RateSection>

      {/* Shipping rate table — Phase D placeholder */}
      <RateSection title="ตารางอัตราขนส่ง (Shipping rates)">
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">ตารางราคา KG / CBM ตาม route</p>
          <p className="text-xs text-muted mt-1">
            จะเพิ่มในเฟส D (port จาก tb_rate_g_* + tb_rate_vip_* จากระบบเก่า)
          </p>
          <div className="mt-3 flex justify-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-border px-3 py-1">General rate</span>
            <span className="rounded-full border border-border px-3 py-1">VIP rate</span>
            <span className="rounded-full border border-border px-3 py-1">Custom rate</span>
          </div>
        </div>
      </RateSection>

      {/* Last updated note */}
      <p className="text-xs text-muted">
        แก้ไขอัตราได้ที่{" "}
        <Link href="/admin/settings" className="text-primary-500 hover:underline">
          Admin → ตั้งค่าระบบ
        </Link>
        {" "}— การเปลี่ยนแปลงมีผลกับออเดอร์ใหม่ทันที
      </p>
    </main>
  );
}

function RateSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-muted uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function BigRateCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
      <p className="text-xs text-primary-600 font-medium">{label}</p>
      <p className="mt-1 text-3xl font-bold font-mono text-primary-700">{value}</p>
      <p className="mt-1 text-xs text-primary-500">{note}</p>
    </div>
  );
}

function RateCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted font-medium">{label}</p>
      <p className="mt-1 text-xl font-bold font-mono text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted">{note}</p>
    </div>
  );
}
