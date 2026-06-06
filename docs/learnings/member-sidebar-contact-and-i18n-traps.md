# Member sidebar contact cards + i18n raw-key traps (2026-06-06)

Two "looks-like-a-UI-bug, is-actually-data/config" findings from the owner's
2026-06-06 polish pass. Both presented as broken screens; neither was a render
bug. Capture so we stop re-debugging the component.

## 1. "Sales/CS photos don't show + wrong name" = routing + fallback data, not the component

The customer left-menu (`components/legacy/pcs-left-menu.tsx`) renders the
sales + CS contact cards correctly: a 46px `rounded-full object-cover` `<img>`
inside an `<a class="image-popup-vertical-fit">` (Magnific Popup lightbox is
initialized in `public/legacy/pcs/assets/plugins/magnific-popup/meg.init.js:4`,
so the click-to-view already works). The data is what was wrong.

**The resolver** (`lib/legacy/pcs-chrome.ts` → `resolveSalesRep`/`resolveCsRep`)
walks `tb_users.adminIDSale` / `.adminIDCS` → `tb_admin` (legacy fallback) +
`admin_contact_extras.legacy_admin_id` bridge → `profiles.avatar_url` (modern).
Prefers modern avatar → legacy `adminPicture` (excluding the `"user.jpg"`
sentinel) → `SALES_FALLBACK.picture`.

**The real distribution (prod, sampled 4000):**
- `adminIDSale`: **958 = `admin_center`** (the central routing bucket), 27 empty,
  ~15 real reps (admin_pee/admin_may). `admin_center`'s `tb_admin.adminPicture`
  is `"user.jpg"` → excluded → lands on `SALES_FALLBACK.picture`.
- `adminIDCS`: **100% empty** → everyone lands on `CS_FALLBACK`.

So the dominant case for BOTH cards was the fallback — and both fallbacks
pointed at the wide `pacred-logo-red.png`, which `object-cover` crops into a
46px circle as a broken-looking blob ("แตก"). Fix = point the fallbacks at
square face photos (`Character_Icon/may.png` for central sales, `ploy01.png`
for CS) and rename the sales fallback "แนท" → "ส่วนกลาง" (that line, 02-421-3325,
is the central sales number, not a personal rep). Real assigned reps
(may/pee/ploy/toey/win — all have `avatar_url`) were already resolving fine.

**Lesson:** before touching a contact/avatar component, query the actual
`adminIDSale`/`adminIDCS` distribution. The dominant value is `admin_center`
(no bridge) or empty → the *fallback* is what 95% of users see. Polish the
fallback, not just the happy path. A wide logo in an `object-cover` circle
always looks broken — fallbacks need square images.

## 2. Dashboard showing literal `dashboardPage.cardShopOrder` = double-nested JSON

After a ปอน merge, several customer pages rendered raw key paths
(`dashboardPage.cardShopOrder`, `mobileLaunchpad.*`, …) instead of Thai text.

Root cause: `messages/{th,en}.json` had **double-nested** namespaces —
`{"dashboardPage": {"dashboardPage": {"cardShopOrder": "..."}}}`. The page calls
`getTranslations("dashboardPage")` then `t("cardShopOrder")` → resolves
`dashboardPage.cardShopOrder`, but the value lived at
`dashboardPage.dashboardPage.cardShopOrder` → next-intl falls back to echoing
the key path. 8 namespaces were affected (dashboardPage, ordersPage,
newOrderPage, bookingsPage, bookingDetailPage, mobileDashboard, mobileLaunchpad,
walletDeposit). `wallet` was a red herring — its 173 keys are legitimately
direct.

**Lesson:** a screen showing the literal `Namespace.key` string is almost never
a missing translation — it's a **structural mismatch** (double-nest, or
`getTranslations("X")` + `t("X.key")` stacking the namespace twice). Grep the
JSON for `"X": {\n    "X": {` after any messages-file merge. Verify the un-nest
with a JSON round-trip (`JSON.parse` → `JSON.stringify(_, null, 2)`) so the diff
is purely the structural change, byte-stable otherwise.
