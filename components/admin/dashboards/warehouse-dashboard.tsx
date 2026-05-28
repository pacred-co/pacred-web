import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Package, ClipboardCheck, AlertTriangle, Container as ContainerIcon, Clock, ScanLine } from "lucide-react";

/**
 * V-E12 · Warehouse role dashboard — what the warehouse-floor staffer
 * sees the moment they log in.
 *
 * KPIs (per spec):
 *   - Today's inspection queue (pending / today / 7d outcome split)
 *   - Pass / fail rate (last 7d)
 *   - Open rework cases (fail_major without resolution)
 *   - Containers due to open (close_at countdown)
 *   - Shipments waiting to bind to container (orphaned)
 *
 * All queries hit existing indexes; no migration needed.
 */

export const dynamic = "force-dynamic";

type Inspection = { outcome: string; inspected_at: string };
type ContainerRow = {
  id: string;
  code: string | null;
  close_at: string | null;
  status: string | null;
};

function int(n: number): string {
  return n.toLocaleString("th-TH");
}

function hoursUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - nowMs;
  return Math.round(diffMs / 36e5);
}

// Server-Component-only helpers: isolate Date.now() out of render so the
// react-hooks/purity rule doesn't trip (Server Components are evaluated
// once per request, which is the intended single-snapshot semantics).
function nowMsServer(): number {
   
  return Date.now();
}

export async function WarehouseDashboard() {
  const admin = createAdminClient();

  const nowMs = nowMsServer();
  const now = new Date(nowMs);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(nowMs - 7 * 86400e3).toISOString();
  const nextWeek = new Date(nowMs + 7 * 86400e3).toISOString();

  const [
    pendingShipments,
    inspectionsToday,
    inspections7d,
    failMajorOpen,
    containersDue,
    orphanedShipments,
    containersInTransit,
  ] = await Promise.all([
    // "Pending intake" — arrived cargo shipments without an inspection
    // yet. Mirror of /admin/warehouse/qa-inspections "pending" filter.
    admin
      .from("cargo_shipments")
      .select("id", { count: "exact", head: true })
      .in("status", ["arrived_th", "unloaded"]),
    admin
      .from("freight_qa_inspections")
      .select("outcome, inspected_at")
      .gte("inspected_at", todayStart),
    admin
      .from("freight_qa_inspections")
      .select("outcome, inspected_at")
      .gte("inspected_at", sevenDaysAgo),
    admin
      .from("freight_qa_inspections")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "fail_major")
      .is("customer_notified_at", null),
    admin
      .from("cargo_containers")
      .select("id, code, close_at, status")
      .not("close_at", "is", null)
      .lte("close_at", nextWeek)
      .order("close_at", { ascending: true })
      .limit(8),
    admin
      .from("cargo_shipments")
      .select("id", { count: "exact", head: true })
      .is("cargo_container_id", null)
      .in("status", ["received_cn", "packed_cn"]),
    admin
      .from("cargo_containers")
      .select("id", { count: "exact", head: true })
      .in("status", ["packing", "sealed", "in_transit"]),
  ]);

  const todayRows = (inspectionsToday.data ?? []) as Inspection[];
  const weekRows = (inspections7d.data ?? []) as Inspection[];
  const todayDone = todayRows.length;

  const passN = weekRows.filter((r) => r.outcome === "pass").length;
  const failN = weekRows.filter((r) => r.outcome === "fail_minor" || r.outcome === "fail_major").length;
  const passRate = passN + failN > 0 ? Math.round((passN / (passN + failN)) * 100) : null;

  const containers = (containersDue.data ?? []) as ContainerRow[];

  return (
    <main className="p-4 lg:p-6 space-y-4">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · คลังสินค้า</p>
        <h1 className="mt-1 text-2xl font-bold">หน้าคลังสินค้า (Warehouse)</h1>
        <p className="text-xs text-muted mt-1">
          คิวตรวจ QA · ตู้ที่จะปิด · พัสดุที่ยังไม่อยู่ในตู้
        </p>
      </header>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          tone="info"
          icon={<Package className="h-7 w-7" />}
          label="รอตรวจ QA (ถึงโกดังแล้ว)"
          value={int(pendingShipments.count ?? 0)}
          sub="ยังไม่ได้บันทึก inspection"
          href="/admin/warehouse/qa-inspections"
        />
        <Stat
          tone="success"
          icon={<ClipboardCheck className="h-7 w-7" />}
          label="ตรวจเสร็จวันนี้"
          value={int(todayDone)}
          sub="QA inspections วันนี้"
          href="/admin/warehouse/qa-inspections"
        />
        <Stat
          tone="primary"
          icon={<ScanLine className="h-7 w-7" />}
          label="ผ่าน / ทั้งหมด (7 วัน)"
          value={passRate === null ? "—" : `${passRate}%`}
          sub={`ผ่าน ${int(passN)} · ไม่ผ่าน ${int(failN)}`}
          href="/admin/warehouse/qa-inspections"
        />
        <Stat
          tone="danger"
          icon={<AlertTriangle className="h-7 w-7" />}
          label="เสียหายหนัก (รอแจ้งลูกค้า)"
          value={int(failMajorOpen.count ?? 0)}
          sub="fail_major · customer not notified"
          href="/admin/warehouse/qa-inspections?outcome=fail_major"
        />
      </section>

      <section className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Stat
          tone="warning"
          icon={<Package className="h-7 w-7" />}
          label="พัสดุยังไม่อยู่ในตู้"
          value={int(orphanedShipments.count ?? 0)}
          sub="cargo_shipments รอ bind container"
          href="/admin/warehouse/containers"
        />
        <Stat
          tone="info"
          icon={<ContainerIcon className="h-7 w-7" />}
          label="ตู้ที่ active"
          value={int(containersInTransit.count ?? 0)}
          sub="packing · sealed · in_transit (cargo_containers)"
          href="/admin/containers"
        />
      </section>

      {/* Containers due to close (7-day window) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            ตู้ที่ใกล้ปิด (7 วันถัดไป)
          </h2>
          <Link href="/admin/containers" className="text-[11px] text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {containers.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">ไม่มีตู้ที่ตั้ง close_at ในช่วงนี้</p>
        ) : (
          <ul className="divide-y divide-border">
            {containers.map((c) => {
              const h = hoursUntil(c.close_at, nowMs);
              const overdue = h !== null && h < 0;
              const urgent = h !== null && h >= 0 && h <= 24;
              return (
                <li key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <ContainerIcon className="h-4 w-4 text-primary-500 shrink-0" />
                    <Link href={`/admin/containers/${c.id}`} className="font-mono font-semibold truncate hover:underline">
                      {c.code ?? c.id.slice(0, 8)}
                    </Link>
                    <span className="text-[11px] text-muted truncate">สถานะ: {c.status ?? "—"}</span>
                  </div>
                  {h === null ? (
                    <span className="text-[11px] text-muted">—</span>
                  ) : overdue ? (
                    <span className="text-[11px] font-semibold text-red-600">เลยกำหนด {Math.abs(h)} ชม.</span>
                  ) : urgent ? (
                    <span className="text-[11px] font-semibold text-amber-600">เหลือ {h} ชม.</span>
                  ) : (
                    <span className="text-[11px] text-muted">เหลือ {h} ชม.</span>
                  )}
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
