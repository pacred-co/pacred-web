# Wave 1 fidelity audit — B-3 customer order-flow

> **Scope:** the ฝากสั่งซื้อ (shop-order) customer flow Wave 1 shipped on `dave` (merged `Poom`, 2026-05-19).
> Legacy reference: `member/shops.php` + `member/cart.php` + `member/payment.php`. Phase-B target ([ADR-0017](../../decisions/0017-pacred-faithful-pcs-port.md)): faithful = zero-retraining.
> Cross-reads: [`d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) §2/§4 · [`d1-fidelity-customer.md`](../d1-fidelity-customer.md) §4 · [`poom-save-point-2026-05-19.md`](../poom-save-point-2026-05-19.md) §4.

## 1. Files audited

- `app/[locale]/(protected)/service-order/page.tsx` (list shell + tabs)
- `app/[locale]/(protected)/service-order/service-order-list.tsx` (rows + bulk-cancel + sticky pay bar)
- `app/[locale]/(protected)/service-order/add/page.tsx` + `add-form.tsx` (search / paste / manual entry)
- `app/[locale]/(protected)/service-order/cart/page.tsx` + `cart-manager.tsx` (cart + checkout)
- `app/[locale]/(protected)/service-order/[hNo]/page.tsx` + `cancel-button.tsx` + `pay-from-wallet-button.tsx` + `receipt/page.tsx` (detail / pay / receipt)
- `app/[locale]/(protected)/service-order/pending/page.tsx` (pending shortcut)
- `actions/service-order.ts` (list / detail / place / cancel / pay-from-wallet / ack)
- `actions/cart.ts` (cart CRUD)
- `lib/service-order/cart-cap.test.ts` (151-cap trigger test)

## 2. Layout fidelity — tabs + cart cap

**6 status tabs ✅** present in `TAB_DEFS` at the top of `page.tsx` — `all / pending / awaiting_payment / ordered / awaiting_chn_dispatch / completed / cancelled` (7 entries incl. "ทั้งหมด"). Labels match legacy verbatim (รอดำเนินการ · รอชำระเงิน · สั่งสินค้า · รอร้านจีนจัดส่ง · สำเร็จ · ยกเลิก). The `?q=<key>` URL pattern matches legacy `?q=1..6` semantically (uses string keys instead of numeric — fidelity OK; URL spelling differs).

**151-cap ✅ enforced two ways**:
- DB trigger `cart_items_cap` raises `cart cap reached (151 items)` at `>= 151` insert (`lib/service-order/cart-cap.test.ts:8-9, 153, 185`).
- UI counter `{cart.length} / 151 ชิ้น` shown in cart header (`cart-manager.tsx:260`).

**Per-row actions ✅** present (view / pay / cancel / receipt / invoice) with legacy gating rules commented inline (`service-order-list.tsx:20-28` — `hStatus<=2` cancel, `==2` pay, `==5` receipt, `2..5` invoice).

**Bulk-cancel ✅** (red banner appears when ≥1 cancellable row selected — `service-order-list.tsx:116-130`).

**Sticky "ชำระเงิน" bar ✅** (bottom-sticky panel with selected-count + ฿ total — `service-order-list.tsx:280-319`). Caveat: only enables when exactly 1 row selected (cannot pay multiple in one wallet debit yet — Phase-C polish).

## 3. Data source audit — table-by-table

| Legacy table (PHP) | Pacred table read | Status |
|---|---|---|
| `tb_header_order` (order header) | `service_orders` | 🔴 **B-0 gap** — rebuilt-era table |
| `tb_order_item` (order line items) | `service_order_items` | 🔴 **B-0 gap** |
| `tb_cart` (cart staging) | `cart_items` | 🔴 **B-0 gap** |
| `tb_shop` (shop master) | (not modelled; `shop_name` is a free-text col on `cart_items` + `service_order_items`) | 🟠 missing entity |

All 19 `.from(...)` calls in `actions/service-order.ts` + `actions/cart.ts` hit `service_orders` / `service_order_items` / `cart_items` — **0 `tb_*` references**. The ported `tb_*` schema exists in `supabase/migrations/0081_pcs_legacy_schema.sql:874, 2503` but is unused by this flow. This matches ภูม's 2026-05-19 save-point §4 finding — Wave 1 is "faithful UI, rebuilt-era data".

Net: **a customer migrated from `pcsc_main` would log in and see an empty `/service-order` list** because their `tb_header_order` rows live behind a table the app never queries.

## 4. Status vocabulary

The UI uses Pacred status strings (`pending` / `awaiting_payment` / `ordered` / `awaiting_chn_dispatch` / `completed` / `cancelled`) — **a rebuilt-era enum**, not the legacy numeric `hStatus 1..6`. The mapping to legacy Thai labels is 1:1 in `TAB_DEFS` (`page.tsx:9-17`) and `next-intl` namespaces, and the gating comments in `service-order-list.tsx:20-28` reference `hStatus<=2` / `==2` / `==5` correctly — so visually the customer sees the legacy 6-state vocab + Thai labels even though the column under it stores enum strings.

**Verdict:** label-level fidelity ✅. Column-level fidelity 🟠 — the `hStatus tinyint(4)` column legacy carries does not exist on `service_orders` (it has a `text status` instead). Once B-0 re-points to `tb_header_order`, an enum→numeric translator (or a generated column) is needed.

## 5. Workflow loop fidelity

Cart → order → pay → tab-list loop is **structurally faithful**:
1. Customer adds via `/service-order/add` (paste-link `UrlPanel` default + keyword + manual fallback — link-paste is the lead per `add-form.tsx:31-32`).
2. Items land in `cart_items` (151 cap enforced).
3. `/service-order/cart` shows a checkbox-grouped-by-shop list + address + transport (รถ/เรือ/อากาศ) + crate radios + summary panel + "สั่งซื้อสินค้า" button (`cart-manager.tsx:200-486`).
4. `placeServiceOrder` (`service-order.ts:341`) snapshots cart → `service_orders` header (status `awaiting_payment`) + `service_order_items` + clears the cart.
5. Customer pays via `payServiceOrderFromWallet` (`service-order.ts:526`) — flips header to `ordered`, debits `wallet_transactions` with idempotent 23505 unique guard.
6. Lifecycle continues admin-side; customer sees status flips on the 6-tab list.

Loop is **legacy-equivalent** at the UI/action level. Underneath, every read/write hits the wrong tables.

## 6. Fidelity gaps — element-by-element

| Element | Legacy | Pacred Wave 1 | Sev |
|---|---|---|---|
| Tab set (6 statuses + "ทั้งหมด") | ✅ | ✅ matches | 🟢 |
| Cart 151-item cap | hard cap | DB trigger + UI counter | 🟢 |
| Link-paste search | `shops.php` paste-1688/Taobao/Tmall URL | `UrlPanel` default mode + KeywordPanel + ManualPanel | 🟢 |
| Transport radios (รถ/เรือ/(+อากาศ)) | รถ EK + เรือ SEA with images | 3-option icon-card (truck/ship/air) — Pacred adds air | 🟢 close (extra air ≠ gap) |
| Crate radio (ตีลังไม้/ไม่) | radio pair | icon-card radios in cart-manager | 🟢 |
| Address selector (top of cart) | switch among saved addresses | `<details>` editable form, prefilled — not a multi-address switcher | 🟠 |
| Per-row print buttons | "พิมพ์ใบเสร็จ" + "พิมพ์ใบแจ้งหนี้" | both buttons present (`service-order-list.tsx:251-267`) | 🟢 |
| Bulk-cancel "ยกเลิกออเดอร์รายการที่เลือก" | red bulk banner | present | 🟢 |
| Sticky "ชำระเงิน" bar | multi-select + bulk pay | sticky bar present; pay button gated to single-row select | 🟠 |
| Order header table | `tb_header_order` | `service_orders` | 🔴 B-0 |
| Order line items | `tb_order_item` | `service_order_items` | 🔴 B-0 |
| Cart staging | `tb_cart` | `cart_items` | 🔴 B-0 |
| Shop master | `tb_shop` | (free-text only) | 🟠 missing entity |
| Status column | `hStatus tinyint(4)` 1..6 | `text status` enum-string | 🟠 column-level mismatch (labels OK) |
| Page `<title>` | "รายการฝากสั่งซื้อสินค้า | PCS Cargo" | i18n namespace | ⚪ rebrand (PR/Pacred) |
| Promo block ("เหมาๆ" / Flash Express) | legacy promo checkboxes | static promo card present | 🟡 |

## 7. Required fixes

**B-0 (data swap — blocks fidelity at every screen):**
1. Re-point `actions/service-order.ts` + `actions/cart.ts` `.from("...")` calls onto `tb_header_order` / `tb_order_item` / `tb_cart` (or build a SQL view that translates `tb_*` → the existing column shapes so React layer is unchanged).
2. Translate `hStatus tinyint(4)` ↔ Pacred `text status` enum at the boundary (generated column or `CASE` in a view).
3. Map `tb_shop` into a real shop dimension table; replace the `shop_name` free-text foreign key.

**Layout / workflow polish (post-B-0):**
4. Address selector should let customers **switch** between saved addresses, not just edit the prefilled default — `addresses` table query missing in `cart-manager.tsx`.
5. Sticky pay bar — extend `payServiceOrderFromWallet` to accept `h_no[]` so multi-row bulk pay works (legacy parity).
6. `tb_shop` master entity — surface shop name + image consistently across cart + order list rows.
7. Rebrand page titles (`<title>` rewrite, `PCS` → `PR/Pacred`).

## 8. Severity ranking

- 🔴 **paradigm** — data layer reads the wrong tables (item 1). 8,898 migrated customers see empty pages.
- 🟠 **layout** — address selector behavior (item 4), multi-row bulk pay (item 5), `tb_shop` missing (item 6), status column mismatch (item §4 caveat).
- 🟡 **polish** — promo block, page titles, rebrand.

## 9. Recommendation

**Back to เดฟ for B-0 wave before ship.** The UI work is excellent — link-paste is the default entry, 6 status tabs match legacy verbatim, the 151-cap is enforced, the cart→pay loop is structurally faithful. But every screen reads `service_orders` / `cart_items`, not the ported `tb_header_order` / `tb_cart`. Until B-0 lands, the entire 8,898-customer migrated base sees an empty `/service-order` page — the opposite of "zero retraining". This is exactly the gap ภูม flagged in `poom-save-point-2026-05-19.md §4`.

Wave 1 = the faithful skin. **B-0 is the connective layer** that makes Wave 1 show the real legacy data. Recommend `dave` runs B-0 next (re-point reads at `tb_*`) before any further customer-facing Phase-B work.
