"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Trash2,
  Tag,
  CheckCircle2,
  X,
  Gift,
  ExternalLink,
} from "lucide-react";
import {
  applyPromoToCart,
  calculateCartTotal,
  deleteCartItem,
  removePromoFromCart,
  updateCartItemQuantity,
  validatePromoCode,
  submitCartOrder,
} from "@/actions/cart";

/**
 * Client-side interactivity for /cart — Tailwind-rebuilt (ปอน 2026-05-26).
 *
 * Behaviour is faithful to the legacy jQuery block (cart.php L788-1143):
 *   - per-row "ID[]" checkbox toggle           (cart.php L842-855)
 *   - "เลือกทั้งหมด" (.check-all) toggle        (cart.php L800-806 / L856-869)
 *   - per-row quantity input + "ราคารวม"        (cart.php L1100-1128 / L817-840)
 *   - pro2 (3.3 promo) checkbox → rsDefault 5.10 (cart.php L1035-1043 / calculateCart.php L10-12)
 *   - live #countID / cart-subtotal / cart-total / rsDefault fed by
 *     the `calculateCartTotal` Server Action
 *   - "สั่งซื้อสินค้า" submit disabled when nothing selected (cart.php L895-899)
 *
 * The legacy Bootstrap-4 classes (.product / .product-check / .check-all
 * / .ele-shopping-cart / .column-labels / .ele-price-cart / etc.) are
 * REMOVED — Tailwind covers the visual layer entirely. Form `name=`
 * attributes are PRESERVED (`ID[]`, `cAmount[]`, `pro`, `pro2`, `checkAll`,
 * etc.) because the form submits to /service-order which parses them.
 */

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type CartInteractiveRow = {
  id: number;
  cdetails: string | null;
  curl: string | null;
  ctitle: string | null;
  cnameshop: string | null;
  cprovider: string | null;
  cimages: string | null;
  cprice: number;
  camount: number;
  ccolor: string | null;
  csize: string | null;
  imageThumbUrl: string;
  imageFullUrl: string;
  providerImg: { kind: "img"; src: string } | { kind: "text"; text: string };
  count: number; // running 1-based row no. — cart.php L560
};

export type CartInteractiveShop = {
  shopName: string;
  rows: CartInteractiveRow[];
};

export type CartInteractiveProvider = {
  providerCode: string;
  providerImg: { kind: "img"; src: string } | { kind: "text"; text: string };
  shops: CartInteractiveShop[];
};

export type CartInteractivityProps = {
  /** Pre-grouped provider → shop → row tree (built SSR-side). */
  groupedProviders: CartInteractiveProvider[];
  /** Total row count — cart.php L841 `$('#countID').html(noRow-1)`. */
  totalRowCount: number;
  /** Initial rsDefault from tb_settings.rsdefault — cart.php L142-145. */
  initialRsDefault: number;
  /** Whether the date-window 3.3 promotion card is rendered. */
  promo33Active: boolean;
  /** The session member_code — used as the `cartId` belt-and-braces
      ownership check for applyPromoToCart / removePromoFromCart. */
  memberCode: string;
  /** The static SSR shipping card (.ele-addressCHN-cart, cart.php L601-651)
      passed through as JSX so it stays SSR — the cart-list + the summary
      sit on either side of it; the structural markup is a server concern. */
  shippingCard: ReactNode;
};

type AppliedPromo = {
  id:            number;
  label:         string;
  /** When `discountType==='pct'` this is a 0-100 percentage; when
      `discountType==='fixed'` it is a flat ฿ amount. */
  discount:      number;
  discountType:  "pct" | "fixed";
};

export function CartInteractivity({
  groupedProviders,
  totalRowCount,
  initialRsDefault,
  promo33Active,
  memberCode,
  shippingCard,
}: CartInteractivityProps) {
  // Selected row IDs — cart.php's `$("input:checkbox[name='ID[]']")`
  // collected into a comma-separated string at L843-851. Legacy default
  // ticks every row on page load (cart.php L799 `$('.dt-checkboxes').prop('checked', true);`)
  // — reproduced here by initialising `selectedIds` to ALL row ids.
  const allIds = useMemo(() => {
    const ids: number[] = [];
    for (const p of groupedProviders) {
      for (const s of p.shops) {
        for (const r of s.rows) ids.push(r.id);
      }
    }
    return ids;
  }, [groupedProviders]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(allIds),
  );

  // Per-row amount (the quantity input — cart.php L573-575).
  const [amounts, setAmounts] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    for (const p of groupedProviders) {
      for (const s of p.shops) {
        for (const r of s.rows) m.set(r.id, r.camount);
      }
    }
    return m;
  });

  // pro2 (3.3) promo — cart.php L670 `<input … name="pro2" id="input-19" value="77">`.
  // Toggling it makes calculateCart() send pro=19 (cart.php L871-872).
  const [pro2Checked, setPro2Checked] = useState(false);
  // The fade50 promo (PCS เหมาๆ — `input-12`). Legacy only changes the
  // border, not the totals — purely cosmetic but reproduced for fidelity.
  const [proMaomao, setProMaomao] = useState(false);

  // Listen for the popup "รับโปรโมชัน เหมา ๆ" accept dispatched from
  // <CartAddressShipBy>. The two client islands aren't parented by a
  // shared wrapper, so a `CustomEvent` is the lightest-touch bridge.
  useEffect(() => {
    function handler() {
      setProMaomao(true);
    }
    window.addEventListener("cart-maomao-accepted", handler);
    return () => window.removeEventListener("cart-maomao-accepted", handler);
  }, []);

  // ── G1 promo-code input — typed legacy `tagPro()` codes ──
  const [promoCode,    setPromoCode]    = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoBusy,    setPromoBusy]    = useState(false);
  const [promoMsg,     setPromoMsg]     = useState<{ tone: "err" | "ok"; text: string } | null>(null);

  // Server-driven totals — match the legacy AJAX response shape.
  const initialTotals = useMemo(() => {
    let priceCny = 0;
    for (const id of selectedIds) {
      const r = findRow(groupedProviders, id);
      if (r) priceCny += r.cprice * (amounts.get(id) ?? r.camount);
    }
    const rate = pro2Checked ? 5.10 : initialRsDefault;
    return {
      priceCny: numberFormat(priceCny),
      priceThb: numberFormat(priceCny * rate),
      rate: String(rate),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [totals, setTotals] = useState(initialTotals);
  const [, startTransition] = useTransition();

  // Server-action driven recompute — the calculateCart.php AJAX replacement.
  function recompute(nextSelected: Set<number>, nextPro2: boolean) {
    startTransition(async () => {
      const res = await calculateCartTotal({
        ids: Array.from(nextSelected).map(String),
        pro: nextPro2 ? "19" : undefined,
      });
      if (res.ok) {
        setTotals({
          priceCny: res.priceCny,
          priceThb: res.priceThb,
          rate: res.rate,
        });
      }
    });
  }

  function toggleRow(id: number, next: boolean) {
    const ns = new Set(selectedIds);
    if (next) ns.add(id);
    else ns.delete(id);
    setSelectedIds(ns);
    recompute(ns, pro2Checked);
  }

  function toggleAll(next: boolean) {
    const ns = next ? new Set(allIds) : new Set<number>();
    setSelectedIds(ns);
    recompute(ns, pro2Checked);
  }

  function changeAmount(id: number, val: number) {
    const safe = Number.isFinite(val) && val >= 1 ? Math.floor(val) : 1;
    const nm = new Map(amounts);
    nm.set(id, safe);
    setAmounts(nm);
    let priceCny = 0;
    for (const sel of selectedIds) {
      const r = findRow(groupedProviders, sel);
      if (r) priceCny += r.cprice * (sel === id ? safe : nm.get(sel) ?? r.camount);
    }
    const rate = pro2Checked ? 5.10 : Number(totals.rate);
    setTotals({
      priceCny: numberFormat(priceCny),
      priceThb: numberFormat(priceCny * rate),
      rate: String(rate),
    });
  }

  function togglePro2(next: boolean) {
    setPro2Checked(next);
    recompute(selectedIds, next);
  }

  // ── promo-code apply/remove handlers ──
  function handleApplyPromo() {
    const code = promoCode.trim();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    setPromoMsg(null);
    startTransition(async () => {
      const total = Number(totals.priceThb.replace(/,/g, ""));
      const v = await validatePromoCode(code, Number.isFinite(total) ? total : 0);
      if (!v.ok) {
        setPromoMsg({ tone: "err", text: v.error });
        setPromoBusy(false);
        return;
      }
      if (!v.valid) {
        setPromoMsg({ tone: "err", text: v.message ?? "โค้ดส่วนลดไม่ถูกต้อง" });
        setPromoBusy(false);
        return;
      }
      const a = await applyPromoToCart(memberCode, code);
      if (!a.ok) {
        setPromoMsg({ tone: "err", text: a.error });
        setPromoBusy(false);
        return;
      }
      setAppliedPromo({
        id:           v.promo?.id ?? 0,
        label:        v.promo?.label ?? code.toUpperCase(),
        discount:     v.discount,
        discountType: v.discountType,
      });
      setPromoMsg({ tone: "ok", text: v.message ?? "ใช้โค้ดส่วนลดสำเร็จ" });
      setPromoBusy(false);
    });
  }

  function handleRemovePromo() {
    if (promoBusy) return;
    setPromoBusy(true);
    setPromoMsg(null);
    startTransition(async () => {
      const res = await removePromoFromCart(memberCode);
      if (!res.ok) {
        setPromoMsg({ tone: "err", text: res.error });
        setPromoBusy(false);
        return;
      }
      setAppliedPromo(null);
      setPromoCode("");
      setPromoBusy(false);
    });
  }

  // Compute the discount + final total on top of the server's priceThb.
  const subtotalThb = Number(totals.priceThb.replace(/,/g, ""));
  const discountThb = (() => {
    if (!appliedPromo || !Number.isFinite(subtotalThb)) return 0;
    if (appliedPromo.discountType === "pct") {
      return subtotalThb * (appliedPromo.discount / 100);
    }
    return Math.min(appliedPromo.discount, subtotalThb);
  })();
  const finalThb = Math.max(0, subtotalThb - discountThb);

  // cart.php L895-899: the "สั่งซื้อสินค้า" submit is disabled while
  // nothing is selected.
  const submitDisabled = selectedIds.size === 0;

  // ── deleteItem.php wire — remove a row from tb_cart. ──
  const router = useRouter();
  const [busyDeleteId, setBusyDeleteId] = useState<number | null>(null);
  function handleDelete(id: number) {
    if (busyDeleteId !== null) return;
    if (!window.confirm("ลบรายการนี้ออกจากตะกร้า?")) return;
    setBusyDeleteId(id);
    startTransition(async () => {
      const res = await deleteCartItem({ id });
      setBusyDeleteId(null);
      if (!res.ok) {
        window.alert("ลบไม่สำเร็จ: " + res.error);
        return;
      }
      const ns = new Set(selectedIds);
      ns.delete(id);
      setSelectedIds(ns);
      const nm = new Map(amounts);
      nm.delete(id);
      setAmounts(nm);
      recompute(ns, pro2Checked);
      router.refresh();
    });
  }

  // ── updateQuantity.php wire — fire-and-forget the persistence write. ──
  function persistAmount(id: number, amount: number) {
    startTransition(async () => {
      await updateCartItemQuantity({ id, quantity: amount });
    });
  }

  // ── addOrder wire — "สั่งซื้อสินค้า" submit. ──
  const [submitting, setSubmitting] = useState(false);
  function handleSubmitOrder(e: React.MouseEvent<HTMLButtonElement>) {
    if (selectedIds.size === 0 || submitting) return;
    const form = e.currentTarget.form;
    if (!form) {
      window.alert("ไม่พบฟอร์ม กรุณารีเฟรชหน้าใหม่");
      return;
    }
    const fd = new FormData(form);
    const addressID = String(fd.get("addressID") ?? "");
    const hTransportType = String(fd.get("hTransportType") ?? "");
    const crate = String(fd.get("crate") ?? "");
    const hShipBy = fd.get("hShipBy");
    const payMethod = fd.get("payMethod");
    const pro = fd.get("pro");
    const pro2 = pro2Checked ? "77" : null;
    const hNote = fd.get("hNote");

    if (!addressID) {
      window.alert("กรุณาเลือกที่อยู่จัดส่ง");
      return;
    }
    if (!hTransportType) {
      window.alert("กรุณาเลือกรูปแบบการขนส่งจีน-ไทย");
      return;
    }
    if (!crate) {
      window.alert("กรุณาเลือกการตีลังไม้");
      return;
    }
    if (!window.confirm(`ยืนยันส่งออเดอร์ ${selectedIds.size} รายการ?`)) return;
    setSubmitting(true);
    startTransition(async () => {
      const res = await submitCartOrder({
        ids: Array.from(selectedIds),
        addressID,
        hTransportType,
        crate,
        hShipBy: hShipBy ? String(hShipBy) : null,
        payMethod: payMethod ? String(payMethod) : null,
        pro: pro ? String(pro) : null,
        pro2,
        hNote: hNote ? String(hNote) : null,
      });
      setSubmitting(false);
      if (!res.ok) {
        window.alert("ส่งออเดอร์ไม่สำเร็จ: " + res.error);
        return;
      }
      if (res.data?.hNo) {
        window.alert(
          `ส่งออเดอร์เรียบร้อย เลขที่ ${res.data.hNo}\nกดตกลงเพื่อไปหน้ารายละเอียด`,
        );
        router.push(`/service-order/${res.data.hNo}`);
      }
    });
  }

  const countDisplay = selectedIds.size;
  const allChecked = selectedIds.size > 0 && selectedIds.size === allIds.length;

  return (
    <>
      {/* ── Shopping-cart item list — cart.php L510-600 ── */}
      <div className="rounded-2xl bg-white border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Section header — select-all bar */}
        <div className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-border bg-gradient-to-r from-rose-50/60 via-white to-white">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="checkAll"
              value="all"
              checked={allChecked}
              onChange={(e) => toggleAll(e.target.checked)}
              className="w-4 h-4 rounded border-2 border-border accent-primary-600 cursor-pointer"
            />
            <span className="text-[12.5px] md:text-[13px] font-bold text-foreground">
              เลือกทั้งหมด
            </span>
          </label>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] md:text-[12px] text-muted">
            <ShoppingBag className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span className="notranslate">{totalRowCount}</span> รายการในตะกร้า
          </span>
        </div>

        {/* Provider → Shop → Rows */}
        <div className="divide-y divide-border">
          {groupedProviders.map((provider) => (
            <div key={provider.providerCode || "p"}>
              {/* Provider header (1688 / Taobao / Tmall / Nice / Shops) */}
              <div className="px-4 md:px-5 py-2 bg-surface/60 border-b border-border">
                <div className="flex items-center gap-2">
                  {provider.providerImg.kind === "img" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={provider.providerImg.src}
                      style={{ height: "22px" }}
                      alt=""
                    />
                  ) : (
                    <span className="text-[12.5px] font-black text-foreground tracking-wider">
                      {provider.providerImg.text}
                    </span>
                  )}
                </div>
              </div>

              {provider.shops.map((shop) => (
                <div key={shop.shopName || "s"}>
                  {/* Shop subheader */}
                  <div className="px-4 md:px-5 py-1.5 bg-amber-50/40 border-b border-amber-100/50">
                    <p className="text-[11.5px] md:text-[12px] font-bold text-amber-800">
                      <span className="text-muted font-medium">ชื่อร้าน : </span>
                      {shop.shopName}
                    </p>
                  </div>

                  {/* Product rows */}
                  {shop.rows.map((r) => {
                    const amt = amounts.get(r.id) ?? r.camount;
                    const checked = selectedIds.has(r.id);
                    const lineTotal = r.cprice * amt;
                    return (
                      <div
                        key={r.id}
                        className={`px-3 md:px-5 py-3 md:py-4 border-b border-border last:border-b-0 transition-colors ${
                          checked ? "bg-rose-50/20" : ""
                        }`}
                      >
                        <input type="hidden" className="product-id" value={r.id} readOnly />
                        <div className="grid grid-cols-[20px_64px_1fr] md:grid-cols-[24px_24px_72px_1fr_90px_90px_90px] gap-2 md:gap-3 items-start">
                          {/* Checkbox */}
                          <label className="flex items-start pt-1 cursor-pointer">
                            <input
                              type="checkbox"
                              name="ID[]"
                              value={r.id}
                              checked={checked}
                              onChange={(e) => toggleRow(r.id, e.target.checked)}
                              className="w-4 h-4 rounded border-2 border-border accent-primary-600 cursor-pointer"
                            />
                          </label>
                          {/* Index (desktop only) */}
                          <div className="hidden md:flex pt-1 text-[12px] font-bold text-muted justify-center">
                            {r.count}
                          </div>
                          {/* Image */}
                          <a
                            href={r.imageFullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-16 h-16 md:w-[72px] md:h-[72px] rounded-xl overflow-hidden bg-surface border border-border shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.imageThumbUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </a>
                          {/* Details */}
                          <div className="min-w-0">
                            <a
                              href={r.curl ?? ""}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-start gap-1 text-[12.5px] md:text-[13px] font-bold text-foreground hover:text-primary-600 line-clamp-2 transition-colors"
                            >
                              <span className="line-clamp-2">{r.ctitle ? r.ctitle : r.curl}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-60" strokeWidth={2.2} />
                            </a>
                            {(r.ccolor || r.csize) && (
                              <p className="mt-1 text-[11.5px] text-muted">
                                <span className="font-medium">{r.ccolor}</span>
                                {r.csize ? <> : <span className="font-medium">{r.csize}</span></> : null}
                              </p>
                            )}
                            {r.cdetails && (
                              <p className="mt-1 text-[11px] text-muted line-clamp-2">
                                <span className="font-bold">หมายเหตุ:</span> {r.cdetails}
                              </p>
                            )}

                            {/* Mobile-only inline price + qty row */}
                            <div className="md:hidden mt-2 flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-[11.5px] text-muted">
                                <span className="notranslate font-mono">{numberFormat(r.cprice)}</span> ¥ ×
                                <input
                                  type="number"
                                  value={amt}
                                  name="cAmount[]"
                                  min="1"
                                  step="1"
                                  onChange={(e) => changeAmount(r.id, Number(e.target.value))}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    const safe = Number.isFinite(val) && val >= 1 ? Math.floor(val) : 1;
                                    persistAmount(r.id, safe);
                                  }}
                                  className="ml-1 w-14 px-1.5 py-0.5 text-[12px] text-center rounded border border-border focus:border-primary-500 focus:ring-1 focus:ring-primary-100 focus:outline-none"
                                />
                              </div>
                              <div className="text-[13px] font-black text-primary-600 notranslate">
                                {numberFormat(lineTotal)} ¥
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDelete(r.id)}
                                disabled={busyDeleteId === r.id}
                                className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold px-2 py-0.5 hover:bg-rose-100 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" strokeWidth={2.2} />
                                {busyDeleteId === r.id ? "กำลังลบ..." : "ลบ"}
                              </button>
                            </div>
                          </div>

                          {/* Desktop-only — price, qty, remove, line-total columns */}
                          <div className="hidden md:flex flex-col items-end pt-1">
                            <div className="text-[12px] text-muted">ราคา/ชิ้น</div>
                            <div className="text-[13px] font-bold notranslate font-mono">
                              {numberFormat(r.cprice)}
                            </div>
                          </div>
                          <div className="hidden md:flex flex-col items-center pt-1">
                            <div className="text-[12px] text-muted mb-1">จำนวน</div>
                            <input
                              type="number"
                              value={amt}
                              name="cAmount[]"
                              min="1"
                              step="1"
                              onChange={(e) => changeAmount(r.id, Number(e.target.value))}
                              onBlur={(e) => {
                                const val = Number(e.target.value);
                                const safe = Number.isFinite(val) && val >= 1 ? Math.floor(val) : 1;
                                persistAmount(r.id, safe);
                              }}
                              className="w-16 px-2 py-1 text-[13px] text-center rounded-lg border border-border focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none"
                            />
                          </div>
                          <div className="hidden md:flex flex-col items-end pt-1">
                            <div className="text-[12px] text-muted mb-1">ราคารวม</div>
                            <div className="text-[13.5px] font-black text-primary-600 notranslate font-mono">
                              {numberFormat(lineTotal)}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              disabled={busyDeleteId === r.id}
                              className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold px-2 py-0.5 hover:bg-rose-100 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" strokeWidth={2.2} />
                              {busyDeleteId === r.id ? "ลบ..." : "ลบ"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── China→Thailand shipping card (SSR JSX) ── */}
      {shippingCard}

      {/* ── Promotion + order-summary card — cart.php L652-727 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Promotions (left) */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] p-4 md:p-5">
          <h3 className="flex items-center gap-2 text-[15px] md:text-[16px] font-bold text-foreground mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50 text-primary-600">
              <Gift className="w-4 h-4" strokeWidth={2.2} />
            </span>
            โปรโมชันสำหรับคุณ
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* maomao promo card */}
            <label
              htmlFor="input-12"
              className={`relative rounded-xl border-2 cursor-pointer overflow-hidden transition-all ${
                proMaomao
                  ? "border-primary-500 ring-2 ring-primary-100 shadow-md shadow-primary-600/10"
                  : "border-border hover:border-primary-300"
              }`}
            >
              <input
                type="checkbox"
                name="pro"
                id="input-12"
                value="f"
                checked={proMaomao}
                onChange={(e) => setProMaomao(e.target.checked)}
                className="sr-only"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/legacy/pcs/theme/free50-3.png"
                alt="Pacred เหมา ๆ ฟรี 50 บาท"
                className="block w-full h-auto"
              />
              <div className="px-2.5 py-1.5 bg-white text-center">
                <Link
                  href="/services/import-china"
                  className="text-[11.5px] font-bold text-primary-600 hover:underline inline-flex items-center gap-0.5"
                >
                  ดูพื้นที่จัดส่งและรายละเอียด
                  <ExternalLink className="w-2.5 h-2.5" strokeWidth={2.2} />
                </Link>
              </div>
              {proMaomao && (
                <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white shadow-md">
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                </span>
              )}
            </label>

            {/* 3.3 time-window promo */}
            {promo33Active && (
              <label
                htmlFor="input-19"
                className={`relative rounded-xl border-2 cursor-pointer overflow-hidden transition-all ${
                  pro2Checked
                    ? "border-primary-500 ring-2 ring-primary-100 shadow-md shadow-primary-600/10"
                    : "border-border hover:border-primary-300"
                }`}
              >
                <input
                  type="checkbox"
                  name="pro2"
                  id="input-19"
                  value="77"
                  checked={pro2Checked}
                  onChange={(e) => togglePro2(e.target.checked)}
                  className="sr-only"
                />
                {/* TODO(brand): legacy WordPress promo asset was
                    https://pcscargo.co.th/wp-content/uploads/2026/03/3.3-07-768x477.jpg
                    — needs a Pacred-hosted replacement from ปอน before
                    this March-3.3 window re-activates. The checkbox below
                    still works (functional toggle); only the visual is
                    stubbed to avoid a brand-leaking URL in customer source. */}
                <div className="block w-full aspect-[768/477] bg-surface-alt flex items-center justify-center text-muted text-xs">
                  โปรโมชัน 3.3 (รอ asset ใหม่)
                </div>
                <div className="px-2.5 py-1.5 bg-white text-center">
                  <Link
                    href="/services/import-china"
                    className="text-[11.5px] font-bold text-primary-600 hover:underline inline-flex items-center gap-0.5"
                  >
                    ดูรายละเอียดโปรโมชัน
                    <ExternalLink className="w-2.5 h-2.5" strokeWidth={2.2} />
                  </Link>
                </div>
                {pro2Checked && (
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white shadow-md">
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </span>
                )}
              </label>
            )}
          </div>

          <p className="mt-3 text-[11px] text-rose-700 leading-relaxed">
            * หากสินค้ามีขนาดเล็กบริษัทแนะนำให้เลือกขนส่งเป็น Flash Express (เริ่มต้น 30 บ.)
          </p>

          {/* ── G1 promo-code input ── */}
          <div className="mt-3 pt-3 border-t border-border">
            {appliedPromo ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11.5px] font-bold px-2.5 py-1">
                  <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                  {appliedPromo.label}
                </span>
                <span className="text-[12px] text-muted">
                  ส่วนลด{" "}
                  <span className="font-bold text-emerald-700 notranslate">
                    {appliedPromo.discountType === "pct"
                      ? `${appliedPromo.discount}%`
                      : `${numberFormat(appliedPromo.discount)} ฿`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleRemovePromo}
                  disabled={promoBusy}
                  className="ml-auto text-[12px] text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
                >
                  ลบ
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <label htmlFor="promo-code-input" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-foreground">
                  <Tag className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.2} />
                  มีโค้ดส่วนลด?
                </label>
                <input
                  id="promo-code-input"
                  type="text"
                  placeholder="เช่น PCSF"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyPromo();
                    }
                  }}
                  maxLength={32}
                  disabled={promoBusy}
                  className="flex-1 min-w-[140px] max-w-[200px] px-3 py-1.5 text-[12.5px] rounded-lg border border-border focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none disabled:bg-surface"
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={promoBusy || promoCode.trim().length === 0}
                  className="inline-flex items-center gap-1 rounded-full bg-white text-primary-600 border-2 border-primary-600 text-[12px] font-bold px-3 py-1.5 hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {promoBusy ? "กำลังตรวจ..." : "ใช้โค้ด"}
                </button>
              </div>
            )}
            {promoMsg && (
              <div className={`mt-1.5 text-[11.5px] ${promoMsg.tone === "err" ? "text-rose-600" : "text-emerald-700"}`}>
                {promoMsg.text}
              </div>
            )}
          </div>
        </div>

        {/* Order summary (right) */}
        <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-white via-rose-50/30 to-rose-100/40 border border-rose-100 shadow-[0_6px_20px_rgba(179,0,0,0.08)] p-4 md:p-5 flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-2 text-[15px] md:text-[16px] font-bold text-foreground">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-600 text-white shadow-md shadow-primary-600/25">
                <ShoppingBag className="w-4 h-4" strokeWidth={2.2} />
              </span>
              สรุปรายการสั่งซื้อ
            </h3>
            <span className="text-[11px] text-muted shrink-0">
              เลือก <span id="countID" className="font-bold text-primary-600 notranslate">{countDisplay}</span> รายการ
            </span>
          </div>

          <dl className="space-y-1.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">รวม (¥)</dt>
              <dd id="cart-subtotal" className="font-bold notranslate font-mono">
                {totals.priceCny}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">เรทแลกเปลี่ยน</dt>
              <dd id="rsDefault" className="font-bold notranslate font-mono">
                {totals.rate}
              </dd>
            </div>
            {appliedPromo && (
              <div className="flex items-baseline justify-between gap-2 text-emerald-700">
                <dt>ส่วนลด ({appliedPromo.label})</dt>
                <dd id="cart-promo-discount" className="font-bold notranslate font-mono">
                  -{numberFormat(discountThb)}
                </dd>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-rose-200/60 flex items-baseline justify-between gap-2">
              <dt className="text-[13.5px] font-bold text-foreground">ราคารวมสุทธิ</dt>
              <dd id="cart-total" className="text-[20px] md:text-[22px] font-black text-primary-600 notranslate font-mono leading-none">
                {appliedPromo ? numberFormat(finalThb) : totals.priceThb}
                <span className="text-[12px] font-bold text-muted ml-1">฿</span>
              </dd>
            </div>
          </dl>

          {/* Submit CTA — wired to `submitCartOrder`. */}
          <button
            type="button"
            name="addOrder"
            disabled={submitDisabled || submitting}
            onClick={handleSubmitOrder}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[14px] md:text-[15px] font-bold px-4 py-2.5 md:py-3 shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg"
          >
            {submitting ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                กำลังส่งออเดอร์...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                สั่งซื้อสินค้า
              </>
            )}
          </button>
          {submitDisabled && (
            <p className="mt-2 text-[11px] text-rose-600 text-center inline-flex items-center justify-center gap-1">
              <X className="w-3 h-3" strokeWidth={2.5} />
              กรุณาเลือกสินค้าอย่างน้อย 1 รายการ
            </p>
          )}
        </div>
      </div>

      {/* totalRowCount carried as hidden data for QA. */}
      <span hidden data-total-rows={totalRowCount} />
    </>
  );
}

function findRow(
  providers: CartInteractiveProvider[],
  id: number,
): CartInteractiveRow | undefined {
  for (const p of providers) {
    for (const s of p.shops) {
      for (const r of s.rows) {
        if (r.id === id) return r;
      }
    }
  }
  return undefined;
}
