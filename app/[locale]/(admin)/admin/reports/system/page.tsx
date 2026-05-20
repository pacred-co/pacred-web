import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin > "รายงานการเข้าถึงเว็บ" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/report-system.php`
 * (L1-980), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 —
 * admin pattern). Upgraded from P0.5 v1 stub.
 *
 * The legacy `report-system.php` is the SYSTEM-ACCESS report. It
 * is NOT a "report hub with 4 sub-cards" — that was the v1 stub's
 * incorrect framing. The page is a single inline report against
 * `tb_web_hs` (the web hit-log) that renders:
 *
 *   1. Filter form (L67-122) — date range + device-type filter +
 *      4 "group-by" toggles (ip / userID / sessionID / userAgent).
 *   2. Detail log (L123-225) — 10-column DataTable of every hit
 *      matching the filter (datetime / IP / device / OS / browser /
 *      load-time / page-name / userID / session_id / user_agent).
 *   3. SIX chart cards in a 2-column grid (L226-441):
 *      a. จำนวนการใช้งานรายวัน         — area chart (L229-251)
 *      b. ชื่อหน้าเว็บที่มีคนเข้าถึง 20 อันดับ — bar  (L254-289)
 *      c. ชื่อหน้าเว็บโหลดช้าสุด 20 อันดับ    — bar  (L291-326)
 *      d. สมาชิกที่ใช้งานระบบ 20 อันดับ      — bar  (L328-363)
 *      e. ประเภทอุปกรณ์ที่เข้าถึง          — pie  (L365-400)
 *      f. ชนิดของ Browser ที่เข้าถึง       — doughnut (L402-437)
 *
 * Sub-reports listed in the v1 stub (`report-api-cn.php` /
 * `report-search.php` / `report-api-sms.php` / `report-otp.php`)
 * are SEPARATE legacy files reached from the sidebar — they are
 * not children of this page. Their faithful ports land as their
 * own pilots in a later batch; this stub had them grouped by
 * mistake. The 4-card stub grid is removed.
 *
 * The JSX below is the exact HTML structure `report-system.php`
 * renders — same Bootstrap-4 markup, same elements, same labels
 * (Thai hardcoded), same column order. Visual identity comes from
 * the shared admin chrome (`admin-base.css`) plus a small
 * page-specific stylesheet (`reports-system.css`) carrying the
 * inline <style> block at L9-40 + the chart-fallback wrapper
 * styling, both loaded via plain `<link rel="stylesheet">` so
 * they bypass the app's Tailwind v4 / PostCSS pipeline (the rule
 * da4cd79 set).
 *
 * `report-system.php` source structure transcribed here:
 *   - Title bar      L5
 *   - Inline <style> L9-40   → extracted to reports-system.css
 *   - Filter form    L65-122 (card2 wrapper + 6 inputs)
 *   - Filter helper  L106-120 (sql_action + sql_group_by build)
 *   - Detail table   L123-225
 *   - Chart card a   L226-252 (area — daily views, count_by_date)
 *   - Chart card b   L254-289 (bar — top-20 pages by hit count)
 *   - Chart card c   L291-326 (bar — slowest-20 pages by avg load)
 *   - Chart card d   L328-363 (bar — top-20 users by hit count)
 *   - Chart card e   L365-400 (pie — device-type breakdown)
 *   - Chart card f   L402-437 (doughnut — browser breakdown)
 *
 * Data — every `report-system.php` mysqli query transcribed 1:1
 * to the ported legacy `tb_*` schema (Supabase, migration 0081).
 * `tb_*` is RLS-locked to service_role so reads go through the
 * admin client. All seven SQL statements run against `tb_web_hs`
 * (the legacy web-hit log).
 *   - sql_Table1     → detail rows  (L132)
 *   - sql_top20_pages → top-20 pages by count(page_name) (L274)
 *   - sql_low20_pages → slowest-20 by avg load_time (L311)
 *   - sql_topuser20  → top-20 userIDs by hit count (L348)
 *   - sql_device     → device count breakdown (L385)
 *   - sql_browser    → browser count breakdown (L422)
 *   - count_by_date  → daily-views series, built JS-side from
 *                      detail-row dates (L186-201 in legacy).
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is implicit (any logged-in admin can view); this is
 * sensitive web-analytics + per-session data so we narrow to
 * `super` only (admin telemetry — the most restrictive sensible
 * gate). Matches the v1 stub.
 *
 * URL filters (transcribed from L54-119) — exposed as search
 * params on this Next.js route with the same query-string shape
 * as the legacy:
 *   ?date=YYYY-MM-DD - YYYY-MM-DD  → date-range filter
 *   ?type=all|1|2|3                → device filter
 *                                    (all/Mobile/Desktop/Unspecified)
 *   ?ip=all|1                      → group-by IP toggle
 *   ?userID=all|1                  → group-by userID toggle
 *   ?sessionID=all|1               → group-by session_id toggle
 *   ?userAgent=all|1               → group-by user_agent toggle
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → admin chrome
 * already drops the "Cargo" suffix; everything else verbatim Thai.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - Chart.js canvases (L243, L269, L306, L343, L380, L417) —
 *     Pacred doesn't ship Chart.js. Each `<canvas>` is replaced
 *     by a static `<table>` fallback inside a same-sized wrapper.
 *     Functional charts are a follow-up (likely a small Chart.js
 *     / Recharts client island per card).
 *   - daterangepicker JS init (L473-488) — date input renders as
 *     plain `<input type="text">`. Date typed manually works.
 *   - DataTables JS init + export buttons (L536-583) — static
 *     markup keeps the wrapper classes; functional sort / export
 *     / per-page is a follow-up.
 *   - `tb_page_name` lookup table (function.php L2713-2720) for
 *     namePageName() page IDs > 29 — inlined as a small fetched
 *     map (one extra IN-clause query) so badge labels render
 *     correctly, mirroring the legacy CONSTANT behaviour.
 *   - The page-load default `<select>` re-selection JS at L489-530
 *     — handled in JSX via `defaultValue` (no client island needed).
 *   - The detail table's "no-sort" template row (L162-173) — that's
 *     a DataTables footer hook that the JS removes + re-injects on
 *     redraw (L533-535, L551). Skipped (no DT JS).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers — inlined from the legacy admin function.php (pure functions only).
// Kept inline because this is a pilot.
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
  "26": "ทำการเติมเงิน",
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
 *  (report-system.php L58, L76). */
function threeDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return isoDate(d);
}

/** Legacy `date("Y-m-d")` — today as YYYY-MM-DD. */
function todayISO(): string {
  return isoDate(new Date());
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
  // Legacy concatenates SQL — we re-implement the semantics:
  //   ?type=1 → device=1 ; ?type=2 → device=2 ; ?type=3 → device='' (legacy
  //   uses empty-string match for "ไม่ระบุ")
  const deviceFilter = sp.type ?? "all";

  // ── Detail rows query (L132) ─────────────────────────────────
  //   SELECT datetime, ip, device, os, browser, load_time, user_agent,
  //          session_id, userID, page_name FROM tb_web_hs
  //   WHERE <sql_action> <sql_date> <sql_group_by1>;
  // Legacy supports a GROUP BY built from the 4 toggles — PostgREST
  // can't express arbitrary GROUP BY without an aggregate column, so
  // the runbook (§3) allows preserving INTENT: we fetch the rows
  // without GROUP BY, then apply distinct-by in JS when toggles are
  // on. The visible effect is identical for the analyst (each
  // distinct combination appears once).
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

  const { data: detailData } = await detailQ;
  const rawHits = (detailData ?? []) as unknown as WebHitRow[];

  // Apply the group-by JS-side (mirrors the legacy GROUP BY semantics).
  const groupByCols: (keyof WebHitRow)[] = [];
  if (sp.ip === "1") groupByCols.push("ip");
  if (sp.userID === "1") groupByCols.push("userid");
  if (sp.sessionID === "1") groupByCols.push("session_id");
  if (sp.userAgent === "1") groupByCols.push("user_agent");

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
  // Legacy runs 5 separate SQL aggregations + 1 JS-side per-day
  // count built from the detail loop. We compute all six in JS
  // off the same detailRows (post-filter) — identical semantics,
  // one round-trip instead of six.

  // (a) count_by_date — per-day hit counts, in the range (L143-201).
  //   Legacy pre-fills the date_array with 0s then walks the detail
  //   rows incrementing per day. Re-implement identically.
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

  // (b) top-20 pages by count (L274). Aggregate by page_name.
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
  // Pull only the page-name IDs we'll actually display (top-20 +
  // slowest-20 + detail rows) above the 29 hardcoded values.
  const usedPageIds = new Set<number>();
  for (const r of rawHits) if (r.page_name != null) usedPageIds.add(r.page_name);
  for (const [k] of top20Pages) usedPageIds.add(k);
  for (const [k] of low20Pages) usedPageIds.add(k);
  const overflowIds = Array.from(usedPageIds).filter((id) => id > 29);
  const pageNameLookup = new Map<number, string>();
  if (overflowIds.length > 0) {
    const { data: pnData } = await admin
      .from("tb_page_name")
      .select("id, pagename")
      .in("id", overflowIds);
    for (const r of (pnData ?? []) as Array<{ id: number; pagename: string }>) {
      pageNameLookup.set(r.id, r.pagename);
    }
  }

  // Input default for the date control — legacy L76 echoes the URL
  // value if set else "-3days - today".
  const dateInputDefault = sp.date ?? `${threeDaysAgo()} - ${todayISO()}`;

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both static assets so
          they bypass Tailwind / PostCSS (the rule da4cd79 set). */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/reports-system.css" />

      {/* BEGIN: Content — report-system.php L45-451 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card2">
                    <div className="card-content">
                      <div className="card-body p-05">
                        {/* ── Filter form — L66-122 ─────────────── */}
                        <div className="row">
                          <div className="card col-12 p-05">
                            <h3 className="d text-center text-md-left d-inline-block">
                              <span className="font-30 ft-users"></span> รายงานการเข้าถึงเว็บ
                            </h3>
                            {/* Method preserved as GET — already GET in legacy. */}
                            <form
                              className="d-inline-block"
                              method="GET"
                              action="/admin/reports/system"
                            >
                              <span className="font-14 text-danger">ผลลัพธ์การค้นหา : </span>
                              <label className="form-control-label" htmlFor="date">
                                วันที่ค้นหา
                              </label>
                              <input
                                type="text"
                                className="form-control2 shawCalRanges"
                                name="date"
                                defaultValue={dateInputDefault}
                              />{" "}
                              <label className="form-control-label" htmlFor="type">
                                ประเภทอุปกรณ์
                              </label>
                              <select
                                name="type"
                                id="type"
                                defaultValue={sp.type ?? "all"}
                              >
                                <option value="all">ทั้งหมด</option>
                                <option value="1">มือถือ</option>
                                <option value="2">คอมพิวเตอร์</option>
                                <option value="3">ไม่ระบุ</option>
                              </select>{" "}
                              <label className="form-control-label" htmlFor="ip">
                                จัดกลุ่ม IP Address
                              </label>
                              <select
                                name="ip"
                                id="ip"
                                defaultValue={sp.ip ?? "all"}
                              >
                                <option value="all">ทั้งหมด</option>
                                <option value="1">IP</option>
                              </select>{" "}
                              <label className="form-control-label" htmlFor="userID">
                                จัดกลุ่ม userID
                              </label>
                              <select
                                name="userID"
                                id="userID"
                                defaultValue={sp.userID ?? "all"}
                              >
                                <option value="all">ทั้งหมด</option>
                                <option value="1">userID</option>
                              </select>{" "}
                              <label className="form-control-label" htmlFor="sessionID">
                                จัดกลุ่ม session_id
                              </label>
                              <select
                                name="sessionID"
                                id="sessionID"
                                defaultValue={sp.sessionID ?? "all"}
                              >
                                <option value="all">ทั้งหมด</option>
                                <option value="1">session id</option>
                              </select>{" "}
                              <label className="form-control-label" htmlFor="userAgent">
                                จัดกลุ่ม user_agent
                              </label>
                              <select
                                name="userAgent"
                                id="userAgent"
                                defaultValue={sp.userAgent ?? "all"}
                              >
                                <option value="all">ทั้งหมด</option>
                                <option value="1">user agent</option>
                              </select>{" "}
                              <button
                                className="btn btn-color-main btn-rounded"
                                type="submit"
                              >
                                <i className="fas fa-search"></i> ค้นหาข้อมูล
                              </button>
                            </form>
                          </div>
                        </div>

                        {/* ── Detail log + 6 chart cards — L123-441 */}
                        <div className="row">
                          {/* Detail log card — L124-225 (display order 3) */}
                          <div className="col-12 order-3 order-md-3 p-0">
                            <div className="card p-05">
                              <h4 className="mb-0">ข้อมูลแบบละเอียด</h4>
                              <div className="table-responsive">
                                <table
                                  id="myTable"
                                  className="table display table-bordered table-striped dataTable no-footer dtr-inlind"
                                >
                                  <thead>
                                    <tr className="text-center bg-white">
                                      <th>วันที่ค้นหา</th>
                                      <th>IP Address</th>
                                      <th>ประเภทอุปกรณ์</th>
                                      <th>ระบบปฏิบัติการ</th>
                                      <th>Browser</th>
                                      <th>เวลาโหลดหน้านี้ (วินาที)</th>
                                      <th>ชื่อหน้า</th>
                                      <th>userID</th>
                                      <th>session_id</th>
                                      <th>user_agent</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailRows.map((row, i) => (
                                      <tr key={`${i}-${row.session_id ?? ""}-${row.datetime ?? ""}`}>
                                        <td className="font-12">{row.datetime ?? ""}</td>
                                        <td>{row.ip ?? ""}</td>
                                        <td className="text-center">
                                          {nameGetDevice(row.device)}
                                        </td>
                                        <td className="text-center">
                                          {nameGetOS(row.os)}
                                        </td>
                                        <td className="text-center">
                                          {nameBrowserName(row.browser)}
                                        </td>
                                        <td className="text-right">{row.load_time ?? ""}</td>
                                        <td>{namePageName(row.page_name, pageNameLookup)}</td>
                                        <td>
                                          {row.userid ? (
                                            <Link
                                              href={`/admin/users/profile/${row.userid}`}
                                              target="_blank"
                                            >
                                              {row.userid}
                                            </Link>
                                          ) : null}
                                        </td>
                                        <td className="font-12">{row.session_id ?? ""}</td>
                                        <td className="font-12">{row.user_agent ?? ""}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          {/* 6 chart cards — L226-441 (display order 1) */}
                          <div className="col-12 order-1 order-md-1 p-0">
                            <div className="row">
                              {/* (a) จำนวนการใช้งานรายวัน — area chart fallback */}
                              <div className="col-md-6">
                                <div className="card">
                                  <div className="card-header">
                                    <h4 className="mb-0">จำนวนการใช้งานรายวัน</h4>
                                    <a className="heading-elements-toggle">
                                      <i className="la la-ellipsis-v font-medium-3"></i>
                                    </a>
                                    <div className="heading-elements">
                                      <ul className="list-inline mb-0">
                                        <li>
                                          <a data-action="collapse">
                                            <i className="ft-minus"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="reload">
                                            <i className="ft-rotate-cw"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="expand">
                                            <i className="ft-maximize"></i>
                                          </a>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="card-content collapse show">
                                    <div className="card-body chartjs">
                                      <div
                                        id="area-chart"
                                        className="report-chart-fallback"
                                      >
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>วันที่</th>
                                              <th>จำนวนการเข้าชม</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {Array.from(countByDate.entries()).map(
                                              ([d, n]) => (
                                                <tr key={d}>
                                                  <td>{d}</td>
                                                  <td>{n}</td>
                                                </tr>
                                              ),
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* (b) ชื่อหน้าเว็บที่มีคนเข้าถึงมากสุด 20 อันดับแรก */}
                              <div className="col-md-6">
                                <div className="card">
                                  <div className="card-header">
                                    <h4 className="mb-0">
                                      ชื่อหน้าเว็บที่มีคนเข้าถึงมากสุด 20 อันดับแรก
                                    </h4>
                                    <a className="heading-elements-toggle">
                                      <i className="la la-ellipsis-v font-medium-3"></i>
                                    </a>
                                    <div className="heading-elements">
                                      <ul className="list-inline mb-0">
                                        <li>
                                          <a data-action="collapse">
                                            <i className="ft-minus"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="reload">
                                            <i className="ft-rotate-cw"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="expand">
                                            <i className="ft-maximize"></i>
                                          </a>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="card-content collapse show">
                                    <div className="card-body chartjs">
                                      <div
                                        id="top-pages-chart"
                                        className="report-chart-fallback"
                                      >
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>ชื่อหน้าเว็บ</th>
                                              <th>จำนวนครั้ง</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {top20Pages.map(([pid, n]) => (
                                              <tr key={pid}>
                                                <td>
                                                  {namePageName(pid, pageNameLookup)}
                                                </td>
                                                <td>{n}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* (c) ชื่อหน้าเว็บโหลดช้าสุด 20 อันดับแรก */}
                              <div className="col-md-6">
                                <div className="card">
                                  <div className="card-header">
                                    <h4 className="mb-0">
                                      ชื่อหน้าเว็บโหลดช้าสุด 20 อันดับแรก
                                    </h4>
                                    <a className="heading-elements-toggle">
                                      <i className="la la-ellipsis-v font-medium-3"></i>
                                    </a>
                                    <div className="heading-elements">
                                      <ul className="list-inline mb-0">
                                        <li>
                                          <a data-action="collapse">
                                            <i className="ft-minus"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="reload">
                                            <i className="ft-rotate-cw"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="expand">
                                            <i className="ft-maximize"></i>
                                          </a>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="card-content collapse show">
                                    <div className="card-body chartjs">
                                      <div
                                        id="low-pages-chart"
                                        className="report-chart-fallback"
                                      >
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>ชื่อหน้าเว็บ</th>
                                              <th>เวลาที่ใช้เฉลี่ย (วินาที)</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {low20Pages.map(([pid, avg]) => (
                                              <tr key={pid}>
                                                <td>
                                                  {namePageName(pid, pageNameLookup)}
                                                </td>
                                                <td>{avg.toFixed(4)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* (d) สมาชิกที่ใช้งานระบบมากสุด 20 อันดับแรก */}
                              <div className="col-md-6">
                                <div className="card">
                                  <div className="card-header">
                                    <h4 className="mb-0">
                                      สมาชิกที่ใช้งานระบบมากสุด 20 อันดับแรก
                                    </h4>
                                    <a className="heading-elements-toggle">
                                      <i className="la la-ellipsis-v font-medium-3"></i>
                                    </a>
                                    <div className="heading-elements">
                                      <ul className="list-inline mb-0">
                                        <li>
                                          <a data-action="collapse">
                                            <i className="ft-minus"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="reload">
                                            <i className="ft-rotate-cw"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="expand">
                                            <i className="ft-maximize"></i>
                                          </a>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="card-content collapse show">
                                    <div className="card-body chartjs">
                                      <div
                                        id="topuser-pages-chart"
                                        className="report-chart-fallback"
                                      >
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>รหัสสมาชิก</th>
                                              <th>จำนวนครั้ง</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {top20Users.map(([uid, n]) => (
                                              <tr key={uid}>
                                                <td>{uid}</td>
                                                <td>{n}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* (e) ประเภทอุปกรณ์ที่เข้าถึง — pie chart fallback */}
                              <div className="col-md-6">
                                <div className="card">
                                  <div className="card-header">
                                    <h4 className="mb-0">ประเภทอุปกรณ์ที่เข้าถึง</h4>
                                    <a className="heading-elements-toggle">
                                      <i className="la la-ellipsis-v font-medium-3"></i>
                                    </a>
                                    <div className="heading-elements">
                                      <ul className="list-inline mb-0">
                                        <li>
                                          <a data-action="collapse">
                                            <i className="ft-minus"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="reload">
                                            <i className="ft-rotate-cw"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="expand">
                                            <i className="ft-maximize"></i>
                                          </a>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="card-content collapse show">
                                    <div className="card-body chartjs">
                                      <div
                                        id="type-device-chart"
                                        className="report-chart-fallback"
                                      >
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>อุปกรณ์</th>
                                              <th>จำนวนครั้ง</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {deviceRows.map(([d, n]) => (
                                              <tr key={d}>
                                                <td>{nameGetDevice(d)}</td>
                                                <td>{n}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* (f) ชนิดของ Browser ที่เข้าถึง — doughnut fallback */}
                              <div className="col-md-6">
                                <div className="card">
                                  <div className="card-header">
                                    <h4 className="mb-0">ชนิดของ Browser ที่เข้าถึง</h4>
                                    <a className="heading-elements-toggle">
                                      <i className="la la-ellipsis-v font-medium-3"></i>
                                    </a>
                                    <div className="heading-elements">
                                      <ul className="list-inline mb-0">
                                        <li>
                                          <a data-action="collapse">
                                            <i className="ft-minus"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="reload">
                                            <i className="ft-rotate-cw"></i>
                                          </a>
                                        </li>
                                        <li>
                                          <a data-action="expand">
                                            <i className="ft-maximize"></i>
                                          </a>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="card-content collapse show">
                                    <div className="card-body chartjs">
                                      <div
                                        id="type-browser-chart"
                                        className="report-chart-fallback"
                                      >
                                        <table>
                                          <thead>
                                            <tr>
                                              <th>Browser</th>
                                              <th>จำนวนครั้ง</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {browserRows.map(([b, n]) => (
                                              <tr key={b}>
                                                <td>{nameBrowserName(b)}</td>
                                                <td>{n}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
