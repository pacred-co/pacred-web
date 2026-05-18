# ภูม → เดฟ + ก๊อต — D1 Phase-B open questions

> **✅ ANSWERED 2026-05-18 by เดฟ.** Decisions are inline below (the
> `✅ DECISION` block under each question) + in the summary table. **Q1 · Q3 ·
> Q4 · Q5 · Q6 are decided.** **Q2 (auth-bridge posture)** carries เดฟ's lean
> but **needs ก๊อต's ratification** before B-auth ships. ภูม — you're
> unblocked: start B-0 + B-auth wiring per these decisions; treat Q2 as
> provisional until ก๊อต confirms. Ping ก๊อต on LINE for Q2.
>
> **Status:** drafted 2026-05-18 by ภูม after syncing dave → Poom.  Each
> question below BLOCKS a Phase-B sub-task — ภูม needs answers before
> code can land safely (otherwise it'll conflict with the parallel
> Phase-A work you two are running).
>
> **Cross-references:**
> - ADR-0017 → [`../decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
> - Phase-A runbook → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
> - Phase-B gap map → [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
> - My Phase-B prep + per-stage plan → [`poom-phase-b-prep.md`](poom-phase-b-prep.md)
> - My new brief → [`../briefs/poom.md`](../briefs/poom.md)
>
> **TL;DR:** I've cleared migration slots `0081-0083` (renumbered mine to
> `0084-0086`).  The 6 questions below decide naming + auth-bridge
> shape + ID rules + apply-order before I write any Phase-B code.

---

## Q1 — Phase-A migration filename: single file or split?

**Context:** the brief says "Phase A applies the 117-table legacy schema as a new migration (`0081_pcs_legacy_schema.sql`)".  But 117 `CREATE TABLE` statements + indexes + comments + the `PCS→PR` numbering trigger + member-code gapfill = a sizeable SQL file.

**Options:**
- **(a)** Single `0081_pcs_legacy_schema.sql` — one big file (simpler tracking; the file may be 3-5k+ lines).
- **(b)** Split into 3:
   - `0081_pcs_legacy_schema.sql` — bare tables + PKs
   - `0082_pcs_legacy_indexes.sql` — indexes + FKs + triggers
   - `0083_pcs_legacy_member_seq.sql` — member-code generator + gapfill
- **(c)** Other split (e.g. by legacy module — `tb_user*` · `tb_order*` · `tb_forwarder*` · `tb_cnt*` · `tb_invoice*` · the rest).

**Why it blocks me:** my Phase-B migrations start at the next free slot.  If you split, my slot moves from `0084` (today's number) to whatever follows yours — I need the exact number.  Otherwise I might commit `0087_status_vocab_reconcile.sql` only to find it clashes with your `0087_pcs_legacy_part_X.sql`.

**Who decides:** เดฟ (Phase A owner).

**✅ DECISION (เดฟ · 2026-05-18):** Option **(b) — split into 3**:
`0081_pcs_legacy_schema.sql` (tables + PKs) · `0082_pcs_legacy_indexes.sql`
(indexes + FKs + triggers) · `0083_pcs_legacy_member_seq.sql` (member-code
generator + gapfill). A single 4-5k-line file is unreviewable and slow to
re-run; the `0081-0083` block was reserved for exactly this. Load order:
apply `0081` → COPY the data → apply `0082` (indexes build one-shot on the
loaded data) → apply `0083`. **Your next free slot for new Phase-B
migrations = `0087`** (`0084-0086` are your renumbered Phase-C batch) —
draft `0087_status_vocab_reconcile.sql` against that.

---

## Q2 — Auth-bridge session creation pattern

**Context:** the auth bridge `lib/auth/pcs-legacy-password.ts` (shipped in `2b1c958`) verifies the legacy `passTam`-hashed password against `tb_user.userPass`.  Once verified, I need to put the customer into a real Supabase session so the rest of the protected app works.  Supabase doesn't have a "sign in with custom password" API — you have to create / mutate the auth.users row.

**Options:**
- **(a)** **createUser + admin.signInWithPassword** — on first legacy login, `supabase.auth.admin.createUser({ email: tb_user.userEmail || synthetic, password: <known-token>, user_metadata: { legacy_user_id } })`; then `signInWithPassword(email, <known-token>)`; rotate `<known-token>` after.  (Tricky: needs a known shared secret.)
- **(b)** **Magic-link bridge** — verify legacy password → `supabase.auth.admin.generateLink({ type:'magiclink', email: tb_user.userEmail })` → server-side honor the link → set session.  Cleaner but needs an email; not every legacy user has one.
- **(c)** **JWT-mint + cookie** — bypass Supabase auth entirely; mint our own JWT with `supabase-js`'s `setSession({ access_token, refresh_token })` using a service-role-signed JWT.  Fastest path but ก๊อต may flag (we own the JWT, no Supabase-managed refresh).
- **(d)** Custom — let me know if there's a Pacred pattern I'm missing.

**Why it blocks me:** B-auth (wire `verifyLegacyPassword` into `actions/auth.ts:signInWithPassword`) is the **2nd most critical Phase-B item** after schema swap.  Wrong pattern = security hole or session-management mess.

**Who decides:** ก๊อต (auth posture) + เดฟ (Phase-A consistency).

**🟡 DECISION (เดฟ lean · 2026-05-18 — needs ก๊อต ratification):** Option
**(a), refined to drop the shared-secret smell.** On first legacy login,
*after* `verifyLegacyPassword` passes, you already hold the customer's
plaintext password (they just typed it) — provision the Supabase user with
**that same password**: `admin.createUser({ phone, password: <the plaintext
just verified>, phone_confirm: true, user_metadata: { legacy_user_id } })`,
then `signInWithPassword({ phone, password })`. No shared secret; the bridge
runs **once per customer** (first login only) — every later login is plain
Supabase auth. **ก๊อต must ratify the posture before B-auth ships** — wire it
against this pattern but mark it provisional. Identifier note: use the
`tb_user` phone where present; for phone-less rows fall back to a synthetic
email and flag the list to เดฟ.

---

## Q3 — 8 special userIDs (`PCSTT` / `PCSCARGO` / `PCSARNON` / `PCSFAM` + `PW` / `JET` / `FCL` / `AIGA`)

**Context:** the legacy `tb_user.userID` is mostly `PCS<int>` (e.g. `PCS1234`).  The D1 rebrand maps `PCS<int> → PR<int>` (e.g. `PR1234`).  But 8 special userIDs in the legacy data have letter suffixes (`PCSTT`, `PCSCARGO`, `PCSARNON`, `PCSFAM`) or no PCS prefix at all (`PW`, `JET`, `FCL`, `AIGA`).

**Options:**
- **(a)** Keep them VERBATIM — `PCSTT` stays `PCSTT`, `PW` stays `PW`.  The `PR` rule only applies to `PCS<int>` rows.  Pro: simplest; existing customers + staff already know these names.  Con: the rebrand promise "PCS→PR" leaks.
- **(b)** Rewrite ALL — `PCSTT → PRTT`, `PCSCARGO → PRCARGO`, `PW → PR_PW` (or similar prefix).  Pro: clean.  Con: ~staff who know `JET` etc by sight will be confused; ~exists in years of receipts/invoices already printed.
- **(c)** Rewrite the `PCS<letters>` group, KEEP the no-prefix group — `PCSTT → PRTT` but `JET` / `FCL` / `AIGA` stay verbatim (probably partner/operator names, not numbered customers).

**Why it blocks me:** the legacy lookup pattern `WHERE userID = ?` becomes `WHERE pr_id = ?` (or however we name it) — I need the actual identity-mapping function correct, otherwise migrated customers can't sign in.

**Who decides:** เดฟ.  Suggest: **(c)** for principled mapping with minimal disruption.

**✅ DECISION (เดฟ · 2026-05-18):** Option **(c)** — rewrite the `PCS<letters>`
group (`PCSTT→PRTT` · `PCSCARGO→PRCARGO` · `PCSARNON→PRARNON` · `PCSFAM→PRFAM`);
keep the no-prefix group **verbatim** (`PW` · `JET` · `FCL` · `AIGA` —
partner/operator handles, not numbered customers). The converter then has two
rewrite rules — `PCS<int>→PR<int>` and `PCS<letters>→PR<letters>` — and touches
nothing else.

---

## Q4 — New-customer numbering after migration

**Context:** legacy `tb_user.userID` ran `PCS1`..`PCS<highest>`.  After Phase-A migration, the highest migrated number is `PR<N>`.  When a new (post-migration) customer signs up, what's the next ID?

**Options:**
- **(a)** **Strict monotonic** — `PR<N+1>`.  Pro: never re-uses an ID, even if a low-numbered legacy user is deleted.  Con: skips re-using vacant low numbers.
- **(b)** **Lowest-vacant** — find the smallest unused `PR<n>` starting from `PR1` (the brief mentions "PR1-PR5 (lowest-vacant rule)" — sounds like ก๊อต's intent).  Pro: tidies up vacancies.  Con: re-uses IDs of deleted customers (rare in PCS — usually `userStatus=0` not deletion).
- **(c)** Hybrid — strict monotonic but with explicit "reseed" for the documented vacant numbers `PR1-PR5` (which never existed in legacy).

**Why it blocks me:** the `tb_user` INSERT trigger (or the Pacred signup action) needs to generate the right ID.  If I pick wrong, we either lose the rebrand's tidiness OR collide with the legacy 0067 PCS migration scaffold.

**Who decides:** เดฟ.  Suggest: **(b)** lowest-vacant (matches the brief's wording).

**✅ DECISION (เดฟ · 2026-05-18):** Option **(b) — lowest-vacant.** A new signup
fills the smallest unused `PR<n>` from `PR1` up — `next_pr_member_code()` /
`member-code-gapfill.sql` (built for Phase A) already implements exactly this.
`PR1-PR5` never existed in legacy, so the first post-migration signups land
there.

---

## Q5 — Phase-C migrations (`0084-0086` — my pending work) apply order

**Context:** I have 3 migrations on `Poom` branch that are Phase-C work (BK-1.5 doc-attach · G2e-2 credit note · IC-1 work-chat).  They're additive — they add tables / extend CHECK constraints / no destructive ops.

**Options:**
- **(a)** **Apply ASAP** alongside Phase A — drop them into dev/prod as soon as Phase A loads.  They're independent of the `tb_*` schema; they touch `documents` · `tax_invoices` · `work_items` (Pacred-era tables).  Pro: Phase-C surfaces (BK-1, IC-1, R3) work end-to-end the moment env is ready.  Con: clutter during the faithful-port focus.
- **(b)** **Freeze until Phase B done** — keep them in branch, don't apply until Phase B is shipped.  Pro: zero distraction from the legacy-port focus.  Con: Phase-C code in `dave` is partially-functional (UI hits non-existent tables → runtime errors during dev).
- **(c)** **Apply 0084 (doc-attach) only** — the booking-flow already uses `documents` so this prevents runtime errors; the other 2 wait.

**Why it blocks me:** affects what I tell ภูม to run when applying migrations in dev/prod.  Also affects whether I keep maintaining the Phase-C code or treat it as frozen.

**Who decides:** เดฟ.  Suggest: **(b)** freeze — keeps Phase B focused; the Phase-C UI surfaces (`/book`, `/admin/board` thread panel, etc.) are not in legacy workflow scope anyway, so customers won't notice they're inert.

**✅ DECISION (เดฟ · 2026-05-18):** Option **(b) — freeze.** `0084-0086` stay in
the repo but are **NOT applied** to dev/prod until Phase B ships. The DB-1
backlog ภูม applies is therefore **`0058`-`0080` only** (22 migrations) —
`pcs-data-migration.md` §9 + `migrations/README.md` updated to match. Apply
`0084-0086` later, alongside Phase C.

---

## Q6 — Member segmentation flags (`tb_user.userType` — VIP / SVIP / นิติบุคคล / เครดิต)

**Context:** the legacy `tb_user` carries a `userType` (or similar) flag that drives different views/policies — VIP gets priority badges, SVIP higher discount, นิติบุคคล (juristic) shows tax-invoice UI, เครดิต (credit line) shows credit balance.  Pacred's rebuilt `profiles` has separate columns (`account_type='personal'|'juristic'`, `customer_group`, credit_balance via wallet table).

**Options:**
- **(a)** **1:1 carry** — bring `userType` over as `tb_user.userType` and read directly.  Pro: simplest; legacy admin tooling that queries by `userType` keeps working.  Con: Pacred's split (`account_type` + `customer_group` + credit-balance) is more normalised — we'd lose that during the transition.
- **(b)** **Remap on read** — keep `tb_user.userType` as legacy truth but expose a derived view that maps to Pacred's split shape.  Pro: best of both worlds.  Con: more work.
- **(c)** **Drop the legacy `userType`** — populate Pacred's split fields on Phase-A migration + retire `userType` immediately.  Pro: cleanest.  Con: any legacy SQL the team kept (or เดฟ's accounting reports) breaks.

**Why it blocks me:** the per-role admin sidebar (B-4) needs to filter customers by segmentation — I need to know which column to query.

**Who decides:** เดฟ.  Suggest: **(a)** for Phase B (faithful port = faithful), then **(b)** as a Phase-C polish (a clean view layer).

**✅ DECISION (เดฟ · 2026-05-18):** Option **(a) for Phase B** — carry
`tb_user.userType` 1:1 and read it directly (faithful port = faithful; the
legacy admin tooling + the B-4 per-role sidebar query `userType` as-is). The
normalised view mapping to Pacred's `account_type` + `customer_group` + credit
split is **(b) — a Phase-C polish**, not now.

---

## Quick-decision summary table

| Q | What | ✅ Decision (เดฟ · 2026-05-18) | Status |
|---|---|---|---|
| Q1 | Phase-A migration filename / split | **(b)** split 3 → `0081`/`0082`/`0083`; ภูม's next free = `0087` | ✅ decided |
| Q2 | Auth-bridge session pattern | **(a) refined** — provision on first login with the customer's own password (no shared secret) | 🟡 เดฟ lean — **needs ก๊อต** |
| Q3 | 8 special userIDs | **(c)** rewrite `PCS<letters>`, keep the no-prefix group verbatim | ✅ decided |
| Q4 | New-customer numbering | **(b)** lowest-vacant (`next_pr_member_code()`) | ✅ decided |
| Q5 | Phase-C migrations `0084-0086` apply order | **(b)** freeze — DB-1 backlog = `0058`-`0080` only | ✅ decided |
| Q6 | `userType` segmentation | **(a)** 1:1 carry for Phase B; **(b)** view = Phase C | ✅ decided |

---

## Where I am while waiting

Per [`poom-phase-b-prep.md`](poom-phase-b-prep.md) §4 "What I can do NOW":
- ✅ Renumbered my migrations to free `0081-0083` for เดฟ Phase A
- ✅ Drafted the per-stage Phase-B prep (the file above)
- 🟡 Can wire **B-auth** code (waiting Q2 + dev row to test)
- 🟡 Can draft **0087_status_vocab_reconcile.sql** (waiting Q1 to confirm number)
- 🟡 Can draft **0088_admin_role_triple.sql** (B-4 prep — waiting Q1 / Q6)
- ⏸ Phase-C work is paused per ADR-0017 (already-shipped commits stay in branch)

Ping me on LINE when answers land — I'll roll right into the next stage.

— ภูม (`Poom` branch · 2026-05-18)
