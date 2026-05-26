import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { AdminForwarderUpdateForm } from "./update-form";
import { DriverAssignForm } from "./driver-assign-form";
import { CostAdjustmentsPanel, type CostAdjustmentRow } from "./cost-adjustments-panel";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";
import {
  User as UserIcon,
  Package,
  Warehouse,
  Truck,
  Plane,
  CheckCircle2,
  Circle,
  Clock,
  StickyNote,
} from "lucide-react";

// W-1: requireAdmin reads auth cookies; a page under a dynamic [fNo]
// segment that reads cookies MUST be force-dynamic (AGENTS.md §11).
//
// Wave 3 cleanup (2026-05-20 ค่ำ): the "Cargo shipments (spine)" section
// was removed when cargo_shipments/cargo_containers were retired under
// D1 Option A. The forwarder's container number is on the `cabinet_number`
// column directly (rendered in the AdminForwarderUpdateForm) and `tracking_th`
// gives the in-Thailand parcel ID; full container-level view lives at
// `/admin/report-cnt` (faithful port of report-cnt.php).
export const dynamic = "force-dynamic";

export default async function AdminForwarderDetail({ params }: { params: Promise<{ fNo: string }> }) {
  // W-1 (gap-admin H-1): same gate as the list page — import-order
  // detail + cost adjustments is ops + accounting only.
  await requireAdmin(["ops", "accounting"]);

  const { fNo } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("forwarders")
    .select(`
      id, f_no, profile_id, status, source_warehouse, transport_type, product_type, rate_basis,
      box_count, weight_kg, volume_cbm, width_cm, length_cm, height_cm,
      total_price, transport_price, service_fee, crate, crate_price, qc, qc_price,
      domestic_china_thb, thailand_delivery_thb, other_price,
      tracking_chn, tracking_th, cabinet_number, partner_warehouse, note_admin, note_user, detail,
      ship_first_name, ship_last_name, ship_phone, ship_phone2, ship_address_line, ship_sub_district, ship_district, ship_province, ship_postal_code, ship_note,
      bill_to_name_override,
      acknowledged_at, acknowledged_note,
      created_at, date_arrived_thailand, date_delivered,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email )
    `)
    .eq("f_no", fNo)
    .maybeSingle();
  if (error) {
    console.error(`[forwarders list] failed`, { code: error.code, message: error.message });
  }

  if (!data) {
    // Wave 3 P0 #1 fallback (2026-05-21): the list page reads tb_forwarder
    // (legacy · 47K rows on prod) while this detail page reads the rebuilt
    // forwarders (EMPTY on prod). Row clicks that came from the list will
    // miss here. Look up the row in tb_forwarder by id or fidorco and render
    // a minimal read-only legacy view + link to /admin/report-cnt for the
    // container info. Full editable detail = Wave 5 (rewrite of update form
    // + cost adjustments + driver assign + bill-to over tb_forwarder).
    return await renderLegacyForwarderView(fNo, admin);
  }
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
  const f = data as unknown as Omit<typeof data, "profile"> & { profile: ProfileShape | ProfileShape[] | null };
  const profile = Array.isArray(f.profile) ? f.profile[0] ?? null : f.profile;

  const { data: items, error: itemsErr } = await admin
    .from("forwarder_items")
    .select("id, product_name, product_tracking, product_qty")
    .eq("forwarder_id", f.id);
  if (itemsErr) {
    console.error(`[forwarder_items list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }

  // U2-4: load cost adjustments for this forwarder
  const { data: costAdjRaw, error: costAdjRawErr } = await admin
    .from("forwarder_cost_adjustments")
    .select("id, kind, amount_thb, note, status, created_at, paid_at, cancellation_reason")
    .eq("forwarder_id", f.id)
    .order("created_at", { ascending: false })
    .returns<CostAdjustmentRow[]>();
  if (costAdjRawErr) {
    console.error(`[forwarder_cost_adjustments list] failed`, { code: costAdjRawErr.code, message: costAdjRawErr.message });
  }
  const costAdjustments = costAdjRaw ?? [];

  // T-P1: load all driver assignments (history + active) for this forwarder
  const { data: assignmentsRaw, error: assignmentsRawErr } = await admin
    .from("forwarder_driver")
    .select(`
      id, status, fd_date, accepted_at, completed_at,
      driver:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .eq("forwarder_id", f.id)
    .order("fd_date", { ascending: false });
  if (assignmentsRawErr) {
    console.error(`[forwarder_driver list] failed`, { code: assignmentsRawErr.code, message: assignmentsRawErr.message });
  }
  type DriverShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  const assignments = ((assignmentsRaw ?? []) as Array<{
    id: string; status: number; fd_date: string;
    accepted_at: string | null; completed_at: string | null;
    driver: DriverShape | DriverShape[] | null;
  }>).map((a) => ({
    ...a,
    driver: Array.isArray(a.driver) ? (a.driver[0] ?? null) : a.driver,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ฝากนำเข้า</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{f.f_no}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Wave 12-C ภาค 2 — แก้ไขขนาด/น้ำหนัก */}
          <Link
            href={`/admin/forwarders/${f.f_no}/edit`}
            className="rounded-lg border border-primary-500 bg-primary-50 px-3 py-1.5 text-sm text-primary-700 font-medium hover:bg-primary-100"
          >
            ✏️ แก้ไขขนาด/น้ำหนัก
            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Wave 12-C ภาค 2 · ใหม่
            </span>
          </Link>
          <Link href="/admin/forwarders" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            ← กลับรายการ
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          {/* Customer */}
          <Section title="ลูกค้า">
            <Row label="รหัสสมาชิก" value={profile?.member_code ?? "—"} mono />
            <Row label="ชื่อ" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`} />
            <Row label="เบอร์" value={profile?.phone ?? "—"} />
            <Row label="อีเมล" value={profile?.email ?? "—"} />
            <Link href={`/admin/customers/${f.profile_id}`} className="text-xs text-primary-500 hover:underline">→ ดูโปรไฟล์ลูกค้า</Link>
          </Section>

          {/* Address */}
          <Section title="ที่อยู่จัดส่ง">
            <p className="text-sm">{f.ship_first_name} {f.ship_last_name}</p>
            <p className="text-xs text-muted">📞 {f.ship_phone}{f.ship_phone2 ? ` / ${f.ship_phone2}` : ""}</p>
            <p className="text-sm">{f.ship_address_line} ต.{f.ship_sub_district} อ.{f.ship_district} จ.{f.ship_province} {f.ship_postal_code}</p>
            {f.ship_note && <p className="text-xs text-muted">📝 {f.ship_note}</p>}
          </Section>

          {/* Dimensions */}
          <Section title="ขนาด / น้ำหนัก">
            <Row label="กล่อง" value={`${f.box_count}`} />
            <Row label="น้ำหนัก" value={`${Number(f.weight_kg).toFixed(2)} kg`} mono />
            <Row label="ขนาดกล่อง" value={`${Number(f.width_cm)}×${Number(f.length_cm)}×${Number(f.height_cm)} cm`} mono />
            <Row label="ปริมาตร" value={`${Number(f.volume_cbm).toFixed(3)} cbm`} mono />
          </Section>

          {/* Items */}
          {items && items.length > 0 && (
            <Section title={`รายการสินค้า (${items.length})`}>
              <ul className="text-sm space-y-1">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between border-b border-border pb-1">
                    <span>{it.product_name}{it.product_tracking ? ` · ${it.product_tracking}` : ""}</span>
                    <span className="font-mono text-xs">× {it.product_qty}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Pricing */}
          <Section title="ราคา">
            <Row label="ค่าขนส่ง" value={`฿${Number(f.transport_price).toFixed(2)}`} mono />
            <Row label="ค่าบริการ" value={`฿${Number(f.service_fee).toFixed(2)}`} mono />
            {f.crate && <Row label="ค่าตีลังไม้" value={`฿${Number(f.crate_price).toFixed(2)}`} mono />}
            {f.qc && <Row label="ค่า QC" value={`฿${Number(f.qc_price).toFixed(2)}`} mono />}
            {f.domestic_china_thb > 0 && <Row label="ค่าขนส่งในจีน" value={`฿${Number(f.domestic_china_thb).toFixed(2)}`} mono />}
            {f.thailand_delivery_thb > 0 && <Row label="ค่าขนส่งในไทย" value={`฿${Number(f.thailand_delivery_thb).toFixed(2)}`} mono />}
            {f.other_price > 0 && <Row label="อื่นๆ" value={`฿${Number(f.other_price).toFixed(2)}`} mono />}
            <div className="flex justify-between pt-2 border-t border-border text-base font-bold">
              <span>รวม</span>
              <span className="font-mono">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </Section>

          {/* Container info — Wave 3: the spine join was removed; the
              container number lives directly on `forwarders.cabinet_number`
              and is shown in the AdminForwarderUpdateForm. For the full
              container view + รายงานตู้, jump to /admin/report-cnt. */}
          {f.cabinet_number && (
            <Section title="📦 ตู้คอนเทนเนอร์">
              <Row label="หมายเลขตู้" value={f.cabinet_number} mono />
              <Link href="/admin/report-cnt" className="text-xs text-primary-500 hover:underline">→ ดูในรายงานตู้</Link>
            </Section>
          )}

          {(f as { acknowledged_at: string | null }).acknowledged_at && (
            <Section title="✅ ลูกค้ายืนยันรับสินค้าแล้ว (U4-3a)">
              <p className="text-xs text-muted">
                {new Date((f as { acknowledged_at: string }).acknowledged_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {(f as { acknowledged_note: string | null }).acknowledged_note && (
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  <span className="text-muted text-xs">โน้ตจากลูกค้า:</span> {(f as { acknowledged_note: string }).acknowledged_note}
                </p>
              )}
            </Section>
          )}

          {f.note_user && (
            <Section title="หมายเหตุจากลูกค้า">
              <p className="text-sm whitespace-pre-wrap">{f.note_user}</p>
            </Section>
          )}
          {f.detail && (
            <Section title="รายละเอียดสินค้า">
              <p className="text-sm whitespace-pre-wrap">{f.detail}</p>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <AdminForwarderUpdateForm
            fNo={f.f_no}
            status={f.status}
            totalPrice={Number(f.total_price)}
            tracking_chn={f.tracking_chn}
            tracking_th={f.tracking_th}
            cabinet_number={f.cabinet_number}
            partner_warehouse={f.partner_warehouse}
            note_admin={f.note_admin}
          />
          <DriverAssignForm
            forwarderId={f.id}
            assignments={assignments}
          />
          <CostAdjustmentsPanel
            forwarderId={f.id}
            fNo={f.f_no}
            existing={costAdjustments}
          />
          <BillToOverridePanel
            kind="forwarder"
            fNo={f.f_no}
            defaultName={[f.ship_first_name, f.ship_last_name].filter(Boolean).join(" ") || ""}
            current={f.bill_to_name_override ?? null}
          />
        </aside>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
      <h3 className="font-bold text-sm">{title}</h3>
      {children}
    </div>
  );
}
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

// Wave 3 P0 #1 fallback + Wave 20 P1 enrichment — legacy tb_forwarder
// detail view, enhanced to match the PCS layout that ภูม flagged on
// 2026-05-25 ค่ำ. Adds:
//   · 7-step status timeline (icons + completed-when based on fdatestatus*)
//   · Sale rep + admin creator badges (joined from tb_users.adminidsale)
//   · Product detail block — cover image + Chinese name when shop-spawned
//     (reforder != ""), freetext fdetail otherwise
//   · ค่าใช้จ่ายแบบแยก (transport + service + crate + qc + other) instead
//     of just one ftotalprice number
//   · paydeposit / pay-method / credit-line state line
//   · Note block (read-only for now; write form = Wave 20 P1.1)
async function renderLegacyForwarderView(
  fNo: string,
  admin: ReturnType<typeof createAdminClient>,
) {
  // Decide column to look up: numeric → id, else fidorco.
  const asNumber = Number(fNo);
  const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

  let tbq = admin
    .from("tb_forwarder")
    .select(
      // Core identity + lifecycle
      "id, fidorco, userid, fstatus, fdate, " +
      "fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus5, fdatestatus6, fdatestatus7, " +
      "fdatetothai, fdatecontainerclose, " +
      // Routing / mode
      "ftransporttype, fwarehousechina, fwarehousename, fcabinetnumber, " +
      "ftrackingchn, ftrackingth, fshipby, fshippingservice, " +
      // Dimensions + cost
      "fweight, fvolume, fwidth, flength, fheight, famount, famountcount, " +
      "ftotalprice, fcosttotalprice, ftransportprice, fpriceupdate, fdiscount, " +
      "pricecrate, fqcprice, ftransportpricechnthb, priceother, fproductstype, " +
      "frefprice, frefrate, customrate, customratekg, customratecbm, " +
      // Address
      "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
      "faddressdistrict, faddressprovince, faddresszipcode, " +
      "faddresstel, faddresstel2, faddressnote, " +
      // Notes + meta + source
      "fnote, fdetail, fcover, fcredit, reforder, " +
      "adminid, adminidcreator, adminidupdate, paymethod, paydeposit, crate, fpallet",
    )
    .limit(1);
  tbq = isId ? tbq.eq("id", asNumber) : tbq.eq("fidorco", fNo);
  const { data: tbRow, error: tbRowErr } = await tbq.maybeSingle();
  if (tbRowErr) {
    console.error(`[tb_forwarder detail] failed`, {
      code: tbRowErr.code, message: tbRowErr.message,
    });
  }
  if (!tbRow) notFound();
  const r = tbRow as unknown as {
    id: number; fidorco: string | null; userid: string; fstatus: string;
    fdate: string | null;
    fdatestatus2: string | null; fdatestatus3: string | null;
    fdatestatus4: string | null; fdatestatus5: string | null;
    fdatestatus6: string | null; fdatestatus7: string | null;
    fdatetothai: string | null; fdatecontainerclose: string | null;
    ftransporttype: string; fwarehousechina: string; fwarehousename: string;
    fcabinetnumber: string | null; ftrackingchn: string | null; ftrackingth: string | null;
    fshipby: string | null; fshippingservice: number | null;
    fweight: number | null; fvolume: number | null;
    fwidth: number | null; flength: number | null; fheight: number | null;
    famount: number | null; famountcount: string | null;
    ftotalprice: number | null; fcosttotalprice: number | null;
    ftransportprice: number | null; fpriceupdate: number | null; fdiscount: number | null;
    pricecrate: number | null; fqcprice: number | null;
    ftransportpricechnthb: number | null; priceother: number | null;
    fproductstype: string | null;
    frefprice: string | null; frefrate: number | null;
    customrate: string | null; customratekg: number | null; customratecbm: number | null;
    faddressname: string | null; faddresslastname: string | null;
    faddressno: string | null; faddresssubdistrict: string | null;
    faddressdistrict: string | null; faddressprovince: string | null;
    faddresszipcode: string | null;
    faddresstel: string | null; faddresstel2: string | null; faddressnote: string | null;
    fnote: string | null; fdetail: string | null; fcover: string | null;
    fcredit: string | null; reforder: string | null;
    adminid: string | null; adminidcreator: string | null; adminidupdate: string | null;
    paymethod: string | null; paydeposit: string | null;
    crate: string | null; fpallet: number | null;
  };

  // Customer name lookup — now also pulls adminidsale (the customer's
  // assigned sales rep, shown as a "Sale" badge in legacy) + userpicture.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel, useremail, userpicture, adminidsale")
    .eq("userid", r.userid)
    .maybeSingle();
  if (userRowErr) {
    console.error(`[tb_users detail] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const u = userRow as unknown as {
    userid: string; username: string | null; userlastname: string | null;
    usertel: string | null; useremail: string | null;
    userpicture: string | null; adminidsale: string | null;
  } | null;

  // Resolve cover image — shop-spawned rows may have a live alicdn URL
  // (https://...), legacy local filename (PCS prefix), or empty.
  const coverHref = r.fcover && r.fcover.trim() !== ""
    ? (r.fcover.startsWith("http") ? r.fcover : await resolveLegacyUrl(r.fcover, "cover"))
    : null;
  const customerAvatar = await resolveLegacyUrl(u?.userpicture ?? null, "profile-thumb");

  const STATUS_LABEL: Record<string, string> = {
    "1":"รอเข้าโกดังจีน","2":"ถึงโกดังจีนแล้ว","3":"กำลังส่งมาไทย","4":"ถึงไทยแล้ว",
    "5":"รอชำระเงิน","6":"เตรียมส่ง","7":"ส่งแล้ว","99":"พิเศษ",
  };
  const MODE_LABEL: Record<string, string> = { "1": "🚛 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ" };
  const WAREHOUSE_LABEL: Record<string, string> = {
    "1":"แสง","2":"CTT","3":"MK","4":"MX","5":"JMF","6":"GOGO","7":"Cargo Center","8":"MOMO",
  };

  // Wave 20 P1: build the 7-step timeline. Each step has an icon + a
  // datestamp pulled from fdatestatusN. The current fstatus marks the
  // ACTIVE step; earlier steps with a date show as completed.
  const currentStatusInt = parseInt(r.fstatus, 10);
  const TIMELINE: Array<{ key: number; label: string; date: string | null; Icon: typeof Package }> = [
    { key: 1, label: "เข้าโกดังจีน",  date: r.fdate ?? null,         Icon: Package },
    { key: 2, label: "อยู่โกดังจีน",  date: r.fdatestatus2 ?? null,  Icon: Warehouse },
    { key: 3, label: "ส่งมาไทย",      date: r.fdatestatus3 ?? null,  Icon: r.ftransporttype === "3" ? Plane : Truck },
    { key: 4, label: "ถึงไทย",         date: r.fdatestatus4 ?? null,  Icon: Warehouse },
    { key: 5, label: "รอชำระเงิน",    date: r.fdatestatus5 ?? null,  Icon: Clock },
    { key: 6, label: "เตรียมส่ง",     date: r.fdatestatus6 ?? null,  Icon: Truck },
    { key: 7, label: "ส่งแล้ว",        date: r.fdatestatus7 ?? null,  Icon: CheckCircle2 },
  ];

  // Cost breakdown (legacy "ราคารวม" = sum of these parts).
  const transportTotal = Number(r.ftransportprice ?? 0);
  const priceUpdate = Number(r.fpriceupdate ?? 0);
  const crateCost = Number(r.pricecrate ?? 0);
  const qcCost = Number(r.fqcprice ?? 0);
  const otherCost = Number(r.priceother ?? 0);
  const shippingService = Number(r.fshippingservice ?? 0);
  const transportChnThb = Number(r.ftransportpricechnthb ?? 0);
  const discount = Number(r.fdiscount ?? 0);
  const refRate = Number(r.frefrate ?? 0);

  // Source: shop-spawned (refOrder != "") vs admin-created vs system.
  const sourceTag: { label: string; cls: string } = r.reforder && r.reforder !== ""
    ? { label: `ฝากสั่งซื้อ : ${r.reforder}`, cls: "bg-sky-50 text-sky-700 border-sky-200" }
    : r.adminidcreator && r.adminidcreator !== ""
      ? { label: `ฝากนำเข้า : ${r.adminidcreator}`, cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : { label: "ฝากนำเข้าจาก : users", cls: "bg-gray-50 text-gray-600 border-gray-200" };

  return (
    <main className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      {/* ── 1. HEADER — id + status badge + source tag + meta ── */}
      <div className="space-y-2">
        <nav className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
          <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
          <span>/</span>
          <Link href="/admin/forwarders" className="hover:text-primary-600">บริการฝากนำเข้า</Link>
          <span>/</span>
          <span className="font-mono text-foreground">#{r.fidorco ?? r.id}</span>
        </nav>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold font-mono">{r.fidorco ?? `#${r.id}`}</h1>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            currentStatusInt >= 7 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            currentStatusInt === 99 ? "bg-violet-50 text-violet-700 border-violet-200" :
            currentStatusInt >= 4 ? "bg-blue-50 text-blue-700 border-blue-200" :
            "bg-yellow-50 text-yellow-700 border-yellow-200"
          }`}>
            {STATUS_LABEL[r.fstatus] ?? `สถานะ ${r.fstatus}`}
          </span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${sourceTag.cls}`}>
            {sourceTag.label}
          </span>
          {u?.adminidsale && u.adminidsale !== "" && (
            <span className="rounded-full border border-purple-200 bg-purple-50 text-purple-700 px-2.5 py-0.5 text-xs">
              Sale : {u.adminidsale}
            </span>
          )}
          {r.fcredit === "1" && (
            <span className="rounded-full border border-red-200 bg-red-50 text-red-700 px-2.5 py-0.5 text-xs">
              💳 เครดิตสินค้า
            </span>
          )}
        </div>
      </div>

      {/* ── 2. STATUS TIMELINE — 7 icons + datestamps ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-5">
        <div className="overflow-x-auto scrollbar-x-visible">
          <ol className="flex items-start gap-2 min-w-max lg:min-w-0 lg:justify-between">
            {TIMELINE.map((step, idx) => {
              const isActive = step.key === currentStatusInt;
              const isComplete = step.key < currentStatusInt || (step.key === currentStatusInt && currentStatusInt >= 7);
              const isFuture = step.key > currentStatusInt && currentStatusInt !== 99;
              const StepIcon = isComplete ? CheckCircle2 : step.Icon;
              return (
                <li key={step.key} className="flex flex-col items-center text-center min-w-[80px] lg:flex-1 relative">
                  {idx < TIMELINE.length - 1 && (
                    <span
                      className={`absolute top-5 left-1/2 w-full h-0.5 ${
                        isComplete ? "bg-emerald-300" : "bg-border"
                      }`}
                      aria-hidden
                    />
                  )}
                  <div
                    className={`relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                      isActive
                        ? "border-primary-500 bg-primary-50 text-primary-600 ring-4 ring-primary-100"
                        : isComplete
                          ? "border-emerald-400 bg-emerald-50 text-emerald-600"
                          : isFuture
                            ? "border-border bg-surface-alt text-muted"
                            : "border-border bg-white text-muted"
                    }`}
                  >
                    {isFuture ? <Circle className="h-4 w-4" /> : <StepIcon className="h-5 w-5" />}
                  </div>
                  <p className={`mt-2 text-[11px] font-medium ${isActive ? "text-primary-700" : "text-foreground"}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-muted font-mono">
                    {step.date ? new Date(step.date).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── 3. 2-COL: LEFT customer+meta+address · RIGHT cost breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer card */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
            <h3 className="text-sm font-semibold text-muted mb-3">ลูกค้า</h3>
            <Link
              href={`/admin/customers/${r.userid}`}
              className="inline-flex items-center gap-3 group"
            >
              {customerAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={customerAvatar}
                  alt={u?.username ?? r.userid}
                  className="h-12 w-12 rounded-full object-cover border border-border"
                />
              ) : (
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt text-muted">
                  <UserIcon className="h-5 w-5" />
                </span>
              )}
              <div>
                <p className="text-sm font-semibold group-hover:text-primary-600">
                  คุณ{u?.username ?? ""} {u?.userlastname ?? ""}
                </p>
                <p className="text-xs text-muted font-mono">[{r.userid}]</p>
                <p className="text-xs text-muted">📞 {u?.usertel ?? "—"} · ✉️ {u?.useremail ?? "—"}</p>
              </div>
            </Link>
          </section>

          {/* Routing card */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 text-sm">
            <h3 className="text-sm font-semibold text-muted mb-3">การจัดส่ง</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <LegacyKV label="วันที่สร้าง" value={r.fdate ? new Date(r.fdate).toLocaleString("th-TH") : "—"} />
              <LegacyKV label="วันที่ถึงไทย" value={r.fdatetothai ? new Date(r.fdatetothai).toLocaleDateString("th-TH") : "—"} />
              <LegacyKV label="โกดังจีน" value={WAREHOUSE_LABEL[r.fwarehousename] ?? r.fwarehousename} />
              <LegacyKV label="ขนส่ง" value={MODE_LABEL[r.ftransporttype] ?? r.ftransporttype} />
              <LegacyKV
                label="หมายเลขตู้"
                value={r.fcabinetnumber ?? "—"}
                href={r.fcabinetnumber ? `/admin/report-cnt?id=${encodeURIComponent(r.fcabinetnumber)}` : undefined}
                mono
              />
              <LegacyKV label="วันปิดตู้" value={r.fdatecontainerclose ? new Date(r.fdatecontainerclose).toLocaleDateString("th-TH") : "—"} />
              <LegacyKV label="Tracking CN" value={r.ftrackingchn ?? "—"} mono />
              <LegacyKV label="Tracking TH" value={r.ftrackingth ?? "—"} mono />
              <LegacyKV label="ผู้ขนส่ง (Ship-by)" value={r.fshipby ?? "—"} />
              <LegacyKV label="จำนวน / น้ำหนัก / CBM" value={`${r.famount ?? 0} กล่อง · ${Number(r.fweight ?? 0).toFixed(2)} กก. · ${Number(r.fvolume ?? 0).toFixed(3)} ม³`} mono />
            </div>
          </section>

          {/* Product detail card */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
            <h3 className="text-sm font-semibold text-muted mb-3 flex items-center justify-between">
              <span>รายละเอียดสินค้า</span>
              {r.reforder && r.reforder !== "" && (
                <Link
                  href={`/admin/service-orders/${r.reforder}`}
                  className="text-xs font-normal text-sky-600 hover:underline"
                >
                  ดูออเดอร์ต้นทาง {r.reforder} →
                </Link>
              )}
            </h3>
            <div className="flex gap-4 items-start">
              {coverHref && (
                <a
                  href={coverHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block flex-shrink-0 w-28 h-28 rounded-lg border border-border overflow-hidden bg-surface-alt/40 hover:border-primary-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverHref} alt="cover" className="w-full h-full object-cover" />
                </a>
              )}
              <div className="flex-1 text-sm">
                {r.fdetail && r.fdetail.trim() !== "" && r.fdetail !== "..." ? (
                  <p className="whitespace-pre-wrap">{r.fdetail}</p>
                ) : (
                  <p className="text-muted italic">—</p>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {r.fwidth !== null && r.fwidth > 0 && (
                    <Field label="กว้าง" value={`${r.fwidth} cm`} />
                  )}
                  {r.flength !== null && r.flength > 0 && (
                    <Field label="ยาว" value={`${r.flength} cm`} />
                  )}
                  {r.fheight !== null && r.fheight > 0 && (
                    <Field label="สูง" value={`${r.fheight} cm`} />
                  )}
                  {r.fpallet !== null && r.fpallet > 0 && (
                    <Field label="พาเลท" value={`${r.fpallet}`} />
                  )}
                  {r.crate && r.crate !== "" && r.crate !== "0" && (
                    <Field label="ตีลังไม้" value={r.crate === "1" ? "ใช่" : r.crate === "2" ? "ตามขนาด" : r.crate} />
                  )}
                </dl>
              </div>
            </div>
          </section>

          {/* Address card */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 text-sm">
            <h3 className="text-sm font-semibold text-muted mb-2">ที่อยู่จัดส่ง</h3>
            <p className="font-medium">
              {r.faddressname ?? ""} {r.faddresslastname ?? ""}
            </p>
            <p>
              {r.faddressno ?? ""} {r.faddresssubdistrict ? `ต.${r.faddresssubdistrict}` : ""} {r.faddressdistrict ? `อ.${r.faddressdistrict}` : ""} {r.faddressprovince ? `จ.${r.faddressprovince}` : ""} {r.faddresszipcode ?? ""}
            </p>
            {(r.faddresstel || r.faddresstel2) && (
              <p className="text-xs text-muted mt-1">
                📞 {r.faddresstel ?? "—"}{r.faddresstel2 ? ` · ${r.faddresstel2}` : ""}
              </p>
            )}
            {r.faddressnote && (
              <p className="text-xs text-muted mt-1">📝 {r.faddressnote}</p>
            )}
          </section>

          {/* Note card */}
          {r.fnote && r.fnote.trim() !== "" && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <h3 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" /> หมายเหตุ
              </h3>
              <p className="whitespace-pre-wrap text-amber-900">{r.fnote}</p>
            </section>
          )}
        </div>

        {/* RIGHT (1/3 width on desktop) — cost breakdown + admin meta */}
        <div className="space-y-4">
          {/* Cost breakdown */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 text-sm">
            <h3 className="text-sm font-semibold text-muted mb-3">ค่าใช้จ่าย</h3>
            <dl className="space-y-1.5 text-xs">
              {transportTotal > 0 && <Field label="ค่าขนส่ง" value={`฿${transportTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {priceUpdate > 0 && <Field label="ค่าสินค้า/ลด" value={`฿${priceUpdate.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {crateCost > 0 && <Field label="ค่าตีลังไม้" value={`฿${crateCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {qcCost > 0 && <Field label="ค่า QC" value={`฿${qcCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {shippingService > 0 && <Field label="ค่าบริการ" value={`฿${shippingService.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {transportChnThb > 0 && <Field label="ค่าขนส่งจีน-ไทย" value={`฿${transportChnThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {otherCost > 0 && <Field label="ค่าอื่นๆ" value={`฿${otherCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {discount > 0 && <Field label="ส่วนลด" value={`-฿${discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />}
              {refRate > 0 && <Field label="เรท ¥→฿" value={`${refRate.toFixed(2)}`} mono />}
            </dl>
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
              <div className="flex justify-between text-sm font-bold">
                <span>ราคารวม</span>
                <span className="font-mono text-primary-600">฿{Number(r.ftotalprice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span>ต้นทุนรวม</span>
                <span className="font-mono">฿{Number(r.fcosttotalprice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </section>

          {/* Admin meta */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 text-xs">
            <h3 className="text-sm font-semibold text-muted mb-3">ข้อมูลแอดมิน</h3>
            <dl className="space-y-1.5">
              <Field label="แอดมินสร้าง" value={r.adminidcreator || "—"} />
              <Field label="แอดมินอัปเดต" value={r.adminidupdate || "—"} />
              <Field label="วิธีชำระเงิน" value={r.paymethod === "1" ? "หักเงินในกระเป๋า" : r.paymethod || "—"} />
              {r.paydeposit && r.paydeposit !== "" && (
                <Field label="เงินค่ามัดจำ" value={r.paydeposit} />
              )}
            </dl>
          </section>

          {/* Action buttons */}
          <div className="space-y-2">
            <Link
              href={`/admin/forwarders/${encodeURIComponent(fNo)}/edit`}
              className="block w-full rounded-lg border border-primary-500 bg-primary-50 px-3 py-2 text-sm text-primary-700 font-medium hover:bg-primary-100 text-center"
            >
              ✏️ แก้ไขขนาด / น้ำหนัก
            </Link>
            {r.fcabinetnumber && (
              <Link
                href={`/admin/report-cnt?id=${encodeURIComponent(r.fcabinetnumber)}`}
                className="block w-full rounded-lg bg-primary-500 px-3 py-2 text-sm text-white font-medium hover:bg-primary-600 text-center"
              >
                📦 ดูตู้คอนเทนเนอร์ →
              </Link>
            )}
            <Link
              href="/admin/forwarders"
              className="block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt text-center"
            >
              ← กลับรายการ
            </Link>
          </div>

          <p className="text-[10px] text-muted text-center">
            ข้อมูลจาก legacy <code className="rounded bg-surface-alt px-1">tb_forwarder</code>
            <br />
            ฟอร์มอัปเดตสถานะ + บันทึกหมายเหตุ = Wave 20 P1.1
          </p>
        </div>
      </div>
    </main>
  );
}

// Small reusable field display — left-label + right-value flex row.
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono" : ""}>{value}</dd>
    </div>
  );
}

// Display helper for the legacy fallback view above.
// (The existing `Row` component uses `value` prop · this one accepts an
// optional `href` so cabinet number can link to /admin/report-cnt.)
function LegacyKV({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5">
      <span className="text-muted">{label}</span>
      {href ? (
        <Link href={href} className={`text-primary-600 hover:underline ${mono ? "font-mono" : ""}`}>{value}</Link>
      ) : (
        <span className={mono ? "font-mono" : ""}>{value}</span>
      )}
    </div>
  );
}
