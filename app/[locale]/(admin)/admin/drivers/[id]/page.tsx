import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { DriverAssignmentActions } from "../actions-cell";

const STATUS_BADGE: Record<number, string> = {
  1: "bg-amber-50 text-amber-700 border-amber-200",
  2: "bg-blue-50 text-blue-700 border-blue-200",
  3: "bg-gray-50 text-gray-600 border-gray-200",
  4: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABEL: Record<number, string> = {
  1: "มอบหมายแล้ว — รอคนขับรับงาน",
  2: "คนขับรับงานแล้ว",
  3: "หมดเวลารับงาน (17 ชม.)",
  4: "ส่งงานเสร็จ",
};

function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function AdminDriverAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // P-18-followup-rbac: page-level guard (matches /admin/drivers list).
  await requireAdmin(["ops"]);

  const { id } = await params;
  const admin  = createAdminClient();

  const { data, error } = await admin
    .from("forwarder_driver")
    .select(`
      id, status, fd_date, accepted_at, completed_at, note, created_at, updated_at,
      driver:profiles!profile_id (
        id, member_code, first_name, last_name, phone, email
      ),
      forwarder:forwarders!forwarder_id (
        f_no, status, source_warehouse, transport_type, total_price,
        weight_kg, volume_cbm, tracking_china,
        ship_first_name, ship_last_name, ship_phone, ship_phone2,
        ship_address_line, ship_sub_district, ship_district, ship_province, ship_postal_code,
        profile_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[forwarder_driver lookup] failed`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(`Failed to load forwarder_driver (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (!data) notFound();

  type Row = typeof data & {
    driver: { id: string; member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null } | { id: string; member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null }[] | null;
    forwarder: { f_no: string | null; status: string | null; source_warehouse: string | null; transport_type: string | null; total_price: number | null; weight_kg: number | null; volume_cbm: number | null; tracking_china: string | null; ship_first_name: string | null; ship_last_name: string | null; ship_phone: string | null; ship_phone2: string | null; ship_address_line: string | null; ship_sub_district: string | null; ship_district: string | null; ship_province: string | null; ship_postal_code: string | null; profile_id: string | null } | { f_no: string | null; status: string | null; source_warehouse: string | null; transport_type: string | null; total_price: number | null; weight_kg: number | null; volume_cbm: number | null; tracking_china: string | null; ship_first_name: string | null; ship_last_name: string | null; ship_phone: string | null; ship_phone2: string | null; ship_address_line: string | null; ship_sub_district: string | null; ship_district: string | null; ship_province: string | null; ship_postal_code: string | null; profile_id: string | null }[] | null;
  };
  const row = data as Row;
  const driver    = normSingle(row.driver);
  const forwarder = normSingle(row.forwarder);

  // Compute time since assigned for visual cue.
  // eslint-disable-next-line react-hooks/purity -- Server Component, renders fresh per request; Date.now() is intentional time-of-render snapshot.
  const nowMs       = Date.now();
  const fdDate      = new Date(row.fd_date);
  const ageHours    = (nowMs - fdDate.getTime()) / (1000 * 60 * 60);
  const expiringSoon = row.status === 1 && ageHours > 12;
  const overdue      = row.status === 1 && ageHours > 17;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <Link href="/admin/drivers" className="text-xs text-primary-600 hover:underline">
        ← กลับรายการ
      </Link>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">
          มอบหมาย {forwarder?.f_no ?? "—"}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted">{row.id}</p>
      </div>

      {/* Status hero */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span
              className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${
                STATUS_BADGE[row.status] ?? "bg-gray-50 border-gray-200"
              }`}
            >
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
            {overdue && (
              <p className="mt-2 text-xs text-red-700 font-semibold">
                ⏰ เลยเวลา 17 ชม. แล้ว — cron จะ flip เป็น &quot;หมดเวลา&quot; รอบถัดไป
              </p>
            )}
            {!overdue && expiringSoon && (
              <p className="mt-2 text-xs text-amber-700">
                ⚠ ใกล้หมดเวลา ({Math.floor(ageHours)} ชม. จากที่ assign)
              </p>
            )}
          </div>
          <DriverAssignmentActions id={row.id} status={row.status as 1 | 2 | 3 | 4} />
        </div>
      </section>

      {/* Timeline */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
        <h2 className="text-sm font-bold text-foreground">Timeline</h2>
        <ul className="text-xs space-y-1">
          <li>
            <span className="text-muted">มอบหมาย:</span>{" "}
            {fdDate.toLocaleString("th-TH")}
          </li>
          {row.accepted_at && (
            <li>
              <span className="text-muted">รับงาน:</span>{" "}
              {new Date(row.accepted_at).toLocaleString("th-TH")}
            </li>
          )}
          {row.completed_at && (
            <li>
              <span className="text-muted">ส่งเสร็จ:</span>{" "}
              {new Date(row.completed_at).toLocaleString("th-TH")}
            </li>
          )}
          <li>
            <span className="text-muted">อัพเดทล่าสุด:</span>{" "}
            {new Date(row.updated_at).toLocaleString("th-TH")}
          </li>
        </ul>
        {row.note && (
          <div className="mt-3 rounded border border-border bg-surface-alt/30 p-2 text-xs">
            <span className="font-semibold">Note:</span> {row.note}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Driver info */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-bold text-foreground">คนขับ</h2>
          {driver ? (
            <ul className="text-xs space-y-1">
              <li><span className="text-muted">รหัส:</span> <span className="font-mono">{driver.member_code ?? "—"}</span></li>
              <li><span className="text-muted">ชื่อ:</span> {driver.first_name ?? ""} {driver.last_name ?? ""}</li>
              <li><span className="text-muted">เบอร์:</span> {driver.phone ?? "—"}</li>
              <li><span className="text-muted">อีเมล:</span> {driver.email ?? "—"}</li>
              <li>
                <Link href={`/admin/customers/${driver.id}`} className="text-primary-600 hover:underline">
                  ดูโปรไฟล์ →
                </Link>
              </li>
            </ul>
          ) : <p className="text-xs text-muted">—</p>}
        </section>

        {/* Forwarder info */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-bold text-foreground">Forwarder</h2>
          {forwarder ? (
            <ul className="text-xs space-y-1">
              <li>
                <span className="text-muted">เลขที่:</span>{" "}
                <Link
                  href={`/admin/forwarders/${forwarder.f_no}`}
                  className="font-mono text-primary-600 hover:underline"
                >
                  {forwarder.f_no}
                </Link>
              </li>
              <li><span className="text-muted">สถานะ:</span> {forwarder.status ?? "—"}</li>
              <li><span className="text-muted">โกดังต้นทาง:</span> {forwarder.source_warehouse ?? "—"}</li>
              <li><span className="text-muted">ขนส่ง:</span> {forwarder.transport_type ?? "—"}</li>
              {forwarder.weight_kg && (
                <li><span className="text-muted">น้ำหนัก:</span> {forwarder.weight_kg} kg</li>
              )}
              {forwarder.volume_cbm && (
                <li><span className="text-muted">ปริมาตร:</span> {forwarder.volume_cbm} CBM</li>
              )}
              {forwarder.total_price && (
                <li>
                  <span className="text-muted">ราคา:</span>{" "}
                  ฿{Number(forwarder.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </li>
              )}
              {forwarder.tracking_china && (
                <li><span className="text-muted">Tracking:</span> {forwarder.tracking_china}</li>
              )}
            </ul>
          ) : <p className="text-xs text-muted">—</p>}
        </section>
      </div>

      {/* Delivery address */}
      {forwarder && (forwarder.ship_first_name || forwarder.ship_address_line) && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-bold text-foreground">ที่อยู่ส่ง</h2>
          <ul className="text-xs space-y-1">
            <li>
              <span className="text-muted">ผู้รับ:</span>{" "}
              {forwarder.ship_first_name} {forwarder.ship_last_name ?? ""}
            </li>
            <li><span className="text-muted">เบอร์:</span> {forwarder.ship_phone ?? "—"}{forwarder.ship_phone2 && `, ${forwarder.ship_phone2}`}</li>
            <li>
              <span className="text-muted">ที่อยู่:</span>{" "}
              {[forwarder.ship_address_line, forwarder.ship_sub_district, forwarder.ship_district, forwarder.ship_province, forwarder.ship_postal_code].filter(Boolean).join(" ")}
            </li>
          </ul>
        </section>
      )}
    </main>
  );
}
