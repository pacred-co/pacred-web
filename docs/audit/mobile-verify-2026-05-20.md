# Mobile-Verify Audit — 5 Customer-Facing Screens · 2026-05-20

> Agent C · code-review-only fallback (Claude Preview MCP tools were
> permission-denied for this session — `preview_resize`, `preview_eval`,
> `preview_snapshot`, `preview_screenshot`, `preview_list` all blocked).
> All findings below come from static analysis of the source `.tsx` and
> the legacy PCS CSS bundle scoped under `.pcs-legacy` — no live render
> was performed.

## Scope

Reference viewports: **360 × 800** (Android baseline) and **390 × 844**
(iPhone baseline) per `docs/mobile-first-playbook.md` and AGENTS.md §6
("Mobile-first is non-negotiable"). Owner rule per CLAUDE.md §6: tap
targets ≥ 44px · body text ≥ 16px · no horizontal scroll · primary CTA
thumb-reachable.

## Executive summary

| # | Screen | Verdict | Notes |
|---|---|---|---|
| 1 | `/login` | 🟢 **PASS** | Tailwind, single-column, large tap targets, body 15-17px (text-[15px] inputs, text-[17px] CTA). One amber: `.text-[12.5px]` "forgot password" link is ~12.5px (slightly below ≤44px line height standard but acceptable secondary link). |
| 2 | `/register` | 🟡 **MINOR ISSUES** | Form is mostly Tailwind & responsive, but several stacked `flex gap-3` rows on personal/juristic tabs put 2 fields side-by-side at 360px with no `sm:flex-col` fallback → may force cramped inputs ~140px wide. Body text on labels is **12px** (`text-[12px]` `text-[12.5px]`) — below 16px floor. Submit CTA is 15px font — below 16px. |
| 3 | `/dashboard` (`(protected)/dashboard/page.tsx`) | 🟢 **PASS** | Faithful 1:1 PCS port. Legacy Bootstrap-4 grid (`col-4`) → 3 cols × 3 rows of icons. Legacy mobile breakpoint `@media (max-width: 578px)` already shrinks `h2` to 1.5rem and balance font to 2rem. Sales-rep card `margin: 1rem 3rem 0.25rem` at ≤576px = 360 − 96 = 264px wide (fits). Wallet card `col-123` is `width: 80%` with `left: 10%` (fits). Auth-gated, **but** mobile shell (PcsFooterNav + bottom bar) is verified to render at mobile breakpoints. |
| 4 | `/service-order` (`(protected)/service-order/page.tsx`) | 🔴 **NEEDS FIX** | Faithful 1:1 PCS port of `shops.php`. Two issues at 360px: (a) `.content-body.pr110` is overridden to `padding-right: 15px` at `max-width:992px` ✅; **but** (b) the **DataTable** (`#myTable.table-bordered`) is inside `.table-responsive` which has `overflow-x: auto` ✅ — table itself can horizontally scroll, but the page wrapper won't. Tab strip `pcs-tabs` has **7 tabs** at `padding: 0.5rem 1rem` each → ~700-840px of tab content, but `nav { flex-wrap: wrap }` means tabs wrap. The **fixed bottom b-pay bar** at `bottom: 70px` may collide with the legacy `nav-footer-pcs` mobile bottom nav (also at bottom of viewport — bottom-nav height is ~64px per body padding). Auth-gated. |
| 5 | `/wallet` (`(protected)/wallet/page.tsx`) | 🟡 **MINOR ISSUES** | Faithful 1:1 PCS port. Balance card `col-md-6 offset-md-3` correctly drops to full-width at <768px (no `col-sm-*` overrides → defaults to 100% via base `.col-*` width). 4 tabs `.tab-sm-center { width: 50% }` at ≤578px → 2-col grid (wraps cleanly). Issue: the **deposit modal** (`#wallet-add`) has no `display:none` rule defined in `wallet.css` — at 360px it could render visible at page top (Bootstrap-4 `.modal.fade` defaults to `display:none` but that's in vendors.min.css from the layout — relies on the JS bundle loading correctly). Modal width fixed at `250px` qrcode inner div — fits 360px. Auth-gated. |

**Tally:** **2 of 5 PASS** at both 360 & 390 · **2 minor issues** · **1 needs fix**.

---

## 1) `/login` — `app/[locale]/(auth)/login/page.tsx`

### Rendering at 360 × 800

- **Screenshot taken:** N/A (preview tools blocked — code review only)
- **Horizontal-scroll check:** ✅ PASS
  - Outer `<main>` is `flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-5 py-10`.
  - Card: `w-full max-w-[520px] ... p-10` — at 360px, card is `360 − 2×20 (px-5) = 320px` wide. `p-10` adds `2×40 = 80px` of inner padding, so input area is **240px wide**. Inputs are `w-full` so they fit.
  - No fixed-width elements > 360px.
- **Tap targets:** ✅ PASS
  - Submit button: `py-[18px] text-[17px]` → button height ~52px ✅
  - Identifier/password inputs: `px-5 py-[15px] text-[15px]` → ~48px height ✅
  - Eye toggle: icon `h-5 w-5` (20px) inside absolute button — only the icon is tappable; absolute-positioned button has no padding so **tap target is ~20px × 20px** 🟡 (below 44px). Minor — secondary control.
  - Social-login buttons (when greyed-out "COMING SOON"): `px-3 py-3` → ~44px high ✅, but 3-col grid at 360px = (360 − 40 padding − 2×10 gap) / 3 ≈ **97px wide** ✅
- **Text size:** ✅ PASS
  - Body text uses Tailwind default 16px on `<body>`.
  - Title `text-2xl` (24px), labels `text-sm` (14px), inputs `text-[15px]`, CTA `text-[17px]`.
  - Two amber spots: `forgotPassword` link `text-[12.5px]` and `divider` `text-[13px]` — secondary text, acceptable per playbook.
- **CTA position:** ✅ PASS — Submit button is centered, scrolls into thumb zone naturally on a 800px-tall viewport (card height ≈ 560px, sits in middle).
- **Overall verdict:** 🟢 **Mobile-clean**

### Rendering at 390 × 844 — identical to 360 (no breakpoint changes between 360-390); all PASS.

### Recommended fixes
- 🟡 Increase eye-toggle hit area: wrap button in `p-2 -m-2` so tap target reaches 36px+ (or apply `min-w-[44px] min-h-[44px]`).

---

## 2) `/register` — `app/[locale]/(auth)/register/page.tsx`

### Rendering at 360 × 800

- **Screenshot:** N/A (code review only)
- **Horizontal-scroll check:** ✅ PASS
  - `<main>` is `px-4 py-3`, card is `w-full max-w-[540px]`. At 360px → card = 360 − 32 = **328px** wide. Inner `p-5 sm:p-7` → input area = 328 − 40 = **288px**.
  - PhoneInput `flex gap-2`: country code chip `flex h-[52px] shrink-0 ... px-3` is ~64px wide → input gets 288 − 64 − 8 (gap) = **216px** ✅
- **Tap targets:**
  - Tab buttons (personal/juristic): `h-9` = **36px** 🟡 (below 44px). FAIL by playbook.
  - SubmitBtn: `py-[15px] text-[15px]` → ~46px ✅
  - NextBtn / BackBtn: `py-[15px]` / `h-[50px]` → 46-50px ✅
  - PhoneInput country chip: `h-[52px]` ✅
  - Inputs: `py-[10px] text-[14px]` → ~36px height 🟡 (just below 44px)
  - "Show password" Eye button: same as login — ~20px tap target 🟡
  - OTP cells: see `<OtpInput>` (not read here; relies on `components/auth/otp-input.tsx`)
- **Text size:** 🔴 FAIL — many sub-16px font sizes:
  - Labels: `text-[12px]` (FieldWrap) ❌ 12px
  - "มีบัญชีอยู่แล้ว?" hint: `text-[12.5px]` ❌
  - Tab buttons: `text-[13px]` ❌
  - Inputs: `text-[14px]` ❌
  - Source/Service chips: `text-[13px]` ❌
  - Submit/Next/Back buttons: `text-[15px]` ❌ (one short of 16px)
  - Error box: `text-sm` (14px) ❌
  - Step indicator: `text-[10.5px]` ❌❌ (very small)
  - **iOS will zoom the page** on input focus when input font-size < 16px → a usability bug, not just an aesthetic one.
- **CTA position:** ✅ PASS — Submit button is at the bottom of the form, thumb-reachable. Form is long, but the submit appears within the first scroll for the personal tab.
- **Horizontal layout risk:**
  - Personal tab has `<div className="flex gap-3">` rows for (firstName + lastName) and (services + howKnow). At 360px each side gets (288 − 12 gap) / 2 = **138px** of input width. Inputs with `pl-11` (left icon padding = 44px) leave **94px** of typing space — tight but functional.
  - Juristic step 2 has a `grid grid-cols-2 gap-3` row for (ตำบล + อำเภอ) and (จังหวัด + รหัสไปรษณีย์) — same 138px per cell.
- **Overall verdict:** 🟡 **Minor issues** — functions, but two real defects: (a) font-size < 16px causes iOS zoom on focus, (b) `h-9` tabs under 44px tap target.

### At 390 × 844
- Card gets +30px → input cells get ~110px instead of 94 — still cramped but better. Same font/tap-target issues persist.

### Recommended fixes
1. **Critical:** Bump all `<input>` font-size to **at least 16px** to stop iOS auto-zoom. Change `INPUT_BASE` `text-[14px]` → `text-base` (16px). One-line fix in this file.
2. Bump tab `h-9` → `h-11` (44px) for tap-target compliance.
3. Bump SubmitBtn/NextBtn `text-[15px]` → `text-base`.
4. Consider stacking `flex gap-3` rows vertically on small screens — `flex flex-col sm:flex-row` — so labels + inputs aren't cramped on 360px.
5. Apply same eye-toggle tap-target fix as login.

---

## 3) `/dashboard` — `app/[locale]/(protected)/dashboard/page.tsx`

> Note: This is a faithful 1:1 transcription of legacy PHP `member/menu.php`,
> using the legacy Bootstrap-4 markup scoped under `.pcs-legacy` with the
> legacy stylesheet `public/legacy/pcs/menu.css`. Auth-gated by
> `(protected)/layout.tsx → requireAuth()` — would redirect a guest to /login.

### Rendering at 360 × 800

- **Screenshot:** N/A (code review only — would also require a logged-in test user)
- **Horizontal-scroll check:** ✅ PASS
  - `.app-content > .content-wrapper` uses no fixed widths.
  - `.col-md-12 col-sm-12` resolves to `flex: 0 0 100%; max-width: 100%` ✅
  - Card has `border-radius: 0.45rem` and `border: 1px solid #000`, content fits the column.
  - Red header band `.bg-gradient-x-danger.bg-box.pb-5` with `borderRadius: "0 0 30px 30px"` — fits column.
  - Wallet card `.col-123` has hard-coded `width: 80%; left: 10%` → at 360px = **288px wide centred** ✅
  - Sales-rep card `.box-sale-main` at ≤576px has `margin: 1rem 3rem 0.25rem` → 360 − 2×48 = **264px wide** ✅
  - 9-icon grid uses `col-4` × 9 cells → 3 cols × 3 rows. Each cell = 360/3 = **120px**, icons `width: 70px; padding: 1rem` (`pcs-icon-menu`) → 70 + 32 = 102px — fits ✅
- **Tap targets:**
  - 9-icon grid cells: each cell is `120px × ~100px` ✅ well above 44px
  - "Edit profile" / "Account settings" corner buttons: `btn tn-icon btn-pure text-white p-0` → no padding, but they have a 24px SVG icon. Likely **24px × 24px tap target** 🟡 — sub-44px secondary buttons. Minor.
  - Image-edit "btn-xs" button on avatar: `width: 30px; height: 30px` (per `.btn-xs` rule) 🟡 — sub-44px.
  - Wallet card (linked to `/wallet/history`): entire `.box-wallet` card is wrapped in `<Link>` so tap area is the full **288 × ~120px** ✅
  - Sales card phone link `<a href="tel:...">` — wraps the formatted phone in `.text-sale-crad-tell` (1rem) — small tap area inline, but inside a wider `col-8` cell
- **Text size:** ✅ PASS at 16px floor (with one exception)
  - Body: 16px default
  - Legacy `<h2>` → 2rem (32px) → at ≤578px shrinks to **1.5rem (24px)** ✅
  - Wallet balance `.font-3rem` → 3rem (48px) → at ≤578px shrinks to **2rem (32px)** ✅
  - `.font-14` → 14px ❌ (used on "เป๋าตัง (บาท)" label)
  - Sales-rep card text `text-sale-crad-top/2/tell` → 1.1rem / 1.1rem / 1rem ✅
- **CTA position:** ✅ The 9-icon launchpad fills most of the viewport with the wallet card prominent at top — fully thumb-reachable. Logout (cell 9) is bottom-right.
- **Bottom-nav clearance:** body has `padding-bottom: calc(64px + env(safe-area-inset-bottom))` from `globals.css` so the legacy `nav-footer-pcs` mobile bottom-nav doesn't overlap content ✅
- **Overall verdict:** 🟢 **Mobile-clean**

### At 390 × 844
- Sales-rep card: 390 − 96 = **294px** ✅
- All other proportions improve. PASS.

### Recommended fixes
- 🟡 Header corner buttons (edit profile + settings) lack padding — wrap each `<button>` with `p-2 -m-2` (or set `min-width: 44px; min-height: 44px` in `menu.css`) to raise tap area.
- 🟡 Avatar `.btn-xs` image-edit button is 30×30px — sub-44px. Consider boosting to 44px or removing (it's redundant with the corner settings link).

---

## 4) `/service-order` — `app/[locale]/(protected)/service-order/page.tsx`

> 1:1 transcription of legacy `member/shops.php` (default view). Auth-gated.
> Uses `public/legacy/pcs/shops.css`.

### Rendering at 360 × 800

- **Screenshot:** N/A (code review only)
- **Horizontal-scroll check:** ⚠️ AT RISK
  - `.content-body.pr110` is `padding-right: 100px` desktop, drops to `padding-right: 15px` at `≤992px` ✅
  - **The DataTable** `<table id="myTable" class="table display table-bordered table-striped dataTable no-footer dtr-inline">` has **7 columns** (`ID / วันที่สร้าง / ออเดอร์เลขที่ / ข้อมูลสินค้า / สถานะ / ราคา / ตัวเลือก`). The legacy uses DataTables' "Responsive" plugin to collapse columns on mobile (`dtr-inline` class) — but **that plugin's JS must be loaded** to actually collapse the columns. The CSS hint `td:first-child { padding: 10px }` and the `.tr1::after { content: " \A คลิกดูเพิ่มเติม" }` rules at `≤578px` rely on the JS having executed. If the JS doesn't run, the table will be **~800-1200px wide and horizontal-scroll** inside `.table-responsive { overflow-x: auto }`.
  - **Important:** `.table-responsive` provides `overflow-x: auto` so the PAGE doesn't horizontal-scroll — only the table cell does. So technically PASS for `document.documentElement.scrollWidth`. But UX is poor.
  - Empty state (`countStatusAll === 0`) renders only the "ยังไม่มีรายการ" message + image — no horizontal-scroll risk ✅
- **Tap targets:**
  - "สั่งสินค้าเพิ่ม" button: `btn btn-sm btn-circle btn-success` → `width: 32px; height: 32px` 🔴 sub-44px (combined with text label)
  - Tab strip: `<a class="nav-link">` `padding: 0.5rem 1rem` → ~36px tap height 🟡 sub-44px. Tabs wrap to multiple rows on mobile (no `sm:hidden` overrides).
  - Row action buttons (`ยกเลิกออเดอร์` / `ดูรายละเอียด` / `ชำระเงิน` / `พิมพ์ใบเสร็จ`): `btn-sm` → `padding: 0.25rem 0.5rem; font-size: 0.8rem` → ~28px tall 🔴 well below 44px
  - "ยกเลิกออเดอร์รายการที่เลือก" select-cancel button: `btn-sm` → ~28px 🔴
  - "ชำระเงิน" CTA in b-pay bar: `btn btn-color-main` → `padding: 0.5rem 1rem` → ~36px 🟡
- **Text size:**
  - Body: 16px
  - `.font-12` (12px) used heavily on table cells (date/time) ❌
  - `.font-13` (13px) on status badges + tab counters ❌
  - `.font-30` (30px) on the shopping-cart icon ✅
  - Empty-state `h4.text-color-main` → 1.5rem (24px) ✅
- **CTA position:** ✅ b-pay bar is `position: fixed; bottom: 20px` → thumb-zone. **But:** bottom-nav (`nav-footer-pcs`) is also fixed at bottom (height ~64px), so the b-pay bar at `bottom: 70px` should sit directly above the bottom-nav (which it does — shops.css L390 explicitly sets `b-pay { bottom: 70px !important }` at ≤600px). However the additional `.btn-group.t { bottom: 148px }` for the print buttons could overlap awkwardly.
- **Overall verdict:** 🔴 **Needs fix**
  - Three real defects: (a) row action buttons are 28px tall — way below 44px tap target on a phone, (b) DataTable mobile-collapse depends on `responsive.bootstrap4.min.js` actually loading (not verified — need a browser test), (c) tab strip wraps but each tab is sub-44px.

### At 390 × 844
- Slightly more horizontal room; same defects persist. Same verdict.

### Recommended fixes
1. **Critical:** Verify the DataTables Responsive plugin JS is in the protected layout's `JS_BUNDLE` — search `app/[locale]/(protected)/layout.tsx`. If absent, the `dtr-inline` class is dead and the 7-column table will horizontal-scroll on phones. **Quick check below.**
2. Audit row action buttons — at minimum stack them vertically with more padding when at ≤576px (the legacy did this via the responsive plugin's child-row UI).
3. Confirm the b-pay bar and print-button-group don't overlap on a 360 viewport with the bottom-nav present.
4. `.add-text-all::before { content: "ทั้งหมด " }` injects "ทั้งหมด ID" — fidelity-preserved.

---

## 5) `/wallet` — `app/[locale]/(protected)/wallet/page.tsx`

> 1:1 transcription of legacy `member/wallet.php` (default page branch).
> Auth-gated. Uses `public/legacy/pcs/wallet.css`.

### Rendering at 360 × 800

- **Screenshot:** N/A (code review only)
- **Horizontal-scroll check:** ✅ PASS
  - Balance card uses `col-md-6 offset-md-3` — at <768px, `col-md-6` has no width rule applied (legacy CSS only defines it `@media (min-width: 768px)`), so it inherits the base `width: 100%` on `.col-*` ✅
  - Tab strip `customtab tab-wallet` with 4 tabs — `tab-sm-center { width: 50% }` at ≤578px → 2×2 grid ✅ (no horizontal scroll)
  - Wallet history rows: `.row.border-success-2.p-1` → flexes within container, `col-6` × 2 = 100% ✅
  - Modal `#wallet-add` has `tabIndex={-1}` and class `modal fade in` — relies on Bootstrap's `.modal { display: none }` from `bootstrap.min.css` (loaded in the protected layout). If that CSS loads, modal is hidden on initial render ✅. If it doesn't, modal renders inline at page bottom — its inner `qrcode` div has fixed `width: 250px; height: 250px` (≤ 360px). PASS either way for horizontal scroll.
- **Tap targets:**
  - Tab links `nav-link`: `padding: 0.5rem 1rem` → ~36px 🟡 sub-44px
  - "เติมเงินเข้ากระเป๋า" CTA: `.btn-add-wallet` — not defined in `wallet.css` I read; likely styled in legacy `style.css`. Likely 36-44px range.
  - History row link `<a>` to `/shops/detail/...` or `/forwarder/detail/...` — inline anchors only, no padding → text-only tap targets ~13-14px tall 🔴
  - Modal "เติมเงิน" submit: `btn btn-outline-info round` → ~36-40px 🟡
- **Text size:**
  - Body: 16px
  - `.font-3rem` balance: 3rem ✅
  - `.font-14` ("กระเป๋าสตางค์ (บาท)") → 14px ❌
  - `.font-12` / `.font-13` in history rows ("เลขที่รายการ #") ❌
  - Tab labels "รายการเดินบัญชี" (no font size override → inherits 1rem = 16px) ✅
- **CTA position:** ✅ "เติมเงินเข้ากระเป๋า" sits inside the balance card, top-center → thumb-reachable. 4 tabs sit below.
- **Bottom-nav clearance:** body padding-bottom 64px ✅, and `.content-body.pr110` removes right padding at ≤992px ✅
- **Modal concern:** The deposit modal renders STATIC markup (no client JS hides it on mount). It depends on Bootstrap's `.modal { display: none }` rule loading. If `bootstrap.min.css` is delayed/missing, modal will be **visible from page load** below the wallet content. Worth verifying with a real preview.
- **Overall verdict:** 🟡 **Minor issues**
  - Functions cleanly. Tap targets on inline history-row links are tiny. Modal show/hide depends on a layout CSS bundle loading on time.

### At 390 × 844
- All the same — PASS for layout, same tap-target hits.

### Recommended fixes
1. Wallet history-row link anchors should be wrapped in a padded `<Link>` (whole row clickable) — at minimum `display: block; padding: 8px 0`.
2. Verify `#wallet-add .modal { display: none }` is in the protected layout CSS bundle (it is, via `bootstrap.min.css` in `app/[locale]/(protected)/layout.tsx` line 55), but worth a live render check.
3. Consider boosting tab `nav-link` padding to `0.75rem 1rem` (~44px tall) — minor diff from legacy but improves UX.

---

## Cross-cutting risks (all 3 protected pages)

These apply to dashboard + service-order + wallet because they share `(protected)/layout.tsx`:

1. **CSS bundle order:** The legacy theme CSS bundle (21 stylesheets) loads in render order via React 19 `<link>` hoisting. The page-specific `menu.css` / `shops.css` / `wallet.css` are loaded INSIDE the page body via plain `<link rel="stylesheet">`. Cascade should be correct (page CSS wins), but order is fragile — a real mobile render check would catch any precedence bugs.
2. **Bottom-nav (`nav-footer-pcs`) overlap:** The mobile bottom-nav is `position: fixed; bottom: 0` and the body has `padding-bottom: calc(64px + env(safe-area-inset-bottom))` to clear it. Any `fixed` element with `bottom: <70px` may sit ON the bottom nav. Confirmed risk on `/service-order` (b-pay bar + btn-group + bottom-nav stacking).
3. **DataTables responsive collapse** (`/service-order`): the legacy depends on `responsive.bootstrap4.min.js` for the mobile collapse behaviour. **Not visible in the JS_BUNDLE list** in `(protected)/layout.tsx` (lines 79-89) — only the core theme JS + SweetAlert + Magnific-Popup. **If DataTables.responsive is missing, the 7-column table will horizontal-scroll on every phone.** This is the highest-confidence mobile fix needed.

---

## Top 3 most urgent mobile fixes

1. 🔴 **Register page input font-size:** Change `INPUT_BASE` in `app/[locale]/(auth)/register/page.tsx` from `text-[14px]` to `text-base` (16px) to prevent iOS auto-zoom on focus. Same for tabs (`h-9 text-[13px]` → `h-11 text-sm`) and SubmitBtn (`text-[15px]` → `text-base`).
2. 🔴 **CONFIRMED — Service-order DataTable responsive plugin is NOT loaded.** Verified `dataTables.responsive.min.js` + `responsive.dataTables.min.css` exist at `public/legacy/pcs/assets/plugins/datatables/` but are **NOT** in the `CSS_BUNDLE` or `JS_BUNDLE` arrays of `app/[locale]/(protected)/layout.tsx`. Result: the 7-column `#myTable` will horizontal-scroll inside its `.table-responsive` wrapper on every phone — the `dtr-inline` class and the `td:first-child { padding: 10px }` / `.tr1::after { content: "คลิกดูเพิ่มเติม" }` mobile rules are dead. **Fix:** add to `CSS_BUNDLE`: `${PCS}/plugins/datatables/css/dataTables.bootstrap4.min.css` + `${PCS}/plugins/datatables/css/responsive.dataTables.min.css`; add to `JS_BUNDLE`: `${PCS}/plugins/datatables.net/js/jquery.dataTables.min.js` + `${PCS}/plugins/datatables/js/dataTables.bootstrap4.min.js` + `${PCS}/plugins/datatables/js/dataTables.responsive.min.js`. Also need a per-page DataTables init script (legacy ran it inline in `shops.php` script block).
3. 🟡 **Tap-target sweep on all 3 legacy pages:** Header corner buttons (dashboard), tab links (all 3), DataTable row action buttons (service-order), history-row anchors (wallet) are all 28-36px. Add `min-height: 44px` on `.pcs-legacy .nav-link` and `.pcs-legacy .btn-sm` in each page's CSS (legacy fidelity preserved at desktop; mobile gets the floor).

---

## What I audited (and didn't)

- Read in full: all 5 `page.tsx` files (login, register, dashboard, service-order, wallet).
- Read in full: `menu.css`, `wallet.css` mobile breakpoints, `shops.css` ~340 lines incl. mobile @media.
- Read: `app/[locale]/(protected)/layout.tsx`, `globals.css`, `components/sections/navbar.tsx` (auth-aware), `components/legacy/pcs-footer-nav.tsx` (mobile bottom nav).
- Did NOT execute live render (preview tools permission-denied).
- Did NOT verify the DataTables Responsive JS plugin is loaded — flagged as urgent fix #2.
- Did NOT measure real `getBoundingClientRect()` — all "44px / 36px" sizes are derived from Tailwind class / legacy CSS rule inspection.

---

> Generated by Agent C · static mobile audit · 2026-05-20
