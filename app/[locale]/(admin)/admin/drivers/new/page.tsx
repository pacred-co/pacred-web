/**
 * /admin/drivers/new — Create driver batch + self-pickup close (faithful port
 * of `pcs-admin/forwarder-driver.php?page=add`, BOTH work-tabs).
 *
 * THREE delivery work-tabs (ภูม 2026-06-23 — split legacy's 2 tabs by carrier
 * KIND so warehouse staff find external-courier orders fast). Every fstatus=6
 * paydeposit-ok row falls in EXACTLY one (complete partition · no overlap/loss):
 *   1. "มอบงานให้คนขับรถ" (default)  — Pacred's OWN drivers · fShipBy IN ('PCSF','PCSE')
 *        (เหมาๆ / Pacred Express door-to-door). Assign a driver + create a run.
 *   2. "รับเองหน้าโกดัง" (`?tab=pickup`) — customer self-pickup · fShipBy = 'PCS'.
 *        Tick handed-off parcels → close ส่งแล้ว (fstatus 6→7), NO driver.
 *   3. "Express" (`?tab=express`)     — EXTERNAL couriers · everything else
 *        (Flash · Kerry · J&T · เฟิร์ส · จันทร์สว่าง · … + 'F'). Carrier filter inside;
 *        legacy keeps all non-2/4/PCS in the driver-batch flow (forwarder-driver.php:726)
 *        → Express uses the SAME มอบคนขับ flow (assign a Pacred driver to take them out).
 * (legacy also shows 2 counter-only tabs — "กำลังจัดส่ง" + "เตรียมส่งอนุมัติแล้ว"
 *  — that just link back; we surface "กำลังจัดส่ง" as a link to /admin/drivers,
 *  the list/รูป1 view where in-progress runs are managed.)
 *
 * The split diverges from legacy's exact 2/4 placement (legacy put Flash[2]/Kerry[4]
 * in the pickup tab) — ภูม unified ALL external couriers under "Express"; the
 * partition stays complete so no order is ever lost.
 *
 * AGENTS.md §0a — Pacred Tailwind, NOT verbatim Bootstrap.
 * AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Truck, Home, Send, CheckCircle2, Zap } from "lucide-react";
import { CreateBatchForm } from "./create-batch-form";
import { SelfPickupForm } from "./self-pickup-form";

export const dynamic = "force-dynamic";

type ForwarderRow = {
  id:                       number;
  fidorco:                  string | null;
  fshipby:                  string | null;
  famount:                  number | null;
  fweight:                  number | null;
  fvolume:                  number | null;
  fpallet:                  string | null;
  ftrackingchn:             string | null;
  fnote:                    string | null;
  userid:                   string | null;
  faddressname:             string | null;
  faddresslastname:         string | null;
  faddressno:               string | null;
  faddresssubdistrict:      string | null;
  faddressdistrict:         string | null;
  faddressprovince:         string | null;
  faddresszipcode:          string | null;
  faddresstel:              string | null;
};

type DriverOption = {
  member_code: string;
  display:     string;
};

// nameShipBy — FULL faithful port of legacy `include/function.php nameShipBy()`
// (the canonical fShipBy → carrier-name resolver legacy uses on every screen,
// incl. forwarder-driver.php L888/L1012/L1829). The PCS*/F/PCS cases are
// Pacred-rebranded; the numeric carrier codes (1–47) are verbatim legacy.
// ⚠️ The earlier compact stub had WRONG names for 1–7 (e.g. "1" said KERRY but
// legacy "1" = DHL Express) and was MISSING 8–47, so the per-row carrier badge +
// the ขนส่ง filter showed wrong/raw labels. 2026-06-23.
const SHIP_BY_LABEL: Record<string, string> = {
  PCSF: "Pacred เหมาเหมา",          // legacy "PCS เหมาเหมา"
  PCSE: "Pacred Express",            // legacy "PCS Express"
  PCS:  "รับเองโกดัง Pacred",        // legacy "รับเองโกดัง PCS กทม"
  F:    "บริษัทจัดหาให้อัตโนมัติ",
  "1":  "DHL Express",
  "2":  "Flash Express",
  "3":  "J.K. เอ็กซ์เพรส",
  "4":  "Kerry Express",
  "5":  "Nim Express",
  "6":  "S & J ขนส่งด่วนสุพรรณบุรี",
  "7":  "SB สมใจขนส่ง",
  "8":  "SCG Express",
  "9":  "เคพีเอ็น",
  "10": "เฟิร์ส เอ็กเพรส ขนส่ง",
  "11": "ไปรษณีย์ไทย",
  "12": "จันทร์สว่างขนส่ง",
  "13": "ธนามัย ขนส่งด่วน",
  "14": "บุญอนันต์ขนส่ง",
  "15": "พี.เจ. ด่วนอีสาน ขนส่ง",
  "16": "มะม่วงขนส่ง",
  "17": "วันชนะ แอนด์ วันณิสา ขนส่ง",
  "18": "สมพงษ์อุบลรัตน์ ขนส่ง",
  "19": "อาร์.ซี.อาร์ เพลส",
  "20": "ตองสอง ขนส่ง",
  "21": "นิ่มซี่เส็งขนส่ง 1988",
  "22": "ธนาไพศาล ขนส่ง",
  "23": "PL ขนส่งด่วน",
  "24": "J&T Express",
  "25": "มังกรทองขนส่ง 2019",
  "26": "PM ชลบุรี ขนส่งด่วน",
  "27": "ทรัพย์ปรีชา",
  "28": "พัฒนาเอ็กซ์เพลส",
  "29": "หาดใหญ่ทัวร์",
  "30": "หาดใหญ่ โอ.พี. 2012",
  "31": "อาร์.ซี.เอ็กซเพรส",
  "32": "สี่สหาย",
  "33": "แพปลา​สมบัติ​วัฒนา",
  "34": "ทวีทรัพย์ระยอง",
  "35": "ศิริสมบูรณ์",
  "36": "นิวสอง อัศวินขนส่ง",
  "37": "โชคสถาพรขนส่ง",
  "38": "ทรัพย์สมบูรณ์ถาวร",
  "39": "MNB Transport",
  "40": "หจก.โชคพูลทรัพย์ขนส่ง 2014",
  "41": "สิรินครขนส่ง",
  "42": "พาณิชย์การขนส่ง KSD",
  "43": "นวรรณขนส่ง",
  "44": "กุญชรมณี ขนส่ง",
  "45": "บริษัท เอ็มพอร์ท โลจิสติกส์ จำกัด",
  "46": "ซี.เอ็น.ทรานสปอร์ต",
  "47": "ภูเก็ตแหลมทองขนส่ง",
};

function nameShipBy(code: string | null): string {
  if (!code) return "—";
  return SHIP_BY_LABEL[code] ?? code;
}

// 3-way carrier split (ภูม 2026-06-23):
//   • Pacred's own drivers → fShipBy IN ('PCSF','PCSE')  → "มอบคนขับ"
//   • customer self-pickup → fShipBy = 'PCS'              → "รับเองหน้าโกดัง"
//   • external couriers     → everything else (numeric 1–47 · 'F' · …) → "Express"
function isPacredDriver(code: string | null): boolean {
  return code === "PCSF" || code === "PCSE";
}
function isSelfPickup(code: string | null): boolean {
  return code === "PCS";
}
function isExpress(code: string | null): boolean {
  return !isPacredDriver(code) && !isSelfPickup(code);
}

type Stop = {
  key:          string;
  fshipby:      string | null;
  shipByLabel:  string;
  /** The customer this stop belongs to (userid + resolved name from tb_users) —
   *  the IDENTITY shown on the card. For a MOMO/commit row the delivery address
   *  is still the warehouse placeholder, so we lead with WHO the parcel is for. */
  userid:        string;
  customerName:  string;
  /** Display name for the recipient: the real address name when set, else the
   *  customer's name (never the bare "รับที่โกดัง Pacred" placeholder). */
  recipientName: string;
  /** True when faddressname is empty / the warehouse self-pickup placeholder —
   *  i.e. no real delivery address yet (เซล must fill it in). */
  addressMissing: boolean;
  address: {
    name: string; lastName: string; no: string; subDistrict: string;
    district: string; province: string; zipCode: string; tel: string;
  };
  items: {
    id: number; fidorco: string; ftrackingchn: string; userid: string;
    famount: number; fweight: number; fvolume: number; fpallet: string; fnote: string;
  }[];
  forwarderIds: number[];
  totalBoxes:   number;
  totalWeight:  number;
  totalVolume:  number;
};

/** A delivery row still on the warehouse self-pickup placeholder ("รับที่โกดัง
 *  Pacred" — the legacy MOMO/commit default) has no REAL recipient/address. Same
 *  rule as the `/admin/drivers/[id]` detail page (`isWarehousePlaceholder`) so
 *  the create + detail screens read identically. */
function isWarehousePlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return n === "" || /รับ.*โกดัง|รับเอง|pacred/i.test(n);
}

type PickupItem = {
  id: number; fidorco: string; ftrackingchn: string;
  famount: number; fweight: number; fvolume: number; fpallet: string; fnote: string;
};

/** A self-pickup group — ONE customer (รหัสลูกค้า / userid), their own parcels,
 *  their own checkbox + their own submit. (Self-pickup is collected AT the
 *  warehouse, so the legacy address-grouping lumps different customers together;
 *  here we key on the customer instead so staff close one customer at a time.) */
type PickupGroup = {
  key:          string;   // = userid
  userid:       string;
  customerName: string;   // looked up from tb_users (fallback to address name)
  customerTel:  string;
  shipByLabel:  string;
  items:        PickupItem[];
  forwarderIds: number[];
  totalBoxes:   number;
  totalWeight:  number;
  totalVolume:  number;
};

/** Group eligible self-pickup rows BY CUSTOMER (userid) into per-customer cards.
 *  `customerById` maps userid → { name, tel } from tb_users (the customer's own
 *  identity — not the delivery address, which for รับเอง is the warehouse). */
function buildPickupGroups(
  eligible: ForwarderRow[],
  customerById: Map<string, { name: string; tel: string }>,
): PickupGroup[] {
  const groupMap = new Map<string, PickupGroup>();
  for (const f of eligible) {
    const userid = (f.userid ?? "").trim() || "—";
    const item: PickupItem = {
      id: f.id, fidorco: f.fidorco ?? `#${f.id}`, ftrackingchn: f.ftrackingchn ?? "—",
      famount: Number(f.famount ?? 0), fweight: Number(f.fweight ?? 0),
      fvolume: Number(f.fvolume ?? 0), fpallet: f.fpallet ?? "", fnote: f.fnote ?? "",
    };
    const existing = groupMap.get(userid);
    if (existing) {
      existing.items.push(item);
      existing.forwarderIds.push(f.id);
      existing.totalBoxes  += item.famount;
      existing.totalWeight += item.fweight;
      existing.totalVolume += item.fvolume;
    } else {
      const cust = customerById.get(userid);
      // Fallback name: the address name on the row, else the userid itself.
      const fallbackName = `${f.faddressname ?? ""} ${f.faddresslastname ?? ""}`.trim();
      groupMap.set(userid, {
        key:          userid,
        userid,
        customerName: cust?.name || fallbackName || userid,
        customerTel:  cust?.tel || f.faddresstel || "",
        shipByLabel:  nameShipBy(f.fshipby),
        items:        [item],
        forwarderIds: [f.id],
        totalBoxes:   item.famount,
        totalWeight:  item.fweight,
        totalVolume:  item.fvolume,
      });
    }
  }
  // Sort by customer code so the same customer is easy to find on repeat visits.
  return Array.from(groupMap.values()).sort((a, b) =>
    a.userid.localeCompare(b.userid, "th"),
  );
}

/** Group eligible rows by (carrier · recipient address) into form-ready stops.
 *  `customerById` maps userid → { name, tel } from tb_users so each card leads
 *  with the CUSTOMER's real name even when the row carries the warehouse
 *  placeholder address (MOMO/commit default "รับที่โกดัง Pacred"). */
function buildStops(
  eligible: ForwarderRow[],
  customerById: Map<string, { name: string; tel: string }>,
): Stop[] {
  const groupMap = new Map<string, Stop>();
  for (const f of eligible) {
    const userid = (f.userid ?? "").trim() || "—";
    // Placeholder-address rows share an identical fAddress* across different
    // customers, so fold the userid into the key — else two customers' parcels
    // would merge into ONE card under a single (wrong) name. Real addresses
    // still group as legacy does (one card per physical destination).
    // ภูม 2026-06-30 — a placeholder NAME ("รับที่โกดัง Pacred") does NOT mean there's
    // no address: the customer may have entered a REAL delivery address in the
    // faddress* fields while faddressname is still the self-pickup placeholder.
    // Split the two: nameIsPlaceholder (hide the bogus name) vs hasRealAddress
    // (show no/district/province + skip the "ยังไม่มีที่อยู่จัดส่ง" warning).
    const nameIsPlaceholder = isWarehousePlaceholderName(f.faddressname);
    const hasRealAddress = [f.faddressno, f.faddressprovince, f.faddressdistrict]
      .some((v) => (v ?? "").trim() !== "");
    const addrMissing = !hasRealAddress;
    const key = [
      f.fshipby ?? "",
      addrMissing ? `__wh__${userid}` : "",
      f.faddressname ?? "", f.faddresslastname ?? "",
      f.faddressno ?? "", f.faddresssubdistrict ?? "",
      f.faddressdistrict ?? "", f.faddressprovince ?? "", f.faddresszipcode ?? "",
    ].join("|");
    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push({
        id: f.id, fidorco: f.fidorco ?? `#${f.id}`, ftrackingchn: f.ftrackingchn ?? "—",
        userid: f.userid ?? "—", famount: Number(f.famount ?? 0), fweight: Number(f.fweight ?? 0),
        fvolume: Number(f.fvolume ?? 0), fpallet: f.fpallet ?? "", fnote: f.fnote ?? "",
      });
      existing.forwarderIds.push(f.id);
      existing.totalBoxes  += Number(f.famount ?? 0);
      existing.totalWeight += Number(f.fweight ?? 0);
      existing.totalVolume += Number(f.fvolume ?? 0);
    } else {
      const cust = customerById.get(userid);
      const customerName = cust?.name || "";
      // Recipient = the real address name when present, else the customer name,
      // else the userid (never the bare warehouse placeholder).
      const recipientName = nameIsPlaceholder
        ? (customerName || userid)
        : `${(f.faddressname ?? "").trim()} ${(f.faddresslastname ?? "").trim()}`.trim();
      groupMap.set(key, {
        key,
        fshipby:        f.fshipby,
        shipByLabel:    nameShipBy(f.fshipby),
        userid,
        customerName:   customerName || userid,
        recipientName:  recipientName || userid,
        addressMissing: addrMissing,
        items: [{
          id: f.id, fidorco: f.fidorco ?? `#${f.id}`, ftrackingchn: f.ftrackingchn ?? "—",
          userid: f.userid ?? "—", famount: Number(f.famount ?? 0), fweight: Number(f.fweight ?? 0),
          fvolume: Number(f.fvolume ?? 0), fpallet: f.fpallet ?? "", fnote: f.fnote ?? "",
        }],
        forwarderIds: [f.id],
        totalBoxes:  Number(f.famount ?? 0),
        totalWeight: Number(f.fweight ?? 0),
        totalVolume: Number(f.fvolume ?? 0),
        address: {
          // Hide ONLY the placeholder name (never print "รับที่โกดัง Pacred" as a
          // person) — but ALWAYS show the real address fields when they exist, even
          // if the name is the placeholder (ภูม 2026-06-30 · PR047 had a real addr
          // 48/2 หมู่ 12 กระทุ่มแบน but was blanked + flagged "ยังไม่มีที่อยู่").
          name:        nameIsPlaceholder ? "" : (f.faddressname ?? ""),
          lastName:    nameIsPlaceholder ? "" : (f.faddresslastname ?? ""),
          no:          hasRealAddress ? (f.faddressno ?? "") : "",
          subDistrict: hasRealAddress ? (f.faddresssubdistrict ?? "") : "",
          district:    f.faddressdistrict ?? "",
          province:    hasRealAddress ? (f.faddressprovince ?? "") : "",
          zipCode:     hasRealAddress ? (f.faddresszipcode ?? "") : "",
          tel:         f.faddresstel ?? cust?.tel ?? "",
        },
      });
    }
  }
  return Array.from(groupMap.values()).sort((a, b) =>
    (a.recipientName + a.address.no).localeCompare(b.recipientName + b.address.no, "th"),
  );
}

export default async function CreateDriverBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // warehouse included — warehouse staff create the delivery run / close the
  // self-pickup on-site (ภูม 2026-06-17 · owner confirmed · logistics-only).
  await requireAdmin(["ops", "super", "warehouse"]);
  const admin = createAdminClient();
  const sp = await searchParams;
  const activeTab: "driver" | "pickup" | "express" =
    sp.tab === "pickup" ? "pickup" : sp.tab === "express" ? "express" : "driver";

  // 1. Forwarders already in an open assignment (fdistatus '' or '1') — these
  //    must NOT be offered again.
  const { data: openItems, error: openErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid")
    .or("fdistatus.eq.,fdistatus.eq.1,fdistatus.is.null")
    .limit(50_000);
  if (openErr) {
    console.error("/admin/drivers/new: open items read failed", openErr);
  }
  const openFids = new Set(((openItems ?? []) as { fid: number }[]).map((r) => r.fid));

  // 2. Eligible forwarders: fstatus='6' (เตรียมส่ง) AND paydeposit NOT '1'
  //    (paydeposit='1' = credit-pending; legacy excludes these).
  const { data: eligibleData, error: eligibleErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, fshipby, famount, fweight, fvolume, fpallet, ftrackingchn, fnote, userid, " +
      "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
      "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, paydeposit",
    )
    .eq("fstatus", "6")
    .order("id", { ascending: false })
    .limit(2000);
  if (eligibleErr) {
    console.error("/admin/drivers/new: eligible read failed", eligibleErr);
    throw new Error(`ไม่สามารถอ่านรายการรอมอบหมาย: ${eligibleErr.message}`);
  }
  // paydeposit-ok ready-to-ship rows (= legacy countWarehousePCSPay, the
  // "เตรียมส่งอนุมัติจ่ายเงินแล้ว" total). Then split off the ones already
  // out in an open driver batch (inProgress = legacy status_driver_item).
  const paydOk = ((eligibleData ?? []) as unknown as (ForwarderRow & { paydeposit: string | null })[])
    .filter((r) => r.paydeposit !== "1");
  const totalReadyToShip = paydOk.length;
  const allEligible = paydOk.filter((r) => !openFids.has(r.id));
  const inProgress = totalReadyToShip - allEligible.length; // ออกส่งกับคนขับแล้ว

  // 3. Partition the still-to-action rows into the three work-tabs
  //    (complete partition — no overlap, no loss · every row lands in one).
  const driverEligible  = allEligible.filter((r) => isPacredDriver(r.fshipby));
  const pickupEligible  = allEligible.filter((r) => isSelfPickup(r.fshipby));
  const expressEligible = allEligible.filter((r) => isExpress(r.fshipby));
  const driverCount  = driverEligible.length;
  const pickupCount  = pickupEligible.length;
  const expressCount = expressEligible.length;

  const eligible =
    activeTab === "pickup"  ? pickupEligible  :
    activeTab === "express" ? expressEligible :
    driverEligible;

  // 3a. Look up each customer's name + phone from tb_users (camelCase cols ·
  //     CLAUDE.md exception) so EVERY tab's card leads with ชื่อลูกค้า + รหัสลูกค้า.
  //     The driver/express cards need it too: a MOMO/commit row carries the
  //     warehouse placeholder ("รับที่โกดัง Pacred") as the address name, so
  //     without this the card showed "คุณรับที่โกดัง Pacred" instead of who the
  //     parcel is for. Resolve once for whichever rows the active tab shows.
  const custIds = [...new Set(eligible.map((r) => (r.userid ?? "").trim()).filter(Boolean))];
  const customerById = new Map<string, { name: string; tel: string }>();
  if (custIds.length > 0) {
    const { data: custRows, error: custErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", custIds);
    if (custErr) {
      console.error("/admin/drivers/new: customer name lookup failed", {
        code: custErr.code, message: custErr.message,
      });
    }
    for (const u of (custRows ?? []) as { userID: string; userName: string | null; userLastName: string | null; userTel: string | null }[]) {
      customerById.set(u.userID, {
        name: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim(),
        tel:  (u.userTel ?? "").trim(),
      });
    }
  }

  // Pickup tab → group BY CUSTOMER (userid) into per-customer cards.
  const pickupGroups: PickupGroup[] =
    activeTab === "pickup" ? buildPickupGroups(pickupEligible, customerById) : [];

  // Stop groups for the driver/express tabs (address-based — a driver delivers
  // to a physical address; for placeholder rows we fold in the customer so each
  // card stays one customer). The pickup tab uses pickupGroups above instead.
  const groups = activeTab === "pickup" ? [] : buildStops(eligible, customerById);

  // 4. Driver picker — the มอบคนขับ + Express tabs both assign a Pacred driver.
  let drivers: DriverOption[] = [];
  if (activeTab === "driver" || activeTab === "express") {
    const { data: driversData, error: driversErr } = await admin
      .from("admins")
      .select("profile_id, role, is_active, profile:profiles!profile_id(member_code, first_name, last_name)")
      .eq("role", "driver")
      .eq("is_active", true);
    if (driversErr) {
      console.error("/admin/drivers/new: driver picker read failed", driversErr);
    }
    type DrvRow = {
      profile_id: string;
      role: string;
      is_active: boolean;
      profile: { member_code: string | null; first_name: string | null; last_name: string | null } |
               { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
    };
    drivers = ((driversData ?? []) as unknown as DrvRow[])
      .map((d) => {
        const prof = Array.isArray(d.profile) ? d.profile[0] : d.profile;
        if (!prof?.member_code) return null;
        const name = `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim();
        return {
          member_code: prof.member_code,
          display:     name ? `${prof.member_code} · ${name}` : prof.member_code,
        };
      })
      .filter((x): x is DriverOption => x !== null)
      .sort((a, b) => a.member_code.localeCompare(b.member_code));
  }

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1800px] mx-auto">
      {/* Breadcrumb */}
      <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <ArrowLeft className="h-3 w-3" />
        กลับรายการ
      </Link>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">CARGO · จัดส่ง</p>
        <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
          {activeTab === "pickup" ? <Home className="h-6 w-6" />
            : activeTab === "express" ? <Zap className="h-6 w-6" />
            : <Truck className="h-6 w-6" />}
          {activeTab === "pickup"
            ? "รับเองหน้าโกดัง — ปิดงานส่งสำเร็จ"
            : activeTab === "express"
            ? "Express — มอบงานขนส่งภายนอกให้คนขับไปส่ง"
            : "สร้างรายการขนส่ง — มอบงานให้คนขับรถ"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {activeTab === "pickup"
            ? "ของที่ลูกค้ามารับเองที่โกดัง — แยกการ์ดตามลูกค้า (รหัสลูกค้า) · ติ๊กพัสดุที่รับแล้วของลูกค้าคนนั้น แนบรูป (ถ้ามี) → กด \"บันทึกส่งสำเร็จ\" ปิดงานทีละลูกค้าได้ โดยไม่ต้องมอบคนขับ"
            : activeTab === "express"
            ? "งานที่ส่งผ่านบริษัทขนส่งภายนอก (Flash · Kerry · J&T · เฟิร์ส · จันทร์สว่าง · …) — เลือกบริษัทขนส่งจากตัวกรอง 🚚 ด้านล่าง · มอบคนขับ Pacred ไปส่งให้ขนส่ง · สร้างรอบจัดส่ง"
            : "ส่งโดยคนขับ Pacred เอง (เหมาๆ / Pacred Express) — เลือกจุดส่ง · เลือกคนขับ · กำหนดเวลา · สร้างรอบจัดส่ง. แต่ละ \"จุดส่ง\" คือกลุ่มที่อยู่ปลายทางเดียวกัน"}
        </p>
      </div>

      {/* Tab strip — the two legacy work-tabs + a link to the in-progress list */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-px">
        <TabLink href="/admin/drivers/new" active={activeTab === "driver"} icon={<Truck className="h-4 w-4" />} label="มอบงานให้คนขับรถ" count={driverCount} />
        <TabLink href="/admin/drivers/new?tab=pickup" active={activeTab === "pickup"} icon={<Home className="h-4 w-4" />} label="รับเองหน้าโกดัง" count={pickupCount} />
        <TabLink href="/admin/drivers/new?tab=express" active={activeTab === "express"} icon={<Zap className="h-4 w-4" />} label="Express (ขนส่งภายนอก)" count={expressCount} />
        <Link
          href="/admin/drivers"
          className="inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium text-muted hover:text-primary-600 hover:bg-surface-alt"
        >
          <Send className="h-4 w-4" />
          กำลังจัดส่ง / ติดตาม
          {inProgress > 0 && (
            <span className="ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold bg-blue-500 text-white">
              {inProgress.toLocaleString("th-TH")}
            </span>
          )}
        </Link>
        {/* Legacy tab 4 (forwarder-driver.php:762) — a health/stat indicator:
            "are all payment-approved ready-to-ship rows accounted for across the
            queues?" numerator = ยังไม่มอบ (driver+pickup) + ออกส่งแล้ว (inProgress);
            denominator = total fStatus=6 paydeposit-ok. Normally equal (X/X). */}
        <Link
          href="/admin/forwarders?status=6"
          title="รายการที่อนุมัติจ่ายเงินแล้ว (สถานะเตรียมส่ง) ทั้งหมด — กดดูรายการเต็ม"
          className="inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium text-muted hover:text-primary-600 hover:bg-surface-alt"
        >
          <CheckCircle2 className="h-4 w-4" />
          เตรียมส่ง · อนุมัติจ่ายแล้ว
          <span className="ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold bg-emerald-500 text-white">
            {(driverCount + pickupCount + expressCount + inProgress).toLocaleString("th-TH")}/{totalReadyToShip.toLocaleString("th-TH")}
          </span>
        </Link>
      </div>

      {/* Plain legacy-style count line (PCS has no stat cards — just a summary row) */}
      <div className="text-xs text-muted">
        {activeTab !== "pickup" ? (
          <>
            แทรคกิ้งรอมอบหมาย <b className="text-foreground">{eligible.length.toLocaleString("th-TH")}</b> ·
            {" "}จุดส่งจัดกลุ่มแล้ว <b className="text-foreground">{groups.length.toLocaleString("th-TH")}</b> ·
            {" "}คนขับพร้อมรับงาน <b className="text-foreground">{drivers.length.toLocaleString("th-TH")}</b>
          </>
        ) : (
          <>
            แทรคกิ้งรอปิดงาน <b className="text-foreground">{eligible.length.toLocaleString("th-TH")}</b> ·
            {" "}ลูกค้า (จัดกลุ่มแล้ว) <b className="text-foreground">{pickupGroups.length.toLocaleString("th-TH")}</b>
          </>
        )}
      </div>

      {(activeTab === "driver" || activeTab === "express") && drivers.length === 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ ยังไม่มีคนขับในระบบ — เพิ่มก่อนที่{" "}
          <Link href="/admin/admins/new" className="underline">/admin/admins/new</Link>{" "}
          (role = driver)
        </div>
      )}

      {/* Form per tab — pickup = hand-off close; driver/express = driver batch
          (Express adds the ขนส่ง carrier filter, มอบคนขับ doesn't) */}
      {activeTab === "pickup" ? (
        <SelfPickupForm groups={pickupGroups} />
      ) : (
        <CreateBatchForm groups={groups} drivers={drivers} showCarrierFilter={activeTab === "express"} />
      )}
    </main>
  );
}

function TabLink({
  href, active, icon, label, count,
}: {
  href: string; active: boolean; icon: React.ReactNode; label: string; count: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary-500 text-primary-700 bg-primary-50/40"
          : "border-transparent text-muted hover:text-primary-600 hover:bg-surface-alt"
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
          active ? "bg-primary-500 text-white" : "bg-rose-500 text-white"
        }`}>
          {count.toLocaleString("th-TH")}
        </span>
      )}
    </Link>
  );
}

