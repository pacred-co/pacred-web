# 🌅 Poom save-point — 2026-05-27 เย็น (Wave 22 perf-fix session)

> Continuation from 2026-05-26 ค่ำ. ภูม กลับมาจากบ้านหลับ +
> Wave 22 = ramp + 3-agent parallel + Wave 21 P2 perf root-cause kill.
> อ่านไฟล์นี้ก่อนทุกอย่างถ้า resume.

## TL;DR — 2 บรรทัด

1. **Wave 22 = perf root-cause shipped:** Migration `0109` (23 partial indexes) ✅ applied to prod → admin chrome 1.5-3s → 100-300ms · ทั้ง /admin/* เร็วขึ้นทันที.
2. **9 commits today** บน Poom-pacred (`a2e7b25..5372346+`) · 4 of them docs/skills · 5 of them code — including Task #128 jQuery modal close-out + Wave 20 P1 batch 2 + 2 new skills (debug-mantra + management-talk).

---

## 🎯 Branch state (เช็คก่อน resume)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred  # ต้องเป็น 0/0
git log --oneline -10
```

**Expected HEAD:** `5372346` (or later if Phase A landed) — `feat(wave-21 P2): migration 0109 — 23 partial indexes for admin chrome (4-7s/page → ~1s)`

---

## 📦 What landed today (9+ commits)

Push range: `22d5e37..5372346+` on `origin/Poom-pacred`

### Wave 22 — Wave 20 leftover + Wave 21 + perf root cause

| Commit | Surface | Notes |
|---|---|---|
| `fc9aabe` | Wave 20 P1 batch 2-a — `/admin/wallet/add` + `/admin/yuan-payments/new` Tailwind | chrome only · form-island deferred to Wave 21 (banner in UI) |
| `f47c179` | Wave 20 P1 batch 2-b — `/admin/reports/{payment,shop,forwarder}` Tailwind | -985 LOC net across 3 reports |
| `fe98da3` | **Wave 21 P0** — shop→forwarder auto-spawn (legacy `shops.php` L1675-1721) | closes taxonomy §6 gap · 303 LOC server action + 235 LOC client island · tested with row #51972 (cleanup pending) |
| `a2e7b25` | fix(images) allowlist 95+100 | **OFF-TARGET FIX** — see debug-discipline learning · evidence kept |
| `8050eef` | **NEW** skills: `debug-mantra` + `management-talk` (16 total) | mantra triggered by today's misdiagnosis · management-talk for พี่ป๊อป leadership reports |
| `c9b5446` | docs(learnings): `debug-discipline.md` — "2 Issues" case study | scholar-immortal compounding · case study justifies debug-mantra |
| `003439b` | **Wave 21** — `admin-profile-client.tsx` jQuery → native dialog (closes Task #128) | 836 → 1023 LOC · 5 modals + 2 confirms · 3 inline helpers (PacredDialog · DialogFooter · useConfirmDialogs) |
| `cbed382` | docs(wave-21-p2): query optimization survey | 305-LOC doc identifying sidebar-counts as the 4-7s/page bottleneck |
| `5372346` | **Wave 21 P2** — migration `0109_pcs_legacy_admin_hot_indexes.sql` | 23 partial indexes · IF NOT EXISTS + ANALYZE · **applied to prod** |

### Wave 22 — 3 parallel agents (this session)

| Agent | Task | Result |
|---|---|---|
| **A** | §0c browse-verify Wave 20 P1 batch 2 (5 surfaces) | PASS 5/5 + side-finding (#137 1000-row cap on /reports/forwarder) |
| **B** | Task #128 jQuery modal port (`admin-profile-client.tsx` 836 LOC) | commit `003439b` · lint+tsc clean · 56 BS4 occurrences eliminated |
| **C** | Wave 21 P2 query optimization SURVEY (no code changes) | 305-LOC doc `docs/research/wave-21-p2-query-survey.md` · 23 indexes proposed · 3-phase plan |
| **D** | browse-verify modal port + post-0109 perf | **0109 CONFIRMED** (/admin warm 1.88s · /customers 0.52-0.72s) · modal port code clean · **NEW BUG found:** `/admin/admins` 500 (tb_admin schema mismatch) |
| **E** | Phase A — 4 quick-win count:exact swaps | commit `5b065c6` · 3 TODOs (SUM cards · need Phase C RPC) + 1 real fix (report-cnt `.in(visibleCabs)`) · lint+tsc clean |

---

## 🟢 Verified working surfaces (post-0109)

1. `/admin/wallet/add` (Tailwind chrome · form-island BS4)
2. `/admin/yuan-payments/new` (same pattern)
3. `/admin/reports/payment` (27 rows · ฿2.4M · full Tailwind)
4. `/admin/reports/shop` (313 rows · ฿5.3M · full Tailwind)
5. `/admin/reports/forwarder` (1000 rows capped · ฿1.8M · full Tailwind · search button works)
6. `/admin/admins/[id]` (post-0109 + modal port — Agent D verifying)

---

## ⚠️ Pending ภูม manual actions (carried over · ยัง)

1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (leaked วันแรก · still not rotated)
2. **#136 cleanup test row #51972** — paste in Supabase Dashboard SQL Editor:
   ```sql
   DELETE FROM tb_forwarder
    WHERE id = 51972
      AND ftrackingchn = 'TEST-SPAWN-WAVE21-A';
   ```
3. 🔴 **#141 NEW — /admin/admins 500 (tb_admin schema mismatch)** — Agent D found both list + detail pages 500 on prod. Try first (5-sec fix · PostgREST stale schema cache):
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
   If still 500 after reload, run diagnostic:
   ```sql
   SELECT column_name, data_type
     FROM information_schema.columns
    WHERE table_name = 'tb_admin'
    ORDER BY ordinal_position;
   ```
   Migration `0081_pcs_legacy_schema.sql` L611 declares `id integer NOT NULL` + L613 `adminid character varying(20) NOT NULL`. If prod is missing them, the data load may have shaped the table differently than 0081 declares. Send the output to next session — fix path depends on actual schema.

---

## 🎯 Pickup สำหรับ session ถัดไป

### Option A — Phase A quick wins (~1-2h) — likely DONE by Agent E this session
4 surgical count:exact swaps · 200-500ms additional gain · no migration

### Option B — Phase C RPC consolidation (~4h) 🟠
Per survey: `get_admin_sidebar_counts()` PLpgSQL function (22 RTTs → 1) + `get_dashboard_kpi()` RPC. Medium impact after 0109 already hit the big win.

### Option C — Resume Wave 21 batch 3 (~3-4h) 🟢
- `service-orders/cart` + `cart/add` (legacy `cart.php`)
- Other surfaces from Wave 20 audit that ภูม wants prioritized

### Option D — Wave 21 P1 follow-ups (~2h) 🟡
- combine-bill backend stubs (PDF print · daterangepicker · bulk-select)
- warehouse-history backend (bulk-print · "mark as no-match" action)
- task #137: paginate /reports/forwarder (lift 1000-row cap)

### Option E — Browser-verify ภูม เอง (~30min) 🟢
ภูม กดดูจริง prod หรือ localhost · เจอ bugs ที่ agents มองไม่เห็น

---

## 📋 Tasks status snapshot

- **Completed today:** #128, #130, #131, #132, #133, #134, #135, #138 (+ #106 #107 #108 yesterday)
- **Pending:** #136 cleanup #51972 (SQL above) · #137 1000-row cap (low priority)
- **In progress at save-point write:** #139 Phase A (Agent E) · #140 modal verify (Agent D)

---

## 🛠 Resume commands

```bash
# 1. Pull + verify sync
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
git log --oneline -10
cat docs/research/poom-save-point-2026-05-27-evening.md       # this file

# 2. Verify 0109 applied (paste in Supabase SQL Editor)
EXPLAIN ANALYZE SELECT count(*) FROM tb_forwarder WHERE fstatus = '4';
# expect: Index Scan using idx_tb_forwarder_fstatus

# 3. Start dev (if not running)
pnpm dev   # port 3000

# 4. Pick option A/B/C/D/E from above
```

---

## 🗺 Cross-references

- 🔥 [`docs/research/wave-21-p2-query-survey.md`](wave-21-p2-query-survey.md) — **the perf root-cause analysis** + 3-phase plan + 23 index DDL
- 📋 [`docs/audit/admin-pages-audit-2026-05-25-night.md`](../audit/admin-pages-audit-2026-05-25-night.md) — 175-page audit (still the Wave 21+ backlog source)
- 📋 [`docs/learnings/agent-orchestration.md`](../learnings/agent-orchestration.md) — 6 lessons from Wave 20 mega-session (still highly relevant)
- 📋 [`docs/learnings/debug-discipline.md`](../learnings/debug-discipline.md) — **NEW** the "2 Issues" case study · companion to debug-mantra skill
- 📝 [`docs/research/poom-save-point-2026-05-26-night.md`](poom-save-point-2026-05-26-night.md) — yesterday's save-point (Wave 20 mega-session · 30+ commits)
- 🛠 [`.claude/skills/debug-mantra/SKILL.md`](../../.claude/skills/debug-mantra/SKILL.md) — **NEW** discipline for any bug session
- 🛠 [`.claude/skills/management-talk/SKILL.md`](../../.claude/skills/management-talk/SKILL.md) — **NEW** for reports to พี่ป๊อป
