import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Truck, CheckCircle2, Clock, MapPin } from "lucide-react";

/**
 * V-E12 · Driver role dashboard — what a delivery driver sees on login.
 *
 * KPIs (per spec):
 *   - Today's pickup assignments
 *   - Open deliveries (status 1 = waiting accept, 2 = in progress)
 *   - Completed today (count + total cargo value)
 *   - Next pickup detail (top 3 by fd_date)
 *
 * Scope: SELF only — the driver sees own forwarder_driver rows
 * (filter by profile_id). RLS would enforce too, but we filter
 * explicitly because the page uses createAdminClient (RLS-bypass).
 */

export const dynamic = "force-dynamic";

type DriverAssignmentRow = {
  id: string;
  status: number;
  fd_date: string;
  completed_at: string | null;
  forwarder: {
    f_no: string | null;
    total_price: number | null;
    transport_type: string | null;
    ship_first_name: string | null;
    ship_last_name: string | null;
    ship_province: string | null;
  } | { f_no: string | null }[] | null;
};

const STATUS_LABEL: Record<number, string> = {
  1: "รอรับงาน",
  2: "กำลังส่ง",
  3: "หมดเวลา",
  4: "เสร็จ",
};

const TRANSPORT_ICON: Record<string, string> = {
  truck: "🚚",
  ship: "🚢",
  air: "✈️",
};

function int(n: number): string {
  return n.toLocaleString("th-TH");
}

function thb(n: number): string {
  return "฿" + Math.round(n).toLocaleString("th-TH");
}

function normForwarder(
  f: DriverAssignmentRow["forwarder"],
): Exclude<DriverAssignmentRow["forwarder"], unknown[] | null> | null {
  if (!f) return null;
  if (Array.isArray(f)) return (f[0] as Exclude<DriverAssignmentRow["forwarder"], unknown[] | null>) ?? null;
  return f as Exclude<DriverAssignmentRow["forwarder"], unknown[] | null>;
}

export async function DriverDashboard({ userId }: { userId: string }) {
  const admin = createAdminClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [waitingAccept, inProgress, completedToday, nextAssignments] = await Promise.all([
    admin
      .from("forwarder_driver")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("status", 1),
    admin
      .from("forwarder_driver")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("status", 2),
    admin
      .from("forwarder_driver")
      .select(`
        id, status, fd_date, completed_at,
        forwarder:forwarders!forwarder_id (
          f_no, total_price, transport_type,
          ship_first_name, ship_last_name, ship_province
        )
      `)
      .eq("profile_id", userId)
      .eq("status", 4)
      .gte("completed_at", todayIso),
    admin
      .from("forwarder_driver")
      .select(`
        id, status, fd_date, completed_at,
        forwarder:forwarders!forwarder_id (
          f_no, total_price, transport_type,
          ship_first_name, ship_last_name, ship_province
        )
      `)
      .eq("profile_id", userId)
      .in("status", [1, 2])
      .order("fd_date", { ascending: true })
      .limit(5),
  ]);

  const doneRows = (completedToday.data ?? []) as DriverAssignmentRow[];
  const doneTotal = doneRows.reduce((s, r) => {
    const f = normForwarder(r.forwarder);
    return s + Number((f && "total_price" in f ? f.total_price : 0) ?? 0);
  }, 0);

  const upcoming = ((nextAssignments.data ?? []) as DriverAssignmentRow[]).map((r) => ({
    ...r,
    forwarder: normForwarder(r.forwarder),
  }));

  return (
    <main className="p-4 lg:p-6 space-y-4">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · คนขับ</p>
        <h1 className="mt-1 text-2xl font-bold">หน้างานของฉัน (Driver)</h1>
        <p className="text-xs text-muted mt-1">
          งานที่ได้รับมอบหมาย · งานวันนี้ · งานที่เสร็จแล้ว
        </p>
      </header>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          tone="warning"
          icon={<Clock className="h-7 w-7" />}
          label="รอรับงาน"
          value={int(waitingAccept.count ?? 0)}
          sub="status = 1"
          href="/admin/driver-runs"
        />
        <Stat
          tone="info"
          icon={<Truck className="h-7 w-7" />}
          label="กำลังส่ง"
          value={int(inProgress.count ?? 0)}
          sub="status = 2"
          href="/admin/driver-runs"
        />
        <Stat
          tone="success"
          icon={<CheckCircle2 className="h-7 w-7" />}
          label="เสร็จวันนี้"
          value={int(doneRows.length)}
          sub={`ยอดรวม ${thb(doneTotal)}`}
          href="/admin/driver-runs"
        />
        <Stat
          tone="primary"
          icon={<MapPin className="h-7 w-7" />}
          label="งานทั้งหมด (active)"
          value={int((waitingAccept.count ?? 0) + (inProgress.count ?? 0))}
          sub="รวม status 1 + 2"
          href="/admin/driver-runs"
        />
      </section>

      {/* Next assignments list */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">งานถัดไป (active)</h2>
          <Link href="/admin/driver-runs" className="text-[11px] text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">ยังไม่มีงานที่ active</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((r) => {
              const f = r.forwarder as Exclude<DriverAssignmentRow["forwarder"], unknown[] | null> | null;
              const f_no = (f && "f_no" in f ? f.f_no : null) ?? "—";
              const transport = (f && "transport_type" in f ? f.transport_type : null) ?? "";
              const province = (f && "ship_province" in f ? f.ship_province : null) ?? "—";
              const recipient =
                f && "ship_first_name" in f
                  ? [f.ship_first_name, f.ship_last_name].filter(Boolean).join(" ") || "—"
                  : "—";
              return (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{TRANSPORT_ICON[transport] ?? "📦"}</span>
                    <div className="min-w-0">
                      <Link
                        href="/admin/driver-runs"
                        className="font-mono font-semibold hover:underline"
                      >
                        {f_no}
                      </Link>
                      <p className="text-[11px] text-muted truncate">
                        {recipient} · {province}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground shrink-0">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  tone, icon, label, value, sub, href,
}: {
  tone: "danger" | "info" | "success" | "primary" | "warning";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  const tones: Record<typeof tone, string> = {
    danger: "text-red-600",
    info: "text-cyan-600",
    success: "text-emerald-600",
    primary: "text-fuchsia-600",
    warning: "text-amber-600",
  };
  return (
    <Link href={href} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md transition-shadow block">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-2xl sm:text-3xl font-bold font-mono leading-none ${tones[tone]}`}>{value}</p>
          <p className="mt-2 text-xs font-semibold text-foreground line-clamp-2">{label}</p>
          <p className="mt-1 text-[10px] text-muted">{sub}</p>
        </div>
        <div className={`shrink-0 opacity-80 ${tones[tone]}`}>{icon}</div>
      </div>
    </Link>
  );
}
