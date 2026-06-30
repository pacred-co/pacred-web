import { Link } from "@/i18n/navigation";
import { UserPlus, Filter } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { getLeadQueue, exportLeadsAll, getMyLeadSlaToday } from "@/actions/admin/leads";
import { getImportedLeadStats, getImportedLeadSourceCounts } from "@/actions/admin/imported-leads";
import { LEAD_SOURCE_TABS, type LeadSourceTab } from "@/lib/validators/imported-lead";
import { getCrmReps, getCrmCsReps, getAssignableAdmins } from "@/actions/admin/crm";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { getTagsBulk } from "@/actions/admin/customer-tags";
import { LeadRepCell, LeadCsCell } from "./lead-owner-controls";
import {
  LEAD_CALL_STATUSES,
  type LeadCallStatus,
  type LeadSegment,
} from "@/actions/admin/leads-types";
import { TagChips } from "@/components/admin/tag-chips";
import { CallStatusBadge, LeadCallAction } from "./lead-call-action";
import { LeadKanban } from "./lead-kanban";
import { LeadAssignPanel } from "./lead-assign-bar";
import { LeadReportPanel, LeadAssignmentSummary } from "./lead-assignment-summary";

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

// ปอน 2026-06-22: ซ่อน chip 'cold' + 'big-pcs' ออกจากแถบ segment filter
// (display-only — segment/handler/data ยังอยู่ครบ · เปิด ?segment=cold หรือ
// ?segment=big-pcs ตรงๆ ยังเข้าได้ แค่ไม่มี chip ให้กด · ไม่แตะ database)
// ปอน 2026-06-23: เอา "ทั้งหมด" ออก แทนด้วย "ลูกค้าที่ยังไม่ได้ดำเนินการ"
// (call_status ว่าง = ยังไม่มีผล). key เป็น string เพราะ "pending" เป็น UI-segment
// (ไม่ใช่ LeadSegment data-layer · filter ใน LeadAssignPanel).
const SEGMENTS: { key: string; label: string; hint: string }[] = [
  { key: "mine", label: "ลูกค้าของฉัน", hint: "lead ที่มอบหมายให้ฉัน" },
  { key: "callback", label: "นัดโทรกลับ", hint: "ถึงคิวโทรกลับ" },
  { key: "pending", label: "ลูกค้าที่ยังไม่ได้ดำเนินการ", hint: "ยังไม่มีการกระทำ" },
  { key: "closed", label: "ปิดการขายได้", hint: "ดีลที่ปิดได้ (มีรหัส PR)" },
  // owner 2026-06-30: เซลล์เห็น "สรุป/ประวัติงานที่ได้รับมอบหมาย" ของตัวเอง (self-scoped).
  { key: "summary", label: "ประวัติ + สรุป", hint: "สรุปงานที่ได้รับมอบหมายของฉัน" },
];

// owner 2026-07-01: page-level "ที่มา (source)" tab strip — แยกแหล่งลูกค้า. เดิมมีแค่
// ลูกค้านำเข้าทั่วไป (PCS) → เพิ่มฝั่ง freight (369 ที่นำเข้ามา) + แท็บแยก "ไม่มีเบอร์" (86
// ราย รอตามเบอร์). reuse แพทเทิร์น chip เดียวกับ SEGMENTS (DESIGN RULE · ไม่ทำ layout ใหม่).
const SOURCE_TABS: { key: LeadSourceTab; label: string; hint: string }[] = [
  { key: "all", label: "ทุกที่มา", hint: "ลูกค้าทุกแหล่ง" },
  { key: "pcs", label: "ลูกค้าทั่วไป (PCS)", hint: "รายชื่อลูกค้านำเข้าเดิม" },
  { key: "freight", label: "ฝั่ง Freight", hint: "ลูกค้าเฟรทที่นำเข้ามา (มีเบอร์)" },
  { key: "freight_no_phone", label: "Freight รอตามลูกค้า (ไม่มีเบอร์)", hint: "ยังไม่มีเบอร์ — ต้องตามเบอร์ก่อน" },
];

// ปอน 2026-06-22: ซ่อน "ข้อมูลรายชื่อลูกค้า" ออกจากหน้านี้ทั้งหมด (ตาราง list +
// บอร์ด kanban + CSV export + pagination) — display-only · ไม่แตะ DB · ไม่ให้ใคร
// เห็น/ดึงออก. ดาต้ายัง fetch ปกติแต่ไม่ render. flip เป็น false เพื่อคืนค่าตอนเซ็ทระบบใหม่.
const LEAD_DATA_HIDDEN: boolean = true;

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
  searchParams: Promise<{ segment?: string; status?: string; q?: string; page?: string; view?: string; source?: string }>;
}) {
  // The staff who actually call: super + sales + CS/ops.
  const { user, roles } = await requireAdmin(["super", "sales_admin", "sales", "ops"]);
  // "มอบหมายโทรเซลล์" bar = Ultra Admin Z only — gate on `ultra` itself, NOT
  // isGodRole() (which also passes `super`). ปอน 2026-06-22: super ไม่เห็น.
  const isUltra = roles.includes("ultra");
  // รายงานการโทร (audit · read-only) — owner 2026-06-26: HR/หัวหน้า (admin_vam = super)
  // ติดตามผลงานเซล (ใครโทร · ปิดได้กี่ราย · ต่อเซล/ต่อช่วงเวลา). SEPARATE from the
  // ultra-only assign tab — senior sees the REPORT only, NOT the assign controls.
  const isSenior = isUltra || roles.includes("super") || roles.includes("manager");

  const sp = await searchParams;
  const rawSegment = typeof sp.segment === "string" ? sp.segment : "";
  // "มอบหมายโทรเซลล์" = ultra-only UI tab (ปอน 2026-06-22). ปอน 2026-06-23: work tabs =
  // ลูกค้าของฉัน(mine) / นัดโทรกลับ(callback) / ยังไม่ได้ดำเนินการ(pending) — "ทั้งหมด" ถอดออก ·
  // default landing = pending. (mine/callback/pending/all/assign = UI segments · filter
  // อยู่ใน LeadAssignPanel · non-ultra hitting ?segment=assign ตกมา work view + backend gate.)
  const isAssignTab = isUltra && rawSegment === "assign";
  const isReportTab = isSenior && rawSegment === "report";
  const workSegment =
    // owner 2026-06-23: the stat cards link to no_answer/not_interested/called_today too.
    ["mine", "callback", "pending", "closed", "all", "no_answer", "not_interested", "called_today", "summary"].includes(rawSegment)
      ? rawSegment
      : "pending"; // default + the "ยังไม่ได้ดำเนินการ" tab
  const uiSegment = isAssignTab ? "assign" : workSegment;
  // LeadSegment for the (hidden · LEAD_DATA_HIDDEN) legacy getLeadQueue only —
  // 'pending' has no legacy queue → 'all'.
  const segment: LeadSegment =
    rawSegment === "big-pcs" || rawSegment === "cold" || rawSegment === "all" || rawSegment === "callback" || rawSegment === "mine"
      ? rawSegment
      : "all";
  const statusFilter: LeadCallStatus | "all" = isStatusFilter(sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  // CRM depth (2026-06-08) — list (default) vs pipeline-kanban view.
  const view: "list" | "board" = sp.view === "board" ? "board" : "list";
  // owner 2026-07-01: page-level source tab (pcs / freight / freight_no_phone).
  const sourceTab: LeadSourceTab = (LEAD_SOURCE_TABS as readonly string[]).includes(sp.source ?? "")
    ? (sp.source as LeadSourceTab)
    : "all";

  const [statsRes, queueRes, sourceCountsRes] = await Promise.all([
    // ปอน 2026-06-23: การ์ดสรุปดึงจาก imported_leads (สัมพันธ์กับตารางด้านล่าง) แทนระบบ lead เก่า
    getImportedLeadStats(),
    getLeadQueue({ segment, status: statusFilter, q, page }),
    getImportedLeadSourceCounts(),
  ]);

  const stats = statsRes.ok ? statsRes.data : undefined;
  const sourceCounts = sourceCountsRes.ok ? sourceCountsRes.data : undefined;
  const rows = queueRes.ok ? (queueRes.data?.rows ?? []) : [];
  const hasMore = queueRes.ok ? Boolean(queueRes.data?.hasMore) : false;
  const queueErr = queueRes.ok ? null : queueRes.error;

  // Bulk-load tags for the visible rows (one query) → chips in both views.
  const tagsRes = await getTagsBulk(rows.map((r) => r.userid));
  const tagsByUser = tagsRes.ok ? (tagsRes.data ?? {}) : {};

  // Ownership controls + same-day SLA banner (owner 2026-06-22): the assignable
  // เซลล์/CS pools, the viewing admin's own legacy rep id (for "รับเอง" + the
  // "คุณ" badge), and the current admin's claimed-today-but-not-called count.
  const [repsRes, csRepsRes, slaRes, myLegacyId, assignableRes] = await Promise.all([
    getCrmReps(),
    getCrmCsReps(),
    getMyLeadSlaToday(),
    getAdminLegacyId(user.id),
    // The "มอบหมายโทรเซลล์" assign/distribute/handoff pool = active เซลล์/CS staff,
    // keyed by profile_id (owner 2026-06-23: "ให้แค่เซลล์ cs … มอบหมายแล้วไปเข้า user
    // นั้นตรงๆ"). Distinct from `reps` (legacy adminID) which feeds the legacy
    // customer-ownership cell only.
    getAssignableAdmins(),
  ]);
  const reps = repsRes.ok ? (repsRes.data?.reps ?? []) : [];
  const assignableAdmins = assignableRes.ok ? (assignableRes.data?.reps ?? []) : [];
  const csReps = csRepsRes.ok ? (csRepsRes.data?.reps ?? []) : [];
  const sla = slaRes.ok ? slaRes.data : undefined;

  // Preserve filters across the search form + pagination links.
  const carry = (over: Record<string, string | number>) => {
    const params = new URLSearchParams();
    params.set("segment", uiSegment);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (q) params.set("q", q);
    if (view !== "list") params.set("view", view);
    if (sourceTab !== "all") params.set("source", sourceTab);
    for (const [k, v] of Object.entries(over)) params.set(k, String(v));
    return `/admin/leads?${params.toString()}`;
  };

  return (
    <>
      <main className="p-4 sm:p-6 lg:p-8 space-y-5">
        {/* Header */}
        <PageHeader
          eyebrow="ADMIN · ACQUISITION"
          title="โทรตามลูกค้า (Leads)"
          subtitle="โทรหาลูกค้าจากบนลงล่างเพื่อปิดการขาย"
        />

        {/* Stat cards — ปอน 2026-06-23: 4 การ์ด compact (เตี้ยลง) จาก imported_leads
            (getImportedLeadStats · สัมพันธ์ตาราง · scoped ตาม role). ติดต่อวันนี้ = daily
            reset · ปิด/ไม่รับสาย/ไม่สนใจ = ยอดสะสมตามสถานะ. */}
        {/* Stat cards are CLICKABLE filters (owner 2026-06-23: "กดแถบข้างบนก็ให้สลับ
            ไปแถบที่มีรายการนั้นๆ") → switch the list to that status. Active = ring. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { seg: "called_today",   label: "ติดต่อแล้ววันนี้", value: stats?.calledToday,   tone: "" },
            { seg: "closed",         label: "ปิดการขายแล้ว",    value: stats?.closed,        tone: "text-green-700" },
            { seg: "no_answer",      label: "ไม่รับสาย",        value: stats?.noAnswer,      tone: "text-amber-700" },
            { seg: "not_interested", label: "ไม่สนใจ",          value: stats?.notInterested, tone: "text-rose-700" },
          ] as const).map((c) => {
            const active = uiSegment === c.seg;
            return (
              <Link
                key={c.seg}
                href={carry({ segment: c.seg, page: 1 })}
                className={`rounded-xl bg-white dark:bg-surface shadow-sm px-3 py-2.5 border transition hover:border-primary-300 ${active ? "border-primary-400 ring-2 ring-primary-200" : "border-border"}`}
              >
                <p className="text-[11px] text-muted">{c.label}</p>
                <p className={`mt-0.5 text-xl font-bold ${c.tone}`}>{stats ? (c.value ?? 0).toLocaleString("th-TH") : "—"}</p>
              </Link>
            );
          })}
        </div>

        {/* Same-day call SLA — the leads YOU claimed today but haven't logged a
            call on yet (owner 2026-06-22: "กดรับแล้วต้องโทรภายในวันนั้น"). */}
        {sla && sla.overdue > 0 ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              ⏰ คุณรับลูกค้าวันนี้ {sla.claimedToday.toLocaleString("th-TH")} ราย · ยังไม่ได้โทร {sla.overdue.toLocaleString("th-TH")} ราย
            </p>
            <p className="mt-0.5 text-[12px]">
              ต้องโทร + บันทึกผลภายในวันนี้ — รหัสที่ยังไม่ได้โทร: <span className="font-mono">{sla.sample.join(", ")}</span>
              {sla.overdue > sla.sample.length ? " …" : ""}
            </p>
          </div>
        ) : null}

        {/* Segment tabs — ลูกค้าของฉัน/ทั้งหมด drive the ultra workspace filter (ปอน 2026-06-22) + view toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {SEGMENTS.map((s) => {
            const active = s.key === uiSegment;
            // ปอน 2026-06-23: วงกลม+ตัวเลขเป็นแจ้งเตือนกลายๆ (mine/callback/pending)
            const count = s.key === "mine" ? stats?.mineCount : s.key === "callback" ? stats?.callbackCount : s.key === "pending" ? stats?.pendingCount : s.key === "closed" ? stats?.closed : undefined;
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
                {count && count > 0 ? (
                  <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-none ${s.key === "callback" ? "bg-red-500 text-white" : active ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700"}`}>{count > 99 ? "99+" : count}</span>
                ) : null}
                <span className="ml-1 hidden sm:inline text-[11px] font-normal text-muted">· {s.hint}</span>
              </Link>
            );
          })}
          {/* "มอบหมายโทรเซลล์" — the dedicated ultra-only import/assign tab (ปอน
              2026-06-22 "แถบพิเศษเฉพาะสำหรับมอบหมาย/อัปเข้า"). Distinct chip so it
              reads as a separate control room, not another work tab. */}
          {isUltra ? (
            <Link
              href="/admin/leads?segment=assign"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                isAssignTab
                  ? "border-primary-500 bg-primary-600 text-white"
                  : "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"
              }`}
            >
              <UserPlus className="h-4 w-4" /> มอบหมายโทรเซลล์
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none ${isAssignTab ? "bg-white/25 text-white" : "bg-primary-600 text-white"}`}>Ultra</span>
            </Link>
          ) : null}
          {/* รายงานการโทร (สรุปผลงานเซล · audit) — owner 2026-06-26: HR/หัวหน้า
              (super) ติดตามว่าใครโทร · ปิดได้กี่ราย. READ-ONLY (ไม่มีปุ่มมอบหมาย). */}
          {isSenior ? (
            <Link
              href="/admin/leads?segment=report"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                isReportTab
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              📊 รายงานการโทร (สรุปผลงานเซล)
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none ${isReportTab ? "bg-white/25 text-white" : "bg-indigo-600 text-white"}`}>HR/หัวหน้า</span>
            </Link>
          ) : null}
          {/* ปอน 2026-06-23: เอา toggle "รายการ/บอร์ด" ออก — ไม่ได้สลับอะไรจริง
              (หน้านี้แสดง LeadAssignPanel เสมอเพราะ LEAD_DATA_HIDDEN · kanban/board
              อยู่ใน dead branch). `view` var คงไว้ (carry preserve · default list). */}
        </div>

        {/* Source tabs (owner 2026-07-01) — แยกตาม "ที่มา (source)" ของลูกค้า: ทั่วไป(PCS)
            vs ฝั่ง Freight vs Freight ที่ไม่มีเบอร์ (รอตามลูกค้า). คนละแกนกับ segment ด้านบน
            — วางเป็นแถบแยก + ป้าย "ที่มา:" ให้ชัด. count badge = ยอดจริงจาก imported_leads. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-alt/40 px-3 py-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Filter className="h-3.5 w-3.5" /> ที่มา
          </span>
          {SOURCE_TABS.map((s) => {
            const active = s.key === sourceTab;
            const count =
              s.key === "all" ? sourceCounts?.all
                : s.key === "pcs" ? sourceCounts?.pcs
                : s.key === "freight" ? sourceCounts?.freight
                : sourceCounts?.freightNoPhone;
            const isChase = s.key === "freight_no_phone";
            return (
              <Link
                key={s.key}
                href={carry({ source: s.key, page: 1 })}
                title={s.hint}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? isChase
                      ? "border-amber-400 bg-amber-100 text-amber-900"
                      : "border-primary-400 bg-primary-100 text-primary-800"
                    : "border-border bg-white dark:bg-surface hover:bg-surface-alt"
                }`}
              >
                {s.label}
                {count !== undefined ? (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-none ${
                    active
                      ? isChase ? "bg-amber-600 text-white" : "bg-primary-600 text-white"
                      : isChase ? "bg-amber-100 text-amber-700" : "bg-primary-100 text-primary-700"
                  }`}>
                    {count > 9999 ? "9999+" : count.toLocaleString("th-TH")}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {/* Search + active filters + CSV export — sales hands the cold list to
            external callers / VAs as a spreadsheet. Includes tel, name, code,
            order count, current rep, last-call note. */}
        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/leads" className="flex gap-2 flex-wrap">
            <input type="hidden" name="segment" value={uiSegment} />
            {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหา ชื่อ / เบอร์ / LINE / email"
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
          {!LEAD_DATA_HIDDEN ? (
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
          ) : null}
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

        {LEAD_DATA_HIDDEN ? (
          // ปอน 2026-06-22 ("เข้าใจใหม่"): every admin works the leads assigned to
          // them in the normal tabs (mode="work" · NO assign control). Import +
          // assign-to-rep live ONLY in the ultra "มอบหมายโทรเซลล์" tab (mode="assign").
          isReportTab ? (
            // รายงานการโทร (audit · read-only) — HR/หัวหน้า ดูผลงานเซลทุกคน · owner 2026-06-26.
            // owner 2026-06-30: + "งานที่มอบหมาย (ภาพรวม)" toggle → ดูสรุปงานที่แบ่งให้แต่ละเซลล์.
            <LeadReportPanel reps={assignableAdmins} />
          ) : !isAssignTab && workSegment === "summary" ? (
            // owner 2026-06-30: เซลล์เห็น "ประวัติ + สรุป" งานที่ได้รับมอบหมายของตัวเอง
            // (self-scoped · ทุก role ที่ทำงาน lead เห็นของตัวเอง).
            <LeadAssignmentSummary reps={assignableAdmins} mine />
          ) : (
            <LeadAssignPanel reps={assignableAdmins} segment={isAssignTab ? "all" : workSegment} mode={isAssignTab ? "assign" : "work"} q={q} sourceTab={sourceTab} />
          )
        ) : queueErr ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            โหลดรายการไม่สำเร็จ: {queueErr}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-12 text-center text-sm text-muted">
            {segment === "mine"
              ? "คุณยังไม่ได้รับลูกค้ารายไหน — ไปที่แท็บอื่นแล้วกด “รับเอง” เพื่อรับลูกค้ามาดูแล"
              : "ไม่พบลูกค้าที่ต้องโทรตาม"}
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
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <TagChips userid={r.userid} initialTags={tagsByUser[r.userid] ?? []} compact />
                    </td>
                    <td className="px-3 py-2.5 min-w-[190px]">
                      <LeadRepCell userid={r.userid} currentRep={r.rep} myLegacyId={myLegacyId} reps={reps} />
                    </td>
                    <td className="px-3 py-2.5 min-w-[170px]">
                      <LeadCsCell userid={r.userid} currentCs={r.cs} csReps={csReps} />
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{fmtDate(r.lastCall)}</td>
                    <td className="px-3 py-2.5"><CallStatusBadge status={r.callStatus} /></td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">{fmtDate(r.registered)}</td>
                    <td className="px-3 py-2.5"><LeadCallAction userid={r.userid} tel={r.tel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination (list view only — the board shows the current page's rows) */}
        {!LEAD_DATA_HIDDEN && view === "list" && (page > 1 || hasMore) && (
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
