# Dr. Mobile-UX — Findings + Recommendations

> Pacred R&D, 2026-05-19. Specialist sweep across mobile UX + scanning + on-the-go workflows.
> Source branch: `dave` (post-launch). Author: Dr. Mobile-UX agent.
>
> **Crosslinks (read alongside):**
> [`docs/mobile-first-playbook.md`](../../mobile-first-playbook.md) (canonical mobile rules) ·
> [`docs/conventions.md`](../../conventions.md) §11 ·
> [`docs/briefs/ops-roles.md`](../../briefs/ops-roles.md) (14 STAFF roles) ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md) (legacy warehouse decoded) ·
> [`docs/audit/chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md) (L-1..L-10 + W-1..W-9) ·
> [`docs/PORT_PLAN.md`](../../PORT_PLAN.md) Parts V + W ·
> [`docs/research/capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md).

---

## 1. Current state (what Pacred already has)

### 1.1 Mobile-first compliance audit

**The good (mobile-first design IS partly internalised):**

- The mobile-first playbook ([`docs/mobile-first-playbook.md`](../../mobile-first-playbook.md), 181 lines, well-written) is documented. The 360px / 390px / 1280px gates are real. The `mobile-first-verify` skill exists in the skills kit.
- Tailwind v4 is configured mobile-first by default (no `tailwind.config.js`; `@theme inline` in [`app/globals.css`](../../../app/globals.css)). Unprefixed utilities scale up via `sm:` / `md:` / `lg:`.
- A purpose-built mobile bottom-nav exists at [`components/sections/floating-tabs.tsx:96-237`](../../../components/sections/floating-tabs.tsx) with:
  - `env(safe-area-inset-bottom)` padding (line 103)
  - Thumb-zone 68×68 px center FAB for `tel:024213325` (line 224)
  - Login/Logout swap based on session state (line 173)
  - Floating LINE bubble at `bottom-[78px] right-3` (line 240) — above the nav, customer-reachable.
- Global `body` has a 64px+safe-area bottom pad on mobile to clear the nav ([`app/globals.css:67-71`](../../../app/globals.css)).
- Customer-facing shipment timeline at [`app/[locale]/(protected)/shipments/[code]/page.tsx`](../../../app/[locale]/(protected)/shipments/[code]/page.tsx) renders well at narrow widths — fluid containers, freshness pill (lines 144-151), CBM-mismatch warning (lines 156-161). Truly good post-launch surface.

**The bad (mobile-first compliance violations):**

| # | Site | Violation | Impact |
|---|---|---|---|
| 1.1a | **No `viewport` meta + no theme-color** in [`app/layout.tsx`](../../../app/layout.tsx) (lines 19-69) — Next 16 supplies a default `width=device-width`, but Pacred does not export `viewport` per the Next 16 metadata API, so we cannot pin `viewport-fit=cover`, `theme-color`, status-bar style, or color-scheme. iOS PWA install + status-bar tint are broken by default. | High — customer trust signal + missed PWA opportunity |
| 1.1b | **No PWA manifest** at all (no `app/manifest.ts`, no `public/manifest.json`, no `next-pwa`). The `package.json` carries `qrcode` but no scanning lib, no `next-pwa`. Pacred cannot be installed as a home-screen app on either Android or iOS today, even though the owner explicitly wants "ใช้เครื่องสแกน หรือมือถือสแกนสินค้า". | High — blocks the on-the-go warehouse/driver use case |
| 1.1c | **No `apple-touch-icon`** — only `/images/pdiwaicon.png` exists as a non-sized icon. Add-to-Home-Screen on iOS gets a generic webclip icon. | Medium — brand polish + trust |
| 1.1d | **`Button` size variants all under 44px** at [`components/ui/button.tsx:25-29`](../../../components/ui/button.tsx). `sm=py-1.5 text-sm` ≈ 28px tall; `md=py-2.5 text-sm` ≈ 36px tall; `lg=py-3 text-base` ≈ 44px tall (border-line). Only `lg` passes the iOS 44px tap-target gate. Most call sites use `md` or `sm`. | High — every tappable button across the customer portal fails the 44px gate |
| 1.1e | **Sub-16px text on `<input>` elements** in admin screens (iOS zoom-on-focus bug). Hits: [`app/[locale]/(admin)/admin/audit/page.tsx:110,114,118,122,126,130`](../../../app/[locale]/(admin)/admin/audit/page.tsx) — all `text-sm` on date/text inputs; [`app/[locale]/(admin)/admin/system/notifications/page.tsx:213,217`](../../../app/[locale]/(admin)/admin/system/notifications/page.tsx) — `text-xs` on date inputs (the worst). File inputs in [`app/[locale]/(protected)/service-payment/yuan-payment-form.tsx:261,266`](../../../app/[locale]/(protected)/service-payment/yuan-payment-form.tsx) + [`app/[locale]/(protected)/service-order/add/add-form.tsx:163`](../../../app/[locale]/(protected)/service-order/add/add-form.tsx) + [`app/[locale]/(protected)/service-import/add/forwarder-form.tsx:403,407`](../../../app/[locale]/(protected)/service-import/add/forwarder-form.tsx) all use `text-sm`. | High on admin (warehouse staff use a phone); medium on customer side (file inputs are tap-once) |
| 1.1f | **74 `<table>` elements** in `(admin)` route group, all wrapped in `overflow-x-auto` per convention but at 360px width this means horizontal scroll on *every* admin table — warehouse staff has to scrub left/right to see Tracking + Status + Date columns. The forwarders table at [`app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx:123`](../../../app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx) is the prime example: 9 columns × ~120px each = ~1080px wide. | High — warehouse/driver/sales staff are on phones (ops-roles.md §12 + §13 explicitly) |
| 1.1g | **Driver action buttons** at [`app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx:43,52,60,67`](../../../app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx) — every button is `px-4 py-2 text-xs` (~32px tall, 12px text). Drivers are 100% on phones (ops-roles.md §13). Worst-case combo: small text + small tap area + the moment a driver is reaching for "รับงาน" or "ยืนยันส่งสำเร็จ" they are at a customer doorstep, often one-handed. | **Critical — this is the legacy app rebuilt with the same flaws** |
| 1.1h | **Admin shipment-row controls** at [`app/[locale]/(admin)/admin/warehouse/containers/[code]/shipment-row-controls.tsx:17`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/shipment-row-controls.tsx) use `px-2 py-1 text-xs` inputs (~24px tall, 12px text). Container rebind currently requires **pasting a raw UUID** (line 60 comment: "admin pastes target container UUID"). Impossible on a phone with no copy/paste flow. | High — warehouse staff cannot do this on their phone |

### 1.2 Scanning workflow current state

**What exists ([`app/[locale]/(admin)/admin/barcode/scan-form.tsx`](../../../app/[locale]/(admin)/admin/barcode/scan-form.tsx) — 372 lines, well-engineered for its scope):**

- A **single ScanForm component** is reused on 3 routes: `/admin/barcode` (intake/prepare), `/admin/barcode/driver` (driver out-for-delivery + delivered), and embedded as `ScanEventForm` on `/admin/warehouse/containers/[code]` (per-shipment event recorder).
- The form has 3 modes: `intake` (→ `arrived_thailand`), `prepare` (→ `out_for_delivery`), `driver` (→ `delivered`).
- **Camera scanning via `BarcodeDetector` Web API** (lines 8-14, 129-175). Supports `code_128`, `code_39`, `code_93`, `qr_code`, `ean_13`, `ean_8`, `itf`, `data_matrix` (line 32). 200ms detection loop (line 152), 2.5s same-code debounce (line 163).
- **Audio feedback** — beep on success (880 Hz), error (220 Hz) via `AudioContext` (lines 37-51). Good warehouse UX touch.
- **Manual fallback input** with `font-mono text-base` (line 286 — only place where text-base is used on an input in admin scan flows, this one is correct).
- **Session log** showing up to 50 last scans with success/error count chips (lines 326-369).
- Server action [`actions/admin/barcode.ts`](../../../actions/admin/barcode.ts) tries forwarders first (matches on `f_no` / `tracking_chn` / `tracking_th` / `cabinet_number`), then service_orders by `h_no`. Auto-fires LINE/notif on status change (lines 79-87).
- The **container detail page** ([`app/[locale]/(admin)/admin/warehouse/containers/[code]/scan-form.tsx`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/scan-form.tsx)) has 7 event presets — `scan_receive`, `scan_pack`, `scan_seal`, `scan_depart`, `scan_arrive`, `scan_unload`, `scan_deliver` (lines 11-19) — with auto-status mapping.

**What's missing:**

| # | Gap | Why it hurts |
|---|---|---|
| 1.2a | **`BarcodeDetector` is Chromium-only.** Safari iOS has no support (`window.BarcodeDetector` is undefined). The form falls back to text-error: "กล้องเปิดแล้ว แต่ browser นี้ไม่รองรับ — กรุณาพิมพ์โค้ดด้วยมือ หรือใช้ Chrome บน Android" (line 147). Per the owner's framing, **a major share of Pacred staff are on iPhones** — they get a broken scanner. | The slogan: "ใช้มือถือสแกนสินค้า" — for iPhone users today this means *cannot* |
| 1.2b | **No PWA wrapper** — staff must open Chrome each shift, navigate, log in. No standalone scanner app icon, no preserved login. | Friction — every shift starts with login plus 3 taps |
| 1.2c | **No offline buffer.** Scans go straight to a server action (line 92); if WiFi/4G drops at the loading dock the scan fails and the staff must re-scan. The legacy SQL fix-by-IT pattern (L-2 in chat audit) is rebuilt at the network-fail layer. | Daily warehouse pain — 30+ "ไม่ขึ้นในระบบ" mentions per chat audit |
| 1.2d | **No batch / bulk-scan mode.** Each scan is one round-trip. At MOMO container intake (hundreds of boxes), each scan blocks on `await adminBarcodeScan` (line 92). A 200-box truck takes 200 × ~500ms ≈ 100s just in network time. The legacy PHP `forwarder-search-muti.php` (chat audit W-9) was multi-line paste; Pacred has its bulk-search counterpart at `/admin/forwarders/bulk-search` for SEARCH, but not for INTAKE. | High — warehouse intake bottleneck |
| 1.2e | **No "container assignment" scan flow.** To pack a parcel into a container you must navigate to container detail → use the `ScanEventForm` and pick the right preset. No single-screen "pick container, then scan parcels" path. | Cargo-ops forensics §3.4 — "ตัดตู้ fails silently" (C3) — staff cannot find shipments because the container close-date isn't set; UX has no hint |
| 1.2f | **No driver mobile pickup-confirm flow.** Driver scan = forwarder.status `out_for_delivery` → `delivered`. There is **no proof-of-delivery photo capture**, no signature, no GPS lat/lng on the scan event. Legacy PHP had photo POD (chat audit + ops-roles.md §11 "proof-of-delivery photo upload"). Pacred drivers cannot prove they delivered. | High — driver-customer disputes have no evidence trail |
| 1.2g | **No mobile-app deep-link for scanner devices.** Pacred has many staff using **Honeywell / Zebra Bluetooth scanners**. These work fine into the manual input field (autoComplete=off, autoFocus on `inputRef.current?.focus()` line 82) — but the page-load latency on each scan loses the "scanner attach" feeling. | Medium — warehouse intake throughput |
| 1.2h | **No per-box scan-in for cargo discrepancy** ("ตกหล่น" / missing items). The cargo-ops doc D4 says split-receipt is "expected_qty vs received_qty must be modelled" — and U1-5 schema added the column — but the scan flow does not increment `received_box_count` per box; it only increments per-shipment status. So a 40-of-85 progress bar shipment can never be created via scan, only via the row-control input box. | High — chat L-2 #1 leak rebuilt |
| 1.2i | **No printable barcode/QR generator** to put on Pacred's own shipment labels (`CG#########[-NNN]`). The `qrcode` package is only used for PromptPay payment QR ([`lib/promptpay.ts:18`](../../../lib/promptpay.ts)). | High — Pacred cannot generate its own scan labels — depends on supplier-printed CN barcodes |
| 1.2j | **No "scan to find shipment status"** customer-facing flow. A customer with a Pacred sticker on a box cannot scan it from their phone and see status. | Medium — customer trust signal, content marketing angle |

### 1.3 Customer-side mobile UX state

**The customer portal is server-rendered first** — that part is great for mobile (fast first paint, no JS-blocked initial render). Mobile-tested + observed surfaces:

- ✅ `/dashboard` (post-login PCS launchpad — [`app/[locale]/(protected)/dashboard/page.tsx`](../../../app/[locale]/(protected)/dashboard/page.tsx)) — fluid, the 9-icon launchpad grid is 3×3 → renders cleanly at 360px.
- ✅ `/shipments` + `/shipments/[code]` — fluid, freshness-pill UX is good, timeline is a vertical `<ol>` (mobile-friendly), CBM diff badge wraps at narrow widths.
- ⚠️ `/wallet/deposit` ([`app/[locale]/(protected)/wallet/deposit/deposit-form.tsx`](../../../app/[locale]/(protected)/wallet/deposit/deposit-form.tsx)) — uses PromptPay QR (good), but the slip-upload `<input type="file">` is `text-sm` (1.1e violation) + no `capture="environment"` hint → iOS users tap → gallery picker (not camera). Slip-from-camera is a 1-tap saving × every wallet deposit.
- ⚠️ Yuan payment form ([`app/[locale]/(protected)/service-payment/yuan-payment-form.tsx:261,266`](../../../app/[locale]/(protected)/service-payment/yuan-payment-form.tsx)) — same `text-sm` slip-upload, no `capture` hint.
- ⚠️ Service-import / service-order forms — verbose multi-step forms with `text-sm` labels + many sub-controls. The "Pinselector" / "DocAttachSelector" / "LaborSelector" booking sub-components ([`components/booking/options/*`](../../../components/booking/options/)) need their own mobile pass.
- ⚠️ `BookingCalculator` ([`components/booking/BookingCalculator.tsx`](../../../components/booking/BookingCalculator.tsx)) — uses `h-11 px-4 md:px-6 ... text-[13px] md:text-sm` for chips — 44px tall, **but 13px text is sub-16px on mobile** → iOS zoom risk if the chip ever wraps in a focusable element.
- ❌ **No public guest tracking page** at `/track/[code]` or similar. The only tracking surface is `/shipments/[code]` and `/service-import/[fNo]` — both behind `requireAuth()`. A customer who got their tracking via LINE OA has **no way to share it without logging in**. The legacy PHP had a public tracking page (chat audit W-9 — pasteable URL).
- ❌ **No on-page LINE / WhatsApp share buttons.** Customers asked "ตู้ X เข้าเมื่อไหร่" (chat #1 pain) — they can't deep-link a friend to their shipment status.
- ❌ **No barcode/QR on a customer's tracking page.** A scan-to-track flow + share would close the loop.

### 1.4 Staff-side mobile UX state (warehouse / driver / interpreter)

**14 STAFF role workspaces** are documented in [`docs/briefs/ops-roles.md`](../../briefs/ops-roles.md). All except role #1 (developer) are PHONE-FIRST in their daily work. Current Pacred state per role:

| Role | Current mobile state | Owner's stated need |
|---|---|---|
| #5 Planning | `/admin/planning/*` is Phase G2 build — does not exist | Container pool board (touch-friendly, drag-drop on phone is hostile but feasible) |
| #6 CS | No dedicated CS workspace yet (Phase G2). CS uses ad-hoc admin views on phone | A "customer 360°" page reachable from any phone |
| #7 Docs | Tax invoice exists; Form-E/D-O generators are Phase 2 | Phone-printable PDF preview |
| #11 Messenger | Logistics module is Phase 2 — no workspace | Pickup-app flow on phone |
| #12 Warehouse | `/admin/warehouse/containers/*` exists but **table-heavy + small text inputs everywhere** | "Inbound scan UI" — exists at `/admin/barcode`, but per-shipment rebind is keyboard-driven |
| #13 Driver | `/admin/driver-runs` exists with `/admin/barcode/driver` — best mobile-aware surface in the app, but small action buttons (1.1g), no POD photo, no GPS, no map link to address | "Driver-side mobile view" |
| #14 Sub-driver | Schema doesn't split yet | (Same as driver, Phase 2) |

**Most acute pain — warehouse/driver phones in the rain at a loading dock with one hand on a parcel — Pacred has built the right pages but at desktop-sized UI density.** The legacy PHP system did the same thing.

**Per-page audit summary table:**

| Route | Mobile-first? | Critical issue |
|---|---|---|
| `/admin/barcode` (intake) | 🟡 Partial | iOS Safari = no scan; small mode-selector buttons (`py-3` is fine but `text-sm` is borderline) |
| `/admin/barcode/driver` | 🟡 Partial | Same |
| `/admin/warehouse/containers` (list) | ❌ No | Table; staff cannot search/find from phone effectively |
| `/admin/warehouse/containers/[code]` | ❌ No | Side-by-side `grid lg:grid-cols-[1fr_360px]` collapses to one column at <lg, which is correct, but the inline forms inside are dense — manual-shipment-form has ~12 fields stacked |
| `/admin/forwarders` (list) | ❌ No | 9-column table |
| `/admin/driver-runs` | 🟡 Partial | Vertical row layout is fine but tap targets too small (1.1g) |
| `/admin/board` + `/admin/inbox` (work_items) | 🟡 Unknown — not deeply audited; ship-status check needed | New surface from Tier 2 — needs its own mobile pass |

---

## 2. Gaps — what's missing

### 2.1 Critical gaps (P0 — block daily ops)

**G-M1 — iOS Safari has no barcode scanner.** Pacred staff on iPhones today simply cannot scan. The owner's promise "ใช้มือถือสแกนสินค้า" is currently iPhone-broken. Fix = ship a fallback: `@zxing/browser` (Apache-2.0, ~120KB gz) or `@zxing/library` next to the native `BarcodeDetector`. The branching is already there (line 144 — "Initialise BarcodeDetector"); replace the "not supported" message with a polyfilled detector. See R-1 below.

**G-M2 — `Button` size variants fail the 44px gate.** Single-file fix at [`components/ui/button.tsx:25-29`](../../../components/ui/button.tsx); `md` → `min-h-11`, `sm` → `min-h-11` (or rename and add an `xs`). Every consumer benefits. Touch-target compliance is non-negotiable per [`docs/conventions.md`](../../conventions.md) §11.

**G-M3 — Driver action buttons fail badly.** [`action-buttons.tsx`](../../../app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx) — every button is `text-xs`. The driver is the most-mobile, most-time-pressured staff role. Fix: dedicated `<DriverButton>` primitive with `min-h-12 text-base` + visual weight (big colored block, label below icon, single-tap to action).

**G-M4 — Tables on phones (74 sites).** All admin lists are tables wrapped in `overflow-x-auto`. The right pattern on mobile is a **card list**: stack each row vertically, keep the most-load-bearing 3-4 fields visible, hide secondary fields behind an accordion or a "more" tap. Already done correctly on `/admin/warehouse/containers/[code]` shipment list (lines 240-326 of that file = `<ul className="divide-y">` not `<table>`). Pattern is to extend that to forwarders + containers + driver runs + bookings + invoices.

**G-M5 — No PWA / installable app.** Per the owner's explicit framing ("ระบบติดตามผ่านมือถือ"), Pacred should be installable to the home screen so staff + customers don't need to navigate to a URL. Manifest, theme-color, splash icons, service worker = at minimum, the installable shell. With the service worker, the scan-form can buffer offline scans + replay on reconnect (kills the "no signal at dock" failure mode).

**G-M6 — No `viewport` meta export.** Next 16 has a separate `viewport` export. Current [`app/layout.tsx`](../../../app/layout.tsx) doesn't have it. Add:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
  colorScheme: "light dark",
};
```

This unlocks: iOS notch-safe rendering, correct status-bar color, Android Chrome theme tint.

### 2.2 High-value gaps (P1)

**G-M7 — `<input type="file">` slip-upload should hint camera.** Adding `capture="environment"` to file inputs in [`yuan-payment-form.tsx:261,266`](../../../app/[locale]/(protected)/service-payment/yuan-payment-form.tsx) + [`wallet/deposit/deposit-form.tsx`](../../../app/[locale]/(protected)/wallet/deposit/deposit-form.tsx) + [`forwarder-form.tsx:403,407`](../../../app/[locale]/(protected)/service-import/add/forwarder-form.tsx) + [`add-form.tsx:163`](../../../app/[locale]/(protected)/service-order/add/add-form.tsx) → tapping triggers camera directly on mobile (instead of the gallery picker dialog). 1-line change × every slip upload × every customer = real revenue path win.

**G-M8 — Sub-16px text on inputs (iOS zoom-on-focus).** Most admin filter forms (audit, system/notifications, system/crons, sidebar search) use `text-xs` / `text-sm` on text inputs. Fix: enforce `text-base` (16px) on all `<input>` / `<select>` / `<textarea>`. Helper component or an ESLint rule (`no-text-xs-on-input`).

**G-M9 — Proof-of-delivery photo capture on driver scan.** Driver scans → `delivered` flips → notification fires. Add a `<input type="file" accept="image/*" capture="environment">` on the driver scan flow so the driver snaps a photo of the customer's signature / parcel at door before the `delivered` flip. Save to `delivery-pods/` storage bucket (per ops-roles.md §11). Closes the "ตกหล่น" / dispute leak (chat audit L-2).

**G-M10 — GPS lat/lng on scan events.** `navigator.geolocation.getCurrentPosition()` on every scan. Stored on `cargo_shipment_events.geo_lat / geo_lng`. Surfaces "scanned at this lat/lng" in the timeline; gives the planner an audit trail and the customer trust ("scanned at Mukdahan checkpoint"). Privacy: opt-in flag per staff role.

**G-M11 — Card-list mobile table pattern.** A reusable `<MobileCard>` component that renders the same data as a table cell, stacked. Convert all 74 admin tables — or at minimum: forwarders, containers, driver-runs, bookings, invoices, wallet-deposits-pending, slip-approvals.

**G-M12 — Container rebind needs a search picker.** [`shipment-row-controls.tsx`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/shipment-row-controls.tsx) currently asks the admin to paste a raw UUID. Replace with a server-action-backed combobox over `cargo_containers` by code prefix (recent + active only).

**G-M13 — Bulk scan / batch mode for intake.** Switch the scan-form to a "queue then submit" mode: scan 10 in 10s, the screen shows them stacked, one tap submits all → server batches in one round-trip. Cuts MOMO-intake bottleneck (Pacred receives several containers per week from MOMO).

**G-M14 — Print Pacred labels.** Add a `/admin/labels/print` flow that generates a Code-128 + CG-prefixed barcode PNG for any forwarder/shipment, sized to a 100×75mm thermal label. Use the existing `qrcode` lib + a Code-128 lib (`bwip-js` is the standard — MIT licensed). Pacred can finally generate its own scan tape instead of relying on supplier-printed CN labels.

**G-M15 — Public guest tracking page.** Mirror of `/shipments/[code]` at `/track/[code]` (no auth). RLS gate: include the shipment_code in a signed URL OR allow read-by-code-only with rate limit. Closes chat-pain #1 ("ตู้ X เข้าเมื่อไหร่") + makes LINE OA shares lead to a Pacred URL not a phone reply.

### 2.3 Nice-to-have (P2)

**G-M16 — LINE LIFF integration for the scan flow.** Once a driver/warehouse staff logs in to LINE OA + opens LIFF, the camera permission is pre-granted. Reduces "permission denied" failures (ScanForm line 172). DV-2 LIFF is in the pipeline.

**G-M17 — Voice-callout on scan beep.** Replace the `playBeep` with Web Speech API: "PR1234 รับเข้าโกดังแล้ว". Staff don't need to look at the screen. Pure win for a one-handed worker.

**G-M18 — Haptic feedback.** `navigator.vibrate([50])` on success, `[100, 50, 100]` on error. Free, supported on Android.

**G-M19 — Map embed on driver-runs.** Each row at [`driver-runs/page.tsx:151`](../../../app/[locale]/(admin)/admin/driver-runs/page.tsx) has a `ship_address_line` + sub_district + district + province + postal_code. Concatenate + render a "เปิด Google Maps" link (`https://www.google.com/maps/search/?api=1&query=...`) + optional inline embed.

**G-M20 — Mobile-optimised customer dashboard.** The 3×3 PCS launchpad icon grid is fine. But the secondary stats sections (wallet, recent orders, recent forwarders) are dense at 360px — collapse into a tabbed view with `aria-controls`.

**G-M21 — QR for customer self-tracking.** On `/shipments/[code]`, render a QR pointing to the same URL → customer can show this to a friend OR scan from a printout. Combined with G-M15 (public track page) this is the "scan to find" experience.

**G-M22 — Offline scan buffer (PWA).** With G-M5 PWA + a service worker, queue failed scans in IndexedDB + replay on reconnect. Service-worker Workbox setup is well-trodden territory.

**G-M23 — `inputMode` everywhere it should be.** 129 sites in code already use `inputMode` / `type=tel/email/number`. Audit the missing ones — every numeric field (CBM, weight, qty, amounts) should set `inputMode="decimal"` (or `inputMode="numeric"` for pure-integer counts).

**G-M24 — Wallet deposit slip OCR.** With slip-OCR (post-launch P2), staff approval flow gets a `parsed_amount` + `parsed_bank` + `parsed_time` to compare with admin's slip-view. Free banks API: `slipverify.com` / Krungsri's open API. Pacred could even auto-approve when slip matches.

---

## 3. Recommendations — tools + patterns + libs to adopt

### R-1 (P0, Effort: S) — `@zxing/browser` polyfill for `BarcodeDetector`

- **What it solves:** G-M1 (iOS Safari = no scanner). The branching is already there in [`scan-form.tsx:144-148`](../../../app/[locale]/(admin)/admin/barcode/scan-form.tsx) — drop in a polyfill in the `else` branch instead of showing "not supported".
- **Lib:** [`@zxing/browser`](https://github.com/zxing-js/browser) (Apache-2.0). ~120KB gz. Active maintenance. Supports the exact 9 formats Pacred lists.
- **Where it lands:** new file `lib/scan/detector.ts` exports `getDetector()` returning native if available, else a `BrowserMultiFormatReader` adapter.
- **Effort:** S (≤3 d — drop-in + verify on real iPhone). Already mentioned as a candidate in [`docs/sprints/archive-a-to-n.md:899`](../../sprints/archive-a-to-n.md) and [`docs/sprints/archive-a-to-n.md:1129`](../../sprints/archive-a-to-n.md) D-3 row — **the team picked this lib then never delivered the fallback path.**
- **Impact:** Revenue + staff efficiency — unlocks the iPhone half of the staff fleet for scanning. Existing plan: G-11 in PORT_PLAN Part W §W-9+ (driver/warehouse scan + capacity layer).
- **Mobile-first considerations:** Already PWA-compatible. Worker-thread option for big images on lower-end Androids. No camera-permission UX change — `getUserMedia` is identical.

### R-2 (P0, Effort: S) — Fix `Button` tap-target sizing site-wide

- **What it solves:** G-M2 (44px tap-target gate). At [`components/ui/button.tsx:25-29`](../../../components/ui/button.tsx).
- **Change:**

```ts
const sizeStyles: Record<Size, string> = {
  sm: "min-h-11 px-4 py-2 text-sm",     // 44px tall
  md: "min-h-11 px-5 py-2.5 text-base", // 44px tall, body text
  lg: "min-h-12 px-6 py-3 text-base",   // 48px tall
};
```

- **Effort:** S (single file + visual smoke on a few key pages). 200+ call sites; the change cascades automatically.
- **Impact:** Customer trust + staff efficiency. Compliance with mobile-first-playbook §3.2.
- **Mobile-first considerations:** Verify `lg` doesn't cause overflow in modal action bars at 360px width. Optionally add an explicit `xs` for genuinely-tertiary actions where 44px is overkill (settings sub-menus).

### R-3 (P0, Effort: S) — Export `viewport` + add PWA manifest

- **What it solves:** G-M5 + G-M6 (no PWA, no viewport meta).
- **Steps:**
  1. Add `export const viewport: Viewport = {...}` to [`app/layout.tsx`](../../../app/layout.tsx) (Next 16 pattern — see §2.1 above).
  2. Create `app/manifest.ts` (Next 16 dynamic manifest):

```ts
import { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pacred",
    short_name: "Pacred",
    description: "Pacred — นำเข้า ส่งออก ชิปปิ้ง เคลียร์ศุลกากร ครบวงจร",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#B30000",
    icons: [
      { src: "/images/pdiwaicon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/images/pdiwaicon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/images/pdiwaicon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "สแกน", url: "/admin/barcode", icons: [{ src: "/images/scan-icon.png", sizes: "192x192" }] },
      { name: "งานของฉัน", url: "/admin/driver-runs" },
      { name: "ติดตามตู้", url: "/shipments" },
    ],
  };
}
```

  3. Add proper `apple-touch-icon` sizes (180, 152, 120, 76).
- **Effort:** S (≤2 d).
- **Impact:** Revenue + staff efficiency + brand. Installable home-screen icon = 1 tap to Pacred. Status-bar tint + splash screen. iOS PWA + Android Chrome both work.
- **Mobile-first considerations:** Standalone display means no Safari chrome → Pacred MUST add a back button if not present on every protected page (the AppBar already has `← กลับ` links, audit those). For drivers, `start_url: "/admin/driver-runs"` should be role-aware via a query-string + a server-side redirect.

### R-4 (P0, Effort: M) — `<MobileCard>` primitive + convert 74 admin tables

- **What it solves:** G-M4 (admin tables hostile on phone).
- **Pattern:**

```tsx
// components/admin/mobile-card.tsx
export function MobileCard({ children, title, badges, actions }: {
  children: React.ReactNode;
  title: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-2 lg:hidden">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="font-bold text-sm">{title}</div>
        {badges && <div className="flex gap-1.5 flex-wrap">{badges}</div>}
      </header>
      <div className="text-sm space-y-1">{children}</div>
      {actions && <footer className="pt-2 border-t border-border flex flex-wrap gap-2">{actions}</footer>}
    </li>
  );
}
```

- **Migration plan:** dual-render the table (desktop) AND a `<ul>` of `<MobileCard>` (mobile-only). Show one or the other with `lg:hidden` / `hidden lg:block`.
- **Priority order:** driver-runs → forwarders → containers → bookings → freight invoices → freight quotes → wallet/deposits → contact-messages → audit log.
- **Effort:** M (1–2 wk for the top 10 tables — once the primitive lands, each table is ≤30 min).
- **Impact:** Massive staff efficiency. Warehouse + driver + sales all win.
- **Mobile-first considerations:** Keep tables for `lg:` (desktop). Mobile uses the card list. Search/filter UX needs its own pass — most admin filter bars use `text-xs` (G-M8) and need to convert to a collapsible filter drawer on mobile.

### R-5 (P0, Effort: S) — `capture="environment"` on every customer slip-upload

- **What it solves:** G-M7 (slip upload triggers camera not gallery).
- **Where:** 5 file inputs (search `accept="image/*"` in protected routes).
- **Patch (1 line each):**

```tsx
<input type="file" accept="image/*,application/pdf" capture="environment" onChange={...} />
```

- **Effort:** S (≤1 d).
- **Impact:** 1-tap saved × every wallet deposit × every yuan-payment × every forwarder-photo upload. Improves customer trust ("the form just works").
- **Mobile-first considerations:** `capture` is a hint; if the browser doesn't support it (older Android Chrome), behavior falls back to standard file picker — no breakage.

### R-6 (P1, Effort: M) — Driver primitives + proof-of-delivery

- **What it solves:** G-M3 (driver buttons too small) + G-M9 (no POD photo) + G-M10 (no GPS).
- **Components:**
  - `<DriverButton>` — `min-h-14 px-6 text-base font-bold flex flex-col items-center gap-1` with icon-above-label layout. Visually loud (saturated bg).
  - `<PhotoCapture>` — wraps `<input type="file" accept="image/*" capture="environment">` with a thumbnail preview.
  - `<GeoTag>` — fires `navigator.geolocation.getCurrentPosition` on mount, returns lat/lng to a hidden input.
- **Server actions:** extend [`actions/admin/forwarder-drivers.ts::driverUpdateOwnAssignmentStatus`](../../../actions/admin/forwarder-drivers.ts) to accept a POD photo + geo on the `complete` action; save to `delivery-pods/` bucket (new) + `cargo_shipment_events.geo_lat/geo_lng/photo_storage_path` (migration `0088`+).
- **Effort:** M (1 wk including new bucket, RLS, schema).
- **Impact:** Driver dispute trail + customer trust signal ("photo confirmed delivered at door").
- **Mobile-first considerations:** Geolocation needs HTTPS (Vercel: ✅). Permission denial gracefully falls back to "no GPS" — don't block the complete-flow. POD bucket = private + RLS gated.

### R-7 (P1, Effort: M) — Print-your-own labels (`bwip-js` + Code-128)

- **What it solves:** G-M14 (no Pacred-printed labels).
- **Lib:** [`bwip-js`](https://github.com/metafloor/bwip-js) (MIT, ~200KB gz). Server-side render to PNG + canvas in browser. Supports Code-128, EAN-13, QR.
- **Where:** new route `app/[locale]/(admin)/admin/labels/print/page.tsx` + server action `actions/admin/labels.ts::generateBarcodeLabel(f_no)`. Renders a 100×75mm canvas at 203 dpi (8 dots/mm = thermal printer standard).
- **Effort:** M (1 wk including a Pacred-branded layout: header + barcode + human-readable code + customer name).
- **Impact:** Pacred no longer depends on supplier-printed CN barcodes. Cargo-ops forensics D2 ("two parallel systems that don't reconcile") gets a Pacred-canonical barcode that survives across legacy + Pacred + MOMO.
- **Mobile-first considerations:** Print-from-phone is a corner case (admin only); desktop-first is fine. But the *scan-the-printed-Pacred-barcode* flow MUST work from the camera on any phone — verify the bar density at 100×75mm renders crisp at the typical 30cm phone-to-label distance.

### R-8 (P1, Effort: S) — Public guest tracking page `/track/[code]`

- **What it solves:** G-M15 (no public tracking) + chat audit #1 customer pain ("ตู้ X เข้าเมื่อไหร่").
- **Pattern:** Mirror [`app/[locale]/(protected)/shipments/[code]/page.tsx`](../../../app/[locale]/(protected)/shipments/[code]/page.tsx) in a public route. Server action `getPublicShipment(code, token)`. RLS: a `shipment_share_tokens` table OR allow read-by-shipment_code-only with rate limit + Sentry suspicious-pattern alert.
- **Effort:** S (≤3 d). Reuse the existing component tree.
- **Impact:** Customer-pain #1 closed. Shareable LINE links. Open path for ad campaigns ("Track your shipment" CTA).
- **Mobile-first considerations:** The page IS already mobile-first. The new entry point + SEO metadata (Open Graph for LINE preview) is the work. Add a Pacred-branded QR generator on the page (G-M21) so customers can save the link to their phone home screen.

### R-9 (P1, Effort: M) — Batch scan mode + offline buffer (post-PWA)

- **What it solves:** G-M13 (no batch) + G-M22 (offline buffer).
- **Steps:**
  1. Add a "queue mode" toggle in `ScanForm` — scans accumulate in state, "ส่งทั้งหมด" button submits a batched server action that loops through atomically.
  2. With PWA service worker (post-R-3), wrap the batch action in a Workbox `BackgroundSyncPlugin` so offline scans queue in IndexedDB and replay on reconnect.
- **Effort:** M (1 wk for batch; +3 d for offline w/ service worker).
- **Impact:** 50× scan throughput at MOMO container intake. Closes "ไม่มีสัญญาณที่ dock" failure mode.
- **Mobile-first considerations:** The queue UI must show clearly which scans are pending vs synced — color-coded list, mark-as-sent on success. Worst case: a battery-dead phone loses the IndexedDB; document the "export queue as JSON" recovery flow.

### R-10 (P1, Effort: S) — Touch-target sweep on driver-runs/scan-form

- **What it solves:** G-M3 inline.
- **Specific edits:**
  - [`action-buttons.tsx:43`](../../../app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx) — `px-4 py-2 text-xs` → `min-h-12 px-5 text-base`.
  - [`action-buttons.tsx:52`](../../../app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx) — same.
  - [`action-buttons.tsx:60`](../../../app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx) — same.
  - [`scan-form.tsx:208-219`](../../../app/[locale]/(admin)/admin/barcode/scan-form.tsx) — mode-selector buttons: `py-3 text-sm` → `min-h-12 text-base`.
  - [`scan-form.tsx:282-298`](../../../app/[locale]/(admin)/admin/barcode/scan-form.tsx) — manual input + OK button: already `py-3` + `text-base` on input, but the OK button is `px-5 rounded-lg ... text-sm` — bump to `min-h-12 text-base`.
- **Effort:** S (≤1 d).
- **Impact:** Direct driver/warehouse UX win.

### R-11 (P1, Effort: M) — Map link / address-block on driver-runs

- **What it solves:** G-M19.
- **Pattern:** Concat the address fields → `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(...)}`. Render as a button.
- **Steps:** edit [`driver-runs/page.tsx:151`](../../../app/[locale]/(admin)/admin/driver-runs/page.tsx) row template; add a new "เปิดแผนที่ →" button next to "📞 phone" link.
- **Effort:** S (≤2 d).
- **Impact:** Driver saves 5-10 sec per delivery. Compound on a 30-stop day.

### R-12 (P1, Effort: S) — Scanner-device deep-link

- **What it solves:** G-M2g — Honeywell/Zebra Bluetooth scanners feel laggy because each scan triggers a server round-trip.
- **Steps:** Add a "scanner attached" mode in `ScanForm` that swaps the auto-focus loop for an optimistic-UI: append the scanned code to the session log immediately (gray "pending"), then resolve on server response (green "ok" / red "err"). Pseudo-batching that doesn't change the data model.
- **Effort:** S (≤2 d).
- **Impact:** Warehouse intake throughput.

### R-13 (P2, Effort: S) — Voice + haptics on scan

- **What it solves:** G-M17 + G-M18.
- **Effort:** S (≤1 d total).
- **Impact:** Quality-of-life win for one-handed scanning.

### R-14 (P2, Effort: S) — `inputMode` audit

- **What it solves:** G-M23.
- **Effort:** S — sweep all `<input>` declarations, set `inputMode="decimal"` on amount/CBM/weight fields, `inputMode="numeric"` on pure-integer counts, `inputMode="tel"` on phone fields.
- **Impact:** Customer + staff get the right keyboard, fewer typos.

### R-15 (P2, Effort: M) — Customer-side QR/scan on `/shipments/[code]`

- **What it solves:** G-M21 + G-M2j (customer self-scan).
- **Pattern:** On the shipment detail page, render a QR pointing to `/track/[code]` (public). Customer can scan from a printout or share via LINE.
- **Effort:** S (≤2 d) — `qrcode` already installed.
- **Impact:** Shareable + content-marketing angle (Pacred boxes are scannable).

### R-16 (P2, Effort: M) — Slip OCR pre-fill

- **What it solves:** G-M24 (staff slip-verify automation).
- **Lib:** Tesseract.js (client-side OCR) for the cheap version OR a Thai bank slip API (Krungsri / SCB).
- **Effort:** M (1 wk for client-side OCR pre-fill; longer for bank-API integration + cert handling).
- **Impact:** Staff approval flow faster + fewer typos.

### R-17 (P2, Effort: L) — Native app shell

- **What it solves:** "FUTURE native apps" mentioned in [`docs/mobile-first-playbook.md:18`](../../mobile-first-playbook.md). Once PWA is in place, a [Capacitor](https://capacitorjs.com/) wrapper gets Pacred onto the Google Play + App Store with the EXISTING Next.js codebase. Capacitor 8 wraps a Next.js standalone build into a native shell + supplies real-native APIs (camera, push notifs, biometrics).
- **Effort:** L (2-4 wk including store submission paperwork + signing).
- **Impact:** Real native push notifications (no LINE OA dependency for customer alerts). Native barcode SDK (ML Kit on Android, Vision on iOS) — even better than zxing. Filesystem POD photos stored encrypted. App store presence = brand legitimacy.

---

## 4. Specific things to research deeper (if time permits)

1. **iOS PWA gotchas with `getUserMedia`** — Safari has very specific quirks (no inline video without `playsInline`; the playbook line 249 has it, but the manifest standalone mode adds new ones). Test a real iPhone in standalone mode.
2. **Honeywell/Zebra Bluetooth keyboard-wedge integration** — how to detect a Bluetooth scanner vs a manual keystroke (HID vs typing speed heuristics).
3. **MOMO partner — does their app provide a barcode/QR for their containers?** If so, ก๊อต should align Pacred's barcode format with MOMO's so a single scan validates both sides. (See `docs/integrations/momo-jmf.md` — once ก๊อต locks endpoint inventory.)
4. **Pacred-branded QR labels — physical durability** — thermal-print testing in rain (loading dock conditions), waterproof laminate options.
5. **Driver mobile data plan reimbursement** — operational policy not code, but Pacred should think about subsidising the 4G plan if drivers' phones are the official scanner.
6. **Apple App Store policy for delivery apps** — POD photos + GPS could trigger "Location Services" review questions. Document the privacy disclosure ahead of submission.
7. **Sub-driver pairing UX** — ops-roles.md §14 — primary + sub on the same shipment. Once the schema splits, the mobile UI needs a "this is my sub-driver" toggle so the right person gets the scan attribution.
8. **CN-side WeChat batch import** — chat audit W-5. Currently: China warehouse pastes 100+ tracking numbers in WeChat → screenshot → admin SQL. Pacred could ship a phone-camera-OCR for WeChat screenshots → parsed-tracking ingest. Higher leverage than it sounds — 100s of trackings per week.
9. **Privacy: customer geolocation** — should `/track/[code]` log the visitor's IP/geo? Probably yes (Sentry already does it via server). Document this in the privacy policy.

---

## 5. References — every doc/file cited

### Code referenced (all paths absolute)

- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/layout.tsx`](../../../app/layout.tsx) — root layout, no `viewport` export
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/layout.tsx`](../../../app/[locale]/layout.tsx) — locale layout
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/globals.css`](../../../app/globals.css) — Tailwind theme + mobile body pad
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/barcode/page.tsx`](../../../app/[locale]/(admin)/admin/barcode/page.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/barcode/scan-form.tsx`](../../../app/[locale]/(admin)/admin/barcode/scan-form.tsx) — the 372-line ScanForm
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/barcode/driver/page.tsx`](../../../app/[locale]/(admin)/admin/barcode/driver/page.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/warehouse/containers/[code]/scan-form.tsx`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/scan-form.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/warehouse/containers/[code]/page.tsx`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/page.tsx) — 451-line container detail
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/warehouse/containers/[code]/shipment-row-controls.tsx`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/shipment-row-controls.tsx) — UUID-paste rebind
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/warehouse/containers/[code]/manual-shipment-form.tsx`](../../../app/[locale]/(admin)/admin/warehouse/containers/[code]/manual-shipment-form.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/driver-runs/page.tsx`](../../../app/[locale]/(admin)/admin/driver-runs/page.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx`](../../../app/[locale]/(admin)/admin/driver-runs/action-buttons.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx`](../../../app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx) — 9-column table
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/forwarders/bulk-search/bulk-search-form.tsx`](../../../app/[locale]/(admin)/admin/forwarders/bulk-search/bulk-search-form.tsx) — multi-line bulk search
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/audit/page.tsx`](../../../app/[locale]/(admin)/admin/audit/page.tsx) — text-sm inputs
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/system/notifications/page.tsx`](../../../app/[locale]/(admin)/admin/system/notifications/page.tsx) — text-xs date inputs
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(admin)/admin/inventory/page.tsx`](../../../app/[locale]/(admin)/admin/inventory/page.tsx) — redirect to barcode
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(protected)/shipments/[code]/page.tsx`](../../../app/[locale]/(protected)/shipments/[code]/page.tsx) — best customer mobile surface
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(protected)/shipments/page.tsx`](../../../app/[locale]/(protected)/shipments/page.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(protected)/dashboard/page.tsx`](../../../app/[locale]/(protected)/dashboard/page.tsx) — PCS launchpad
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(protected)/service-payment/yuan-payment-form.tsx`](../../../app/[locale]/(protected)/service-payment/yuan-payment-form.tsx) — slip upload
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(protected)/service-import/add/forwarder-form.tsx`](../../../app/[locale]/(protected)/service-import/add/forwarder-form.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(protected)/service-order/add/add-form.tsx`](../../../app/[locale]/(protected)/service-order/add/add-form.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/app/[locale]/(public)/status/page.tsx`](../../../app/[locale]/(public)/status/page.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/actions/admin/barcode.ts`](../../../actions/admin/barcode.ts) — adminBarcodeScan
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/components/ui/button.tsx`](../../../components/ui/button.tsx) — sizing primitive (the keystone fix)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/components/sections/floating-tabs.tsx`](../../../components/sections/floating-tabs.tsx) — mobile bottom-nav (the best surface)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/components/sections/admin-sidebar.tsx`](../../../components/sections/admin-sidebar.tsx) — admin sidebar with mobile drawer
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/components/booking/BookingCalculator.tsx`](../../../components/booking/BookingCalculator.tsx) — `text-[13px]` chips (sub-16px risk)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/components/booking/BookingDocUploader.tsx`](../../../components/booking/BookingDocUploader.tsx)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/lib/promptpay.ts`](../../../lib/promptpay.ts) — qrcode lib usage
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/lib/admin/sidebar-menu.ts`](../../../lib/admin/sidebar-menu.ts) — barcode sub-menu entries
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/messages/th.json`](../../../messages/th.json) + [`messages/en.json`](../../../messages/en.json) — `pcsAdminNav.barcode.*` keys
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/package.json`](../../../package.json) — no PWA / no scan lib installed

### Docs referenced

- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/mobile-first-playbook.md`](../../mobile-first-playbook.md) — canonical rules
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/conventions.md`](../../conventions.md) §11 — mobile rules
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/briefs/ops-roles.md`](../../briefs/ops-roles.md) — 14 STAFF roles (esp. §11-14 driver/warehouse/sub-driver)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md) — §3.4 container lifecycle + §4 D2/D4/C3 problem catalog
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/audit/chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md) — L-2/L-4/L-10 + W-5/W-8/W-9 + customer pain themes
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/PORT_PLAN.md`](../../PORT_PLAN.md) Part V (D-series cargo + container) + Part W (gap-hunt, esp. G-11 driver/warehouse scan layer)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/research/capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md) — Tier 0/1/2/3 roadmap + the "connect what exists, build what's missing" lens
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/research/gap-integrations-tools.md`](../gap-integrations-tools.md) — G-11 scan/capacity layer in the gap audit
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/sprints/archive-a-to-n.md`](../../sprints/archive-a-to-n.md) — D-3 row: native BarcodeDetector + zxing fallback was chosen but fallback never landed
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/docs/architecture/container-centric-model.md`](../../architecture/container-centric-model.md)
- [`/Users/dev/pacred-web/.claude/worktrees/frosty-bhaskara-a38ced/AGENTS.md`](../../../AGENTS.md) §6 — mobile-first is non-negotiable

### External libs proposed

- [`@zxing/browser`](https://github.com/zxing-js/browser) — Apache-2.0 — iOS Safari barcode polyfill (R-1)
- [`bwip-js`](https://github.com/metafloor/bwip-js) — MIT — Code-128 + QR + EAN + ITF label generator (R-7)
- [Capacitor 8](https://capacitorjs.com/) — MIT — Next.js → native app shell (R-17, future)
- [Workbox](https://developer.chrome.com/docs/workbox/) — MIT — PWA service worker (R-3 + R-9)

---

## End-state if recommendations land

- Every staff phone (iPhone + Android, any browser) can scan barcodes via Pacred-web.
- Every staff member can install Pacred as a home-screen app + start a shift in 1 tap.
- Every customer slip upload goes from gallery dialog (~5 taps) to camera (~2 taps).
- Every admin table renders as cards on phone — no horizontal scrubbing.
- Drivers attach a POD photo + GPS to every delivered scan — disputes evaporate.
- Customers share their LINE-shipped track link without forcing the recipient to log in.
- Pacred prints its own scan labels — no longer dependent on supplier-printed CN barcodes.
- The "ใช้มือถือสแกนสินค้า" promise becomes operationally true.

**Top 3 must-do (this week, R-1 + R-2 + R-3):** the zxing polyfill, the Button-tap-target fix, and the viewport+manifest exports. All three are ≤3 d each; together they convert Pacred from "mobile-tolerable" to "mobile-first installable."
