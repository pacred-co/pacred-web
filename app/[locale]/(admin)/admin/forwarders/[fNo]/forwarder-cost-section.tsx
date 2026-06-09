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
} from "@/components/admin/cargo-cost-line-editor";

type FwdCostItem = {
  id: number;
  productname: string | null;
  producttracking: string | null;
  productqty: number | null;
  cost_unit_thb: number | string | null;
  cost_rate_cny: number | string | null;
  declared_value_thb: number | string | null;
  hs_code: string | null;
};

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
};

export async function ForwarderCostSection({
  fId,
  reforder,
}: {
  fId: number;
  /** tb_forwarder.reforder — when set, the lines live in tb_order (shop-spawn). */
  reforder: string | null;
}) {
  // Only super / accounting / pricing may capture cost; others see read-only.
  const roles = await getAdminRoles();
  const canEdit = roles != null && hasRole(roles, ["accounting", "pricing"]);

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
          "cost_unit_cny, cost_rate_cny, declared_value_thb, hs_code",
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
          "cost_unit_thb, cost_rate_cny, declared_value_thb, hs_code",
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

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm overflow-hidden">
      <header className="bg-emerald-600 text-white px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-base">💲</span>
        <h2 className="text-sm font-bold">ต้นทุน + มูลค่าสำแดง (Pricing · ใบขน)</h2>
        {lineCount > 0 && (
          <span className="text-[11px] font-medium opacity-90">({lineCount} รายการ)</span>
        )}
        <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">
          {canEdit ? "super / accounting / pricing" : "อ่านอย่างเดียว"}
        </span>
      </header>

      <div className="p-3 sm:p-4 space-y-3">
        <p className="text-[11px] text-muted leading-relaxed">
          ข้อมูล <b>ภายในบริษัท</b> สำหรับ PEAK (ต้นทุน) + ใบขน (มูลค่าสำแดง) — 1 ใน 3 ตัวเลขของโมเดล
          ใบกำกับภาษี (ขาย · ต้นทุน · สำแดง). <b>ไม่กระทบราคาขายลูกค้า · ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือนลูกค้า.</b>
        </p>

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
