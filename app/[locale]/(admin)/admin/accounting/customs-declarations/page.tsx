import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { FileText, Anchor, CheckCircle2, Send, XCircle } from "lucide-react";

/**
 * /admin/accounting/customs-declarations — ใบขนสินค้า admin hub (read-only V1).
 *
 * 2026-06-05 (ภูม D7 · CEO 3-tax-doc trio LAST LEG):
 *   CEO directive: 3 tax-document modes for cargo billing:
 *     · ใบกำกับภาษี  ✅ wired (ลาน B 2026-06-04)
 *     · ใบขนสินค้า  → THIS hub (was orphan — actions + PDF endpoint
 *                       existed but no admin UI to discover them)
 *     · ไม่รับเอกสาร  ✅ wired (per-order opt)
 *
 * V-E11 admin actions (`actions/admin/customs-declarations.ts`):
 *   Create draft · Update header · Add/edit/delete lines · Submit · Mark accepted
 *   Mark released · Cancel — full status workflow shipped, just no UI on top.
 *
 * Status lifecycle:
 *   draft → submitted → accepted → released
 *                    ↘ cancelled (terminal)
 *
 * MVP V1 scope (THIS page):
 *   · List all declarations · per-status stats cards
 *   · Date range filter · search by no/control-no
 *   · Per-row link to PDF (existing `/api/customs-declaration/[id]` endpoint)
 *   · Read-only — mutate actions live behind /admin/accounting/customs-declarations/[id]
 *     edit page (deferred to next sitting — accounting still needs to sign-off
 *     VAT-base policy per CLAUDE.md 2026-06-04 pending list).
 *
 * Roles per ADR-0014: super | accounting.
 */

export const dynamic = "force-dynamic";

type StatusCode = "draft" | "submitted" | "accepted" | "released" | "cancelled";

const STATUS_LABEL: Record<StatusCode, string> = {
  draft:     "📝 ร่าง (Draft)",
  submitted: "📨 ส่งแล้ว",
  accepted:  "✓ ศุลฯ รับ",
  released:  "🚚 ปล่อยแล้ว",
  cancelled: "❌ ยกเลิก",
};
const STATUS_CLS: Record<StatusCode, string> = {
  draft:     "bg-slate-100 text-slate-700 border-slate-300",
  submitted: "bg-blue-100 text-blue-700 border-blue-300",
  accepted:  "bg-purple-100 text-purple-700 border-purple-300",
  released:  "bg-emerald-100 text-emerald-700 border-emerald-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

const TYPE_LABEL: Record<string, string> = {
  import:  "นำเข้า",
  export:  "ส่งออก",
  transit: "ผ่านแดน",
};

function thb(n: number | null): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function defaultDateRange(): { from: string; to: string } {
  // Default last 90 days (give enough room for the typical customs cycle)
  const to   = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  const pad  = (n: number) => n.toString().padStart(2, "0");
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to:   `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  };
}

type Row = {
  id:                       string;
  declaration_no:           string | null;
  status:                   StatusCode;
  declaration_type:         string;
  declared_at:              string | null;
  submitted_at:             string | null;
  customs_office:           string | null;
  customs_control_no:       string | null;
  broker_name:              string | null;
  port_of_entry:            string | null;
  total_declared_value_thb: number | null;
  total_duty_thb:           number | null;
  total_vat_thb:            number | null;
  total_other_taxes_thb:    number | null;
  freight_shipment_id:      string;
  created_at:               string | null;
};

export default async function AdminCustomsDeclarationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; status?: string; q?: string }>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles own customs
  // declaration issuance (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const sp = await searchParams;
  const defaults = defaultDateRange();
  const dateFrom = sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from) ? sp.date_from : defaults.from;
  const dateTo   = sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to)   ? sp.date_to   : defaults.to;
  const statusFilter = (sp.status && ["draft","submitted","accepted","released","cancelled"].includes(sp.status))
    ? (sp.status as StatusCode) : null;
  const q = sp.q?.trim() ?? "";

  const admin = createAdminClient();

  // ── Status counts (lifetime · no date range, gives admin the full picture) ──
  const countByStatus: Record<StatusCode, number> = {
    draft: 0, submitted: 0, accepted: 0, released: 0, cancelled: 0,
  };
  await Promise.all((Object.keys(countByStatus) as StatusCode[]).map(async (s) => {
    const { count, error } = await admin
      .from("customs_declarations")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    if (error) {
      console.error("[customs-declarations status count]", { status: s, code: error.code, message: error.message });
    }
    countByStatus[s] = count ?? 0;
  }));
  const totalAll = Object.values(countByStatus).reduce((a, b) => a + b, 0);

  // ── Listing query ──
  // Date filter: declared_at OR created_at (drafts may not have declared_at yet)
  let query = admin
    .from("customs_declarations")
    .select(
      "id, declaration_no, status, declaration_type, declared_at, submitted_at, " +
      "customs_office, customs_control_no, broker_name, port_of_entry, " +
      "total_declared_value_thb, total_duty_thb, total_vat_thb, total_other_taxes_thb, " +
      "freight_shipment_id, created_at",
    )
    .gte("created_at", `${dateFrom}T00:00:00`)
    .lte("created_at", `${dateTo}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (q) {
    // Search across declaration_no + control_no + broker_name (ilike OR)
    const safe = q.replace(/[%_]/g, "\\$&");
    query = query.or(`declaration_no.ilike.%${safe}%,customs_control_no.ilike.%${safe}%,broker_name.ilike.%${safe}%`);
  }
  const { data: rowsRaw, error: rowsErr } = await query;
  if (rowsErr) {
    console.error("[customs-declarations list]", { code: rowsErr.code, message: rowsErr.message });
  }
  const rows = (rowsRaw ?? []) as unknown as Row[];

  // ── Aggregates for the filtered listing ──
  let sumDeclared = 0;
  let sumDuty     = 0;
  let sumVat      = 0;
  for (const r of rows) {
    sumDeclared += Number(r.total_declared_value_thb ?? 0);
    sumDuty     += Number(r.total_duty_thb ?? 0);
    sumVat      += Number(r.total_vat_thb ?? 0);
  }

  // ── CSV export ──
  const csvRows: CsvRow[] = rows.map((r) => ({
    "เลขที่ใบขน":      r.declaration_no ?? "(draft)",
    "ประเภท":          TYPE_LABEL[r.declaration_type] ?? r.declaration_type,
    "สถานะ":           STATUS_LABEL[r.status],
    "ด่านศุลกากร":     r.customs_office ?? "",
    "เลขที่ควบคุม":    r.customs_control_no ?? "",
    "ตัวแทนออกของ":    r.broker_name ?? "",
    "ท่า/ด่าน":         r.port_of_entry ?? "",
    "มูลค่าสำแดง":     r.total_declared_value_thb ?? 0,
    "อากร":           r.total_duty_thb ?? 0,
    "VAT":            r.total_vat_thb ?? 0,
    "วันที่สำแดง":      fmtDate(r.declared_at),
    "วันที่ส่ง":         fmtDate(r.submitted_at),
    "สร้างเมื่อ":       fmtDate(r.created_at),
  }));

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/customs-declarations" />
      <main className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · ใบขนสินค้า</p>
          <h1 className="mt-1 text-2xl font-bold">ใบขนสินค้า (Customs Declaration)</h1>
          <p className="text-xs text-muted mt-1">
            หนึ่งใน 3 โหมดเอกสารภาษีตาม CEO directive (ใบกำกับ / <strong>ใบขนสินค้า</strong> / ไม่รับเอกสาร)
          </p>
          <p className="text-[10px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">customs_declarations</code> (migration 0057 · V-E11)
            · status workflow: <code>draft → submitted → accepted → released</code>
            {" ↘ "}<code>cancelled</code>
            · PDF endpoint: <code>/api/customs-declaration/[id]</code>
          </p>
        </header>

        {/* MVP banner — accounting policy still pending */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">🚧 MVP read-only — admin mutate UI ตามมาในรอบหน้า</p>
          <p>
            Backend actions ครบแล้ว (`actions/admin/customs-declarations.ts` · ครีเอท/อัปเดต/ส่ง/รับ/ปล่อย/ยกเลิก)
            แต่ VAT-base policy ยังรอ accounting sign-off ก่อน live (per CLAUDE.md 2026-06-04 pending list).
          </p>
        </div>

        {/* Status stats cards (lifetime) */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(Object.keys(countByStatus) as StatusCode[]).map((s) => (
            <Link
              key={s}
              href={statusFilter === s
                ? "/admin/accounting/customs-declarations"
                : `/admin/accounting/customs-declarations?status=${s}`}
              className={`rounded-xl border p-3 shadow-sm hover:shadow-md transition cursor-pointer ${
                statusFilter === s ? "ring-2 ring-primary-500" : ""
              } ${STATUS_CLS[s]}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {STATUS_LABEL[s]}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {countByStatus[s].toLocaleString("th-TH")}
              </p>
              <p className="mt-0.5 text-[10px] opacity-70">
                {totalAll > 0 ? `${((countByStatus[s] / totalAll) * 100).toFixed(1)}%` : "—"}
              </p>
            </Link>
          ))}
        </section>

        {/* Filters */}
        <form
          method="GET"
          action="/admin/accounting/customs-declarations"
          className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted">ตั้งแต่</span>
            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted">ถึง</span>
            <input
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-[10px] uppercase tracking-wider text-muted">ค้นหา (เลขที่/control-no/broker)</span>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="CD-260605-0001 / 0123/2569 / สมชาย"
              className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
            />
          </label>
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            กรอง
          </button>
          {(sp.date_from || sp.date_to || sp.q || sp.status) && (
            <Link
              href="/admin/accounting/customs-declarations"
              className="text-xs text-muted hover:text-foreground"
            >
              เคลียร์
            </Link>
          )}
          <CsvButton
            rows={csvRows}
            cols={Object.keys(csvRows[0] ?? {}).map((k) => ({ key: k, label: k }))}
            filename={`pacred-customs-declarations-${dateFrom}-to-${dateTo}.csv`}
          />
        </form>

        {/* Filtered aggregate stat strip */}
        <section className="grid sm:grid-cols-4 gap-3">
          <Stat label={`รายการในช่วงนี้ ${statusFilter ? `(${STATUS_LABEL[statusFilter]})` : ""}`} value={rows.length.toLocaleString("th-TH")} />
          <Stat label="มูลค่าสำแดงรวม" value={`฿${thb(sumDeclared)}`} mono />
          <Stat label="อากรรวม" value={`฿${thb(sumDuty)}`} mono />
          <Stat label="VAT รวม" value={`฿${thb(sumVat)}`} mono />
        </section>

        {/* Listing table */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary-600" />
            <h2 className="font-bold text-sm">รายการใบขน</h2>
            <p className="text-[10px] text-muted ml-auto">เรียงตามวันที่สร้าง · max 200 แถวต่อรอบ</p>
          </div>
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ไม่มีใบขนในช่วงนี้
              {statusFilter && ` (สถานะ ${STATUS_LABEL[statusFilter]})`}
              {q && ` ตรงกับคำว่า "${q}"`}
              {" · "}
              {totalAll === 0 ? "ระบบยังไม่มีใบขนเลย (ยังไม่ได้ใช้งานจริง)" : "ลองขยายช่วงวันที่หรือเคลียร์ filter"}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">เลขที่ใบขน</th>
                    <th className="px-3 py-2 text-center">ประเภท</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2">ด่าน/ท่า</th>
                    <th className="px-3 py-2">ตัวแทน/Broker</th>
                    <th className="px-3 py-2 text-right">มูลค่าสำแดง</th>
                    <th className="px-3 py-2 text-right">อากร</th>
                    <th className="px-3 py-2 text-right">VAT</th>
                    <th className="px-3 py-2">วันที่สร้าง</th>
                    <th className="px-3 py-2 text-center">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-mono text-xs font-bold">
                          {r.declaration_no ?? <span className="text-muted italic">(draft)</span>}
                        </div>
                        {r.customs_control_no && (
                          <div className="text-[10px] text-muted font-mono">
                            control: {r.customs_control_no}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">
                        {TYPE_LABEL[r.declaration_type] ?? r.declaration_type}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${STATUS_CLS[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1">
                          {r.port_of_entry && <Anchor className="h-3 w-3 text-muted" />}
                          <span>{r.port_of_entry ?? "—"}</span>
                        </div>
                        {r.customs_office && (
                          <div className="text-[10px] text-muted">{r.customs_office}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.broker_name ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        ฿{thb(r.total_declared_value_thb)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        ฿{thb(r.total_duty_thb)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        ฿{thb(r.total_vat_thb)}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2 text-center">
                        <a
                          href={`/api/customs-declaration/${r.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-2 py-1 text-[10px] text-primary-700 hover:bg-primary-100"
                          title="เปิดดู PDF"
                        >
                          <FileText className="h-3 w-3" />
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Workflow legend */}
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-4 text-xs space-y-2">
          <p className="font-semibold">📚 Workflow ของใบขนสินค้า:</p>
          <div className="grid sm:grid-cols-5 gap-2 text-[11px]">
            <Step Icon={FileText} title="draft" desc="admin ร่าง · แก้ header + lines ได้" />
            <Step Icon={Send} title="submitted" desc="ยื่นที่ด่านศุลกากร · lines ล็อก" />
            <Step Icon={CheckCircle2} title="accepted" desc="ศุลฯ รับ · broker กรอก control-no" />
            <Step Icon={Anchor} title="released" desc="สินค้าออกจากศุลฯ" />
            <Step Icon={XCircle} title="cancelled" desc="ยกเลิก · ออกใบใหม่ได้" />
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-[10px] font-medium text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Step({ Icon, title, desc }: { Icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-2.5">
      <p className="flex items-center gap-1.5 font-mono font-semibold text-[10px] text-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </p>
      <p className="mt-0.5 text-[10px] text-muted">{desc}</p>
    </div>
  );
}
