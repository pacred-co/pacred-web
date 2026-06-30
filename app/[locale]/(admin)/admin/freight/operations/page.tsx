import { Link } from "@/i18n/navigation";
import { requireAdmin, hasRole } from "@/lib/auth/require-admin";
import { adminListFreightOpsCockpit, type CockpitCard } from "@/actions/admin/freight-ops-cockpit";
import { listJourneyBoard, type JourneyBoardCard } from "@/actions/admin/freight-shipment-workflow";
import {
  JOURNEY_PHASES, JOURNEY_PHASE_LABEL, ISSUE_FLAG_LABEL,
  type JourneyPhase,
} from "@/lib/freight/journey-catalog";
import {
  FREIGHT_OPS_BOARD_COLUMNS, FREIGHT_OPS_BOARD_COLUMN_LABEL,
  type FreightOpsBoardColumn, type FreightOpsStageStatus,
} from "@/lib/validators/freight-ops";
import type { ReactNode } from "react";
// Cost-reveal blur gate (owner ภูม 2026-06-16) — blur ต้นทุน/กำไร until the PIN.
import { CostValue, CostRevealToggle } from "@/components/admin/cost-reveal";

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
  searchParams: Promise<{ column?: string; urgent?: string; q?: string; board?: string; red?: string }>;
}) {
  const { roles } = await requireAdmin([
    "super", "ops", "sales_admin", "accounting", "pricing",
    "freight_sales_manager", "freight_sales",
    "freight_export_manager", "freight_export_cs", "freight_export_doc", "freight_export_clearance",
    "freight_clearance_both",
    "freight_import_manager", "freight_import_cs", "freight_import_doc", "freight_import_clearance",
  ]);

  const spAll = await searchParams;
  const boardMode = spAll.board === "journey" ? "journey" : "stage";

  // ── JOURNEY board (AX-JOB pivot by journey phase · G2/G3) ──
  // Additive view mode: ?board=journey. The default (stage) view keeps the
  // existing PRICING→SALES→DOC→ACC ownership board untouched below.
  if (boardMode === "journey") {
    const jq = spAll.q?.trim() ?? "";
    const redOnly = spAll.red === "1";
    const jr = await listJourneyBoard({ q: jq || null, redOnly });
    return (
      <main className="p-6 lg:p-8 space-y-5 max-w-[1500px]">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
            <h1 className="mt-1 text-2xl font-bold">Freight Operations — เส้นทางงาน (Journey)</h1>
            <p className="text-xs text-muted mt-1">
              งานเฟรทเรียงตามเฟส ต้นทาง → ระหว่างทาง → ปลายทาง · กดการ์ดเพื่อจัดการสถานะแต่ละงาน
            </p>
          </div>
          <Link
            href="/admin/freight/shipments/new"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
          >
            ➕ สร้างงานเฟรท
          </Link>
        </header>

        <BoardModeTabs mode="journey" q={jq} />

        {!jr.ok ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {jr.error}
          </div>
        ) : !jr.data?.schemaReady ? (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-8 text-center text-sm text-amber-700">
            🗺️ ระบบสถานะเส้นทางงาน (Journey) ยังไม่ถูกเปิดใช้ในฐานข้อมูล — รอ migration จากทีม Foundation
          </div>
        ) : (
          <JourneyBoard data={jr.data} q={jq} redOnly={redOnly} />
        )}
      </main>
    );
  }
  // 2026-06-15 (owner "พนักงานไม่ควรเห็นต้นทุน") — the board stays open to all
  // freight roles, but the ต้นทุน/กำไร snapshots are hidden from line staff:
  // only cost-owners + freight MANAGERS see cost. (รายได้/selling stays visible.)
  const canSeeCost = hasRole(roles, [
    "accounting", "pricing", "ops",
    "freight_sales_manager", "freight_import_manager", "freight_export_manager",
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

  if (!res.data) {
    return (
      <main className="p-6 lg:p-8 space-y-4 max-w-7xl">
        <h1 className="text-2xl font-bold">Freight Operations</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          ไม่มีข้อมูล
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

      <BoardModeTabs mode="stage" q={q} />

      {/* Stat bar — counts + operator P&L snapshot totals (NOT authoritative). */}
      {canSeeCost && (
        <div className="flex justify-end -mb-1">
          <CostRevealToggle />
        </div>
      )}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard label="งานทั้งหมด" value={String(stats.total)} />
        <StatCard label="ด่วน 🔴" value={String(stats.urgentCount)} tone="urgent" />
        <StatCard label="เสร็จสิ้น" value={String(stats.byColumn.done)} tone="ok" />
        <StatCard label="รายได้ (snapshot)" value={thb(stats.totalRevenue)} small />
        {canSeeCost && (
          <>
            {/* Blur gate (owner ภูม 2026-06-16) — ต้นทุน/กำไร blurred until PIN. */}
            <StatCard label="ต้นทุน (snapshot)" value={<CostValue>{thb(stats.totalCost)}</CostValue>} small />
            <StatCard
              label="กำไร (snapshot)"
              value={<CostValue>{thb(stats.totalProfit)}</CostValue>}
              small
              tone={stats.totalProfit >= 0 ? "ok" : "urgent"}
            />
          </>
        )}
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
          ทั้งหมด <span className="ml-1 text-[11px]">({stats.total})</span>
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
              <span className="ml-1 text-[11px] opacity-75">({stats.byColumn[col]})</span>
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
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[11px]">{grouped[col].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[col].length === 0 ? (
                  <p className="px-1 py-3 text-center text-[11px] text-muted">— ว่าง —</p>
                ) : (
                  grouped[col].map((c) => <JobCard key={c.shipmentId} card={c} canSeeCost={canSeeCost} />)
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
  value: ReactNode;
  small?: boolean;
  tone?: "ok" | "urgent";
}) {
  const valueCls =
    tone === "urgent" ? "text-red-600" : tone === "ok" ? "text-green-700" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 font-bold tabular-nums ${small ? "text-base" : "text-xl"} ${valueCls}`}>{value}</p>
    </div>
  );
}

function JobCard({ card, canSeeCost }: { card: CockpitCard; canSeeCost: boolean }) {
  return (
    <Link
      href={`/admin/freight/operations/${card.shipmentId}`}
      className="block rounded-xl border border-border bg-white dark:bg-surface p-2.5 shadow-sm hover:shadow-md hover:border-primary-300 transition"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-semibold text-primary-700">{card.jobNo ?? "—"}</span>
        {card.isUrgent && <span className="text-[11px] font-bold text-red-600">🔴 ด่วน</span>}
      </div>
      <p className="mt-1 text-sm font-medium leading-snug line-clamp-1">{card.customerName}</p>
      <p className="text-[11px] text-muted">
        {card.memberCode ? `${card.memberCode} · ` : ""}{card.transportModeLabel}
      </p>
      {card.containerCode && (
        <p className="font-mono text-[11px] text-muted">{card.containerCode}</p>
      )}

      {/* 4-stage status dots */}
      <div className="mt-2 flex items-center gap-2">
        <StageDot label="P" s={card.pricingStatus} />
        <StageDot label="S" s={card.salesStatus} />
        <StageDot label="D" s={card.docsStatus} />
        <StageDot label="A" s={card.accStatus} />
        <span className="ml-auto rounded-full bg-surface-alt px-1.5 py-0.5 text-[11px] text-muted">
          {card.shipmentStatusLabel}
        </span>
      </div>

      {/* P&L snapshot mini-line (display-only) — cost/profit hidden from line
          staff (owner 2026-06-15 "ไม่ควรเห็นต้นทุน"). */}
      {canSeeCost && (card.revenueSnapshot != null || card.costSnapshot != null) && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted tabular-nums">
          <span>กำไร snap:</span>
          <span className={card.profitSnapshot != null && card.profitSnapshot < 0 ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>
            <CostValue>{thb(card.profitSnapshot)}</CostValue>
          </span>
        </div>
      )}
    </Link>
  );
}

function StageDot({ label, s }: { label: string; s: FreightOpsStageStatus }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
      <span className={`h-2 w-2 rounded-full ${stageDot(s)}`} aria-hidden />
      {label}
    </span>
  );
}

// ── View-mode tabs: AX-JOB (ownership) vs Journey (transport phase) ──
function BoardModeTabs({ mode, q }: { mode: "stage" | "journey"; q: string }) {
  const stageHref = `/admin/freight/operations${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const journeyHref = `/admin/freight/operations?board=journey${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <nav className="flex gap-2 border-b border-border">
      <Link
        href={stageHref}
        className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold ${
          mode === "stage"
            ? "border-x border-t border-border bg-white dark:bg-surface text-primary-700"
            : "text-muted hover:text-foreground"
        }`}
      >
        🗂️ AX JOB (ฝ่ายงาน)
      </Link>
      <Link
        href={journeyHref}
        className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold ${
          mode === "journey"
            ? "border-x border-t border-border bg-white dark:bg-surface text-primary-700"
            : "text-muted hover:text-foreground"
        }`}
      >
        🗺️ เส้นทางงาน (Journey)
      </Link>
    </nav>
  );
}

// ── The journey-phase board (columns = phases · cards = shipments · RED highlight) ──
const JOURNEY_PHASE_ACCENT: Record<JourneyPhase, string> = {
  origin:      "border-emerald-200 bg-emerald-50/40 text-emerald-800",
  transit:     "border-blue-200 bg-blue-50/40 text-blue-800",
  destination: "border-purple-200 bg-purple-50/40 text-purple-800",
  internal:    "border-amber-200 bg-amber-50/40 text-amber-800",
  terminal:    "border-gray-200 bg-gray-50/40 text-gray-700",
};

function JourneyBoard({
  data, q, redOnly,
}: {
  data: { cards: JourneyBoardCard[]; byPhase: Record<JourneyPhase, number>; redCount: number };
  q: string;
  redOnly: boolean;
}) {
  // The 3 customer-meaningful phases + the 2 internal end phases.
  const phasesToRender = JOURNEY_PHASES.filter((p) => p !== "terminal");
  const grouped: Record<JourneyPhase, JourneyBoardCard[]> = {
    origin: [], transit: [], destination: [], internal: [], terminal: [],
  };
  for (const c of data.cards) grouped[c.phase].push(c);

  const redHref = `/admin/freight/operations?board=journey${q ? `&q=${encodeURIComponent(q)}` : ""}${redOnly ? "" : "&red=1"}`;

  return (
    <>
      {/* Stat strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard label="งานทั้งหมด" value={String(data.cards.length)} />
        <StatCard label="ติดปัญหา 🔴" value={String(data.redCount)} tone={data.redCount > 0 ? "urgent" : undefined} />
        {(["origin", "transit", "destination"] as JourneyPhase[]).map((p) => (
          <StatCard key={p} label={JOURNEY_PHASE_LABEL[p]} value={String(data.byPhase[p])} small />
        ))}
      </section>

      {/* Search + red filter */}
      <form className="flex flex-wrap gap-2" action="/admin/freight/operations" method="get">
        <input type="hidden" name="board" value="journey" />
        {redOnly && <input type="hidden" name="red" value="1" />}
        <input
          name="q"
          placeholder="ค้นหา: job_no, container code"
          defaultValue={q}
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
        <Link
          href={redHref}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            redOnly ? "border-red-300 bg-red-50 text-red-700" : "bg-white text-foreground border-border hover:bg-surface-alt"
          }`}
        >
          🔴 ติดปัญหาเท่านั้น
        </Link>
      </form>

      {/* Phase columns */}
      {data.cards.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center space-y-2">
          <div className="text-4xl" aria-hidden>📋</div>
          <p className="text-sm font-medium">ไม่มีงานเฟรทในมุมมองนี้</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
          {phasesToRender.map((phase) => (
            <div key={phase} className={`rounded-2xl border ${JOURNEY_PHASE_ACCENT[phase]} p-2.5 min-h-[120px]`}>
              <div className="flex items-center justify-between px-1 pb-2 text-xs font-bold">
                <span>{JOURNEY_PHASE_LABEL[phase]}</span>
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[11px]">{grouped[phase].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[phase].length === 0 ? (
                  <p className="px-1 py-3 text-center text-[11px] text-muted">— ว่าง —</p>
                ) : (
                  grouped[phase].map((c) => <JourneyJobCard key={c.shipmentId} card={c} />)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function JourneyJobCard({ card }: { card: JourneyBoardCard }) {
  const red = card.issueFlag !== "none";
  return (
    <Link
      href={`/admin/freight/shipments/${card.shipmentId}`}
      className={`block rounded-xl border bg-white dark:bg-surface p-2.5 shadow-sm hover:shadow-md transition ${
        red ? "border-red-300 ring-1 ring-red-200" : "border-border hover:border-primary-300"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-semibold text-primary-700">{card.jobNo ?? "—"}</span>
        {red && <span className="text-[11px] font-bold text-red-600">🔴</span>}
      </div>
      <p className="mt-1 text-sm font-medium leading-snug line-clamp-1">{card.customerName}</p>
      <p className="text-[11px] text-muted">
        {card.memberCode ? `${card.memberCode} · ` : ""}{card.modeLabel}
      </p>
      {card.containerCode && <p className="font-mono text-[11px] text-muted">{card.containerCode}</p>}
      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          {card.journeyLabel}
        </span>
      </div>
      {red && (
        <p className="mt-1 text-[11px] font-medium text-red-700 line-clamp-1">
          {ISSUE_FLAG_LABEL[card.issueFlag]}{card.issueNote ? ` — ${card.issueNote}` : ""}
        </p>
      )}
    </Link>
  );
}
