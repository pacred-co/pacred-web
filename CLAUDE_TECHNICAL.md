# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
pnpm dev          # start dev server (uses ipv4first DNS — important)
pnpm build        # production build
pnpm start        # serve production build locally
pnpm lint         # ESLint (flat config, eslint.config.mjs)
pnpm typecheck    # tsc via scripts/tsc-check.mjs
pnpm test         # full test suite (unit + integration — some need .env.local)
pnpm test:unit    # unit-only tests (no DB required)
pnpm verify       # lint + typecheck + test:unit + audit:all  ← run before every push

# Run a single test file
tsx lib/forwarder/calc-price.test.ts
tsx --env-file=.env.local lib/wallet/ledger.test.ts   # DB-connected tests need env

# Audit scripts
pnpm audit:md     # check markdown link integrity
pnpm audit:i18n   # verify TH/EN translation parity
pnpm audit:env    # verify all env vars documented
```

Tests use `tsx` directly — there is no Jest or Vitest. Integration tests need
`.env.local` (pass via `--env-file`). `pnpm test:unit` skips all DB tests.

---

## Architecture

### Next.js 16 breaking changes

- **Middleware lives at `proxy.ts`**, not `middleware.ts` — this is a Next.js 16
  rename. Don't create `middleware.ts`.
- Dynamic pages that use cookies/auth must have `export const dynamic = "force-dynamic"` 
  to avoid `DYNAMIC_SERVER_USAGE` 500 errors in production.
- `"use server"` files reject ALL non-async-function value exports (including
  `export const someSchema = z.object(...)` — move schemas to a separate file).

### Route groups

```
app/[locale]/
  (public)/      — landing pages, no auth
  (auth)/        — login/register/forgot, requireGuest() gate
  (protected)/   — customer portal, requireAuth() gate
  (admin)/admin/ — admin back-office, requireAdmin() gate
  liff/          — LINE LIFF entry points
  complete-profile/  — mid-signup profile completion
```

Locale: TH/EN, `localePrefix: "as-needed"`, default TH, detection disabled.
Use `Link` from `@/i18n/navigation`, not `next/link`.

### Supabase clients — three variants, never mix

| File | When to use |
|---|---|
| `lib/supabase/client.ts` | `"use client"` components only — anon key |
| `lib/supabase/server.ts` | Server Components, Server Actions, API routes — uses cookies |
| `lib/supabase/admin.ts` | Service-role key — bypasses RLS — server-only |

Always destructure `error`: `const { data, error } = await supabase.from(...)`.
Silent `data=null` on a transient DB timeout will `notFound()` the user otherwise.

### Auth guards

```ts
// In Server Components / layouts / pages
await requireAuth()               // redirects to /login if not signed in
await requireAuth({ allowIncomplete: true })  // allow mid-signup users
await requireGuest()              // redirects to / if already signed in
const { user, roles } = await requireAdmin()          // any admin role
const { user } = await requireAdmin(["accounting"])   // specific role
```

`proxy.ts` also provides an edge-level `/admin` backstop — it redirects
unauthenticated requests before the layout runs.

### Server Actions pattern

```ts
"use server"
import { requireAuth } from "@/lib/auth/require-auth"

export async function myAction(input: unknown) {
  const { user } = await requireAuth()
  const parsed = MySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error }
  // ...
}
```

Actions live in `actions/` (customer-facing) and `actions/admin/` (admin).

### DB schema — two coexisting worlds

This is a **D1 faithful port** of the legacy PCS Cargo PHP system. Two schema
families coexist during the transition:

- **`tb_*` tables** — the ported legacy schema (8,898 customers, real data).
  Primary source for all customer portal + admin back-office reads.
  Key tables: `tb_users`, `tb_forwarder`, `tb_cnt`, `tb_header_order`,
  `tb_payment`, `tb_wallet`, `tb_wallet_hs`, `tb_admin`, `tb_co`.
- **Rebuilt tables** — `profiles`, `orders`, `forwarders` (Pacred-native schema).
  These coexist but are mostly empty in production; new features use `tb_*`.

When a stat card shows ฿0 or 0 rows, check which table the query hits —
the rebuilt tables were never backfilled. Use `tb_*` for any live data.

### Legacy auth bridge

Migrated PCS customers sign in with their existing PCS password (no reset needed).
`lib/auth/pcs-legacy-bridge.ts` + `lib/auth/pcs-legacy-password.ts` handle
the SHA1-based legacy hash verification. New Pacred accounts use Supabase Auth normally.

### Styling

- Tailwind v4: `@theme inline` in `app/globals.css` — **no `tailwind.config.js`**.
- Brand red = `primary-600` (#B30000). Full scale in `app/globals.css`.
- Font: Prompt (Thai-capable sans-serif).
- Dark mode: custom `ThemeProvider` in `components/theme-provider.tsx` (not `next-themes` — replaced to avoid React 19 warnings). Always-light on first load; in-session toggle via `useTheme()`.
- Overflow: use `overflow-x: clip` on root (not `hidden`) — `hidden` breaks `sticky`.

### i18n

```ts
// Message keys live in messages/th.json + messages/en.json (parity required)
// In Server Components:
import { getTranslations } from "next-intl/server"
const t = await getTranslations("Namespace")

// In Client Components:
import { useTranslations } from "next-intl"
const t = useTranslations("Namespace")
```

`pnpm audit:i18n` enforces TH/EN parity — run after adding any keys.

### Company constants

All phone numbers, addresses, emails, LINE OA, social links → import from
`components/seo/site.ts`. Never hardcode company info in components.

### Customer portal layout (protected)

The `(protected)` layout faithfully reproduces the legacy PCS Cargo shell:
Bootstrap-4 + jQuery vendor JS staged under `public/legacy/pcs/assets/`.
This is intentional (D1 "100% sameness first"). Do not remove the legacy
vendor scripts — they power the interactive sidebar and mobile chrome.

### Admin roles

Admin roles are checked via `requireAdmin(["role"])`. Roles include:
`super`, `accounting`, `sales`, `qa`, `warehouse`, `driver`, `freight_sales`,
`freight_export`, and others. `super` can access Phase-2/3/4 routes;
other roles are gated at the edge in `proxy.ts` via `isPhase2PlusRoute()`.

### PromptPay QR

All PromptPay QR generation goes through `lib/promptpay.ts` — the single
source of truth. Never import `promptpay-qr` or `qrcode` directly.

```ts
import { buildPromptPayPayload, buildPromptPayQrDataUrl } from "@/lib/promptpay"

const payload = buildPromptPayPayload(amountThb)          // EMVCo string
const dataUrl = await buildPromptPayQrDataUrl(amountThb)  // base64 PNG
```

The PromptPay ID is read from `process.env.PROMPTPAY_ID` inside `lib/promptpay.ts`.

### Protected layout chrome (`lib/legacy/pcs-chrome.ts`)

The sidebar/header badge counts (wallet, cart, forwarder counts, etc.) are
loaded by `loadPcsChromeData(memberCode)` — wrapped in `unstable_cache` with
a 60-second TTL keyed on `memberCode`. On cache hit the layout returns in
single-digit milliseconds; on miss it runs ~17 parallel Supabase queries.
Use `revalidateTag("pcs-chrome")` in Server Actions that mutate wallet/cart/
forwarder counts so badges refresh immediately.

### Legacy jQuery inline scripts

The `(protected)` layout loads jQuery via a single concatenated
`<Script strategy="afterInteractive">` loader. Any page-level inline script
that uses `$` also runs `afterInteractive` and races jQuery — the small script
often wins and hits `$ is not defined`.

**Pattern — always poll instead of assuming `$` is ready:**

```ts
<Script
  strategy="afterInteractive"
  dangerouslySetInnerHTML={{
    __html: `
      (function waitForJQuery() {
        if (typeof window.$ !== 'undefined' && typeof window.$.fn.modal !== 'undefined') {
          window.$("#my-modal").modal("show");
        } else {
          setTimeout(waitForJQuery, 50);
        }
      })();
    `,
  }}
/>
```

### HTML nesting gotchas

- `<p>` cannot contain block-level elements (`<div>`, `<section>`, etc.) — causes
  React hydration mismatch. Use `<div>` with the same class instead.
- `<img src="">` triggers a full page re-download warning. Use `src={undefined}`
  to omit the attribute entirely when the value is empty.
- Querying an integer Supabase column with a string value (`""`, `"PCS"`) causes
  a PostgreSQL type error. Guard before `.eq("intCol", val)`:
  `if (val && val !== "PCS") { /* query */ }`

---

## Key file locations

| What | Where |
|---|---|
| Middleware | `proxy.ts` (root) |
| i18n routing config | `i18n/routing.ts` |
| Tailwind theme | `app/globals.css` |
| Auth guards | `lib/auth/require-auth.ts`, `lib/auth/require-admin.ts` |
| Supabase clients | `lib/supabase/{client,server,admin}.ts` |
| Company constants | `components/seo/site.ts` |
| Legacy auth bridge | `lib/auth/pcs-legacy-bridge.ts` |
| Admin phase gate | `lib/admin/phase-access.ts` |
| DB migrations | `supabase/migrations/` — through 0182 applied prod **+ dev** (0065 + 0168 are intentional gaps; 0177 = business_config peak.gl_accounts seed, 0178 = tb_forwarder.import_duty_pct/thb, 0179 = tb_order/tb_forwarder_item declared_currency/fx_rate/amount_ccy + customs.fx_rates seed, 0180 = hs_codes.form_e_duty_pct/other_forms/hs_note, 0181 = tb_order/tb_forwarder_item.hs_stat_code + hs_codes.default_stat_code (รหัสสถิติ), 0182 = data rename coID/coid 'PCS'→'PR' on tb_co/tb_rate_g_kg/tb_rate_g_cbm/tb_users/tb_register (applied prod 2026-06-12 · tb_users 8,742→PR · all PCS=0), 0183 = 4 partial-UNIQUE indexes closing create-side double-pay (tb_cnt_item."fCabinetNumber" · tb_user_sales.idf · tb_user_sales_pay.idus · tb_forwarder_tran_th_sub.fid · applied prod+dev 2026-06-14), 0184 = staff_share_pr_pool (generate_member_code() mints a PR for staff too from the SHARED customer pool — removes the 0174 employee_code skip · collision-proof via advisory-lock + cross-table lowest-vacant + UNIQUE · applied prod+dev 2026-06-15 · 16 prod staff backfilled · 0 dup), 0185 = header_order_arrived_china_status (hstatus varchar(1)→(2) for the new "ถึงโกดังจีน" status '40' · view-safe DROP+ALTER+RECREATE around the dependent view vw_sales_by_rep · applied prod+dev 2026-06-16), **0186 = ⚠️ DRAFT · NOT APPLIED** (ภูม reference-only business_config `pricing.cbm_sell_model`: ค่าเทียบ=250 · เรือ 2900/รถ 4900 · cargo kg floor 11 · flags the 0139 `pricing.min_sell_floor` semantic conflict [there 2900/4900 = per-warehouse FLOOR +เรือ 300; here = per-mode SELL] — **SUPERSEDED by `lib/forwarder/doc-tier-discount.ts`** (the ฿800/CBM doc-tier discount = 3700−800/5700−800); kept as reference, `pending:true`, no consumer), 0187 = forwarder_custom_comparison (per-order ค่าเทียบ override · tb_forwarder.custom_comparison/_value · **applied prod+dev 2026-06-18**), 0188 = forwarder_doc_tier_confirmed (per-order doc-tier-discount ติ๊กยืนยัน = the C1 ฝากโอน signal · boolean DEFAULT false · **applied prod+dev 2026-06-18** — PROD-applied this session BEFORE integrating Poom-pacred per the ledger warning · all 3 cols verified live). 0186's inert `pricing.cbm_sell_model` reference row was also seeded prod+dev by the 0183-0186 idempotent reconcile (pending:true · no consumer · harmless). 0189 = container_summary_fstatus · 0190 = report_cnt_exclude_cancelled · 0191 = count_distinct_cabinets_action_pay · 0192 = cbm_precision_6dp (tb_forwarder.fvolume + item cbm → numeric(14,6) · applied prod+dev 2026-06-18) · 0193 = admin_role_ultra (god role 'ultra' "Ultra Admin Z" in admins_role_check · super loses cost/profit/commission VISIBILITY via canViewCostProfit→{ultra,accounting,pricing}; ultra inherits super via isGodRole · **applied prod+dev** · 8 staff moved super→ultra incl. both พี่ป๊อป · ⚠️ 2026-06-19 swept ~16 raw role checks that were missing ultra incl. the `.in("role")` DB-filter class) · 0194 = seed_momo_cost_2500 (MOMO ฮุย-ไท่ต๋า actual cost = 2,500/CBM, was 2,900 sea/4,500 road · tb_settings · **applied prod+dev 2026-06-19**) · 0195 = taem_container_etd_eta (ภูม 2026-06-20 · per-container ETD/ETA sink keyed by container_no, fed from the แต้ม/iTAM packing-list reconcile · report-cnt reads it แต้ม-primary/MOMO-fallback · **applied prod+dev 2026-06-20** — เดฟ applied prod at integration close · isolated additive table · no FK · RLS · idempotent · verified live 0 rows), **0196 = widen_order_money_cols** (ปอน draft → เดฟ extended to FULL chain · **applied prod+dev 2026-06-20**) — numeric(10,2)→(14,2) on EVERY accumulating money total/amount across order→pay→receipt→cnt→wallet→credit→forwarder (tb_header_order/tb_order/tb_payment/tb_receipt/tb_cnt."cntAmount"/tb_wallet/tb_wallet_hs/tb_credit/tb_forwarder/tb_forwarder_item) so a >100M order can flow end-to-end with no narrow sink (was capped ~100M). LEFT (10,2) on purpose: FX rates (hrate/hratecost/payrate/*refrate/customrate*) · per-unit cprice · weights/dims. DROP+recreate vw_sales_by_rep around the ALTERs (0185 pattern · it SUMs the widened cols). §0e sink-audit verified 0 narrow sinks remain + rates left narrow + view queryable (prod 3 rows). Code cap MONEY_COL_MAX bumped 99_999_999.99→999_999_999_999.99 in actions/cart.ts + actions/admin/cart.ts. 0197 = profiles_admin_login_id (owner 2026-06-21 · separate the staff login-id from email · `profiles.admin_login_id` unique partial idx · backfilled from the synthetic admin_*@pacred.co.th email · auth key admin_<login_id>@pacred.co.th in auth.users UNCHANGED · **applied prod+dev**). 0198 = slip_two_round_review (A4 owner 2026-06-21 · `reviewed_at`+`reviewed_by_admin_id` on tb_wallet_hs + tb_payment · the approve refuses to settle until round-1 stamped reviewed_at · same admin OK · **applied prod+dev**). 0199-0218 = RBAC tiers/positions/declared-img + CMS (incl. **0205 cms_articles_seo** = cms_articles.meta_title/meta_description · recovered+applied prod 2026-06-29 · was UI-only/DB-missing). 0219 = cms_our_work_case [ปอน · renamed from a 0213 collision]. 0223 = tb_header_order.pricecrate (crate price · ค่าตีลังไม้ · editable + อิงตาม MOMO raw.wooden_create). 0224 = hs_codes seed (124 พิกัดจริงจาก Doc-team chats · hs_codes 133 rows prod · `hs_note` carries เลี่ยงพิกัด/license intelligence). 0225 = hs_consult_ticket (HS-consult queue `/admin/accounting/hs-consult` · ส่งรูป→Doc ตอบพิกัด+อากร+ฟอร์มอี ก่อนออเดอร์ · grows the HS library). 0226 = taem_packing_line (iTAM/แต้ม packing-list ingest · REFERENCE table · 127 rows/10 ตู้ prod · feeds **`/admin/api-forwarder-momo/drift`** = the **฿294k MOMO-API-drop recovery queue** · MOMO API ทิ้งของ 30-40% ตั้งแต่ 16/06 → 110/127 tracking หาย + 11 ฿0-weight → apply ผ่าน reconcile เดิม audited). 0227 = article_stats [ปอน]. 0228 = wechat_ops_message (**WeChat 4.0 decrypt · 24,428 ข้อความ ops จีน → DB** · search `/admin/wechat-ops` · live PC client db_storage SQLCipher key จาก Weixin.exe memory). 0229 = billing_run_slip (ภูม · tb_forwarder_invoice slip_path/uploaded_by/at/status · เซลแนบสลิป→บัญชีตรวจ+ตัดจ่าย · display/workflow only). 0230 = forwarder_exception (G7 · tb_forwarder fexception_type[not_mine/damaged/container_returned/customs_held/wrong_pr/other]/note/photo/status/at/by + partial idx · flag+queue `/admin/forwarders/exceptions` · NO money/ownership mutation). 0231 = billing_run_slip_multi_2round (ภูม · tb_forwarder_invoice slip_paths jsonb[] + slip_reviewed_at/by · หลายสลิป + ตรวจ 2 รอบ เหมือน wallet). All applied prod+dev (0229-0231 · 2026-06-30). 0232 = service_catalog (เดฟ · the platform SCALE foundation · service_catalog table + 8 live service seed [shop_order/yuan_transfer/import_cargo/freight_import/freight_export/customs_clearance/tax_documents/domestic_logistics] + service_key/fcl_lcl/direction cols on tb_header_order/tb_forwarder/tb_payment/freight_shipments · backfill tagged prod 166 rows · feeds `/admin/dashboard/services` + the workspace · lib/services/service-catalog.ts SOT). 0233 = freight_shipment_journey (เดฟ W4 freight activation · journey_status + issue_flag + 14 milestone date cols + freight_shipment_status_log on freight_shipments [0-row · zero-risk] · the per-flavour 38-code journey · lib/freight/journey-catalog.ts SOT + 8-role transition matrix). 0234 = shop_all_shops_arrival_gate (ภูม · renamed from a 0232 collision · DB trigger advance_shop_order_on_forwarder_arrival gates shop-order →5/→40 on ALL shops arriving · status-only · composes with app-level maybe-complete-shop-order). 0235 = shop_order_3stage_rederive (เดฟ · owner P22328 · CREATE OR REPLACE the trigger to make ฝากสั่งซื้อ multi-ร้าน status a PURE FUNCTION of arrivals: ยังไม่ครบถึงโกดังจีน→'4' รอร้านจีนจัดส่ง · ทุกแทรคถึงโกดังจีน[fstatus≥2]→'40' · ทุกแทรคได้เลขตู้[fcabinetnumber OR fstatus≥4]→'5' สำเร็จ · ALLOWS 40→4 · never touches 5/6 in the LIVE trigger · status-only no money · backfill scripts/recompute-shop-order-status-2026-06-30.mjs DEMOTED wrongly-'5' P22314→40/P22326→4/P22328→4). applied prod+dev 2026-06-30. All applied prod+dev (0232-0235 · 2026-06-30). 0267 = momo_invoice_line (เดฟ 2026-07-21 · APPEND-ONLY provenance ของใบ MOMO ราย tracking → powers cabinet-billing coverage ครบ/ขาด "ตู้นี้ MOMO บิลครบยัง" · no-FK §0e · UNIQUE(invoice_no,ftrackingchn) · **applied PROD · DEV paused ค้างพร้อม 0263/0264**). 0274 = wallet_payment_group_atomic (เดฟ+Codex 2026-07-23 · MONEY · **DRAFT — NOT APPLIED prod/dev yet**: tb_wallet_hs payment_group_id/idempotency_key/frozen satang quote + submit/approve/reject RPCs [service-role only · advisory-lock idempotent · all-or-none] + wallet_payment_receipt_outbox [durable receipt intent · CAS claim · retry-safe] + pending-only unique (userid,reforder) [status='1' ONLY — prod has legit settled twins: PR215/52328 เก็บเพิ่ม] · ⚠️ DEPLOY ORDER: apply to prod BEFORE merging codex→main — the wallet detail/queue SELECT the new columns and customer submit calls the RPC). **next free = 0275** (⚠️ header list above is stale for 0236-0266 — always `ls supabase/migrations | tail` to confirm). ⚠️ 0232 collided (ภูม service-vs-shop) — always `ls supabase/migrations | tail` to confirm next-free before authoring. Container-code → transport mode SOT = `lib/forwarder/cabinet-transport.ts` (GZS/SEA=เรือ · GZE/EK=รถ · GZA/AIR=อากาศ · EK is ROAD). **DEV-SYNC rule (owner 2026-06-12):** every prod migration ALSO reconciled onto dev `lozntlidlqqzzcaathnm` (DB pass `n61OKDy28QcrB1ZJ`) via `SUPABASE_DB_PASSWORD=… node scripts/reconcile-migrations.mjs --ref lozntlidlqqzzcaathnm --from <N> --to <N>` so dev=prod. |
| PromptPay QR | `lib/promptpay.ts` |
| Protected layout chrome | `lib/legacy/pcs-chrome.ts` |
| Theme provider | `components/theme-provider.tsx` |
