/**
 * /admin/forwarders/container-cost-check — เช็คต้นทุนตู้ Sheet (LANE A).
 *
 * Faithful port of legacy `pcs-admin/check-sang-cost.php`. Reads แสง's
 * container-cost Google Sheet
 * (`13ufkMUoYGnz9sm4gQXiaFp9G6Lx1mRR9to0rqEVK0FA` tab `main`), extracts
 * the distinct container names, matches them vs the distinct
 * `tb_forwarder.fcabinetnumber` set, and renders the worklist table:
 *   ลำดับ · ชื่อตู้จาก Sheet · สถานะข้อมูล (พบ/ไม่พบ) ·
 *   สถานะการเช็ค Sheet · จำนวนรายการใน Sheet
 * Each found container links to `/admin/report-cnt/{cnt}?action=cost-update`
 * (the per-parcel Sheet-vs-PCS diff + apply page).
 *
 * Data source: the `container_cost_sheet_cache` table (refreshed by the
 * `/api/cron/sync-container-cost-sheet` cron every 20 min) for a FAST,
 * always-fresh read. When the cache is empty (cron hasn't run yet) we
 * fall back to a live sheet fetch so the page still works on day one.
 * If the Sheets service-account env is unconfigured, we show a clear
 * banner instead of crashing (graceful degrade).
 *
 * Auth — super | ops | accounting (money-tier). Warehouse excluded
 * (cost reconciliation is a money surface).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { fetchContainerCostSheet } from "@/lib/integrations/google-sheets/container-cost-sheet-adapter";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportContainerCostCheckAll } from "@/actions/admin/export/container-cost-check";
import { FileSpreadsheet, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/13ufkMUoYGnz9sm4gQXiaFp9G6Lx1mRR9to0rqEVK0FA/edit#gid=0";

type CabinetRow = {
  cabinetNumber: string;
  parcelCount: number;
  checked: boolean;
  inPcs: boolean;
};

export default async function ContainerCostCheckPage() {
  await requireAdmin(["super", "ops", "accounting"]);

  const admin = createAdminClient();

  // ── 1) Read the cached sheet snapshot (fast path) ──
  const { data: cacheRows, error: cacheErr } = await admin
    .from("container_cost_sheet_cache")
    .select("cabinet_number, tracking_chn, checked")
    .order("cabinet_number", { ascending: true })
    .limit(50_000);
  if (cacheErr) {
    console.error(`[container_cost_sheet_cache list] failed`, {
      code: cacheErr.code,
      message: cacheErr.message,
    });
  }

  // ── 2) Read sync state (last-run / last-error banner) ──
  const { data: state, error: stateErr } = await admin
    .from("container_cost_sheet_state")
    .select("last_synced_at, last_run_at, last_error, row_count, cabinet_count")
    .eq("id", 1)
    .maybeSingle<{
      last_synced_at: string | null;
      last_run_at: string | null;
      last_error: string | null;
      row_count: number | null;
      cabinet_count: number | null;
    }>();
  if (stateErr) {
    console.error(`[container_cost_sheet_state read] failed`, {
      code: stateErr.code,
      message: stateErr.message,
    });
  }

  // ── 3) Build per-cabinet rollups. Prefer cache; fall back to live. ──
  type Roll = { parcels: Set<string>; checked: boolean };
  const rolls = new Map<string, Roll>();
  let sheetUnavailable: { reason: string; message?: string } | null = null;
  let usingLiveFallback = false;
  let totalSheetParcels = 0;

  if (cacheRows && cacheRows.length > 0) {
    for (const r of cacheRows as Array<{
      cabinet_number: string;
      tracking_chn: string;
      checked: boolean;
    }>) {
      let roll = rolls.get(r.cabinet_number);
      if (!roll) {
        roll = { parcels: new Set<string>(), checked: false };
        rolls.set(r.cabinet_number, roll);
      }
      if (r.tracking_chn) roll.parcels.add(r.tracking_chn);
      if (r.checked) roll.checked = true;
    }
  } else {
    // Cache empty — live fetch fallback (first-day path).
    usingLiveFallback = true;
    const live = await fetchContainerCostSheet();
    if (!live.ok) {
      sheetUnavailable = { reason: live.reason, message: live.message };
    } else {
      for (const c of live.data.cabinets) {
        rolls.set(c.cabinetNumber, {
          parcels: new Set(Array.from({ length: c.parcelCount }, (_, i) => `#${i}`)),
          checked: c.checked,
        });
      }
    }
  }
  for (const roll of rolls.values()) totalSheetParcels += roll.parcels.size;

  // ── 4) Match vs distinct tb_forwarder.fcabinetnumber ──
  const cabinetNames = Array.from(rolls.keys());
  const pcsSet = new Set<string>();
  if (cabinetNames.length > 0) {
    // Query in chunks of 500 to keep the .in() filter sane.
    for (let i = 0; i < cabinetNames.length; i += 500) {
      const chunk = cabinetNames.slice(i, i + 500);
      const { data: fwd, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("fcabinetnumber")
        .in("fcabinetnumber", chunk)
        .limit(50_000);
      if (fwdErr) {
        console.error(`[tb_forwarder cabinet match] failed`, {
          code: fwdErr.code,
          message: fwdErr.message,
        });
        continue;
      }
      for (const r of (fwd ?? []) as Array<{ fcabinetnumber: string | null }>) {
        if (r.fcabinetnumber) pcsSet.add(r.fcabinetnumber);
      }
    }
  }

  const cabinets: CabinetRow[] = Array.from(rolls.entries())
    .map(([cabinetNumber, roll]) => ({
      cabinetNumber,
      parcelCount: roll.parcels.size,
      checked: roll.checked,
      inPcs: pcsSet.has(cabinetNumber),
    }))
    .sort((a, b) => a.cabinetNumber.localeCompare(b.cabinetNumber, "th"));

  const foundCount = cabinets.filter((c) => c.inPcs).length;

  // ── CSV export — columns mirror the worklist <thead> 1:1 ──
  const csvCols: CsvCol[] = [
    { key: "index", label: "ลำดับ" },
    { key: "cabinetNumber", label: "ชื่อตู้จาก Sheet" },
    { key: "dataStatus", label: "สถานะข้อมูล" },
    { key: "checkStatus", label: "สถานะการเช็ค Sheet" },
    { key: "parcelCount", label: "จำนวนรายการใน Sheet" },
  ];
  const csvRows: CsvRow[] = cabinets.map((c, idx) => ({
    index: idx + 1,
    cabinetNumber: c.cabinetNumber,
    dataStatus: c.inPcs ? "พบข้อมูล" : "ไม่พบข้อมูล",
    checkStatus: c.checked ? "เช็คแล้ว" : "—",
    parcelCount: c.parcelCount,
  }));

  return (
    <>
      <TopMenuReport activeHref="/admin/report-cnt" />
      <main className="p-4 lg:p-6 space-y-4">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="text-xs text-muted">
          <ol className="flex items-center gap-1">
            <li><Link href="/admin" className="hover:underline">หน้าแรก</Link></li>
            <li>›</li>
            <li><Link href="/admin/forwarders" className="hover:underline">ฝากนำเข้า</Link></li>
            <li>›</li>
            <li className="text-foreground">เช็คต้นทุนตู้ Sheet</li>
          </ol>
        </nav>

        {/* Header card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-widest text-primary-600">
                ADMIN · ฝากนำเข้า
              </p>
              <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-primary-500" />
                เช็คต้นทุนตู้ Sheet
              </h1>
              <p className="mt-1 text-sm text-muted">
                กระทบยอดต้นทุนตู้กับชีตของแสง — แต่ละตู้ที่ &ldquo;พบข้อมูล&rdquo; กดเพื่อไปเทียบราคารายพัสดุ
                แล้วอัปเดตต้นทุนตามชีส.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CsvButton
                rows={csvRows}
                cols={csvCols}
                filename="เช็คต้นทุนตู้-Sheet.csv"
                fetchAll={async () => {
                  "use server";
                  return exportContainerCostCheckAll();
                }}
              />
              <a
                href={SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-alt"
              >
                <ExternalLink className="h-4 w-4" />
                ไปยังไฟล์ Google Sheet
              </a>
            </div>
          </div>

          {/* Sync status strip */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              ซิงค์ล่าสุด:{" "}
              <span className="font-medium text-foreground">
                {state?.last_synced_at
                  ? new Date(state.last_synced_at).toLocaleString("th-TH")
                  : usingLiveFallback
                    ? "ยังไม่เคยซิงค์ (อ่านสดจากชีต)"
                    : "—"}
              </span>
            </span>
            <span>
              ตู้จาก Sheet: <span className="font-medium text-foreground">{cabinets.length.toLocaleString()}</span>
            </span>
            <span>
              พบใน PCS: <span className="font-medium text-green-600">{foundCount.toLocaleString()}</span>
            </span>
            <span>
              รายการ (พัสดุ) รวม: <span className="font-medium text-foreground">{totalSheetParcels.toLocaleString()}</span>
            </span>
          </div>
        </section>

        {/* Unavailable banner (graceful degrade) */}
        {sheetUnavailable && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">ยังเชื่อมต่อ Google Sheet ไม่ได้</p>
                <p className="mt-1 text-xs">
                  {sheetUnavailable.reason === "not_configured"
                    ? "ยังไม่ได้ตั้งค่า service account ของ Google Sheets (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON) — แจ้งทีมพัฒนา/ก๊อต เพื่อเปิดใช้งานการกระทบยอดต้นทุนตู้แบบอัตโนมัติ."
                    : `อ่านชีตไม่สำเร็จ (${sheetUnavailable.reason}${sheetUnavailable.message ? `: ${sheetUnavailable.message}` : ""}). ระบบจะลองใหม่อัตโนมัติทุก 20 นาที.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {state?.last_error && !sheetUnavailable && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            ซิงค์รอบล่าสุดมีปัญหา: {state.last_error}
          </div>
        )}

        {/* Worklist table */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/60 text-muted">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium w-16">ลำดับ</th>
                  <th className="px-3 py-2 font-medium">ชื่อตู้จาก Sheet</th>
                  <th className="px-3 py-2 font-medium text-center">สถานะข้อมูล</th>
                  <th className="px-3 py-2 font-medium text-center">สถานะการเช็ค Sheet</th>
                  <th className="px-3 py-2 font-medium text-right">จำนวนรายการใน Sheet</th>
                </tr>
              </thead>
              <tbody>
                {cabinets.map((c, idx) => (
                  <tr key={c.cabinetNumber} className="border-t border-border hover:bg-surface-alt/40">
                    <td className="px-3 py-2 text-muted tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono">
                      {c.inPcs ? (
                        <Link
                          href={`/admin/report-cnt/${encodeURIComponent(c.cabinetNumber)}?action=cost-update`}
                          className="text-primary-600 hover:underline font-medium"
                        >
                          {c.cabinetNumber}
                        </Link>
                      ) : (
                        <span className="text-foreground">{c.cabinetNumber}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.inPcs ? (
                        <span className="inline-block rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                          พบข้อมูล
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 text-xs font-medium">
                          ไม่พบข้อมูล
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {c.checked ? (
                        <span className="text-green-600 font-medium">เช็คแล้ว</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.parcelCount.toLocaleString()}</td>
                  </tr>
                ))}
                {cabinets.length === 0 && !sheetUnavailable && (
                  <tr>
                    <td colSpan={5} className="px-3 py-12 text-center text-sm text-muted">
                      ไม่พบตู้ในชีต — รอรอบซิงค์ถัดไป หรือกด &ldquo;ไปยังไฟล์ Google Sheet&rdquo; เพื่อตรวจสอบข้อมูลต้นทาง.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div>
          <Link href="/admin/forwarders" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
        </div>
      </main>
    </>
  );
}
