/**
 * <ForwarderCostSection> — per-line COST + DECLARED capture on the forwarder
 * detail page (P2 · tax-invoice platform · the `pricing` role's write surface).
 *
 * Async server component: loads the forwarder's per-line rows (tb_forwarder_item
 * if admin-direct · else the shop-spawn source tb_order, matching what
 * FreightBreakdownTable shows) WITH the new cost columns (migration 0158), then
 * renders the client cost editor (super/accounting/pricing) or a read-only
 * summary (everyone else) per line.
 *
 * ⚠️ ISOLATION (AGENTS.md §0e): this section is wholly separate from the
 * forwarder edit / pricing / payment flow. It only surfaces the cost action
 * (ForwarderItemCostEditor → setForwarderItemCost / setShopOrderItemCost),
 * which writes ONLY the per-line cost+declared columns. It never recomputes the
 * selling price, changes status, or notifies the customer.
 *
 * §0c: every Supabase read destructures `error`. §0d: reachable inline on the
 * forwarder detail page (≤3 clicks from the sidebar: ฝากนำเข้า list → row → here).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import {
  ForwarderItemCostEditor,
  ShopOrderItemCostEditor,
  CargoCostLineSummary,
  ForwarderImportDutyEditor,
} from "@/components/admin/cargo-cost-line-editor";
import {
  autoOrNull,
  shopAutoDeclaredThb,
  importAutoDeclaredThb,
} from "@/lib/forwarder/cargo-cost-autofill";
// GAP 8 (2026-06-12) — wire the previously-DEAD computeMarginVat (the NON-VAT
// 7%-on-margin staff figure · legacy function.php) into the GAP 9 profit panel.
import { computeMarginVat } from "@/lib/tax/tax-doc-mode";
// owner 2026-07-18 — shipment (sibling) rollup for the "ทำไมติดลบ" explainer.
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { getCustomsFxRates, fxRateMap } from "@/lib/admin/customs-fx";
// Live COST resolver (option A · ภูม/พี่ป๊อป 2026-06-18 "แบบ PCS forwarder.php —
// คำนวณต้นทุนสด") — reads the 144-cell tb_settings matrix the SAME way report-cnt
// does, so the panel shows ต้นทุน + กำไร immediately instead of only the
// report-cnt-stored fcosttotalprice (0 until the ตู้ "คิดเรท" runs).
import {
  resolveRowCost,
  costColumn,
  productTypeIdx,
  type WarehouseDigit,
  type CostTransport,
  type CostBasis,
  type CostRateSource,
  type ContainerRateRow,
} from "@/lib/forwarder/resolve-cost";
// Cost-reveal blur gate (owner ภูม 2026-06-16) — blur ต้นทุน by default; the eye
// in the header opens a PIN dialog to reveal.
import { CostRevealRegion, CostRevealToggle } from "@/components/admin/cost-reveal";

type DeclaredFxCols = {
  declared_currency: string | null;
  declared_fx_rate: number | string | null;
  declared_amount_ccy: number | string | null;
};

type FwdCostItem = {
  id: number;
  productname: string | null;
  producttracking: string | null;
  productqty: number | null;
  cost_unit_thb: number | string | null;
  cost_rate_cny: number | string | null;
  declared_value_thb: number | string | null;
  hs_code: string | null;
} & DeclaredFxCols;

type ShopCostItem = {
  id: number;
  ctitle: string | null;
  cnameshop: string | null;
  cimages: string | null;
  camount: number | null;
  cprice: number | string | null;
  cost_unit_cny: number | string | null;
  cost_rate_cny: number | string | null;
  declared_value_thb: number | string | null;
  hs_code: string | null;
} & DeclaredFxCols;

export async function ForwarderCostSection({
  fId,
  reforder,
}: {
  fId: number;
  /** tb_forwarder.reforder — when set, the lines live in tb_order (shop-spawn). */
  reforder: string | null;
}) {
  // 2026-06-18 (owner · mig 0189: super loses money-internal visibility) — only
  // ultra/accounting/pricing may SEE ต้นทุน at all. super/ops/warehouse and every
  // other role must NOT see cost → hide the whole section. (canViewCostProfit
  // EXCLUDES super, unlike hasRole which would grant super via isGodRole.)
  const roles = await getAdminRoles();
  const canEdit = canViewCostProfit(roles);
  if (!canEdit) return null;

  const admin = createAdminClient();

  // Prefer the shop-spawn source (tb_order · ¥ cost) when reforder is set —
  // mirrors FreightBreakdownTable's item-source choice so the cost grain
  // matches the line grain the page shows.
  const isShopSpawn = reforder != null && reforder.trim() !== "";

  let shopItems: ShopCostItem[] = [];
  let fwdItems: FwdCostItem[] = [];

  if (isShopSpawn) {
    const { data, error } = await admin
      .from("tb_order")
      .select(
        "id, ctitle, cnameshop, cimages, camount, cprice, " +
          "cost_unit_cny, cost_rate_cny, declared_value_thb, hs_code, " +
          "declared_currency, declared_fx_rate, declared_amount_ccy",
      )
      .eq("hno", reforder!.trim())
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[ForwarderCostSection tb_order]`, { code: error.code, message: error.message, hno: reforder });
    } else {
      shopItems = ((data ?? []) as unknown) as ShopCostItem[];
    }
  }

  if (!isShopSpawn || shopItems.length === 0) {
    const { data, error } = await admin
      .from("tb_forwarder_item")
      .select(
        "id, productname, producttracking, productqty, " +
          "cost_unit_thb, cost_rate_cny, declared_value_thb, hs_code, " +
          "declared_currency, declared_fx_rate, declared_amount_ccy",
      )
      .eq("fid", fId)
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[ForwarderCostSection tb_forwarder_item]`, { code: error.code, message: error.message, fid: fId });
    } else {
      fwdItems = ((data ?? []) as unknown) as FwdCostItem[];
    }
  }

  const usingShop = isShopSpawn && shopItems.length > 0;
  const lineCount = usingShop ? shopItems.length : fwdItems.length;

  // AUTO-FILL seeds (owner correction 2026-06-12) — job-by-job CONFIRMED real
  // numbers, not a global default. The cost yuan-rate default is the settings
  // fallback; the SHOP-spawn path overrides it with the source order's real
  // numbers (read below).
  const { data: settings, error: setErr } = await admin
    .from("tb_settings")
    .select("hratecostdefault")
    .limit(1)
    .maybeSingle<{ hratecostdefault: number | string | null }>();
  if (setErr) {
    console.error(`[ForwarderCostSection tb_settings]`, { code: setErr.code, message: setErr.message });
  }
  const rateDefault = Number(settings?.hratecostdefault ?? 0) || 0;
  // Customs FX rates (มูลค่าสำแดง ใบขน · mig 0179) — per-currency monthly rate map.
  const fxRates = fxRateMap(await getCustomsFxRates());
  // Σqty across the direct-forwarder lines — the prorate denominator for the
  // declared-value auto-seed (header cost split by each line's quantity share).
  const fwdTotalQty = fwdItems.reduce((sum, it) => sum + (Number(it.productqty ?? 0) || 0), 0);

  // SHOP-spawn path: pull the SOURCE order's ราคาซื้อจริงทั้งหมด (hcostall) +
  // อัตราแลกเปลี่ยนจริง (hratecost) so cost/unit ¥ + rate seed from the confirmed
  // real purchase, job-by-job (mirrors the shop-cost-section).
  let shopRealCostUnit = 0;
  let shopJobRate = rateDefault;
  if (usingShop) {
    const { data: hdr, error: hdrErr } = await admin
      .from("tb_header_order").select("hcostall, hratecost").eq("hno", reforder!.trim())
      .maybeSingle<{ hcostall: number | string | null; hratecost: number | string | null }>();
    if (hdrErr) console.error(`[ForwarderCostSection source tb_header_order]`, { code: hdrErr.code, message: hdrErr.message, hno: reforder });
    const realCostAll = Number(hdr?.hcostall ?? 0) || 0;
    shopJobRate = Number(hdr?.hratecost ?? 0) || rateDefault;
    const shopQty = shopItems.reduce((s, it) => s + (Number(it.camount ?? 0) || 0), 0);
    shopRealCostUnit = shopQty > 0 ? realCostAll / shopQty : 0;
  }

  // Resolve shop thumbnails (only the shop source has images).
  const thumbs: Record<number, string | null> = {};
  if (usingShop) {
    await Promise.all(
      shopItems.map(async (it) => {
        const first = it.cimages?.split(",")[0]?.trim();
        thumbs[it.id] = first
          ? first.startsWith("http")
            ? first
            : await resolveLegacyUrl(first, "cover")
          : null;
      }),
    );
  }

  // D-G2 (mig 0178) · forwarder header for the อากร/VAT roll-up: the saved duty +
  // the SELL net (7 sell buckets − discount, the xlsx "ราคาขายสุทธิ" base · pre-WHT).
  let importDutyPct: number | string | null = null;
  let importDutyThb: number | string | null = null;
  let sellNet = 0;
  // fcosttotalprice — the forwarder header COST total; the prorate numerator for
  // the direct-forwarder declared-value auto-seed (GAP 1). Has an authoritative
  // writer (the ไอแต้ม container-cost-sheet sync) — we only READ it here.
  let fCostTotal = 0;
  // The header row's cost dims (carrier × mode × type × city + kg/cbm) — used to
  // resolve the live matrix cost below. null until the header loads.
  let costDims: {
    fwarehousename: string | null;
    fwarehousechina: string | null;
    ftransporttype: string | null;
    fproductstype: string | null;
    fweight: number;
    fvolume: number;
  } | null = null;
  // The container this row sits in — the key to accounting's per-container cost
  // rate (tb_cost_container · tier 1 of the waterfall). Owner 2026-07-17.
  let costCabinet: string | null = null;
  // owner 2026-07-18 ("งานติดลบบางงานเรางงมาก เช่น 52197") — for a box-split shipment
  // the SELL is allocated per-tracking by one basis while the COST allocates by CBM,
  // so a light tracking can read NEGATIVE even though the WHOLE shipment is positive.
  // Fetch the shipment (sibling) rollup so the panel can explain instead of confuse.
  let rowTracking: string | null = null;
  let rowUserid: string | null = null;
  {
    const { data: hdr, error } = await admin
      .from("tb_forwarder")
      .select(
        "import_duty_pct, import_duty_thb, fcosttotalprice, ftotalprice, ftransportprice, fpriceupdate, " +
          "fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, " +
          "fwarehousename, fwarehousechina, ftransporttype, fproductstype, fweight, fvolume, " +
          "fcabinetnumber, ftrackingchn, userid",
      )
      .eq("id", fId)
      .maybeSingle<{
        import_duty_pct: number | string | null;
        import_duty_thb: number | string | null;
        fcosttotalprice: number | string | null;
        ftotalprice: number | string | null;
        ftransportprice: number | string | null;
        fpriceupdate: number | string | null;
        fshippingservice: number | string | null;
        pricecrate: number | string | null;
        ftransportpricechnthb: number | string | null;
        priceother: number | string | null;
        fdiscount: number | string | null;
        fwarehousename: string | null;
        fwarehousechina: string | null;
        ftransporttype: string | null;
        fproductstype: string | null;
        fweight: number | string | null;
        fvolume: number | string | null;
        fcabinetnumber: string | null;
        ftrackingchn: string | null;
        userid: string | null;
      }>();
    if (error) {
      console.error(`[ForwarderCostSection tb_forwarder header]`, { code: error.code, message: error.message, fid: fId });
    } else if (hdr) {
      rowTracking = (hdr.ftrackingchn ?? "").trim() || null;
      rowUserid = (hdr.userid ?? "").trim() || null;
      costCabinet = (hdr.fcabinetnumber ?? "").trim() || null;
      importDutyPct = (hdr.import_duty_pct as number | string | null) ?? null;
      importDutyThb = (hdr.import_duty_thb as number | string | null) ?? null;
      const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
      fCostTotal = n(hdr.fcosttotalprice);
      sellNet = Math.max(
        0,
        n(hdr.ftotalprice) + n(hdr.ftransportprice) + n(hdr.fpriceupdate) +
          n(hdr.fshippingservice) + n(hdr.pricecrate) + n(hdr.ftransportpricechnthb) +
          n(hdr.priceother) - n(hdr.fdiscount),
      );
      costDims = {
        fwarehousename: hdr.fwarehousename,
        fwarehousechina: hdr.fwarehousechina,
        ftransporttype: hdr.ftransporttype,
        fproductstype: hdr.fproductstype,
        fweight: n(hdr.fweight),
        fvolume: n(hdr.fvolume),
      };
    }
  }

  // ── Live COST via the documented waterfall (resolve-cost.ts) ──
  // TIER 1 = tb_cost_container (the rate accounting types at ตรวจตู้ for THIS
  // container) · TIER 2 = the tb_settings carrier×mode×type×city default. The
  // accountant always wins. Compute ต้นทุน = round2(dimension × rate) via the
  // shared resolver (mirrors report-cnt, which owns the write).
  //
  // 🔴 Owner 2026-07-17 ("บัญชีก็ตั้งต้นทุนตู้ตอนตรวจตู้เป็น 4700 แล้ว ระบบก็ไม่เห็น
  // ดึงมาใช้เลยครับ"): tier 1 was missing here — the panel read tb_settings only
  // and reported the global MOMO default (2,500) as "เรทระบบ" for containers
  // accounting had rated 4,700, contradicting the cost actually booked.
  let liveCost = 0;
  let liveCostRate = 0;
  let liveCostBasis: CostBasis = "cbm";
  let liveCostDim = 0;
  let liveCostCol: string | null = null;
  let liveCostSource: CostRateSource = "none";
  if (costDims) {
    const wh = (costDims.fwarehousename ?? "") as WarehouseDigit;
    const transport: CostTransport = costDims.ftransporttype === "2" ? "2" : "1";
    liveCostCol = ["1", "2", "3", "4", "5", "6", "7", "8"].includes(wh)
      ? costColumn(wh, productTypeIdx(costDims.fproductstype), transport, costDims.fwarehousechina ?? "")
      : null;

    // TIER 1 — accounting's per-container rate. Fetched independently of the
    // settings cell: a rated container must resolve even when the global default
    // cell is unset (0), which is exactly the "never guess a rate" fallback case.
    let ccRow: ContainerRateRow | null = null;
    if (costCabinet) {
      const { data: cc, error: ccErr } = await admin
        .from("tb_cost_container")
        .select("fproductstype1, fproductstype2, fproductstype3, fproductstype4")
        .eq("fcabinetnumber", costCabinet)
        .maybeSingle<ContainerRateRow>();
      if (ccErr) {
        // Fail SOFT to tier 2 — never block the panel, but say so loudly: a
        // silent miss here is what made the panel quote the wrong rate.
        console.error(`[ForwarderCostSection tb_cost_container]`, { code: ccErr.code, message: ccErr.message, cabinet: costCabinet });
      } else {
        ccRow = cc ?? null;
      }
    }

    // TIER 2 — the global default cell (fallback only).
    let cs: Record<string, number | string | null> | null = null;
    if (liveCostCol) {
      const { data, error } = await admin
        .from("tb_settings")
        .select(liveCostCol)
        .eq("id", 1)
        .maybeSingle<Record<string, number | string | null>>();
      if (error) {
        console.error(`[ForwarderCostSection tb_settings cost]`, { code: error.code, message: error.message, col: liveCostCol });
      }
      cs = data ?? null;
    }

    const rc = resolveRowCost(costDims, cs ?? {}, ccRow);
    liveCost = rc.cost;
    liveCostRate = rc.rate;
    liveCostBasis = rc.basis;
    liveCostDim = rc.dimension;
    liveCostSource = rc.source;
  }
  // displayCost precedence (review 2026-06-18 · two reviewers flagged): the live
  // matrix figure uses the carrier-DEFAULT basis. A container that was MANUALLY
  // custom-rated (report-cnt "คิดเรท" with a non-default basis) stores a
  // fcosttotalprice that accounting/PEAK actually books — and it can DISAGREE
  // with the live default-basis figure. When both exist and disagree > ฿0.01,
  // PREFER the stored (accounting-authoritative) value + surface a reconcile note,
  // so the displayed กำไร never silently contradicts the booked cost.
  const costDiverged = liveCost > 0 && fCostTotal > 0 && Math.abs(liveCost - fCostTotal) > 0.01;
  const displayCost = costDiverged ? fCostTotal : liveCost > 0 ? liveCost : fCostTotal;

  // ── owner 2026-07-18 — SHIPMENT rollup (the "ทำไมงานนี้ติดลบ" explainer · #52197) ──
  // A box-split shipment allocates SELL per-tracking by one basis (e.g. น้ำหนัก) while
  // COST allocates by CBM → a light-but-bulky tracking reads NEGATIVE per-row even
  // though the WHOLE shipment is profitable. Aggregate the siblings (same base
  // tracking + same customer · non-cancelled) so the panel can show the shipment
  // truth next to the per-row figure. READ-ONLY · display only.
  let shipmentAgg: { count: number; sell: number; cost: number } | null = null;
  const shipBase = baseTracking(rowTracking);
  if (shipBase && rowUserid) {
    const { data: sibs, error: sibErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, ftotalprice, fcosttotalprice")
      .eq("userid", rowUserid)
      .neq("fstatus", "99")
      .like("ftrackingchn", `${shipBase}%`)
      .limit(200);
    if (sibErr) {
      console.error(`[ForwarderCostSection siblings]`, { code: sibErr.code, message: sibErr.message, fid: fId });
    } else {
      const members = (sibs ?? []).filter(
        (s) => baseTracking((s as { ftrackingchn: string | null }).ftrackingchn) === shipBase,
      ) as Array<{ id: number; ftotalprice: number | string | null; fcosttotalprice: number | string | null }>;
      if (members.length > 1) {
        const num = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
        shipmentAgg = {
          count: members.length,
          sell: members.reduce((s, m) => s + num(m.ftotalprice), 0),
          cost: members.reduce((s, m) => s + num(m.fcosttotalprice), 0),
        };
      }
    }
  }
  // DIRECT-forwarder (THB cost) cost/unit seed = the header cost total ÷ Σqty
  // (fcosttotalprice is now resolved). Owner correction 2026-06-12.
  const fwdRealCostUnit = fwdTotalQty > 0 ? fCostTotal / fwdTotalQty : 0;

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm overflow-hidden">
      {/* Collapsible (ปอน 2026-06-12) — default-OPEN (ภูม 2026-07-10 "ต้นทุน+กำไร
          ต้องเห็นเลยแบบ PCS · ไม่ใช่ซ่อน") so the ต้นทุน + กำไร blocks read together
          with the sell breakdown like the legacy ราคานำเข้าจีน-ไทย box. The ต้นทุน
          numbers stay PIN-blurred (CostRevealRegion · owner 2026-06-16). Native
          <details>/<summary> keeps this a Server Component (no client JS). */}
      <details className="group" open>
      <summary className="bg-emerald-600 text-white px-4 py-2.5 flex items-center gap-2 flex-wrap cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-base">💲</span>
        <h2 className="text-sm font-bold">ต้นทุน + มูลค่าสำแดง (Pricing · ใบขน)</h2>
        {lineCount > 0 && (
          <span className="text-[11px] font-medium opacity-90">({lineCount} รายการ)</span>
        )}
        <CostRevealToggle className="ml-auto" />
        <span className="text-[11px] bg-white/20 rounded px-1.5 py-0.5">
          ultra / accounting / pricing
        </span>
        <svg className="w-4 h-4 shrink-0 transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>

      <div className="p-3 sm:p-4 space-y-3">
        <p className="text-[11px] text-muted leading-relaxed">
          ข้อมูล <b>ภายในบริษัท</b> สำหรับ PEAK (ต้นทุน) + ใบขน (มูลค่าสำแดง) — 1 ใน 3 ตัวเลขของโมเดล
          ใบกำกับภาษี (ขาย · ต้นทุน · สำแดง). <b>ไม่กระทบราคาขายลูกค้า · ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือนลูกค้า.</b>
        </p>

        {/* Blur gate (owner ภูม 2026-06-16) — all cost data below is blurred
            until the PIN is entered via the eye in the header. */}
        <CostRevealRegion className="space-y-3">

        {/* GAP 9 (2026-06-12) — รายรับ/รายจ่าย/กำไร at a glance. ขาย = the
            forwarder NET grand-total (pre-WHT) · ต้นทุน = fcosttotalprice (was a
            DEAD-READ — never rendered before) · กำไร = ขาย − ต้นทุน. Display-only
            internal figure (VAT-on-margin = กำไร × 7%, the legacy staff number).
            Shown to cost-capable roles only. */}
        {canEdit && (
          <ForwarderProfitPanel
            sellNet={sellNet}
            costTotal={displayCost}
            liveCost={liveCost}
            liveRate={liveCostRate}
            liveBasis={liveCostBasis}
            liveDimension={liveCostDim}
            liveSource={liveCostSource}
            storedCost={fCostTotal}
            costDiverged={costDiverged}
            shipmentAgg={shipmentAgg}
          />
        )}

        {/* D-G2 · อากรขาเข้า + ราคารวม VAT (the xlsx SELL-block, per shipment) */}
        {canEdit && (
          <ForwarderImportDutyEditor
            id={fId}
            sellNet={sellNet}
            importDutyPct={importDutyPct}
            importDutyThb={importDutyThb}
          />
        )}

        {lineCount === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface-alt/30 px-3 py-6 text-center text-[11px] text-muted">
            ยังไม่มีรายการสินค้าในออเดอร์นี้ — บันทึกต้นทุนได้เมื่อมีรายการแล้ว
          </p>
        )}

        {usingShop
          ? shopItems.map((it, idx) => (
              <CostLineCard
                key={`shop-${it.id}`}
                index={idx + 1}
                title={it.ctitle}
                subtitle={it.cnameshop}
                thumb={thumbs[it.id]}
              >
                {canEdit ? (
                  <ShopOrderItemCostEditor
                    orderId={it.id}
                    costUnitCny={it.cost_unit_cny}
                    costRateCny={it.cost_rate_cny}
                    declaredValueThb={it.declared_value_thb}
                    hsCode={it.hs_code}
                    autoCostUnit={autoOrNull(shopRealCostUnit)}
                    autoCostRate={autoOrNull(shopJobRate)}
                    autoDeclared={autoOrNull(
                      shopAutoDeclaredThb(shopRealCostUnit, shopJobRate, it.camount),
                    )}
                    declaredCurrency={it.declared_currency}
                    declaredFxRate={it.declared_fx_rate}
                    declaredAmountCcy={it.declared_amount_ccy}
                    fxRates={fxRates}
                  />
                ) : (
                  <CargoCostLineSummary
                    costUnit={it.cost_unit_cny}
                    costUnitIsCny
                    costRateCny={it.cost_rate_cny}
                    declaredValueThb={it.declared_value_thb}
                    hsCode={it.hs_code}
                  />
                )}
              </CostLineCard>
            ))
          : fwdItems.map((it, idx) => (
              <CostLineCard
                key={`fwd-${it.id}`}
                index={idx + 1}
                title={it.productname}
                subtitle={it.producttracking ? `Tracking: ${it.producttracking}` : null}
                thumb={null}
              >
                {canEdit ? (
                  <ForwarderItemCostEditor
                    itemId={it.id}
                    costUnitThb={it.cost_unit_thb}
                    costRateCny={it.cost_rate_cny}
                    declaredValueThb={it.declared_value_thb}
                    hsCode={it.hs_code}
                    autoCostUnit={autoOrNull(fwdRealCostUnit)}
                    autoCostRate={autoOrNull(rateDefault)}
                    autoDeclared={autoOrNull(
                      importAutoDeclaredThb(fCostTotal, it.productqty, fwdTotalQty),
                    )}
                    declaredCurrency={it.declared_currency}
                    declaredFxRate={it.declared_fx_rate}
                    declaredAmountCcy={it.declared_amount_ccy}
                    fxRates={fxRates}
                  />
                ) : (
                  <CargoCostLineSummary
                    costUnit={it.cost_unit_thb}
                    costUnitIsCny={false}
                    costRateCny={it.cost_rate_cny}
                    declaredValueThb={it.declared_value_thb}
                    hsCode={it.hs_code}
                  />
                )}
              </CostLineCard>
            ))}
        </CostRevealRegion>
      </div>
      </details>
    </section>
  );
}

/** One line card: thumbnail + title header, then the cost editor/summary. */
function CostLineCard({
  index,
  title,
  subtitle,
  thumb,
  children,
}: {
  index: number;
  title: string | null;
  subtitle: string | null;
  thumb: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-mono text-muted">
          {index}
        </span>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-9 w-9 flex-shrink-0 rounded border border-border object-cover" />
        ) : (
          <span className="h-9 w-9 flex-shrink-0 rounded border border-dashed border-border bg-surface-alt/30" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium break-words line-clamp-2">{title || "—"}</p>
          {subtitle && <p className="text-[11px] text-muted truncate">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * GAP 9 (2026-06-12) — รายรับ/รายจ่าย/กำไร summary for the forwarder order.
 * SELLING = the NET grand-total (pre-WHT) · COST = fcosttotalprice (the header
 * cost total — previously a dead-read) · PROFIT = SELLING − COST · VAT-on-margin
 * = PROFIT × 7% (the legacy NON-VAT staff figure · function.php — NEVER a
 * customer charge). DISPLAY-ONLY · no mutation. Renders a neutral note when
 * cost hasn't been captured yet (so profit isn't shown as if it were the full
 * selling price).
 */
function ForwarderProfitPanel({
  sellNet,
  costTotal,
  liveCost,
  liveRate,
  liveBasis,
  liveDimension,
  liveSource,
  storedCost,
  costDiverged,
  shipmentAgg = null,
}: {
  sellNet: number;
  costTotal: number;
  /** matrix-computed cost (round2(dimension × rate)) · 0 = rate cell unset */
  liveCost: number;
  /** the 144-cell matrix rate used */
  liveRate: number;
  /** "weight" → คิดตามน้ำหนัก · "cbm" → คิดตามปริมาตร */
  liveBasis: CostBasis;
  /** the dimension multiplied (kg or cbm) */
  liveDimension: number;
  /** which waterfall tier produced liveRate — "container" = accounting's ตรวจตู้ rate */
  liveSource: CostRateSource;
  /** report-cnt-stored fcosttotalprice (accounting-authoritative) */
  storedCost: number;
  /** live (matrix-default) ≠ stored (custom-rated/booked) by > ฿0.01 */
  costDiverged: boolean;
  /** owner 2026-07-18 — sibling-shipment rollup (null = single-tracking shipment).
   *  Explains a per-row negative on a box-split shipment (#52197): SELL splits by
   *  one basis, COST by CBM → per-row can be red while the SHIPMENT is green. */
  shipmentAgg?: { count: number; sell: number; cost: number } | null;
}) {
  // 2026-06-18 (ภูม/พี่ป๊อป "ให้เหมือน PCS เป๊ะ" · option A) — ต้นทุน computed LIVE
  // from the 144-cell matrix (เรท × คิว/กก. · like PCS forwarder.php) · กำไร =
  // ขายสุทธิ − ต้นทุน. Display-only · internal. Falls back to the report-cnt-stored
  // cost when the matrix cell is unset.
  const baht = (n: number) =>
    `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
  const nf = (n: number, dp: number) => n.toLocaleString("th-TH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const hasCost = Number.isFinite(costTotal) && costTotal > 0;
  const profit = hasCost ? sellNet - costTotal : 0;
  const marginVat = computeMarginVat(profit); // GAP 8 — canonical 7%-on-margin helper
  // costTotal = displayCost: the live figure unless it diverges from a stored
  // (booked) cost, in which case the stored value wins. The live line labels its
  // OWN source via `liveSource` (container vs settings) — owner 2026-07-17.
  const usingStored = hasCost && (costDiverged || (liveCost <= 0 && storedCost > 0));
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10 p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-800 mb-2">
        <span aria-hidden>📊</span> รายรับ · รายจ่าย · กำไร (ภายใน)
      </div>
      <div className="grid gap-4 sm:grid-cols-2 text-[11px] font-mono tabular-nums">
        {/* ── ต้นทุน (PCS left-bottom block · live matrix compute) ── */}
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground font-sans">ต้นทุน</p>
          {liveCost > 0 && (
            <p className="text-muted">
              คิดตาม{liveBasis === "weight" ? "น้ำหนัก" : "ปริมาตร"} {nf(liveDimension, liveBasis === "weight" ? 2 : 5)} x {nf(liveRate, 0)} = <strong className="text-foreground">{baht(liveCost)}</strong>
              {/* Owner 2026-07-17 "นายดึงเรทไหนมาคำนวณนะครับ" — always name the
                  rate's source, so the number can be traced without reading code. */}
              {liveSource === "container"
                ? " (เรทที่บัญชีตั้งไว้ต่อตู้)"
                : " (เรทระบบหลัก · บัญชียังไม่ตั้งเรทตู้นี้)"}
            </p>
          )}
          <p>ต้นทุน ส่วนลด : {baht(0)}</p>
          <p>ต้นทุน เพิ่ม/ลด เงิน : {baht(0)}</p>
          <p>ราคาต้นทุน : <strong>{hasCost ? baht(costTotal) : "— ยังไม่ตั้งเรทต้นทุน"}</strong></p>
          <p className="inline-flex items-center gap-1 rounded bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-medium mt-0.5">
            ระบบเลือกต้นทุนโดย{" "}
            {usingStored
              ? "ต้นทุนที่บันทึก (ตู้)"
              : liveSource === "container"
                ? "เรทที่บัญชีตั้งไว้ต่อตู้"
                : "เรทต้นทุนระบบหลัก"}
          </p>
          {costDiverged && (
            /* With the container tier wired (owner 2026-07-17), a divergence is no
               longer "we read the wrong table" — it means the stored cost is STALE
               (rate/dims changed after ตรวจตู้) or was rated on a non-default basis.
               Say which, so accounting knows whether to re-run คิดเรท. */
            <p className="text-[11px] text-amber-700">
              ⚠ คำนวณสด {baht(liveCost)} ({liveSource === "container" ? "เรทตู้ที่บัญชีตั้ง" : "เรทระบบหลัก"}) ≠ ต้นทุนที่บันทึก {baht(storedCost)} — บัญชีใช้ตัวที่บันทึก
              {liveSource === "container" && " · เรทตรงกันแล้วแต่ยอดไม่ตรง = ตัวเลขที่บันทึกเก่า (กด “คิดเรท” ที่รายการตู้ใหม่)"}
            </p>
          )}
        </div>
        {/* ── กำไร (PCS middle block) ── */}
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground font-sans">กำไร</p>
          <p>ยอดขายสุทธิ : <strong>{baht(sellNet)}</strong></p>
          <p>กำไรค่าขนส่งจีน-ไทย : {hasCost ? baht(profit) : "—"}</p>
          <p>กำไรค่าบริการ : {baht(0)}</p>
          <p>กำไร เพิ่ม/ลด เงิน : {baht(0)}</p>
          <p className="border-t border-indigo-200 pt-0.5 mt-0.5 font-bold font-sans">
            กำไรสุทธิ : <strong className={`font-mono ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>{hasCost ? baht(profit) : "—"}</strong>
          </p>
          {hasCost && <p className="text-[11px] text-muted">VAT ณ กำไร 7% (ภายใน) : {baht(marginVat)}</p>}
        </div>
      </div>
      {/* owner 2026-07-18 "งานติดลบบางงานเรางงมาก เช่น 52197 โดนบ่นตาย" — a box-split
          shipment splits the SELL per-tracking by basis (เช่น น้ำหนัก) while COST splits
          by CBM → a light-but-bulky tracking reads red per-row even when the WHOLE
          shipment earns. Show the shipment truth right here so no one panics. */}
      {shipmentAgg && (() => {
        const shipProfit = shipmentAgg.sell - shipmentAgg.cost;
        return (
          <div className={`mt-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${shipProfit >= 0 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-800"}`}>
            <b>🧾 กำไรคิดทั้งชิปเม้น ({shipmentAgg.count} แทรค):</b>{" "}
            ค่านำเข้ารวม {baht(shipmentAgg.sell)} − ต้นทุนรวม {baht(shipmentAgg.cost)} ={" "}
            <strong className="font-mono">{shipProfit >= 0 ? "+" : ""}{baht(shipProfit)}</strong>
            {profit < 0 && shipProfit >= 0 && (
              <span className="block mt-0.5">
                แทรคนี้ติดลบเพราะเป็น<b>การแบ่งภายในชิปเม้น</b> (ยอดขายแบ่งตามน้ำหนัก · ต้นทุนแบ่งตามคิว)
                — เงินจริงดูที่ยอดชิปเม้นด้านบน ไม่ได้ขาดทุนจริง
              </span>
            )}
          </div>
        );
      })()}
      {!hasCost && (
        <p className="mt-1.5 text-[11px] text-amber-700">
          ⚠ ยังไม่มีเรทต้นทุนสำหรับขนส่ง/โหมด/ประเภทนี้ — ตั้งเรทที่ <span className="font-medium">ตั้งค่า › เรทต้นทุนนำเข้า</span> (/admin/settings/forwarder-costs) แล้วต้นทุน + กำไรจะคำนวณเอง
        </p>
      )}
    </div>
  );
}
