# Sprint-23..26 — Customer-portal post-launch hardening (2026-05-25/26)

> Four-sprint incident-fix series on `dave-pacred` → `main`. Owner-directed
> in real time; each sprint maps 1:1 to a customer report. **All shipped to
> production**, gated by `pnpm tsc --noEmit` + ESLint + `next build` + a
> route-smoke curl pass + a live mobile-viewport re-test via Claude Preview.

| Sprint | Trigger | Commit | Surface | Files |
|---|---|---|---|---|
| **S-23** | PR10900 incident — customer ลืมรหัสผ่านแล้วขอ OTP แต่ SMS ไม่ส่ง | `1097688` | `/forgot-password` | 3 |
| **S-24** | Owner: "tap หัวข้อก็ยังไม่ตรงนะ" — 6 of 7 status tabs ไม่ highlight | `1144639` | `/service-order` | 1 |
| **S-25** | Owner: "footter หลุดเข้ามาเยอะอยู่นะ ในหลังบ้านอะ" | `691940b` | 17 protected/auth/transactional pages | 20 |
| **S-26** | Owner: "จากนั้นมาทำ responsive mobile" | `fd1ffd9` | `/service-order` mobile + tabs | 3 |
| docs | this doc + learnings | `99e206a` | `nextjs-16-quirks.md` + `STRATEGY.md` §9 | 3 |

---

## Sprint-23 — OTP-bypass flag forwarded to forgot-password UI

**Trigger:** Customer PR10900 (อรยา) reported เข้าระบบไม่ได้ → after diagnosis it was customer-side password-forget. When they tried `/forgot-password`, the form said "OTP sent" but no SMS arrived → stuck.

**Root cause:** `EMERGENCY_OTP_BYPASS = true` flag in `actions/otp.ts:42` (hardcoded 2026-05-22 after ThaiBulkSMS gateway broke). The `/register` UI handled the `bypass: true` response by skipping the OTP step entirely. The `/forgot-password` UI didn't — it just transitioned to "OTP sent, enter the code" and the customer waited forever for an SMS that was never going to come.

**Fix:** Forward the bypass flag through `requestPasswordResetByPhone` → forgot-password page; on bypass, prefill OTP `"000000"`, hide the OTP input, show an amber notice: *"ระบบ SMS อยู่ระหว่างปรับปรุง — กรุณาตั้งรหัสผ่านใหม่ของท่านเลย"*. Server-side `confirmPasswordResetByPhone` already short-circuits `verifyOtp` under the same flag, so any 6-digit placeholder passes.

```ts
// actions/auth.ts:449-490
return { ok: true, data: { bypass: res.bypass } };

// app/[locale]/(auth)/forgot-password/page.tsx
if (res.data?.bypass) {
  setOtpBypass(true);
  setOtp("000000");
}
setPhoneStep("verify");
```

**Carryover:** `EMERGENCY_OTP_BYPASS = true` is a security hole — fix the ThaiBulkSMS gateway and revert the flag (long-term).

---

## Sprint-24 — All 7 status tabs highlight on URL match

**Trigger:** Owner: *"https://pacred.co.th/service-order / tap หัวข้อก็ยังไม่ตรงนะ"* — clicking "รอชำระเงิน" gave the URL `?q=2`, the tab DID highlight, but clicking any of the other 6 status tabs left no visible "active" feedback.

**Root cause:** 6 of 7 `<li>` items were copy-paste with hard-coded `q === "2"` active conditional. Only one tab's CSS reacted to its own URL.

**Fix:** Refactor the 7 tabs from individual `<li>` blocks to a `.map()` over an array — uniform `isActive` logic per tab, uniform `href` template, badge color preserved per legacy palette (info/warning/danger/info/warning/success/warning).

```tsx
([{ key: "", label: "ทั้งหมด", count: countStatusAll, badge: "badge-info" }, ...] as const).map((tab) => {
  const isActive = tab.key === "" ? !q : q === tab.key;
  const href = tab.key === "" ? "/service-order" : `/service-order?q=${tab.key}`;
  return <li key={tab.key || "all"} className={`nav-item tab-sm-center ${isActive ? "active" : ""}`}>...</li>;
})
```

**Net diff:** 1 file changed, lines reduced (less repetition).

---

## Sprint-25 — Marketing chrome gated to `(public)` only

**Trigger:** Owner: *"เรายังเห็น footter หลุดเข้ามาเยอะอยู่นะ ในหลังบ้านอะ มันไม่ควรหลุดเข้ามานะ ไล่เอาออกให้หมดทุกหน้า / จากนั้นมาทำ responsive mobile"* — marketing LINE chat bubble + mobile CTA quick-tabs + big sales-y `<Footer />` were appearing on every protected portal page, admin page, and auth page.

**Root cause — two distinct leaks:**

1. **`<FloatingTabs />` was mounted in `app/[locale]/layout.tsx`** — i.e. at the locale level, the parent of EVERY route group. Route groups don't isolate parent chrome; only the layouts they declare are scoped. So a single mount at the locale layer painted on every page under that locale (public + protected + admin + auth + root-level transactional).

2. **`<Footer />` was hard-coded in 17 page files** — each page author ended their JSX with `<Footer />` from `@/components/sections/footer`. There was no architectural gate — each leak was a copy-paste.

**Fix (route-group-as-chrome-scope pattern):**

```tsx
// app/[locale]/layout.tsx — REMOVE the FloatingTabs mount
// app/[locale]/(public)/layout.tsx — NEW FILE
import { FloatingTabs } from "@/components/sections/floating-tabs";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FloatingTabs />
    </>
  );
}
```

Then the 17 hard-coded `<Footer />` imports + JSX were stripped from:
- `(protected)` — 14 pages (notifications, orders, orders/new, refunds, wallet/history, wallet/withdraw, service-order/[hNo], service-order/cart, service-order/pending, service-import/pending, service-import/warehouse-addresses, service-payment/[id], service-payment/add, profile/security/change-phone)
- `(auth)` — 1 page (forgot-password)
- root-level transactional — 2 pages (complete-profile, reset-password)

**`(protected)/layout.tsx` kept `<PcsFooterNav />`** — that's the LEGACY mobile bottom-nav + right rail, a different component from the marketing Footer, and at the right architectural layer.

**Bonus:** `.claude/launch.json` switched `pacred-web-prod` from `pnpm start` to direct `node node_modules/next/dist/bin/next start` to bypass the Node 24 engine check on Node 20 dev machines.

**Verification:** `grep -rn 'from "@/components/sections/footer"' app/[locale]` now shows ONLY `(public)/*` matches. Anything else outside `(public)` would be a regression.

---

## Sprint-26 — `/service-order` mobile responsive (375×812)

**Trigger:** Owner: *"จากนั้นมาทำ responsive mobile"* — on 4G phone the customer's order list was unusable: 7-col table overflowed the 375px viewport, Chinese product titles wrapped vertically character-by-character because each col was squeezed to ~50px, every row sprouted a "คลิกดูเพิ่มเติม" hint that promised tap-to-expand that never fired.

**Root cause:** the legacy PHP page was built around the **DataTables-Responsive jQuery plugin** which at runtime would (a) read `<th class="none">` and hide those cols, (b) bind a `+` widget that expands hidden cols inline below the row. Pacred is server-rendered + no jQuery → the plugin never runs. But its CSS shipped in 5 stylesheets (`shops.css`, `cart.css`, `service-import.css`, `payment.css`, `forwarder.css`) and those rules are now dead promises:
- The `<th class="none">` class is a plain class with no default browser meaning → cols stay visible.
- The `.tr1::after { content: " \A คลิกดูเพิ่มเติม"; }` is decorative — without the JS handler, it's a misleading hint.

**Fix — pure-CSS emulation in `legacy-overrides.css §11`:**

```css
/* Kill the dead-promise hint globally — all 5 stylesheets shadow this. */
.pcs-legacy .tr1::after,
.pcs-legacy-body .tr1::after { content: none !important; }

@media (max-width: 767.98px) {
  /* Honour the `<th class="none">` semantic — the legacy markup is right,
     the plugin just isn't there to enforce it. */
  .pcs-legacy table.dataTable thead th.none { display: none !important; }

  /* CSS can't reach a `td` from its `th` — there's no parent/sibling
     selector that walks the column. So per-page modifier classes
     (`.pcs-shops-page`) wrap the page and we spell out which td
     positions correspond to the `th.none` cols on THAT page. */
  .pcs-shops-page table#myTable tbody td:nth-child(2),
  .pcs-shops-page table#myTable tbody td:nth-child(3),
  .pcs-shops-page table#myTable tbody td:nth-child(5),
  .pcs-shops-page table#myTable tbody td:nth-child(6) {
    display: none !important;
  }
}
```

Page wrapper gains the modifier: `<div className="pcs-legacy pcs-shops-page">`. Information isn't lost because col 4 (ข้อมูลสินค้า) already has a `<div className="d-block d-sm-none">` block that duplicates date / orderno / status / price inline — that was the legacy's manual fallback for the collapsed-row "details" view.

**Bonus fix in the same media query — the status-tab strip:**

Legacy `style.css` L1015 forces `.tab-sm-center { width: 50% }` at `<578px` — 7 status tabs into a 2-column grid leaves the 7th hanging on its own row. Override to single-row horizontal scroll-snap (`flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none`) — customer swipes through tabs (iOS Mail / Calendar pattern).

**Per-page column-width tightening** in `shops.css` mobile media query (also scoped `.pcs-shops-page`): col 1 (ID) → compact `width:1%, white-space:nowrap, font-size:11px`; col 4 (product info) → `word-break: break-word, width:auto`; col 7 (actions) → compact + vertical-stack the action pills via `.btn { display: block; width: 100%; font-size: 10px }` so cancel/pay/view/receipt/invoice fit in a ~78px col.

**Faithful-port intent intact** — only the CSS layer changes. `<th class="none">`, `<th class="all">`, `class="tr1"`, the `.d-block.d-sm-none` mobile-summary block — all preserved 1:1 with the legacy PHP, so the next 1:1 audit (`legacy-fidelity-check` skill) still passes.

**Verification at 375×812 Chrome devtools mobile preset:**
- table width 569.7px → 349px (no overflow)
- cols 2/3/5/6 display: none; cols 1/4/7 visible
- `.tr1::after` content: none (no duplicate hint)
- tab strip flex-wrap: nowrap, overflow-x: auto (single-row, swipe)
- desktop ≥ 768px: all 7 cols re-appear; tabs revert to wrap layout

**Carryover:** Same pattern applies to `/service-payment` (cols 2/3/4/5 = none), `/service-import/pending` (cols 2/4/5/6 = none), `/wallet/history` — when those get the responsive treatment, add `.pcs-payment-page` / `.pcs-forwarder-page` / `.pcs-wallet-page` modifiers + per-page `td:nth-child` rules in `legacy-overrides.css §11` (already comment-stubbed there).

---

## What got captured as a learning

Two entries appended to `docs/learnings/nextjs-16-quirks.md`:

1. **Route-group chrome leak** — `[locale]/layout.tsx` paints chrome on EVERY route. Detection grep + the gate-to-`(group)/layout.tsx` fix.
2. **Customer-table mobile-collapse without DataTables-Responsive JS** — the dead-promise CSS triad (`<th class="none">`, `.tr1::after { content: "...คลิกดูเพิ่มเติม" }`, `dtr-inline`) + the per-page-modifier emulation pattern.

`docs/learnings/_index.md` `Last reviewed:` bumped to 2026-05-26.
`docs/STRATEGY.md §9 Phase B Wave 1` gained the post-launch hardening bullet so the live state reflects these four sprints.

---

## Carryovers (not blocking but on the radar)

- **PR7849 test password** still `test1234` (used during Sprint-26 mobile testing) — rotate back to the legacy bridge hash before final cutover, or delete the test password so the bridge re-engages for that customer.
- **`EMERGENCY_OTP_BYPASS = true`** at `actions/otp.ts:42` (since 2026-05-22) — security hole; revert once ThaiBulkSMS gateway is fixed.
- **Other customer tables mobile-collapse** — `/service-payment`, `/service-import/pending`, `/wallet/history` — pattern is established + comment-stubbed in `legacy-overrides.css §11`; per-page wrapper + per-page td:nth-child mapping needed.

---

## Branch / merge state at end of session

```
dave-pacred → 99e206a docs(learnings): Sprint-25 chrome leak + Sprint-26 mobile collapse patterns
main         → 99e206a (same — pushed straight through)
podeng       → d89176b (last ปอน push; merge base — no new work to pull at the time)
```

`dave-pacred ⇆ main` = 0/0 (in sync at the time).

---

## Addendum — 2026-05-26 night integrate-loop (post-Sprint-26 merge)

30 commits landed on `origin/dave-pacred` between my Sprint-26 push and my next push attempt — ปอน + ก๊อต's parallel `podeng → dave-pacred` integration session. The relevant overlaps with this sprint block:

- **`a08e7290 feat(service-order): Tailwind rebuild — Pacred theme, responsive card-stack`** — REPLACED `app/[locale]/(protected)/service-order/page.tsx` entirely with a clean Tailwind rewrite. The legacy 1:1 Bootstrap-4 markup + the `pcs-shops-page` wrapper className I added in Sprint-26 are GONE; the page is now responsive by design (Tailwind utility classes for the card layout, no `<table id="myTable">` to collapse).
- **`fb7939f1 fix(service-order + cart): mobile polish — FloatingTabs clearance, single-line header, 2-row tab strip`** — ปอน's mobile-polish iteration on top of the Tailwind rebuild.
- **`577adb72 fix(chrome): mobile register polish + restore FloatingTabs on protected`** — REVISED Sprint-25's `<FloatingTabs />` gate. Removing the floating widget from `(protected)` left the customer back-office with no mobile bottom-nav (since `legacy-overrides.css §0` hides the legacy `.nav-footer-pcs`). Restored at `(protected)/layout.tsx` — `<FloatingTabs />` has its own `isHidden` check that auto-hides on `/admin`, `/login`, `/register`, `/forgot-password`, so it now shows on public + protected but stays off admin + auth, which is the right end-state.

**What survives from Sprint-25 unchanged:**
- The 17 hard-coded `<Footer />` imports are still stripped (marketing footer doesn't show on protected/auth/transactional pages).
- `<FloatingTabs />` removed from `app/[locale]/layout.tsx` (no longer mounted on every locale route).
- New `app/[locale]/(public)/layout.tsx` still mounts `<FloatingTabs />` for public marketing.
- Net add: `<FloatingTabs />` now also mounted at `(protected)/layout.tsx` per ปอน (with the page-level `isHidden` gating it on auth/admin).

**What survives from Sprint-26 unchanged:**
- `legacy-overrides.css §11` — the `.tr1::after { content: none }` kill rule + the `th.none` collapse rule + the per-page-modifier pattern. ALL STILL IN PLACE.
- `public/legacy/pcs/shops.css` mobile media query rewrite — kept (it scopes via `.pcs-shops-page` so it's orphaned on `/service-order` now but no harm; covers the case a future page reuses the modifier).

**Net state after the integrate-loop:**
- `/service-order` is now Tailwind-responsive natively (ปอน's rebuild). My CSS overrides are orphaned on this specific page.
- `legacy-overrides.css §11` still serves the OTHER legacy customer tables that have NOT been rebuilt yet — `/service-payment`, `/service-import/pending`, `/wallet/history`, etc. The pattern + comment stubs remain in place for when those pages get the same treatment.
- The two learnings entries in `nextjs-16-quirks.md` still describe a generally-useful pattern (route-group chrome gating + pure-CSS emulation of DataTables-Responsive). The `legacy-fidelity-check` skill consumers will still find them when porting more legacy tables.

**Final branch state after the integrate-loop:**
```
dave-pacred = main = origin/dave-pacred (merged in 30 commits + verified)
podeng       at d89176b (merge base — no new ปอน push)
```

Verification gates passed post-merge: `pnpm tsc --noEmit` (exit 0, `.next/` filtered) · `pnpm lint` (exit 0, 45 warnings 0 errors) · `pnpm build` (exit 0, all routes generated).
