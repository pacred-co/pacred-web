/**
 * /admin/drivers/new — Create driver batch (faithful port of
 * `pcs-admin/forwarder-driver.php?page=add` "มอบงานให้คนขับรถ" tab).
 *
 * The page reads tb_forwarder rows ready for assignment (fstatus='6' =
 * เตรียมส่ง · NOT credit-pending · NOT already in an open batch), groups
 * them by (carrier · recipient address), and presents each combo as one
 * "จุดส่ง" the operator can tick. Operator then picks a driver + an
 * endtime preset (17/24/30 hr) and submits to create the batch.
 *
 * Legacy reference: forwarder-driver.php lines 717-940 (the "page=add"
 * branch, plus `include/pages/forwarder-driver/addFrom.php` for the
 * driver-picker modal — we inline the driver picker on the same page
 * instead of using a modal since modals don't fit Pacred's pattern).
 *
 * AGENTS.md §0a — Pacred Tailwind, NOT verbatim Bootstrap.
 * AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Truck, Package, MapPin } from "lucide-react";
import { CreateBatchForm } from "./create-batch-form";

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

export default async function CreateDriverBatchPage() {
  // warehouse included — warehouse staff create the delivery run on-site
  // (ภูม 2026-06-17 · owner confirmed · logistics-only, no money write).
  await requireAdmin(["ops", "super", "warehouse"]);
  const admin = createAdminClient();

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
  const eligible = ((eligibleData ?? []) as unknown as (ForwarderRow & { paydeposit: string | null })[])
    .filter((r) => r.paydeposit !== "1" && !openFids.has(r.id));

  // 3. Group by (fshipby, recipient address). Each group = "1 จุดส่ง".
  type Group = {
    key:         string;
    fshipby:     string | null;
    items:       ForwarderRow[];
    totalBoxes:  number;
    totalWeight: number;
    totalVolume: number;
    address:     {
      name:        string;
      lastName:    string;
      no:          string;
      subDistrict: string;
      district:    string;
      province:    string;
      zipCode:     string;
      tel:         string;
    };
    forwarderIds: number[];
  };
  const groupMap = new Map<string, Group>();
  for (const f of eligible) {
    const key = [
      f.fshipby ?? "", f.faddressname ?? "", f.faddresslastname ?? "",
      f.faddressno ?? "", f.faddresssubdistrict ?? "",
      f.faddressdistrict ?? "", f.faddressprovince ?? "", f.faddresszipcode ?? "",
    ].join("|");
    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push(f);
      existing.forwarderIds.push(f.id);
      existing.totalBoxes  += Number(f.famount  ?? 0);
      existing.totalWeight += Number(f.fweight  ?? 0);
      existing.totalVolume += Number(f.fvolume  ?? 0);
    } else {
      groupMap.set(key, {
        key,
        fshipby:     f.fshipby,
        items:       [f],
        forwarderIds: [f.id],
        totalBoxes:  Number(f.famount  ?? 0),
        totalWeight: Number(f.fweight  ?? 0),
        totalVolume: Number(f.fvolume  ?? 0),
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
  const groups = Array.from(groupMap.values()).sort((a, b) =>
    (a.address.name + a.address.no).localeCompare(b.address.name + b.address.no, "th"),
  );

  // 4. Driver picker — admins with role='driver' + active, joined to profiles
  //    for member_code + display name.
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
  const drivers: DriverOption[] = ((driversData ?? []) as unknown as DrvRow[])
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

  const totalEligible = eligible.length;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <ArrowLeft className="h-3 w-3" />
        กลับรายการ
      </Link>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">CARGO · มอบงานคนขับ</p>
        <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
          <Truck className="h-6 w-6" />
          สร้างรายการขนส่ง — มอบงานให้คนขับรถ
        </h1>
        <p className="mt-1 text-sm text-muted">
          เลือกจุดที่ต้องการให้ส่ง · เลือกคนขับ · กำหนดเวลาส่งงาน · สร้างรอบจัดส่ง.
          แต่ละ &quot;จุดส่ง&quot; คือกลุ่มที่อยู่ปลายทางเดียวกัน (ลูกค้าคนเดียวกัน + ขนส่งบริษัทเดียวกัน)
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat icon={<Package className="h-4 w-4" />} label="แทรคกิ้งรอมอบหมาย" value={totalEligible} />
        <Stat icon={<MapPin className="h-4 w-4" />} label="จุดส่งจัดกลุ่มแล้ว" value={groups.length} />
        <Stat icon={<Truck className="h-4 w-4" />} label="คนขับพร้อมรับงาน" value={drivers.length} />
      </div>

      {drivers.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ ยังไม่มีคนขับในระบบ — เพิ่มก่อนที่{" "}
          <Link href="/admin/admins/new" className="underline">/admin/admins/new</Link>{" "}
          (role = driver)
        </div>
      )}

      {/* Form */}
      <CreateBatchForm
        groups={groups.map((g) => ({
          key:         g.key,
          fshipby:     g.fshipby,
          shipByLabel: nameShipBy(g.fshipby),
          address: g.address,
          items: g.items.map((it) => ({
            id:            it.id,
            fidorco:       it.fidorco ?? `#${it.id}`,
            ftrackingchn:  it.ftrackingchn ?? "—",
            userid:        it.userid ?? "—",
            famount:       Number(it.famount  ?? 0),
            fweight:       Number(it.fweight  ?? 0),
            fvolume:       Number(it.fvolume  ?? 0),
            fpallet:       it.fpallet ?? "",
            fnote:         it.fnote ?? "",
          })),
          forwarderIds: g.forwarderIds,
          totalBoxes:   g.totalBoxes,
          totalWeight:  g.totalWeight,
          totalVolume:  g.totalVolume,
        }))}
        drivers={drivers}
      />
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-0.5">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}
