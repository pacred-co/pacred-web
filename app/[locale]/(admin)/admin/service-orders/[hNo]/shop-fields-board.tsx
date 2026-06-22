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
import { Store, Save, ExternalLink, CheckCircle2, Truck, Coins, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminMarkShopOrderOrdered,
  adminUpdateShopTracking,
} from "@/actions/admin/service-orders-shop-workflow";
import {
  adminUpdateCartItemPriceUpdate,
  adminUpdateCartItemShippingNumber,
  adminUpdateCartItemCTracking,
} from "@/actions/admin/service-orders-line-edits";

export type ShopFieldsItem = {
  id: number;
  ctitle: string;
  camount: number;
  cprice: number;
  cpriceupdate: number;
  crewallet: string | null;
  // 2026-06-05 (ภูม flag — merge tracking inputs INTO items table per legacy
  // PCS shops/update.php) — display fields so this card can render the full
  // per-shop items table (image + link + variant + ค่าส่งจีน + รวม).
  coverUrl?: string | null;
  curl?: string | null;
  ccolor?: string | null;
  csize?: string | null;
  cshippingchn?: number;
};
export type ShopFieldsRow = {
  cnameshop: string;
  cshippingnumber: string;
  ctrackingnumber: string;
  items?: ShopFieldsItem[];   // per-line ¥ cPriceUpdate (legacy update3.php L85)
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
        <span className="ml-auto text-[11px] bg-white/20 rounded px-1.5 py-0.5">
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

        <div className="space-y-3">
          {shops.map((sh) => {
            const d = draft[sh.cnameshop] ?? { cshippingnumber: "", ctrackingnumber: "" };
            const shopFwdSearchHref = sh.ctrackingnumber
              ? `/admin/forwarders?q=${encodeURIComponent(sh.ctrackingnumber)}`
              : null;
            // ── Per-shop totals (legacy shops/update.php) ──────────────
            // sum(amount × price + cshippingchn) — in ¥; the table at the
            // top of /edit already shows the ¥ rate × THB summary, so we
            // surface only the ¥ subtotal in the shop header chip.
            const shopItems = sh.items ?? [];
            const shopSubtotalCny = shopItems.reduce((sum, it) => {
              if (it.crewallet === "1") return sum;
              return sum + it.camount * it.cprice + Number(it.cshippingchn ?? 0);
            }, 0);
            return (
              <div
                key={sh.cnameshop}
                className="rounded-xl border-2 border-primary-200 bg-white dark:bg-surface shadow-sm overflow-hidden"
              >
                {/* ── Shop band header (legacy shops/update.php — ชื่อร้าน band) */}
                <div className="bg-primary-50 dark:bg-primary-950/30 border-b border-primary-200 px-3 py-2 flex flex-wrap items-center gap-2">
                  <Store className="h-4 w-4 text-primary-600 shrink-0" />
                  <span className="text-sm font-bold text-foreground">
                    ชื่อร้าน: <span className="font-normal">{sh.cnameshop}</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-white/80 border border-border px-2 py-0.5 font-mono tabular-nums">
                      {shopItems.length} รายการ
                    </span>
                    <span className="rounded bg-white/80 border border-border px-2 py-0.5 font-mono tabular-nums">
                      ¥ {shopSubtotalCny.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>

                {/* ── Tracking inputs (top of the shop card) ──
                    Legacy `shops/update3.php` + `update4.php` put these
                    INSIDE the shop's items table; we use a 2-up grid that
                    sits between the shop header and the items table so the
                    admin sees them right next to the items they belong to. */}
                <div className="px-3 py-2.5 bg-amber-50/40 border-b border-border grid sm:grid-cols-2 gap-2">
                  {/* cshippingnumber — editable at status 3 (initial save
                      via the bottom bulk submit · adminMarkShopOrderOrdered).
                      Locked at 4/5 — but the inline "แก้คำผิด" sub-form
                      below opens the typo-fix path (E3.5 ·
                      adminUpdateCartItemShippingNumber). */}
                  <div className="space-y-1">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                        เลขออเดอร์ร้านจีน{" "}
                        {isStatus3 && <span className="text-red-500">*</span>}
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
                    {(isStatus4 || isStatus5) && (
                      <ShippingNumberTypoFixer
                        hNo={hNo}
                        cNameShop={sh.cnameshop}
                        currentShippingNumber={sh.cshippingnumber}
                        onSaved={() => router.refresh()}
                      />
                    )}
                  </div>

                  {/* ctrackingnumber — editable at status 4 · readonly at 5
                      · placeholder cell at status 3 (so the grid keeps shape) */}
                  {(isStatus4 || isStatus5) ? (
                    <div className="space-y-1">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                          <Truck className="h-3 w-3" /> เลข Tracking จีน
                          {isStatus4 && <span className="text-muted/70 font-normal">(หลายเลข ใส่ , คั่น)</span>}
                        </span>
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={d.ctrackingnumber}
                            onChange={(e) => setField(sh.cnameshop, "ctrackingnumber", e.target.value)}
                            disabled={!isStatus4 || pending}
                            placeholder="เลข Tracking จีน"
                            className={inputCls}
                          />
                          {shopFwdSearchHref && (
                            <Link
                              href={shopFwdSearchHref}
                              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-2.5 py-2 text-[11px] font-medium text-primary-700 hover:bg-primary-100"
                              title="ค้นหารายการฝากนำเข้าตามเลข tracking นี้"
                            >
                              <ExternalLink className="h-3 w-3" />
                              ตรวจสอบ
                            </Link>
                          )}
                        </div>
                      </label>
                      <TrackingTypoFixer
                        hNo={hNo}
                        currentBag={sh.ctrackingnumber}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>

                {/* ── Items table (per-shop · legacy shops/update.php รายการสินค้า)
                    Columns mirror legacy: ข้อมูลสินค้า · จำนวน · ¥ราคาต่อชิ้น
                    · ค่าส่งจีน · เพิ่ม/ลด ¥ (inline editable at status 3/4)
                    · รวม ¥. Hidden if items[] not provided. */}
                {shopItems.length > 0 && (
                  <div className="overflow-x-auto scrollbar-x-visible">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-2 py-2 text-left">ข้อมูลสินค้า</th>
                          <th className="px-2 py-2 text-right w-14">จำนวน</th>
                          <th className="px-2 py-2 text-right w-20">¥/ชิ้น</th>
                          <th className="px-2 py-2 text-right w-20">ค่าส่งจีน</th>
                          <th className="px-2 py-2 text-right w-36">
                            <span className="inline-flex items-center gap-1">
                              <Coins className="h-3 w-3" /> เพิ่ม/ลด ¥
                            </span>
                          </th>
                          <th className="px-2 py-2 text-right w-24">รวม ¥</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopItems.map((it) => {
                          const refunded = it.crewallet === "1";
                          const shipping = Number(it.cshippingchn ?? 0);
                          const line = refunded
                            ? 0
                            : it.camount * it.cprice + shipping;
                          return (
                            <tr
                              key={it.id}
                              className={`border-t border-border ${refunded ? "bg-red-50/40" : ""}`}
                            >
                              <td className="px-2 py-2 align-top">
                                <div className="flex gap-2">
                                  {it.coverUrl ? (
                                    <a href={it.coverUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={it.coverUrl} alt={it.ctitle ?? ""} className="h-10 w-10 rounded border border-border object-cover" />
                                    </a>
                                  ) : null}
                                  <div className="min-w-0">
                                    {it.curl ? (
                                      <a
                                        href={it.curl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block truncate max-w-[280px] text-primary-600 hover:underline"
                                        title={it.ctitle ?? ""}
                                      >
                                        {it.ctitle || it.curl}
                                      </a>
                                    ) : (
                                      <span className="block truncate max-w-[280px]" title={it.ctitle ?? ""}>
                                        {it.ctitle || "—"}
                                      </span>
                                    )}
                                    {(it.ccolor || it.csize) && (
                                      <p className="text-[11px] text-muted">
                                        {it.ccolor}{it.ccolor && it.csize ? " · " : ""}{it.csize}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                                {refunded ? 0 : it.camount}
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                                {it.cprice.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                                {shipping.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <InlinePriceUpdateCell
                                  item={it}
                                  editable={isStatus3 || isStatus4}
                                  onSaved={() => router.refresh()}
                                />
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums font-semibold">
                                {line.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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

// ────────────────────────────────────────────────────────────
// InlinePriceUpdateCell — per-line ¥ add/subtract (cPriceUpdate) rendered
// INSIDE the per-shop items table cell (2026-06-05 ภูม flag — merge tracking
// + price-update inputs INTO the items table per legacy PCS layout).
// Legacy update3.php L85 (cPriceUpdate[]) + update4 inline update_cPriceUpdate
// (shops.php L1806). Saves via adminUpdateCartItemPriceUpdate → delta-adjusts
// the header hPriceUpdate. confirm-before-mutate (§0f · native dialog).
// ────────────────────────────────────────────────────────────
function InlinePriceUpdateCell({
  item,
  editable,
  onSaved,
}: {
  item: ShopFieldsItem;
  editable: boolean;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(String(item.cpriceupdate ?? 0));
  const [rowErr, setRowErr] = useState<string | null>(null);
  const refunded = item.crewallet === "1";

  function save() {
    setRowErr(null);
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) { setRowErr("ตัวเลขไม่ถูกต้อง"); return; }
    if (Math.abs(n - Number(item.cpriceupdate ?? 0)) < 0.005) { setRowErr("ไม่เปลี่ยน"); return; }
    if (!confirm(`บันทึก ¥ เพิ่ม/ลด ของ "${item.ctitle || `#${item.id}`}" = ${n.toFixed(2)} ?`)) return;
    startTransition(async () => {
      const res = await adminUpdateCartItemPriceUpdate({ tb_order_id: item.id, c_price_update: n });
      if (res.ok) onSaved();
      else setRowErr(res.error);
    });
  }

  if (refunded) {
    return <div className="text-right text-[11px] text-red-500">คืนเงินแล้ว</div>;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="number"
          min={0}
          step={0.01}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!editable || pending}
          className="w-20 rounded border border-border px-2 py-1 text-right font-mono text-xs disabled:opacity-50 disabled:bg-surface-alt"
        />
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="shrink-0 rounded border border-primary-300 text-primary-700 px-2 py-1 text-[11px] hover:bg-primary-50 disabled:opacity-50"
            title="บันทึก ¥ เพิ่ม/ลด รายการนี้"
          >
            บันทึก
          </button>
        )}
      </div>
      {rowErr && <span className="text-[11px] text-red-600">{rowErr}</span>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ShippingNumberTypoFixer — toggles a "แก้คำผิด" inline form so an
// admin can correct a typo in the per-shop cshippingnumber AFTER
// status 4/5 was reached. Calls adminUpdateCartItemShippingNumber
// which is gated server-side to hstatus IN {3,4,5}.
// confirm-before-mutate (§0f · native dialog).
// Task #228 · E3.5 (legacy shops.php L1793-1805).
// ────────────────────────────────────────────────────────────
function ShippingNumberTypoFixer({
  hNo,
  cNameShop,
  currentShippingNumber,
  onSaved,
}: {
  hNo: string;
  cNameShop: string;
  currentShippingNumber: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(currentShippingNumber);
  const [pending, startTransition] = useTransition();
  const [rowErr, setRowErr] = useState<string | null>(null);

  function save() {
    setRowErr(null);
    const next = val.trim();
    if (next === (currentShippingNumber ?? "").trim()) {
      setRowErr("ไม่มีการเปลี่ยนแปลง");
      return;
    }
    if (!confirm(
      `แก้คำผิดเลขออเดอร์ร้านจีน "${cNameShop}"?\n\n` +
      `เดิม: ${currentShippingNumber || "(ว่าง)"}\n` +
      `ใหม่: ${next || "(ว่าง — จะล้างค่า)"}`,
    )) return;
    startTransition(async () => {
      const res = await adminUpdateCartItemShippingNumber({
        h_no: hNo, c_name_shop: cNameShop, c_shipping_number: next,
      });
      if (res.ok) {
        setOpen(false);
        onSaved();
      } else {
        setRowErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setVal(currentShippingNumber); setRowErr(null); }}
        className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
        title="แก้คำผิดเลขออเดอร์ร้านจีน (E3.5)"
      >
        <Pencil className="h-3 w-3" /> แก้คำผิด
      </button>
    );
  }
  return (
    <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={pending}
        placeholder="เลขออเดอร์ร้านจีนใหม่"
        className={inputCls}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded border border-primary-300 bg-primary-500 text-white px-2.5 py-1 text-[11px] hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? "บันทึก..." : "บันทึกแก้คำผิด"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setRowErr(null); }}
          disabled={pending}
          className="rounded border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
      {rowErr && <p className="text-[11px] text-red-600">{rowErr}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// TrackingTypoFixer — opens an inline OLD→NEW swap form for a single
// tracking number inside the per-shop comma-separated ctrackingnumber
// bag. Calls adminUpdateCartItemCTracking which (a) bag-replaces the
// exact token across all matching tb_order rows, (b) cascades the
// rename into tb_forwarder.ftrackingchn, (c) notifies the customer.
// Server gate: hstatus IN {4,5}.
// Task #228 · E3.17 (legacy shops.php L776-815 + detail.php L260,288).
// ────────────────────────────────────────────────────────────
function TrackingTypoFixer({
  hNo,
  currentBag,
  onSaved,
}: {
  hNo: string;
  currentBag: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [oldTok, setOldTok] = useState("");
  const [newTok, setNewTok] = useState("");
  const [pending, startTransition] = useTransition();
  const [rowErr, setRowErr] = useState<string | null>(null);

  // Suggest the first token from the current bag so the admin doesn't
  // re-type a long string.
  const suggestions = currentBag
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  function save() {
    setRowErr(null);
    const o = oldTok.trim();
    const n = newTok.trim();
    if (!o) { setRowErr("ระบุเลข tracking เดิม"); return; }
    if (!n) { setRowErr("ระบุเลข tracking ใหม่"); return; }
    if (o === n) { setRowErr("เลข tracking ใหม่เหมือนเดิม"); return; }
    if (!confirm(
      `แก้คำผิดเลข tracking?\n\n` +
      `เดิม: ${o}\n` +
      `ใหม่: ${n}\n\n` +
      `จะอัพเดททุก tb_order ของออเดอร์นี้ + cascade ไป tb_forwarder + แจ้งลูกค้า`,
    )) return;
    startTransition(async () => {
      const res = await adminUpdateCartItemCTracking({
        h_no: hNo,
        c_tracking_number_old: o,
        c_tracking_number_new: n,
      });
      if (res.ok) {
        setOpen(false);
        setOldTok("");
        setNewTok("");
        onSaved();
      } else {
        setRowErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setRowErr(null); }}
        className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
        title="แก้คำผิดเลข tracking (E3.17)"
      >
        <Pencil className="h-3 w-3" /> แก้คำผิด
      </button>
    );
  }
  return (
    <div className="space-y-1.5 rounded border border-amber-300 bg-amber-50 p-2">
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold text-muted">เลข tracking เดิม (ที่ผิด)</span>
        <input
          type="text"
          list={`trk-sugg-${hNo}`}
          value={oldTok}
          onChange={(e) => setOldTok(e.target.value)}
          disabled={pending}
          placeholder={suggestions[0] || "เลข tracking เดิม"}
          className={inputCls}
        />
        {suggestions.length > 0 && (
          <datalist id={`trk-sugg-${hNo}`}>
            {suggestions.map((s) => (<option key={s} value={s} />))}
          </datalist>
        )}
      </label>
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold text-muted">เลข tracking ใหม่ (ถูกต้อง)</span>
        <input
          type="text"
          value={newTok}
          onChange={(e) => setNewTok(e.target.value)}
          disabled={pending}
          placeholder="เลข tracking ใหม่"
          className={inputCls}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded border border-primary-300 bg-primary-500 text-white px-2.5 py-1 text-[11px] hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? "บันทึก..." : "บันทึกแก้คำผิด + แจ้งลูกค้า"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setRowErr(null); }}
          disabled={pending}
          className="rounded border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
      {rowErr && <p className="text-[11px] text-red-600">{rowErr}</p>}
    </div>
  );
}
