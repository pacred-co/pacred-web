/**
 * /admin/api-sheets-sang — manual forwarder entry through the แสง (Sang) warehouse.
 *
 * Wave 17 P1-4 — faithful port of legacy `pcs-admin/api-sheets-sang-2023.php`
 * (1265 LOC). Always sets `fWarehouseName=1` (Sang) on INSERT. Note: the
 * PCSE = max(50, fVolume*120) pricing rule is NOT Sang-specific (the task
 * description was misleading) — all 4 carrier files share the same rule;
 * see lib/carrier/registry.ts `computeTransportPrice`.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

import { CarrierManualForm } from "@/components/admin/carrier-manual-form";
import { PageHeader } from "@/components/admin/page-header";
import { CARRIER_REGISTRY } from "@/lib/carrier/registry";
import {
  loadCarrierManualPageData,
  type CarrierManualSearchParams,
} from "@/lib/admin/carrier-manual-page-data";

export const dynamic = "force-dynamic";

export default async function ApiSheetsSangPage({
  searchParams,
}: {
  searchParams: Promise<CarrierManualSearchParams>;
}) {
  await requireAdmin(["ops", "warehouse", "super"]);
  const sp = await searchParams;
  const data = await loadCarrierManualPageData(sp);
  const carrier = CARRIER_REGISTRY.sang;

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มรายการ — {carrier.label}</span>
      </nav>

      {/* §0h — one consistent page-title hierarchy via <PageHeader>. */}
      <PageHeader
        eyebrow={`ADMIN · อัปเดตฝากนำเข้า · ${carrier.label}`}
        title={`เพิ่มรายการ — ${carrier.label}`}
        subtitle={carrier.description}
      />

      <CarrierManualForm
        carrier={carrier}
        coidList={data.coidList}
        freeShipping={data.freeShipping}
        presetUser={data.presetUser}
        presetCoid={data.presetCoid}
        presetAddresses={data.presetAddresses}
      />

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
      </div>
    </main>
  );
}
