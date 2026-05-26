# 🧾 Admin tech-debt master inventory — 2026-05-27

> **Generated:** end of Wave 22 session (2026-05-27 ค่ำ)
> **Trigger:** ภูม flagged: *"แกยังไม่คลีนงานครบจริงๆเลยอะ ... ทั้งระบบที่ยังมีบางปุ่มบางฟังก์ชันที่ยังใช้งานไม่ได้ ทั้งหน้าตาระบบบางหน้าที่ยังไม่เข้ากับระบบเรา ... มันต้องใช้งานได้จริงๆสิ"*
> **Method:** 3 audit agents ran in parallel — K (Chrome click-through) · L (UI Bootstrap vs Tailwind grep) · M (sidebar icons + disbursement)
> **Source reports** (read each for full per-file detail):
> - [`admin-click-through-audit-2026-05-27.md`](admin-click-through-audit-2026-05-27.md) — Agent K · 70 min Chrome MCP · 9 bugs across 16 surfaces · 30+ verified clean
> - [`admin-ui-design-audit-2026-05-27.md`](admin-ui-design-audit-2026-05-27.md) — Agent L · grep ~180 files · 146 Tailwind clean + 15 legacy + 2 broken
> - [`admin-sidebar-and-disbursement-audit-2026-05-27.md`](admin-sidebar-and-disbursement-audit-2026-05-27.md) — Agent M · sidebar config + disbursement chrome consistency
>
> **Already fixed in this session** (5 commits today after the report — see "Closed" section):
> placeholder leak · sidebar icons · 2 dangling-modal pages · shared PacredDialog · PostgREST cross-embed
>
> **Owner mandate:** "เอาคุณภาพ · ใช้งานได้จริงๆ" — no rushing · close the gates before claiming "ระบบมีคุณภาพ".

---

## 🔥 What still needs fixing — by priority

### 🔴 P0 — actively broken, blocks daily admin work or risks bad data

| # | Surface | Symptom | Suspected fix | Est. |
|---|---|---|---|---|
| 1 | `/admin/admins/[uuid]` | 500 (`column tb_admin.adminid does not exist`) — Wave 22 schema swap missed the detail page | Rewrite to query `admins JOIN profiles JOIN admin_contact_extras` like the list page | M (~1-2h) |
| 2 | `/admin/admins` list — 9 of 13 legacy admins not visible | Agent K saw only 4 native rows post-PGRST200 fix. Re-verify after ภูม recreates the 13 through `/admin/admins/new` (Wave 22 Phase 3). If still missing → background `tb_admin.id` errors still firing elsewhere | Likely already resolved by today's PGRST200 fix · need ภูม smoke-test post-recreate | S verify-only |
| 3 | `/admin/customers` red ⊘ "ระงับ" button — INSTANT mutate without confirm | Agent K accidentally suspended PR10899 during audit + reversed. NO ConfirmDialog. Risk: any admin mis-click = customer locked out. | Wrap in `useConfirmDialogs.confirm()` from `components/ui/pacred-dialog` | S (~30min) |
| 4 | `/admin/forwarders/combine-bill` "พิมพ์บิลรวม" 404 + bill # not clickable + "ลบรายการ" href="#" + items column empty (`tb_bill_item query failed`) | Combine-bill is list-only · multiple action paths missing | Wire print route OR banner deferred · scope items column query · build delete confirm | M-L (~2-3h) |
| 5 | `/admin/accounting` menubar — 30+ dropdown links all 404 | Hub renders but EVERY child page (รายรับ/รายจ่าย/quotation/deposit/shop/forwarder-rate × statuses) does not exist | Either build the 30+ child pages OR remove the menubar items + add "ติดต่อ Pacred dev team" placeholder | XL (~1-2 days) — needs ภูม decision: build vs hide |
| 6 | `admins_role_check` constraint = 6 roles only | ภูม diagnostic confirmed migration 0091 not applied — form sends roles 0091 added (qa/sales/freight_*) → rejected | **ภูม apply 0091** (5 sec) — DDL SQL in earlier reply | XS · ภูม manual |

### 🟠 P1 — admin works but UX is misleading / chrome doesn't match system

| # | Surface | Symptom | Suspected fix | Est. |
|---|---|---|---|---|
| 7 | `/admin/withdrawals?kind=X&status=Y` strips params | Shows balance list instead of filtered withdrawals — old route or new page ignores params | Read code + decide route to keep + redirect old paths | S (~45min) |
| 8 | `/admin/yuan-payments/[id]` + `/service-orders/[id]` label "แก้ไข" but READ-ONLY | Wave 7 state · button lies | Change label to "ดู" OR build edit form | XS (label) / L (edit form) |
| 9 | `/admin/cnt-hs` "ข้อมูลเพิ่มเติม" column = hundreds of GZE codes in 1 cell | Layout breaks | Truncate + tooltip OR drilldown drawer | S (~45min) |
| 10 | `/admin/disbursements` 404 + `/admin/hr/employees` 404 (referenced in breadcrumbs / old hub) | Dead routes leaking through chrome | Redirect to current paths OR remove references | XS (~30min) |
| 11 | 9 Bootstrap-chrome pages still legacy (per Agent L) — `cnt-hs` · `service-orders/cart` + `cart/add` · `reports/sales-by-rep` · `reports/user-sales-history` ×2 · `reports/system` · `withdrawal/freight-th` | Visual jarring vs Pacred design | Tailwind-rewrite each (Wave 20 P1-style) | L (1-2h each = ~10-15h total) |
| 12 | `/admin/withdrawal/freight-th` `.pcs-legacy` Bootstrap stub (Agent M called out specifically) | Worst-case chrome bug in disbursement flow | Tailwind rewrite | M (~2h) |
| 13 | 5 disbursement Pacred-style pages roll own `<h1>` header strip (sales-payouts · commissions · shop-payouts · driver-runs · forwarder-sales) | No shared `PageTopMenubar` → drift | Adopt `PageTopMenubar` like /admin/customers · /admin/reports | M (~2-3h consolidation) |
| 14 | Brand-red has 2 shades active (`primary-500` vs `primary-600`) · "Pending" status uses both `amber-50` and `yellow-50` | Theme inconsistency · admin UI looks drift | One-time normalize sweep | S (~1h grep+replace) |
| 15 | PCS Freight `report-shops-profit-pay.php` has NO Pacred equivalent | Wave 21+ missed legacy port · routes to `forwarder-sales` which is different data source | Port the freight-shops-profit report properly | M (~3h) |

### 🟡 P2 — polish, not blocking

| # | Surface | Symptom | Fix | Est. |
|---|---|---|---|---|
| 16 | `/admin/reports` V-G6 analytics cards = 0 | Aggregations unwired since Wave 9-ish | Wire SUM/COUNT RPCs from V-G6 spec | M (~2h) |
| 17 | 4 form-legacy pages (`wallet/add` · `yuan-payments/new` · `customers/transfer-rep` · `forwarders/combine-bill/add`) — Wave 21 deferred · already banner'd in UI | Forms work, Bootstrap fields ugly | Tailwind form-input rewrite | M each |
| 18 | `admin-profile-client.tsx` form internals use 89 `form-control` classes inside Tailwind dialog chrome | Agent L flagged as visual unknown | Visual verify in Chrome · normalize if drift | S (verify+spot-fix) |
| 19 | 13 deliberate-faithful pages (8 barcode + 5 accounting hub) — per AGENTS §0a faithful intent | None | Don't touch | — |

### 🟢 ✅ Closed in this session (5 commits today)

| # | Surface | Fix | Commit |
|---|---|---|---|
| C1 | 9 placeholders leaked พี่ป๊อป's real contact info | Sanitized to generic examples (sales01 / ชื่อจริง / etc.) | `8483ceb` |
| C2 | 4 sidebar icons missing (Banknote/KanbanSquare/Smartphone/Save) — รายการเบิกเงิน parent + 5 sub-items invisible | Added to ICONS map + dev console.warn for next time | `44e2e3d` |
| C3 | `/admin/organization-email` "เพิ่มใหม่" + "คำอธิบายระบบ" buttons rendered but produced no modal (dangling Bootstrap) | Native `<dialog>` via `PacredDialog` + edit modal + confirm-delete | `4c5a62e` |
| C4 | `/admin/barcode/driver/import` "คำอธิบายระบบ" same dangling-Bootstrap issue | Same fix · modal HTML moved from page.tsx into client component | `4c5a62e` |
| C5 | PostgREST `PGRST200` — admins ⇄ admin_contact_extras cross-embed | 4 files rewritten with 3-query JS-merge pattern + learning captured in `supabase-rls-patterns.md` | `61696d3` + `05ce7a8` |
| C6 | Shared `components/ui/pacred-dialog.tsx` extracted from Wave 21 inline helpers | Reusable across admin-profile · organization-email · barcode/driver/import + future modals | `4c5a62e` |

---

## 📊 Effort tally — full P0+P1 sprint estimate

| Phase | Bug count | Estimate | Goal |
|---|---|---|---|
| **Wave 23 batch 1 (P0 critical)** | 6 items | ภูม manual (0091 apply ~5 sec) + dev work ~3-4h | Stop the bleeding — `/admin/admins/[uuid]` works · suspend confirms · accounting menubar honest · combine-bill print decided |
| **Wave 23 batch 2 (P1 misleading/drift)** | 9 items | ~12-18h dev (parallel agents = ~5-7h wallclock) | Pacred design consistent · no chrome lies · 9 Bootstrap pages all Tailwind |
| **Wave 23 batch 3 (P2 polish)** | 4 items | ~6-8h | Forms styled · V-G6 wired · normalize theme |
| **Don't touch** | 13 deliberate-faithful | — | Keep |

---

## 🎯 Suggested execution order

1. **Now / ภูม** — apply migration 0091 (5 sec · unblocks /admin/admins/new for the 22 roles)
2. **Tonight P0 (Wave 23 batch 1)** — 4 dev fixes:
   - a. `/admin/admins/[uuid]` rewrite (mirror page.tsx pattern · Task #150)
   - b. /admin/customers suspend confirm wrapper (use new `PacredDialog`)
   - c. `/admin/forwarders/combine-bill` print route + items column query
   - d. `/admin/accounting` menubar — ภูม decide: build child pages OR cut menu items
3. **Next session P1 batch (parallel agents)** — 9 surface fixes
4. **Wave 24 P2 polish + deliberate review**

---

## 🛡 Process improvements (so this doesn't recur)

1. **Click-through audit cadence** — every 5-10 commits + after every "Tailwind rewrite" wave. Wave 22 shipped 6 fixes without anyone clicking the buttons — exactly how P0 #1+2+3 hid.
2. **Destructive UX gate** — every action that mutates prod data (suspend · delete · approve · reset-password · transfer) MUST use `useConfirmDialogs.confirm()`. Add an ESLint rule (`pacred/no-bare-destructive-onclick`) if scope grows.
3. **PostgREST embed rule** — when two tables share a parent FK but no direct FK between them, NEVER use cross-embed (`!`-syntax). 3 queries + JS merge. Captured in `docs/learnings/supabase-rls-patterns.md`.
4. **Sidebar icon registry guard** — added dev `console.warn` for unknown icon names in this session (`admin-sidebar.tsx`). Reviewer should spot the warning before merging.
5. **Migration apply tracking** — README.md should have a "migrations applied to prod" column with date. 0091 was written 2026-05-20 + reviewed + never applied → broke Wave 22 today. Worth a `migrations-applied.md` running ledger.

---

## ⚠️ Audit-time prod-data mutation (flag for ภูม)

Agent K's audit accidentally mutated prod during click-through:
- Suspended customer `PR10899` via the bare ⊘ button (no confirm)
- Reversed via the auto-relabeled "Approve" button immediately
- No customer-visible impact (suspension was milliseconds)

Recommendation: future audit agents brief MUST explicitly say "DO NOT click destructive action buttons" + spawn agents in a read-only persona. Also see process improvement #2 above — the bug itself is the suspend-without-confirm.

---

## Cross-links

- Wave 22 save-point: [`poom-save-point-2026-05-27-evening.md`](poom-save-point-2026-05-27-evening.md)
- Wave 21 P2 perf: [`wave-21-p2-query-survey.md`](wave-21-p2-query-survey.md)
- tb_admin merge intel: [`tb-admin-merge-intel-2026-05-27.md`](tb-admin-merge-intel-2026-05-27.md) + [`tb-admin-code-audit-2026-05-27.md`](tb-admin-code-audit-2026-05-27.md) + [`tb-admin-13-row-reference.md`](tb-admin-13-row-reference.md)
- Learnings: [`debug-discipline.md`](../learnings/debug-discipline.md) + [`supabase-rls-patterns.md`](../learnings/supabase-rls-patterns.md) (PGRST200 entry added today)
