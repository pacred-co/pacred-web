import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Search, Truck, Ship, Plane, Check, Home, Anchor, FileText, PackageCheck, Box, ChevronRight } from "lucide-react";
import { type ForwarderRow } from "../forwarder-row-view";

// ── Pure helpers (server-safe duplicates of the ones in forwarder-row-view,
//    which is a "use client" module). Copy-paste because the originals can't
//    cross the server boundary; extract to a shared util file when more
//    server callers need them.

/** Legacy `calPriceForwarderSumCompany($fUserCompany, ...)` — function.php L1384-1392. */
function calPriceForwarderSumCompany(
  fUserCompany: string | null,
  fPriceUpdate: number,
  fTotalPrice: number,
  fTransportPrice: number,
  fShippingService: number,
  fDiscount: number,
  priceCrate: number,
  fTransportPriceChnThb: number,
  priceOther: number,
): number {
  let p =
    fPriceUpdate + fTotalPrice + fTransportPrice + fShippingService +
    priceCrate + fTransportPriceChnThb + priceOther - fDiscount;
  if (fUserCompany === "1") p = p - p * 0.01;
  return p;
}

/** Legacy `convertIMGCHN($url,$size)` — function.php L1414-1437. */
function convertIMGCHN(url: string | null, size: string): string {
  if (!url || url === "") return "/legacy/pcs/shops/default.png";
  let u = url
    .replace("?x-oss-process=style/alsy", "")
    .replace("?x-oss-process=style/tbsy", "")
    .replace("_250x250.jpg", "");
  if (u.includes("/")) {
    if (/pcscargo\.co\.th/.test(u)) return u;
    return u + size;
  }
  u = `https://pcscargo.co.th/member/images/shops/${u}`;
  return u;
}

function dmy(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
import { StageTabs, type Stage } from "./stage-tabs";
import { ContainerCard } from "./container-card";

/**
 * Cargo-LCL tracking page — Tailwind rebuild of ปอน's 2026-05-28
 * mockup (`Downloads/cargo_lcl_tracking_mockup_html.html`), wired to
 * real `tb_forwarder` data. Shared by the 3 mode routes
 * (`truck`/`sea`/`air`), filtered by `fcabinetnumber` prefix:
 *
 *   GZE → รถ   (truck)
 *   GZS → เรือ (sea)
 *   GZA → แอร์ (air)
 *
 * Sections (mockup section order):
 *   1. Search card — track / container / package filter (display-only first pass)
 *   2. 3-stage tabs (Origin / Transit / Destination) + panels with steppers
 *   3. Container cards — one per `fcabinetnumber`, collapsible, with items inside
 */

export type Mode = "truck" | "sea" | "air";

/** Mode metadata. The mode → `ftransporttype` mapping is the authoritative
 *  classification (legacy data has dirty cabinet prefixes — e.g. GZA101 in
 *  2022 actually shipped as sea, with `ftransporttype="2"`; ปอน 2026-05-28
 *  confirmed `ftransporttype` is source of truth, fall back to prefix as a
 *  hint only on new orders).
 *
 *  `prefix` is the cabinet-code prefix this mode WILL use going forward
 *  — currently used in the empty-state copy + as the recommended convention
 *  for new orders. Filter logic queries `ftransporttype`, NOT the prefix.
 */
const MODE_META: Record<Mode, { ttype: string; prefix: string; label: string; chip: string; icon: typeof Truck }> = {
  truck: { ttype: "1", prefix: "GZE", label: "ขนส่งทางรถ",  chip: "bg-blue-100 text-blue-700",   icon: Truck },
  sea:   { ttype: "2", prefix: "GZS", label: "ขนส่งทางเรือ", chip: "bg-sky-100 text-sky-700",     icon: Ship  },
  air:   { ttype: "3", prefix: "GZA", label: "ขนส่งทางอากาศ", chip: "bg-violet-100 text-violet-700", icon: Plane },
};

/** Pick which stage panel is "active" by default given the container's
 *  most-advanced fStatus. fStatus 1-2 → origin, 3 → transit, 4-7 → dest. */
function defaultStageForStatus(s: number): Stage {
  if (s <= 2) return "origin";
  if (s === 3) return "transit";
  return "dest";
}

/** A grouped container — every tb_forwarder row sharing the same
 *  `fcabinetnumber`, plus aggregate metrics for the card header. */
type Container = {
  code: string;
  rows: ForwarderRow[];
  containerClose: string | null;
  toThai: string | null;
  qty: number;
  weight: number;
  cbm: number;
  total: number;
  maxStatus: number;
};

export default async function TrackingPage({
  mode,
  searchParams,
}: {
  mode: Mode;
  searchParams?: Promise<{ step?: string; q?: string; stage?: string }>;
}) {
  const meta = MODE_META[mode];
  const sp = (await searchParams) ?? {};
  // ?step=1..7 → chip filter (status code). Empty = no chip-filter.
  const stepFilter = sp.step ?? "";
  // ?q=... → free-text search across track / cabinet / parcel fields.
  const q = (sp.q ?? "").trim();
  // ?stage=origin|transit|dest → broad stage filter from the search-card
  // select. Empty = "ทั้งหมด".
  const stageFilter = sp.stage ?? "";

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // userCompany flag — needed by calPriceForwarderSumCompany (1% WHT)
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("usercompany")
    .eq("userid", memberCode)
    .maybeSingle<{ usercompany: string | number | null }>();
  const fUserCompany = userRow?.usercompany != null ? String(userRow.usercompany) : null;

  // Pull every tb_forwarder row for this customer whose `ftransporttype`
  // matches the mode (1=รถ, 2=เรือ, 3=แอร์). The cabinet-code prefix is
  // unreliable on legacy data (e.g. 2022 GZA101 records have ftransporttype=2,
  // shipped as sea), so we use `ftransporttype` — set per-order by admin or
  // forwarder workflow — as the authoritative mode classifier.
  const { data: listRows, error: listRowsErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fstatus, ftrackingchn, ftrackingchn2, ftrackingth, ftransporttype, fshipby, fdetail, fcover, famount, fweight, fvolume, ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fusercompany, fcredit, fcreditdate, fdatestatus5, fdatetothai, fcabinetnumber, fdatecontainerclose, fnote, fnoteuser, reforder, adminidcreator",
    )
    .eq("userid", memberCode)
    .eq("ftransporttype", meta.ttype);

  const rows: ForwarderRow[] = ((listRows ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    fdate: (r.fdate as string) ?? null,
    fstatus: (r.fstatus as string) ?? null,
    ftrackingchn: (r.ftrackingchn as string) ?? null,
    ftrackingchn2: (r.ftrackingchn2 as string) ?? null,
    ftrackingth: (r.ftrackingth as string) ?? null,
    ftransporttype: (r.ftransporttype as string) ?? null,
    fshipby: (r.fshipby as string) ?? null,
    fdetail: (r.fdetail as string) ?? null,
    fcover: (r.fcover as string) ?? null,
    famount: Number(r.famount ?? 0),
    fweight: Number(r.fweight ?? 0),
    fvolume: Number(r.fvolume ?? 0),
    ftotalprice: Number(r.ftotalprice ?? 0),
    ftransportprice: Number(r.ftransportprice ?? 0),
    fpriceupdate: Number(r.fpriceupdate ?? 0),
    fdiscount: Number(r.fdiscount ?? 0),
    fshippingservice: Number(r.fshippingservice ?? 0),
    pricecrate: Number(r.pricecrate ?? 0),
    ftransportpricechnthb: Number(r.ftransportpricechnthb ?? 0),
    priceother: Number(r.priceother ?? 0),
    fusercompany: (r.fusercompany as string) ?? null,
    fcredit: (r.fcredit as string) ?? null,
    fcreditdate: (r.fcreditdate as string) ?? null,
    fdatestatus5: (r.fdatestatus5 as string) ?? null,
    fdatetothai: (r.fdatetothai as string) ?? null,
    fcabinetnumber: (r.fcabinetnumber as string) ?? null,
    fdatecontainerclose: (r.fdatecontainerclose as string) ?? null,
    fnote: (r.fnote as string) ?? null,
    fnoteuser: (r.fnoteuser as string) ?? null,
    reforder: (r.reforder as string) ?? null,
    adminidcreator: (r.adminidcreator as string) ?? null,
    promoid: null,
  }));

  // Count rows per fstatus (1..7) — for the clickable step-chip badges.
  // Counts use ALL mode-scoped rows (before the ?step filter so the chip
  // numbers stay stable as the user clicks through filters).
  const countByStatus: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 };
  for (const r of rows) {
    const s = String(r.fstatus ?? "");
    if (s in countByStatus) countByStatus[s] += 1;
  }
  const countAll = rows.length;

  // Apply filters in order: step chip → stage select → free-text search.
  // Counts on the stage panels stay tied to ALL mode rows (above), so chip
  // badges don't shrink while a search or stage filter is active.
  let filteredRows = stepFilter
    ? rows.filter((r) => String(r.fstatus ?? "") === stepFilter)
    : rows;

  if (stageFilter && !stepFilter) {
    const allowed =
      stageFilter === "origin"  ? new Set(["1", "2"]) :
      stageFilter === "transit" ? new Set(["3"]) :
      stageFilter === "dest"    ? new Set(["4", "5", "6", "7"]) :
      null;
    if (allowed) {
      filteredRows = filteredRows.filter((r) => allowed.has(String(r.fstatus ?? "")));
    }
  }

  if (q) {
    const lc = q.toLowerCase();
    filteredRows = filteredRows.filter((r) =>
      (r.ftrackingchn  ?? "").toLowerCase().includes(lc) ||
      (r.ftrackingchn2 ?? "").toLowerCase().includes(lc) ||
      (r.ftrackingth   ?? "").toLowerCase().includes(lc) ||
      (r.fcabinetnumber ?? "").toLowerCase().includes(lc) ||
      String(r.id).includes(lc),
    );
  }

  // Group by container code; sum the per-container aggregates.
  const byContainer = new Map<string, Container>();
  for (const r of filteredRows) {
    const code = (r.fcabinetnumber ?? "").trim();
    if (!code) continue;
    let c = byContainer.get(code);
    if (!c) {
      c = {
        code,
        rows: [],
        containerClose: r.fdatecontainerclose,
        toThai: r.fdatetothai,
        qty: 0,
        weight: 0,
        cbm: 0,
        total: 0,
        maxStatus: 0,
      };
      byContainer.set(code, c);
    }
    c.rows.push(r);
    c.qty += r.famount || 0;
    c.weight += r.fweight || 0;
    c.cbm += r.fvolume || 0;
    c.total += calPriceForwarderSumCompany(
      r.fusercompany,
      r.fpriceupdate,
      r.ftotalprice,
      r.ftransportprice,
      r.fshippingservice,
      r.fdiscount,
      r.pricecrate,
      r.ftransportpricechnthb,
      r.priceother,
    );
    const s = Number(r.fstatus ?? 0);
    if (s > c.maxStatus) c.maxStatus = s;
    if (!c.containerClose && r.fdatecontainerclose) c.containerClose = r.fdatecontainerclose;
    if (!c.toThai && r.fdatetothai) c.toThai = r.fdatetothai;
  }
  const containers = Array.from(byContainer.values()).sort((a, b) => {
    const ta = a.rows[0]?.fdate ? new Date(a.rows[0].fdate.replace(" ", "T")).getTime() : 0;
    const tb = b.rows[0]?.fdate ? new Date(b.rows[0].fdate.replace(" ", "T")).getTime() : 0;
    return tb - ta;
  });

  // Default stage tab priority:
  //   1. `?step` is set → the stage that contains that status (chip filter)
  //   2. `?stage` is set → that stage (search form select)
  //   3. Otherwise → "origin" (the natural starting point of any container's
  //      journey). Mode switch never changes the stage — per ปอน 2026-05-28.
  const initialStage: Stage = stepFilter
    ? defaultStageForStatus(Number(stepFilter))
    : stageFilter === "origin" || stageFilter === "transit" || stageFilter === "dest"
      ? (stageFilter as Stage)
      : "origin";

  // Focus container for the Transit panel's visual stepper (RE → ETD →
  // … → TRANSPORT). The sub-stages don't have their own status codes —
  // we display dates from the most-recent in-transit container so the
  // stepper has SOMETHING concrete to show.
  const focusForTransit = containers.find((c) => c.maxStatus === 3) ?? containers[0] ?? null;

  return (
    <div className="pcs-legacy bg-gradient-to-b from-white to-surface-alt/40 min-h-[calc(100vh-56px)]">
      {/* pcs-content-pad gives md:padding-left:280px (sidebar) +
          padding-right:88px (right rail), and responds to the sidebar
          collapse toggle — see legacy-overrides.css §"Content padding". */}
      <main className="pcs-content-pad max-w-[1488px] mx-auto px-3 md:px-6 py-4 md:py-6">
        {/* Mode header — quick-jump + label */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full ${meta.chip} px-3 py-1 text-sm font-semibold`}>
              <meta.icon className="h-4 w-4" />
              {meta.label}
            </span>
            <span className="text-xs text-muted">เลขตู้ขึ้นต้นด้วย <span className="font-mono font-bold">{meta.prefix}</span></span>
          </div>
          <ModeSwitcher current={mode} />
        </div>

        {/* 1. Search card — GET form posts to `/service-import/{mode}` with
            ?q + ?stage; the page re-renders with filtered rows. RLS keeps
            the query scoped to this user via `userid = profile.member_code`
            on tb_forwarder, so the search can only ever match the user's
            own records. */}
        <form
          action={`/service-import/${mode}`}
          method="GET"
          className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm p-4 md:p-5 mb-4 grid grid-cols-1 md:grid-cols-[1.15fr_.85fr_auto] gap-3 md:gap-5 items-end"
        >
          <div>
            <label className="flex items-center gap-1.5 text-[15px] font-bold text-foreground mb-2">
              ค้นหา Track / เลขตู้
              <span className="w-4 h-4 grid place-items-center rounded-full border border-border text-muted text-[10px] font-bold" title="ค้นหาจาก: CN Track · เลขตู้ · เลขพัสดุ TH · เลข order (#)">?</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="กรอก Track / เลขตู้ / เลขพัสดุ"
                className="w-full h-[52px] rounded-xl border border-border bg-white dark:bg-surface pl-11 pr-4 text-[15px] text-foreground outline-none focus:border-red-300 focus:shadow-[0_0_0_3px_#fef2f2] transition-all"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[15px] font-bold text-foreground mb-2">ตัวกรองเพิ่มเติม</label>
            <select
              name="stage"
              defaultValue={stageFilter}
              className="w-full h-[52px] rounded-xl border border-border bg-white dark:bg-surface px-4 text-[15px] text-foreground outline-none"
            >
              <option value="">ทั้งหมด</option>
              <option value="origin">ต้นทาง</option>
              <option value="transit">ระหว่างทางขนส่ง</option>
              <option value="dest">ปลายทาง</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-[52px] px-6 rounded-xl bg-gradient-to-b from-red-600 to-red-700 text-white text-base font-extrabold shadow-md shadow-red-600/20 hover:from-red-700 hover:to-red-800 active:scale-[0.98] transition-all"
          >
            ค้นหารายการ
          </button>
        </form>

        {/* 2. Stage tabs + panels — each panel is a row of clickable
            filter chips. URL `?step=<status>` filters the container list. */}
        <StageTabs
          initial={initialStage}
          originPanel={
            <OriginPanel mode={mode} stepFilter={stepFilter} counts={countByStatus} />
          }
          transitPanel={
            <TransitPanel mode={mode} stepFilter={stepFilter} counts={countByStatus} focus={focusForTransit} />
          }
          destPanel={
            <DestPanel mode={mode} stepFilter={stepFilter} counts={countByStatus} />
          }
        />

        {/* Filter pill — visible when ANY of step / q / stage is active. */}
        {(stepFilter || q || stageFilter) && (
          <div className="mt-3 flex items-center justify-between mx-2 md:mx-4 px-4 py-2 rounded-xl bg-surface-alt/60 border border-border text-sm flex-wrap gap-2">
            <span className="text-foreground flex items-center flex-wrap gap-x-3 gap-y-1">
              <span className="text-muted">กำลังกรอง:</span>
              {stepFilter && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-border px-2.5 py-0.5">
                  <span className="font-bold">{statusLabel(stepFilter)}</span>
                  <span className="text-muted">({countByStatus[stepFilter] ?? 0})</span>
                </span>
              )}
              {stageFilter && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-border px-2.5 py-0.5">
                  <span className="font-bold">{STAGE_LABEL[stageFilter] ?? stageFilter}</span>
                </span>
              )}
              {q && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-border px-2.5 py-0.5">
                  <span className="text-muted">ค้นหา:</span>
                  <span className="font-bold">&ldquo;{q}&rdquo;</span>
                </span>
              )}
            </span>
            <Link
              href={`/service-import/${mode}`}
              className="text-red-600 font-semibold hover:underline"
            >
              ล้างตัวกรอง ✕
            </Link>
          </div>
        )}

        {/* 3. Container cards */}
        <div className="mt-4">
          {containers.length === 0 ? (
            <div className="mx-2 md:mx-4 rounded-2xl border border-dashed border-border bg-surface-alt/40 px-6 py-12 text-center text-muted">
              <Box className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {q ? (
                  <>ไม่พบรายการที่ตรงกับ <span className="font-semibold">&ldquo;{q}&rdquo;</span></>
                ) : stepFilter ? (
                  <>ยังไม่มีรายการในสถานะ <span className="font-semibold">{statusLabel(stepFilter)}</span></>
                ) : stageFilter ? (
                  <>ยังไม่มีรายการในช่วง <span className="font-semibold">{STAGE_LABEL[stageFilter] ?? stageFilter}</span></>
                ) : (
                  <>ยังไม่มีตู้สำหรับโหมด {meta.label} (เลขตู้ขึ้นต้นด้วย <span className="font-mono font-bold">{meta.prefix}</span>)</>
                )}
              </p>
              <Link href="/service-import/add" className="inline-block mt-3 text-red-600 font-semibold hover:underline">+ เพิ่มรายการนำเข้า</Link>
            </div>
          ) : (
            containers.map((c) => <ContainerView key={c.code} container={c} userCompany={fUserCompany} />)
          )}
        </div>

        {/* Total summary — visible when there are >1 containers */}
        {containers.length > 1 && (
          <div className="mx-2 md:mx-4 mt-1 text-sm text-muted text-right">
            รวม {containers.length} ตู้ · {countAll} รายการ (ไม่กรอง)
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Mode switcher chips ───────────────────────────────────────────── */

function ModeSwitcher({ current }: { current: Mode }) {
  const items: { mode: Mode; label: string; icon: typeof Truck }[] = [
    { mode: "truck", label: "รถ", icon: Truck },
    { mode: "sea", label: "เรือ", icon: Ship },
    { mode: "air", label: "แอร์", icon: Plane },
  ];
  return (
    <div className="inline-flex items-center rounded-full bg-surface-alt p-1 text-sm">
      {items.map((it) => {
        const active = it.mode === current;
        return (
          <Link
            key={it.mode}
            href={`/service-import/${it.mode}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition-colors ${
              active ? "bg-white shadow-sm text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <it.icon className="h-3.5 w-3.5" />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ── Stage panels — clickable status-filter chips ──────────────────── */
//
// Each chip is a Link that toggles `?step=<status>` on the URL: when the
// chip's status matches the active filter, it renders "filled" (solid
// stage-colour bg, white icon); otherwise it renders "muted" (white bg
// with a stage-tinted icon). Every chip carries a count badge driven by
// `countByStatus`.
//
// Statuses → chips:
//   1 → รอเข้าโกดังจีน        (Origin)
//   2 → ถึงโกดังจีนแล้ว       (Origin)
//   3 → กำลังส่งมาไทย         (Transit)
//   4 → ถึงไทยแล้ว           (Dest)
//   5 → รอชำระเงิน           (Dest)
//   6 → เตรียมจัดส่ง         (Dest)
//   7 → ส่งแล้ว              (Dest)
// (Status "6.1" = "กำลังจัดส่ง" — driven by tb_forwarder_driver_item;
//  added in a v2 when we re-wire the legacy out-for-delivery filter.)

const STATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมจัดส่ง",
  "7": "ส่งแล้ว",
};
function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? `สถานะ ${s}`;
}

const STAGE_LABEL: Record<string, string> = {
  origin: "ต้นทาง (ร้านค้า → โกดังจีน)",
  transit: "ระหว่างทางขนส่ง (ตู้)",
  dest: "ปลายทาง (โกดังไทย → บ้านลูกค้า)",
};

/** Per-status chip tone — mirrors the stage colour so a container's status
 *  breakdown chips line up visually with the stage tabs above them. */
const STATUS_CHIP_TONE: Record<string, string> = {
  "1": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "2": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "3": "bg-sky-50 text-sky-700 border-sky-200",
  "4": "bg-orange-50 text-orange-700 border-orange-200",
  "5": "bg-red-50 text-red-700 border-red-200",
  "6": "bg-orange-100 text-orange-700 border-orange-200",
  "7": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

type Tone = "emerald" | "sky" | "orange";

const TONE_FILLED: Record<Tone, string> = {
  emerald: "bg-emerald-600 text-white shadow-md ring-4 ring-emerald-200",
  sky: "bg-sky-600 text-white shadow-md ring-4 ring-sky-200",
  orange: "bg-orange-500 text-white shadow-md ring-4 ring-orange-200",
};

const TONE_MUTED: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100",
  sky: "bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100",
  orange: "bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100",
};

const PANEL_FRAME: Record<Tone, string> = {
  emerald: "border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white",
  sky: "border-sky-200 bg-gradient-to-b from-sky-50/60 to-white",
  orange: "border-orange-200 bg-gradient-to-b from-orange-50/60 to-white",
};

function StepChip({
  mode,
  status,
  tone,
  icon,
  title,
  desc,
  active,
  count,
}: {
  mode: Mode;
  status: string;
  tone: Tone;
  icon: ReactNode;
  title: string;
  desc?: string;
  active: boolean;
  count: number;
}) {
  // Active chip stays on the same URL with the same `?step=` — clicking it
  // again would do nothing, so when active link back to the unfiltered route
  // (acts as a "deselect"). Inactive chip applies the filter.
  const href = active ? `/service-import/${mode}` : `/service-import/${mode}?step=${status}`;
  return (
    <Link
      href={href}
      aria-pressed={active}
      className="text-center min-w-0 relative group focus:outline-none"
    >
      <div className="relative inline-block">
        <div
          className={`w-11 h-11 md:w-12 md:h-12 rounded-full grid place-items-center font-extrabold mb-2 mx-auto transition-all ${
            active ? TONE_FILLED[tone] : TONE_MUTED[tone]
          }`}
        >
          {icon}
        </div>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-extrabold grid place-items-center shadow-sm">
            {count}
          </span>
        )}
      </div>
      <div className={`text-[12px] md:text-sm font-extrabold leading-tight mb-1 ${active ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"}`}>
        {title}
      </div>
      {desc && <div className="text-[12px] text-muted leading-tight">{desc}</div>}
    </Link>
  );
}

function OriginPanel({
  mode,
  stepFilter,
  counts,
}: {
  mode: Mode;
  stepFilter: string;
  counts: Record<string, number>;
}) {
  return (
    <div className={`mx-2 mb-4 md:mx-4 rounded-2xl border ${PANEL_FRAME.emerald} p-5 md:p-6 shadow-sm`}>
      <div className="grid grid-cols-2 gap-6 md:gap-12">
        <StepChip
          mode={mode}
          status="1"
          tone="emerald"
          icon={<Home className="h-5 w-5" />}
          title="รอเข้าโกดังจีน"
          desc="ร้านค้าส่งสินค้า / รอรับเข้าโกดัง"
          active={stepFilter === "1"}
          count={counts["1"] ?? 0}
        />
        <StepChip
          mode={mode}
          status="2"
          tone="emerald"
          icon={<Check className="h-5 w-5" />}
          title="ถึงโกดังจีนแล้ว"
          desc="สินค้าเข้าโกดังจีนเรียบร้อย"
          active={stepFilter === "2"}
          count={counts["2"] ?? 0}
        />
      </div>
    </div>
  );
}

function calcDays(a: string, b: string): number {
  const da = new Date(a.replace(" ", "T")).getTime();
  const db = new Date(b.replace(" ", "T")).getTime();
  if (!da || !db) return 0;
  return Math.max(0, Math.round((db - da) / 86400000));
}

/** Clickable sub-stage chip for Transit panel — all 7 sub-stages share
 *  the same `fstatus=3` filter (legacy schema has no per-milestone status
 *  code), so they all link to `?step=3`. The count badge shows the total
 *  in-transit containers — same number on each chip. Optional date (e.g.
 *  for RE / ETA) renders below the title. */
function TransitSubChip({
  mode,
  active,
  count,
  icon,
  title,
  desc,
  date,
}: {
  mode: Mode;
  active: boolean;
  count: number;
  icon: ReactNode;
  title: string;
  desc?: string;
  date?: string;
}) {
  const href = active ? `/service-import/${mode}` : `/service-import/${mode}?step=3`;
  return (
    <Link
      href={href}
      aria-pressed={active}
      className="text-center min-w-0 relative group focus:outline-none"
    >
      <div className="relative inline-block">
        <div
          className={`w-11 h-11 md:w-12 md:h-12 rounded-full grid place-items-center mb-2 mx-auto transition-all ${
            active ? TONE_FILLED.sky : TONE_MUTED.sky
          }`}
        >
          {icon}
        </div>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-extrabold grid place-items-center shadow-sm">
            {count}
          </span>
        )}
      </div>
      <div className={`text-[12px] md:text-sm font-extrabold leading-tight mb-1 ${active ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"}`}>
        {title}
      </div>
      {desc && <div className="text-[12px] text-muted leading-tight">{desc}</div>}
      {date && <div className="text-[12px] mt-1 font-semibold notranslate">{date}</div>}
    </Link>
  );
}

function TransitPanel({
  mode,
  stepFilter,
  counts,
  focus,
}: {
  mode: Mode;
  stepFilter: string;
  counts: Record<string, number>;
  focus: Container | null;
}) {
  const closeDate = focus?.containerClose ? dmy(focus.containerClose) : undefined;
  const etaDate = focus?.toThai ? dmy(focus.toThai) : undefined;
  const transitCount = counts["3"] ?? 0;
  const active = stepFilter === "3";

  return (
    <div className={`mx-2 mb-4 md:mx-4 rounded-2xl border ${PANEL_FRAME.sky} p-5 md:p-6 shadow-sm`}>
      {/* 7-step clickable stepper — all sub-stages share fstatus=3 filter */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-5 md:gap-2">
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<Box className="h-5 w-5" />}      title="RE (ปิดตู้/คืนตู้)" date={closeDate} />
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<Ship className="h-5 w-5" />}     title="ETD" />
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<Anchor className="h-5 w-5" />}   title="TRANSHIP / DIRECT" />
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<Anchor className="h-5 w-5" />}   title="TRANSIT" />
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<Box className="h-5 w-5" />}      title="ETA" date={etaDate} />
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<FileText className="h-5 w-5" />} title="CUSTOMS" />
        <TransitSubChip mode={mode} active={active} count={transitCount} icon={<Truck className="h-5 w-5" />}    title="TRANSPORT" />
      </div>
      {/* T/T pill moved to each container card per ปอน 2026-05-28 —
          counted only when the container has arrived (maxStatus >= 4).
          See `<ContainerView>` below. */}
    </div>
  );
}

function DestPanel({
  mode,
  stepFilter,
  counts,
}: {
  mode: Mode;
  stepFilter: string;
  counts: Record<string, number>;
}) {
  return (
    <div className={`mx-2 mb-4 md:mx-4 rounded-2xl border ${PANEL_FRAME.orange} p-5 md:p-6 shadow-sm`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-4">
        <StepChip
          mode={mode} status="4" tone="orange"
          icon={<Check className="h-5 w-5" />}
          title="ถึงไทยแล้ว"
          active={stepFilter === "4"}
          count={counts["4"] ?? 0}
        />
        <StepChip
          mode={mode} status="5" tone="orange"
          icon={<FileText className="h-5 w-5" />}
          title="รอชำระเงิน"
          active={stepFilter === "5"}
          count={counts["5"] ?? 0}
        />
        <StepChip
          mode={mode} status="6" tone="orange"
          icon={<Box className="h-5 w-5" />}
          title="เตรียมจัดส่ง"
          active={stepFilter === "6"}
          count={counts["6"] ?? 0}
        />
        <StepChip
          mode={mode} status="7" tone="orange"
          icon={<PackageCheck className="h-5 w-5" />}
          title="ส่งแล้ว"
          active={stepFilter === "7"}
          count={counts["7"] ?? 0}
        />
      </div>
    </div>
  );
}

/* ── Container card (the collapsible block under the tabs) ────────── */

function ContainerView({
  container,
  userCompany,
}: {
  container: Container;
  userCompany: string | null;
}) {
  // Transport-type label from real DB column `ftransporttype` on the first
  // row (matches the mode-level filter that grouped this container). Avoid
  // hardcoded ports — legacy schema has no port-of-loading / port-of-
  // discharge columns, so we don't fabricate Shekou / Laem Chabang etc.
  const transportType = container.rows[0]?.ftransporttype ?? "";
  const transportLabel =
    transportType === "1" ? "ขนส่งทางรถ" :
    transportType === "2" ? "ขนส่งทางเรือ" :
    transportType === "3" ? "ขนส่งทางอากาศ" :
    "รอตรวจสอบ";

  // T/T (Transit Time) per container — count days from container-close to
  // ETA. Per ปอน 2026-05-28: only count when the container has actually
  // ARRIVED (maxStatus >= 4 means at least one item passed สถานะ "ถึงไทย").
  // While still in transit (maxStatus <= 3), the trip isn't finished so a
  // T/T number would be misleading.
  const hasArrived = container.maxStatus >= 4;
  const ttDays =
    hasArrived && container.containerClose && container.toThai
      ? calcDays(container.containerClose, container.toThai)
      : null;

  // Status breakdown for this container — count items per fstatus inside
  // this container only (the page-level countByStatus is mode-wide). Helps
  // a searching user see at a glance which statuses live in the container.
  const containerCounts: Record<string, number> = {};
  for (const r of container.rows) {
    const s = String(r.fstatus ?? "");
    if (!s) continue;
    containerCounts[s] = (containerCounts[s] ?? 0) + 1;
  }
  const statusEntries = Object.entries(containerCounts).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <ContainerCard
      defaultOpen
      header={
        <div className="grid grid-cols-1 md:grid-cols-[auto_1.3fr_1.1fr_repeat(4,minmax(0,.85fr))] items-center gap-4 md:gap-6">
          <div className="w-14 h-14 rounded-full bg-sky-50 grid place-items-center text-sky-600 shrink-0">
            <Box className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-extrabold leading-tight mb-1 truncate">
              {container.code}
              <span className="inline-flex ml-2 align-middle bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 text-[11px] font-bold">
                {container.rows.length} รายการ
              </span>
            </h2>
            <p className="text-xs md:text-sm text-muted">
              Track: <span className="font-mono">{container.rows[0]?.ftrackingchn ?? "—"}</span>
            </p>
            {/* Status breakdown chips — one per fstatus present in this
                container, with the item count. Lets a searching user see
                at a glance which statuses live in this container. */}
            {statusEntries.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {statusEntries.map(([s, n]) => (
                  <span key={s} className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 border ${STATUS_CHIP_TONE[s] ?? "bg-surface-alt text-foreground border-border"}`}>
                    {statusLabel(s)}
                    <span className="bg-white/70 rounded-full px-1 text-[10px] font-bold">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm md:text-base font-extrabold">จีน → ไทย</div>
            <p className="text-xs md:text-sm text-muted">{transportLabel}</p>
            {/* T/T pill — counted only when the container has arrived. */}
            {ttDays !== null && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                T/T (Transit Time): <span className="text-sm">{ttDays} วัน</span>
              </p>
            )}
          </div>
          <Metric label="จำนวนรวม" value={`${container.qty} ชิ้น`} />
          <Metric label="น้ำหนักรวม" value={`${numberFormat2(container.weight)} kg`} />
          <Metric label="CBM รวม" value={`${numberFormat2(container.cbm)} CBM`} />
          <Metric label="ยอดรวม" value={`${numberFormat2(container.total)} บ.`} totalTone />
        </div>
      }
      items={
        <div className="bg-surface-alt/40 border border-border rounded-2xl p-3 md:p-4">
          <p className="text-sm font-semibold text-muted mb-3 px-1">
            รายการสินค้าในตู้คอนเทนเนอร์นี้ ({container.rows.length} รายการ)
          </p>
          <div className="space-y-2">
            {container.rows.map((row) => (
              <ContainerItemRow key={row.id} row={row} userCompany={userCompany} />
            ))}
          </div>
        </div>
      }
    />
  );
}

function Metric({
  label,
  value,
  totalTone = false,
}: {
  label: string;
  value: string;
  totalTone?: boolean;
}) {
  return (
    <div className="min-w-0 md:border-l border-border md:pl-4">
      <span className="block text-xs md:text-sm text-muted">{label}</span>
      <strong className={`block text-sm md:text-lg font-extrabold notranslate ${totalTone ? "text-red-600 text-lg md:text-2xl" : ""}`}>
        {value}
      </strong>
    </div>
  );
}

function ContainerItemRow({
  row,
  userCompany,
}: {
  row: ForwarderRow;
  userCompany: string | null;
}) {
  const net = calPriceForwarderSumCompany(
    userCompany,
    row.fpriceupdate,
    row.ftotalprice,
    row.ftransportprice,
    row.fshippingservice,
    row.fdiscount,
    row.pricecrate,
    row.ftransportpricechnthb,
    row.priceother,
  );
  const trackingChn = row.ftrackingchn2 || row.ftrackingchn;
  return (
    <div className="bg-white dark:bg-surface border border-border rounded-xl p-3 grid grid-cols-[72px_minmax(0,1.3fr)_repeat(4,minmax(0,.7fr))_minmax(0,.9fr)_auto] md:items-center gap-3 md:gap-4 shadow-sm">
      {/* Thumbnail */}
      <a href={convertIMGCHN(row.fcover, "")} className="image-popup-vertical-fit block shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={convertIMGCHN(row.fcover, "_80x80.jpg")}
          alt=""
          className="w-[72px] h-[72px] rounded-lg object-cover border border-border bg-surface-alt"
          width={72}
          height={72}
        />
      </a>
      {/* Main */}
      <div className="min-w-0">
        <h3 className="text-base md:text-lg font-extrabold leading-tight mb-1 truncate">
          #{row.id}
          <span className="inline-flex ml-2 align-middle bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-bold">
            สถานะ {row.fstatus ?? "—"}
          </span>
        </h3>
        <p className="text-xs md:text-sm text-muted truncate">
          CN Track: <span className="font-mono">{trackingChn ?? "—"}</span>
        </p>
        <p className="text-xs md:text-sm text-muted truncate">
          เลขที่ตู้: <span className="font-mono">{row.fcabinetnumber ?? "—"}</span>
        </p>
      </div>
      <ItemCell label="วันที่รับเข้าโกดังจีน" value={row.fdatecontainerclose ? dmy(row.fdatecontainerclose) : (row.fdate ? dmy(row.fdate) : "—")} />
      <ItemCell label="จำนวน" value={`${row.famount || 0} กล่อง`} />
      <ItemCell label="น้ำหนัก" value={`${numberFormat2(row.fweight || 0)} kg`} />
      <ItemCell label="CBM" value={numberFormat2(row.fvolume || 0)} />
      <div>
        <div className="text-xs text-muted">ยอดเงิน</div>
        <div className="text-base md:text-lg font-extrabold text-red-600 notranslate">{numberFormat2(net)} บ.</div>
      </div>
      <div className="flex justify-end gap-2 md:col-auto col-span-full">
        <Link
          href={`/service-import/${row.id}`}
          className="inline-flex items-center h-9 px-3 rounded-lg border border-border bg-white text-sm font-bold hover:bg-surface-alt transition-colors"
        >
          ดูรายละเอียด
        </Link>
        {(row.fstatus === "5" || row.fcredit === "1") && (
          <Link
            href={`/service-import/${row.id}?pay=true`}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 active:scale-[0.98] transition-all shadow-sm"
          >
            ชำระเงิน <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function ItemCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm md:text-base font-bold text-foreground truncate notranslate">{value}</div>
    </div>
  );
}
