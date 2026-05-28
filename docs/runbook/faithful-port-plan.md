# D1 Faithful-Port Plan — production launch this week

> **Owner directive (2026-05-19).** Pacred's customer portal + admin back-office
> become a **1:1 transcription** of the legacy PCS Cargo PHP system — rebuilt in
> Next.js, rebranded `PCS` → `PR`, **identical to the original 100%**.
> **`faithful-port` is the real production branch — it launches to real
> customers + staff THIS WEEK.**
>
> This doc is the plan + branch model + work-split **everyone follows**. The
> *how* (the transcription method) →
> [`faithful-port-transcription.md`](faithful-port-transcription.md).

---

## 🔴 2026-05-20 ค่ำ — Option C: spine retirement (ภูม → พี่เดฟ heads-up)

ภูม audited `/admin/warehouse/containers` (the "spine" — pre-D1 wave-1
T-P2/CT-4 redesign with `cargo_containers`/`cargo_shipments` and the
new status enum `packing/sealed/in_transit/arrived/unloading/closed`).
The audit found a **complete gap** vs legacy `member/pcs-admin/report-cnt.php`
(2487 LOC) + `top-menu-report.php` (the 11-button audit menu):

| Element | Legacy `report-cnt.php` | Spine | Gap |
|---|---|---|---|
| 11-button top menu (ประวัติเข้าโกดังไทย · รายงานตู้ · หมายเหตุ × 2 · ไม่ใส่X × 6 · เครดิตเกินกำหนด) | ✅ | ❌ | 🔴 |
| Status tabs (รอเข้าโกดังไทย / เข้าโกดังไทยแล้ว) | ✅ (`fStatus<4` vs `>3`) | ❌ (different enum) | 🔴 |
| Date-range + actionPay search form | ✅ | ❌ (only `?q=` code) | 🔴 |
| Money columns (ต้นทุน · ราคาขาย · กำไร · role-gated CEO/Manager/QA/Accounting/IT) | ✅ | ❌ | 🔴 |
| ทำรายการจ่ายเงินตู้ + ประวัติรายการจ่ายเงินตู้ | ✅ (`tb_cnt`/`tb_cnt_item`) | ❌ | 🔴 |
| Data source | `tb_forwarder` (legacy, ported via migration 0081) | `cargo_containers` (spine model) | 🔴 |

**Decision (Option C, owner-approved 2026-05-20 ค่ำ):** retire the spine
page; the canonical รายการตู้ becomes a faithful port of `report-cnt.php`
reading `tb_forwarder` directly with `GROUP BY fCabinetNumber`.

**What landed (Wave 1, this commit chain):**
- New `<TopMenuReport>` component (`components/admin/top-menu-report.tsx`) —
  the 11-button audit menu, badge counts queried from `tb_forwarder`.
- New `/admin/report-cnt` — faithful port of `report-cnt.php` (status tabs,
  transport-mode tabs, date+actionPay search, totals row, money columns
  gated to `super`/`ops`/`accounting`).
- New `/admin/forwarder-action?action=…` — 9 audit-queue stubs with the
  legacy SQL condition wired (Note / notPhoto / notPortage / notContainer /
  NotDateContainerClose / fCreditError live; NoteShop + NotShipFree* need
  `tb_shop` / ZIP-list join → Wave 2).
- New `/admin/forwarder-import-warehouse` — ประวัติเข้าโกดังไทย stub
  reading `tb_forwarder` rows with `fStatus≥4`.
- Tombstoned `/admin/warehouse/containers` → 308-redirect to
  `/admin/report-cnt`. Sidebar `warehouse.containers` repointed.
  Dashboard top-strip "🚛 รายการตู้" repointed.

**What's NOT touched (heads-up for พี่เดฟ):**
- `cargo_containers` + `cargo_shipments` tables (migration 0033) — still
  live. The detail routes `/admin/warehouse/containers/[code]/*` (scan-form,
  sack-form, status-form, link-form, manual-shipment-form, hs-lines-editor)
  are unchanged; ภูม did NOT delete the scan flow. They're reachable via
  direct URL but no longer in the sidebar.
- Migration: no schema change in this wave. `tb_forwarder` already has all
  the columns we need (fCabinetNumber, fStatus, fTransportType, fDateStatus4,
  fCostTotalPrice, fTotalPrice, fCredit, fCreditDate, fNote, fCover).

**Wave 2 (next):**
- `ทำรายการจ่ายเงินตู้` form action — POST insert into `tb_cnt` /
  `tb_cnt_item` / `tb_cnt_pay_idorco` / `tb_cnt_pay_trackingchn` (legacy
  flow from `report-cnt.php` L4-101).
- `NoteShop` queue — join `tb_forwarder` × `tb_shop`.
- `NotShipFree` + `NotShipFreeError` — ZIP-code list from legacy free-shipping
  config (need to locate the source — likely `tb_shipfree` or similar).
- Decision on retiring `cargo_containers` + scan flow vs keeping it as
  Pacred-extension (warehouse internal use). **พี่เดฟ-decision pending.**

**Question for พี่เดฟ:** the scan flow (`/admin/warehouse/containers/[code]/scan-form`
etc.) is genuinely Pacred-original (no legacy counterpart in PHP — the
PHP barcode flow is at `member/pcs-admin/barcode-*.php` reading
`tb_forwarder` directly). Should we (a) retire it, (b) port the PHP
barcode flow over and absorb the spine's scan helpers, or (c) keep it
as a Pacred-extension internal tool? Flagging for review.

### 🟢 2026-05-20 EVENING — Wave 1/2/3 + audits + env switch (8 commits)

ภูม ran a 12-hour Phase 1 push. Cumulative state as of `90c1dbe`:

**Shipped:**
- Wave 1: `/admin/report-cnt` faithful port + `<TopMenuReport>` 11-button menu + 9 audit-queue stubs + spine list tombstone (`967f2dc`)
- Wave 2: 8 barcode routes (cargo + driver) + gateway routing + cnt-payment server action + cnt-hs history + 3 audit queues wired (NoteShop→tb_header_order · NotShipFree×2 with 41-ZIP list) + 8 spine scan routes deleted (`ffdad6c`)
- Wave 3 mobile P0: DataTables-Responsive + iOS auto-zoom + Quagga2 install (`81f80b1`)
- Schema bundle `supabase/bundle/prod-fresh.sql` (891 KB · 117 legacy tables verified)
- Env switch: dev (pprrlabgebrnocthwdmg) → prod (yzljakczhwrpbxflnmco) · publishable-key format · service_role JWT kept per ภูม
- 4 audit docs: fidelity-2026-05-20 · mobile-verify-2026-05-20 · pcs-complete-analysis · pcs-admin-roles · pcs-business-flow · pcs-master-synthesis (P0/P1/P2 list)
- พี่เดฟ's "real latest" pcscargo source = byte-identical (16,184 PHP · 0 hash diffs). Value = the 5 markdown analyses in `N'POOM - PCS LEARNNING/`.

**Wave 4 backlog (per master-synthesis):** 6 P0 items remain · ~14-21 ชม
1. `/admin/forwarders` rewrite → read tb_forwarder (currently reads rebuilt `forwarders`) — most-used screen, biggest operational risk · 4-6 ชม
2. QA module rebuild (tombstoned currently) · 6-8 ชม
3. Forwarder 10%-over-preview re-confirm gate (surprise-billing risk) · 2-3 ชม
4. driver role phase-unlock (sidebar invisible) · 30 นาที
5. qa role enum add (no QA login without super) · 1 ชม
6. sales_admin vs sales clarify · 30 นาที (or already settled by Q3 agent tonight)

**Wave 3D unfinished:** 14 of 19 cargo_* consumers still reference retired tables · `lib/warehouse/*` helpers undeleted · migration `0090` DROP commented. Prerequisite before applying 0090 to prod.

### ✅ 2026-05-20 ค่ำ — DECISION: Option A (พี่เดฟ confirmed · ภูม locked)

**Decision:** **Option A — Retire spine wholesale + port legacy `barcode-*.php`
1:1.** ภูม consulted with พี่เดฟ — พี่เดฟ confirms "just match what พี่ป๊อป
wants" (faithful 100% per owner rule). ภูม verified Supabase
`cargo_containers` / `cargo_shipments` / `cargo_sacks` are empty (no
production data to migrate).

**Wave 2 scope (split across 5 parallel agents on 2026-05-20 ค่ำ):**

| Agent | Files | Source | Destination |
|---|---|---|---|
| 1 | 4 cargo barcode pages | `barcode-c-{all,from,import,prepare}.php` (~1500L) | `/admin/barcode/cargo/{all,from,import,prepare}` |
| 2 | 4 driver barcode pages | `barcode-d-{all,from,import,prepare}.php` (~530L) | `/admin/barcode/driver/{all,from,import,prepare}` |
| 3 | Gateway + menu | `gateway.php` (213L) + new `<TopMenuBarcode>` | `/admin/barcode/gateway` + `components/admin/top-menu-barcode.tsx` |
| 4 | Cnt-payment + history | `report-cnt.php` L4-101 (POST form) + `cnt-hs.php` (1861L) | server action on `/admin/report-cnt` + new `/admin/cnt-hs` page |
| 5 | Remaining audit queues | `forwarder-action.php` (NoteShop · NotShipFree · NotShipFreeError conditions) | 3 wave-1 stubs in `/admin/forwarder-action` |

**Wave 2D cleanup (after agents complete):**
- DROP tables: `cargo_containers` · `cargo_shipments` · `cargo_sacks`
  (migration `0090_drop_spine_tables.sql`).
- Delete spine routes under `/admin/warehouse/containers/[code]/*`
  (scan-form, sack-form, status-form, link-form, manual-shipment-form,
  hs-lines-editor, unlink-button — ~1100 LOC).
- Delete `lib/warehouse/{containers,shipments,sacks,bulletin,cargo-type,
  code-gen,lifecycle,tracking}.ts` (~800 LOC) + 4 `.test.ts` files.
- Update sidebar: add `/admin/barcode/cargo/all` + `/admin/barcode/driver/all`
  leaves; remove dead `warehouse.containers` reference.
- pnpm tsc + lint + smoke routes.

After Wave 2D: there is exactly ONE source of truth for container/scan
data — `tb_forwarder` — read by `/admin/report-cnt` (faithful list) and
written by `/admin/barcode/*` (faithful scan).

---

---

## Branch model

| Branch | Role |
|---|---|
| **`faithful-port`** | 🚀 **PRODUCTION** — the real owner project, launches this week. Only tested, integrated 1:1 work lands here. |
| **`dave-pacred`** | เดฟ's 1:1 working branch **+ the integration branch** — `Poom-pacred` syncs here; merge + full test here *before* `faithful-port`. |
| **`Poom-pacred`** | ภูม's 1:1 working branch (admin back-office). push / pull-sync → `dave-pacred`. |
| **`podeng`** | ปอน's front-end branch (marketing / landing + the brand-asset swap) → merges into `faithful-port`. |
| `dave` · `Poom` | 🧊 **FROZEN** — the pre-pivot Next.js rebuild ("V3" / Track A). Untouched; resumed only after the faithful port ships. |

**Flow:** `Poom-pacred` → `dave-pacred` (integrate + full test) → `faithful-port`
(production) → ก๊อต gate → `main` (Vercel deploy). ปอน's `podeng` → `faithful-port`.

Everyone opens **their own** branch and works there. Sync daily; never push
half-built work to `faithful-port`. Spawned worktree agents must
`git fetch origin && git reset --hard origin/<your-branch>` before working
(they branch from a stale `origin/main` otherwise).

---

## Status — 2026-05-19 night

🟢 **Shipped / on `dave-pacred`:**
- **Register/login fix → `main`** (`b760f69`) — the broken production signup is
  fixed: a stale single-use hCaptcha token (cached from the OTP step, reused at
  submit → `captcha_failed` on every real signup) + an OTP-quota burn (the
  `otp_codes` row was inserted before the SMS send, so a failed send still ate a
  3/hour slot). Cherry-picked surgically to `main` — Vercel redeploys.
- **Customer portal — 7 / ~24 screens** transcribed 1:1:
  `menu.php`→`/dashboard` (pilot) · `china-address` · `account-settings` ·
  `search` · `wallet` · `addresses` · `cart`.
- **Admin back-office — pilot done** (ภูม): `admin-table.php` → `/admin/admins`
  1:1 + the admin CSS bundle (`public/legacy/pcs/admin/`).
- Every push gated: `pnpm verify` + `pnpm build` + route smoke green.

🟡 **In progress:** Bootstrap-4 + jQuery + FontAwesome vendor JS/CSS staging
(makes legacy `data-toggle` modals/tabs/dropdowns + icons work 1:1 everywhere) ·
`shops.php`→`/service-order` transcription · ภูม's PCS-system research → learnings.

---

## Status — 2026-05-21 evening (paid-ads + LIFF wave)

🟢 **Shipped this session:**

**Customer portal — 15 / ~24 screens transcribed 1:1.** Added since 2026-05-19:
`shops`→`/service-order` · `forwarder`→`/service-import` · `payment`→`/service-payment` ·
`profile`→`/profile` · `receipt-f-hs`→`/service-import/receipts` · plus the
follow-on transcriptions by the team (`pay`, `invoiceF`, sales-report screens,
`printReceiptF`/`printShop`, `map`, `forwarder-table`).

**Bootstrap-4 + jQuery + FontAwesome vendor bundle staged** — `data-toggle`
modals/tabs/dropdowns + DataTables now work 1:1 on every transcribed screen.

**ปอน's compact register + auth polish → `main`** (`87226dd`): smaller
register form (multi-select services dropdown, side-by-side service+source).

**🟢 Paid-ads tracking — 5 platforms wired in root `<head>`** (the owner's
"blind ads" P0 — fixed):
- Google Ads gtag (`AW-17941254120`)
- Google Ads "purchase" conversion (`…/9c-FCOq1h68cEOifh-tC`) — helper
  `trackGoogleAdsConversion(GOOGLE_ADS_CONVERSIONS.purchase, {…})` + the
  click variant `reportConversionAndNavigate(url)` in `lib/analytics.ts`.
- GA4 + Google Tag (`G-62J8PEVJLZ` + `GT-KFHGBVK9`)
- Meta (Facebook) Pixel (`27209891118650099`)
- Microsoft Clarity (`ws2tje8x24`)

Every ID is **hardcoded as a default** in `components/analytics/<X>Script` —
the tag fires on Vercel even with no env override (owner directive 2026-05-20).
Env overrides supported for dev/staging.

**LIFF link page** — `app/[locale]/liff/link/page.tsx` now hardcodes the LIFF
ID `2010105778-SaSkkGza` (channel `2010105778`, Pacred Login). Customer →
profile linkage via `liff.getProfile()` + `actions/profile.ts:linkLineAccount()`
writes `profiles.line_user_id`.

**Sentry deprecation cleaned** — `disableLogger` + `automaticVercelMonitors`
moved under the new `webpack` key in `next.config.ts`. Vercel build warnings
gone. `SENTRY_AUTH_TOKEN` still optional (source-map upload — manual step:
sentry.io → Settings → Developer Settings → **Organization Tokens**).

🟢 **Production Supabase — verified 2026-05-21:**
- Core customer data **LOADED**: 8,898 customers · 104,591 wallet history ·
  21,950 orders · 47,626 forwarders · 13,789 receipts · 37,252 receipt items ·
  4,154 addresses · 181 admins · 15,477 cart rows.
- Legacy `tb_users` → bridge: end-to-end mechanism verified on dev (find user
  → `passTam` verify → provision Supabase Auth → sign in). Same mechanism on
  prod once a customer logs in.

🟢 **ภูม's post-Pro-upgrade backfill — ✅ COMPLETE (2026-05-24):**
- ✅ Backfilled on prod: `tb_history` · `tb_history_key` · `tb_web_hs`
  (the 3 oversized log tables) — all 117 tables now hold their legacy rows.
- ✅ Customer image + storage files uploaded to Supabase S3 production
  (`pcsracgo/public/member`) — Phase A storage parity closed.
- ℹ️ Other storage buckets (`slips`, `forwarder-covers`, `carts`, `avatars`,
  `resumes`, `tax-invoices`, `wht-certs`, `freight-payment-slips`,
  `commission-slips`, `disbursement-receipts`, `qa-inspection-photos`,
  `csv-imports`) are Pacred-app buckets — they fill as customers/admin use
  the new flows, not from legacy migration.

🟡 **Hybrid `main` deployed (team merged podeng → main).** `main` now carries
the 1:1 portal alongside the rebuilt screens — unwired actions (cart add/remove ·
order cancel · address edit) ship to customers as a known regression while the
mutations are wired. Production-launch hardening remains the next gate.

🔔 **Still to install when owner sends snippets** — TikTok Pixel · LINE Tag
(LAP) · Bing UET · Pinterest · X · Snapchat · Hotjar. The memory file
`tracking_codes_embed_rule.md` auto-prompts the next session to ask.

📦 **Master env handoff for Mac:** `~/Desktop/PACRED-ENV-MASTER.env` —
complete inventory: Section [A] hardcoded fallbacks · [B] DEV `.env.local`
contents · [C] PROD vars for Vercel · [D] LINE/brand IDs · [E] DB admin
connection · [F] TODO list.

---

## Work-split — parallel, no collision

| Who | Owns | Branch |
|---|---|---|
| **เดฟ** | Drive the port · the **customer portal** screens · the **cross-cutting infra** (vendor JS · the customer-side unwired Server Actions) · integrate at `dave-pacred` · coordinate the `faithful-port` launch | `dave-pacred` |
| **ภูม** | Transcribe the **admin back-office** — 187 `pcs-admin/*.php` screens · the admin-side Server Actions · split screen-batches to spawned agents | `Poom-pacred` |
| **ปอน** | **Customer-portal** screen transcription (coordinate with เดฟ — one owner per screen) · the **front-end** (marketing / landing) in the owner's style · **the brand-asset swap** — sweep every legacy-PCS icon / emoji / logo placeholder and replace with the proper `PR` asset (see "Brand assets") | `podeng` |
| **ก๊อต** | **Fidelity review** — every screen 1:1 vs the legacy original · the borrowed-API (TAMIT) watch · **confirm the `tb_*` dev↔prod Supabase wiring** · the production-launch gate | review |

**One owner per screen** — coordinate via เดฟ before claiming a batch, so two
people never transcribe the same file. ภูม keeps ปอน informed so the data
contract + the look stay aligned. **Everything must be 1:1** — spawn parallel
worktree agents to scale; the legacy `.php` file is the spec.

---

## Sequence — this week

1. ✅ **(done)** เดฟ — fix the broken register / login on `main`.
2. 🟡 **Customer portal** — transcribe the ~24 real `member/*.php` screens
   (เดฟ + agents). 7/24 done. Remaining: `forwarder` · `payment` · `pay` ·
   `profile` · `invoiceF` · receipts/print · sales-report screens · `map`.
3. 🟡 **Admin back-office** — transcribe the 187 `pcs-admin/*.php` screens
   (ภูม + agents). Pilot done.
4. **Wire the Server Actions** — the legacy mutation handlers (add-to-cart ·
   edit/delete address · admin CRUD) behind each transcribed screen.
5. **Integrate** on `dave-pacred` → full `pnpm verify` + build + functional
   test (`qa-flow-simulator`) → **`faithful-port` production launch**.
6. Phase C (the Tier 0/1/2/3 roadmap + the six systems) stays **deferred** —
   resumed on the frozen `dave` / `Poom` only after the faithful port ships.

---

## Cross-cutting infrastructure

- **Vendor JS/CSS.** The legacy screens are Bootstrap-4 + jQuery; a markup-only
  transcription renders the look but the *interactions* (modal · tab · dropdown ·
  collapse · DataTables) are dead. Fix: jQuery + Bootstrap-4 JS + FontAwesome are
  staged verbatim under `public/legacy/pcs/vendor/` and loaded globally in the
  `(protected)` layout — so every legacy `data-toggle` works 1:1. This also
  resolves the admin runbook §8 "DataTables JS not ported" flag.
- **Asset fallback policy.** If a proper `PR` icon / emoji / logo / brand asset
  does not exist yet, **use the legacy PCS asset as the placeholder** so the
  screen still renders 1:1 — never ship a broken image. Every placeholder is
  flagged for ปอน's brand-asset swap.
- **Unwired legacy mutations.** Transcribed Server Components render the visible
  surface 1:1; the legacy jQuery-AJAX mutation endpoints (add-to-cart,
  edit/delete address, admin CRUD, search-log writes) become Next.js Server
  Actions — see work-split step 4. A render must stay a pure read.
- **Database — `tb_*` is the ONE schema, dev + prod.** Per the owner (`PCS`→`PR`,
  no fork) the transcribed screens read the legacy `tb_*` tables via the
  service-role admin client. Phase A loaded `tb_*` to **both** dev and prod
  Supabase (migrations `0081`-`0083`). ก๊อต's gate: confirm prod Supabase has the
  `tb_*` data and the Vercel env points at the prod project — same tables,
  dev and prod, no divergence.

## env / machine move

`.env.example` is the complete, current key template (committed — it transfers
via git). `.env.local` holds **real secrets** (Supabase service-role key, SMS /
LINE / MOMO / Resend keys, `OTP_PEPPER`) — it is **never committed** (committing
secrets to git history is a real exposure even on a private repo). To move
machines: copy `.env.local` directly (USB / password-manager / secure transfer),
or `cp .env.example .env.local` and refill the values.

---

## Pilot status — the reference patterns

**Customer pilot — `menu.php` ✅** (`app/[locale]/(protected)/dashboard/`):
the 9-icon launchpad, transcribed 1:1 — verbatim legacy markup, legacy CSS as a
static `<link>`, every legacy SQL → `tb_*`. The Pacred app chrome (NavBar ·
protected sidebar / bottom-nav · floating action menu) is stripped from
`(protected)/layout.tsx` — the legacy `member/*.php` screens are full-screen and
carry their own chrome; the launchpad IS the navigation. The layout is a minimal
auth + TOS wrapper (+ the vendor-JS loader).

**Admin pilot — `admin-table.php` ✅** (`app/[locale]/(admin)/admin/admins/`):
the admin gets its own CSS bundle `public/legacy/pcs/admin/admin-base.css` (the
ThemeForest "Modern Admin" BS4 chrome) — see `faithful-port-transcription.md` §8.

⚠️ **Open 1:1 question for เดฟ / ก๊อต:** the `TosGate` (TOS-accept modal) is
Pacred-added — the legacy PCS portal had none. Kept for legal consent; decide
keep-vs-drop for strict 1:1.

## Brand assets

The Pacred logo lives at `public/images/pacred-logo-red.png` (+ `-white`).
**Policy:** where a proper `PR` asset is missing, the legacy PCS asset is used as
a 1:1 placeholder (under `public/legacy/pcs/`). **ปอน owns the swap** — sweep
every placeholder spot and replace with the official `PR` brand asset; until
then the legacy asset keeps the screen faithful. Flagged, non-blocking.
