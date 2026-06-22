# Audit discipline — read the source, not the screenshot

> Captured 2026-05-25 ค่ำ after ภูม catch me shipping a fidelity-comparison report
> that missed 2 huge legacy pages (`report-cnt.php?id=` + `forwarder-check.php`).
> The pattern that caused the miss was: **I compared against the HTML ภูม pasted
> in chat, not against the legacy PHP source on disk**. ภูม said it like this:
> *"โหนี่ขนาดมี source code ให้นายเลยนะ ไล่ deep audit เพิ่มด่วนเลย อยากส่งงาน
> แล้วโดน Owner ไล่กลับบ้านหรือไง"*. Owner would have rejected the work.

---

## The rule

**When comparing Pacred to legacy PCS, the SOURCE OF TRUTH is the legacy PHP file on disk, not any screenshot or rendered HTML.** A rendered HTML view shows ONE mode of a multi-mode page — every legacy `*.php` file is usually a `switch ($_GET['page'])` or `if (isset($_GET['id']))` dispatcher with 2-6 modes hidden inside. The rendered HTML you see in a browser tab is one of them; the other modes are invisible until you `Read` the source.

## Concrete miss (the 2026-05-25 case)

| What I saw | What was hidden | What broke |
|---|---|---|
| `report-cnt.php` list view (`page=waiting/succeed`) | Mode-b: `?id=<container>` per-container drill-down — 2000+ LOC of detail view with cost-edit modal + 25-col DT + bulk-check submit | I told ภูม Pacred is "85% faithful" when it's actually missing the entire container-detail workflow |
| `forwarder-check.php` (didn't see it at all) | A whole separate page that owns the **bill-customer step** of the revenue pipeline | The revenue path is broken — no way to bulk-bill customers after รายการตรวจสอบแล้ว |
| Top menu's "ค่าตู้สินค้า" link | Real lifecycle: report-cnt → forwarder-check → cnt-hs · 3 pages, not 1 | I framed cnt-hs as the whole flow when it's just the END of the flow |

## The audit protocol I should have followed

When ภูม pastes a legacy HTML (or shows a screenshot, or describes a workflow):

### Step 1 — Identify the source PHP file
```bash
# From the URL in the HTML (e.g. `report-cnt.php?id=GZE0516179`)
ls -la "D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-cnt.php"
# Read it FULLY — not just the section that matches the HTML
```

### Step 2 — List all modes the file dispatches
Read the top 100 lines. Grep for:
- `$_GET['page']` · `$_GET['action']` · `$_GET['id']` · `$_POST['*']`
- `switch (` · `if (isset(`
- `include 'include/pages/<dir>/<file>.php'`

Each mode is potentially a **separate Pacred route**.

### Step 3 — Enumerate every include/page sub-handler
The big legacy pages (report-cnt.php · forwarder.php · cnt-hs.php) call `include 'include/pages/<dir>/<file>.php'` for sub-handlers (modals · AJAX endpoints · sub-tables). Each is a separate `actions/admin/*.ts` server action in Pacred. Use:
```bash
grep -r "include " <legacy-page>.php   # find every sub-handler
```

### Step 4 — Cross-reference Pacred for every legacy artifact
For each legacy mode + sub-handler, search Pacred:
```bash
Glob "app/[locale]/(admin)/admin/<feature>/**"
Grep -l "<legacy-table-name>" "app/[locale]/(admin)/admin/"
```

Mark: ✅ exists · ⚠️ stub · ❌ missing · 🔧 fallback-only.

### Step 5 — Build the diff table BEFORE answering ภูม
Don't write the answer until you have a per-file row of:
- legacy filename + LOC
- legacy mode/sub-handler
- pacred path (or NULL)
- status
- gap LOC estimate

Then surface as a markdown table. ภูม wants the table, not a narrative.

### Step 6 — Parallel agents when scope is wide
If the feature touches > 10 legacy files, dispatch 2+ agents in parallel:
- Agent A: enumerate LEGACY side
- Agent B: enumerate PACRED side
- (synchronously) you produce the diff

The 2026-05-25 audit used 4 agents (legacy×2 split by domain + pacred×2 split) and finished in ~12 min. Doing it serially would have taken an hour.

## Anti-patterns (what I did wrong before the catch)

❌ **Comparing to "what I see in the HTML"** — I scanned the pasted HTML for buttons + columns and listed them. But HTML only shows ONE mode of a multi-mode page; modes hidden behind `?id=` or `?action=` were invisible.

❌ **Defending the gap as "intentional Pacred UX divergence"** — I labeled the missing `forwarder-check.php` as "Pacred uses one-page flow" without checking if Pacred actually has the bill-customer step at all. (It didn't.)

❌ **Trusting my own previous audit** — I had already shipped a "fidelity check" Wave 14 morning. Building the next answer on top of that previous-audit's framing repeated its blind spots. Should have re-audited from PHP source for any new question.

❌ **Saying "~85% complete" without measuring** — sample-size of one HTML page can't yield a percentage. The deep audit found 5 P0 + 7 P1 missing pages = closer to 50% on the cnt/report-cnt/forwarder-check trio.

## What to do when ภูม catches a miss

1. **Acknowledge once, briefly** — no long apologies. ภูม wants action.
2. **Run the protocol above immediately** — parallel agents to enumerate both sides.
3. **Produce the diff table FIRST**, then the priority + plan.
4. **Capture the lesson here** (this file) so the next agent doesn't repeat.
5. **Add a Task per gap** so it shows in TaskList — ภูม sees the plan.

## When the protocol can be skipped (rare)

- The question is purely about ONE function in ONE file (e.g., "does our calc match the legacy formula") — read both, diff inline, done.
- The legacy PHP doesn't exist (Pacred-original feature with no precursor).
- ภูม explicitly says "skip audit, just build X" — but then re-audit before claiming faithful.

## Cross-links

- [`AGENTS.md`](../../AGENTS.md) §0b — the rule: deep-audit from source
- [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../audit/cargo-flow-deep-audit-2026-05-25.md) — the audit produced by the protocol
- [`docs/learnings/pacred-design-philosophy.md`](pacred-design-philosophy.md) — sibling rule: legacy = workflow truth, our UI = our design
- [`.claude/skills/legacy-fidelity-check/SKILL.md`](../../.claude/skills/legacy-fidelity-check/SKILL.md) — the executable form of these rules

## [2026-06-11] Gap-map agents grep the feature NAME → find the orphan twin, miss the live `*-legacy` path

**Context:** The cargo-pricing/accounting epic (`docs/research/cargo-acct-epic-2026-06-11/`) spawned 4 parallel audit agents. The **Workstream C** agent declared the entire order-time address→carrier→COD flow "🔴 NOT ported" (free-text carrier, no zone gating, split-brain at create).

**Symptom:** Building C from that audit would have re-implemented ~6 features (carrier registry, zone resolver, COD coupling, PCSF, address picker) that **already exist and are live**.

**Root cause:** The agent grepped `createForwarder` → found `actions/forwarder.ts` (the rebuilt-era **orphan**) + a stale doc reference to a `forwarder-form.tsx` that **no longer exists**. It never found the live twin **`actions/forwarder-legacy.ts`** (`createLegacyForwarder` → writes `tb_forwarder`) + the live add form `service-import/add/service-import-shipby-select.tsx` (zone-gated `getShipByOptions`). Pacred's D1 port routinely keeps **two same-domain actions**: a rebuilt-era `xxx` (orphan) and a faithful `xxxLegacy`/`*-legacy.ts` (live). Grepping the bare name lands on the orphan.

**Fix / answer:** Before trusting any "not ported / split-brain" verdict, **find the WIRED path, not the first name match**: open the live route's component (`app/.../add/page.tsx` → which form → which action it `import`s + calls). Here the live `service-import-add-form.tsx` imports `createLegacyForwarder` (writes `tb_forwarder`), so C-1..C-6 + C-9 were all already done. Also re-grep `.from("forwarders")` to confirm a claimed split-brain write still exists — the orphan `createForwarder` had already been deleted a prior session (0 matches), so C-9 was a no-op.

**Why this matters next time:** Any audit that says "feature X is missing / writes the wrong table" must name the **live entry point** (route → form → action) and show that path is broken — not just show that *an* orphan action with the name is broken. Two-table D1 ports + `*-legacy.ts` twins make the bare-name grep systematically land on the dead one. Cheapest guard: `grep "import.*<ActionName>"` to see if anyone calls it; 0 importers = orphan, not a live bug.

**Cross-links:** `docs/research/cargo-acct-epic-2026-06-11/C-address-shipping-cod.md` (correction banner) · CLAUDE.md §0e (dead-write traps) · `actions/forwarder-legacy.ts` (the live twin)

---

## [2026-06-14] Money-workflow review patterns — 3 lessons from the integration-review of the just-merged waves

A 5-agent adversarial review of a 199-commit integration (freight-commission · MOMO auto-rate · coID rebrand) found ZERO §0e dead-write traps + no auto-pay/double-accrual — but surfaced 3 recurring *latent* patterns worth gating against:

**1 — Gate every money-mutating action on the flag, not just the mint point + a UI disable.** The freight-commission dormant flag (`commission.freight_enabled`) was correctly fail-closed at the SOLE mint point (`adminAccrueFreightCommission`), but the downstream `create/approve/pay` withdrawal actions gated on role only — they stayed closed merely because "no accruals exist while OFF" (a data-absence invariant) + a client-side button disable. Implicit data-absence invariants are brittle: a future code path that mints differently, or a stale UI, breaks the closure. **Fix: re-check `isFreightCommissionEnabled()` (fail-closed) at the top of the WRITE action too**, so the closure is provable from one flag, not emergent. (Fixed `actions/admin/freight-commission.ts` create+approve.)

**2 — One-off `.mjs` backfill/maintenance scripts are where documented platform contracts get silently violated**, because they're written outside the runtime path that enforces the guard. `backfill-momo-cabinet.mjs` overwrote `fcabinetnumber` without honouring `fcabinet_locked` (migration 0150's MUST-skip contract that `propagate.ts` + the admin bulk-bar both respect). **Audit rule: any script that UPDATEs a lock/contract-protected column must mirror the runtime guard.** Grep `\.update(` in `scripts/*.mjs` against the protected-column list.

**3 — Hand-copying a tested money formula into a plain-`node` script creates an untested drift twin.** `backfill-momo-forwarder-rates.mjs` re-implemented `lib/forwarder/resolve-rate.ts` (49 tests) inline with ZERO tests, citing "server-only" — but only `live-rate.ts` is server-only; `resolve-rate.ts` itself is importable. **Before mirroring a money formula, check whether the PURE helper is actually server-only**; prefer running the script via `tsx` + importing the canonical function over a drift twin. If you must mirror, write a fixture test asserting equality.

Also reinforced **[L-MIG-04](migration-env-drift.md)**: a data-rebrand (0182 coID PCS→PR) left a display-layer literal `Record` (`sales/page.tsx CO_ID_BADGE`, keyed on the old `'PCS'` sentinel) rendering the raw new value `'PR'` as a misleading VIP chip for ~8,700 general customers — even though every MONEY path correctly routed through `lib/forwarder/coid.ts`. Rebrand sweeps must grep for literal maps/switches keyed on the old sentinel, or route display decisions through the same SOT as the money decisions.

**Cross-links:** CLAUDE.md §0e (dead-write) · §0f (confirm-before-mutate) · [migration-env-drift L-MIG-04](migration-env-drift.md) · `lib/freight-commission/bucket-bases.test.ts` (the scope→bases regression lock added this session).

---

## [2026-06-14] Two audit dimensions from the legacy-admin deep-read (forwarder/MOMO/wh-scan/payment)

Full read: [`docs/research/legacy-admin-deep-read-2026-06-14.md`](../research/legacy-admin-deep-read-2026-06-14.md) (~26/30 screens verified faithfully built · 0 §0e traps · 3 false gaps corrected). Two reusable additions:

**1 — A screen's Pacred home is organized by FUNCTION, not the legacy file's directory.** 3 "missing" verdicts were false: `acc-payment.php` is built as `/admin/reports/yuan-profit` (a REPORT — the auditor searched `/yuan-payments/*` by name and missed it under `/reports/*`); yuan bulk-approve + add-form both exist. Before trusting any "missing", grep `admin/*` by the DATA the screen reads (`tb_payment paystatus=2`, etc.), not by the legacy filename.

**2 — NEW money-audit dimension: a money-mutating DETAIL page needs a concurrent-edit guard, not just a reachable mutate action.** The single highest-value gap in that whole set was not a missing screen — it was the absent yuan-verify lock on a BUILT page (`/admin/yuan-payments/[id]`): two accountants can open the same pending ฝากโอน and both verify/refund → double wallet reversal. Legacy guarded it (`payment.php` payLockDate + session). Add to the §0c/§0e checklist: for any money-mutating detail page, check for a concurrency/lock guard (optimistic `.eq(status, expected)` on the flip, or a lock row), not only that the action exists + is reachable + writes the right table.

(Also reinforced: "missing legacy screen" often = "re-architected into a better Pacred mechanism" — MOMO's tb_tmp staging → cron + review/sync/history. Score PARTIAL/re-arch; flag REAL only when a capability has zero equivalent.)

---

## The forward-only-fix trap + the overloaded-flag detection near-miss (2026-06-19)

Owner re-flagged a container the day after I "fixed the cost-basis bug": report-cnt
PCS20260528-SEA01 still showed กำไรตู้ −10,204 (cost ฿10,250 = rate 2,500 × 4.10 **kg**
for a MOMO/sea parcel that costs 2,500 × 0.0022 **cbm** = ฿5.50). Two compounding lessons:

**1 — A logic fix does NOT correct already-STORED values. Pair it with a backfill (or
compute live).** The cost-basis fix corrected the RECOMPUTE action only — it was
forward-only. `fcosttotalprice` is a STORED/denormalized field; the detail display, the
container LIST (RPC `sum_cost`), PEAK export, profit reports + commission all read the
stored value, which stayed wrong for every row rated before the fix. To the owner that
reads as "you didn't fix it." Whenever you fix how a STORED money field is *computed*,
ask immediately: which existing rows hold the old wrong value, and what reads them? Fix
needs (a) a live-compute display for instant visible correctness AND/OR (b) a data
backfill for the stored-value consumers (accounting). I shipped both: detail page now
derives cost live = rate × carrier-basis for non-paid containers (self-heals); + a
dry-run+backup script corrected the stored rows.

**2 — NEVER use an overloaded flag to DETECT a wrong value — verify from first
principles.** My first detector filtered `frefprice='1'` (assuming it marked weight-basis
cost) → surfaced 5 rows. But `frefprice` is the **SELL** basis (kg-mode "11"), NOT the
cost basis — 4 of the 5 already had CORRECT cbm-basis cost (e.g. ฿777.15 = 2,500 ×
0.31086). Blindly "correcting" them (× cbm/kg) would have CORRUPTED 4 good money rows.
The right detector judges each row against first principles: resolve the real cost rate
(custom tb_cost_container rate → else tb_settings matrix), then flag ONLY where
`stored == round2(rate×kg)` AND `stored != round2(rate×cbm)`. Across all 13 CBM-carrier
rows that found exactly 1 truly-wrong row — the one the owner saw. (Legacy `frefprice`
is overloaded: the recompute action even WRITES it as cost-basis while the page reads it
as sell-basis — a latent bug; the data fix touched only `fcosttotalprice`, never
`frefprice`.) When a flag's meaning is ambiguous, compute the truth, don't trust the flag.

Aside: that row's cbm 0.0022 for 4.10 kg = 1,863 kg/cbm (denser than steel) → the CBM
itself is likely a placeholder from before the China packing-list ingestion. The
cost-basis fix is correct regardless; the cost re-derives when the real cbm lands.

---

## [2026-06-20] A count computed in N places WILL drift — make one SOT helper, route every caller through it (delivery-day dept sweep)

**Context:** a 4-department adversarial audit (คลัง → ลูกค้า → บัญชี → คนขับ, each: 2-3 parallel finders → adversarial verifiers → confirmed-safe list). Hit rate was low-but-real: customer 17→0 confirmed (clean), accounting 17→1 (a stale JSDoc), warehouse 10→1 (a silent error-swallow), **driver 10→5** — the richest, and they all had ONE root.

**The driver root cause (the owner's "badge อย่ามั่ว"):** the "งานรอจัดรถ / มอบงานคนขับ" count was computed in THREE places with THREE different predicates:
- `lib/admin/pending-dispatch.ts countPendingDispatch` — fstatus=6 minus open-batch (omitted `paydeposit<>'1'`).
- `actions/admin/sidebar-counts.ts driverItems` — a byte-identical DUPLICATE of `forwarderDelivery` (all fstatus=6, ignored both filters).
- `logistics-board/page.tsx` — its own inline fstatus=6 minus open-batch (omitted paydeposit).
Meanwhile the ACTUAL assign form (`drivers/new`) + the legacy `forwarder-driver.php` both gate on `fstatus=6 AND paydeposit<>'1' AND not-in-open-batch`. So the 3 badges over-counted (showed "3 รอจัดรถ" while the form listed 0) — a customer-facing "ค่าไม่ขึ้น/ผิด" right after a demo.

**Fix pattern (the reusable lesson):** when the same business count/figure appears on ≥2 surfaces (a sidebar badge, a banner, a dashboard card, a list footer), it is a SOT candidate — make ONE pure/async helper that encodes the predicate (here `countPendingDispatch` with the full legacy filter) and have EVERY surface call it. A duplicated `.eq("fstatus","6")` in a Promise.all is the smell; it drifts the moment one site adds a filter. The faithful predicate lives in the legacy SQL + the real action that consumes the rows — derive the helper from THOSE, not from the badge that happens to be wrong.

**Audit-method note:** the adversarial verify step earned its keep — across the 4 depts it dismissed the large majority of finder claims as false-positives (misread comments, claims about non-existent code, already-guarded paths) and the 0-confirmed customer dept proved the finders weren't just rubber-stamping. Trust the *verified* list, not the raw finder count. Cross-links: [[verify-deep-flow]] · `lib/admin/pending-dispatch.ts` · the §0f badge-accuracy rule.

---

## [2026-06-22] Fidelity-audit by parallel agents OVER-COUNTS gaps — verify each claim against `actions/` BEFORE building

**Context:** ภูม asked to "แยกร่าง" (spawn agents) to find what the warehouse/driver port is still MISSING vs legacy PCS, then fill the gaps. Ran 3 parallel Explore agents (warehouse-scan / driver / container-cnt) comparing `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\` to our Pacred pages.

**Symptom:** the 3 agents returned a RICH gap list — many items flagged "P0 missing / blocks ops". Taken at face value it implied the port was ~65% done with huge holes.

**Root cause:** the agents read the **legacy PHP thoroughly** (every `$_GET`/`$_POST` mode) but read **our side only partially** — they opened our `page.tsx` files but NOT the `actions/admin/*.ts` server actions where most of the logic lives. So they flagged as "missing" things we'd already built one directory over.

**Falsification (every top "P0 gap" verified FALSE in minutes):**
- "no `tb_forwarder_import2` scan table" → ✅ exists + used (`barcode-import.ts`, `warehouse-history.ts`)
- "forwarder-check `callPriceUser` (bulk-bill 4→5 + notify) missing" → ✅ `adminCallPriceUser` does exactly that
- "driver photo `fdipictureon/off` not populated" → ✅ written at `driver-work.ts:233`
- "cnt-hs cost-update (Google Sheets) missing" → ✅ INTENTIONALLY dropped Sheets for an internal tab (Wave 16) — a divergence, not a gap
- "report-cnt detail view unclear/missing" → ✅ `/admin/report-cnt/[fNo]` exists
- live-walk: `/admin/drivers` renders "รายการขนส่งสินค้า" = the legacy list mode, correct

Verdict: warehouse/driver/cnt port is ~85–90% faithful; the genuinely-missing set was tiny (a `report-driver.php` "ยอดพนักขับรถ" summary).

**The reusable lesson (sharpens §0b/§0e + the trust-but-verify rule):**
1. A gap-audit agent that reads legacy deeply but our app shallowly will **systematically over-report missing**. Brief such agents to enumerate OUR `actions/` + `lib/` for the feature (grep the `tb_*` table / fn name) BEFORE concluding "missing", and to mark intentional divergences (e.g. dropped Google-Sheets) as NOT gaps.
2. Never spawn build agents straight off a raw fidelity-audit — **each claimed gap is a hypothesis; disprove it against `actions/` first** (one grep per claim). Building from the raw list = rebuilding existing features = wasted work + regression risk (violates "ห้ามทำงานบัค งานหาย").
3. When the code-audit + a live page-walk BOTH show the pages are mostly faithful, the remaining real gaps are usually **user-experienced** (a broken button, an awkward flow) that a presence-audit can't see — fastest path is a screenshot from the operator, then a surgical fix (proven same session: the billing-run invoice-link fix took minutes from ภูม's screenshot).

**Cross-links:** [[verify-deep-flow]] · AGENTS §0b (deep-audit from source) · §0e (reachable dead-write traps) · the `branch-integrate-loop` "trust-but-verify agent output" note.
