import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { DriverActionButtons } from "./action-buttons";

// CT-7 — Driver "งานของฉัน" landing.
// Driver lands here, sees own forwarder_driver assignments (status IN 1/2)
// + completed-today (status 4). Per row: forwarder details + accept / complete buttons.
//
// Wave 3 cleanup (2026-05-20 ค่ำ): the cargo_shipments + container_code
// lookup was removed when the spine was retired (D1 Option A). The
// container number for each forwarder lives directly on `forwarders.cabinet_number`
// / `forwarders.tracking_th` and is rendered inline. The scan flow now
// targets the legacy barcode routes (`/admin/barcode/driver`).
//
// Self-row only — server action driverUpdateOwnAssignmentStatus enforces it.
// Sidebar entry shows for driver role (super/ops also see for oversight).

type AssignmentRow = {
  id:           string;
  forwarder_id: string;
  status:       number;
  fd_date:      string;
  accepted_at:  string | null;
  completed_at: string | null;
  note:         string | null;
  forwarder: {
    f_no:               string | null;
    total_price:        number;
    transport_type:     string;
    status:             string;
    tracking_th:        string | null;
    cabinet_number:     string | null;
    ship_first_name:    string | null;
    ship_last_name:     string | null;
    ship_phone:         string | null;
    ship_address_line:  string | null;
    ship_sub_district:  string | null;
    ship_district:      string | null;
    ship_province:      string | null;
    ship_postal_code:   string | null;
  } | { f_no: string | null }[] | null;
};

const STATUS_LABEL: Record<number, string> = {
  1: "มอบหมายแล้ว — รอรับงาน",
  2: "รับงานแล้ว — กำลังส่ง",
  3: "หมดเวลารับงาน",
  4: "ส่งงานเสร็จ",
};
const STATUS_BADGE: Record<number, string> = {
  1: "bg-amber-50 text-amber-700 border-amber-200",
  2: "bg-blue-50 text-blue-700 border-blue-200",
  3: "bg-gray-50 text-gray-600 border-gray-200",
  4: "bg-green-50 text-green-700 border-green-200",
};
const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ", ship: "🚢 เรือ", air: "✈️ เครื่องบิน",
};

function normForwarder(f: AssignmentRow["forwarder"]): NonNullable<Exclude<AssignmentRow["forwarder"], unknown[]>> | null {
  if (!f) return null;
  if (Array.isArray(f)) return (f[0] as Exclude<AssignmentRow["forwarder"], unknown[]>) ?? null;
  return f as Exclude<AssignmentRow["forwarder"], unknown[]>;
}

export default async function DriverRunsPage() {
  const { user } = await requireAdmin();
  const admin = createAdminClient();

  // Active assignments (1 = waiting accept, 2 = accepted in progress)
  const { data: activeRaw, error: activeRawErr } = await admin
    .from("forwarder_driver")
    .select(`
      id, forwarder_id, status, fd_date, accepted_at, completed_at, note,
      forwarder:forwarders!forwarder_id (
        f_no, total_price, transport_type, status, tracking_th, cabinet_number,
        ship_first_name, ship_last_name, ship_phone, ship_address_line,
        ship_sub_district, ship_district, ship_province, ship_postal_code
      )
    `)
    .eq("profile_id", user.id)
    .in("status", [1, 2])
    .order("fd_date", { ascending: true });
  if (activeRawErr) {
    console.error(`[forwarder_driver list] failed`, { code: activeRawErr.code, message: activeRawErr.message });
  }
  const activeRows = ((activeRaw ?? []) as AssignmentRow[]).map((r) => ({ ...r, forwarder: normForwarder(r.forwarder) }));

  // Completed today (status 4 + completed_at today, BKK)
  const todayBkk = new Date();
  todayBkk.setHours(0, 0, 0, 0);
  const { data: doneRaw, error: doneRawErr } = await admin
    .from("forwarder_driver")
    .select(`
      id, forwarder_id, status, fd_date, accepted_at, completed_at, note,
      forwarder:forwarders!forwarder_id (
        f_no, total_price, transport_type, status, tracking_th, cabinet_number,
        ship_first_name, ship_last_name, ship_phone, ship_address_line,
        ship_sub_district, ship_district, ship_province, ship_postal_code
      )
    `)
    .eq("profile_id", user.id)
    .eq("status", 4)
    .gte("completed_at", todayBkk.toISOString())
    .order("completed_at", { ascending: false });
  if (doneRawErr) {
    console.error(`[forwarder_driver list] failed`, { code: doneRawErr.code, message: doneRawErr.message });
  }
  const doneRows = ((doneRaw ?? []) as AssignmentRow[]).map((r) => ({ ...r, forwarder: normForwarder(r.forwarder) }));

  // Wave 3 cleanup: spine retired (cargo_shipments → tb_forwarder).
  // The container number for each forwarder is already on
  // `forwarders.cabinet_number`; we surface it inline below in lieu of
  // the deleted spine join.

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/driver-runs" />
      <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">DRIVER · งานของฉัน</p>
          <h1 className="mt-1 text-2xl font-bold">งานขนส่งที่ได้รับมอบหมาย</h1>
          <p className="mt-1 text-sm text-muted">รับงาน → ออกของจากโกดัง (สแกน) → ส่งถึงลูกค้า (สแกนซ้ำ) → กดเสร็จ</p>
        </div>
        <Link href="/admin/barcode/driver" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600">
          📦 ไปสแกน
        </Link>
      </div>

      {/* Active assignments */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">🛻 งานที่ต้องทำ ({activeRows.length})</h2>
          {activeRows.length === 0 && <span className="text-[10px] text-muted">ไม่มีงานที่ค้าง</span>}
        </div>
        {activeRows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">วันนี้ยังไม่มีงานมอบหมาย</p>
        ) : (
          <ul className="divide-y divide-border">
            {activeRows.map((r) => {
              const fwd = r.forwarder;
              const addr = fwd
                ? [fwd.ship_address_line, fwd.ship_sub_district && `ต.${fwd.ship_sub_district}`, fwd.ship_district && `อ.${fwd.ship_district}`, fwd.ship_province && `จ.${fwd.ship_province}`, fwd.ship_postal_code]
                    .filter(Boolean).join(" ")
                : "—";
              return (
                <li key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {fwd?.f_no && (
                          <Link href={`/admin/forwarders/${fwd.f_no}`} className="font-mono text-xs text-primary-600 hover:underline">
                            {fwd.f_no}
                          </Link>
                        )}
                        {fwd?.transport_type && <span className="text-xs">{TRANSPORT_LABEL[fwd.transport_type] ?? fwd.transport_type}</span>}
                      </div>
                      <p className="text-sm font-medium">{[fwd?.ship_first_name, fwd?.ship_last_name].filter(Boolean).join(" ") || "—"}</p>
                      {fwd?.ship_phone && (
                        <p className="text-xs"><a href={`tel:${fwd.ship_phone}`} className="text-primary-600 hover:underline">📞 {fwd.ship_phone}</a></p>
                      )}
                      <p className="text-xs text-muted">{addr}</p>
                      {fwd?.tracking_th && <p className="text-[10px] text-muted font-mono">TH tracking: {fwd.tracking_th}</p>}
                      {fwd?.cabinet_number && (
                        <p className="text-[10px] text-muted">📦 ตู้: <span className="font-mono">{fwd.cabinet_number}</span></p>
                      )}
                      {r.note && <p className="text-[10px] text-amber-700 italic">📝 {r.note}</p>}
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-bold font-mono text-red-700">฿{Number(fwd?.total_price ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-muted mt-1">มอบหมาย {new Date(r.fd_date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                  </div>
                  <DriverActionButtons assignmentId={r.id} status={r.status} shipmentCode={null} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Completed today */}
      {doneRows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">✅ ส่งสำเร็จวันนี้ ({doneRows.length})</h2>
          </div>
          <ul className="divide-y divide-border">
            {doneRows.map((r) => {
              const fwd = r.forwarder;
              return (
                <li key={r.id} className="p-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    {fwd?.f_no && <span className="font-mono text-primary-600">{fwd.f_no}</span>}
                    <span className="ml-2">{[fwd?.ship_first_name, fwd?.ship_last_name].filter(Boolean).join(" ") || "—"}</span>
                  </div>
                  <span className="text-muted">
                    {r.completed_at ? new Date(r.completed_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "—"} น.
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-muted">
        Tip: รับงานภายใน 17 ชม.ไม่งั้นระบบจะปล่อยให้ admin มอบหมายใหม่ (status → หมดเวลา)
      </p>
    </main>
    </>
  );
}
