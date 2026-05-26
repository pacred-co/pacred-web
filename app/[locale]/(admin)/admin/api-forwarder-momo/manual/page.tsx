/**
 * /admin/api-forwarder-momo/manual — Wave 17 P1-1
 *
 * Server-side host for the MOMO manual-entry form. Renders the shared
 * <ApiForwarderManualForm carrier="momo" />. See:
 *   - components/admin/api-forwarder-manual-form.tsx (the shared client form)
 *   - actions/admin/api-forwarder-manual.ts (the carrier-parametrized action)
 *
 * Legacy source: pcs-admin/api-forwarder-momo.php?page=manualUpdate +
 * include/pages/api-forwarder-momo/pageManualUpdate.php (~620 LOC table form).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { ApiForwarderManualForm } from "@/components/admin/api-forwarder-manual-form";

export const dynamic = "force-dynamic";

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
];

export default async function AdminApiForwarderMomoManualPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">อัปเดตด้วยมือ</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · MOMO · อัปเดตด้วยมือ
        </p>
        <h1 className="mt-1 text-2xl font-bold">อัปเดต MOMO ด้วยมือ</h1>
        <p className="mt-1.5 text-sm text-muted">
          เพิ่มรายการนำเข้าเข้าระบบ <code className="rounded bg-surface-alt px-1">tb_forwarder</code>{" "}
          ทีละรายการ · prefix <code className="rounded bg-surface-alt px-1">CC&lt;productID&gt;</code>{" "}
          (fIDorCO) · fWarehouseName = <code className="rounded bg-surface-alt px-1">7</code> (Cargo Center)
        </p>
      </header>

      {/* Top menubar */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-momo" />

      {/* Legacy-fidelity banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Wave 17 · พอร์ตจาก legacy:</strong>{" "}
        ฟอร์มนี้ตรงกับ <code className="rounded bg-emerald-100 px-1">pcs-admin/api-forwarder-momo.php?page=manualUpdate</code>{" "}
        — ใช้ฟิลด์เดียวกัน (productID · sm_code · tracking · userID · จำนวน · ขนส่ง · ที่อยู่ · วันที่)
        และ INSERT ลง <code className="rounded bg-emerald-100 px-1">tb_forwarder</code> ตาม
        SQL legacy เปะๆ. เปลี่ยนจาก table-multi-row → single-entry form ตาม UX Pacred.
      </div>

      {/* The shared form (carrier-parametrized) */}
      <ApiForwarderManualForm carrier="momo" carrierLabel="MOMO" />

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/api-forwarder-momo"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับหน้า MOMO
        </Link>
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ดูรายการฝากนำเข้าทั้งหมด
        </Link>
      </div>
    </main>
  );
}
