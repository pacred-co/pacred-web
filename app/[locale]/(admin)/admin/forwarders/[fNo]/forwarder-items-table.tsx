/**
 * <ForwarderItemsTable> — PCS-style line-item table for a forwarder.
 *
 * 2026-06-03 ภูม UX flag (รูป 2-4): the legacy PCS shops/detail.php renders
 * the customer's purchase as a structured product table with thumbnail
 * images, grouping by Chinese vendor (shop), per-item ¥ price, qty, and
 * a totals row at the bottom. Pacred's /admin/forwarders/[fNo] only
 * showed a plain text table or dropped the items entirely — staff couldn't
 * tell at a glance what the customer actually ordered.
 *
 * Data sources (in priority order):
 *   1. tb_order WHERE hno = forwarder.reforder
 *      — the shop-order line items (cnameshop · ctitle · cimages · cprice
 *      · camount · ccolor · csize · curl). This is the canonical source
 *      for shop-spawned forwarders.
 *   2. tb_forwarder_item WHERE fid = forwarder.id
 *      — direct items (productname · producttracking · productqty · weight ·
 *      cbm · crate). Mostly empty in prod but kept for forward-compat with
 *      admin-direct-uploads.
 *   3. Fallback: render an info card with fdetail + box dimensions, plus
 *      a hint about how to add items (link to /service-orders/[Pxxx] or
 *      /admin/forwarders/[fNo]/edit).
 *
 * Legacy reference: D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\
 *   include\pages\shops\detail.php L187-260 (product table with shop grouping).
 *
 * Mode:
 *   - "view"  — read-only; click row to open product URL in new tab
 *   - "edit"  — same display + inline edit hint at the top (actual mutation
 *               routes are V-3, deferred — link out to /admin/service-orders
 *               for shop-side edits)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import Image from "next/image";
import { ExternalLink, ShoppingBag, Box, PackagePlus, AlertCircle, Pencil } from "lucide-react";
import { ShopItemRowEditor } from "./shop-item-row-editor";

type ShopOrderItem = {
  id: number;
  ctitle: string;
  curl: string;
  cnameshop: string;
  cprovider: string;
  cimages: string;
  cprice: number | string;
  cshippingchn: number | string;
  cpriceupdate: number | string;
  camount: number;
  ccolor: string;
  csize: string;
  cnote: string;
  ctrackingnumber: string;
};

type FwdItem = {
  id: number;
  productname: string;
  producttracking: string;
  productqty: number;
  productweightall: number | string;
  productcbmall: number | string;
  chinawoodencratefee: number | string;
};

type Props = {
  forwarderId: number;
  forwarderNo: string;
  reforder: string | null;
  fdetail: string | null;
  fcover: string | null;
  /** Box dimensions for the empty-state fallback display */
  fwidth: number | null;
  flength: number | null;
  fheight: number | null;
  famount: number | null;
  mode: "view" | "edit";
};

const PROVIDER_LABEL: Record<string, { name: string; cls: string }> = {
  "1": { name: "1688",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
  "2": { name: "Taobao", cls: "bg-pink-50 text-pink-700 border-pink-200" },
  "3": { name: "Tmall",  cls: "bg-red-50 text-red-700 border-red-200" },
  "4": { name: "JD",     cls: "bg-red-50 text-red-700 border-red-200" },
};

export async function ForwarderItemsTable(p: Props) {
  const admin = createAdminClient();

  // ─── 1. Try tb_order (shop-spawned forwarders) ───────────────────
  let shopItems: ShopOrderItem[] = [];
  if (p.reforder && p.reforder.trim() !== "") {
    const { data, error } = await admin
      .from("tb_order")
      .select(
        "id, ctitle, curl, cnameshop, cprovider, cimages, cprice, " +
        "cshippingchn, cpriceupdate, camount, ccolor, csize, cnote, ctrackingnumber",
      )
      .eq("hno", p.reforder.trim())
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[ForwarderItemsTable tb_order]`, { code: error.code, message: error.message, hno: p.reforder });
    } else {
      shopItems = ((data ?? []) as unknown) as ShopOrderItem[];
    }
  }

  // ─── 2. Fallback: tb_forwarder_item (admin-direct-upload) ─────────
  let fwdItems: FwdItem[] = [];
  if (shopItems.length === 0) {
    const { data, error } = await admin
      .from("tb_forwarder_item")
      .select(
        "id, productname, producttracking, productqty, productweightall, " +
        "productcbmall, chinawoodencratefee",
      )
      .eq("fid", p.forwarderId)
      .order("id", { ascending: true })
      .limit(200);
    if (error) {
      console.error(`[ForwarderItemsTable tb_forwarder_item]`, { code: error.code, message: error.message, fid: p.forwarderId });
    } else {
      fwdItems = ((data ?? []) as unknown) as FwdItem[];
    }
  }

  // ─── 3. Empty state ─────────────────────────────────────────────
  if (shopItems.length === 0 && fwdItems.length === 0) {
    const coverHref = p.fcover && p.fcover.trim() !== ""
      ? (p.fcover.startsWith("http") ? p.fcover : await resolveLegacyUrl(p.fcover, "cover"))
      : null;

    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-5 shadow-sm">
        <header className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-border">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <Box className="h-4 w-4" /> รายการสินค้า
          </h2>
          <span className="text-xs text-muted">ไม่มีรายการระดับ item</span>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2 space-y-2">
            {p.fdetail && p.fdetail.trim() !== "" ? (
              <div>
                <p className="text-xs text-muted mb-1">รายละเอียด:</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{p.fdetail}</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">ออเดอร์นี้ยังไม่มีข้อมูลรายการสินค้า</p>
                  <p className="text-xs mt-1 text-amber-700">
                    {p.reforder
                      ? <>หากต้องการดูรายการ ลองเปิด <Link href={`/admin/service-orders/${p.reforder}`} className="underline hover:text-amber-900">ออเดอร์ฝากสั่งซื้อ <span className="font-mono">{p.reforder}</span></Link></>
                      : "ออเดอร์นี้สร้างจากระบบ partner (MOMO/CargoCenter/JMF) ที่ไม่ได้บันทึก item-level details · ใช้ขนาดกล่อง + น้ำหนักเป็นข้อมูลหลัก"}
                  </p>
                </div>
              </div>
            )}

            {/* Box dimensions display */}
            {((p.fwidth ?? 0) > 0 || (p.flength ?? 0) > 0 || (p.fheight ?? 0) > 0) && (
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-xs text-muted mb-1.5">ขนาดกล่อง (จำนวน {p.famount ?? 0} ใบ):</p>
                <div className="inline-flex items-center gap-3 rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-sm">
                  <span><span className="text-muted">กว้าง</span> <span className="font-mono font-bold">{Number(p.fwidth ?? 0)} cm</span></span>
                  <span className="text-muted">·</span>
                  <span><span className="text-muted">ยาว</span> <span className="font-mono font-bold">{Number(p.flength ?? 0)} cm</span></span>
                  <span className="text-muted">·</span>
                  <span><span className="text-muted">สูง</span> <span className="font-mono font-bold">{Number(p.fheight ?? 0)} cm</span></span>
                </div>
              </div>
            )}
          </div>

          {/* Cover image */}
          {coverHref && (
            <div>
              <p className="text-xs text-muted mb-1.5">รูปสินค้า:</p>
              <a href={coverHref} target="_blank" rel="noopener noreferrer" className="block">
                <Image
                  src={coverHref}
                  alt="cover"
                  width={200}
                  height={200}
                  unoptimized
                  className="rounded-lg border border-border w-full max-w-[200px] h-auto"
                />
              </a>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ─── 4. tb_forwarder_item fallback render ────────────────────────
  if (fwdItems.length > 0) {
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-surface-alt/40">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <PackagePlus className="h-4 w-4" /> รายการสินค้า ({fwdItems.length})
          </h2>
          <span className="text-[10px] text-muted">tb_forwarder_item (admin upload)</span>
        </header>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 dark:bg-surface-alt text-xs">
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 w-10">#</th>
                <th className="text-left py-2 px-2">ชื่อสินค้า</th>
                <th className="text-left py-2 px-2">Tracking</th>
                <th className="text-right py-2 px-2">จำนวน</th>
                <th className="text-right py-2 px-2">น้ำหนักรวม</th>
                <th className="text-right py-2 px-2">CBM</th>
                <th className="text-right py-2 px-2">ตีลังไม้</th>
              </tr>
            </thead>
            <tbody>
              {fwdItems.map((it, idx) => (
                <tr key={it.id} className="border-b border-border/40 hover:bg-surface-alt/30">
                  <td className="py-2 px-2 text-muted">{idx + 1}</td>
                  <td className="py-2 px-2">{it.productname || "—"}</td>
                  <td className="py-2 px-2 font-mono text-xs">{it.producttracking || "—"}</td>
                  <td className="py-2 px-2 text-right font-mono">{it.productqty}</td>
                  <td className="py-2 px-2 text-right font-mono">{Number(it.productweightall).toFixed(2)} กก.</td>
                  <td className="py-2 px-2 text-right font-mono">{Number(it.productcbmall).toFixed(3)}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {Number(it.chinawoodencratefee) > 0
                      ? `฿${Number(it.chinawoodencratefee).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  // ─── 5. tb_order shop-spawned render — PCS-style with shop grouping ─
  // Group by cnameshop. Maintain order = first appearance per shop.
  const shopGroups: Map<string, ShopOrderItem[]> = new Map();
  for (const it of shopItems) {
    const key = it.cnameshop || "ไม่ระบุร้าน";
    const arr = shopGroups.get(key);
    if (arr) arr.push(it);
    else shopGroups.set(key, [it]);
  }

  // Totals
  const totalQty = shopItems.reduce((s, it) => s + Number(it.camount), 0);
  const totalPrice = shopItems.reduce(
    (s, it) => s + Number(it.cprice) * Number(it.camount) + Number(it.cshippingchn) + Number(it.cpriceupdate),
    0,
  );
  const totalShipping = shopItems.reduce((s, it) => s + Number(it.cshippingchn), 0);
  const totalAdjust = shopItems.reduce((s, it) => s + Number(it.cpriceupdate), 0);

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-surface-alt/40">
        <h2 className="font-bold text-sm flex items-center gap-1.5">
          {p.mode === "edit" ? <Pencil className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
          รายการสินค้า ({shopItems.length})
          {p.mode === "edit" && (
            <span className="ml-1 rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">แก้ไขในตาราง</span>
          )}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">จาก ออเดอร์ฝากสั่งซื้อ</span>
          <Link
            href={`/admin/service-orders/${p.reforder}`}
            className="inline-flex items-center gap-1 rounded border border-sky-300 bg-sky-50 text-sky-700 px-1.5 py-0.5 font-mono hover:bg-sky-100"
          >
            {p.reforder} <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-gray-50 dark:bg-surface-alt text-xs">
            <tr className="border-b-2 border-border">
              <th className="text-center py-2 px-2 w-10">#</th>
              <th className="text-left py-2 px-2 w-[88px]">รูป</th>
              <th className="text-left py-2 px-2">ข้อมูลสินค้า</th>
              <th className="text-center py-2 px-2 w-16">จำนวน</th>
              <th className="text-right py-2 px-2 w-24">ราคา/ชิ้น (¥)</th>
              <th className="text-right py-2 px-2 w-24">ค่าขนส่งจีน (¥)</th>
              <th className="text-right py-2 px-2 w-24">เพิ่ม/ลด (¥)</th>
              <th className="text-right py-2 px-2 w-28">รวม (¥)</th>
            </tr>
          </thead>
          <tbody>
            {[...shopGroups.entries()].map(([shopName, rows]) => {
              const provider = rows[0]?.cprovider ?? "";
              const providerInfo = PROVIDER_LABEL[provider] ?? { name: provider || "—", cls: "bg-gray-50 text-gray-700 border-gray-200" };
              return (
                <ShopGroup
                  key={shopName}
                  shopName={shopName}
                  providerInfo={providerInfo}
                  rows={rows}
                  startIdx={shopItems.findIndex((it) => it.id === rows[0].id) + 1}
                  mode={p.mode}
                />
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-primary-50/30 dark:bg-primary-950/20 font-bold">
              <td colSpan={3} className="py-2 px-2 text-right">รวมทั้งสิ้น</td>
              <td className="py-2 px-2 text-center font-mono">{totalQty}</td>
              <td className="py-2 px-2 text-right text-muted text-xs">—</td>
              <td className="py-2 px-2 text-right font-mono text-xs">¥{totalShipping.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-2 text-right font-mono text-xs">¥{totalAdjust.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-2 text-right font-mono text-base text-primary-700">¥{totalPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {p.mode === "edit" && (
        <div className="px-4 py-2 border-t border-border bg-sky-50/40 text-xs text-sky-800 flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <b>แก้ไขในตารางได้เลย</b> · กรอกจำนวน / ราคา / ค่าขนส่ง / หมายเหตุ แล้วกด <b>บันทึก</b> · ต้องการแก้ ชื่อ/ร้าน/variant กด &quot;แก้ชื่อ/ร้าน/variant&quot; · หรือเปิด{" "}
            <Link href={`/admin/service-orders/${p.reforder}/edit`} className="underline font-mono hover:text-sky-900">
              /admin/service-orders/{p.reforder}/edit
            </Link>
            {" "}สำหรับเพิ่มรายการใหม่
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * Per-shop group: shop name header row + 1 row per item with image,
 * product info, variant (color/size), price, qty, total.
 * Mirrors PCS shops/detail.php L187-260 layout.
 */
async function ShopGroup({
  shopName,
  providerInfo,
  rows,
  startIdx,
  mode,
}: {
  shopName: string;
  providerInfo: { name: string; cls: string };
  rows: ShopOrderItem[];
  startIdx: number;
  mode: "view" | "edit";
}) {
  return (
    <>
      {/* Shop header row */}
      <tr className="bg-sky-50/60 dark:bg-sky-950/20">
        <td colSpan={8} className="py-1.5 px-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 ${providerInfo.cls}`}>
              {providerInfo.name}
            </span>
            <span className="font-medium text-sky-900 dark:text-sky-200">ชื่อร้าน: {shopName}</span>
            <span className="ml-auto text-muted">{rows.length} รายการ</span>
          </div>
        </td>
      </tr>
      {/* Item rows — switch to client editor when mode="edit" */}
      {await Promise.all(rows.map(async (it, idx) => {
        const imgHref = it.cimages && it.cimages.trim() !== ""
          ? (it.cimages.startsWith("http") || it.cimages.startsWith("//")
              ? (it.cimages.startsWith("//") ? `https:${it.cimages}` : it.cimages)
              : await resolveLegacyUrl(it.cimages, "cover"))
          : null;

        if (mode === "edit") {
          return (
            <ShopItemRowEditor
              key={it.id}
              id={it.id}
              rowIndex={startIdx + idx}
              ctitle={it.ctitle ?? ""}
              curl={it.curl ?? ""}
              cnameshop={it.cnameshop ?? ""}
              cimages={imgHref}
              cprice={Number(it.cprice ?? 0)}
              cshippingchn={Number(it.cshippingchn ?? 0)}
              cpriceupdate={Number(it.cpriceupdate ?? 0)}
              camount={Number(it.camount ?? 0)}
              ccolor={it.ccolor ?? ""}
              csize={it.csize ?? ""}
              cnote={it.cnote ?? ""}
              ctrackingnumber={it.ctrackingnumber ?? ""}
            />
          );
        }

        // mode === "view" — read-only row
        const lineSubtotal = Number(it.cprice) * Number(it.camount)
                           + Number(it.cshippingchn)
                           + Number(it.cpriceupdate);
        return (
          <tr key={it.id} className="border-b border-border/40 hover:bg-surface-alt/30 align-top">
            <td className="py-2 px-2 text-center text-muted text-xs">{startIdx + idx}</td>
            <td className="py-2 px-2">
              {imgHref ? (
                <a href={imgHref} target="_blank" rel="noopener noreferrer">
                  <Image
                    src={imgHref}
                    alt={it.ctitle || "product"}
                    width={64}
                    height={64}
                    unoptimized
                    className="rounded border border-border w-16 h-16 object-cover"
                  />
                </a>
              ) : (
                <div className="w-16 h-16 rounded border border-dashed border-border bg-surface-alt/30 flex items-center justify-center text-muted">
                  <Box className="h-5 w-5" />
                </div>
              )}
            </td>
            <td className="py-2 px-2">
              <div className="space-y-0.5">
                {it.curl ? (
                  <a
                    href={it.curl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline text-sm leading-snug line-clamp-2 inline-flex items-start gap-1"
                  >
                    {it.ctitle || "—"} <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  </a>
                ) : (
                  <span className="text-sm leading-snug">{it.ctitle || "—"}</span>
                )}
                {(it.ccolor || it.csize) && (
                  <p className="text-xs text-muted">
                    {[it.ccolor, it.csize].filter(Boolean).join(" · ")}
                  </p>
                )}
                {it.ctrackingnumber && (
                  <p className="text-xs font-mono text-muted">tracking: {it.ctrackingnumber}</p>
                )}
                {it.cnote && (
                  <p className="text-xs text-amber-700">หมายเหตุ: {it.cnote}</p>
                )}
              </div>
            </td>
            <td className="py-2 px-2 text-center font-mono">{it.camount}</td>
            <td className="py-2 px-2 text-right font-mono">¥{Number(it.cprice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
            <td className="py-2 px-2 text-right font-mono text-xs">
              {Number(it.cshippingchn) > 0
                ? `¥${Number(it.cshippingchn).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                : <span className="text-muted">—</span>}
            </td>
            <td className="py-2 px-2 text-right font-mono text-xs">
              {Number(it.cpriceupdate) !== 0
                ? `¥${Number(it.cpriceupdate).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                : <span className="text-muted">—</span>}
            </td>
            <td className="py-2 px-2 text-right font-mono font-medium">¥{lineSubtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
          </tr>
        );
      }))}
    </>
  );
}
