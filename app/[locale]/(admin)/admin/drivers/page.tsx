/**
 * /admin/drivers — "มอบงานคนขับรถ" admin landing.
 *
 * ภูม #6 fix (2026-05-29 · Agent D) — sync gap.
 *
 * Bug before: the page read from the REBUILT `forwarder_driver` table (UUID
 * pk · status enum 1-4). That table is EMPTY on prod (D1 pivot 2026-05-18
 * moved all data into the legacy `tb_*` schema). Result: sidebar badge
 * "มอบงานคนขับรถ" showed e.g. 268 (= `tb_forwarder` WHERE `fstatus='6'`)
 * while the page rendered "ยังไม่มีรายการมอบหมาย" — the exact "ไม่ sync
 * ไรเลย" issue ภูม flagged.
 *
 * Fix: read driver-assignment batches from the LEGACY tables that hold the
 * live data (the same tables `/admin/drivers/work` + `actions/admin/driver-
 * work.ts` already use):
 *   - `tb_forwarder_driver`         — batch header (one row per driver/day)
 *   - `tb_forwarder_driver_item`    — items inside a batch (one row per parcel)
 *   - `tb_forwarder`                — the parcels themselves (for the "ready
 *                                     to assign" count = fstatus='6')
 *   - `tb_users`                    — driver display name (fdadminid ↔ userID)
 *
 * Legacy reference: `pcs-admin/forwarder-driver.php`
 *   - Lines 77-80: list batches (the default landing view) — sql joins
 *     tb_forwarder_driver + tb_forwarder_driver_item + GROUP BY fd.ID.
 *   - Line 551-560: nameStatusFD() maps fdstatus → label
 *     · '1' = กำลังดำเนินการ  (yellow badge)
 *     · '2' = สำเร็จ           (green badge)
 *     · '3' = ไม่สำเร็จ        (red badge — auto-set by cron when 17h elapses)
 *   - Line 722-729: "ready to assign" pool = `tb_forwarder` WHERE fstatus='6'.
 *
 * Scope for this commit (ภูม #6):
 *   - LIST batches (this page) — done.
 *   - DETAIL `[id]` — out of scope (still reads rebuilt table; UUID pk
 *     mismatch with bigint legacy. Row click on the list now drills into
 *     `/admin/drivers/work?driver=<fdadminid>` which IS already on legacy
 *     tables and works today).
 *   - per-row mutation buttons — removed. Legacy forwarder-driver.php's
 *     batch-level "force status=2" override is not load-bearing for daily
 *     workflow; per-ITEM transitions already work on /admin/drivers/work.
 *     If ภูม wants a "บังคับ batch=สำเร็จ" override, follow-up commit.
 *
 * Follow-up for ภูม:
 *   - The "+ มอบงานใหม่" CTA in this page points at /admin/forwarders?q=6
 *     (the list of unassigned forwarders, legacy `forwarder-driver.php?q=add`
 *     equivalent). A faithful port of the add-batch flow itself
 *     (`forwarder-driver.php?q=add` with the address-grouped picker UI) is
 *     a separate workstream.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

// Legacy fdstatus values per pcs-admin/include/function.php:551-560.
//   '1' = กำลังดำเนินการ (assigned · in flight)
//   '2' = สำเร็จ           (driver delivered the batch)
//   '3' = ไม่สำเร็จ        (timed out · cron flipped at endtime + 17h)
type FdStatus = "1" | "2" | "3";

const STATUS_LABEL: Record<FdStatus, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

const STATUS_CLS: Record<FdStatus, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-green-50 text-green-700 border-green-200",
  "3": "bg-red-50 text-red-700 border-red-200",
};

type BatchRow = {
  id:             number;
  fddate:         string | null;
  fdname:         string | null;
  fdamount:       number | null;
  fdadminid:      string;
  fdadmincreator: string;
  fdstatus:       string;
  endtime:        string | null;
};

type DriverUser = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
};

type ItemCountRow = { fdid: number };

export default async function AdminDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Same role gate as /admin/drivers/work — ops/super dispatch view;
  // 'driver' role lands on /admin/drivers/work (mobile) instead.
  await requireAdmin(["ops", "super"]);

  const sp    = await searchParams;
  const admin = createAdminClient();

  // ─── 1. Batch list (the main view) ──────────────────────────────
  // Filter by status if user clicked a chip; otherwise show ALL active
  // (legacy default landing view = list batches newest-first).
  let q = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdamount, fdadminid, fdadmincreator, fdstatus, endtime")
    .order("fddate", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(200);

  const statusFilter = (["1", "2", "3"].includes(sp.status ?? "") ? sp.status : null) as FdStatus | null;
  if (statusFilter) {
    q = q.eq("fdstatus", statusFilter);
  }

  const { data: batchData, error: batchErr } = await q;
  if (batchErr) {
    console.error(`[tb_forwarder_driver list] failed`, { code: batchErr.code, message: batchErr.message });
  }
  const batches = (batchData ?? []) as BatchRow[];

  // ─── 2. Item count per batch (for the "X รายการ" cell) ───────────
  // Legacy uses COUNT(fdi.fID) in the join; PostgREST doesn't aggregate
  // server-side cheaply, so we pull the (fdid) list for the on-screen
  // batches + tally client-side. Limited to 200 batches × ~50 items avg =
  // ~10k rows max — well within Supabase's default page.
  const batchIds = batches.map((b) => b.id);
  let itemCountByBatch: Map<number, number> = new Map();
  if (batchIds.length > 0) {
    const { data: itemRows, error: itemRowsErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fdid")
      .in("fdid", batchIds);
    if (itemRowsErr) {
      console.error(`[tb_forwarder_driver_item list] failed`, { code: itemRowsErr.code, message: itemRowsErr.message });
    }
    const counts = new Map<number, number>();
    for (const r of (itemRows ?? []) as ItemCountRow[]) {
      counts.set(r.fdid, (counts.get(r.fdid) ?? 0) + 1);
    }
    itemCountByBatch = counts;
  }

  // ─── 3. Driver display name lookup ──────────────────────────────
  // fdadminid is a legacy userID like "PR10691"; tb_users.userID is the
  // matching column. Single lookup over distinct ids on this page only.
  const driverIds = Array.from(new Set(batches.map((b) => b.fdadminid))).filter(Boolean);
  let driverById: Map<string, DriverUser> = new Map();
  if (driverIds.length > 0) {
    const { data: userRows, error: userRowsErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", driverIds);
    if (userRowsErr) {
      console.error(`[tb_users list] failed`, { code: userRowsErr.code, message: userRowsErr.message });
    }
    driverById = new Map(((userRows ?? []) as DriverUser[]).map((u) => [u.userID, u]));
  }

  // ─── 4. Counters: status tally + "ready to assign" pool ─────────
  // Status tally = quick view of batches by fdstatus (drives the chip row).
  // "Ready to assign" = forwarders WHERE fstatus='6' (legacy "เตรียมส่ง"
  // = packed, waiting for a driver). This matches the sidebar badge
  // formula exactly — proves to the user the page IS in sync.
  const [
    { count: total },
    { count: count1 },
    { count: count2 },
    { count: count3 },
    { count: readyToAssign },
  ] = await Promise.all([
    admin.from("tb_forwarder_driver").select("id", { count: "exact", head: true }),
    admin.from("tb_forwarder_driver").select("id", { count: "exact", head: true }).eq("fdstatus", "1"),
    admin.from("tb_forwarder_driver").select("id", { count: "exact", head: true }).eq("fdstatus", "2"),
    admin.from("tb_forwarder_driver").select("id", { count: "exact", head: true }).eq("fdstatus", "3"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "6"),
  ]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">มอบงานคนขับรถ</h1>
          <p className="mt-1 text-sm text-muted">
            รอบจัดส่งคนขับ — 1 รอบ = พนักงานขับ 1 คนต่อวัน · ใน 1 รอบมีหลายพัสดุ
          </p>
        </div>
        <Link
          href="/admin/forwarders?q=6"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600"
        >
          + มอบงานใหม่ ({readyToAssign ?? 0} พัสดุรอ)
        </Link>
      </div>

      {/* Sync banner — proves to the eye that page + badge use the same data */}
      <div className="rounded-md border border-blue-200 bg-blue-50 text-blue-800 px-3 py-2 text-xs">
        🔗 อ่านจากตารางจริง <code className="rounded bg-white/60 px-1">tb_forwarder_driver</code>
        {" "}+ <code className="rounded bg-white/60 px-1">tb_forwarder_driver_item</code>
        {" "}— ตรงกับ badge แถบข้าง (พัสดุพร้อมมอบ = <strong>{readyToAssign ?? 0}</strong> รายการ ·
        ทั้งหมด <strong>{total ?? 0}</strong> รอบในระบบ)
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={!statusFilter} href="/admin/drivers">
          ทั้งหมด ({total ?? 0})
        </Chip>
        <Chip active={statusFilter === "1"} href="/admin/drivers?status=1">
          กำลังดำเนินการ ({count1 ?? 0})
        </Chip>
        <Chip active={statusFilter === "2"} href="/admin/drivers?status=2">
          สำเร็จ ({count2 ?? 0})
        </Chip>
        <Chip active={statusFilter === "3"} href="/admin/drivers?status=3">
          ไม่สำเร็จ ({count3 ?? 0})
        </Chip>
      </div>

      {/* Batch list table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {batches.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted">
              {statusFilter
                ? `ไม่มีรอบในสถานะ "${STATUS_LABEL[statusFilter]}"`
                : "ยังไม่มีรอบจัดส่ง — กดปุ่ม + มอบงานใหม่ ด้านบนเพื่อเริ่ม"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วัน-เวลา</th>
                  <th className="px-4 py-3">รอบ</th>
                  <th className="px-4 py-3">คนขับ</th>
                  <th className="px-4 py-3 text-right">รายการ</th>
                  <th className="px-4 py-3 text-right">ยอดเงิน (บาท)</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">หมดเวลา</th>
                  <th className="px-4 py-3 text-right">ดูงาน</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const driver = driverById.get(b.fdadminid);
                  const driverName = `${driver?.userName ?? ""} ${driver?.userLastName ?? ""}`.trim();
                  const itemN = itemCountByBatch.get(b.id) ?? 0;
                  const fdStatusKey: FdStatus = (
                    ["1", "2", "3"].includes(b.fdstatus) ? b.fdstatus : "1"
                  ) as FdStatus;
                  const endtimeStr = b.endtime
                    ? new Date(b.endtime).toLocaleString("th-TH", {
                        year: "2-digit", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })
                    : "—";
                  return (
                    <tr key={b.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {b.fddate
                          ? new Date(b.fddate).toLocaleString("th-TH", {
                              year: "2-digit", month: "2-digit", day: "2-digit",
                              hour: "2-digit", minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm">#{b.id}</div>
                        {b.fdname && (
                          <div className="text-xs text-muted line-clamp-2 max-w-[200px]">{b.fdname}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{b.fdadminid}</div>
                        {driverName && <div className="text-sm">{driverName}</div>}
                        {driver?.userTel && driver.userTel !== "-" && (
                          <a
                            href={`tel:${driver.userTel}`}
                            className="text-primary-600 hover:underline"
                          >
                            📞 {driver.userTel}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{itemN}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {b.fdamount != null
                          ? Number(b.fdamount).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[fdStatusKey] ?? STATUS_CLS["1"]}`}
                        >
                          {STATUS_LABEL[fdStatusKey] ?? b.fdstatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{endtimeStr}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/drivers/work?driver=${encodeURIComponent(b.fdadminid)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-primary-50 hover:border-primary-200"
                        >
                          ดูงาน →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted pt-2">
        ภูม #6 fix (2026-05-29) — page ย้ายมาอ่านจาก legacy tb_forwarder_driver แล้ว ·
        ตรงกับ sidebar badge · /admin/drivers/[id] detail ยังอ่านตารางเก่า (out of scope · follow-up)
      </p>
    </main>
  );
}

function Chip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border text-foreground hover:bg-surface-alt"
      }`}
    >
      {children}
    </Link>
  );
}
