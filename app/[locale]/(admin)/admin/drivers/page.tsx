/**
 * /admin/drivers — Driver batch list (faithful port of `pcs-admin/forwarder-driver.php`
 * default mode · 2026-05-30 ภูม #3 fidelity port).
 *
 * Each row = ONE batch (tb_forwarder_driver record). A batch contains N stops
 * (tb_forwarder_driver_item rows) assigned to one driver to deliver in one run.
 *
 * Legacy reference: forwarder-driver.php lines 200-365 (default list mode).
 *   - Filter chips on fdstatus '1'/'2'/'3'
 *   - Date-range search (default 90 days)
 *   - "สร้างรายการขนส่ง" CTA → /admin/drivers/new
 *   - Each row → /admin/drivers/[id] (batch detail)
 *
 * This REPLACES the prior page that read REBUILT `forwarder_driver` UUID table.
 * The rebuilt table was empty on prod and the column mapping (status 1-4) did
 * not match legacy (status 1-3).
 *
 * AGENTS.md §0a — Pacred Tailwind design, NOT verbatim Bootstrap 4.
 * AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportDriversAll } from "@/actions/admin/export/drivers";
import { countPendingDispatch } from "@/lib/admin/pending-dispatch";
import { formatThaiDate, formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { Plus, Truck, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

// Next 16 react-hooks/purity rule — raw `Date.now()` in render is rejected.
// Wrap in named module-scope helpers (per `docs/learnings/nextjs-16-quirks.md`).
function nowIso90dAgo(): string {
  return new Date(Date.now() - 90 * 86_400_000).toISOString().substring(0, 10);
}

type FdStatus = "1" | "2" | "3";

const STATUS_LABEL: Record<FdStatus, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

const STATUS_CLS: Record<FdStatus, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "3": "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_ICON: Record<FdStatus, React.ReactNode> = {
  "1": <Clock className="h-3 w-3" />,
  "2": <CheckCircle2 className="h-3 w-3" />,
  "3": <XCircle className="h-3 w-3" />,
};

type BatchRow = {
  id:               number;
  fddate:           string | null;
  fdname:           string | null;
  fdadminid:        string | null;
  fdadmincreator:   string | null;
  fdstatus:         string | null;
  fdamount:         number | null;
  endtime:          string | null;
};

type DriverDirectoryEntry = { member_code: string; name: string };

export default async function AdminDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; range?: string; page?: string }>;
}) {
  // warehouse included — warehouse staff assemble truck loads + issue the
  // delivery note (ใบส่งสินค้า) on-site (ภูม 2026-06-17 · owner confirmed).
  await requireAdmin(["ops", "super", "warehouse"]);

  const sp     = await searchParams;
  const status = (sp.status === "1" || sp.status === "2" || sp.status === "3") ? sp.status : null;
  const range  = sp.range ?? "90d";   // "90d" default · "all" override
  const admin  = createAdminClient();

  // Pagination — server-side window via ?page=N (PERF 2026-06-03).
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);

  // Build the WHERE clause. Default is "last 90 days" (legacy behaviour).
  let q = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdadminid, fdadmincreator, fdstatus, fdamount, endtime", { count: "exact" })
    .order("id", { ascending: false })
    .range(rowFrom, rowTo);

  if (status) q = q.eq("fdstatus", status);

  if (range !== "all") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    q = q.gte("fddate", cutoff.toISOString().substring(0, 10));
  }

  const { data: rowsData, error: rowsErr, count: totalBatches } = await q;
  if (rowsErr) {
    console.error("/admin/drivers: list query failed", rowsErr, { status, range });
    throw new Error(`ไม่สามารถอ่านรายการรอบจัดส่ง: ${rowsErr.message}`);
  }
  const rows = (rowsData ?? []) as unknown as BatchRow[];

  // Status tally (filter chips show counts of the active range).
  // Next 16 react-hooks/purity rule rejects raw `Date.now()` inline in render
  // — must be wrapped in a module-scope helper (see drivers/page.tsx top: `nowIso90dAgo`).
  const tallyCutoff = range !== "all" ? nowIso90dAgo() : "1970-01-01";
  const { data: tallyData, error: tallyErr } = await admin
    .from("tb_forwarder_driver")
    .select("fdstatus")
    .gte("fddate", tallyCutoff);
  if (tallyErr) {
    console.error("/admin/drivers: tally query failed", tallyErr);
  }
  const tally = (tallyData ?? []).reduce<Record<string, number>>((acc, r) => {
    const s = (r as { fdstatus: string }).fdstatus ?? "1";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // For each row, fetch the per-batch item count + total box count via a
  // single batched query, then join in memory. (PostgREST doesn't easily
  // give us SQL aggregates inside list responses.)
  const batchIds = rows.map((r) => r.id);
  type AggItemRow = { fdid: number; fid: number; fdistatus: string | null };
  let items: AggItemRow[] = [];
  if (batchIds.length > 0) {
    const { data: itemAggData, error: itemAggErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fdid, fid, fdistatus")
      .in("fdid", batchIds);
    if (itemAggErr) {
      console.error("/admin/drivers: item agg failed", itemAggErr);
    }
    items = (itemAggData ?? []) as unknown as AggItemRow[];
  }
  // For box-count we need to look up tb_forwarder.famount — but since items
  // can be 5000+ that's a separate concurrent query bounded to the visible
  // batches' fids only.
  const visibleFids = Array.from(new Set(items.map((i) => i.fid)));
  type FwdAmtRow = { id: number; famount: number | null };
  let fwdAmtData: FwdAmtRow[] = [];
  if (visibleFids.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, famount")
      .in("id", visibleFids);
    if (error) {
      console.error("/admin/drivers: forwarder amount lookup failed", error);
    }
    fwdAmtData = (data ?? []) as unknown as FwdAmtRow[];
  }
  const famountById = new Map(fwdAmtData.map((r) => [r.id, r.famount ?? 0]));
  const itemAgg = new Map<number, { itemCount: number; boxSum: number; doneCount: number }>();
  for (const it of items) {
    const cur = itemAgg.get(it.fdid) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
    cur.itemCount += 1;
    cur.boxSum   += famountById.get(it.fid) ?? 0;
    if (it.fdistatus === "2") cur.doneCount += 1;
    itemAgg.set(it.fdid, cur);
  }

  // Driver name directory — resolve fdadminid (legacy text id) → display name.
  // tb_users uses CAMELCASE columns (CLAUDE.md exception · userID/userName).
  const driverIds = Array.from(new Set(rows.map((r) => r.fdadminid).filter(Boolean) as string[]));
  let driverDirectory = new Map<string, DriverDirectoryEntry>();
  if (driverIds.length > 0) {
    const { data: usersData, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", driverIds);
    if (usersErr) {
      console.error("/admin/drivers: driver directory failed", usersErr);
    }
    driverDirectory = new Map(
      ((usersData ?? []) as { userID: string; userName: string | null; userLastName: string | null }[]).map((u) => [
        u.userID,
        { member_code: u.userID, name: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—" },
      ]),
    );
  }

  // ── GROUP the visible batches BY DRIVER (self-explaining-row standard) ──────
  // Pure-JS grouping over the already-fetched `rows`. No new DB query.
  // Group key = `fdadminid` (the legacy text driver id each batch carries).
  // Each group renders a header (driver name/code + per-status batch counts +
  // delivery progress) over its own batches in an expandable <details>.
  type Group = {
    key:        string;                       // fdadminid, or "__none__" when unassigned
    driverId:   string | null;
    driverName: string;
    batches:    BatchRow[];
    counts:     { s1: number; s2: number; s3: number }; // กำลังดำเนินการ / สำเร็จ / ไม่สำเร็จ
    doneStops:  number;                       // delivered stops across the group
    totalStops: number;                       // tracked items across the group
    boxSum:     number;
    hasExpired: boolean;                      // any open batch past its endtime
  };
  const groupMap = new Map<string, Group>();
  for (const r of rows) {
    const key = r.fdadminid ?? "__none__";
    let g = groupMap.get(key);
    if (!g) {
      const dir = r.fdadminid ? driverDirectory.get(r.fdadminid) : null;
      g = {
        key,
        driverId:   r.fdadminid ?? null,
        driverName: dir?.name ?? (r.fdadminid ? r.fdadminid : "ยังไม่ระบุคนขับ"),
        batches:    [],
        counts:     { s1: 0, s2: 0, s3: 0 },
        doneStops:  0,
        totalStops: 0,
        boxSum:     0,
        hasExpired: false,
      };
      groupMap.set(key, g);
    }
    g.batches.push(r);
    const fdstatus = (r.fdstatus ?? "1") as FdStatus;
    if (fdstatus === "1") g.counts.s1 += 1;
    else if (fdstatus === "2") g.counts.s2 += 1;
    else if (fdstatus === "3") g.counts.s3 += 1;
    const agg = itemAgg.get(r.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
    g.doneStops  += agg.doneCount;
    g.totalStops += agg.itemCount;
    g.boxSum     += agg.boxSum;
    if (r.endtime && new Date(r.endtime) < new Date() && fdstatus === "1") g.hasExpired = true;
  }
  // Order: drivers with open (กำลังดำเนินการ) batches first, then by batch count.
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if ((b.counts.s1 > 0 ? 1 : 0) !== (a.counts.s1 > 0 ? 1 : 0)) {
      return (b.counts.s1 > 0 ? 1 : 0) - (a.counts.s1 > 0 ? 1 : 0);
    }
    return b.batches.length - a.batches.length;
  });

  // Pending forwarders ready for assignment for the CTA badge + the alert banner.
  // 2026-06-19 (owner): the accurate "รอจัดรถ" = fstatus=6 (เตรียมส่ง · ชำระแล้ว) NOT
  // already in an open driver batch (the plain fstatus=6 count over-counted by
  // including rows already on a run). Warehouse/planning sees this → confirm-saves.
  const readyCount = await countPendingDispatch(admin);

  // ── CSV export — columns mirror the <thead> 1:1, multi-line cells split out ──
  const csvCols: CsvCol[] = [
    { key: "id",          label: "เลขที่" },
    { key: "fddate",      label: "วันที่" },
    { key: "endtime",     label: "ส่งก่อน" },
    { key: "fdname",      label: "ชื่อรายการ" },
    { key: "driver_id",   label: "รหัสคนขับ" },
    { key: "driver_name", label: "ชื่อคนขับ" },
    { key: "creator",     label: "ผู้สร้าง" },
    { key: "item_count",  label: "แทรคกิ้ง" },
    { key: "box_sum",     label: "กล่อง" },
    { key: "stop_count",  label: "จุดส่ง" },
    { key: "done_count",  label: "ส่งแล้ว" },
    { key: "status",      label: "สถานะ" },
  ];
  const csvRows: CsvRow[] = rows.map((r) => {
    const agg     = itemAgg.get(r.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
    const driver  = r.fdadminid ? driverDirectory.get(r.fdadminid) : null;
    return {
      id:          r.id,
      fddate:      r.fddate ? r.fddate.slice(0, 10) : "",
      endtime:     r.endtime ? r.endtime.slice(0, 16).replace("T", " ") : "",
      fdname:      r.fdname ?? `รอบ #${r.id}`,
      driver_id:   r.fdadminid ?? "",
      driver_name: driver?.name ?? "",
      creator:     r.fdadmincreator ?? "",
      item_count:  agg.itemCount,
      box_sum:     agg.boxSum,
      stop_count:  r.fdamount ?? 0,
      done_count:  agg.doneCount,
      status:      STATUS_LABEL[(r.fdstatus ?? "1") as FdStatus] ?? "ไม่ระบุ",
    };
  });

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">CARGO · มอบงานคนขับ</p>
          <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" />
            รายการขนส่งสินค้า
          </h1>
          <p className="mt-1 text-sm text-muted">
            จัดกลุ่มตามคนขับ — กดที่ชื่อคนขับเพื่อกาง/ยุบรอบจัดส่ง (1 รอบ = 1 คนขับ · N จุดส่ง). คลิกแถวเพื่อดูรายละเอียดและถ่ายภาพส่งของ
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`drivers-${range}${status ? `-status${status}` : ""}.csv`}
            fetchAll={async () => {
              "use server";
              return exportDriversAll({ status, range });
            }}
          />
          <Link
            href="/admin/drivers/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            สร้างรายการขนส่ง
            {(readyCount ?? 0) > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {readyCount} รอมอบ
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* 🚐 Pending-dispatch alert — paid/ready forwarders with no driver yet. */}
      {readyCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            <Truck className="inline h-4 w-4 mr-1" />
            <strong>{readyCount}</strong> รายการชำระแล้ว/เตรียมส่ง <strong>รอจัดรถ</strong> (ยังไม่มอบงานคนขับ) —
            กดจัดรถแล้ว <strong>เฟิมบันทึก</strong> เพื่อมอบงาน
          </p>
          <Link
            href="/admin/drivers/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> จัดรถ (เฟิมบันทึก)
          </Link>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip href={buildHref({ status: null, range })} active={!status}>
          ทั้งหมด ({(tallyData ?? []).length})
        </Chip>
        {(["1", "2", "3"] as FdStatus[]).map((s) => (
          <Chip key={s} href={buildHref({ status: s, range })} active={status === s}>
            <span className="inline-flex items-center gap-1">
              {STATUS_ICON[s]}
              {STATUS_LABEL[s]} ({tally[s] ?? 0})
            </span>
          </Chip>
        ))}
        <span className="text-xs text-muted self-center px-2">|</span>
        <Chip href={buildHref({ status, range: "90d" })} active={range !== "all"}>
          90 วันล่าสุด
        </Chip>
        <Chip href={buildHref({ status, range: "all" })} active={range === "all"}>
          ทั้งหมด
        </Chip>
      </div>

      {/* Grouped by driver — one block per คนขับ, batches expandable beneath. */}
      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white shadow-sm p-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
            <p className="text-sm text-muted">ยังไม่มีรอบจัดส่งในช่วงนี้</p>
          </div>
        ) : (
          groups.map((g) => (
            <details
              key={g.key}
              open={g.counts.s1 > 0}
              className="group rounded-2xl border border-border bg-white shadow-sm overflow-hidden"
            >
              {/* Driver header = at-a-glance summary (whose · counts · progress) */}
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-alt/30 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                    <Truck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{g.driverName}</span>
                      {g.driverId && (
                        <span className="font-mono text-[11px] text-muted">{g.driverId}</span>
                      )}
                      {g.hasExpired && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                          <AlertCircle className="h-3 w-3" /> มีงานเลยเวลา
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {g.batches.length} รอบ · ส่งแล้ว {g.doneStops}/{g.totalStops} จุด · กล่อง {g.boxSum}
                    </div>
                  </div>
                </div>
                {/* Per-status batch counts */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {g.counts.s1 > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS["1"]}`}>
                      {STATUS_ICON["1"]} {STATUS_LABEL["1"]} {g.counts.s1}
                    </span>
                  )}
                  {g.counts.s2 > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS["2"]}`}>
                      {STATUS_ICON["2"]} {STATUS_LABEL["2"]} {g.counts.s2}
                    </span>
                  )}
                  {g.counts.s3 > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS["3"]}`}>
                      {STATUS_ICON["3"]} {STATUS_LABEL["3"]} {g.counts.s3}
                    </span>
                  )}
                  <span className="ml-1 text-xs text-muted transition-transform group-open:rotate-90">▸</span>
                </div>
              </summary>

              {/* The driver's batches */}
              <div className="overflow-x-auto scrollbar-x-visible border-t border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap">เลขที่</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">วันที่/ส่งก่อน</th>
                      <th className="px-3 py-2.5">ชื่อรายการ</th>
                      <th className="px-3 py-2.5">ผู้สร้าง</th>
                      <th className="px-3 py-2.5 whitespace-nowrap text-right">ส่งแล้ว</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.batches.map((r) => {
                      const fdstatus = (r.fdstatus ?? "1") as FdStatus;
                      const agg     = itemAgg.get(r.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
                      const expired = r.endtime && new Date(r.endtime) < new Date() && fdstatus === "1";
                      return (
                        <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <Link
                              href={`/admin/drivers/${r.id}`}
                              className="font-mono text-primary-600 hover:underline font-semibold"
                            >
                              #{r.id}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                            {r.fddate && (
                              <div>{formatThaiDate(r.fddate)}</div>
                            )}
                            {r.endtime && (
                              <div className={expired ? "text-rose-600 font-medium" : ""}>
                                → {formatThaiDateTime(r.endtime)}
                                {expired ? " (เลย)" : ""}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={`/admin/drivers/${r.id}`}
                              className="text-primary-600 hover:underline"
                            >
                              {r.fdname ?? `รอบ #${r.id}`}
                            </Link>
                            <div className="text-[11px] text-muted">
                              แทรคกิ้ง {agg.itemCount} · กล่อง {agg.boxSum} · จุดส่ง {r.fdamount ?? 0}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted">{r.fdadmincreator ?? "—"}</td>
                          <td className="px-3 py-3 text-xs text-right">
                            <div className="font-medium">{agg.doneCount} / {agg.itemCount}</div>
                            <div className="text-[11px] text-muted">ส่งแล้ว</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[fdstatus]}`}
                            >
                              {STATUS_ICON[fdstatus]}
                              {STATUS_LABEL[fdstatus]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalBatches ?? 0}
        basePath="/admin/drivers"
        params={{ status: sp.status, range: sp.range }}
      />

      <p className="text-[11px] text-muted">
        ฐานข้อมูล: legacy <code className="rounded bg-surface-alt px-1">tb_forwarder_driver</code>{" "}
        + <code className="rounded bg-surface-alt px-1">tb_forwarder_driver_item</code>{" "}
        — ทั้งหมด {(tallyData ?? []).length} รอบในช่วง {range === "all" ? "ทั้งหมด" : "90 วัน"}
      </p>
    </main>
  );
}

function buildHref({ status, range }: { status: string | null; range: string }) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (range && range !== "90d") p.set("range", range);
  const qs = p.toString();
  return qs ? `/admin/drivers?${qs}` : "/admin/drivers";
}

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs min-h-[32px] inline-flex items-center ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border hover:bg-surface-alt text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
