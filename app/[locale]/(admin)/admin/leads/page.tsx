import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getLeadQueue, getLeadStats, exportLeadsAll } from "@/actions/admin/leads";
import { getTagsBulk } from "@/actions/admin/customer-tags";
import {
  LEAD_CALL_STATUSES,
  type LeadCallStatus,
  type LeadSegment,
} from "@/actions/admin/leads-types";
import { TagChips } from "@/components/admin/tag-chips";
import { CallStatusBadge, LeadCallAction } from "./lead-call-action";
import { LeadKanban } from "./lead-kanban";

// Reads PII (customer phones) via createAdminClient (RLS-bypass) on every
// request — must be dynamic + cannot be statically rendered.
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────
// /admin/leads — the acquisition call-queue (CEO opening-day directive §6).
// Sales+CS work this list top-down to phone customers and close: the 6,936
// never-activated cold leads (tb_users.userActive='') + the big-PCS owners
// (top tb_forwarder order owners). Each row logs its call-outcome to the new
// lead_call_log table (migration 0133).
// Spec: docs/research/ceo-directives-2026-06-01.md §6/§7.1.
// ──────────────────────────────────────────────────────────────────────

const LEADS_MENUBAR: MenubarItem[] = [
  { label: "ลูกค้าที่ต้องโทรตาม (Cold)", href: "/admin/leads?segment=cold" },
  { label: "ลูกค้า PCS รายใหญ่", href: "/admin/leads?segment=big-pcs" },
  { label: "นัดโทรกลับ (ถึงคิว)", href: "/admin/leads?segment=callback" },
  { label: "ทั้งหมด", href: "/admin/leads?segment=all" },
  {
    label: "กรองตามสถานะ",
    children: [
      { label: "ยังไม่ติดต่อ", href: "/admin/leads?status=all" },
      { label: "ติดต่อแล้ว", href: "/admin/leads?status=called" },
      { label: "ไม่รับสาย", href: "/admin/leads?status=no_answer" },
      { label: "นัดโทรกลับ", href: "/admin/leads?status=callback" },
      { label: "ปิดการขาย", href: "/admin/leads?status=closed" },
      { label: "ไม่สนใจ", href: "/admin/leads?status=not_interested" },
    ],
  },
];

const SEGMENTS: { key: LeadSegment; label: string; hint: string }[] = [
  { key: "cold", label: "ลูกค้าที่ต้องโทรตาม", hint: "ยังไม่เคยติดต่อ (มีเบอร์โทร)" },
  { key: "big-pcs", label: "PCS รายใหญ่", hint: "ลูกค้าที่สั่งนำเข้าบ่อยที่สุด" },
  { key: "callback", label: "นัดโทรกลับ", hint: "ถึงคิวโทรกลับ · ค้างนานสุดก่อน" },
  { key: "all", label: "ทั้งหมด", hint: "ทุกลูกค้าที่มีเบอร์โทร" },
];

function fmtDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "2-digit", month: "short", day: "numeric" });
}

function isStatusFilter(v: unknown): v is LeadCallStatus {
  return typeof v === "string" && (LEAD_CALL_STATUSES as readonly string[]).includes(v);
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; status?: string; q?: string; page?: string; view?: string }>;
}) {
  // The staff who actually call: super + sales + CS/ops.
  await requireAdmin(["super", "sales_admin", "sales", "ops"]);

  const sp = await searchParams;
  const segment: LeadSegment =
    sp.segment === "big-pcs" || sp.segment === "all" || sp.segment === "callback"
      ? sp.segment
      : "cold";
  const statusFilter: LeadCallStatus | "all" = isStatusFilter(sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  // CRM depth (2026-06-08) — list (default) vs pipeline-kanban view.
  const view: "list" | "board" = sp.view === "board" ? "board" : "list";

  const [statsRes, queueRes] = await Promise.all([
    getLeadStats(),
    getLeadQueue({ segment, status: statusFilter, q, page }),
  ]);

  const stats = statsRes.ok ? statsRes.data : undefined;
  const rows = queueRes.ok ? (queueRes.data?.rows ?? []) : [];
  const hasMore = queueRes.ok ? Boolean(queueRes.data?.hasMore) : false;
  const queueErr = queueRes.ok ? null : queueRes.error;

  // Bulk-load tags for the visible rows (one query) → chips in both views.
  const tagsRes = await getTagsBulk(rows.map((r) => r.userid));
  const tagsByUser = tagsRes.ok ? (tagsRes.data ?? {}) : {};

  // Preserve filters across the search form + pagination links.
  const carry = (over: Record<string, string | number>) => {
    const params = new URLSearchParams();
    params.set("segment", segment);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (q) params.set("q", q);
    if (view !== "list") params.set("view", view);
    for (const [k, v] of Object.entries(over)) params.set(k, String(v));
    return `/admin/leads?${params.toString()}`;
  };

  return (
    <>
      <PageTopMenubar items={LEADS_MENUBAR} activeHref={`/admin/leads?segment=${segment}`} />
      <main className="p-4 sm:p-6 lg:p-8 space-y-5">
        {/* Header */}
        <PageHeader
          eyebrow="ADMIN · ACQUISITION"
          title="โทรตามลูกค้า (Leads)"
          subtitle="โทรหาลูกค้าจากบนลงล่างเพื่อปิดการขาย — ลูกค้าเก่าที่ยังไม่เคยติดต่อ + ลูกค้า PCS รายใหญ่"
        />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4">
            <p className="text-xs text-muted">ลูกค้าที่ต้องโทรตาม (Cold)</p>
            <p className="mt-1 text-2xl font-bold text-primary-600">
              {stats ? stats.cold.toLocaleString("th-TH") : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">ยังไม่เคยติดต่อ · มีเบอร์โทร</p>
          </div>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4">
            <p className="text-xs text-muted">ติดต่อแล้ววันนี้</p>
            <p className="mt-1 text-2xl font-bold">
              {stats ? stats.calledToday.toLocaleString("th-TH") : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">บันทึกผลโทรวันนี้</p>
          </div>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4">
            <p className="text-xs text-muted">ปิดการขายแล้ว</p>
            <p className="mt-1 text-2xl font-bold text-green-700">
              {stats ? stats.closed.toLocaleString("th-TH") : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">ลูกค้าที่ปิดได้</p>
          </div>
        </div>

        {/* Segment tabs + list/board view toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {SEGMENTS.map((s) => {
            const active = s.key === segment;
            return (
              <Link
                key={s.key}
                href={carry({ segment: s.key, page: 1 })}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-primary-300 bg-primary-50 text-primary-700"
                    : "border-border bg-white dark:bg-surface hover:bg-surface-alt"
                }`}
              >
                {s.label}
                <span className="ml-1 hidden sm:inline text-[11px] font-normal text-muted">· {s.hint}</span>
              </Link>
            );
          })}
          {/* View mode toggle (CRM depth · 2026-06-08) */}
          <div className="ml-auto inline-flex rounded-xl border border-border overflow-hidden">
            <Link
              href={carry({ view: "list", page: 1 })}
              className={`px-3 py-2 text-sm font-medium ${
                view === "list" ? "bg-primary-50 text-primary-700" : "bg-white dark:bg-surface hover:bg-surface-alt"
              }`}
            >
              รายการ
            </Link>
            <Link
              href={carry({ view: "board", page: 1 })}
              className={`px-3 py-2 text-sm font-medium border-l border-border ${
                view === "board" ? "bg-primary-50 text-primary-700" : "bg-white dark:bg-surface hover:bg-surface-alt"
              }`}
            >
              บอร์ด (Pipeline)
            </Link>
          </div>
        </div>

        {/* Search + active filters + CSV export — sales hands the cold list to
            external callers / VAs as a spreadsheet. Includes tel, name, code,
            order count, current rep, last-call note. */}
        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/leads" className="flex gap-2 flex-wrap">
            <input type="hidden" name="segment" value={segment} />
            {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหา รหัส / เบอร์ / ชื่อ"
              className="rounded-lg border border-border px-3 py-2 text-sm w-56"
            />
            <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">
              ค้นหา
            </button>
          </form>
          {statusFilter !== "all" ? (
            <Link
              href={carry({ status: "" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
            >
              สถานะ: {statusFilter} <span className="rounded-full px-1 leading-none hover:bg-primary-100">×</span>
            </Link>
          ) : null}
          <div className="ml-auto">
            <CsvButton
              rows={rows.map((r): CsvRow => ({
                tel:        r.tel ?? "",
                name:       r.name,
                userid:     r.userid,
                orderCount: r.orderCount,
                rep:        r.rep ?? "",
                cs:         r.cs ?? "",
                lastCall:   r.lastCall ?? "",
                callStatus: r.callStatus,
                registered: r.registered ?? "",
              }))}
              fetchAll={async () => {
                "use server";
                // Export the FULL filtered lead list (all pages) — audited via
                // admin_export_log (PII walk-off trail · owner directive).
                return exportLeadsAll({ segment, status: statusFilter, q });
              }}
              cols={[
                { key: "tel",        label: "เบอร์โทร" },
                { key: "name",       label: "ชื่อ" },
                { key: "userid",     label: "รหัสลูกค้า" },
                { key: "orderCount", label: "จำนวนนำเข้า" },
                { key: "rep",        label: "เซลล์ผู้ดูแล" },
                { key: "cs",         label: "CS ผู้ดูแล" },
                { key: "lastCall",   label: "โทรล่าสุด" },
                { key: "callStatus", label: "สถานะโทร" },
                { key: "registered", label: "ลงทะเบียน" },
              ]}
              filename={`leads-${segment}${statusFilter !== "all" ? `-${statusFilter}` : ""}-page${page}-${new Date().toISOString().slice(0, 10)}.csv`}
            />
          </div>
        </div>

        {/* Big-PCS ranking note (full-base via RPC 0173 count_forwarder_by_owner) */}
        {segment === "big-pcs" ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            จัดอันดับจากจำนวนรายการนำเข้าสะสมทั้งหมดในระบบ — โทรหาลูกค้ารายใหญ่ก่อน (top-down)
          </p>
        ) : null}

        {/* Callback due-queue note (no scheduled-date column — due = age) */}
        {segment === "callback" ? (
          <p className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-[11px] text-purple-800">
            ลูกค้าที่ผลโทรล่าสุดคือ “นัดโทรกลับ” — เรียงจากนัดที่ค้างนานที่สุดขึ้นก่อน
          </p>
        ) : null}

        {queueErr ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            โหลดรายการไม่สำเร็จ: {queueErr}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-12 text-center text-sm text-muted">
            ไม่พบลูกค้าที่ต้องโทรตาม
          </div>
        ) : view === "board" ? (
          // CRM depth (2026-06-08) — pipeline kanban view of this page's rows.
          <LeadKanban rows={rows} tagsByUser={tagsByUser} />
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5">เบอร์โทร</th>
                  <th className="px-3 py-2.5">ชื่อ</th>
                  <th className="px-3 py-2.5">รหัส</th>
                  <th className="px-3 py-2.5 text-right">นำเข้า</th>
                  <th className="px-3 py-2.5">แท็ก</th>
                  <th className="px-3 py-2.5">เซลล์ผู้ดูแล</th>
                  <th className="px-3 py-2.5">CS ผู้ดูแล</th>
                  <th className="px-3 py-2.5">โทรล่าสุด</th>
                  <th className="px-3 py-2.5">สถานะ</th>
                  <th className="px-3 py-2.5">ลงทะเบียน</th>
                  <th className="px-3 py-2.5">บันทึกผล</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userid} className="border-t border-border align-top hover:bg-surface-alt/40">
                    <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap">
                      {r.tel ? (
                        <a href={`tel:${r.tel}`} className="text-primary-600 hover:underline">
                          {r.tel}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{r.name}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/customers?q=${encodeURIComponent(r.userid)}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {r.userid}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.orderCount.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <TagChips userid={r.userid} initialTags={tagsByUser[r.userid] ?? []} compact />
                    </td>
                    <td className="px-3 py-2.5 text-xs">{r.rep || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs">{r.cs || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{fmtDate(r.lastCall)}</td>
                    <td className="px-3 py-2.5"><CallStatusBadge status={r.callStatus} /></td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{fmtDate(r.registered)}</td>
                    <td className="px-3 py-2.5"><LeadCallAction userid={r.userid} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination (list view only — the board shows the current page's rows) */}
        {view === "list" && (page > 1 || hasMore) && (
          <div className="flex items-center justify-between">
            {page > 1 ? (
              <Link href={carry({ page: page - 1 })} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-alt">
                ← ก่อนหน้า
              </Link>
            ) : <span />}
            <span className="text-xs text-muted">หน้า {page}</span>
            {hasMore ? (
              <Link href={carry({ page: page + 1 })} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-alt">
                ถัดไป →
              </Link>
            ) : <span />}
          </div>
        )}
      </main>
    </>
  );
}
