# Sidebar Fidelity Audit — Master fix plan

> **For:** ภูม — the admin sidebar is the operational surface staff hit
> every day; right now ~73% of items have a problem (broken / mislinked /
> drift).  Owner (พี่ป๊อป) rule: "copy legacy 100% sameness FIRST" — so
> these aren't cosmetic, they're **Phase-B fidelity blockers**.
>
> **Audit sources:** [`01-broken-links.md`](01-broken-links.md) ·
> [`02-wallet-withdrawal-pattern.md`](02-wallet-withdrawal-pattern.md) ·
> [`03-mislinks.md`](03-mislinks.md)
>
> **Total scope:** 118 unique sidebar hrefs · ~70 have problems · ~48 are
> clean.  Estimated total work: **~50-70 hours** across 3 waves.  Wave A
> (~4-6h) fixes the biggest UX wounds with rewires + label tweaks +
> stubs.

---

## 0. The picture in one screen

| Category | Count | What it is | Total fix effort |
|---|---|---|---|
| 🔴 **404 (no `page.tsx`)** | 15 | Sidebar links to a URL that doesn't exist · staff click → after-auth 404 | ~49h if all built; ~4h if mix of rewire+stub+build per [`01`](01-broken-links.md) |
| 🔴 **Mislink (page exists but wrong content)** | ~46 | Page silently drops the sidebar's `?kind=` / `?sla=` / `?topic=` / etc. query param — lands on a generic parent showing all data | ~20-30h (mostly add filter support to existing pages) |
| 🟠 **Label drift** | ~22 | Page is correct content but sidebar wording slightly off (e.g. "เป๋าตัง" vs "กระเป๋าเงิน") | ~2-3h (text tweaks in `messages/th.json` or page headings) |
| 🟡 **Inconclusive** | ~7 | Plausible but loose · low priority | — |
| ✅ **Clean** | ~28 | Sidebar label matches page heading | — |
| **TOTAL** | **118** | | **~50-70h** |

**Plus 2 design questions answered:**
- **Wave-1 wallet/withdrawal pattern:** structurally faithful already (matches legacy "one menu, many backend modules"). Don't restructure. **Just fix the contracts** — 5 href fixes + 1 enum extension + 3 pages + 6 badge counters per [`02`](02-wallet-withdrawal-pattern.md).
- **Owner's "split vs filter":** legacy itself is HYBRID — split when underlying tables differ, filter when same table. Pacred's `/admin/board?waiting=X` already follows this rule correctly. Apply same rule to the others.

---

## 1. Why this matters (the cargo-domain stakes)

Per [`docs/research/d1-fidelity-admin.md`](../d1-fidelity-admin.md) §1.4:
*"the #1 daily-workflow regression"* is the missing badge counts.  Staff at
PCS *work from the badges* — `บริการฝากนำเข้า ⑫`, `รายการถอนเงิน ③`,
`อนุมัติรายการ ⑤` — each queue advertises its backlog in the sidebar.
Pacred today: **half the sidebar lies**.  Staff click "wallet/deposit" → see
the wallet hub → can't find what they wanted → workflow breaks → owner's
"zero retraining" promise fails.

The wallet/deposit case ภูม flagged is THE canonical example — and it's
1 of ~46 similar cases the C audit found.

---

## 2. The 3-wave fix plan

### Wave A — Quick wins (~4-6h)
**Goal:** zero the most-visible breaks in one session.  ~30 sidebar
items become correct.  Mix of href rewires + i18n label tweaks + 1
stub.  No new schemas, no new server actions.

| # | Action | From | Item count | Effort |
|---|---|---|---|---|
| A-1 | **Stub the cost-check page** (`/admin/forwarders/container-cost-check`) — a placeholder that says "coming soon" + a link to the existing nearest page | [`01`](01-broken-links.md) §1 | 1 | 30 min |
| A-2 | **Rewire 4 search/notes hrefs** — change sidebar to point at existing search/note pages where they already live (e.g. `customers/search` → `customers?q=` if the search box is already in `/admin/customers`) | [`01`](01-broken-links.md) §1 | 4 | 1h |
| A-3 | **Fix wallet 5 dead-wires** — 2 redirect-stubs (wallet/deposit, withdrawals) + 2 query-string ignore (sales-payouts kind, disbursements kind) + 1 enum extension (add `container_lease` to disbursement_kind) | [`02`](02-wallet-withdrawal-pattern.md) | 5 | 1.5h |
| A-4 | **Implement `?group=` filter on customers/page.tsx** — current page only reads `?q` + `?type`; add VIP/SVIP/นิติบุคคล/เครดิต group support | [`03`](03-mislinks.md) §6 | 6 | 1h |
| A-5 | **22 label-drift fixes in `messages/th.json`** — align sidebar wording to page heading (or vice versa, whichever matches legacy better) | [`03`](03-mislinks.md) §3 | 22 | 1.5h |
| | **WAVE A SUBTOTAL** | | **~38** | **~5-6h** |

**Acceptance:** after Wave A → smoke-walk every sidebar item with a logged-in admin · the 38 items above land on the right content.

### Wave B — Daily-flow blockers (~12-16h)
**Goal:** build the 4 missing pages staff hit every day + implement
filter support across the 4 biggest mislink clusters from C audit.

| # | Action | Effort |
|---|---|---|
| B-1 | Build `/admin/wallet/pay-user` — admin tool to credit/debit a customer's wallet (legacy `OOP/Cargo/wallet-pay-user.php`) | ~4h |
| B-2 | Build `/admin/wallet/add` — admin manual top-up tool (legacy `OOP/Cargo/wallet-add.php`) | ~3h |
| B-3 | Build `/admin/wallet/history` — global wallet movement audit log (legacy `OOP/Cargo/wallet-history.php`) | ~3h |
| B-4 | Build `/admin/forwarders/new` — admin create-forwarder form (rare but daily-blocker for new-customer onboarding) | ~3h |
| B-5 | Implement `?sla=` filter across 4 QA report pages (the 8 `qa.*?sla=…` queues from C audit cluster b) | ~2h |
| B-6 | Implement `?topic=` filter on `learning/page.tsx` OR collapse the 5 sidebar items into one row | ~1h |
| | **WAVE B SUBTOTAL** | **~16h** |

### Wave C — Weekly/rare + filter expansion (~30-35h)
**Goal:** finish the remaining 6 builds + the remaining ~30 query-string mislinks.

| # | Action | Effort |
|---|---|---|
| C-1 | Build `/admin/forwarders/combine-bill` — bulk-invoice consolidation (the BG-1b owner ask) | ~6h |
| C-2 | Build `/admin/forwarders/notes` + `/admin/service-orders/notes` — note queue (legacy `tb_note_*`) | ~3h |
| C-3 | Build `/admin/forwarders/warehouse-history` — TH-warehouse intake log | ~4h |
| C-4 | Build `/admin/yuan-payments/new` — admin manual yuan transfer entry | ~3h |
| C-5 | Build `/admin/service-orders/cart` + `/admin/service-orders/cart/add` — admin cart-as-customer (legacy admin "add cart for member") | ~4h |
| C-6 | Implement 8 `barcode?mode=…` scan-mode pages (per `poom-phase-b-prep.md` B-7 — the 8-variant scan family) | ~8h |
| C-7 | Fix the 3 `assets.*` items → no current Pacred `/admin/inventory` impl (legacy: `tb_assets`) | ~3h |
| | **WAVE C SUBTOTAL** | **~31h** |

---

## 3. Critical dependencies on ongoing waves

- **Wave A items A-3 / A-4 must NOT conflict with the pending Wave-2 B-0 swap** (re-point reads at `tb_*`).
  Mitigation: stage A's `customers?group=X` filter to read FROM rebuilt `profiles` for now; when B-0 swaps to `tb_users`, the same filter passes through the same column (`customer_group` / `userType`) — additive.
- **Wave B builds touch `tb_*` directly** — gated on the §8 ghost-customer fix (8,892 customers need profiles row) being in flight, otherwise the admin pages will show counts that don't match what staff see in the customer detail.
- **Wave C C-6 (barcode 8 modes) overlaps with B-7** — same surface · do them as one combined wave when getting to Phase-B B-7.

**Coordination note for เดฟ:** Wave A is fully ภูม-safe to execute now
(no overlap with Wave 2 spec); Wave B + C should be scheduled WITH Wave 2
or AFTER, to avoid double-touching the same files.

---

## 4. Execution order recommendation (ภูม's call)

**Path 1 — "kill the visible bleed first"** (recommended):
- Wave A NOW (~5-6h · this session if ภูม wants) → 38 fixes visible
- THEN ping เดฟ "Wave A done; queue Wave B alongside Wave 2 bundle"
- THEN Wave B during/after Wave 2
- THEN Wave C as Phase-B continues

**Path 2 — "wait for Wave 2 + bundle everything"**:
- Skip Wave A · let เดฟ + agents handle as part of Wave 2
- Pro: fewer commits, less coordination
- Con: ภูม blocked for hours-to-days until เดฟ picks up

**Path 3 — "Wave A + selective B-1/B-2/B-3"** (most aggressive):
- Wave A + the 3 wallet builds (~12-14h · 1-2 sessions)
- Restores the entire wallet menu structure faithfully
- Pro: the wallet block is the most-hit admin area
- Con: more code changes pre-Wave-2

**ภูม's brief explicitly allows acting:** "✅ You own: `actions/`,
`lib/`, `app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`,
…".  Wave A is squarely in lane.

---

## 5. The split-vs-filter rule (codified from audit B)

**Recommended Pacred convention** (matches the legacy pattern + Pacred's
shipped `/admin/board?waiting=X` precedent):

| Backend reality | UX pattern |
|---|---|
| **Same table, different filter** (e.g. `work_items.waiting_reason='document'`) | **One page · sidebar items pass `?param=X`** · page reads param + applies WHERE filter |
| **Different tables** (e.g. `tb_sales_commission` vs `tb_inter_commission` vs `tb_driver_run`) | **Separate pages** — each at its own route with its own server action |
| **Same table, complex filter that warrants a dedicated workflow** (e.g. "ค่าตู้รออนุมัติ") | **Separate page** — sidebar links there directly · the workflow gets its own URL for shareability + bookmarking |

**Wave A's A-3 + A-4 apply this rule per case** — see per-row notes in
the individual audit docs.

---

## 6. What to ping เดฟ + ก๊อต about

**For เดฟ (Phase-B coordinator):**
- Wave A start (~5-6h · ภูม-owned) — informational, not asking permission
- Wave B + C scheduling — coordinate with Wave 2 bundle to avoid file conflicts
- Open: any pre-existing Wave-2 task that already plans to fix any of these 70 items? (avoid double-work)

**For ก๊อต (senior advisor):**
- No specific question — but the 73% sidebar mismatch rate is data the senior lane may want to see (it shifts Phase-B "time to faithful" estimates)

---

## 7. Cross-references

- 🧭 D1 ADR → [`../../decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md)
- 🗺 Admin fidelity spec (the legacy truth) → [`../d1-fidelity-admin.md`](../d1-fidelity-admin.md)
- 🛠 Per-stage Phase-B prep → [`../poom-phase-b-prep.md`](../poom-phase-b-prep.md)
- 📦 Wave-1 fidelity synthesis (the Wave-2 bundle these don't conflict with) → [`../wave-1-fidelity/_SYNTHESIS.md`](../wave-1-fidelity/_SYNTHESIS.md)
- 👷 ภูม brief → [`../../briefs/poom.md`](../../briefs/poom.md)
- 📂 Per-audit → `01-broken-links.md` · `02-wallet-withdrawal-pattern.md` · `03-mislinks.md`
