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
  searchParams: Promise<{ status?: string; range?: string }>;
}) {
  await requireAdmin(["ops", "super"]);

  const sp     = await searchParams;
  const status = (sp.status === "1" || sp.status === "2" || sp.status === "3") ? sp.status : null;
  const range  = sp.range ?? "90d";   // "90d" default · "all" override
  const admin  = createAdminClient();

  // Build the WHERE clause. Default is "last 90 days" (legacy behaviour).
  let q = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdadminid, fdadmincreator, fdstatus, fdamount, endtime")
    .order("id", { ascending: false })
    .limit(200);

  if (status) q = q.eq("fdstatus", status);

  if (range !== "all") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    q = q.gte("fddate", cutoff.toISOString().substring(0, 10));
  }

  const { data: rowsData, error: rowsErr } = await q;
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

  // Pending forwarders ready for assignment (fstatus=6 = เตรียมส่ง) for the
  // CTA badge — the legacy "x รายการรอมอบหมาย" chip on top of the create button.
  const { count: readyCount, error: readyErr } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("fstatus", "6");
  if (readyErr) console.error("/admin/drivers: ready count failed", readyErr);

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
            แต่ละแถว = หนึ่งรอบจัดส่ง (1 คนขับ · N จุดส่ง). คลิกแถวเพื่อดูรายละเอียดและถ่ายภาพส่งของ
          </p>
        </div>

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

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
            <p className="text-sm text-muted">ยังไม่มีรอบจัดส่งในช่วงนี้</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 whitespace-nowrap">เลขที่</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">วันที่/ส่งก่อน</th>
                  <th className="px-3 py-2.5">ชื่อรายการ</th>
                  <th className="px-3 py-2.5">คนขับ</th>
                  <th className="px-3 py-2.5">ผู้สร้าง</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">รายการ</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const fdstatus = (r.fdstatus ?? "1") as FdStatus;
                  const agg     = itemAgg.get(r.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
                  const driver  = r.fdadminid ? driverDirectory.get(r.fdadminid) : null;
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
                          <div>{new Date(r.fddate).toLocaleDateString("th-TH")}</div>
                        )}
                        {r.endtime && (
                          <div className={expired ? "text-rose-600 font-medium" : ""}>
                            → {new Date(r.endtime).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
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
                      <td className="px-3 py-3 text-xs">
                        <div className="font-mono">{r.fdadminid ?? "—"}</div>
                        {driver && <div className="text-muted">{driver.name}</div>}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{r.fdadmincreator ?? "—"}</td>
                      <td className="px-3 py-3 text-xs text-right">
                        <div className="font-medium">{agg.doneCount} / {agg.itemCount}</div>
                        <div className="text-[10px] text-muted">ส่งแล้ว</div>
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
        )}
      </div>

      <p className="text-[10px] text-muted">
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
