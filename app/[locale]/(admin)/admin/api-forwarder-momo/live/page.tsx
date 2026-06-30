/**
 * /admin/api-forwarder-momo/live — "ดูข้อมูล MOMO (Live)".
 *
 * 2026-06-30. A read-only mirror of MOMO's OWN import list (momocargo.com,
 * logged in as the Pacred master account). MOMO's web sees EVERY parcel in
 * EVERY status WITH the customer member code — richer than the partner-token
 * `import/track` feed (which drops parcels once they advance). Staff use this
 * page to eyeball / cross-check what MOMO actually has, per status board.
 *
 * 🔓 PASSWORDLESS LOGIN BUTTON (2026-06-30 · ภูม). MOMO's web is single-session —
 * a login elsewhere kicks our cached token. So this page does NOT auto-fetch on
 * load; it renders a "เข้าสู่ระบบ MOMO" landing. Staff click the button (no
 * password field — creds are server-side in env) → the action logs in fresh +
 * returns the board. Re-login on demand handles a kicked session.
 *
 * 🔒 No cost/price/rate is ever fetched — the action normalises every parcel to
 * the SAFE `MomoLiveParcel` shape (operational fields only).
 *
 * Server-side: auth gate + read ?status only (no fetch). If MOMO isn't
 * configured → a friendly amber notice. Otherwise → the client in its
 * not-logged-in state. Never 500.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import {
  MOMO_LIVE_STATUSES,
  type MomoLiveStatus,
} from "@/lib/integrations/momo-web/types";
import { isMomoWebConfigured } from "@/lib/integrations/momo-web/client";
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
      ) : (
        <MomoLiveClient status={status} />
      )}
    </main>
  );
}
