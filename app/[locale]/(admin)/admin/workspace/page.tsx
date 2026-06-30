/**
 * /admin/workspace — "พื้นที่งานของฉัน (My Workspace)" · G1 closes the per-position
 * workspace-LANDING gap (owner W3 "role and workspaces ต้องเริ่มทำได้แล้ว · เริ่ม scale").
 *
 * The role MODEL is built (3-axis money-tier × department × position→workspace_role ·
 * migs 0220/0221) and SCOPES the sidebar menu — but every position still LANDS on the
 * generic /admin dashboard. This page is the focused "here is YOUR work right now":
 * it resolves the logged-in staffer's POSITION (getStafferPositionInfo →
 * workspace_role) + role set, then renders ONLY their queues as cards
 * (count + ⚠️ urgency + ≤1-click to act) plus a "today" total.
 *
 * READ-ONLY. The counts come from the EXACT same SOT the sidebar badges use
 * (getSidebarCounts → BadgeCounts) so the card count == the sidebar badge == the
 * dashboard tab, by construction (§0f "exact · อย่ามั่ว"). Each card deep-links to an
 * already-built filtered list — no new mutation, no new query. ADDITIVE: a new landing
 * surface; no change to the RBAC enum / gates / migrations.
 *
 * Design refs: docs/research/platform-analysis-2026-06-30/roles.md §4 (G1) + §5 Step 2.
 * §0g (self-explaining row: คืออะไร/จำนวน/ทำอะไรต่อ/≤1-click) + §0h (readable hierarchy).
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSidebarCounts } from "@/actions/admin/sidebar-counts";
import { getStafferPositionInfo } from "@/lib/admin/positions";
import { departmentLabel } from "@/lib/admin/departments";
import { isGodRole } from "@/lib/admin/god-role";
import { resolveWorkspace, queueCount, workspaceTotal, type WorkspaceQueue } from "@/lib/admin/workspace";
import { PageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";
import {
  ShoppingCart, Wallet, PackageCheck, MessageSquare, ScanLine, Banknote,
  AlertCircle, Truck, Languages, BadgePercent, ClipboardCheck, Users, Inbox,
  Undo2, AlertTriangle, LayoutDashboard, ArrowRight, CheckCircle2, type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

// icon-name (string on WorkspaceQueue) → lucide component. Mirrors the sidebar's ICONS map.
const ICONS: Record<string, LucideIcon> = {
  ShoppingCart, Wallet, PackageCheck, MessageSquare, ScanLine, Banknote,
  AlertCircle, Truck, Languages, BadgePercent, ClipboardCheck, Users, Inbox,
  Undo2, AlertTriangle, LayoutDashboard,
};

export default async function AdminWorkspacePage() {
  // Any active admin reaches their own workspace (the landing is per-person, the
  // deep-link targets each gate RBAC themselves). The (admin) layout already proved
  // admin + verified the ticket.
  const { user, roles } = await requireAdmin();

  // The staffer's POSITION (workspace_role scopes the queues) + department/name for
  // the header. Parallel with the badge counts (the SAME SOT the sidebar uses).
  const [counts, posInfo] = await Promise.all([
    getSidebarCounts(),
    getStafferPositionInfo(user.id),
  ]);

  const ws = resolveWorkspace(roles, posInfo.workspaceRole);
  const total = workspaceTotal(counts, ws);
  const deptName = posInfo.department ? departmentLabel(posInfo.department) : null;
  const positionLine = [deptName, posInfo.positionName].filter(Boolean).join(" / ");
  const god = isGodRole(roles);

  // Cards with work float to the top (urgency first · §0g); empty queues sink but stay
  // visible (so the staffer knows the full scope of their seat).
  const queuesSorted = [...ws.queues].sort(
    (a, b) => queueCount(counts, b) - queueCount(counts, a),
  );
  const hasWork = total > 0;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <PageHeader
        eyebrow="MY WORKSPACE"
        title={ws.headingTh}
        subtitle={
          positionLine
            ? `ตำแหน่ง: ${positionLine} — คิวงานที่คุณรับผิดชอบวันนี้`
            : god
              ? "ยังไม่ได้กำหนดตำแหน่ง — แสดงภาพรวมงานทั้งระบบ (กำหนดตำแหน่งที่ HR เพื่อโฟกัสคิวของคุณ)"
              : "คิวงานที่คุณรับผิดชอบวันนี้"
        }
        badges={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
              hasWork
                ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200"
                : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
            }`}
          >
            {hasWork ? (
              <>🔔 งานรอ {total.toLocaleString("th-TH")} รายการ</>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> เคลียร์งานหมดแล้ว
              </>
            )}
          </span>
        }
        actions={
          ws.isOversight ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-alt/50 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" /> แดชบอร์ดภาพรวม
            </Link>
          ) : null
        }
      />

      {/* Queue cards — one per queue the position owns. Sorted urgency-first. */}
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {queuesSorted.map((q) => (
          <QueueCard key={q.key} q={q} count={queueCount(counts, q)} />
        ))}
      </section>

      {/* Empty-state hint (only when NOTHING waits across all queues). */}
      {!hasWork ? (
        <p className="text-center text-sm text-muted py-2">
          ไม่มีงานค้างในคิวของคุณตอนนี้ — เยี่ยมมาก 🎉
        </p>
      ) : null}
    </main>
  );
}

// ── Queue card — self-explaining (§0g): label · count · next-action · ≤1-click ────────
function QueueCard({ q, count }: { q: WorkspaceQueue; count: number }) {
  const Icon = ICONS[q.icon] ?? Inbox;
  const urgent = count > 0;
  return (
    <Link
      href={q.href}
      className={`group block rounded-2xl border bg-white dark:bg-surface shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden ${
        urgent ? "border-rose-200" : "border-border"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* count — the big load-bearing number (hierarchy · §0h) */}
            <p
              className={`font-bold leading-none font-mono text-3xl ${
                urgent ? "text-rose-600" : "text-muted"
              }`}
            >
              {count > 999 ? "999+" : count.toLocaleString("th-TH")}
            </p>
            {/* label — "what is in MY stage" */}
            <p className="mt-2 text-sm font-semibold text-foreground line-clamp-2">{q.label}</p>
            {/* next-action — "ให้พนักงานทำอะไรต่อ" */}
            <p
              className={`mt-1 text-xs font-semibold ${
                urgent ? "text-rose-600" : "text-muted"
              }`}
            >
              🔔 {q.nextAction}
            </p>
          </div>
          <div
            className={`shrink-0 w-9 h-9 [&>svg]:w-9 [&>svg]:h-9 opacity-80 ${
              urgent ? "text-rose-500" : "text-muted"
            }`}
          >
            <Icon />
          </div>
        </div>
        {/* ≤1-click CTA */}
        <div className="mt-3 flex items-center gap-1 text-xs font-bold text-primary-600 group-hover:gap-2 transition-all">
          เปิดคิวนี้ <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className={`h-1.5 w-full ${urgent ? "bg-gradient-to-r from-rose-400 to-rose-600" : "bg-surface-alt"}`} />
    </Link>
  );
}
