/**
 * /admin/api-forwarder-momo — landing for the MOMO carrier integration.
 *
 * Wave 17 P1-1 (2026-05-23) — port `pcs-admin/api-forwarder-momo.php` (the
 * carrier-dispatch page that switches on `?page=<sub>`). Per the Wave 16
 * audit, only `manualUpdate` is in scope for this wave (the form admin
 * actually uses daily); the other sub-pages (updateAPI, APICheckSM,
 * APICheckSMDetail, pageHome dashboard) are P2 and need API tokens +
 * retry/backoff design.
 *
 * Behaviour: this top-level route renders a small hub card with a primary
 * CTA → "อัปเดต MOMO ด้วยมือ" (the only sub-page wired in Wave 17). The
 * other 4 sub-pages are shown as "Coming soon · Phase C" buttons per the
 * design philosophy in AGENTS.md §0a (banner deferred features, don't
 * silently link).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { Truck, Wand2, Database, Search, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
];

export default async function AdminApiForwarderMomoPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">MOMO</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · ฝากนำเข้า · MOMO Integration
        </p>
        <h1 className="mt-1 text-2xl font-bold">แดชบอร์ด Cargo Center · MOMO</h1>
        <p className="mt-1.5 text-sm text-muted">
          เชื่อมข้อมูลรายการ MOMO เข้าระบบ PR — Wave 17 รองรับเฉพาะ &ldquo;อัปเดตด้วยมือ&rdquo;
        </p>
      </header>

      {/* Top menubar (MOMO ↔ CargoCenter) */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-momo" />

      {/* Wave 17 banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        <strong>ℹ️ Wave 17 · ขอบเขต:</strong>{" "}
        เฟสนี้พอร์ตเฉพาะ <strong>&ldquo;อัปเดตด้วยมือ (Manual Update)&rdquo;</strong>{" "}
        ซึ่งเป็นช่องที่แอดมินใช้ทุกวัน. ฟังก์ชั่นอัตโนมัติ (Dashboard · UpdateAPI ·
        APICheckSM · ประวัติ) ต้องใช้ token + retry/backoff design — เลื่อนไป Phase C
        (Wave 18+).
      </div>

      {/* Sub-page hub */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Live: Manual Update */}
        <Link
          href="/admin/api-forwarder-momo/manual"
          className="group rounded-2xl border-2 border-primary-300 bg-white p-5 shadow-sm hover:border-primary-500 hover:shadow-md transition"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-50 p-3 text-primary-600 group-hover:bg-primary-100">
              <Wand2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">อัปเดตด้วยมือ</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                กรอกข้อมูลรายการนำเข้า MOMO ทีละรายการ — ใช้เมื่อระบบ API ไม่ได้
                หรือมีรายการที่ต้องแก้ไขด้วยมือ. INSERT ลง <code className="rounded bg-surface-alt px-1">tb_forwarder</code> โดยตรง.
              </p>
              <span className="mt-3 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                ✓ พร้อมใช้ใน Wave 17
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
              <h3 className="text-base font-bold text-foreground">แดชบอร์ดสรุป (Home)</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                ภาพรวมรายการรอ-อัปเดต · ยอดส่งผ่าน API วันนี้ · กราฟ.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Phase C — เลื่อน
              </span>
            </div>
          </div>
        </div>

        {/* Live (added 2026-05-28 per ปอน brief): MOMO Status Sync.
            Isolated parallel path → writes to momo_* tables ONLY,
            NEVER touches the legacy spine cargo_* / tb_*. */}
        <Link
          href="/admin/api-forwarder-momo/sync"
          className="group rounded-2xl border-2 border-primary-300 bg-white p-5 shadow-sm hover:border-primary-500 hover:shadow-md transition"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-50 p-3 text-primary-600 group-hover:bg-primary-100">
              <Database className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ดึงสถานะ MOMO (Status Sync)</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                เรียก MOMO Cargo API → ดึง Import Track / Container Closed / Sack Info ตามช่วงวัน
                · normalize + upsert ลง <code className="rounded bg-surface-alt px-1">momo_*</code> tables (isolated).
                ไม่กระทบ <code className="rounded bg-surface-alt px-1">tb_*</code> เดิม.
              </p>
              <span className="mt-3 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                ✓ พร้อมใช้ (2026-05-28)
              </span>
            </div>
          </div>
        </Link>

        {/* Deferred: APICheckSM */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-5 opacity-75">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
              <Search className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ตรวจสอบข้อมูล SM</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                ตรวจ SM Code ในระบบปลายทาง vs ใน PR — ใช้ debug รายการที่ตกหล่น.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
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
