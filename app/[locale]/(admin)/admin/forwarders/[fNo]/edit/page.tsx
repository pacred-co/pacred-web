/**
 * /admin/forwarders/[fNo]/edit — UNIFIED EDIT HUB (2026-06-02 ภูม UX P0).
 *
 * Background — ภูม flagged the previous design:
 *   1. The 5 action panels (Status · Driver · Payment · Edit · Bill-to) lived
 *      in the detail page's right column as stacked CollapsibleCards.
 *      "เรียงแบบนี้ มันใช้งานยากมาก"
 *   2. "ดูข้อมูล" and "อัปเดต" were the same page — no separation.
 *      "กดปุ่มดูข้อมูล แต่กลับเข้ามาหน้าเดียวกันกับปุ่มอัพเดต ... มันจะดูมาตรฐานกว่า"
 *   3. PCS legacy forwarder.php has a dedicated edit mode (`?page=edit`)
 *      that holds all the update knobs — Pacred should mirror that pattern.
 *
 * This page consolidates ALL writes against tb_forwarder into one route:
 *   §1. Status + ตู้ + tracking + note  (TbForwarderActionPanel)
 *   §2. ชำระเงิน (debit wallet) — only when payable  (TbForwarderPaymentPanel)
 *   §3. มอบหมายคนขับ  (TbForwarderDriverAssignPanel)
 *   §4. ที่อยู่ / การขนส่ง / ราคา  (TbForwarderEditPanel)
 *   §5. ชื่อผู้รับใบกำกับ (Bill-to)  (BillToOverridePanel)
 *   §6. ขนาด / น้ำหนัก / CBM + per-item crate  (AdminForwarderEditForm · legacy
 *       Wave 12-C ภาค 2 dimensions form preserved)
 *
 * Each panel renders as a FLAT <section> with a clear h2 header — no
 * CollapsibleCard wrapper. All sections visible at once = scroll-friendly,
 * mirror PCS edit-mode page.
 *
 * Resolution — same as the parent detail page: numeric fNo → tb_forwarder.id,
 * else fNo → fidorco. Falls back to legacy dimensions-only form for the
 * rebuilt branch (UUID URLs).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

import { AdminForwarderEditForm, type EditItemRow } from "./edit-form";
import { TbForwarderActionPanel } from "../tb-action-panel";
import { TbForwarderPaymentPanel } from "../tb-payment-panel";
import { TbForwarderEditPanel, type SavedAddressOption } from "../tb-edit-panel";
import { TbForwarderDriverAssignPanel, type DriverAssignmentState } from "../tb-driver-assign-panel";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";

export const dynamic = "force-dynamic";

type RawForwarderRow = {
  id:                number;
  fidorco:           string | null;
  userid:            string;
  fstatus:           string;
  ftransporttype:    string;
  fwarehousechina:   string;
  fwarehousename:    string;
  fcabinetnumber:    string | null;
  ftrackingchn:      string | null;
  ftrackingth:       string | null;
  fshipby:           string | null;
  famount:           number | null;
  famountcount:      string | null;
  fdetail:           string | null;
  fcover:            string | null;
  fweight:           number | string | null;
  fwidth:            number | string | null;
  flength:           number | string | null;
  fheight:           number | string | null;
  fvolume:           number | string | null;
  fproductstype:     string | null;
  frefprice:         string | null;
  fnote:             string | null;
  fnoteuser:         string | null;
  ftotalprice:       number | string | null;
  fpriceupdate:      number | string | null;
  fdiscount:         number | string | null;
  priceother:        number | string | null;
  fdate:             string | null;
  fdatestatus2:      string | null;
  fdateadminstatus:  string | null;
  faddressname:      string | null;
  faddresslastname:  string | null;
  crate:             string | null;
  pricecrate:        number | string | null;
  fcredit:           string | null;
  paydeposit:        string | null;
  fbilltoname:       string | null;
};

type RawItemRow = {
  id:                       number;
  productname:              string;
  producttracking:          string;
  productqty:               number;
  productwidth:             number | string;
  productlength:            number | string;
  productheight:            number | string;
  productweightperitem:     number | string;
  productweightall:         number | string;
  productcbmperitem:        number | string;
  productcbmall:            number | string;
  chinawoodencratefee:      number | string;
  chinawoodencratefeetype:  string;
};

export default async function AdminForwarderEditPage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const { fNo } = await params;
  const admin = createAdminClient();

  // ─── Resolve the row (id numeric, else fidorco) ────────────────────
  const asNumber = Number(fNo);
  const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

  let q = admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, userid, fstatus, ftransporttype, fwarehousechina, fwarehousename, " +
      "fcabinetnumber, ftrackingchn, ftrackingth, fshipby, famount, famountcount, " +
      "fdetail, fcover, fweight, fwidth, flength, fheight, fvolume, fproductstype, frefprice, " +
      "fnote, fnoteuser, ftotalprice, fpriceupdate, fdiscount, priceother, " +
      "fdate, fdatestatus2, fdateadminstatus, " +
      "faddressname, faddresslastname, crate, pricecrate, " +
      "fcredit, paydeposit, fbilltoname",
    )
    .limit(1);
  q = isId ? q.eq("id", asNumber) : q.eq("fidorco", fNo);
  const { data: row } = await q.maybeSingle();
  if (!row) notFound();
  const r = row as unknown as RawForwarderRow;

  // ─── Customer name + wallet balance ───────────────────────────────
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userRowErr) {
    console.error(`[tb_users edit] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const u = userRow as unknown as {
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userTel: string | null;
  } | null;

  // Wallet balance for the payment panel (display only — action re-reads).
  const { data: walletRow, error: walletErr } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", r.userid)
    .maybeSingle<{ wallettotal: number | string | null }>();
  if (walletErr) {
    console.error(`[tb_wallet edit] failed`, { code: walletErr.code, message: walletErr.message, userid: r.userid });
  }
  const walletBalance = Number(walletRow?.wallettotal ?? 0);
  const isPayable = r.fstatus === "5" || (r.fcredit ?? "").trim() === "1";

  // Customer's saved address book for re-pick (faithful update_fAddress).
  const { data: addrRows, error: addrErr } = await admin
    .from("tb_address")
    .select("addressid, addressname, addresslastname, addressno, addressprovince")
    .eq("userid", r.userid)
    .eq("addressstatus", "1")
    .order("addressid", { ascending: false })
    .limit(50);
  if (addrErr) {
    console.error(`[tb_address edit] failed`, { code: addrErr.code, message: addrErr.message, userid: r.userid });
  }
  const savedAddresses: SavedAddressOption[] = ((addrRows ?? []) as Array<{
    addressid: number; addressname: string | null; addresslastname: string | null;
    addressno: string | null; addressprovince: string | null;
  }>).map((a) => ({
    addressId: a.addressid,
    label: [
      `${a.addressname ?? ""} ${a.addresslastname ?? ""}`.trim(),
      (a.addressno ?? "").slice(0, 30),
      a.addressprovince ?? "",
    ].filter(Boolean).join(" · ") || `ที่อยู่ #${a.addressid}`,
  }));

  // Latest driver-assignment for this forwarder (two reads · no FK).
  let driverAssignment: DriverAssignmentState | null = null;
  const { data: assignItemRow, error: assignItemErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fdistatus")
    .eq("fid", r.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; fdid: number; fdistatus: string | null }>();
  if (assignItemErr) {
    console.error(`[tb_forwarder_driver_item edit] failed`, { code: assignItemErr.code, message: assignItemErr.message, fid: r.id });
  }
  if (assignItemRow) {
    const { data: parentRow, error: parentErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdadminid, fddate, fdstatus")
      .eq("id", assignItemRow.fdid)
      .maybeSingle<{ id: number; fdadminid: string | null; fddate: string | null; fdstatus: string | null }>();
    if (parentErr) {
      console.error(`[tb_forwarder_driver edit] failed`, { code: parentErr.code, message: parentErr.message, fdid: assignItemRow.fdid });
    }
    driverAssignment = {
      fdistatus:  (assignItemRow.fdistatus ?? "").trim(),
      batchId:    assignItemRow.fdid,
      driverCode: parentRow?.fdadminid ?? null,
      assignedAt: parentRow?.fddate ?? null,
      batchOpen:  (parentRow?.fdstatus ?? "").trim() === "1",
    };
  }

  // ─── Load tb_forwarder_item rows for the per-item crate dimensions form ──
  const { data: itemRowsRaw, error: itemRowsRawErr } = await admin
    .from("tb_forwarder_item")
    .select(
      "id, productname, producttracking, productqty, productwidth, productlength, " +
      "productheight, productweightperitem, productweightall, productcbmperitem, " +
      "productcbmall, chinawoodencratefee, chinawoodencratefeetype",
    )
    .eq("fid", r.id)
    .order("id", { ascending: true })
    .limit(200);
  if (itemRowsRawErr) {
    console.error(`[tb_forwarder_item edit] failed`, { code: itemRowsRawErr.code, message: itemRowsRawErr.message });
  }

  const items: EditItemRow[] = ((itemRowsRaw ?? []) as unknown as RawItemRow[]).map((it) => ({
    itemId:           it.id,
    name:             it.productname,
    tracking:         it.producttracking,
    qty:              Number(it.productqty),
    weightPerItem:    Number(it.productweightperitem),
    weightAll:        Number(it.productweightall),
    cbmPerItem:       Number(it.productcbmperitem),
    cbmAll:           Number(it.productcbmall),
    crateFee:         Number(it.chinawoodencratefee),
    crateType:        (it.chinawoodencratefeetype === "2" ? "2" : "1") as "1" | "2",
  }));

  // Status / mode labels for the context strip.
  const STATUS_LABEL: Record<string, string> = {
    "1": "รอเข้าโกดังจีน", "2": "ถึงโกดังจีนแล้ว", "3": "กำลังส่งมาไทย",
    "4": "ถึงไทยแล้ว", "5": "รอชำระเงิน", "6": "เตรียมส่ง", "7": "ส่งแล้ว",
    "99": "พิเศษ",
  };
  const MODE_LABEL: Record<string, string> = { "1": "🚛 รถ", "2": "🚢 เรือ", "3": "✈️ เครื่องบิน" };
  const WAREHOUSE_LABEL: Record<string, string> = {
    "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
    "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
  };

  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || r.userid;
  const slugForLink = r.fidorco ?? String(r.id);

  const isPcsPickup = (r.fshipby ?? "").trim() === "PCS";
  const transportTypeForEdit = (["1", "2", "3"].includes(r.ftransporttype) ? r.ftransporttype : "1") as "1" | "2" | "3";
  const amountCountForEdit = ((r.famountcount ?? "").trim() === "1" ? "1" : "2") as "1" | "2";

  const priceUpdate = Number(r.fpriceupdate ?? 0);
  const otherCost = Number(r.priceother ?? 0);
  const discount = Number(r.fdiscount ?? 0);

  return (
    <main className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <Link href={`/admin/forwarders/${slugForLink}`} className="hover:text-primary-600 font-mono">
          {r.fidorco ?? `#${r.id}`}
        </Link>
        <span>›</span>
        <span className="text-foreground font-medium">แก้ไข / อัปเดต</span>
      </nav>

      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · ฝากนำเข้า · แก้ไข / อัปเดต
          </p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{r.fidorco ?? `#${r.id}`}</h1>
          <p className="mt-1 text-sm text-muted">
            อัปเดตสถานะ · ตู้ · tracking · คนขับ · ที่อยู่ · ราคา · ขนาด/น้ำหนัก
          </p>
        </div>
        <Link
          href={`/admin/forwarders/${slugForLink}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> ย้อนกลับไปดูข้อมูล
        </Link>
      </header>

      {/* Read-only context strip — admin sees what they're editing */}
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <ReadRow label="สถานะปัจจุบัน" value={STATUS_LABEL[r.fstatus] ?? r.fstatus} />
        <ReadRow label="ลูกค้า" value={`${customerName}`} />
        <ReadRow label="โกดังจีน" value={WAREHOUSE_LABEL[r.fwarehousename] ?? r.fwarehousename} />
        <ReadRow label="ขนส่ง" value={MODE_LABEL[r.ftransporttype] ?? r.ftransporttype} />
        <ReadRow label="Tracking CN" value={r.ftrackingchn || "—"} mono />
        <ReadRow label="หมายเลขตู้" value={r.fcabinetnumber || "—"} mono />
        <ReadRow label="กล่อง" value={`${r.famount ?? 0}`} mono />
        <ReadRow
          label="เข้าโกดังจีน"
          value={r.fdatestatus2 ? new Date(r.fdatestatus2).toLocaleDateString("th-TH") : "—"}
        />
      </section>

      {/* §1 — Status + cabinet + tracking + note (the most-used action) */}
      <ActionSection
        n={1}
        title="อัปเดตสถานะ + ตู้ + Tracking + หมายเหตุ"
        subtitle="เปลี่ยนสถานะของรายการ · กำหนดหมายเลขตู้ · เพิ่ม tracking ไทย · บันทึกหมายเหตุ"
      >
        <TbForwarderActionPanel
          fId={r.id}
          fNo={String(r.id)}
          currentStatus={(r.fstatus as "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99") || "1"}
          currentCabinet={r.fcabinetnumber ?? ""}
          currentTrackingTh={r.ftrackingth ?? ""}
          currentNote={r.fnote ?? ""}
        />
      </ActionSection>

      {/* §2 — Payment (only when payable) */}
      {isPayable && (
        <ActionSection
          n={2}
          title="ชำระเงิน (หักกระเป๋า)"
          subtitle={`ยอด ฿${Number(r.ftotalprice ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ยอดในกระเป๋า ฿${walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
          tone="primary"
        >
          <TbForwarderPaymentPanel
            fId={r.id}
            userId={r.userid}
            customerName={`คุณ${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim()}
            amountEstimate={Number(r.ftotalprice ?? 0)}
            walletBalance={walletBalance}
            isCredit={(r.fcredit ?? "").trim() === "1"}
          />
        </ActionSection>
      )}

      {/* §3 — Driver assignment */}
      <ActionSection
        n={isPayable ? 3 : 2}
        title="มอบหมายคนขับ"
        subtitle={r.fstatus === "6" ? "พร้อมจัดส่ง" : "เปิดใช้งานเมื่อสถานะเป็น 'เตรียมส่ง'"}
      >
        <TbForwarderDriverAssignPanel
          fId={r.id}
          fNo={String(r.id)}
          fstatus={r.fstatus}
          paydeposit={r.paydeposit ?? ""}
          current={driverAssignment}
        />
      </ActionSection>

      {/* §4 — Address / transport / pricing */}
      <ActionSection
        n={isPayable ? 4 : 3}
        title="แก้ไขที่อยู่ / การขนส่ง / ราคา"
        subtitle="เปลี่ยนที่อยู่จัดส่ง · สลับโหมดขนส่ง · ปรับยอดเงินด้วยตนเอง"
      >
        <TbForwarderEditPanel
          fId={r.id}
          isPcs={isPcsPickup}
          addresses={savedAddresses}
          currentTransportType={transportTypeForEdit}
          currentShipBy={(r.fshipby ?? "").trim()}
          currentAmountCount={amountCountForEdit}
          currentPriceUpdate={priceUpdate}
          currentPriceOther={otherCost}
          currentDiscount={discount}
        />
      </ActionSection>

      {/* §5 — Bill-to override */}
      <ActionSection
        n={isPayable ? 5 : 4}
        title="ชื่อผู้รับใบกำกับ (Bill-to)"
        subtitle={r.fbilltoname && r.fbilltoname.trim() !== "" ? `กำหนดเอง: ${r.fbilltoname}` : "ใช้ชื่อผู้รับ default"}
      >
        <BillToOverridePanel
          kind="forwarder"
          fNo={String(r.id)}
          defaultName={`${r.faddressname ?? ""} ${r.faddresslastname ?? ""}`.trim()}
          current={r.fbilltoname}
        />
      </ActionSection>

      {/* §6 — Dimensions / weight / CBM (legacy Wave 12-C ภาค 2 form preserved) */}
      <ActionSection
        n={isPayable ? 6 : 5}
        title="ขนาด / น้ำหนัก / CBM"
        subtitle="ใส่ข้อมูลหลังสินค้าเข้าโกดังจีน — รวมค่าตีลังไม้แต่ละรายการ"
      >
        <AdminForwarderEditForm
          fNo={r.fidorco ?? String(r.id)}
          idNumeric={r.id}
          weightInit={Number(r.fweight ?? 0)}
          widthInit={Number(r.fwidth ?? 0)}
          lengthInit={Number(r.flength ?? 0)}
          heightInit={Number(r.fheight ?? 0)}
          volumeInit={Number(r.fvolume ?? 0)}
          productTypeInit={(r.fproductstype === "1" || r.fproductstype === "2" ||
                            r.fproductstype === "3" || r.fproductstype === "4")
                             ? (r.fproductstype as "1" | "2" | "3" | "4")
                             : "1"}
          refPriceInit={(r.frefprice === "2" ? "2" : "1") as "1" | "2"}
          noteInit={r.fnote ?? ""}
          itemsInit={items}
        />
      </ActionSection>

      {/* Footer nav */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href={`/admin/forwarders/${slugForLink}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> กลับหน้ารายละเอียด
        </Link>
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
      </div>
    </main>
  );
}

/**
 * Flat numbered action section — replaces CollapsibleCard wrapper.
 *
 * Each section gets a numbered badge + title + subtitle as a clear header,
 * then the action panel body. All sections visible at once (no collapse) =
 * scroll-friendly, mirror PCS forwarder.php edit-mode layout.
 */
function ActionSection({
  n,
  title,
  subtitle,
  tone = "neutral",
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  tone?: "neutral" | "primary";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "primary"
      ? "border-primary-200 bg-primary-50/30 dark:bg-primary-950/20"
      : "border-border bg-white dark:bg-surface";
  const badgeCls =
    tone === "primary"
      ? "bg-primary-500 text-white"
      : "bg-surface-alt text-foreground";
  return (
    <section className={`rounded-2xl border shadow-sm overflow-hidden ${toneCls}`}>
      <header className="flex items-start gap-3 px-4 py-3 border-b border-border/50 bg-white/40 dark:bg-surface/40">
        <span className={`flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${badgeCls}`}>
          {n}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      </header>
      <div className="p-4">
        {children}
      </div>
    </section>
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
