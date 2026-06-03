@AGENTS.md
@CLAUDE_TECHNICAL.md

---

# 🌙 2026-06-04 NIGHT — OVERNIGHT CONTINUATION (Mac · เดฟ · owner asleep → closes AM): profile-pic + UX-confirm + estimator + brand-r2 + badges + perf · read FIRST

**main = `dave-pacred` = `41d5e341`+ · 7 night save-points pushed · `pnpm verify && pnpm build` → CHAIN=0 (REAL exit codes) · both branches 0/0 · Vercel build RESTORED.** Continuation of the 🌅 run below (same day). Standing quality rules now in **AGENTS.md §0f** + memory [`ui_quality_concept_2026_06_04`]. Full night detail in [`reachability_audit_2026_06_04`] memory.

**🔴 PROCESS BUG FOUND + FIXED — never gate via `| tail`.** The 🌅 run's first 2 night save-points (estimator `fc2107aa`, brand `dd35140f`) were gated through `pnpm build 2>&1 | tail` — which returns **tail's** exit code, masking 2 real `next build` failures (estimator `setState` sync-in-`useEffect`; `revalidateTag` 1-arg `TS2554`). So **Vercel couldn't deploy those** (site kept last-good — no data lost). Both fixed + the build restored in `7f63d60a`. **RULE (AGENTS.md §0f): gate with `pnpm build > /tmp/x 2>&1; echo $?` and read the REAL exit code before claiming green/pushing.**

**🚀 Shipped this night (7 save-points · each gated real-exit + pushed):**
- **Customer import price ESTIMATOR** `/service-import/estimate` — live ทางรถ/เรือ/แอร์(soon) + ตีลัง recalc (owner's "ราคานิ่งจัด" fix). Reuses the verified `resolveForwarderRate`; CUSTOMER-SAFE (strips margin/floor/tier). **Flow-recheck:** legacy pricing = admin-set-after-warehouse (`calPrice.php`, NOT customer-live) → estimator is a NEW enhancement; address-select (`cart-address-shipby`) + shipment-reassign (`adminReassignForwarderOwner`) already EXIST. Doc: [`docs/research/order-pricing-flow-recheck-2026-06-04.md`](docs/research/order-pricing-flow-recheck-2026-06-04.md).
- **🅰 Brand sweep round-2** — 19 visible "PCS"/stale-"กทม" labels → "Pacred (สมุทรสาคร)". All 6 customer PDF docs + public pages confirmed already-clean; `366/49`=a customer's own addr (kept). `หนองแขม` free-ship allowlist FLAGGED (pricing rule may need to follow the warehouse). Doc: [`docs/research/brand-pcs-leak-sweep-2026-06-04.md`](docs/research/brand-pcs-leak-sweep-2026-06-04.md).
- **🖼 PROFILE PICTURE WIRED** (owner "เรื่องเด็ด" · customer **AND** staff) — was a dead modal (customer) + URL-only "Wave 23" field (staff). Customer: `actions/profile-avatar.ts` + `profile/profile-avatar-upload.tsx`. Staff: `actions/admin/avatar-upload.ts` (super) + `components/admin/admin-avatar-upload-field.tsx` → wired into `admins/[id]/edit` + `admins/new`. Both → `avatars` bucket → `profiles.avatar_url`. Render-verified; mechanism = the proven prod promo-image uploader. ⚠️ **literal file-pick test = a 30-sec owner manual confirm** (couldn't automate: Chrome not auth'd to the preview).
- **✅ Confirm-before-mutate** (กันคนลั่น) — native `confirm()` on 9 staff money/state/comms buttons (forwarder + service-order mark-paid, withdraw approve, yuan approve/reject, shop-payout transfer/reject, period soft-close, freight quote approve/**send-to-customer**/accept). Customer side was already guarded.
- **🔢 Badge accuracy** (อย่ามั่ว) — customer sidebar counts verified read canonical `tb_*` (correct `fstatus=5`/`hstatus=2`/`paystatus=1` filters). **FIXED** admin sidebar `salesPayout` badge: was reading the empty rebuilt `sales_payouts` (0 rows) → repointed to `tb_user_sales_admin_pay` status='2' (= pending, **empirically verified** vs the `[id]` page `isPending===2`; currently 0 = correct). Dashboard `sales_payouts` (customer "เบิกค่าสินค้า") left as intentional Phase-C native-empty. Interpreter `commissions` badge flagged (missing table · ภูม).
- **⚡ Perf survey** ([`docs/research/performance-survey-2026-06-04.md`](docs/research/performance-survey-2026-06-04.md)) — the obvious DB indexes **already exist** (migration 0109's 23 partial indexes cover userid/fstatus/hstatus/paystatus on the hot tables; agent over-flagged). Remaining = `.ilike("%term%")` searches needing Phase-C `pg_trgm` GIN + regression-risk CODE-CHANGES — **none auto-applied** (the "ห้ามทำงานบัค" guardrail). **Headline: set `NEXT_PUBLIC_SENTRY_DSN` in Vercel** → the already-wired Sentry then MEASURES the real prod P95 (the honest fix vs guess-optimizing the busiest tables). + banner-img `sizes` perf fix.

**🔴 PENDING (owner / AM — unchanged from 🌅 + these):**
1. **Apply migrations prod:** `0137`·`0139`·`0140` (next free **0141**) — I can't write prod DDL autonomously.
2. **1 Vercel env to unblock perf:** `NEXT_PUBLIC_SENTRY_DSN` (then Sentry reports real slow transactions). + the 🌅 list (TAMIT-2026 · THAIBULKSMS · FB tokens · 3 missing admins).
3. **30-sec manual:** confirm the profile-pic upload works (customer `/profile` + staff `/admin/admins/[id]/edit`) — same code as your working promo-image uploader.
4. **ภูม:** define the interpreter-`commissions` badge source. **ปอน:** InwPond007 rebase (`fef7958f`). **Accounting:** ใบขน VAT sign-off + `หนองแขม` free-ship-zone-vs-warehouse decision.
5. **Freight (Phase D):** realdata SOT = `/Users/dev/Desktop/olddata dev/data งานเก่า` (real LINE/WeChat chats + Excel + real prices) per [`ui_quality_concept_2026_06_04`].

---

# 🌅 2026-06-04 — AUTONOMOUS RUN (Mac · เดฟ): env reorg + Global Trade Group capture + Pacred branding swap + 4 build lanes A·B·C·E · read FIRST

**main = `dave-pacred` = (this 2026-06-04 push) · `pnpm verify` EXIT 0 (lint·typecheck·~280 tests·audits) · Vercel auto-deploys main.** Resume: `git fetch origin && git pull origin main` → read this. On a new machine do `.env.local` first (see 2026-06-03 below + memory [`reachability_audit_2026_06_04`] + [`global_trade_group_2026_06_04`]).

**🚀 Shipped + pushed (owner unlocked A-B-C-E-F · D deferred · ran 4 parallel isolated-worktree agents → merged serial → verify → push):**
- **🔵 ENV reorg** — `.env.local` rewritten clean (51 Vercel keys reconciled + owner's new tokens Vercel/Sentry/hCaptcha/Cloudflare) + Desktop mirror + `.env.example`. ⚠️ **OTP**: ก๊อต fixed ThaiBulk (signups OK now); note `OTP_BYPASS` is hard-ignored on prod — real lever is `EMERGENCY_OTP_BYPASS` (unset).
- **🏛 Global Trade Group** captured → [`docs/research/global-trade-group-2026-06-04.md`](docs/research/global-trade-group-2026-06-04.md): 6-entity holding · 3 tax-doc billing modes · launch stages · pricing · branding mandate.
- **🔎 Reachability/404 audit + fixes** → [`docs/research/reachability-deadflow-audit-2026-06-04.md`](docs/research/reachability-deadflow-audit-2026-06-04.md) (4 agents · 374 routes): dead `/service-order` ยกเลิก button → client island · `doGTranslate` console error killed (every protected page) · `/admin/learning` 404 → `/admin/board/inbox` · dashboard banner → `/cart` · **6 orphan admin routes wired** · **2 dead-code files tombstoned** (`rates.ts`/`wallet.ts`) · sidebar dup-key fix. Customer surface healthy (0 404, no dead-write traps); admin money faithful.
- **🅰 Branding** — Pacred stamp on all 6 legacy print pages (overwrote 2 old PCS stamp assets · `public/images/pacred-stamp.png` 284K from `/Users/dev/Desktop/stamppacred.png`) · footer chat LINE @PCSCARGO → Pacred LINE · search logo · self-pickup "โกดัง PCS / เพชรเกษม 77 / 02-444-7046" → Pacred สมุทรสาคร / 02-421-3325 (5 forms) · admin company options PCS→Pacred. ⏳ follow-up: add stamp IMAGE to modern @react-pdf templates (needs absolute-URL + render-test).
- **🅱 Tax-doc 3 modes** — per-order ใบกำกับ/ใบขน/ไม่รับเอกสาร + per-mode VAT base (`lib/tax/tax-doc-mode.ts` +44 tests). `'customs'` was a dead enum. **Default `tax_invoice` verified-unchanged.** ⚠️ **ใบขน VAT-base = accounting-policy interpretation (no legacy citation) → needs accounting sign-off before staff issue ใบขน** (1-line override flagged in code).
- **🅲 Pricing** — min-sell guardrail (`business_config pricing.min_sell_floor` + migration 0139 + 14 tests, hard-warn) · CBM/kg · รถ/เรือ/แอร์ quote-compare (`/admin/accounting/quote-compare/modes`).
- **🅴 CRM** — `/admin/crm` verified functional + reachable (fixed unlinked-LINE dead-end).
- **monitor** — Sentry already code-wired (gated on `NEXT_PUBLIC_SENTRY_DSN`); set locally. Prod-activate = 1 Vercel var (perf tradeoff).
- ✅ **admin login VERIFIED** — `admin_pee@pacred.co.th` / `123456` works (super). ⚠️ `admin_dev`/`pop`/`poom` do NOT exist as `admin_xxx@pacred.co.th` (only 12 of 15 roster have profiles).

**🔴 PENDING (owner / next session):**
1. **Migrations NOT applied prod:** `0137_pcs_sync` (ภูม) · `0139_min_sell_floor` (loader has defaults → optional) · `0140_yuan_tax_doc_pref` (metadata-only ADD COLUMN). **NEXT FREE = 0141.**
2. **Owner Vercel env:** TAMIT `-2026` · `THAIBULKSMS_FORCE=corporate` · Sentry activate (`NEXT_PUBLIC_SENTRY_DSN`) · FB 8 tokens · the 3 missing admin accounts. (เดฟ has Vercel token now — can set on request.)
3. **InwPond007** — 1 unmerged commit (`fef7958f` styled-dialogs · 70 files · 67 behind) → **ปอน `git pull origin main` to rebase** (hand-merge unsafe before a prod push). Then switch the new `cancel-order-button.tsx` (native confirm) to ปอน's global `confirm()`.
4. **ใบขน VAT-base accounting sign-off** (Lane B) · **D Freight FCL/LCL** deferred · customer-minor (profile image-upload unwired · @react-pdf stamp image).

---

# 💻 2026-06-03 — SESSION CLOSE + MACHINE MOVE (Windows คอมบริษัท → Mac บ้าน) · FULL TEAM MERGE + ฝากสั่งซื้อ detail REWRITE · read FIRST

**main = `dave-pacred` = `26a01caf` · pushed · `pnpm verify` EXIT 0 (lint·typecheck·test:unit·audit:all all green) · Vercel auto-deploys `main`.** Resume on Mac: `git fetch origin && git pull origin main` → read this section.

> ⚠️ **Mac needs `.env.local` first** (the Windows one doesn't travel). Per memory [`local-dev-env-and-legacy-path`]: local `.env.local` must hold the REAL **prod** Supabase keys (`yzljakczhwrpbxflnmco`) — a PLACEHOLDER `.env.local` (fake keys) is the root cause of *"กดอะไรก็ค้าง error เพียบ"* (public pages 200 but every DB click hangs). Owner provides the prod env paste. `OTP_BYPASS=true` STAYS (ThaiBulk corporate SMS too slow). `PACRED_TAMIT_DETAIL_URL` must be `…/api-product-2026` (bare `/api-product` = dead 404). Legacy PCS source (faithful-port SOT) on Windows was at `C:\Users\Admin\Desktop\newrealdatapcs\pcscargo\member\{,/pcs-admin}` — on Mac it's at `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/` per the `legacy-php-sweep` skill (AGENTS.md §0b's `D:\REALSHITDATAPCS` is wrong on both).

**🚀 Shipped + pushed this session (เดฟ integrator + ก๊อต/ภูม/ปอน — multiple verified batches):**
- **🔴 FULL-TEAM MERGE (2 rounds)** — round 1 (`cbc7ee06`): ปอน register split-screen + ภูม's 27 (search-E1 SKU picker · forwarder `[fNo]` read-only redesign+`/edit` · §0e tb_* pivots · yuan-bulk · momo-cron). round 2 / session-close (`9d6a791a`): ปอน +9 (register polish + **LCL-pricing** rebuild) + ภูม +21 (**ใบวางบิล R-2** billing-run admin+customer+print · **migration 0138_forwarder_invoice APPLIED prod by ภูม** · forwarders/edit PCS-style single-page · receipt/ใบส่งสินค้า redesign · `max-w` sweep 21 pages). **Read EVERY money-path conflict by hand** (the "diff-stat lies" trap) — notably KEPT เดฟ's §0e `notes/page.tsx` live-`tb_header_order` fix over ภูม's dead-read `service_orders` version; took ภูม's richer search-E1; renumbered ภูม's `0135_pcs_sync`→**`0137`** (collided with promo `0135`).
- **🔴 ฝากสั่งซื้อ admin detail REWRITE (`884c1a42` · owner directive "รื้อทั้งหน้าให้เหมือน legacy เป๊ะ")** — `/admin/service-orders/[hNo]` was read-only KV + 8 stacked forms, MISSING the editable per-item price table → CS/ล่าม ใช้ไม่ได้. **Decoded legacy `shops.php`/`update.php`/`update1-5.php` price+loop from source** (formula proven vs the HTML owner pasted: 2,120¥×5.01=10,621.20฿). Rewrote into ONE faithful page: 5-step bar · customer + inline-edits (hRate/transport/crate/shipBy/payMethod/address) · price breakdown + กำไร · **editable items table (จำนวน/¥ราคา/ค่าขนส่งจีน + live calc) + new action `adminSaveShopOrderItemsAndQuote`** (= legacy `update2`: per-item save → recompute hTotalPriceCHN/hShippingCHN/hTotalPriceUser → guard via `tb_wallet_hs.reforder` → hStatus=2 + hDatePayment+5d + 4-CH notify). Reused all ภูม's step-3/4/5 + inline actions. Built via worktree agent + **เดฟ reviewed the money action line-by-line**.
- **CI:** `.agents/` tooling added to md-link-audit `SKIP_DIRS` (pre-existing broken links, like `.claude`) · declared `PCS_SYNC_URL/TOKEN` + `SUPABASE_DB_PASSWORD` in `.env.example` (used-but-undeclared → audit:env).

**🔴 PENDING (next session / Mac):**
1. **ฝากสั่งซื้อ rewrite NOT browser-verified** — compiles (307 admin-gate) + money action reviewed, but the **save flow was NOT click-tested** (§0c). On Mac: login admin → open a status-1 ออเดอร์ → verify editable price table + live calc + "บันทึก+รอชำระเงิน" writes tb_order/tb_header_order correctly + 1→2 + notify. ⚠️ test on a TEST order (writes real prod data).
2. **Owner Vercel env (เดฟ no token):** `PACRED_TAMIT_DETAIL_URL`→`/api-product-2026` · `THAIBULKSMS_FORCE`→`corporate` (PM-8 TODOs, still open) · **pcs-sync activation:** apply migration **`0137`** + set `PCS_SYNC_URL`/`PCS_SYNC_TOKEN` + deploy `pcscargo.com/api/pacred-sync.php` (cron fails gracefully until then).
3. **Migrations:** `0137_pcs_sync` ⏳ NOT applied · `0138_forwarder_invoice` ✅ applied prod by ภูม. NEXT FREE = **0139**.
4. **ภูม + ปอน:** their branches moved during the merge (they kept working) — on resume they `git pull origin main` (their work IS in main; I did NOT force-distribute).

---

# 🏠 2026-06-02 PM-8 — SESSION CLOSE + MACHINE MOVE (→ บ้าน) · 2 PROD ENV INCIDENTS + Wave-A + ก๊อต/ปอน MERGED · read FIRST

**main = `dave-pacred` = (this session-close commit)+ · pushed · typecheck+lint+build EXIT 0 · prod LIVE (Vercel auto-deploys `main`).** Resume at home: `git fetch origin && git pull origin main` → read this section. Owner closed the company-computer session.

**🚀 Shipped + pushed this session (เดฟ + ก๊อต + ปอน — one verified batch):**
- **เดฟ Wave-A trust sweep** (`0a38c71d`) — killed the `/service-import/pending` **dead-read** (read rebuilt 0-row `forwarders` → all 8,898 migrated customers saw an EMPTY "รอชำระเงิน" screen via 3 nav entries) → redirect to `/service-import?q=5` (faithful tb_forwarder pending tab) + repoint mobile FAB + removed orphan `listForwarders`/`ForwarderSummary`/`forwarder-list.tsx` (§0e). Deleted dead `/api/settings-rate` endpoint. Fixed search-demand `sourceNote` (named the empty `tb_history_key`; data layer already reads `tb_search_history`). **A 4-agent audit confirmed the other big-audit Wave-A P1s (credit-line P1-5, config-split P1-11, VIP-rate, yuan-bulk orphan) were ALREADY CLOSED in PM-3/PM-4 → not re-implemented (avoided the stale-doc re-work trap).**
- **🔴 PROD INCIDENT #1 — "กดค้นหา/วาง link แล้ว api เก่าตาย, สั่งซื้อไม่ได้"** (`6200f463`) — China URL-paste product search dead on prod. Root cause: vendor retired `https://tamit-cloud.com/api-product` → **HTTP 404** (verified live); correct = `/api-product-2026`. The code default (`lib/china-search/index.ts:48`) is already -2026, **but Vercel prod `PACRED_TAMIT_DETAIL_URL` + `.env.example` still carried the dead URL → the env OVERRODE the good default.** Fixed `.env.example`. (AkuCargo keyword path also 404'd from external test — could be IP-allowlist; verify with ไอแต้ม.)
- **🔴 PROD INCIDENT #2 — registration OTP "Sent but not received" + rate-limit** (`.env.example THAIBULKSMS_FORCE`) — customer KIT CHAREON MUSICAL (พีท · 0909709898) couldn't register: ThaiBulkSMS dashboard shows "Sent" ×3 but customer never received → hit the 3/hour/phone cap ("สมัครเกินจำนวน"). **Key findings:** (a) **`OTP_BYPASS` is HARD-IGNORED on Vercel production** (`gateway.ts:52` forces it off when `VERCEL_ENV==="production"`) → setting it false/true does nothing; the real emergency lever is **`EMERGENCY_OTP_BYPASS=true`**. (b) SMS "Sent"≠"Delivered": "Pacred" sender ID is approved in ThaiBulkSMS's **Corporate pool**, but `.env.example` still said `THAIBULKSMS_FORCE=premium` (stale, same class as TAMIT) → wrong pool = accepted-but-undelivered → fixed to `corporate` (code default already corporate). Owner admin-created พีท via `/admin/customers/new` (no-OTP path · juristic needs the 13-digit Tax ID). ThaiBulk deferred ("ปล่อยไปก่อน").
- **ก๊อต (got-jirayus · merged from `origin/main` `bb09a8b0`+`ea02bc4f`)** — "เริ่มขยับ" = **comprehensive code-derived docs** (956 files · `docs/components/*` · `docs/database/*` per-table specs · `docs/test-cases/*` per-page manual test cases) + `fix: change path images` (china-shopping services page). No migrations.
- **ปอน (PCSCARGO · merged from `origin/InwPond007` ×3)** — `2f84df06` **public `/track/[code]` + `/track`** (CargoThai P2 — the no-login tracking GTM moat) + **LINE CRM thread panel** (`/admin/line-inbox` · `actions/admin/line-crm.ts`) + **address-flash** UX + **camera image-search** panel + `fix(i18n) BookingHero` + `fix(test)` Windows bracket-path quoting. No migrations.

**🟠 ภูม (Poom-pacred · 22 commits · NOT merged — needs RESYNC):** ภูม shipped a lot — §0e trust-sweeps (VIP/commission_*/service-orders tombstones), **search-E1** (SKU picker + per-SKU price + TAMIT-2026 endpoint + manual-price fallback + add-to-cart wire — the richer fix for INCIDENT #1's "ราคาไม่ขึ้น/รูปไม่ขึ้น" Tmall-per-SKU case), admin money-path pivots (forwarder/yuan/barcode → `tb_*`, commission→`tb_user_sales`), PCS-style forwarder `[fNo]` view, a 164-cast build-unblock. **NOT blind-merged** — his branch is **62 behind dave-pacred + overlaps เดฟ's trust-sweep + dave's `f4d72228` (search add-to-cart) + touches money paths**; a blind merge would revert prod files (learnings/parallel-agent-sprints "diff-stat LIES"). **➡️ Action next session: ภูม `git pull origin main` to rebase his 22 onto the new main → then it merges clean; OR เดฟ cherry-picks the non-overlapping ones with money-path diff review.** His work is SAFE on Poom-pacred — nothing lost. His search-E1 overlaps INCIDENT #1 — reconcile his richer version vs the env fix when integrating.

**🔴 OWNER TODO — Vercel env (prod · เดฟ has no Vercel token):**
1. `PACRED_TAMIT_DETAIL_URL` = `https://tamit-cloud.com/api-product-2026` (or DELETE) → unblocks China URL-paste search
2. `THAIBULKSMS_FORCE` = `corporate` (or DELETE) → unblocks OTP SMS delivery (Corporate-pool sender)
3. (optional) `EMERGENCY_OTP_BYPASS=true` ONLY if many signups stuck — fail-open, turn OFF after SMS fixed
→ Redeploy after (or it auto-redeploys on this push). Also check ThaiBulkSMS delivery-report (Sent vs Delivered) + "Pacred" sender approval per carrier.

> **Pattern (compounding · captured in memory `prod_env_staleness`):** when a vendor/API "ตาย" in prod but works locally, FIRST check whether a **Vercel env var is stale vs the code default + `.env.example`** — a SET-but-wrong env var OVERRIDES a correct code default. Hit twice this session (TAMIT detail URL + THAIBULKSMS_FORCE).

---

# 🌙 2026-06-02 PM-7 — OVERNIGHT AUTONOMOUS RUN (owner asleep · staff-CRUD backlog) · read FIRST

**main = `dave-pacred` = `6b183aef`+ · all pushed · build EXIT 0 each wave · prod LIVE · migrations 0136 applied.** Owner moved to the company computer, said "หยิบงาน code รันยาวยันเช้า · เดี๋ยวตื่นมาสรุป" → ran the §PM-6 #3.3 staff-CRUD backlog autonomously (codeable items that need NO owner login/token/decision). Pattern: flat Agent + worktree + disjoint + build-gate + push-per-wave (clean state always).

**🚀 Shipped overnight (each its own wave · merged + built + pushed + migration applied):**
- **CRUD: partner** (`daa0d73f`) — NEW `partners` table (**migration 0136 APPLIED prod** · isolated · RLS super-only) + admin directory CRUD at **`/admin/partners`** (list/add/edit/toggle/hard-delete · super) + sidebar (Handshake). MVP = external logistics/business partner directory (GOGO/JMF/TTP/MOMO/CargoThai/warehouse/customs/messenger/api_provider · 8 partner_type CHECK). 🟠 **3 OPEN-Q for owner:** (1) partner-portal *login role*? (built admin-internal only) (2) the 8 partner_type buckets right? (`last_mile` overlaps `carriers`) (3) link partner `code` ↔ MOMO/JMF integration configs? — answer → wire later (no schema change).
- **admin-create-customer + guarded hard-delete** (`6b183aef`) — `/admin/customers/new` (admin creates a customer w/o self-register/OTP: phone-collision guard → `auth.admin.createUser` → profiles → tb_users seed incl. round-robin sales + wallet + cashback · juristic→tb_corporate · reveal pw once) + a **hard-delete** danger-zone on `/admin/customers/[id]` (super-only · type-the-PR-code confirm · **REFUSES if the account has any orders / wallet balance / wallet history** → only truly-empty test/orphan rows · full audit snapshot). Closes the staff-CRUD gap (was soft-toggle only).

**🔴 STILL PENDING (need owner — kept for when พี่ wakes · all in `docs/research/RESUME-machine-move-2026-06-02.md`):**
1. **admin-login-verify** — `admin_pee` / `123456` (Claude can't type pw — owner logs in → confirm `/admin/admins` shows 15).
2. **5 phone-collisions** — owner sign-off per row → free the phones (detail table in RESUME §3.2).
3. **prod money spot-check** — approve 2-3 real test slips → confirm fstatus 5→6 + AR decrement + tax-invoice issuance (mutates real money/RD).
4. **partner CRUD 3 open-Q** (above) · **FB 8 env tokens** → scaffold `/api/webhooks/facebook`.
5. **QA full-loop admin-side** (member-side verified · `docs/research/qa-6systems-2026-06-01.md`).

> 🟢 Codeable backlog still open for a fresh run (no owner needed): freight_quote admin-review page (close the public freight funnel) · sales quote-comparison tool (CEO pricing) · more BI. ⚠️ This conversation hit context limit after 2 clean waves — a fresh session continues the loop with full headroom.

---

# 🏢 2026-06-02 PM-6 — SESSION CLOSE + MACHINE MOVE (→ คอมบริษัท) · read FIRST → then `docs/research/RESUME-machine-move-2026-06-02.md`

**main = `dave-pacred` = `origin/main` = `37078633`+ · all pushed · typecheck EXIT 0 · prod (Vercel auto-deploys `pacred.co.th`) LIVE.** Closing the home session to continue on the company computer. Resume: `git fetch origin && git pull origin main` → read [`docs/research/RESUME-machine-move-2026-06-02.md`](docs/research/RESUME-machine-move-2026-06-02.md) FIRST (carries the machine-local paths · the **5 phone-collision + login-verify pending** · the FB-token checklist · working-style — none of which travel with git).

**🚀 Shipped this session (all pushed + deployed):**
- **🔴 ADMIN OVERHAUL (the headline · owner directive)** — cleared the legacy-admin mess + provisioned a clean **15-admin roster** (`admin_pop/dev/pond/got/poom/win/nat/vam/web/jane/aom/may/pee/ploy/gring`) on prod: each = auth + profiles + `admins`(super) + `admin_contact_extras`(legacy_admin_id bridge) + `tb_admin` (the unification — login SOT = `admins`, sales-attribution SOT = `tb_admin`, linked via `legacy_admin_id`). **Login flexible** (เบอร์ + email `admin_xxx@pacred.co.th` + PR-code · pw `123456`). Created **`admin_center`** ("เซลส่วนกลาง" · routing bucket, no login) · **reset all 8,900 customers' `adminIDSale`→admin_center** (backup `scripts/backup-adminIDSale-*.json` · reversible) · **deleted 10 old messy `tb_admin`** (admin_admin_*, admin_ploypr01, admin_Warehouse). Code: **round-robin sales auto-assign** (legacy `tb_admin.adminStatusSale='1'` model · pool = พี `admin_pee` + เมย์ `admin_may`) + **register success popup** (PR-code + เซล + เบอร์) + **killed the sales-rep-change "death"** (all reassign paths now write live `tb_users.adminIDSale`; CRM accepts legacy rep). Scripts: `scripts/provision-admins-2026-06-02.mjs` + `reset-clear-admins-2026-06-02.mjs` (dry-run default · `--apply`). Roster + flow spec: [`docs/setup/staff-admin-provisioning-2026-06-02.md`](docs/setup/staff-admin-provisioning-2026-06-02.md).
- **AR-aging dedup** — canonical = ภูม's `/admin/accounting/ar-aging` (reconciled after his CSV enhancement); `/admin/reports/ar-aging` redirects there.
- **A+D receipt+tax-invoice** — removed dead forwarder-receipt orphan stack (orphan→redirect, deleted PDF route + `getForwarderByNo`, repointed 3 notifications→/invoice); rewired customer tax-invoice → ภูม's World-B `tb_forwarder_tax_invoice` (forwarder; shop/yuan deferred-banner); **ADR-0027** (`docs/decisions/0027-tax-invoice-sot.md`).
- **forwarder self-pickup address** → Pacred warehouse (สมุทรสาคร · 7 write-path files · legacy rows untouched).
- **/search add-to-cart** wired (dead RSC button → client island calling `addCartItem`).
- **margin-monitor "use server" fix** (caught via browser QA — a const-array value export blanked the page; tsc can't catch it → **always browser-verify after merge**).
- **ภูม sitting-I v4+v5 merged** — margin-monitor (CEO profit-cap ≤15k/ตู้) + quote-compare + margin-flag cron + e-Tax bulk XML + 2 withdraw payouts + ar-aging CSV + forwarders/[fNo] collapsible panels + MOMO PR99 scripts. **No work lost** (cherry-picked; ภูม pulls main when he resumes).
- **FB/IG integration guide** (owner directive · waiting on tokens) → [`docs/setup/facebook-integration-guide-2026-06-02.md`](docs/setup/facebook-integration-guide-2026-06-02.md). Found: Meta Pixel fires the **App ID** not a real Dataset (Events Manager empty → ads don't track) + no FB webhook (CRM FB/IG inbox = stub). Owner provides 8 env (`FACEBOOK_*` + real `NEXT_PUBLIC_FB_PIXEL_ID`) → scaffold `/api/webhooks/facebook` (mirror LINE).

**🔴 PENDING (next session · company computer):**
1. **VERIFY admin login** — `admin_pee` / `123456` (เบอร์ or email) → confirm login works + `/admin/admins` shows the clean 15. **NOT yet click-tested** (provision created the auth rows; login path unverified).
2. **5 phone-collisions** — ภูม/กอต/แนท/พลอย/กริ้ง are **email-only login** (their phone is held by an empty 0-order customer/test/orphan: PR10901/PR130/PR147/PR114 + 1 orphan). Owner sign-off → free the phones → phone login. (Detail in RESUME-2026-06-02 §collisions.)
3. **CRUD: partner** (no table/role/page yet — build) + admin-create-customer + admin-hard-delete (gaps; per the staff-CRUD audit).
4. **QA full-loop** (CEO ask) — member-side 3 systems verified; admin-side + the 🔴 tax-invoice issuance + slip-approve mark-paid still need the owner's prod spot-check.
5. **Owner to provide:** FB 8 env tokens · approve real test slips on prod (mark-paid + tax-invoice mutate money/RD).

---

# 🧳 2026-06-01 PM-5 — SESSION CLOSE + MACHINE MOVE · read FIRST → then `docs/research/RESUME-machine-move-2026-06-01.md`

**main = `dave-pacred` = `55e247be` · pushed · build EXIT 0 · prod LIVE.** Closing the home-machine session to continue on the work computer. Owner types only `sync main / pull dave-pacred มาทำงานต่อ` → **read [`docs/research/RESUME-machine-move-2026-06-01.md`](docs/research/RESUME-machine-move-2026-06-01.md) FIRST** (it carries everything that does NOT travel with git: machine-local paths, the owner-token inventory, the login protocol, env pointers, and the working-style/memory facts).

**Shipped in this close (all pushed):**
- **Promo manager** — owner can now เพิ่ม/แก้/เปิด-ปิดโปร + **อัปโหลดรูป** at **`/admin/settings/promos`** (Megaphone · multi-promo JSON in `business_config.promo.banners` · image→`avatars` public bucket · `/service-import` banner reads active promos, falls back to the legacy single promo). **Migration 0135 APPLIED prod via PostgREST** (IPv6 direct-DB was down → seed via `POST /rest/v1/business_config`; DDL still needs direct-DB/SQL-editor — see ledger + RESUME §2).
- **Member `/service-import` UX (from owner screenshot):** floating widgets decluttered (LINE bubble z-48 below pay-bar) · **pay-bar "ชำระเงิน" FIXED** (root cause = z-index: pay-bar z-44 sat *below* the LINE bubble z-51 → transparent overlap stole the tap → raised pay-bar to z-55; browser-verified click → pay modal opens with the 5 รอชำระ orders) · promo banner configurable.
- **Brand sweep** — admin receipt issuer → Pacred (TaxID `0105564077716` · KBANK `225-2-91144-0` · via site.ts). ⚠️ owner-TODO: **ตราปั๊ม+ลายเซ็น Pacred image assets** (still legacy PCS scans) · self-pickup **warehouse address** (ก๊อต confirm · no China warehouse addr in code) — owner bringing images.
- **ภูม sitting-I INTEGRATED** (Poom-pacred 14 commits · merged CLEAN · zero money-path overlap): commission Potemkin repoint (`/admin/commissions`+`/forwarder-sales` → live `tb_user_sales*` · **4,104 invisible earns now surface** · ADR-0026) · PEAK documents+CSV hubs · `/admin/accounting/ar-aging` · `/admin/forwarders/tran-th` (TH-transport batch) · menubar/orphan-wiring. **Build-fix:** his 5 `x as T[]` casts (written on a 34-behind base) failed typecheck against the newer base → `as unknown as T[]`. 🟠 **follow-up (non-blocker): DUPLICATE AR-aging** — dave `/admin/reports/ar-aging` vs ภูม `/admin/accounting/ar-aging` (both work · pick one canonical, redirect the other).
- **QA:** full-loop tester plan + proven env (Chrome + PR321 + admin auth, screenshots) in [`docs/research/qa-6systems-2026-06-01.md`](docs/research/qa-6systems-2026-06-01.md) — flow #1 (member ฝากนำเข้า/status/pay-bar) + the pay-button fix browser-verified; the rest TODO on the work computer (login protocol agreed).
- **Owner spot-check on prod (recommended):** approve 2-3 real test slips → confirm fstatus 5→6 advance + AR cockpit decrements (the PM-4 mark-paid fix · not click-tested by me = mutates real money).

---

# 🟢 2026-06-01 PM-4 — CEO "6 core systems done?" DEEP-AUDIT + FIX SPRINT · read FIRST

**main = `dave-pacred` = `685dd44b`+ · pushed · build EXIT 0 · no new migrations.** CEO asked if the 6 revenue systems (ฝากสั่งซื้อ·ฝากนำเข้า·โอนหยวน·ออกบิล·แจ้งเก็บเงิน·ออกใบเสร็จ) are TRULY done. Ran **4 read-only audit agents** (legacy PHP source + code + §0e) → **5 fix agents** (flat-Agent worktree pattern). **Verdict: all 6 money loops CLOSED + correct (no leak/double-spend) — but route-200 testing missed real gaps.** Shipped:
- 🔴 **#1 CEO-visible bug — paid forwarders stuck at fstatus=5 "รอชำระเงิน" → AR ฿917k overstated.** "mark-paid" was split (slip-approve minted receipt but no status flip; pay-on-behalf flipped but no receipt). **Fixed ALL approve paths** to advance fstatus 5→6 + mint receipt: `adminBulkApproveWalletHs` (tb-bulk · LIVE bulk) · `adminApproveWalletDeposit` (wallet-hs · LIVE single-row — was ERRORING on type='4', now full direct-slip branch) · `adminPayForwardersOnBehalf` (pay-user · +receipt). credit→clear fcredit (legacy L467/469) · idempotent eq-guard · best-effort. `adminApproveWalletHs` (wallet-trans) = DEAD (0 callers · tombstone).
- 🔴 **forwarder `/invoice` dead-write pay-button REMOVED** + customer rebuilt-twin orphan cleanup (-1424 LOC).
- 🔴 **shop dup dead "mark paid" button REMOVED** (read empty service_orders) + notes page repointed→tb_header_order + split-brain cart unified→/cart.
- 🟠 **yuan detail-approve** fixed (pending→อนุมัติสำเร็จ direct · drop phantom processing) + badge `.eq(paystatus,'1')`.
- money diffs (forwarder fstatus + wallet-hs type='4') reviewed line-by-line before merge. **Owner go/no-go: receipt still shows PCS Cargo brand** (not Pacred). Deferred: shop per-line pricing engine (big build). Detail: memory `big_audit_master_plan_2026_06_01.md` §PM-4.

---

# 🟢 2026-06-01 PM-3 — CRM + 3 MONEY ADRs + BI + pricing-guard SHIPPED · read FIRST

**main = `dave-pacred` = `1fb8ee6f`+ · all pushed · build EXIT 0 · typecheck/i18n 0 · NO new migrations** (all repoint/neutralize existing `tb_*`). Owner approved a batch + said run-long-parallel-ask-once-at-end. Ran **5 worktree agents** (proven pattern) + 2 self-built pieces:
- **CRM core** `/admin/crm` — omni-inbox (LINE real via ปอน's `Podeng_*`; **FB stubbed — no FB table in DB**) + customer-360 + **sales-rep routing** (`tb_users.adminIDSale` · new `actions/admin/crm.ts`) + funnel→`/admin/leads`. LINE↔customer mostly "ยังไม่ผูก" til manual-link; rep dropdown gated on 13-admin recreate.
- **ADR-0023 credit** ✅ — `getMyCredit`→`tb_users.userCreditValue`−`tb_credit.creditvalue`; paydown idempotent. 🛑 **prod-verify caught 2 agent bugs** (ห้ามเดา paid off): hs `type='3'` was a withdrawal-tab COLLISION (641 rows)→`'8'`; + missing NOT NULL `typenew`/`typeservice` (runtime INSERT fail).
- **ADR-0024 config** ✅ — `/admin/settings` neutralized→read-through hub (6 dead-write fields). **+ `/admin/rates` dead-read FIXED** → live `tb_settings` (ฝากโอน 4.93/ฝากสั่ง 4.97/ต้นทุน 4.84 · freeshipping flag · dropped rebuilt-only fee cards). browser-verified.
- **ADR-0025 cashback** ✅ **COMPLETE all paths** — debit `tb_cash_back`+hs idempotent; shop/yuan/deposit + **forwarder-slip approve/bulk** (wallet-trans.ts/tb-bulk.ts → spendCashbackAtCheckout · reject→refund · `357e9e2b`) all settle.
- **BI** `/admin/reports/{cockpit,ar-aging}` — exec cockpit (AR ฿917k · funnel) + AR-aging (buckets · top-50 debtors w/ phones). browser-verified real data.
- **pricing-guard** ✅ — `lib/pricing/margin-advisory.ts` + `<MarginAdvisoryNote>` (`blocks:false` ALWAYS · 6 tests). **Owner chose cockpit portfolio signal** → wired into `/admin/reports/cockpit` (MTD orders > ฿15k/ตู้: amber nudge if >0 else green · verified). Reusable block still plugs into freight per-container pricing (Theme 8) later.
- build-gate catch: cashback sync helpers broke `pnpm build` ("use server" only-async-exports, typecheck missed it) → moved to `lib/cashback/note-tag.ts`. Also: **prod deploys from branch `main`** (not dave-pacred) → `git push origin dave-pacred:main`.

**🔓 STILL OPEN (not เดฟ-solo):** **13-admin recreate (ADR-0022) gates CRM rep-routing + credit/commission visibility** (owner/ภูม) · FB omni-inbox waits ปอน's FB webhook. No เดฟ-solo chips left from this batch. Detail: memory `big_audit_master_plan_2026_06_01.md` §PM-3.

---

# 🧭 2026-06-01 PM — BIG AUDIT + MASTER PLAN + WAVE HANDOFF · read FIRST (supersedes-but-keeps the MARATHON section below)

**main = `dave-pacred` = `49368172`+ (0/0 · prod · Vercel auto-deploys) · all pushed.** Cross-machine resume: `git pull origin main` → read this section → **[`docs/research/big-audit-2026-06-01/_MASTER-PLAN.md`](docs/research/big-audit-2026-06-01/_MASTER-PLAN.md)** (THE canonical long-term plan) + per-lane briefs in [`docs/briefs/`](docs/briefs/).

**🎖 CEO DIRECTIVES (opening day · re-prioritises everything):** [`docs/research/ceo-directives-2026-06-01.md`](docs/research/ceo-directives-2026-06-01.md) — North Star = **business that self-runs ("ทำธุรกิจโดยไม่มีพี่ลงไปทำ")**; scale in 3-4mo via **CRM + Marketing(SEO/ads/content) + standardised-workflow+training**. Org chart → RBAC depts · Global Trade Group holding (multi-company long-term) · accounting **3 tax-doc modes** (ใบกำกับ/ใบขน/ไม่รับเอกสาร · VAT-7% bases → ภูม PEAK §3) · pricing **profit-cap ≤15k฿/ตู้ + sales quote-comparison tool** · **ACQUISITION KICKOFF NOW** (call AX-old + big-PCS · day-1 phone→close). **เดฟ urgent = `/admin/leads` call-queue** on the **6,936 callable cold-leads** (`tb_users.userActive=''`) + big-PCS ranking. New เดฟ order: acquisition→CRM→pricing→(BI feeds all).

**🌏 FREIGHT KNOWLEDGE ABSORBED (the AXELRA side · CEO gave `olddata dev` folder):** [`docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md`](docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md) (+ 4 cluster docs: chats·pricing·web-systems·customs-docs). **Pacred = 1 entity (`0105564077716`=AXELRA=Pacred) · 2 product lines: CARGO (PCS · ported) + FREIGHT (AXELRA · UN-BUILT, runs on Google Sheets).** Partner net: `pcs=ttp` · `momo=jmf(ไอแต้ม/TISO)` · all key into ONE CargoThai (Laravel); we consume it. **READY assets (build not discovery):** PJ-BOOK Prisma 10-model `freight_*` schema · AX BOOKING/JOB.html UX specs · CGTH = working Supabase `/track` rebuild · full rate cards + customs FORM kit + P'BEE PEAK pipeline + call-CDR tool. Freight = **new Theme 8** (FCL/LCL/AIR/cross-border-truck + customs brokerage ใบขน/NETBAY/Form-E/LOI/ตั๋วพ่วง + freight P&L/commission). Full-scope re-plan (short: acquisition+CRM+freight-quote-funnel+pricing-guard; long: freight ERP + customs automation + CargoThai-provider + unified portal/holding) in the master doc.

**🚀 Shipped this PM (all verified + pushed):** LINE staff-notify **LIVE on prod** (real groupId resolved via ปอน's Worker data · Flex cards + deep-links · Vercel env) · **NEW `/admin/line-inbox`** dashboard (reads ปอน's `Podeng_*` LINE data) · Notify Flex upgrade · **env yกเครื่อง** (full Vercel↔local inventory `docs/runbook/env-inventory.md` · +5 china-search vendor vars to prod · **MOMO_API_* creds set + token verified**) · **`/admin/settings` yuan_rate dead-write removed** (real rate = `/admin/settings/legacy-rates` → `tb_settings` rpdefault 4.93/rsdefault 4.97) · **404 `/service-import/…&pay=true`→`?pay=true`** + **`Cookies is not defined`** legacy-JS-order fix (both browser-verified via Chrome). ⚠️ OTP env untouched (owner cmd).

**🔬 THE BIG AUDIT (6 parallel agents · all 263 Supabase tables):** `docs/research/big-audit-2026-06-01/` — `_MASTER-PLAN.md` + 6 cluster docs + `_CONTEXT.md`. **Headline:** faithful port **substantially DONE** (legacy `tb_*` canonical · 147 rebuilt twins mostly 0-row · money loop closed · forwarder ~90%). 3 cross-cutting patterns: **(A)** Potemkin twins (mostly repointed) · **(B) reachable dead-write TRAPS** (admin edits→green toast→no effect: VIP-rate page, 3 commission pages — must sweep) · **(C) unmined data goldmine** (47,636 forwarder orders×114 cols w/ profit+timestamps · 104k wallet ledger · 6,937 never-contacted leads · 77k china categories — almost nothing analyzed → where 10× value is).

**📦 CargoThai blueprint** (owner+ภูม demo decoded): [`docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md`](docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md) — China-warehouse worker-app maps onto existing `tb_forwarder`/`tb_forwarder_item`/`tb_cnt`/`momo_sack` (~80% data ours). 4-phase: own-warehouse intake MVP → public `/track/{code}` (the GTM moat) → partner portal → API-as-a-service (inverse of MOMO consumption). = master-plan **Theme 7**.

**🗂 WAVE PLAN + per-lane handoff (everyone runs long):** [`docs/handoff-2026-06-01-waves.md`](docs/handoff-2026-06-01-waves.md)
- **เดฟ (เรา):** Wave A trust-sweep (Potemkin dead-write sweep + cashback + credit + config-split ADR) → Wave C BI/profit-analytics (the 10× · data all present) + CargoThai P1/P2 with ภูม/ปอน.
- **ปอน (frontend):** [`docs/briefs/podeng-wave-2026-06-01.md`](docs/briefs/podeng-wave-2026-06-01.md) — address delete/set-main · public `/track` · CRM omni-inbox · ad-ROAS · lead win-back.
- **ภูม (accounting/PEAK):** [`docs/briefs/poom-wave-2026-06-01.md`](docs/briefs/poom-wave-2026-06-01.md) — repoint 3 Potemkin commission pages (4,104 invisible earns) · port 2 legacy payout systems · PEAK-style accounting (receipts/tax-invoice/WHT/AR-aging/period-close) · e-Tax RD-86.
- **ก๊อต:** partner-API (GOGO/JMF/TTP) + CargoThai P4 API-as-a-service + LINE webhook consolidation co-decide.

**🔐 Owner-provided tokens (machine-local `/tmp/.cf-tok`,`.vc-tok`,`.momo-tok` · never committed):** Cloudflare + Vercel + MOMO — owner can revoke (kept this session for env/Worker work).

---

# 🟢 2026-06-01 — เดฟ MARATHON: faithful-port backlog CLEARED · read FIRST

**main = `dave-pacred` = `acc852d0` (0/0 · prod · deploy `dpl_833Gv…` READY) · all pushed.** Cross-machine resume: `git pull origin main` → read **[`docs/research/save-point-2026-06-01-dave-backlog-cleared.md`](docs/research/save-point-2026-06-01-dave-backlog-cleared.md)** (canonical) + **[`docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md`](docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md)** (verified gap status).

**➕ LINE/comms ต่อยอด batch (2026-06-01 PM · owner gave CF+Vercel API tokens):** **P1-24 staff-notify LIVE on prod** (groupId resolved + Flex cards + deep-links — see item 1 below) · **NEW `/admin/line-inbox` dashboard** (reads ปอน's `Podeng_*` LINE data — 52 customers/212 msgs · verified 307-gated + DB-layer-tested on prod) · **Notify Flex+deep-link upgrade** (`notifyStaffGroup(text,{url,title})`) · **env ykrueang**: full Vercel↔local inventory (`docs/runbook/env-inventory.md`) + **5 china-search vendor vars added to Vercel prod** (Laonet/Akucargo/TAMIT — were missing → search/reverse-image/tracking were broken in prod). Strategy: **[`docs/research/line-comms-strategy-2026-06-01.md`](docs/research/line-comms-strategy-2026-06-01.md)**. ⚠️ **OTP_BYPASS/OTP_PEPPER NOT touched** (owner: ห้ามแตะจนคอนเฟิม) · held for owner: `NEXT_PUBLIC_YUAN_RATE` (price-sensitive) + `MOMO_TOKEN` (verify usage) · CF+Vercel tokens machine-local+revocable.

**🔑 The 2026-05-30 "23 P0" was ~80% STALE** — re-verified at HEAD: money loop CLOSED (no double-spend), OTP NOT bypassed, settle paths work. This session then cleared the rest.

**SHIPPED (verify+build EXIT 0 each · pattern: flat Agent + isolation:worktree + disjoint files + tsc/tsx-only + merge-serial + verify-once):**
- **Forwarder `[fNo]` editor** (was dead on real rows): tombstone money dead-write `adminMarkForwarderPaid` + payment (ตัดกระเป๋า via faithful `adminPayForwardersOnBehalf`) + address re-pick + transport + cover + owner-reassign + cost-adjust + fShipBy + amountCount + **fCredit** (UPSERT fixes legacy 98%-silent-drop) + single-row driver-assign + **bill-to** (migration 0132 `tb_forwarder.fbilltoname`).
- **Theme B** general-rate editor → `tb_rate_g_*` (the engine tables; admin rate edits now take effect).
- **Reports:** VAT7 shops-only fidelity + 5-orphan reachability + daily-profit SVG graph + shops recompute-live + sales-monthly (tb_sales_report) + 2 monitoring reports (search/SMS) + agent-commission payout report.
- **Settings:** 144-cell forwarder default-cost matrix editor (tb_settings).
- **Forwarder-ops:** single-container cnt-payment+slip · bill-to-customer 4→5 · saveNote push · combine-bill editable detail · printAll/printDriver.
- **Customer (ปอน lane, owner-authorized):** forwarder self-cancel · reverse-image search · tb_notify broadcast + login-popup (M-1/FG-1) — **popup VERIFIED working** (customer-session test).
- **#23 admin-push shop disbursement** (tb_shop_pay_h/sub) · **HR pivot** attendance/leave/recruitment → tas_*/tb_post_job.
- **register phone-exists** code reveal · staff-purge **ADR-0022** + script (review-only).

**📌 REMAINING = ONLY owner-ACTIVATION + ก๊อต partner-API (no codeable-solo faithful work left):**
1. **LINE_STAFF_GROUP_ID** — ✅✅ **DONE + LIVE on prod 2026-06-01** (push-tested HTTP 200 · Vercel prod env set + redeployed `dpl_3JxNNS…` READY · `pacred.co.th` 200). Real staff groupId = **`C09344be50f51abbfb8ca9fddb24e10f9`** ("SA-MKT-PR Pacred", 14+bot=15 — matches owner's screenshot memberJoined 23:23 ICT). The `C61f…` that was in prod env = chat.line.biz OA-Manager chat-thread id (404, not pushable) — replaced. Found by READING ปอน's Cloudflare Worker data (captures every event to `Podeng_line_webhook_events`) — no deploy/edit to his Worker (owner directive: ต่อยอด ไม่ปิดกั้นน้อง). **`OTP_BYPASS`/`OTP_PEPPER` NOT touched** (owner: ห้ามแตะ OTP จนคอนเฟิม). Runbook + findings: **`docs/setup/line-staff-group-activation.md`**. (ปอน's Worker writes `Podeng_*` tables; our 0131 `line_*` unused — reconcile later, ปอน lane. CF+Vercel tokens owner-provided this session → owner can revoke; stored machine-local only, never committed.)
2. **Recreate 13 admins + run staff-purge** (owner/ภูม · ADR-0022 + `scripts/staff-purge-analysis.mjs`) → unblocks P1-15 sales-rep + report rep-names + HR adminid. (`admin_contact_extras` EMPTY + zero old↔new code overlap — confirmed.)
3. **ปอน migrate 3 corporate readers** (ADR-0021) → rebuilt `corporate` write removable.
4. **TTP + MK/MX/Sang sheet adapters** (ก๊อต partner-API).
5. **OTP bypass** (owner · waiting ThaiBulkSMS corporate-route speed).
6. Phase-C: HR work-time-clock (tas_historydataold CSV) + applicant-tracking.

**⚠️ §0c note:** customer flows (popup/image/self-cancel) verified render+no-crash with a customer session; NOT click-tested for destructive cancel (needs fstatus=1 data) + image-upload result (Laonet vendor may 403 from prod egress). Migrations 0132 applied prod. Test account PR015 password reset this turn (harmless test account).

**🧹 Local-only (won't follow to the work computer):** stale locked agent worktrees + dev server :3000. On the work computer just `git pull origin main` — everything is in the repo.

---

# 🟢 2026-05-31 — เดฟ AUTONOMOUS BATCH 2+3 (P0-23 · corporate-SOT · P1-15 · ภูม sitting-H · P1-24) · read FIRST

**Batch-3 add-on (main `1befe969` → `bfb19b70`):**
- **ภูม sitting-H integrated** — PEAK accounting: tax-invoices 7-tab + receipts explorer (3 commits, clean merge)
- **P1-24 staff-group LINE notify** — `notifyStaffGroup()` wired into BOTH yuan-create paths (slip + wallet). ⚠️ **no-op จนกว่า owner ตั้ง `LINE_STAFF_GROUP_ID`** (legacy lineNotify ใช้ LINE Notify API ที่ EOL → ต้อง LINE OA group ID ใหม่: เพิ่ม @pacred bot เข้า staff group → อ่าน groupId จาก join webhook)
- **P1-23 = NOT a real gap** (deep-searched full legacy w/ owner's bypass): legacy yuan-create gates only `walletTotal>0`; ไม่มี never-paid/juristic gate. Pacred createYuanPayment มี pending-aware balance + slip-required แล้ว → ครอบคลุม. customer ฝากโอน self-submit = Pacred-added (legacy = admin สร้างให้ via pcs-admin/payment.php). ไม่ต้องแก้.

**🔑 3 ACTIVATION items รอ owner/teammate (โค้ดพร้อม pluggable):**
1. **`LINE_STAFF_GROUP_ID`** (owner) → P1-24 staff notify เริ่มยิง
2. **ภูม สร้าง 13 admins** (`/admin/admins/new`) → P1-15 sales-rep assign เริ่มทำงาน
3. **ปอน migrate 3 customer-UI corporate readers** (ADR-0021) → ลบ rebuilt `corporate` write ได้

---

# 🟢 2026-05-31 — เดฟ AUTONOMOUS BATCH 2 (P0-23 admin pay-out · corporate-SOT · P1-15)

เดฟ autonomous run ต่อจาก batch ใหญ่. ส่ง main อีก batch (`d3f991ea` → `631713da`):
- **P0-23 admin pay-out** (agent E) — `/admin/sales-payouts` repoint จาก dead rebuilt → faithful `tb_user_sales_admin_pay` (status 2→3 + slip · `AND status=2` guard กัน double-pay). คู่กับ customer earn→withdraw (D). 10/0 test.
- **Corporate SOT** (agent F) — migrate 4 เดฟ-lane readers (`/admin/customers` inline juristic queue + service-orders/[hNo] + service-order.ts + profile.ts) จาก rebuilt `corporate` (profile_id) → legacy `tb_corporate` (userid) ให้ตรง P0-18 ที่ ship แล้ว · **ADR-0021**. 8,898 migrated juristic เห็นได้แล้ว. 9/0 test.
- **P1-15** (เดฟ) — assign sales-rep ตอน **register** ไม่ใช่ approve (`lib/admin/assign-sales-rep.ts` shared · faithful check-otp-register.php). 3/0 test.

**🟢 GATE GREEN:** `pnpm verify` EXIT 0 · DB tests 42 pass/0 (E10·F9·P1-15:3·register-seed23 regression... ) + qa-flow 17 · `pnpm build` EXIT 0.

**⚠️ 2 FINDINGS (action needed):**
1. **P1-15 gated on data:** prod `admins` มี **0 active sales-rep** ที่มี legacy_admin_id → assignment คืน null จนกว่า **ภูม สร้าง 13 admins** (B-3 pending). โค้ด pluggable — พอมี sales admin assignment ทำงานทันที.
2. **Corporate cleanup ยังไม่จบ 100%:** rebuilt `corporate` write ยังอยู่ (B + profile.ts dual-write) — **ลบไม่ได้จนกว่า ปอน migrate 3 customer-UI readers** (service-payment/[id] · service-import/[fNo]/receipt · register/page.tsx) → ADR-0021 checklist. ลบก่อน = migrated juristic เห็น blank บนใบเสร็จ (death gap).

**🔴 เดฟ-backend lane "ครบ" แล้วเท่าที่ทำ solo ได้** — ที่เหลือติด lane/source (ดู §ด้านล่าง batch report):
- P1-23/P1-24 (yuan gate + staff-notify): customer `payment.php` front-controller **หายจาก extract** — ห้ามเดา · target LINE group ต้อง owner ตัดสิน
- P1-3 forwarder [fNo] dual-mode: **ภูม adm-09 lane** (big rewrite · ต้อง coord)
- P1-19/22/29/30 + /add gates: **customer UI = ปอน lane**
- P1-20 forwarder cluster: มี preserved WIP branch (reconcile ระวัง)

---

# 🔱 2026-05-31 — 4-AGENT PARALLEL SPRINT + 3-BATCH SHIP

เดฟ session — owner "เอามาทำเอง ไม่ต้องรอ ก๊อต · แยกร่างรุมทำ". ส่ง main 3 batch จบในรอบเดียว.

**📦 SHIPPED to main (`a58a6893` → `f56625b3`):**
1. **ภูม Poom-pacred** (11 commits) — P0-13 5-tab shop UPDATE · P0-16 per-item refund · P1-5 earn-trigger · P1-10 promo carry · P1-13 refund repoint · bug#2 hnote · ws polyfill
2. **ปอน InwPond007** (1,913 LOC) — `/payment-due` NEW page · address-book CRUD popups (P1-29) · sidebar badge
3. **เดฟ 4-agent parallel** (worktree-isolated · disjoint files · no host-thrash):
   - **A · P0-19 Phase 3** slip-top-up (wallet ไม่พอ → admin slip ส่วนต่าง → จ่ายจังหวะเดียว · `tb_wallet`/`_hs`/`_paydeposit`)
   - **B · P1-16** register seed `tb_wallet`+`tb_cash_back` · juristic→`tb_corporate`
   - **C · P1-18** getShipBy carrier picker + checkFreeArea (func-first, ปอน styles)
   - **D · P0-23** commission earn→withdraw E2E บน `tb_user_sales` (Path A) + **ADR-0020**

**🟢 GATE GREEN ก่อน ship:** `pnpm verify` EXIT 0 · 5 DB tests **84 pass/0 fail** (A15+B23+C9+D20+qa-flow17) · `pnpm build` EXIT 0.

**🔑 4-agent pattern ที่ WORK (ตรงข้าม 119-agent bonfire):** flat `Agent` calls (ไม่ใช่ Workflow {schema}) · `isolation:"worktree"` · disjoint files verified BEFORE spawn · agents ห้าม `pnpm build`/`pnpm dev` (tsc+tsx เท่านั้น) → ไม่ thrash · merge serial (clean) · verify ครั้งเดียว. **ใช้ pattern นี้ต่อไป.**

**⚠️ LANDMINE ใหม่ (learnings/php-port-patterns.md):** `tb_users`/`tb_admin`/`tb_co` = **camelCase บน prod** (`userID`,`userShipBy`,`coID`); `tb_*` อื่นทั้งหมด lowercase. migration file 0081 โกหก (โชว์ lowercase เก่า). tsc จับ column string ผิดไม่ได้ — ต้อง DB test ที่ยิง prod จริง.

**🔐 ENV:** `CRON_SECRET=594bf48b…52106a` owner set Vercel prod แล้ว (redeploying). OTP env-gated ถูกต้อง — ห้ามตั้ง `EMERGENCY_OTP_BYPASS=true` prod.

**🔴 เหลือ (next session):** P0-12 yuan self-approve+notify (ภูม) · P0-23 admin pay-out side (D ทำแค่ customer earn→withdraw) · B's rebuilt-`corporate` write cleanup · ปอน frontend polish + P1-30 · ภูม P1 batch (~20h: P1-2/4/6/7/9/11/12/25/26/27).

**🧹 prune ได้:** 4 agent worktree (a5cb83/ad7d1b/a67cd9/a6589a) MERGED แล้ว.

---

# 🚀 2026-05-31 — POOM-PACRED INTEGRATE + MAIN SHIP (batch 1 · superseded by 4-agent above)

เดฟ session — owner สั่ง "เอามาทำเอง ไม่ต้องรอ ก๊อต". รวม ภูม Poom-pacred (11 commits, clean merge no conflict) → run qa-flow ก่อน push → push main.

**📦 ที่ ship (main `a58a6893` → `ba1cb477`):**
- ภูม **P0-13** 5-tab admin shop UPDATE workflow + tb_promotion carry (1079 LOC + 468 tests)
- ภูม **P0-16** per-item refund shop-order line items (346 LOC + 215 tests)
- ภูม **P1-5** tb_user_sales earn-trigger on forwarder delivery (4 agent codes)
- ภูม **P1-10** tab-4 spawn auto-flip 4→5 + promo carry
- ภูม **P1-13** refund-modal repointed `yuan_payments` → `tb_payment` (faithful)
- ภูม **§0d UX** 4 sitting-F handlers mounted on legacy-view (reachability rule)
- ภูม **bug#2** `tb_header_order.hnote` NOT NULL violation fix + regression test
- ws polyfill for qa-flow Node<22 compat

**🟢 GATE GREEN — qa-flow wallet-delta 17 pass / 0 fail:**
deposit-approve · shop-debit · deposit-reject · withdraw-hold→reject-refund · withdraw-hold→approve · yuan-debit — assert REAL `tb_wallet.wallettotal` delta per ADR-0018.

**🔐 ENV — ขอ user set บน Vercel prod:**
- `CRON_SECRET=594bf48b18fa3750369ccb0cbb9ef0a98d9c40ff47f2bd63c185fbc1db52106a` (generated 2026-05-30 · already in `.env.local`)
- `EMERGENCY_OTP_BYPASS` — ✅ **already env-gated correctly** at `actions/otp.ts:51` (fail-closed when unset). Master gap audit was wrong; no code fix needed. แค่อย่า set `true` บน prod.

**🗺 Branch state (post-push):**
| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `ba1cb477` | **production · Vercel auto-deploys** |
| `dave-pacred` | `ba1cb477` | = main (0/0) |
| `Poom-pacred` | `61bca6b7` (origin) | fully absorbed via merge `6d8da245` — ภูม sync `git pull origin main` ตอนกลับมา |
| `InwPond007`/`podeng` | own lane | ปอน customer frontend |

**🎯 Pickup options for next session:**
- **A** P0-12 yuan manual-create self-approve bypass + notify (ภูม · ~2h)
- **B** P0-19 Phase 3 insufficient-balance slip top-up (เดฟ · WIP @ `worktree-agent-ae275c01…`)
- **C** P0-23 commission earn-trigger E2E architecture (เดฟ+ภูม · partial via P1-5)
- **D** เดฟ P1 batch: register inversion (P1-16) · getShipBy carrier picker (P1-18) · QRPay shortfall (P1-22)

---

# 🎯 2026-05-30 night — MASTER GAP AUDIT + WORK-SPLIT · read FIRST

17-agent exhaustive legacy-vs-Pacred audit (14 subsystem lanes + 2 critics + synthesis). **Canonical SOT for what's broken + who does what: [`docs/research/legacy-gap-2026-05-30/_MASTER.md`](docs/research/legacy-gap-2026-05-30/_MASTER.md)** (+ 14 per-lane `cust-*`/`adm-*` docs + 2 critics in that folder).

**Headline — "Potemkin village":** READ surfaces faithful (wired to legacy `tb_*` where 8,898 customers live); many WRITE surfaces silently write **rebuilt empty tables** → green toast, 0 real rows change. Passes route-200 smoke, fails only on submit. **23 P0 + 31 P1.** Customer ~55% · Admin ~58% faithful.

**🔴 #1 GATE — WALLET SOT decision (เดฟ + ก๊อต, hour-1):** the money loop never closes across 4 lanes; ALL money fixes wait on one call — is the canonical ledger `tb_wallet`+`tb_wallet_hs` (legacy, has balances) or `wallet`+`wallet_transactions` (rebuilt, empty)? Recommend `tb_wallet`. Write `docs/decisions/0018-wallet-sot.md` first. **#2:** OTP fully bypassed (`EMERGENCY_OTP_BYPASS=true` `actions/otp.ts:42`) — security hole.

**Work-split (no lane collision — _MASTER §6):** เดฟ = wallet-SOT + customer write-path + architecture · ภูม = admin backend (start: yuan-UUID one-liner P0-10 + 4 cron retargets + render form in legacy-view + task#41) · ปอน = frontend + monitoring dashboards + **orphan/entry-point sweep** · ก๊อต = co-decide wallet SOT + partner-API + production gate (qa-flow-simulator asserting real `tb_wallet` delta, NOT route-200).

**3 audit dimensions** (all must pass): 1=function exists · 2=writes right `tb_*` table + correct flow-order · **3=reachable (clickable entry point ≤3 clicks — AGENTS.md §0d, owner directive).** Sprint sequence in _MASTER §7.

> ⚠️ The recurring pattern: **the FAITHFUL action is the orphan, the DEAD rebuilt twin is LIVE** (`submitCartOrder` vs `placeServiceOrder` · `wallet-hs.ts` vs `wallet.ts` · `yuan-payments-tb.ts` vs `yuan-payments.ts`). Fix = repoint import + delete twin. Verified intentional divergences (NOT gaps): PCS→PR code · Sheets→CSV cost upload · forwarder-check LINE+email.

---

# 🌃 2026-05-30 evening — 2 PARALLEL SAVE-POINTS · read BOTH

Owner ส่งหน้า legacy customer-profile + ภูม กลับบ้านทำ MOMO ต่อ → 2 sessions ขนานในวันเดียว · ปิดเย็น (เดฟ) + ปิดดึก (ภูม).

---

## 🌙 2026-05-30 night — ภูม MOMO UNBLOCK + 5-SYSTEM FIDELITY AUDIT

ภูม session 2026-05-30 ตอนเย็น→ดึก · กลับบ้าน ต่อจาก home computer · **23 commits pushed to Poom-pacred** (merged into dave-pacred 2026-05-29 reset) · master gap doc + 4 critical learnings captured.

**📦 Cluster ของวันนี้:**

1. **MOMO cabinet display bug (4 commits)** — propagation pipeline เขียน MOMO routing batch IDs (`PR20260527-SEA02`) ลง `tb_forwarder.fcabinetnumber` แทน real cabinet (`GZS260529-1`); forward-only safety ล็อกค่าผิดถาวร; cron window แคบ (`yesterday..today`) ดึง container_closed ที่ปิดก่อนหน้าไม่ได้.
   - `0dd79949` — backfill Step 5 + UI mask (รอปิดตู้ amber chip) + service-orders sticky action column
   - `f0847c6b` — cron `?start=&end=` overrides (manual reseed)
   - `3b9e745f` — propagation root-cause fix · NEVER write routing batch; pre-load real cabinet per tracking; replace stale routing patterns with real cabinets
   - `b5b8c675` — fwarehousename `7→8` (was Cargo Center, now MOMO)
   - Backfill prod: 6 tb_forwarder rows fixed (51976-51981) — real cabinets + warehouse=8

2. **MOMO commit unblock — fusercompany NOT NULL violation (1 commit · `3b864858`)** — ภูม "สร้างทั้งหมด" partial fail (3/4 success · PR005 stuck). Root cause: `lib/admin/commit-momo-row-core.ts:401` + `actions/admin/api-forwarder-manual.ts:430` both wrote JS `null` when `userCompany="1"` (company customer); legacy PHP wrote PHP `NULL` but string-interpolated as `''` (empty string). Fix: `null → ""`. Verified prod company customers (PR124/PR2503/AIGA) all have `fusercompany=""`.

3. **3 customer userID renames** (DB-only · ภูม authorized) — MOMO sends 3-digit legacy codes (`005`/`032`/`116`); Pacred had reissued these as `PR9370`/`PR1282`/`PR1321` during migration. Renamed back atomically across 9 tables · **181 rows updated** (PR1321 had 178 FK refs · PR9370/PR1282 clean). After rename: review-grid ungated all 4 MOMO rows.

4. **🚨 5-system parallel fidelity audit + master synthesis** ([`docs/audit/master-fidelity-2026-05-30-evening.md`](docs/audit/master-fidelity-2026-05-30-evening.md)) — ภูม asked "อะไรตกหล่น อะไรยังใช้งานไม่ได้จริง". Spawned 5 agents (forwarders / service-orders / yuan-payments / drivers+barcode / cnt+warehouse) per AGENTS.md §0b deep-audit-from-source. Result:

   | ระบบ | ✅ | ⚠️ | ❌ | 🔧 | % done | Top P0 |
   |---|---:|---:|---:|---:|---:|---:|
   | ฝากนำเข้า (forwarders) | 31 | 12 | 9 | 5 | ~80% | ~17h |
   | ฝากสั่งซื้อ (service-orders) | 11 | 4-7 | 13 | 17 | **~15-25%** | ~12-18h |
   | ฝากโอน (yuan-payments) | 22 | 18 | 23 | 11 | ~60% | revenue hole |
   | คนขับ + barcode | partial | partial | 4 | 12 | ~75-80% | ~5h |
   | ตู้/cnt + warehouse | partial | partial | 5 | 16 | 70-88% | ~15h |

   **Grand total: ~57 P0 + ~63 P1 · ~70h dev work · 8-9 wallclock days with parallel agents**

5. **6 recurring patterns** (root causes ข้ามทุกระบบ):
   - 🚨 **SILENT DEAD-WRITES** — admin actions write to REBUILT empty tables instead of `tb_*` (#1 bug · 7 surfaces affected)
   - 🚨 **DUPLICATE ACTION FILES** — `yuan-payments.ts` vs `yuan-payments-tb.ts`; pick wrong = silent dead-write
   - 🚨 **WALLET LEDGER NOT DEBITED** — admin approve, wallet doesn't decrement (cash leak in yuan-payments + service-orders)
   - 🚨 **NOTIFY GAPS** — LINE/SMS/email unwired on key transitions (exception: forwarder-check EXCEEDS legacy)
   - 🚨 **PRINT/PDF ROUTES MISSING** — /admin/service-orders/print absent; forwarders 7-button ribbon missing
   - 🚨 **SESSION LOCK MISSING** — legacy `updateLock.php` heartbeat; 13 admins on prod = collision risk

6. **Tier A revenue holes (~9h · Day 1 priority)** — A1 yuan adminCreateManual debit wallet · A2 service-orders adminMarkPaid wallet · A3 forwarders bulkCancel pivot to tb_forwarder · A4 adminUpdateServiceOrder pivot to tb_header_order · A5 adminUpdateYuanPayment pivot to tb_payment · A6 CNY rate `rsdefault → rpDefault` typo + admin UI.

**📋 4 new learnings captured today** (compounding for next agent · home computer Claude reads):
- `docs/learnings/partner-apis-quirks.md` — MOMO `container_no` ≠ cabinet (routing batch trap)
- `docs/learnings/nextjs-16-quirks.md` — `react-hooks/purity` rejects raw `Date.now()` / `new Date()` in render
- `docs/learnings/php-port-patterns.md` — legacy PHP `NULL` string-interpolation = empty string · NOT Postgres NULL
- `docs/learnings/verify-deep-flow.md` — the "silent dead-write" pattern (#1 across 5-system audit)

**🟠 Pending ภูม manual actions** (post-2026-05-30 close-out · trimmed):
1. ✅ ~~PR005 commit ลงตู้ GZS260529-1~~ — DONE (ภูม confirmed 2026-05-30 night)
2. **Browser-verify 2 surfaces post-deploy:** `/admin/forwarders` (real cabinets, no "PR20260527-*") · `/admin/report-cnt/GZS260525-2` + `/admin/report-cnt/GZS260529-1` ("โกดังจีน: MOMO")
3. **Decide A/B/C** for ~8,898 customer MOMO mapping problem (will recur if many MOMO customers have legacy user_codes)

**✅ 6 decisions ภูม answered 2026-05-30 night** (before going home):

| # | คำถาม | ภูม answer | งานที่ตามมา |
|---|---|---|---|
| 1 | GOOGLE_MAPS_API_KEY | "เดะเอามาให้อีกที / สอนวิธีเอา" | doc: [`docs/setup/google-maps-api-key.md`](docs/setup/google-maps-api-key.md) — step-by-step setup guide |
| 2 | LINE Notify (Apr 2025 EOL) | "ย้ายไป LINE OA push + สอนเซ็ท" | **✅ Pacred infrastructure ALREADY wired** — `sendLinePush()` at `lib/notifications/index.ts:125` · channel access token in `.env.local` · LIFF link flow at `/liff/link` · token VERIFIED working (probe LINE API → Pacred Shipping @pacred · 0/300 quota used) · 3 steps left: (a) add 4 LINE env vars to Vercel prod, (b) `LINE_PUSH_BYPASS=false` Production scope only, (c) upgrade quota plan FREE→Light/Standard. Guide: [`docs/setup/line-oa-push-migration.md`](docs/setup/line-oa-push-migration.md) |
| 3 | Cron retarget `tb_forwarder_driver` | "เดะทำที่บ้านอีกที" | deferred to home-computer session · ~20 min fix |
| 4 | Print routes brand | "Pacred (Thailand)" | update print templates + `components/seo/site.ts` if needed (verify tax ID `0105564077716`) |
| 5 | Numeric pallet 1-40 | "ทำให้รองรับได้ทั้งคู่" (letter A1-Z6 + numeric 1-40) | new feature work · ~3-4h · build dual-mode pallet input |
| 6 | Auto SMS+LINE on fstatus 3→4 | "yes" | wire `MOMO_SYNC_PROPAGATE_STATUS=true` + add SMS/LINE on transition (depends on #2 LINE OA done) |

---

## 🌅 2026-05-30 ค่ำ — เดฟ CUSTOMER-PROFILE + RATE + TAX (P0→P2)

เดฟ session — owner ส่งหน้า legacy customer-profile ถาม "เอามาครบไหม ปรับเรทในหน้า user เชื่อมวางบิล". ทำจนจบ + push **dave-pacred (= main)**. **Resume:** `git pull origin dave-pacred` + อ่าน **[`docs/research/save-point-2026-05-30-rate-tax-profile.md`](docs/research/save-point-2026-05-30-rate-tax-profile.md)** (canonical · file map · flags · pickup).

**ที่ ship (migrations 0125-0129 applied prod · NEXT FREE 0130):**
- ✅ **ตัวปรับเรทขายต่อลูกค้า ในหน้า profile** (`/admin/customers/[id]`) — live `tb_rate_custom_*` + history · cost-floor · SVIP · ปุ่มย่อ/ขยาย
- ✅ **Thai tax engine** `lib/tax/wht.ts` — owner 5 กฎ: transport 1% · service 3% · rental 5% · goods 0% (ใน VAT base · ไม่หัก) · VAT 7% (intl leg 0%) · 45 tests
- ✅ **Profile ครบ** — 8 stat cards · note · edit นิติ · address CRUD · editSale (แก้ split-brain)
- ✅ **P2 เชื่อมวางบิล** — dimension-edit auto-price (resolve-rate waterfall · 49 tests · กัน ฿0) + ใบกำกับ/VAT/WHT ตอน payment (opt-in `tax_doc_pref`) + ใบเสร็จ per-line WHT
- 🟡 flags (money · ดู save-point §FLAGGED): ใบเสร็จปกติยัง flat-1% · promo-discount ไม่ port · VAT-per-leg + 50ทวิ รอบัญชี · write-actions ยังไม่ click-test (เลี่ยง mutate prod)

verified: tsc 0 · lint 0 · build 0 · wht 45 + resolve-rate 49 tests · browser (profile PW+PR124 · edit page render)

---

# 🗺 Branch state (post 2026-05-29 reset merge)

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | (post-merge) | production · Vercel auto-deploy |
| `dave-pacred` | (= main) | integrator + customer-backend lane (เดฟ) — both Poom-pacred + podeng merged 2026-05-29 |
| `Poom-pacred` | active | V3 backend primary lane (ภูม) |
| `podeng` | active | frontend + brand SOT (ปอน) |
| `Poom` · `dave` | dormant | V3 secondary lanes |

**🎯 Pickup options:**
- **A** Tier A revenue holes (6 fixes · ~9h)
- **B** Quick wins (5 items · ≤30 min each · CNY rate typo · cron retarget · delete dupes)
- **C** Click-test the 4 MOMO fixes from today on prod (after deploy)
- **D** Decide 6 pending questions (ภูม-only)

---

# Legacy 1:1 strategy (unchanged from 2026-05-24)

---

# 🎯 2026-05-30 — STRATEGY RESET · OWNER FINAL · SINGLE-REPO · read FIRST (supersedes 2-repo + 3-deploy below)

Owner ตัดสินใจ final 2026-05-30: **กลับมาใช้แผนเดิม · repo เดียว (`pacred-web`) ก่อน** ให้รับงาน-ส่งงานได้จริง. `pacred-admin-next` **แขวนไว้** — เอาไว้หลังทำ admin เสร็จ ค่อยแยกไปทำ full-performance version อีกที.

**🗺 BRANCH MODEL (final · 1 repo = pacred-web):**

| Branch | คน | บทบาท | สถานะ (2026-05-30) |
|---|---|---|---|
| `main` | ก๊อต/เดฟ gate | **production** · Vercel auto-deploy (pacred.co.th) | `b23fa282` · prod env + migrations 0119-0122 applied |
| `dave-pacred` | **เดฟ** | integrator — ทุก branch verify → main | `= main` (0/0) |
| `InwPond007` | **ปอน** | หน้าบ้านเว็บไซต์ลูกค้า **+ หลังบ้าน member ลูกค้าทั้งหมด** | `= main` (0/0) · clean base |
| `podeng` | **ปอน sub** | 🔒 **LOCKED** — member pages ที่ทำ stage ไกลเกินไป · ปอน เอาแค่ **MOMO** มาต่อ | `b2bf7ef4` · 34 behind / 9 ahead |
| `Poom-pacred` | **ภูม** | **Admin หลังบ้านพนักงาน** · ทำต่อหลัง Owner Approved | `1e2104cc` · 1 behind / **46 ahead** (Wave 28-30) |

**📌 pacred-admin-next = SHELVED** (ก๊อต baseline · งาน import + work-distribution ที่ทำ session ก่อน ไม่หาย · park ไว้). admin งานจริง = **กลับมาที่ `pacred-web/Poom-pacred`** (ภูม owner-approved lane).

**🟢 ที่ทำเสร็จ session ก่อน (KEEP — ยังใช้ได้):**
- ✅ Local + Vercel = **prod Supabase** (`yzljakczhwrpbxflnmco`) — `.env.local` switched + backed up (`.env.local.dev-backup-2026-05-29-pre-prod-switch`)
- ✅ ปอน MOMO migrations **0119-0122 applied to prod** + tracked on main (momo_* isolated · legacy intact)

**🟢 migration number COLLISION (verified prod 2026-05-30 — ปลอดภัยกว่าที่คิด):**
ภูม (Poom-pacred) มี 2 migration ที่ไม่อยู่ main + เลข **ชน** filename กับ main — แต่ **DB ทั้งคู่ apply prod แล้ว · คนละ object · ไม่ชนข้อมูล**:

| เลข | main (ปอน · applied ✅) | Poom-pacred (ภูม · applied ✅) | DB ชน? |
|---|---|---|---|
| 0118 | `momo_promote_raw_columns` | `admins_role_manager` (admins role +'manager') | ❌ คนละ object |
| 0119 | `momo_disambiguate_container_naming` | `momo_commit_tracking` (4 cols: committed_at/forwarder_id/by/userid) | ❌ same table คนละ column |

→ **ตอน integrate Poom-pacred → main: แค่ renumber filename ภูม's 0118→0123 + 0119→0124** (main's เลขนี้ครอง prod แล้ว). **ไม่ต้อง apply อะไรเพิ่ม** — ภูม apply ทั้ง 2 ตัวลง prod เองแล้ว · renumbered files = idempotent no-op re-run. Integration = pure code-merge + filename fix · zero DB risk.

**🗄 MIGRATION — เคลียร์แล้ว (2026-05-30):** canonical state + numbering authority = `docs/runbook/migration-ledger.md`. **NEXT FREE = 0125** (เช็คก่อนเขียนเสมอ · กันชน). ภูม renumber 0118→0123, 0119→0124 (ทั้งคู่ apply prod แล้ว · แค่เปลี่ยนชื่อไฟล์). ปอน 0118-0122 (MOMO) applied prod.

**🔄 MOMO SYNC — ที่เดียว = main (ตัดสินแล้ว):** single-repo → 1 deploy → 1 cron. ภูม's momo-sync (cron 10 นาที) = canonical · ไหลเข้า main ทาง Poom-pacred→dave-pacred→main · **ไม่มี double-pull**. ปอน podeng MOMO data-foundation = ตาราง apply แล้ว · reconcile consuming code ตอน integrate (ห้ามสร้าง cron ตัวที่ 2).

**📤 HANDOFF ทุกคน:** `docs/handoff-2026-05-30-go-run.md` (per-person sync + scope + ภูม renumber commands)

**🎯 Pickup options (เลือกเอง):**
- **A — Integrate Poom-pacred → dave-pacred → main** (ภูม admin Wave 27-30 · 46 commits) · ภูม renumber 0118→0123/0119→0124 ก่อน · ใช้ `branch-integrate-loop` skill
- **B — Integrate podeng MOMO → main** (9 commits · MOMO consuming code ที่ทำให้ตาราง 0119-0122 ที่ apply แล้วมีข้อมูลจริง · surgical cherry-pick)
- **C — 3 BIG P0 cluster D** (search rewrite + 5 reports + containers-hs) from B-4 audit
- **D — 4 LOAD-BEARING fidelity gaps** (login remember-me + register channel=8 + forgot-password)

**Resume command:**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git pull origin main --no-edit
head -80 CLAUDE.md                                       # this reset section
cat docs/review-2026-05-30-strategy-reset.md             # full review + branch state
```

> ⚠️ **2 sessions ด้านล่าง (3-deploy + 2-repo) = SUPERSEDED by this reset.** pacred-admin-next docs (team-2026-05-28-2repo-workflow · team-2026-05-29-3-deploy · got-vercel-cloudflare-admin2) parked — revive ถ้ากลับไป multi-repo ทีหลัง.

---

# 🚀 2026-05-29 — 3-DEPLOY ARCHITECTURE FINAL · PROD ENV WIRED · ADMIN2 = Poom-pacred (~~read FIRST~~ SUPERSEDED 2026-05-30)

**Owner directive 2026-05-29:** ตั้ง **3 deploys คู่ขนาน** · ใช้ DB prod เดียวกัน · ทีมเลือกใช้ admin version ตามถนัด.

```
┌─────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ pacred.co.th            │  │ admin.pacred.co.th           │  │ admin2.pacred.co.th          │
│ pacred-web/main         │  │ pacred-admin-next/main       │  │ pacred-web/Poom-pacred       │
│ Website + customer      │  │ ก๊อต admin baseline 246 pages│  │ ภูม admin V2 (Wave 1-30+)    │
│ HEAD: 53104312 (QR fix) │  │ HEAD: d630b7c                │  │ HEAD: 1e2104cc (Wave 30 #2)  │
│ (legacy /admin still in) │  │ DEV_BYPASS=true              │  │ active dev · 46 ahead main   │
└─────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
            │                              │                                │
            └──────────────────────────────┼────────────────────────────────┘
                                           ▼
                  Shared Supabase prod:  yzljakczhwrpbxflnmco.supabase.co
                  (3 deploys · 1 DB · ลูกค้า/ตู้/wallet/admins ใช้ชุดเดียว)
```

**🔄 Env switch (CRITICAL):** ก่อนหน้านี้ทุกคนต่อ **dev** project (`pprrlabgebrnocthwdmg`). **2026-05-29 ดึก** owner ส่ง prod env (`yzljakczhwrpbxflnmco`) → ผม update `.env.local` ในทั้ง 2 repo + ทดสอบ local pass แล้ว.

| คน | Local env source | Backup ของ DEV เก็บไว้ที่ |
|---|---|---|
| เดฟ | `pacred-web/.env.local` (prod) | `.env.local.dev-backup-2026-05-29-pre-prod-switch` |
| ภูม | `pacred-admin-next/.env.local` (prod) | `.env.local.dev-backup-2026-05-29` |
| ปอน | ใช้ของเดิม (pacred-web · ขอจากเดฟ) | TBD |

**🟢 Local verified 2026-05-29 (against PROD DB yzljakczhwrpbxflnmco):**
- pacred-web :3000 → `/`, `/en`, `/login`, `/register` = 200 · `/service-import/truck`, `/dashboard` = 307 (auth-gate ปกติ)
- pacred-admin-next :3001 → `/dashboard`, `/admins`, `/accounting`, `/api-forwarder-momo`, `/barcode`, `/acc-payment` = 200
- Supabase health probe `https://yzljakczhwrpbxflnmco.supabase.co/auth/v1/health` = 401 (alive · needs apikey)

**📦 3-deploy branch state (post-2026-05-29 ดึก):**

| Deploy | Repo | Branch | HEAD | Vercel project |
|---|---|---|---|---|
| pacred.co.th | pacred-web | main | `53104312` | (existing · auto-deploy main) |
| **admin.pacred.co.th** | pacred-admin-next | main | `d630b7c` | (existing · pacred-admin-next.vercel.app) |
| **admin2.pacred.co.th** | pacred-web | Poom-pacred | `1e2104cc` Wave 30 #2 | ⚠️ **NEW · ก๊อต ตั้ง Vercel project** |

**🔥 NEW deploy needed: admin2.pacred.co.th**
- ก๊อต ตั้ง Vercel project ใหม่ใน org pacred-co
- Repo: `pacred-web` (เดิม) · Production Branch: `Poom-pacred`
- Domain: admin2.pacred.co.th
- Env vars: copy full `.env.local` (prod yzljakczhwrpbxflnmco) จาก pacred-web Vercel project · เพิ่ม `NEXT_PUBLIC_SITE_URL=https://admin2.pacred.co.th`
- ภูม push commit ใหม่ → Vercel auto-deploy admin2 ทันที (เหมือน main · auto-CI)

**🎯 ทีมเลือกใช้ตามถนัด:**
- admin.pacred.co.th (ก๊อต baseline · 246 pages · 1:1 PHP→Next · Auth.js v5 · clean Next 16)
- admin2.pacred.co.th (ภูม Wave 1-30+ · enhanced UX · Pacred Tailwind · brand-red · sidebar groups)

**⚠️ Migrations ปอน 0119-0122 (pending verify):**
- ปอน push migrations 0119/0120/0121/0122 ขึ้น `podeng` branch (MOMO Phase A/B/C/D)
- ยังไม่ใช่ confirm apply prod แล้วหรือยัง — เดฟ ต้องตรวจกับ ปอน + apply ถ้ายัง
- Files: `supabase/migrations/0119..0122_momo_*.sql` บน `origin/podeng` (`d40fb868..b2bf7ef4` range)

**📁 Resources:**
- Legacy backup: `C:\Users\Admin\Desktop\REALSHITDATAPCS.rar` (37.5 GB · งานเก่าทั้งหมดที่ไม่ใช่ Pacred · ใช้เป็น reference)
- Active legacy reference path: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\*.php` (per AGENTS.md §0b)
- Cross-repo reference materials: ดูใน pacred-admin-next/docs/, .claude/skills/, supabase/migrations-pacred-web/ (imported 2026-05-28 ดึก-3)

**🎯 Pickup options for next session:**
- **A** ก๊อต Vercel setup: admin2.pacred.co.th project (Poom-pacred branch · prod env vars)
- **B** เดฟ + ปอน confirm migrations 0119-0122 apply prod (MOMO Phase A/B/C/D)
- **C** 3 BIG P0 cluster D (search rewrite + 5 reports + containers-hs) from B-4 audit
- **D** 4 LOAD-BEARING fidelity gaps (login remember-me + register channel=8 + forgot-password layout + email mode)
- **E** S3 access key rotation (ภูม · 5 นาที · ค้างจาก 2026-05-20)

**Resume command (next session at home/work):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git pull origin main --no-edit
head -100 CLAUDE.md                                       # 3-deploy architecture (this section)
cat docs/team-2026-05-29-3-deploy-architecture.md         # detailed deploy + setup guide
bash scripts/setup-dave.sh                                # auto status + pickup
```

> ✅ **ภูม Poom-pacred Wave 27-30 INTEGRATED to main 2026-05-30** (this commit · 46 commits · migrations renumbered 0118→0123, 0119→0124). ภูม save-point ด้านล่างเก็บไว้เป็น shipped-history.

---

# 🌅 2026-05-30 — WAVE 29 + WAVE 30 #2 (ภูม · INTEGRATED to main · shipped-history)

ภูม session **ตอนเย็น 2026-05-30** — มา session ใหม่ขอ workflow audit ของ MOMO/accounting/barcode พร้อมแก้. ปิด session ด้วย:
- ✅ **4-agent legacy deep-audit** เผย legacy accounting = 95% UI stub (ไม่มี backend) · workflow ที่ทำได้คือ "ใบเสร็จรับเงิน" (tb_receipt) เท่านั้น ไม่ใช่ "ใบแจ้งหนี้"
- ✅ **Wave 29 pivot** Wave 28 F3 invoice → auto-receipt on payment-land (legacy callPriceUser path)
- ✅ **Wave 30 #2 cron** MOMO pull every 10 min · live test pulled 6 new rows
- ✅ **Pacred Tailwind mobile-first** rewrite ของ `/admin/barcode/driver/import` (net -60 LOC · sticky pallet · 56px tap targets)
- ✅ **Legacy verbatim sidebar** flatten recordIntake + remove redundant menubar barcode tab

**📦 17+ commits today (push range `8e9d8ef..709d8ca` บน Poom-pacred):**

### Wave 29 — pivot accounting + barcode polish
| Commit | งาน |
|---|---|
| `c3087d1` | feat(#205) doc-number minter `{FRC|FRG}{yyMM}-{NNNNN}` · 21 unit tests · port functions.php:457-486 |
| `30ff78d` | merge(#209) barcode sidebar flat shortcut + 2 orphan redirects (Agent F) |
| `945c848` | feat(#207) printReceipt mPDF faithful · ต้นฉบับ+สำเนา · WHT 1% · 4-sig · disclaimer (Agent E) |
| `7a43c81` | feat(#206+#208) pivot to receipt-flow · auto on payment-land + batch manual override (Agent G) |
| `b24c003` | merge(#207) Agent E printReceipt port |
| `457d225` | merge(#206+#208) Agent G auto-receipt + batch UI · resolved mint-receipt-doc-no.ts conflict (kept main's full 200-LOC vs G's 79-LOC stub) |
| `2bf54b4` | fix(#212) post-merge lint cleanup · extract inline SortableTh components |
| `8c210b1` | fix(#214+#215) sidebar verbatim · flatten recordIntake + remove menubar barcode tab |
| `631a458` | feat(#213) /admin/barcode/driver/import Pacred Tailwind mobile-first (Agent #213) |
| `99e6d37` | merge(#213) Agent #213 barcode UI rewrite |

### Wave 30 #2 — MOMO cron auto-pull
| `709d8ca` | feat(#2) cron `*/10 * * * *` + auto-commit hook (deferred to Wave 30.5) · 🎯 LIVE 6 rows pulled in test |

**🟢 Live state (post-push 2026-05-30):**
- `pnpm verify` EXIT 0 (lint 0 errors · tsc 0 · 54 tests · audits green)
- `/admin/barcode/driver/import` mobile-first Pacred design verified at viewport 1568×744 (sidebar shortcut active · sticky pallet amber alert · 56px tap targets · 18px input)
- Cron `/api/cron/momo-sync` live tested with curl → 6 NEW import-track rows synced + log row db02a7b9 logged

**🟠 Pending — ภูม manual actions (carry-over):**
1. 🟠 **B-3 13 admins recreate** via `/admin/admins/new` (~45 min · use `docs/research/tb-admin-13-row-reference.md` · unblocks F1 auto-assign sales rep)
2. 🔴 **B-2 ROTATE S3 key** `e913d7da34ca0089638f100afb74c972` (carry-over many sessions)
3. 🟡 **SQL cleanup #51972** (`DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';`)
4. 🟡 **5 rows date corruption** (`fdatestatus3 + fdatetothai` ปี 2037/2027 · `docs/runbook/wave-29-tb-receipt-pollution-audit.md` adjacent issue)
5. 🟡 **Apply migrations** 0118 (manager role) + 0119 (MOMO commit-tracking cols) to prod if not applied yet
6. 🟡 **Run prod audit** Step 1 of `docs/runbook/wave-29-tb-receipt-pollution-audit.md` to count PR-format rows in tb_receipt
7. 🟡 **ก๊อต/เดฟ decision** — receipt issuer brand: keep `PCS Cargo Co., Ltd. · TaxID 0105560160694` (legacy) หรือ switch เป็น `Pacred (Thailand) Co., Ltd. · TaxID 0105564077716`

**🟡 Wave 30 P1 backlog (next session):**
- **#30.5** Auto-commit body extraction (commit-momo-row-core.ts) — let cron auto-commit eligible MOMO rows · today fails 7/7 because withAdmin rejects
- **#30.6** Barcode axis rename `cargo/driver` → `camera/scanner` (~4 hr · 8 routes + 16 nav refs + redirects)
- **#30.7** Receive payment monitoring · alert if cron-pulled rows accumulate uncommitted for > N hrs

**🟢 Prod snapshot 2026-05-30:**
- **tb_forwarder distribution:** 45,840 ส่งแล้ว (long tail · OK) · **457 รอชำระเงิน** (revenue waiting!) · 268 เตรียมส่ง · 613 ถึงโกดังจีน · 261 กำลังส่งมาไทย · 34 ถึงไทยแล้ว
- **tb_cnt:** 0 rows (cnt-payment flow ภูม ยังไม่ได้ใช้)
- **Latest order:** #51971 fdate=2026-05-18 · ระบบ idle ~12 วัน · รอ hard launch
- **MOMO sync lag pre-cron:** 17h 38m → **post-cron ทุก 10 นาที** ⚡

**🎯 SOTs for next session — read in order:**
1. 🌅 **THIS top section** — Wave 29 + Wave 30 #2 ครบ
2. 📋 `docs/research/legacy-accounting-reality-2026-05-30.md` — 4-agent deep-audit (Wave 29 SOT · legacy "ระบบบัญชี" = 95% stub)
3. 📋 `docs/runbook/wave-29-tb-receipt-pollution-audit.md` — prod cleanup gate (Step 1-4) สำหรับ Wave 28 PR-format pollution
4. 🛠 `lib/admin/mint-receipt-doc-no.ts` + tests · `lib/admin/auto-issue-receipt.ts` · `lib/admin/auto-commit-momo.ts` · `lib/integrations/momo-isolated/sync.ts` (NEW core libs)
5. 🤖 `app/api/cron/momo-sync/route.ts` (Wave 30 #2 · pull every 10 min) · vercel.json cron schedule

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
head -100 CLAUDE.md                                            # this top section
pnpm dev   # port 3000 (if not running)
# Next pickup options:
# A) Wave 30.5 — extract commit body + enable cron auto-commit
# B) ภูม B-3 13 admins recreate (manual ~45 min)
# C) ภูม run SQL pollution audit Step 1 (read-only · 2 min)
# D) Wave 30.6 — barcode axis camera/scanner rename
```

---

# 🌌 2026-05-28 ดึก-3 — SESSION WRAP · 2-REPO LOCAL VERIFIED · SETUP SCRIPTS LANDED

ปิด session ดึกนี้: 2-repo architecture **เชื่อม local + ทดสอบ pass แล้ว** (pacred-web :3000 + pacred-admin-next :3001 · shared Supabase prod). Setup scripts สำหรับ **เดฟ + ปอน + ภูม** push ขึ้น main + dave-pacred แล้ว · พร้อม resume ที่บ้านได้.

**📦 ส่ง main วันนี้ (cluster ดึก-2 → ดึก-3):**

| Commit | งาน |
|---|---|
| `f3147052` | docs(CLAUDE.md): 2026-05-28 ดึก-2 — 2-REPO ARCHITECTURE + LAUNCH PLAN |
| `a9482d71` | docs(team): setup scripts + 2-repo workflow for ปอน + ภูม |
| `<this commit>` | docs(audit): B-4 click-through cluster a/b/c/d + cross-branch inventory + setup-dave.sh |

**🗺 ความพร้อม resume:**

| คน | Repo | Branch | Setup command (เครื่องใหม่ครั้งแรก) | Daily sync |
|---|---|---|---|---|
| **เดฟ** | pacred-web | dave-pacred | `bash scripts/setup-dave.sh` | `git fetch origin && git pull origin main --no-edit` |
| **ปอน** | pacred-web | InwPond007 | `bash scripts/setup-podeng.sh` | `git pull origin dave-pacred --no-edit` |
| **ภูม** | pacred-admin-next ⚠️ NEW | admin | `bash setup-poom-admin.sh` (อยู่ใน repo ใหม่) | `git pull origin admin --no-edit` |

**🟢 Local verified working (post ดึก-3):**
- pacred-web :3000 (Ready in 786ms) — `/`, `/en`, `/login`, `/register` = 200 · `/service-import/truck` + `/admin` + `/dashboard` = 307 (auth-gate ปกติ)
- pacred-admin-next :3001 (Ready in 491ms · DEV_BYPASS=true) — `/dashboard`, `/admins`, `/accounting`, `/api-forwarder-momo`, `/api-forwarder-jmf`, `/barcode`, `/acc-payment`, `/acc-shop` = 200

**🎯 Pickup options for next session (เลือกเอง):**
- **A — Soft-launch sprint** (8-11 วัน · ปลาย 5-8 มิย.): 3 BIG P0 cluster D + 4 LOAD-BEARING fidelity gaps + ก๊อต coord (S3 rotate + CRON_SECRET + API switchover)
- **B — ภูม coordination:** Pull cross-repo migrations + Pacred infra alignment review
- **C — P1 backlog (33 items)** from B-4 audit: `docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md`
- **D — camelCase batch 2b** (tb_forwarder family ~177 renames · page-by-page approach)

**Resume command (next session at home/work):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
bash scripts/setup-dave.sh                              # auto-sync + status + pickup list
head -120 CLAUDE.md                                      # this section + ดึก-2 2-repo plan
```

---

# 🚀 2026-05-28 ดึก-2 — 2-REPO ARCHITECTURE + LAUNCH PLAN · read FIRST (supersedes earlier today)

ก๊อต directive 2026-05-28: ตัด admin ออกเป็น **repo แยก** เพื่อให้ ภูม ทำ 1:1 port จากก๊อต baseline. Production = pacred-web/main + pacred-admin-next/admin (deployed คู่กัน).

**🗺 2-REPO ARCHITECTURE (production = both):**

```
┌─────────────────────────────────────────────┐  ┌─────────────────────────────┐
│ pacred-web   (this repo)                    │  │ pacred-admin-next           │
│ → frontend + member back-office + integrator│  │ → admin back-office only    │
│                                             │  │                             │
│  InwPond007 (ปอน) ────┐                     │  │  admin (ภูม)                │
│  podeng (ปอน sub-task)│                     │  │   ↓ ก๊อต baseline + ภูม sweep│
│  dave-pacred (เดฟ)   ─┴→ main → Vercel     │  │  main → Vercel              │
│                                             │  │                             │
│ Shared: Supabase prod yzljakczhwrpbxflnmco  │←→│ Same DB · same env · same   │
│         + env-config + tb_*/profiles tables │  │   auth (Supabase SSR)       │
└─────────────────────────────────────────────┘  └─────────────────────────────┘
                  pacred.co.th                          (admin sub-domain TBD)
```

| Repo | Branch | คน | งาน |
|---|---|---|---|
| `pacred-web` | `main` | ก๊อต gates | production · Vercel auto-deploy (pacred.co.th) |
| `pacred-web` | `dave-pacred` | **เดฟ** | integrator → main |
| `pacred-web` | `InwPond007` | **ปอน หลัก** | website + customer member back-office |
| `pacred-web` | `podeng` | **ปอน sub-task** | API MOMO / JMF integration (landed) |
| **`pacred-admin-next`** | **`admin`** | **ภูม** | **1:1 admin port จากก๊อต baseline + Pacred infra** |
| `pacred-admin-next` | `main` | ก๊อต gates | admin production · separate Vercel (admin subdomain TBD) |
| `pacred-web` | `Poom-pacred` / `Poom` | (ปล่อยไว้) | dormant · จะกลับมาทีหลัง |

**🟢 ก๊อต's `pacred-admin-next` state (cloned 2026-05-28 ดึก):**
- 133 admin route folders (1:1 จาก legacy `pcs-admin/*.php`)
- 246 page.tsx · 20,246 LOC
- Distribution: 4% stub · 33% small · **57% medium · 6% large** = ~63% มี real implementation
- 4 SQL migrations + docs/database/ × 108 table specs (camelCase canonical schema spec — same target as Pacred batch 1/2a)
- Same Next 16 + Supabase + lucide stack
- ภูม pulls + continues 1:1 port + integrates with Pacred DB

**🎯 OWNER DIRECTIVES (2026-05-28 ดึก):**
1. **Ship ทั้ง 4 LOAD-BEARING fidelity gaps ก่อน launch** (login remember-me · register channel=8 · forgot-password layout · forgot-password email mode)
2. **All 246 admin pages 1:1 จบตามก๊อต** (D1 rule: 100% sameness FIRST, then improve)
3. Launch ASAP — realistic window below

**⏰ Realistic LAUNCH ETA (เวลาไทย · Claude Code × 3 + parallel agents):**

| Path | ETA | Conditions |
|---|---|---|
| 🟢 **Soft-launch (50-100 beta)** | **5-8 มิย. 2026** (~8-11 วัน) | ปอน member polish DONE · เดฟ 3 BIG P0 + 4 fidelity gaps DONE · ภูม 30 core admin pages working · S3 rotate + CRON_SECRET + API switchover ก๊อต DONE |
| 🟠 **Hard-launch (~8,898 cust)** | **15-22 มิย. 2026** (~18-25 วัน) | + ภูม 246 admin pages 1:1 DONE · 33 P1 backlog DONE · camelCase remaining batches DONE · click-through audit 90 buttons DONE · real-world QA DONE |
| 🔴 **Aggressive sprint** | **3-4 มิย. 2026** (~6-7 วัน) | ทุกคน 14-16 ชม/วัน · skip P1 backlog · skip camelCase batches >2a · ภูม 20 core pages only · accept silent-bug risk · feedback fix in week 2 |

**Realistic recommendation:** Soft-launch 5-8 มิย. + hard-launch 15-22 มิย. ตามที่ owner ตอบ "Ship ทั้ง 4 fidelity + 246 admin 1:1". Pure ATM math: ก๊อต ทำ 63% แล้ว + Claude Code × 3 × parallel agents เร่งได้ ~7-10 effective × dev hrs per calendar day.

**📋 Critical path (ลำดับงาน):**

### สัปดาห์นี้ (29-31 พค.) — Decision week + kickoff
1. 🔴 ก๊อต ROTATE S3 + CRON_SECRET + API switchover plan (1 ชม)
2. 🟠 ภูม checkout `pacred-admin-next/admin` + setup integration layer (1 วัน · Pacred DB + env + i18n)
3. 🟢 ปอน กลับมา InwPond007 polish + click-through test
4. 🟢 เดฟ ปิด 3 BIG P0 cluster D (search rewrite + 5 reports + containers-hs) — ~10 ชม
5. 🟢 เดฟ ship 4 LOAD-BEARING fidelity gaps — ~6 ชม

### สัปดาห์หน้า (1-7 มิย.) — Beta-ready sprint
- ปอน: InwPond007 final polish · final QA on member-side
- เดฟ: P1 priority batch + B-2/B-3/B-5 schema drift + camelCase batch 2b (tb_forwarder)
- ภูม: 60-80 core admin pages working + camelCase aligned + Pacred auth wired
- ก๊อต: API switchover progress + admin subdomain DNS

### สัปดาห์ที่ 3 (8-14 มิย.) — Soft-launch + feedback loop
- 🟢 Soft-launch beta 50-100 คน
- Daily feedback fixes
- ภูม fills remaining admin pages

### สัปดาห์ที่ 4 (15-22 มิย.) — Hard-launch ramp
- 🟠 Hard-launch ทั้ง ~8,898 customers
- Full admin available

---

**🎯 SOTs for next session — read in order:**
1. 🚀 **THIS top section** — 2-repo architecture + ETA + critical path
2. 📋 [`docs/audit/poom-wave-25-merge-audit-2026-05-28.md`](docs/audit/poom-wave-25-merge-audit-2026-05-28.md)
3. 📋 [`docs/audit/fidelity-auth-screens-2026-05-28.md`](docs/audit/fidelity-auth-screens-2026-05-28.md) — 4 LOAD-BEARING gaps spec
4. 📋 [`docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md`](docs/audit/) — 10 P0 + 33 P1 click-through audit
5. 🆕 `pacred-admin-next` repo (sibling clone at `C:\Users\Admin\pacred-admin-next\`) — ภูม's working baseline

**Resume command (next session):**
```bash
# pacred-web side (เดฟ + ปอน)
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git rev-list --left-right --count HEAD...origin/main   # = 0/0
head -100 CLAUDE.md

# admin side (ภูม)
cd /c/Users/Admin/pacred-admin-next
git fetch origin && git checkout admin && git pull origin admin
# Pacred infra reference: ../pacred-web (.env.local · supabase config · auth helpers)
```

---

# 🌃 2026-05-28 ดึก — NEW BRANCH MODEL + ปอน MOMO LANDED (mid-session · superseded by ดึก-2 above)

เดฟ session **ดึกวันนี้** — พี่เดฟอัพเดท branch ownership ใหม่ + ปอน push งาน MOMO API + TAMIT เสร็จเข้า podeng → เดฟ merge เข้า main + apply migration 0116 + sync InwPond007 ให้ตรง main.

**🗺 BRANCH OWNERSHIP ใหม่ (2026-05-28 ดึก — read FIRST):**

| Branch | คน | งาน |
|---|---|---|
| `main` | (ก๊อต/เดฟ gates) | production · Vercel auto-deploy |
| `dave-pacred` | **เดฟ** | integrator → main (= main ตลอด) |
| `InwPond007` | **ปอน หลัก** | website + customer member back-office · **ปอน main lane** |
| `podeng` | **ปอน sub-task** | งาน MOMO API (เสร็จแล้ว · จะกลับมาทำ InwPond007 ต่อ) |
| `Poom-pacred` | **ภูม** | admin lane · V3 enhancements |

**📦 3 commits ดึกนี้ (push range `7a4a449d..05e7e30e` on main):**

| Commit | งาน | Source |
|---|---|---|
| `91ddb369` | merge `origin/podeng` — ปอน MOMO + TAMIT (resolved 2 §0c conflicts in tracking-page.tsx) | ปอน → เดฟ |
| `05e7e30e` | apply-pilot-migration.mjs → point at 0116 | เดฟ |
| (migration `0116_momo_isolated_tables.sql` applied to prod in 152ms) | 4 NEW isolated tables · NO legacy touch | ปอน |

**🟢 ปอน's MOMO Admin Sync — landed + applied to prod:**
- `supabase/migrations/0116_momo_isolated_tables.sql` — 4 new tables (`momo_import_tracks` + `momo_container_closed` + `momo_sack_infos` + `momo_sync_logs`) · service_role-only RLS · NO FK to legacy · **applied to prod 2026-05-28 ดึก (152ms)**
- `lib/integrations/momo-isolated/` — parallel client (NOT touching existing `momo-jmf/`) · 14 statuses × 3 phases · real-API verified live
- `app/[locale]/(admin)/admin/api-forwarder-momo/sync/` — admin page · date range + sack lookup + 5 buttons + preview + DB snapshot + counter dashboard
- `/api/admin/momo/{import-track,container-closed,sack-info,sync-preview,sync}` — admin-gated proxies
- 14 new files / +2234 LOC · entirely isolated (zero risk to revenue path)

**🟢 ปอน's TAMIT URL paste + SearchBar fix:**
- SearchBar wrapped in `<form action="/search" method="GET">` — Enter + submit work now
- `/service-import/table` legacy header restyle (matches legacy PCS · pink→orange gradient · 9 status pills)
- `/search?url=…` MODE A URL-paste wired (best-effort — TAMIT vendor was down at push time)

**🗺 Branch state (post-push · 2026-05-28 ดึก):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `05e7e30e` | **production · all today's work landed** |
| `dave-pacred` | `05e7e30e` | = main |
| `InwPond007` | `05e7e30e` | **force-synced to main** (ปอน's primary lane · clean base for next sprint) |
| `podeng` | `d3898012` | 2 commits behind (cosmetic — sub-task done, can be deleted or kept for ref) |
| `Poom-pacred` | `123a3409` | **13 commits behind** — ภูม ต้อง `git pull origin main` ก่อนงานใหม่ |

**📋 สรุปงานต่อให้แต่ละคน (next-steps brief):**

### 🟢 ปอน (lead: InwPond007)
- ✅ งาน MOMO เสร็จแล้ว · landed บน main · prod applied
- ✅ InwPond007 sync = main แล้ว — clean base
- ▶️ ขั้นต่อไป: กลับมาทำ InwPond007 ตามที่บอก (website + customer member back-office)
- 🟡 Pending verify: click-test `/admin/api-forwarder-momo/sync` ที่ prod หลัง Vercel rebuild (~3 นาที)
- 🛠 Resume:
  ```bash
  cd <your-pacred-clone>
  git checkout InwPond007
  git pull origin InwPond007    # = main, includes MOMO + ภูม wave-25 + เดฟ surgical merges
  ```

### 🟢 ภูม (lead: Poom-pacred)
- ✅ Wave-25 #194-#196 ของ ภูม ถูก surgical-merge เข้า main เรียบร้อย (per `docs/audit/poom-wave-25-merge-audit-2026-05-28.md`)
- 🟠 Poom-pacred ตามหลัง main **13 commits** — pull ก่อนงานใหม่:
  ```bash
  git checkout Poom-pacred
  git pull origin main          # absorb เดฟ's batch 2a + ปอน's MOMO + ปอน's LCL + fidelity fixes
  git push origin Poom-pacred   # publish
  ```
- ▶️ ขั้นต่อไป (จาก ภูม's afternoon save-point):
  - **B-1** NOTIFY_BYPASS env (1 ชม)
  - **B-2** 🔴 ROTATE S3 key (5 นาที · ภูม) — carry-over
  - **B-3** 13 legacy admins recreate via `/admin/admins/new` (45 นาที · ภูม)
  - **B-4** Click-through audit ทุก mutation button (~90 ปุ่ม · 5-7 ชม)
  - **B-5** Schema casing drift decision (Option A camelCase vs B revert · ~2 ชม)
- 🟡 Heads-up: เดฟ pick Option A (camelCase) เพราะตรงกับ ก๊อต spec. tb_forwarder family (~177 renames) เป็นงาน batch 2b ที่รอ — ทำ page-by-page ดีกว่า big-bang

### 🟢 เดฟ (lead: dave-pacred → main)
- ✅ Integrator role done · all 3 lanes merged · build + lint green
- ▶️ ขั้นต่อไป:
  - Coordinate ก๊อต API switchover (PCS/TTP brand split per `docs/runbook/pcs-scrub-plan.md`)
  - Pick up next camelCase batch (tb_forwarder ↑ or smaller — wallet/payment family ~60 renames)
  - 4 LOAD-BEARING fidelity gaps (owner-decide)

**🎯 SOTs for next session — read in order:**
1. 🌃 **THIS top section** — new branch model + ปอน MOMO landed
2. 🌙 `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` — surgical-merge playbook (reference for future ภูม pulls)
3. 📋 `docs/audit/fidelity-auth-screens-2026-05-28.md` — 4 LOAD-BEARING fidelity gaps pending owner
4. 🌅 `docs/research/poom-save-point-2026-05-28-afternoon.md` — ภูม's 5 launch-blockers + decision asks

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main   # should be 0/0
head -100 CLAUDE.md                                    # this top section
# Pick from per-developer "ขั้นต่อไป" above
```

---

# 🌙 2026-05-28 ค่ำ — INTEGRATION COMPLETE (mid-session · superseded by ดึก above)

เดฟ session **ค่ำวันนี้** — รับงาน ภูม (Wave 25 #194-#196) + ปอน (LCL tracking pages c6ca71fb) มา **surgical-merge เข้า main** หลังจากปอน flag "หน้าของผมหายไปไหนหมด" + ภูม push 9 commits ใหม่ที่เดฟยังไม่ได้ merge.

**📦 12 commits today (push range `227231a2..337183d5` on main):**

| Commit | งาน | Source |
|---|---|---|
| `1845fff2` | jQuery load-order fix (legacy chrome) | เดฟ |
| `125369a0` | register mobile + error-visibility fix | เดฟ |
| `7a4a4750` | register juristic parallel uploads + progress | เดฟ |
| `a8af737d` | register hard-nav post-signup | เดฟ |
| `54c7b22d` | camelCase **batch 2a** (`tb_cnt + tb_cnt_item + tb_check_forwarder` = 19 renames · migration 0115 applied prod) | เดฟ |
| `d5f46290` | /login fidelity + protected-CSS prefetch-leak fix | เดฟ |
| `9c2571da` | docs: prefetch-leak learning | เดฟ |
| `227231a2` | §0c lint sweep (20 files) | เดฟ |
| `51a7f408` | **🟢 ปอน LCL tracking restore** — cherry-pick `c6ca71fb` (9 files / 1243 lines · /service-import/{truck,sea,air} + _tracking/*) | ปอน → เดฟ |
| `61a87bff..341466ff` | **🟢 ภูม wave-25 surgical merge** — 9 cherry-picks (#194 codemod + 4 batches + post-fix + #195 lint + #196 Zod demote + close-out) | ภูม → เดฟ |
| `337183d5` | lint §0c fix on ปอน's tracking-page.tsx | เดฟ |

**🟢 ที่ทำได้ในรอบนี้:**
1. **ปอน restore** — Audit agent ยืนยัน 1 commit / 9 ไฟล์ / byte-identical กับ podeng. รากปัญหา: ปอน commit ทั้ง `podeng` + `InwPond007` ในวันเดียว แต่เดฟ merge แค่ InwPond007 (commit `80528602`)
2. **ภูม wave-25 surgical merge** — Audit doc `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` ระบุ 20 HARD conflicts + ภูม 1 bug (`adminConvertToJuristic` `.eq("ID", ...)`). ใช้ Option A surgical cherry-pick → ปกป้องทั้ง batch 2a camelCase + ภูม's wave-25 sweep + เดฟ's prefetch leak fix + เดฟ's fidelity work
3. **Build + lint green** — `pnpm build` (Turbopack) + `pnpm lint` 0 errors, 94 warnings (CI ยอม)

**🟢 Schema state (prod Supabase yzljakczhwrpbxflnmco):**
- Batch 1 (2026-05-27): `tb_users` + `tb_admin` + `tb_co` = 80 renames camelCase
- Batch 2a (2026-05-28): `tb_cnt` + `tb_cnt_item` + `tb_check_forwarder` = 19 renames camelCase
- Total renamed: **99 columns** across 6 tables. **102 tables / ~897 renames remain** (tb_forwarder family deferred as batch 2b — needs page-by-page approach)

**🗺 Branch state (post-push · 2026-05-28 ค่ำ):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `337183d5` | **production · all today's work landed** |
| `dave-pacred` | `337183d5` | = main (post-2026-05-24 model: dave-pacred = integration → main) |
| `Poom-pacred` | `123a3409` | **11 commits behind** — ภูม ควร `git pull origin main` ก่อนงานใหม่ |
| `podeng` | `c6ca71fb` | **24 commits behind** — ปอน ควร `git pull origin main` ก่อนงานใหม่ |
| `InwPond007` | = main | already merged earlier this week |

**📋 Audit/research docs created this session:**
- `docs/audit/fidelity-auth-screens-2026-05-28.md` — agent audit · 40 divergences (/login + /register + /forgot-password vs legacy PCS PHP) · 4 LOAD-BEARING top picks
- `docs/audit/podeng-lost-pages-2026-05-28.md` — agent audit · ปอน lost work investigation · confirmed 1 commit only, restore complete
- `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` — agent audit · 9-commit ภูม integration playbook (used to drive the surgical cherry-pick)
- `docs/research/poom-save-point-2026-05-28-afternoon.md` — ภูม save-point + launch-blocker analysis

**🎯 SOTs for next session — read in order:**
1. 🌙 **THIS top section** — what's just shipped + branch state
2. 📋 [`docs/audit/poom-wave-25-merge-audit-2026-05-28.md`](docs/audit/poom-wave-25-merge-audit-2026-05-28.md) — the 9-commit ภูม surgical-merge playbook (reference for future ภูม merges)
3. 📋 [`docs/audit/fidelity-auth-screens-2026-05-28.md`](docs/audit/fidelity-auth-screens-2026-05-28.md) — fidelity gap list for /login + /register + /forgot-password (4 LOAD-BEARING items pending owner decision)
4. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](docs/research/poom-save-point-2026-05-28-afternoon.md) — ภูม's 5 launch-blocker analysis + 5 decision asks
5. 📋 NEW learnings (5 entries today):
   - `docs/learnings/nextjs-16-quirks.md` × 3 (jQuery script-order · `<Link>` prefetch CSS leak · `"use server"` non-async-export rejection)
   - `docs/learnings/php-port-patterns.md` × 1 (schema casing drift)
   - `docs/learnings/verify-deep-flow.md` × 1 (round-2 case study)
   - (`docs/learnings/_index.md` updated 2026-05-28 evening consolidated)

**🟡 Pending decisions for next session:**
1. **Schema casing drift** (ภูม flag): rewrite code to camelCase **A** or write migration to lowercase **B**. Current direction = A (camelCase everywhere — ก๊อต's spec north-star)
2. **camelCase batch 2b** — tb_forwarder family (~177 renames / 18 customer-facing pages) — needs page-by-page approach, not big-bang
3. **5 launch-blockers** from ภูม's afternoon save-point:
   - B-1 `NOTIFY_BYPASS` env (1 ชม · Claude)
   - B-2 🔴 ROTATE S3 key (5 นาที · ภูม) — carry-over
   - B-3 13 legacy admins recreate (45 นาที · ภูม)
   - B-4 Click-through audit ทุก mutation button (~90 ปุ่ม · 5-7 ชม)
   - B-5 Schema casing drift audit (~2 ชม · Claude)
4. **Top 5 fidelity gaps** from auth audit (4 LOAD-BEARING — owner decisions):
   - Login remember-me wiring (M ~1.5h)
   - Register channel=8 "ผู้ใช้งานแนะนำ" referral input (S ~30m)
   - Forgot-password as same-route toggle vs separate route (L ~4h — owner-decide)
   - Forgot-password email mode keep or hide (30m if hidden)

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main   # should be 0/0
head -120 CLAUDE.md                                    # this top section
cat docs/audit/poom-wave-25-merge-audit-2026-05-28.md  # if more ภูม commits to merge
# Pick from "Pending decisions" above
```

---

# 🌅 2026-05-28 afternoon — WAVE 25 SHIPPED (mid-session · superseded by ค่ำ above)

ภูม session **บ่ายวันนี้** — เริ่มเช้าด้วย sync `dave-pacred` (เพราะพี่เดฟแก้ Supabase เมื่อวาน · migration 0113 rename ~78 columns ตู้/admin/co lowercase → camelCase บน prod) → merge + sweep → fix tsc + lint → ภูม click-test เจอ P0 bug → ปิดแล้ว push เก็บงานให้พี่เดฟ review.

**📦 8 commits today (push range `6ec9d7b..6d88c8e` on Poom-pacred):**

| Commit | งาน |
|---|---|
| `aac4583` | Wave 25 #194 codemod (13 single-table tb_users/admin/co readers) |
| `2f36711` | batch A (24 admin core pages camelCase) |
| `546b528` | batch B (25 admin QA + forwarders + service-orders + cnt) |
| `6bf00c5` | batch C (25 actions + lib + rates) |
| `2db1c81` | batch D (27 customer-facing protected pages) |
| `7779902` | post-cherry-pick repair · 31 tsc errors (profiles.id + auth.user.id over-rename) |
| `0699fe3` | Wave 25 #195 · 61 §0c lint sweep (19 files) + tsconfig/package/.env verify-gate cleanups |
| `6d88c8e` | Wave 25 #196 · **cnt-payment P0 bug fix** (demote 4 Zod schema exports from `"use server"`) |

**🟢 Verify state (post-Wave 25 close):**
- `pnpm verify` EXIT 0 (lint 0 errors · tsc 0 · ~280 tests · audits green)
- Browser-verify 2 surfaces end-to-end success: `/admin/report-cnt` cnt-payment + `/admin/forwarder-check` bulk-bill
- Schema casing drift discovered + documented (tb_cnt* camelCase quoted vs action lowercase keys · PostgREST fuzzy-matches but raw SQL/RPC future bug)

**🔴 5 launch-blockers identified (ภูม สั่งวิเคราะห์ Phase 1 launch-readiness):**
1. **B-1** SMS/LINE/Email ส่งจริงตอน admin test — ต้องเพิ่ม `NOTIFY_BYPASS` env (~1 ชม · Claude)
2. **B-2** ROTATE S3 key `e913d7da34ca0089638f100afb74c972` (carry-over · ~5 นาที · ภูม)
3. **B-3** 13 legacy admins recreate via `/admin/admins/new` (~45 นาที · ภูม)
4. **B-4** Click-through audit ทุก mutation button ใน `/admin/*` (~90 ปุ่ม · ~5-7 ชม wallclock · 3-4 parallel agents)
5. **B-5** Schema casing drift audit + fix (~2 ชม · Claude + agents)

**🟡 Decision asks for ภูม / พี่เดฟ:**
1. Schema drift fix: **A) rewrite code** to match schema camelCase OR **B) write migration** rename columns to lowercase
2. Launch strategy: **soft-launch beta cohort** (50-100 คน) OR hard-launch
3. Launch date — ถ้ามี hard date จะช่วยตัด P1/P2 ที่ slip

**🎯 SOTs for resume — read in order:**
1. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](docs/research/poom-save-point-2026-05-28-afternoon.md) — **this session's canonical resume** (8 commits · launch-blocker analysis · decision asks · 5 B-items + 5 S-items prioritized)
2. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](docs/research/poom-save-point-2026-05-27-night.md) — Wave 22+23 close-out yesterday
3. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](docs/research/admin-tech-debt-master-2026-05-27.md) — 19-item inventory (18 closed by Wave 23-24-25 · 1 deferred design call)
4. 📋 NEW learnings (3 entries today):
   - [`docs/learnings/nextjs-16-quirks.md`](docs/learnings/nextjs-16-quirks.md) [2026-05-28] — `"use server"` files reject ALL non-async-function value exports
   - [`docs/learnings/php-port-patterns.md`](docs/learnings/php-port-patterns.md) [2026-05-28] — Schema casing drift (tb_cnt* camelCase quoted vs action lowercase)
   - [`docs/learnings/verify-deep-flow.md`](docs/learnings/verify-deep-flow.md) [2026-05-28] — round-2 case study · cnt-payment click-through gap · hardened protocol added

**🗺 Branch state (post-push · 2026-05-28 14:59):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9c2571d` | production (ภูม Wave 20-25 ยัง merge) |
| `Poom-pacred` | `6d88c8e` | **active · Wave 25 work landed · awaiting พี่เดฟ review** |
| `dave-pacred` | `9c2571d` | customer-side (12 commits ahead Poom · ยังไม่ sync) |
| Our worktree | `6d88c8e` | ✅ in sync 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-28-afternoon.md     # canonical resume
# Then: pick B-1..B-5 (launch blockers) per ภูม decision
```

---

# 🌙 2026-05-27 ค่ำ — WAVE 22 + WAVE 23 P0 SHIPPED · read FIRST (supersedes 2026-05-26 ค่ำ below)

ภูม mega-session วันนี้ — เช้า/บ่าย Wave 22 (perf root-cause + tb_admin merge) · ค่ำ ภูม flag 4 bugs → 3 audit agents → master tech-debt doc → Wave 23 P0 batch 1 ครบ 4 fixes. ภูม กลับบ้านจาก work computer → resume ที่บ้าน.

**📦 28+ commits today (push range `22d5e37..<see save-point>` on Poom-pacred):**

**Wave 20-22 sweep (เช้า/บ่าย):**
- Wave 20 P1 batch 2 (wallet/add · yuan-payments/new · reports/{payment,shop,forwarder}) — Tailwind chrome
- Wave 21 P0 — shop→forwarder auto-spawn · Wave 21 deferred admin-profile jQuery → native dialog
- Wave 21 P2 — migration 0109 (23 partial indexes · applied to prod · /admin warm 1.88s vs cold 2.6s confirmed) + Phase A 4 quick wins
- NEW skills (`debug-mantra` + `management-talk` · 16 total) + learning (`debug-discipline.md` · "2 Issues" case study)
- **Wave 22 tb_admin → admins merge** (5 phases · migration 0110 + 3 intel docs + list page + CRUD forms + pre-existing bug fix · 10+ agents)
- **PostgREST PGRST200 cross-embed fix** (4 files · captured as learning in `supabase-rls-patterns.md`)

**Wave 22 close-out (ค่ำ · ภูม 4-issue flag):**
- fix · sanitize 9 placeholders (พี่ป๊อป's name leaked into form examples · my brief mistake)
- fix · sidebar 4 icons missing (Banknote · KanbanSquare · Smartphone · Save) + dev-only console.warn
- fix · 2 dangling-Bootstrap modals (organization-email + barcode/driver/import) + extract shared `components/ui/pacred-dialog.tsx`
- docs · master tech-debt inventory `admin-tech-debt-master-2026-05-27.md` (19 items prioritized · 6 closed in-session)

**Wave 23 P0 batch 1 (ค่ำ · 4 critical fixes per master tech-debt):**
- `0dce2b9` Agent O — `/admin/customers` suspend + Approve confirm wrapper (no more instant mutate)
- `f48dea8` Main — `/admin/accounting` menubar 96+ 404 leaves → catch-all stub "🚧 Wave 24+" + 4 placeholder no-op fixes
- `cddeea3` Agent N — `/admin/admins/[uuid]` detail rewrite (admins JOIN profiles JOIN admin_contact_extras · -83 LOC · 5 sidecar areas banner'd as Wave 23 follow-up)
- `19ae7ff` Agent P — `/admin/forwarders/combine-bill` 4 bugs FIXED (built ใบส่งสินค้า A4 print route · bill# clickable · items column root-cause = PGRST200 family · ลบรายการ PacredDialog confirm)

**🟢 Wave 23 P0 done · awaiting ภูม browser-verify ที่บ้าน (6 surfaces):**
1. /admin/customers suspend/Approve → confirm dialog
2. /admin/accounting menubar → ทุก dropdown ไป stub (no 404)
3. /admin/organization-email "เพิ่มใหม่" + "คำอธิบายระบบ" modal
4. /admin/barcode/driver/import "คำอธิบายระบบ" modal
5. /admin/admins/[uuid] detail
6. /admin/forwarders/combine-bill (list + print + delete confirm)

**⚠️ Pending ภูม manual actions (carried over):**
1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (carry over many sessions)
2. **#136** cleanup test row #51972:
   ```sql
   DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';
   ```
3. **Browser-verify Wave 23 P0 6 surfaces** above

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](docs/research/poom-save-point-2026-05-27-night.md) — **canonical resume** (28+ commits · 13 agents · Wave 23 P0 ครบ)
2. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](docs/research/admin-tech-debt-master-2026-05-27.md) — **THE NEXT-SESSION SOT** · 19 items prioritized · 10 closed today · 9 P1 + 4 P2 remain (~12-18h dev sprint)
3. 📋 3 audit reports (`admin-click-through-audit` · `admin-ui-design-audit` · `admin-sidebar-and-disbursement-audit` — all 2026-05-27)
4. 📋 Wave 22 intel trio (`tb-admin-merge-intel` · `tb-admin-code-audit` · `tb-admin-13-row-reference` — all 2026-05-27)
5. 📋 [`docs/learnings/debug-discipline.md`](docs/learnings/debug-discipline.md) + [`docs/learnings/supabase-rls-patterns.md`](docs/learnings/supabase-rls-patterns.md) (PGRST200 entry NEW today)
6. 🛠 [`.claude/skills/debug-mantra/SKILL.md`](.claude/skills/debug-mantra/SKILL.md) + [`management-talk`](.claude/skills/management-talk/SKILL.md) + [`components/ui/pacred-dialog.tsx`](components/ui/pacred-dialog.tsx) — NEW today

**🟡 Pickup options for next session:**
- **A** Wave 23 P1 batch (9 items · ~5-7h wallclock with parallel agents) — withdrawals param drop · ดู/แก้ไข labels mislead · cnt-hs GZE overflow · 2 dead routes · 9 Bootstrap chrome pages · disbursement header drift · brand-red 2 shades · PCS Freight legacy port gap
- **B** Wave 23 P2 polish (~6-8h) — 4 form-legacy pages · /admin/reports V-G6 cards wire-up · admin-profile-client form-control verify
- **C** Wave 21 P2 Phase C RPC consolidation (~4h) — get_admin_sidebar_counts() + 2 more RPCs (unlocks 3 Phase A TODO SUM cards)
- **D** Browser-verify ภูม เอง (~30-45min) — 6 Wave 23 P0 surfaces ที่บ้าน

**🗺 Branch state (post-push · 2026-05-27 ค่ำ final):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 20+22+23 ยัง merge) |
| `Poom-pacred` | `19ae7ff` (+ save-point) | **active · all Wave 20-21-22-23-P0 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `19ae7ff` (+ save-point) | ✅ in sync |

**Resume command (ที่บ้าน):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
cat docs/research/poom-save-point-2026-05-27-night.md
cat docs/research/admin-tech-debt-master-2026-05-27.md
pnpm dev   # port 3000
# Then pick option A/B/C/D from above
```

---

# 🌅 2026-05-27 เย็น — WAVE 22 PERF-FIX + tb_admin MERGE SHIPPED (mid-session · superseded by ค่ำ above)

ภูม กลับมา session เย็น · Wave 22 = perf root-cause kill + 5+2 parallel agents (10 total this session) + 2 new skills + tb_admin → admins consolidation Phase 1-5.

**📦 13 commits today (push range `22d5e37..1a40af6` on Poom-pacred):**
- **Wave 20 P1 batch 2** — wallet/add · yuan-payments/new (`fc9aabe`) + reports/{payment,shop,forwarder} (`f47c179`) Tailwind chrome
- **Wave 21 P0** — shop→forwarder auto-spawn (`fe98da3` · closes taxonomy §6 gap)
- **Wave 21 deferred (Task #128)** — admin-profile-client jQuery → native dialog (`003439b` · 5 modals + 2 confirms · 3 inline helpers `PacredDialog` + `DialogFooter` + `useConfirmDialogs`)
- **Wave 21 P2 perf fix** — query survey (`cbed382`) → migration 0109 (`5372346` · 23 partial indexes) → Phase A 4 quick wins (`5b065c6` · 3 TODOs + 1 real fix on `report-cnt`). **Applied to prod** → admin chrome 1.5-3s → 100-300ms confirmed (/admin warm 1.88s vs cold 2.6s)
- **NEW skills** — `debug-mantra` + `management-talk` (`8050eef` · 16 total)
- **Learnings** — `debug-discipline.md` case study of today's "2 Issues" misdiagnosis (`c9b5446`)
- **Off-target fix kept as evidence** — `a2e7b25` (image qualities · doc'd in debug-discipline)
- **🆕 Wave 22 tb_admin → admins merge (Phase 1-5)** — migration 0110 + 3 intel docs (`09f410d`) + list page rewrite (`f2e731d`) + pre-existing bug fix (`7a9e019`) + CRUD forms (`1a40af6` · 1734 LOC new · 5 server actions)

**🟢 Verified working (post-0109):**
- /admin home — 1.88s warm (was 2.6s)
- /admin/customers list — 0.52-0.72s
- /admin/wallet/add + /admin/yuan-payments/new (Tailwind chrome · BS4 form-island banner-flagged)
- /admin/reports/{payment,shop,forwarder} — full Tailwind · prod data flowing
- /admin/admins/[id] modal port — code clean (jQuery/BS4 zero · all 7 modals native `<dialog>`)

**🟠 Wave 22 tb_admin → admins merge — code shipped · awaits 2 actions ภูม:**
1. **Apply migration 0110** in Supabase Dashboard SQL Editor (paste `0110_admin_contact_extras_legacy_bridge.sql` · ~50ms · 0-row table)
2. **Recreate 13 legacy admins via `/admin/admins/new`** form (use reference doc `docs/research/tb-admin-13-row-reference.md` alongside · ~45-60 min)
- After both: /admin/admins shows 4 native + 13 new admins · transfer-rep dropdown works · all 24 legacy tb_admin readers eventually swap to admins (gradual decommission over future sessions)

**⚠️ Pending ภูม manual actions (priority order):**
1. 🟠 **Apply migration `0110`** in Supabase SQL Editor — unblocks /admin/admins (currently 500)
2. 🟠 **Recreate 13 admins via `/admin/admins/new`** form — open reference doc + sip coffee · 45-60 min
3. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (still not done · leaked วันแรก)
4. **#136** cleanup test row #51972 — `DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';`

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌅 [`docs/research/poom-save-point-2026-05-27-evening.md`](docs/research/poom-save-point-2026-05-27-evening.md) — **canonical resume** (13 commits · 10 agents output · verified pages · pickup options A-E)
2. 🔥 [`docs/research/wave-21-p2-query-survey.md`](docs/research/wave-21-p2-query-survey.md) — perf root-cause + 3-phase plan (Phase B done · Phase A done · Phase C waits)
3. 🔧 [`docs/research/tb-admin-merge-intel-2026-05-27.md`](docs/research/tb-admin-merge-intel-2026-05-27.md) + [`docs/research/tb-admin-code-audit-2026-05-27.md`](docs/research/tb-admin-code-audit-2026-05-27.md) + [`docs/research/tb-admin-13-row-reference.md`](docs/research/tb-admin-13-row-reference.md) — Wave 22 merge intelligence (read together · the 13-row reference is the action checklist for ภูม)
4. 📋 [`docs/learnings/debug-discipline.md`](docs/learnings/debug-discipline.md) — **NEW** "2 Issues" case study · pair with debug-mantra skill
5. 🛠 [`.claude/skills/debug-mantra/SKILL.md`](.claude/skills/debug-mantra/SKILL.md) + [`.claude/skills/management-talk/SKILL.md`](.claude/skills/management-talk/SKILL.md) — **NEW skills** (16 total)

**🟡 Pickup options for next session (ภูม pick when resuming):**
- **A** Wave 22 Phase 6 + cleanup leftovers (~1-2h · after 13-admin recreate) — rewrite `/admin/admins/[id]` detail page (Task #150 · still queries tb_admin · row-click 404 now) · avatar upload (Wave 23 deferred · Agent J) · #136 cleanup
- **B** Phase C RPC consolidation (~4h) — `get_admin_sidebar_counts()` + `get_dashboard_kpi()` + `get_wallet_system_totals()` (cuts 22 RTTs → 1 + unlocks the 3 TODO surfaces from Phase A)
- **C** Wave 21 batch 3 — `/admin/service-orders/cart` + `cart/add` (port `cart.php`)
- **D** Wave 21 P1 follow-ups — #137 paginate /reports/forwarder · combine-bill PDF print · warehouse-history bulk-print
- **E** Migrate remaining 16 `resolveLegacyAdminId` callers (~2h · Agent G audit) — swap to query admins+admin_contact_extras · cuts files for eventual `DROP TABLE tb_admin CASCADE`

**🗺 Branch state (post-push · 2026-05-27 เย็น):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 20+22 ยัง merge) |
| `Poom-pacred` | `1a40af6` (or later) | **active · all Wave 20+21+22 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel) |
| Our worktree | `1a40af6` | ✅ in sync with Poom-pacred 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-27-evening.md       # canonical resume
pnpm dev   # port 3000 (if not running)
# Then: pick option A/B/C/D/E from above
```

---

# 🚨 2026-05-26 ค่ำ — WAVE 20 ALL DONE · read FIRST (supersedes 2026-05-25 below)

ภูม **mega-session วันนี้ · 30+ commits บน `Poom-pacred`** (เกือบทั้งวัน). ที่ผ่านมา Wave 19 ปิด BUG #1-4 เสร็จ → วันนี้ดำเนินการ Wave 20 ครบทั้ง 5 layer (P0 schema swaps + P0-4 reports + P1 batch 1 Tailwind rewrites + qw1/qw2 + bonus). **ทุกหน้า browser-verified §0c** (ไม่ใช่แค่ route smoke).

**📦 30+ commits today (push range `2ab967b..22d5e37`):**
- **§0c sprint** — codemod 244 files + ESLint rule `pacred/no-bare-supabase-data-destructure`
- **4 bugs** — BUG #1 PR10899 500 · #2 forwarders badge · #3 wallet/[id] type-aware · #4 paydeposit slip join
- **Wave 20 P0-1..3** — customers/[id] · accounting hub (+ unified PEAK chrome) · KPI dashboard — all → tb_*
- **Wave 20 P0-4** — reports hub + 5 sub-reports (credit-pending 143 · pending-payments 1,470 · refunds 60 · monthly-orders ฿1.8M+ · debtors 0+banner)
- **Wave 20 P1 batch 1 (7 หน้า)** — notes (+ schema swap) · transfer-rep · admins + [id] · warehouse-history (+ helpers) · combine-bill + add
- **Wave 20 fixes** — qw1 fcover URL rewriter + smart placeholder · qw2 warehouse-history 7d default · forwarders avatar revert · 2× menubar link wiring for /notes
- **Bonus** — /admin/service-orders → tb_header_order (21,950 rows) · /admin/accounting/cargo redirect
- **Docs** — admin pages audit (175) · marketplace thumbnails research · order taxonomy · **agent orchestration learnings (NEW)**

**🟢 23 pages verified working with real prod data:**
- /admin/accounting (฿35M+ cards), /accounting/cargo (redirect)
- /admin/customers/PR10899, /customers/transfer-rep
- /admin/kpi (฿6.8M MTD), /service-orders (200 rows)
- /admin/forwarders + /[fNo] enhanced detail, /warehouse-history, /notes (500 rows), /combine-bill (997 rows), /combine-bill/add
- /admin/admins (13), /admins/admin_nat (identity + KPI)
- /admin/reports (5 tabs) + credit-pending (143) + pending-payments (4) + refunds (60) + monthly-orders + debtors
- /admin/wallet/105410 (topup+slip), /wallet/105411 (partner slip via paydeposit join)

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-26-night.md`](docs/research/poom-save-point-2026-05-26-night.md) — canonical resume (30+ commits · verified pages · pickup options · resume commands)
2. 📋 [`docs/learnings/agent-orchestration.md`](docs/learnings/agent-orchestration.md) — **NEW** 6 lessons from running 8 parallel agents (stale base · dual-write · API timeout · 1000-row cap · PEAK chrome · §0c click-through)
3. 📋 [`docs/audit/admin-pages-audit-2026-05-25-night.md`](docs/audit/admin-pages-audit-2026-05-25-night.md) — 175-page audit (Wave 21 backlog source)

**🟡 Pickup options for next session (ภูม pick when resuming):**
- **A** Wave 20 P1 batch 2 (~2-3h) — wallet/add · yuan-payments/new · reports/{payment,shop,forwarder} · service-orders/cart
- **B** Wave 21 P0 task #106 (~3-4h) — port shop→forwarder auto-spawn (legacy shops.php L1675-1721) — biggest backlog impact (spawn chip ready)
- **C** Browser-verify ภูม เอง (~30min) on prod surfaces before going further
- **D** Wave 21 P1 follow-ups (~2h) — task #128 admin-profile-client modals + combine-bill backend stubs

**⚠️ Pending ภูม manual actions (carried over · ยัง):**
1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972` leaked วันที่แรก)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply

**🗺 Branch state (post-push · 2026-05-26 ค่ำ):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม wave 20 ยังไม่ merge) |
| `Poom-pacred` | `22d5e37` | **active · all Wave 20 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `22d5e37` | ✅ in sync with Poom-pacred 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-26-night.md         # canonical resume
pnpm dev   # port 3000 (if not running)
# Then: pick option A/B/C/D from above
```

---

# 🚨 2026-05-25 ค่ำ — WAVE 15 + 16 + 17 ALL DONE · read FIRST (supersedes 2026-05-24 below)

ภูม **mega-session วันนี้ · 18 commits บน `Poom-pacred`** (16:00 → 23:30). ภูม catch ผม audit ผิวเกินไป (compared HTML paste only · missed 2 huge pages) → dispatched 4+3+3 parallel agents ในชุดต่างๆ. ผลลัพธ์: 5 P0 + 3 P0 follow-ups + UX fix + 3 P1 + close-out · **~7,200 LOC** ลง production-ready Cargo flow.

**📦 18 commits today (16:00 → 23:30):**
- **Wave 15** — 3 P0 fidelity fixes (wallet balance summary · yuan 60d filter · forwarders ยอดค้างชำระ)
- **Wave 16 prep** — `docs/audit/cargo-flow-deep-audit-2026-05-25.md` (44 legacy PHP vs ~70 Pacred · 47 gaps) + new `AGENTS.md §0b` rule + `docs/learnings/audit-discipline.md`
- **Wave 16 P0 (5)** — `/admin/report-cnt/[fNo]` per-container detail (1601 LOC) · `/admin/forwarder-check` bulk-bill (1572) · inline cost-edit modal · stub cleanup · barcode schema-split
- **Wave 16 follow-ups (3)** — **8,886 profiles UUIDs provisioned** (LINE+email channels enabled) · internal cost-update tab (no Sheets) · dual-mode cost-rate modal (CBM+Weight all carriers)
- **Wave 17 ux-fix** — report-cnt inline checkbox + modal + "ทำรายการเบิกเงินค่าตู้" wording (legacy used "เบิก" in cnt-hs.php · our "บันทึก" was wrong)
- **Wave 17 P1 (3)** — MOMO + CN manual entry · api-sheets quartet (CTT/Sang/MK/MX) · barcode AJAX writer (auto-flips fStatus=4 when fi2Amount >= fAmount)
- **Close-out** — wired deferred LINE in `actions/admin/forwarders.ts:538` (Agent A side-finding)

**🟢 Browser-test queue (~30 min next session):**
1. `/admin/report-cnt?page=succeed` — ติ๊กตู้ + เปิด modal เบิกเงิน
2. `/admin/report-cnt/<fNo>` — drill-down + cost-edit + cost-update tab
3. `/admin/forwarder-check` — 3 tabs + bulk-bill
4. `/admin/api-forwarder-momo/manual` + `/admin/api-forwarder-cn/manual`
5. `/admin/api-sheets-sang` (live preview ค่าขนส่ง · Sang's PCSE rule)
6. `/admin/barcode/driver/import` — USB scanner · auto-flip status

**🟡 Phase C — Defer:** JMF/GOGO API · real Sheets API (`check-sang-cost`) · MOMO/CN/JMF cron jobs · standalone `forwarder-driver` · MOMO Sack API · CargoCenter `containerReport` (legacy ยังไม่เคยทำ).

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-25-night.md`](docs/research/poom-save-point-2026-05-25-night.md) — canonical resume (Wave 15 done + Wave 16 plan + branch state + resume commands)
2. 📋 [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](docs/audit/cargo-flow-deep-audit-2026-05-25.md) — Wave 16 gap report (44 legacy PHP vs ~70 Pacred) · P0/P1/P2 prioritized
3. 🛠 [`docs/learnings/audit-discipline.md`](docs/learnings/audit-discipline.md) — **NEW** the lesson from today (audit from PHP source, not HTML paste)
4. 🧭 [`AGENTS.md`](AGENTS.md) §0b — **NEW** rule: deep-audit-from-source protocol
5. 📝 [`docs/research/poom-save-point-2026-05-24-night.md`](docs/research/poom-save-point-2026-05-24-night.md) — Wave 14 context

**⚠️ ภูม manual actions pending (carried over · ยัง):**
1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972` leaked วันแรก)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

**🗺 Branch state map (post-fetch · 2026-05-25 ค่ำ):**

| Branch | HEAD | vs main | vs Poom-pacred | สถานะ |
|---|---|---|---|---|
| `main` | `9d8467b` | — | -127 | production · ปอน frontend landed |
| `Poom-pacred` | `152add3` (Wave 15) | +127 | — | **active · ภูม admin port** |
| `dave-pacred` | `26cf183` | +40 | +12, -99 | **active · เดฟ customer port** |
| `dave` | (frozen) | (old V3) | — | FROZEN per 2026-05-19 pivot |
| `podeng` | `9d8467b` | (= main) | — | merged into main |
| `faithful-port` | `e8a0ba0` | — | — | customer 12/24 transcription |
| Our worktree (`claude/adoring-chandrasekhar-0f8ad7`) | `152add3` | (= Poom-pacred) | 0/0 | ✅ in sync |

**dave-pacred has 12 commits Poom-pacred doesn't** = customer-side D1 (cart end-to-end · OTP TTL · PromptPay QR fix). **ไม่ต้อง merge** — parallel lanes per `docs/runbook/faithful-port-plan.md`.

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-25-night.md         # canonical resume
# Then: browser-test 7 surfaces above OR start Phase C (JMF/GOGO/cron)
```

---

# 🌙 2026-05-24 EVENING — WAVE 14 COMPLETE (read FIRST · supersedes 2026-05-22 below)

ภูม session ที่บ้านวันนี้. **1 new commit** บน `Poom-pacred` (`d287992`).
พักก่อน · พรุ่งนี้ว่ากันใหม่.

**📦 What landed tonight (Wave 14 · 3 parallel streams):**
- **Agent D** — Wave 12-C ภาค 2: forwarder edit dimensions (4 files · ~860 LOC ·
  `actions/admin/forwarders-edit.ts` + `[fNo]/edit/{page,edit-form}.tsx` +
  detail page entry button). Pure Tailwind UI per §0a — admin กรอก weight/CBM/
  crate AFTER goods arrive China warehouse.
- **Agent B** — Fidelity audit: `docs/audit/fidelity-gap-2026-05-24.md` (282 LOC ·
  **47 gaps** documented: 18 🔴 workflow · 22 🟠 polish · 7 🟢 keep). Top 3 P0
  ranked with file paths + LOC estimates.
- **Me (orchestration)** — 10 routes smoke + 3 Chrome screenshots verified
  brand-red theme + Wave 12-D inline edit + Wave 12-C v2 form. **Phantom
  discovered:** Phase A migration `tb_priceuser_*` ไม่เคยมี · Wave 9 ภูมิรู้แล้ว ·
  ของจริง `tb_rate_vip_*` + `tb_hs_rate_custom_*` ทั้งหมดบน prod แล้ว.

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-24-night.md`](docs/research/poom-save-point-2026-05-24-night.md) — canonical resume (1-commit summary · top 3 P0 queue · 6 decision options)
2. 📋 [`docs/audit/fidelity-gap-2026-05-24.md`](docs/audit/fidelity-gap-2026-05-24.md) — 47-gap inventory with line citations to legacy PHP
3. 📝 [`docs/research/poom-save-point-2026-05-23-night.md`](docs/research/poom-save-point-2026-05-23-night.md) — yesterday's context (Wave 9-13 details)

**⚠️ Pending ภูม manual actions (carried over):**
1. 🔴 ROTATE S3 access key (security · `e913d7da34ca0089638f100afb74c972` leaked)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` via Supabase dashboard
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

**Top pickup ลำดับแนะนำ:** D (5 นาที cleanup) → B (yuan date filter, 30 นาที)
→ A (Top 3 P0, 3 ชม). หรือเลือก option อื่นจาก 6 ตัวเลือกใน save-point §"พรุ่งนี้ตัดสิน".

---

# 🚨 2026-05-22 EVENING — WAVE 7.3 + WAVE 8 COMPLETE (read FIRST · supersedes 2026-05-20 below)

ภูม ran tonight's session at the home computer. **4 new commits**
land on `Poom-pacred` (`245e206..01fdebc`). Machine change tonight
(home → work tomorrow).

**📦 What landed tonight (19 surfaces · ~3,800 LOC):**
- **Wave 7.3** (`11ebcbc`) — wired the last 12 orphan admin pages
  into sidebar (`ระบบ` + `เครื่องมือ` Settings groups) + 4 page
  top-menubars (cargo/forwarders/wallet/reports). Closes the
  re-audit-2026-05-21-night 🔴 DEAD list.
- **Wave 8 Group A** (`9fccdd2`) — 3 bulk-approve bars on `tb_*` schema:
  wallet · yuan · customer-pending. Browser-verified on PROD data
  (1,470 wallet pending rows show checkbox each).
- **Wave 8 Group B+C** (`01fdebc`) — admin manual entry forms (wallet/add
  + yuan/new + customers/transfer-rep) + reports SQL rewrites
  (sales-by-rep · user-sales-history × 2) + Postgres view
  `vw_sales_by_rep` (migration 0094).

**⚠️ ภูม manual steps before next session:**
1. Apply migration `supabase/migrations/0094_view_sales_by_rep.sql` via
   Supabase dashboard (idempotent · `create or replace view`).
2. Browser-test the 4 new Wave 8 surfaces with small entries on PROD.
3. Re-install Claude for Chrome extension on the work computer.

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-22-night.md`](docs/research/poom-save-point-2026-05-22-night.md) — the canonical resume doc (commit list · env state · pending actions · resume commands)
2. 📋 [`docs/audit/page-inventory-2026-05-21-night.md`](docs/audit/page-inventory-2026-05-21-night.md) — page-by-page checklist (Wave 7.3 rows now all ✅)
3. 🛠 [`docs/audit/re-audit-2026-05-21-night.md`](docs/audit/re-audit-2026-05-21-night.md) — P0/P1/P2 list (P0 + P1 + most-P2 closed by Wave 7.3+8)

**Top next pickup:** Phase A migration backlog (`tb_priceuser_*`
unblock rates pages · 2-3 ชม · ภูม+ก๊อต).

---

# 🚨 2026-05-20 EVENING — PHASE 1 PUSH (read FIRST · supersedes 2026-05-19 below)

ภูม ran a 12-hour Phase 1 push tonight. 8 commits land on `Poom-pacred`
(`b584c22..90c1dbe` + this save-point commit). Customers tapping in from
running ads — the sprint is "rip the band-aid before they hit the rough edges".

**🔥 Env change:** Pacred is now **Supabase prod only** —
`https://yzljakczhwrpbxflnmco.supabase.co` (ก๊อต took dev project for
other work · Pro plan upgraded). `.env.local` updated locally (gitignored
so backup at `.env.local.dev-backup-2026-05-20`). **Resume on a new
machine → manually update `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY` per the save-point doc.**

**📦 What landed today:** Wave 1 (faithful port of `report-cnt.php` +
11-button audit menu + 9 audit queues + spine list tombstoned) · Wave 2
(8 barcode routes faithful-ported · gateway routing · `tb_cnt` cnt-payment
flow · 3 audit queues wired with `tb_header_order` + 41-ZIP free-shipping
list · 8 spine scan routes deleted) · Wave 3 (Quagga2 installed ·
DataTables-Responsive added · iOS auto-zoom fixed on register · 4 audits
landed: fidelity / mobile / pcs-complete-analysis / pcs-admin-roles /
pcs-business-flow). Spine retirement migration `0090` written but DEFERRED
(14 cargo_* consumers still need cleanup · Wave 4).

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-20-night.md`](docs/research/poom-save-point-2026-05-20-night.md) — the canonical resume doc (env-change steps · 8-commit summary · open questions · resume commands)
2. 📋 [`docs/audit/pcs-master-synthesis-2026-05-20.md`](docs/audit/pcs-master-synthesis-2026-05-20.md) — P0/P1/P2 action list from 5 audits (6 P0 items remain · ~14-21 ชม)
3. 🛠 [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md) — Option A locked · Wave 2 done · Wave 3 partial · Wave 4 backlog
4. 🧰 [`docs/audit/fidelity-2026-05-20.md`](docs/audit/fidelity-2026-05-20.md) — element-by-element diff of 7 admin screens vs legacy

**🚨 Top P0 for next session:** rewrite `/admin/forwarders` to read
`tb_forwarder` (currently reads the REBUILT `forwarders` table — staff
will read wrong status to customers). 4-6 ชม.

**Critical discovery — newrealdatapcs:** ภูม pointed at
`C:\Users\Admin\Downloads\newrealdatapcs\` as พี่เดฟ's "real latest"
PCS Cargo update. The PHP code there is BYTE-IDENTICAL to our existing
snapshot (16,184 files · 0 hash diffs). The real value = พี่เดฟ's 5
markdown analysis docs at `N'POOM - PCS LEARNNING/` (6,826L combined),
which we've digested into the 4 audits above.

---

# 🚨 2026-05-19 EVENING — DIRECTION SHIFT

The team pivoted from V3 (the `main → dave → Poom` loop where Wave A/B/R1
sidebar-fidelity work shipped this morning) to a **literal 1:1 transcription**
of legacy PHP → Next.js per the owner's "100% sameness FIRST" rule.

**New branch loop:**
- **`Poom-pacred`** (ภูม · admin transcription · 187 `pcs-admin/*.php` files)
- **`dave-pacred`** (เดฟ · customer transcription + integrates)
- **`podeng`** (ปอน · customer-portal frontend)
- → **`faithful-port`** (integration target · เดฟ-owned)
- → ก๊อต production gate → **`main`** (Vercel auto-deploy)

V3 branches (`Poom`, `dave`) are **FROZEN** — preserved + already merged into
`faithful-port`, so today's morning work isn't lost — but no new commits land
there until further notice.

**Method:** 1:1 transcription · same HTML markup · same SQL · `PCS → PR` branding
only · zero design decisions. Legacy source on ภูม's machine at
`C:\Users\Admin\pcscargo\` (187 admin + 42 customer-portal `.php` files).

**Status (2026-05-19 night):** register/login fix shipped to `main` · customer
portal **7/~24** screens transcribed 1:1 on `dave-pacred` (`menu`→dashboard ·
china-address · account-settings · search · wallet · addresses · cart) · admin
pilot done (`admin-table`→`/admin/admins`) · Bootstrap-4 + jQuery + FontAwesome
vendor JS being staged for 1:1 interactivity. Full status + the 4-person
work-split → [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md).

**Authoritative SOTs (read in order):**
1. 🚨 [`docs/research/poom-save-point-2026-05-19-night.md`](docs/research/poom-save-point-2026-05-19-night.md) — the direction-shift save-point · branch state · per-role lanes · PCS→PR table · resume commands
2. 📋 [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md) — the plan · branch model · 4-person work-split · status · cross-cutting infra
3. 🛠 [`docs/runbook/faithful-port-transcription.md`](docs/runbook/faithful-port-transcription.md) — the canonical method · 1:1 transcription steps + admin pattern §8
4. 🧰 [`.claude/skills/legacy-php-sweep/SKILL.md`](.claude/skills/legacy-php-sweep/SKILL.md) — supporting skill
5. 🗺 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — Phase A data load (the `tb_*` table inventory)

**Pattern references (read before transcribing your first screen):**
- Customer pilot: `app/[locale]/(protected)/dashboard/page.tsx` + `public/legacy/pcs/menu.css`
- Admin pilot: `app/[locale]/(admin)/admin/admins/page.tsx` + `public/legacy/pcs/admin/admin-base.css`

The D1 phase doc + per-role briefs below are still authoritative for company
context · the SHIFT only changes the **work-loop** and the **method**, not the
goal. Goal stays: faithful PCS Cargo port · zero retraining · D1.

---

# 🧬 Pacred DNA (load-bearing — read once, internalise forever)

**Company:** บริษัท แพคเรด (ประเทศไทย) จำกัด · **Pacred (Thailand) Co., Ltd.** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner **พี่ป๊อป Visit** (second-tier: เดฟ + ก๊อต).

**Scope:** ecosystem ของ import-export-customs-cargo-logistics (เคลียร์ศุลกากร · นำเข้า-ส่งออก · ขนส่งระหว่างประเทศ + ในประเทศ · ฝากสั่งซื้อ-ฝากโอน-ฝากขาย · ใบกำกับภาษี · ใบขนสินค้า · ขอคืนภาษี · ฟูมิเกชัน · แมสเซ็นเจอร์ · "และอื่นๆ ทั้งวงการ"). Markets ลำดับ: ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเล → อินโด → เมกา → อื่นๆ.

**Vision:** ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว. Full-loop service ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover ที่อื่น.

**Brand-split context (DON'T preempt cleanup):** Pacred = บริษัทใหม่ กำลังแยกจาก **PCS CARGO + TTP + ไอแต้ม**. บาง API ยัง "ยืม" เจ้าเก่าใช้ — ลบ reference เหล่านี้ **หลัง** ก๊อต confirm API switchover เสร็จ (ไม่ใช่ก่อน). Tracked in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

📋 **Full SOT:** [`docs/pacred-info.md`](docs/pacred-info.md) — addresses, phones, emails (7 depts), LINE OA, social, sales reps, JSON-LD code consumers
🧠 **Memory:** `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories)

---

# 🧭 CURRENT DIRECTION — D1: Pacred is a faithful port of PCS Cargo (2026-05-18)

**The direction changed on 2026-05-18.** The owner (พี่ป๊อป) reviewed the rebuilt-from-scratch Pacred app and **rejected it** — neither the UI nor the workflow logic-loop matches the legacy **PCS Cargo** system that staff and **~8,898 existing customers** use every day. Rebuilding fresh would force everyone to retrain.

**New direction (decision "D1"):** Pacred **becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** Not a reinterpretation; a faithful port. The canonical source of truth is **[ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)** — read it in full before any D1 work. It supersedes the "V2 = rebuilt owner-pleaser" framing of [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md).

**⚠️ Owner mandate (2026-05-19, verbatim):** *"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the original to **100% sameness FIRST**, then improve. The owner scolded the team on 2026-05-19 for screens still diverging from legacy PCS. Faithful first; improvements are Phase C only. Every Phase-B port runs through the `legacy-fidelity-check` skill.

**Three phases:**
- **Phase A — Data migration. ✅ DONE.** Ported the legacy `pcsc_main` (117 tables, ~8,898 customers, years of orders) into Pacred's PostgreSQL/Supabase. `PCS<n>` → `PR<n>` keeping the exact running number; custom auth so customers sign in with their existing password (no reset). *Status: Supabase **Pro upgrade done** (ก๊อต) · **all 117 tables loaded on dev + prod**, incl. the 3 log tables `tb_web_hs`/`tb_history_key`/`tb_history` backfilled post-Pro · **customer image + storage files uploaded to Supabase S3 prod** (`pcsracgo/public/member`) by ภูม 2026-05-24 · migrations `0081`-`0083`+`0087` on `main`.* Runbook: [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal + admin back-office — so its menus, job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy PCS system exactly**. Goal: staff + customers need *zero* retraining. *Status: **wave 1 done + integrated on `dave`** (customer 9-icon launchpad · order flow · admin per-role RBAC sidebar + badges · admin container `tb_cnt` payment ledger · legacy-auth bridge) — first-pass, not yet fidelity-verified. Waves 2+ in progress.*
- **Phase C — Pacred enhancements.** *Only after* the faithful port works, layer Pacred's own improvements on top. **Deferred — not cancelled.**

**What this means for prior work:**
- The launched rebuilt app (2026-05-17 production deploy) and its `profiles` + launch-era schema **coexist** with the ported `tb_*` schema during the transition, then retire.
- The **Tier 0/1/2/3 capability roadmap** and the **Phase-2 build queue** (booking flow · customer-intelligence · internal-chat · disbursement · china-ops · platform-observability) are **deferred to Phase C — not cancelled**, re-sequenced *after* the faithful port. [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) is the **D1 master phase plan** (current state · stages · work-lanes); its Phase-C appendix + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) describe that deferred work.
- In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1) **pauses**; the team pivots to Phase A/B.

**Decision lens (every task):** does this make the port **more faithful to PCS Cargo** — closer to *zero retraining* for staff and customers? Prefer work that moves Phase A (data migration) or Phase B (workflow fidelity) forward. De-prioritise anything that extends the rejected rebuild or belongs to the deferred Phase-C enhancements.

**Anti-patterns (under D1):**
- Extending the rejected rebuilt app or building Phase-C enhancements before the faithful port works
- Reinterpreting / "improving" the PCS workflow during Phase B — fidelity first; enhancements are Phase C
- V3 architecture redesign in this repo (V3 = `pacred-DPX`, separate repo — append ideas to `docs/v3-wishlist.md`)
- Shipping a stage before the quality gate is green (`pnpm verify` + build smoke + a functional pass)
- Scrub PCS/TTP/ไอแต้ม **before** ก๊อต API switchover (would break the revenue path)

---

# 🛑 STOP — Read your role brief FIRST (force-read every Claude Code session)

ทุก dev ใช้ Claude Code ทำงาน async บน worktree ของตัวเอง. ก่อนแตะ code หรือตอบคำถาม — **เปิด brief ของคุณก่อน**:

| ถ้าคุณคือ… | เปิดไฟล์นี้ก่อนทุกอย่าง | คุณจะรู้ทันที |
|---|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`docs/briefs/got.md`](docs/briefs/got.md) | P0/P1, ADRs ที่ต้อง lock, partner/tools picks |
| **เดฟ** (Project Lead / Integrator) | [`docs/briefs/dave.md`](docs/briefs/dave.md) | landing pivot, backend prep for ภูม, hardening |
| **ภูม** (Backend / Customer Portal / Admin) | [`docs/briefs/poom.md`](docs/briefs/poom.md) | container model, tax invoice, admin workflows |
| **ปอน** (Frontend / Landing / SEO / Marketing) | [`docs/briefs/podeng.md`](docs/briefs/podeng.md) | owner critiques, L-5 polish, SEO research |

📂 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map + onboarding flow + brief shape
📋 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (admin UI / RBAC system design)

**Why force-read?** แต่ละ brief สรุปว่า:
- คุณ own อะไร / ห้ามแตะอะไร (scope boundaries)
- งานต่อไปลำดับไหน (priority list — ไม่ต้อง re-derive จาก PORT_PLAN ทุกครั้ง)
- ติดอะไรอยู่ → ทำอะไรแทน (blockers + alternatives)
- Hand-off เข้า/ออก คุยกับใคร

อ่าน brief ก่อน → conversation รอบนี้ตรงเป้าตั้งแต่ tool call แรก. ข้าม brief = หลงเดิน.

---

# 👉 START HERE — ทีมงานทุกคน อ่านก่อนเริ่ม

📘 **[`docs/HANDBOOK.md`](docs/HANDBOOK.md)** = entry point — มี documentation map + quick start

**Canonical docs (อ่านครั้งเดียว ใช้ตลอด):**
- 👥 [`docs/team.md`](docs/team.md) — roles + permissions + branch + merge policy + daily workflow + §3.0 push-frequency cost rule (STRICTER — save-points only) + §6 self-directed mode + §9 Claude Code async collab
- 📐 [`docs/conventions.md`](docs/conventions.md) — code style + commit format + naming + DB rules + §13 docs rules (every .md ≤ 2000 lines · no duplication) + §14 pre-deploy smoke gate
- 🔐 [`docs/env.md`](docs/env.md) — every env var explained + production checklist (incl. §19 MOMO JMF)
- 🏢 [`docs/pacred-info.md`](docs/pacred-info.md) — company info SOT (addresses + phones + emails + LINE OA + sales reps)

**Role briefs (force-read — see top of file):**
- 🧑‍💻 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map for which brief is yours
- [`docs/briefs/got.md`](docs/briefs/got.md) · [`docs/briefs/dave.md`](docs/briefs/dave.md) · [`docs/briefs/poom.md`](docs/briefs/poom.md) · [`docs/briefs/podeng.md`](docs/briefs/podeng.md)
- 👷 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (system design input)

**🎯 Master strategy (single-read consolidation — all briefs + ADRs + plans condensed):**
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session, refer back as needed

**🛠 Skills kit (playbooks the agent follows when triggered):**
- [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md) — 16 skills: phase-verify-loop · bug-swarm-loop · debug-mantra · management-talk · audit-kpi-dashboard · test-coverage-writer · refactor-readability · performance-hunter · scholar-immortal · copyist-unlimited · legacy-php-sweep · qa-flow-simulator · branch-integrate-loop · mobile-first-verify · legacy-fidelity-check · landing-conversion-audit

**📚 Learnings (compounding knowledge — read before re-debugging):**
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — every agent / dev adds new entries via `scholar-immortal` skill

**Living docs (เดฟ updates):**
- 🧭 [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) — **THE current direction (D1)** — faithful PCS Cargo port, Phase A/B/C. Start here for "what's next".
- 🚀 [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — **the D1 master phase plan** — current state + the stages (A-final → B-0 → B-waves → C) + the work-lanes. The canonical "what's next" sequencing doc; deferred Phase-C/Tier detail kept as a labelled appendix.
- 🚚 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — **Phase A runbook ✅ DONE** — the `pcsc_main` (117 tables) → Supabase data migration; all 117 tables loaded on dev + prod (incl. 3 log tables backfilled post-Pro), customer images on S3 prod.
- 📋 [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) — sprint history + cargo/gap-hunt backlogs (Parts O–W; Part V = cargo-forensics, Part W = gap-hunt; ~1825 lines — watch the 2000-line cap)
- 📚 [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) — historic survey (Parts A–N — moved out to keep PORT_PLAN under 2000-line agent ceiling)
- 🏗 [`docs/architecture.md`](docs/architecture.md) — system diagrams + DB schema + auth + security
- 🏗 [`docs/architecture/container-centric-model.md`](docs/architecture/container-centric-model.md) — **NEW** warehouse/container/shipment spine (4 tables, RLS, status enums, CT-1..CT-8 implementation)
- 🤝 [`docs/integrations/momo-jmf.md`](docs/integrations/momo-jmf.md) — MOMO partner API spec (JWT, endpoint inventory TBD)
- 🧠 [`docs/PACRED-SECOND-BRAIN.md`](docs/PACRED-SECOND-BRAIN.md) — context notes + gotchas

**Reference (open เมื่อจำเป็น):**
- [`AGENTS.md`](AGENTS.md) — Next 16 breaking changes (สำหรับ Claude/AI)
- [`docs/decisions/*.md`](docs/decisions/) — ADRs (incl. 0010 V2/V3 version strategy, 0006 tax invoice, 0007 analytics, 0014 state transitions, 0015 withholding tax, 0016 freight value model)
- [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) — **NEW** LINE chat audit (จุดรั่ว + MOMO status enum canonical + workflows team really uses)
- [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) — **NEW** PHP cleanup sweep (~115 dead-code files + 6 NEW critical security findings + 5 minor port gaps)
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) — **NEW** decoded cargo/freight ops model (GZE truck / GZS sea · A/M/X/O/Z types · Form E / D-O / invoice-value engineering) + ไอแต้ม-chat problem catalog → PORT_PLAN Part V
- 🆕 [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) — capability synthesis (growth / operating-system / build-vs-buy) → the Tier 0/1/2/3 roadmap. **Deferred to Phase C by D1** ([ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)) — not the current "what's next".
- 🆕 [`docs/research/PACRED-MASTER-STRATEGY.md`](docs/research/PACRED-MASTER-STRATEGY.md) — **chained gap-hunt synthesis** — rolls the 5 source-code gap docs ([`docs/research/`](docs/research/_index.md)) into 4 problems: a 🔴 P0 security keystone (`driver`/`warehouse` RLS reach all money tables — fix launch-week), the 🔴 wallet-leak chain, the "islands with no bridges" flow-wiring workstream, and **[PORT_PLAN Part W](docs/PORT_PLAN.md)** backlog
- [`docs/audit/owasp-2026-05.md`](docs/audit/owasp-2026-05.md) — pre-launch security posture (note: superseded on RLS-vs-role-model by the master strategy §1)
- [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) — deep legacy PHP integrations audit (companion to legacy-cleanup-2026-05-16)
- [`docs/runbook/*.md`](docs/runbook/) — operational runbooks (PCS scrub + OTP rotation + cron + cargo smoke test T-D1)
- [`docs/setup/*.md`](docs/setup/) — onboarding guides (OAuth/Supabase/Vercel/LINE)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration runbook

**ทำงานครั้งแรก:**
1. **เปิด YOUR brief จาก [`docs/briefs/`](docs/briefs/)** ก่อนทุกอย่าง (force-read — see top of file)
2. อ่าน [`docs/HANDBOOK.md`](docs/HANDBOOK.md) → [`docs/team.md`](docs/team.md) → [`docs/conventions.md`](docs/conventions.md)
3. `cp .env.example .env.local` + fill values (ถามเดฟ) — รายละเอียดทุก var ใน [`docs/env.md`](docs/env.md)
4. รัน migration ที่ยังไม่ได้รัน — ดู [`supabase/migrations/README.md`](supabase/migrations/README.md)
5. หางานของตัวเอง: brief ของคุณ + [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) §"Work-split" (current per-role D1 work)
6. Sync branch ตามวิธีใน [`docs/team.md`](docs/team.md) §3 (น้อง pull จาก `dave` ไม่ใช่ `main`!) + §3.0 push-frequency rule (save-points only — sleep / machine change / location change / big batch done; per memory `push_frequency_strict`)

---

# Project Snapshot — pacred-web

Last updated: 2026-05-19 (D1 — Phase A data loaded to dev + prod · Phase B wave-1 integrated — see [ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md) + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md))

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + customer member portal + admin back-office. The rebuilt app launched 2026-05-17, but on **2026-05-18 the owner redirected the project (D1)** — Pacred is now a **faithful port of the legacy PCS Cargo system** (`PCS` → `PR`). Current work: **Phase A ✅ DONE** (legacy `pcsc_main` fully loaded to prod Supabase — all 117 tables incl. 3 log tables backfilled post-Pro · customer images on S3 prod) → **Phase B in progress** (workflow fidelity — wave 1 integrated on `dave-pacred`, 1:1 transcription continues on customer + admin lanes — wave-17+ work also accumulating on `Poom-pacred` for V3 features). See the "CURRENT DIRECTION — D1" section at the top of this file + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) for the full phase plan.

> 🎯 **Live state** — ดูที่ [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The "Auth & Backend State" section below and STRATEGY.md §9 describe the **rebuilt** app — that work is preserved + coexists with the ported `tb_*` schema during the D1 transition, but the rebuilt schema/workflow is no longer the target; the legacy PCS workflow is. Phase B reworks the app to match it.

## Stack
- Next.js **16.2.6** (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน [app/globals.css](app/globals.css) — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- **next-intl** ^4.11.1 — i18n (th/en) แบบ namespace ใน [messages/](messages/)
- **lucide-react** ^1.14.0 — icons (Lucide outline-style ทั้งโปรเจกต์)
- Package manager: **pnpm**

> หมายเหตุ: middleware อยู่ที่ [proxy.ts](proxy.ts) (ไม่ใช่ `middleware.ts` — เป็นรูปแบบของ Next 16)

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions

📐 Full convention rules → [`docs/conventions.md`](docs/conventions.md) (CANONICAL — code style + commit format + naming + DB rules + §13 docs rules ≤2000 lines · no duplication + §14 pre-deploy smoke gate).

**Hot tips you'll trip on:**
- Path alias `@/*` → `./*`; locale prefix `as-needed`; default locale TH; `Link` from `@/i18n/navigation` (NOT `next/link`)
- Tailwind v4 → `@theme inline` in [`app/globals.css`](app/globals.css) (no `tailwind.config.js`); brand red = `primary-600` (#B30000)
- Component split: section-level → [`components/sections/`](components/sections/); reusable UI → [`components/ui/`](components/ui/); default Server Component unless state needed
- i18n: TH+EN parity in [`messages/th.json`](messages/th.json) + [`messages/en.json`](messages/en.json); `pnpm audit:i18n` enforces

## Folder Structure

📁 **Live tree** is the authoritative source — `ls app/[locale]/` to see actual routes. High-level shape:

- `app/[locale]/(public)/` — marketing site + landing pages (no auth)
- `app/[locale]/(auth)/` — login/register/forgot — guests only; auto-redirect signed-in to `/`
- `app/[locale]/(protected)/` — customer portal (dashboard / orders / wallet / shipments / etc.) — `requireAuth()` gate
- `app/[locale]/(admin)/admin/*` — admin back-office — `requireAdmin()` gate per [ADR-0002](docs/decisions/0002-admin-architecture.md)
- `actions/` — Server Actions (`actions/auth.ts`, `actions/wallet.ts`, etc.); admin variants in `actions/admin/*`
- `lib/` — `supabase/{client,server,admin}.ts` · `auth/*` · `sms/gateway.ts` · `notifications/*` · `validators/*` (Zod) · `pdf/*` · `forwarder/calc-price.ts`
- `supabase/migrations/` — 0001..0087 numbered migrations (`0065` is an intentional unused gap; `0081`-`0083` = the D1 legacy `tb_*` schema/indexes/member-seq, applied to dev + prod; `0087` = a migration-view security fix — see [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) §9; next free number `0088`); see [`supabase/migrations/README.md`](supabase/migrations/README.md)
- `proxy.ts` (NOT `middleware.ts` — Next 16 rename) at repo root

## Auth & Backend State (rebuilt app — coexists during the D1 transition)

> ⚠️ **D1 note:** this section describes the **rebuilt** app's auth/backend (Phase 1-5 pre-D1). Under D1 it **coexists** with the ported legacy `tb_*` schema and the legacy-auth bridge (`lib/auth/pcs-legacy-bridge.ts` — migrated PCS customers sign in with their existing password, no reset) during the transition, then retires. Phase-B work reworks these surfaces onto the `tb_*` schema.

### What works
- **Supabase Auth** — email/phone + password. Social login (Google/Facebook OAuth + LINE) is gated OFF by default behind `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` → the buttons render greyed-out "COMING SOON" (legacy PCS was password-only; D1 defers social login to Phase C)
- **Legacy-auth bridge** — `lib/auth/pcs-legacy-password.ts` + `pcs-legacy-bridge.ts` — migrated PCS customers sign in with their **existing** PCS password (no reset) via a "เชื่อมต่อบัญชี PCS CARGO" login; the 79-char legacy hash is verified against the ported `tb_users.userpass`
- **DB** — profiles (auto-gen `PR001` member_code — PR + min-3-digit running no.), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live + current state

📊 **Live state snapshot** is in [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The lists below were Phase 1-5 historic — **current state lives in STRATEGY.md §9, not here**.

Shipped + in production: customer portal (`/service-order` · `/service-import` · `/service-payment` · `/wallet` +deposit/+history/+withdraw · `/refunds` · `/sales` · `/notifications` · `/shipments` +[code]) · `/admin/*` (60+ routes incl. accounting/container-costs · disbursements · refunds · migration/pcs-customers · search · system/crons · system/notifications) · tax-invoice flow · pay-from-wallet self-serve · customer credit line · staff RBAC console. **Post-launch U1/U2/U4 + Tier 0/1/2 features shipped on `dave`** — incl. `/contact` lead funnel · `/start-order` + `QuoteCTA` buy-bridge · `/admin/kpi` exec dashboard · `/admin/board` + `/admin/inbox` work-board. See STRATEGY.md §9 + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md).

## Architecture & Roadmap

📐 **Blueprint:** [`docs/architecture.md`](docs/architecture.md) — full diagrams, DB schema, auth flows, security model.

🎯 **Master strategy (single-read consolidation):** [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session.

📋 **Locked decisions (ADRs):** [`docs/decisions/`](docs/decisions/) — 17 ADRs + drafts. The high-leverage ones:
- **ADR-0017 — D1: Pacred = faithful PCS Cargo port** (the current direction — supersedes the "V2 = rebuilt owner-pleaser" framing of ADR-0010)
- ADR-0001 LINE Notify → Messaging API push (creds set; LIFF pending DV-2)
- ADR-0002 admin architecture (`is_admin()` SECURITY DEFINER + `admins` table)
- ADR-0003 China-search Option E (Track G code, prod=demo mode)
- ADR-0004 PromptPay-only pre-beta; Omise/2C2P/Stripe = post-beta ([decision matrix](docs/decisions/d7-payment-gateway-decision-matrix.md) ready)
- ADR-0006 tax invoice (RD Code 86)
- ADR-0007 GTM + Clarity + cookie A/B
- ADR-0010 V2 vs V3 (`pacred-dpx`) — note: the "V2 = rebuilt owner-pleaser" definition is superseded by ADR-0017 (V2 is now the faithful PCS port); V3 unaffected
- ADR-0014 customer self-service state transitions (admin-client-after-ownership-verify)
- ADR-0015/0016 ✅ Accepted 2026-05-16 (WHT model + freight value model)
- ADR-0011/0012/0013 (DRAFT — V3 RBAC granular + ERP shell + V2→V3 migration; deferred T+30d)

🌱 **Infra stack:** Vercel + Supabase Cloud · `proxy.ts` middleware · ThaiBulkSMS OTP (`OTP_BYPASS` flag) · `member_code` = `PR001` running — **PR + minimum 3 digits**, overflow-safe past PR999 (Postgres trigger `generate_member_code`, migration `0060`; **NO compat with PHP `PCS<num>`** — Pacred is new company).

---

# 🌐 Pacred Ecosystem (brand + service catalogue)

> **Pacred** = บริษัทใหม่ (ไม่ใช่ PCS Cargo เดิม) — เป็น **all-in-one shipping/customs/cargo platform** ที่กินรวบทุกบริการในห่วงโซ่นำเข้า-ส่งออก
>
> ระบบ PHP เก่าครอบคลุมเฉพาะฝั่ง **Cargo** (จีน-ไทย ฝากสั่ง/ฝากนำเข้า/ฝากโอน) เท่านั้น — Pacred ขยายไปฝั่ง **Freight** (FCL/LCL ระหว่างประเทศ + customs/clearance/export) ครบทั้ง ecosystem

## Brand & social channels
- **Company:** Pacred
- **LINE OA:** https://lin.ee/Yg3fU0I  *(แทน LINE Notify เดิม — LINE Notify EOL Apr 2025)*
- **YouTube:** https://www.youtube.com/@PacredShipping
- **Facebook:** https://www.facebook.com/PacredShippingCustomsClearanceImportExport/
- **TikTok:** https://www.tiktok.com/@pacred.co
- **Instagram:** https://www.instagram.com/pacred.co/

## Service catalogue

แต่ละบริการมี **landing page ของตัวเอง** ที่ `/services/<slug>` (public, ไม่ต้อง login) — กดจาก landing เพื่อ "ใช้บริการ" → redirect เข้าระบบหลังบ้าน (`/(protected)/...`) ที่ตรงกับ service นั้น

| # | Service (TH) | slug | กลุ่ม | สถานะ in PHP เดิม | Backend module (Next.js) |
|---|---|---|---|---|---|
| 1 | จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ (YY) | `customs-broker-matching` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 2 | ฝากสั่งซื้อสินค้า (China shopping cart) | `shop-order` | cargo | ✅ shops.php / cart.php | `(protected)/service-order/` |
| 3 | ฝากโอนชำระสินค้า (Yuan transfer / Alipay) | `yuan-transfer` | cargo | ✅ payment.php | `(protected)/service-payment/` |
| 4 | ฝากนำเข้าสินค้า — **FCL / LCL ทุกเทอม** (รถ/เรือ/แอร์) + **Cargo** (รถ/เรือ/แอร์) | `import` | both | 🟡 เฉพาะ cargo (forwarder.php) | `(protected)/service-import/` (รองรับ multi-mode) |
| 5 | ขอคืนภาษี (Tax refund) | `tax-refund` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 6 | เคลียร์สินค้าติดด่าน (รถ/เรือ/แอร์) | `customs-clearance` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 7 | ออกใบกำกับภาษี (Tax invoice) | `tax-invoice` | freight | partial (admin only ใน PHP) | TBD (ต่อยอดจาก receipts) |
| 8 | ออกใบขนสินค้า (Customs declaration form) | `shipping-document` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 9 | ส่งออกสินค้า (Export) | `export` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 10 | บริการฟูมิเกชัน (Fumigation) | `fumigation` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 11 | บริการฝากขายสินค้า (Consignment) | `consignment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 12 | บริการฝากจ่ายบริการ (Pay-on-behalf services) | `bill-payment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 13 | ขนส่งภายในประเทศ + ต่างประเทศ + แมสเซ็นเจอร์ (Logistics + Messenger) | `logistics` | both | ❌ ใหม่ทั้งหมด | TBD |

**กลุ่ม:**
- 🟦 **cargo** = ระบบเดิมจาก PHP `pcs-cargo` (จีน→ไทย, ฝากสั่ง/นำเข้า/โอน)
- 🟧 **freight** = ส่วนขยายใหม่ของ Pacred (international FCL/LCL, customs broker, export)
- 🟪 **both** = บริการที่ครอบคลุมทั้งสองฝั่ง
- ⬜ **new** = ฟีเจอร์ใหม่ที่ไม่เคยมีในเครือเดิม

## Routing convention (planned)

```
app/[locale]/(public)/
├─ page.tsx                       # home (มีแล้ว)
└─ services/
   ├─ page.tsx                    # ภาพรวมทุกบริการ (service grid)
   └─ [slug]/page.tsx             # landing แต่ละบริการ (dynamic, content จาก CMS หรือ MDX)

app/[locale]/(protected)/         # หลังบ้าน (ลูกค้า)
├─ service-order/                 # = slug shop-order
├─ service-payment/               # = slug yuan-transfer
├─ service-import/                # = slug import (รองรับ FCL/LCL/Cargo modes)
└─ ... (modules ใหม่ตาม service catalogue)
```

**หมายเหตุ:** อาจใช้ MDX-per-service หรือ Sanity/Payload CMS ถ้า marketing ต้องแก้ landing บ่อย — ตัดสินใจตอนเริ่ม Phase H (rebrand)

---

# 👥 Team & Branch workflow

> ⚠️ **CANONICAL doc moved to [`docs/team.md`](docs/team.md)** — full role/branch/merge policy + daily workflow + safety rules
> ห้าม duplicate รายละเอียดที่นี่ — อ่านที่ `docs/team.md` ครั้งเดียว ที่เดียว

**TL;DR:**

| คน | บทบาท | Branch | Push to main |
|---|---|---|---|
| **ก๊อต** | Senior Advisor | (review only) | ✅ |
| **เดฟ** | Project Lead | `dave` | ✅ |
| **ปอน** | Frontend & SEO | `podeng` | ❌ (own branch) |
| **ภูม** | Backend & Cargo Port | `Poom` | ❌ (own branch) |

**Daily sync (every morning):**
```bash
git checkout main && git pull origin main
git checkout <my-branch> && git merge main && git push origin <my-branch>
```

**Conflict / safety:** อย่าใช้ `--force` / `reset --hard` ถ้าไม่แน่ใจ — full safety rules ใน [`docs/team.md`](docs/team.md) §5

---

## Working with this codebase

### Add a section to home
- New component in [components/sections/](components/sections/)
- Import in [app/[locale]/(public)/page.tsx](app/[locale]/(public)/page.tsx)

### Add a new feature/system (pattern)
1. SQL: add table + RLS in `supabase/migrations/NNNN_<name>.sql`
2. Validator: Zod schema in `lib/validators/<name>.ts`
3. Server Action: mutations in `actions/<name>.ts` (`"use server"`)
4. Pages: under `app/[locale]/(protected)/<name>/` (auth-guarded)
5. i18n: add keys in [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) namespace
6. (optional) Realtime: subscribe via `supabase.channel(...)` in `"use client"` component

→ See [actions/orders.ts](actions/orders.ts) + [app/[locale]/(protected)/orders/](app/[locale]/(protected)/orders/) as a working reference

### Common edits
- Locale string → both `messages/th.json` + `messages/en.json`
- Theme color → `@theme inline` in [app/globals.css](app/globals.css)
- Auth check on a page → `await requireAuth()` from `lib/auth/require-auth.ts`
- Get current user → `await getCurrentUserWithProfile()` from `lib/auth/get-user.ts`
- Mutate Supabase from Server Action → `await createClient()` from `lib/supabase/server.ts`
- Bypass RLS (admin only) → `createAdminClient()` from `lib/supabase/admin.ts`

---

# 📋 Legacy PHP Port Plan (in progress)

> **Goal:** Port ทั้งระบบ PHP เดิม (`/Users/dev/Desktop/pcscargo/member/` บน Mac · `C:\xampp\htdocs\pcscargo\member\` บน Windows) มาเป็น Next.js + Supabase
> **Strategy:** เอา **logic + structure** มาก่อน ไม่ต้อง migrate data → ค่อย rebrand UI/UX + จัดกลุ่มใหม่ในเฟสถัดไป
> **Order:** ฝั่งลูกค้าก่อน (member portal) → ฝั่ง admin (back office)
>
> ⚠️ **Scope reminder:** PHP เดิมครอบทั้ง **cargo** (services #2, #3, #4-cargo-mode) **+ freight** (ใน `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, withdraw-commission-*}`) — services อื่น (`#1, #5-13`) ต้อง **build ใหม่ทั้งหมด** ในเฟสถัดไป (Phase I+)
>
> 🆕 **AUTHORITATIVE gap status (2026-05-16 night):** [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) — เดฟ-led 4-agent deep-sweep against 20,331 .php files + verification pass. Found **17 NEW DB tables** + **12 freight subdirs** + **24 admin polish items** that the prior `legacy-cleanup-2026-05-16` audit §6 missed. The deep-sweep audit replaces §6 "should-port" assessment; tables below remain useful as **customer-side / admin-side historical reference** but for current Sunday-night blockers + V2 long-phase backlog **read the deep-sweep doc + [PORT_PLAN Part V](docs/PORT_PLAN.md) V-E6..V-E12 / V-G / V-H**.

## Survey snapshot (สำรวจแล้ว 2026-05-12; updated 2026-05-16 deep-sweep)

- **PHP source:** `/Users/dev/Desktop/pcscargo/member/` (Mac) · `C:\xampp\htdocs\pcscargo\member\` (Windows) — 20,331 .php files / 2.2 GB
- **DB:** MySQL `pcsc_main` (110+ tables; full schema in legacy SQL dumps)
- **member_code เดิม:** `PCS<int>` (PHP) — **ทิ้งไม่ใช้**; Pacred ใช้ `PR001` running (PR + ขั้นต่ำ 3 หลัก)
- **Stack PHP:** mysqli plain SQL, mPDF (THSarabunNew), PHPMailer, Bootstrap 4

## Customer-side / Admin-side feature maps + migration concerns + integrations

**Authoritative live docs (read these, not duplicates below):**

| What you need | Where it lives |
|---|---|
| Per-feature port status + tasks | [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (most active) + archive Parts A-N |
| Master gap audit (20k file sweep) | [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) |
| Deep integrations + secrets inventory | [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) (TAMIT, JMF, LINE Notify, SMS, OAuth, mPDF) |
| Dead-code + security findings (S-1..S-6) | [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) §1-5 (§6 superseded by deep-sweep) |
| Cargo ops decoded (GZE/GZS / A-M-X-O-Z / Form E / D-O / "แผน VAT") | [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) |
| Chat-derived workflows (W-1..W-9) + leak holes (L-1..L-10) | [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) |
| Cutover dependency burn-down (F1-1..F1-8) | [`docs/runbook/legacy-cutover-tracker.md`](docs/runbook/legacy-cutover-tracker.md) |
| Per-task implementation specs (V-D / V-E / V-G / etc.) | [`docs/port-specs/`](docs/port-specs/) — 10 spec docs |
| Per-task ADR decisions | [`docs/decisions/`](docs/decisions/) — 16 ADRs + 5 plans/matrices |

## Phased roadmap

> **Historic Phase A-I list moved to:** [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (live) + [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) (Phase A-N historic).
>
> **Current state (2026-05-16):** Phase A-F ✅ shipped · Phase G admin back-office ~98% HR + ~50% ops + 60+ routes shipped · Phase H polish ongoing · Phase I expansion = V2 long-phase post-Monday-launch ([port-specs/](docs/port-specs/) for V-E6..V-E12 freight stack + V-G admin polish).

## Key references (อย่าลืม consult)

- **PHP source:** `/Users/dev/Desktop/pcscargo/` (Mac) · `C:\xampp\htdocs\pcscargo\` (Windows)
- **Admin source:** `<root>/member/pcs-admin/` (187 entry .php + 85 business-logic subdirs under `include/pages/`)
- **Helper catalogue:** `<root>/member/include/function.php` (2451 LOC) + `<root>/member/pcs-admin/include/function.php` (3500 LOC)
- **Schema dump:** legacy SQL dumps (see `docs/audit/legacy-cleanup-2026-05-16.md` §7)
- **Use legacy-php-sweep skill** (`.claude/skills/legacy-php-sweep/SKILL.md`) when porting any feature
