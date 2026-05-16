import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * /admin/warehouse/qa-inspections — V-E10 list view.
 *
 * Shows all recorded QA inspections + a "pending" queue (arrived cargo
 * shipments that have NO inspection yet — those are blocked from billing
 * once V-E7 lands).
 *
 * Roles: super, accounting, warehouse (per ADR-0005 K-7).
 *
 * Per port-spec docs/port-specs/freight-qa-qc-inspection.md.
 */

export const dynamic = "force-dynamic";

const OUTCOME_BADGE: Record<string, string> = {
  pass:        "bg-green-50 text-green-700 border-green-200",
  fail_minor:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  fail_major:  "bg-red-50 text-red-700 border-red-200",
  waived:      "bg-gray-50 text-gray-600 border-gray-200",
};
const OUTCOME_LABEL: Record<string, string> = {
  pass:       "✅ ผ่าน",
  fail_minor: "⚠️ ผิดเล็กน้อย",
  fail_major: "🚨 ผิดสำคัญ",
  waived:     "ℹ️ ยกเว้น",
};
const DAMAGE_LABEL: Record<string, string> = {
  none:      "ไม่มี",
  cosmetic:  "เล็กน้อย (cosmetic)",
  partial:   "บางส่วน (partial)",
  total:     "เสียทั้งหมด (total)",
};

type Inspection = {
  id:                 string;
  inspection_no:      string;
  cargo_shipment_id:  string | null;
  outcome:            "pass" | "fail_minor" | "fail_major" | "waived";
  damage_level:       string | null;
  missing_items:      number;
  inspected_at:       string;
  customer_notified_at: string | null;
  cargo_shipment: {
    shipment_code: string;
    status:        string;
    profile: {
      member_code: string | null;
      first_name:  string | null;
      last_name:   string | null;
    } | null;
  } | null;
};

type PendingShipment = {
  id:             string;
  shipment_code:  string;
  status:         string;
  created_at:     string;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
};

export default async function AdminQaInspectionsListPage() {
  await requireAdmin(["super", "accounting", "warehouse"]);
  const admin = createAdminClient();

  // Recent inspections (most recent 100).
  const { data: inspectionsRaw } = await admin
    .from("freight_qa_inspections")
    .select(`
      id, inspection_no, cargo_shipment_id, outcome, damage_level, missing_items,
      inspected_at, customer_notified_at,
      cargo_shipment:cargo_shipments!cargo_shipment_id (
        shipment_code, status,
        profile:profiles!profile_id ( member_code, first_name, last_name )
      )
    `)
    .order("inspected_at", { ascending: false })
    .limit(100);

  // Normalise array vs object for FK joins. Supabase typing inconsistently
  // returns arrays even for FK→one relationships; cast via unknown for safety.
  type Raw = Omit<Inspection, "cargo_shipment"> & {
    cargo_shipment:
      | (NonNullable<Inspection["cargo_shipment"]> | (NonNullable<Inspection["cargo_shipment"]>[]))
      | null;
  };
  const inspections: Inspection[] = ((inspectionsRaw ?? []) as unknown as Raw[]).map((r) => {
    const cs = Array.isArray(r.cargo_shipment) ? r.cargo_shipment[0] ?? null : r.cargo_shipment;
    const profile = cs && Array.isArray(cs.profile) ? cs.profile[0] ?? null : cs?.profile ?? null;
    return {
      ...r,
      cargo_shipment: cs ? { ...cs, profile } : null,
    } as Inspection;
  });

  // Pending queue — arrived_th shipments WITHOUT any inspection.
  const inspectedShipmentIds = inspections
    .map((i) => i.cargo_shipment_id)
    .filter((x): x is string => !!x);

  let pendingQuery = admin
    .from("cargo_shipments")
    .select(`
      id, shipment_code, status, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name )
    `)
    .eq("status", "arrived_th")
    .order("created_at", { ascending: false })
    .limit(50);

  // Only filter when there ARE inspected IDs (Supabase rejects empty arrays
  // in `.not('id','in','(...)')` syntax).
  if (inspectedShipmentIds.length > 0) {
    pendingQuery = pendingQuery.not("id", "in", `(${inspectedShipmentIds.join(",")})`);
  }
  const { data: pendingRaw } = await pendingQuery;

  type RawPending = Omit<PendingShipment, "profile"> & {
    profile: PendingShipment["profile"] | PendingShipment["profile"][];
  };
  const pending: PendingShipment[] = ((pendingRaw ?? []) as unknown as RawPending[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold">การตรวจคุณภาพ (QA/QC) คลัง</h1>
        <p className="text-xs text-muted mt-1">
          บันทึกการตรวจคลังก่อนส่งมอบ — gate การออกใบกำกับภาษีค่าขนส่ง (V-E7)
        </p>
      </header>

      {/* Pending queue */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-sm">
            🕓 คิวรอตรวจ ({pending.length})
            <span className="text-[10px] text-muted font-normal ml-2">
              — cargo shipments ที่ถึงไทยแล้ว แต่ยังไม่มี inspection
            </span>
          </h2>
        </div>
        {pending.length === 0 ? (
          <p className="text-xs text-muted">ไม่มีคิวรอตรวจ</p>
        ) : (
          <ul className="divide-y divide-amber-200">
            {pending.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm">{s.shipment_code}</p>
                  <p className="text-xs text-muted">
                    {s.profile?.member_code} · {s.profile?.first_name} {s.profile?.last_name} ·{" "}
                    {new Date(s.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                <Link
                  href={`/admin/warehouse/qa-inspections/new?shipment=${s.id}`}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                >
                  ➕ บันทึกการตรวจ
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent inspections */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">ประวัติการตรวจล่าสุด (100 รายการ)</h2>
        </div>
        {inspections.length === 0 ? (
          <p className="p-5 text-xs text-muted">ยังไม่มีการบันทึกการตรวจ</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-xs uppercase tracking-wide text-muted">
              <tr className="text-left">
                <th className="px-4 py-2">เลขที่</th>
                <th className="px-4 py-2">Shipment</th>
                <th className="px-4 py-2">ลูกค้า</th>
                <th className="px-4 py-2">ผลตรวจ</th>
                <th className="px-4 py-2">ความเสียหาย</th>
                <th className="px-4 py-2 text-right">ขาด</th>
                <th className="px-4 py-2">เวลา</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{it.inspection_no}</td>
                  <td className="px-4 py-3 font-mono text-xs">{it.cargo_shipment?.shipment_code ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {it.cargo_shipment?.profile?.member_code} · {it.cargo_shipment?.profile?.first_name} {it.cargo_shipment?.profile?.last_name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${OUTCOME_BADGE[it.outcome]}`}>
                      {OUTCOME_LABEL[it.outcome]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{it.damage_level ? DAMAGE_LABEL[it.damage_level] : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{it.missing_items > 0 ? it.missing_items : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(it.inspected_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    {it.customer_notified_at && <span className="ml-1 text-[10px]">📤</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/warehouse/qa-inspections/${it.id}`} className="text-xs text-primary-500 hover:underline">
                      เปิด →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
