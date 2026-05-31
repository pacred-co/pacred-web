import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settings")
    .select("service_fee, juristic_discount_threshold, juristic_discount_pct, qc_fee_per_item, crate_fee_base, free_shipping_enabled, free_shipping_threshold")
    .eq("id", 1)
    .maybeSingle();

  // The REAL daily yuan rates live in legacy tb_settings (rpdefault=ฝากโอน ·
  // rsdefault=ฝากสั่ง · hratecostdefault=cost) — edited at /admin/settings/legacy-rates,
  // read by actions/payment.ts getCurrentYuanRate() + /cart. The rebuilt
  // settings.yuan_rate was a DEAD-WRITE (no consumer) and was removed; we show
  // the live rates read-only here so staff aren't fooled into editing a no-op.
  const { data: rates, error: ratesErr } = await admin
    .from("tb_settings")
    .select("rpdefault, rsdefault, hratecostdefault")
    .limit(1)
    .maybeSingle<{
      rpdefault: number | string | null;
      rsdefault: number | string | null;
      hratecostdefault: number | string | null;
    }>();
  if (ratesErr) {
    console.error(`[settings tb_settings rates] failed`, { code: ratesErr.code, message: ratesErr.message });
  }

  if (error) {
    console.error(`[settings lookup] failed`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(`Failed to load settings (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (!data) notFound();
  type Settings = {
    service_fee: number;
    juristic_discount_threshold: number;
    juristic_discount_pct: number;
    qc_fee_per_item: number;
    crate_fee_base: number;
    free_shipping_enabled: boolean;
    free_shipping_threshold: number | null;
  };
  const s = data as Settings;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ตั้งค่าระบบ</h1>
        <p className="mt-1 text-sm text-muted">
          ตัวเลขในตารางนี้ถูกใช้ทุกครั้งที่คำนวณราคา — เปลี่ยนจะมีผลกับออเดอร์ใหม่ทันที (ออเดอร์เก่าใช้ค่าเรทตอนเปิด)
        </p>
        <p className="mt-2 text-xs">
          <Link href="/admin/settings/notifications" className="text-primary-600 underline">
            → ตั้งค่าการแจ้งเตือนของฉัน (รวม Sales Daily Digest)
          </Link>
        </p>
        <p className="mt-2 text-xs">
          <Link href="/admin/settings/forwarder-costs" className="text-primary-600 underline">
            → เรทต้นทุนฝากนำเข้า ค่าเริ่มต้น (เติมอัตโนมัติลง forwarder ใหม่)
          </Link>
        </p>
      </div>

      {/* Live daily yuan rates (legacy tb_settings) — READ-ONLY here; edited at
          /admin/settings/legacy-rates. The old editable settings.yuan_rate field
          below was a dead-write (no consumer read it) and was removed. */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50/60 dark:bg-primary-950/20 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-primary-700">เรทหยวน CNY → THB (ปรับรายวัน)</h2>
            <p className="text-[11px] text-muted mt-0.5">
              เรทจริงที่ระบบใช้กับ ฝากโอน / ฝากสั่ง / เติมเงิน — staff ปรับเองได้ มีผลทันที (ไม่ต้อง deploy)
            </p>
          </div>
          <Link
            href="/admin/settings/legacy-rates"
            className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 active:scale-[0.98] transition-all shadow-sm"
          >
            ปรับเรทหยวนรายวัน →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RateCell label="ฝากโอน / ฝากชำระ" value={rates?.rpdefault} />
          <RateCell label="ฝากสั่งสินค้า" value={rates?.rsdefault} />
          <RateCell label="ต้นทุน (cost)" value={rates?.hratecostdefault} />
        </div>
      </div>

      <SettingsForm {...s} />
    </main>
  );
}

function RateCell({ label, value }: { label: string; value: number | string | null | undefined }) {
  const n = value == null ? null : Number(value);
  const show = n != null && Number.isFinite(n) && n > 0 ? `฿${n.toFixed(4)}` : "—";
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-primary-700">
        {show}
        <span className="text-xs font-normal text-muted">/¥</span>
      </p>
    </div>
  );
}
