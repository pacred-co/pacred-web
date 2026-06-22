import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

// ADR-0024 §0e — the LIVE pricing engine reads the single-row legacy
// `tb_settings`, NOT the rebuilt `settings` Potemkin twin (0-row/stale). This
// read-only "อัตราค่าบริการ" display was a dead-READ trap (showed rebuilt
// `settings`); repointed to `tb_settings` so it reflects what the system uses.
//   • rpdefault → เรทฝากชำระ/ฝากโอน (CNY→THB) — /service-payment, /admin/yuan-payments
//   • rsdefault → เรทฝากสั่ง (CNY→THB) — /cart, /service-order
//   • hratecostdefault → เรทต้นทุน H (cost)
//   • freeshipping → flag ("1" = เปิด); the rebuilt per-item fees
//     (service/qc/crate) + baht threshold have NO live legacy home → dropped,
//     pointed at the real cost editor /admin/settings/forwarder-costs.
type TbSettings = {
  rpdefault: number | string | null;
  rsdefault: number | string | null;
  hratecostdefault: number | string | null;
  freeshipping: string | null;
};

export default async function AdminRatesPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_settings")
    .select("rpdefault, rsdefault, hratecostdefault, freeshipping")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[tb_settings rates lookup] failed`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`Failed to load tb_settings (${error.code ?? "unknown"}): ${error.message}`);
  }

  const s = (data ?? {}) as TbSettings;
  const rp = Number(s.rpdefault ?? 0);
  const rs = Number(s.rsdefault ?? 0);
  const hcost = Number(s.hratecostdefault ?? 0);
  const freeShippingOn = String(s.freeshipping ?? "") === "1";

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">อัตราค่าบริการ</h1>
          <p className="mt-1 text-sm text-muted">
            อัตราจริงที่ระบบใช้คำนวณราคา — อ่านสดจาก{" "}
            <code className="rounded bg-surface-alt px-1 text-xs">tb_settings</code> (id=1)
          </p>
        </div>
        <Link
          href="/admin/settings/legacy-rates"
          className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          ปรับเรทหยวน →
        </Link>
      </div>

      {/* Exchange rate — the two live yuan rates (rp = ฝากโอน · rs = ฝากสั่ง) */}
      <RateSection title="อัตราแลกเปลี่ยนหยวน (CNY → THB)">
        <div className="grid sm:grid-cols-2 gap-3">
          <BigRateCard
            label="เรทฝากโอน / ฝากชำระ (rpdefault)"
            value={`1 ¥ = ฿${rp.toFixed(4)}`}
            note="ใช้กับ ฝากโอนหยวน · /service-payment · /admin/yuan-payments"
          />
          <BigRateCard
            label="เรทฝากสั่ง (rsdefault)"
            value={`1 ¥ = ฿${rs.toFixed(4)}`}
            note="ใช้กับ ฝากสั่งซื้อ · /cart · /service-order"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <RateCard
            label="เรทต้นทุนหยวน (hratecostdefault)"
            value={`1 ¥ = ฿${hcost.toFixed(4)}`}
            note="ต้นทุนภายใน (cost floor)"
          />
        </div>
      </RateSection>

      {/* Service fees + cost matrix — the LIVE source is the cost matrix in
          tb_settings (not flat per-item fees). Point at the real editor. */}
      <RateSection title="ค่าขนส่ง + ค่าบริการ (Cost matrix)">
        <Link
          href="/admin/settings/forwarder-costs"
          className="block rounded-2xl border border-primary-200 bg-primary-50 p-4 hover:bg-primary-100 transition"
        >
          <p className="text-sm font-semibold text-primary-700">
            ตารางต้นทุน/ค่าขนส่ง 144 ช่อง (tb_settings) — แก้ได้ →
          </p>
          <p className="text-[11px] text-primary-600 mt-1">
            ค่าขนส่งต่อ กก./คิว แยกตามขนส่ง × ประเภทสินค้า · ค่าบริการ · ค่าตีลัง — นี่คือค่าที่ระบบใช้จริง
          </p>
        </Link>
      </RateSection>

      {/* Free shipping — live flag in tb_settings.freeshipping ("1" = on) */}
      <RateSection title="ค่าขนส่งฟรี (Promo)">
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              freeShippingOn
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-gray-200 bg-gray-50 text-gray-500"
            }`}
          >
            {freeShippingOn ? "✓ เปิดใช้งาน" : "ปิดใช้งาน"}
          </div>
          <p className="text-xs text-muted">
            เปิด/ปิด + พื้นที่ส่งฟรี ตั้งค่าที่{" "}
            <Link href="/admin/settings/forwarder-costs" className="text-primary-500 hover:underline">
              ตารางต้นทุน/ค่าขนส่ง
            </Link>
          </p>
        </div>
      </RateSection>

      {/* Shipping rate table — tb_rate_* editors (live) */}
      <RateSection title="ตารางอัตราขนส่ง (Shipping rates)">
        <div className="grid sm:grid-cols-3 gap-3">
          <Link
            href="/admin/rates/general"
            className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-center hover:bg-primary-100 transition"
          >
            <p className="text-sm font-semibold text-primary-700">General rate</p>
            <p className="text-[11px] text-primary-600 mt-1">แก้ได้ →</p>
          </Link>
          <Link
            href="/admin/rates/custom-user"
            className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-center hover:bg-primary-100 transition"
          >
            <p className="text-sm font-semibold text-primary-700">VIP rate (ตามกลุ่ม)</p>
            <p className="text-[11px] text-primary-600 mt-1">แก้ได้ → tb_rate_vip_*</p>
          </Link>
          <Link
            href="/admin/rates/custom-user"
            className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-center hover:bg-primary-100 transition"
          >
            <p className="text-sm font-semibold text-primary-700">Custom rate (รายลูกค้า)</p>
            <p className="text-[11px] text-primary-600 mt-1">แก้ได้ →</p>
          </Link>
        </div>
        <div className="mt-2">
          <Link
            href="/admin/rates/custom-hs"
            className="block w-full rounded-2xl border border-primary-200 bg-primary-50 p-4 text-center hover:bg-primary-100 transition"
          >
            <p className="text-sm font-semibold text-primary-700">Custom-HS rate (ลูกค้า + HS code)</p>
            <p className="text-[11px] text-primary-600 mt-1">แก้ได้ → (wins ทุกอย่างใน waterfall)</p>
          </Link>
        </div>
      </RateSection>

      {/* Sales min-sell floor — Lane C guardrail (business_config) */}
      <RateSection title="ราคาขายขั้นต่ำ + เครื่องมือเสนอราคา (Sales)">
        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            href="/admin/settings/business-config"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition"
          >
            <p className="text-sm font-semibold text-amber-800">
              ราคาขายขั้นต่ำที่เซลเสนอได้ — แก้ได้ →
            </p>
            <p className="text-[11px] text-amber-700 mt-1">
              key <code className="rounded bg-white/60 px-1">pricing.min_sell_floor</code> · base ต่อโกดัง (กวางโจว/อี้อู) + เพิ่มต่อขนส่ง (เรือ) · เตือนเมื่อเสนอต่ำกว่า
            </p>
          </Link>
          <Link
            href="/admin/accounting/quote-compare/modes"
            className="rounded-2xl border border-primary-200 bg-primary-50 p-4 hover:bg-primary-100 transition"
          >
            <p className="text-sm font-semibold text-primary-700">
              เทียบราคา รถ/เรือ/แอร์ (+ ค่าบริการ) →
            </p>
            <p className="text-[11px] text-primary-600 mt-1">
              เครื่องมือเสนอราคาให้ลูกค้า · เทียบ 3 ขนส่ง all-in + กรอบกำไร CEO
            </p>
          </Link>
        </div>
      </RateSection>

      {/* Footer note — the real editors */}
      <p className="text-xs text-muted">
        แก้ไขอัตราได้ที่{" "}
        <Link href="/admin/settings/legacy-rates" className="text-primary-500 hover:underline">
          เรทหยวน (legacy-rates)
        </Link>{" "}
        ·{" "}
        <Link href="/admin/settings/forwarder-costs" className="text-primary-500 hover:underline">
          ตารางต้นทุน/ค่าขนส่ง
        </Link>{" "}
        — การเปลี่ยนแปลงมีผลกับออเดอร์ใหม่ทันที
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
      <p className="mt-0.5 text-[11px] text-muted">{note}</p>
    </div>
  );
}
