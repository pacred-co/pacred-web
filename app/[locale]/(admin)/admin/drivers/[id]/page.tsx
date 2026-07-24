/**
 * /admin/drivers/[id] — Driver batch detail (faithful port of
 * `pcs-admin/forwarder-driver.php` detail mode · L1630-1880).
 *
 * Shows ONE batch (tb_forwarder_driver) with all its delivery stops
 * (tb_forwarder_driver_item joined to tb_forwarder for recipient info),
 * GROUPED BY delivery destination (fShipBy + recipient + address) exactly like
 * legacy. Each stop renders as ONE clean 3-zone row — matching the legacy table
 * (จำนวน+สถานะ+รูปส่ง | บริษัทขนส่ง+ที่อยู่+โทร | ตารางย่อยออเดอร์+cover+รวม):
 *   2026-06-23 ภูม — "เอาให้เหมือน legacy เป๊ะ ดูง่าย สะอาด". Was a tall card-per-stop
 *   with a per-item status column + courier inputs interleaved = cluttered.
 *
 * AGENTS.md §0a — legacy IA + workflow, Pacred Tailwind polish (NOT verbatim Bootstrap).
 * AGENTS.md §0c — every Supabase query destructures `error`.
 * AGENTS.md §0g — self-explaining row (count · status · photo · recipient · items · next-action).
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import {
  Truck, Clock, CheckCircle2, XCircle, MapPin, Phone,
  Package, AlertTriangle, ArrowLeft, Printer, Camera, Link2, ClipboardList, Tag, ChevronDown,
} from "lucide-react";
import { BatchCountdown } from "./batch-countdown";
import { DriverPhotoEditDialog } from "./driver-photo-edit-dialog";
import { routeOrderOf } from "@/lib/admin/driver-route-order";
import { BILL_BADGE_CLASS, DriverBillViewModal } from "./driver-bill-view-modal";
import { BatchManage, RemoveItemButton } from "./batch-manage";
import { PinLocationButton } from "./pin-location-button";
import { ExpandableText } from "@/components/admin/expandable-text";
import { CourierUrlInput } from "./courier-url-input";
import { TruckBookingCopyBox } from "./truck-booking-copy-box";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";

export const dynamic = "force-dynamic";

type FdStatus = "1" | "2" | "3";
type FdiStatus = "" | "1" | "2" | "3";

const BATCH_STATUS_LABEL: Record<FdStatus, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

// Solid legacy badge palette (badge-warning/success/danger) — matches the drivers
// list STATUS_CLS + the legacy "สถานะ : สำเร็จ" green pill. State color is scannable
// LOGIC → solid, not a faint pastel.
const BATCH_STATUS_CLS: Record<FdStatus, string> = {
  "1": "bg-[#ff9149] text-white border-transparent",
  "2": "bg-[#28d094] text-white border-transparent",
  "3": "bg-[#ff4961] text-white border-transparent",
};

const ITEM_STATUS_CLS: Record<FdiStatus, string> = {
  "":  "bg-slate-400 text-white border-transparent",
  "1": "bg-[#1e9ff2] text-white border-transparent",
  "2": "bg-[#28d094] text-white border-transparent",
  "3": "bg-[#ff4961] text-white border-transparent",
};

// Faithful nameShipBy() — legacy pcs-admin/include/function.php L185-242. A driver
// batch carries PCS* (company self-delivery) or a courier code; the obscure
// up-country carriers (12-47) almost never appear in a local run, so we map the
// common set + fall back to the raw code.
const SHIP_BY_LABEL: Record<string, string> = {
  PCS: "รับเองโกดัง Pacred", PCSE: "PRE Express", PCSF: "PRF เหมาๆ",
  F: "บริษัทจัดหาให้อัตโนมัติ",
  "1": "DHL Express", "2": "Flash Express", "3": "J.K. เอ็กซ์เพรส", "4": "Kerry Express",
  "5": "Nim Express", "8": "SCG Express", "11": "ไปรษณีย์ไทย",
  "21": "นิ่มซี่เส็งขนส่ง 1988", "24": "J&T Express",
};
function shipByLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  return SHIP_BY_LABEL[c] ?? (c || "ไม่ระบุขนส่ง");
}
// PCS / PCSE / PCSF = company self-delivery (driver run · legacy L1828 renders the
// red "เหมาเหมา" badge + a map-pin for these); any other code = an outside courier.
function isSelfDelivery(code: string | null | undefined): boolean {
  const c = (code ?? "").trim();
  return c === "PCS" || c === "PCSE" || c === "PCSF";
}

// ปุ่มพิมพ์ (per-stop) — gradient badge. ประกาศเป็น const ฝั่ง SERVER ตรงนี้ เพราะ
// BILL_BADGE_CLASS export มาจากไฟล์ "use client" (driver-bill-view-modal) → พอ import
// เข้ามาในหน้า server มันกลายเป็น client-reference ใช้เป็น raw className บน server ไม่ได้
// (throw "Attempted to call BILL_BADGE_CLASS from the server"). BILL_BADGE_CLASS ยังใช้ได้
// ตอนส่งเป็น PROP (triggerClassName) ให้ <DriverBillViewModal> — คนละทาง. ไม่ใส่ px/py/text
// ในนี้ เพื่อให้แต่ละที่กำหนดขนาดเองได้ (desktop เล็ก · mobile ใหญ่).
const PRINT_BADGE_CLS =
  "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#A01824] to-[#C82333] " +
  "font-semibold text-white shadow-sm hover:from-[#87141E] hover:to-[#B21F2D]";

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
  fdinote:        string | null;  // 0213: เหตุผล "ส่งไม่ได้" (โชว์คาแถว)
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
  fcover:                   string | null;
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
    isGodRole(roles) || roles.includes("ops") || roles.includes("warehouse");

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
    .select("id, fdid, fid, fdistatus, fdipictureon, fdipictureoff, fdinote")
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
        "fpallet, fnote, fphotoend, fcabinetnumber, fcover, userid, courier_tracking_url, " +
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

  // 3b. Resolve the CUSTOMER name for every forwarder row (legacy links by
  // `userid` TEXT, not an FK → one tb_users .in() lookup · same local pattern
  // as the driver-name lookup below + loadDriverDirectory on /drivers/work).
  // The driver must see WHOSE parcel it is (PR + name + tracking), not just an
  // order number. tb_users uses CAMELCASE cols (CLAUDE.md exception).
  const custIds = Array.from(
    new Set(forwarders.map((f) => (f.userid ?? "").trim()).filter(Boolean)),
  );
  const custNameById = new Map<string, string>();
  if (custIds.length > 0) {
    const [{ data: custRows, error: custErr }, corpNames] = await Promise.all([
      admin
        .from("tb_users")
        .select("userID, userName, userLastName, userCompany")
        .in("userID", custIds),
      fetchCorporateNameMap(admin, custIds),
    ]);
    if (custErr) {
      console.error(`/admin/drivers/${id}: customer name lookup failed`, custErr);
    }
    for (const u of (custRows ?? []) as { userID: string; userName: string | null; userLastName: string | null; userCompany: string | null }[]) {
      const name = resolveBillingIdentity({
        userCompany: u.userCompany,
        userName: u.userName,
        userLastName: u.userLastName,
        corp: corpRowFromName(corpNames.get(u.userID)),
      }).name;
      if (name) custNameById.set(u.userID, name);
    }
  }
  const customerNameOf = (uid: string | null | undefined): string =>
    custNameById.get((uid ?? "").trim()) ?? "—";

  // A delivery row still on the warehouse self-pickup placeholder
  // ("รับที่โกดัง Pacred" — the legacy MOMO/commit default) has no real
  // recipient/address. Show WHOSE parcel it is (the customer) instead of the
  // placeholder, and flag that the delivery address isn't set yet.
  const isWarehousePlaceholder = (name: string | null | undefined): boolean => {
    const n = (name ?? "").trim();
    return n === "" || /รับ.*โกดัง|รับเอง|pacred/i.test(n);
  };
  const recipientNameOf = (f: Forwarder): string => {
    if (isWarehousePlaceholder(f.faddressname)) return customerNameOf(f.userid);
    return `คุณ${(f.faddressname ?? "").trim()} ${(f.faddresslastname ?? "").trim()}`.trim();
  };

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

  // 4a. Resolve the STAFF display names for ดำเนินงาน (คนขับ = fdadminid) +
  // มอบหมายงาน (ผู้สั่งงาน = fdadmincreator). Both are admin member_codes (AD###)
  // that live in `profiles`, NOT tb_users — so the tb_users driver lookup above
  // returns "—" for a real staff driver (ภูม 2026-07-10 "อยากให้ขึ้นเป็นชื่อ ไม่ใช่รหัส").
  // One `profiles` .in() covers both codes.
  const adminCodes = Array.from(
    new Set([batch.fdadminid, batch.fdadmincreator].map((c) => (c ?? "").trim()).filter(Boolean)),
  );
  const adminNameByCode = new Map<string, string>();
  // รูปโปรไฟล์พนักงาน (ปอน 2026-07-24) — โชว์ avatar จริงในกล่อง ดำเนินงาน/มอบหมาย
  // (หัวมือถือ) แทนตัวอักษรย่อ. avatar_url อยู่ใน profiles เดียวกับชื่อ.
  const adminAvatarRawByCode = new Map<string, string>();
  if (adminCodes.length > 0) {
    const { data: adminRows, error: adminNameErr } = await admin
      .from("profiles")
      .select("member_code, first_name, last_name, avatar_url")
      .in("member_code", adminCodes);
    if (adminNameErr) {
      console.error(`/admin/drivers/${id}: staff name lookup failed`, {
        code: adminNameErr.code, message: adminNameErr.message,
      });
    }
    for (const p of (adminRows ?? []) as { member_code: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null }[]) {
      const code = (p.member_code ?? "").trim();
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      if (code && name) adminNameByCode.set(code, name);
      if (code && (p.avatar_url ?? "").trim()) adminAvatarRawByCode.set(code, (p.avatar_url ?? "").trim());
    }
  }
  const adminNameOf = (code: string | null | undefined): string =>
    adminNameByCode.get((code ?? "").trim()) ?? "";
  // Prefer the profiles staff name; fall back to the tb_users driver name (for a
  // customer-driver) then to the raw code so the field is never blank.
  const driverDisplayName = adminNameOf(batch.fdadminid) || (driverName !== "—" ? driverName : "") || (batch.fdadminid ?? "");
  const creatorDisplayName = adminNameOf(batch.fdadmincreator) || (batch.fdadmincreator ?? "");
  // resolve รูปโปรไฟล์ (คนขับ + ผู้มอบหมาย) — resolveLegacyUrl ผ่าน full URL / เซ็น path ให้
  const driverAvatarRaw = adminAvatarRawByCode.get((batch.fdadminid ?? "").trim());
  const creatorAvatarRaw = adminAvatarRawByCode.get((batch.fdadmincreator ?? "").trim());
  const [driverAvatar, creatorAvatar] = await Promise.all([
    driverAvatarRaw ? resolveLegacyUrl(driverAvatarRaw, "admin-avatar") : Promise.resolve(null),
    creatorAvatarRaw ? resolveLegacyUrl(creatorAvatarRaw, "admin-avatar") : Promise.resolve(null),
  ]);

  // 4b. Active driver roster — for the "เปลี่ยนคนขับ" dropdown (ops only).
  let driverOptions: { code: string; name: string }[] = [];
  if (isOpsOverride) {
    const { data: dRows, error: dErr } = await admin
      .from("admins")
      .select("profile:profiles!profile_id(member_code, first_name, last_name)")
      .eq("role", "driver")
      .eq("is_active", true);
    if (dErr) {
      console.error(`/admin/drivers/${id}: driver roster read failed`, dErr);
    }
    type DProf = { member_code: string | null; first_name: string | null; last_name: string | null };
    driverOptions = ((dRows ?? []) as unknown as { profile: DProf | DProf[] | null }[])
      .map((r) => {
        const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
        const code = (p?.member_code ?? "").trim();
        if (!code) return null;
        const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || code;
        return { code, name };
      })
      .filter((d): d is { code: string; name: string } => d !== null);
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
    // Legacy keys a driver stop on CONCAT(userID, address) (forwarder-driver.php
    // L918) so DIFFERENT customers never merge — critical when several orders
    // share the warehouse self-pickup placeholder address ("รับที่โกดัง Pacred").
    // Without userid, two customers left at that placeholder collapse into one
    // stop (the PR7429 + PR10190 "ปนกัน" bug ภูม flagged 2026-06-26).
    const key = [
      f.userid ?? "",
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

  // 6. Resolve signed photo URLs (delivery photos + order covers) in parallel
  const stopsWithPhotos = await Promise.all(
    stops.map(async (stop) => {
      const itemsWithPhotos = await Promise.all(
        stop.items.map(async (entry) => {
          const [onUrl, offUrl, coverUrl] = await Promise.all([
            entry.item.fdipictureon ? getSignedBucketUrl("forwarder-covers", entry.item.fdipictureon) : Promise.resolve(null),
            entry.item.fdipictureoff ? getSignedBucketUrl("forwarder-covers", entry.item.fdipictureoff) : Promise.resolve(null),
            entry.forwarder.fcover ? resolveLegacyUrl(entry.forwarder.fcover, "cover") : Promise.resolve(null),
          ]);
          return { ...entry, photoOnUrl: onUrl, photoOffUrl: offUrl, coverUrl };
        }),
      );
      return { ...stop, items: itemsWithPhotos };
    }),
  );

  // เรียงจุดส่งตามเส้นทางจริง near→far (ปอน 2026-07-24) — เลขลำดับบนการ์ด/แถว
  // = ลำดับการจัดส่งจริง (SOT เดียวกับหน้าสติกเกอร์ · lib/admin/driver-route-order).
  stopsWithPhotos.sort(
    (a, b) =>
      routeOrderOf(a.forwarder.faddressdistrict) -
      routeOrderOf(b.forwarder.faddressdistrict),
  );

  // 6b. รูปตอนขึ้นรถ (fdipictureon) — ภูม 2026-07-10: the header's top-right area
  // shows a neat gallery of the LOADING photos (proof of what got put on the
  // truck for this run). If the driver snapped no loading photo yet, fall back
  // to the delivery photos so the panel is never pointlessly empty when photos
  // DO exist. Each thumbnail is labelled by kind (ขึ้นรถ / ส่งแล้ว).
  type RunPhoto = { url: string; kind: "on" | "off"; tracking: string };
  const loadPhotos: RunPhoto[] = [];
  const deliverPhotos: RunPhoto[] = [];
  for (const stop of stopsWithPhotos) {
    for (const entry of stop.items) {
      const tracking = entry.forwarder.ftrackingchn ?? "";
      if (entry.photoOnUrl) loadPhotos.push({ url: entry.photoOnUrl, kind: "on", tracking });
      if (entry.photoOffUrl) deliverPhotos.push({ url: entry.photoOffUrl, kind: "off", tracking });
    }
  }
  const runPhotos = loadPhotos.length > 0 ? loadPhotos : deliverPhotos;
  const photoPanelLabel = loadPhotos.length > 0
    ? "รูปตอนขึ้นรถ"
    : deliverPhotos.length > 0
      ? "รูปส่งของ (ยังไม่มีรูปขึ้นรถ)"
      : "รูปตอนขึ้นรถ";

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
    const recipient = recipientNameOf(f);
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
    batch.endtime ? `ส่งก่อนเวลา: ${formatThaiDateTime(batch.endtime)}` : "",
    "",
    ...stopBlocks,
    "",
    googleMapsHref ? `นำทางทุกจุด: ${googleMapsHref}` : "",
  ].filter((l) => l !== undefined && l !== null).join("\n");

  // "ดูบิลใบเสร็จในรายการนี้" — consolidated grouped view (legacy addFromBill action=3 ·
  // ภูม 2026-07-10). Reuses the already-loaded stops (no extra fetch).
  const billGroups = stopsWithPhotos.map((stop) => {
    const f = stop.forwarder;
    const address = [
      f.faddressno,
      f.faddresssubdistrict ? `ตำบล/แขวง ${f.faddresssubdistrict}` : "",
      f.faddressdistrict ? `อำเภอ/เขต ${f.faddressdistrict}` : "",
      f.faddressprovince ? `จังหวัด ${f.faddressprovince}` : "",
      f.faddresszipcode,
    ].filter(Boolean).join(" ");
    const phones = [f.faddresstel, f.faddresstel2]
      .map((p) => (p ?? "").trim())
      .filter((p, i, a) => p !== "" && p !== "-" && a.indexOf(p) === i);
    return {
      key: stop.addressKey,
      pr: f.userid ?? "—",
      customerName: customerNameOf(f.userid),
      carrier: shipByLabel(f.fshipby),
      address,
      phones,
      items: stop.items.map(({ forwarder }, i) => ({
        no: i + 1,
        fid: forwarder.id,
        orderNo: forwarder.fidorco ?? `#${forwarder.id}`,
        pr: forwarder.userid ?? "—",
        customerName: customerNameOf(forwarder.userid),
        tracking: forwarder.ftrackingchn ?? "—",
        location: forwarder.fpallet ?? "",
        boxes: Number(forwarder.famount ?? 0),
        weight: Number(forwarder.fweight ?? 0),
        cbm: Number(forwarder.fvolume ?? 0),
      })),
      totalBoxes: stop.totalBoxes,
      totalWeight: stop.totalWeight,
      totalCbm: stop.totalVolume,
    };
  });

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <ArrowLeft className="h-3 w-3" />
        กลับรายการ
      </Link>

      {/* ── หัวมือถือ (ปอน 2026-07-24 · ตามภาพ 2) — จอ <lg ใช้การ์ดนี้ · ≥lg ใช้หัวเดิม ── */}
      <section className="lg:hidden rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
        {/* หัวข้อ + สถานะ */}
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 h-6 w-6 flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold leading-tight">รายการที่ต้องส่งของ #{batch.id}</h1>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${BATCH_STATUS_CLS[fdstatus]}`}>
                {fdstatus === "1" && <Clock className="h-3 w-3" />}
                {fdstatus === "2" && <CheckCircle2 className="h-3 w-3" />}
                {fdstatus === "3" && <XCircle className="h-3 w-3" />}
                {BATCH_STATUS_LABEL[fdstatus]}
              </span>
            </div>
            {batch.fddate && <p className="text-xs text-muted">สร้าง {formatThaiDateTime(batch.fddate)}</p>}
          </div>
        </div>

        {/* กล่องสถิติ 3 ช่อง */}
        <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border">
          <div className="px-2 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted"><Package className="h-3.5 w-3.5" /> แทรคกิ้ง</div>
            <div className="mt-0.5 text-lg font-bold">{totalItems}</div>
          </div>
          <div className="px-2 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted"><MapPin className="h-3.5 w-3.5" /> จุดส่ง</div>
            <div className="mt-0.5 text-lg font-bold">{batch.fdamount ?? stops.length}</div>
          </div>
          <div className="px-2 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted"><Package className="h-3.5 w-3.5" /> กล่อง</div>
            <div className="mt-0.5 text-lg font-bold">{totalBoxes}</div>
          </div>
        </div>

        {/* นับถอยหลัง — label + เวลา in-flow (ปอน 2026-07-24) ไม่ล้น = ไม่ทับแถวบน.
            ปุ่ม "ดูใบส่งสินค้า" (popup) ถูกถอดออกจากมือถือ 2026-07-24 (ปอน).
            §0d ยังผ่าน: บนมือถือเปิดใบเดียวกันได้ที่ปุ่ม "พิมพ์บิลจัดส่ง" ด้านล่าง
            (ชี้ /print ตัวเดียวกับที่ popup ใช้) · popup ยังอยู่บนจอคอม. */}
        {batch.endtime && (
          <div className="flex items-end justify-end">
            <div className="flex shrink-0 flex-col items-end">
              <span className="mb-0.5 whitespace-nowrap text-[11px] leading-none text-muted">
                ส่งของก่อนเวลา
              </span>
              <BatchCountdown endTimeIso={batch.endtime} status={fdstatus} size="lg" />
            </div>
          </div>
        )}

        {/* ผู้ดำเนินงาน / มอบหมาย */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            {driverAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driverAvatar} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-primary-200" />
            ) : (
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">{(driverDisplayName || "?").trim().charAt(0)}</span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-muted">ดำเนินงาน</p>
              <p className="truncate text-xs font-semibold">{driverDisplayName || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            {creatorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creatorAvatar} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-primary-200" />
            ) : (
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">{(creatorDisplayName || "?").trim().charAt(0)}</span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-muted">มอบหมาย</p>
              <p className="truncate text-xs font-semibold">{creatorDisplayName || "—"}</p>
            </div>
          </div>
        </div>

        {/* ปุ่ม นำทาง + พิมพ์ (2×2) */}
        <div className="grid grid-cols-2 gap-2">
          {googleMapsHref && (
            <a href={googleMapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-emerald-600">
              <MapPin className="h-4 w-4" /> Google นำทาง
            </a>
          )}
          <Link href={`/admin/drivers/${batch.id}/print`} target="_blank" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#A01824] to-[#C82333] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-[#87141E] hover:to-[#B21F2D]">
            <Printer className="h-4 w-4" /> พิมพ์บิลจัดส่ง
          </Link>
          <Link href={`/admin/drivers/${batch.id}/picking-list`} target="_blank" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-600 to-amber-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-amber-700 hover:to-amber-600">
            <ClipboardList className="h-4 w-4" /> พิมพ์บิลหาสินค้า
          </Link>
          <Link href={`/admin/drivers/${batch.id}/stickers`} target="_blank" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-sky-600 to-sky-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-sky-600">
            <Tag className="h-4 w-4" /> พิมพ์สติกเกอร์
          </Link>
        </div>
      </section>

      {/* Header card — เดสก์ท็อป (≥lg) */}
      <section className="hidden lg:block rounded-2xl border border-border bg-white shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            {/* legacy forwarder-driver.php L1635 — "รายการที่ต้องส่งของ เลขที่รายการ #ID" */}
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              รายการที่ต้องส่งของ · เลขที่รายการ #{batch.id}
            </p>
            <h1 className="mt-1 text-xl font-bold flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {batch.fdname ?? `รอบ #${batch.id}`}
            </h1>
            <div className="mt-1 text-xs text-muted space-y-0.5">
              {/* legacy L1637 ชื่อเรื่อง / L1680 ดำเนินงาน / L1681 มอบหมายงาน / L1636 วันที่สร้าง */}
              <div>
                <span className="font-medium">ชื่อเรื่อง :</span> {batch.fdname ?? `รอบ #${batch.id}`}
              </div>
              <div>
                <span className="font-medium">ดำเนินงาน (คนขับ) :</span>{" "}
                <span className="font-semibold text-foreground">{driverDisplayName || "—"}</span>
                {batch.fdadminid && (
                  <span className="font-mono text-[11px] text-muted"> ({batch.fdadminid})</span>
                )}
              </div>
              <div>
                <span className="font-medium">มอบหมายงาน :</span>{" "}
                <span className="font-semibold text-foreground">{creatorDisplayName || "—"}</span>
                {batch.fdadmincreator && (
                  <span className="font-mono text-[11px] text-muted"> ({batch.fdadmincreator})</span>
                )}
              </div>
              {batch.fddate && (
                <div>
                  <span className="font-medium">วันที่สร้าง :</span>{" "}
                  {formatThaiDateTime(batch.fddate)}
                </div>
              )}
            </div>

            {/* ดูบิลใบเสร็จในรายการนี้ (legacy #listBill → addFromBill action=3 · ภูม 2026-07-10).
                ปอน 2026-07-23 — ยกขึ้นมาไว้ใต้ข้อมูลรอบ: staff เปิดดูบิลบ่อยกว่าสั่งพิมพ์มาก
                แต่เดิมมันไปอยู่ท้ายแถวปุ่มพิมพ์ ต้องกวาดตาหา. */}
            <div className="mt-2">
              <DriverBillViewModal
                groups={billGroups}
                batchName={batch.fdname ?? `#${batch.id}`}
                printHref={`/admin/drivers/${batch.id}/print`}
                slipHref={`/admin/drivers/${batch.id}/delivery-slip`}
                triggerClassName={BILL_BADGE_CLASS}
              />
            </div>
          </div>

          {/* right cluster: รูปขึ้นรถ panel (ภูม 2026-07-10) + status/countdown col */}
          <div className="flex items-start gap-4 flex-wrap justify-end">
          <LoadingPhotoPanel photos={runPhotos} label={photoPanelLabel} />
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${BATCH_STATUS_CLS[fdstatus]}`}>
              {fdstatus === "1" && <Clock className="h-3.5 w-3.5" />}
              {fdstatus === "2" && <CheckCircle2 className="h-3.5 w-3.5" />}
              {fdstatus === "3" && <XCircle className="h-3.5 w-3.5" />}
              {BATCH_STATUS_LABEL[fdstatus]}
            </span>
            {/* legacy L1644-1652 "ส่งของก่อนเวลา :" + live counter — legacy renders this for
                ANY status (ticks down while open · shows หมดเวลา once passed), so we show it
                whenever the batch has a deadline, not only while open (ภูม 2026-07-10). */}
            {batch.endtime && (
              <>
                <span className="text-[11px] text-muted">
                  ส่งของก่อนเวลา : {formatThaiDateTime(batch.endtime)}
                </span>
                <BatchCountdown endTimeIso={batch.endtime} status={fdstatus} />
              </>
            )}
          </div>
          </div>
        </div>

        {/* Metric strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border">
          <Metric icon={<Package className="h-4 w-4" />} label="แทรคกิ้ง" value={totalItems} />
          <Metric icon={<Package className="h-4 w-4" />} label="กล่อง" value={totalBoxes} />
          <Metric icon={<MapPin className="h-4 w-4" />} label="จุดที่ส่ง" value={batch.fdamount ?? stops.length} />
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
          {/* พี่ป๊อป spec 2026-07-06 #7 — the two split logistics documents.
              Opens in new tabs so the batch detail stays open while printing.
              • บิลหาสินค้า (Picking List) → คลัง หยิบของตามตำแหน่งจัดเก็บ
              • บิลจัดส่ง (Delivery Note) → คนขับ ส่งตามที่อยู่ (printDriver.php) */}
          <Link
            href={`/admin/drivers/${batch.id}/picking-list`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            พิมพ์บิลหาสินค้า (คลัง)
          </Link>
          <Link
            href={`/admin/drivers/${batch.id}/print`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700 px-3 py-1.5 text-xs font-medium hover:bg-primary-100"
          >
            <Printer className="h-3.5 w-3.5" />
            พิมพ์บิลจัดส่ง (คนขับ)
          </Link>
          {/* พี่ป๊อป spec 2026-07-06 · §จัดส่ง — route-ordered delivery-address
              stickers (peel & slap on the carton · sorted near→far by district). */}
          <Link
            href={`/admin/drivers/${batch.id}/stickers`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 px-3 py-1.5 text-xs font-medium hover:bg-sky-100"
          >
            <Tag className="h-3.5 w-3.5" />
            พิมพ์สติกเกอร์ที่อยู่ (เรียงตามเส้นทาง)
          </Link>
          {isOpsOverride && (
            <BatchManage
              batchId={batch.id}
              fdstatus={fdstatus}
              deliveredCount={deliveredCount}
              currentDriverCode={batch.fdadminid}
              drivers={driverOptions}
            />
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

      {/* ── Stops — one clean 3-zone row per delivery point (legacy detail table) ── */}
      {stopsWithPhotos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
          <p className="text-sm text-muted">ไม่มีรายการในรอบนี้</p>
        </div>
      ) : (
        <div className="hidden lg:block rounded-xl border border-[#dcdfe4] bg-white overflow-hidden">
          {/* Legacy detail-table header (forwarder-driver.php detail:
              จำนวน | บริษัทขนส่ง | ข้อมูล) — the stops below read as ONE bordered
              table, not floaty cards (ภูม 2026-07-19 "ตารางยังไม่เหมือน"). */}
          <div className="hidden xl:grid xl:grid-cols-[180px_26rem_minmax(0,1fr)] divide-x divide-[#dcdfe4] border-b border-[#dcdfe4] bg-surface-alt/60 text-[13px] font-bold text-[#6b6f82]">
            <div className="px-3 py-2">จำนวน · สถานะ · รูปส่ง</div>
            <div className="px-3 py-2">บริษัทขนส่ง · ที่อยู่</div>
            <div className="px-3 py-2">ข้อมูล (ออเดอร์ · แทรคกิ้ง)</div>
          </div>
          {stopsWithPhotos.map((stop, idx) => {
            const f = stop.forwarder;
            const total = stop.items.length;
            const delivered = stop.items.filter((e) => e.item.fdistatus === "2").length;
            const failed = stop.items.filter((e) => e.item.fdistatus === "3").length;
            const allDone = total > 0 && delivered === total;
            const self = isSelfDelivery(f.fshipby);
            const hasPin = Boolean(f.faddresslatitude && f.faddresslongitude);
            const addrText = [f.faddressno, f.faddresssubdistrict, f.faddressdistrict, f.faddressprovince, f.faddresszipcode]
              .filter(Boolean).join(" ");
            const mapHref = hasPin
              ? `https://www.google.com/maps/search/${f.faddresslatitude},${f.faddresslongitude}`
              : `https://www.google.com/maps/search/${encodeURIComponent(addrText)}`;
            // ทุก tb_forwarder ที่อยู่ในจุดส่งนี้ (จุด = ลูกค้า+ที่อยู่เดียวกัน · ดู
            // stopsByKey ด้านบน) — ใช้เป็นเป้าของการปักหมุดให้ติดทั้งจุดในครั้งเดียว.
            const stopFids = Array.from(new Set(stop.items.map((e) => e.forwarder.id)));
            // delivery photos for this stop (the driver's drop-off shots)
            const deliveryPhotos = Array.from(
              new Set(stop.items.map((e) => e.photoOffUrl).filter((u): u is string => Boolean(u))),
            );
            const phones = [f.faddresstel, f.faddresstel2]
              .map((p) => (p ?? "").trim())
              .filter((p, i, a) => p !== "" && p !== "-" && a.indexOf(p) === i);

            return (
              <section key={stop.addressKey} className="bg-white border-b border-[#dcdfe4] last:border-b-0">
                <div className="grid grid-cols-1 xl:grid-cols-[180px_26rem_minmax(0,1fr)] divide-y xl:divide-y-0 xl:divide-x divide-[#dcdfe4]">

                  {/* ZONE 1 — จำนวน + สถานะส่ง + รูปส่ง */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary-500 text-white w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-sm">{total} รายการ</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        allDone ? ITEM_STATUS_CLS["2"] : delivered > 0 ? ITEM_STATUS_CLS["1"] : ITEM_STATUS_CLS[""]
                      }`}>
                        {allDone ? <CheckCircle2 className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                        {allDone ? "ส่งสำเร็จ" : `ส่งแล้ว ${delivered}/${total}`}
                      </span>
                      {failed > 0 && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_CLS["3"]}`}>
                          <AlertTriangle className="h-3 w-3" /> ส่งไม่ได้ {failed}
                        </span>
                      )}
                    </div>
                    {/* รูปถ่ายส่งสินค้า — the visual anchor (legacy fPhotoEnd) */}
                    {deliveryPhotos.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {deliveryPhotos.slice(0, 3).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="รูปส่งสินค้า" className="h-20 w-20 rounded-lg border border-border object-cover hover:ring-2 hover:ring-primary-300" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-3 text-[11px] text-muted">
                        <Camera className="h-3.5 w-3.5" /> ยังไม่มีรูปส่ง
                      </div>
                    )}
                    {/* ถ่าย/แก้ไขภาพส่งสินค้า (legacy takePhoto → update_fPhotoEnd · ภูม 2026-07-10)
                        — applies to the stop's non-failed (fdistatus≠'3') driver-items. */}
                    {(() => {
                      const editableIds = stop.items
                        .filter((e) => e.item.fdistatus !== "3")
                        .map((e) => e.item.id);
                      return editableIds.length > 0 ? (
                        <DriverPhotoEditDialog itemIds={editableIds} hasPhoto={deliveryPhotos.length > 0} />
                      ) : null;
                    })()}
                  </div>

                  {/* ZONE 2 — ลูกค้า (PR + ชื่อ) + บริษัทขนส่ง + ผู้รับ + ที่อยู่ + โทร */}
                  <div className="p-3 space-y-1.5">
                    {/* WHOSE parcel — PR code + customer name (the driver leads with
                        the customer, not the order number). */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {f.userid ? (
                        <Link
                          href={`/admin/customers/${f.userid}`}
                          className="font-mono text-sm font-bold text-primary-600 hover:underline"
                        >
                          {f.userid}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm font-bold text-muted">—</span>
                      )}
                      <span className="font-semibold text-sm text-foreground">
                        {customerNameOf(f.userid)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        self ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}>
                        <Truck className="h-3 w-3" /> {shipByLabel(f.fshipby)}
                      </span>
                      <a
                        href={mapHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 text-[11px] hover:bg-emerald-100"
                      >
                        <MapPin className="h-3 w-3" /> {hasPin ? "แผนที่" : "ค้นที่อยู่"}
                      </a>
                      {/* ปักหมุด — บันทึกพิกัดที่ยืนอยู่จริงเป็นที่อยู่จัดส่งของจุดนี้
                          (ปอน 2026-07-24). ส่ง fid ของ "ทุกแถวในจุดนี้" ไม่ใช่แค่แถวแรก
                          เพราะ 1 จุดส่ง = ลูกค้า+ที่อยู่เดียว แต่มีได้หลายแทรคกิ้ง —
                          ปักติดไม่ครบ = แถวพี่น้องยังนำทางด้วยข้อความ ไปคนละที่กัน. */}
                      <PinLocationButton
                        fids={stopFids}
                        addressText={addrText}
                        hasPin={hasPin}
                      />
                    </div>
                    {isWarehousePlaceholder(f.faddressname) ? (
                      <>
                        <p className="text-xs">
                          <span className="text-muted">ผู้รับ: </span>
                          <span className="font-semibold text-foreground">{customerNameOf(f.userid)}</span>
                        </p>
                        <p className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] text-amber-800">
                          ⚠️ ยังไม่ระบุที่อยู่จัดส่ง — รับเองที่โกดัง / รอเซล–ลูกค้ากรอก
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted">
                          ผู้รับ: {recipientNameOf(f)}
                        </p>
                        <p className="text-xs text-foreground/80 leading-relaxed">
                          {f.faddressno ?? ""} ตำบล/แขวง {f.faddresssubdistrict ?? ""} อำเภอ/เขต{" "}
                          <span className="bg-amber-100 px-1 rounded text-amber-800">{f.faddressdistrict ?? ""}</span>{" "}
                          จังหวัด {f.faddressprovince ?? ""} {f.faddresszipcode ?? ""}
                        </p>
                      </>
                    )}
                    {phones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {phones.map((p) => (
                          <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 text-[11px] hover:bg-blue-100">
                            <Phone className="h-3 w-3" /> {p}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ZONE 3 — ตารางย่อยออเดอร์ FLUSH edge-to-edge เหมือน legacy (cover +
                      ออเดอร์ + รหัสสมาชิก + แทรคกิ้ง + กล่อง/นน./ปริมาตร + ตัวเลือก).
                      ปุ่มลบย้ายมาท้ายแต่ละแถว (ตัวเลือก) — รู้ว่าลบรายการไหน (ภูม 2026-07-19). */}
                  <div className="p-0">
                    {/* กรอบมนๆ (ปอน 2026-07-24) — ตารางออเดอร์อยู่ในกรอบขาวมุมโค้ง เหมือนใน
                        popup "ดูบิลใบส่งสินค้า": เลิกเส้นกริดทุกช่อง เหลือเส้นคั่นแถว + พื้นขาว
                        มุมโค้ง (rounded-xl). table-fixed + % widths คงไว้ให้คอลัมน์ทุกจุดตรงกัน. */}
                    <div className="mx-3 mt-3 overflow-x-auto scrollbar-x-visible rounded-xl border border-[#dcdfe4] bg-white">
                      <table className="w-full text-xs border-collapse table-fixed [&>tbody>tr]:border-t [&>tbody>tr]:border-[#dcdfe4]">
                        <thead className="bg-surface-alt/60 text-left text-[11px] font-bold text-[#6b6f82]">
                          <tr>
                            <th className="px-2 py-1.5 w-[4%]">#</th>
                            <th className="px-2 py-1.5 w-[18%]">ออเดอร์</th>
                            <th className="px-2 py-1.5 w-[14%]">รหัสสมาชิก</th>
                            <th className="px-2 py-1.5 w-[22%]">เลขแทรคกิ้ง</th>
                            <th className="px-2 py-1.5 text-right w-[8%]">กล่อง</th>
                            <th className="px-2 py-1.5 text-right w-[10%]">น้ำหนัก</th>
                            <th className="px-2 py-1.5 text-right w-[10%]">ปริมาตร</th>
                            {isOpsOverride && <th className="px-2 py-1.5 text-center w-[14%]">ตัวเลือก</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {stop.items.map(({ item, forwarder, coverUrl }, i) => {
                            const fNo = forwarder.fidorco ?? `#${forwarder.id}`;
                            return (
                              <tr key={item.id} className="align-top">
                                <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {coverUrl && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={coverUrl} alt="" className="h-8 w-8 rounded border border-border object-cover flex-shrink-0" />
                                    )}
                                    <Link href={`/admin/forwarders/${forwarder.id}`} className="font-mono text-primary-600 hover:underline break-all">
                                      {fNo}
                                    </Link>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5">
                                  {forwarder.userid ? (
                                    <Link href={`/admin/customers/${forwarder.userid}`} className="font-mono text-primary-600 hover:underline break-all">
                                      {forwarder.userid}
                                    </Link>
                                  ) : <span className="font-mono text-muted">—</span>}
                                  <div className="text-[11px] text-foreground/80 break-words">{customerNameOf(forwarder.userid)}</div>
                                </td>
                                <td className="px-2 py-1.5">
                                  <Link href={`/admin/forwarders/${forwarder.id}`} className="hover:underline break-all">
                                    {forwarder.ftrackingchn ?? "—"}
                                  </Link>
                                  {forwarder.fpallet && (
                                    <div className="text-[11px] text-muted">location : {forwarder.fpallet}</div>
                                  )}
                                  {forwarder.fnote && (
                                    <div className="mt-0.5 text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1 py-0.5">
                                      📝 {forwarder.fnote}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right">{forwarder.famount ?? 0}</td>
                                <td className="px-2 py-1.5 text-right">{Number(forwarder.fweight ?? 0).toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-right">{Number(forwarder.fvolume ?? 0).toFixed(5)}</td>
                                {isOpsOverride && (
                                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                    <RemoveItemButton itemId={item.id} fNo={fNo} delivered={item.fdistatus === "2"} />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                          {/* รวม — legacy PINK summary row (alert-danger #f5aab0/#7a0012) */}
                          <tr className="bg-[#f5aab0] font-semibold text-[#7a0012]">
                            <td className="px-2 py-1.5 text-right" colSpan={4}>รวม</td>
                            <td className="px-2 py-1.5 text-right">{stop.totalBoxes}</td>
                            <td className="px-2 py-1.5 text-right">{stop.totalWeight.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right">{stop.totalVolume.toFixed(5)}</td>
                            {isOpsOverride && <td className="px-2 py-1.5" />}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* พิมพ์ใบส่งสินค้าเฉพาะจุดนี้ (ปอน 2026-07-24) — ปุ่มเดียวกับใน popup
                        "ดูบิลใบส่งสินค้า" (พิมพ์และบันทึกบิลรวม → delivery-slip?fids= ของจุดนี้). */}
                    <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
                      <a
                        href={`/admin/drivers/${batch.id}/delivery-slip?fids=${stop.items.map((e) => e.forwarder.id).join(",")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${PRINT_BADGE_CLS} px-3 py-1 text-xs`}
                      >
                        <Printer className="h-3.5 w-3.5" /> พิมพ์และบันทึกบิลรวม
                      </a>
                      {/* พิมพ์สติกเกอร์เฉพาะจุดนี้ (ปอน 2026-07-24 · คู่กับปุ่มบิล เหมือนในการ์ดมือถือ) */}
                      <a
                        href={`/admin/drivers/${batch.id}/stickers?fids=${stop.items.map((e) => e.forwarder.id).join(",")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-600 to-sky-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:from-sky-700 hover:to-sky-600"
                      >
                        <Tag className="h-3.5 w-3.5" /> พิมพ์สติกเกอร์
                      </a>
                    </div>

                    {/* notes + courier-link — padded sub-section below the flush table.
                        (ปุ่มลบย้ายเข้าไปในคอลัมน์ "ตัวเลือก" ท้ายแต่ละแถวแล้ว) */}
                    {(stop.items.some((e) => e.item.fdistatus === "3" && e.item.fdinote) || isOpsOverride) && (
                      <div className="p-3 space-y-2">
                        {/* ส่งไม่ได้ — เหตุผลที่คนขับบันทึก (0213 fdinote) */}
                        {stop.items
                          .filter((e) => e.item.fdistatus === "3" && e.item.fdinote)
                          .map(({ item, forwarder }) => (
                            <p key={`fail-${item.id}`} className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-800">
                              ⚠️ {forwarder.fidorco ?? `#${forwarder.id}`} ส่งไม่ได้: {item.fdinote}
                            </p>
                          ))}
                        {/* ลิงก์ติดตามขนส่ง (ลูกค้าเห็น · ops only) */}
                        {isOpsOverride && (
                          <details className="rounded-lg border border-border">
                            <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-medium text-muted flex items-center gap-1">
                              <Link2 className="h-3 w-3" /> ลิงก์ติดตามขนส่ง (ลูกค้าเห็น) — {stop.items.length} รายการ
                            </summary>
                            <div className="px-2 pb-2 pt-1 space-y-1.5">
                              {stop.items.map(({ forwarder }) => (
                                <CourierUrlInput
                                  key={`courier-${forwarder.id}`}
                                  forwarderId={forwarder.id}
                                  initialUrl={forwarder.courier_tracking_url}
                                />
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── การ์ดรายการมือถือ (ปอน 2026-07-24 · ตามภาพ) — จอ <lg เป็นการ์ดต่อจุด:
          สถานะ(วงกลม)+รูป+แก้ภาพ | ลูกค้า+ที่อยู่+GoogleMaps | ตารางย่อ(แทรคกิ้ง·กล่อง·CBM·KG)
          + "แสดงเพิ่มเติม" (กางตารางออเดอร์ + ปุ่มพิมพ์). จอ ≥lg ใช้ตารางเดิม (บล็อกด้านบน). */}
      {stopsWithPhotos.length > 0 && (
        <div className="lg:hidden space-y-3">
          {stopsWithPhotos.map((stop, idx) => {
            const f = stop.forwarder;
            const total = stop.items.length;
            const delivered = stop.items.filter((e) => e.item.fdistatus === "2").length;
            const failed = stop.items.filter((e) => e.item.fdistatus === "3").length;
            const allDone = total > 0 && delivered === total;
            const hasPin = Boolean(f.faddresslatitude && f.faddresslongitude);
            const addrText = [f.faddressno, f.faddresssubdistrict, f.faddressdistrict, f.faddressprovince, f.faddresszipcode].filter(Boolean).join(" ");
            const mapHref = hasPin
              ? `https://www.google.com/maps/search/${f.faddresslatitude},${f.faddresslongitude}`
              : `https://www.google.com/maps/search/${encodeURIComponent(addrText)}`;
            const deliveryPhotos = Array.from(new Set(stop.items.map((e) => e.photoOffUrl).filter((u): u is string => Boolean(u))));
            const editableIds = stop.items.filter((e) => e.item.fdistatus !== "3").map((e) => e.item.id);
            // เป้าของการปักหมุด = ทุกแถวในจุดนี้ (เหมือนฝั่งเดสก์ท็อป · ค่าเดียวกัน)
            const stopFids = Array.from(new Set(stop.items.map((e) => e.forwarder.id)));
            const phones = [f.faddresstel, f.faddresstel2].map((p) => (p ?? "").trim()).filter((p, i, a) => p !== "" && p !== "-" && a.indexOf(p) === i);
            const placeholder = isWarehousePlaceholder(f.faddressname);
            const heroPhoto = deliveryPhotos[0] ?? stop.items.find((e) => e.coverUrl)?.coverUrl ?? null;
            return (
              <div key={stop.addressKey} className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
                {/* ลำดับส่ง (ปอน 2026-07-24 · = ลำดับการจัดส่งตามเส้นทาง) + สถานะ + จำนวน */}
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white shadow-sm">
                    {idx + 1}
                  </span>
                  {/* วงกลมสถานะ (เขียว/แดง) ถูกถอดออก 2026-07-24 (owner) — มันซ้ำกับ
                      badge "สำเร็จ/ส่งแล้ว" ในแถวล่าง. สถานะงานอยู่ที่แถว badge ที่เดียว
                      (ขนส่ง + สถานะ) เพื่อไม่ให้ซ้ำซ้อน. */}
                  <div className="leading-tight">
                    <p className="text-[11px] text-muted">ลำดับส่ง</p>
                    <p className="text-base font-bold">{total} รายการ</p>
                  </div>
                  {/* ปักหมุด — อยู่แถวหัวการ์ด ชิดขวา (ปอน 2026-07-24). จอนี้คือจอ
                      ที่คนขับใช้ตอนยืนหน้าบ้านลูกค้าจริง จึงวางไว้ให้เห็นตั้งแต่
                      หัวการ์ด ไม่ต้องกวาดตาหาในแถวแท็ก. */}
                  <div className="ml-auto shrink-0">
                    <PinLocationButton fids={stopFids} addressText={addrText} hasPin={hasPin} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* แท็กประเภทขนส่ง (ปอน 2026-07-24 · แถวเดียวกับสถานะ) — PRF/เหมาๆ ฯลฯ */}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isSelfDelivery(f.fshipby) ? "bg-rose-600 text-white" : "border border-slate-300 bg-slate-200 text-slate-700"}`}>
                    <Truck className="h-3 w-3" /> {shipByLabel(f.fshipby)}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${allDone ? ITEM_STATUS_CLS["2"] : delivered > 0 ? ITEM_STATUS_CLS["1"] : ITEM_STATUS_CLS[""]}`}>
                    {allDone ? <CheckCircle2 className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                    {allDone ? "สำเร็จ" : `ส่งแล้ว ${delivered}/${total}`}
                  </span>
                  {failed > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ITEM_STATUS_CLS["3"]}`}>
                      <AlertTriangle className="h-3 w-3" /> ส่งไม่ได้ {failed}
                    </span>
                  )}
                </div>

                {/* รูป+แก้ภาพ | ลูกค้า+ที่อยู่+ติดต่อ */}
                <div className="flex gap-3">
                  <div className="w-20 flex-shrink-0 space-y-1.5">
                    {heroPhoto ? (
                      <a href={heroPhoto} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={heroPhoto} alt="รูปส่งสินค้า" className="h-20 w-20 rounded-lg border border-border object-cover" />
                      </a>
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border text-muted">
                        <Camera className="h-5 w-5" />
                      </div>
                    )}
                    {editableIds.length > 0 && (
                      <DriverPhotoEditDialog itemIds={editableIds} hasPhoto={deliveryPhotos.length > 0} gradient />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* รหัส + ชื่อ บรรทัดเดียว (owner 2026-07-24) — ชื่อบริษัทยาวตัด …
                        ท้าย (truncate) แทนการตกไปบรรทัด 2. */}
                    <div className="flex items-baseline gap-1 leading-tight">
                      {f.userid && <span className="shrink-0 font-mono text-sm font-bold text-primary-600">{f.userid}</span>}
                      <span className="truncate text-sm font-bold text-foreground">{customerNameOf(f.userid)}</span>
                    </div>
                    {placeholder ? (
                      <p className="inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">⚠️ ยังไม่ระบุที่อยู่จัดส่ง</p>
                    ) : (
                      // ที่อยู่จำกัด 2 บรรทัด · ยาวเกินมี … + ปุ่มเพิ่มเติม กางเต็ม (owner 2026-07-24)
                      <ExpandableText className="text-xs leading-relaxed text-foreground/80">
                        {f.faddressno ?? ""} ตำบล/แขวง {f.faddresssubdistrict ?? ""} อำเภอ/เขต{" "}
                        <span className="rounded bg-amber-100 px-1 text-amber-800">{f.faddressdistrict ?? ""}</span>{" "}
                        จังหวัด {f.faddressprovince ?? ""} {f.faddresszipcode ?? ""}
                      </ExpandableText>
                    )}
                    <div className="flex items-center gap-1.5">
                      {phones.map((p) => (
                        <a key={p} href={`tel:${p}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                          <Phone className="h-3 w-3" /> {p}
                        </a>
                      ))}
                      <a href={mapHref} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <MapPin className="h-3 w-3" /> GoogleMaps
                      </a>
                      {/* (ปุ่มปักหมุดย้ายขึ้นไปแถวหัวการ์ดแล้ว — ปอน 2026-07-24) */}
                    </div>
                  </div>
                </div>

                {/* ตารางย่อ */}
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-center text-xs">
                    <thead className="bg-surface-alt/60 text-[11px] text-muted">
                      <tr>
                        <th className="px-2 py-1 font-semibold">แทรคกิ้ง</th>
                        <th className="px-2 py-1 font-semibold">กล่อง</th>
                        <th className="px-2 py-1 font-semibold">CBM</th>
                        <th className="px-2 py-1 font-semibold">KG</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-semibold">
                        <td className="border-t border-border px-2 py-1.5">{total}</td>
                        <td className="border-t border-border px-2 py-1.5">{stop.totalBoxes}</td>
                        <td className="border-t border-border px-2 py-1.5">{stop.totalVolume.toFixed(5)}</td>
                        <td className="border-t border-border px-2 py-1.5">{stop.totalWeight.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* แสดงเพิ่มเติม — กางตารางออเดอร์ (ขึ้นก่อนปุ่มพิมพ์ · ปอน 2026-07-24) */}
                <details className="group">
                  <summary className="flex w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#A01824] to-[#C82333] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:from-[#87141E] hover:to-[#B21F2D] active:scale-95">
                    <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /> แสดงเพิ่มเติม
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-[11px]">
                        <thead className="bg-surface-alt/50 text-left text-muted">
                          <tr>
                            <th className="px-2 py-1">ออเดอร์</th>
                            <th className="px-2 py-1">แทรคกิ้ง</th>
                            <th className="px-2 py-1 text-right">กล่อง</th>
                            <th className="px-2 py-1 text-right">CBM</th>
                            <th className="px-2 py-1 text-right">KG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stop.items.map(({ item, forwarder }) => (
                            <tr key={item.id} className="border-t border-border align-top">
                              <td className="px-2 py-1">
                                <Link href={`/admin/forwarders/${forwarder.id}`} className="font-mono text-primary-600">
                                  {forwarder.fidorco ?? `#${forwarder.id}`}
                                </Link>
                              </td>
                              <td className="px-2 py-1 font-mono break-all">{forwarder.ftrackingchn ?? "—"}</td>
                              <td className="px-2 py-1 text-right">{forwarder.famount ?? 0}</td>
                              <td className="px-2 py-1 text-right">{Number(forwarder.fvolume ?? 0).toFixed(5)}</td>
                              <td className="px-2 py-1 text-right">{Number(forwarder.fweight ?? 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>

                {/* ปุ่มพิมพ์ 2 อันคู่กัน เฉพาะจุดนี้ (per-stop fids · ปอน 2026-07-24)
                    — ใบส่งสินค้า (delivery-slip?fids=) + สติกเกอร์ (stickers?fids=). */}
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`/admin/drivers/${batch.id}/delivery-slip?fids=${stop.items.map((e) => e.forwarder.id).join(",")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${PRINT_BADGE_CLS} justify-center px-2.5 py-2.5 text-xs`}
                  >
                    <Printer className="h-4 w-4 shrink-0" /> พิมพ์ใบส่งสินค้า
                  </a>
                  <a
                    href={`/admin/drivers/${batch.id}/stickers?fids=${stop.items.map((e) => e.forwarder.id).join(",")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-sky-600 to-sky-500 px-2.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:from-sky-700 hover:to-sky-600"
                  >
                    <Tag className="h-4 w-4 shrink-0" /> พิมพ์สติกเกอร์
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted">
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
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

/**
 * รูปตอนขึ้นรถ — the header's top-right visual panel (ภูม 2026-07-10). A neat 2-col
 * thumbnail grid of the run's loading photos (fdipictureon); falls back to the
 * delivery photos so it's never pointlessly empty when photos DO exist. Each
 * thumbnail links to the full image + is badged by kind (ขึ้นรถ / ส่งแล้ว).
 */
function LoadingPhotoPanel({
  photos,
  label,
}: {
  photos: { url: string; kind: "on" | "off"; tracking: string }[];
  label: string;
}) {
  const shown = photos.slice(0, 4);
  const extra = photos.length - shown.length;
  return (
    <div className="w-40 sm:w-44 shrink-0">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted mb-1">
        <Camera className="h-3.5 w-3.5" /> {label}
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {shown.map((p, i) => (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${p.kind === "on" ? "รูปขึ้นรถ" : "รูปส่งแล้ว"} · ${p.tracking}`}
              className="group relative block aspect-square overflow-hidden rounded-lg border border-border bg-surface-alt"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.tracking || label} className="h-full w-full object-cover transition group-hover:scale-105" />
              <span
                className={`absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[11px] font-medium text-white ${
                  p.kind === "on" ? "bg-emerald-600/85" : "bg-blue-600/85"
                }`}
              >
                {p.kind === "on" ? "ขึ้นรถ" : "ส่งแล้ว"}
              </span>
            </a>
          ))}
          {extra > 0 && (
            <div className="col-span-2 text-[11px] text-muted text-center">
              +{extra} รูป
            </div>
          )}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-surface-alt/50 px-2 text-center text-[11px] text-muted">
          ยังไม่มีรูปขึ้นรถ · คนขับถ่ายตอนโหลดของขึ้นรถ
        </div>
      )}
    </div>
  );
}
