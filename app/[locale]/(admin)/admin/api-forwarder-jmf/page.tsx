/**
 * /admin/api-forwarder-jmf — landing for the JMF carrier integration.
 *
 * Wave 6 (2026-06-14 · carrier-fidelity) — port `pcs-admin/api-forwarder-jmf.php`.
 *
 * Legacy source (file:line cited in the W6 report):
 *   - api-forwarder-jmf.php — `switch($_GET['page'])` dispatcher with sub-pages
 *     home / view / invoie / history / manual.
 *   - include/pages/api-forwarder-jmf/home.php — JMF company card +
 *     4 dashboard counters (all hardcoded 0 in legacy).
 *   - include/pages/api-forwarder-jmf/history.php:41 — the Auto-API history
 *     table reads `SELECT * FROM tb_forwarder_jmf_tmp` (APIStatus/APIResult).
 *
 * Pacred scope (READ-ONLY · §0e LIVE tb_forwarder_jmf_tmp):
 *   - This hub card + the history viewer (/history).
 *   - NO live API pull — the JMF Auto-API creds are owner-gated. The legacy
 *     "manual" / "updateAPI" write paths are deferred (banner).
 *
 * Mirrors /admin/api-forwarder-cn/page.tsx + /admin/api-forwarder-momo/page.tsx.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { Truck, History, Database, Search, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
  { label: "JMF", href: "/admin/api-forwarder-jmf" },
  { label: "TTP", href: "/admin/api-forwarder-ttp" },
  { label: "GOGO", href: "/admin/api-forwarder-gogo" },
];

export default async function AdminApiForwarderJmfPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">JMF</span>
      </nav>

      {/* Top menubar */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-jmf" />

      {/* §0h — one consistent page-title hierarchy via <PageHeader>. */}
      <PageHeader
        eyebrow="ADMIN · ฝากนำเข้า · JMF Integration"
        title="แดชบอร์ดข้อมูลจาก JMF"
        subtitle="บริษัท เจเอ็มเอฟ คาร์โก้ อิมพอร์ต เซอร์วิส จำกัด · เลขผู้เสียภาษี 0735563005872"
      />

      {/* Scope banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        <strong>ℹ️ ขอบเขต (Wave 6 · อ่านอย่างเดียว):</strong>{" "}
        เฟสนี้พอร์ตเฉพาะ <strong>&ldquo;ดูประวัติ Auto-API&rdquo;</strong> (อ่านจาก{" "}
        <code className="rounded bg-white/60 px-1">tb_forwarder_jmf_tmp</code>).
        การดึงข้อมูลสด (Live API) จาก JMF ยังไม่เปิด — <strong>รอ credentials จากเจ้าของ</strong>.
        ส่วนใบแจ้งหนี้ / อัปเดตด้วยมือ เลื่อนไป Phase C.
      </div>

      {/* Sub-page hub */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Live: Auto-API history */}
        <Link
          href="/admin/api-forwarder-jmf/history"
          className="group rounded-2xl border-2 border-primary-300 bg-white p-5 shadow-sm hover:border-primary-500 hover:shadow-md transition"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-50 p-3 text-primary-600 group-hover:bg-primary-100">
              <History className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ประวัติ Auto-API (JMF)</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                รายการที่ JMF ส่งเข้าระบบ พร้อมสถานะ API (ถึงโกดังจีน / ส่งมาไทย / สร้างใหม่). อ่านจาก{" "}
                <code className="rounded bg-surface-alt px-1">tb_forwarder_jmf_tmp</code>.
              </p>
              <span className="mt-3 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                ✓ พร้อมใช้ (อ่านอย่างเดียว)
              </span>
            </div>
          </div>
        </Link>

        {/* Deferred: Dashboard */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-5 opacity-75">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">แดชบอร์ดสรุป</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                ยอดค้างชำระ · รอเข้าโกดังจีน · กำลังส่งมาไทย · เข้าโกดัง PR แล้ว.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Phase C — เลื่อน
              </span>
            </div>
          </div>
        </div>

        {/* Deferred: Live API pull */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-5 opacity-75">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
              <Database className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ดึงข้อมูลสดจาก JMF</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                เรียก JMF Auto-API ดึงรายการใหม่. <strong>ต้องการ credentials</strong> + retry design.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                รอ creds จากเจ้าของ
              </span>
            </div>
          </div>
        </div>

        {/* Deferred: Invoice */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-5 opacity-75">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
              <Search className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ใบแจ้งหนี้ JMF</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                รายการใบแจ้งหนี้ JMF (รอชำระ / สำเร็จ / ไม่สำเร็จ). เลื่อนไป Phase C.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Phase C — เลื่อน
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer hint */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <Truck className="inline h-3 w-3 mr-1" />
          ดูรายการฝากนำเข้าทั้งหมด
        </Link>
      </div>
    </main>
  );
}
