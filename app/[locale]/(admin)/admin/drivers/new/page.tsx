/**
 * /admin/drivers/new — Create driver batch + self-pickup close (faithful port
 * of `pcs-admin/forwarder-driver.php?page=add`, BOTH work-tabs).
 *
 * Legacy renders two functional tabs on this page (forwarder-driver.php:737/746):
 *   1. "มอบงานให้คนขับรถ"   (default · no `?q`)  — assign a Pacred driver
 *      → carriers `fShipBy NOT IN ('PCS','2','4')` (PCSF/PCSE door-to-door +
 *        other couriers). Grouped by (carrier · recipient address) = "จุดส่ง".
 *   2. "รายการรับเองหน้าโกดัง" (`?q=pcs`)         — hand-off, NO driver
 *      → carriers `fShipBy IN ('PCS','2','4')` (รับเอง / ไปรษณีย์ / J&T).
 *        Tick handed-off parcels → close ส่งแล้ว (fstatus 6→7).
 * (legacy also shows 2 counter-only tabs — "กำลังจัดส่ง" + "เตรียมส่งอนุมัติแล้ว"
 *  — that just link back; we surface "กำลังจัดส่ง" as a link to /admin/drivers,
 *  the list/รูป1 view where in-progress runs are managed.)
 *
 * The two tabs partition every fstatus=6 row with no overlap and no loss
 * (legacy counts forwarder-driver.php:726 [NOT IN 2,4,PCS] + :729 [IN 2,4,PCS]).
 * Before this, the page over-showed PCS/2/4 in the driver list (the bug
 * พี่ป๊อป hit — self-pickup parcels wrongly offered for driver assignment).
 *
 * AGENTS.md §0a — Pacred Tailwind, NOT verbatim Bootstrap.
 * AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Truck, Package, MapPin, Home, Send } from "lucide-react";
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

// nameShipBy equivalent (compact subset from legacy function.php — extend
// later if more carriers appear in data). Keep cases stable for prod fidelity.
const SHIP_BY_LABEL: Record<string, string> = {
  PCSF: "Pacred เหมาเหมา",
  PCSE: "Pacred Express",
  PCS:  "รับเองโกดัง Pacred",
  "1":  "KERRY",
  "2":  "ไปรษณีย์",
  "3":  "Flash",
  "4":  "J&T",
  "5":  "Best Express",
  "6":  "Ninja",
  "7":  "DHL",
};

function nameShipBy(code: string | null): string {
  if (!code) return "—";
  return SHIP_BY_LABEL[code] ?? code;
}

// The carriers that go through the รับเองหน้าโกดัง tab (legacy: fShipBy IN
// 'PCS','2','4'). The driver tab is the complement.
function isSelfPickup(code: string | null): boolean {
  return code === "PCS" || code === "2" || code === "4";
}

type Stop = {
  key:          string;
  fshipby:      string | null;
  shipByLabel:  string;
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

/** Group eligible rows by (carrier · recipient address) into form-ready stops. */
function buildStops(eligible: ForwarderRow[]): Stop[] {
  const groupMap = new Map<string, Stop>();
  for (const f of eligible) {
    const key = [
      f.fshipby ?? "", f.faddressname ?? "", f.faddresslastname ?? "",
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
      groupMap.set(key, {
        key,
        fshipby:     f.fshipby,
        shipByLabel: nameShipBy(f.fshipby),
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
          name:        f.faddressname ?? "",
          lastName:    f.faddresslastname ?? "",
          no:          f.faddressno ?? "",
          subDistrict: f.faddresssubdistrict ?? "",
          district:    f.faddressdistrict ?? "",
          province:    f.faddressprovince ?? "",
          zipCode:     f.faddresszipcode ?? "",
          tel:         f.faddresstel ?? "",
        },
      });
    }
  }
  return Array.from(groupMap.values()).sort((a, b) =>
    (a.address.name + a.address.no).localeCompare(b.address.name + b.address.no, "th"),
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
  const activeTab: "driver" | "pickup" = sp.tab === "pickup" ? "pickup" : "driver";

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
  const allEligible = ((eligibleData ?? []) as unknown as (ForwarderRow & { paydeposit: string | null })[])
    .filter((r) => r.paydeposit !== "1" && !openFids.has(r.id));

  // 3. Partition into the two legacy tabs (no overlap, no loss).
  const driverEligible = allEligible.filter((r) => !isSelfPickup(r.fshipby));
  const pickupEligible = allEligible.filter((r) => isSelfPickup(r.fshipby));
  const driverCount = driverEligible.length;
  const pickupCount = pickupEligible.length;

  const eligible = activeTab === "pickup" ? pickupEligible : driverEligible;
  const groups = buildStops(eligible);

  // 4. Driver picker — only the driver tab needs it.
  let drivers: DriverOption[] = [];
  if (activeTab === "driver") {
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
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <ArrowLeft className="h-3 w-3" />
        กลับรายการ
      </Link>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">CARGO · จัดส่ง</p>
        <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
          {activeTab === "pickup" ? <Home className="h-6 w-6" /> : <Truck className="h-6 w-6" />}
          {activeTab === "pickup"
            ? "รับเองหน้าโกดัง — ปิดงานส่งสำเร็จ"
            : "สร้างรายการขนส่ง — มอบงานให้คนขับรถ"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {activeTab === "pickup"
            ? "ของที่ลูกค้ามารับเอง / ส่งไปรษณีย์ / J&T — ติ๊กที่ส่ง/รับแล้ว แนบรูป (ถ้ามี) → ปิดงานเป็น \"ส่งแล้ว\" โดยไม่ต้องมอบคนขับ"
            : "เลือกจุดที่ต้องการให้ส่ง · เลือกคนขับ · กำหนดเวลาส่งงาน · สร้างรอบจัดส่ง. แต่ละ \"จุดส่ง\" คือกลุ่มที่อยู่ปลายทางเดียวกัน"}
        </p>
      </div>

      {/* Tab strip — the two legacy work-tabs + a link to the in-progress list */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-px">
        <TabLink href="/admin/drivers/new" active={activeTab === "driver"} icon={<Truck className="h-4 w-4" />} label="มอบงานให้คนขับรถ" count={driverCount} />
        <TabLink href="/admin/drivers/new?tab=pickup" active={activeTab === "pickup"} icon={<Home className="h-4 w-4" />} label="รับเองหน้าโกดัง" count={pickupCount} />
        <Link
          href="/admin/drivers"
          className="inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium text-muted hover:text-primary-600 hover:bg-surface-alt"
        >
          <Send className="h-4 w-4" />
          กำลังจัดส่ง / ติดตาม
        </Link>
      </div>

      {/* Stats strip */}
      {activeTab === "driver" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat icon={<Package className="h-4 w-4" />} label="แทรคกิ้งรอมอบหมาย" value={eligible.length} />
          <Stat icon={<MapPin className="h-4 w-4" />} label="จุดส่งจัดกลุ่มแล้ว" value={groups.length} />
          <Stat icon={<Truck className="h-4 w-4" />} label="คนขับพร้อมรับงาน" value={drivers.length} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat icon={<Package className="h-4 w-4" />} label="แทรคกิ้งรอปิดงาน" value={eligible.length} />
          <Stat icon={<Home className="h-4 w-4" />} label="รายการจัดกลุ่มแล้ว" value={groups.length} />
        </div>
      )}

      {activeTab === "driver" && drivers.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ ยังไม่มีคนขับในระบบ — เพิ่มก่อนที่{" "}
          <Link href="/admin/admins/new" className="underline">/admin/admins/new</Link>{" "}
          (role = driver)
        </div>
      )}

      {/* Form per tab */}
      {activeTab === "pickup" ? (
        <SelfPickupForm groups={groups} />
      ) : (
        <CreateBatchForm groups={groups} drivers={drivers} />
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-0.5">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}
