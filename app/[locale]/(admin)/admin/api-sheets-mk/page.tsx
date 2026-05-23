/**
 * /admin/api-sheets-mk — manual forwarder entry through the MK warehouse.
 *
 * Wave 17 P1-5 — faithful port of legacy `pcs-admin/api-sheets-mk.php`
 * (1315 LOC). Always sets `fWarehouseName=3` (MK) on INSERT.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

import { CarrierManualForm } from "@/components/admin/carrier-manual-form";
import { CARRIER_REGISTRY } from "@/lib/carrier/registry";
import {
  loadCarrierManualPageData,
  type CarrierManualSearchParams,
} from "@/lib/admin/carrier-manual-page-data";

export const dynamic = "force-dynamic";

export default async function ApiSheetsMkPage({
  searchParams,
}: {
  searchParams: Promise<CarrierManualSearchParams>;
}) {
  await requireAdmin(["ops", "warehouse", "super"]);
  const sp = await searchParams;
  const data = await loadCarrierManualPageData(sp);
  const carrier = CARRIER_REGISTRY.mk;

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มรายการ — {carrier.label}</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · อัปเดตฝากนำเข้า · {carrier.label}
        </p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการ — {carrier.label}</h1>
        <p className="mt-1.5 text-sm text-muted">{carrier.description}</p>
      </header>

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
