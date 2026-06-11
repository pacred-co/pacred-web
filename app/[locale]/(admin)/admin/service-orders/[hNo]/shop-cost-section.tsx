/**
 * <ShopOrderCostSection> — per-line COST + DECLARED capture on the shop-order
 * (ฝากสั่งซื้อ) detail page (P2 · tax-invoice platform · the `pricing` role).
 *
 * Async server component: loads the order's tb_order lines WITH the new cost
 * columns (migration 0158 · gap #1: tb_order had only `cprice` = SELLING; this
 * captures cost_unit_cny = what we paid the supplier) and renders the client
 * cost editor (super/accounting/pricing) or a read-only summary per line.
 *
 * ⚠️ ISOLATION (AGENTS.md §0e): this section is wholly separate from the shop
 * selling-price / quote-save flow (adminSaveShopOrderItemsAndQuote). It only
 * surfaces the cost action (ShopOrderItemCostEditor → setShopOrderItemCost),
 * which writes ONLY the per-line cost+declared columns. It never recomputes the
 * selling price (hTotalPriceUser etc), changes hStatus, or notifies the customer.
 *
 * §0c: every Supabase read destructures `error`. §0d: reachable inline on the
 * shop-order detail page.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles, hasRole } from "@/lib/auth/require-admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import {
  ShopOrderItemCostEditor,
  CargoCostLineSummary,
} from "@/components/admin/cargo-cost-line-editor";
import { autoOrNull, shopAutoDeclaredThb } from "@/lib/forwarder/cargo-cost-autofill";

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

export async function ShopOrderCostSection({ hno }: { hno: string }) {
  const roles = await getAdminRoles();
  const canEdit = roles != null && hasRole(roles, ["accounting", "pricing"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_order")
    .select(
      "id, ctitle, cnameshop, cimages, camount, cprice, " +
        "cost_unit_cny, cost_rate_cny, declared_value_thb, hs_code",
    )
    .eq("hno", hno)
    .order("id", { ascending: true })
    .limit(500);
  if (error) {
    console.error(`[ShopOrderCostSection tb_order]`, { code: error.code, message: error.message, hno });
  }
  const items = ((data ?? []) as unknown) as ShopCostItem[];

  // GAP 1 auto-fill — the cost yuan-rate seed (tb_settings is single-row).
  const { data: settings, error: setErr } = await admin
    .from("tb_settings")
    .select("hratecostdefault")
    .limit(1)
    .maybeSingle<{ hratecostdefault: number | string | null }>();
  if (setErr) {
    console.error(`[ShopOrderCostSection tb_settings]`, { code: setErr.code, message: setErr.message });
  }
  const costRate = Number(settings?.hratecostdefault ?? 0) || 0;

  // Resolve thumbnails in parallel.
  const thumbs: Record<number, string | null> = {};
  await Promise.all(
    items.map(async (it) => {
      const first = it.cimages?.split(",")[0]?.trim();
      thumbs[it.id] = first
        ? first.startsWith("http")
          ? first
          : await resolveLegacyUrl(first, "cover").catch(() => null)
        : null;
    }),
  );

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm overflow-hidden">
      <header className="bg-emerald-600 text-white px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-base">💲</span>
        <h2 className="text-sm font-bold">ต้นทุน + มูลค่าสำแดง (Pricing · ใบขน)</h2>
        {items.length > 0 && (
          <span className="text-[11px] font-medium opacity-90">({items.length} รายการ)</span>
        )}
        <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">
          {canEdit ? "super / accounting / pricing" : "อ่านอย่างเดียว"}
        </span>
      </header>

      <div className="p-3 sm:p-4 space-y-3">
        <p className="text-[11px] text-muted leading-relaxed">
          ข้อมูล <b>ภายในบริษัท</b> สำหรับ PEAK (ต้นทุน ¥ ที่จ่ายซัพพลายเออร์) + ใบขน (มูลค่าสำแดง) —
          1 ใน 3 ตัวเลขของโมเดลใบกำกับภาษี (ขาย · ต้นทุน · สำแดง). <b>ไม่กระทบราคาขายลูกค้า ·
          ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือนลูกค้า.</b>
        </p>

        {items.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface-alt/30 px-3 py-6 text-center text-[11px] text-muted">
            ไม่พบรายการสินค้าในออเดอร์นี้
          </p>
        )}

        {items.map((it, idx) => (
          <div
            key={it.id}
            className="rounded-xl border border-border bg-white dark:bg-surface p-2.5 space-y-2"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt text-[10px] font-mono text-muted">
                {idx + 1}
              </span>
              {thumbs[it.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[it.id]!} alt="" className="h-9 w-9 flex-shrink-0 rounded border border-border object-cover" />
              ) : (
                <span className="h-9 w-9 flex-shrink-0 rounded border border-dashed border-border bg-surface-alt/30" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium break-words line-clamp-2">{it.ctitle || "—"}</p>
                <p className="text-[10px] text-muted truncate">
                  {it.cnameshop ? `ร้าน: ${it.cnameshop} · ` : ""}จำนวน {Number(it.camount ?? 0)} · ขาย ¥{Number(it.cprice ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {canEdit ? (
              <ShopOrderItemCostEditor
                orderId={it.id}
                costUnitCny={it.cost_unit_cny}
                costRateCny={it.cost_rate_cny}
                declaredValueThb={it.declared_value_thb}
                hsCode={it.hs_code}
                autoCostUnit={autoOrNull(Number(it.cprice ?? 0))}
                autoCostRate={autoOrNull(costRate)}
                autoDeclared={autoOrNull(
                  shopAutoDeclaredThb(it.cprice, costRate, it.camount),
                )}
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
          </div>
        ))}
      </div>
    </section>
  );
}
