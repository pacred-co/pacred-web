/**
 * /admin/drivers/[id] — Driver batch detail (faithful port of
 * `pcs-admin/forwarder-driver.php?page=detail&id=X` · 2026-05-30 ภูม #3).
 *
 * Shows ONE batch (tb_forwarder_driver) with all its delivery stops
 * (tb_forwarder_driver_item joined to tb_forwarder for recipient info).
 *
 * Legacy reference: forwarder-driver.php lines 1272-2104 (detail mode).
 *   - Header: batch name + driver + creator + box/tracking/stop counts
 *   - Countdown timer (endtime - now)
 *   - Google Maps waypoint-chain nav link
 *   - Per-stop card with: recipient · address · phone · tracking list
 *     + status badge · photo (if uploaded) · per-row "ขึ้นรถ/ส่งสำเร็จ/ไม่สำเร็จ"
 *   - "ยกเลิกรอบ" button for ops/super (no delivered items yet)
 *
 * This REPLACES the prior page that read REBUILT `forwarder_driver` UUID table.
 *
 * AGENTS.md §0a — Pacred Tailwind design + Lucide icons (NOT verbatim Bootstrap).
 * AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import {
  Truck, Clock, CheckCircle2, XCircle, MapPin, Phone,
  Package, AlertTriangle, ArrowLeft, Printer,
} from "lucide-react";
import { BatchCountdown } from "./batch-countdown";
import { BatchActions } from "./batch-actions";
import { CourierUrlInput } from "./courier-url-input";
import { TruckBookingCopyBox } from "./truck-booking-copy-box";

export const dynamic = "force-dynamic";

type FdStatus = "1" | "2" | "3";
type FdiStatus = "" | "1" | "2" | "3";

const BATCH_STATUS_LABEL: Record<FdStatus, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

const BATCH_STATUS_CLS: Record<FdStatus, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "3": "bg-rose-50 text-rose-700 border-rose-200",
};

const ITEM_STATUS_LABEL: Record<FdiStatus, string> = {
  "":  "ยังไม่ขึ้นรถ",
  "1": "กำลังส่ง",
  "2": "ส่งสำเร็จ",
  "3": "ส่งไม่ได้",
};

const ITEM_STATUS_CLS: Record<FdiStatus, string> = {
  "":  "bg-gray-100 text-gray-700 border-gray-200",
  "1": "bg-blue-100 text-blue-700 border-blue-200",
  "2": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "3": "bg-rose-100 text-rose-700 border-rose-200",
};

type Batch = {
  id:              number;
  fddate:          string | null;
  fdname:          string | null;
  fdadminid:       string | null;
  fdadmincreator:  string | null;
  fdstatus:        string | null;
  fdamount:        number | null;
  endtime:         string | null;
};

type Item = {
  id:             number;
  fdid:           number;
  fid:            number;
  fdistatus:      string | null;
  fdipictureon:   string | null;
  fdipictureoff:  string | null;
};

type Forwarder = {
  id:                       number;
  fidorco:                  string | null;
  fstatus:                  string | null;
  ftrackingchn:             string | null;
  fshipby:                  string | null;
  famount:                  number | null;
  fweight:                  number | null;
  fvolume:                  number | null;
  fpallet:                  string | null;
  fnote:                    string | null;
  fphotoend:                string | null;
  fcabinetnumber:           string | null;
  userid:                   string | null;
  faddressname:             string | null;
  faddresslastname:         string | null;
  faddressno:               string | null;
  faddresssubdistrict:      string | null;
  faddressdistrict:         string | null;
  faddressprovince:         string | null;
  faddresszipcode:          string | null;
  faddresstel:              string | null;
  faddresstel2:             string | null;
  faddresslatitude:         number | null;
  faddresslongitude:        number | null;
  courier_tracking_url:     string | null;
};

export default async function AdminDriverBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // warehouse included — warehouse staff issue/print the delivery note on-site
  // (ภูม 2026-06-17 · owner confirmed).
  const { user, roles } = await requireAdmin(["ops", "super", "driver", "warehouse"]);
  const { id } = await params;
  const batchId = Number.parseInt(id, 10);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const admin = createAdminClient();
  // ops/super/warehouse = staff who see ALL runs (bypass the driver-own-run check);
  // a bare driver sees only their own run.
  const isOpsOverride =
    roles.includes("ops") || roles.includes("super") || roles.includes("warehouse");

  // 1. Batch header
  const { data: batchData, error: batchErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdadminid, fdadmincreator, fdstatus, fdamount, endtime")
    .eq("id", batchId)
    .maybeSingle<Batch>();
  if (batchErr) {
    console.error(`/admin/drivers/${id}: batch read failed`, batchErr);
    throw new Error(`ไม่สามารถอ่านรอบจัดส่ง: ${batchErr.message}`);
  }
  if (!batchData) notFound();
  const batch = batchData;

  // For driver role — ensure they own this batch.
  if (!isOpsOverride) {
    const { data: myProfile, error: myProfileErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (myProfileErr) {
      console.error("[drivers/[id]] profiles lookup failed", {
        code: myProfileErr.code, message: myProfileErr.message,
      });
    }
    if (myProfile?.member_code !== batch.fdadminid) {
      notFound();
    }
  }

  // 2. All items in batch
  const { data: itemsData, error: itemsErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fid, fdistatus, fdipictureon, fdipictureoff")
    .eq("fdid", batchId);
  if (itemsErr) {
    console.error(`/admin/drivers/${id}: item read failed`, itemsErr);
    throw new Error(`ไม่สามารถอ่านรายการในรอบ: ${itemsErr.message}`);
  }
  const items = (itemsData ?? []) as Item[];

  // 3. Forwarder details (recipient + tracking)
  const fwdIds = Array.from(new Set(items.map((it) => it.fid)));
  let forwarders: Forwarder[] = [];
  if (fwdIds.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, fidorco, fstatus, ftrackingchn, fshipby, famount, fweight, fvolume, " +
        "fpallet, fnote, fphotoend, fcabinetnumber, userid, courier_tracking_url, " +
        "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
        "faddressdistrict, faddressprovince, faddresszipcode, " +
        "faddresstel, faddresstel2, faddresslatitude, faddresslongitude",
      )
      .in("id", fwdIds);
    if (fwdErr) {
      console.error(`/admin/drivers/${id}: forwarder read failed`, fwdErr);
    }
    forwarders = (fwdData ?? []) as unknown as Forwarder[];
  }
  const fwdById = new Map(forwarders.map((f) => [f.id, f]));

  // 4. Driver display info
  // tb_users uses CAMELCASE columns (CLAUDE.md exception · userID/userName).
  let driverName = "—";
  if (batch.fdadminid) {
    const { data: driverUser, error: driverUserErr } = await admin
      .from("tb_users")
      .select("userName, userLastName, userTel")
      .eq("userID", batch.fdadminid)
      .maybeSingle<{ userName: string | null; userLastName: string | null; userTel: string | null }>();
    if (driverUserErr) {
      console.error("[drivers/[id]] driver user lookup failed", {
        code: driverUserErr.code, message: driverUserErr.message,
      });
    }
    if (driverUser) {
      driverName = `${driverUser.userName ?? ""} ${driverUser.userLastName ?? ""}`.trim() || "—";
    }
  }

  // 5. Group items by recipient address (legacy "1 จุดส่ง" model)
  type Stop = {
    addressKey: string;
    forwarder:  Forwarder;
    items:      { item: Item; forwarder: Forwarder }[];
    totalBoxes: number;
    totalWeight: number;
    totalVolume: number;
  };
  const stopsByKey = new Map<string, Stop>();
  for (const it of items) {
    const f = fwdById.get(it.fid);
    if (!f) continue;
    const key = [
      f.fshipby ?? "", f.faddressname ?? "", f.faddresslastname ?? "",
      f.faddressno ?? "", f.faddresssubdistrict ?? "",
      f.faddressdistrict ?? "", f.faddressprovince ?? "", f.faddresszipcode ?? "",
    ].join("|");
    const existing = stopsByKey.get(key);
    if (existing) {
      existing.items.push({ item: it, forwarder: f });
      existing.totalBoxes  += Number(f.famount  ?? 0);
      existing.totalWeight += Number(f.fweight  ?? 0);
      existing.totalVolume += Number(f.fvolume  ?? 0);
    } else {
      stopsByKey.set(key, {
        addressKey:  key,
        forwarder:   f,
        items:       [{ item: it, forwarder: f }],
        totalBoxes:  Number(f.famount  ?? 0),
        totalWeight: Number(f.fweight  ?? 0),
        totalVolume: Number(f.fvolume  ?? 0),
      });
    }
  }
  const stops = Array.from(stopsByKey.values());

  // 6. Resolve signed photo URLs in parallel
  const stopsWithPhotos = await Promise.all(
    stops.map(async (stop) => {
      const itemsWithPhotos = await Promise.all(
        stop.items.map(async (entry) => {
          const [onUrl, offUrl] = await Promise.all([
            entry.item.fdipictureon ? getSignedBucketUrl("forwarder-covers", entry.item.fdipictureon) : Promise.resolve(null),
            entry.item.fdipictureoff ? getSignedBucketUrl("forwarder-covers", entry.item.fdipictureoff) : Promise.resolve(null),
          ]);
          return { ...entry, photoOnUrl: onUrl, photoOffUrl: offUrl };
        }),
      );
      return { ...stop, items: itemsWithPhotos };
    }),
  );

  // 7. Aggregates for header
  const totalItems     = items.length;
  const totalBoxes     = forwarders.reduce((s, f) => s + Number(f.famount ?? 0), 0);
  const deliveredCount = items.filter((it) => it.fdistatus === "2").length;
  const failedCount    = items.filter((it) => it.fdistatus === "3").length;
  const loadedCount    = items.filter((it) => it.fdistatus === "1").length;

  // 8. Google Maps waypoint URL (concatenate all stop addresses)
  const start = "13.701751401115621,100.36237187683579";  // legacy origin (Pacred warehouse)
  const waypoints = stops
    .map((stop) => {
      const f = stop.forwarder;
      const txt = [f.faddressno, f.faddresssubdistrict, f.faddressdistrict, f.faddressprovince, f.faddresszipcode]
        .filter(Boolean).join(" ");
      return encodeURIComponent(txt);
    })
    .filter(Boolean)
    .join("/");
  const googleMapsHref = waypoints
    ? `https://www.google.com/maps/dir/${start}/${waypoints}`
    : null;

  const fdstatus = (batch.fdstatus ?? "1") as FdStatus;

  // ── จองรถ (external-truck) LINE-paste block (2026-06-08 gap analysis #3) ──
  // Build ONE copyable text block from the batch's stops so ops can paste
  // straight into the truck-vendor LINE chat. Per-stop fields: SHIPMENT
  // (f-no list) · ตู้# · CBM · cartons · KG · POD (recipient) · delivery
  // address · Google-maps link · phones.
  const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const stopBlocks = stops.map((stop, idx) => {
    const f = stop.forwarder;
    const fNos = stop.items
      .map(({ forwarder }) => forwarder.fidorco ?? `#${forwarder.id}`)
      .join(", ");
    const cabinets = Array.from(
      new Set(stop.items.map(({ forwarder }) => (forwarder.fcabinetnumber ?? "").trim()).filter(Boolean)),
    ).join(", ");
    const recipient = `คุณ${f.faddressname ?? ""} ${f.faddresslastname ?? ""}`.trim();
    const address = [
      f.faddressno, f.faddresssubdistrict && `ต.${f.faddresssubdistrict}`,
      f.faddressdistrict && `อ.${f.faddressdistrict}`,
      f.faddressprovince && `จ.${f.faddressprovince}`, f.faddresszipcode,
    ].filter(Boolean).join(" ");
    const mapsUrl = (f.faddresslatitude && f.faddresslongitude)
      ? `https://www.google.com/maps/search/${f.faddresslatitude},${f.faddresslongitude}`
      : address
        ? `https://www.google.com/maps/search/${encodeURIComponent(address)}`
        : "-";
    const phones = Array.from(
      new Set(
        [f.faddresstel, f.faddresstel2]
          .map((p) => (p ?? "").trim())
          .filter((p) => p !== "" && p !== "-"),
      ),
    ).join(" / ") || "-";
    return [
      `จุดที่ ${idx + 1}`,
      `SHIPMENT: ${fNos || "-"}`,
      `ตู้#: ${cabinets || "-"}`,
      `CBM: ${fmt2(stop.totalVolume)} · กล่อง: ${stop.totalBoxes} · KG: ${fmt2(stop.totalWeight)}`,
      `POD: ${recipient || "-"}`,
      `ที่อยู่: ${address || "-"}`,
      `แผนที่: ${mapsUrl}`,
      `เบอร์โทร: ${phones}`,
    ].join("\n");
  });
  const totalCbmAll = stops.reduce((s, st) => s + st.totalVolume, 0);
  const totalWeightAll = stops.reduce((s, st) => s + st.totalWeight, 0);
  const truckBookingText = [
    `🚚 จองรถ — รอบ #${batch.id}${batch.fdname ? ` (${batch.fdname})` : ""}`,
    `ต้นทาง: โกดัง Pacred (สมุทรสาคร)`,
    `รวม ${stops.length} จุดส่ง · ${totalBoxes} กล่อง · ${fmt2(totalCbmAll)} CBM · ${fmt2(totalWeightAll)} KG`,
    batch.endtime ? `ส่งก่อนเวลา: ${new Date(batch.endtime).toLocaleString("th-TH")}` : "",
    "",
    ...stopBlocks,
    "",
    googleMapsHref ? `นำทางทุกจุด: ${googleMapsHref}` : "",
  ].filter((l) => l !== undefined && l !== null).join("\n");

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <ArrowLeft className="h-3 w-3" />
        กลับรายการ
      </Link>

      {/* Header card */}
      <section className="rounded-2xl border border-border bg-white shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              รอบจัดส่ง · เลขที่ #{batch.id}
            </p>
            <h1 className="mt-1 text-xl font-bold flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {batch.fdname ?? `รอบ #${batch.id}`}
            </h1>
            <div className="mt-1 text-xs text-muted space-y-0.5">
              <div>
                <span className="font-medium">คนขับ:</span>{" "}
                <span className="font-mono">{batch.fdadminid ?? "—"}</span> · {driverName}
              </div>
              <div>
                <span className="font-medium">ผู้สร้าง:</span> {batch.fdadmincreator ?? "—"}
              </div>
              {batch.fddate && (
                <div>
                  <span className="font-medium">วันที่สร้าง:</span>{" "}
                  {new Date(batch.fddate).toLocaleString("th-TH")}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${BATCH_STATUS_CLS[fdstatus]}`}>
              {fdstatus === "1" && <Clock className="h-3.5 w-3.5" />}
              {fdstatus === "2" && <CheckCircle2 className="h-3.5 w-3.5" />}
              {fdstatus === "3" && <XCircle className="h-3.5 w-3.5" />}
              {BATCH_STATUS_LABEL[fdstatus]}
            </span>
            {batch.endtime && fdstatus === "1" && (
              <BatchCountdown endTimeIso={batch.endtime} />
            )}
          </div>
        </div>

        {/* Metric strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border">
          <Metric icon={<Package className="h-4 w-4" />} label="แทรคกิ้ง" value={totalItems} />
          <Metric icon={<Package className="h-4 w-4" />} label="กล่อง" value={totalBoxes} />
          <Metric icon={<MapPin className="h-4 w-4" />} label="จุดส่ง" value={batch.fdamount ?? stops.length} />
          <Metric
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="ส่งแล้ว"
            value={`${deliveredCount} / ${totalItems}`}
            tone={deliveredCount === totalItems && totalItems > 0 ? "success" : "default"}
          />
        </div>

        {/* Status sub-line */}
        {(loadedCount > 0 || failedCount > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {loadedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-blue-700">
                <Truck className="h-3.5 w-3.5" /> กำลังส่ง {loadedCount}
              </span>
            )}
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> ส่งไม่ได้ {failedCount}
              </span>
            )}
          </div>
        )}

        {/* Actions row */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          {googleMapsHref && (
            <a
              href={googleMapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100"
            >
              <MapPin className="h-3.5 w-3.5" />
              Google นำทาง (ทุกจุด)
            </a>
          )}
          {/* re-sweep #12 — driver A4 picking slip (faithful port of
              legacy printDriver.php). Opens in a new tab so the driver
              keeps the batch detail open while printing. */}
          <Link
            href={`/admin/drivers/${batch.id}/print`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700 px-3 py-1.5 text-xs font-medium hover:bg-primary-100"
          >
            <Printer className="h-3.5 w-3.5" />
            พิมพ์ใบส่งสินค้า
          </Link>
          {isOpsOverride && fdstatus === "1" && deliveredCount === 0 && (
            <BatchActions batchId={batch.id} />
          )}
        </div>
      </section>

      {/* จองรถ (external-truck) LINE-paste block — ops/super only.
          2026-06-08 gap analysis #3. Collapsed by default. */}
      {isOpsOverride && stops.length > 0 && (
        <details className="rounded-2xl border border-border bg-white shadow-sm">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4" />
            จองรถภายนอก — คัดลอกข้อความส่ง LINE คนขับรถ
            <span className="ml-auto text-xs font-normal text-muted">
              {stops.length} จุด · {totalBoxes} กล่อง
            </span>
          </summary>
          <div className="px-5 pb-5 pt-1">
            <p className="mb-2 text-xs text-muted">
              คัดลอกบล็อกนี้แล้ว paste ลงแชต LINE ของรถเหมา/ขนส่งภายนอก — มี SHIPMENT · ตู้ ·
              CBM · กล่อง · KG · ผู้รับ · ที่อยู่ · ลิงก์แผนที่ · เบอร์โทร ครบทุกจุด
            </p>
            <TruckBookingCopyBox text={truckBookingText} />
          </div>
        </details>
      )}

      {/* Stops list */}
      {stopsWithPhotos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
          <p className="text-sm text-muted">ไม่มีรายการในรอบนี้</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {stopsWithPhotos.map((stop, idx) => (
            <li key={stop.addressKey} className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
              {/* Stop header */}
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary-500 text-white w-7 h-7 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base">
                    คุณ{stop.forwarder.faddressname ?? ""} {stop.forwarder.faddresslastname ?? ""}
                  </p>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    📍 {stop.forwarder.faddressno ?? ""}{" "}
                    ตำบล/แขวง {stop.forwarder.faddresssubdistrict ?? ""}{" "}
                    อำเภอ/เขต <span className="bg-amber-100 px-1 rounded text-amber-800">{stop.forwarder.faddressdistrict ?? ""}</span>{" "}
                    จังหวัด {stop.forwarder.faddressprovince ?? ""}{" "}
                    {stop.forwarder.faddresszipcode ?? ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {stop.forwarder.faddresstel && stop.forwarder.faddresstel !== "-" && (
                      <a
                        href={`tel:${stop.forwarder.faddresstel}`}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 text-xs hover:bg-blue-100"
                      >
                        <Phone className="h-3 w-3" /> {stop.forwarder.faddresstel}
                      </a>
                    )}
                    {stop.forwarder.faddresstel2 && stop.forwarder.faddresstel2 !== "-" && stop.forwarder.faddresstel2 !== stop.forwarder.faddresstel && (
                      <a
                        href={`tel:${stop.forwarder.faddresstel2}`}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 text-xs hover:bg-blue-100"
                      >
                        <Phone className="h-3 w-3" /> {stop.forwarder.faddresstel2}
                      </a>
                    )}
                    {(stop.forwarder.faddresslatitude && stop.forwarder.faddresslongitude) ? (
                      <a
                        href={`https://www.google.com/maps/search/${stop.forwarder.faddresslatitude},${stop.forwarder.faddresslongitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 text-xs hover:bg-emerald-100"
                      >
                        <MapPin className="h-3 w-3" /> แผนที่
                      </a>
                    ) : (
                      <a
                        href={`https://www.google.com/maps/search/${encodeURIComponent([
                          stop.forwarder.faddressno, stop.forwarder.faddresssubdistrict,
                          stop.forwarder.faddressdistrict, stop.forwarder.faddressprovince,
                          stop.forwarder.faddresszipcode,
                        ].filter(Boolean).join(" "))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 text-xs hover:bg-gray-100"
                      >
                        <MapPin className="h-3 w-3" /> ค้นที่อยู่
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Tracking sub-table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-2 py-1.5">F-no</th>
                      <th className="px-2 py-1.5">เลขแทรคกิ้ง</th>
                      <th className="px-2 py-1.5">ลูกค้า</th>
                      <th className="px-2 py-1.5 text-right">กล่อง</th>
                      <th className="px-2 py-1.5 text-right">นน.(kg)</th>
                      <th className="px-2 py-1.5 text-right">ปริมาตร(m³)</th>
                      <th className="px-2 py-1.5">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stop.items.map(({ item, forwarder, photoOnUrl, photoOffUrl }) => {
                      const fdistatus = (item.fdistatus ?? "") as FdiStatus;
                      const fNo = forwarder.fidorco ?? `#${forwarder.id}`;
                      return (
                        <tr key={item.id} className="border-t border-border align-top">
                          <td className="px-2 py-1.5">
                            <Link
                              href={`/admin/forwarders/${fNo}`}
                              className="font-mono text-primary-600 hover:underline"
                            >
                              {fNo}
                            </Link>
                          </td>
                          <td className="px-2 py-1.5">
                            <div>{forwarder.ftrackingchn ?? "—"}</div>
                            {forwarder.fpallet && (
                              <div className="text-[10px] text-muted">loc: {forwarder.fpallet}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{forwarder.userid ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right">{forwarder.famount ?? 0}</td>
                          <td className="px-2 py-1.5 text-right">{Number(forwarder.fweight ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right">{Number(forwarder.fvolume ?? 0).toFixed(3)}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ITEM_STATUS_CLS[fdistatus]}`}
                            >
                              {ITEM_STATUS_LABEL[fdistatus]}
                            </span>
                            {(photoOnUrl || photoOffUrl) && (
                              <div className="mt-1 flex gap-1">
                                {photoOnUrl && (
                                  <a href={photoOnUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">📦 ขึ้นรถ</a>
                                )}
                                {photoOffUrl && (
                                  <a href={photoOffUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-600 hover:underline">✅ ส่ง</a>
                                )}
                              </div>
                            )}
                            {forwarder.fnote && (
                              <div className="mt-1 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1 py-0.5">
                                📝 {forwarder.fnote}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Stop totals */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-border/50">
                <div className="text-muted">
                  รวม {stop.items.length} แทรคกิ้ง · {stop.totalBoxes} กล่อง ·{" "}
                  {stop.totalWeight.toFixed(2)} kg · {stop.totalVolume.toFixed(3)} m³
                </div>
                <Link
                  href={`/admin/drivers/work?tab=pending`}
                  className="text-primary-600 hover:underline"
                >
                  → ดูใน work-list คนขับ
                </Link>
              </div>

              {/* External-courier tracking URL — ops/super only. One input
                  per forwarder row in this stop (the customer sees the link
                  on /service-import/[fNo]). 2026-06-08 gap analysis #2. */}
              {isOpsOverride && (
                <div className="space-y-1.5">
                  {stop.items.map(({ forwarder }) => (
                    <CourierUrlInput
                      key={`courier-${forwarder.id}`}
                      forwarderId={forwarder.id}
                      initialUrl={forwarder.courier_tracking_url}
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="text-[10px] text-muted">
        ฐานข้อมูล: legacy <code className="rounded bg-surface-alt px-1">tb_forwarder_driver</code> #{batch.id}{" "}
        — {stops.length} จุดส่ง · ดำเนินการสถานะรายการในหน้า{" "}
        <Link href={`/admin/drivers/work?driver=${batch.fdadminid}`} className="text-primary-600 hover:underline">
          /admin/drivers/work
        </Link>
      </p>
    </main>
  );
}

function Metric({
  icon, label, value, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "default" | "success";
}) {
  const cls = tone === "success"
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : "bg-surface-alt border-border";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}
