"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { calculateCartTotal } from "@/actions/cart";

/**
 * Client-side interactivity for /cart — faithful port of the jQuery
 * block in `member/cart.php` L788-1143 (D1 / ADR-0017).
 *
 * The SSR page (`app/[locale]/(protected)/cart/page.tsx`) renders the
 * static chrome (address card, transport/crate radios, promotion
 * modal, etc.) and groups the cart rows by provider → shop. This
 * component takes that pre-grouped tree as a prop and owns the
 * interactive surface:
 *
 *   - per-row "ID[]" checkbox toggle           (cart.php L842-855)
 *   - "เลือกทั้งหมด" (.check-all) toggle        (cart.php L800-806 / L856-869)
 *   - per-row quantity input + "ราคารวม"        (cart.php L1100-1128 / L817-840)
 *   - pro2 (3.3 promo) checkbox → rsDefault 5.10 (cart.php L1035-1043 / calculateCart.php L10-12)
 *   - live #countID / #cart-subtotal / #cart-total / #rsDefault
 *     fed by the calculateCart.php AJAX endpoint, replaced here by
 *     the `calculateCartTotal` Server Action.
 *   - "สั่งซื้อสินค้า" submit disabled when nothing selected
 *     (cart.php L895-899).
 *
 * Note — the legacy CSS classes (.product / .product-check /
 * .dt-checkboxes / .check-all / .product-line-price / .cart-subtotal
 * / .cart-total / #rsDefault / #countID / .totals-value /
 * .totals-value2 / .totals-value4 / .ele-shopping-cart / .shopping-cart
 * / .column-labels / .ele-item-2 / .ele-item-3 / .border-main19-de
 * etc.) are kept verbatim so the static `/legacy/pcs/cart.css` styles
 * match the SSR markup 1:1.
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
  /** The static SSR shipping card (.ele-addressCHN-cart, cart.php L601-651)
      passed through as JSX so it stays SSR — the cart-list + the summary
      sit on either side of it; the structural markup is a server concern. */
  shippingCard: ReactNode;
};

export function CartInteractivity({
  groupedProviders,
  totalRowCount,
  initialRsDefault,
  promo33Active,
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

  // Per-row amount (the quantity input — cart.php L573-575). The
  // legacy lets the user edit it inline + recalculates the row line
  // total via the recalculateCart() helper (cart.php L817-840). Kept
  // here as controlled state so the row total + grand total stay
  // consistent without a roundtrip to updateQuantity.php for the
  // display (the persistence to tb_cart still needs that endpoint —
  // unwired in the read view; FLAGGED in the page header).
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

  // Server-driven totals — match the legacy AJAX response shape.
  // Defaults match the page-first-load behaviour: legacy calls
  // calculateCart() on the very first render (cart.php L816), with
  // ALL rows ticked, so we precompute the same total inline from the
  // initial rsDefault. The first transition replaces it with the
  // server result, so any rate drift between SSR + the action is
  // resolved (defensive against stale-on-bfcache).
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
    // We deliberately compute once on mount; recompute is driven by
    // the action call below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [totals, setTotals] = useState(initialTotals);
  const [, startTransition] = useTransition();

  // Server-action driven recompute — the calculateCart.php AJAX
  // replacement (cart.php L885-894). useTransition keeps UI responsive
  // when many rows toggle in quick succession (e.g. "เลือกทั้งหมด").
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
    // cart.php L1100-1128: updateQuantity() recomputes via
    // recalculateCart() (client-side per-row) AND POSTs to
    // updateQuantity.php (persistence). The persistence write needs
    // a separate Server Action ("updateCartItemAmount") — out of
    // scope for the interactivity wiring; the recompute via the
    // calculateCart endpoint is sufficient for the visible totals
    // because the action re-reads the row from tb_cart on each call.
    // To avoid stale grand-total against the typed-amount, we do the
    // grand-total client-side here (mirrors legacy recalculateCart
    // which is also client-side at cart.php L823-826).
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

  // cart.php L895-899: the "สั่งซื้อสินค้า" submit is disabled while
  // nothing is selected.
  const submitDisabled = selectedIds.size === 0;

  const countDisplay = selectedIds.size;

  return (
    <>
      {/* ── Shopping-cart item list — cart.php L510-600 ── */}
      <div className="ele-shopping-cart mb-2">
        <div className="shopping-cart">
          {/* cart.php L512-521 — the column-label header row */}
          <div className="ele-item-3 column-labels">
            <label className="product-check">
              <input
                type="checkbox"
                name="checkAll"
                className="dt-checkboxes check-all"
                value="all"
                checked={
                  selectedIds.size > 0 && selectedIds.size === allIds.length
                }
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </label>
            <label className="product-count"></label>
            <label className="product-image"></label>
            <label className="product-details">รายละเอียดสินค้า</label>
            <label className="product-price">ราคาต่อชิ้น</label>
            <label className="product-quantity">จำนวน</label>
            <label className="product-removal">ตัวเลือก</label>
            <label className="product-line-price">ราคารวม</label>
          </div>
          {/* cart.php L522-598 — provider → shop → rows */}
          {groupedProviders.map((provider) => (
            <div key={provider.providerCode || "p"}>
              <div className="text-center bg-white box-shadow2">
                <h5 className="p-0">
                  <b>
                    {provider.providerImg.kind === "img" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={provider.providerImg.src}
                        style={{ height: "30px" }}
                        alt=""
                      />
                    ) : (
                      provider.providerImg.text
                    )}
                  </b>
                </h5>
              </div>
              {provider.shops.map((shop) => (
                <div className="ele-item-2" key={shop.shopName || "s"}>
                  <div className="text-center bg-light box-shadow2">
                    <h5 className="p-05">
                      <b>{"ชื่อร้าน : " + shop.shopName}</b>
                    </h5>
                  </div>
                  {shop.rows.map((r) => {
                    const amt = amounts.get(r.id) ?? r.camount;
                    const checked = selectedIds.has(r.id);
                    return (
                      <div className="product" key={r.id}>
                        <input
                          type="hidden"
                          className="product-id"
                          value={r.id}
                          readOnly
                        />
                        <div className="product-check text-center cursor-pointer">
                          <input
                            type="checkbox"
                            name="ID[]"
                            className="dt-checkboxes"
                            value={r.id}
                            checked={checked}
                            onChange={(e) =>
                              toggleRow(r.id, e.target.checked)
                            }
                          />
                        </div>
                        <div className="product-count text-center">{r.count}</div>
                        <div className="product-image">
                          <a
                            className="image-popup-vertical-fit el-link"
                            href={r.imageFullUrl}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="img-fluid imageClass"
                              src={r.imageThumbUrl}
                              alt=""
                            />
                          </a>
                        </div>
                        <div className="product-details">
                          <div className="product-title">
                            <a
                              href={r.curl ?? ""}
                              className="text-info"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.ctitle ? r.ctitle : r.curl}
                            </a>
                          </div>
                          <p className="mb-0">
                            <b>
                              <span>{r.ccolor}</span> :{" "}
                              <span>{r.csize}</span>
                            </b>
                          </p>
                          <p className="product-description">
                            <b>หมายเหตุ :</b> {r.cdetails}
                          </p>
                        </div>
                        <div className="product-price notranslate">
                          {numberFormat(r.cprice)}
                        </div>
                        <div className="product-quantity">
                          <input
                            type="number"
                            className="input-product-quantity"
                            value={amt}
                            name="cAmount[]"
                            min="1"
                            step="1"
                            onChange={(e) =>
                              changeAmount(r.id, Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="product-removal">
                          {/* cart.php L576-578: the .remove-product trash
                              button. The legacy `deleteItem.php` AJAX is
                              NOT wired here — removing a row is a
                              mutation that belongs on a separate Server
                              Action (FLAGGED in the page header §1). The
                              button renders 1:1 so the legacy CSS hits
                              the same selector. */}
                          <button
                            type="button"
                            className="remove-product font-12 btn btn-outline-danger round"
                          >
                            <i className="ft-trash"></i> ลบ{" "}
                          </button>
                        </div>
                        <div className="product-line-price notranslate">
                          {numberFormat(r.cprice * amt)}
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

      {/* ── China→Thailand shipping card (passes through as SSR JSX) ──
          cart.php L601-651 — the .ele-addressCHN-cart sits between
          the shopping-cart list and the price card. It has no own
          interactivity (transport-type / crate radios are plain form
          inputs that submit with the form), so it's rendered SSR-side
          and threaded through as a prop. */}
      {shippingCard}

      {/* ── Promotion + order-summary card — cart.php L652-727 ── */}
      <div className="ele-price-cart p-1 mb-2">
        <div className="row">
          <div className="col-md-7">
            <div className="ele-promotion-cart box-shadow">
              <div className="p-1">
                <h3 className="text-color mb-1">
                  <i className="fa fa-shopping-bag"></i>{" "}
                  โปรโมชันสำหรับคุณ
                </h3>
                <div className="row">
                  <div className="col-12 col-md-4 text-center maomao">
                    <fieldset
                      className={
                        proMaomao
                          ? "border-main12-de cursor-pointer border-main"
                          : "border-main12-de cursor-pointer"
                      }
                    >
                      <div className="">
                        <input
                          type="checkbox"
                          className="checkboxes-color"
                          style={{ display: "block" }}
                          name="pro"
                          id="input-12"
                          value="f"
                          checked={proMaomao}
                          onChange={(e) => setProMaomao(e.target.checked)}
                        />
                      </div>
                      <label
                        htmlFor="input-12"
                        className="text-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="img-fluid cursor-pointer card-promotion"
                          src="/legacy/pcs/theme/free50-3.png"
                          alt=""
                        />
                        <br />
                        <Link href="/services/import-china">
                          <span className="text-info">
                            ดูพื้นที่จัดส่งและรายละเอียด
                          </span>
                        </Link>
                      </label>
                    </fieldset>
                  </div>
                  {/* cart.php L667-676 — the time-boxed 3.3 promo */}
                  {promo33Active && (
                    <div className="col-12 col-md-4 text-center">
                      <fieldset
                        className={
                          pro2Checked
                            ? "border-main19-de cursor-pointer border-main"
                            : "border-main19-de cursor-pointer"
                        }
                      >
                        <div className="">
                          <input
                            type="checkbox"
                            className="checkboxes-color"
                            style={{ display: "block" }}
                            name="pro2"
                            id="input-19"
                            value="77"
                            checked={pro2Checked}
                            onChange={(e) => togglePro2(e.target.checked)}
                          />
                        </div>
                        <label
                          htmlFor="input-19"
                          className="text-center"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="img-fluid cursor-pointer card-promotion"
                            src="https://pcscargo.co.th/wp-content/uploads/2026/03/3.3-07-768x477.jpg"
                            alt=""
                          />
                          <br />
                          <Link href="/services/import-china">
                            <span className="text-info">
                              ดูรายละเอียดโปรโมชัน
                            </span>
                          </Link>
                        </label>
                      </fieldset>
                    </div>
                  )}
                  <div
                    className="col-12 col-md-8 note-ship"
                    style={{}}
                  >
                    {/* cart.php L677-688 — the per-user "no 50฿" list
                        (include/pages/oop/user-not-50.json). FLAGGED:
                        the JSON file is a static config asset, not a
                        tb_* table — not ported. The block renders
                        nothing for users not in the file. */}
                    <div className="pr-1 text-right" style={{}}>
                      <span className="text-danger">
                        *หากสินค้ามีขนาดเล็กบริษัทแนะนำให้เลือกขนส่งเป็น
                        Flash Express (เริ่มต้น 30 บ.)
                        <br />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-5 ele-total-price box-shadow p-1">
            <div className="float-right">
              <label>
                เลือกทั้งหมด <span id="countID">{countDisplay}</span> รายการ
              </label>
            </div>
            <h3 className="text-color mb-1">
              <i className="fa fa-shopping-bag"></i>{" "}
              สรุปรายการสั่งซื้อ
            </h3>
            <div className="row">
              <div className="col-6 col-md-8 text-right">
                <h4>รวม : </h4>
              </div>
              <div className="col-6 col-md-4 text-right">
                <div
                  className="totals-value cart-subtotal notranslate"
                  id="cart-subtotal"
                >
                  {totals.priceCny}
                </div>
              </div>
              <div className="col-6 col-md-8 text-right">
                <h4>เรทแลกเปลี่ยน : </h4>
              </div>
              <div className="col-6 col-md-4">
                <div
                  className="totals-value4 notranslate"
                  id="rsDefault"
                >
                  {totals.rate}
                </div>
              </div>
              <div className="col-6 col-md-8 text-right">
                <h4>ราคารวมสุทธิ : </h4>
              </div>
              <div className="col-6 col-md-4">
                <b>
                  <div
                    className="totals-value2 font-18 text-danger cart-total notranslate"
                    id="cart-total"
                  >
                    {totals.priceThb}
                  </div>
                </b>
              </div>
            </div>
            <div className="float-right pt-1">
              <button
                type="submit"
                className="checkout2 btn btn-main round btn-min-width waves-effect submit-wait animate__animated animate__infinite animate__headShake"
                name="addOrder"
                disabled={submitDisabled}
              >
                สั่งซื้อสินค้า
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* cart.php L841 — totalRowCount carried as data so the
          server-side count stays inspectable for QA. */}
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
