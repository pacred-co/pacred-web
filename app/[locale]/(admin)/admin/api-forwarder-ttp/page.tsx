/**
 * /admin/api-forwarder-ttp — landing for the TTP carrier integration (READ-ONLY).
 *
 * Wave 6 (2026-06-14). Faithful port of `pcs-admin/api-forwarder-ttp.php`.
 *
 * Legacy source (file:line in the W6 report):
 *   - api-forwarder-ttp.php — dispatcher: default → pageDataTable, ?page=dataTable&sm= → pageDetail.
 *   - include/pages/api-forwarder-ttp/pageDataTable.php — DataTable that AJAX-loads
 *     processTable/processTable.php; columns SM Code / SM Date / Container Name /
 *     Box Total / Box Weight / Box CBM / ETD / ETA / Status / Status Date.
 *   - include/pages/api-forwarder-ttp/processTable/processTable.php:11 — TTP is a
 *     PURE LIVE PULL: it curls `https://cargothai.tech/api/service/GetContainer?_token=…`
 *     and echoes the JSON straight to the grid. There is NO local DB table — TTP
 *     never persisted anything.
 *
 * Because TTP has NO migrated `tb_*` table (it was always a live API proxy) and
 * the live cargothai.tech token is owner-gated, this page is a documented banner:
 * it explains the data shape + that the live pull is pending creds — instead of
 * querying a table that does not exist (§0e — don't read a non-existent twin).
 *
 * Mirrors /admin/api-forwarder-cn/page.tsx.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { Truck, Database, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
  { label: "JMF", href: "/admin/api-forwarder-jmf" },
  { label: "TTP", href: "/admin/api-forwarder-ttp" },
  { label: "GOGO", href: "/admin/api-forwarder-gogo" },
];

// The 11 SM columns the legacy TTP grid renders (pageDataTable.php:28-39).
const SM_COLUMNS = [
  "ID",
  "SM Code",
  "SM Date",
  "Container Name",
  "Box Total",
  "Box Weight",
  "Box CBM",
  "ETD",
  "ETA",
  "Status",
  "Status Date",
];

export default async function AdminApiForwarderTtpPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">TTP</span>
      </nav>

      {/* Top menubar */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-ttp" />

      {/* §0h — one consistent page-title hierarchy via <PageHeader>. */}
      <PageHeader
        eyebrow="ADMIN · ฝากนำเข้า · TTP Integration"
        title="แดชบอร์ดข้อมูลจาก TTP"
        subtitle="ข้อมูล SM (ตู้สินค้า) จากโกดังจีน — ดึงสดผ่าน cargothai.tech"
      />

      {/* Table-not-migrated banner — TTP has no local tb_* table (live proxy only) */}
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 leading-relaxed space-y-2">
        <p className="flex items-center gap-2 font-bold">
          <Database className="h-4 w-4" />
          ตาราง TTP ยังไม่ถูก migrate — ดูที่ระบบเดิมชั่วคราว
        </p>
        <p className="text-xs">
          TTP ในระบบเดิมเป็น <strong>การดึงสดผ่าน API</strong> (proxy) ไปยัง{" "}
          <code className="rounded bg-white/60 px-1">cargothai.tech/api/service/GetContainer</code>{" "}
          — <strong>ไม่มีการบันทึกลงฐานข้อมูลในระบบ PR</strong> จึงไม่มีตาราง{" "}
          <code className="rounded bg-white/60 px-1">tb_*</code> ให้อ่าน. การเปิดดูสดต้องใช้{" "}
          <strong>token จากเจ้าของ</strong> (owner-gated).
        </p>
      </div>

      {/* Live-pull pending creds banner */}
      <div className="rounded-2xl border border-border bg-surface-alt/30 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground">ดึงข้อมูล SM สดจาก TTP</h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              เรียก <code className="rounded bg-surface-alt px-1">cargothai.tech</code> ดึงรายการตู้ (SM) สด.
              ต้องการ <strong>credentials/token จากเจ้าของ</strong> + retry/backoff design ก่อนเปิดใช้.
            </p>
            <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              รอ creds จากเจ้าของ
            </span>
          </div>
        </div>
      </div>

      {/* Reference: the SM data shape the live grid renders */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <header className="border-b border-gray-200 bg-surface-alt/40 px-4 py-2.5">
          <h2 className="text-sm font-bold">โครงสร้างข้อมูล SM (อ้างอิงจากระบบเดิม)</h2>
        </header>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                {SM_COLUMNS.map((c) => (
                  <th key={c} className="text-left px-3 py-2 border-b whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={SM_COLUMNS.length} className="px-3 py-6 text-center text-muted">
                  — รอเปิด live pull (ต้องการ token) —
                </td>
              </tr>
            </tbody>
          </table>
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
