import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { isGeneralCoid } from "@/lib/forwarder/coid";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportWarehouseHistoryAll } from "@/actions/admin/export/warehouse-history";
import {
  WarehouseHistoryRelinkButton,
  WarehouseHistoryDeleteButton,
  WarehouseHistoryMatchedActions,
  WarehouseHistoryModalHost,
} from "./warehouse-history-row-actions";

/**
 * Admin > "ประวัติเข้าโกดังไทย" — Wave 20 P1 Tailwind v4 rewrite of the
 * Wave 13 faithful-port (was 1141 LOC Bootstrap-4 + DataTables verbatim).
 *
 * AGENTS §0a — workflow vs UI:
 *   We KEEP all legacy logic (schema reads · 3-mode date filter ·
 *   keysearch dedup · cover thumbnails · scan-event grouping) and
 *   REPLACE the Bootstrap-4/jQuery/DataTables chrome with Pacred
 *   Tailwind tokens, mirroring sister pages /admin/forwarders +
 *   /admin/report-cnt.
 *
 * Data — every `forwarder-import-warehouse.php` mysqli query
 * transcribed 1:1 to the ported legacy `tb_*` schema (Supabase,
 * migration 0081). `tb_*` is RLS-locked to service_role, so reads go
 * through the admin client.
 *   - $sql_Table2 → tb_forwarder_import2 LEFT JOIN tb_forwarder
 *                   WHERE fi.fID IS NULL AND DATE(fi2Date) ⋯
 *                   (L183-184 — the ORPHAN section)
 *   - $sql_Table  → tb_forwarder_import2 LEFT JOIN tb_forwarder
 *                   WHERE f.ID=fi.fID AND DATE(fi2Date) ⋯
 *                   (L234-235 — the MATCHED section)
 *   - $sql dupes  → tb_forwarder WHERE fTrackingCHN=? (per row)
 *                   (L248-258 — the "มีรายการซ้ำ" badge query)
 *   - tb_users LEFT JOIN — coid for the badgeVIP2 rendering
 *
 * URL filters (transcribed from L111-121, L147-161) — exposed as
 * search params on this Next.js route, same query-string shape as
 * the legacy URL:
 *   ?historyTable=true&date=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                          → date-range filter
 *   ?historyTableAll=true  → no date filter (all data)
 *   (none)                 → default = last 7 days (Wave 20 qw2 ·
 *                            commit 9cf775d)
 *
 * Wave 21 deferred (with clear UI banner, not silently stubbed):
 *   - Bulk-print "พิมพ์จากหน้ากล่อง" PDF generation — backend not yet built;
 *     button rendered but disabled with banner.
 *   - "Mark as no-match" sentinel write (tb_forwarder_import2.fid='0') —
 *     not in Wave 13 server action surface; deferred.
 *   - คำแนะนำการใช้งาน modal — empty in legacy too (L371-383); dropped
 *     from this rewrite (zero content to preserve).
 *
 * Already wired (Wave 13 server actions in
 * actions/admin/warehouse-history.ts):
 *   - "ค้นหาและเชื่อมรายการ" relink modal (orphan rows)
 *   - "ลบยิงเข้า" delete (both sections)
 *   - "ดูข้อมูล / อัปเดต" detail links (matched rows)
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure functions ported from the legacy admin
// includes (`pcs-admin/include/function.php`). Kept inline (not extracted
// to lib/) because they're page-local and the rewrite scope is single-file.
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Legacy `priceWaiting($price)` — function.php L871-878.
 *  0 → "รอคำนวณ" · otherwise → "฿" + thousands-formatted. */
function priceWaiting(price: number | string | null | undefined): string {
  const v = typeof price === "string" ? Number(price) : (price ?? 0);
  if (!v || v === 0) return "รอคำนวณ";
  return `฿${numberFormat2(v)}`;
}

/** Legacy `nameProductsType($int)` — function.php L640-650 */
function nameProductsType(t: string | null): string {
  switch (t) {
    case "1": return "ทั่วไป";
    case "2": return "มอก.";
    case "3": return "อย.";
    case "4": return "พิเศษ";
    default:  return "ไม่พบข้อมูล";
  }
}

/** Legacy `nameTransportType2($int)` — function.php L660-668.
 *  Returns a Tailwind <span> pill. */
function NameTransportType2({ t }: { t: string | null }) {
  if (t === "1") return <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-[11px] font-medium">🚛 ทางรถ</span>;
  if (t === "2") return <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-medium">🚢 ทางเรือ</span>;
  return <span className="text-muted text-xs">—</span>;
}

/** Legacy `statusForwarderAll($fStatus)` — function.php L893-904.
 *  Wave 20 rewrite: drops the legacy CDN icon image (was a 40px
 *  pcscargo.co.th asset · unbranded for Pacred); a Tailwind pill alone
 *  is enough information density and matches the sister page
 *  `/admin/forwarders` status chips. */
function StatusForwarderAll({ s }: { s: string | null }) {
  const map: Record<string, { cls: string; text: string }> = {
    "1": { cls: "bg-amber-100 text-amber-800",   text: "รอสินค้าเข้าโกดังจีน" },
    "2": { cls: "bg-sky-100 text-sky-800",       text: "ถึงโกดังจีนแล้ว" },
    "3": { cls: "bg-pink-100 text-pink-800",     text: "กำลังส่งมาไทย" },
    "4": { cls: "bg-orange-100 text-orange-800", text: "ถึงไทยแล้ว" },
    "5": { cls: "bg-red-100 text-red-800",       text: "รอชำระเงิน" },
    "6": { cls: "bg-indigo-100 text-indigo-800", text: "เตรียมส่ง" },
    "7": { cls: "bg-emerald-100 text-emerald-800", text: "ส่งแล้ว" },
  };
  const m = s ? map[s] : undefined;
  if (!m) return <span className="text-muted text-xs">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.text}
    </span>
  );
}

/** Legacy `badgeNameWarehouseChina($int)` — function.php L1052-1059 */
function BadgeNameWarehouseChina({ w }: { w: string | null }) {
  if (w === "1") return <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-[11px] font-medium">กวางโจว</span>;
  if (w === "2") return <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-[11px] font-medium">อี้อู</span>;
  return null;
}

/** Legacy `badgeVIP2($coID,$conn,$userID)` — function.php L567-596.
 *  Renders the customer-tier badge. PCS hides; others show as vip pill.
 *  The 3 supplementary flags (SVIP / CPS / นิติ) are a follow-up — the
 *  additional queries per row would N+1; better to pre-aggregate them. */
function BadgeVIP2({ coid }: { coid: string | null }) {
  if (isGeneralCoid(coid)) return null;
  return (
    <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[11px] font-bold uppercase">
      {coid}
    </span>
  );
}

// ============================================================================
// Row shapes — the relevant subsets of tb_forwarder_import2 + tb_forwarder.
// Lowercased per the legacy schema dump (Postgres collapsed the camelCase
// MySQL names to lowercase on load — migration 0081).
// ============================================================================

type ImportRow = {
  id: number;                  // tb_forwarder_import2.id (the scan-event ID)
  fid: number | null;          // tb_forwarder.id (NULL = orphan scan)
  keysearch: string;           // the scanned tracking string
  fipallet: string;
  fi2amount: number;           // boxes scanned
  fi2date: string | null;      // scan timestamp
  adminid: string;             // username of the scanner
  // Joined fields from tb_forwarder (NULL when orphan)
  f_id: number | null;
  f_fstatus: string | null;
  f_famount: number | null;
  f_userid: string | null;
  f_ftrackingchn: string | null;
  f_fcabinetnumber: string | null;
  f_fdatecontainerclose: string | null;
  f_fdatestatus2: string | null;
  f_fproductstype: string | null;
  f_ftransporttype: string | null;
  f_fwarehousechina: string | null;
  f_fcover: string | null;
  f_fdetail: string | null;
  f_fidorco: string | null;
  f_reforder: string | null;
  f_adminidcreator: string | null;
  f_adminidkey: string | null;
  f_ftotalprice: number | null;
  f_ftransportprice: number | null;
  f_fpriceupdate: number | null;
  f_fshippingservice: number | null;
  f_fdiscount: number | null;
  f_fweight: number | null;
  f_fvolume: number | null;
  f_printstatus1: string | null;
  f_printstatus2: string | null;
  f_printstatus3: string | null;
  // Joined from tb_users
  u_coid: string | null;
};

type SP = {
  historyTable?: string;
  historyTableAll?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function AdminForwardersWarehouseHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate is implicit (any logged-in admin can view). Pacred V3
  // narrows to warehouse + ops + super for this warehouse-scan view.
  await requireAdmin(["super", "ops", "warehouse"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Date-range resolution — L113, L147-161 ──────────────────────
  // Three modes:
  //   ?historyTable=true     → use the provided range (legacy "date"
  //                            string OR new date_from/date_to inputs)
  //   ?historyTableAll=true  → no filter
  //   (default)              → last 7 days (Wave 20 qw2)
  //
  // Wave 20 qw2 (2026-05-25 ค่ำ) — ภูม flagged this as audit P1
  // finding: legacy default was "today only", which on slow days
  // shows an empty page. Bumped default to last 7 days.
  // Wave 20 P1 (2026-05-25): Tailwind rewrite also adds native
  // <input type="date"> fields (in addition to keeping the legacy
  // "date=YYYY-MM-DD - YYYY-MM-DD" string parser for backwards-compat
  // with bookmarked URLs).
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000);
  const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysAgo.getDate()).padStart(2, "0")}`;

  let startDate: string | null = sevenDaysAgoStr;
  let endDate: string | null = todayStr;
  let mode: "default-week" | "range" | "all" = "default-week";

  if (sp.historyTable === "true") {
    mode = "range";
    // Prefer the new native date inputs; fall back to the legacy `date=`
    // string format for bookmarked URLs.
    if (sp.date_from || sp.date_to) {
      startDate = sp.date_from || todayStr;
      endDate   = sp.date_to   || startDate;
    } else {
      const raw = sp.date ?? "";
      startDate = raw.length >= 10 ? raw.slice(0, 10) : todayStr;
      endDate   = raw.length >= 23 ? raw.slice(13, 23) : startDate;
    }
  } else if (sp.historyTableAll === "true") {
    mode = "all";
    startDate = null;
    endDate = null;
  }

  // ── Build the two scan-event queries (L140-161, L183-184, L234) ──
  type ScanRow = {
    id: number;
    fid: number | null;
    keysearch: string;
    fipallet: string;
    fi2amount: number;
    fi2date: string | null;
    adminid: string;
  };

  const scanColumns = "id, fid, keysearch, fipallet, fi2amount, fi2date, adminid";

  // Date-filter bounds — computed once and applied to both queries.
  const dateGte =
    mode === "default-week"
      ? `${sevenDaysAgoStr} 00:00:00`
      : mode === "range" && startDate
        ? `${startDate} 00:00:00`
        : null;
  const dateLte =
    mode === "default-week"
      ? `${todayStr} 23:59:59`
      : mode === "range" && endDate
        ? `${endDate} 23:59:59`
        : null;

  // Wave 20 P1 — `?historyTableAll=true` (mode='all') can return >10k rows
  // in a large warehouse. Cap at 5k to keep the page responsive; the chip
  // below banners the cap when applied so staff know to narrow the range.
  const ALL_MODE_CAP = 5_000;

  let matchedScansQ = admin
    .from("tb_forwarder_import2")
    .select(scanColumns)
    .not("fid", "is", null);
  if (dateGte) matchedScansQ = matchedScansQ.gte("fi2date", dateGte);
  if (dateLte) matchedScansQ = matchedScansQ.lte("fi2date", dateLte);
  const matchedScansFinal =
    mode === "all"
      ? matchedScansQ.order("fi2date", { ascending: false, nullsFirst: false }).limit(ALL_MODE_CAP)
      : matchedScansQ.order("fi2date", { ascending: false, nullsFirst: false });

  let orphanScansQ = admin
    .from("tb_forwarder_import2")
    .select(scanColumns)
    .is("fid", null);
  if (dateGte) orphanScansQ = orphanScansQ.gte("fi2date", dateGte);
  if (dateLte) orphanScansQ = orphanScansQ.lte("fi2date", dateLte);
  const orphanScansFinal =
    mode === "all"
      ? orphanScansQ.order("fi2date", { ascending: false, nullsFirst: false }).limit(ALL_MODE_CAP)
      : orphanScansQ.order("fi2date", { ascending: false, nullsFirst: false });

  const [matchedScansRes, orphanScansRes] = await Promise.all([matchedScansFinal, orphanScansFinal]);
  // §0c — destructure error explicitly (preserved from prior version).
  if (matchedScansRes.error) {
    console.error(`[tb_forwarder_import2 matched list] failed`, { code: matchedScansRes.error.code, message: matchedScansRes.error.message });
  }
  if (orphanScansRes.error) {
    console.error(`[tb_forwarder_import2 orphan list] failed`, { code: orphanScansRes.error.code, message: orphanScansRes.error.message });
  }
  const matchedScans = (matchedScansRes.data ?? []) as unknown as ScanRow[];
  const orphanRaw = (orphanScansRes.data ?? []) as unknown as ScanRow[];

  // Look up the parent tb_forwarder rows for the matched scans.
  const fIds = Array.from(
    new Set(matchedScans.map((r) => r.fid).filter((v): v is number => v != null)),
  );
  type ForwarderRow = {
    id: number;
    fstatus: string | null;
    famount: number | null;
    userid: string | null;
    ftrackingchn: string | null;
    fcabinetnumber: string | null;
    fdatecontainerclose: string | null;
    fdatestatus2: string | null;
    fproductstype: string | null;
    ftransporttype: string | null;
    fwarehousechina: string | null;
    fcover: string | null;
    fdetail: string | null;
    fidorco: string | null;
    reforder: string | null;
    adminidcreator: string | null;
    adminidkey: string | null;
    ftotalprice: number | null;
    ftransportprice: number | null;
    fpriceupdate: number | null;
    fshippingservice: number | null;
    fdiscount: number | null;
    fweight: number | null;
    fvolume: number | null;
    printstatus1: string | null;
    printstatus2: string | null;
    printstatus3: string | null;
  };
  const forwardersById = new Map<number, ForwarderRow>();
  if (fIds.length > 0) {
    const { data: forwarderRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, fstatus, famount, userid, ftrackingchn, fcabinetnumber, " +
          "fdatecontainerclose, fdatestatus2, fproductstype, ftransporttype, " +
          "fwarehousechina, fcover, fdetail, fidorco, reforder, " +
          "adminidcreator, adminidkey, ftotalprice, ftransportprice, " +
          "fpriceupdate, fshippingservice, fdiscount, fweight, fvolume, " +
          "printstatus1, printstatus2, printstatus3",
      )
      .in("id", fIds);
    if (fwdErr) {
      console.error(`[tb_forwarder list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    for (const r of (forwarderRows ?? []) as unknown as ForwarderRow[]) {
      forwardersById.set(r.id, r);
    }
  }

  // Look up tb_users.coid for the badgeVIP2 rendering.
  const userIds = Array.from(
    new Set(
      Array.from(forwardersById.values())
        .map((f) => f.userid)
        .filter((v): v is string => !!v && v !== ""),
    ),
  );
  const coidByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: usersRows, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, coID")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[tb_users list] failed`, { code: usersErr.code, message: usersErr.message });
    }
    for (const r of (usersRows ?? []) as Array<{ userID: string; coID: string | null }>) {
      coidByUserId.set(r.userID, r.coID);
    }
  }

  const matchedRows: ImportRow[] = matchedScans.map((r) => {
    const f = r.fid != null ? forwardersById.get(r.fid) : undefined;
    return {
      id: r.id,
      fid: r.fid,
      keysearch: r.keysearch,
      fipallet: r.fipallet,
      fi2amount: r.fi2amount,
      fi2date: r.fi2date,
      adminid: r.adminid,
      f_id: f?.id ?? null,
      f_fstatus: f?.fstatus ?? null,
      f_famount: f?.famount ?? null,
      f_userid: f?.userid ?? null,
      f_ftrackingchn: f?.ftrackingchn ?? null,
      f_fcabinetnumber: f?.fcabinetnumber ?? null,
      f_fdatecontainerclose: f?.fdatecontainerclose ?? null,
      f_fdatestatus2: f?.fdatestatus2 ?? null,
      f_fproductstype: f?.fproductstype ?? null,
      f_ftransporttype: f?.ftransporttype ?? null,
      f_fwarehousechina: f?.fwarehousechina ?? null,
      f_fcover: f?.fcover ?? null,
      f_fdetail: f?.fdetail ?? null,
      f_fidorco: f?.fidorco ?? null,
      f_reforder: f?.reforder ?? null,
      f_adminidcreator: f?.adminidcreator ?? null,
      f_adminidkey: f?.adminidkey ?? null,
      f_ftotalprice: f?.ftotalprice ?? null,
      f_ftransportprice: f?.ftransportprice ?? null,
      f_fpriceupdate: f?.fpriceupdate ?? null,
      f_fshippingservice: f?.fshippingservice ?? null,
      f_fdiscount: f?.fdiscount ?? null,
      f_fweight: f?.fweight ?? null,
      f_fvolume: f?.fvolume ?? null,
      f_printstatus1: f?.printstatus1 ?? null,
      f_printstatus2: f?.printstatus2 ?? null,
      f_printstatus3: f?.printstatus3 ?? null,
      u_coid: f?.userid ? coidByUserId.get(f.userid) ?? null : null,
    };
  });

  // ── Dupe-detection scan (L248-258 inside the matched loop) ──────
  const trackingChnList = Array.from(
    new Set(
      matchedRows
        .map((r) => r.f_ftrackingchn)
        .filter((t): t is string => !!t && t.length > 0)
    )
  );
  const dupeMap = new Map<string, number[]>();
  if (trackingChnList.length > 0) {
    const { data: dupeRows, error: dupeErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn")
      .in("ftrackingchn", trackingChnList);
    if (dupeErr) {
      console.error(`[tb_forwarder dupe list] failed`, { code: dupeErr.code, message: dupeErr.message });
    }
    for (const r of (dupeRows ?? []) as Array<{ id: number; ftrackingchn: string }>) {
      const arr = dupeMap.get(r.ftrackingchn);
      if (arr) arr.push(r.id);
      else dupeMap.set(r.ftrackingchn, [r.id]);
    }
  }

  // ── Counters for the chips strip ────────────────────────────────
  let noBoxAll = 0;
  let countBoxLackAll = 0;
  let countBoxOverflowAll = 0;
  let countErrorReAll = 0;
  for (const r of orphanRaw) noBoxAll += r.fi2amount;
  for (const r of matchedRows) {
    noBoxAll += r.fi2amount;
    if (r.f_famount != null) {
      if (r.fi2amount < r.f_famount) countBoxLackAll++;
      if (r.fi2amount > r.f_famount) countBoxOverflowAll++;
    }
    if (r.f_ftrackingchn) {
      const ids = dupeMap.get(r.f_ftrackingchn);
      if (ids && ids.length > 1) countErrorReAll++;
    }
  }
  const noTrackingsAll = orphanRaw.length + matchedRows.length;

  // ── Header banner text ──────────────────────────────────────────
  const headerText =
    mode === "range"
      ? `ผลลัพธ์การค้นหา ตั้งแต่ ${startDate} ถึง ${endDate}`
      : mode === "all"
      ? "ผลลัพธ์การค้นหา ทั้งหมด"
      : `ผลลัพธ์การค้นหา 7 วันล่าสุด (${sevenDaysAgoStr} ถึง ${todayStr})`;

  // ── Cover-image URL (Wave 13 batch resolver) ────────────────────
  const coverUrlByRowId = await resolveLegacyUrlMap(
    matchedRows.map((r) => ({ id: r.id, filename: r.f_fcover })),
    "cover",
  );
  const DEFAULT_COVER = "/legacy/pcs/admin/forwarder-default.png";
  const resolveCover = (rowId: number): { thumb: string; full: string } => {
    const url = coverUrlByRowId[String(rowId)];
    if (!url) return { thumb: DEFAULT_COVER, full: DEFAULT_COVER };
    return { thumb: url, full: url };
  };

  // ── Helpers for the date/time split ─────────────────────────────
  const splitDateTime = (iso: string | null): { date: string; time: string } => {
    if (!iso) return { date: "", time: "" };
    const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
    return { date: parts[0] ?? "", time: (parts[1] ?? "").slice(0, 8) };
  };
  const formatDDMMYYYY = (iso: string | null): string => {
    if (!iso) return "";
    const ymd = iso.slice(0, 10);
    const [y, m, d] = ymd.split("-");
    if (!y || !m || !d) return ymd;
    return `${d}/${m}/${y}`;
  };

  const totalRows = orphanRaw.length + matchedRows.length;

  // ── CSV export — on-screen rows flattened (orphan + matched), cols
  //    mirror the <thead> 1:1 (multi-line cells split into flat columns).
  //    The "ทั้งหมด" button re-runs the exact filtered query unpaginated
  //    via exportWarehouseHistoryAll (drift-free).
  const csvCols: CsvCol[] = [
    { key: "section", label: "ส่วน" },
    { key: "f_id", label: "ID" },
    { key: "scan_date", label: "วันที่บันทึก" },
    { key: "scan_time", label: "เวลา" },
    { key: "keysearch", label: "ข้อมูลสแกน" },
    { key: "userid", label: "รหัสลูกค้า" },
    { key: "coid", label: "VIP" },
    { key: "box", label: "กล่อง (ยิง/รวม)" },
    { key: "detail", label: "รายละเอียด" },
    { key: "products_type", label: "ประเภท" },
    { key: "amount_due", label: "ยอดค้างชำระ" },
    { key: "weight", label: "น้ำหนัก" },
    { key: "volume", label: "ปริมาตร" },
    { key: "tracking_chn", label: "เลขพัสดุ (จีน)" },
    { key: "cabinet", label: "เลขตู้" },
    { key: "transport_type", label: "ขนส่ง" },
    { key: "warehouse_china", label: "โกดังจีน" },
    { key: "container_close", label: "ปิดตู้" },
    { key: "status", label: "สถานะ" },
    { key: "arrive_china", label: "วันที่ถึงจีน" },
    { key: "scanned_by", label: "อัปเดต (admin)" },
  ];

  const orphanCsvRows: CsvRow[] = orphanRaw.map((row) => {
    const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
    return {
      section: "รอเชื่อม (orphan)",
      f_id: "",
      scan_date: scanDate,
      scan_time: scanTime,
      keysearch: row.keysearch,
      userid: "",
      coid: "",
      box: `${row.fi2amount}/0`,
      detail: "ไม่พบรายการ กรุณาเลือกเชื่อมรายการ",
      products_type: "",
      amount_due: "",
      weight: "",
      volume: "",
      tracking_chn: "",
      cabinet: "",
      transport_type: "",
      warehouse_china: "",
      container_close: "",
      status: "",
      arrive_china: "",
      scanned_by: row.adminid,
    };
  });

  const matchedCsvRows: CsvRow[] = matchedRows.map((row) => {
    const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
    const sumPrice =
      (Number(row.f_ftotalprice ?? 0) +
        Number(row.f_ftransportprice ?? 0) +
        Number(row.f_fpriceupdate ?? 0) +
        Number(row.f_fshippingservice ?? 0)) -
      Number(row.f_fdiscount ?? 0);
    const volumeTotal =
      row.f_fvolume && row.f_famount
        ? Number(row.f_fvolume) * Number(row.f_famount)
        : null;
    return {
      section: "เชื่อมแล้ว (matched)",
      f_id: row.f_id ?? "",
      scan_date: scanDate,
      scan_time: scanTime,
      keysearch: row.keysearch,
      userid: row.f_userid ?? "",
      coid: isGeneralCoid(row.u_coid) ? "" : row.u_coid,
      box: `${row.fi2amount}/${row.f_famount ?? 0}`,
      detail: row.f_fdetail ?? "",
      products_type: nameProductsType(row.f_fproductstype),
      amount_due: priceWaiting(sumPrice),
      weight:
        row.f_fweight != null && Number(row.f_fweight) > 0 ? `${row.f_fweight} Kg` : "",
      volume:
        volumeTotal != null && Number(volumeTotal) > 0 ? `${volumeTotal} CBM` : "",
      tracking_chn: row.f_ftrackingchn ?? "",
      cabinet: row.f_fcabinetnumber ?? "",
      transport_type:
        row.f_ftransporttype === "1" ? "ทางรถ" : row.f_ftransporttype === "2" ? "ทางเรือ" : "",
      warehouse_china:
        row.f_fwarehousechina === "1" ? "กวางโจว" : row.f_fwarehousechina === "2" ? "อี้อู" : "",
      container_close: formatDDMMYYYY(row.f_fdatecontainerclose),
      status:
        {
          "1": "รอสินค้าเข้าโกดังจีน",
          "2": "ถึงโกดังจีนแล้ว",
          "3": "กำลังส่งมาไทย",
          "4": "ถึงไทยแล้ว",
          "5": "รอชำระเงิน",
          "6": "เตรียมส่ง",
          "7": "ส่งแล้ว",
        }[row.f_fstatus ?? ""] ?? "",
      arrive_china: row.f_fdatestatus2?.slice(0, 10) ?? "",
      scanned_by: row.adminid,
    };
  });

  const csvRows: CsvRow[] = [...orphanCsvRows, ...matchedCsvRows];

  return (
    <>
      {/* Singleton relink-modal host — listens for openRelinkModal()
          events from the per-row relink buttons. */}
      <WarehouseHistoryModalHost />

      {/* Wave 20 P1 — drop the legacy `nav` from the top so the page reads
          the same as sister /admin/report-cnt; TopMenuReport already
          provides the 11-link audit menu. */}
      <TopMenuReport activeHref="/admin/forwarders/warehouse-history" />

      <main className="p-4 lg:p-6 space-y-4">
        {/* Header — ADMIN / breadcrumb / title */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">
              ADMIN · WAREHOUSE
            </p>
            <h1 className="mt-1 text-2xl font-bold">ประวัติเข้าโกดังไทย</h1>
            <p className="text-sm text-muted mt-0.5">
              <Link href="/admin" className="hover:underline">หน้าแรก</Link>
              {" / "}
              <span className="text-foreground">ประวัติสินค้าเข้าโกดัง</span>
            </p>
          </div>
          {/* ภูม #1 (2026-05-29) — was href="/admin/barcode-d-import" (legacy
              PHP filename, never ported · 404). Pacred route is
              /admin/barcode/driver/import — the faithful port of legacy
              barcode-d-import.php (the warehouse intake scanner workstation).
              Same target used by /admin/barcode/page.tsx + driver/page.tsx
              redirects. */}
          <div className="flex items-center gap-2 flex-wrap">
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename="ประวัติเข้าโกดังไทย.csv"
              fetchAll={async () => {
                "use server";
                return exportWarehouseHistoryAll({ mode, startDate, endDate });
              }}
            />
            <Link
              href="/admin/barcode/driver/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
            >
              + สแกนรายการเพิ่ม
            </Link>
          </div>
        </div>

        {/* Filter form — 3 modes preserved (default-week / range / all).
            Native date inputs replace legacy bootstrap-datetimepicker.
            Submit "ค้นหาข้อมูล" sets ?historyTable=true&date_from=&date_to= ·
            Submit "ค้นหาข้อมูลทั้งหมด" sets ?historyTableAll=true. */}
        <form
          className="rounded-xl border border-border bg-white dark:bg-surface p-3 flex flex-wrap items-end gap-2 text-xs"
          method="GET"
          action="/admin/forwarders/warehouse-history"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted">ตั้งแต่</span>
            <input
              type="date"
              name="date_from"
              defaultValue={mode === "range" && startDate ? startDate : mode === "default-week" ? sevenDaysAgoStr : ""}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted">ถึง</span>
            <input
              type="date"
              name="date_to"
              defaultValue={mode === "range" && endDate ? endDate : mode === "default-week" ? todayStr : ""}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            />
          </label>
          <button
            type="submit"
            name="historyTable"
            value="true"
            className="rounded-lg bg-emerald-500 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-600 transition-colors"
          >
            ค้นหาข้อมูล
          </button>
          <button
            type="submit"
            name="historyTableAll"
            value="true"
            className="rounded-lg border border-sky-500 bg-white text-sky-700 px-3 py-2 text-xs font-medium hover:bg-sky-50 transition-colors"
          >
            ค้นหาข้อมูลทั้งหมด
          </button>
          {mode !== "default-week" && (
            <Link
              href="/admin/forwarders/warehouse-history"
              className="rounded-lg border border-border bg-white text-foreground px-3 py-2 text-xs hover:bg-surface-alt"
            >
              กลับ 7 วัน
            </Link>
          )}
          <span className="ml-auto text-[11px] text-red-600 self-end">
            {headerText}
          </span>
        </form>

        {/* Mode = all → cap warning so staff know to narrow the range. */}
        {mode === "all" && totalRows >= ALL_MODE_CAP && (
          <div className="rounded-md border border-orange-200 bg-orange-50/70 p-2.5 text-xs text-orange-800">
            ⚠️ ผลลัพธ์มากกว่า {ALL_MODE_CAP.toLocaleString("th-TH")} รายการ · แสดงเฉพาะล่าสุด · กรุณาเลือกช่วงวันเพื่อดูข้อมูลทั้งหมด
          </div>
        )}

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-xs font-medium">
            แทรคกิ้งที่ยิง {noTrackingsAll.toLocaleString("th-TH")} รายการ
          </span>
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-medium">
            กล่องที่ยิง {noBoxAll.toLocaleString("th-TH")} กล่อง
          </span>
          {/* faithful-look: legacy shows these 3 chips always (even at 0) —
              forwarder-import-warehouse.php L483-485. Drop the >0 guards. */}
          <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-3 py-1 text-xs font-medium">
            กล่องไม่ครบ {countBoxLackAll} รายการ
          </span>
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-medium">
            กล่องเกินมา {countBoxOverflowAll} รายการ
          </span>
          <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-3 py-1 text-xs font-medium">
            รายการซ้ำ {countErrorReAll} รายการ
          </span>
          {orphanRaw.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-800 px-3 py-1 text-xs font-medium">
              รอเชื่อม (orphan) {orphanRaw.length} รายการ
            </span>
          )}
        </div>

        {/* Empty state */}
        {totalRows === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center text-sm text-muted">
            ไม่พบรายการสแกนในช่วงเวลานี้
            <div className="mt-2 text-xs">
              ลองเปลี่ยนช่วงวันที่ หรือกด &ldquo;ค้นหาข้อมูลทั้งหมด&rdquo;
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted">
              💡 ตารางกว้าง — เลื่อนซ้าย-ขวา ⇆ เพื่อดูข้อมูลครบทุกคอลัมน์
            </p>

            <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
              <div className="overflow-x-auto scrollbar-x-visible">
                {/* faithful-look 2026-07-09 (ภูม#2): tighten to legacy density.
                    Legacy .table td/th = 0.25rem/0.5rem padding + font-12 + zebra.
                    The [&>…]:px-2/py-1 table-level variants have higher specificity
                    than the per-cell px-3/py-2, so they compress every cell at once. */}
                <table className="min-w-[1150px] w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>thead>tr>th]:px-2 [&>thead>tr>th]:py-1.5 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60 [&>tbody>tr>td]:px-2 [&>tbody>tr>td]:py-1 [&>tbody>tr>td]:align-top">
                  <thead className="bg-orange-500 text-white">
                    <tr>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">ID</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">วันที่บันทึก</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">ข้อมูลสแกน</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">รหัสลูกค้า</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">รายละเอียด</th>
                      <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">ยอดค้างชำระ</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">เลขพัสดุ (จีน)</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">สถานะ</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap" title="Username Admin ที่อัปเดตสถานะรายการ">อัปเดต</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">ตัวเลือก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* ORPHAN section (L182-232) — fi.fID IS NULL */}
                    {orphanRaw.map((row) => {
                      const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
                      return (
                        <tr key={`orphan-${row.id}`} className="bg-rose-50/40 hover:bg-rose-50">
                          <td className="px-3 py-2 text-center text-muted">—</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div>{scanDate}</div>
                            <div className="text-[11px] text-muted">{scanTime} น.</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-[11px] break-all">{row.keysearch}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-rose-700">กล่อง : {row.fi2amount}/0</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-rose-700 mb-1">ไม่พบรายการ กรุณาเลือกเชื่อมรายการ</div>
                            <WarehouseHistoryRelinkButton
                              scanId={row.id}
                              keysearch={row.keysearch}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-muted">—</td>
                          <td className="px-3 py-2 text-muted">—</td>
                          <td className="px-3 py-2 text-center text-muted">—</td>
                          <td className="px-3 py-2 text-center text-[11px] text-muted">{row.adminid}</td>
                          <td className="px-3 py-2 text-center">
                            <WarehouseHistoryDeleteButton scanId={row.id} />
                          </td>
                        </tr>
                      );
                    })}

                    {/* MATCHED section (L233-348) */}
                    {matchedRows.map((row, idx) => {
                      const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
                      const lacking = row.f_famount != null && row.fi2amount < row.f_famount;
                      const over    = row.f_famount != null && row.fi2amount > row.f_famount;
                      const dupeIds = row.f_ftrackingchn ? (dupeMap.get(row.f_ftrackingchn) ?? []) : [];
                      const hasDupes = dupeIds.length > 1;
                      const cover = resolveCover(row.id);
                      const sumPrice =
                        (Number(row.f_ftotalprice ?? 0) +
                          Number(row.f_ftransportprice ?? 0) +
                          Number(row.f_fpriceupdate ?? 0) +
                          Number(row.f_fshippingservice ?? 0)) -
                        Number(row.f_fdiscount ?? 0);
                      const volumeTotal =
                        row.f_fvolume && row.f_famount
                          ? Number(row.f_fvolume) * Number(row.f_famount)
                          : null;
                      const containerCloseDDMMYYYY = formatDDMMYYYY(row.f_fdatecontainerclose);
                      const rowClass = lacking
                        ? "bg-rose-50/30 hover:bg-rose-50"
                        : hasDupes
                          ? "bg-indigo-50/30 hover:bg-indigo-50"
                          : idx % 2 === 1
                            ? "bg-muted/20 hover:bg-surface-alt"
                            : "hover:bg-surface-alt";

                      return (
                        <tr key={`matched-${row.id}`} className={rowClass}>
                          {/* 1 — ID */}
                          <td className="px-3 py-2 text-center whitespace-nowrap font-mono text-xs">
                            {row.f_id ?? ""}
                          </td>
                          {/* 2 — วันที่บันทึก + print badges */}
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div>{scanDate}</div>
                            <div className="text-[11px] text-muted">{scanTime} น.</div>
                            <div className="mt-1 flex flex-col gap-0.5 items-center">
                              {row.f_printstatus1 === "1" && (
                                <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-1.5 py-0.5 text-[11px] font-medium">
                                  พิมพ์แล้ว #1
                                </span>
                              )}
                              {row.f_printstatus2 === "1" && (
                                <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-1.5 py-0.5 text-[11px] font-medium">
                                  พิมพ์แล้ว #2
                                </span>
                              )}
                              {row.f_printstatus3 === "1" && (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[11px] font-medium">
                                  พิมพ์แล้ว #3
                                </span>
                              )}
                            </div>
                          </td>
                          {/* 3 — ข้อมูลสแกน */}
                          <td className="px-3 py-2">
                            <span className="font-mono text-[11px] break-all">{row.keysearch}</span>
                          </td>
                          {/* 4 — รหัสลูกค้า + VIP + delta */}
                          <td className="px-3 py-2">
                            <Link
                              href={`/admin/users/profile/${encodeURIComponent(row.f_userid ?? "")}`}
                              className="text-sky-700 hover:underline font-medium"
                            >
                              {row.f_userid}
                              <BadgeVIP2 coid={row.u_coid} />
                            </Link>
                            {lacking && row.f_famount != null && (
                              <div className="text-rose-700 text-[11px] mt-0.5">
                                ขาดอีก {row.f_famount - row.fi2amount} กล่อง
                              </div>
                            )}
                            {over && row.f_famount != null && (
                              <div className="text-rose-700 text-[11px] mt-0.5">
                                เกินมา {row.fi2amount - row.f_famount} กล่อง
                              </div>
                            )}
                            <div className="text-[11px] text-muted mt-0.5">
                              กล่อง : {row.fi2amount}/{row.f_famount ?? 0}
                            </div>
                            {hasDupes && (
                              <div className="mt-1 rounded bg-red-600 text-white px-2 py-1 text-[11px]">
                                มีรายการซ้ำ:{" "}
                                {dupeIds.map((dupId, idx) => (
                                  <Link
                                    key={dupId}
                                    href={`/admin/forwarders/${dupId}`}
                                    target="_blank"
                                    className="underline ml-1"
                                  >
                                    #{dupId}{idx < dupeIds.length - 1 ? "," : ""}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </td>
                          {/* 5 — รายละเอียด + cover */}
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <a
                                className="shrink-0"
                                href={cover.full}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={cover.thumb}
                                  alt="cover"
                                  width={60}
                                  height={60}
                                  className="rounded border border-border object-cover"
                                />
                              </a>
                              <div className="min-w-0 flex-1">
                                <Link
                                  className="text-sky-700 hover:underline text-xs font-medium block"
                                  href={`/admin/forwarders/${row.f_id ?? ""}`}
                                >
                                  เลขที่รายการ #{row.f_id ?? ""}
                                </Link>
                                <div className="max-w-[220px] text-[11px] text-muted line-clamp-2 mt-0.5">
                                  {row.f_fdetail ?? ""}
                                </div>
                                <div className="text-[11px] text-muted mt-0.5">
                                  ประเภท: {nameProductsType(row.f_fproductstype)}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {row.f_adminidcreator && row.f_adminidcreator !== "" && (!row.f_reforder || row.f_reforder === "") && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[11px] font-medium">
                                      ฝากนำเข้า: {row.f_adminidcreator}
                                    </span>
                                  )}
                                  {(!row.f_adminidcreator || row.f_adminidcreator === "") && (!row.f_reforder || row.f_reforder === "") && (
                                    <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-1.5 py-0.5 text-[11px] font-medium">
                                      ฝากนำเข้าจาก: users
                                    </span>
                                  )}
                                  {row.f_reforder && row.f_reforder !== "" && (
                                    <Link href={`/admin/shops/detail/${row.f_reforder}`}>
                                      <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-800 px-1.5 py-0.5 text-[11px] font-medium hover:bg-sky-200">
                                        ฝากสั่งซื้อ: {row.f_reforder}
                                      </span>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* 6 — ยอดค้างชำระ + KG/CBM + admin */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className={sumPrice > 0 ? "text-foreground font-medium" : "text-muted"}>
                              {priceWaiting(sumPrice)}
                            </div>
                            {row.f_fweight != null && Number(row.f_fweight) > 0 && (
                              <div className="text-[11px] text-muted">{row.f_fweight} Kg</div>
                            )}
                            {volumeTotal != null && Number(volumeTotal) > 0 && (
                              <div className="text-[11px] text-muted">{volumeTotal} CBM</div>
                            )}
                            {row.f_adminidkey && (
                              <div className="text-[11px] text-muted mt-0.5" title="admin ที่วัดขนาด">
                                @{row.f_adminidkey}
                              </div>
                            )}
                          </td>
                          {/* 7 — เลขพัสดุ (จีน) + ตู้ + transport */}
                          <td className="px-3 py-2">
                            {row.f_ftrackingchn && (
                              <div className="bg-rose-600 text-white px-2 py-0.5 rounded font-mono text-[11px] break-all mb-1">
                                {row.f_ftrackingchn}
                              </div>
                            )}
                            <div className="text-[11px]">
                              เลขตู้:{" "}
                              <Link
                                href={{ pathname: "/admin/cnt/report", query: { id: row.f_fcabinetnumber ?? "" } }}
                                target="_blank"
                                className="text-sky-700 hover:underline font-medium"
                              >
                                {row.f_fcabinetnumber ?? "—"}
                              </Link>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <NameTransportType2 t={row.f_ftransporttype} />
                              <BadgeNameWarehouseChina w={row.f_fwarehousechina} />
                            </div>
                            {containerCloseDDMMYYYY && (
                              <div className="text-[11px] text-muted mt-0.5">
                                ปิดตู้: {containerCloseDDMMYYYY}
                              </div>
                            )}
                            {row.f_fidorco && (
                              <div className="bg-rose-600 text-white px-1.5 py-0.5 rounded font-mono text-[11px] inline-block mt-1">
                                {row.f_fidorco}
                              </div>
                            )}
                          </td>
                          {/* 8 — สถานะ */}
                          <td className="px-3 py-2 text-center">
                            <StatusForwarderAll s={row.f_fstatus} />
                          </td>
                          {/* 9 — อัปเดต — admin who scanned + date arrived in China */}
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div className="text-[11px] text-muted">วันที่ถึงจีน</div>
                            <div className="text-[11px]">{row.f_fdatestatus2?.slice(0, 10) ?? "—"}</div>
                            <div className="text-[11px] text-muted mt-1">@{row.adminid}</div>
                          </td>
                          {/* 10 — ตัวเลือก */}
                          <td className="px-3 py-2 text-center">
                            <WarehouseHistoryMatchedActions
                              scanId={row.id}
                              forwarderId={row.f_id}
                              forwarderStatus={row.f_fstatus}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer actions — bulk-print (deferred) + back. */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                disabled
                className="rounded-lg border border-border bg-surface-alt text-muted px-3 py-2 text-xs cursor-not-allowed"
                title="Wave 21 — bulk-print PDF ยังไม่เปิด"
              >
                📦 พิมพ์จากหน้ากล่อง (Wave 21)
              </button>
              <Link
                href="/admin/forwarders"
                className="rounded-lg border border-border bg-white text-foreground px-3 py-2 text-xs hover:bg-surface-alt"
              >
                ← กลับหน้าฝากนำเข้า
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
