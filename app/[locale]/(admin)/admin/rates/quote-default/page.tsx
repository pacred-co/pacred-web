import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { GENERAL_COID } from "@/lib/forwarder/coid";
import { getQuoteDefaultRates } from "@/lib/admin/quote-default-rates";
import { getQuotePackages } from "@/lib/quote/quote-packages";
import { QuoteDefaultEditor } from "./quote-default-editor";
import { QuotePackagesEditor } from "./quote-packages-editor";

// "ตั้งเรทใบเสนอราคา" (owner ปอน 2026-07-17) — เซ็ตเรท default ทั้งระบบ สไตล์ใบเสนอราคา.
// เขียนเรททั่วไป tb_rate_g_* (coid 'PR') ผ่าน adminUpdateGeneralRateCells (reuse) →
// กระทบทั้ง ใบเสนอราคา (quote-tab อ่าน getQuoteDefaultRates เป็นชั้น default) และ
// เรทคิดเงินจริง (resolve-rate.ts อ่าน tb_rate_g_*). บันทึกทีละแถว.

export const dynamic = "force-dynamic";

export default async function AdminRatesQuoteDefaultPage() {
  await requireAdmin(["super", "accounting"]);
  const [grid, packages] = await Promise.all([getQuoteDefaultRates(), getQuotePackages()]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · PRICING</p>
          <h1 className="mt-1 text-2xl font-bold">ตั้งเรทใบเสนอราคา</h1>
          <p className="mt-1 text-sm text-muted">
            เซ็ตเรท <b>default ทั้งระบบ</b> แบบเดียวกับตารางในใบเสนอราคา (โกดัง × ประเภทสินค้า × ทางรถ/ทางเรือ) ·
            แก้แล้วกระทบ <b>ทั้งใบเสนอราคา และการคิดเงินจริง</b> — เขียนเรททั่วไป
            <code className="mx-1 rounded bg-surface-alt px-1 py-0.5 text-[11px]">tb_rate_g_*</code>
            (coid <code className="rounded bg-surface-alt px-1 text-[11px]">{GENERAL_COID}</code>) ที่ engine ใช้จริง · บันทึกทีละแถว
          </p>
        </div>
        <Link href="/admin/rates" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับสรุปอัตรา
        </Link>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        ⚠️ เรทนี้เป็น <b>default ของลูกค้าทั่วไป</b> (คนที่ยังไม่มีเรทเฉพาะตัว) · ลูกค้าที่ตั้งเรทเฉพาะตัวไว้ (SVIP)
        จะใช้เรทตัวเองเหมือนเดิม · ตั้งเรทเดียวทุกช่วงน้ำหนัก และครอบทั้ง 2 รหัสในกลุ่ม · แก้เรทตามช่วงน้ำหนัก (tier)
        แยกละเอียด → หน้า <Link href="/admin/rates/general" className="underline">เรททั่วไป (General)</Link>
      </div>

      <div>
        <h2 className="text-lg font-bold">ทั่วไป (เรทฐาน · คิดเงินจริง)</h2>
        <p className="mt-0.5 text-sm text-muted">เรท default ที่ engine ใช้จริง (บิล + ใบเสนอราคาเมื่อไม่เลือกแพ็ก)</p>
        <div className="mt-3">
          <QuoteDefaultEditor grid={grid} />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h2 className="text-lg font-bold">แพ็กเกจ (ใบเสนอราคา)</h2>
        <p className="mt-0.5 text-sm text-muted">
          พรีเซ็ตเรทสำหรับ <b>ใบเสนอราคา</b> — เลือกแพ็กในใบเสนอราคาลูกค้าแล้วเรทเปลี่ยนตามแพ็ก ·
          แก้/เพิ่ม/ลบได้ไม่จำกัด · <b>ไม่กระทบการคิดเงินจริง</b>
        </p>
        <div className="mt-3">
          <QuotePackagesEditor packages={packages} />
        </div>
      </div>
    </main>
  );
}
