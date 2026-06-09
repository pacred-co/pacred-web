import { requireAdmin } from "@/lib/auth/require-admin";
import { getFreightRates } from "@/actions/admin/freight-rates";
import { FreightRatesClient } from "./freight-rates-client";

/**
 * /admin/freight/rates — China-side freight COST-rate maintenance.
 *
 * The keystone of the freight cost-side. The rate engine
 * (lib/freight/rate-engine.ts · composeFreightQuote) reads these admin-maintained
 * costs via lib/freight/rate-lookup.ts (lookupChinaFreightCostThb) so EXW/CFR
 * freight quotes can show a TRUE net margin instead of only "กำไรขั้นต้น" (gross).
 * Until this page existed, `tb_freight_rate` (migration 0145) was empty on prod
 * because there was NO write-path — so every quote fell back to gross.
 *
 * Staff (super/ops) add/edit/toggle/delete cost rows here; accounting can read.
 * Each row = a per-unit cost in USD + snapshot FX + the route it applies to.
 * The reader keys on (transport_mode + most-default route pol='' + newest
 * effective_from + active=true) and converts USD→THB × units.
 *
 * RBAC mirrors the tb_freight_rate RLS: read super/ops/accounting · write super/ops.
 */

export const dynamic = "force-dynamic";

export default async function AdminFreightRatesPage() {
  const { roles } = await requireAdmin(["super", "ops", "accounting"]);
  // Write-capable = super OR ops (mirror the table write RLS). accounting = read-only.
  const canWrite = roles.includes("super") || roles.includes("ops");

  const { rows, loadFailed } = await getFreightRates();

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
        <h1 className="mt-1 text-2xl font-bold">ต้นทุนเฟรทจีน (Cost Rates)</h1>
        <p className="text-xs text-muted max-w-3xl">
          ต้นทุนค่าขนส่งฝั่งจีน (USD ต่อหน่วย × เรท FX) ที่ใช้คำนวณกำไรสุทธิจริงของใบเสนอราคา
          Freight — แทนการแสดงเพียง “กำไรขั้นต้น”. ระบบเลือกแถวที่เปิดใช้งาน + วันที่มีผลล่าสุด
          ของแต่ละโหมดขนส่ง; ช่อง POL/POD/ผู้ขนส่ง เป็นข้อมูลอ้างอิง (ยังไม่ใช้จับคู่ราคารายเส้นทาง — จะเพิ่มภายหลัง).
        </p>
      </header>

      <FreightRatesClient rows={rows} canWrite={canWrite} loadFailed={loadFailed} />
    </main>
  );
}
