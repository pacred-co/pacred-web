/**
 * <FreightBreakdownTable> — รายการสินค้า + freight breakdown (combined).
 *
 * 2026-06-05 PM (ภูม flag round 2): "ตารางรายการสินค้าด้านบนมีรายการเดียว
 * ทั้งๆที่จริงๆมี 3 รายการ" + "ตารางรายการสินค้า (3) ด้านล่างไม่ต้องใช้แล้ว
 * เพราะตามpcs มันก็ไม่มี ลบออก". So this single component now:
 *   1. Renders N per-item rows (from tb_order if shop-spawned · or
 *      tb_forwarder_item if admin-direct · in ¥ pricing matching the customer's
 *      source).
 *   2. Renders ONE freight-breakdown footer row (from tb_forwarder header
 *      · in ฿ · matching legacy `forwarder/detail.php` L385-440 16-col layout)
 *      WHT 1% applied if juristic ≥ ฿1000 (legacy L374).
 *
 * The standalone <ForwarderItemsTable> below it on /edit was removed (ภูม:
 * legacy doesn't have it).
 *
 * Async server component — fetches items inline.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
// next/image not used — Taobao/alicdn thumbnails arrive as plain HTTP
// URLs and don't need optimisation here · plain <img> keeps it simple.

type ShopOrderItem = {
  id: number;
  ctitle: string | null;
  curl: string | null;
  cnameshop: string | null;
  cprovider: string | null;
  cimages: string | null;
  cprice: number | string | null;
  cshippingchn: number | string | null;
  cpriceupdate: number | string | null;
  camount: number | null;
  ccolor: string | null;
  csize: string | null;
};

type FwdItem = {
  id: number;
  productname: string | null;
  producttracking: string | null;
  productqty: number | null;
  productweightall: number | string | null;
  productcbmall: number | string | null;
  chinawoodencratefee: number | string | null;
};

type Props = {
  r: {
    id: number;
    reforder: string | null;
    fdetail: string | null;
    fproductstype: string | null;
    famount: number | null;
    fweight: number | string | null;
    fvolume: number | string | null;
    frefprice: string | null;
    frefrate: number | string | null;
    ftotalprice: number | string | null;
    fpriceupdate: number | string | null;
    pricecrate: number | string | null;
    ftransportpricechnthb: number | string | null;
    ftransportprice: number | string | null;
    fshippingservice: number | string | null;
    priceother: number | string | null;
    fdiscount: number | string | null;
  };
  isJuristic: boolean;
};

// Legacy nameProductsType — function.php L1196-1208
const PRODUCT_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป",
  "2": "มอก.",
  "3": "อย.",
  "4": "พิเศษ",
  "5": "ควบคุมพิเศษ",
};

// Legacy nameRefPrice — value matches what /edit form writes
const REF_PRICE_LABEL: Record<string, string> = {
  "1": "น้ำหนัก",
  "2": "ปริมาตร",
  "3": "เปรียบเทียบ",
};

const PROVIDER_LABEL: Record<string, { name: string; cls: string }> = {
  "1": { name: "1688",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
  "2": { name: "Taobao", cls: "bg-pink-50 text-pink-700 border-pink-200" },
  "3": { name: "Tmall",  cls: "bg-red-50 text-red-700 border-red-200" },
  "4": { name: "JD",     cls: "bg-red-50 text-red-700 border-red-200" },
};

function fmt(n: number, digits: number = 2): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function firstImage(cimages: string | null | undefined): string | null {
  if (!cimages) return null;
  const first = cimages.split(",")[0]?.trim();
  return first || null;
}

export async function FreightBreakdownTable({ r, isJuristic }: Props) {
  const admin = createAdminClient();

  // ── Fetch items (shop-spawned preferred, else admin-direct) ───────
  let shopItems: ShopOrderItem[] = [];
  if (r.reforder && r.reforder.trim() !== "") {
    const { data, error } = await admin
      .from("tb_order")
      .select(
        "id, ctitle, curl, cnameshop, cprovider, cimages, cprice, " +
        "cshippingchn, cpriceupdate, camount, ccolor, csize",
      )
      .eq("hno", r.reforder.trim())
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[FreightBreakdown tb_order]`, { code: error.code, message: error.message, hno: r.reforder });
    } else {
      shopItems = ((data ?? []) as unknown) as ShopOrderItem[];
    }
  }

  let fwdItems: FwdItem[] = [];
  if (shopItems.length === 0) {
    const { data, error } = await admin
      .from("tb_forwarder_item")
      .select("id, productname, producttracking, productqty, productweightall, productcbmall, chinawoodencratefee")
      .eq("fid", r.id)
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[FreightBreakdown tb_forwarder_item]`, { code: error.code, message: error.message, fid: r.id });
    } else {
      fwdItems = ((data ?? []) as unknown) as FwdItem[];
    }
  }

  // Resolve thumbnail URLs in parallel (only shop-side has images).
  const thumbHrefs: Record<number, string | null> = {};
  if (shopItems.length > 0) {
    await Promise.all(
      shopItems.map(async (it) => {
        const first = firstImage(it.cimages);
        thumbHrefs[it.id] = first
          ? (first.startsWith("http") ? first : await resolveLegacyUrl(first, "cover"))
          : null;
      }),
    );
  }

  // ── Footer (freight) numbers per legacy detail.php L372-377 ──────
  const fTotalPrice           = Number(r.ftotalprice ?? 0);
  const fTransportPrice       = Number(r.ftransportprice ?? 0);
  const fPriceUpdate          = Number(r.fpriceupdate ?? 0);
  const fShippingService      = Number(r.fshippingservice ?? 0);
  const fTransportPriceCHNTHB = Number(r.ftransportpricechnthb ?? 0);
  const priceCrate            = Number(r.pricecrate ?? 0);
  const priceOther            = Number(r.priceother ?? 0);
  const fDiscount             = Number(r.fdiscount ?? 0);
  const frefRate              = Number(r.frefrate ?? 0);

  let priceAllUser =
    fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
    fTransportPriceCHNTHB + priceCrate + priceOther - fDiscount;
  const priceAllUserBefore = priceAllUser;
  const applyWHT = isJuristic && priceAllUserBefore >= 1000;
  const price1Per = applyWHT ? priceAllUser * 0.01 : 0;
  if (applyWHT) priceAllUser = priceAllUser - price1Per;

  const productTypeLabel = PRODUCT_TYPE_LABEL[r.fproductstype ?? "1"] ?? "—";
  const refPriceLabel = REF_PRICE_LABEL[r.frefprice ?? "1"] ?? "—";

  // Item-row helpers — ¥ subtotals (matches the deleted ShopFieldsBoard).
  const itemRows = shopItems.length > 0
    ? shopItems.map((it) => {
        const qty = Number(it.camount ?? 0);
        const price = Number(it.cprice ?? 0);
        const shipChn = Number(it.cshippingchn ?? 0);
        const upd = Number(it.cpriceupdate ?? 0);
        const subtotalYuan = price * qty + shipChn * qty + upd;
        return { kind: "shop" as const, it, qty, price, shipChn, upd, subtotalYuan };
      })
    : fwdItems.map((it) => {
        const qty = Number(it.productqty ?? 0);
        const weight = Number(it.productweightall ?? 0);
        const cbm = Number(it.productcbmall ?? 0);
        const crate = Number(it.chinawoodencratefee ?? 0);
        return { kind: "fwd" as const, it, qty, weight, cbm, crate };
      });

  const totalItemRows = itemRows.length;
  const yuanGrand =
    shopItems.length > 0
      ? itemRows.reduce((s, x) => s + (x.kind === "shop" ? x.subtotalYuan : 0), 0)
      : 0;

  const totalCols = applyWHT ? 17 : 16;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <header className="bg-surface-alt/50 px-4 py-2.5 flex items-center gap-2 border-b border-border">
        <span className="text-base">🧮</span>
        <h2 className="text-sm font-bold">
          รายการสินค้า · breakdown ฝั่งฝากนำเข้า
          {totalItemRows > 0 && (
            <span className="ml-2 text-[11px] font-medium text-muted">
              ({totalItemRows} รายการ)
            </span>
          )}
        </h2>
        <span className="ml-auto text-[10px] text-muted">
          legacy detail.php L380-441 · per-item rows ¥ จาก tb_order ·
          แถวสุดท้าย = สรุป freight ฿ {applyWHT ? "− WHT 1%" : ""}
        </span>
      </header>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/30 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-center">#</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">รายละเอียด</th>
              <th className="px-2 py-2 text-right">กล่อง</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">น้ำหนัก Kg.</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ปริมาตรรวม CBM</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">คิดราคาตาม</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">เรทนำเข้า</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่านำเข้าจีน-ไทย</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่าสินค้า เพิ่ม/ลด</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่าตีลัง</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่าขนส่งจีน+</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่าขนส่งไทย</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่าบริการ</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ค่าอื่นๆ</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">ส่วนลด</th>
              {applyWHT && (
                <th className="px-2 py-2 text-right whitespace-nowrap text-[9px]">
                  LESS<br />WITHHOLDING<br />TAX 1%
                </th>
              )}
              <th className="px-2 py-2 text-right whitespace-nowrap font-bold">ราคารวม</th>
            </tr>
          </thead>
          <tbody>
            {/* ── Per-item rows (¥ pricing · matches the deleted
                ShopFieldsBoard so admin can see what the customer ordered) ── */}
            {itemRows.map((row, idx) => {
              if (row.kind === "shop") {
                const it = row.it;
                const thumb = thumbHrefs[it.id];
                const providerKey = (it.cprovider ?? "").toString().trim();
                const provider = PROVIDER_LABEL[providerKey];
                return (
                  <tr key={`shop-${it.id}`} className="border-t border-border align-top">
                    <td className="px-2 py-2 text-center font-mono text-muted">{idx + 1}</td>
                    <td className="px-2 py-2 min-w-[260px] max-w-[360px]">
                      <div className="flex gap-2">
                        {thumb ? (
                          <a href={thumb} target="_blank" rel="noopener noreferrer" className="block flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumb} alt="" className="w-12 h-12 object-cover rounded border border-border" />
                          </a>
                        ) : (
                          <span className="w-12 h-12 inline-block rounded border border-dashed border-border bg-surface-alt/30" />
                        )}
                        <div className="min-w-0 space-y-0.5">
                          {provider && (
                            <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border ${provider.cls}`}>
                              {provider.name}
                            </span>
                          )}
                          {it.cnameshop && (
                            <div className="text-[10px] text-muted truncate">
                              ชื่อร้าน: <span className="text-foreground">{it.cnameshop}</span>
                            </div>
                          )}
                          {it.curl ? (
                            <a href={it.curl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-700 hover:underline break-words line-clamp-2">
                              {it.ctitle || "—"}
                            </a>
                          ) : (
                            <span className="text-[11px] break-words line-clamp-2">{it.ctitle || "—"}</span>
                          )}
                          {(it.csize || it.ccolor) && (
                            <div className="text-[10px] text-muted">
                              {it.csize ? <>ขนาด: {it.csize} </> : null}
                              {it.ccolor ? <> · สี: {it.ccolor}</> : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{row.qty}</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-center text-muted">—</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">¥{fmt(row.price * row.qty)}</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                      {row.upd === 0 ? <span className="text-muted">¥0.00</span> : `¥${fmt(row.upd)}`}
                    </td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">¥{fmt(row.shipChn * row.qty)}</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    <td className="px-2 py-2 text-right text-muted">—</td>
                    {applyWHT && <td className="px-2 py-2 text-right text-muted">—</td>}
                    <td className="px-2 py-2 text-right font-mono font-bold whitespace-nowrap text-rose-700">
                      ¥{fmt(row.subtotalYuan)}
                    </td>
                  </tr>
                );
              }
              // fwd-item fallback (admin-direct uploads)
              const it = row.it;
              return (
                <tr key={`fwd-${it.id}`} className="border-t border-border align-top">
                  <td className="px-2 py-2 text-center font-mono text-muted">{idx + 1}</td>
                  <td className="px-2 py-2 min-w-[200px]">
                    <div className="text-foreground break-words">{it.productname || "—"}</div>
                    {it.producttracking && (
                      <div className="text-[10px] text-muted">Tracking: {it.producttracking}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{row.qty}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(row.weight)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(row.cbm, 5)}</td>
                  <td className="px-2 py-2 text-center text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right font-mono">{row.crate > 0 ? `฿${fmt(row.crate)}` : <span className="text-muted">—</span>}</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  <td className="px-2 py-2 text-right text-muted">—</td>
                  {applyWHT && <td className="px-2 py-2 text-right text-muted">—</td>}
                  <td className="px-2 py-2 text-right text-muted">—</td>
                </tr>
              );
            })}

            {/* ── Per-item totals (¥) — only when shop-spawned ─────── */}
            {shopItems.length > 0 && (
              <tr className="border-t-2 border-border bg-amber-50/50 dark:bg-amber-950/10 align-top">
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right font-semibold text-[11px]">รวมต้นทาง (¥) จาก ฝากสั่งซื้อ</td>
                <td className="px-2 py-2 text-right font-mono">{itemRows.reduce((s, x) => s + x.qty, 0)}</td>
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-right font-mono whitespace-nowrap">¥{fmt(itemRows.reduce((s, x) => s + (x.kind === "shop" ? x.price * x.qty : 0), 0))}</td>
                <td className="px-2 py-2 text-right font-mono whitespace-nowrap">¥{fmt(itemRows.reduce((s, x) => s + (x.kind === "shop" ? x.upd : 0), 0))}</td>
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-right font-mono whitespace-nowrap">¥{fmt(itemRows.reduce((s, x) => s + (x.kind === "shop" ? x.shipChn * x.qty : 0), 0))}</td>
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-muted" />
                <td className="px-2 py-2 text-muted" />
                {applyWHT && <td className="px-2 py-2 text-muted" />}
                <td className="px-2 py-2 text-right font-mono font-bold whitespace-nowrap text-rose-700">¥{fmt(yuanGrand)}</td>
              </tr>
            )}

            {/* ── Freight breakdown row (฿ · legacy 16-col 1-row layout) ── */}
            <tr className="border-t-4 border-double border-primary-300 bg-primary-50/40 dark:bg-primary-950/10 align-top">
              <td className="px-2 py-3 text-center font-mono text-xs">∑</td>
              <td className="px-2 py-3 max-w-[260px]">
                <div className="font-semibold text-foreground">สรุป freight (฿)</div>
                <div className="text-[10px] text-muted mt-0.5">
                  {r.fdetail ? <span className="line-clamp-2 break-words">{r.fdetail}</span> : null}
                  <div>ประเภทสินค้า : {productTypeLabel}</div>
                </div>
              </td>
              <td className="px-2 py-3 text-right font-mono">{r.famount ?? 0}</td>
              <td className="px-2 py-3 text-right font-mono">{fmt(Number(r.fweight ?? 0), 2)}</td>
              <td className="px-2 py-3 text-right font-mono">{fmt(Number(r.fvolume ?? 0), 5)}</td>
              <td className="px-2 py-3 text-center text-[11px]">{refPriceLabel}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(frefRate)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(fTotalPrice)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(fPriceUpdate)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(priceCrate)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(fTransportPriceCHNTHB)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(fTransportPrice)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(fShippingService)}</td>
              <td className="px-2 py-3 text-right font-mono">฿{fmt(priceOther)}</td>
              <td className="px-2 py-3 text-right font-mono text-amber-700">
                {fDiscount > 0 ? `−฿${fmt(fDiscount)}` : "฿0.00"}
              </td>
              {applyWHT && (
                <td className="px-2 py-3 text-right font-mono text-blue-700">
                  −฿{fmt(price1Per)}
                </td>
              )}
              <td className="px-2 py-3 text-right font-mono font-bold text-rose-700 text-sm">
                ฿{fmt(priceAllUser)}
              </td>
            </tr>

            {/* Empty-state placeholder if no items + no breakdown values */}
            {totalItemRows === 0 && priceAllUser === 0 && (
              <tr className="border-t border-border">
                <td colSpan={totalCols} className="px-2 py-6 text-center text-[11px] text-muted">
                  ยังไม่มีข้อมูลรายการสินค้า + ราคารวม = ฿0 (รอ admin บันทึก dimensions + ราคา)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
