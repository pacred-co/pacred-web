/**
 * /admin/drivers/[id]/picking-list — warehouse "บิลหาสินค้า / Picking List".
 *
 * ── Why this exists (พี่ป๊อป spec 2026-07-06 · BUILD item #7) ──────────
 * The logistics/shipping side needs TWO separate documents that serve
 * DIFFERENT people:
 *   • บิลจัดส่ง / Delivery Note  → the DRIVER  → sorted by delivery
 *     ADDRESS/recipient, one sign-line per stop (that is the sibling
 *     `../print` route — printDriver.php).
 *   • บิลหาสินค้า / Picking List → the WAREHOUSE ASSEMBLER → sorted by
 *     STORAGE LOCATION so staff can physically FIND & pull every parcel
 *     off the shelf before the truck loads. THIS FILE.
 *
 * So this document deliberately drops the address/route focus and instead
 * GROUPS BY `fpallet` (the warehouse pallet/location code · e.g. "A-3"),
 * then orders by container (`fcabinetnumber`) + tracking — the path an
 * assembler walks. Each row is a "pull this parcel" checklist line with a
 * ☐ หยิบแล้ว (found/picked) box, the customer PR + tracking + box count +
 * container so the picker can match the physical carton.
 *
 * ── Same data spine as the Delivery Note ─────────────────────────────
 * Reuses the exact join the batch DETAIL page + the delivery-note print
 * run (tb_forwarder_driver → tb_forwarder_driver_item.fid → tb_forwarder),
 * so the parcel set is identical — only the grouping/sort/columns differ.
 *
 * ── Notes ────────────────────────────────────────────────────────────
 *  - PURE READ — no writes (a picking list is a paper checklist).
 *  - AGENTS.md §0c — every Supabase query destructures `error`.
 *  - Auth — same gate + own-run rule as the batch detail / delivery-note.
 *  - `fcabinetnumber` added to the query (the delivery note didn't need it,
 *    the picking list does — location + container find the goods).
 */

import { notFound } from "next/navigation";
import { Boxes, ListOrdered, MapPin, Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { PrintButton } from "@/components/print-button";
import {
  DOC_CREAM as CREAM,
  DOC_GOLD as GOLD,
  DOC_PINK as PINK,
  DOC_PINK_BD as PINK_BD,
  DOC_PINK_TX as PINK_TX,
  DocBrandBlock,
  DocFooter,
  DocMetaBox,
  DocMetaRow,
  DocPrintStyles,
  DocStat,
  DocTitle,
} from "@/components/admin/driver-doc-paper";

export const dynamic = "force-dynamic";

type Batch = {
  id: number;
  fdname: string | null;
  fdadminid: string | null;
  fddate: string | null;
  fdamount: number | null;
};

type Forwarder = {
  id: number;
  userid: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  famount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fpallet: string | null;
  fnote: string | null;
  fcover: string | null;
};

const FORWARDER_COLS =
  "id, userid, ftrackingchn, fcabinetnumber, famount, fweight, fvolume, fpallet, fnote, fcover";

// Rows with no assigned location sort last, under a clear "ยังไม่ระบุตำแหน่ง"
// bucket, so the assembler sees exactly what still needs a shelf.
const NO_LOCATION = "￿__ยังไม่ระบุ";

// Paper chrome (logo · meta box · stat cards · footer · print rules) is SHARED
// with the sibling บิลจัดส่ง at `../print` so the two stay one visual set —
// see components/admin/driver-doc-paper.tsx.

function fmt(n: number | string | null | undefined, decimals = 0): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default async function DriverPickingListPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Same gate as the batch detail / delivery-note — warehouse is the primary
  // audience here (they walk the shelves), plus ops/super/driver.
  const { user, roles } = await requireAdmin(["ops", "super", "driver", "warehouse"]);
  const { id } = await params;
  const batchId = Number.parseInt(id, 10);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const admin = createAdminClient();
  const isOpsOverride =
    isGodRole(roles) || roles.includes("ops") || roles.includes("warehouse");

  // 1. Batch header.
  const { data: batchData, error: batchErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdname, fdadminid, fddate, fdamount")
    .eq("id", batchId)
    .maybeSingle<Batch>();
  if (batchErr) {
    console.error(`/admin/drivers/${id}/picking-list: batch read failed`, {
      code: batchErr.code,
      message: batchErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรอบจัดส่ง: ${batchErr.message}`);
  }
  if (!batchData) notFound();
  const batch = batchData;

  // Driver role — may only view their own run (same rule as the sibling pages).
  if (!isOpsOverride) {
    const { data: myProfile, error: myProfileErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (myProfileErr) {
      console.error("[drivers/[id]/picking-list] profiles lookup failed", {
        code: myProfileErr.code,
        message: myProfileErr.message,
      });
    }
    if (myProfile?.member_code !== batch.fdadminid) {
      notFound();
    }
  }

  // 2. The run's forwarder ids.
  const { data: itemsData, error: itemsErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid")
    .eq("fdid", batchId);
  if (itemsErr) {
    console.error(`/admin/drivers/${id}/picking-list: item read failed`, {
      code: itemsErr.code,
      message: itemsErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรายการในรอบ: ${itemsErr.message}`);
  }
  const fwdIds = Array.from(
    new Set(((itemsData ?? []) as { fid: number }[]).map((it) => it.fid)),
  );

  // 3. Forwarder rows.
  let forwarders: Forwarder[] = [];
  if (fwdIds.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_COLS)
      .in("id", fwdIds);
    if (fwdErr) {
      console.error(`/admin/drivers/${id}/picking-list: forwarder read failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
      throw new Error(`ไม่สามารถอ่านรายการสินค้า: ${fwdErr.message}`);
    }
    forwarders = (fwdData ?? []) as unknown as Forwarder[];
  }

  // 3b. รูปสินค้า (fcover) → signed/legacy URL per parcel (ภูม 2026-07-10:
  //     "แสดงรูป พนักงานจะได้เห็นว่าของหน้าตาประมาณไหน หาในโกดังง่ายๆ").
  //     Resolve in parallel; a parcel with no cover shows a placeholder box.
  const coverByFid = new Map<number, string>();
  await Promise.all(
    forwarders.map(async (f) => {
      if (f.fcover) {
        const u = await resolveLegacyUrl(f.fcover, "cover");
        if (u) coverByFid.set(f.id, u);
      }
    }),
  );

  // 4. Group by storage LOCATION (fpallet) — the assembler's walk-path.
  //    Within a location, order by container then tracking (physical proximity).
  type PickRow = Forwarder & { locKey: string };
  const rows: PickRow[] = forwarders.map((f) => ({
    ...f,
    locKey: (f.fpallet ?? "").trim() || NO_LOCATION,
  }));
  rows.sort((a, b) => {
    if (a.locKey !== b.locKey) {
      // "ยังไม่ระบุตำแหน่ง" always sorts LAST regardless of locale collation.
      const aNo = a.locKey === NO_LOCATION;
      const bNo = b.locKey === NO_LOCATION;
      if (aNo !== bNo) return aNo ? 1 : -1;
      return a.locKey.localeCompare(b.locKey, "th");
    }
    const cabA = (a.fcabinetnumber ?? "").trim();
    const cabB = (b.fcabinetnumber ?? "").trim();
    if (cabA !== cabB) return cabA.localeCompare(cabB, "th");
    return (a.ftrackingchn ?? "").localeCompare(b.ftrackingchn ?? "", "th");
  });

  type LocGroup = { location: string; label: string; rows: PickRow[] };
  const groups: LocGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.location === r.locKey) {
      last.rows.push(r);
    } else {
      groups.push({
        location: r.locKey,
        label: r.locKey === NO_LOCATION ? "ยังไม่ระบุตำแหน่ง" : r.locKey,
        rows: [r],
      });
    }
  }

  // Header aggregates.
  const totalBoxes = forwarders.reduce((s, f) => s + Number(f.famount ?? 0), 0);
  const totalParcels = forwarders.length;
  const totalLocations = groups.length;

  const dateLabel = batch.fddate
    ? new Date(batch.fddate).toLocaleString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  let rowNo = 0;

  return (
    <div className="doc-desk min-h-screen bg-slate-100 text-slate-900">
      <DocPrintStyles />

      {/* On-screen toolbar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/admin/drivers/${batch.id}`}
            className="text-primary-600 hover:underline"
          >
            ← กลับรายละเอียดรอบ
          </Link>
          <Link
            href={`/admin/drivers/${batch.id}/print`}
            target="_blank"
            className="text-primary-600 hover:underline"
          >
            บิลจัดส่ง (คนขับ) →
          </Link>
          <span className="text-xs text-gray-500">
            บิลหาสินค้า · รอบ #{batch.id} · {totalParcels} รายการ ·{" "}
            {totalLocations} ตำแหน่ง
          </span>
        </div>
        <PrintButton label="🖨 พิมพ์บิลหาสินค้า" />
      </div>

      <main className="print-area mx-auto my-6 max-w-[860px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-5 p-6 sm:p-9">
          {/* Header — brand block (left) · document title + meta box (right) */}
          <div className="flex items-start justify-between gap-6">
            <DocBrandBlock />

            <div className="w-[46%] max-w-[320px] shrink-0">
              <DocTitle title="บิลหาสินค้า" subtitle="Picking List (คลัง)" />
              <DocMetaBox>
                <DocMetaRow k="ชื่อรอบ" v={batch.fdname ?? `รอบ #${batch.id}`} />
                <DocMetaRow k="ผู้สร้างรอบ" v={batch.fdadminid || "—"} />
                <DocMetaRow
                  k="รอบจัดส่ง"
                  v={<span className="font-mono">#{batch.id}</span>}
                />
                <DocMetaRow k="วันที่สร้าง" v={dateLabel} last />
              </DocMetaBox>
            </div>
          </div>

          {/* Run totals */}
          <div className="grid grid-cols-3 gap-3">
            <DocStat
              icon={<MapPin className="h-5 w-5" style={{ color: GOLD }} />}
              label="จำนวนตำแหน่ง"
              value={fmt(totalLocations, 0)}
            />
            <DocStat
              icon={<Package className="h-5 w-5" style={{ color: GOLD }} />}
              label="จำนวนรายการ"
              value={fmt(totalParcels, 0)}
            />
            <DocStat
              icon={<Boxes className="h-5 w-5" style={{ color: GOLD }} />}
              label="จำนวนกล่อง"
              value={fmt(totalBoxes, 0)}
            />
          </div>

          <p className="flex items-start gap-2 text-[12px]" style={{ color: GOLD }}>
            <ListOrdered className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              เรียงตาม <b>ตำแหน่งจัดเก็บ (Location)</b> → ตู้ → เลขแทรคกิ้ง ·
              ติ๊ก ☐ เมื่อหยิบสินค้าออกจากชั้นครบแล้ว
            </span>
          </p>

        {/* Picking table — grouped by storage location */}
        <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-center" style={{ background: CREAM }}>
              <th className="border border-slate-200 px-2 py-2.5 w-10">
                <span className="mx-auto block h-3.5 w-3.5 rounded-[3px] border-2 border-slate-400" />
              </th>
              <th className="border border-slate-200 px-2 py-2.5 w-12 font-bold">ลำดับ</th>
              <th className="border border-slate-200 px-2 py-2.5 w-20 font-bold">รูปสินค้า</th>
              <th className="border border-slate-200 px-2 py-2.5 w-24 font-bold">รหัสลูกค้า</th>
              <th className="border border-slate-200 px-2 py-2.5 font-bold">เลขแทรคกิ้ง</th>
              <th className="border border-slate-200 px-2 py-2.5 w-32 font-bold">ตู้</th>
              <th className="border border-slate-200 px-2 py-2.5 w-14 font-bold">กล่อง</th>
              <th className="border border-slate-200 px-2 py-2.5 w-16 font-bold">น้ำหนัก</th>
              <th className="border border-slate-200 px-2 py-2.5 w-16 font-bold">ปริมาตร</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="border border-slate-200 px-2 py-6 text-center text-gray-500"
                >
                  ไม่มีรายการในรอบนี้
                </td>
              </tr>
            ) : (
              groups.map((g) => {
                const gBoxes = g.rows.reduce(
                  (s, r) => s + Number(r.famount ?? 0),
                  0,
                );
                return (
                  <LocationGroup key={g.location} location={g.label}>
                    {g.rows.map((r) => {
                      rowNo += 1;
                      return (
                        <tr key={r.id} className="align-top">
                          {/* หยิบแล้ว — the assembler's tick box */}
                          <td className="border border-slate-200 px-1 py-2 text-center">
                            <span className="inline-block h-4 w-4 rounded-[3px] border-2 border-slate-400" />
                          </td>
                          <td className="border border-slate-200 px-1 py-1 text-center font-mono">
                            {rowNo}
                          </td>
                          {/* รูปสินค้า — ให้พนักงานเห็นหน้าตากล่อง หาของในโกดังง่าย */}
                          <td className="border border-slate-200 px-1 py-1 text-center">
                            {coverByFid.has(r.id) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={coverByFid.get(r.id)}
                                alt={r.ftrackingchn ?? "รูปสินค้า"}
                                className="mx-auto h-16 w-16 rounded-lg object-cover border border-slate-200"
                              />
                            ) : (
                              <span className="inline-flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[11px] text-slate-400">
                                ไม่มีรูป
                              </span>
                            )}
                          </td>
                          <td className="border border-slate-200 px-2 py-1">
                            <div className="font-bold font-mono">
                              {r.userid ?? "—"}
                            </div>
                          </td>
                          <td className="border border-slate-200 px-2 py-1 break-words">
                            {r.ftrackingchn || "—"}
                            {r.fnote ? (
                              <div className="text-[11px] text-gray-600">
                                📝 {r.fnote}
                              </div>
                            ) : null}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-center break-words">
                            {r.fcabinetnumber || "—"}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono">
                            {fmt(r.famount, 0)}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right">
                            {fmt(r.fweight, 2)}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right">
                            {fmt(r.fvolume, 3)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* per-location subtotal — helps the picker confirm the shelf is clear */}
                    <tr className="font-bold" style={{ background: CREAM }}>
                      <td
                        className="border border-slate-200 px-2 py-1 text-right"
                        colSpan={6}
                      >
                        รวมตำแหน่ง {g.label} · {g.rows.length} รายการ
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-mono">
                        {fmt(gBoxes, 0)}
                      </td>
                      <td className="border border-slate-200 px-2 py-1" colSpan={2} />
                    </tr>
                  </LocationGroup>
                );
              })
            )}
          </tbody>
        </table>
        </div>

          <DocFooter
            left={`เอกสารเลขที่: ${batch.fdname ?? `รอบ #${batch.id}`}`}
            right="หน้า 1 จาก 1"
          />

          <p className="no-print text-[11px] text-slate-400 text-center">
            กดปุ่ม &quot;พิมพ์บิลหาสินค้า&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด
            Ctrl+P
          </p>
        </div>
      </main>
    </div>
  );
}

/** One storage-location section header row + its picking lines. */
function LocationGroup({
  location,
  children,
}: {
  location: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr style={{ background: PINK }}>
        <td
          colSpan={9}
          className="px-3 py-2 font-bold"
          style={{
            borderTop: `1px solid ${PINK_BD}`,
            borderBottom: `1px solid ${PINK_BD}`,
            color: PINK_TX,
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0" />
            ตำแหน่งจัดเก็บ: {location}
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}

