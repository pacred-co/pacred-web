import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportContainerCostsAll } from "@/actions/admin/export/acc-container-costs";
import { ContainerCostForm } from "./container-cost-form";
import { ContainerCostRowControls } from "./container-cost-row-controls";

/**
 * /admin/accounting/container-costs — U2-2 rate-card list.
 *
 * Per UPGRADE_PLAN §2 U2-2 + research G-1: carrier rate-card surface.
 * Lists container_costs with filters (carrier, mode, status), an
 * inline "add new" form, and edit/archive row controls.
 *
 * RBAC: super OR accounting (page-level + RLS).
 */

type SP = {
  carrier?: string;
  mode?:    string;
  active?:  string;   // "all" | "active" | "archived"
  page?:    string;
};

function thb(n: number | string | null) {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ", sea: "🚢 เรือ", air: "✈️ เครื่องบิน",
};

export default async function AdminContainerCostsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Carrier COST rate cards (per-CBM / per-kg / min / fuel) = money-internal
  // (owner 2026-06-18): only ultra/accounting/pricing. Page stays reachable;
  // the cost-rate columns + CSV + the cost-entry form drop for everyone else.
  const showMoney = canViewCostProfit(roles);

  const sp = await searchParams;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  let q = admin
    .from("container_costs")
    .select(`
      id, carrier_name, transport_mode, origin, destination, container_type,
      rate_per_cbm_thb, rate_per_kg_thb, minimum_charge_thb, fuel_surcharge_pct,
      effective_from, effective_to, source, note, created_at
    `, { count: "exact" })
    .order("carrier_name", { ascending: true })
    .order("effective_from", { ascending: false })
    .range(from, to);

  if (sp.carrier)               q = q.ilike("carrier_name", `%${sp.carrier}%`);
  if (sp.mode && sp.mode !== "all") q = q.eq("transport_mode", sp.mode);
  const activeFilter = sp.active ?? "active";
  if (activeFilter === "active") {
    q = q.or(`effective_to.is.null,effective_to.gte.${today}`);
  } else if (activeFilter === "archived") {
    q = q.not("effective_to", "is", null).lt("effective_to", today);
  }

  const { data: rowsRaw, error: rowsRawErr, count } = await q;
  if (rowsRawErr) {
    console.error(`[container_costs list] failed`, { code: rowsRawErr.code, message: rowsRawErr.message });
  }
  type Row = {
    id: string; carrier_name: string; transport_mode: string;
    origin: string; destination: string; container_type: string;
    rate_per_cbm_thb: number | string | null; rate_per_kg_thb: number | string | null;
    minimum_charge_thb: number | string | null; fuel_surcharge_pct: number | string | null;
    effective_from: string; effective_to: string | null;
    source: string; note: string | null; created_at: string;
  };
  const rows = (rowsRaw ?? []) as Row[];

  // CSV export — columns mirror the on-screen rate-card table (money as
  // fixed-2 strings, dates sliced to YYYY-MM-DD, codes/labels as-is).
  // CSV cost-rate columns dropped server-side for non-cost viewers (data-layer).
  const costCsvCols: CsvCol[] = showMoney
    ? [
        { key: "rate_per_cbm_thb", label: "ต่อ CBM (บาท)" },
        { key: "rate_per_kg_thb", label: "ต่อ kg (บาท)" },
        { key: "minimum_charge_thb", label: "ขั้นต่ำ (บาท)" },
        { key: "fuel_surcharge_pct", label: "fuel %" },
      ]
    : [];
  const csvCols: CsvCol[] = [
    { key: "carrier_name", label: "carrier" },
    { key: "container_type", label: "ประเภทตู้" },
    { key: "source", label: "source" },
    { key: "transport_mode", label: "mode" },
    { key: "origin", label: "ต้นทาง" },
    { key: "destination", label: "ปลายทาง" },
    ...costCsvCols,
    { key: "effective_from", label: "ใช้ตั้งแต่" },
    { key: "effective_to", label: "ใช้ถึง" },
    { key: "status", label: "สถานะ" },
    { key: "note", label: "หมายเหตุ" },
    { key: "created_at", label: "สร้างเมื่อ" },
  ];
  const csvRows: CsvRow[] = rows.map((r) => {
    const archived = r.effective_to != null && r.effective_to < today;
    return {
      carrier_name: r.carrier_name,
      container_type: r.container_type,
      source: r.source,
      transport_mode: TRANSPORT_LABEL[r.transport_mode] ?? r.transport_mode,
      origin: r.origin,
      destination: r.destination,
      ...(showMoney
        ? {
            rate_per_cbm_thb: r.rate_per_cbm_thb != null ? Number(r.rate_per_cbm_thb).toFixed(2) : "",
            rate_per_kg_thb: r.rate_per_kg_thb != null ? Number(r.rate_per_kg_thb).toFixed(2) : "",
            minimum_charge_thb: r.minimum_charge_thb != null ? Number(r.minimum_charge_thb).toFixed(2) : "",
            fuel_surcharge_pct: r.fuel_surcharge_pct != null ? Number(r.fuel_surcharge_pct).toFixed(2) : "",
          }
        : {}),
      effective_from: r.effective_from ? r.effective_from.slice(0, 10) : "",
      effective_to: r.effective_to ? r.effective_to.slice(0, 10) : "",
      status: archived ? "ปิดแล้ว" : "กำลังใช้",
      note: r.note ?? "",
      created_at: r.created_at ? r.created_at.slice(0, 10) : "",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Reference-only banner — this surface is a dead-write (see rate/cost
          wiring audit). It writes the rebuilt `container_costs` table, which
          no margin/P&L/price engine reads. The real cost-basis for margin is
          tb_forwarder.fcosttotalprice, set per-ตู้ on the report-cnt editor. */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">⚠️ หน้านี้เป็นข้อมูลอ้างอิง / บันทึกภายในเท่านั้น</p>
        <p className="mt-1">
          rate card ที่บันทึกตรงนี้ <strong>ยังไม่ถูกเชื่อมเข้าระบบคำนวณ margin / กำไรจริง</strong> —
          ต้นทุนที่ระบบใช้คิดกำไรจริงตั้งที่หน้า{" "}
          <strong>report-cnt</strong> ของแต่ละตู้ (เก็บใน{" "}
          <code className="rounded bg-amber-100 px-1 text-xs">tb_forwarder.fcosttotalprice</code>).
          การเพิ่ม / แก้ rate card ที่นี่ยังไม่กระทบการคำนวณราคาหรือกำไร.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ACCOUNTING</p>
          <h1 className="mt-1 text-2xl font-bold">Carrier rate cards (container_costs)</h1>
          <p className="mt-1 text-sm text-muted">
            U2-2: ราคาที่ carrier เก็บกับ Pacred ต่อตู้/ต่อ route — ใช้เป็น cost basis คำนวณ margin
          </p>
        </div>
        <CsvButton
          rows={csvRows}
          cols={csvCols}
          filename="container-costs.csv"
          fetchAll={async () => {
            "use server";
            return exportContainerCostsAll({
              carrier: sp.carrier,
              mode: sp.mode,
              active: activeFilter,
            });
          }}
        />
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <label className="text-xs space-y-1">
          <span className="block font-medium">carrier</span>
          <input
            name="carrier"
            defaultValue={sp.carrier ?? ""}
            placeholder="MOMO / COSCO / TTP"
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm w-44"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="block font-medium">mode</span>
          <select
            name="mode"
            defaultValue={sp.mode ?? "all"}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          >
            <option value="all">— ทั้งหมด —</option>
            <option value="truck">🚚 รถ</option>
            <option value="sea">🚢 เรือ</option>
            <option value="air">✈️ เครื่องบิน</option>
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="block font-medium">สถานะ</span>
          <select
            name="active"
            defaultValue={activeFilter}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          >
            <option value="active">ใช้งานอยู่</option>
            <option value="archived">ปิดใช้แล้ว</option>
            <option value="all">ทั้งหมด</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
          กรอง
        </button>
      </form>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Rate-card list */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold text-sm">รายการ rate card ({rows.length})</h2>
          </div>
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ยังไม่มี rate card ตามฟิลเตอร์ — ใช้ฟอร์มขวามือเพื่อเพิ่ม
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3">carrier · type</th>
                    <th className="px-3 py-3">mode · route</th>
                    {showMoney && <th className="px-3 py-3 text-right">/ CBM</th>}
                    {showMoney && <th className="px-3 py-3 text-right">/ kg</th>}
                    {showMoney && <th className="px-3 py-3 text-right">min · fuel</th>}
                    <th className="px-3 py-3">ใช้ตั้งแต่</th>
                    <th className="px-3 py-3">การกระทำ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const archived = r.effective_to && r.effective_to < today;
                    return (
                      <tr key={r.id} className={`border-t border-border ${archived ? "opacity-60" : "hover:bg-surface-alt/30"}`}>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-mono font-medium">{r.carrier_name}</div>
                          <div className="text-muted">{r.container_type}</div>
                          {r.source !== "manual" && (
                            <div className="text-[11px] uppercase text-muted">[{r.source}]</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div>{TRANSPORT_LABEL[r.transport_mode] ?? r.transport_mode}</div>
                          <div className="text-muted">{r.origin} → {r.destination}</div>
                        </td>
                        {showMoney && <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.rate_per_cbm_thb)}</td>}
                        {showMoney && <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.rate_per_kg_thb)}</td>}
                        {showMoney && (
                          <td className="px-3 py-3 text-right text-xs">
                            {r.minimum_charge_thb != null && (
                              <div className="font-mono text-muted">min {thb(r.minimum_charge_thb)}</div>
                            )}
                            {r.fuel_surcharge_pct != null && Number(r.fuel_surcharge_pct) > 0 && (
                              <div className="text-amber-700">+ {Number(r.fuel_surcharge_pct).toFixed(2)}%</div>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                          {new Date(r.effective_from).toLocaleDateString("th-TH")}
                          {r.effective_to && (
                            <div className="text-[11px]">→ {new Date(r.effective_to).toLocaleDateString("th-TH")}</div>
                          )}
                          {!r.effective_to && <div className="text-[11px] text-green-700">กำลังใช้</div>}
                          {archived && <div className="text-[11px] text-red-700">ปิดแล้ว</div>}
                        </td>
                        <td className="px-3 py-3">
                          <ContainerCostRowControls
                            id={r.id}
                            isActive={!archived}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 pb-4">
            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={count ?? 0}
              basePath="/admin/accounting/container-costs"
              params={{ carrier: sp.carrier, mode: sp.mode, active: sp.active }}
            />
          </div>
        </div>

        {/* Add new form — cost-entry surface, only for cost-allowed viewers */}
        <aside className="space-y-4">
          {showMoney ? (
            <ContainerCostForm />
          ) : (
            <div className="rounded-2xl border border-border bg-surface-alt/40 p-5 text-xs text-muted">
              การเพิ่ม / แก้ rate card (ต้นทุน carrier) จำกัดเฉพาะฝ่ายบัญชี / pricing.
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
