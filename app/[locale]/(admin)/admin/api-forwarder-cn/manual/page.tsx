/**
 * /admin/api-forwarder-cn/manual — Wave 17 P1-2
 *
 * Server-side host for the CargoCenter manual-entry form. Renders the shared
 * <ApiForwarderManualForm carrier="cn" />. Mirrors the MOMO twin at
 * /admin/api-forwarder-momo/manual — only the carrier discriminator differs
 * (both routes feed the same INSERT shape because the legacy MOMO + CN pages
 * are byte-identical in their SQL logic).
 *
 * Legacy source: pcs-admin/api-forwarder-cn.php?page=manualUpdate +
 * include/pages/api-forwarder-cn/pageManualUpdate.php.
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

export default async function AdminApiForwarderCnManualPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-cn" className="hover:text-primary-600">CargoCenter</Link>
        <span>›</span>
        <span className="text-foreground font-medium">อัปเดตด้วยมือ</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · CargoCenter · อัปเดตด้วยมือ
        </p>
        <h1 className="mt-1 text-2xl font-bold">อัปเดต CargoCenter ด้วยมือ</h1>
        <p className="mt-1.5 text-sm text-muted">
          เพิ่มรายการนำเข้าเข้าระบบ <code className="rounded bg-surface-alt px-1">tb_forwarder</code>{" "}
          ทีละรายการ · prefix <code className="rounded bg-surface-alt px-1">CC&lt;productID&gt;</code>{" "}
          (fIDorCO) · fWarehouseName = <code className="rounded bg-surface-alt px-1">7</code> (Cargo Center)
        </p>
      </header>

      {/* Top menubar */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-cn" />

      {/* Legacy-fidelity banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Wave 17 · พอร์ตจาก legacy:</strong>{" "}
        ฟอร์มนี้ตรงกับ <code className="rounded bg-emerald-100 px-1">pcs-admin/api-forwarder-cn.php?page=manualUpdate</code>{" "}
        — ใช้ฟิลด์เดียวกัน + INSERT ลง <code className="rounded bg-emerald-100 px-1">tb_forwarder</code> ตาม
        SQL legacy เปะๆ. หมายเหตุ — MOMO และ CN ใช้ shape เดียวกัน (CC prefix · fWarehouseName=&apos;7&apos;)
        เพราะ legacy ทั้ง 2 ไฟล์ byte-identical ใน SQL.
      </div>

      {/* The shared form (carrier-parametrized) */}
      <ApiForwarderManualForm carrier="cn" carrierLabel="CargoCenter" />

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/api-forwarder-cn"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับหน้า CargoCenter
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
