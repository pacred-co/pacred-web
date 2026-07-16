/**
 * /admin/report-cnt/[fNo] — per-container detail page (Wave 16 P0-1)
 *
 * Faithful port of `pcs-admin/report-cnt.php` L740-2502 (the `?id=<cnt>`
 * detail mode + the `&action=cost-update` sub-mode).
 *
 * What this page does (per legacy):
 *   1. Header card — โกดังจีน + container payment status + จำนวนรายการ +
 *      [money tier] ราคาต้นทุนตู้ / ราคาขายตู้ / กำไรตู้.
 *   2. "ตั้งค่าต้นทุนตู้" modal — 4 product-type rates + 2 submit buttons
 *      (บันทึก = customRate, คืนค่า = resetCustomRate). Only visible to
 *      money-tier roles, and ONLY when the container isn't paid yet.
 *   3. 2 view tabs: "มุมมอง PCS Cargo" (default) and "ปรับต้นทุนตู้ใหม่"
 *      (Pacred-native cost-update view — see "Cost-update view" below).
 *   4. 6 quick-filter buttons + DataTable with 25 columns (1 extra
 *      เรทต้นทุน column for money tier).
 *   5. Per-row inline cost-edit actions (editCost / editCost2 /
 *      editCostSheet) — placeholder buttons that call onEditCost(fid).
 *      The actual modal is built by Wave 16 P0-3 in parallel.
 *   6. Multi-select checkboxes + fixed-bottom "เพิ่มในรายการตรวจสอบแล้ว"
 *      button → adminReportCntAddCheck() server action.
 *
 * Cost-update view (Pacred-native, Wave 16 follow-up B 2026-05-23):
 *   The legacy `?action=cost-update` branch fetched a Google Sheet via
 *   the Sheets API + service-account JSON. ภูม decision: drop the Sheets
 *   dependency — admin enters new `fCostTotalPriceSheet` values inline or
 *   uploads a CSV (`tracking_chn,cost_sheet`) exported from the carrier's
 *   sheet, then bulk-saves via adminBulkUpdateForwarderCostSheet().
 *   Implementation: <CostUpdateView> + actions/admin/report-cnt-cost-update.ts
 *
 * Auth — `requireAdmin(["super","ops","accounting","warehouse"])`.
 * Warehouse sees the page but money columns + rate-edit modal hide.
 */

import { notFound } from "next/navigation";
import { ChevronDown, Truck } from "lucide-react";
import { requireAdmin, hasRole } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { CostRateModal } from "./cost-rate-modal";
import {
  ContainerDetailClient,
  type DetailRow,
} from "./container-detail-client";
import { CostUpdateView } from "./cost-update-view";
import { CntPaySlipPanel } from "./cnt-pay-slip-panel";
import { WarehouseHandoffButton } from "./handoff-button";
import {
  getContainerCostSheetParcels,
  type SheetParcel,
} from "@/lib/integrations/google-sheets/container-cost-sheet-adapter";
import { getContainerCompleteness } from "@/lib/warehouse/container-completeness";
import { resolveMomoContainerInfo } from "@/lib/admin/momo-container-resolve";
import { buildContainerJourney, type JourneyForwarderRow } from "@/lib/admin/container-journey";
import { loadWechatContainerContext } from "@/lib/admin/wechat-forwarder-context";
import { ContainerJourneyPanel } from "./container-journey-panel";
import "./legacy-report-cnt.css";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Constants (mirrors page.tsx for the list page)
// ─────────────────────────────────────────────────────────────────────

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO", "9": "อี้อู",
};

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "ทางรถ", "2": "ทางเรือ", "3": "ทางอากาศ",
};

const WAREHOUSE_CHINA_LABEL: Record<string, string> = {
  "1": "กวางโจว", "2": "อี้อู",
};

// Wave 16 Follow-up C: removed BULK_UPDATABLE_WAREHOUSES set. ALL carriers
// now use the dual-mode (CBM/Weight) modal — admin picks the dimension
// per container. MX (4) + Sang (1) default to "weight"; the rest default
// to "cbm". The legacy L1478-1488 red disabled banner is gone.

// Carriers whose historical default is "weight" (fRefPrice='1') — used
// to pre-select the modal toggle when the container has no rows yet.
const WEIGHT_DEFAULT_WAREHOUSES = new Set(["1", "4"]);

// ─────────────────────────────────────────────────────────────────────
// Settings-row column lookup — picks the right tb_settings column for
// (warehouse × transport × product-type × city). Mirrors the long
// switch-case in report-cnt.php L1306-L1456.
// ─────────────────────────────────────────────────────────────────────

function warehouseRateColumn(
  fWarehouseName: string,
  productTypeIdx: 1 | 2 | 3 | 4,
  transport: "1" | "2",
  fWarehouseChina: string,
): string {
  const prefix = transport === "1" ? "fcostcar" : "fcostship";
  const citySuffix = fWarehouseChina === "2" ? "2" : "";
  switch (fWarehouseName) {
    case "1": return `${prefix}${productTypeIdx}defaultsang${citySuffix}`;
    case "2": return `${prefix}${productTypeIdx}default${citySuffix}`;
    case "3": return `${prefix}${productTypeIdx}defaultmkcargo${citySuffix}`;
    case "4": return `${prefix}${productTypeIdx}defaultmkcargo${citySuffix}`;
    case "5": return `${prefix}${productTypeIdx}defaultjmf${citySuffix}`;
    case "6": return `${prefix}${productTypeIdx}defaultgogo${citySuffix}`;
    case "7": return `${prefix}${productTypeIdx}defaultcargocenter${citySuffix}`;
    case "8": return `${prefix}${productTypeIdx}defaultmomo${citySuffix}`;
    default:  return `${prefix}${productTypeIdx}default${citySuffix}`;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

type Params = { fNo: string; locale: string };
type SP = { action?: string; filter?: string };

export default async function AdminReportCntDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "accounting", "warehouse"]);
  const { fNo } = await params;
  const sp = await searchParams;

  const fCabinetNumber = decodeURIComponent(fNo);
  if (!fCabinetNumber) notFound();

  // Money-internal visibility (owner · mig 0189: super loses cost/profit). Only
  // ultra/accounting/pricing see ราคาต้นทุน/กำไร/เรทต้นทุน + the cost-update tab;
  // super/ops/warehouse see the container detail without money internals.
  const showMoney = canViewCostProfit(roles);

  // FIX 2 (2026-07-07): the ops-tier "add-to-check" flow (checkbox column +
  // select-all + the เพิ่มในรายการตรวจสอบแล้ว bar) is DECOUPLED from money
  // visibility — legacy always showed the checkbox to anyone who reached the
  // page. canCheckFlow mirrors adminReportCntAddCheck's gate exactly
  // (withAdmin(["super","ops","accounting"]) → isGodRole ∪ {super,ops,accounting}),
  // so warehouse/pricing-only viewers don't get a click→permission-error
  // dead-end, while super+ops (who reached the page but saw NO checkbox — the
  // PR002 dead-end) now can. Money COLUMNS stay showMoney-gated below.
  const canCheckFlow = hasRole(roles, ["super", "ops", "accounting"]);

  const isCostUpdate = sp.action === "cost-update";

  const admin = createAdminClient();

  // ── 1) Pull container summary ──
  // tb_forwarder rows for this container — also drives "first row" lookup
  // for warehouse/transport (every row in a container shares those).
  const { data: cntRows, error: cntErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, ftrackingchn, userid, fdetail, fcover, famount, fvolume, fweight, fproductstype, fproductstype2, frefrate, ftotalprice, frefprice, fpriceupdate, pricecrate, ftransportpricechnthb, priceother, fshipby, faddressdistrict, faddressprovince, faddresszipcode, paymethod, ftransportprice, fdiscount, fcosttotalprice, fcosttotalpricesheet, fstatus, fcredit, fnote, fwarehousename, fwarehousechina, ftransporttype, fusercompany, fshippingservice, fdatecontainerclose, fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus5, fdatestatus6, fdatestatus7",
    )
    .eq("fcabinetnumber", fCabinetNumber)
    .order("id", { ascending: true })
    .limit(50_000);

  if (cntErr) {
    return (
      <>
        <TopMenuReport activeHref="/admin/report-cnt" />
        <main className="p-4 lg:p-6">
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
            โหลดข้อมูลตู้ไม่สำเร็จ: {cntErr.message}
          </div>
        </main>
      </>
    );
  }

  if (!cntRows || cntRows.length === 0) {
    return (
      <>
        <TopMenuReport activeHref="/admin/report-cnt" />
        <main className="p-4 lg:p-6">
          <Breadcrumb fCabinetNumber={fCabinetNumber} />
          <div className="mt-4 rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center text-sm text-muted">
            ไม่พบรายการในตู้ <span className="font-mono">{fCabinetNumber}</span>
            <div className="mt-3">
              <Link href="/admin/report-cnt" className="text-primary-600 hover:underline text-xs">
                ← กลับหน้ารายงานตู้
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  type CntRow = (typeof cntRows)[number];
  const firstRow = cntRows[0] as CntRow;
  const fWarehouseName = String(firstRow.fwarehousename ?? "");
  const fWarehouseChina = String(firstRow.fwarehousechina ?? "");
  // Transport mode is decoded from the cabinet NAME (GZS=เรือ · GZE/EK=รถ · GZA=อากาศ),
  // which is authoritative — the stored ftransporttype can be wrong (owner
  // 2026-06-19 "อย่าหลงเชื่อข้อมูลผิดๆ"). Falls back to the stored value when the
  // name has no mode token.
  const fTransportType = resolveTransportMode(fNo, firstRow.ftransporttype);

  // ── 1b) V-D3 — carrier physical container number ──
  // The Pacred cabinet code (fcabinetnumber = GZS260525-2) is what staff and
  // customers see. The carrier's real B/L container number (e.g. JXLU6157980)
  // already arrives via MOMO: momo_container_closed.container_batch_no = the
  // cabinet code, .real_container_no = the carrier number (migrations 0119/
  // 0130). It was never surfaced — pull it here keyed on the cabinet code and
  // show it in the header. NULL = not a MOMO-synced container (manual / other
  // carrier) → the field simply doesn't render.
  let carrierContainerNo: string | null = null;
  {
    const { data: momoClosed, error: momoClosedErr } = await admin
      .from("momo_container_closed")
      .select("real_container_no")
      .eq("container_batch_no", fCabinetNumber)
      .not("real_container_no", "is", null)
      .limit(1)
      .maybeSingle<{ real_container_no: string | null }>();
    if (momoClosedErr) {
      console.error(`[momo_container_closed carrier-no] failed`, {
        code: momoClosedErr.code, message: momoClosedErr.message, cabinet: fCabinetNumber,
      });
    }
    carrierContainerNo = momoClosed?.real_container_no?.trim() || null;
  }

  // ── 2) Container payment status ── (tb_cnt_item row presence)
  const { data: cntItemRow, error: cntItemRowErr } = await admin
    .from("tb_cnt_item")
    .select("ID, cntID")
    .eq("fCabinetNumber", fCabinetNumber)
    .maybeSingle<{ ID: number; cntID: number | null }>();
  if (cntItemRowErr) {
    console.error(`[tb_cnt_item list] failed`, { code: cntItemRowErr.code, message: cntItemRowErr.message });
  }
  const cabinetIsPaid = Boolean(cntItemRow);
  const paidCntId = cntItemRow?.cntID ?? null;

  // ── 3) tb_cost_container — per-container custom rate ──
  const { data: customRate, error: customRateErr } = await admin
    .from("tb_cost_container")
    .select("fproductstype1, fproductstype2, fproductstype3, fproductstype4")
    .eq("fcabinetnumber", fCabinetNumber)
    .maybeSingle<{
      fproductstype1: number;
      fproductstype2: number;
      fproductstype3: number;
      fproductstype4: number;
    }>();
  if (customRateErr) {
    console.error(`[tb_cost_container list] failed`, { code: customRateErr.code, message: customRateErr.message });
  }

  // ── 4) tb_settings — pick the 4 default rates if no custom row ──
  let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
  if (customRate) {
    p1 = Number(customRate.fproductstype1) || 0;
    p2 = Number(customRate.fproductstype2) || 0;
    p3 = Number(customRate.fproductstype3) || 0;
    p4 = Number(customRate.fproductstype4) || 0;
  } else if (fWarehouseName && fTransportType) {
    const transport = (fTransportType === "2" ? "2" : "1") as "1" | "2";
    const cols = [1, 2, 3, 4].map((i) =>
      warehouseRateColumn(fWarehouseName, i as 1 | 2 | 3 | 4, transport, fWarehouseChina),
    );
    const sel = ["id", ...cols].join(",");
    const { data: settingsRow, error: settingsRowErr } = await admin
      .from("tb_settings")
      .select(sel)
      .eq("id", 1)
      .maybeSingle<Record<string, number | string | null>>();
    if (settingsRowErr) {
      console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
    }
    if (settingsRow) {
      p1 = Number(settingsRow[cols[0]] ?? 0);
      p2 = Number(settingsRow[cols[1]] ?? 0);
      p3 = Number(settingsRow[cols[2]] ?? 0);
      p4 = Number(settingsRow[cols[3]] ?? 0);
    }
  }

  // ── 5) tb_users for usernames + coID ──
  const userIds = Array.from(new Set(cntRows.map((r) => r.userid).filter(Boolean) as string[]));
  const userMap = new Map<string, { username: string | null; coid: string | null }>();
  if (userIds.length > 0) {
    const { data: users, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, coID")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[tb_users list] failed`, { code: usersErr.code, message: usersErr.message });
    }
    for (const u of (users ?? []) as Array<{ userID: string; userName: string | null; coID: string | null }>) {
      userMap.set(u.userID, { username: u.userName, coid: u.coID });
    }
  }

  // ── 6) tb_forwarder_import2 — flags "ยิงเข้าโกดังไทยแล้ว" rows +
  //       V-D4 per-row received box count (fi2amount = boxes scanned in at
  //       the TH warehouse). receivedByFid sums fi2amount per fid so the
  //       detail table can show "received N of M" per parcel (split-receipt
  //       aware · the legacy app only recorded a binary received flag). A
  //       forwarder may have >1 import2 row (re-link edge cases) → sum them.
  const fIds = cntRows.map((r) => r.id);
  const shippedSet = new Set<number>();
  const receivedByFid = new Map<number, number>();
  if (fIds.length > 0) {
    const { data: imp2, error: imp2Err } = await admin
      .from("tb_forwarder_import2")
      .select("fid, fi2amount")
      .in("fid", fIds);
    if (imp2Err) {
      console.error(`[tb_forwarder_import2 list] failed`, { code: imp2Err.code, message: imp2Err.message });
    }
    for (const r of (imp2 ?? []) as Array<{ fid: number; fi2amount: number | null }>) {
      const fid = Number(r.fid);
      shippedSet.add(fid);
      receivedByFid.set(fid, (receivedByFid.get(fid) ?? 0) + Math.max(0, Number(r.fi2amount ?? 0)));
    }
  }

  // ── 7) tb_cnt_pay_trackingchn — duplicate tracking detection ──
  const trackingNos = cntRows.map((r) => r.ftrackingchn).filter((s): s is string => Boolean(s));
  const trackingDupCount = new Map<string, number>();
  if (trackingNos.length > 0) {
    const { data: trackPay, error: trackPayErr } = await admin
      .from("tb_cnt_pay_trackingchn")
      .select("ftrackingchn")
      .in("ftrackingchn", trackingNos);
    if (trackPayErr) {
      console.error(`[tb_cnt_pay_trackingchn list] failed`, { code: trackPayErr.code, message: trackPayErr.message });
    }
    for (const r of (trackPay ?? []) as Array<{ ftrackingchn: string }>) {
      trackingDupCount.set(r.ftrackingchn, (trackingDupCount.get(r.ftrackingchn) ?? 0) + 1);
    }
  }

  // ── 8) tb_cnt_pay_idorco — duplicate ID/CO detection ──
  const idCoNos = cntRows.map((r) => r.fidorco).filter((s): s is string => Boolean(s));
  const idCoDupCount = new Map<string, number>();
  if (idCoNos.length > 0) {
    const { data: idCoPay, error: idCoPayErr } = await admin
      .from("tb_cnt_pay_idorco")
      .select("fidorco")
      .in("fidorco", idCoNos);
    if (idCoPayErr) {
      console.error(`[tb_cnt_pay_idorco list] failed`, { code: idCoPayErr.code, message: idCoPayErr.message });
    }
    for (const r of (idCoPay ?? []) as Array<{ fidorco: string }>) {
      idCoDupCount.set(r.fidorco, (idCoDupCount.get(r.fidorco) ?? 0) + 1);
    }
  }

  // ── 9) tb_check_forwarder — "already in check queue" markers ──
  const checkMap = new Map<number, { adminID: string; date: string | null }>();
  if (fIds.length > 0) {
    const { data: checks, error: checksErr } = await admin
      .from("tb_check_forwarder")
      .select("fID, adminID, date")
      .in("fID", fIds);
    if (checksErr) {
      console.error(`[tb_check_forwarder list] failed`, { code: checksErr.code, message: checksErr.message });
    }
    for (const r of (checks ?? []) as Array<{ fID: number; adminID: string; date: string | null }>) {
      checkMap.set(Number(r.fID), { adminID: r.adminID, date: r.date });
    }
  }

  // ── 9b) tb_forwarder_item.productname — per-box product detail (FIX 2) ──
  // tb_forwarder.fdetail is "" for MOMO-committed rows (commit-momo-row-core.ts
  // writes fdetail:"" — MOMO's import_track raw carries a product CATEGORY
  // `type` [→ fproductstype] but NO free-text product name). Manual/shop-spawned
  // forwarders DO get item rows whose `productname` is the real description. So
  // when fdetail is empty we surface the item productname(s) as the detail. We
  // NEVER fabricate detail — if neither exists the cell falls back to
  // tracking + product-type (resolved in the row map below), §0e-safe (read-only).
  const itemNameByFid = new Map<number, string>();
  if (fIds.length > 0) {
    const { data: items, error: itemsErr } = await admin
      .from("tb_forwarder_item")
      .select("fid, productname")
      .in("fid", fIds);
    if (itemsErr) {
      console.error(`[tb_forwarder_item productname] failed`, { code: itemsErr.code, message: itemsErr.message });
    }
    for (const it of (items ?? []) as Array<{ fid: number; productname: string | null }>) {
      const name = (it.productname ?? "").trim();
      if (!name) continue;
      const fid = Number(it.fid);
      const prev = itemNameByFid.get(fid);
      // Multiple item rows under one forwarder → join unique names (deduped).
      if (!prev) itemNameByFid.set(fid, name);
      else if (!prev.split(" · ").includes(name)) itemNameByFid.set(fid, `${prev} · ${name}`);
    }
  }

  // ── 9c) Reverse bill link (read-only · display) — which ใบวางบิล (billing-run)
  //       covers each forwarder in this container. forwarder_id → invoice_id →
  //       tb_forwarder_invoice(doc_no,status). A forwarder can sit on >1 invoice
  //       (cancel + re-bill) → keep all, newest invoice first. Serialized as a
  //       plain Record (a Map won't cross the server→client boundary). Pure read,
  //       no mutation; a row on NO bill simply has no entry.
  const billByFid: Record<number, Array<{ invoiceId: number; docNo: string; status: string }>> = {};
  if (fIds.length > 0) {
    const { data: billItems, error: billItemsErr } = await admin
      .from("tb_forwarder_invoice_item")
      .select("forwarder_id, invoice_id")
      .in("forwarder_id", fIds);
    if (billItemsErr) {
      console.error(`[tb_forwarder_invoice_item bill-link] failed`, { code: billItemsErr.code, message: billItemsErr.message });
    }
    const invoiceIds = Array.from(
      new Set((billItems ?? []).map((r) => Number((r as { invoice_id: number }).invoice_id))),
    );
    const invMap = new Map<number, { doc_no: string; status: string }>();
    if (invoiceIds.length > 0) {
      const { data: invs, error: invErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status")
        .in("id", invoiceIds);
      if (invErr) {
        console.error(`[tb_forwarder_invoice bill-link] failed`, { code: invErr.code, message: invErr.message });
      }
      for (const inv of (invs ?? []) as Array<{ id: number; doc_no: string; status: string }>) {
        invMap.set(Number(inv.id), { doc_no: inv.doc_no, status: inv.status });
      }
    }
    for (const it of (billItems ?? []) as Array<{ forwarder_id: number; invoice_id: number }>) {
      const inv = invMap.get(Number(it.invoice_id));
      if (!inv) continue;
      const fid = Number(it.forwarder_id);
      (billByFid[fid] ??= []).push({ invoiceId: Number(it.invoice_id), docNo: inv.doc_no, status: inv.status });
    }
    for (const k of Object.keys(billByFid)) billByFid[Number(k)].sort((a, b) => b.invoiceId - a.invoiceId);
  }

  // FIX 2 (2026-07-07): resolve the fcover thumbnail per row (signed/passthrough
  // legacy URL) — reuse the same resolver forwarder-check uses. Empty fcover →
  // null (the cell renders no image, gracefully).
  const coverMap = await resolveLegacyUrlMap(
    cntRows.map((r) => ({ id: r.id, filename: r.fcover })),
    "cover",
  );

  // ── 10) Build the rows + totals ──
  const detailRows: DetailRow[] = cntRows.map((r) => {
    const u = userMap.get(String(r.userid));
    const pType = String(r.fproductstype ?? "").trim();
    const rate = pType === "1" ? p1 : pType === "2" ? p2 : pType === "3" ? p3 : pType === "4" ? p4 : 0;

    // Derived totals — match legacy formulas in L1797 + L1803
    const storedSell            = Number(r.ftotalprice ?? 0);
    const sellRate              = Number(r.frefrate ?? 0); // เรทขาย/CBM(KG) ที่ resolve ไว้
    const fTransportPrice       = Number(r.ftransportprice ?? 0);
    const fPriceUpdate          = Number(r.fpriceupdate ?? 0);
    const fShippingService      = Number(r.fshippingservice ?? 0);
    const priceCrate            = Number(r.pricecrate ?? 0);
    const fTransportPriceCHNTHB = Number(r.ftransportpricechnthb ?? 0);
    const priceOther            = Number(r.priceother ?? 0);
    const fDiscount             = Number(r.fdiscount ?? 0);
    // COST (ต้นทุน) — compute LIVE for a non-paid container = เรทต้นทุน × carrier
    // basis. MOMO + every carrier except Sang(1)/MX(4) bill by CBM, not weight
    // (WEIGHT_DEFAULT_WAREHOUSES / costBasisMode). Rows rated BEFORE the 2026-06-18
    // basis fix carry a stale weight-basis fcosttotalprice (e.g. 2,500 × 4.10 kg =
    // ฿10,250 for a 0.0022-คิว MOMO parcel that costs ฿5.50 → กำไรตู้ −10,204). The
    // เรทต้นทุน is already resolved live above, so deriving cost from it keeps the
    // page self-consistent + correct without a prod rewrite, and self-heals when
    // the cost is next recomputed. Paid containers keep their LOCKED stored cost
    // (may be a manual adjustment); an unfilled rate (0) also keeps the stored value.
    const storedCost            = Number(r.fcosttotalprice ?? 0);
    const costBasisIsWeight     = WEIGHT_DEFAULT_WAREHOUSES.has(fWarehouseName);
    const costDim               = costBasisIsWeight ? Number(r.fweight ?? 0) : Number(r.fvolume ?? 0);
    const liveCost              = Math.round(rate * costDim * 100) / 100;
    const fCostTotalPrice       = (!cabinetIsPaid && rate > 0) ? liveCost : storedCost;

    // SELL (ราคาขาย) self-heal — mirror the live-COST above (ภูม 2026-06-30). A
    // MOMO/auto-imported row carries the resolved SELL rate (frefrate) but its
    // ftotalprice (sell TOTAL) was never computed (=0) → the row showed ฿0 ขาย +
    // a bogus NEGATIVE profit แม้ลูกค้าจะมีเรทตั้งไว้แล้ว. When the container ISN'T
    // paid and the sell isn't priced yet, derive live sell = sellRate × (the SAME
    // basis as cost) so profit reflects the real margin (= (เรทขาย−เรทต้นทุน)×dim).
    // Paid / already-priced rows keep their stored ftotalprice (locked / billed) ·
    // self-heals when the rate is next saved. Display-only — never writes the DB.
    const liveSell              = Math.round(sellRate * costDim * 100) / 100;
    const fTotalPrice           = (!cabinetIsPaid && storedSell === 0 && sellRate > 0) ? liveSell : storedSell;

    const priceGetUserItem =
      fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
      priceCrate + fTransportPriceCHNTHB + priceOther - fDiscount;

    const isJuristic =
      typeof r.fusercompany === "string" ? r.fusercompany.trim() === "1" : r.fusercompany === 1;
    const fUserCompany1Per = isJuristic ? priceGetUserItem * 0.01 : 0;

    // profitItem (legacy L1803):
    //   (revenue) − (cost + shipping + crate + chnthb + transport + 1%)
    const profitItem =
      priceGetUserItem -
      (fCostTotalPrice + fShippingService + priceCrate + fTransportPriceCHNTHB + fTransportPrice + fUserCompany1Per);

    const check = checkMap.get(Number(r.id));
    // FIX 2 — resolve the product-detail to show. Priority:
    //   1. fdetail (the admin-keyed/legacy detail)            ← preferred
    //   2. tb_forwarder_item.productname(s) for this fid       ← manual/shop rows
    //   3. null → the cell falls back to tracking + ประเภท     ← MOMO rows (no name)
    // We never fabricate a name; (3) shows real identifiers so staff aren't left
    // with a bare "-".
    const fdetailTrim = (r.fdetail ?? "").trim();
    const detailDisplay = fdetailTrim || itemNameByFid.get(Number(r.id)) || null;
    return {
      id: Number(r.id),
      fidorco: r.fidorco,
      ftrackingchn: r.ftrackingchn,
      userid: String(r.userid ?? ""),
      username: u?.username ?? null,
      usercompany: typeof r.fusercompany === "string" ? r.fusercompany : r.fusercompany == null ? null : String(r.fusercompany),
      fdetail: r.fdetail,
      detailDisplay,
      fcover: r.fcover,
      coverUrl: coverMap[String(r.id)] ?? null,
      famount: Number(r.famount ?? 0) || null,
      // V-D4 — boxes actually received at TH warehouse (sum of fi2amount).
      // null when the parcel has no import2 scan row yet (shows "-/M").
      famountfi: receivedByFid.has(Number(r.id)) ? receivedByFid.get(Number(r.id))! : null,
      fvolume: Number(r.fvolume ?? 0),
      fweight: Number(r.fweight ?? 0),
      fproductstype: pType || null,
      fproductstype2:
        // Wave 16 P0-3 modal target — raw secondary product-type for cost calc
        (r as Record<string, unknown>).fproductstype2 == null
          ? null
          : String((r as Record<string, unknown>).fproductstype2),
      // FLAG 5 — the resolved SELL rate per CBM/KG (legacy report-cnt col 9
      // "ประเภท" badge under the product-type word).
      frefrate: r.frefrate == null ? null : Number(r.frefrate),
      rate,
      ftotalprice: fTotalPrice,
      frefprice: r.frefprice == null ? null : String(r.frefprice),
      fpriceupdate: fPriceUpdate,
      pricecrate: priceCrate,
      ftransportpricechnthb: fTransportPriceCHNTHB,
      priceother: priceOther,
      fshipby: r.fshipby,
      faddressdistrict: r.faddressdistrict,
      faddressprovince: r.faddressprovince,
      faddresszipcode: r.faddresszipcode,
      paymethod: r.paymethod == null ? null : String(r.paymethod),
      ftransportprice: fTransportPrice,
      fdiscount: fDiscount,
      priceGetUser: priceGetUserItem,
      fusercompany1per: fUserCompany1Per,
      fcosttotalprice: fCostTotalPrice,
      fcosttotalpricesheet: Number(r.fcosttotalpricesheet ?? 0),
      profitItem,
      fstatus: String(r.fstatus ?? ""),
      fcredit: r.fcredit == null ? null : String(r.fcredit),
      fnote: r.fnote,
      notYetWarehouse: !shippedSet.has(Number(r.id)),
      cntPaid: cabinetIsPaid,
      trackingDup: Boolean(r.ftrackingchn && (trackingDupCount.get(r.ftrackingchn) ?? 0) > 1),
      idCoDup: Boolean(r.fidorco && (idCoDupCount.get(r.fidorco) ?? 0) > 1),
      notCollectedFromCustomer: Number(r.fstatus ?? 0) < 5,
      inCheckQueue: checkMap.has(Number(r.id)),
      checkAdminId: check?.adminID ?? null,
      checkDate: check?.date ?? null,
    };
  });

  const totals = detailRows.reduce(
    (acc, r) => ({
      cost:     acc.cost     + r.fcosttotalprice,
      price:    acc.price    + r.ftotalprice,
      discount: acc.discount + r.fdiscount,
    }),
    { cost: 0, price: 0, discount: 0 },
  );
  const totalCost     = totals.cost;
  const totalPrice    = totals.price;
  const totalDiscount = totals.discount;
  const totalProfit = totalPrice - totalDiscount - totalCost;
  const warehouseLabel = WAREHOUSE_LABEL[fWarehouseName] ?? fWarehouseName;
  const warehouseChinaLabel = WAREHOUSE_CHINA_LABEL[fWarehouseChina] ?? fWarehouseChina;
  const transportLabel = TRANSPORT_LABEL[fTransportType] ?? fTransportType;
  // Legacy nameTransportType2 (function.php L660-668) colours the transport pill
  // BY MODE: ทางรถ (1) = badge-info (blue) · ทางเรือ (2) = badge-success (green).
  // ทางอากาศ (3) has no legacy colour → badge-primary (Pacred addition).
  const transportBadgeClass =
    fTransportType === "2" ? "badge-success" : fTransportType === "3" ? "badge-primary" : "badge-info";

  // Wave 16 Follow-up C — derive container-wide cost mode from row data.
  // fRefPrice '1' = น้ำหนัก (weight); '' / '2' / null = ปริมาตร (cbm).
  // "Current mode" = majority of rows. "Mixed" = rows disagree.
  let weightRows = 0;
  let cbmRows = 0;
  for (const r of cntRows) {
    if (String(r.frefprice ?? "") === "1") weightRows += 1;
    else cbmRows += 1;
  }
  const mixedMode = weightRows > 0 && cbmRows > 0;
  const derivedMode: "cbm" | "weight" =
    weightRows === 0 && cbmRows === 0
      ? (WEIGHT_DEFAULT_WAREHOUSES.has(fWarehouseName) ? "weight" : "cbm")
      : weightRows > cbmRows
        ? "weight"
        : "cbm";

  // Wave 16 Follow-up C — ALL carriers can open the modal now (mode-aware).
  // The legacy MX/Sang disabled banner is gone.
  const canEditCost = showMoney && !cabinetIsPaid;

  // ── Phase 3 (ops-workflow audit §30) — per-container completeness ──
  // Sums famount (expected) vs fi2amount (scanned) for the cabinet's
  // forwarders. Drives the green/amber banner at the top of the detail
  // page so warehouse staff can see "ของยิงเข้าโกดังครบมั้ย" at a glance.
  const completeness = await getContainerCompleteness(admin, fCabinetNumber);

  // ── G4 — container JOURNEY timeline (read-only · "ตู้นี้ถึงไหนแล้ว") ──
  // Resolve ETD/ETA (แต้ม-primary · MOMO-fallback) for this single cabinet, fold
  // the rows' date stamps into the ordered stage strip, and pull the China-ops
  // WeChat messages that mention this container for the mini-feed. All read-only.
  // 2026-07-10 (ภูม dup-container fix): pass THIS cabinet's own trackings so a
  // placeholder resolves its real container from its own parcels only (consistent
  // with the list). The detail here only reads etd/eta (unaffected), but keeping
  // the call shape identical avoids the resolver borrowing another parcel's tู้.
  const detailTracksByCab: Record<string, string[]> = {
    [fCabinetNumber]: cntRows.map((r) => r.ftrackingchn).filter((s): s is string => Boolean(s)),
  };
  const momoInfo = (await resolveMomoContainerInfo(admin, [fCabinetNumber], detailTracksByCab))[fCabinetNumber];
  const journeyEtd = momoInfo?.etd ?? null;
  const journeyEta = momoInfo?.eta ?? null;
  const journey = buildContainerJourney(
    fCabinetNumber,
    String(firstRow.ftransporttype ?? ""),
    cntRows as JourneyForwarderRow[],
    journeyEtd,
    journeyEta,
  );
  // Box (CTNS) / CBM / weight totals for the journey strip — reuse completeness
  // for the expected box count; sum volume/weight across the container's rows.
  const journeyVolumeCbm = cntRows.reduce((s, r) => s + Number(r.fvolume ?? 0), 0);
  const journeyWeightKg = cntRows.reduce((s, r) => s + Number(r.fweight ?? 0), 0);
  const journeyTotals = {
    trackCount: detailRows.length,
    boxes: completeness.expected,
    volumeCbm: journeyVolumeCbm,
    weightKg: journeyWeightKg,
  };
  const wechatContext = await loadWechatContainerContext({
    container: fCabinetNumber,
    carrierContainerNo,
  });

  // ── LANE A — fetch แสง's Google Sheet parcels for the cost-update diff ──
  // Only when on the cost-update tab + money-tier. Cache-first (kept fresh
  // by /api/cron/sync-container-cost-sheet), live fallback. Degrades to a
  // banner when the Sheets service account is unconfigured.
  let sheetParcels: SheetParcel[] = [];
  let sheetSource: "cache" | "live" | null = null;
  let sheetUnavailable: { reason: string; message?: string } | null = null;
  if (isCostUpdate && showMoney) {
    const sp = await getContainerCostSheetParcels(admin, fCabinetNumber);
    if (sp.ok) {
      sheetParcels = sp.parcels;
      sheetSource = sp.source;
    } else {
      sheetUnavailable = { reason: sp.reason, message: sp.message };
    }
  }

  // Legacy "จำนวนรายการที่ขาด" = items whose goods aren't fully scanned into the
  // TH warehouse yet (report-cnt.php countNotCom · unit = รายการ, not กล่อง).
  const missingItems = Math.max(0, completeness.forwardersTotal - completeness.forwardersComplete);
  const missingBoxes = Math.max(0, completeness.expected - completeness.scanned);
  const fmt2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cabHref = `/admin/report-cnt/${encodeURIComponent(fCabinetNumber)}`;

  return (
    <>
      {/* Legacy order: breadcrumb at the VERY TOP → exception tabs → header card
          (ปอน 2026-07-14 "บนสุดต้องเป็น หน้าแรก › รายงานตู้สินค้า › ตู้").
          2026-07-14 (ปอน) — the exception-tabs strip moved INSIDE the header
          .pcs-card (embedded) so the chip menu + รายงานตู้ share ONE framed box. */}
      <div className="px-4 pt-3 lg:px-6 bg-[#f4f5f7]">
        <Breadcrumb fCabinetNumber={fCabinetNumber} />
      </div>
      {/* .pcs-rc scopes the faithful legacy PCS Cargo look (legacy-report-cnt.css)
          to this content only — the rest of the admin shell keeps its own theme.
          Faithful port of report-cnt.php?id=<cnt> (ADR-0017 · ปอน 2026-07-14). */}
      <main className="pcs-rc px-1 py-4 lg:px-1 lg:py-6 pb-32">
        {/* ── SECTION 1 · header card (report-cnt.php L1504-1576) ── */}
        <section className="pcs-card mt-3">
          {/* exception-tabs strip — embedded as the card's top header row */}
          <TopMenuReport activeHref="/admin/report-cnt" embedded />
          {/* title + top-right tools (legacy .float-md-right ตั้งค่าต้นทุนตู้ gear) */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3>
              <Truck size={28} strokeWidth={1.5} className="inline-block align-[-5px]" aria-hidden />{" "}
              รายงานตู้สินค้า {fCabinetNumber}{" "}
              <span className={`badge ${transportBadgeClass} badge-pill`}>{transportLabel}</span>
            </h3>
            {/* top-right toolbar — ALL tools inline as GHOST buttons (icon + text,
                no frame · ปอน 2026-07-15 "เอาไปแถวเดียวกับตั้งค่าต้นทุน · เอากรอบปุ่ม
                ออก มีแต่ไอคอนกับ text"): print + accounting-handoff + pay-slip + the
                cost-rate gear. `.pcs-header-tools` lets legacy-report-cnt.css stop
                `.pcs-rc a` from repainting the print <Link> blue/underlined. */}
            <div className="pcs-header-tools flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5">
              <Link
                href={`/admin/printAll?cabinet=${encodeURIComponent(fCabinetNumber)}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-amber-50"
              >
                🖨 พิมพ์ป้ายกล่องทั้งตู้
              </Link>
              {completeness.forwardersTotal > 0 && (
                <WarehouseHandoffButton fCabinetNumber={fCabinetNumber} isComplete={completeness.isComplete} />
              )}
              {showMoney && !cabinetIsPaid && (
                <CntPaySlipPanel fCabinetNumber={fCabinetNumber} suggestedAmount={totalCost} />
              )}
              {canEditCost && (
                <CostRateModal
                  fCabinetNumber={fCabinetNumber}
                  warehouseLabel={warehouseLabel}
                  warehouseChinaLabel={warehouseChinaLabel}
                  transportLabel={transportLabel}
                  currentMode={derivedMode}
                  mixedMode={mixedMode}
                  defaults={{
                    fProductsType1: p1,
                    fProductsType2: p2,
                    fProductsType3: p3,
                    fProductsType4: p4,
                  }}
                />
              )}
            </div>
          </div>

          {/* body: .price block (left) + status/note (right) — legacy 2-col */}
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="price">
              <h4>ชื่อโกดังจีน : <span style={{ fontWeight: 500 }}>{warehouseLabel}</span> ({warehouseChinaLabel})</h4>
              {carrierContainerNo && (
                <h4>
                  เลขตู้สายเรือ :{" "}
                  <span
                    className="font-mono"
                    title="เลขตู้คอนเทนเนอร์จริงของสายเรือ/ผู้ขนส่ง (จาก B/L)"
                    style={{ fontWeight: 500 }}
                  >
                    {carrierContainerNo}
                  </span>
                </h4>
              )}
              <h4>
                สถานะตู้สินค้า{" "}
                {cabinetIsPaid ? (
                  <span className="badge badge-success badge-rounded">จ่ายเงินแล้ว</span>
                ) : (
                  <span className="badge badge-warning badge-rounded">ยังไม่จ่ายเงิน</span>
                )}
              </h4>
              <h4>จำนวนรายการทั้งหมด {detailRows.length.toLocaleString()} รายการ</h4>
              {missingItems > 0 && (
                <h4 className="bg-danger d-inline-block p-05">
                  จำนวนรายการที่ขาด {missingItems.toLocaleString()} รายการ
                </h4>
              )}
              {showMoney && (
                <>
                  <h3 className="text-danger">ราคาต้นทุนตู้ {fmt2(totalCost)} บาท</h3>
                  <h4>ราคาขายตู้ {fmt2(totalPrice)} บาท</h4>
                  <h4>
                    กำไรตู้{" "}
                    <span className="font-2rem">
                      {totalProfit >= 0 ? (
                        <span className="text-success">+{fmt2(totalProfit)}</span>
                      ) : (
                        <span className="text-danger">{fmt2(totalProfit)}</span>
                      )}
                    </span>{" "}
                    บาท
                  </h4>
                </>
              )}
              <p className="font-12" style={{ color: "#8a8d90", marginTop: ".5rem", marginBottom: 0 }}>**หมายเหตุ</p>
              <p className="font-12" style={{ color: "#8a8d90", margin: 0 }}>
                1. รายการที่ขาด คือ รายการที่สินค้าไม่ได้มีการยิงเข้าในประวัติสินค้าถึงโกดังไทย
              </p>
            </div>

            <div>
              {/* legacy right col — scan-progress as a SOLID red/green box, white
                  text (report-cnt.php count-fCostTotalPrice · bg-danger text-white
                  p-05 d-inline-block · ปอน 2026-07-14 · "เอาขึ้นมาไว้ข้างบน"). */}
              {completeness.forwardersTotal > 0 && (
                <div
                  className="d-inline-block p-05 text-white"
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    borderRadius: "0.25rem",
                    background: completeness.isComplete ? "#28d094" : "#ff4961",
                    whiteSpace: "normal",
                  }}
                >
                  {completeness.isComplete
                    ? `ยิงครบทุกรายการ · ยิง ${completeness.scanned.toLocaleString()}/${completeness.expected.toLocaleString()} กล่อง (${completeness.pct}%)`
                    : `ขาด ${missingBoxes.toLocaleString()} กล่อง · ยิง ${completeness.scanned.toLocaleString()}/${completeness.expected.toLocaleString()} กล่อง (${completeness.pct}%)`}
                </div>
              )}
              {cabinetIsPaid && showMoney && (
                <p className="text-danger" style={{ fontSize: "0.85rem", marginTop: ".6rem" }}>
                  ไม่สามารถแก้ไขต้นทุนรายตู้ได้เนื่องจากรายการนี้จ่ายเงินค่าตู้แล้ว{" "}
                  {paidCntId && (
                    <Link href={`/admin/cnt-hs/${paidCntId}`}>
                      ไปยังรายการจ่ายเงินตู้เพื่อแก้ไขต้นทุนจากบิลจ่ายเงิน
                    </Link>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* (Pacred quick tools moved up into the header's top-right ghost toolbar
              · ปอน 2026-07-15) */}
        </section>

        {/* ── SECTION 2 · table card (report-cnt.php L1582-1651) ── */}
        <section className="pcs-card pcs-card--flush">
          <h3>
            <Truck size={28} strokeWidth={1.5} className="inline-block align-[-5px]" aria-hidden />{" "}
            รายงานตู้สินค้า {fCabinetNumber}
          </h3>
          {/* view tabs: มุมมอง PCS Cargo | ปรับต้นทุนตู้ใหม่ (nav-underline) */}
          <ul className="pcs-tabs">
            <li>
              <TabLink href={cabHref} active={!isCostUpdate}>มุมมอง Pacred Cargo</TabLink>
            </li>
            <li>
              <TabLink href={`${cabHref}?action=cost-update`} active={isCostUpdate}>ปรับต้นทุนตู้ใหม่</TabLink>
            </li>
          </ul>

          {isCostUpdate ? (
            showMoney ? (
              <CostUpdateView
                fCabinetNumber={fCabinetNumber}
                warehouseLabel={warehouseLabel}
                rows={detailRows}
                sheetParcels={sheetParcels}
                sheetSource={sheetSource}
                sheetUnavailable={sheetUnavailable}
                cabinetIsPaid={cabinetIsPaid}
                paidCntId={paidCntId}
              />
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
                <p className="font-semibold">ไม่มีสิทธิ์เข้าถึง</p>
                <p className="mt-2 text-xs">
                  การปรับต้นทุนตู้ใหม่ต้องใช้สิทธิ์ ultra / accounting / pricing
                  (บัญชีอื่นดูตู้ได้แต่ไม่เห็นต้นทุน/กำไร).
                </p>
              </div>
            )
          ) : (
            <ContainerDetailClient
              rows={
                // DATA-LAYER hide (security · mig 0189): when the viewer may NOT
                // see money internals, strip the per-row cost/profit/cost-rate
                // fields BEFORE they serialize to the client — never ship a
                // hidden-but-present cost. profitItem is derived (sell − cost), so
                // it's zeroed alongside cost to close the derived-value leak.
                showMoney
                  ? detailRows
                  : detailRows.map((r) => ({
                      ...r,
                      rate: 0,
                      fcosttotalprice: 0,
                      fcosttotalpricesheet: 0,
                      profitItem: 0,
                    }))
              }
              showMoney={showMoney}
              canCheckFlow={canCheckFlow}
              cabinetIsPaid={cabinetIsPaid}
              billByFid={billByFid}
              transportLabel={transportLabel}
              transportBadgeClass={transportBadgeClass}
            />
          )}
        </section>

        {/* ปอน 2026-07-15 — "เส้นทางตู้ + แชทจีน" (Pacred journey/China-chat panel,
            not in legacy report-cnt.php) moved to the BOTTOM, below the table.
            Collapsed by default; a stuck container still warns on the summary bar. */}
        <details className="group rounded-2xl border border-border bg-white shadow-sm mt-4">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 lg:px-6 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              🗺️ เส้นทางตู้ + แชทจีน
              <span className="hidden text-[11px] font-normal text-muted sm:inline">
                ตู้นี้ถึงไหนแล้ว · จีนว่าไงเรื่องตู้นี้
              </span>
              {journey.isStuck && (
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
                  ⚠️ ตู้ค้าง
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
              <span className="group-open:hidden">แสดง</span>
              <span className="hidden group-open:inline">ซ่อน</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-border p-3 lg:p-4">
            <ContainerJourneyPanel
              journey={journey}
              totals={journeyTotals}
              etd={journeyEtd}
              eta={journeyEta}
              wechat={wechatContext}
            />
          </div>
        </details>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small server pieces
// ─────────────────────────────────────────────────────────────────────

function Breadcrumb({ fCabinetNumber }: { fCabinetNumber: string }) {
  return (
    <nav aria-label="breadcrumb" className="text-xs text-muted">
      <ol className="flex items-center gap-1">
        <li><Link href="/admin" className="hover:underline">หน้าแรก</Link></li>
        <li>›</li>
        <li><Link href="/admin/report-cnt" className="hover:underline">รายงานตู้สินค้า</Link></li>
        <li>›</li>
        <li className="font-mono text-foreground">{fCabinetNumber}</li>
      </ol>
    </nav>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  // Legacy report-cnt.php nav-underline tab (.pcs-tab · active = red #cc3333).
  return (
    <Link href={href} className={`pcs-tab${active ? " active" : ""}`}>
      {children}
    </Link>
  );
}
