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
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { SITE_NAME, ADDRESSES, CONTACT } from "@/components/seo/site";

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
};

const FORWARDER_COLS =
  "id, userid, ftrackingchn, fcabinetnumber, famount, fweight, fvolume, fpallet, fnote";

// Rows with no assigned location sort last, under a clear "ยังไม่ระบุตำแหน่ง"
// bucket, so the assembler sees exactly what still needs a shelf.
const NO_LOCATION = "￿__ยังไม่ระบุ";

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
    <div className="bg-white text-black min-h-screen">
      {/* Print-only styles — hide admin sidebar + on-screen toolbar; A4. */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          html, body { background: #fff !important; }
          body { padding: 0 !important; margin: 0 !important; }
          .print-area { box-shadow: none !important; border: none !important; }
        }
        @page { size: A4 portrait; margin: 1cm; }
      `}</style>

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

      <main className="print-area mx-auto max-w-[800px] p-6 space-y-4">
        {/* Header — logo/company + batch meta */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-3xl font-black text-primary-700 leading-none">
              {SITE_NAME}
            </h1>
            <p className="text-[11px] text-gray-600 mt-1">
              {ADDRESSES.office.full}
            </p>
            <p className="text-[11px] text-gray-600">
              โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </p>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <h2 className="text-xl font-bold">บิลหาสินค้า</h2>
            <p className="text-[11px] text-gray-500">Picking List (คลัง)</p>
            <p className="text-gray-700">
              <span className="text-gray-500">ชื่อเรื่อง:</span>{" "}
              {batch.fdname ?? `รอบ #${batch.id}`}
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">รอบจัดส่ง:</span>{" "}
              <span className="font-mono">#{batch.id}</span>
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">วันที่สร้าง:</span> {dateLabel}
            </p>
          </div>
        </div>

        {/* Run totals strip */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <Cell label="จำนวนตำแหน่ง" value={fmt(totalLocations, 0)} />
          <Cell label="จำนวนรายการ" value={fmt(totalParcels, 0)} />
          <Cell label="จำนวนกล่อง" value={fmt(totalBoxes, 0)} />
        </div>

        <p className="text-[11px] text-gray-500">
          เรียงตาม <b>ตำแหน่งจัดเก็บ (Location)</b> → ตู้ → เลขแทรคกิ้ง ·
          ติ๊ก ☐ เมื่อหยิบสินค้าออกจากชั้นครบแล้ว
        </p>

        {/* Picking table — grouped by storage location */}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-center">
              <th className="border border-gray-400 px-1 py-1 w-8">☐</th>
              <th className="border border-gray-400 px-1 py-1 w-10">ลำดับ</th>
              <th className="border border-gray-400 px-2 py-1 w-24">รหัสลูกค้า</th>
              <th className="border border-gray-400 px-2 py-1">เลขแทรคกิ้ง</th>
              <th className="border border-gray-400 px-2 py-1 w-24">ตู้</th>
              <th className="border border-gray-400 px-2 py-1 w-14">กล่อง</th>
              <th className="border border-gray-400 px-2 py-1 w-16">น้ำหนัก</th>
              <th className="border border-gray-400 px-2 py-1 w-16">ปริมาตร</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="border border-gray-400 px-2 py-6 text-center text-gray-500"
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
                          <td className="border border-gray-400 px-1 py-2 text-center">
                            <span className="inline-block h-4 w-4 border border-gray-500" />
                          </td>
                          <td className="border border-gray-400 px-1 py-1 text-center font-mono">
                            {rowNo}
                          </td>
                          <td className="border border-gray-400 px-2 py-1">
                            <div className="font-bold font-mono">
                              {r.userid ?? "—"}
                            </div>
                          </td>
                          <td className="border border-gray-400 px-2 py-1 break-all">
                            {r.ftrackingchn || "—"}
                            {r.fnote ? (
                              <div className="text-[11px] text-gray-600">
                                📝 {r.fnote}
                              </div>
                            ) : null}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 text-center break-all">
                            {r.fcabinetnumber || "—"}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                            {fmt(r.famount, 0)}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 text-right">
                            {fmt(r.fweight, 2)}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 text-right">
                            {fmt(r.fvolume, 3)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* per-location subtotal — helps the picker confirm the shelf is clear */}
                    <tr className="bg-gray-50 font-semibold">
                      <td
                        className="border border-gray-400 px-2 py-1 text-right"
                        colSpan={5}
                      >
                        รวมตำแหน่ง {g.label} · {g.rows.length} รายการ
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                        {fmt(gBoxes, 0)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1" colSpan={2} />
                    </tr>
                  </LocationGroup>
                );
              })
            )}
          </tbody>
        </table>

        <p className="no-print text-[11px] text-gray-500 text-center pt-2">
          กดปุ่ม &quot;พิมพ์บิลหาสินค้า&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด
          Ctrl+P
        </p>
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
      <tr className="bg-primary-50">
        <td
          colSpan={8}
          className="border border-gray-400 px-2 py-1.5 font-bold text-primary-800"
        >
          📍 ตำแหน่งจัดเก็บ: {location}
        </td>
      </tr>
      {children}
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-300 px-2 py-1.5">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}
