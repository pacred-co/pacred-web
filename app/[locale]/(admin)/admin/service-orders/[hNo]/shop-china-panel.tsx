"use client";

/**
 * ShopChinaPanel — per-CHINA-SHOP working panel for ฝากสั่งซื้อ /edit.
 *
 * Owner directive 2026-06-04: ออเดอร์เดียวสั่งได้หลายร้านจีน · "แต่ละร้านมี
 * track ของตัวเอง · 3 ร้าน = 3 tracking ใต้ชื่อร้าน · ให้ pricing สั่งซื้อจีน
 * มากรอก". The legacy status-3 mark-ordered form took ONE cShippingNumber
 * for the whole order; this panel groups the order's tb_order lines BY
 * cNameShop and gives each shop its own:
 *   - เลขสั่งซื้อร้านจีน (cShippingNumber)  → adminUpdateCartItemShippingNumber
 *   - เลข tracking จีน (cTrackingNumber)    → adminSetShopTracking (set/clear)
 *                                             OR adminUpdateCartItemCTracking
 *                                             (cascade-rename when already set)
 *   - ¥ เพิ่ม/ลด ต่อชิ้น (cPriceUpdate)     → adminUpdateCartItemPriceUpdate
 *
 * Faithful workflow (§0a · legacy shops.php L1075/L1371/L1793/L1806 +
 * update3/update4), Pacred UI. §0d — these four server actions previously
 * had NO entry point (orphan); this panel is their reachable home. §0f —
 * every save is confirm-before-mutate. The status-4 SpawnForwarderForm
 * reads the ctrackingnumber this panel records (buildSpawnRows).
 *
 * editable=false (status 5) → read-only review.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import {
  adminUpdateCartItemShippingNumber,
  adminSetShopTracking,
  adminUpdateCartItemCTracking,
  adminUpdateCartItemPriceUpdate,
} from "@/actions/admin/service-orders-line-edits";

export type ShopPanelItem = {
  id: number;
  ctitle: string;
  curl: string | null;
  camount: number;
  cprice: number;
  cpriceupdate: number;
  crewallet: string | null;
};
export type ShopGroup = {
  cNameShop: string;
  cShippingNumber: string;
  cTrackingNumber: string;
  items: ShopPanelItem[];
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

export function ShopChinaPanel({
  hNo,
  shops,
  editable,
}: {
  hNo: string;
  shops: ShopGroup[];
  editable: boolean;
}) {
  if (shops.length === 0) return null;
  return (
    <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
      <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm font-bold">🏪 ข้อมูลร้านค้าจีน (ราย ร้าน · {shops.length} ร้าน)</span>
        <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">
          เลขสั่งซื้อ + tracking ต่อร้าน
        </span>
      </header>
      <div className="p-3 sm:p-4 space-y-3">
        <p className="text-[11px] text-muted leading-relaxed">
          แต่ละร้านจีนมีเลขสั่งซื้อ + เลข tracking ของตัวเอง — กรอกใต้ชื่อร้าน
          แล้วกดบันทึกทีละช่อง (ระบบจะถามยืนยันก่อน). เมื่อกรอก tracking ครบทุกร้าน
          ใช้ปุ่ม &ldquo;สร้างฝากนำเข้า&rdquo; ด้านล่าง (สถานะ 4) เพื่อเปิดใบฝากนำเข้า.
        </p>
        {shops.map((shop) => (
          <ShopBlock key={shop.cNameShop} hNo={hNo} shop={shop} editable={editable} />
        ))}
      </div>
    </section>
  );
}

function ShopBlock({
  hNo,
  shop,
  editable,
}: {
  hNo: string;
  shop: ShopGroup;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shipNo, setShipNo] = useState(shop.cShippingNumber);
  const [tracking, setTracking] = useState(shop.cTrackingNumber);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // baselines — to detect change + choose set-vs-cascade for tracking
  const origShip = shop.cShippingNumber;
  const origTrack = shop.cTrackingNumber;

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    if (kind === "ok") setTimeout(() => setMsg(null), 5000);
  }

  function saveShipNo() {
    const v = shipNo.trim();
    if (v === origShip.trim()) {
      flash("err", "เลขสั่งซื้อไม่เปลี่ยน — ไม่ต้องบันทึก");
      return;
    }
    startTransition(async () => {
      if (!(await confirm(`บันทึกเลขสั่งซื้อร้าน "${shop.cNameShop}" ?\n\n"${origShip || "—"}" → "${v || "—"}"`))) return;
      const res = await adminUpdateCartItemShippingNumber({
        h_no: hNo,
        c_name_shop: shop.cNameShop,
        c_shipping_number: v,
      });
      if (res.ok) {
        flash("ok", `บันทึกเลขสั่งซื้อแล้ว (${res.data?.rows_touched ?? 0} รายการ)`);
        router.refresh();
      } else flash("err", res.error);
    });
  }

  function saveTracking() {
    const v = tracking.trim();
    if (v === origTrack.trim()) {
      flash("err", "เลข tracking ไม่เปลี่ยน — ไม่ต้องบันทึก");
      return;
    }
    // Cascade-rename path: the shop already has a single-token tracking
    // (likely already linked to a tb_forwarder) → adminUpdateCartItemCTracking
    // renames it everywhere + cascades fTrackingCHN. Otherwise plain set.
    const isCleanRename =
      origTrack.trim().length > 0 && v.length > 0 && !origTrack.includes(",") && !v.includes(",");
    startTransition(async () => {
      if (
        !(await confirm(
          `บันทึกเลข tracking ร้าน "${shop.cNameShop}" ?\n\n"${origTrack || "—"}" → "${v || "—"}"` +
            (isCleanRename ? "\n\n(จะอัปเดต tb_forwarder ที่ผูกไว้ด้วย)" : ""),
        ))
      )
        return;
      const res = isCleanRename
        ? await adminUpdateCartItemCTracking({
            h_no: hNo,
            c_tracking_number_old: origTrack.trim(),
            c_tracking_number_new: v,
          })
        : await adminSetShopTracking({
            h_no: hNo,
            c_name_shop: shop.cNameShop,
            c_tracking_number: v,
          });
      if (res.ok) {
        flash("ok", "บันทึกเลข tracking แล้ว");
        router.refresh();
      } else flash("err", res.error);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-primary-100 text-primary-700 px-2.5 py-0.5 text-[11px] font-semibold">
          ร้านจีน
        </span>
        <h4 className="text-sm font-bold truncate">{shop.cNameShop || "— (ไม่มีชื่อร้าน)"}</h4>
        <span className="text-[10px] text-muted">{shop.items.length} รายการ</span>
      </div>

      {/* shop order number + tracking, side by side */}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">เลขสั่งซื้อร้านจีน (cShippingNumber)</span>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={shipNo}
              onChange={(e) => setShipNo(e.target.value)}
              disabled={!editable || pending}
              maxLength={500}
              placeholder="เลขออเดอร์จากร้านจีน"
              className={inputCls}
            />
            {editable && (
              <button
                type="button"
                onClick={saveShipNo}
                disabled={pending}
                className="shrink-0 rounded-lg bg-primary-600 text-white px-3 py-2 text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
              >
                บันทึก
              </button>
            )}
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">เลข Tracking จีน (cTrackingNumber)</span>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              disabled={!editable || pending}
              maxLength={500}
              placeholder="เลข tracking ของร้านนี้"
              className={inputCls}
            />
            {editable && (
              <button
                type="button"
                onClick={saveTracking}
                disabled={pending}
                className="shrink-0 rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                บันทึก
              </button>
            )}
          </div>
        </label>
      </div>

      {/* per-line ¥ add/subtract (cPriceUpdate) */}
      <div className="space-y-1.5">
        {shop.items.map((it) => (
          <ItemPriceUpdateRow key={it.id} hNo={hNo} item={it} editable={editable} onSaved={() => router.refresh()} />
        ))}
      </div>

      {msg && (
        <p className={`text-[11px] ${msg.kind === "ok" ? "text-green-600" : "text-red-600"}`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}
          {msg.text}
        </p>
      )}
    </div>
  );
}

function ItemPriceUpdateRow({
  hNo,
  item,
  editable,
  onSaved,
}: {
  hNo: string;
  item: ShopPanelItem;
  editable: boolean;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(String(item.cpriceupdate ?? 0));
  const [err, setErr] = useState<string | null>(null);
  const refunded = item.crewallet === "1";

  function save() {
    setErr(null);
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) {
      setErr("ตัวเลขไม่ถูกต้อง");
      return;
    }
    if (Math.abs(n - Number(item.cpriceupdate ?? 0)) < 0.005) {
      setErr("ไม่เปลี่ยน");
      return;
    }
    startTransition(async () => {
      if (!(await confirm(`บันทึก ¥ เพิ่ม/ลด ของ "${item.ctitle || `#${item.id}`}" เป็น ${n.toFixed(2)} ?`))) return;
      const res = await adminUpdateCartItemPriceUpdate({ tb_order_id: item.id, c_price_update: n });
      if (res.ok) onSaved();
      else setErr(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs border-t border-border/60 pt-1.5">
      <span className="min-w-0 flex-1 truncate text-muted" title={item.ctitle}>
        {item.ctitle || `#${item.id}`}
        <span className="ml-1 text-muted/70">
          ({item.camount}×¥{item.cprice})
        </span>
      </span>
      <span className="text-[10px] text-muted shrink-0">¥+/−</span>
      <input
        type="number"
        min={0}
        step={0.01}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={!editable || pending || refunded}
        className="w-20 rounded border border-border px-2 py-1 text-right font-mono text-xs disabled:opacity-50"
      />
      {editable && !refunded && (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="shrink-0 rounded border border-primary-300 text-primary-700 px-2 py-1 text-[11px] hover:bg-primary-50 disabled:opacity-50"
        >
          บันทึก
        </button>
      )}
      {refunded && <span className="text-[10px] text-red-500 shrink-0">คืนเงินแล้ว</span>}
      {err && <span className="text-[10px] text-red-600 shrink-0">{err}</span>}
    </div>
  );
}
