# Faithful Port — legacy PHP → Next.js 1:1 transcription runbook

> **Owner directive (2026-05-19).** The legacy PCS Cargo **customer portal**
> and **admin back-office** must be reproduced **100% identically** — same
> screens, same buttons, same flow, same logic-loop — but in **Next.js**,
> rebranded `PCS` → `PR`. The owner's words: *"1:1, just change the language."*
> This runbook is how the whole team does it.
>
> **Branch:** `faithful-port` (cut from `dave`). ภูม · ปอน · ก๊อต · เดฟ all
> work here — this is the priority workstream.

---

## 1. The rule — TRANSCRIBE, do not reinterpret

Wave-1 built the back-office *"inspired by"* gap-maps and design docs — and it
**diverged** (ภูม's own audit: 73% of admin-sidebar items had problems; เดฟ's
verdict: "พังเละเทะ"). Re-deriving a 20,000-file system from design notes is
the slowest *and* least-faithful path.

**The fix — for every legacy `.php` screen:**

1. Open the legacy `.php` file (+ its `include`s).
2. Reproduce its **exact rendered HTML** (the Bootstrap-4 markup) as a Next.js
   component — same layout, same elements, same labels, same order.
3. Reproduce its **exact SQL** as the matching Supabase `tb_*` query.
4. Change **only** `PCS` → `PR` (branding text + the `PCS<n>` → `PR<n>` member
   codes). Nothing else.

**The legacy `.php` file is the spec. Make zero design decisions.** If the
legacy does something you would design differently — reproduce the legacy way.
Improvements are Phase C, not now.

**CSS handling — the pilot-proven pattern.** A screen's legacy stylesheet is
brought **verbatim** as a static file under `public/legacy/<area>/…css` and
loaded with a plain `<link rel="stylesheet">` from the page — **never
`import`-ed**. The app's Tailwind v4 / PostCSS pipeline rejects verbatim legacy
CSS (it failed on the first screen); a static `public/` file is served
byte-identical and bypasses PostCSS. Scope every legacy rule under one
`.pcs-legacy` wrapper class and override the Tailwind-preflight collisions
inside that scope. Reference — the `menu.php` pilot:
`app/[locale]/(protected)/dashboard/page.tsx` + `public/legacy/pcs/menu.css`.

---

## 2. Source — all local, no blockers

| What | Where |
|---|---|
| Customer portal PHP | `C:\xampp\htdocs\pcscargo\member\*.php` — ~25-30 real screens |
| Admin PHP | `C:\xampp\htdocs\pcscargo\member\pcs-admin\` — **187** entry `.php` + 85 logic subdirs |
| Helper functions | `member\include\function.php` (2451 LOC) · `pcs-admin\include\function.php` (3500 LOC) |
| Full archive + DB dumps + file exports | `C:\Users\Admin\Desktop\newrealdatapcs\` (`pcscargo.rar`, 3× `pcsc_main.sql`, member/backoffice/wordpress exports) |
| Admin UI base | the ThemeForest *"Modern Admin — clean Bootstrap 4 dashboard"* template (extracted in `newrealdatapcs/`) — the legacy admin's visual base |
| Data layer | Supabase `tb_*` tables (Phase A loaded `pcsc_main`). Transcribe each PHP SQL query → the matching `tb_*` query via the service-role admin client. |
| `tb_*` table/column map | [`../research/wave-1-fidelity/_SYNTHESIS.md`](../research/wave-1-fidelity/_SYNTHESIS.md) §7 |
| Status codes ↔ Thai labels | `lib/legacy-status-map.ts` |

**Skip** the dated-backup files (`payment20231213.php`, `20260311wallet.php`,
`forwarderBackUp.php`, …) and pure includes/callbacks — transcribe the real
screens only.

---

## 3. Keep — do NOT rebuild

The **front-end** (marketing / landing), **auth** (register / login), the
**legacy-login bridge** (`lib/auth/pcs-legacy-bridge.ts` — a migrated customer
signs in with their existing PCS password), the **`tb_*` data layer**,
`legacy-status-map.ts`, and the **OTP fix** all stay. The transcribed
back-office plugs in *after* login.

⚠️ Do **not** scrub `PCS` / `TTP` / ไอแต้ม references in the **borrowed-API**
integration code — ก๊อต gates that switchover ([`pcs-scrub-plan.md`](pcs-scrub-plan.md)).
The `PCS→PR` change is **branding + member codes only**.

---

## 4. Per-screen process

1. Invoke the [`legacy-php-sweep`](../../.claude/skills/legacy-php-sweep/SKILL.md) skill.
2. Read the legacy `.php` screen + its `include`s + the helper functions it calls.
3. Build the Next.js route/component — **markup 1:1**, **query 1:1 → `tb_*`**.
4. `PCS` → `PR` (branding + member codes).
5. Compare the rendered result side-by-side with the legacy — it must look the same.
6. `pnpm verify` + `pnpm build` green before committing.

---

## 5. Work-split

| Who | Lane |
|---|---|
| **ปอน** | Customer-portal screens (frontend transcription) |
| **ภูม** | Admin screens (backend-heavy transcription) |
| **ก๊อต** | Fidelity review — each transcribed screen vs the legacy original — + the borrowed-API watch |
| **เดฟ + spawned agents** | Integrate · drive · scale the transcription via parallel worktree agents |

One owner per screen — coordinate via เดฟ before claiming a batch.

---

## 6. Sequence

1. **Pilot** — `menu.php` (the 9-icon customer launchpad) → the proven reference pattern.
2. **Customer portal** — the remaining ~25-30 `member/*.php` screens.
3. **Admin back-office** — the 187 `pcs-admin/*.php` screens.
4. **Phase C** (the Tier 0/1/2/3 roadmap + the 6 owner systems) stays **deferred** per [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md) — resumed only after the faithful port ships.

---

## 7. Why this is the fastest path to the owner's 100%

A literal raw-PHP redeploy would be faithful but the owner wants the Next.js
stack. Within that constraint, **transcription** (copy the PHP's real output)
is far faster *and* far more faithful than the wave-1 reinterpretation —
mechanical, parallelisable across agents + the team, and it reuses the
front-end / auth / data layer already built. The legacy file is the spec, so
there is no divergence to rework.

---

## 8. Admin transcription pattern (pilot: `admin-table.php`)

The admin back-office (`pcs-admin/**`) is a separate visual world from the
customer portal: it uses the ThemeForest *"Modern Admin"* Bootstrap-4
template, NOT the customer red theme. So the admin gets its **own CSS
bundle** under `public/legacy/pcs/admin/` (parallel to the customer
`public/legacy/pcs/*.css`):

- `public/legacy/pcs/admin/admin-base.css` — the BS4 + Modern-Admin chrome
  subset every admin screen uses (grid, card, buttons, badges, tabs, tables,
  spacing, typography, theme colour helpers · ~470 lines · cites the source
  legacy file for every block). Loaded by every admin transcription.
- `public/legacy/pcs/admin/admin-table.css` — page-specific styles for the
  `admin-table.php` default-view (the inline `<style>` block from
  `home.php` L7-63 + the DataTables filter widget chrome). Loaded per-page.
- `public/legacy/pcs/admin/images/` — admin photo assets (defaults to
  `user.jpg`; per-admin pictures backfilled with the Phase A image upload).

Every admin transcription page:
1. Wraps the JSX in `<div className="pcs-legacy">` (non-negotiable — the
   scope-class keeps Bootstrap-4 + Modern-Admin styles from leaking into
   the rest of the Tailwind app + keeps Tailwind preflight from breaking
   the legacy markup).
2. Loads the CSS via `<link rel="stylesheet">` in the page (NOT `import`
   — Tailwind v4 / PostCSS rejects verbatim legacy CSS, the rule da4cd79
   set). Two `<link>`s per admin screen: `admin-base.css` (shared) +
   `<screen>.css` (page-specific).
3. Keeps the Pacred auth chain — `await requireAdmin([roles?])` at the top
   of the async page function (per §3 above). The legacy
   `departmentKey == 'HR' || 'ITDT' || 'CEO'` mutate-gates map onto the V3
   `super` role.
4. Sets `export const dynamic = "force-dynamic"`.
5. Uses `createAdminClient()` for `tb_*` reads (RLS-locked to service_role).

**Sub-page router pattern.** The legacy `admin-table.php` branches on
`?page=`:
| Legacy | Pacred route |
|---|---|
| (default) home view | `app/[locale]/(admin)/admin/admins/page.tsx` |
| `?page=add` | `app/[locale]/(admin)/admin/admins/add/page.tsx` (future pilot) |
| `?page=edit&id=X` | `app/[locale]/(admin)/admin/admins/[id]/edit/page.tsx` (future pilot) |
| `?page=detail&id=X` | `app/[locale]/(admin)/admin/admins/[id]/page.tsx` (future pilot) |
Each sub-view becomes a separate Next.js route segment, transcribed as a
separate pilot. The default-view pilot covers ONLY the list (`home.php`).

**Helper functions.** Legacy admin helpers
(`pcs-admin/include/function.php`) — `nameCompanyType`, `nameAdminType`,
`checkRightsName`, `generateBadgeDepartment`, `generateBadgeSection`,
`diffDateNow`, `checkNULL` — are inlined into the first pilot page that
uses them (verbatim PHP-equivalent TypeScript, with the legacy source
line cited). After a few admin pilots show the same helpers repeated,
lift them into `lib/legacy/admin-helpers.ts`. Don't lift on day 1; let
the duplication earn the abstraction.

**DataTables JS not ported.** The legacy DataTables init
(`home.php` L526-585: sortable headers / export-buttons / per-page length /
fixed header) requires jQuery + DataTables + buttons-html5 + buttons-print
+ jszip + pdfmake + fixedHeader. None are in the Pacred dependency tree.
The pilot renders the table statically (markup keeps the
`.dataTables_wrapper / #myTable / .dt-buttons` classes so the CSS looks
identical at rest) and exposes the legacy URL filters
(`?s=`, `?c=`, `?type=`, `?position=`) as `searchParams`. Functional
sort/filter is a follow-up (likely a small React DataTables shim).
