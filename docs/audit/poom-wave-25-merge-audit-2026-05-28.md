# ภูม wave-25 merge audit · 2026-05-28

Audit of 9 new commits on `origin/Poom-pacred` (HEAD `123a3409`) that landed
AFTER my last merge (`1a9fd8c2`) — produced for พี่เดฟ before deciding the
merge strategy.

**Auditor:** Claude Opus 4.7 (1M context)
**Worktree:** `C:\Users\Admin\pacred-web\.claude\worktrees\hopeful-almeida-359e44`
**Method:** `git show --stat` + `git diff HEAD origin/Poom-pacred -- <file>`
for every conflict-candidate file. Read-only — no edits committed.

---

## §0 TL;DR

- **New migration on Poom-pacred:** ❌ **NO** — ภูม's 9 commits add zero SQL
  files. The branch is pure application code (`.ts`/`.tsx`). My 0114 + 0115
  migrations stay our side as-is.
- **Files conflicting with my recent commits (`54c7b22d`, `d5f46290`,
  `9c2571da`, `1a9fd8c2`, `227231a2`):** **38 files** of which **20 are
  HARD conflicts** (semantic — both sides edited the same lines for
  contradictory purposes) and 18 are SOFT conflicts (one side moved
  forward, other side stale).
- **Net new lines of code on Poom-pacred vs HEAD:** **+2,336 / −2,378**
  across 154 files. The negative balance is expected for a camelCase
  rename sweep (more characters than what's removed in net is small).
- **Recommended merge strategy:** ⚠️ **CHERRY-PICK + REBASE, NOT a blind
  merge.** The reasoning:
  1. ภูม forked from `6ec9d7bf` (wave-25 #193) and built 9 commits in
     parallel without ever pulling my batch-2a (`54c7b22d`) or fidelity
     fixes (`d5f46290`). A blind `git merge origin/Poom-pacred` would
     REVERT my prefetch leak fix, my login fidelity, AND my batch-2a
     camelCase work on tb_cnt/tb_cnt_item/tb_check_forwarder.
  2. **The cnt-family camelCase regression is the killer.** Migration
     0115 (applied to prod) renamed tb_cnt + tb_cnt_item +
     tb_check_forwarder columns to camelCase. ภูม's batch B
     (`546b5286`) explicitly rewrites these tables BACK to lowercase
     because his fork base predated the migration. PostgREST will
     fuzzy-match for now, but raw SQL/RPC would break + this contradicts
     the team's "ก๊อต spec = camelCase" north-star.
  3. ภูม introduced a **pre-existing bug** on Poom-pacred that we
     already lack: `adminConvertToJuristic` in `actions/admin/customers.ts`
     still has `.eq("ID", d.profile_id)` (capital ID) — should be
     lowercase per his own 77799024 rule (profiles.id stays lowercase).
     Our side is correct already. A blind merge re-introduces this bug.
  4. The valuable parts of ภูม's 9 commits — batch A (24 admin core
     pages), batch C (actions/lib/rates), batch D (27 customer pages),
     post-cherry-pick repairs, §0c sweep, use-server demotion, save-point
     doc — are LARGELY orthogonal to my work and SHOULD land. They just
     need to land via cherry-pick so the conflict resolution happens
     surgically rather than across 154 files.

---

## §1 Per-commit detail (9 commits)

### `aac45839` — wave-25 #194 codemod sweep (13 single-table tb_users/admin/co readers)

- **Date:** 2026-05-28 10:56 +0700
- **Files touched:** 13 files +251/−182 lines
- **Tables renamed:** `tb_users` / `tb_admin` / `tb_co` columns →
  camelCase (per migration 0113). The codemod handled the easy cases —
  files that ONLY query those 3 tables and no other `tb_*` table.
- **New migration:** none.
- **Risk:** LOW. Mechanical rename, no business logic change.
- **Conflict map vs me:**
  - `actions/admin/admins.ts` — also touched by my `1a9fd8c2` merge but
    the merge already accepted ภูม's earlier batch; this commit ADDS to
    that, no conflict if my merge state is the base.
  - `actions/profile.ts` — heavy overlap with my `227231a2` (lint sweep).
    SEMANTIC CONFLICT: ภูม renames `usertel`→`userTel` etc. while I
    add `console.error` + `return { ok: false, error: <name>Err.message }`
    blocks. Both changes can co-exist but need manual merge.
  - `lib/auth/pcs-legacy-bridge.ts` — clean, ภูม-only.
  - `app/[locale]/(protected)/account-settings/page.tsx` + `actions.ts` —
    ภูม-only.
  - `app/[locale]/(admin)/admin/customers/{pending,recently-active,transfer-rep}/page.tsx`
    — ภูม-only.

### `2f367116` — wave-25 #194 batch A (24 admin core pages)

- **Date:** 2026-05-28 11:36 +0700
- **Files touched:** 24 files +369/−368 lines
- **Tables renamed:** Same scope as above (tb_users + tb_admin + tb_co)
  but on multi-table query files that the codemod couldn't auto-handle.
  Hand-edited per-chain.
- **New migration:** none.
- **Risk:** LOW. Pure camelCase mechanical rename matching prod schema.
- **Conflict map vs me:** Zero overlap with my recent commits — these
  24 files (customers list, kpi, accounting, reports, wallet detail)
  were not touched by `54c7b22d`/`d5f46290`/`9c2571da`/`1a9fd8c2`/
  `227231a2`. Clean cherry-pick.

### `546b5286` — wave-25 #194 batch B (25 admin QA + forwarders + service-orders + **cnt**) ⚠️

- **Date:** 2026-05-28 11:20 +0700
- **Files touched:** 24 files +251/−225 lines (1 file ownerless-goods
  skipped per ภูม's commit msg)
- **🔴 CRITICAL OVERLAP** — files I touched in batch 2a (`54c7b22d`)
  AND/or in batch 2a reconciliation (`1a9fd8c2`):
  - `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx` ⚠️
  - `app/[locale]/(admin)/admin/forwarder-check/page.tsx` ⚠️
  - `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` (touched
    by 1a9fd8c2 reconcile)
  - `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx` ⚠️
  - `app/[locale]/(admin)/admin/service-orders/[hNo]/legacy-view.tsx`
- **🚨 The killer regression:**
  - Our side (from `54c7b22d` + `1a9fd8c2`): tb_cnt + tb_cnt_item +
    tb_check_forwarder use **camelCase** (`cntID`, `cntName`,
    `cntStatus`, `cntAmount`, `cntFile`, `fCabinetNumber`, `cfStatus`,
    `adminID`, `nameBlank`, `noBlank`, `nameAccount` etc.) — matches
    migration 0115 applied to prod.
  - Poom side (from this commit): same tables use **lowercase**
    (`cntid`, `cntname`, `cntstatus`, `fcabinetnumber`, `adminid` etc.).
  - **Why:** ภูม forked from `6ec9d7bf` (before my batch 2a merged).
    His batch B was renaming tb_users+tb_admin+tb_co camelCase
    correctly, but he LEFT the cnt-family lowercase because at his
    fork point migration 0115 didn't exist yet.
- **New migration:** none.
- **Risk:** 🔴 HIGH if blindly merged — would silently revert my
  batch-2a to lowercase. PostgREST fuzzy-matches but raw SQL/RPC
  breaks, and the "ก๊อต camelCase" north-star is contradicted.
- **Other touched files (clean):** 19 QA pages + forwarder edits +
  yuan-payments etc. — pure tb_users rename, no overlap.

### `6bf00c5f` — wave-25 #194 batch C (25 actions + lib + rates) ⚠️

- **Date:** 2026-05-28 11:16 +0700
- **Files touched:** 22 files +231/−231 lines
- **🔴 CRITICAL OVERLAP:**
  - `actions/admin/forwarder-check.ts` ⚠️ (my `1a9fd8c2` reconcile)
  - `actions/admin/sidebar-counts.ts` ⚠️ (my `54c7b22d`)
  - `lib/admin/carrier-manual-page-data.ts` (also touched by my
    `1a9fd8c2`)
  - `actions/cart.ts`, `actions/forwarder.ts`, `actions/service-order.ts`
    — not touched by me; clean
- **Pattern:** Same scope as batch B but for actions + lib instead of
  pages. Same camelCase-mechanical sweep.
- **New migration:** none.
- **Risk:** MEDIUM. Mostly tb_users rename which is correct. The
  overlap with my 2 files (`forwarder-check.ts` + `sidebar-counts.ts`)
  needs manual resolve because I had already left the cnt-family
  references camelCase per migration 0115.

### `2db1c814` — wave-25 #194 batch D (27 customer-facing protected pages)

- **Date:** 2026-05-28 11:11 +0700
- **Files touched:** 17 files +163/−163 lines (10 of the 27 "in scope"
  had qualifying tb_users queries; 17 were skipped per commit msg)
- **🔴 OVERLAP with ปอน's c6ca71fb work (which พี่เดฟ plans to restore):**
  - `app/[locale]/(protected)/service-import/page.tsx` ⚠️
    - ภูม renamed `usercompany`→`userCompany`, `userid`→`userID`
    - ปอน's restoration adds `max-w-[1280px] mx-auto` to the content div
    - ✅ Both changes apply — they touch different lines. Clean to
      merge if done file-by-file.
  - `app/[locale]/(protected)/cart/page.tsx` ⚠️ — also touched by my
    `227231a2` (lint sweep). 3-way conflict possible. My change added
    `error` destructure; ภูม renamed `useraddressid`→`userAddressID`
    etc. Both can co-exist; need manual line-by-line.
  - `app/[locale]/(protected)/service-order/page.tsx` ⚠️ — touched by
    my `227231a2`. Same pattern.
  - `app/[locale]/(protected)/profile/{page,actions}.tsx` ⚠️ — touched
    by my `227231a2`. Same pattern.
  - `app/[locale]/(protected)/service-import/[fNo]/page.tsx` ⚠️ —
    touched by my `227231a2`. Same pattern.
- **Files not overlapping with anyone:** addresses · freight/invoice ·
  freight/receipts/print · sales · sales/report · service-payment ·
  service-order/print · service-import/receipts/print · wallet ·
  wallet-credit · wallet/deposit. Clean.
- **New migration:** none.
- **Risk:** MEDIUM. Customer-facing pages — wrong column will surface
  immediately as "ไม่พบข้อมูล" on prod. The camelCase is correct
  (matches migration 0113 applied to prod).

### `77799024` — wave-25 #194 post-cherry-pick (repair 31 tsc errors)

- **Date:** 2026-05-28 11:57 +0700
- **Files touched:** 9 files +46/−46 lines
- **Purpose:** Fix the agent over-rename — `profiles.id` and Supabase
  auth User `.id` are lowercase (D1 era, NEVER touched by 0113); the
  parallel agents flipped them to `.ID`. This commit restores them.
- **🟢 SCOPE-CRITICAL:** Per AGENTS.md §0c rule re-stated in the commit
  msg: "ONLY tb_users / tb_admin / tb_co columns went camelCase via
  migration 0113. Profiles + auth User remain lowercase." This is the
  exact rule I need to apply when merging the prior 4 batches.
- **Overlap with me:**
  - `actions/admin/admins.ts` — already in my 1a9fd8c2 merge in
    similar shape; both versions are camelCase for tb_admin/tb_co
    + lowercase for profiles. Likely identical or near-identical.
  - `actions/admin/customers.ts` ⚠️ — touched by both my `227231a2`
    AND ภูม's post-cherry-pick. **ภูม's commit FIXED 3 of 4
    functions** (editCustomer, approveCustomer, suspendCustomer flipped
    back to lowercase `.eq("id", ...)`) **but MISSED a 4th**:
    `adminConvertToJuristic` still has `.eq("ID", d.profile_id)` in
    Poom HEAD. **Our side is correct already** (mine uses `id`
    lowercase). Merging Poom's customers.ts would re-introduce this
    bug.
  - `actions/profile.ts` ⚠️ — touched by my `227231a2` and ภูม's
    `aac45839` + `77799024`. Heavy overlap. Manual merge required.
  - `lib/auth/pcs-legacy-bridge.ts` — ภูม-only after `aac45839`.
- **New migration:** none.
- **Risk:** LOW once cherry-picked, but needs the `adminConvertToJuristic`
  bug fix on top.

### `0699fe3c` — wave-25 #195 (sweep 61 §0c lint errors + post-merge verify gate) 🔴 PARALLEL WORK CONFLICT

- **Date:** 2026-05-28 13:04 +0700
- **Files touched:** 23 files +383/−64 lines
- **🚨 PARALLEL WORK with my `227231a2`** — we BOTH ran a §0c sweep on
  the SAME 20 files at almost the same time. Verified file-by-file:
  - Files in BOTH commits' file lists: 19 of 20 files identical
    overlap (`actions/admin/{customer-transfer-bulk,customers,
    forwarders-bulk,invoice-adjustments,payment-reconciliation,
    tb-settings}.ts` · `actions/{forwarder-legacy,line-settings,
    profile}.ts` · `app/[locale]/(admin)/admin/{commissions/tiers,
    customers/transfer-bulk}/page.tsx` · `app/[locale]/(auth)/register/page.tsx`
    · 5 protected pages · `app/api/commission-withdrawal/[id]/route.tsx`
    · `lib/integrations/momo-jmf/sync.ts`).
  - Both passes added `if (<name>Err) { console.error(...); return {
    ok:false, error: <name>Err.message }; }` blocks. **Largely the
    SAME pattern.**
  - **Different choices:**
    - My commit also renamed locals (`updateErr`/`upsertErr`/
      `existingErr`/`authErr`) to avoid duplicate-name syntax errors
      after autofix — ภูม's version may or may not have the same
      collisions (his commit msg says he used "agents A/B/C in
      parallel", suggesting hand-coding).
    - ภูม added `.env.example` PG_PASSWORD declaration + tsconfig
      `exclude scripts/codemod` + `package.json` test ref cleanup —
      these are ADDITIVE and don't conflict with my work; I should
      keep them.
- **Confidence the two sweeps converged on the same fix shape:** HIGH
  (both followed AGENTS.md §0c verbatim).
- **New migration:** none.
- **Risk:** MEDIUM. The merge will look chaotic across 19 files but
  the SEMANTIC result is the same. Best approach: cherry-pick ภูม's
  0699fe3c onto a state that doesn't have my 227231a2 yet (or pick
  the cleaner side per file).

### `6d88c8e5` — wave-25 #196 (demote 4 Zod schema exports from "use server" files)

- **Date:** 2026-05-28 13:28 +0700
- **Files touched:** 3 files +16/−5 lines
  - `actions/admin/cnt-payment.ts` ⚠️ (my `54c7b22d` batch 2a)
  - `actions/admin/report-cnt-cost-update.ts` (not in any of my commits)
  - `actions/admin/report-cnt-detail.ts` ⚠️ (my `1a9fd8c2` reconcile)
- **Purpose:** Next 16 "use server" files reject non-async-function
  exports. Removes `export` keyword from 4 Zod schemas — type-only
  exports stay.
- **🟢 VALUABLE FIX:** This is a real Next 16 production bug that
  surfaced ONLY on click-through (the curl smoke + build + tsc all
  passed). Without this fix, `/admin/report-cnt → ติ๊กตู้ → ทำรายการเบิก
  เงินค่าตู้` crashes with "ขออภัย เกิดข้อผิดพลาด".
- **🚨 Overlap with my batch 2a:** ภูม's commit ALSO has the camelCase
  REVERSION inside the same files (cnt-payment.ts insert renames
  `cntName`→`cntname` etc. — see §1 batch C earlier). The combined
  patch on Poom is: keep cnt-family as lowercase + demote Zod schemas.
  Our side: keep cnt-family as camelCase + Zod schemas still exported.
  **Resolution: take ภูม's Zod demotion fix, REJECT his lowercase
  revert.**
- **New migration:** none.
- **Risk:** HIGH for the cnt-family overlap (need careful manual
  resolve). LOW for the Zod demotion (genuinely needed).

### `123a3409` — wave-25 close-out (save-point + 3 learnings + CLAUDE.md)

- **Date:** 2026-05-28 15:07 +0700
- **Files touched:** 6 files +411/−1 lines
- **All ADDITIVE doc changes:**
  - `CLAUDE.md` — adds a top section pushing Wave 25 close summary
    above 2026-05-27 ค่ำ entry. **Overlap risk:** my recent work
    didn't touch CLAUDE.md; ภูม's `1a9fd8c2` already had a big
    CLAUDE.md edit (~474 lines diff). This adds 63 lines on top of
    that. Likely additive.
  - `docs/learnings/_index.md` ⚠️ — touched by my `9c2571da` (which
    added the prefetch leak entry). 3-way conflict — ภูม's version
    ADDS Wave 25 entries but REMOVES my "<Link> prefetch leak"
    text from the same paragraph. Need manual merge to keep BOTH.
  - `docs/learnings/nextjs-16-quirks.md` ⚠️ — touched by my
    `9c2571da` AND `d5f46290`. Same problem: ภูม adds a "use server"
    entry but removes my prefetch leak entry. Manual merge needed.
  - `docs/learnings/ci-and-deploy-gotchas.md` ⚠️ — removes "PG RENAME
    COLUMN..." section that I added via the 0114 hotfix (`ac61a12f`).
    🔴 **HARD CONFLICT** — this would lose a valuable lesson capture.
    Need to keep MY version.
  - `docs/learnings/php-port-patterns.md` — fresh add by ภูม.
    Clean to take.
  - `docs/learnings/verify-deep-flow.md` — fresh add by ภูม.
    Clean to take.
  - `docs/research/poom-save-point-2026-05-28-afternoon.md` — fresh
    add. Clean to take.
- **New migration:** none.
- **Risk:** MEDIUM if blindly merged (loses 3 of my learnings entries).
  LOW if hand-merged.

---

## §2 Merge-conflict map (file × commit)

| File | My commit(s) | Poom commit(s) | Conflict type | Resolution |
|---|---|---|---|---|
| `actions/profile.ts` | `227231a2` (lint sweep) | `aac45839` + `77799024` + `0699fe3c` | 🔴 HARD — both renamed errors AND ภูม did tb_users camelCase | Manual line-by-line. Keep ภูม's camelCase. Merge our error-destructure logic with theirs (likely identical pattern). |
| `actions/admin/customers.ts` | `227231a2` | `aac45839` + `77799024` + `0699fe3c` | 🔴 HARD — overlapping error patterns + ภูม has `adminConvertToJuristic` bug | Take MY version + ADD ภูม's `editCustomer`/`approveCustomer`/`suspendCustomer` camelCase tb_users changes. Reject ภูม's `.eq("ID", ...)` on `adminConvertToJuristic` (it's a bug). |
| `actions/admin/customer-transfer-bulk.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT — both did §0c sweep | Take either version; they converge. |
| `actions/admin/forwarders-bulk.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same as above. |
| `actions/admin/invoice-adjustments.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `actions/admin/payment-reconciliation.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `actions/admin/tb-settings.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `actions/forwarder-legacy.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `actions/line-settings.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `actions/admin/sidebar-counts.ts` | `54c7b22d` (batch 2a) | `6bf00c5f` | 🔴 HARD — opposing camelCase decisions | Take MY version (camelCase = matches mig 0115). Apply ภูม's tb_admin/tb_co renames on top. |
| `actions/admin/cnt-hs.ts` | `1a9fd8c2` (reconcile) | (not directly touched in 9 commits) | 🟡 SOFT — Poom HEAD reverted to lowercase via merge state | Take MY version. |
| `actions/admin/cnt-payment.ts` | `1a9fd8c2` | `6d88c8e5` + earlier batch B reversion | 🔴 HARD — 2 changes in same file | Take MY camelCase + apply ภูม's `export → const` Zod demotion. |
| `actions/admin/forwarder-check.ts` | `1a9fd8c2` | `6bf00c5f` + `546b5286` | 🔴 HARD | Take MY camelCase on `tb_check_forwarder`, take ภูม's camelCase on tb_users. |
| `actions/admin/report-cnt-cost-update.ts` | (not touched) | `6d88c8e5` | 🟢 CLEAN | Take ภูม's version. |
| `actions/admin/report-cnt-detail.ts` | `1a9fd8c2` | `6d88c8e5` + batch B reversion | 🔴 HARD | Take MY camelCase on tb_check_forwarder + ภูม's Zod demotion. |
| `app/[locale]/(admin)/admin/cnt-hs/page.tsx` | `1a9fd8c2` | `546b5286` | 🔴 HARD | Take MY version. |
| `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx` | `1a9fd8c2` | `546b5286` | 🔴 HARD | Take MY version. |
| `app/[locale]/(admin)/admin/forwarder-check/page.tsx` | `1a9fd8c2` | `546b5286` | 🔴 HARD | Take MY camelCase on tb_check_forwarder + ภูม's camelCase on tb_users. |
| `app/[locale]/(admin)/admin/report-cnt/page.tsx` | `1a9fd8c2` | `546b5286` | 🔴 HARD | Take MY version. |
| `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx` | `1a9fd8c2` | `546b5286` | 🔴 HARD | Take MY camelCase on tb_cnt_item + ภูม's camelCase on tb_users. |
| `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` | `1a9fd8c2` | `546b5286` | 🟡 SOFT — different lines | Manual line-by-line. |
| `app/[locale]/(admin)/admin/commissions/tiers/page.tsx` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same as profile-action SOFT conflicts. |
| `app/[locale]/(admin)/admin/customers/transfer-bulk/page.tsx` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `app/[locale]/(auth)/register/page.tsx` | `227231a2` | `0699fe3c` | 🟡 SOFT | Same. |
| `app/[locale]/(auth)/login/page.tsx` | `d5f46290` (fidelity fixes) | (not in 9 commits) | 🟡 SOFT — Poom HEAD has old version | Take MY version (fidelity fixes). |
| `app/[locale]/(protected)/cart/page.tsx` | `227231a2` | `2db1c814` + `0699fe3c` | 🔴 HARD | Manual line-by-line. Both error destructure + camelCase renames are valid. |
| `app/[locale]/(protected)/profile/page.tsx` + `actions.ts` | `227231a2` | `2db1c814` + `0699fe3c` | 🔴 HARD | Same pattern as cart. |
| `app/[locale]/(protected)/service-import/page.tsx` | (not in recent) | `2db1c814` + ปอน restoration | 🟡 SOFT — different lines | Apply BOTH: ภูม's camelCase + ปอน's max-width container. |
| `app/[locale]/(protected)/service-import/[fNo]/page.tsx` | `227231a2` | `2db1c814` + `0699fe3c` | 🔴 HARD | Manual line-by-line. |
| `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` | `227231a2` | `0699fe3c` | 🟡 SOFT | Take ภูม's (closer to canonical pattern). |
| `app/[locale]/(protected)/service-order/page.tsx` | `227231a2` | `2db1c814` + `0699fe3c` + ปอน restoration | 🔴 HARD | 3-way merge: my error destructure + ภูม's camelCase + ปอน's mobile-fix. |
| `app/[locale]/(protected)/m/dashboard/page.tsx` | `227231a2` | `0699fe3c` | 🟡 SOFT | Take either. |
| `app/api/commission-withdrawal/[id]/route.tsx` | `227231a2` | `0699fe3c` | 🟡 SOFT | Take either. |
| `lib/integrations/momo-jmf/sync.ts` | `227231a2` | `0699fe3c` | 🟡 SOFT | Take either. |
| `components/admin/dashboards/{accounting,sales-admin,warehouse}-dashboard.tsx` | (post-1a9fd8c2 — not in 5 listed commits) | (not in 9 commits — Poom HEAD has pre-existing version) | 🟡 SOFT — Poom is behind on `react-hooks/purity` eslint-disable | Take MY version. |
| `components/sections/navbar.tsx` + `cart-badge.tsx` + `notification-bell.tsx` | `d5f46290` (prefetch leak fix) | (not in 9 commits — Poom HEAD has pre-fix version) | 🟡 SOFT — Poom is behind | Take MY version. |
| `messages/{en,th}.json` | `d5f46290` (login fidelity) | (not in 9 commits) | 🟡 SOFT — Poom HEAD has pre-fidelity version | Take MY version. |
| `docs/learnings/_index.md` | `9c2571da` (prefetch leak entry) | `123a3409` (Wave 25 close-out) | 🔴 HARD — both rewrote the "Last reviewed" line | Manual merge — keep BOTH entries. |
| `docs/learnings/nextjs-16-quirks.md` | `9c2571da` | `123a3409` | 🔴 HARD | Same: keep BOTH entries. |
| `docs/learnings/ci-and-deploy-gotchas.md` | `ac61a12f` (PG RENAME COLUMN lesson) | `123a3409` (deletes it!) | 🔴 HARD — ภูม's diff REMOVES my 0114 hotfix learning | Take MY version + add ภูม's new entries if any. |
| `docs/learnings/php-port-patterns.md` | (not recent) | `123a3409` | 🟢 CLEAN | Take ภูม's. |
| `docs/learnings/verify-deep-flow.md` | (not recent) | `123a3409` | 🟢 CLEAN | Take ภูม's. |
| `docs/research/poom-save-point-2026-05-28-afternoon.md` | (not recent) | `123a3409` | 🟢 CLEAN | Take ภูม's. |
| `CLAUDE.md` | (no recent change) | `123a3409` | 🟢 CLEAN | Take ภูม's. |
| `.claude/settings.local.json` | `1a9fd8c2` + minor edits | `aac45839` + later | 🟡 SOFT — local-only, low value | Take either; not load-bearing. |
| `.env.example` | (not recent) | `0699fe3c` | 🟢 CLEAN | Take ภูม's PG_PASSWORD declaration. |
| `tsconfig.json` | `1a9fd8c2` (excluded scripts) | `0699fe3c` (excluded scripts/codemod) | 🟡 SOFT — ภูม's version is more specific | Take ภูม's (tighter scope). |
| `package.json` | (not recent) | `0699fe3c` (dropped 4 deleted test refs) | 🟢 CLEAN | Take ภูม's. |

**Conflict tally:**
- 🔴 HARD: 20 files
- 🟡 SOFT: 18 files
- 🟢 CLEAN (take ภูม's): 7 files
- 🟢 CLEAN (untouched on either side, present only on Poom): ~100 files
  (the bulk of batches A + B + C + D — pure ภูม-only tb_users/admin/co
  camelCase renames on files I never touched recently).

---

## §3 New migrations

**No new migration files on Poom-pacred** in these 9 commits. ภูม's
sweep is pure application code aligning to migrations 0113 + 0114 +
0115 that ALREADY exist on our side. Confirmed via:

```
git diff --name-only HEAD origin/Poom-pacred -- 'supabase/migrations/*.sql'
→ only OUR new files (0114 + 0115) — exist on our side, missing from Poom
```

Our migrations 0114 + 0115:
- **0114** (`0114_fix_member_code_function_after_camelcase.sql`) — applied
  to prod 2026-05-27 via `apply-pilot-migration.mjs` per ภูม's earlier
  hotfix commit `f4bc09dd`. Idempotent. Re-applying = no-op.
- **0115** (`0115_align_container_payment_tables.sql`) — applied to
  prod 2026-05-27 per my batch-2a commit `54c7b22d` commit msg
  ("Verified: tb_check_forwarder.ID + cfStatus / tb_cnt.ID + cntName
  + cntStatus / tb_cnt_item.ID + fCabinetNumber"). Re-running the
  guarded `DO $$ ... IF EXISTS` block is idempotent (~190ms).

**Risk:** When merging, do NOT forget to keep both migration files on
the resolved branch — Poom HEAD literally has 0/9 .sql files in this
range, so a blind `git merge --strategy=theirs` (DON'T do this) would
delete 0114 + 0115. A blind regular merge preserves them because
git treats "file added on dave" + "file absent on Poom" as additive,
but verify post-merge: `ls supabase/migrations/0114* 0115*` must
return both.

---

## §4 Risks + recommendations

### 🔴 The 3 must-not-lose items

1. **Migration 0115 camelCase application on tb_cnt + tb_cnt_item +
   tb_check_forwarder.** Poom's batch B + batch C revert these to
   lowercase. PostgREST will fuzzy-match (so won't 500 immediately)
   but raw SQL/RPC future will break, and this is the team's
   announced camelCase north-star. **Resolution: keep my version
   for these tables; merge ภูม's tb_users/admin/co renames on the
   same files alongside (they're orthogonal).**

2. **My prefetch leak fix + login fidelity fix** (`d5f46290` +
   `9c2571da`). Poom HEAD has neither — his branch base predates
   them. **Resolution: keep my versions for `components/cart-badge.tsx`,
   `components/notification-bell.tsx`, `components/sections/navbar.tsx`,
   `app/[locale]/(auth)/login/page.tsx`, `messages/{en,th}.json`,
   `components/admin/dashboards/*-dashboard.tsx`.**

3. **My 0114 PG RENAME COLUMN learning entry** in
   `docs/learnings/ci-and-deploy-gotchas.md`. ภูม's close-out doc
   commit `123a3409` removes a 38-line section. **Resolution: keep
   my version of this file; pull in any new entries ภูม added at
   the top.**

### 🟡 The bug ภูม shipped that I should NOT inherit

`actions/admin/customers.ts` `adminConvertToJuristic` function:
- Poom HEAD: `.eq("ID", d.profile_id)` (lines ~190, ~210, ~241)
- Our HEAD: `.eq("id", d.profile_id)` (correct per AGENTS.md §0c
  scope rule = profiles.id stays lowercase)
- ภูม's `77799024` claims to have fixed this for `editCustomer` +
  `approveCustomer` + `suspendCustomer` (per commit msg) but the
  same-function pattern in `adminConvertToJuristic` was missed.
- **Resolution: keep my version of this file. Verify by grep after
  merge: `git grep '\.eq."ID"' actions/admin/customers.ts` must
  return zero hits.**

### 🟢 The good stuff ภูม added that I should KEEP

| Item | Files | How to capture |
|---|---|---|
| Wave-25 #194 codemod + 4 batches (tb_users/admin/co camelCase) | ~95 files I haven't touched recently | Cherry-pick `aac45839` + `2f367116` + non-cnt-family parts of `546b5286` + non-overlapping parts of `6bf00c5f` + `2db1c814` |
| Zod schema export demotion (Next 16 "use server" fix) | `actions/admin/cnt-payment.ts`, `report-cnt-cost-update.ts`, `report-cnt-detail.ts` | Pick the 3-line `export → const` change from `6d88c8e5`; reject its lowercase reversion |
| `.env.example` PG_PASSWORD + `tsconfig.json` scripts/codemod exclusion + `package.json` 4 deleted test refs cleanup | 3 config files | Pick from `0699fe3c` |
| 3 new learnings (use-server + schema-casing + verify-deep-flow round-2) | `docs/learnings/{nextjs-16-quirks,php-port-patterns,verify-deep-flow}.md` | Pick from `123a3409` — but APPEND, don't replace my entries |
| Save-point doc + CLAUDE.md top section | `docs/research/poom-save-point-2026-05-28-afternoon.md` + `CLAUDE.md` | Take ภูม's verbatim |

### Recommended merge strategy (ranked)

**Option A (RECOMMENDED) — cherry-pick the clean parts + 3-way file
merge the conflicts.**

1. `git checkout claude/hopeful-almeida-359e44`
2. `git cherry-pick aac45839 2f367116` (clean — no overlap with my work)
3. `git cherry-pick 546b5286` — **conflict on cnt-family files** —
   resolve to take MY camelCase + ภูม's tb_users camelCase.
4. `git cherry-pick 6bf00c5f` — conflict on `sidebar-counts.ts` +
   `forwarder-check.ts` — same pattern resolution.
5. `git cherry-pick 2db1c814` — clean on most files; soft conflict
   on cart/profile/service-order pages with my §0c sweep — take
   ภูม's camelCase + keep my error destructures.
6. `git cherry-pick 77799024` — semi-clean; verify
   `adminConvertToJuristic` post-cherry-pick (mine should win).
7. `git cherry-pick 0699fe3c` — **skip if it's redundant with my
   `227231a2`** (run `git diff origin/Poom-pacred^...origin/Poom-pacred
   -- <19 overlap files>` to compare) — otherwise take ภูม's because
   the additive `.env.example` + tsconfig + package.json cleanups
   are valuable.
8. `git cherry-pick 6d88c8e5` — conflict on the 3 cnt files — apply
   just the `export → const` demotion lines, reject the lowercase
   reversion lines.
9. `git cherry-pick 123a3409` — conflict on learnings _index.md +
   nextjs-16-quirks.md + ci-and-deploy-gotchas.md — merge entries
   from BOTH; clean for save-point + verify-deep-flow + php-port-patterns
   + CLAUDE.md.

**Option B — single 3-way merge then fix manually.**
`git merge --no-commit origin/Poom-pacred` then resolve all 38
conflicted files at once. Faster but high risk of missing
`adminConvertToJuristic` or the prefetch leak revert.

**Option C — abort + ask ภูม to rebase on dave-pacred.**
The cleanest but socially costly. ภูม has spent significant effort
on these 9 commits; asking him to rebase forces him to re-resolve
the same conflicts in his lane.

**My recommendation: Option A.** It's slower but produces an audit
trail of WHY each conflict was resolved a particular way (in the
cherry-pick commit messages). Estimate ~2-3 hours of careful work
with the table in §2 as the playbook. Spend the first 30 min just
on the cnt-family files because those are the highest-stakes regression.

### Pre-merge sanity checks

Before starting:
- [ ] `git status` clean
- [ ] On a NEW branch: `git checkout -b merge/poom-wave-25-2026-05-28`
- [ ] `pnpm verify` baseline EXIT=0 on current HEAD
- [ ] `ls supabase/migrations/{0114,0115}*` confirms both files
  present
- [ ] Save this audit doc as the playbook reference

Post-merge verification:
- [ ] `git grep '\.from."tb_cnt".' actions app | grep -v cnt_item`
  shows only camelCase column refs (cntID, cntName, cntStatus, etc.)
- [ ] `git grep '\.from."tb_cnt_item".'` shows only camelCase
  (cntID, fCabinetNumber, ID, etc.)
- [ ] `git grep '\.from."tb_check_forwarder".'` shows only camelCase
  (fID, cfStatus, adminID)
- [ ] `git grep '\.eq."ID"' actions/admin/customers.ts` returns ZERO
  (the adminConvertToJuristic bug)
- [ ] `pnpm verify` EXIT=0
- [ ] `pnpm build` EXIT=0
- [ ] `curl localhost:3000/admin/cnt-hs` returns 307 (auth redirect)
- [ ] `curl localhost:3000/admin/report-cnt` returns 307
- [ ] `curl localhost:3000/admin/customers` returns 307
- [ ] Click-through on `/admin/report-cnt → ติ๊กตู้ → ทำรายการเบิกเงินค่าตู้`
  succeeds (the #196 use-server fix end-to-end test)
- [ ] `ls supabase/migrations/{0114,0115}*` confirms both files
  survived the merge

---

## §5 Append: Open questions for พี่เดฟ

1. **Did ภูม intend the cnt-family lowercase revert** or did he NOT
   pull dave-pacred (where 0115 lived) before his sweep? If he didn't
   know about 0115, he might want to update his memory/notes after we
   integrate.
2. **The `adminConvertToJuristic` bug** — should we report this to
   ภูม so he doesn't propagate it elsewhere? It's a real `.eq("ID",
   ...)` that would 500 in prod when an admin converts a customer to
   juristic.
3. **`0699fe3c` vs `227231a2` — duplicate work.** Worth setting up an
   "I'm working on §0c sweep" Slack ping convention to prevent the
   next instance? Both passes converged on the same fix, but ~3h of
   parallel agent time was spent twice.
4. **Migration 0116+?** ภูม has not added one, but his commit `546b5286`
   includes the comment `"tb_forwarder family (~177 renames, 18
   customer-facing pages) is deferred to a future batch 2b that can be
   done one page at a time"` — sounds like he's planning batch 2b
   soon. Should we coordinate the migration number?
