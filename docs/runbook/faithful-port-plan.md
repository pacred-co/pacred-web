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
