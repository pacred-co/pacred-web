# ⚡ Performance survey + backlog — 2026-06-04 (owner: "platform ช้า·หน่วง · ห้ามทำงานบัค/งานหาย")

Read-only survey (agent + hand-verification). Owner's hard guardrail: **NO new bugs / no lost work** — so this auto-applies NOTHING risky; it documents a risk-labeled backlog + the one thing that actually unblocks perf work: **measurement**.

## 🟢 Headline finding — the obvious DB-index wins are ALREADY DONE
The agent flagged "add indexes on the hot filter columns." Verified against the migration history: **migration 0109 (Wave 21, "23 partial indexes", applied prod — confirmed admin chrome 1.5-3s → 100-300ms)** + the tax-doc migrations already created the needed B-tree/partial indexes:
- `tb_forwarder`: `userid`, `userid+fstatus`, `fstatus`, `ftrackingchn`, `fdate_desc`, `userid+fcredit`, + ~10 partial indexes (credit_open, cabinet_pre_arrival, …)
- `tb_header_order`: `userid`, `userid+hstatus`, `hstatus`, `hdate_desc`
- `tb_payment`: `userid`, `paystatus`, `paydate_desc`, `slip_transfer_time`
- `tb_wallet_hs`: `userid_id_desc`, `status_amount` (pos/neg), `type_status_date`
- `tb_users`: `useractive_pending`, `company_active_pending`, `lastlogin_desc` · `tb_cart`: `userid`

∴ The per-user counts (pcs-chrome) + admin dashboard fan-out + status filters are already index-backed. **There is no simple additive-index migration left to write that would meaningfully help.** (The agent didn't check existing migrations — its recurring over-flag pattern.)

## 🔴 The real remaining slowness needs MEASUREMENT, not guessing
The slow points the agent named that AREN'T already fixed are all `.ilike("%term%")` keyword searches (admin customer/forwarder search, product search). A **leading-wildcard `%term%` cannot use a B-tree index** — it needs a **pg_trgm GIN trigram index** (an extension + GIN = a Phase-C change, not a safe 1-liner). Adding plain B-trees there would NOT help.

**Recommendation (the highest-leverage perf action + serves "monitor ทุกอย่างในระบบเราเอง"):** activate **Sentry performance monitoring** — it's ALREADY code-wired (`@sentry/nextjs`, gated on `NEXT_PUBLIC_SENTRY_DSN`; CLAUDE.md). Set the DSN in Vercel → Sentry reports the *actual* slow transactions/queries in prod. Optimizing by measurement (not by guessing on a 47k/104k-row table) is the only way to fix perf without risking a regression. Without it we're guessing; with it we target the real P95.

## 🟠 CODE-CHANGE backlog (regression risk → human review before shipping; NOT auto-applied)
1. **`actions/contact.ts` ~L80** — admin-notify loop is sequential `await` in a `for`; → `Promise.all(map(sendNotification))`. Low-risk (best-effort sends) but a notify path → review. Low frequency (contact form) = small win.
2. **`actions/orders.ts` L41** — `listOrders()` unbounded `.select("*")` — but `orders` is the rebuilt **empty/demo** table (0 rows on prod) → no impact today; add `.limit(100)` when/if it's used.
3. **Customer/admin keyword search `.limit()`** — adding a cap risks **silently truncating** real results (a customer with >N matching shipments would lose rows) → violates "ห้ามงานหาย" unless paired with a "refine search / showing first N" UX. Do WITH the UX, not alone.
4. **pcs-chrome cache warming** — 17 queries on 60s-TTL cache miss; a warm-cron for the most-active customers avoids cold-nav stalls. Code-change (cron) → review.
5. **Phase C:** pg_trgm GIN on `tb_product.pnameth` + `tb_forwarder(ftrackingchn,fcabinetnumber,fidorco)` + `tb_users(userName,userTel)` for fast substring search; DB-side SUM RPC for wallet totals (vs the 9k-row JS reduce, already 60s-cached).

## Why nothing was auto-applied tonight
Every safe-additive index already exists; every remaining item is either a behavior-changing code edit (truncation/parallelization/caching) or a Phase-C extension. Under the owner's explicit "ห้ามทำงานบัค งานหาย · สำคัญมากๆ", guessing-optimization on the busiest tables is the wrong trade. The correct next step is **measure (Sentry) → fix the proven P95**, then apply the reviewed CODE-CHANGEs above. Survey source: agent `ae59eb5d` (15 findings, deduped here against the migration history).
