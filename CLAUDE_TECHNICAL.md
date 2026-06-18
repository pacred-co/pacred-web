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
| DB migrations | `supabase/migrations/` — through 0182 applied prod **+ dev** (0065 + 0168 are intentional gaps; 0177 = business_config peak.gl_accounts seed, 0178 = tb_forwarder.import_duty_pct/thb, 0179 = tb_order/tb_forwarder_item declared_currency/fx_rate/amount_ccy + customs.fx_rates seed, 0180 = hs_codes.form_e_duty_pct/other_forms/hs_note, 0181 = tb_order/tb_forwarder_item.hs_stat_code + hs_codes.default_stat_code (รหัสสถิติ), 0182 = data rename coID/coid 'PCS'→'PR' on tb_co/tb_rate_g_kg/tb_rate_g_cbm/tb_users/tb_register (applied prod 2026-06-12 · tb_users 8,742→PR · all PCS=0), 0183 = 4 partial-UNIQUE indexes closing create-side double-pay (tb_cnt_item."fCabinetNumber" · tb_user_sales.idf · tb_user_sales_pay.idus · tb_forwarder_tran_th_sub.fid · applied prod+dev 2026-06-14), 0184 = staff_share_pr_pool (generate_member_code() mints a PR for staff too from the SHARED customer pool — removes the 0174 employee_code skip · collision-proof via advisory-lock + cross-table lowest-vacant + UNIQUE · applied prod+dev 2026-06-15 · 16 prod staff backfilled · 0 dup), 0185 = header_order_arrived_china_status (hstatus varchar(1)→(2) for the new "ถึงโกดังจีน" status '40' · view-safe DROP+ALTER+RECREATE around the dependent view vw_sales_by_rep · applied prod+dev 2026-06-16), **0186 = ⚠️ DRAFT · NOT APPLIED** (ภูม reference-only business_config `pricing.cbm_sell_model`: ค่าเทียบ=250 · เรือ 2900/รถ 4900 · cargo kg floor 11 · flags the 0139 `pricing.min_sell_floor` semantic conflict [there 2900/4900 = per-warehouse FLOOR +เรือ 300; here = per-mode SELL] — **SUPERSEDED by `lib/forwarder/doc-tier-discount.ts`** (the ฿800/CBM doc-tier discount = 3700−800/5700−800); kept as reference, `pending:true`, no consumer), 0187 = forwarder_custom_comparison (per-order ค่าเทียบ override · tb_forwarder.custom_comparison/_value · **applied prod+dev 2026-06-18**), 0188 = forwarder_doc_tier_confirmed (per-order doc-tier-discount ติ๊กยืนยัน = the C1 ฝากโอน signal · boolean DEFAULT false · **applied prod+dev 2026-06-18** — PROD-applied this session BEFORE integrating Poom-pacred per the ledger warning · all 3 cols verified live). 0186's inert `pricing.cbm_sell_model` reference row was also seeded prod+dev by the 0183-0186 idempotent reconcile (pending:true · no consumer · harmless). 0189 = admin_role_ultra (⚠️ DRAFT · NOT APPLIED — adds god role 'ultra' "Ultra Admin Z" to admins_role_check; companion to the cost/profit lockdown on InwPond007 [super loses cost/profit/commission visibility via canViewCostProfit→{ultra,accounting,pricing}; ultra inherits super via isGodRole]. Apply prod+dev BEFORE granting any role='ultra' — owner held prod 2026-06-18, then move 8 people super→ultra incl. both พี่ป็อป accounts). **next free = 0190**. **DEV-SYNC rule (owner 2026-06-12):** every prod migration ALSO reconciled onto dev `lozntlidlqqzzcaathnm` (DB pass `n61OKDy28QcrB1ZJ`) via `SUPABASE_DB_PASSWORD=… node scripts/reconcile-migrations.mjs --ref lozntlidlqqzzcaathnm --from <N> --to <N>` so dev=prod. |
| PromptPay QR | `lib/promptpay.ts` |
| Protected layout chrome | `lib/legacy/pcs-chrome.ts` |
| Theme provider | `components/theme-provider.tsx` |
