import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { getAdminRoles, hasRole, isGodRole } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  const roles = await getAdminRoles();
  const isSuper = roles != null && isGodRole(roles);
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
        <PageHeader
          eyebrow="ADMIN · ตั้งค่าระบบ"
          title="ตั้งค่าระบบ"
          subtitle="ศูนย์รวมตัวตั้งค่า — แต่ละค่าแก้ที่ตัวแก้ตัวจริงด้านล่าง (มีผลกับออเดอร์ใหม่ทันที · ออเดอร์เก่าใช้ค่าตอนเปิด)"
        />
        <p className="mt-2 text-xs">
          <Link href="/admin/settings/notifications" className="text-primary-600 underline">
            → ตั้งค่าการแจ้งเตือนของฉัน (รวม Sales Daily Digest)
          </Link>
        </p>
        <p className="mt-1 text-xs">
          <Link href="/admin/settings/promos" className="text-primary-600 underline">
            → จัดการแบนเนอร์โปรโมชัน (เพิ่ม/แก้/อัปโหลดรูป หลายอัน)
          </Link>
        </p>
      </div>

      {/* Go-Live Control Panel — super-only owner switchboard (the 9 dormant
          go-live levers in one place). Linked here so super lands on it ≤2 clicks. */}
      {isSuper && (
        <Link
          href="/admin/settings/go-live"
          className="block rounded-2xl border-2 border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-5 hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">🚦 Go-Live Control Panel</h2>
              <p className="text-[11px] text-muted mt-0.5">
                ศูนย์รวมสวิตช์เปิดระบบทั้งหมด — ใบกำกับ ฝากสั่ง/ฝากโอน · ค่าคอม Freight · เรทศุลกากร · PEAK GL ·
                role พนักงาน · checklist ภายนอก. เปิดได้ปลอดภัยจากหน้าเดียว (super).
              </p>
            </div>
            <span className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">
              เปิดแผงควบคุม →
            </span>
          </div>
        </Link>
      )}

      {/* Live daily yuan rates (legacy tb_settings) — READ-ONLY here; edited at
          /admin/settings/legacy-rates. The old editable settings.yuan_rate field
          below was a dead-write (no consumer read it) and was removed. */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50/60 dark:bg-primary-950/20 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-primary-700">เรทหยวน CNY → THB (ปรับรายวัน)</h2>
            <p className="text-[11px] text-muted mt-0.5">
              เรทจริงที่ระบบใช้กับ ฝากโอน / ฝากสั่ง / ชำระเงิน — staff ปรับเองได้ มีผลทันที (ไม่ต้อง deploy)
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
