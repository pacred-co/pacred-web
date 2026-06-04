"use client";

/**
 * Shop fields board — per-shop status-aware inputs for ฝากสั่งซื้อ /edit
 * (2026-06-04 ภูม flag #4 · A-path · faithful to legacy update3/update4.php).
 *
 * Sits between the 5-step pipeline bar and `<ShopItemsEditor>`. Renders ONE
 * card per unique `cnameshop` in the order with status-aware inputs:
 *
 *   status 3 (สั่งสินค้า → รอร้านจีนจัดส่ง):
 *     - `cshippingnumber` input per shop (the Chinese SHOP order number that
 *       the seller assigned us)
 *     - submit ALL shops at once → `adminMarkShopOrderOrdered({shops:[...]})`
 *       → flips hstatus 3 → 4 + notifies customer
 *
 *   status 4 (รอร้านจีนจัดส่ง → สำเร็จ):
 *     - `cshippingnumber` displayed READ-ONLY (locked once status flipped)
 *     - `ctrackingnumber` input per shop (the China-side tracking the seller
 *       hands us after dispatch)
 *     - submit per-shop tracking → `adminUpdateShopTracking({shops:[...]})`
 *       (no status flip — that's the SpawnForwarderForm's job below)
 *     - "ตรวจสอบรายการนำเข้า" link per row → `/admin/forwarders?q=<tracking>`
 *       (legacy update4.php "ตรวจสอบรายการนำเข้า" button)
 *
 *   status 1/2: not shown (price-editing phase — items-editor handles it)
 *   status 5  : read-only display (all shops shown with both numbers)
 *
 * Per-shop pattern matches legacy `update3.php` + `update4.php`:
 *   SELECT DISTINCT(cNameShop) AS cNameShop, cShippingNumber FROM tb_order
 *     WHERE hNo=? GROUP BY cNameShop;
 *   for each shop → UPDATE tb_order SET cShippingNumber WHERE hNo+cNameShop;
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Store, Save, ExternalLink, CheckCircle2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminMarkShopOrderOrdered,
  adminUpdateShopTracking,
} from "@/actions/admin/service-orders-shop-workflow";

export type ShopFieldsRow = {
  cnameshop: string;
  cshippingnumber: string;
  ctrackingnumber: string;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt disabled:text-muted";

export function ShopFieldsBoard({
  hNo,
  status,
  shops,
}: {
  hNo: string;
  status: string;        // hstatus '1'..'5'
  shops: ShopFieldsRow[]; // grouped by cnameshop server-side
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hnotechn, setHnoteChn] = useState<string>("");

  // Per-shop local state (keyed by cnameshop) — `cshippingnumber` and
  // `ctrackingnumber` so the admin can edit one or the other depending
  // on status.
  const [draft, setDraft] = useState<Record<string, { cshippingnumber: string; ctrackingnumber: string }>>(
    () => {
      const init: Record<string, { cshippingnumber: string; ctrackingnumber: string }> = {};
      for (const s of shops) {
        init[s.cnameshop] = {
          cshippingnumber: s.cshippingnumber ?? "",
          ctrackingnumber: s.ctrackingnumber ?? "",
        };
      }
      return init;
    },
  );

  // ─── status 1/2 — items-editor handles · we render nothing ────────
  if (status === "1" || status === "2") return null;

  function setField(shop: string, key: "cshippingnumber" | "ctrackingnumber", v: string) {
    setDraft((d) => ({ ...d, [shop]: { ...d[shop], [key]: v } }));
  }

  // ─── status 3 → submit all shops cshippingnumber + flip 3→4 ───────
  function onSubmitOrdered() {
    setMsg(null);
    setErr(null);
    const payload = shops.map((s) => ({
      cnameshop: s.cnameshop,
      cshippingnumber: (draft[s.cnameshop]?.cshippingnumber ?? "").trim(),
    }));
    const missing = payload.filter((p) => p.cshippingnumber.length === 0);
    if (missing.length > 0) {
      setErr(`กรอกเลขออเดอร์ร้านจีนให้ครบทุกร้าน · ขาด ${missing.length} ร้าน`);
      return;
    }
    if (!confirm(
      `ยืนยันส่งออเดอร์ #${hNo} เป็น "รอร้านจีนจัดส่ง"?\n\n` +
      `บันทึกเลขออเดอร์ร้านจีน ${payload.length} ร้าน · เปลี่ยนสถานะ 3 → 4 · แจ้งลูกค้า 3 ช่องทาง`,
    )) return;
    startTransition(async () => {
      const res = await adminMarkShopOrderOrdered({
        hNo,
        shops: payload,
        hnotechn: hnotechn.trim().length > 0 ? hnotechn : undefined,
      });
      if (res.ok) {
        setMsg(
          `✅ บันทึก ${res.data?.shops_updated ?? 0} ร้าน · ${res.data?.rows_updated ?? 0} แถว · ` +
            `เปลี่ยนสถานะเป็น "รอร้านจีนจัดส่ง" · แจ้งลูกค้าแล้ว`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setErr(res.error);
      }
    });
  }

  // ─── status 4 → submit per-shop ctrackingnumber (no status flip) ──
  function onSubmitTracking() {
    setMsg(null);
    setErr(null);
    const payload = shops.map((s) => ({
      cnameshop: s.cnameshop,
      ctrackingnumber: (draft[s.cnameshop]?.ctrackingnumber ?? "").trim(),
    }));
    // legacy update4 allows empty (clears) but we warn if entirely empty
    if (payload.every((p) => p.ctrackingnumber.length === 0)) {
      setErr("กรอกเลข Tracking จีนอย่างน้อย 1 ร้านก่อนบันทึก");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateShopTracking({ hNo, shops: payload });
      if (res.ok) {
        setMsg(
          `✅ บันทึกเลข Tracking ${res.data?.shops_updated ?? 0} ร้าน · ${res.data?.rows_updated ?? 0} แถว`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setErr(res.error);
      }
    });
  }

  const isStatus3 = status === "3";
  const isStatus4 = status === "4";
  const isStatus5 = status === "5";
  const showSubmit = isStatus3 || isStatus4;

  return (
    <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
      <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
        <Store className="h-4 w-4" />
        <span className="text-sm font-bold">
          {isStatus3 && "📝 บันทึกเลขออเดอร์ร้านจีน (สถานะ 3 → 4)"}
          {isStatus4 && "🚛 บันทึกเลข Tracking ร้านจีน (สถานะ 4)"}
          {isStatus5 && "✓ ข้อมูลร้านจีน (อ่านอย่างเดียว)"}
        </span>
        <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">
          {shops.length} ร้าน
        </span>
      </header>

      <div className="p-3 sm:p-4 space-y-3">
        {msg && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
        )}

        <p className="text-[11px] text-muted leading-relaxed">
          {isStatus3 && "แต่ละร้านมี \"เลขออเดอร์ร้านจีน\" ของตัวเอง · กรอกครบทุกร้านแล้วกด \"ส่งเข้ารอร้านจีนจัดส่ง\" → ลูกค้าจะได้รับแจ้งเตือน"}
          {isStatus4 && "กรอกเลข Tracking ที่ร้านจีนส่งมาเป็นรายร้าน · กดปุ่ม \"ตรวจสอบรายการนำเข้า\" เพื่อดูสถานะ tb_forwarder ที่ระบบ spawn ให้แล้ว"}
          {isStatus5 && "ออเดอร์สำเร็จแล้ว · ระบบเปิดใบฝากนำเข้าให้ครบแล้ว"}
        </p>

        <div className="space-y-2">
          {shops.map((sh) => {
            const d = draft[sh.cnameshop] ?? { cshippingnumber: "", ctrackingnumber: "" };
            const shopFwdSearchHref = sh.ctrackingnumber
              ? `/admin/forwarders?q=${encodeURIComponent(sh.ctrackingnumber)}`
              : null;
            return (
              <div
                key={sh.cnameshop}
                className="rounded-xl border border-border bg-white dark:bg-surface p-3 space-y-2 shadow-sm"
              >
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <Store className="h-3.5 w-3.5 text-muted" />
                  <span className="text-xs font-bold text-foreground">
                    ชื่อร้าน: <span className="font-normal text-muted">{sh.cnameshop}</span>
                  </span>
                </div>

                {/* cshippingnumber — editable at status 3 · locked at 4/5 */}
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-muted">
                    เลขออเดอร์ร้านจีน {isStatus3 && <span className="text-red-500">*</span>}
                  </span>
                  <input
                    type="text"
                    value={d.cshippingnumber}
                    onChange={(e) => setField(sh.cnameshop, "cshippingnumber", e.target.value)}
                    disabled={!isStatus3 || pending}
                    placeholder="เช่น 5119114033176034116"
                    className={inputCls}
                  />
                </label>

                {/* ctrackingnumber — editable at status 4 · shown read-only at 5 */}
                {(isStatus4 || isStatus5) && (
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-muted flex items-center gap-1">
                      <Truck className="h-3 w-3" /> เลข Tracking จีน
                      {isStatus4 && <span className="text-muted/70">(หากมีหลายเลข ใส่คอมม่าคั่น)</span>}
                    </span>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={d.ctrackingnumber}
                        onChange={(e) => setField(sh.cnameshop, "ctrackingnumber", e.target.value)}
                        disabled={!isStatus4 || pending}
                        placeholder="เลข Tracking จีน · หากจำนวนช่องไม่ตรงให้แก้ไขเลขออเดอร์จีน"
                        className={inputCls}
                      />
                      {shopFwdSearchHref && (
                        <Link
                          href={shopFwdSearchHref}
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100"
                          title="ค้นหารายการฝากนำเข้าตามเลข tracking นี้"
                        >
                          <ExternalLink className="h-3 w-3" />
                          ตรวจสอบรายการนำเข้า
                        </Link>
                      )}
                    </div>
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {isStatus3 && (
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              หมายเหตุจีน (optional · เก็บลง hnote)
            </span>
            <textarea
              rows={2}
              value={hnotechn}
              onChange={(e) => setHnoteChn(e.target.value)}
              disabled={pending}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              placeholder="เช่น สีไม่ตรง · ขาดของบางรายการ"
            />
          </label>
        )}

        {showSubmit && (
          <Button
            type="button"
            fullWidth
            disabled={pending}
            onClick={isStatus3 ? onSubmitOrdered : onSubmitTracking}
            className="gap-1.5"
          >
            {pending ? (
              "กำลังบันทึก..."
            ) : isStatus3 ? (
              <><Save className="h-4 w-4" /> บันทึกเลขออเดอร์ร้านจีน + เปลี่ยนสถานะเป็น &ldquo;รอร้านจีนจัดส่ง&rdquo;</>
            ) : (
              <><Save className="h-4 w-4" /> บันทึกเลข Tracking จีน ({shops.length} ร้าน)</>
            )}
          </Button>
        )}

        {isStatus5 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            ออเดอร์สำเร็จ · ระบบเปิดใบฝากนำเข้าแล้วเรียบร้อย
          </div>
        )}
      </div>
    </section>
  );
}
