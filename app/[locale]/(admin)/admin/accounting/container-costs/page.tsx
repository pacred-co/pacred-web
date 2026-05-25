import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
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
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  let q = admin
    .from("container_costs")
    .select(`
      id, carrier_name, transport_mode, origin, destination, container_type,
      rate_per_cbm_thb, rate_per_kg_thb, minimum_charge_thb, fuel_surcharge_pct,
      effective_from, effective_to, source, note, created_at
    `)
    .order("carrier_name", { ascending: true })
    .order("effective_from", { ascending: false })
    .limit(500);

  if (sp.carrier)               q = q.ilike("carrier_name", `%${sp.carrier}%`);
  if (sp.mode && sp.mode !== "all") q = q.eq("transport_mode", sp.mode);
  const activeFilter = sp.active ?? "active";
  if (activeFilter === "active") {
    q = q.or(`effective_to.is.null,effective_to.gte.${today}`);
  } else if (activeFilter === "archived") {
    q = q.not("effective_to", "is", null).lt("effective_to", today);
  }

  const { data: rowsRaw, error: rowsRawErr } = await q;
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

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ACCOUNTING</p>
        <h1 className="mt-1 text-2xl font-bold">Carrier rate cards (container_costs)</h1>
        <p className="mt-1 text-sm text-muted">
          U2-2: ราคาที่ carrier เก็บกับ Pacred ต่อตู้/ต่อ route — ใช้เป็น cost basis คำนวณ margin
        </p>
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
                    <th className="px-3 py-3 text-right">/ CBM</th>
                    <th className="px-3 py-3 text-right">/ kg</th>
                    <th className="px-3 py-3 text-right">min · fuel</th>
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
                            <div className="text-[10px] uppercase text-muted">[{r.source}]</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div>{TRANSPORT_LABEL[r.transport_mode] ?? r.transport_mode}</div>
                          <div className="text-muted">{r.origin} → {r.destination}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.rate_per_cbm_thb)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.rate_per_kg_thb)}</td>
                        <td className="px-3 py-3 text-right text-xs">
                          {r.minimum_charge_thb != null && (
                            <div className="font-mono text-muted">min {thb(r.minimum_charge_thb)}</div>
                          )}
                          {r.fuel_surcharge_pct != null && Number(r.fuel_surcharge_pct) > 0 && (
                            <div className="text-amber-700">+ {Number(r.fuel_surcharge_pct).toFixed(2)}%</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                          {new Date(r.effective_from).toLocaleDateString("th-TH")}
                          {r.effective_to && (
                            <div className="text-[10px]">→ {new Date(r.effective_to).toLocaleDateString("th-TH")}</div>
                          )}
                          {!r.effective_to && <div className="text-[10px] text-green-700">กำลังใช้</div>}
                          {archived && <div className="text-[10px] text-red-700">ปิดแล้ว</div>}
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
        </div>

        {/* Add new form */}
        <aside className="space-y-4">
          <ContainerCostForm />
        </aside>
      </div>
    </main>
  );
}
