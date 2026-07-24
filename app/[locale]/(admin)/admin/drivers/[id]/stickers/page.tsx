/**
 * /admin/drivers/[id]/stickers — route-ordered delivery-address STICKER sheet.
 *
 * ── Why this exists (พี่ป๊อป spec 2026-07-06 · §จัดส่ง) ────────────────
 * "พิมพ์สติกเกอร์จัดส่งในประเทศที่มีข้อมูลที่อยู่ชัดเจน · เรียงลำดับตามการ
 * ใช้งานจริงหน้างาน" — a printable sheet of DELIVERY-ADDRESS STICKERS the
 * warehouse peels and slaps onto each carton, ORDERED by the real on-route
 * delivery sequence so the driver peels them in the order they'll actually
 * stop. This is the THIRD driver document, distinct from its two siblings:
 *   • บิลหาสินค้า / Picking List (`../picking-list`) → grouped by STORAGE
 *     LOCATION so the assembler FINDS the goods.
 *   • บิลจัดส่ง / Delivery Note (`../print`) → one manifest table sorted by
 *     customer (userID) — the sign-off sheet the driver carries.
 *   • สติกเกอร์ที่อยู่ / Address Stickers (THIS FILE) → one peel-off label
 *     PER STOP, sorted by DRIVING ROUTE (near→far) — what goes ON the box.
 *
 * ── Route ordering (reuses the existing SOT) ─────────────────────────
 * Sorted by `routeOrderOf(district)` — the SAME 68-district BKK+ปริมณฑล
 * driving-route order (`lib/admin/driver-route-order.ts`, legacy `$arrPositF`)
 * the driver-assign screen already uses to sort its stop picker. So the
 * sticker sheet reads like the driver's actual run, and both surfaces stay
 * in lock-step if the route is ever tweaked.
 *
 * ── Same data spine as the Delivery Note / Picking List ──────────────
 * Reuses the exact join (tb_forwarder_driver → tb_forwarder_driver_item.fid
 * → tb_forwarder) + the recipient-grouping model from the batch DETAIL page,
 * so the parcel set is identical — only the sort/format differ. One sticker
 * per delivery STOP (recipient + address group), showing ผู้รับ / ที่อยู่เต็ม
 * / เบอร์ / เลขแทรคกิง / #กล่อง / PR + a Code128 of the primary tracking.
 *
 * ── Notes ────────────────────────────────────────────────────────────
 *  - PURE READ — no writes (a sticker sheet is print-only). NO money fields
 *    (no cost/price/profit — the driver/warehouse must never see money).
 *  - AGENTS.md §0c — every Supabase query destructures `error`.
 *  - Auth — same gate + own-run rule as the sibling driver print pages.
 *  - Stops with NO clear address (the warehouse self-pickup placeholder) are
 *    dropped from the sheet + counted in a banner — a sticker with no address
 *    can't be shipped (spec: "ที่มีข้อมูลที่อยู่ชัดเจน").
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { SITE_NAME, SITE_LEGAL_NAME_TH, CONTACT, ADDRESSES } from "@/components/seo/site";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { code128SvgDataUrl, qrSvgDataUrl } from "@/lib/barcode";
import { transportModeFromCabinetName } from "@/lib/forwarder/cabinet-transport";
import { routeOrderOf } from "@/lib/admin/driver-route-order";

// รถ/เรือ/อากาศ ตามโหมดตู้ (ประเภทขนส่ง บนสติกเกอร์ · ปอน 2026-07-24)
const MODE_LABEL: Record<string, string> = { "1": "รถ", "2": "เรือ", "3": "อากาศ" };

export const dynamic = "force-dynamic";

type Batch = {
  id: number;
  fdname: string | null;
  fdadminid: string | null;
  fddate: string | null;
};

type Forwarder = {
  id: number;
  fidorco: string | null;
  userid: string | null;
  ftrackingchn: string | null;
  fshipby: string | null;
  famount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fcabinetnumber: string | null;
  fpallet: string | null;
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
  "id, fidorco, userid, ftrackingchn, fshipby, famount, fweight, fvolume, fcabinetnumber, fpallet, " +
  "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
  "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2";

/** A row still on the warehouse self-pickup placeholder has no real ship-to. */
function isWarehousePlaceholder(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return n === "" || /รับ.*โกดัง|รับเอง|pacred/i.test(n);
}

/** Does this stop have a clear, shippable delivery address? (spec gate) */
function hasClearAddress(f: Forwarder): boolean {
  if (isWarehousePlaceholder(f.faddressname)) return false;
  // Needs at least a street line + a district to be a real destination.
  const street = (f.faddressno ?? "").trim();
  const district = (f.faddressdistrict ?? "").trim();
  return street !== "" && district !== "";
}

// 🔴 title = ชื่อไฟล์ตอน Save PDF + หัวกระดาษ. ต้องอยู่ใน metadata เท่านั้น —
//    layout ออก <title> ให้ทุกหน้าอยู่แล้ว, <title> ที่ใส่ใน body จึงเป็นตัวที่ 2
//    และเบราว์เซอร์ใช้ "ตัวแรก" เสมอ (เจอจริง 2026-07-24). `absolute` = ไม่ต่อท้าย "| Pacred".
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: { absolute: `สติกเกอร์ รอบ #${id}` } };
}

export default async function DriverStickerSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fids?: string }>;
}) {
  // Same gate as the sibling driver print pages — warehouse peels the stickers,
  // plus ops/super/driver. isGodRole covers ultra+super.
  const { user, roles } = await requireAdmin(["ops", "super", "driver", "warehouse"]);
  const { id } = await params;
  const { fids: fidsParam } = await searchParams;
  const batchId = Number.parseInt(id, 10);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const admin = createAdminClient();
  const isOpsOverride =
    isGodRole(roles) || roles.includes("ops") || roles.includes("warehouse");

  // 1. Batch header.
  const { data: batchData, error: batchErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdname, fdadminid, fddate")
    .eq("id", batchId)
    .maybeSingle<Batch>();
  if (batchErr) {
    console.error(`/admin/drivers/${id}/stickers: batch read failed`, {
      code: batchErr.code,
      message: batchErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรอบจัดส่ง: ${batchErr.message}`);
  }
  if (!batchData) notFound();
  const batch = batchData;

  // Driver role — may only print their own run (same rule as the siblings).
  if (!isOpsOverride) {
    const { data: myProfile, error: myProfileErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (myProfileErr) {
      console.error("[drivers/[id]/stickers] profiles lookup failed", {
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
    console.error(`/admin/drivers/${id}/stickers: item read failed`, {
      code: itemsErr.code,
      message: itemsErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรายการในรอบ: ${itemsErr.message}`);
  }
  const fwdIdsAll = Array.from(
    new Set(((itemsData ?? []) as { fid: number }[]).map((it) => it.fid)),
  );
  // Optional ?fids= filter (per-stop print · ปอน 2026-07-24) — intersect with the
  // run's own fids so a caller can only ever print rows that belong to THIS batch.
  let fwdIds = fwdIdsAll;
  if (fidsParam) {
    const requested = new Set(
      fidsParam
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n)),
    );
    const filtered = fwdIdsAll.filter((fid) => requested.has(fid));
    if (filtered.length > 0) fwdIds = filtered;
  }

  // 3. Forwarder rows.
  let forwarders: Forwarder[] = [];
  if (fwdIds.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_COLS)
      .in("id", fwdIds);
    if (fwdErr) {
      console.error(`/admin/drivers/${id}/stickers: forwarder read failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
      throw new Error(`ไม่สามารถอ่านรายการสินค้า: ${fwdErr.message}`);
    }
    forwarders = (fwdData ?? []) as unknown as Forwarder[];
  }

  // 4. Resolve the CUSTOMER name for every forwarder (legacy links by userid
  //    TEXT, not an FK → one tb_users .in() lookup · camelCase exception).
  const custIds = Array.from(
    new Set(forwarders.map((f) => (f.userid ?? "").trim()).filter(Boolean)),
  );
  const custNameById = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custRows, error: custErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", custIds);
    if (custErr) {
      console.error(`/admin/drivers/${id}/stickers: customer name lookup failed`, {
        code: custErr.code,
        message: custErr.message,
      });
    }
    for (const u of (custRows ?? []) as {
      userID: string;
      userName: string | null;
      userLastName: string | null;
    }[]) {
      const name = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim();
      if (name) custNameById.set(u.userID, name);
    }
  }
  const customerNameOf = (uid: string | null | undefined): string =>
    custNameById.get((uid ?? "").trim()) || "—";

  // 5. Group by delivery STOP (userID + ship-to address), exactly like the
  //    batch detail page — different customers at the same placeholder never
  //    merge; one sticker per real destination.
  type Sticker = {
    key: string;
    forwarder: Forwarder;
    trackings: string[];
    fNos: string[];
    totalBoxes: number;
    totalWeight: number;
    totalVolume: number;
    cabinet: string | null;
  };
  const byKey = new Map<string, Sticker>();
  for (const f of forwarders) {
    const key = [
      f.userid ?? "",
      f.fshipby ?? "", f.faddressname ?? "", f.faddresslastname ?? "",
      f.faddressno ?? "", f.faddresssubdistrict ?? "",
      f.faddressdistrict ?? "", f.faddressprovince ?? "", f.faddresszipcode ?? "",
    ].join("|");
    const tracking = (f.ftrackingchn ?? "").trim();
    const fNo = (f.fidorco ?? `#${f.id}`).trim();
    const existing = byKey.get(key);
    if (existing) {
      if (tracking) existing.trackings.push(tracking);
      existing.fNos.push(fNo);
      existing.totalBoxes  += Number(f.famount ?? 0);
      existing.totalWeight += Number(f.fweight ?? 0);
      existing.totalVolume += Number(f.fvolume ?? 0);
    } else {
      byKey.set(key, {
        key,
        forwarder: f,
        trackings: tracking ? [tracking] : [],
        fNos: [fNo],
        totalBoxes:  Number(f.famount ?? 0),
        totalWeight: Number(f.fweight ?? 0),
        totalVolume: Number(f.fvolume ?? 0),
        cabinet: (f.fcabinetnumber ?? "").trim() || null,
      });
    }
  }
  const allStickers = Array.from(byKey.values());

  // Only stickers with a clear address get printed (spec: "ที่อยู่ชัดเจน").
  const clearStickers = allStickers.filter((s) => hasClearAddress(s.forwarder));
  const skippedCount = allStickers.length - clearStickers.length;

  // 6. Sort by DRIVING ROUTE — near→far (reuses the shared route-order SOT).
  clearStickers.sort(
    (a, b) =>
      routeOrderOf(a.forwarder.faddressdistrict) -
      routeOrderOf(b.forwarder.faddressdistrict),
  );

  // 7. Pre-render a Code128 of each sticker's PRIMARY tracking (server-only).
  const stickers = clearStickers.map((s, idx) => {
    const primaryTracking = s.trackings[0] ?? "";
    return {
      ...s,
      seq: idx + 1,
      barcode: primaryTracking ? code128SvgDataUrl(primaryTracking) : null,
      qr: primaryTracking ? qrSvgDataUrl(primaryTracking) : null,
    };
  });

  const dateLabel = batch.fddate
    ? new Date(batch.fddate).toLocaleString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Print-only styles — A4 portrait, 2-across sticker grid. Each sticker
          is a fixed ~90mm × 55mm card (≈ a common 2-column A4 label sheet). */}
      <style>{`
        .sticker-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4mm;
        }
        .sticker {
          box-sizing: border-box;
          border: 1.5px solid #000;
          border-radius: 2mm;
          padding: 3mm;
          min-height: 70mm;
          display: flex;
          flex-direction: column;
          break-inside: avoid;
          page-break-inside: avoid;
          background: #fff;
          color: #000;
        }
        @media screen {
          .sticker-grid { max-width: 210mm; margin: 0 auto; }
        }
        @media print {
          aside, .no-print { display: none !important; }
          html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
          .print-area { box-shadow: none !important; border: none !important; padding: 0 !important; }
          .sticker-grid { gap: 3mm; }
        }
        @page { size: A4 portrait; margin: 8mm; }
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
          <Link
            href={`/admin/drivers/${batch.id}/picking-list`}
            target="_blank"
            className="text-primary-600 hover:underline"
          >
            บิลหาสินค้า (คลัง) →
          </Link>
          <span className="text-xs text-gray-500">
            สติกเกอร์ที่อยู่ · รอบ #{batch.id} · {stickers.length} ป้าย
            {skippedCount > 0 ? ` · ข้าม ${skippedCount} (ไม่มีที่อยู่)` : ""}
          </span>
        </div>
        <PrintButton label="🏷 พิมพ์สติกเกอร์ที่อยู่" />
      </div>

      <main className="print-area mx-auto max-w-[900px] p-6 space-y-4">
        {/* Header meta — small, one line (keeps the paper for stickers) */}
        <div className="no-print flex flex-wrap items-end justify-between gap-2 border-b-2 border-black pb-2">
          <div>
            <h1 className="text-2xl font-black text-primary-700 leading-none">
              {SITE_NAME} · สติกเกอร์ที่อยู่จัดส่ง
            </h1>
            <p className="text-[11px] text-gray-600 mt-1">
              รอบ #{batch.id} · {batch.fdname ?? "—"} · คนขับ{" "}
              <span className="font-mono">{batch.fdadminid ?? "—"}</span> ·
              สร้าง {dateLabel} · เรียงตามเส้นทางจริง (ใกล้ → ไกล)
            </p>
          </div>
          <p className="text-[11px] text-gray-500">โทร {CONTACT.phoneCompanyDisplay}</p>
        </div>

        {skippedCount > 0 && (
          <p className="no-print rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠️ ข้าม {skippedCount} รายการที่ยังไม่มีที่อยู่จัดส่งชัดเจน (รับเอง
            ที่โกดัง / รอเซล–ลูกค้ากรอกที่อยู่) — พิมพ์เฉพาะที่อยู่ครบ{" "}
            {stickers.length} ป้าย
          </p>
        )}

        {stickers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              ไม่มีรายการที่มีที่อยู่จัดส่งชัดเจนในรอบนี้
            </p>
          </div>
        ) : (
          <div className="sticker-grid">
            {stickers.map((s) => {
              const f = s.forwarder;
              // ชื่อผู้รับ = ชื่อต้นเท่านั้น (ไม่มีนามสกุล · ปอน 2026-07-24 · ลด PII บนกล่อง).
              const custFirst = customerNameOf(f.userid).split(/\s+/)[0];
              const recipientName =
                (f.faddressname ?? "").trim() ||
                (custFirst && custFirst !== "—" ? custFirst : "");
              const recipient = recipientName ? `คุณ${recipientName}` : "ลูกค้า";
              const address = [
                f.faddressno,
                f.faddresssubdistrict && `ต.${f.faddresssubdistrict}`,
                f.faddressdistrict && `อ.${f.faddressdistrict}`,
                f.faddressprovince && `จ.${f.faddressprovince}`,
                f.faddresszipcode,
              ]
                .filter(Boolean)
                .join(" ");
              const trackingList = Array.from(new Set(s.trackings));
              const primaryTracking = trackingList[0] ?? "";
              const primaryFNo = s.fNos[0] ?? `#${f.id}`;
              const modeCode = s.cabinet ? transportModeFromCabinetName(s.cabinet) : null;
              const typeLabel = modeCode ? MODE_LABEL[modeCode] : null;
              return (
                <div key={s.key} className="sticker">
                  {/* ── หัว: โลโก้ Pacred + ผู้ส่ง | เลขที่ + แทรคกิ้งตัวใหญ่ (ปอน 2026-07-24 · ตามภาพ) ── */}
                  <div className="flex items-start justify-between gap-2 border-b border-black pb-1.5">
                    <div className="flex min-w-0 items-start gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/pacred-logo-red.png" alt="Pacred" className="h-[11mm] w-auto shrink-0 object-contain" />
                      <div className="min-w-0 leading-tight">
                        <div className="text-[8px] font-semibold text-gray-500">ผู้ส่ง / From</div>
                        <div className="text-[10px] font-bold leading-snug">{SITE_LEGAL_NAME_TH}</div>
                        <div className="text-[8px] leading-snug text-gray-600">{ADDRESSES.office.full}</div>
                        <div className="text-[8px] text-gray-600">โทร. {CONTACT.phoneCompanyDisplay}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right leading-none">
                      <div className="text-[9px] text-gray-500">เลขที่ #{primaryFNo}</div>
                      <div className="mt-0.5 break-all font-mono text-[15px] font-black tracking-tight">{primaryTracking || "—"}</div>
                      <div className="text-[9px] font-semibold text-gray-500">แทร็กกิ้ง</div>
                    </div>
                  </div>

                  {/* ── ถึง / TO — ผู้รับ + รหัส + จำนวนกล่อง ── */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="shrink-0 rounded bg-black px-1.5 py-0.5 text-[11px] font-bold text-white">ถึง / TO</span>
                    <span className="font-mono text-[13px] font-bold">{f.userid ?? "—"}</span>
                    <span className="ml-auto shrink-0 text-[12px] font-bold">{s.totalBoxes} กล่อง</span>
                  </div>
                  <div className="mt-1 flex-1">
                    <div className="text-[13px] font-bold leading-snug">{recipient}</div>
                    <div className="mt-0.5 text-[12px] font-medium leading-snug">{address}</div>
                  </div>

                  {/* ── ล่าง: ขนส่ง/บาร์โค้ด + น้ำหนัก/ปริมาตร | QR ── */}
                  <div className="mt-1.5 flex items-end justify-between gap-2 border-t border-black pt-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] leading-tight">
                        บริษัทขนส่ง : <span className="font-bold">{nameShipBy(f.fshipby)}</span>
                        {typeLabel && <> · ประเภท : <span className="font-bold">{typeLabel}</span></>}
                      </div>
                      <div className="text-[10px] leading-tight text-gray-700">
                        เลขแทรกกิ้ง : <span className="font-mono">{primaryTracking || "—"}</span> · จำนวน : {s.totalBoxes} กล่อง
                      </div>
                      {s.barcode ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.barcode} alt="barcode" className="mt-1 h-[9mm] w-full max-w-[52mm] object-contain" />
                      ) : (
                        <div className="mt-1 text-[10px] text-gray-500">— ไม่มีเลขแทรคกิง —</div>
                      )}
                      <div className="mt-1 text-[10px] leading-tight text-gray-700">
                        น้ำหนัก : {s.totalWeight.toFixed(2)} kg · ปริมาตร : {s.totalVolume.toFixed(5)} CBM
                        {f.fpallet ? <> · location : <span className="font-semibold">{f.fpallet}</span></> : null}
                      </div>
                    </div>
                    {s.qr && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.qr} alt="qr" className="h-[18mm] w-[18mm] shrink-0 object-contain" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="no-print text-[11px] text-gray-500 text-center pt-2">
          กดปุ่ม &quot;พิมพ์สติกเกอร์ที่อยู่&quot; ด้านบนเพื่อพิมพ์ หรือใช้
          คีย์บอร์ด Ctrl+P · สติกเกอร์เรียงตามเส้นทางจริง — ลอกแปะกล่องตามลำดับ
        </p>
      </main>
    </div>
  );
}
