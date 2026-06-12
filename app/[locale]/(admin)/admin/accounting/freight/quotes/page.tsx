import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QUOTE_STATUS_LABEL,
  TRANSPORT_MODE_LABEL,
  type QuoteStatus,
  type TransportMode,
} from "@/lib/validators/freight-quote";

/**
 * /admin/accounting/freight/quotes — Freight ใบเสนอราคา (quotation) list.
 *
 * Surfaces the EXISTING freight-quote backend (table `freight_quotes` +
 * `freight_quote_items`, actions in `actions/admin/freight-quotes.ts`) as a
 * real admin list. The accounting/freight income hub previously routed
 * "ใบเสนอราคา" through a catch-all placeholder — this is the live page.
 *
 * Faithful to legacy `forwarder-quotation.php` (home/view/add modes) +
 * `hs-forwarder-invoice.php` quotation mode: a per-quote header (buyer · mode ·
 * ports · incoterm · ยอดรวม VAT) + the quote line items (origin/dest baked into
 * description · mode · container/qty · unit price). Pacred reads the canonical
 * `freight_*` tables — never a rebuilt twin (§0e).
 *
 * RBAC: super | accounting | freight_sales (matches the create-role set of the
 * existing actions). READ-ONLY page (no money write introduced here).
 * §0c: every Supabase read destructures `error` + console.error.
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = ["super", "accounting", "freight_sales"] as const;

const STATUS_CLS: Record<QuoteStatus, string> = {
  draft:            "bg-slate-100 text-slate-700 border-slate-300",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-300",
  approved:         "bg-blue-100 text-blue-700 border-blue-300",
  sent:             "bg-indigo-100 text-indigo-700 border-indigo-300",
  accepted:         "bg-emerald-100 text-emerald-700 border-emerald-300",
  rejected:         "bg-red-100 text-red-700 border-red-300",
  expired:          "bg-gray-100 text-gray-500 border-gray-300",
};

// The status filter pills shown above the table (in workflow order).
const FILTER_TABS: Array<{ key: "all" | QuoteStatus; label: string }> = [
  { key: "all",              label: "ทั้งหมด" },
  { key: "draft",            label: QUOTE_STATUS_LABEL.draft },
  { key: "pending_approval", label: QUOTE_STATUS_LABEL.pending_approval },
  { key: "approved",         label: QUOTE_STATUS_LABEL.approved },
  { key: "sent",             label: QUOTE_STATUS_LABEL.sent },
  { key: "accepted",         label: QUOTE_STATUS_LABEL.accepted },
  { key: "rejected",         label: QUOTE_STATUS_LABEL.rejected },
  { key: "expired",          label: QUOTE_STATUS_LABEL.expired },
];

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function modeLabel(m: string | null): string {
  if (!m) return "—";
  return TRANSPORT_MODE_LABEL[m as TransportMode] ?? m;
}

type QuoteRow = {
  id:                  string;
  quote_no:            string | null;
  status:              QuoteStatus;
  buyer_name_snapshot: string;
  transport_mode:      string;
  port_loading:        string | null;
  port_discharge:      string | null;
  incoterm:            string | null;
  total:               number | null;
  valid_until:         string | null;
  created_at:          string | null;
};

export default async function FreightQuotesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin([...VIEW_ROLES]);

  const sp = await searchParams;
  const activeFilter = (sp.status ?? "all") as "all" | QuoteStatus;
  const validFilter = FILTER_TABS.some((t) => t.key === activeFilter) ? activeFilter : "all";

  const admin = createAdminClient();

  let query = admin
    .from("freight_quotes")
    .select(
      "id, quote_no, status, buyer_name_snapshot, transport_mode, " +
        "port_loading, port_discharge, incoterm, total, valid_until, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (validFilter !== "all") query = query.eq("status", validFilter);

  const { data: rowsRaw, error: rowsErr } = await query;
  if (rowsErr) {
    console.error("[freight-quotes list]", { code: rowsErr.code, message: rowsErr.message });
  }
  const rows = ((rowsRaw ?? []) as unknown) as QuoteRow[];

  // Status counts for the pills (one extra lightweight read over the same window).
  const { data: countRaw, error: countErr } = await admin
    .from("freight_quotes")
    .select("status")
    .limit(2000);
  if (countErr) {
    console.error("[freight-quotes count]", { code: countErr.code, message: countErr.message });
  }
  const counts = new Map<string, number>();
  for (const r of (countRaw ?? []) as Array<{ status: string }>) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    counts.set("all", (counts.get("all") ?? 0) + 1);
  }

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · FREIGHT</p>
        <h1 className="mt-1 text-2xl font-bold">ใบเสนอราคา Freight</h1>
        <p className="text-sm text-muted mt-1">
          ใบเสนอราคาฝั่ง Freight (FCL / LCL / ทางรถ / ทางอากาศ) —
          ต้นทาง · ปลายทาง · โหมดขนส่ง · ตู้/ปริมาณ · ราคา · สถานะ.
        </p>
        <p className="text-[11px] text-muted mt-1">
          สถานะ: ร่าง → รออนุมัติ → อนุมัติแล้ว → ส่งให้ลูกค้า → ลูกค้ายืนยัน / ปฏิเสธ / หมดอายุ ·
          อ้างอิง legacy <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">forwarder-quotation.php</code>
        </p>
      </header>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((t) => {
          const isActive = t.key === validFilter;
          const n = counts.get(t.key) ?? 0;
          return (
            <Link
              key={t.key}
              href={
                t.key === "all"
                  ? "/admin/accounting/freight/quotes"
                  : `/admin/accounting/freight/quotes?status=${t.key}`
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-border bg-white dark:bg-surface text-muted hover:border-primary-200 hover:text-primary-600"
              }`}
            >
              {t.label}
              <span className="ml-1.5 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                {n}
              </span>
            </Link>
          );
        })}
      </div>

      {/* List */}
      <section className="space-y-2">
        <h2 className="font-bold text-sm">📄 รายการใบเสนอราคา ({rows.length})</h2>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">
              ยังไม่มีใบเสนอราคา{validFilter !== "all" ? "ในสถานะนี้" : ""}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">เลขที่</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">โหมด</th>
                    <th className="px-3 py-2">เส้นทาง (POL → POD)</th>
                    <th className="px-3 py-2">Incoterm</th>
                    <th className="px-3 py-2 text-right">ยอดรวม</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2">วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/admin/accounting/freight/quotes/${q.id}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          {q.quote_no ?? "(ร่าง)"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[12px] max-w-[180px] truncate" title={q.buyer_name_snapshot}>
                        {q.buyer_name_snapshot}
                      </td>
                      <td className="px-3 py-2 text-[12px] whitespace-nowrap">{modeLabel(q.transport_mode)}</td>
                      <td className="px-3 py-2 text-[11px] text-muted whitespace-nowrap">
                        {(q.port_loading?.trim() || "—")} → {(q.port_discharge?.trim() || "—")}
                      </td>
                      <td className="px-3 py-2 text-[11px] font-mono">{q.incoterm ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{thb(q.total)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${STATUS_CLS[q.status]}`}>
                          {QUOTE_STATUS_LABEL[q.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted whitespace-nowrap">{fmtDate(q.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted">⇆ เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด</p>
      </section>

      <p className="text-[10px] text-muted">
        📌 หน้านี้แสดงผลใบเสนอราคาจากตาราง <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">freight_quotes</code> โดยตรง ·
        ดูภาพรวมบัญชี Freight ที่{" "}
        <Link href="/admin/accounting/freight" className="text-primary-600 hover:underline">
          /admin/accounting/freight
        </Link>
      </p>
    </main>
  );
}
