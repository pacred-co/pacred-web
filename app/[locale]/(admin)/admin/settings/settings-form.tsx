import { Link } from "@/i18n/navigation";

// ════════════════════════════════════════════════════════════
// ADR-0024 — config / settings SOT.  Read-through hub (was editable form).
// ════════════════════════════════════════════════════════════
//
// This used to be an editable form that wrote the rebuilt `settings` table
// via adminUpdateSettings. The 2026-06-01 big audit confirmed every field
// here is a DEAD-WRITE for the live customer money path (see
// docs/decisions/0024-config-settings-sot.md · §0e per-consumer verify):
//   • free_shipping_*           → live path reads tb_settings.freeshipping
//   • service_fee/juristic/QC/crate → read only by the rebuilt forwarder lane
//                                  (service-import/add) + display-only preview;
//                                  live forwarder pricing uses tb_rate_* + the
//                                  tb_settings cost matrix.
//
// Per D-2/D-4 #1 it's now a READ-ONLY view of the current rebuilt-table values
// (so staff can see what the rebuilt forwarder lane uses) with prominent links
// to the canonical editors. No write surface = no dead-write trap.

type Props = {
  service_fee: number;
  juristic_discount_threshold: number;
  juristic_discount_pct: number;
  qc_fee_per_item: number;
  crate_fee_base: number;
  free_shipping_enabled: boolean;
  free_shipping_threshold: number | null;
};

const thb = (n: number) =>
  `฿${Number(n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export function SettingsForm(s: Props) {
  return (
    <div className="space-y-5">
      {/* Canonical editors — the real write surfaces */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-3 max-w-2xl">
        <h2 className="text-sm font-bold text-foreground">แก้ไขค่าจริงที่ระบบใช้ (ตัวแก้ที่ถูกต้อง)</h2>
        <p className="text-xs text-muted">
          หน้านี้รวมลิงก์ไปยังตัวตั้งค่าตัวจริง — แก้ที่นี่แล้วมีผลกับ flow จริงทันที
          (หน้านี้เคยมีฟอร์มแก้ค่า แต่เขียนลงตารางที่ระบบไม่ได้อ่าน — ปิดไปตาม ADR-0024)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <HubLink
            href="/admin/settings/legacy-rates"
            title="เรทหยวนรายวัน"
            desc="ฝากโอน / ฝากสั่ง / ต้นทุน (tb_settings)"
          />
          <HubLink
            href="/admin/settings/forwarder-costs"
            title="เรทต้นทุน + ส่งฟรี"
            desc="144 ช่องต้นทุน + โปรส่งฟรี (tb_settings)"
          />
          <HubLink
            href="/admin/settings/business-config"
            title="Business Config"
            desc="ภาษี WHT/VAT · OTP · กระเป๋า · flags"
          />
        </div>
      </div>

      {/* Read-only: current values of the rebuilt `settings` row.
          These drive ONLY the rebuilt service-import/add forwarder lane
          (low-data) — shown for reference, not editable here. */}
      <div className="rounded-2xl border border-border bg-surface/60 p-6 max-w-2xl space-y-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            ค่าธรรมเนียม forwarder (อ้างอิงเท่านั้น · อ่านอย่างเดียว)
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            ค่าเหล่านี้ใช้เฉพาะ lane ฝากนำเข้าแบบ rebuilt (service-import/add) ซึ่งข้อมูลน้อยมาก
            — pricing จริงของลูกค้าใช้ตารางเรท (tb_rate_*) + cost matrix (tb_settings) ไม่ได้อ่านค่าเหล่านี้
          </p>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <ReadRow label="ค่าบริการต่อออเดอร์" value={thb(s.service_fee)} />
          <ReadRow label="ค่า QC ต่อชิ้น" value={thb(s.qc_fee_per_item)} />
          <ReadRow label="ค่าตีลังไม้ตั้งต้น" value={thb(s.crate_fee_base)} />
          <ReadRow
            label="ส่วนลดนิติบุคคล"
            value={`${(Number(s.juristic_discount_pct) * 100).toFixed(2)}% เมื่อ ≥ ${thb(s.juristic_discount_threshold)}`}
          />
          <ReadRow
            label="โปรส่งฟรี"
            value={
              s.free_shipping_enabled
                ? `เปิด${s.free_shipping_threshold != null ? ` (ขั้นต่ำ ${thb(s.free_shipping_threshold)})` : ""}`
                : "ปิด"
            }
          />
        </dl>
      </div>
    </div>
  );
}

function HubLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-primary-200 bg-primary-50/60 dark:bg-primary-950/20 px-4 py-3 hover:border-primary-400 hover:bg-primary-100/60 transition-colors"
    >
      <p className="text-sm font-bold text-primary-700">{title} →</p>
      <p className="text-[11px] text-muted mt-0.5">{desc}</p>
    </Link>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}
