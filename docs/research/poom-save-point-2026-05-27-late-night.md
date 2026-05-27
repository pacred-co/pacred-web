# 🌙 Poom save-point — 2026-05-27 ดึก (Wave 24 close-out + audit · final)

> **Resume doc** for tomorrow's session. ภูม said "เซฟงานได้เลย" after the
> Wave 23+24 close-out batch + a 19-surface Chrome MCP audit pass.
> Supersedes the earlier-tonight saves (`poom-save-point-2026-05-27-night.md` ·
> `poom-save-point-2026-05-27-mega-day.md`) — those still useful for
> historical context, this is the freshest "what's now and what's next".

---

## 📦 What landed (8 commits ดึก · range `cf018cf..f4d0b1b` on Poom-pacred)

```
f4d0b1b docs(audit): Wave 24 click-through — 19 surfaces verified · 2 P1 findings
eccbb4f fix(wave-24 #189): pagination on 4 more admin reports — drop silent 1000-caps
cfd8f9a docs(tech-debt): mark Wave 23 + 24 close-out — 18 of 19 items resolved
342a5d1 chore(wave-24 #189 follow-up): bump cnt-hs/[id] forwarder cap 1000 → 5000
22dd746 fix(wave-24 #185): /admin/reports/payment pagination — drop silent 1000-cap
52397c9 fix(wave-24 #188): remove dead /admin/search links from cart page header
d079aa9 feat(wave-24 #187): SKU variant picker for admin link-paste search
14ec930 fix(wave-24 #186): TAMIT product-detail URL — bump /api-product → /api-product-2026
```

All pushed to `origin/Poom-pacred` · `0/0` synced.

---

## 🟢 Wave 24 verified working (browser-tested this session · 19 surfaces)

**Wave 23/24 fixes:**
- `/admin/service-orders/cart/add` — TAMIT link-paste + variant picker E2E (Taobao
  44124243495 → 6 colors + 22 sizes → tb_cart row #212956 with `ccolor='豆沙粉…'`
  `csize='60#…'` `cprice=¥57.00` SKU-specific · then deleted test row)
- `/admin/service-orders/cart` — top strip cleaned (no dead `/admin/search` links)
- `/admin/reports/{payment,refunds,shop,shops-profit-pay,pending-payments,forwarder}`
  — pagination working · payment: 717 rows · shop: 5 pages
- `/admin/cnt-hs` — "คลิกเพื่อดูทั้งหมด 91 ตู้" client island works on heaviest rows
- `/admin/forwarders/[fNo]` — TbForwarderActionPanel renders + status combobox

**Critical revenue surfaces (Tier 2):**
- `/admin/dashboard` ลูกค้า 10,600 · ออเดอร์ 48,842
- `/admin/kpi` revenue ฿4M (ฝากสั่ง) + ฿1.8M (ฝากนำเข้า) + ฿1M (ฝากโอน) + ฿13K wallet
- `/admin/wallet`, `/admin/yuan-payments`, `/admin/service-orders`, `/admin/forwarders`,
  `/admin/admins`, `/admin/customers/PR10899` (was 500 — now fine)

Full audit doc: [`admin-click-through-audit-2026-05-27-wave24.md`](admin-click-through-audit-2026-05-27-wave24.md)

---

## 🟠 P1 issues SURFACED during audit (NOT introduced by this batch · pre-existing)

### Issue A — Intermittent Supabase `ConnectTimeoutError` (10000 ms)
- **Symptom:** sporadic 10s timeout connecting to `yzljakczhwrpbxflnmco.supabase.co:443`.
  When this fires on legacy fallback queries (e.g. `/admin/forwarders/[fNo]` falls through
  to `tb_forwarder` query), query returns null → `notFound()` → misleading 404 to admin
- **Repro this audit:** `/admin/forwarders/51971` first attempt → 22.4s app code → 404 ·
  second attempt (immediate) → works fine
- **Likely cause:** prod region throttle OR local Windows fetch IPv6/IPv4 DNS race
- **Fix:** longer timeout (15-30s) in `lib/supabase/admin.ts` + retry strategy +
  distinguish "row missing" vs "supabase timeout" in UI error banner (currently both
  silently produce `notFound()`)
- **Severity:** P1 — degrades UX but admin can refresh

### Issue B — `tb_admin` CamelCase column drift
- **Symptom:** prod `tb_admin` table preserved original MySQL CamelCase: `adminID`,
  `adminEmail`, `adminPass`, `adminName`. PostgREST returns `42703 column does not exist`
  when reading lowercase
- **18 actions/* files** still read lowercase (cart · combine-bill · wallet-trans ·
  forwarder-cost · etc.) — silently fall through to UUID fallback (defensive code), but
  pollute logs + degrade feature accuracy
- **Wave 22 oversight:** Phase 1 merged data into new `admins` table but didn't:
  (a) create a lowercase view bridging old code · or (b) sweep all 18 lowercase readers · or
  (c) drop `tb_admin` entirely + migrate readers
- **Fix options ranked:** (c) finish migration — sweep 18 actions/* to read `admins` table,
  then `DROP TABLE tb_admin CASCADE` · best long-term. (a) quick win = create
  `CREATE VIEW tb_admin_lc AS SELECT "adminID" AS adminid, "adminEmail" AS adminemail, ...
  FROM tb_admin;` · cheap immediate quiet. (b) most invasive but most explicit.
- **Severity:** P1 — log spam + silent feature degradation

---

## 📊 Wave 24 close-out scorecard (18 of 19 master tech-debt items resolved)

| Tier | Done | Deferred (design-call) | Don't-touch |
|---|---|---|---|
| P0 | 6/6 ✅ | — | — |
| P1 | 8/9 ✅ | #14 brand-red 2-shades | — |
| P2 | 3/4 ✅ | — | #19 13 faithful pages |

Plus 11 W24-1..11 follow-up items from THIS week (TAMIT bump · variant picker ·
cart cleanup · 5-page pagination · cnt-hs bump · forwarder UUID/cabinet/detail ·
1MB upload · test cleanup) — all closed in commits above.

Detailed close-out + remaining items: [`admin-tech-debt-master-2026-05-27.md`](admin-tech-debt-master-2026-05-27.md)

---

## 🎯 Tomorrow's pickup priority (recommended order)

1. **🔴 ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` — security carry-over
   since day 1 · ภูม manual (5 min in Supabase Dashboard → Project Settings → Storage →
   S3 Access Keys → rotate)

2. **🟠 Fix Issue A (Supabase timeout)** — `lib/supabase/admin.ts` · longer fetch
   timeout + retry · distinguish 404 vs timeout in UI. ~1 ชม.

3. **🟠 Fix Issue B (tb_admin sweep)** — option C: migrate 18 actions/* to read
   `admins` table not tb_admin. ~2-3 ชม via parallel agents (3 agents × 6 files each).

4. **🟡 Tier 3 audit** — ~150 untested admin routes (barcode/hr/accounting subpages/qa/
   rates/settings/etc). Split into 5 batches of 30 per worktree-isolated agent. ~3-4 ชม
   wallclock with parallel agents.

5. **🟡 Mobile viewport audit** — per AGENTS.md §6 · 360/390px on customer-facing
   surfaces. ~1 ชม.

6. **⏳ ภูม design call** — Wave 25 P1 #13 (PageTopMenubar adoption for 5 disbursement
   pages) + #14 (brand-red `primary-500` vs `primary-600` semantic decision).

---

## 🗺 Branch state (post-push · 2026-05-27 ดึก final)

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 23+24 ยัง merge) |
| `Poom-pacred` | `f4d0b1b` | **active · all Wave 24 close-out + audit landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `f4d0b1b` | ✅ in sync with Poom-pacred 0/0 |

---

## 🛠 Resume command (next session)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-27-late-night.md    # canonical resume
cat docs/research/admin-click-through-audit-2026-05-27-wave24.md  # audit findings
pnpm dev   # port 3000 (if not running)
# Then: pickup priority 1-6 above
```

---

## ⚠️ Persistent ภูม manual actions (carry-over · multiple sessions)

- 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (leaked since day 1)
- 🟡 (Optional) Apply migration `0094_view_sales_by_rep.sql` if not yet
- 🟡 (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน (from earlier session)

---

## 📚 Related living docs

- [`admin-tech-debt-master-2026-05-27.md`](admin-tech-debt-master-2026-05-27.md) — 18 of 19 closed
- [`admin-click-through-audit-2026-05-27-wave24.md`](admin-click-through-audit-2026-05-27-wave24.md) — audit findings · this session
- [`docs/learnings/partner-apis-quirks.md`](../learnings/partner-apis-quirks.md) — TAMIT URL bump captured
- [`docs/learnings/supabase-rls-patterns.md`](../learnings/supabase-rls-patterns.md) — consider adding "tb_admin CamelCase trap" entry next session
- [`AGENTS.md §0c`](../../AGENTS.md) — verify-deep-flow rule (used here to honestly cap audit coverage at 19/196)
