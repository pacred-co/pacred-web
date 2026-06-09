import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminListFreightOpsCockpit, type CockpitCard } from "@/actions/admin/freight-ops-cockpit";
import {
  FREIGHT_OPS_BOARD_COLUMNS, FREIGHT_OPS_BOARD_COLUMN_LABEL,
  type FreightOpsBoardColumn, type FreightOpsStageStatus,
} from "@/lib/validators/freight-ops";

/**
 * W4 — Freight Ops Cockpit (AX JOB) Kanban board.
 *
 * A unified PRICING→SALES→DOC→ACC view over the existing freight spine
 * (freight_shipments). Read-mostly: cards are clickable into the per-job
 * detail where stage status / assignment / checklist / cost-snapshot are
 * managed. Owns NO money — the P&L totals in the stat bar are operator
 * snapshots, NOT authoritative figures.
 *
 * Roles: super + freight section roles + ops/accounting/sales_admin/pricing.
 */

export const dynamic = "force-dynamic";

const COL_ACCENT: Record<FreightOpsBoardColumn, string> = {
  pricing:     "border-emerald-200 bg-emerald-50/40",
  sales:       "border-blue-200 bg-blue-50/40",
  docs:        "border-purple-200 bg-purple-50/40",
  acc:         "border-amber-200 bg-amber-50/40",
  in_progress: "border-cyan-200 bg-cyan-50/40",
  done:        "border-green-200 bg-green-50/40",
};
const COL_HEAD: Record<FreightOpsBoardColumn, string> = {
  pricing:     "text-emerald-800",
  sales:       "text-blue-800",
  docs:        "text-purple-800",
  acc:         "text-amber-800",
  in_progress: "text-cyan-800",
  done:        "text-green-800",
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stageDot(s: FreightOpsStageStatus): string {
  if (s === "done") return "bg-green-500";
  if (s === "in_progress") return "bg-amber-400";
  return "bg-gray-300";
}

export default async function FreightOperationsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ column?: string; urgent?: string; q?: string }>;
}) {
  await requireAdmin([
    "super", "ops", "sales_admin", "accounting", "pricing",
    "freight_sales_manager", "freight_sales",
    "freight_export_manager", "freight_export_cs", "freight_export_doc", "freight_export_clearance",
    "freight_clearance_both",
    "freight_import_manager", "freight_import_cs", "freight_import_doc", "freight_import_clearance",
  ]);

  const sp = await searchParams;
  const activeColumn = (FREIGHT_OPS_BOARD_COLUMNS as readonly string[]).includes(sp.column ?? "")
    ? (sp.column as FreightOpsBoardColumn)
    : null;
  const urgentOnly = sp.urgent === "1";
  const q = sp.q?.trim() ?? "";

  const res = await adminListFreightOpsCockpit({ column: activeColumn, urgentOnly, q: q || null });

  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 space-y-4 max-w-7xl">
        <h1 className="text-2xl font-bold">Freight Operations</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      </main>
    );
  }

  const { cards, stats } = res.data;

  // Group cards by board column for the columns layout.
  const grouped: Record<FreightOpsBoardColumn, CockpitCard[]> = {
    pricing: [], sales: [], docs: [], acc: [], in_progress: [], done: [],
  };
  for (const c of cards) grouped[c.column].push(c);

  // When a column filter is active, only show that column; otherwise show the
  // 4 active stages + DONE (in_progress is the synthetic catch-all, but
  // deriveBoardColumn already routes every active card to its current stage,
  // so the IN-PROGRESS column stays empty in practice — we keep its pill as a
  // count but hide its column unless filtered).
  const columnsToRender: FreightOpsBoardColumn[] = activeColumn
    ? [activeColumn]
    : ["pricing", "sales", "docs", "acc", "done"];

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-[1500px]">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold">Freight Operations (AX JOB)</h1>
          <p className="text-xs text-muted mt-1">
            งานเฟรททั้งหมด · ขั้นตอน PRICING → SALES → DOC → ACC · กดการ์ดเพื่อจัดการแต่ละงาน
          </p>
        </div>
        <Link
          href="/admin/freight/shipments/new"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          ➕ สร้างงานเฟรท
        </Link>
      </header>

      {/* Stat bar — counts + operator P&L snapshot totals (NOT authoritative). */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard label="งานทั้งหมด" value={String(stats.total)} />
        <StatCard label="ด่วน 🔴" value={String(stats.urgentCount)} tone="urgent" />
        <StatCard label="เสร็จสิ้น" value={String(stats.byColumn.done)} tone="ok" />
        <StatCard label="รายได้ (snapshot)" value={thb(stats.totalRevenue)} small />
        <StatCard label="ต้นทุน (snapshot)" value={thb(stats.totalCost)} small />
        <StatCard
          label="กำไร (snapshot)"
          value={thb(stats.totalProfit)}
          small
          tone={stats.totalProfit >= 0 ? "ok" : "urgent"}
        />
      </section>
      <p className="text-[11px] text-muted -mt-2">
        ⚠️ ตัวเลข P&amp;L = snapshot ที่เจ้าหน้าที่กรอกในแต่ละงาน (แสดงผลเท่านั้น · ไม่ใช่ยอดเงินจริงในระบบบิล/ภาษี)
      </p>

      {/* Search */}
      <form className="flex gap-2" action="/admin/freight/operations" method="get">
        {activeColumn && <input type="hidden" name="column" value={activeColumn} />}
        {urgentOnly && <input type="hidden" name="urgent" value="1" />}
        <input
          name="q"
          placeholder="ค้นหา: job_no, container code"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Filter pills */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href={`/admin/freight/operations${urgentOnly ? "?urgent=1" : ""}`}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            activeColumn === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({stats.total})</span>
        </Link>
        {FREIGHT_OPS_BOARD_COLUMNS.map((col) => {
          const params = new URLSearchParams();
          params.set("column", col);
          if (urgentOnly) params.set("urgent", "1");
          if (q) params.set("q", q);
          return (
            <Link
              key={col}
              href={`/admin/freight/operations?${params.toString()}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                col === activeColumn
                  ? `${COL_ACCENT[col]} ${COL_HEAD[col]}`
                  : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {FREIGHT_OPS_BOARD_COLUMN_LABEL[col]}{" "}
              <span className="ml-1 text-[10px] opacity-75">({stats.byColumn[col]})</span>
            </Link>
          );
        })}
        <Link
          href={`/admin/freight/operations?${(() => {
            const params = new URLSearchParams();
            if (activeColumn) params.set("column", activeColumn);
            if (q) params.set("q", q);
            if (!urgentOnly) params.set("urgent", "1");
            return params.toString();
          })()}`}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            urgentOnly ? "border-red-300 bg-red-50 text-red-700" : "bg-white text-foreground border-border hover:bg-surface-alt"
          }`}
        >
          🔴 ด่วนเท่านั้น
        </Link>
      </nav>

      {/* Kanban columns */}
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center space-y-2">
          <div className="text-4xl" aria-hidden>📋</div>
          <p className="text-sm font-medium">ไม่มีงานเฟรทในมุมมองนี้</p>
          <p className="text-xs text-muted">
            งานเฟรทมาจาก quote ที่ accepted หรือสร้างตรงที่หน้า shipments
          </p>
        </div>
      ) : (
        <div className={`grid gap-3 ${activeColumn ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-5"}`}>
          {columnsToRender.map((col) => (
            <div key={col} className={`rounded-2xl border ${COL_ACCENT[col]} p-2.5 min-h-[120px]`}>
              <div className={`flex items-center justify-between px-1 pb-2 text-xs font-bold ${COL_HEAD[col]}`}>
                <span>{FREIGHT_OPS_BOARD_COLUMN_LABEL[col]}</span>
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px]">{grouped[col].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[col].length === 0 ? (
                  <p className="px-1 py-3 text-center text-[11px] text-muted">— ว่าง —</p>
                ) : (
                  grouped[col].map((c) => <JobCard key={c.shipmentId} card={c} />)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function StatCard({
  label, value, small, tone,
}: {
  label: string;
  value: string;
  small?: boolean;
  tone?: "ok" | "urgent";
}) {
  const valueCls =
    tone === "urgent" ? "text-red-600" : tone === "ok" ? "text-green-700" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 font-bold tabular-nums ${small ? "text-base" : "text-xl"} ${valueCls}`}>{value}</p>
    </div>
  );
}

function JobCard({ card }: { card: CockpitCard }) {
  return (
    <Link
      href={`/admin/freight/operations/${card.shipmentId}`}
      className="block rounded-xl border border-border bg-white dark:bg-surface p-2.5 shadow-sm hover:shadow-md hover:border-primary-300 transition"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-semibold text-primary-700">{card.jobNo ?? "—"}</span>
        {card.isUrgent && <span className="text-[10px] font-bold text-red-600">🔴 ด่วน</span>}
      </div>
      <p className="mt-1 text-sm font-medium leading-snug line-clamp-1">{card.customerName}</p>
      <p className="text-[10px] text-muted">
        {card.memberCode ? `${card.memberCode} · ` : ""}{card.transportModeLabel}
      </p>
      {card.containerCode && (
        <p className="font-mono text-[10px] text-muted">{card.containerCode}</p>
      )}

      {/* 4-stage status dots */}
      <div className="mt-2 flex items-center gap-2">
        <StageDot label="P" s={card.pricingStatus} />
        <StageDot label="S" s={card.salesStatus} />
        <StageDot label="D" s={card.docsStatus} />
        <StageDot label="A" s={card.accStatus} />
        <span className="ml-auto rounded-full bg-surface-alt px-1.5 py-0.5 text-[9px] text-muted">
          {card.shipmentStatusLabel}
        </span>
      </div>

      {/* P&L snapshot mini-line (display-only) */}
      {(card.revenueSnapshot != null || card.costSnapshot != null) && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted tabular-nums">
          <span>กำไร snap:</span>
          <span className={card.profitSnapshot != null && card.profitSnapshot < 0 ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>
            {thb(card.profitSnapshot)}
          </span>
        </div>
      )}
    </Link>
  );
}

function StageDot({ label, s }: { label: string; s: FreightOpsStageStatus }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] text-muted">
      <span className={`h-2 w-2 rounded-full ${stageDot(s)}`} aria-hidden />
      {label}
    </span>
  );
}
