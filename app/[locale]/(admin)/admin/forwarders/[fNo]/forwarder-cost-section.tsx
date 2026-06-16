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
import { getAdminRoles, hasRole } from "@/lib/auth/require-admin";
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
import { getCustomsFxRates, fxRateMap } from "@/lib/admin/customs-fx";

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
  // 2026-06-15 (owner: "พนักงานไม่ควรเห็นต้นทุน") — only super/accounting/pricing
  // may SEE ต้นทุน at all (hasRole grants super). Every other role that reaches
  // this page (ops/warehouse for scan/tracking) must NOT see cost → hide the
  // whole section. (Was: non-edit roles fell through to CargoCostLineSummary,
  // which PRINTED the cost number — the warehouse leak.)
  const roles = await getAdminRoles();
  const canEdit = roles != null && hasRole(roles, ["accounting", "pricing"]);
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
  {
    const { data: hdr, error } = await admin
      .from("tb_forwarder")
      .select(
        "import_duty_pct, import_duty_thb, fcosttotalprice, ftotalprice, ftransportprice, fpriceupdate, " +
          "fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount",
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
      }>();
    if (error) {
      console.error(`[ForwarderCostSection tb_forwarder header]`, { code: error.code, message: error.message, fid: fId });
    } else if (hdr) {
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
    }
  }
  // DIRECT-forwarder (THB cost) cost/unit seed = the header cost total ÷ Σqty
  // (fcosttotalprice is now resolved). Owner correction 2026-06-12.
  const fwdRealCostUnit = fwdTotalQty > 0 ? fCostTotal / fwdTotalQty : 0;

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm overflow-hidden">
      {/* Collapsible (ปอน 2026-06-12) — default-folded: only the green bar shows;
          click it to expand. Native <details>/<summary> keeps this a Server
          Component (no client JS needed). */}
      <details className="group">
      <summary className="bg-emerald-600 text-white px-4 py-2.5 flex items-center gap-2 flex-wrap cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-base">💲</span>
        <h2 className="text-sm font-bold">ต้นทุน + มูลค่าสำแดง (Pricing · ใบขน)</h2>
        {lineCount > 0 && (
          <span className="text-[11px] font-medium opacity-90">({lineCount} รายการ)</span>
        )}
        <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">
          {canEdit ? "super / accounting / pricing" : "อ่านอย่างเดียว"}
        </span>
        <svg className="w-4 h-4 shrink-0 transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>

      <div className="p-3 sm:p-4 space-y-3">
        <p className="text-[11px] text-muted leading-relaxed">
          ข้อมูล <b>ภายในบริษัท</b> สำหรับ PEAK (ต้นทุน) + ใบขน (มูลค่าสำแดง) — 1 ใน 3 ตัวเลขของโมเดล
          ใบกำกับภาษี (ขาย · ต้นทุน · สำแดง). <b>ไม่กระทบราคาขายลูกค้า · ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือนลูกค้า.</b>
        </p>

        {/* GAP 9 (2026-06-12) — รายรับ/รายจ่าย/กำไร at a glance. ขาย = the
            forwarder NET grand-total (pre-WHT) · ต้นทุน = fcosttotalprice (was a
            DEAD-READ — never rendered before) · กำไร = ขาย − ต้นทุน. Display-only
            internal figure (VAT-on-margin = กำไร × 7%, the legacy staff number).
            Shown to cost-capable roles only. */}
        {canEdit && (
          <ForwarderProfitPanel sellNet={sellNet} costTotal={fCostTotal} />
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
        <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt text-[10px] font-mono text-muted">
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
          {subtitle && <p className="text-[10px] text-muted truncate">{subtitle}</p>}
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
function ForwarderProfitPanel({ sellNet, costTotal }: { sellNet: number; costTotal: number }) {
  const fmt = (n: number) =>
    n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasCost = Number.isFinite(costTotal) && costTotal > 0;
  const profit = hasCost ? sellNet - costTotal : 0;
  const marginVat = computeMarginVat(profit); // GAP 8 — canonical 7%-on-margin helper
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10 p-2.5">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-800">
        <span aria-hidden>📊</span> รายรับ · รายจ่าย · กำไร (ภายใน)
      </div>
      <dl className="mt-1.5 space-y-0.5 text-[11px]">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted">ยอดขายสุทธิ (รายรับ ฿)</dt>
          <dd className="tabular-nums font-medium">{fmt(sellNet)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted">ต้นทุนรวม (รายจ่าย ฿)</dt>
          <dd className="tabular-nums">{hasCost ? fmt(costTotal) : "— ยังไม่บันทึก"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-indigo-200 pt-0.5 font-bold">
          <dt className="text-indigo-900">กำไรสุทธิ (฿)</dt>
          <dd className={`tabular-nums ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>
            {hasCost ? fmt(profit) : "—"}
          </dd>
        </div>
        {hasCost && (
          <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted">
            <dt>VAT ณ กำไร 7% (ตัวเลขภายใน)</dt>
            <dd className="tabular-nums">{fmt(marginVat)}</dd>
          </div>
        )}
      </dl>
      {!hasCost && (
        <p className="mt-1 text-[10px] text-amber-700">
          ⚠ ยังไม่ได้บันทึกต้นทุน — บันทึกต้นทุนต่อรายการด้านล่างเพื่อให้คำนวณกำไรได้
        </p>
      )}
    </div>
  );
}
