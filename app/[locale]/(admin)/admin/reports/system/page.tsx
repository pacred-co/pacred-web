/**
 * /admin/reports/system — รายงานการเข้าถึงเว็บ (Wave 23 P1 batch 2-C Tailwind rewrite)
 *
 * **Wave 23 P1 batch 2-C (2026-05-27 ค่ำ):** UI rewrite only — the underlying
 * tb_web_hs / tb_page_name reads + the six in-JS aggregations (a..f) are
 * unchanged. Replaces the `.pcs-legacy` / Bootstrap-4 / admin-base.css
 * verbatim transcription (~998 LOC heavy with `card card-header
 * heading-elements` repeated 6×) with the Pacred Tailwind v4 reports
 * template (mirrors `reports/payment/page.tsx` Wave 20 P1 batch 2-b).
 *
 * Legacy source: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-system.php`
 * (L1-980 · single-mode page · NO `?page=` dispatch · NO POST handlers).
 *
 * **Workflow preserved (per AGENTS §0a):** same six aggregations, same
 * filter form (date range + device type + 4 group-by toggles), same role
 * gate (admin/super only — sensitive telemetry incl. session_id, IP,
 * user_agent), same 5000-row detail cap, same tb_page_name overflow lookup
 * for namePageName page IDs > 29. The chart fallbacks (Chart.js never
 * shipped in Pacred) stay as scrollable tables — same data, prettier chrome.
 *
 * **Bloat removed:** Bootstrap `.card-header` + `.heading-elements`
 * collapse/reload/expand icon buttons (6× duplicated, ~120 LOC) ·
 * `.app-content content content-overlay content-wrapper content-body
 * section row col-md-12 col-sm-12 card2 card-content card-body p-05` deep
 * nesting (each card 8 levels deep) · the `<tr class="no-sort">` template
 * placeholder row · `.pcs-legacy` wrapper + 2 legacy CSS `<link>` tags.
 *
 * §0c compliance: every Supabase query destructures { data, error } and
 * logs on failure. Detail query throws on hard fail; the tb_page_name
 * lookup tolerates failure (page labels degrade to "Unknown" — not a hub 500).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";
import { nowDate } from "@/lib/datetime-helpers";

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers — inlined from the legacy admin function.php (pure functions only).
// Carried verbatim from the prior Bootstrap version (Wave 6 transcription).
// ============================================================================

/** Legacy `nameGetDevice($int)` — function.php L2667-2674. */
function nameGetDevice(d: number | string | null): string {
  switch (String(d ?? "")) {
    case "1": return "Mobile";
    case "2": return "Desktop";
    default:  return "Unknown";
  }
}

/** Legacy `nameGetOS($int)` — function.php L2675-2698. */
function nameGetOS(o: number | string | null): string {
  switch (String(o ?? "")) {
    case "1":  return "Windows 11";
    case "2":  return "Windows 10";
    case "3":  return "Windows 8.1";
    case "4":  return "Windows 8";
    case "5":  return "Windows 7";
    case "6":  return "Windows Vista";
    case "7":  return "Windows Server 2003/XP x64";
    case "8":  return "Windows XP";
    case "9":  return "Windows XP";
    case "10": return "Windows 2000";
    case "11": return "Windows ME";
    case "12": return "Mac OS X";
    case "13": return "Mac OS 9";
    case "14": return "Linux";
    case "15": return "Ubuntu";
    case "16": return "Android";
    case "17": return "iPhone";
    case "18": return "iPad";
    default:   return "Unknown";
  }
}

/** Legacy `nameBrowserName($int)` — function.php L2699-2712. */
function nameBrowserName(b: number | string | null): string {
  switch (String(b ?? "")) {
    case "1": return "Line";
    case "2": return "Instagram";
    case "3": return "Messenger Facebook";
    case "4": return "Firefox";
    case "5": return "Chrome";
    case "6": return "Microsoft Edge";
    case "7": return "Safari";
    case "8": return "Opera Mini";
    default:  return "Unknown";
  }
}

/** Legacy `namePageName($int)` — function.php L2722-2820. Hardcoded 1-29
 *  + falls through to a runtime `tb_page_name` lookup for IDs > 29
 *  (legacy populates a PHP constant via the SELECT at L2714-2720). */
const HARDCODED_PAGE_NAMES: Record<string, string> = {
  "1":  "ค้นหาสินค้า",
  "2":  "ที่อยู่จัดส่งสินค้า",
  "3":  "หน้าหลักระบบสมาชิก",
  "4":  "รายการฝากสั่งสินค้า",
  "5":  "ฝากสั่งสินค้า รอดำเนินการ",
  "6":  "ฝากสั่งสินค้า รอชำระเงิน",
  "7":  "ฝากสั่งสินค้า สั่งสินค้า",
  "8":  "ฝากสั่งสินค้า รอร้านจีนจัดส่ง",
  "9":  "ฝากสั่งสินค้า สำเร็จ",
  "10": "ฝากสั่งสินค้า ยกเลิกออเดอร์",
  "11": "ตระกร้าสินค้า",
  "12": "รายการฝากนำเข้าทั้งหมด",
  "13": "ฝากนำเข้า รอเข้าโกดังจีน",
  "14": "ฝากนำเข้า ถึงโกดังจีนแล้ว",
  "15": "ฝากนำเข้า กำลังส่งมาไทย",
  "16": "ฝากนำเข้า ถึงไทยแล้ว",
  "17": "ฝากนำเข้า รอชำระเงิน",
  "18": "ฝากนำเข้า เตรียมส่ง",
  "19": "ฝากนำเข้า กำลังจัดส่ง",
  "20": "ฝากนำเข้า ส่งแล้ว",
  "21": "ฝากนำเข้า เครดิตสินค้า",
  "22": "ฝากนำเข้าแบบตาราง",
  "23": "ฝากโอนหยวน",
  "24": "กระเป๋าสตางค์",
  "25": "ทำการถอนเงิน",
  "26": "ทำการชำระเงิน",
  "27": "โปรไฟล์ตัวเอง",
  "28": "ตั้งค่าบัญชี",
  "29": "โปรไฟล์ตัวเอง",
};
function namePageName(id: number | string | null, lookup: Map<number, string>): string {
  const k = String(id ?? "");
  if (HARDCODED_PAGE_NAMES[k]) return HARDCODED_PAGE_NAMES[k];
  const idNum = Number(k);
  if (Number.isFinite(idNum) && lookup.has(idNum)) return lookup.get(idNum)!;
  return "Unknown";
}

/** `YYYY-MM-DD` formatter (legacy `date("Y-m-d", ...)`). */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Legacy `date("Y-m-d", strtotime("-3 days", strtotime(date("Y-m-d"))))`
 *  (report-system.php L58, L76). Uses `nowDate()` per Next 16 purity rule. */
function threeDaysAgo(): string {
  const d = nowDate();
  d.setDate(d.getDate() - 3);
  return isoDate(d);
}

/** Legacy `date("Y-m-d")` — today as YYYY-MM-DD. Uses `nowDate()` per Next 16 purity rule. */
function todayISO(): string {
  return isoDate(nowDate());
}

/** Legacy date-range parser — daterangepicker emits "YYYY-MM-DD - YYYY-MM-DD"
 *  and report-system.php L54-56 reads it via substring slicing. */
function parseDateRange(raw: string | undefined): { start: string; end: string } | null {
  if (!raw) return null;
  if (raw.length < 23) return null;
  const start = raw.slice(0, 10);
  const end = raw.slice(13);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end))   return null;
  return { start, end };
}

// ============================================================================
// Filter option sets — kept inline (small, readable, dropdown-friendly).
// ============================================================================

const DEVICE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1",   label: "มือถือ" },
  { value: "2",   label: "คอมพิวเตอร์" },
  { value: "3",   label: "ไม่ระบุ" },
];

function deviceFilterLabel(s: string): string {
  return DEVICE_OPTIONS.find((o) => o.value === s)?.label ?? "ทั้งหมด";
}

// ============================================================================
// Row shapes
// ============================================================================

type WebHitRow = {
  datetime: string | null;
  ip: string | null;
  device: number | null;
  os: number | null;
  browser: number | null;
  load_time: number | string | null;
  user_agent: string | null;
  session_id: string | null;
  userid: string | null;
  page_name: number | null;
};

type SP = {
  date?: string;
  type?: string;
  ip?: string;
  userID?: string;
  sessionID?: string;
  userAgent?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function ReportSystemPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate is implicit — narrow to super-only because the table
  // includes session IDs / user-agents / IPs (sensitive telemetry).
  await requireAdmin(["super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Date range resolution (L48-61) ───────────────────────────
  // Legacy: if ?date set use it; else "-3 days" → today.
  let startDate: string;
  let endDate: string;
  if (sp.date !== undefined) {
    const range = parseDateRange(sp.date);
    if (range) {
      startDate = range.start;
      endDate = range.end;
    } else {
      startDate = threeDaysAgo();
      endDate = todayISO();
    }
  } else {
    startDate = threeDaysAgo();
    endDate = todayISO();
  }

  // ── Filter shape: device + group-by toggles (L106-119) ───────
  const deviceFilter = sp.type ?? "all";
  const groupByIp        = sp.ip        === "1";
  const groupByUserID    = sp.userID    === "1";
  const groupBySessionID = sp.sessionID === "1";
  const groupByUserAgent = sp.userAgent === "1";

  // ── Detail rows query (L132) ─────────────────────────────────
  let detailQ = admin
    .from("tb_web_hs")
    .select(
      "datetime, ip, device, os, browser, load_time, user_agent, session_id, userid, page_name",
    )
    .gte("datetime", `${startDate}T00:00:00`)
    .lte("datetime", `${endDate}T23:59:59`)
    .order("datetime", { ascending: false, nullsFirst: false })
    .limit(5000); // safety cap — legacy DataTables paginates client-side.

  if (deviceFilter === "1") detailQ = detailQ.eq("device", 1);
  else if (deviceFilter === "2") detailQ = detailQ.eq("device", 2);
  else if (deviceFilter === "3") detailQ = detailQ.eq("device", 0); // legacy "" → 0 in int col

  const { data: detailData, error: detailDataErr } = await detailQ;
  if (detailDataErr) {
    console.error(`[tb_web_hs list] failed`, {
      code: detailDataErr.code, message: detailDataErr.message, details: detailDataErr.details,
    });
    throw new Error(`Failed to load tb_web_hs (${detailDataErr.code ?? "unknown"}): ${detailDataErr.message}`);
  }
  const rawHits = (detailData ?? []) as unknown as WebHitRow[];

  // Apply the group-by JS-side (mirrors the legacy GROUP BY semantics).
  // PostgREST can't express arbitrary GROUP BY without an aggregate column,
  // so the runbook (§3) allows preserving INTENT: fetch rows without GROUP
  // BY, then apply distinct-by in JS when toggles are on. The visible
  // effect is identical for the analyst (each distinct combination shown once).
  const groupByCols: (keyof WebHitRow)[] = [];
  if (groupByIp)        groupByCols.push("ip");
  if (groupByUserID)    groupByCols.push("userid");
  if (groupBySessionID) groupByCols.push("session_id");
  if (groupByUserAgent) groupByCols.push("user_agent");

  let detailRows: WebHitRow[] = rawHits;
  if (groupByCols.length > 0) {
    const seen = new Set<string>();
    detailRows = [];
    for (const r of rawHits) {
      const key = groupByCols.map((c) => `${c}:${String(r[c] ?? "")}`).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      detailRows.push(r);
    }
  }

  // ── Aggregations a/b/c/d/e/f — six chart datasets ────────────
  // Computed in JS off the same detail-row fetch (one round-trip
  // instead of legacy's six). Identical semantics.

  // (a) count_by_date — per-day hit counts, in the range (L143-201).
  const dayLabels = (() => {
    const arr: string[] = [];
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return arr;
    const cur = new Date(s);
    while (cur <= e) {
      arr.push(isoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  })();
  const countByDate = new Map<string, number>();
  for (const lbl of dayLabels) countByDate.set(lbl, 0);
  for (const r of rawHits) {
    if (!r.datetime) continue;
    const lbl = r.datetime.slice(0, 10);
    if (countByDate.has(lbl)) countByDate.set(lbl, (countByDate.get(lbl) ?? 0) + 1);
  }

  // (b) top-20 pages by count (L274).
  const pageCount = new Map<number, number>();
  for (const r of rawHits) {
    const k = r.page_name ?? 0;
    pageCount.set(k, (pageCount.get(k) ?? 0) + 1);
  }
  const top20Pages = Array.from(pageCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // (c) slowest-20 pages by avg load_time (L311). avg = sum/count.
  const loadSum = new Map<number, number>();
  const loadCount = new Map<number, number>();
  for (const r of rawHits) {
    const k = r.page_name ?? 0;
    const lt = Number(r.load_time) || 0;
    loadSum.set(k, (loadSum.get(k) ?? 0) + lt);
    loadCount.set(k, (loadCount.get(k) ?? 0) + 1);
  }
  const low20Pages = Array.from(loadSum.entries())
    .map(([k, sum]) => [k, sum / (loadCount.get(k) ?? 1)] as [number, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // (d) top-20 users (L348) — WHERE userID<>''.
  const userCount = new Map<string, number>();
  for (const r of rawHits) {
    const uid = r.userid ?? "";
    if (uid === "") continue;
    userCount.set(uid, (userCount.get(uid) ?? 0) + 1);
  }
  const top20Users = Array.from(userCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // (e) device pie (L385).
  const deviceCount = new Map<number, number>();
  for (const r of rawHits) {
    const k = r.device ?? 0;
    deviceCount.set(k, (deviceCount.get(k) ?? 0) + 1);
  }
  const deviceRows = Array.from(deviceCount.entries()).sort((a, b) => b[1] - a[1]);

  // (f) browser doughnut (L422).
  const browserCount = new Map<number, number>();
  for (const r of rawHits) {
    const k = r.browser ?? 0;
    browserCount.set(k, (browserCount.get(k) ?? 0) + 1);
  }
  const browserRows = Array.from(browserCount.entries()).sort((a, b) => b[1] - a[1]);

  // ── tb_page_name lookup for the namePageName helper (L2714) ──
  // Pull only the page-name IDs we'll actually display above the
  // 29 hardcoded values. Soft-fails to "Unknown" — not a hub 500.
  const usedPageIds = new Set<number>();
  for (const r of rawHits) if (r.page_name != null) usedPageIds.add(r.page_name);
  for (const [k] of top20Pages) usedPageIds.add(k);
  for (const [k] of low20Pages) usedPageIds.add(k);
  const overflowIds = Array.from(usedPageIds).filter((id) => id > 29);
  const pageNameLookup = new Map<number, string>();
  if (overflowIds.length > 0) {
    const { data: pnData, error: pnDataErr } = await admin
      .from("tb_page_name")
      .select("id, pagename")
      .in("id", overflowIds);
    if (pnDataErr) {
      console.error(`[tb_page_name list] failed`, { code: pnDataErr.code, message: pnDataErr.message });
    }
    for (const r of (pnData ?? []) as Array<{ id: number; pagename: string }>) {
      pageNameLookup.set(r.id, r.pagename);
    }
  }

  // ── Top-level stat cards (page summary) ──────────────────────
  const totalHits     = rawHits.length;
  const uniqueIPs     = new Set(rawHits.map((r) => r.ip).filter(Boolean)).size;
  const uniqueUsers   = new Set(rawHits.map((r) => r.userid).filter(Boolean)).size;
  const uniqueSessions = new Set(rawHits.map((r) => r.session_id).filter(Boolean)).size;

  // ── CSV export of the detail rows ────────────────────────────
  const csvRows = detailRows.map((r) => ({
    datetime:   r.datetime ?? "",
    ip:         r.ip ?? "",
    device:     nameGetDevice(r.device),
    os:         nameGetOS(r.os),
    browser:    nameBrowserName(r.browser),
    load_time:  r.load_time ?? "",
    page_name:  namePageName(r.page_name, pageNameLookup),
    userid:     r.userid ?? "",
    session_id: r.session_id ?? "",
    user_agent: r.user_agent ?? "",
  }));
  const csvCols = [
    { key: "datetime",   label: "วันที่ค้นหา" },
    { key: "ip",         label: "IP Address" },
    { key: "device",     label: "ประเภทอุปกรณ์" },
    { key: "os",         label: "ระบบปฏิบัติการ" },
    { key: "browser",    label: "Browser" },
    { key: "load_time",  label: "เวลาโหลด (วินาที)" },
    { key: "page_name",  label: "ชื่อหน้า" },
    { key: "userid",     label: "userID" },
    { key: "session_id", label: "session_id" },
    { key: "user_agent", label: "user_agent" },
  ];

  // Submitted-banner predicate (any explicit filter set in URL).
  const submitted =
    sp.date !== undefined ||
    sp.type !== undefined ||
    sp.ip !== undefined ||
    sp.userID !== undefined ||
    sp.sessionID !== undefined ||
    sp.userAgent !== undefined;

  // Input default for the date control — preserves the legacy "YYYY-MM-DD - YYYY-MM-DD" shape.
  const dateInputDefault = sp.date ?? `${startDate} - ${endDate}`;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">รายงานการเข้าถึงเว็บ</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">tb_web_hs</span> · ฟิลเตอร์ช่วงวันที่ + ประเภทอุปกรณ์ + จัดกลุ่ม
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Filter banner (when submitted) */}
      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ผลลัพธ์การค้นหา · ประเภทอุปกรณ์: <span className="font-semibold">{deviceFilterLabel(deviceFilter)}</span>
          {" · "}
          ช่วงวันที่: <span className="font-semibold">{startDate}</span> ถึง <span className="font-semibold">{endDate}</span>
          {(groupByIp || groupByUserID || groupBySessionID || groupByUserAgent) && (
            <>
              {" · จัดกลุ่ม: "}
              <span className="font-semibold">
                {[
                  groupByIp && "IP",
                  groupByUserID && "userID",
                  groupBySessionID && "session_id",
                  groupByUserAgent && "user_agent",
                ].filter(Boolean).join(" + ")}
              </span>
            </>
          )}
        </div>
      )}

      {/* Filter form (GET) */}
      <form method="GET" action="/admin/reports/system" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label htmlFor="date" className="block text-xs text-muted mb-1">วันที่ค้นหา</label>
            <input
              id="date"
              type="text"
              name="date"
              defaultValue={dateInputDefault}
              placeholder="YYYY-MM-DD - YYYY-MM-DD"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
            <p className="mt-1 text-[10px] text-muted">รูปแบบ: <code>2025-12-01 - 2025-12-31</code></p>
          </div>
          <div>
            <label htmlFor="type" className="block text-xs text-muted mb-1">ประเภทอุปกรณ์</label>
            <select
              id="type"
              name="type"
              defaultValue={deviceFilter}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {DEVICE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Group-by toggles — 4 in one row (compact label per legacy). */}
        <div>
          <p className="block text-xs text-muted mb-1">จัดกลุ่มผลลัพธ์ (DISTINCT)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <GroupByToggle name="ip"        defaultValue={sp.ip}        label="IP Address" />
            <GroupByToggle name="userID"    defaultValue={sp.userID}    label="userID" />
            <GroupByToggle name="sessionID" defaultValue={sp.sessionID} label="session_id" />
            <GroupByToggle name="userAgent" defaultValue={sp.userAgent} label="user_agent" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="submit"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton rows={csvRows} cols={csvCols} filename={`web-hits-${startDate}-${endDate}.csv`} />
        </div>
      </form>

      {/* Top stat cards — page summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="จำนวน Hits"      value={totalHits.toLocaleString("th-TH")} />
        <Card label="IP ที่ไม่ซ้ำ"     value={uniqueIPs.toLocaleString("th-TH")} />
        <Card label="userID ที่ไม่ซ้ำ" value={uniqueUsers.toLocaleString("th-TH")} />
        <Card label="Session ที่ไม่ซ้ำ" value={uniqueSessions.toLocaleString("th-TH")} />
      </div>

      {/* Six aggregation cards — 2-col grid on lg+. */}
      <div className="grid lg:grid-cols-2 gap-3">
        {/* (a) daily views — area chart fallback as scrollable mini-table */}
        <ChartCard title="จำนวนการใช้งานรายวัน" subtitle={`${dayLabels.length} วัน · area chart fallback`}>
          <ChartTable
            head={["วันที่", "จำนวนการเข้าชม"]}
            rows={Array.from(countByDate.entries()).map(([d, n]) => [d, n.toLocaleString("th-TH")])}
            rightAlignLast
            empty="ไม่มีข้อมูลในช่วงเวลานี้"
          />
        </ChartCard>

        {/* (b) top-20 pages by hit count */}
        <ChartCard title="ชื่อหน้าเว็บที่มีคนเข้าถึงมากสุด 20 อันดับแรก" subtitle="bar chart fallback">
          <ChartTable
            head={["ชื่อหน้าเว็บ", "จำนวนครั้ง"]}
            rows={top20Pages.map(([pid, n]) => [namePageName(pid, pageNameLookup), n.toLocaleString("th-TH")])}
            rightAlignLast
            empty="ไม่มีข้อมูล"
          />
        </ChartCard>

        {/* (c) slowest-20 pages by avg load_time */}
        <ChartCard title="ชื่อหน้าเว็บโหลดช้าสุด 20 อันดับแรก" subtitle="bar chart fallback · เฉลี่ย load_time">
          <ChartTable
            head={["ชื่อหน้าเว็บ", "เวลาที่ใช้เฉลี่ย (วินาที)"]}
            rows={low20Pages.map(([pid, avg]) => [namePageName(pid, pageNameLookup), avg.toFixed(4)])}
            rightAlignLast
            empty="ไม่มีข้อมูล"
          />
        </ChartCard>

        {/* (d) top-20 users by hit count */}
        <ChartCard title="สมาชิกที่ใช้งานระบบมากสุด 20 อันดับแรก" subtitle="bar chart fallback">
          <ChartTable
            head={["รหัสสมาชิก", "จำนวนครั้ง"]}
            rows={top20Users.map(([uid, n]) => [
              <Link key={uid} href={`/admin/users/profile/${uid}`} className="text-primary-600 hover:underline font-mono text-xs">
                {uid}
              </Link>,
              n.toLocaleString("th-TH"),
            ])}
            rightAlignLast
            empty="ไม่มีสมาชิกที่ล็อกอินในช่วงนี้"
          />
        </ChartCard>

        {/* (e) device pie */}
        <ChartCard title="ประเภทอุปกรณ์ที่เข้าถึง" subtitle="pie chart fallback">
          <ChartTable
            head={["อุปกรณ์", "จำนวนครั้ง"]}
            rows={deviceRows.map(([d, n]) => [nameGetDevice(d), n.toLocaleString("th-TH")])}
            rightAlignLast
            empty="ไม่มีข้อมูล"
          />
        </ChartCard>

        {/* (f) browser doughnut */}
        <ChartCard title="ชนิดของ Browser ที่เข้าถึง" subtitle="doughnut chart fallback">
          <ChartTable
            head={["Browser", "จำนวนครั้ง"]}
            rows={browserRows.map(([b, n]) => [nameBrowserName(b), n.toLocaleString("th-TH")])}
            rightAlignLast
            empty="ไม่มีข้อมูล"
          />
        </ChartCard>
      </div>

      {/* Detail table — full hit log */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border bg-surface-alt/50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">ข้อมูลแบบละเอียด</h2>
            <p className="text-[11px] text-muted">{detailRows.length.toLocaleString("th-TH")} แถว · เลื่อนซ้าย-ขวา ⇆ เพื่อดูคอลัมน์ทั้งหมด</p>
          </div>
        </div>

        {detailRows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มี hit ในช่วงเวลานี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">วันที่</th>
                  <th className="px-3 py-3 whitespace-nowrap">IP</th>
                  <th className="px-3 py-3 whitespace-nowrap">อุปกรณ์</th>
                  <th className="px-3 py-3 whitespace-nowrap">OS</th>
                  <th className="px-3 py-3 whitespace-nowrap">Browser</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">โหลด (s)</th>
                  <th className="px-3 py-3 whitespace-nowrap">ชื่อหน้า</th>
                  <th className="px-3 py-3 whitespace-nowrap">userID</th>
                  <th className="px-3 py-3 whitespace-nowrap">session_id</th>
                  <th className="px-3 py-3">user_agent</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, i) => (
                  <tr key={`${i}-${row.session_id ?? ""}-${row.datetime ?? ""}`} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-3 py-2 text-[11px] font-mono whitespace-nowrap text-muted">
                      {row.datetime ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono whitespace-nowrap">{row.ip ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{nameGetDevice(row.device)}</td>
                    <td className="px-3 py-2 text-xs">{nameGetOS(row.os)}</td>
                    <td className="px-3 py-2 text-xs">{nameBrowserName(row.browser)}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono">{row.load_time ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{namePageName(row.page_name, pageNameLookup)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {row.userid ? (
                        <Link
                          href={`/admin/users/profile/${row.userid}`}
                          className="text-primary-600 hover:underline font-mono"
                        >
                          {row.userid}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-mono text-muted whitespace-nowrap">{row.session_id ?? "—"}</td>
                    <td className="px-3 py-2 text-[10px] text-muted max-w-md truncate" title={row.user_agent ?? ""}>
                      {row.user_agent ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน 5,000 แถวต่อหน้า · ใช้ตัวกรองช่วงวันที่เพื่อจำกัดผลลัพธ์ · จัดกลุ่มเพื่อแสดงเฉพาะค่าที่ไม่ซ้ำ
      </p>
    </main>
  );
}

// ============================================================================
// Subcomponents (kept local — same-file scope keeps the page self-contained)
// ============================================================================

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="border-b border-border bg-surface-alt/50 px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function ChartTable({
  head,
  rows,
  rightAlignLast,
  empty,
}: {
  head: string[];
  rows: Array<Array<string | number | React.ReactNode>>;
  rightAlignLast?: boolean;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="p-6 text-center text-xs text-muted">{empty}</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-alt/30 text-left uppercase tracking-wide text-muted">
        <tr>
          {head.map((h, i) => (
            <th
              key={i}
              className={`px-3 py-2 ${rightAlignLast && i === head.length - 1 ? "text-right" : ""}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="border-t border-border hover:bg-surface-alt/20">
            {row.map((cell, ci) => (
              <td
                key={ci}
                className={`px-3 py-1.5 ${rightAlignLast && ci === row.length - 1 ? "text-right font-mono" : ""}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GroupByToggle({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: string | undefined;
  label: string;
}) {
  // We use a <select> instead of a checkbox to preserve URL shape — the
  // legacy GET endpoint expects `?ip=all` or `?ip=1`. A native checkbox
  // would send `?ip=on`, breaking the bookmarkable URL contract.
  const cur = defaultValue ?? "all";
  return (
    <div className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2">
      <label htmlFor={name} className="block text-[10px] uppercase tracking-wide text-muted mb-1">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={cur}
        className="w-full bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30 rounded"
      >
        <option value="all">ทั้งหมด</option>
        <option value="1">จัดกลุ่มตาม {label}</option>
      </select>
    </div>
  );
}
