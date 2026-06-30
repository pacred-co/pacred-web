/**
 * /admin/api-forwarder-momo/live — "ดูข้อมูล MOMO (Live)".
 *
 * 2026-06-30. A read-only mirror of MOMO's OWN import list (momocargo.com,
 * logged in as the Pacred master account). MOMO's web sees EVERY parcel in
 * EVERY status WITH the customer member code — richer than the partner-token
 * `import/track` feed (which drops parcels once they advance). Staff use this
 * page to eyeball / cross-check what MOMO actually has, per status board.
 *
 * 🔒 No cost/price/rate is ever fetched — `fetchMomoLiveList` normalises every
 * parcel to the SAFE `MomoLiveParcel` shape (operational fields only). Nothing
 * sensitive crosses the boundary, so this page just renders what it gets.
 *
 * Server-side: auth gate + ONE live fetch of the selected status board (default
 * "sending_thai"). If MOMO isn't configured → a friendly amber notice. If the
 * fetch throws (login/network) → a red notice. Never 500.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import {
  fetchMomoLiveList,
  isMomoWebConfigured,
  MOMO_LIVE_STATUSES,
  type MomoLiveParcel,
  type MomoLiveStatus,
} from "@/lib/integrations/momo-web/client";
import { MomoLiveClient } from "./live-client";

export const dynamic = "force-dynamic";

/** Coerce the ?status= param to a valid board, defaulting to sending_thai. */
function parseStatus(v: string | string[] | undefined): MomoLiveStatus {
  const s = Array.isArray(v) ? v[0] : v;
  return (MOMO_LIVE_STATUSES as readonly string[]).includes(s ?? "")
    ? (s as MomoLiveStatus)
    : "sending_thai";
}

export default async function AdminMomoLivePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const sp = (await searchParams) ?? {};
  const status = parseStatus(sp.status);

  const configured = isMomoWebConfigured();
  let parcels: MomoLiveParcel[] = [];
  let fetchError: string | null = null;

  if (configured) {
    try {
      parcels = await fetchMomoLiveList(status, 500);
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "ดึงข้อมูล MOMO ไม่สำเร็จ";
    }
  }

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <span>ฝากนำเข้า</span>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ดูข้อมูล MOMO (Live)</span>
      </nav>

      <PageHeader
        eyebrow="ADMIN · MOMO · Live"
        title="ดูข้อมูล MOMO (Live)"
        subtitle="กระจกข้อมูลรายการนำเข้าจากเว็บ MOMO โดยตรง (อ่านอย่างเดียว · ใช้เทียบ/เช็ค)"
      />

      {/* MOMO not configured → friendly amber notice (NOT a crash) */}
      {!configured ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">ยังไม่ได้ตั้งค่า MOMO_WEB_USER / MOMO_WEB_PASS ใน env</p>
          <p className="mt-1 text-[12px] leading-relaxed">
            หน้านี้ต้องใช้บัญชีหลัก (master account) ของ MOMO เพื่อดึงข้อมูล —
            ตั้งค่า <code className="rounded bg-white/70 px-1">MOMO_WEB_USER</code> และ{" "}
            <code className="rounded bg-white/70 px-1">MOMO_WEB_PASS</code> ใน{" "}
            <code className="rounded bg-white/70 px-1">.env.local</code> (และบน Vercel ตอน prod) ก่อน
          </p>
        </div>
      ) : fetchError ? (
        // Fetch failed (login/network) → red notice with the message (NOT a 500)
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">ดึงข้อมูลจาก MOMO ไม่สำเร็จ</p>
          <p className="mt-1 text-[12px] font-mono break-words">{fetchError}</p>
          <p className="mt-2 text-[12px] text-red-800">
            ลองรีเฟรชอีกครั้ง — ถ้ายังไม่ได้ ให้เช็ก user/pass ของ MOMO หรือ MOMO อาจเปลี่ยนวิธี login
          </p>
        </div>
      ) : (
        <MomoLiveClient parcels={parcels} status={status} />
      )}
    </main>
  );
}
