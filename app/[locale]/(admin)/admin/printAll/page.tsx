/**
 * /admin/printAll — warehouse "scan → print everything for this cabinet"
 * sheet. Faithful port of legacy PCS Cargo
 * `member/pcs-admin/printAll.php` (969 LOC · D1 / ADR-0017).
 *
 * ── What the legacy printAll.php does ────────────────────────────────
 * It is a multi-mode mPDF dispatcher keyed on `$_GET['print']`, fed an
 * `id[]` array of tb_forwarder primary keys (the warehouse staff selects
 * a batch of boxes/trackings on the คนกล่อง / report screens and hits one
 * of the print buttons):
 *
 *   print=1 → "พิมพ์จากหน้ากล่อง" — the BOX LABEL: one sticker per box
 *             (mPDF format [100,75] · loops `fAmount` copies). Big
 *             "TO <userID>", the tracking number + barcode, weight / CBM /
 *             box-count / pallet-location. Also writes printStatus1='1'.
 *   print=4 → box label variant (full ship-to address + carrier · one per
 *             box · writes printStatus4='1').
 *   print=2 → "พิมพ์ใบเสร็จ" — the A4-L receipt/invoice (one per id ·
 *             fStatus>5 · writes printStatus2='1'). This is the SAME
 *             receipt already ported at /admin/forwarders/print &
 *             /api/pdf/forwarder/[fNo] — NOT re-implemented here.
 *   print=3 → "พิมพ์ใบส่งสินค้า" — the A4-P delivery manifest: ONE table,
 *             one row per id (ลำดับ · รหัสลูกค้า · ที่อยู่จัดส่ง · บริษัทขนส่ง ·
 *             เลขแทรคกิ้ง · ผู้ส่ง · ผู้รับ). Writes printStatus3='1'.
 *             This is the SAME manifest the combine-bill print already
 *             renders (/admin/forwarders/combine-bill/print).
 *
 * ── What THIS Pacred page builds (the gap it closes) ─────────────────
 * The legacy print buttons are driven off an `id[]` selection on the
 * box/report screens. The re-sweep gap (#8 / #17) is the warehouse
 * "scan a cabinet → print all its box labels in one motion" flow — the
 * box-label print (print=1/4) had NO Pacred entry point keyed on the
 * CABINET, only the per-receipt routes existed.
 *
 * This page reproduces the BOX-LABEL sheet (legacy print=1 + the
 * address/carrier of print=4 merged into one clean Pacred label) for an
 * ENTIRE cabinet at once:
 *
 *   /admin/printAll?cabinet=GZS260529-1   ← every box of that cabinet
 *   /admin/printAll?fNo=51976             ← a single forwarder row
 *   /admin/printAll?id=51976&id=51977     ← an explicit id[] selection
 *                                           (legacy contract preserved)
 *
 * It selects the matching tb_forwarder rows and renders one print BLOCK
 * per row, repeating the block `fAmount` times (one sticker per box —
 * faithful to printAll.php's `for($count2=0; $count2<$fAmount; …)` loop).
 *
 * ── Data — tb_forwarder columns the legacy box-label SELECTs (L40-44 /
 *    L260-264) ─────────────────────────────────────────────────────────
 *   id (=fID) · userID · fTrackingCHN · fShipBy · fAmount · fWeight ·
 *   fVolume · fPallet · fAddressNote · fCabinetNumber · fWarehouseName
 *   + the ship-to address (fAddress* columns, CONCAT'd in legacy SQL).
 * `tb_forwarder` is lowercase on prod (CLAUDE.md casing rule).
 *
 * ── FLAGGED — deferred mutation (a render is a PURE READ) ────────────
 * The legacy printAll.php runs `UPDATE tb_forwarder SET printStatus1='1'`
 * (and printStatus4) at render time to mark the label printed. A Next.js
 * Server Component render MUST stay a pure read, so this write is NOT
 * performed here (same deferral as every other ported print route —
 * e.g. service-orders/print, combine-bill/print). A follow-up Server
 * Action can set the flag on an explicit "mark printed" click.
 *
 * ── FLAGGED — scan-input integration (follow-up) ─────────────────────
 * The legacy flow is "USB-scan a cabinet barcode → the selection auto-
 * fills → print". This page takes the cabinet via `?cabinet=` (so the
 * existing barcode/report screens can deep-link to it, and a scan-gun
 * that types into a field + Enter can submit). A dedicated on-page
 * barcode-scanner capture (like /admin/barcode/driver/import's
 * scanner panel) is a ⚠️ follow-up — see the report.
 *
 * Brand: "PCS Cargo" → Pacred (settled) · legacy `PCS<n>` codes → `PR<n>`.
 * Auth: warehouse is the primary consumer (legacy gate = the admin
 * cookie). AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { PrintAllPicker, AutoPrintOnLoad } from "./print-all-picker";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { SITE_NAME, CONTACT } from "@/components/seo/site";

export const dynamic = "force-dynamic";

// Legacy nameWarehouse() — fWarehouseName int → display name
// (report-cnt/page.tsx WAREHOUSE_LABEL · kept in sync).
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

type SearchParams = {
  cabinet?: string | string[];
  fNo?: string | string[];
  id?: string | string[];
  autoprint?: string | string[]; // "1" → open the print dialog on load (scan→print)
};

// The tb_forwarder columns the legacy box-label SELECT pulls (L40-44).
type ForwarderRow = {
  id: number;
  userid: string | null;
  ftrackingchn: string | null;
  fshipby: string | null;
  famount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fpallet: string | null;
  faddressnote: string | null;
  fcabinetnumber: string | null;
  fwarehousename: string | null;
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

const FORWARDER_COLS =
  "id, userid, ftrackingchn, fshipby, famount, fweight, fvolume, fpallet, " +
  "faddressnote, fcabinetnumber, fwarehousename, " +
  "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
  "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2";

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function fmt(n: number | string | null | undefined, decimals = 0): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** CONCAT('คุณ ',fAddressName,…) — printAll.php L41 ship-to string. */
function fullAddress(f: ForwarderRow): string {
  return (
    `คุณ ${f.faddressname ?? ""} ${f.faddresslastname ?? ""} ${f.faddressno ?? ""}` +
    ` ตำบล/แขวง ${f.faddresssubdistrict ?? ""} อำเภอ/เขต ${f.faddressdistrict ?? ""}` +
    ` จังหวัด ${f.faddressprovince ?? ""} ${f.faddresszipcode ?? ""}` +
    ` โทร. ${f.faddresstel ?? ""}${f.faddresstel2 ? `, ${f.faddresstel2}` : ""}`
  ).replace(/\s+/g, " ").trim();
}

export default async function PrintAllPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Legacy printAll.php L6-10 — admin cookie gate. Warehouse staff are
  // the primary consumer (they pack + label boxes).
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const sp = await searchParams;
  const cabinet = firstParam(sp.cabinet)?.trim();
  const autoprint = firstParam(sp.autoprint) === "1";
  const admin = createAdminClient();

  // ── Resolve the forwarder rows ──
  // Priority: explicit cabinet → single fNo → explicit id[] selection.
  let rows: ForwarderRow[] = [];
  let headerLabel = "";

  if (cabinet) {
    // Every box of the scanned cabinet (the warehouse scan-to-print flow).
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_COLS)
      .eq("fcabinetnumber", cabinet)
      .order("userid", { ascending: true })
      .limit(50_000);
    if (error) {
      console.error("[printAll] tb_forwarder by cabinet failed", {
        cabinet,
        code: error.code,
        message: error.message,
      });
      throw new Error(
        `printAll: failed to load cabinet ${cabinet} — ${error.code ?? "unknown"}: ${error.message}`,
      );
    }
    rows = (data ?? []) as unknown as ForwarderRow[];
    headerLabel = `ตู้ ${cabinet}`;
  } else {
    // fNo (single) OR id[] (explicit selection — legacy contract).
    const raw = sp.fNo ?? sp.id;
    const arr = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    const ids = arr
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) {
      // No selector → show the guidance card (NOT a 404 — staff land here
      // from the sidebar and need to know how to use it).
      return <PrintAllGuide />;
    }
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_COLS)
      .in("id", ids)
      .order("userid", { ascending: true });
    if (error) {
      console.error("[printAll] tb_forwarder by id failed", {
        ids,
        code: error.code,
        message: error.message,
      });
      throw new Error(
        `printAll: failed to load ids — ${error.code ?? "unknown"}: ${error.message}`,
      );
    }
    rows = (data ?? []) as unknown as ForwarderRow[];
    headerLabel = `${rows.length} รายการ`;
  }

  // For an explicit selector that resolved nothing, the legacy renders
  // nothing — notFound() is the faithful equivalent. For a hand-typed
  // cabinet we show the empty-state instead of a bare 404.
  if (rows.length === 0) {
    if (cabinet) return <PrintAllEmpty cabinet={cabinet} />;
    notFound();
  }

  // The warehouse name is shared across a cabinet's rows (printAll context).
  const warehouseCode = String(rows[0]?.fwarehousename ?? "");
  const warehouseName = WAREHOUSE_LABEL[warehouseCode] ?? warehouseCode;

  // Aggregates for the on-screen summary chip.
  const totalBoxes = rows.reduce((s, f) => s + Number(f.famount ?? 0), 0);
  const totalWeight = rows.reduce((s, f) => s + Number(f.fweight ?? 0), 0);
  const totalVolume = rows.reduce((s, f) => s + Number(f.fvolume ?? 0), 0);

  // printAll.php prints ONE label per box (`fAmount` copies). Build the
  // flat list of label "pages" up front (one entry per physical box).
  type Label = { row: ForwarderRow; copyIndex: number; copyTotal: number };
  const labels: Label[] = [];
  for (const row of rows) {
    const copies = Math.max(1, Number(row.famount ?? 0) || 1);
    for (let c = 0; c < copies; c++) {
      labels.push({ row, copyIndex: c + 1, copyTotal: copies });
    }
  }

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Print-only styles — hide admin sidebar + on-screen toolbar; A4. */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          html, body { background: #fff !important; }
          body { padding: 0 !important; margin: 0 !important; }
          .print-area { box-shadow: none !important; border: none !important; }
          .label-page { page-break-after: always; break-after: page; }
          .label-page:last-child { page-break-after: auto; break-after: auto; }
        }
        @page { size: A4 portrait; margin: 1cm; }
      `}</style>

      {/* พี่ป๊อป 2026-06-12 — scan→print fast path: auto-open the print dialog
          when reached with ?autoprint=1 (e.g. from a barcode scan). */}
      {autoprint && <AutoPrintOnLoad />}

      {/* On-screen toolbar */}
      <div className="no-print sticky top-0 z-10 space-y-2 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/admin/report-cnt"
              className="text-primary-600 hover:underline"
            >
              ← กลับรายงานตู้
            </Link>
            <span className="text-xs text-gray-500">
              พิมพ์ป้ายกล่อง · {headerLabel}
              {warehouseName ? ` · โกดัง: ${warehouseName}` : ""} · {labels.length}{" "}
              ป้าย ({totalBoxes} กล่อง · {fmt(totalWeight, 2)} kg ·{" "}
              {fmt(totalVolume, 3)} m³)
            </span>
          </div>
          <PrintButton label="🖨 พิมพ์ป้ายกล่องทั้งหมด" />
        </div>
        {/* In-page scan/cabinet picker — print the next box/container without
            leaving (no bounce to รายงานตู้). */}
        <PrintAllPicker compact />
      </div>

      <main className="print-area mx-auto max-w-[800px] p-4 space-y-4">
        {labels.map((label) => {
          const f = label.row;
          // Brand: legacy printed 'FAM' specials; Pacred shows the userID
          // verbatim (PR<n>). No special-case needed for the warehouse label.
          return (
            <section
              key={`${f.id}-${label.copyIndex}`}
              className="label-page rounded-lg border-2 border-black p-4 space-y-3 break-inside-avoid"
            >
              {/* Header band — cabinet + forwarder no + Pacred brand */}
              <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
                <div>
                  <p className="text-2xl font-black text-primary-700 leading-none">
                    {SITE_NAME}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    เลขที่ฝากนำเข้า #{f.id}
                    {f.fcabinetnumber ? ` · ตู้ ${f.fcabinetnumber}` : ""}
                    {warehouseName ? ` · โกดัง ${warehouseName}` : ""}
                  </p>
                </div>
                <div className="text-right text-[11px] text-gray-600">
                  กล่องที่ {label.copyIndex}/{label.copyTotal}
                </div>
              </div>

              {/* TO — big recipient member code (legacy "ถึง / TO") */}
              <div className="flex items-center gap-3">
                <span className="bg-black text-white px-3 py-1 text-base font-bold rounded">
                  ถึง / TO
                </span>
                <span className="text-3xl font-black tracking-wide">
                  {f.userid ?? "—"}
                </span>
              </div>

              {/* Ship-to address + note */}
              <div className="text-sm leading-relaxed">
                {fullAddress(f)}
                {f.faddressnote ? (
                  <span className="block text-amber-700 mt-1">
                    * {f.faddressnote}
                  </span>
                ) : null}
              </div>

              {/* Tracking number — large, monospace (the scan target) */}
              <div className="border-t border-b border-gray-300 py-2">
                <span className="text-[11px] text-gray-500">เลขแทรคกิ้ง</span>
                <div className="text-xl font-mono font-bold break-all">
                  {f.ftrackingchn || "—"}
                </div>
              </div>

              {/* Metrics strip — weight / volume / box count / location */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Cell label="น้ำหนัก" value={`${fmt(f.fweight, 2)} kg`} />
                <Cell label="ปริมาตร" value={`${fmt(f.fvolume, 3)} m³`} />
                <Cell label="จำนวน" value={`${fmt(f.famount, 0)} กล่อง`} />
                <Cell label="Location" value={f.fpallet || "—"} />
              </div>

              {/* Carrier */}
              <div className="text-sm">
                <span className="text-gray-500">บริษัทขนส่ง: </span>
                <span className="font-medium">{nameShipBy(f.fshipby)}</span>
              </div>
            </section>
          );
        })}

        <p className="no-print text-[11px] text-gray-500 text-center pt-2">
          กดปุ่ม &quot;พิมพ์ป้ายกล่องทั้งหมด&quot; ด้านบน หรือ Ctrl+P · 1 ป้าย
          ต่อ 1 กล่อง ({CONTACT.phoneCompanyDisplay})
        </p>
      </main>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-300 px-1 py-1">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function PrintAllGuide() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 text-black sm:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            พิมพ์ป้ายกล่อง
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            สแกนกล่อง → พิมพ์ป้ายทันที · หรือพิมพ์ทั้งตู้ในครั้งเดียว — ทำได้ในหน้านี้เลย
          </p>
        </header>

        {/* The tool — scan/cabinet picker (พี่ป๊อป: ไม่ต้องเด้งไปหน้ารายงานตู้) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <PrintAllPicker />
        </div>

        {/* Reference — the URL contract + the รายงานตู้ entry, kept for staff
            who arrive from a deep link or the container report. */}
        <details className="rounded-xl border border-slate-200 bg-white/60 p-4 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">
            วิธีอื่น / พารามิเตอร์ URL
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li>
              <code className="rounded bg-slate-100 px-1">?cabinet=GZS260529-1</code>{" "}
              — ป้ายของทุกกล่องในตู้
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">?fNo=51976</code> —
              รายการเดียว
            </li>
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            หรือเข้าจากหน้า{" "}
            <Link href="/admin/report-cnt" className="text-primary-600 hover:underline">
              รายงานตู้
            </Link>{" "}
            → เลือกตู้ → ปุ่ม &quot;พิมพ์ป้ายกล่อง&quot;
          </p>
        </details>
      </div>
    </main>
  );
}

function PrintAllEmpty({ cabinet }: { cabinet: string }) {
  return (
    <main className="min-h-screen bg-white p-8 text-black">
      <div className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        <h1 className="text-lg font-bold mb-2">ไม่พบรายการ</h1>
        <p>
          ไม่พบกล่องในตู้ <span className="font-mono">{cabinet}</span>
        </p>
        <Link
          href="/admin/report-cnt"
          className="mt-4 inline-block rounded-md bg-primary-600 px-4 py-2 text-white font-medium hover:bg-primary-700"
        >
          ← กลับรายงานตู้
        </Link>
      </div>
    </main>
  );
}
