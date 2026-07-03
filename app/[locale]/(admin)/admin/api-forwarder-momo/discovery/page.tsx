/**
 * /admin/api-forwarder-momo/discovery — "คิวค้นเจอจาก MOMO Live" (owner/ภูม 2026-07-03).
 *
 * THE GAP THIS CLOSES: MOMO's partner API (the Review & Commit feed) DROPS a parcel once
 * it advances past "ออกจากโกดังจีน", so a ฝากสั่งซื้อ shop tracking MOMO Live shows
 * "กำลังส่งมาไทย" (with a container) never gets a tb_forwarder row → the shop badge stays
 * stuck at "รอเข้าโกดังจีน", invisible to BOTH the Review queue AND the แต้ม "ตกหล่น" page.
 * Verified prod 2026-07-03: YT2590231382196 (PR043 · P22328 · ตู้ GZS260628-2) had 0 rows;
 * 10 of 16 shop trackings in P22328 alone were missing.
 *
 * This page scrapes the MOMO Live board, diffs against tb_forwarder, and surfaces the
 * dropped-but-advancing parcels with a one-click "สร้าง (commit)" that reuses the exact
 * commit path — so the forwarder is created (real cabinet + weight) and the 0235 trigger
 * unsticks the shop. Money-safe: metrics are server-scraped, never a duplicate row.
 *
 * 🔓 Like /live, MOMO's web is single-session → the page does NOT auto-scrape; it renders
 * a "ค้นหาจาก MOMO Live" landing and the client fetches on click. Never 500.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { isMomoWebConfigured } from "@/lib/integrations/momo-web/client";
import { MomoDiscoveryClient } from "./discovery-client";

export const dynamic = "force-dynamic";

export default async function AdminMomoDiscoveryPage() {
  await requireAdmin(["super", "ops", "warehouse"]);
  const configured = isMomoWebConfigured();

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <span>ฝากนำเข้า</span>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">คิวค้นเจอจาก MOMO Live</span>
      </nav>

      <PageHeader
        eyebrow="ADMIN · MOMO · DISCOVERY"
        title="คิวค้นเจอจาก MOMO Live"
        subtitle="เทียบ MOMO Live ทุกสถานะ กับระบบ → แทรคที่ MOMO มี (ถึงโกดัง/กำลังส่งมาไทย/รอชำระ/ส่งแล้ว ฯลฯ) แต่ยังไม่มีในระบบ → กดสร้างเข้าระบบได้ถูกต้อง (ฝากสั่งซื้อหายค้างเอง)"
      />

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-[12px] leading-relaxed text-sky-900">
        <p className="font-semibold">ทำไมต้องมีหน้านี้</p>
        <p className="mt-1">
          MOMO API (ตัวที่ป้อนคิว &quot;Review &amp; Commit&quot;) <b>ทิ้งพัสดุ</b>ทันทีที่มันเลย
          &quot;ออกจากโกดังจีน&quot; → แทรคที่ Live โชว์ <b>กำลังส่งมาไทย + มีเลขตู้</b> เลยหายจากคิว
          ทำให้ <b>ฝากสั่งซื้อค้างสถานะ &quot;รอเข้าโกดังจีน&quot;</b> ทั้งที่ของกำลังมาไทยแล้ว หน้านี้
          <b>เทียบ Live กับระบบ</b> แล้วเอาที่ตกหล่นกลับเข้าระบบให้ถูกต้อง (money-safe · ไม่สร้างซ้ำ)
        </p>
      </div>

      {!configured ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">ยังไม่ได้ตั้งค่า MOMO_WEB_USER / MOMO_WEB_PASS ใน env</p>
          <p className="mt-1 text-[12px] leading-relaxed">
            หน้านี้ต้องใช้บัญชีหลัก (master account) ของ MOMO เพื่อดึงข้อมูล — ตั้งค่า{" "}
            <code className="rounded bg-white/70 px-1">MOMO_WEB_USER</code> และ{" "}
            <code className="rounded bg-white/70 px-1">MOMO_WEB_PASS</code> ใน{" "}
            <code className="rounded bg-white/70 px-1">.env.local</code> (และบน Vercel ตอน prod) ก่อน
          </p>
        </div>
      ) : (
        <MomoDiscoveryClient />
      )}
    </main>
  );
}
