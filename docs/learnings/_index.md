# 📚 Pacred Learnings — index

> Every agent / dev / session that learns something tricky writes it here.
> Future agents read this BEFORE re-discovering. Knowledge compounds.

> **Skill that writes here:** [`.claude/skills/scholar-immortal/`](../../.claude/skills/scholar-immortal/SKILL.md)
> **Protocol:** read SKILL.md; add a dated entry to the right topic file (or create a new topic file + add to this index).

Last reviewed: **2026-05-26 ค่ำ — agent-orchestration NEW** (6 lessons from Wave 20 mega-session orchestrating 8 parallel agents: stale worktree base needs `git reset --hard` not `merge` · agent dual-write absolute paths land in MAIN worktree too — trust-but-verify with `git status` post-completion · API timeout on multi-step prompts — scope cut to 1 responsibility per agent · PostgREST silently caps `select` at 1000 rows — use `count: "exact", head: true` for true counts · PEAK-style hub chrome pattern from pi-pop preference · §0c "route smoke is NOT sufficient" — 4-check Chrome MCP click-through after every rewrite). 2026-05-23 night (supabase-rls-patterns +1 — PgBouncer + PostgreSQL sequence cache trap: ALTER SEQUENCE / DROP+CREATE / CACHE=1 / setval all FAIL to invalidate pool-session pre-allocated batches; sessions keep emitting cached values for hours. Visible symptom = `select nextval()` returns new range from Dashboard but trigger fires keep emitting old range. Workaround: abandon sequences for predict-value logic — use `MAX()+1` query + UNIQUE constraint. Spent 4 hrs on Wave 13 PR-collision fix before this clicked; migration 0095 rewritten to MAX()+1, prod confirmed). 2026-05-23 (supabase-storage-bulk-upload +1 — backfill 05 shipped 732 more files (107.6 MB) from `newrealdatapcs/pcscargo.rar` to prod: `wp-content/uploads/` (694) + `shop/*` (32) + `member/{pcs-admin,img,sms}` (6) → `member-docs/legacy-{wp,shop,pcs-admin,misc}/`; 0 failed in 24 s. Key reframe — `newrealdatapcs/pcscargo.rar` byte-equals local `pcscargo/`, so prod-only dirs `images/forwarder/` + `images/cnt/` + historic slips STILL need an rsync/scp/PHP-dump from the live host. Running total on Supabase: 892 files). 2026-05-22 (supabase-storage-bulk-upload +1 — backfill 03/04 shipped 8 wallet slips → `slips/legacy/` + 2 docs → `member-docs/legacy/storage-file/` on prod; key finding: the LOCAL `pcscargo/member/` dev dump is NOT a complete mirror of prod — `images/forwarder/`, `images/cnt/`, and per-shipment cargo photos exist ONLY on the live host and need an rsync/scp/PHP-dump pass before they can be back-filled). 2026-05-19 (pacred-domain-knowledge +1 + php-port-patterns +1 — ภูม's legacy PCS Cargo system research captured: 4 verbatim files copied to `docs/research/pcs-legacy/`, the durable business logic synthesized — 3 revenue services + `tb_*` schema + `sStatus`/`fStatus`/`wType` enums + chargeable-weight & service-fee formulas + VIP-credit & agent-commission rules + the forwarder pay-at-status-5 post-arrival COD inversion; port-mechanics facts: legacy status columns are numeric VARCHAR strings, the forwarder uses per-status DATETIME columns not a history table, `tb_wallet.wBalance` is a stored running balance). 2026-05-19 (php-port-patterns +1 — MySQL→PostgreSQL via pgloader: connects to MySQL 9.x with no `caching_sha2` workaround; one CAST rule kills the zero-date NOT-NULL trap; MySQL collation is case-INSENSITIVE so join-key columns must be case-normalised in the port; `notnull`/`isnull` are PG postfix operators not bare aliases; a Supabase data load needs the Postgres DB password — REST API keys can't run DDL/COPY). 2026-05-18 (php-port-patterns +1 — MySQL→PostgreSQL data-migration gotchas: NUL bytes in legacy `varchar` break a Postgres `COPY`; legacy `datetime NOT NULL` columns hold `0000-00-00` so temporal columns must port NULLABLE; convert via a live local MySQL not dump-text-munging. 2026-05-17 — nextjs-16-quirks +1 — a `server-only` module reaching a Client Component transitively breaks `next build` but passes `tsc`/`verify`; ci-and-deploy-gotchas +1 — worktree smoke needs `.env.local` + rebuild; supabase-rls-patterns +1 — `wallet.balance` is pending-blind, spend gates must use the available-balance helper; ci-and-deploy-gotchas +1 — a "bug on branch `dave`" can be a stale-worktree phantom, verify against the live `dave` worktree; ci-and-deploy-gotchas +1 — worktree-isolation agents you spawn branch from `origin/main`, brief them to resync to `dave`; ci-and-deploy-gotchas +1 — a `next start` + curl smoke does NOT detect a dead database, public pages degrade + protected pages redirect before the DB call)

---

## Topic files

| Topic | What's captured | Last entry |
|---|---|---|
| [`ci-and-deploy-gotchas.md`](ci-and-deploy-gotchas.md) | GitHub Actions · Vercel · pnpm · env-audit · git pathspec literal-brackets · Node fetch timeouts (IPv4-first DNS) · build/verify green ≠ prod (next-start smoke gate) · worktree smoke needs `.env.local` copy + rebuild · stale-worktree phantom bugs (verify vs the live `dave` worktree) · spawned worktree-isolation agents branch from `origin/main` not your working branch · a next-start+curl smoke can't detect a dead database | 2026-05-17 |
| [`nextjs-16-quirks.md`](nextjs-16-quirks.md) | Next 16 + JSX gotchas (JSDoc `*/` · unescaped-entities · Zod UUID v4 · Turbopack route-cache · theme desync · generateStaticParams+auth → DYNAMIC_SERVER_USAGE · server-only transitive import → Turbopack build fail · React 19 `react-hooks/purity` rejects raw `Date.now()`/`new Date()` in render — wrap in named helper) | 2026-05-23 |
| [`supabase-rls-patterns.md`](supabase-rls-patterns.md) | RLS patterns + admin-client-after-ownership-verify for customer mutations · check-then-act money-race → DB unique index · `wallet.balance` is pending-blind → spend gates use `getWalletAvailableBalance` · `{rows.length}` is a lie when `.limit(N)` is set — use `count: "exact", head: true` · **PgBouncer + PostgreSQL sequence cache: ALTER never invalidates pool-session pre-allocated batches → abandon sequences for predict-value logic, use MAX()+1 query instead** | 2026-05-23 |
| [`i18n-pitfalls.md`](i18n-pitfalls.md) | next-intl / messages/*.json gotchas | 2026-05-15 |
| [`perf-patterns.md`](perf-patterns.md) | Performance wins + measurement | (empty seed) |
| [`testing-patterns.md`](testing-patterns.md) | Pacred-specific test mocks + harness quirks | 2026-05-16 |
| [`partner-apis-quirks.md`](partner-apis-quirks.md) | MOMO JMF / TAM / ThaiBulkSMS / LINE behavior · DBD juristic lookup | 2026-05-17: DBD `api/v1` retired (404) + CKAN behind Incapsula WAF — register degrades to manual entry |
| [`php-port-patterns.md`](php-port-patterns.md) | Legacy `pcscargo` port gotchas · MySQL→PostgreSQL data migration (NUL bytes break COPY · zero-dates vs NOT NULL · live-DB convert · pgloader path · MySQL case-insensitive collation → normalise join keys · `notnull` is a PG operator · Supabase load needs the DB password) · legacy PCS `tb_*` schema reference (numeric-VARCHAR status cols · per-status DATETIME columns · stored running wallet balance) | 2026-05-19 |
| [`pacred-domain-knowledge.md`](pacred-domain-knowledge.md) | Cargo flow + MOMO 9-status enum + containers schema coexistence + decoded cargo/freight ops model (GZE/GZS · type taxonomy · CBM mismatch · Form E / D-O) · **legacy PCS Cargo full decode** (3 revenue services · `tb_*` schema · `sStatus`/`fStatus`/`wType` enums · chargeable-weight & fee formulas · VIP-credit & agent-commission rules · forwarder pay-at-status-5 COD) | 2026-05-19 |
| [`supabase-storage-bulk-upload.md`](supabase-storage-bulk-upload.md) | Backfill script pattern (service-role · `upsert:true` for small idempotent batches · self-contained `.env.local` loader) · ASCII vs Thai filename safety · **`newrealdatapcs/pcscargo.rar` byte-equals local `pcscargo/`** · running tally 892 files on Supabase (incl. wp-content/uploads + shop demo) · **prod-only dirs `images/forwarder/` + `images/cnt/` + historic slips STILL need rsync/scp/PHP-dump from the live host** | 2026-05-23 |
| [`audit-discipline.md`](audit-discipline.md) | **Audit from PHP SOURCE, not HTML paste** — legacy `*.php` is multi-mode dispatcher (HTML shows ONE mode of N) · 6-step protocol when ภูม asks "is this faithful" · parallel-agents strategy when scope > 10 files · the 2026-05-25 miss-case (report-cnt mode-b + forwarder-check both missed because I trusted ภูม's pasted HTML) | 2026-05-25 |
| [`verify-deep-flow.md`](verify-deep-flow.md) | **Never claim "wave clean" on smoke-test alone** — 2 case-study bugs (invisible Windows scrollbar on /customers + silent Supabase-error → 404 on /customers/[id]) · 5-step click-through protocol (route-smoke + row-click + overflow-measure + error-destructure + explicit verified-vs-not report) · safe Supabase destructure pattern · visible-scrollbar table pattern | 2026-05-25 |
| [`pacred-design-philosophy.md`](pacred-design-philosophy.md) | Legacy = workflow source of truth · our UI = our design (Tailwind > BS4 verbatim) · 6 steps before shipping faithful port · proactive comparison not waiting for ภูม to flag | 2026-05-23 |
| [`pacred-order-taxonomy.md`](pacred-order-taxonomy.md) | The 3 services (ฝากสั่งซื้อ · ฝากนำเข้า · ฝากโอน) + their tables + the shop → forwarder auto-spawn that confuses everyone · 4-tab filter on `/admin/forwarders` decoded · badge truth table · current Pacred port gaps | 2026-05-25 |
| [`agent-orchestration.md`](agent-orchestration.md) | **NEW** — Wave 20 lessons orchestrating 8 parallel agents: stale base needs `git reset --hard origin/<branch>` (not `merge`) · agent dual-write to MAIN worktree via absolute paths · API timeout — scope cut to 1 responsibility per agent · PostgREST silent 1000-row cap on `select` (use `count: "exact", head: true`) · PEAK-style hub chrome (PageTopMenubar + segment pills + cards) · §0c click-through is NOT optional (curl 307 hides everything) | 2026-05-26 |

---

## Related research (full evidence, not learnings)

Learnings are *synthesized* — for the raw source material a synthesis draws from:

| Research | What it is |
|---|---|
| [`docs/research/pcs-legacy/`](../research/pcs-legacy/_index.md) | ภูม's 4-file verbatim decode of the legacy **PCS Cargo** PHP system (business flow · full `tb_*` schema · staff guidebook · dev docs) — the SOT for the D1 1:1 port. Synthesized into `pacred-domain-knowledge.md` (2026-05-19) + `php-port-patterns.md`. |
| [`docs/research/`](../research/_index.md) | The wider R&D / audit / gap-hunt folder. |

---

## How to add an entry

```bash
# 1. Pick the right topic file. Create new if no fit.
# 2. Append to the END (chronological — never replace, never edit past entries).
# 3. Use the template from .claude/skills/scholar-immortal/SKILL.md.
# 4. Commit:
git commit -m "docs(learnings): <topic> — <short summary>"
```

---

## Re-read cadence

- **Every session start** — scan this index for any new topic / date you haven't seen.
- **Before fixing a bug** — grep `docs/learnings/` for the symptom keywords (see `bug-swarm-loop` hunter 5).
- **Weekly** — เดฟ skim through new entries on Friday integration window.

---

## Patterns to look for over time

As entries accumulate, watch for:
- **Repeated entries on same topic** → the underlying issue is systemic; consider an ADR or refactor
- **Topics that haven't gained entries** → either the area is stable OR no one's working there (worth investigating which)
- **Entries that contradict each other** → behavior changed; mark older entry as superseded with a forward pointer

---

## Why this directory exists

The user (เดฟ) described it as: *"นักปราชญ์ผู้เป็นอมตะ"* — immortal scholar. Every learning persists. Future Claude Code sessions inherit. Pacred-specific knowledge that no LLM training has = our compounding moat.

Cross-link: [`docs/STRATEGY.md`](../STRATEGY.md) §12 · [`.claude/skills/scholar-immortal/SKILL.md`](../../.claude/skills/scholar-immortal/SKILL.md).
