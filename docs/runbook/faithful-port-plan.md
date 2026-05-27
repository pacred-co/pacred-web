# D1 Faithful-Port Plan — production launch (updated 2026-05-24)

> **Owner directive (2026-05-19, refreshed 2026-05-24).** Pacred's customer portal + admin back-office become a **1:1 transcription** of the legacy PCS Cargo PHP system — rebuilt in Next.js, rebranded `PCS` → `PR`, **identical to the original 100%**.
>
> **The 1:1 ports ship to `main` first.** V3 enhancements ([Poom-pacred](#branch-model)) layer on after.
>
> This doc is the plan + branch model + work-split **everyone follows**. The *how* (the transcription method) → [`faithful-port-transcription.md`](faithful-port-transcription.md). The *what's missing* deep audit → [`d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md).

---

## Branch model (updated 2026-05-24 — `faithful-port` deleted · V3 unlocked)

| Branch | Owner | Role | Status |
|---|---|---|---|
| **`main`** | ก๊อต gate | 🚀 **PRODUCTION** — Vercel auto-deploy | 🟢 live |
| **`podeng`** | ปอน | Customer-facing **frontend** + **brand SOT (theme/images/icons)** → merged into `dave-pacred` | 🟢 active |
| **`dave-pacred`** | เดฟ | 1:1 **customer-backend** portal port (`(protected)/*`) + integrates ปอน frontend → merges to `main` | 🟢 active |
| **`Poom-pacred`** | ภูม | **V3 backend primary lane (UNLOCKED 2026-05-24)** — DPX ERP enhancements; merges after 1:1 ships | 🟢 active |
| **`Poom`** | ภูม | **V3 backend secondary lane (UNLOCKED — was frozen)** | 🟢 active |
| **`dave`** | (เดฟ future) | **V3 full-site lane** — activates AFTER `dave-pacred` ships to main; combo with Poom-pacred + podeng | 💤 dormant |

**Flow (post-2026-05-24):**
```
ปอน (podeng)      ─┐
                   ├─► เดฟ merges into dave-pacred → verify → push main (ก๊อต gates)
ก๊อต (admin 1:1) ─┘                                                  ▲
                                                                      │
ภูม (Poom-pacred V3) ── continues V3, merges in after 1:1 ships ─────┘
                                                                      │
(future) เดฟ on dave V3 full ── combo with Poom-pacred + podeng ─────┘
```

**Deleted on 2026-05-24:** `faithful-port` (no longer the integration target — direct-to-main pattern won out during the OTP emergency week) · all `claude/*` remotes (work merged or stale) · `hotfix/auth-unblock` (cherry-picked as `5c6bb8a`).

**Branding (owner directive 2026-05-24):** All theme/images/icons follow **ปอน's `podeng` style** (Tailwind + Pacred red `#B30000` + Prompt + lucide). Customer code = **`PR…`** (e.g. `PR201`). 1:1 ports legacy workflow + markup + SQL — visual treatment rebranded to podeng.

**Customer data + storage:** Already in Supabase S3 production (ภูม uploaded `pcsracgo/public/member` files). DB = `yzljakczhwrpbxflnmco`. Internal table conflict (rebuilt-era vs `tb_*`) is OUR cleanup task — NOT a legacy migration gap.

Everyone opens **their own** branch and works there. Sync daily; never push half-built work to `main`. Spawned worktree agents must `git fetch origin && git reset --hard origin/<your-branch>` before working.

### Audit reports (2026-05-24)
- 🔍 [`d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md) — top-10 gap summary + sprint sequence
- 📑 [`d1-audit-pcscargo-2026-05-24.md`](../research/d1-audit-pcscargo-2026-05-24.md) — exhaustive pcscargo.co.th .php sweep
- 📑 [`d1-audit-backoffice-2026-05-24.md`](../research/d1-audit-backoffice-2026-05-24.md) — backoffice.pcscargo.co.th MVC admin
- 📑 [`d1-audit-pcsseafreight-2026-05-24.md`](../research/d1-audit-pcsseafreight-2026-05-24.md) — pcs-seafreight.com freight (V3 reference)

### Gap ownership map (owner-assigned 2026-05-24)
| # | Gap | Owners |
|---|---|---|
| 1 | Google Sheets sync (CTT/MX/MK/Sang) | เดฟ + ก๊อต + ภูม |
| 2 | JMF / TTP / CN forwarder partner APIs | ก๊อต |
| 3 | LINE Notify per-user OAuth + cron | เดฟ |
| 4 | CargoThai PO sync | เดฟ |
| 5 | TAMIT (Thai ID) verification | เดฟ |
| 6 | MOMO LCL sack tracking | ภูม |
| 7 | Barcode + Excel bulk import | เดฟ |
| 8 | 40+ admin reports | เดฟ + ก๊อต + ภูม |
| 9 | Customer image migration | ✅ ภูม DONE (S3 production) |
| 10 | WP blog/news CMS | เดฟ + ปอน |

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

## Work-split — parallel, no collision (updated 2026-05-24)

| Who | Owns | Branch |
|---|---|---|
| **เดฟ** | Drive the port · 1:1 **customer-backend** portal (`(protected)/*` screens + their Server Actions onto `tb_*`) · cross-cutting infra (vendor JS · legacy-CSS scoping) · integrate ปอน's frontend · merge to main | `dave-pacred` |
| **ก๊อต** | **Admin back-office 1:1 lane** — drives the 187 `pcs-admin/*.php` transcription (now ก๊อต-led, was ภูม pre-2026-05-24) · fidelity review · TAMIT/JMF watch · production-launch gate | (own commits) |
| **ปอน** | **Customer-portal frontend** transcription (coordinate with เดฟ — one owner per screen) · front-end (marketing/landing) in owner's style · **brand-asset swap** | `podeng` |
| **ภูม** | **V3 backend continuation (UNLOCKED 2026-05-24)** — DPX ERP enhancements, wave-17+ admin features; merges *after* 1:1 ships to main | `Poom-pacred` |

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
