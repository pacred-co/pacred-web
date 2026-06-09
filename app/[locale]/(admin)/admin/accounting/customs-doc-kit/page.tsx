import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { DocKitClient } from "./doc-kit-client";

/**
 * W11 — /admin/accounting/customs-doc-kit
 *
 * The customs-brokerage document toolkit (DOC-GENERATION + advisory · NO money
 * / NO customs e-filing):
 *   - DO-release LOI per carrier (ZIM/RCL/COSCO/HEDE/FUJIT/UPS/CULINES/Sinokor)
 *     + ZIM Split-DO + the customs-letter kit (45-day waiver · POA · amend ·
 *     lost-doc) → stateless PDF generator.
 *   - Form-E / ACFTA eligibility (advisory).
 *   - HS-code AI-assist (suggestions; stub unless endpoint configured).
 *
 * 🔒 NETBAY e-filing is HARD-BLOCKED (no creds) — the banner makes this explicit;
 *    customs filing is manual + customs_control_no is keyed by hand on the ใบขน.
 *
 * RBAC: Docs-workflow roles. Wired into the freight-import-doc / freight-export-doc
 * / accounting sidebars (≤3 clicks · §0d).
 */

export const dynamic = "force-dynamic";

export default async function CustomsDocKitPage({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string }>;
}) {
  await requireAdmin([
    "super", "accounting", "freight_import_doc", "freight_export_doc", "pricing",
  ]);
  const sp = await searchParams;
  const initialShipmentId = typeof sp.shipment === "string" ? sp.shipment : "";

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">ชุดเอกสารพิธีการศุลกากร (Customs doc-kit)</h1>
        <p className="text-sm text-muted mt-1">
          ออกจดหมายสายเรือ/ศุลกากร · ตรวจสิทธิ Form E · ผู้ช่วยพิกัด HS —{" "}
          <span className="font-medium">เครื่องมือช่วย/ออกร่างเอกสารเท่านั้น (ไม่มีการเงิน/ยื่นใบขนอัตโนมัติ)</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <Link href="/admin/freight/declarations" className="text-primary-600 hover:underline">
            → ใบขนสินค้า (Freight declarations)
          </Link>
          <Link href="/admin/accounting/cargo-declarations" className="text-primary-600 hover:underline">
            → ใบขนรวม Cargo
          </Link>
          <Link href="/admin/freight/shipments" className="text-primary-600 hover:underline">
            → งาน Freight (shipments)
          </Link>
        </div>
      </div>

      <DocKitClient initialShipmentId={initialShipmentId} />
    </main>
  );
}
