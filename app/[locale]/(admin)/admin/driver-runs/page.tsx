/**
 * /admin/driver-runs — "รายการคนขับรถ / ยอดพนักขับรถ"
 *
 * FAITHFUL PORT of the legacy per-driver performance report
 *   member/pcs-admin/report-driver-2023.php   (the one wired in the legacy
 *   ออกรายงาน menu — report-driver.php is a stub that redirects here).
 *
 * The legacy screen is a per-DRIVER work-VOLUME report used to compare drivers
 * over a date range by: จำนวนจุดที่ส่ง / จำนวนแทรคกิ้ง / จำนวนกล่อง / น้ำหนัก (kg) /
 * ปริมาตร (CBM) / ใช้เวลาทำงาน (นาที). It is NOT a money report — legacy
 * report-driver-2023 shows no baht/payout column (the "ยอดขาย/ส่วนแบ่ง" columns
 * live in the unrelated report-driver.php?page=detail stub over tb_sales_report,
 * which is a SALES report, not a driver one). So this page renders the raw work
 * aggregates only — no invented commission/payout formula.
 *
 * READ-ONLY. No .insert/.update/.upsert/.delete anywhere. Every query
 * destructures `error` and logs-then-continues (never a silent null).
 *
 * ── Legacy → Pacred data map ────────────────────────────────────────────────
 *   tb_forwarder_driver_item  fdi   (id, fdid→batch, fid→forwarder, fdistatus)
 *   tb_forwarder_driver       fd    (id, fddate, fdadminid[driver], fdadmincreator[assignor], fdstatus, fdname)
 *   tb_forwarder              f     (famount[boxes], fweight, fvolume, fshipby, fdatestatus7[delivered], faddress*, userid)
 *   tb_users                  a     (driver display name — legacy joins tb_admin.adminName;
 *                                    Pacred drivers carry a member_code, resolved here via tb_users
 *                                    like the existing /admin/drivers/work pattern)
 *
 * Legacy grouping (reproduced exactly):
 *   - external carriers (fShipBy<>'PCSF'):  GROUP BY fd.ID, f.fShipBy
 *   - own-fleet (fShipBy='PCSF'/'PRF'):     GROUP BY fd.ID, f.userID, f.fAddressNo
 *   countF = COUNT(items) in the group ("แทรคกิ้ง").
 *
 * Working time  = calculate_time_difference(fddate, fdatestatus7)
 *               = round(|delivered − assigned| / 60) minutes  (legacy include/function.php:2659).
 * Grand average = Σ(work minutes over completed groups) / (total groups)  — legacy /$no semantics.
 *
 * Filters (faithful): date-range (default = this month) · สถานะดำเนินงาน (fdstatus all/1/2/3) ·
 * ประเภทบริษัทขนส่ง (all / own-fleet / external) · optional per-driver scope.
 *
 * A compact "งานที่กำลังวิ่ง (สด)" section is derived from the SAME already-loaded
 * batch set (fdstatus=1 = กำลังดำเนินการ) — zero extra queries — to keep the useful
 * live-dispatch cue without the old inverted-purpose paradigm.
 */

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { parseDbInstant, formatThaiDateTime, formatThaiDate } from "@/lib/utils/thai-datetime";

export const dynamic = "force-dynamic";

// ── Legacy nameStatusDriver() — include/function.php:2666 ───────────────────
const DRIVER_STATUS_LABEL: Record<string, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};
const DRIVER_STATUS_BADGE: Record<string, string> = {
  "1": "bg-blue-50 text-blue-700 border-blue-200",
  "2": "bg-green-50 text-green-700 border-green-200",
  "3": "bg-red-50 text-red-700 border-red-200",
};

// Own-fleet ("PCS เหมาๆ") tokens — legacy fShipBy='PCSF'; PRF = the Pacred rebrand code.
const OWN_FLEET_CODES = new Set(["PCSF", "PRF"]);

// ── Row shapes ──────────────────────────────────────────────────────────────
type BatchRow = {
  id: number;
  fddate: string | null;
  fdadminid: string;
  fdadmincreator: string | null;
  fdstatus: string | null;
  fdname: string | null;
};
type ItemRow = { id: number; fdid: number; fid: number; fdistatus: string | null };
type ForwarderRow = {
  id: number;
  userid: string | null;
  famount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fshipby: string | null;
  fdatestatus7: string | null;
  fidorco: string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddressno: string | null;
  faddresssubdistrict: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
  faddresstel: string | null;
  faddresstel2: string | null;
};
type DriverUser = { userID: string; userName: string | null; userLastName: string | null };

// A grouped detail row (one per legacy GROUP-BY bucket).
type DetailGroup = {
  key: string;
  fdid: number;
  fddate: string | null;
  fdadminid: string;
  fdadmincreator: string | null;
  fdstatus: string | null;
  fshipby: string | null;
  address: string;
  countF: number; // trackings (items in the group)
  boxes: number; // Σ famount
  weight: number; // Σ fweight
  volume: number; // Σ fvolume
  deliveredAt: string | null; // representative fdatestatus7
  workMinutes: number | null; // calculate_time_difference(fddate, deliveredAt)
};

// Per-driver summary (myTableByAdmin).
type DriverSummary = {
  adminID: string;
  name: string;
  points: number; // จำนวนจุดที่ส่ง = # of detail groups
  countF: number; // จำนวนแทรคกิ้ง
  boxes: number; // จำนวนกล่อง
  weight: number;
  volume: number;
  workMinutesSum: number; // Σ work minutes over completed groups
  completedGroups: number; // # groups that had a delivered time
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? (n as number) : 0;
};

/** calculate_time_difference — minutes between assigned + delivered (legacy 2659). */
function workMinutes(assigned: string | null, delivered: string | null): number | null {
  if (!assigned || !delivered) return null;
  const a = parseDbInstant(assigned);
  const d = parseDbInstant(delivered);
  if (!a || !d) return null;
  return Math.round(Math.abs(d.getTime() - a.getTime()) / 60000);
}

/** First/last calendar day of the current month in Asia/Bangkok (legacy default). */
function currentMonthRange(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const intTh = (n: number) => n.toLocaleString("th-TH");
const dec2 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dec4 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Chunked `.in()` fetch — keeps URLs short for big id sets. */
async function fetchByIds<T>(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  select: string,
  col: string,
  ids: (number | string)[],
  tag: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await admin.from(table).select(select).in(col, chunk).limit(50000);
    if (error) {
      console.error(`[${tag}] chunk failed`, { code: error.code, message: error.message });
      continue;
    }
    if (data) out.push(...(data as unknown as T[]));
  }
  return out;
}

export default async function DriverRunsPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    date?: string; // legacy "YYYY-MM-DD - YYYY-MM-DD" URL contract
    type?: string; // fdstatus filter: all | 1 | 2 | 3
    typeT?: string; // carrier filter: all | 1 (own-fleet) | 2 (external)
    driver?: string;
  }>;
}) {
  // Faithful to legacy access (CEO/Manager/QA/Accounting/ITDT/Warehouse) —
  // mapped to the roles this Pacred surface already used + the report roles.
  await requireAdmin(["super", "ops", "accounting", "sales", "sales_admin", "qa", "warehouse"]);
  const sp = await searchParams;

  // ── Resolve filters ────────────────────────────────────────────────────────
  const def = currentMonthRange();
  let start = def.start;
  let end = def.end;
  if (sp.date && sp.date.includes(" - ")) {
    const [a, b] = sp.date.split(" - ");
    if (ISO_DATE.test(a?.trim() ?? "")) start = a.trim();
    if (ISO_DATE.test(b?.trim() ?? "")) end = b.trim();
  }
  if (ISO_DATE.test(sp.start?.trim() ?? "")) start = sp.start!.trim();
  if (ISO_DATE.test(sp.end?.trim() ?? "")) end = sp.end!.trim();
  if (start > end) [start, end] = [end, start];

  const statusFilter = ["1", "2", "3"].includes(sp.type ?? "") ? sp.type! : "all";
  const carrierFilter = ["1", "2"].includes(sp.typeT ?? "") ? sp.typeT! : "all";
  const filterDriver = sp.driver?.trim() || null;

  const admin = createAdminClient();

  // ── 1. Batches within the date range (legacy DATE(fdDate) BETWEEN) ─────────
  let batchQ = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdadminid, fdadmincreator, fdstatus, fdname")
    .gte("fddate", `${start} 00:00:00`)
    .lte("fddate", `${end} 23:59:59`)
    .order("fddate", { ascending: true })
    .limit(5000);
  if (statusFilter !== "all") batchQ = batchQ.eq("fdstatus", statusFilter);
  if (filterDriver) batchQ = batchQ.eq("fdadminid", filterDriver);
  const { data: batchData, error: batchErr } = await batchQ;
  if (batchErr) {
    console.error(`[tb_forwarder_driver report] failed`, {
      code: batchErr.code, message: batchErr.message, start, end,
    });
  }
  const batches = (batchData ?? []) as BatchRow[];
  const batchById = new Map(batches.map((b) => [b.id, b]));

  // ── 2. Items for those batches ─────────────────────────────────────────────
  const batchIds = batches.map((b) => b.id);
  const items = batchIds.length
    ? await fetchByIds<ItemRow>(
        admin, "tb_forwarder_driver_item", "id, fdid, fid, fdistatus", "fdid", batchIds,
        "tb_forwarder_driver_item report",
      )
    : [];

  // ── 3. Forwarders for those items ──────────────────────────────────────────
  const fwdIds = Array.from(new Set(items.map((i) => i.fid))).filter((v) => v != null);
  const forwarders = fwdIds.length
    ? await fetchByIds<ForwarderRow>(
        admin, "tb_forwarder",
        "id, userid, famount, fweight, fvolume, fshipby, fdatestatus7, fidorco, " +
          "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
          "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2",
        "id", fwdIds, "tb_forwarder report",
      )
    : [];
  const fwdById = new Map(forwarders.map((f) => [f.id, f]));

  // ── 4. Group items into legacy GROUP-BY buckets ────────────────────────────
  const groupMap = new Map<string, DetailGroup>();
  for (const it of items) {
    const batch = batchById.get(it.fdid);
    const fwd = fwdById.get(it.fid);
    if (!batch || !fwd) continue; // drop orphans

    const isOwnFleet = OWN_FLEET_CODES.has((fwd.fshipby ?? "").toUpperCase());
    // carrier filter (legacy typeT: "1"=own-fleet only, "2"=external only)
    if (carrierFilter === "1" && !isOwnFleet) continue;
    if (carrierFilter === "2" && isOwnFleet) continue;

    const key = isOwnFleet
      ? `${it.fdid}|${fwd.userid ?? ""}|${fwd.faddressno ?? ""}` // GROUP BY fd.ID, userID, fAddressNo
      : `${it.fdid}|${fwd.fshipby ?? ""}`; //                       GROUP BY fd.ID, fShipBy

    let g = groupMap.get(key);
    if (!g) {
      const address = [
        [fwd.faddressname, fwd.faddresslastname].filter(Boolean).join(" "),
        fwd.faddressno,
        fwd.faddresssubdistrict ? `ต.${fwd.faddresssubdistrict}` : null,
        fwd.faddressdistrict ? `อ.${fwd.faddressdistrict}` : null,
        fwd.faddressprovince ? `จ.${fwd.faddressprovince}` : null,
        fwd.faddresszipcode,
        fwd.faddresstel ? `โทร. ${fwd.faddresstel}` : null,
      ].filter(Boolean).join(" ");
      g = {
        key,
        fdid: it.fdid,
        fddate: batch.fddate,
        fdadminid: batch.fdadminid,
        fdadmincreator: batch.fdadmincreator,
        fdstatus: batch.fdstatus,
        fshipby: fwd.fshipby,
        address,
        countF: 0, boxes: 0, weight: 0, volume: 0,
        deliveredAt: null, workMinutes: null,
      };
      groupMap.set(key, g);
    }
    g.countF += 1;
    g.boxes += num(fwd.famount);
    g.weight += num(fwd.fweight);
    g.volume += num(fwd.fvolume);
    // Keep the latest delivered timestamp in the group (legacy picks one arbitrarily).
    if (fwd.fdatestatus7) {
      if (!g.deliveredAt || fwd.fdatestatus7 > g.deliveredAt) g.deliveredAt = fwd.fdatestatus7;
    }
  }
  const groups = Array.from(groupMap.values());
  for (const g of groups) g.workMinutes = workMinutes(g.fddate, g.deliveredAt);
  // Sort by assign date asc (legacy order [[0,'asc']]).
  groups.sort((a, b) => (a.fddate ?? "").localeCompare(b.fddate ?? ""));

  // ── 5. Resolve driver display names (fdadminid → tb_users) ─────────────────
  const driverIds = Array.from(new Set(groups.map((g) => g.fdadminid))).filter(Boolean);
  let driverById = new Map<string, DriverUser>();
  if (driverIds.length) {
    const rows = await fetchByIds<DriverUser>(
      admin, "tb_users", "userID, userName, userLastName", "userID", driverIds,
      "tb_users driver name",
    );
    driverById = new Map(rows.map((u) => [u.userID, u]));
  }
  const driverName = (id: string): string => {
    const u = driverById.get(id);
    return u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "";
  };

  // ── 6. Per-driver summary + grand totals ───────────────────────────────────
  const summaryMap = new Map<string, DriverSummary>();
  let totCountF = 0, totBoxes = 0, totWeight = 0, totVolume = 0, totWorkMinutes = 0;
  for (const g of groups) {
    totCountF += g.countF;
    totBoxes += g.boxes;
    totWeight += g.weight;
    totVolume += g.volume;
    if (g.workMinutes != null) totWorkMinutes += g.workMinutes;

    let s = summaryMap.get(g.fdadminid);
    if (!s) {
      s = {
        adminID: g.fdadminid,
        name: driverName(g.fdadminid),
        points: 0, countF: 0, boxes: 0, weight: 0, volume: 0,
        workMinutesSum: 0, completedGroups: 0,
      };
      summaryMap.set(g.fdadminid, s);
    }
    s.points += 1;
    s.countF += g.countF;
    s.boxes += g.boxes;
    s.weight += g.weight;
    s.volume += g.volume;
    if (g.workMinutes != null) {
      s.workMinutesSum += g.workMinutes;
      s.completedGroups += 1;
    }
  }
  const summaries = Array.from(summaryMap.values()).sort((a, b) => b.countF - a.countF);
  const totalGroups = groups.length;
  // Legacy grand average = Σ(minutes over completed) / (total groups).
  const grandAvgWorkMinutes = totalGroups > 0 ? Math.round(totWorkMinutes / totalGroups) : 0;

  // ── 7. Chart series (per driver) ───────────────────────────────────────────
  const chartDrivers = summaries.slice(0, 20); // cap labels for legibility
  const chartLabels = chartDrivers.map((s) => (s.name ? `${s.adminID} · ${s.name}` : s.adminID));

  // ── 8. Live cue derived from the same batch set (zero extra queries) ───────
  const activeBatches = batches.filter((b) => b.fdstatus === "1");

  // ── 9. Driver directory for the filter (from the loaded batches) ───────────
  const directory = Array.from(new Set(batches.map((b) => b.fdadminid)))
    .filter(Boolean)
    .map((id) => {
      const n = driverName(id);
      return { id, label: n ? `${id} · ${n}` : id };
    });

  const rangeLabel = `${formatThaiDate(`${start}T00:00:00`)} – ${formatThaiDate(`${end}T00:00:00`)}`;

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/driver-runs" />
      <main className="p-4 lg:p-6 space-y-5">
        <PageHeader
          eyebrow="ออกรายงาน · คนขับรถ"
          title={filterDriver ? `รายงานคนขับ ${filterDriver}` : "รายการคนขับรถ (เปรียบเทียบ)"}
          subtitle={
            <>
              เทียบผลงานคนขับตามช่วงเวลา — จำนวนงาน · แทรคกิ้ง · กล่อง · น้ำหนัก · CBM · เวลาทำงาน.
              อ่านจาก legacy <code className="rounded bg-surface-alt px-1 text-xs">tb_forwarder_driver_item</code> ·
              พอร์ตจาก <code className="rounded bg-surface-alt px-1 text-xs">report-driver-2023.php</code>
            </>
          }
          actions={
            <Link
              href="/admin/drivers"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-bold hover:bg-surface-alt"
            >
              จัดการมอบหมาย →
            </Link>
          }
        />

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <form method="GET" className="rounded-xl border border-border bg-white p-3 flex flex-wrap gap-3 items-end text-sm">
          <div>
            <label className="text-xs text-muted block mb-1">สถานะดำเนินงาน</label>
            <select name="type" defaultValue={statusFilter} className="rounded-md border border-border bg-white px-3 py-2">
              <option value="all">ทั้งหมด</option>
              <option value="1">กำลังดำเนินการ</option>
              <option value="2">สำเร็จ</option>
              <option value="3">ไม่สำเร็จ</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">ประเภทบริษัทขนส่ง</label>
            <select name="typeT" defaultValue={carrierFilter} className="rounded-md border border-border bg-white px-3 py-2">
              <option value="all">ทั้งหมด</option>
              <option value="1">Pacred เหมาๆ (คนขับเอง)</option>
              <option value="2">ขนส่งภายนอก</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">ตั้งแต่วันที่</label>
            <input type="date" name="start" defaultValue={start} className="rounded-md border border-border bg-white px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">ถึงวันที่</label>
            <input type="date" name="end" defaultValue={end} className="rounded-md border border-border bg-white px-3 py-2" />
          </div>
          {directory.length > 0 && (
            <div className="min-w-[200px]">
              <label className="text-xs text-muted block mb-1">คนขับ</label>
              <select name="driver" defaultValue={filterDriver ?? ""} className="w-full rounded-md border border-border bg-white px-3 py-2">
                <option value="">— ทุกคน —</option>
                {directory.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="rounded-md bg-primary-500 text-white font-semibold px-4 py-2 hover:bg-primary-600">
            ค้นหาข้อมูล
          </button>
          {(filterDriver || statusFilter !== "all" || carrierFilter !== "all") && (
            <Link href="/admin/driver-runs" className="rounded-md border border-border bg-white px-4 py-2 hover:bg-surface-alt">
              ล้าง
            </Link>
          )}
          <span className="text-[11px] text-danger">ผลลัพธ์: {rangeLabel}</span>
        </form>

        {batches.length >= 5000 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            ⚠️ ช่วงเวลานี้มีรอบงานมากกว่า 5,000 รอบ — แสดงเฉพาะ 5,000 รอบแรก โปรดแคบช่วงวันที่ลง
          </p>
        )}

        {/* ── Grand totals ──────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <TotalCard label="จำนวนจุดที่ส่ง" value={intTh(totalGroups)} />
          <TotalCard label="จำนวนแทรคกิ้ง" value={intTh(totCountF)} />
          <TotalCard label="จำนวนกล่อง" value={intTh(totBoxes)} />
          <TotalCard label="น้ำหนักรวม (kg)" value={dec2(totWeight)} />
          <TotalCard label="ปริมาตรรวม (CBM)" value={dec4(totVolume)} />
          <TotalCard label="เวลาทำงานเฉลี่ย (นาที)" value={intTh(grandAvgWorkMinutes)} />
        </section>

        {/* ── Per-driver summary table (myTableByAdmin) ─────────────────── */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">🚚 สรุปตามคนขับ ({summaries.length} คน)</h2>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead>
                <tr className="bg-orange-500 text-white text-left text-[12px]">
                  <th className="px-3 py-2">คนขับรถ</th>
                  <th className="px-3 py-2">ชื่อ - นามสกุล</th>
                  <th className="px-3 py-2 text-right">จำนวนจุดที่ส่ง</th>
                  <th className="px-3 py-2 text-right">จำนวนแทรคกิ้ง</th>
                  <th className="px-3 py-2 text-right">จำนวนกล่อง</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก (kg)</th>
                  <th className="px-3 py-2 text-right">ปริมาตร (CBM)</th>
                  <th className="px-3 py-2 text-right">เวลาเฉลี่ย (นาที)</th>
                </tr>
              </thead>
              <tbody>
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-muted">ไม่มีรายการในช่วงนี้</td>
                  </tr>
                ) : (
                  summaries.map((s) => (
                    <tr key={s.adminID} className="hover:bg-surface-alt/40">
                      <td className="px-3 py-2 font-mono">
                        <Link
                          href={`/admin/driver-runs?start=${start}&end=${end}&driver=${encodeURIComponent(s.adminID)}`}
                          className="text-primary-600 hover:underline"
                        >
                          {s.adminID}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{s.name || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{intTh(s.points)}</td>
                      <td className="px-3 py-2 text-right font-mono">{intTh(s.countF)}</td>
                      <td className="px-3 py-2 text-right font-mono">{intTh(s.boxes)}</td>
                      <td className="px-3 py-2 text-right font-mono">{dec2(s.weight)}</td>
                      <td className="px-3 py-2 text-right font-mono">{dec4(s.volume)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {s.completedGroups > 0 ? intTh(Math.round(s.workMinutesSum / s.points)) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {summaries.length > 0 && (
                <tfoot>
                  <tr className="bg-cyan-100 text-cyan-900 font-semibold text-[12px]">
                    <td className="border border-cyan-300 px-3 py-2" colSpan={2}>รวมทั้งหมด</td>
                    <td className="border border-cyan-300 px-3 py-2 text-right font-mono">{intTh(totalGroups)}</td>
                    <td className="border border-cyan-300 px-3 py-2 text-right font-mono">{intTh(totCountF)}</td>
                    <td className="border border-cyan-300 px-3 py-2 text-right font-mono">{intTh(totBoxes)}</td>
                    <td className="border border-cyan-300 px-3 py-2 text-right font-mono">{dec2(totWeight)}</td>
                    <td className="border border-cyan-300 px-3 py-2 text-right font-mono">{dec4(totVolume)}</td>
                    <td className="border border-cyan-300 px-3 py-2 text-right font-mono">{intTh(grandAvgWorkMinutes)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* ── 3 comparison charts ──────────────────────────────────────── */}
        {chartDrivers.length > 0 && (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="กราฟรายงาน — งาน / แทรคกิ้ง / กล่อง">
              <GroupedBarChart
                labels={chartLabels}
                series={[
                  { name: "จำนวนจุดที่ส่ง", color: "#28d094", data: chartDrivers.map((s) => s.points) },
                  { name: "จำนวนแทรคกิ้ง", color: "#ff9149", data: chartDrivers.map((s) => s.countF) },
                  { name: "จำนวนกล่อง", color: "#666ee8", data: chartDrivers.map((s) => s.boxes) },
                ]}
              />
            </ChartCard>
            <ChartCard title="กราฟรายงาน — น้ำหนัก (kg)">
              <GroupedBarChart
                labels={chartLabels}
                decimals={2}
                series={[{ name: "น้ำหนัก (kg)", color: "#ff9149", data: chartDrivers.map((s) => s.weight) }]}
              />
            </ChartCard>
            <ChartCard title="กราฟรายงาน — ปริมาตร (CBM)">
              <GroupedBarChart
                labels={chartLabels}
                decimals={4}
                series={[{ name: "ปริมาตร (CBM)", color: "#1e9ff2", data: chartDrivers.map((s) => s.volume) }]}
              />
            </ChartCard>
          </section>
        )}

        {/* ── Live cue: in-progress batches (derived, no extra query) ───── */}
        {activeBatches.length > 0 && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-200">
              <h2 className="font-bold text-sm text-blue-800">🛻 งานที่กำลังวิ่ง (สด) — {activeBatches.length} รอบ</h2>
            </div>
            <ul className="divide-y divide-blue-100 text-xs">
              {activeBatches.slice(0, 25).map((b) => (
                <li key={b.id} className="px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                  <span>
                    <Link href={`/admin/drivers/${b.id}`} className="font-mono text-primary-600 hover:underline">รอบ #{b.id}</Link>
                    {" · "}คนขับ <span className="font-mono">{b.fdadminid}</span>
                    {driverName(b.fdadminid) && ` · ${driverName(b.fdadminid)}`}
                  </span>
                  <span className="text-muted">{formatThaiDateTime(b.fddate)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Detail table (myTable) ───────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">📋 รายละเอียดรายรอบ ({intTh(groups.length)} รายการ)</h2>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-[12px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead>
                <tr className="bg-orange-500 text-white text-left whitespace-nowrap">
                  <th className="px-2 py-2">วันที่มอบงาน</th>
                  <th className="px-2 py-2">เลขที่รายการ</th>
                  <th className="px-2 py-2">ผู้มอบงาน</th>
                  <th className="px-2 py-2">คนขับรถ</th>
                  <th className="px-2 py-2 text-right">แทรคกิ้ง</th>
                  <th className="px-2 py-2 text-right">กล่อง</th>
                  <th className="px-2 py-2 text-right">น้ำหนัก kg</th>
                  <th className="px-2 py-2 text-right">ปริมาตร CBM</th>
                  <th className="px-2 py-2">สถานที่ไปส่ง</th>
                  <th className="px-2 py-2">บริษัทขนส่ง</th>
                  <th className="px-2 py-2">เวลาที่ไปส่ง</th>
                  <th className="px-2 py-2 text-right">ใช้เวลา<br />(นาที)</th>
                  <th className="px-2 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-10 text-center text-muted">ไม่มีรายการในช่วงนี้</td>
                  </tr>
                ) : (
                  groups.slice(0, 1000).map((g) => (
                    <tr key={g.key} className="hover:bg-surface-alt/40 align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatThaiDateTime(g.fddate)}</td>
                      <td className="px-2 py-1.5">
                        <Link href={`/admin/drivers/${g.fdid}`} className="font-mono text-primary-600 hover:underline">#{g.fdid}</Link>
                      </td>
                      <td className="px-2 py-1.5 font-mono">{g.fdadmincreator || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{g.fdadminid}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{intTh(g.countF)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{intTh(g.boxes)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{dec2(g.weight)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{dec4(g.volume)}</td>
                      <td className="px-2 py-1.5 max-w-[280px]">{g.address || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{nameShipBy(g.fshipby)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{g.deliveredAt ? formatThaiDateTime(g.deliveredAt) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{g.workMinutes != null ? intTh(g.workMinutes) : "—"}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${
                            DRIVER_STATUS_BADGE[g.fdstatus ?? ""] ?? "bg-surface-alt text-muted border-border"
                          }`}
                        >
                          {DRIVER_STATUS_LABEL[g.fdstatus ?? ""] ?? "ไม่ระบุ"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {groups.length > 1000 && (
            <p className="px-4 py-2 text-[11px] text-muted">แสดง 1,000 รายการแรก — ยอดรวมด้านบนคำนวณจากทุกรายการ</p>
          )}
        </section>

        <p className="text-[11px] text-muted">
          หมายเหตุ: รายงานนี้แสดงปริมาณงานคนขับ (ไม่ใช่ยอดเงิน — legacy report-driver-2023 ไม่มีคอลัมน์เงิน).
          คนขับเปิดงานของตัวเองที่ <Link href="/admin/drivers/work" className="text-primary-600 underline">/admin/drivers/work</Link> ·
          มอบหมายงานใหม่ที่ <Link href="/admin/drivers" className="text-primary-600 underline">/admin/drivers</Link>.
        </p>
      </main>
    </>
  );
}

// ── UI bits ──────────────────────────────────────────────────────────────────
function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold font-mono tabular-nums">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/**
 * Dependency-free inline-SVG grouped bar chart. Vertical bars grouped per label
 * (per driver). One or more series. Value labels on top; truncated driver labels
 * under each group with a <title> for the full text.
 */
function GroupedBarChart({
  labels,
  series,
  decimals = 0,
}: {
  labels: string[];
  series: { name: string; color: string; data: number[] }[];
  decimals?: number;
}) {
  const n = labels.length;
  const s = series.length;
  if (n === 0 || s === 0) return null;

  const max = Math.max(1, ...series.flatMap((ser) => ser.data));
  // Geometry (viewBox units). Width scales with the number of groups.
  const groupW = Math.max(56, Math.min(120, 720 / n));
  const padL = 8;
  const padR = 8;
  const plotH = 220;
  const topPad = 18; // room for value labels
  const bottomPad = 46; // room for x labels
  const chartW = padL + padR + groupW * n;
  const chartH = topPad + plotH + bottomPad;
  const barGap = 4;
  const innerW = groupW - 14;
  const barW = Math.max(4, (innerW - barGap * (s - 1)) / s);

  const fmt = (v: number) =>
    v.toLocaleString("th-TH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        width={chartW}
        height={chartH}
        className="max-w-full"
        role="img"
      >
        {/* baseline */}
        <line x1={padL} y1={topPad + plotH} x2={chartW - padR} y2={topPad + plotH} stroke="currentColor" strokeOpacity={0.2} />
        {labels.map((label, gi) => {
          const gx = padL + groupW * gi + 7;
          const short = label.length > 14 ? label.slice(0, 13) + "…" : label;
          return (
            <g key={gi}>
              {series.map((ser, si) => {
                const v = ser.data[gi] ?? 0;
                const h = max > 0 ? (v / max) * plotH : 0;
                const x = gx + si * (barW + barGap);
                const y = topPad + plotH - h;
                return (
                  <g key={si}>
                    <rect x={x} y={y} width={barW} height={h} fill={ser.color} rx={1.5}>
                      <title>{`${ser.name}: ${fmt(v)}`}</title>
                    </rect>
                    {v > 0 && (
                      <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="currentColor" fillOpacity={0.7}>
                        {fmt(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={gx + innerW / 2}
                y={topPad + plotH + 14}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                fillOpacity={0.75}
              >
                {short}
                <title>{label}</title>
              </text>
            </g>
          );
        })}
      </svg>
      {/* legend (only when >1 series) */}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          {series.map((ser) => (
            <span key={ser.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ser.color }} />
              {ser.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
