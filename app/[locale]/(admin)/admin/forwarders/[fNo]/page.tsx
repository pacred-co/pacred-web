import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { fstatusBadge } from "@/lib/admin/forwarder-status";
import { ForwarderStepRevert } from "./forwarder-step-revert";
import { CreateOrderBillButton } from "./create-order-bill-button";
import { AdvanceBillConfirmButton } from "./advance-bill-confirm-button";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
// 2026-06-18 (ภูม) — ที่อยู่จัดส่งสินค้า: when a delivery carrier (not 'PCS'
// self-pickup) carries a stale warehouse-default faddress snapshot, fall back to
// the customer's saved ที่อยู่หลัก (profile) instead of showing "รับที่โกดัง".
import { loadCustomerPrimaryAddress, loadJuristicCorporateAddress, loadCustomerAddressRows } from "@/lib/legacy/customer-address-options";
import { nameShipBy } from "@/lib/freight/shipping-methods";
// 2026-06-10 (ปอน) — Code128 tracking barcode, same local SVG generator the
// customer page /service-import/[fNo] uses (copy the header 1:1).
import { code128SvgDataUrl } from "@/lib/barcode";
// 2026-06-10 (ปอน · owner "ลอกอันนี้มาเลย ข้อมูลตามจริง"): the legacy update-page
// items table = the clean 16-col single-฿-row layout (NOT the ¥ + breakdown
// combo that /edit's FreightBreakdownTable shows). New Pacred component renders
// that 1:1 from the real tb_forwarder header values.
import { ForwarderImportItemsTable } from "./forwarder-import-items-table";
// 2026-06-18 (ภูม · A2) — per-แทรคกิง dimension/price editor (server fetcher). A
// split parcel has many tb_forwarder rows; the legacy single-row form only ever
// saved one. This fetches every sibling tracking + renders one editable row each,
// persisting all via the existing audited adminUpdateForwarderDimensions (per row).
import { ForwarderPerTrackingEditor } from "./forwarder-per-tracking-editor";
// 2026-06-11 (Lane A · §0d reachability) — per-line COST + DECLARED capture
// (P2 tax-invoice platform · `pricing` role). The component was built but never
// mounted (the SHOP equivalent ShopOrderCostSection already is, on legacy-view).
// It writes ONLY tb_forwarder_item.cost_unit_thb / declared_value_thb — isolated
// from the selling-price/status/notify flow (AGENTS.md §0e). It self-gates:
// super/accounting/pricing get editors, everyone else a read-only summary.
import { ForwarderCostSection } from "./forwarder-cost-section";
// 2026-06-18 (ภูม · C · mig 0188) — per-order doc-tier-discount ติ๊กยืนยัน (the C1
// ฝากโอน confirmation). Self-gates super/accounting/pricing · writes ONLY
// tb_forwarder.doc_tier_confirmed · the discount stays dormant until the owner
// flips business_config cargo.doc_tier_discount.enabled (§0e isolated).
import { ForwarderDocTierConfirm } from "./forwarder-doc-tier-confirm";
// 2026-06-10 (ปอน) — legacy "ลบการสั่งซื้อถาวร" (destructive · guarded · 2-step confirm).
import { ForwarderDeleteButton } from "./forwarder-delete-button";
// 2026-06-11 (ปอน · owner "ฟอร์มแก้ไขต้อง status-driven · แต่ละสถานะมีให้แก้ไม่
// เหมือนกัน") — the legacy update.php edit area is NOT flat: the visible sub-forms
// change with fStatus (pricing@4 · tracking@≥6 · credit). <ForwarderStatusWorkflow>
// reproduces that, reusing the existing actions + <AdminForwarderEditForm> +
// <NotePushForm>. (The flat <TbForwarderActionPanel> stays on /edit unchanged.)
import { ForwarderStatusWorkflow } from "./forwarder-status-workflow";
// 2026-06-10 (ปอน) — PCS-1:1 inline edits ON the detail page (each field shows
// value + [แก้ไข] → inline form · บันทึก/ยกเลิก · same page). These are the SAME
// client components /edit mounts; they call the SAME existing server actions
// (no backend change). The detail page already loads every field they need.
import {
  EditUserIdField,
  EditTransportTypeField,
  EditShipByField,
  EditPayMethodField,
  EditCrateField,
  EditAmountCountField,
  EditPalletField,
  EditTrackingChnField,
  EditCabinetField,
  EditDateCloseField,
  EditCoverField,
  EditTaxDocModeField,
  EditDeliveryAddressField,
} from "./forwarder-inline-edits";
// 2026-06-11 (Lane B · doc-choice visibility) — show the customer's tax-doc
// choice (ใบกำกับ/ใบขน/ไม่รับเอกสาร) + the juristic-WHT signal at a glance.
import { TaxDocBadge, JuristicWhtChip } from "@/components/admin/tax-doc-badge";
// 2026-06-16 (owner "การดึงเรทราคามาสรุป" Part 2) — surface a rateMissing warning
// + inline manual-rate entry ON the detail page (was only discoverable at SAVE
// time on /edit). The probe reuses the SAME resolver inputs the save uses so the
// badge + the save never drift; the inline entry writes via the EXISTING
// adminUpdateForwarderDimensions customRate path (no new pricing writer).
import { previewForwarderRateMissing } from "@/lib/forwarder/live-rate";
import { ForwarderRateMissingFallback } from "./forwarder-inline-rate-fallback";
import { fetchCountableForwarderSiblings } from "@/lib/admin/forwarder-siblings";
// 2026-06-30 (owner carryover "WeChat follow-up · จีนว่าไงเรื่องตู้นี้") — a
// READ-ONLY panel surfacing the decrypted China-ops WeChat messages (mig 0228)
// that mention THIS order's container / China tracking / customer PR, so staff
// see "what did China say about this container?" without leaving the page. Gated
// by this page's requireAdmin; the panel never widens access or writes anything.
import { WechatContextPanel } from "./wechat-context-panel";
// 2026-06-30 (gap G7 · owner "อุดจุดบอด") — parcel-exception handling (mig 0230).
// Staff flag a ฝากนำเข้า row as an exception (ของแตก/ไม่ใช่ของลูกค้า/ตู้ตีกลับ/
// ติดด่าน/PR สลับ), record a note + photo, and resolve it. RECORD-ONLY — the
// panel/actions write ONLY fexception_* (never money/status/ownership · §0e).
import { ForwarderExceptionPanel } from "./forwarder-exception-panel";
// 2026-06-19 (Unit A · owner "แจงค่าหน้าอื่นด้วย") — the same itemized "ยอดเก็บจริง"
// breakdown the จ่ายแทนลูกค้า page shows, so the order detail's freight-only number
// (e.g. 45.10) isn't confusing vs the real collect (95.10 = freight + เหมาๆ 100).
// Uses the canonical money fn — never re-derive money math inline (AGENTS.md money rule).
import {
  computeForwarderDebitBatch,
  type ForwarderDebitRow,
} from "@/lib/forwarder/forwarder-debit-total";
import { getTranslations } from "next-intl/server";
import { TranslateButton } from "@/components/translate/translate-button";
import {
  User as UserIcon,
  Pencil,
  ArrowLeft,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";

// W-1: requireAdmin reads auth cookies; a page under a dynamic [fNo]
// segment that reads cookies MUST be force-dynamic (AGENTS.md §11).
export const dynamic = "force-dynamic";

/**
 * /admin/forwarders/[fNo] — single-page view WITH PCS-1:1 inline field edits.
 *
 * 2026-06-10 (ปอน) — owner directive "รีหน้าตา admin → สไตล์หน้าบ้าน + การกดแก้ไข
 * อิง PCS Cargo 1:1": the detail page now carries the per-field [แก้ไข] inline
 * edits ON the same page (faithful to legacy `update.php` — one page, all inline
 * edits inside), reusing the proven EditXxxField client components + their
 * EXISTING server actions (NO backend change). The heavy panels (status pipeline
 * update · pay-on-behalf · driver-assign · cost-adjust matrix · address re-pick)
 * still live on /edit (they need extra data loads); the header CTA + footer link
 * route there for those.
 *
 * Prior shape (2026-06-04 ภูม UX F1): detail = READ-ONLY, all edits on /edit.
 *
 * Layout (matches PCS legacy forwarder.php detail mode + Pacred design):
 *   · Header — id + status badge + source tag + sale rep + "✏️ แก้ไข/อัปเดต" CTA
 *   · 7-icon status timeline horizontal with datestamps
 *   · 2-col grid:
 *     LEFT (2/3): ลูกค้า · ที่อยู่ · การจัดส่ง · รายละเอียดสินค้า · items table · หมายเหตุ
 *     RIGHT (1/3): ค่าใช้จ่าย breakdown · admin meta · quick-jump links
 *   · NO action panels here — those live on /edit/page.tsx
 *
 * Legacy reference: D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\
 *   forwarder.php (read mode · no ?page= param) + forwarder-back-up/detail.php
 *
 * History: 2026-06-04 morning placed ForwarderInlineEdits + TbForwarderDriver-
 * AssignPanel on this page — moved to /edit/page.tsx the same day per ภูม
 * directive after he reviewed.
 */
export default async function AdminForwarderDetail({ params }: { params: Promise<{ fNo: string }> }) {
  // 2026-06-08 (ภูม warehouse-handoff readiness): added "warehouse" — list
  // page `/admin/forwarders` now accepts warehouse role (per sidebar-menu's
  // menuWarehouse), so the detail page MUST too or every row-click 404s.
  const { roles: viewerRoles } = await requireAdmin(["ops", "accounting", "warehouse"]);
  // ops/super/warehouse (+god) may revert/advance the status step; accounting views only.
  const canStepStatus =
    isGodRole(viewerRoles) || viewerRoles.includes("ops") || viewerRoles.includes("warehouse");
  // ภูม 2026-06-19 — the MANUAL "อัปเดตสถานะรายการ" dropdown is reserved for Ultra
  // Admin Z only. Staff advance status via the proper flow (scan → ถึงไทย · วางบิล →
  // รอชำระ · ส่งแล้ว close), which stay role-gated by the transition matrix.
  const viewerIsUltra = viewerRoles.includes("ultra");
  // ภูม 2026-06-19 — everyone may set ค่าเทียบ EXCEPT warehouse staff (god roles
  // always can). Threaded into the pricing editor to lock the ค่าเทียบ field.
  const canEditComparison = isGodRole(viewerRoles) || !viewerRoles.includes("warehouse");

  const { fNo } = await params;
  const admin = createAdminClient();

  // 2026-06-02 — Primary path = tb_forwarder (legacy, ~47K rows on prod).
  const tbResult = await tryRenderTbForwarder(fNo, admin, canStepStatus, viewerIsUltra, canEditComparison);
  if (tbResult) return tbResult;

  // Fallback — rebuilt `forwarders` table (UUID, empty on prod, back-compat).
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
    console.error(`[forwarders fallback] failed`, { code: error.code, message: error.message });
  }

  if (!data) {
    notFound();
  }
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
  const f = data as unknown as Omit<typeof data, "profile"> & { profile: ProfileShape | ProfileShape[] | null };
  const profile = Array.isArray(f.profile) ? f.profile[0] ?? null : f.profile;

  const { data: items, error: itemsErr } = await admin
    .from("forwarder_items")
    .select("id, product_name, product_tracking, product_qty")
    .eq("forwarder_id", f.id);
  if (itemsErr) {
    console.error(`[forwarder_items fallback] failed`, { code: itemsErr.code, message: itemsErr.message });
  }

  return (
    <main className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ฝากนำเข้า (rebuilt fallback)</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{f.f_no}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/admin/forwarders/${f.f_no}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary-500 bg-primary-50 px-3 py-1.5 text-sm text-primary-700 font-medium hover:bg-primary-100"
          >
            <Pencil className="h-3.5 w-3.5" /> แก้ไข / อัปเดต
          </Link>
          <Link href="/admin/forwarders" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            <ArrowLeft className="h-3.5 w-3.5" /> กลับรายการ
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="ลูกค้า">
          <Row label="รหัสสมาชิก" value={profile?.member_code ?? "—"} mono />
          <Row label="ชื่อ" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`} />
          <Row label="เบอร์" value={profile?.phone ?? "—"} />
          <Row label="อีเมล" value={profile?.email ?? "—"} />
          <Link href={`/admin/customers/${f.profile_id}`} className="text-xs text-primary-500 hover:underline">→ ดูโปรไฟล์ลูกค้า</Link>
        </Section>

        <Section title="ที่อยู่จัดส่ง">
          <p className="text-sm">{f.ship_first_name} {f.ship_last_name}</p>
          <p className="text-xs text-muted">📞 {f.ship_phone}{f.ship_phone2 ? ` / ${f.ship_phone2}` : ""}</p>
          <p className="text-sm">{f.ship_address_line} ต.{f.ship_sub_district} อ.{f.ship_district} จ.{f.ship_province} {f.ship_postal_code}</p>
          {f.ship_note && <p className="text-xs text-muted">📝 {f.ship_note}</p>}
        </Section>

        <Section title="ขนาด / น้ำหนัก">
          <Row label="กล่อง" value={`${f.box_count}`} />
          <Row label="น้ำหนัก" value={`${Number(f.weight_kg).toFixed(2)} kg`} mono />
          <Row label="ขนาดกล่อง" value={`${Number(f.width_cm)}×${Number(f.length_cm)}×${Number(f.height_cm)} cm`} mono />
          <Row label="ปริมาตร" value={`${Number(f.volume_cbm).toFixed(3)} cbm`} mono />
        </Section>

        <Section title="ราคา">
          <Row label="ค่าขนส่ง" value={`฿${Number(f.transport_price).toFixed(2)}`} mono />
          <Row label="ค่าบริการ" value={`฿${Number(f.service_fee).toFixed(2)}`} mono />
          {/* 2026-06-29: show the crate-fee line when there IS a fee, not just
              when `f.crate` is truthy (truthy for BOTH "1" ตี and "2" ไม่ตี →
              rendered "฿0.00" for every non-crated row). crate_price>0 keeps the
              displayed line-items reconciling with the total (outstanding.ts sums
              pricecrate unconditionally). */}
          {Number(f.crate_price) > 0 && <Row label="ค่าตีลังไม้" value={`฿${Number(f.crate_price).toFixed(2)}`} mono />}
          {f.qc && <Row label="ค่า QC" value={`฿${Number(f.qc_price).toFixed(2)}`} mono />}
          <div className="flex justify-between pt-2 border-t border-border text-base font-bold">
            <span>รวม</span>
            <span className="font-mono">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
        </Section>

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

/**
 * Primary tb_forwarder read-only renderer.
 *
 * Returns null on miss so the caller can try the rebuilt-forwarders fallback
 * before 404'ing.
 *
 * Layout (matches PCS legacy forwarder.php detail mode + Pacred design):
 *   1. Header — id + status badge + source tag + sale rep + "✏️ แก้ไข" button
 *   2. Status timeline — 7 icons horizontal with datestamps
 *   3. 2-col grid:
 *      LEFT (2/3): customer · routing · product detail · address · note
 *      RIGHT (1/3): cost breakdown · admin meta · quick-jump links
 *
 * NO action panels here — those moved to /edit.
 */
async function tryRenderTbForwarder(
  fNo: string,
  admin: ReturnType<typeof createAdminClient>,
  canStepStatus: boolean,
  isUltra: boolean,
  canEditComparison: boolean,
) {
  const asNumber = Number(fNo);
  const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

  let tbq = admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, userid, fstatus, fdate, " +
      "fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus5, fdatestatus6, fdatestatus7, " +
      "fdatetothai, fdatecontainerclose, " +
      "ftransporttype, fwarehousechina, fwarehousename, fcabinetnumber, " +
      "ftrackingchn, ftrackingth, fshipby, fshippingservice, " +
      "fweight, fvolume, fwidth, flength, fheight, famount, famountcount, " +
      "ftotalprice, fcosttotalprice, ftransportprice, fpriceupdate, fdiscount, " +
      "pricecrate, fqcprice, ftransportpricechnthb, priceother, fproductstype, " +
      "frefprice, frefrate, customrate, customratekg, customratecbm, " +
      // 2026-06-17 (mig 0187) — per-order ค่าเทียบ override (durable persistence)
      "custom_comparison, custom_comparison_value, " +
      // 2026-06-23 (mig 0207) — เฟิม flag for advance billing (วางบิลล่วงหน้า)
      "advance_bill_confirmed, " +
      "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
      "faddressdistrict, faddressprovince, faddresszipcode, " +
      "faddresstel, faddresstel2, faddressnote, " +
      "fnote, fdetail, fcover, fcredit, reforder, " +
      "adminid, adminidcreator, adminidupdate, paymethod, paydeposit, crate, fpallet, fbilltoname, " +
      // 2026-06-05 PM (ภูม flag · breakdown table on detail page too).
      "fusercompany, " +
      // 2026-06-11 (Lane B · doc-choice visibility) — the customer's tax-document
      // choice (ใบกำกับ/ใบขน/ไม่รับเอกสาร). Was a dead read on /edit; surfaced here
      // as a <TaxDocBadge> + made correctable via <EditTaxDocModeField>.
      "tax_doc_pref, " +
      // B4 · backlog #259 (migration 0150 · 2026-06-08) — cabinet lock flag
      // so the read-only detail can show "🔒 ล็อกแล้ว" badge next to cabinet.
      "fcabinet_locked",
    )
    .limit(1);
  tbq = isId ? tbq.eq("id", asNumber) : tbq.eq("fidorco", fNo);
  const { data: tbRow, error: tbRowErr } = await tbq.maybeSingle();
  if (tbRowErr) {
    console.error(`[tb_forwarder detail] failed`, {
      code: tbRowErr.code, message: tbRowErr.message,
    });
  }
  if (!tbRow) return null;
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
    custom_comparison: string | null; custom_comparison_value: number | string | null;
    advance_bill_confirmed: string | null;
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
    fbilltoname: string | null;
    fusercompany: string | null;
    tax_doc_pref: string | null;
    fcabinet_locked: boolean | null;
  };

  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail, userPicture, adminIDSale, userCompany")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userRowErr) {
    console.error(`[tb_users detail] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const u = userRow as unknown as {
    userID: string; userName: string | null; userLastName: string | null;
    userTel: string | null; userEmail: string | null;
    userPicture: string | null; adminIDSale: string | null;
    userCompany: string | null;
  } | null;

  // ── ภูม 2026-06-18: ที่อยู่จัดส่งสินค้า ─────────────────────────────────
  // The forwarder row snapshots the delivery address into faddress* at create
  // time. When fShipBy='PCS' (รับเองที่โกดัง) that's the Pacred warehouse; for a
  // delivery carrier it's the customer's chosen address. BUT an order created as
  // 'PCS' then switched to a delivery carrier (or auto-committed with a pickup
  // fallback) keeps the stale warehouse snapshot → the page wrongly shows
  // "รับที่โกดัง Pacred". So: when the carrier is NOT self-pickup AND the stored
  // faddress is the warehouse default (empty or "รับที่โกดัง…"), fall back to the
  // customer's saved ที่อยู่หลัก (profile). A real custom faddress is respected.
  const isSelfPickup = (r.fshipby ?? "").trim() === "PCS";
  const faddrIsWarehouseDefault =
    !(r.faddressname ?? "").trim() ||
    /รับที่โกดัง|โกดัง\s*pacred/i.test(r.faddressname ?? "");
  let deliveryAddr = {
    name:        r.faddressname ?? "",
    lastname:    r.faddresslastname ?? "",
    no:          r.faddressno ?? "",
    subdistrict: r.faddresssubdistrict ?? "",
    district:    r.faddressdistrict ?? "",
    province:    r.faddressprovince ?? "",
    zipcode:     r.faddresszipcode ?? "",
    tel:         r.faddresstel ?? "",
    tel2:        r.faddresstel2 ?? "",
    note:        r.faddressnote ?? "",
  };
  let deliveryAddrFromProfile = false;
  // นิติบุคคล fallback (ภูม 2026-06-18): a juristic customer who never saved a
  // structured tb_address still has a company address in tb_corporate (a single
  // string). When the tb_address fallback finds nothing, show that. Holds
  // {name, addressLine} so the render switches to the free-form layout.
  let deliveryAddrCorp: { name: string; addressLine: string } | null = null;
  if (!isSelfPickup && faddrIsWarehouseDefault) {
    const primary = await loadCustomerPrimaryAddress(admin, r.userid);
    if (primary && (primary.no.trim() || primary.province.trim())) {
      deliveryAddr = {
        name:        primary.name,
        lastname:    primary.lastname,
        no:          primary.no,
        subdistrict: primary.subdistrict,
        district:    primary.district,
        province:    primary.province,
        zipcode:     primary.zipcode,
        tel:         primary.tel,
        tel2:        primary.tel2,
        note:        primary.note,
      };
      deliveryAddrFromProfile = true;
    } else {
      // No saved tb_address → try the registered company address (juristic).
      deliveryAddrCorp = await loadJuristicCorporateAddress(admin, r.userid);
    }
  }

  // ── ภูม 2026-07-03: saved-address list for the inline "แก้ไขที่อยู่จัดส่ง" picker ──
  // Staff can re-pick from the customer's saved tb_address (like the ship-by edit) OR type a
  // new one OR switch to รับเองที่โกดัง. Fetched for EVERY row (incl. self-pickup PCS rows —
  // picking a real address flips it off self-pickup). The actions re-verify ownership.
  // 2026-07-09: now the shared rich rows (reusable <CustomerAddressPicker>).
  const savedAddresses = await loadCustomerAddressRows(admin, r.userid);

  // ── ประวัติการจัดส่ง (read-only) — this customer's recent carriers + destinations ──
  const deliveryHistory: Array<{ id: number; carrier: string; province: string; date: string }> = [];
  {
    const { data: histRows, error: histErr } = await admin
      .from("tb_forwarder")
      .select("id, fshipby, faddressprovince, fdate")
      .eq("userid", r.userid)
      .order("fdate", { ascending: false })
      .limit(8);
    if (histErr) {
      console.error("[forwarder detail] delivery-history failed", { code: histErr.code, userid: r.userid });
    }
    for (const h of (histRows ?? []) as Array<{
      id: number; fshipby: string | null; faddressprovince: string | null; fdate: string | null;
    }>) {
      deliveryHistory.push({
        id: h.id,
        carrier: nameShipBy((h.fshipby ?? "").trim()) || "—",
        province: (h.faddressprovince ?? "").trim() || "—",
        date: (h.fdate ?? "").slice(0, 10) || "—",
      });
    }
  }

  // ภูม 2026-07-13: box-split is now AUTOMATIC at commit (commit-momo-row-core split-at-
  // commit) — the manual "แตกกล่อง" button + its eligibility probe were removed.

  // Items table loading is now owned by <ForwarderItemsTable> further down —
  // it handles tb_order (shop-spawn) + tb_forwarder_item (admin) + empty-state.
  // 2026-06-03: removed the local item query that fed the old plain-text table.
  //
  // 2026-06-04 F1: removed the driver-assignment + inline-edits data loads —
  // those panels moved to /edit/page.tsx (this page is READ-ONLY).

  // 2026-06-05 (ภูม flag): driver-assigned detection — needed to split
  // fstatus=6 timeline pill into "เตรียมส่ง" vs "กำลังจัดส่ง" (legacy
  // function.php L1225-1230 · fStatusDriver flag from
  // `tb_forwarder_driver_item WHERE fdiStatus=''`).
  const { data: assignItemRow, error: assignItemErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fdistatus")
    .eq("fid", r.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ fdistatus: string | null }>();
  if (assignItemErr) {
    console.error(`[tb_forwarder_driver_item detail] failed`, { code: assignItemErr.code, message: assignItemErr.message, fid: r.id });
  }
  const isDriverDispatched =
    assignItemRow != null && (assignItemRow.fdistatus ?? "") === "";

  // 2026-06-11 (ปอน · owner gallery · migration 0176) — product images are now a
  // per-order GALLERY: the legacy single fcover (badge "ปก") + the fimages JSON
  // array. Read fimages best-effort so a pre-0176 env (no column) degrades to
  // empty instead of 500'ing the page.
  let fimagesKeys: string[] = [];
  {
    const { data: imgRow, error: imgErr } = await admin
      .from("tb_forwarder").select("fimages").eq("id", r.id).maybeSingle<{ fimages: string | null }>();
    if (imgErr) {
      // 42703 / "fimages" = column not yet added (migration 0176 not applied) — silent.
      if (imgErr.code !== "42703" && !/fimages/i.test(imgErr.message ?? "")) {
        console.error(`[tb_forwarder fimages] failed`, { code: imgErr.code, message: imgErr.message, fId: r.id });
      }
    } else if (imgRow?.fimages) {
      try {
        const p = JSON.parse(imgRow.fimages);
        if (Array.isArray(p)) fimagesKeys = p.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      } catch { /* malformed json → empty gallery */ }
    }
  }
  // Build the gallery: cover first (fcover · "ปก"), then each gallery key — every
  // key resolved to a URL (resolveLegacyUrl handles alicdn URLs + bucket keys).
  // Dedup so the first-upload (which is both fcover + fimages[0]) shows once.
  const fcoverKey = (r.fcover ?? "").trim();
  const galleryImages: { key: string; url: string; isCover: boolean; canDelete: boolean }[] = [];
  {
    const seen = new Set<string>();
    if (fcoverKey) {
      const url = await resolveLegacyUrl(fcoverKey, "cover");
      if (url) { galleryImages.push({ key: fcoverKey, url, isCover: true, canDelete: fimagesKeys.includes(fcoverKey) }); seen.add(fcoverKey); }
    }
    for (const k of fimagesKeys) {
      if (seen.has(k)) continue;
      seen.add(k);
      const url = await resolveLegacyUrl(k, "cover");
      if (url) galleryImages.push({ key: k, url, isCover: false, canDelete: true });
    }
  }
  const customerAvatar = await resolveLegacyUrl(u?.userPicture ?? null, "profile-thumb");

  // 2026-06-30 (gap G7) — best-effort read of the open-exception flag for the
  // header badge (separate query so a pre-mig-0230 env degrades to no-badge
  // instead of 500'ing the page · same pattern as the fimages read above).
  let exceptionOpen = false;
  {
    const { data: exRow, error: exErr } = await admin
      .from("tb_forwarder").select("fexception_status").eq("id", r.id)
      .maybeSingle<{ fexception_status: string | null }>();
    if (exErr) {
      if (exErr.code !== "42703" && !/fexception/i.test(exErr.message ?? "")) {
        console.error(`[tb_forwarder fexception_status] failed`, { code: exErr.code, message: exErr.message, fId: r.id });
      }
    } else if ((exRow?.fexception_status ?? "") === "open") {
      exceptionOpen = true;
    }
  }

  const STATUS_LABEL: Record<string, string> = {
    "1":"รอเข้าโกดังจีน","2":"ถึงโกดังจีนแล้ว","3":"กำลังส่งมาไทย","4":"ถึงไทยแล้ว",
    "5":"รอชำระเงิน","6":"เตรียมส่ง","7":"ส่งแล้ว","99":"พิเศษ",
  };
  // MODE_LABEL removed 2026-06-04 — transport mode is rendered with the status
  // timeline icon (Truck/Plane) above; the editable form lives on /edit.
  //
  // 2026-06-11 (ปอน · owner "แก้เป็น Pacred ให้หมด · ให้แสดงผลเป็น Pacred ไม่ว่า
  // ยังไงก็ตาม"): the China-warehouse field must NEVER surface a partner/
  // consolidator brand. The old WAREHOUSE_LABEL leaked แสง/CTT/MK/MX/JMF/GOGO/
  // Cargo Center/MOMO straight onto this order-facing detail. It now renders a
  // Pacred-branded label only — the granular partner warehouse stays on the ops
  // console (report-cnt / warehouse-worker), where staff actually route goods.
  // The city (กว่างโจว/อี้อู) is kept where known: Pacred-neutral geography that
  // also matches the customer page's faithful nameWarehouseChina(fwarehousechina).
  const CHINA_CITY: Record<string, string> = { "1": "กว่างโจว", "2": "อี้อู" };
  const chinaWarehouseDisplay = (() => {
    const city = CHINA_CITY[(r.fwarehousechina ?? "").trim()];
    if (city) return `โกดัง Pacred · ${city}`;
    if ((r.fwarehousename ?? "").trim() !== "") return "โกดัง Pacred (จีน)";
    return "—";
  })();
  // legacy forwarder.php product-type map (ประเภทสินค้า).
  const PRODUCT_TYPE_LABEL: Record<string, string> = {
    "1":"ทั่วไป","2":"มอก.","3":"อย.","4":"พิเศษ",
  };

  const currentStatusInt = parseInt(r.fstatus, 10);
  // 2026-06-05 (ภูม flag): 8-step timeline with fstatus=6 split into
  // "เตรียมส่ง" (no driver yet) vs "กำลังจัดส่ง" (driver assigned · fdistatus='')
  // per legacy function.php L1225-1230. `rank` ≠ key when 6.5 is current.
  const currentRank: number =
    currentStatusInt === 6 && isDriverDispatched ? 6.5
      : currentStatusInt === 7 ? 8
      : currentStatusInt;
  // 2026-06-10 (ปอน) — image step-icons copied from the customer page
  // (/service-import/[fNo]) so the admin tracker matches it 1:1.
  const STEP_ICON_BASE = "/legacy/pcs/assets/images/icon/forwarder/";
  // 2026-06-10 (ปอน · owner "แก้เป็น Pacred ให้หมดเลย"): the legacy เตรียมส่ง icon
  // (forwarder-6.png) had a "PCS cargo" crate baked in. 2026-06-11 (owner "cart
  // เปลี่ยนเป็นภาพนี้") → use the Pacred-branded cart icon. The <PackageCheck>
  // fallback stays for any future null-img step.
  const TIMELINE: Array<{ key: number; rank: number; label: string; date: string | null; img: string | null }> = [
    { key: 1, rank: 1,   label: "เข้าโกดังจีน",  date: r.fdate ?? null,         img: `${STEP_ICON_BASE}forwarder-1.png` },
    { key: 2, rank: 2,   label: "อยู่โกดังจีน",  date: r.fdatestatus2 ?? null,  img: `${STEP_ICON_BASE}forwarder-2.png` },
    { key: 3, rank: 3,   label: "ส่งมาไทย",      date: r.fdatestatus3 ?? null,  img: `${STEP_ICON_BASE}forwarder-3.png` },
    { key: 4, rank: 4,   label: "ถึงไทย",         date: r.fdatestatus4 ?? null,  img: `${STEP_ICON_BASE}forwarder-4.png` },
    { key: 5, rank: 5,   label: "รอชำระเงิน",    date: r.fdatestatus5 ?? null,  img: `${STEP_ICON_BASE}forwarder-5.png` },
    { key: 6, rank: 6,   label: "เตรียมส่ง",     date: r.fdatestatus6 ?? null,  img: "/images/hero-section/icon/cart.png" },
    { key: 7, rank: 6.5, label: "กำลังจัดส่ง",   date: r.fdatestatus6 ?? null,  img: `${STEP_ICON_BASE}forwarder-6.1.png` },
    { key: 8, rank: 8,   label: "ส่งแล้ว",        date: r.fdatestatus7 ?? null,  img: `${STEP_ICON_BASE}forwarder-7.png` },
  ];

  const sourceTag: { label: string; cls: string } = r.reforder && r.reforder !== ""
    ? { label: `ฝากสั่งซื้อ : ${r.reforder}`, cls: "bg-sky-50 text-sky-700 border-sky-200" }
    : r.adminidcreator && r.adminidcreator !== ""
      ? { label: `ฝากนำเข้า : ${r.adminidcreator}`, cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : { label: "ฝากนำเข้าจาก : users", cls: "bg-gray-50 text-gray-600 border-gray-200" };

  // 2026-06-10 (ปอน) — header copied 1:1 from /service-import/[fNo]:
  // Code128 tracking barcode + ETA range (fdatetothai → +2d truck / +4d sea·air).
  const trackingBarcode =
    r.ftrackingchn && r.ftrackingchn.trim() !== "" ? code128SvgDataUrl(r.ftrackingchn.trim()) : null;
  let etaFrom = "";
  let etaTo = "";
  if (r.fdatetothai && r.fdatetothai !== "0000-00-00") {
    const base = new Date(`${r.fdatetothai.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(base.getTime())) {
      const addDays = r.ftransporttype === "1" ? 2 : 4;
      const to = new Date(base);
      to.setDate(to.getDate() + addDays);
      const fmt = (d: Date) => d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
      etaFrom = fmt(base);
      etaTo = fmt(to);
    }
  }

  // 2026-06-11 (ปอน) — init values for the status-driven workflow's conditional
  // sub-forms (pricing@4 · credit). num() coerces the legacy string/number cols.
  const num = (v: number | string | null | undefined): number => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
    return Number.isFinite(n) ? n : 0;
  };
  const VALID_PRODUCT = ["1", "2", "3", "4"];
  const VALID_WH_TH = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const pricingInit = {
    weight: num(r.fweight), width: num(r.fwidth), length: num(r.flength),
    height: num(r.fheight), volume: num(r.fvolume),
    productType: (VALID_PRODUCT.includes(r.fproductstype ?? "") ? r.fproductstype : "1") as "1" | "2" | "3" | "4",
    refPrice: (r.frefprice === "2" ? "2" : "1") as "1" | "2",
    note: r.fnote ?? "",
    customRate: (r.customrate === "1" ? "1" : "0") as "0" | "1",
    customRateKg: num(r.customratekg) || 40,
    customRateCbm: num(r.customratecbm) || 7500,
    // 2026-06-17 (mig 0187) — seed the per-order ค่าเทียบ override toggle from
    // the persisted row so it stays ON (with its value) after reload.
    customComparison: (String(r.custom_comparison ?? "0").trim() === "1" ? "1" : "0") as "0" | "1",
    customComparisonValue: num(r.custom_comparison_value),
    fDiscount: num(r.fdiscount),
    fTransportPriceChnThb: num(r.ftransportpricechnthb),
    priceOther: num(r.priceother),
    fTransportPrice: num(r.ftransportprice),
    fShippingService: num(r.fshippingservice),
    fWarehouseChina: (r.fwarehousechina === "2" ? "2" : "1") as "1" | "2",
    fWarehouseName: (VALID_WH_TH.includes(r.fwarehousename ?? "") ? r.fwarehousename : "1") as "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8",
  };
  // Grand-total estimate for the credit form (mirrors adminMarkForwarderCredit's
  // pricePay formula — the action recomputes authoritatively server-side).
  const creditEstimate =
    num(r.ftotalprice) + num(r.ftransportprice) + num(r.fpriceupdate) + num(r.fshippingservice) +
    num(r.pricecrate) + num(r.ftransportpricechnthb) + num(r.priceother) - num(r.fdiscount);

  // 2026-06-16 (owner Part 2) — rateMissing probe. READ-ONLY, reuses the SAME
  // resolver inputs adminUpdateForwarderDimensions uses (previewForwarderRate-
  // Missing) so the on-page badge and the save can never drift. Best-effort —
  // degrades to not-missing on any DB error so the page still renders.
  const { missing: rateMissing } = await previewForwarderRateMissing(admin, r.id);
  const tRate = await getTranslations("forwarderInlineRate");

  // ── 2026-06-19 (Unit A) — ยอดเก็บจริง + breakdown (แจงรายละเอียดค่า) ──────────
  // The header/items show ftotalprice = freight ONLY (e.g. 45.10). The amount the
  // customer is actually collected at pay-time = freight + เหมาๆ ฿100 (first
  // PCSF-zero row) − ส่วนลด − หัก ณ ที่จ่าย นิติ 1% (when juristic & batch ≥ ฿1,000).
  // So a forwarder showing 45.10 collects 95.10 → the owner's confusion. We compute
  // it with the SAME canonical fn the จ่ายแทนลูกค้า page uses so the two never drift.
  //
  // isCorporate: a tb_corporate row exists for this userid OR fusercompany==='1'.
  // (Single-row batch: the 1% only fires if THIS row's total ≥ ฿1,000, matching
  // computeForwarderDebitBatch's batch-≥1000 gate — faithful to pay-users.php.)
  let collectIsCorporate = (r.fusercompany ?? "").trim() === "1";
  // Also fetch the corp NAME (2026-07-03) so the "จาก :" header shows the
  // COMPANY for a juristic customer (was leaking the contact person). Single
  // maybeSingle keyed by userid — unconditional so a fusercompany='1' row still
  // resolves its company name.
  let corpCompanyName: string | null = null;
  {
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id, corporatename")
      .eq("userid", r.userid)
      .limit(1)
      .maybeSingle<{ id: number | string; corporatename: string | null }>();
    if (corpErr) {
      console.error(`[tb_corporate collect-check] failed`, { code: corpErr.code, message: corpErr.message, userid: r.userid });
    }
    if (corpRow) {
      collectIsCorporate = true;
      const nm = (corpRow.corporatename ?? "").trim();
      if (nm) corpCompanyName = nm;
    }
  }
  // Resolve the display identity via the shared SOT — COMPANY name for a
  // juristic customer, contact person kept for the sub-line.
  const customerIdentity = resolveBillingIdentity({
    userCompany: u?.userCompany ?? r.fusercompany,
    userName: u?.userName,
    userLastName: u?.userLastName,
    corp: corpCompanyName
      ? { corporatename: corpCompanyName, corporatenumber: null, corporateaddress: null }
      : null,
  });
  // ภูม 2026-06-23 — aggregate the WHOLE shipment (all sibling trackings), the
  // SAME row set the รายการสินค้า table sums, so ยอดเก็บจริง matches it. Was a
  // money bug: this computed on the ONE landed row (฿410) while the items table
  // summed all 6 siblings (฿4,424) → staff/customer saw two clashing totals.
  // computeForwarderDebitBatch is batch-aware (one ฿100 เหมาๆ for the batch + the
  // นิติ 1% gate on the BATCH total), so passing every sibling is correct.
  const collectSiblings = await fetchCountableForwarderSiblings(admin, {
    id: r.id, ftrackingchn: r.ftrackingchn, userid: r.userid, fweight: r.fweight,
    fwidth: r.fwidth, flength: r.flength, fheight: r.fheight,
    fshipby: r.fshipby, ftotalprice: r.ftotalprice, ftransportprice: r.ftransportprice,
    fpriceupdate: r.fpriceupdate, fshippingservice: r.fshippingservice, pricecrate: r.pricecrate,
    ftransportpricechnthb: r.ftransportpricechnthb, priceother: r.priceother, fdiscount: r.fdiscount,
  });
  const collectRows: ForwarderDebitRow[] = collectSiblings.map((s) => ({
    id: s.id, fshipby: s.fshipby, ftotalprice: s.ftotalprice, ftransportprice: s.ftransportprice,
    fpriceupdate: s.fpriceupdate, fshippingservice: s.fshippingservice, pricecrate: s.pricecrate,
    ftransportpricechnthb: s.ftransportpricechnthb, priceother: s.priceother, fdiscount: s.fdiscount,
  }));
  const collectBatch = computeForwarderDebitBatch(collectRows, {
    userId: r.userid,
    isCorporate: collectIsCorporate,
  });
  // ── Advance billing (owner 2026-06-23 · วางบิลล่วงหน้าตอน MOMO ยิงของ) ──
  // The whole shipment's sibling ids (เฟิม + advance-bill cover all แทค), whether it's
  // already เฟิม'd, and whether it's priced (any sibling has freight > 0 = measured).
  const advanceSiblingIds = collectSiblings.map((s) => s.id).filter((n): n is number => Number.isInteger(n) && n > 0);
  const advanceConfirmed = String(r.advance_bill_confirmed ?? "").trim() === "1";
  const advancePriced = collectSiblings.some((s) => (Number(s.ftotalprice) || 0) > 0);
  // Collapse the per-line breakdowns into ONE shipment breakdown (same shape the
  // ยอดเก็บจริง panel renders); the total is the authoritative batch total.
  const collect =
    collectBatch.lines.length > 0
      ? collectBatch.lines.reduce(
          (acc, l) => ({
            freight: acc.freight + l.breakdown.freight,
            otherCharges: acc.otherCharges + l.breakdown.otherCharges,
            discount: acc.discount + l.breakdown.discount,
            maoFee: acc.maoFee + l.breakdown.maoFee,
            wht1pct: acc.wht1pct + l.breakdown.wht1pct,
            total: collectBatch.total_thb,
          }),
          { freight: 0, otherCharges: 0, discount: 0, maoFee: 0, wht1pct: 0, total: collectBatch.total_thb },
        )
      : null;
  // Show the panel when the row is still collectible (รอชำระเงิน fstatus='5' OR
  // ติดเครดิต fcredit='1') — i.e. before the ฿50 is persisted, which is exactly
  // when the freight-only number on the page would mislead.
  const collectShow =
    collect != null &&
    Number.isFinite(collect.total) &&
    ((r.fstatus ?? "").trim() === "5" || (r.fcredit ?? "").trim() === "1");
  const baht2 = (n: number) =>
    `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rateFallbackDims = {
    fId: r.id,
    weight: pricingInit.weight,
    width: pricingInit.width,
    length: pricingInit.length,
    height: pricingInit.height,
    volumeCbm: pricingInit.volume,
    productType: pricingInit.productType,
    refPrice: pricingInit.refPrice,
  };

  return (
    <main className="p-4 lg:p-6 space-y-4">
      {/* ── breadcrumb (outside the card · same as customer page) ── */}
      <nav className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">บริการฝากนำเข้า</Link>
        <span>/</span>
        <span className="font-mono text-foreground">#{r.fidorco ?? r.id}</span>
      </nav>

      {/* ── HEADER + 8-step TRACKER — one card, copied 1:1 from the customer
             page /service-import/[fNo]: title (red number) + tracking (red) +
             Code128 barcode + status/ETA (right), then the big-circle tracker.
             ปอน 2026-06-10. The admin action buttons (สถานะ/ชำระเงิน/คนขับ ·
             กลับรายการ) sit in the header-right where the customer's receipt
             link is. */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 md:p-6">
        {/* header row */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg md:text-xl font-bold text-foreground">
              ออเดอร์นำเข้าสินค้า{" "}
              <span className="text-red-600 break-all">เลขที่ #{r.fidorco ?? r.id}</span>
            </h3>
            <p className="mt-1 text-base md:text-lg font-semibold text-red-600 break-all">
              เลขแทรคกิ้ง {r.ftrackingchn && r.ftrackingchn.trim() !== "" ? r.ftrackingchn : "—"}
            </p>
            {trackingBarcode && (
              <div className="mt-1">
                {/* Code128 tracking barcode — same local SVG the customer page
                    renders (lib/barcode.ts · no external request). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="barcode-forwader h-12 w-auto max-w-full" alt={String(r.ftrackingchn ?? "")} src={trackingBarcode} />
              </div>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs ${sourceTag.cls}`}>
                {sourceTag.label}
              </span>
              {u?.adminIDSale && u.adminIDSale !== "" && (
                <span className="rounded-full border border-purple-200 bg-purple-50 text-purple-700 px-2.5 py-0.5 text-xs">
                  Sale : {u.adminIDSale}
                </span>
              )}
              {r.fcredit === "1" && (
                <span className="rounded-full border border-red-200 bg-red-50 text-red-700 px-2.5 py-0.5 text-xs">
                  💳 เครดิตสินค้า
                </span>
              )}
              {/* 2026-06-11 (Lane B) — the customer's tax-document choice + the
                  juristic-WHT signal, surfaced at the order header so staff
                  immediately see "ทำเอกสารมั้ย · VAT/ไม่ VAT". */}
              <TaxDocBadge pref={r.tax_doc_pref} />
              <JuristicWhtChip
                isJuristic={u?.userCompany === "1" || r.fusercompany === "1"}
                totalThb={Number(r.ftotalprice ?? 0)}
              />
              {/* 2026-06-16 (owner Part 2) — at-a-glance "ยังไม่มีเรทขนส่ง" chip when
                  the system can't resolve a rate for this row (same signal the save
                  refuses on). The full warning + inline fix sit below the items. */}
              {rateMissing && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                  <AlertTriangle className="h-3 w-3" /> {tRate("missingBadge")}
                </span>
              )}
              {/* 2026-06-30 (gap G7) — open parcel-exception flag, surfaced at the
                  order header so staff see "พัสดุนี้มีปัญหา" at a glance. */}
              {exceptionOpen && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 text-red-700 px-2.5 py-0.5 text-xs font-semibold">
                  <AlertTriangle className="h-3 w-3" /> พัสดุมีปัญหา
                </span>
              )}
            </div>
          </div>
          <div className="md:text-right shrink-0 space-y-1.5">
            <p className="flex items-center gap-2 md:justify-end text-sm md:text-base font-semibold text-foreground">
              <b className="font-bold">สถานะ :</b>
              {/* 2026-06-19 — header pill now reads the VIVID FSTATUS_CFG SOT so the
                  detail matches the list 1:1 (was a faded -100/-200 ladder). 99
                  (พิเศษ · outside the 1-7 journey) keeps a solid orange. */}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                currentStatusInt === 99
                  ? "bg-orange-400 text-orange-950 border border-orange-600"
                  : fstatusBadge(r.fstatus).chip
              }`}>
                {STATUS_LABEL[r.fstatus] ?? `สถานะ ${r.fstatus}`}
              </span>
            </p>
            {etaFrom !== "" && (
              <p className="text-sm text-foreground">
                จะมาถึงไทยประมาณ : <span className="text-sky-600">{etaFrom} ถึง {etaTo}</span>
              </p>
            )}
          </div>
        </div>

        {/* 8-step circle tracker */}
        <ul className="mt-5 mx-auto grid max-w-md grid-cols-4 gap-x-1 gap-y-6 md:max-w-5xl md:grid-cols-8">
          {TIMELINE.map((step, idx) => {
            // Compare by `rank` (decimal-aware) — step 6.5 "กำลังจัดส่ง" is
            // active vs visited based on the driver-assigned flag (currentRank).
            const isActive = step.rank === currentRank;
            const isComplete = step.rank < currentRank || (step.rank === currentRank && currentRank >= 8);
            const isFuture = !isActive && !isComplete && currentStatusInt !== 99;
            const reached = isActive || isComplete;
            return (
              <li key={step.key} className="relative flex flex-col items-center text-center px-0.5">
                {/* connector rail — to the LEFT of every step except the first
                    of each grid row (steps 1 & 5 start a row on mobile). */}
                {idx !== 0 && (
                  <span
                    aria-hidden
                    className={`absolute top-8 right-1/2 left-[-50%] h-0.5 md:top-10 ${
                      idx === 4 ? "hidden md:block" : ""
                    } ${reached ? "bg-red-500" : "bg-border"}`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full border-2 ${
                    isActive
                      ? "border-red-600 bg-red-50 ring-2 ring-red-200"
                      : isComplete
                        ? "border-red-500 bg-red-50"
                        : "border-gray-300 bg-white dark:bg-surface"
                  }`}
                >
                  {step.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.img}
                      alt={step.label}
                      className={`object-contain h-11 w-11 md:h-14 md:w-14 ${reached ? "" : "grayscale opacity-70"}`}
                    />
                  ) : (
                    // เตรียมส่ง — Pacred Lucide icon (legacy PNG had a "PCS cargo" crate).
                    <PackageCheck
                      strokeWidth={1.5}
                      className={`h-10 w-10 md:h-12 md:w-12 ${reached ? "text-red-600" : "text-gray-400"}`}
                    />
                  )}
                </span>
                <p className={`mt-2 text-[11px] md:text-xs font-medium ${isActive ? "text-red-700" : isFuture ? "text-muted" : "text-foreground"}`}>
                  {step.label}
                </p>
                <p className="text-[11px] text-muted font-mono">
                  {step.date ? new Date(step.date).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                </p>
              </li>
            );
          })}
        </ul>
        {/* ── 2-col details — copied 1:1 from the customer page
           /service-import/[fNo] (forwarder.php detail). Same fields, same order,
           same `<b>label : </b>value` format; editable fields carry the inline
           [แก้ไข]. Admin-only blocks (customer card · cost breakdown · admin-meta ·
           note · pricing) intentionally dropped — owner adds them back
           point-by-point. ปอน 2026-06-10. */}
        <hr className="my-4 border-t border-dashed border-border" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {/* LEFT — legacy admin order: วันที่สร้าง · จาก(ลูกค้า) · รหัสสมาชิก ·
             อีเมล · โทร · location · ตีลัง · เก็บเงิน · บริษัทขนส่ง · ที่อยู่ ·
             เลขพัสดุไทย. (ปอน 2026-06-10 — admin-only block added back per owner.) */}
          <div className="space-y-2.5">
            <p className="text-foreground"><b className="font-semibold">วันที่สร้าง : </b>{r.fdate ? new Date(r.fdate).toLocaleString("th-TH") : "—"}</p>
            {/* จาก : ลูกค้า (avatar + ชื่อ + ลิงก์โปรไฟล์) */}
            <div className="text-foreground">
              <b className="font-semibold">จาก : </b>
              <Link href={`/admin/customers/${r.userid}`} className="inline-flex items-center gap-1.5 align-middle text-sky-600 hover:underline">
                {customerAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={customerAvatar} alt={u?.userName ?? r.userid} className="h-6 w-6 rounded-full object-cover border border-border" />
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-alt text-muted"><UserIcon className="h-3.5 w-3.5" /></span>
                )}
                {customerIdentity.isJuristic
                  ? customerIdentity.name
                  : `คุณ${u?.userName ?? ""} ${u?.userLastName ?? ""}`}
              </Link>
              {customerIdentity.isJuristic &&
                customerIdentity.personName &&
                customerIdentity.personName !== customerIdentity.name && (
                  <span className="ml-1.5 text-[11px] text-muted align-middle">
                    (ผู้ติดต่อ: คุณ{customerIdentity.personName})
                  </span>
                )}
              {/* owner 2026-06-24: ต้องบอกชัดทุกลูกค้าว่าเป็นนิติบุคคลหรือบุคคลธรรมดา
                  (ใช้ tb_users.userCompany หรือ tb_corporate ที่ผูกกับ userid) */}
              {(u?.userCompany === "1" || collectIsCorporate) ? (
                <span className="ml-1.5 inline-block rounded-full bg-purple-100 text-purple-700 border border-purple-300 text-[11px] font-medium px-2 py-0.5 align-middle">นิติบุคคล</span>
              ) : (
                <span className="ml-1.5 inline-block rounded-full bg-slate-100 text-slate-600 border border-slate-300 text-[11px] font-medium px-2 py-0.5 align-middle">บุคคลธรรมดา</span>
              )}
            </div>
            <EditUserIdField fId={r.id} userid={r.userid} />
            <p className="text-foreground"><b className="font-semibold">อีเมล : </b>{u?.userEmail ? <a href={`mailto:${u.userEmail}`} className="text-sky-600 hover:underline break-all">{u.userEmail}</a> : "—"}</p>
            <p className="text-foreground"><b className="font-semibold">โทร. : </b>{u?.userTel ? <a href={`tel:${u.userTel}`} className="text-sky-600 hover:underline">{u.userTel}</a> : "—"}</p>
            <EditPalletField fId={r.id} fpallet={r.fpallet} />
            <EditCrateField fId={r.id} crate={r.crate} pricecrate={r.pricecrate} />
            <EditPayMethodField fId={r.id} paymethod={r.paymethod} zip={r.faddresszipcode} fshipby={r.fshipby} />
            <EditShipByField fId={r.id} fshipby={r.fshipby} />
            <div className="text-foreground">
              <b className="font-semibold">ที่อยู่จัดส่งสินค้า : </b>
              {deliveryAddrFromProfile && (
                <span className="ml-1 inline-block rounded-full bg-sky-100 text-sky-700 border border-sky-300 text-[11px] px-1.5 py-0.5 align-middle">
                  ที่อยู่หลักของลูกค้า
                </span>
              )}
              {deliveryAddrCorp && (
                <span className="ml-1 inline-block rounded-full bg-indigo-100 text-indigo-700 border border-indigo-300 text-[11px] px-1.5 py-0.5 align-middle">
                  ที่อยู่บริษัท (นิติบุคคล)
                </span>
              )}
              <div className="mt-1 leading-relaxed">
                {deliveryAddrCorp ? (
                  <>
                    {deliveryAddrCorp.name}<br />
                    {deliveryAddrCorp.addressLine}
                    {u?.userTel && (<><br />โทร. {u.userTel}</>)}
                    <br /><span className="text-[11px] text-amber-600">
                      ℹ️ ออเดอร์นี้เลือกขนส่งแบบส่งถึงบ้าน — ลูกค้าเป็นนิติบุคคลและยังไม่ได้บันทึกที่อยู่จัดส่ง จึงดึงที่อยู่บริษัทมาแสดง (ที่อยู่บนออเดอร์เดิมเป็นค่าโกดัง)
                    </span>
                  </>
                ) : (
                  <>
                    {deliveryAddr.name} {deliveryAddr.lastname}<br />
                    {deliveryAddr.no} {deliveryAddr.subdistrict ? `ต.${deliveryAddr.subdistrict}` : ""} {deliveryAddr.district ? `อ.${deliveryAddr.district}` : ""} {deliveryAddr.province ? `จ.${deliveryAddr.province}` : ""} {deliveryAddr.zipcode}
                    {(deliveryAddr.tel || deliveryAddr.tel2) && (<><br />โทร. {deliveryAddr.tel || "—"}{deliveryAddr.tel2 ? `, ${deliveryAddr.tel2}` : ""}</>)}
                    {deliveryAddr.note && (<><br /><span className="text-muted">📝 {deliveryAddr.note}</span></>)}
                    {deliveryAddrFromProfile && (
                      <><br /><span className="text-[11px] text-amber-600">
                        ℹ️ ออเดอร์นี้เลือกขนส่งแบบส่งถึงบ้าน — ดึงที่อยู่หลักจากโปรไฟล์ลูกค้ามาแสดง (ที่อยู่บนออเดอร์เดิมเป็นค่าโกดัง)
                      </span></>
                    )}
                  </>
                )}
              </div>
              <EditDeliveryAddressField
                fId={r.id}
                userid={r.userid}
                fshipby={r.fshipby}
                addresses={savedAddresses}
                current={{
                  name: r.faddressname ?? "", lastname: r.faddresslastname ?? "",
                  addressno: r.faddressno ?? "", subdistrict: r.faddresssubdistrict ?? "",
                  district: r.faddressdistrict ?? "", province: r.faddressprovince ?? "",
                  zipcode: r.faddresszipcode ?? "", tel: r.faddresstel ?? "",
                  tel2: r.faddresstel2 ?? "", note: r.faddressnote ?? "",
                }}
              />
              {deliveryHistory.length > 0 && (
                <details className="mt-1 text-[11px] text-muted">
                  <summary className="cursor-pointer text-sky-600 hover:underline">📦 ประวัติการจัดส่ง ({deliveryHistory.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {deliveryHistory.map((h) => (
                      <li key={h.id}>#{h.id} · {h.carrier} · {h.province} · {h.date}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <p className="text-foreground"><b className="font-semibold">เลขพัสดุในไทย : </b>{r.ftrackingth ?? "—"}</p>
          </div>
          {/* RIGHT (md:text-right like the customer page) */}
          <div className="space-y-2.5 md:text-right">
            <EditTrackingChnField fId={r.id} ftrackingchn={r.ftrackingchn} fstatus={r.fstatus} />
            <EditTransportTypeField fId={r.id} ftransporttype={r.ftransporttype} />
            <p className="text-foreground"><b className="font-semibold">โกดังประเทศจีน : </b>{chinaWarehouseDisplay}</p>
            <EditCabinetField fId={r.id} fcabinetnumber={r.fcabinetnumber} fcabinetLocked={r.fcabinet_locked === true} />
            <EditDateCloseField fId={r.id} fdatecontainerclose={r.fdatecontainerclose} fcabinetnumber={r.fcabinetnumber} />
            <p className="text-foreground"><b className="font-semibold">จำนวน : </b>{r.famount ?? 0} กล่อง</p>
            <EditAmountCountField fId={r.id} famountcount={r.famountcount} famount={r.famount} />
            {/* ภูม 2026-07-13: ปุ่ม "แตกกล่อง MOMO" ถูกเอาออก — ตอนนี้ commit แยกกล่องให้
                อัตโนมัติตั้งแต่ดึงเข้า (commit-momo-row-core split-at-commit) จึงไม่ต้องกดเอง. */}
            {/* 2026-06-24 (owner) — เอกสารภาษี ต้อง "เลือกได้ทุกครั้ง · หาที่แก้ง่าย":
                ดันขึ้นเป็นกล่องเด่น พร้อมหัวข้อชัด แทนที่จะฝังเป็นแถว compact กลางหน้า
                (เดิม owner หาไม่เจอว่าแก้ตรงไหน). ใช้ adminUpdateForwarderTaxDocMode
                เดิม · §0f confirm · ไม่ตั้ง default — เลือกเองทุกชิป. */}
            <div className="my-2 rounded-lg border-2 border-indigo-200 bg-indigo-50/60 p-3">
              <p className="mb-1.5 text-sm font-bold text-indigo-800">
                📄 เอกสารภาษี — เลือก/แก้ได้ทุกเมื่อ (ก่อนชำระเงิน)
              </p>
              <EditTaxDocModeField fId={r.id} taxDocPref={r.tax_doc_pref} />
              <p className="mt-1.5 text-[11px] leading-snug text-indigo-700/80">
                ใบกำกับภาษี = สินค้านำเข้าในนามเรา (VAT 7%) · ใบขน = บริการเคลียร์ (ลูกค้าเจ้าของของ) · ไม่เอาเอกสาร = ใบเสร็จเฉยๆ. เลือกต่อรายการนี้ — ไม่กระทบเอกสารที่ออกไปแล้ว.
              </p>
            </div>
            <p className="text-foreground"><b className="font-semibold">ประเภทสินค้า : </b>{PRODUCT_TYPE_LABEL[r.fproductstype ?? ""] ?? "—"}</p>
            {/* รายละเอียดสินค้า (ชื่อสินค้า + รูปปก) — ต่อจากประเภทสินค้า ตาม legacy admin */}
            <div className="pt-1">
              <p className="font-bold text-red-600">รายละเอียดสินค้า</p>
              {r.fdetail && r.fdetail.trim() !== "" && r.fdetail !== "..." ? (
                <>
                  <p className="mt-0.5 whitespace-pre-wrap text-muted">{r.fdetail}</p>
                  <TranslateButton text={r.fdetail} className="mt-0.5" />
                </>
              ) : (
                <p className="mt-0.5 text-muted">—</p>
              )}
              {/* หมายเหตุ (fnote) — always show when present (was only inside the edit form) */}
              {r.fnote && r.fnote.trim() !== "" && r.fnote !== "..." && (
                <div className="mt-1.5">
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">หมายเหตุ</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-muted">{r.fnote}</p>
                  <TranslateButton text={r.fnote} className="mt-0.5" />
                </div>
              )}
              {/* 2026-06-11 (ปอน) — รูปสินค้า (fCover) is now uploadable inline
                  here, like legacy PCS update.php's "เปลี่ยนรูปปกสินค้า". Wires the
                  already-built adminUpdateForwarderCover action that previously had
                  an entry point only on /edit (§0d reachability). */}
              <EditCoverField fId={r.id} images={galleryImages} />
            </div>
          </div>
        </div>

        {/* ── เรทขนส่งหาย → คำเตือน + กรอกเรทกำหนดเอง (owner Part 2) — เมื่อ
           ระบบหาเรทขนส่งของลูกค้าไม่พบ (rateMissing) แสดงกล่องเตือน + ช่องกรอก
           เรท (ขาย=CBM · กิโล=KG) ที่บันทึกผ่าน adminUpdateForwarderDimensions
           (customRate override) → คำนวณ "ค่านำเข้าจีน-ไทย" + ราคารวมด้านบนใหม่ทันที. ── */}
        {rateMissing && (
          <div className="mt-4">
            <ForwarderRateMissingFallback customerId={r.userid} dims={rateFallbackDims} />
          </div>
        )}

        {/* ── ยอดเก็บจริง + แจงรายละเอียดค่า (Unit A · owner 2026-06-19 "แจงค่าหน้าอื่นด้วย")
           — the same breakdown the จ่ายแทนลูกค้า page shows, so the freight-only
           ftotalprice above (e.g. ฿45.10) isn't confusing vs the real collect
           (฿95.10 = freight + เหมาๆ ฿100). Shown while still collectible
           (รอชำระเงิน / ติดเครดิต), before the ฿50 is persisted at pay. ── */}
        {collectShow && collect && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-primary-700">ยอดเก็บจริง (แจงรายละเอียดค่า)</h4>
              <span className="text-lg font-mono font-bold text-red-600">{baht2(collect.total)}</span>
            </div>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">ค่าขนส่งสินค้า</dt>
                <dd className="font-mono">{baht2(collect.freight)}</dd>
              </div>
              {collect.otherCharges > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">+ บริการอื่นๆ</dt>
                  <dd className="font-mono">{baht2(collect.otherCharges)}</dd>
                </div>
              )}
              {collect.maoFee > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sky-600">+ ค่าส่งเหมาๆ</dt>
                  <dd className="font-mono text-sky-600">{baht2(collect.maoFee)}</dd>
                </div>
              )}
              {collect.discount > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-emerald-600">− ส่วนลด</dt>
                  <dd className="font-mono text-emerald-600">{baht2(collect.discount)}</dd>
                </div>
              )}
              {collect.wht1pct > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-orange-600">− หัก ณ ที่จ่าย นิติ 1%</dt>
                  <dd className="font-mono text-orange-600">{baht2(collect.wht1pct)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-primary-200 pt-1.5 font-semibold text-foreground">
                <dt>ยอดเก็บจริง</dt>
                <dd className="font-mono text-red-600">{baht2(collect.total)}</dd>
              </div>
            </dl>
            {collect.maoFee > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                ℹ️ ค่าส่งเหมาๆ ฿100 จะถูกบันทึกลงค่าขนส่งตอนชำระเงิน — ก่อนชำระ
                ยอดในรายละเอียดสินค้าด้านบนจะแสดงเฉพาะค่าขนส่งสินค้า
              </p>
            )}
          </div>
        )}

        {/* ── อัปเดตสถานะรายการ — STATUS-DRIVEN (legacy update.php). owner 2026-06-11:
           "ยกฟอร์มสถานะขึ้นบนรายการสินค้า · ฟอร์มราคา (pricing@4) ให้ต่อจากรายการสินค้า แยกกัน"
           → <ForwarderStatusWorkflow> รับ รายการสินค้า เป็น children แล้ว render:
           [ฟอร์มสถานะ+หมายเหตุ] → [รายการสินค้า] → [ฟอร์มเงื่อนไข pricing/tracking/credit]. ── */}
        <hr className="my-4 border-t border-dashed border-border" />
        <h4 className="text-base md:text-lg font-bold text-red-600 mb-3">อัปเดตสถานะรายการ</h4>
        <ForwarderStatusWorkflow
          fId={r.id}
          fNo={String(r.id)}
          isUltra={isUltra}
          currentStatus={(r.fstatus as "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99") || "1"}
          currentCabinet={r.fcabinetnumber ?? ""}
          currentTrackingTh={r.ftrackingth ?? ""}
          currentNote={r.fnote ?? ""}
          currentCabinetLocked={r.fcabinet_locked === true}
          isCredit={(r.fcredit ?? "").trim() === "1"}
          amountEstimate={creditEstimate}
          pricing={pricingInit}
          reforder={r.reforder}
          itemsTable={<ForwarderImportItemsTable r={r} isJuristic={u?.userCompany === "1" || r.fusercompany === "1"} />}
          pricingEditor={
            <ForwarderPerTrackingEditor
              r={r}
              customRateInit={pricingInit.customRate}
              customRateKgInit={pricingInit.customRateKg}
              customRateCbmInit={pricingInit.customRateCbm}
              customComparisonInit={pricingInit.customComparison}
              customComparisonValueInit={pricingInit.customComparisonValue}
              canEditComparison={canEditComparison}
            />
          }
        >

          {/* ── ต้นทุน + มูลค่าสำแดง (Pricing · ใบขน) — per-line COST/DECLARED
             capture (Lane A 2026-06-11 · was built-but-unmounted §0d). Self-gated
             super/accounting/pricing · writes ONLY the cost columns, never the
             selling price / status / customer notify (§0e). Placed with the items
             it annotates, inside ปอน's status-workflow restructure. ── */}
          {/* owner 2026-07-08: ย่อกรุปข้อมูลเพิ่มเติม (ต้นทุน→WeChat) ซ่อนไว้ก่อน — เกะกะ ยังไม่ใช้. */}
          <details className="mt-4 rounded-2xl border border-border bg-surface-alt/30 [&_summary]:list-none">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground">
              <span className="text-xs">▸</span> ข้อมูลเพิ่มเติม — ต้นทุน · ใบขน · ส่วนลดเอกสาร · WeChat <span className="text-[11px] opacity-70">(คลิกเพื่อเปิด · ย่อไว้)</span>
            </summary>
            <div className="px-2 pb-3">
          <div className="mt-4">
            <ForwarderCostSection fId={r.id} reforder={r.reforder} />
          </div>

          {/* owner 2026-06-28 #1 — เลือกสินค้า → สร้างใบขน/ใบกำกับ (ร่าง) จากรายการนี้. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/admin/forwarders/${r.id}/customs-doc`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              📄 เลือกสินค้า → สร้างใบขน/ใบกำกับ (ร่าง)
            </Link>
            {/* พี่ป๊อป spec 2026-07-06 #8 — printable บิลรับสินค้า (โกดังจีน):
               SM+barcode/QR · PR# · ประเภทขนส่ง · วันรับ · จำนวนกล่อง · เบอร์ผู้ส่ง ·
               เซ็นรับ+ถ่ายรูป → = ถึงโกดังจีนแล้ว. Display/print-only (no mutation). */}
            <Link
              href={`/admin/forwarders/${r.id}/receive-bill`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              🖨 พิมพ์บิลรับสินค้า (โกดังจีน)
            </Link>
          </div>

          {/* ── ส่วนลดเอกสาร (doc-tier) ยืนยันเงื่อนไข — owner-locked · dormant-safe
             (ภูม 2026-06-18 · C · mig 0188). Self-gates super/accounting/pricing.
             Writes ONLY doc_tier_confirmed; the discount stays ฿0 until the owner
             flips cargo.doc_tier_discount.enabled. ── */}
          <div className="mt-4">
            <ForwarderDocTierConfirm fId={r.id} />
          </div>

          {/* ── จีนว่าไงเรื่องตู้/แทรคนี้ — READ-ONLY WeChat ops context (owner
             carryover 2026-06-30 · mig 0228). Grouped here WITH the PIN-gated ต้นทุน
             section + collapsed by default (owner 2026-06-30 "ข้อความยาวเกินไป →
             ย่อซ่อน รวมกับต้นทุนที่ต้องใส่รหัสอ่าน"). Matches THIS order's container/
             tracking/PR against the decrypted China-ops chats · pure read. ── */}
          <div className="mt-4">
            <WechatContextPanel
              fcabinetnumber={r.fcabinetnumber}
              ftrackingchn={r.ftrackingchn}
              userid={r.userid}
            />
          </div>
            </div>
          </details>
        </ForwarderStatusWorkflow>

        {/* ── status-step control (owner 2026-06-19): ถอย/ดัน สถานะทีละขั้น ·
           money-safe revert (refuses if billed/paid) · ops/super/warehouse. ── */}
        {canStepStatus && (
          <div className="mt-3">
            <ForwarderStepRevert fid={r.id} fstatus={r.fstatus} />
          </div>
        )}

        {/* ── สร้างใบวางบิล (owner 2026-06-22 + advance 2026-06-23) — at รอชำระเงิน/
           เตรียมส่ง (5/6) normally, OR ล่วงหน้าที่ ถึงโกดังจีน/กำลังส่งมาไทย/ถึงไทย (2/3/4)
           เมื่อเฟิมแล้ว. The "🔒 เฟิม" gate sits above it (วางบิลล่วงหน้าตอน MOMO ยิงของ). ── */}
        <div id="bill-section" className="mt-3 scroll-mt-24 space-y-2">
          <AdvanceBillConfirmButton
            fIds={advanceSiblingIds.length > 0 ? advanceSiblingIds : [r.id]}
            fstatus={r.fstatus}
            confirmed={advanceConfirmed}
            priced={advancePriced}
          />
          <CreateOrderBillButton fId={r.id} fstatus={r.fstatus} advanceConfirmed={advanceConfirmed} />
        </div>

        {/* ── "จัดส่งในไทย" (DomesticShippingSelector) REMOVED — owner/ภูม 2026-07-03:
           ซ้ำซ้อนกับ "บริษัทขนส่ง" (EditShipByField) + "ที่อยู่จัดส่ง" (auto ขนส่งตามจังหวัด) →
           พนักงานงงว่าต้องเลือกขนส่ง 2 รอบ. ตัดออก · ขนส่ง+ค่าส่ง+COD จัดการที่ บริษัทขนส่ง +
           การเก็บเงินค่าขนส่งในไทย + ที่อยู่จัดส่ง (adminPickForwarderAddress auto). ── */}

        {/* ── แจ้งปัญหาพัสดุ — parcel-exception flag/record/resolve (gap G7 ·
           owner "อุดจุดบอด" · mig 0230). RECORD-ONLY: flag a row as ของแตก/ไม่ใช่
           ของลูกค้า/ตู้ตีกลับ/ติดด่าน/PR สลับ with a note + photo · resolve when
           handled. The action writes ONLY fexception_* — money/status/ownership
           stay on the existing audited paths (แก้ไขลูกค้า · สร้างใบวางบิล). ── */}
        {/* owner 2026-07-08: ย่อ แจ้งปัญหาพัสดุ ซ่อนไว้ก่อน — เกะกะ ยังไม่ใช้. */}
        <details className="mt-4 rounded-2xl border border-border bg-surface-alt/30 [&_summary]:list-none">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground">
            <span className="text-xs">▸</span> แจ้งปัญหาพัสดุ (ของแตก/ไม่ใช่ของลูกค้า/ตู้ตีกลับ/ติดด่าน) <span className="text-[11px] opacity-70">(คลิกเพื่อเปิด · ย่อไว้)</span>
          </summary>
          <div className="px-2 pb-3">
            <ForwarderExceptionPanel fNo={r.id} />
          </div>
        </details>

        {/* ── footer: ลบการสั่งซื้อถาวร (left · destructive · guarded) +
           ย้อนกลับ (right) — legacy update.php footer, 1:1. ── */}
        <hr className="my-4 border-t border-border" />
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <ForwarderDeleteButton id={r.id} fNoLabel={String(r.fidorco ?? r.id)} />
          <Link
            href="/admin/forwarders"
            className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            <ArrowLeft className="h-4 w-4" /> ย้อนกลับ
          </Link>
        </div>
      </section>
    </main>
  );
}
