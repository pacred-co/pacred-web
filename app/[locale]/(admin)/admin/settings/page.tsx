import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settings")
    .select("service_fee, juristic_discount_threshold, juristic_discount_pct, qc_fee_per_item, crate_fee_base, free_shipping_enabled, free_shipping_threshold, yuan_rate")
    .eq("id", 1)
    .maybeSingle();

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
    yuan_rate: number;
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
          <Link href="/admin/settings/legacy-rates" className="text-primary-600 underline">
            → เรท CNY-THB ของ tb_settings (ฝากชำระ + ฝากสั่ง)
          </Link>
        </p>
        <p className="mt-2 text-xs">
          <Link href="/admin/settings/forwarder-costs" className="text-primary-600 underline">
            → เรทต้นทุนฝากนำเข้า ค่าเริ่มต้น (เติมอัตโนมัติลง forwarder ใหม่)
          </Link>
        </p>
      </div>

      <SettingsForm {...s} />
    </main>
  );
}
