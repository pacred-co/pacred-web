import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportTaxInvoicesAll } from "@/actions/admin/export/tax-invoices";
import { PrintReportButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * /admin/tax-invoices — list view rebuilt 2026-05-30 sitting-H to match
 * PEAK pattern (7-tab nav + date range + search + summary + pagination).
 *
 * Owner directive 2026-05-30: align Pacred accounting UI with PEAK
 * (ใบกำกับภาษีขาย). 5 active tabs map to existing tax_invoices.status:
 *
 *   ล่าสุด · ทั้งหมด · รออนุมัติ · ออกแล้ว · ยกเลิก
 *
 * 2 disabled placeholder tabs surface the Phase-B2 roadmap (so the layout
 * doesn't shift when the columns/migration land):
 *
 *   ร่าง (draft)        — needs migration to extend the status CHECK
 *   e-Tax Invoice       — needs e-tax flag + Revenue Department XML hook
 *
 * Status enum is locked in `supabase/migrations/0034_tax_invoices.sql`
 * L47 — three values ('pending','issued','cancelled'). Adding 'draft' or
 * an e-Tax flag = follow-up migration (out of scope this sitting).
 *
 * Per ADR-0006 §1.4 + ADR-0005 K-7 only super/accounting see this page.
 * Customer-facing buyer_name + buyer_tax_id are PII — the
 * requireAdmin(['accounting']) gate enforces.
 *
 * Lane: ภูม admin backend (handoff §2). No customer-write or wallet/payment
 * files are touched. No actions/admin/*-tb.ts files are touched. The
 * issueTaxInvoice / cancelTaxInvoice / issueCreditNote action paths are
 * already wired in actions/admin/tax-invoices.tsx and consumed by the
 * existing [id]/page.tsx detail screen — list rebuild does NOT change
 * any write contracts.
 */

const PAGE_SIZE = 10;

const TABS = [
  { id: "recent",    label: "ล่าสุด",        disabled: false },
  { id: "all",       label: "ทั้งหมด",       disabled: false },
  { id: "draft",     label: "ร่าง",          disabled: true  },
  { id: "pending",   label: "รออนุมัติ",     disabled: false },
  { id: "issued",    label: "ออกแล้ว",       disabled: false },
  { id: "etax",      label: "e-Tax Invoice", disabled: true  },
  { id: "cancelled", label: "ยกเลิก",        disabled: false },
] as const;
type TabId = typeof TABS[number]["id"];

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  issued:    "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending:   "รออนุมัติ",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};

type Row = {
  id:             string;
  status:         "pending" | "issued" | "cancelled";
  serial_no:      string | null;
  buyer_name:     string;
  buyer_tax_id:   string;
  subtotal_thb:   number;
  vat_thb:        number;
  total_thb:      number;
  order_h_no:     string | null;
  forwarder_f_no: string | null;
  created_at:     string;
  issued_at:      string | null;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
};

function getDefaultDateRange(): { from: string; to: string } {
  // Bangkok-leaning: rely on the server tz; the date inputs are date-only
  // (no tz) so this is fine for filter UX. Don't over-engineer.
  const now = new Date();
  const tz = -now.getTimezoneOffset() * 60_000;
  const todayStr = new Date(now.getTime() + tz).toISOString().slice(0, 10);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstStr = new Date(first.getTime() + tz).toISOString().slice(0, 10);
  return { from: firstStr, to: todayStr };
}

function thaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", {
    year:  "2-digit",
    month: "2-digit",
    day:   "2-digit",
  });
}

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compute "30-day cutoff" ISO for the "ล่าสุด" tab. Extracted out of the
 * render body because Next 16's `react-hooks/purity` rule rejects raw
 * `Date.now()` directly inside component render — see
 * docs/learnings/nextjs-16-quirks.md for the pattern.
 */
function recentSinceIso(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString();
}

export default async function AdminTaxInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?:      string;
    dateFrom?: string;
    dateTo?:   string;
    search?:   string;
    page?:     string;
  }>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Per ADR-0006 §1.4 only
  // super/accounting see tax invoices (RD Code 86 + buyer tax IDs).
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles also issue
  // tax invoices as part of documentation workflow
  // (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["accounting", "freight_export_doc", "freight_import_doc"]);

  const sp = await searchParams;

  // Tab — accept only active ids; fall back to "all" for disabled/unknown.
  const requested = sp.tab;
  const validTab = TABS.find((t) => t.id === requested && !t.disabled);
  const tab: TabId = (validTab?.id ?? "all") as TabId;

  const defaults = getDefaultDateRange();
  const dateFrom = sp.dateFrom?.match(/^\d{4}-\d{2}-\d{2}$/) ? sp.dateFrom : defaults.from;
  const dateTo   = sp.dateTo  ?.match(/^\d{4}-\d{2}-\d{2}$/) ? sp.dateTo   : defaults.to;
  const search   = (sp.search ?? "").trim();
  // Sanitize search for use in PostgREST `or()` filter — comma + parens
  // are delimiters in the filter grammar; ilike's `%` `_` are wildcards
  // (leave wildcards alone — staff may intentionally use them).
  const searchClean = search.replace(/[(),]/g, " ").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const admin = createAdminClient();

  // ── Build the query ──
  let q = admin
    .from("tax_invoices")
    .select(
      `id, status, serial_no, buyer_name, buyer_tax_id,
       subtotal_thb, vat_thb, total_thb,
       order_h_no, forwarder_f_no, created_at, issued_at,
       profile:profiles!profile_id ( member_code, first_name, last_name )`,
      { count: "exact" },
    );

  // Tab → filter mapping. "recent" overrides date range with last 30d.
  if (tab === "recent") {
    q = q.gte("created_at", recentSinceIso());
  } else {
    q = q
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`);
    if (tab === "pending" || tab === "issued" || tab === "cancelled") {
      q = q.eq("status", tab);
    }
  }

  if (searchClean) {
    q = q.or(
      `serial_no.ilike.%${searchClean}%,buyer_name.ilike.%${searchClean}%,buyer_tax_id.ilike.%${searchClean}%`,
    );
  }

  q = q
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, error, count } = await q;
  if (error) {
    console.error("[tax_invoices list] failed", { code: error.code, message: error.message });
  }

  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null };
  type RawRow = Omit<NonNullable<typeof data>[number], "profile"> & {
    profile: ProfileShape | ProfileShape[] | null;
  };
  const rows = ((data ?? []) as unknown as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  })) as Row[];

  const counts = await getTabCounts(admin, dateFrom, dateTo);

  // Summary (visible page only — grand-total over all matches is a B2 add).
  const sumSubtotal = rows.reduce((a, r) => a + Number(r.subtotal_thb || 0), 0);
  const sumVat      = rows.reduce((a, r) => a + Number(r.vat_thb      || 0), 0);
  const sumTotal    = rows.reduce((a, r) => a + Number(r.total_thb    || 0), 0);

  const totalRows  = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  // URL helpers — preserve the user's filter when changing tab/page.
  function buildHref(over: Partial<{ tab: TabId; page: number }>): string {
    const p = new URLSearchParams();
    const t = over.tab ?? tab;
    if (t !== "all")               p.set("tab", t);
    if (dateFrom !== defaults.from) p.set("dateFrom", dateFrom);
    if (dateTo   !== defaults.to)   p.set("dateTo",   dateTo);
    if (search)                     p.set("search",   search);
    const pg = over.page ?? page;
    if (pg > 1)                     p.set("page", String(pg));
    const qs = p.toString();
    return qs ? `/admin/tax-invoices?${qs}` : "/admin/tax-invoices";
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header: title + 2 right-aligned buttons */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี</p>
          <h1 className="mt-1 text-2xl font-bold">ใบกำกับภาษีขาย</h1>
          <p className="mt-1 text-xs text-muted">
            อนุมัติคำขอใบกำกับภาษี · ออกใบ + สร้าง PDF + บันทึก WHT · ดูประวัติ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className="cursor-not-allowed rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-xs font-medium text-muted"
            title="ลูกค้าเป็นคนขอจากหน้า /service-* — admin ออกใบจากแต่ละแถว (ปุ่ม &quot;ดู&quot; → &quot;ออกใบ&quot;)"
          >
            + สร้างใบกำกับภาษี
          </span>
          <CsvButton
            filename="ใบกำกับภาษีขาย.csv"
            rows={rows.map((r): CsvRow => ({
              serial_no: r.serial_no ?? "",
              doc_ref: r.order_h_no
                ? `ฝากสั่ง · ${r.order_h_no}`
                : r.forwarder_f_no
                  ? `ฝากนำเข้า · ${r.forwarder_f_no}`
                  : "",
              buyer_name: r.buyer_name,
              buyer_tax_id: r.buyer_tax_id,
              member_code: r.profile?.member_code ?? "",
              customer_name: [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
              issued_date: (r.issued_at ?? r.created_at)?.slice(0, 10) ?? "",
              subtotal_thb: Number(r.subtotal_thb || 0).toFixed(2),
              vat_thb: Number(r.vat_thb || 0).toFixed(2),
              total_thb: Number(r.total_thb || 0).toFixed(2),
              status: STATUS_LABEL[r.status] ?? r.status,
            }))}
            fetchAll={async () => {
              "use server";
              // Export the FULL filtered tax-invoice list (all pages) — audited
              // via admin_export_log (buyer name + tax IDs are PII · RD Code 86).
              return exportTaxInvoicesAll({ tab, dateFrom, dateTo, search });
            }}
            cols={[
              { key: "serial_no",     label: "เลขที่เอกสาร" },
              { key: "doc_ref",       label: "อ้างอิงงาน" },
              { key: "buyer_name",    label: "ชื่อผู้ซื้อ" },
              { key: "buyer_tax_id",  label: "เลขผู้เสียภาษี" },
              { key: "member_code",   label: "รหัสสมาชิก" },
              { key: "customer_name", label: "ชื่อลูกค้า" },
              { key: "issued_date",   label: "วันที่ออก" },
              { key: "subtotal_thb",  label: "มูลค่าสุทธิ" },
              { key: "vat_thb",       label: "VAT" },
              { key: "total_thb",     label: "รวมทั้งสิ้น" },
              { key: "status",        label: "สถานะ" },
            ]}
          />
          <PrintReportButton />
        </div>
      </div>

      {/* ADR-0027 — World-A SOT banner. This page reads `tax_invoices` (the
          rebuilt, near-empty store). Real customer ใบกำกับภาษี issued via the
          live tb_forwarder lane (World-B) are at /admin/accounting/etax. */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 print:hidden">
        ℹ️ หน้านี้แสดงเฉพาะใบกำกับภาษีระบบเดิม/freight (ตาราง <code>tax_invoices</code>) —
        ใบกำกับภาษีของลูกค้าจริง (ฝากนำเข้า) ดูที่{" "}
        <Link href="/admin/accounting/etax" className="font-semibold underline">
          /admin/accounting/etax
        </Link>
      </div>

      {/* Tab nav */}
      <div className="border-b border-border print:hidden">
        <nav className="-mb-px flex flex-wrap gap-1">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              count={counts[t.id]}
              active={t.id === tab}
              disabled={t.disabled}
              href={t.disabled ? undefined : buildHref({ tab: t.id, page: 1 })}
            />
          ))}
        </nav>
      </div>

      {/* Filter bar */}
      <form
        method="GET"
        action="/admin/tax-invoices"
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-3 dark:bg-surface md:flex-row md:items-end print:hidden"
      >
        <input type="hidden" name="tab" value={tab} />
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-muted">วันที่ออก</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs dark:bg-surface"
            />
            <span className="text-muted text-xs">—</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs dark:bg-surface"
            />
          </div>
        </div>
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wider text-muted">ค้นหา</label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="เลขที่ INV / ชื่อผู้ซื้อ / เลขผู้เสียภาษี"
            className="mt-0.5 w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs dark:bg-surface"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700"
        >
          ค้นหา
        </button>
      </form>

      {/* Result table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm dark:bg-surface overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" disabled aria-label="bulk select (phase B2)" />
                </th>
                <th className="px-3 py-3">เลขที่เอกสาร</th>
                <th className="px-3 py-3">ลูกค้า / ผู้ซื้อ</th>
                <th className="px-3 py-3">วันที่ออก</th>
                <th className="px-3 py-3 text-right">มูลค่าสุทธิ</th>
                <th className="px-3 py-3 text-right">VAT</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-xs text-muted">
                    ไม่มีรายการในช่วง {dateFrom} → {dateTo}
                    {searchClean && ` ที่ตรงกับ "${searchClean}"`}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-3 print:hidden">
                      <input type="checkbox" disabled aria-label={`select ${r.serial_no ?? r.id}`} />
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className="font-mono font-medium">
                        {r.serial_no ?? <span className="text-muted">(pending)</span>}
                      </div>
                      <div className="text-[10px] text-muted">
                        {r.order_h_no   ? `ฝากสั่ง · ${r.order_h_no}` :
                         r.forwarder_f_no ? `ฝากนำเข้า · ${r.forwarder_f_no}` :
                         null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className="font-medium">{r.buyer_name}</div>
                      <div className="font-mono text-[10px] text-muted">{r.buyer_tax_id}</div>
                      <div className="text-[10px] text-muted">
                        {r.profile?.member_code ?? "—"} · {r.profile?.first_name} {r.profile?.last_name}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {r.issued_at
                        ? thaiDate(r.issued_at)
                        : <span className="text-muted">{thaiDate(r.created_at)} (ขอ)</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">
                      ฿{thb(r.total_thb)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-muted">
                      ฿{thb(r.vat_thb)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 print:hidden">
                      <Link
                        href={`/admin/tax-invoices/${r.id}`}
                        className="inline-flex items-center rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-surface-alt"
                      >
                        ดู →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-surface-alt/30 text-xs font-medium">
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-3 py-3 text-right text-muted">
                    ผลรวม {rows.length} / {totalRows.toLocaleString("th-TH")} รายการ (หน้านี้)
                  </td>
                  <td className="px-3 py-3 text-right font-mono">฿{thb(sumTotal)}</td>
                  <td className="px-3 py-3 text-right font-mono">฿{thb(sumVat)}</td>
                  <td colSpan={2} className="print:hidden"></td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-3 py-2 text-right text-[10px] text-muted">
                    ก่อน VAT (subtotal) หน้านี้
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[10px] text-muted">฿{thb(sumSubtotal)}</td>
                  <td colSpan={3} className="print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
          <div className="text-muted">
            หน้า {page} จาก {totalPages} · ทั้งหมด {totalRows.toLocaleString("th-TH")} รายการ
          </div>
          <div className="flex gap-1">
            {page > 1 && (
              <Link href={buildHref({ page: page - 1 })} className="rounded-lg border border-border px-3 py-1 hover:bg-surface-alt">
                ‹ ก่อนหน้า
              </Link>
            )}
            {pageWindow(page, totalPages).map((n) => (
              <Link
                key={n}
                href={buildHref({ page: n })}
                className={`rounded-lg border px-3 py-1 ${
                  n === page
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-border hover:bg-surface-alt"
                }`}
              >
                {n}
              </Link>
            ))}
            {page < totalPages && (
              <Link href={buildHref({ page: page + 1 })} className="rounded-lg border border-border px-3 py-1 hover:bg-surface-alt">
                ถัดไป ›
              </Link>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function pageWindow(current: number, total: number): number[] {
  const max = 7;
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4)            return [1, 2, 3, 4, 5, 6, 7];
  if (current >= total - 3)    return Array.from({ length: 7 }, (_, i) => total - 6 + i);
  return [current - 3, current - 2, current - 1, current, current + 1, current + 2, current + 3];
}

function TabButton({
  label,
  count,
  active,
  disabled,
  href,
}: {
  label:    string;
  count?:   number;
  active:   boolean;
  disabled: boolean;
  href?:    string;
}) {
  const base =
    "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap";
  if (disabled) {
    return (
      <span
        className={`${base} cursor-not-allowed border-transparent text-muted/60`}
        title="เร็วๆ นี้ — Phase B2 (รอ migration + e-Tax integration)"
      >
        {label}
        <span className="rounded-full bg-amber-100 px-1.5 text-[9px] font-semibold text-amber-700">
          เร็วๆ นี้
        </span>
      </span>
    );
  }
  return (
    <Link
      href={href ?? "#"}
      className={`${base} ${
        active
          ? "border-primary-600 text-primary-700"
          : "border-transparent text-muted hover:text-foreground hover:border-border"
      }`}
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-semibold ${
            active ? "bg-primary-100 text-primary-700" : "bg-surface-alt text-muted"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

async function getTabCounts(
  admin: ReturnType<typeof createAdminClient>,
  dateFrom: string,
  dateTo:   string,
): Promise<Record<TabId, number>> {
  const dateGte = `${dateFrom}T00:00:00`;
  const dateLte = `${dateTo}T23:59:59`;
  const sinceRecent = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [recent, all, pending, issued, cancelled] = await Promise.all([
    admin
      .from("tax_invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceRecent),
    admin
      .from("tax_invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dateGte)
      .lte("created_at", dateLte),
    admin
      .from("tax_invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dateGte)
      .lte("created_at", dateLte)
      .eq("status", "pending"),
    admin
      .from("tax_invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dateGte)
      .lte("created_at", dateLte)
      .eq("status", "issued"),
    admin
      .from("tax_invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dateGte)
      .lte("created_at", dateLte)
      .eq("status", "cancelled"),
  ]);
  return {
    recent:    recent.count    ?? 0,
    all:       all.count       ?? 0,
    draft:     0,
    pending:   pending.count   ?? 0,
    issued:    issued.count    ?? 0,
    etax:      0,
    cancelled: cancelled.count ?? 0,
  };
}
