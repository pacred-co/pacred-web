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
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { parsePage, pageRange, parsePageSize } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { PageSizeSelect } from "@/components/admin/page-size-select";
import { DriverSelectionProvider, SelectAllBox, RowBox } from "./row-selection";
import { ThaiDateField } from "@/components/admin/thai-date-field";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { Explain } from "@/components/ui/tooltip";
import { BatchDeleteInline } from "./batch-delete-inline";
import { exportDriversAll } from "@/actions/admin/export/drivers";
import { countPendingDispatch } from "@/lib/admin/pending-dispatch";
import { formatThaiDate, formatThaiDateTime, formatThaiTime, anyDateToIso } from "@/lib/utils/thai-datetime";
import { Plus, Truck, AlertCircle, CheckCircle2, XCircle, Clock, Printer, ClipboardList, MonitorSpeaker, Search, Calendar, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

// Next 16 react-hooks/purity rule — raw `Date.now()` in render is rejected.
// Wrap in named module-scope helpers (per `docs/learnings/nextjs-16-quirks.md`).
function nowIso90dAgo(): string {
  return new Date(Date.now() - 90 * 86_400_000).toISOString().substring(0, 10);
}
// (nowIsoToday / isIsoDate ถูกถอดออก 2026-07-23 พร้อมกับตอนเปลี่ยนช่องวันที่จาก
//  <input type="date"> เป็นช่องข้อความ วว/ดด/ปปปป — การตรวจรูปแบบย้ายไปอยู่ที่
//  `anyDateToIso` ใน lib/utils/thai-datetime.ts ซึ่งมี unit test คุมแล้ว.)

type FdStatus = "1" | "2" | "3";

const STATUS_LABEL: Record<FdStatus, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

// Badge สถานะ — พื้นสีสด (ไม่ใช้ gradient · ไม่ตัวหนา) + ตัวอักษรขาว
// (ปอน 2026-07-24: "ขอสี plain ปกติ แค่ทำให้เห็น text ชัดๆ" → "อยากได้สีสว่าง
// สีทึบแล้วไม่สวย") ทั้งจอคอมและมือถือ.
// เฉดคง legacy PCS เดิม (ส้ม/เขียว/แดง = badge-warning/success/danger ของ
// forwarder-driver.php) และยัง "จี๊ดจ๊าดไม่จืด" ตามที่ owner สั่งไว้ — แต่ขยับ
// จาก #ff9149 / #28d094 / #ff4961 มาเป็นระดับ 600 เพราะสีเดิมให้ contrast กับ
// ตัวอักษรขาวแค่ 2.2 / 2.0 / 3.3:1 ซึ่งอ่านยากที่ขนาด 11px (เหตุผลที่ "ต้องเพ่ง").
// ระดับ 600 = 3.6 / 3.8 / 4.7:1 — สว่างสด แต่ยังชัดกว่าเดิมเกือบเท่าตัว.
// ⚠️ อย่าลดกลับไปอ่อนกว่า 600 (500 ลงไปตกใต้ 3:1 = กลับไปเพ่งเหมือนเดิม).
const STATUS_CLS: Record<FdStatus, string> = {
  "1": "bg-orange-600 text-white",   // กำลังดำเนินการ · badge-warning
  "2": "bg-emerald-600 text-white",  // สำเร็จ · badge-success
  "3": "bg-rose-600 text-white",     // ไม่สำเร็จ · badge-danger
};

// ปุ่มทางเข้า 3 ตัวท้ายแถว (ดูรายละเอียด · บิลหาสินค้า · บิลจัดส่ง) — พื้นสีสด
// + ตัวขาว ชุดเดียวกับ badge สถานะ. เฉดคงเดิม (เขียว/เหลือง/ฟ้า) เพื่อไม่ให้ชน
// กับปุ่ม "ลบ" ที่เป็น rose และให้บิลหาสินค้าสีเดียวกับหน้ารายละเอียดรอบ.
// เก็บเป็นค่าคงที่ตัวเดียว = จอคอมกับมือถือ drift กันไม่ได้ (ของเดิมก๊อปคนละชุด).
const ACTION_BTN_BASE =
  "inline-flex items-center justify-center gap-1 rounded-full font-medium " +
  "text-white transition-colors";

const ACTION_BTN_HUE = {
  detail:   "bg-emerald-600 hover:bg-emerald-700",
  picking:  "bg-amber-600 hover:bg-amber-700",
  delivery: "bg-sky-600 hover:bg-sky-700",
} as const;

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
  searchParams: Promise<{
    status?: string; range?: string; page?: string; view?: string;
    from?: string; to?: string; q?: string; size?: string;
  }>;
}) {
  // warehouse included — warehouse staff assemble truck loads + issue the
  // delivery note (ใบส่งสินค้า) on-site (ภูม 2026-06-17 · owner confirmed).
  //
  // 2026-07-23 (owner พี่ป๊อป) — `driver` added: a driver now works OUT OF THIS
  // PAGE too ("ประวัติกับงานที่ต้องส่งใช้หน้านี้เลย"), but sees ONLY the runs
  // assigned to his own id, split into งานที่ต้องส่ง / ประวัติงาน. Planners
  // (ops/super/warehouse) keep the unchanged full view.
  const { user, roles } = await requireAdmin(["ops", "super", "warehouse", "driver"]);
  const isPlanner = isGodRole(roles) || roles.includes("ops") || roles.includes("warehouse");

  const sp     = await searchParams;
  const status = (sp.status === "1" || sp.status === "2" || sp.status === "3") ? sp.status : null;
  // view = the driver-facing split. todo → open runs · history → closed runs.
  // Planners may use it too (it just pre-filters their list).
  const view   = (sp.view === "todo" || sp.view === "history") ? sp.view : null;
  const range  = sp.range ?? "90d";   // "90d" default · "all" override
  const admin  = createAdminClient();

  // ── ตัวกรองวันที่ (owner 2026-07-23 · legacy "วันที่บันทึกรายการ") ─────────────
  // Precedence: an explicit from/to wins → else range=all means no bound → else
  // the legacy default of the last 90 days. Both the LIST and the chip TALLY use
  // the very same window, so a count can never disagree with the rows below it.
  // Accepts วว/ดด/ปปปป (what the field submits) OR a bare ISO date (old
  // bookmarks/links from before the format switch) — both normalise to ISO.
  const fromParam = anyDateToIso(sp.from);
  const toParam   = anyDateToIso(sp.to);
  const hasCustomRange = Boolean(fromParam || toParam);
  const unbounded = !hasCustomRange && range === "all";
  const fromIso = fromParam ?? (unbounded ? null : nowIso90dAgo());
  const toIso   = toParam;

  // ── Self-scope for a pure driver ────────────────────────────────────────────
  // `tb_forwarder_driver.fdadminid` holds the legacy userid == profiles.member_code
  // (same join the mobile work-list uses). FAIL-CLOSED: a driver whose profile has
  // no member_code sees NOTHING rather than falling through to every driver's runs.
  let myUserid: string | null = null;
  if (!isPlanner) {
    const supabase = await createClient();
    const { data: myProfile, error: myProfileErr } = await supabase
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (myProfileErr) {
      console.error("/admin/drivers: own-profile lookup failed", myProfileErr, { userId: user.id });
      throw new Error(`ไม่สามารถอ่านข้อมูลพนักงาน: ${myProfileErr.message}`);
    }
    myUserid = myProfile?.member_code ?? null;
  }
  const selfOnly = !isPlanner;
  const selfBlocked = selfOnly && !myUserid;

  // Pagination — server-side window via ?page=N (PERF 2026-06-03).
  // 2026-07-23 (owner "จำกัดการแสดงผล … query ไม่หนัก"): the row window is now
  // user-picked via ?size= (แสดง N รายการ) instead of a fixed 50. Every size is
  // still a SERVER-side `.range()`, so a bigger list never means a bigger scan
  // than the user asked for.
  const PAGE_SIZES = [10, 25, 50, 100, 250] as const;
  const pageSize = parsePageSize(sp.size, PAGE_SIZES);
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page, pageSize);

  // ── ช่องค้นหา (legacy "ค้นหา:") ────────────────────────────────────────────
  // Searches the run NAME (ชื่อรายการ = fdname, e.g. "2026-07-20-05-AD020") and,
  // when the term is all digits, the run id. Escaped for PostgREST `ilike` so a
  // `%`/`_` typed by the user is matched literally instead of acting as a wildcard.
  const searchTerm = (sp.q ?? "").trim().slice(0, 80);
  const searchEscaped = searchTerm.replace(/[\\%_]/g, (m) => `\\${m}`);
  const searchAsId = /^\d+$/.test(searchTerm) ? Number(searchTerm) : null;

  // Build the WHERE clause. Default is "last 90 days" (legacy behaviour).
  let q = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdadminid, fdadmincreator, fdstatus, fdamount, endtime", { count: "exact" })
    .order("id", { ascending: false })
    .range(rowFrom, rowTo);

  // A driver only ever sees runs assigned to him.
  if (selfOnly && myUserid) q = q.eq("fdadminid", myUserid);

  // The view split wins over the raw status chip when present.
  if (view === "todo")         q = q.eq("fdstatus", "1");
  else if (view === "history") q = q.in("fdstatus", ["2", "3"]);
  else if (status)             q = q.eq("fdstatus", status);

  if (searchTerm) {
    q = searchAsId !== null
      ? q.or(`id.eq.${searchAsId},fdname.ilike.%${searchEscaped}%`)
      : q.ilike("fdname", `%${searchEscaped}%`);
  }

  if (fromIso) q = q.gte("fddate", fromIso);
  // `fddate` carries a time component — bound the END of the chosen day so a
  // to=2026-07-23 still includes rows stamped 2026-07-23 05:43.
  if (toIso)   q = q.lt("fddate", `${toIso}T23:59:59.999`);

  // selfBlocked = a driver with no member_code → never run the query (would
  // otherwise return EVERY driver's runs).
  const { data: rowsData, error: rowsErr, count: totalBatches } = selfBlocked
    ? { data: [] as unknown[], error: null, count: 0 }
    : await q;
  if (rowsErr) {
    console.error("/admin/drivers: list query failed", rowsErr, { status, view, range });
    throw new Error(`ไม่สามารถอ่านรายการรอบจัดส่ง: ${rowsErr.message}`);
  }
  const rows = (rowsData ?? []) as unknown as BatchRow[];

  // Status tally (filter chips show counts of the active range).
  // Next 16 react-hooks/purity rule rejects raw `Date.now()` inline in render
  // — must be wrapped in a module-scope helper (see drivers/page.tsx top: `nowIso90dAgo`).
  let tallyQ = admin
    .from("tb_forwarder_driver")
    .select("fdstatus")
    .gte("fddate", fromIso ?? "1970-01-01");
  if (toIso) tallyQ = tallyQ.lt("fddate", `${toIso}T23:59:59.999`);
  // Same self-scope as the list — otherwise a driver's chip counts would show
  // the whole company's runs next to his own (much shorter) list.
  if (selfOnly && myUserid) tallyQ = tallyQ.eq("fdadminid", myUserid);
  const { data: tallyData, error: tallyErr } = selfBlocked
    ? { data: [] as { fdstatus: string }[], error: null }
    : await tallyQ;
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

  // อวาตาร์ ผู้รับผิดชอบ (fdadminid) + ผู้สร้าง (fdadmincreator) — profiles.avatar_url
  // by member_code · resolve ผ่าน resolveLegacyUrl (ปอน 2026-07-24 · มือถือ+เดสก์ท็อป).
  const adminCodes = Array.from(
    new Set(rows.flatMap((r) => [r.fdadminid, r.fdadmincreator]).filter(Boolean) as string[]),
  );
  const avatarByCode = new Map<string, string | null>();
  if (adminCodes.length > 0) {
    const { data: profRows, error: profErr } = await admin
      .from("profiles")
      .select("member_code, avatar_url")
      .in("member_code", adminCodes);
    if (profErr) {
      console.error("/admin/drivers: admin avatar lookup failed", profErr);
    }
    const rawByCode = new Map(
      ((profRows ?? []) as { member_code: string; avatar_url: string | null }[]).map((p) => [p.member_code, p.avatar_url]),
    );
    await Promise.all(
      adminCodes.map(async (code) => {
        const raw = rawByCode.get(code);
        avatarByCode.set(code, raw ? await resolveLegacyUrl(raw, "admin-avatar") : null);
      }),
    );
  }

  // Pending forwarders ready for assignment for the CTA badge + the alert banner.
  // 2026-06-19 (owner): the accurate "รอจัดรถ" = fstatus=6 (เตรียมส่ง · ชำระแล้ว) NOT
  // already in an open driver batch (the plain fstatus=6 count over-counted by
  // including rows already on a run). Warehouse/planning sees this → confirm-saves.
  // Planner-only number ("งานรอจัดรถ" across the whole company). Skipped for a
  // driver — it is not his workload, and showing it would read as "you have N
  // jobs waiting" when those jobs belong to nobody yet.
  const readyCount = isPlanner ? await countPendingDispatch(admin) : 0;

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
    // พื้นหลังเทา #f4f5fa (owner 2026-07-23) = สีพื้น body ของ PCS admin เดิม
    // (legacy `assets/css/bootstrap.min.css` → `body{background-color:#f4f5fa}`),
    // ทำให้การ์ด/ตารางสีขาวลอยขึ้นมาแทนที่จะจมไปกับพื้นขาว. min-h กันพื้นขาวโผล่
    // ท้ายหน้าเวลารายการสั้น (3.5rem = ความสูงแถบหัวของ .admin-content pt-14).
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 bg-[#f4f5fa] min-h-[calc(100vh-3.5rem)]">

      {/* ── กรอบขาวใบเดียวคลุมทั้งแผง: หัวข้อ → ตัวกรองวันที่ → แถบกรอง → ตาราง → หน้า
          (owner 2026-07-23) เหมือน legacy PCS ที่ทุกอย่างอยู่ในแผงขาวบนพื้น #f4f5fa
          `overflow-hidden` กันมุมตารางทะลุขอบโค้งของการ์ด. */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 px-4 py-4 border-b border-border">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            {selfOnly ? "DRIVER · งานของฉัน" : "CARGO · มอบงานคนขับ"}
          </p>
          <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" />
            {selfOnly
              ? (view === "history" ? "ประวัติงาน" : "งานที่ต้องส่ง")
              : "รายการขนส่งสินค้า"}
          </h1>
          {/* คำอธิบายใต้หัวข้อ ถูกเอาออก 2026-07-23 (owner) — หัวข้อ + ชิปมุมมอง
              บอกอยู่แล้วว่ากำลังดูอะไร ไม่ต้องมีบรรทัดอธิบายซ้ำ. */}
        </div>

        {/* Planner-only toolbar. A driver neither creates runs, exports the
            company CSV, nor watches the dispatch monitor. */}
        {isPlanner && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* พี่ป๊อป spec 2026-07-06 §3 — จอมอนิเตอร์ "กำลังจัดส่ง" (real-time
                driver board · รูป/เบอร์/ชื่อเล่น + ความคืบหน้า). §0d reach. */}
            <Link
              href="/admin/drivers/monitor"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 min-h-[44px]"
            >
              <MonitorSpeaker className="h-4 w-4" />
              จอมอนิเตอร์ (กำลังจัดส่ง)
            </Link>
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
        )}
      </div>

      {/* A driver whose profile carries no member_code can't be matched to any
          run — say so instead of rendering a silently-empty table. */}
      {selfBlocked && (
        <div className="mx-4 mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ บัญชีของคุณยังไม่มีรหัสพนักงาน (member code) — ระบบจึงจับคู่งานที่มอบหมายให้ไม่ได้ กรุณาแจ้งแอดมิน
        </div>
      )}

      {/* 🚐 Pending-dispatch alert — paid/ready forwarders with no driver yet. */}
      {readyCount > 0 && (
        <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            <Truck className="inline h-4 w-4 mr-1" />
            <strong>{readyCount}</strong> รายการชำระแล้ว/เตรียมส่ง{" "}
            <Explain
              label={<strong>รอจัดรถ</strong>}
              def="รอจัดรถ = ออเดอร์ที่ชำระเงินแล้ว (สถานะเตรียมส่ง) แต่ยังไม่ถูกมอบให้คนขับคนไหน — ต้องกดจัดรถ + เฟิมบันทึก เพื่อให้คนขับไปส่ง"
            />{" "}
            (ยังไม่มอบงานคนขับ) — กดจัดรถแล้ว <strong>เฟิมบันทึก</strong> เพื่อมอบงาน
          </p>
          <Link
            href="/admin/drivers/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> จัดรถ (เฟิมบันทึก)
          </Link>
        </div>
      )}

      {/* ── ตัวกรองวันที่ (legacy "วันที่บันทึกรายการ" + ค้นหาข้อมูล / ทั้งหมด) ──────
          A plain GET form (no `action` → submits to the current path, keeping the
          locale prefix) — same pattern as /admin/drivers/work. The form REPLACES
          the query string, so `view`/`status` ride along as hidden inputs. */}
      <form method="GET" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-border">
        {view && <input type="hidden" name="view" value={view} />}
        {status && <input type="hidden" name="status" value={status} />}
        {/* ป้าย "วันที่บันทึกรายการ (วว/ดด/ปปปป …)" ถูกเอาออก 2026-07-23 (owner) —
            ตัวช่องมี placeholder "วว/ดด/ปปปป" + ปฏิทินให้กดอยู่แล้ว. การอ่านออกเสียง
            สำหรับ screen-reader ยังครบผ่าน aria-label ของ <ThaiDateField>. */}
        <div>
          {/* ⚠️ ห้ามเปลี่ยนกลับเป็น <input type="date"> ตรงๆ — รูปแบบที่ "แสดง" ของมัน
              ยึดภาษาของ browser/OS ไม่ใช่ของหน้าเว็บ บนเครื่องภาษาอังกฤษจะขึ้นเป็น
              04/24/2026 (ดด/วว) ซึ่งคนไทยอ่านเป็น 4 เม.ย. — บังคับด้วย HTML/CSS
              ไม่ได้. <ThaiDateField> แสดง วว/ดด/ปปปป แต่กดแล้วเปิดปฏิทินของ browser
              ให้ (owner 2026-07-23) — ได้ทั้งสองอย่าง. */}
          <div className="flex items-center gap-1.5">
            <ThaiDateField id="fd-from" name="from" defaultValueIso={fromIso} ariaLabel="วันที่เริ่มต้น" />
            <span className="text-muted text-xs">–</span>
            <ThaiDateField id="fd-to" name="to" defaultValueIso={toIso} ariaLabel="วันที่สิ้นสุด" />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 min-h-[38px]"
        >
          <Search className="h-4 w-4" /> ค้นหาข้อมูล
        </button>
        <Link
          href={buildHref({ status, view, range: "all", from: null, to: null })}
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-400 bg-sky-50 px-3.5 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 min-h-[38px]"
        >
          <Search className="h-4 w-4" /> ค้นหาข้อมูลทั้งหมด
        </Link>
      </form>

      {/* ผลลัพธ์การค้นหา … (legacy red result line) */}
      <p className="px-4 pt-2.5 text-[13px] font-medium text-primary-600">
        ผลลัพธ์การค้นหา{" "}
        {hasCustomRange
          ? `${fromIso ? formatThaiDate(fromIso) : "เริ่มแรก"} – ${toIso ? formatThaiDate(toIso) : "ปัจจุบัน"}`
          : unbounded
            ? "ทั้งหมด"
            : "90 วันที่ผ่านมา"}
        {" · "}พบ {totalBatches ?? 0} รอบ
      </p>

      {/* ── แถวควบคุมเดียว (owner 2026-07-23 "ยก แสดง กับ ค้นหา ขึ้นไปแถวเดียวกัน"):
             ซ้าย = ชิปมุมมอง · ขวา = แสดง N แถว/หน้า + ช่องค้นหา ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-2.5 pb-3 border-b border-border">

      {/* Filter chips. A driver gets the two-way งานที่ต้องส่ง / ประวัติงาน split
          (same as his sidebar) instead of the planner's raw fdstatus chips. */}
      <div className="flex flex-wrap gap-2">
        {selfOnly ? (
          <>
            <Chip href={buildHref({ status: null, view: "todo", range, from: fromParam, to: toParam })} active={view !== "history"}>
              <span className="inline-flex items-center gap-1">
                {STATUS_ICON["1"]} งานที่ต้องส่ง ({tally["1"] ?? 0})
              </span>
            </Chip>
            <Chip href={buildHref({ status: null, view: "history", range, from: fromParam, to: toParam })} active={view === "history"}>
              <span className="inline-flex items-center gap-1">
                {STATUS_ICON["2"]} ประวัติงาน ({(tally["2"] ?? 0) + (tally["3"] ?? 0)})
              </span>
            </Chip>
          </>
        ) : (
          <>
            <Chip href={buildHref({ status: null, view, range, from: fromParam, to: toParam })} active={!status && !view}>
              ทั้งหมด ({(tallyData ?? []).length})
            </Chip>
            {(["1", "2", "3"] as FdStatus[]).map((s) => (
              <Chip key={s} href={buildHref({ status: s, view: null, range, from: fromParam, to: toParam })} active={status === s}>
                <span className="inline-flex items-center gap-1">
                  {STATUS_ICON[s]}
                  {STATUS_LABEL[s]} ({tally[s] ?? 0})
                </span>
              </Chip>
            ))}
          </>
        )}
        {/* 2026-07-23 — the old "90 วันล่าสุด / ทั้งหมด" chips are gone: the date
            toolbar above now owns the date window (its inputs are pre-filled with
            the active one, and "ค้นหาข้อมูลทั้งหมด" is the unbounded reset). Two
            competing date controls on one panel is how a filter starts lying. */}
      </div>

      {/* ขวาของแถวเดียวกัน: แสดง N แถว/หน้า + ค้นหา */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* PageSizeSelect เขียนคำว่า "แสดง … แถว/หน้า" มาในตัวแล้ว — ห้ามใส่ซ้ำ.
            allowAll=false: หน้านี้ owner สั่งให้ "จำกัดการแสดงผล" → ไม่ควรมีปุ่ม
            ดึง 5,000 แถวรวดเดียวให้กดตั้งแต่แรก. */}
        <PageSizeSelect
          basePath="/admin/drivers"
          current={pageSize}
          sizes={PAGE_SIZES}
          allowAll={false}
          params={{ status: sp.status, view: sp.view, range: sp.range, from: sp.from, to: sp.to, q: sp.q }}
        />

        {/* GET form — Enter ค้นหาได้เลย. hidden inputs พาตัวกรองอื่นไปด้วย ไม่งั้น
            การกดค้นหาจะล้างช่วงวันที่/มุมมองที่เลือกไว้ทิ้ง. */}
        <form method="GET" className="flex items-center gap-2">
          {view && <input type="hidden" name="view" value={view} />}
          {status && <input type="hidden" name="status" value={status} />}
          {fromParam && <input type="hidden" name="from" value={fromParam} />}
          {toParam && <input type="hidden" name="to" value={toParam} />}
          {!hasCustomRange && range === "all" && <input type="hidden" name="range" value="all" />}
          {sp.size && <input type="hidden" name="size" value={sp.size} />}
          <label htmlFor="fd-q" className="text-sm text-muted whitespace-nowrap">ค้นหา:</label>
          <input
            id="fd-q" type="search" name="q" defaultValue={searchTerm} maxLength={80}
            placeholder="ชื่อรายการ / เลขที่รอบ"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm min-h-[38px] w-52 max-w-full"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium hover:bg-border/40 min-h-[38px]"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>
      </div>

      </div>{/* ── ปิดแถวควบคุม (ชิป | แสดง+ค้นหา) ── */}

      {searchTerm && (
        <p className="px-4 pt-2.5 text-[13px] text-muted">
          กรองด้วยคำว่า <strong className="text-foreground">“{searchTerm}”</strong>
          {" · "}
          <Link
            href={buildHref({ status, view, range, from: fromParam, to: toParam })}
            className="text-primary-600 hover:underline"
          >
            ล้างการค้นหา
          </Link>
        </p>
      )}

      {/* Flat dense table — one row per batch (legacy forwarder-driver.php default
          list mode L269-348: ☑ · วันที่สร้าง · ชื่อรายการ (+meta) · ผู้รับผิดชอบ ·
          ผู้สร้างรายการ · สถานะ · ตัวเลือก). No driver grouping — 1 row = 1 รอบ. */}
      <DriverSelectionProvider>
      {/* ตารางแบบเต็ม — เดสก์ท็อป (≥lg) เท่านั้น · มือถือใช้การ์ดด้านล่าง (ปอน 2026-07-24) */}
      <div className="hidden lg:block overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm border-collapse min-w-[1000px] [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/60 text-center text-[13px] font-bold tracking-wide text-[#6b6f82]">
            <tr>
              {/* legacy forwarder-driver.php list mode L157-166: ID / วันที่สร้าง / ชื่อรายการ /
                  ผู้รับผิดชอบ / ผู้สร้างรายการ / สถานะ / ตัวเลือก (ส่งแล้ว = Pacred progress add). */}
              {/* ช่องติ๊ก แทนคอลัมน์ ID (owner 2026-07-23 · ตรงกับ legacy).
                  เลขที่รอบยังเข้าถึงได้จาก "ชื่อรายการ" และปุ่ม "ดูรายละเอียด". */}
              <th className="border-b border-border px-3 py-2.5 whitespace-nowrap w-10 text-center">
                <SelectAllBox ids={batchIds} />
              </th>
              <th className="border-b border-border px-3 py-2.5 whitespace-nowrap">วันที่สร้าง</th>
              <th className="border-b border-border px-3 py-2.5">ชื่อรายการ</th>
              <th className="border-b border-border px-3 py-2.5">ผู้รับผิดชอบ</th>
              <th className="border-b border-border px-3 py-2.5 whitespace-nowrap">ผู้สร้างรายการ</th>
              <th className="border-b border-border px-3 py-2.5 text-right whitespace-nowrap">
                <Explain
                  align="right"
                  label="ส่งแล้ว"
                  def="ส่งแล้ว / ทั้งหมด — จำนวนจุดที่คนขับส่งสำเร็จ เทียบกับจุดทั้งหมดในรอบนี้ (เช่น 3/5 = ส่งแล้ว 3 จาก 5 จุด)"
                />
              </th>
              <th className="border-b border-border px-3 py-2.5 whitespace-nowrap">
                <Explain
                  label="สถานะ"
                  def="สถานะรอบจัดส่ง — กำลังดำเนินการ (คนขับกำลังวิ่งงาน) · สำเร็จ (ส่งครบทุกจุด) · ไม่สำเร็จ (เลยเวลาหรือส่งไม่ครบ)"
                />
              </th>
              <th className="border-b border-border px-3 py-2.5 text-center whitespace-nowrap">ตัวเลือก</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center">
                  <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
                  <p className="text-sm text-muted">
                    {selfOnly
                      ? (view === "history"
                          ? "ยังไม่มีงานที่ปิดแล้วในช่วงนี้"
                          : "ตอนนี้ไม่มีงานที่ต้องส่ง — รอแอดมินมอบงานให้")
                      : "ยังไม่มีรอบจัดส่งในช่วงนี้"}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((r, ri) => {
                const fdstatus = (r.fdstatus ?? "1") as FdStatus;
                const agg      = itemAgg.get(r.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
                const expired  = r.endtime && new Date(r.endtime) < new Date() && fdstatus === "1";
                const driver   = r.fdadminid ? driverDirectory.get(r.fdadminid) : null;
                const zebra    = ri % 2 === 0 ? "bg-white" : "bg-[#cabcbf]/30"; // legacy pink stripe (rgba(202,188,191,.28))
                return (
                  <tr key={r.id} className={`border-b border-border align-top hover:bg-primary-50/30 ${zebra}`}>
                    {/* ช่องติ๊ก (แทนคอลัมน์ ID เดิม) */}
                    <td className="px-3 py-3 whitespace-nowrap text-center">
                      <RowBox id={r.id} />
                    </td>
                    {/* วันที่สร้าง — legacy forwarder-driver.php L304-309: DATE line + TIME line */}
                    <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                      {r.fddate && <div className="text-foreground/80">{formatThaiDate(r.fddate)}</div>}
                      {r.fddate && <div>{formatThaiTime(r.fddate)}</div>}
                    </td>
                    {/* ชื่อรายการ (+ inline meta: แทรคกิ้ง / กล่อง / จุดส่ง) */}
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/drivers/${r.id}`}
                        className="font-medium text-primary-600 hover:underline"
                      >
                        {r.fdname ?? `รอบ #${r.id}`}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-muted">
                        จำนวนแทรคกิ้ง : {agg.itemCount}, จำนวนกล่อง : {agg.boxSum}, จำนวนจุดที่ส่ง : {r.fdamount ?? 0}
                      </div>
                      {r.endtime && (
                        <div className={`text-[11px] ${expired ? "text-rose-600 font-medium" : "text-muted"}`}>
                          ส่งก่อนเวลา : {formatThaiDateTime(r.endtime)}{expired ? " (เลย)" : ""}
                        </div>
                      )}
                    </td>
                    {/* ผู้รับผิดชอบ (คนขับ = fdadminid) */}
                    <td className="px-3 py-3 text-xs">
                      {r.fdadminid ? (
                        <div className="flex items-center gap-2">
                          <AdminAvatar url={avatarByCode.get(r.fdadminid) ?? null} code={r.fdadminid} />
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{driver?.name ?? r.fdadminid}</div>
                            <div className="font-mono text-[11px] text-muted">{r.fdadminid}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">— ยังไม่ระบุคนขับ —</span>
                      )}
                    </td>
                    {/* ผู้สร้างรายการ */}
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {r.fdadmincreator ? (
                        <div className="flex items-center gap-2">
                          <AdminAvatar url={avatarByCode.get(r.fdadmincreator) ?? null} code={r.fdadmincreator} />
                          <span className="text-foreground">{r.fdadmincreator}</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* ส่งแล้ว / ทั้งหมด */}
                    <td className="px-3 py-3 text-xs text-right whitespace-nowrap">
                      <div className="font-semibold text-foreground tabular-nums">{agg.doneCount} / {agg.itemCount}</div>
                    </td>
                    {/* สถานะ */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[fdstatus]}`}>
                        {STATUS_ICON[fdstatus]}
                        {STATUS_LABEL[fdstatus]}
                      </span>
                    </td>
                    {/* ตัวเลือก — ดูรายละเอียด / บิลหาสินค้า (คลัง) / บิลจัดส่ง (คนขับ) / ลบรายการ.
                        พี่ป๊อป spec 2026-07-06 #7 — the 2 split logistics documents. */}
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                        <Link
                          href={`/admin/drivers/${r.id}`}
                          className={`${ACTION_BTN_BASE} ${ACTION_BTN_HUE.detail} px-2.5 py-1 text-[11px]`}
                        >
                          ดูรายละเอียด
                        </Link>
                        <Link
                          href={`/admin/drivers/${r.id}/picking-list`}
                          target="_blank"
                          className={`${ACTION_BTN_BASE} ${ACTION_BTN_HUE.picking} px-2.5 py-1 text-[11px]`}
                        >
                          <ClipboardList className="h-3 w-3" /> บิลหาสินค้า
                        </Link>
                        <Link
                          href={`/admin/drivers/${r.id}/print`}
                          target="_blank"
                          className={`${ACTION_BTN_BASE} ${ACTION_BTN_HUE.delivery} px-2.5 py-1 text-[11px]`}
                        >
                          <Printer className="h-3 w-3" /> บิลจัดส่ง
                        </Link>
                        {/* ลบรายการ (legacy parity) — เฉพาะรอบ OPEN ที่ยังไม่มีของส่งสำเร็จ.
                            PLANNER ONLY: a driver must never be able to delete the run
                            he was assigned (2026-07-23). */}
                        {isPlanner && fdstatus === "1" && agg.doneCount === 0 && (
                          <BatchDeleteInline batchId={r.id} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </DriverSelectionProvider>

      {/* ── การ์ดมือถือ (ปอน 2026-07-24 · ตามภาพ) — จอ <lg: การ์ดต่อรอบแทนตารางแคบ.
          ข้อมูลชุดเดียวกับตาราง · พื้นเทา #f4f5fa ให้การ์ดขาวลอยเด่น. */}
      <div className="lg:hidden space-y-3 bg-[#f4f5fa] px-4 py-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted/50" />
            <p className="text-sm text-muted">
              {selfOnly
                ? (view === "history"
                    ? "ยังไม่มีงานที่ปิดแล้วในช่วงนี้"
                    : "ตอนนี้ไม่มีงานที่ต้องส่ง — รอแอดมินมอบงานให้")
                : "ยังไม่มีรอบจัดส่งในช่วงนี้"}
            </p>
          </div>
        ) : (
          rows.map((r) => {
            const fdstatus = (r.fdstatus ?? "1") as FdStatus;
            const agg      = itemAgg.get(r.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
            const expired  = r.endtime && new Date(r.endtime) < new Date() && fdstatus === "1";
            const driver   = r.fdadminid ? driverDirectory.get(r.fdadminid) : null;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
                {/* วันที่สร้าง + ชื่อรอบ + สรุป */}
                <div className="flex items-start gap-3">
                  <div className="shrink-0 rounded-xl border border-border bg-surface-alt/40 px-3 py-2 text-center leading-tight">
                    <div className="flex items-center justify-center gap-1 text-[11px] text-muted">
                      <Calendar className="h-3.5 w-3.5" /> วันที่สร้าง
                    </div>
                    <div className="mt-1 text-sm font-bold text-foreground">{r.fddate ? formatThaiDate(r.fddate) : "—"}</div>
                    <div className="text-[11px] text-muted">{r.fddate ? formatThaiTime(r.fddate) : ""}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/drivers/${r.id}`} className="block break-words font-bold text-primary-600 hover:underline">
                      {r.fdname ?? `รอบ #${r.id}`}
                    </Link>
                    <p className="mt-1 text-[11px] text-muted">
                      จำนวนแทรคกิ้ง : {agg.itemCount}, จำนวนกล่อง : {agg.boxSum}, จำนวนจุดที่ส่ง : {r.fdamount ?? 0}
                    </p>
                    {r.endtime && (
                      <p className={`text-[11px] ${expired ? "font-medium text-rose-600" : "text-muted"}`}>
                        ส่งก่อนเวลา : {formatThaiDateTime(r.endtime)}{expired ? " (เลย)" : ""}
                      </p>
                    )}
                  </div>
                </div>

                {/* ผู้รับผิดชอบ / ผู้สร้าง / ส่งแล้ว / สถานะ (2×2) */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-border bg-surface-alt/30 p-3">
                  <div>
                    <p className="text-[11px] text-muted">ผู้รับผิดชอบ</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <AdminAvatar url={r.fdadminid ? avatarByCode.get(r.fdadminid) ?? null : null} code={r.fdadminid} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">{driver?.name ?? r.fdadminid ?? "—"}</p>
                        {r.fdadminid && <p className="font-mono text-[11px] text-muted">{r.fdadminid}</p>}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">ผู้สร้างรายการ</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <AdminAvatar url={r.fdadmincreator ? avatarByCode.get(r.fdadmincreator) ?? null : null} code={r.fdadmincreator} />
                      <p className="truncate text-xs font-semibold text-foreground">{r.fdadmincreator ?? "—"}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">ส่งแล้ว</p>
                    <p className="text-sm font-bold tabular-nums text-foreground">{agg.doneCount} / {agg.itemCount}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">สถานะ</p>
                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[fdstatus]}`}>
                      {STATUS_ICON[fdstatus]} {STATUS_LABEL[fdstatus]}
                    </span>
                  </div>
                </div>

                {/* 3 ปุ่ม: รายละเอียด / บิลหาสินค้า / บิลจัดส่ง */}
                <div className="grid grid-cols-3 gap-2">
                  <Link href={`/admin/drivers/${r.id}`} className={`${ACTION_BTN_BASE} ${ACTION_BTN_HUE.detail} px-1.5 py-2 text-[11px]`}>
                    <FileText className="h-3.5 w-3.5 shrink-0" /> รายละเอียด
                  </Link>
                  <Link href={`/admin/drivers/${r.id}/picking-list`} target="_blank" className={`${ACTION_BTN_BASE} ${ACTION_BTN_HUE.picking} px-1.5 py-2 text-[11px]`}>
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" /> บิลหาสินค้า
                  </Link>
                  <Link href={`/admin/drivers/${r.id}/print`} target="_blank" className={`${ACTION_BTN_BASE} ${ACTION_BTN_HUE.delivery} px-1.5 py-2 text-[11px]`}>
                    <Printer className="h-3.5 w-3.5 shrink-0" /> บิลจัดส่ง
                  </Link>
                </div>

                {/* ลบรายการ (planner · รอบเปิดที่ยังไม่มีของส่งสำเร็จ) — คนขับลบไม่ได้ */}
                {isPlanner && fdstatus === "1" && agg.doneCount === 0 && (
                  <div className="flex justify-end">
                    <BatchDeleteInline batchId={r.id} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* หน้า (pagination) อยู่ในกรอบขาวใบเดียวกับตาราง — ปิดท้ายการ์ด */}
      <div className="border-t border-border px-4 py-3">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={totalBatches ?? 0}
          basePath="/admin/drivers"
          params={{ status: sp.status, view: sp.view, range: sp.range, from: sp.from, to: sp.to, q: sp.q, size: sp.size }}
        />
      </div>

      </div>{/* ── ปิดกรอบขาว ── */}
    </main>
  );
}

// รูปโปรไฟล์แอดมิน (ผู้รับผิดชอบ/ผู้สร้าง) — มีรูป = <img> · ไม่มี = ตัวย่อวงกลม (ปอน 2026-07-24).
function AdminAvatar({ url, code }: { url: string | null; code: string | null | undefined }) {
  const initial = (code ?? "?").trim().charAt(0).toUpperCase() || "?";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-[11px] font-bold text-white">
      {initial}
    </span>
  );
}

function buildHref({ status, view, range, from, to }: {
  status: string | null; view?: string | null; range: string;
  from?: string | null; to?: string | null;
}) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (view) p.set("view", view);
  if (range && range !== "90d") p.set("range", range);
  // Carry the chosen date window across chip clicks — switching งานที่ต้องส่ง ⇄
  // ประวัติงาน must not silently reset the dates the user just searched.
  if (from) p.set("from", from);
  if (to) p.set("to", to);
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
