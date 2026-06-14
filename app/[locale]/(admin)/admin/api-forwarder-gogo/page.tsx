/**
 * /admin/api-forwarder-gogo — GOGO carrier (DECOMMISSIONED).
 *
 * Wave 6 (2026-06-14). The legacy `pcs-admin/api-forwarder-gogo.php` (68 KB)
 * was a Google-Sheet importer for the GOGO consolidator. The owner confirmed
 * GOGO is no longer used: "ไม่ได้ใช้ละ ใช้ momo" — so we do NOT port the
 * importer. This route is a simple retire banner that points staff to MOMO.
 *
 * Mirrors the carrier-page shell so the menubar stays consistent.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { Ban, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
  { label: "JMF", href: "/admin/api-forwarder-jmf" },
  { label: "TTP", href: "/admin/api-forwarder-ttp" },
  { label: "GOGO", href: "/admin/api-forwarder-gogo" },
];

export default async function AdminApiForwarderGogoPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">GOGO</span>
      </nav>

      {/* Top menubar */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-gogo" />

      {/* Retire banner */}
      <section className="rounded-2xl border border-gray-300 bg-surface-alt/30 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Ban className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-foreground">GOGO ยกเลิกการใช้งานแล้ว</h1>
        <p className="mt-2 text-sm text-muted">
          ระบบ GOGO (นำเข้าผ่าน Google Sheet) ไม่ได้ใช้แล้ว — ใช้ <strong>MOMO</strong> แทน.
        </p>
        <Link
          href="/admin/api-forwarder-momo"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          ไปที่ MOMO
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
