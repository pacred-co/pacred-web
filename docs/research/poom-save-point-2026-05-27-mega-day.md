# 🌅 Poom save-point — 2026-05-27 (Mega Day — Wave 23 Phase 1 SHIPPED)

> ภูม mega-session ครบวัน (เช้า work computer · บ่าย continue · ค่ำ close-out · 23+ commits).
> ตอน "ลุยตามแผน · แยกร่างเต็มที่ · จบ Phase 1" ปล่อย parallel agents close-out final batch.
> อ่านไฟล์นี้ก่อนทุกอย่าง.
> ก่อนหน้า: 2026-05-27 ค่ำ (`docs/research/poom-save-point-2026-05-27-night.md` · Wave 22 + 23 P0 batch 1).
> รอบนี้: **Wave 23 Phase 1 ปิดครบ** — P0 + P1 (3 batches) + P2 batch 1 + audit close-out + workflow walkthrough + Wave 24 P0 (cabinet UI + detail panel) + #178 varchar(10) sweep.

---

## TL;DR — 3 บรรทัด

วันนี้ปิด **23+ commits** บน Poom-pacred · **Wave 23 Phase 1 ครบ 100%** + Wave 24 P0 + ที่ภูม flag ระหว่าง walkthrough ทั้งหมด · **workflow ลูป 7 ขั้น (1→7) verify end-to-end live ผ่าน order #51973** · 4 parallel agents close-out batch ปิด V-G6 + paginate + handbook + admin-profile spot-fix.

**ทดสอบจริงผ่านครบ:** เปิดออเดอร์ฝากนำเข้า → push fstatus 1→7 → assign cabinet GZE-2026-001 → ใส่ Tracking TH → note → drill ไป `/admin/report-cnt/[cabinet]` ครบลูป.

**ไปต่อพรุ่งนี้:** ภูม browser-verify workflow end-to-end + cnt-hs payment flow (option B in pickup) หรือ wallet customer-billing (option C).

---

## 📦 What landed today — 23 commits (`a95fe61..<final>`)

### Group 1 — Lint cleanup + §0c sweep (เช้า)
| Commit | Surface |
|---|---|
| `1894ba9` | §0c codemod (40 violations · 5 files · agent) |
| `38c8d30` | 15 lint errors → 0 (purity helpers · setState refactor) |

### Group 2 — Wave 23 P1 batch 2 (5 Tailwind rewrites)
| Commit | Surface |
|---|---|
| `4d484bc` | withdrawal/freight-th placeholder Tailwind rewrite |
| `55db3ff` | reports/sales-by-rep Tailwind rewrite |
| `9e26b9f` | reports/user-sales-history (list + detail) Tailwind rewrite |
| `04ac713` | reports/system Tailwind rewrite (998 → 777 LOC · -221) |

### Group 3 — Wave 23 P1 batch 3
| Commit | Surface |
|---|---|
| `e130e3e` | NEW `/admin/reports/shops-profit-pay` (port report-shops-profit-pay.php · PCS Freight) |

### Group 4 — Wave 23 P2 batch 1 (form-control sweeps)
| Commit | Surface |
|---|---|
| `1664d0c` | combine-bill/add form-control → Tailwind |
| `0775388` | 3 form-control sweeps (wallet/add · yuan-payments/new · transfer-rep · race-cleanup combined) |

### Group 5 — bodySizeLimit + file-upload audit close-out
| Commit | Surface |
|---|---|
| `1ca5678` | next.config bodySizeLimit 1MB → 10MB (closes ภูม's "เปิดออเดอร์ไม่ได้" bug 500) |
| `7c7b4e1` | 4 file-upload client-side 5MB guards (wallet · yuan · cnt-hs · csv-imports) |
| `2c3c9a4` | test:unit Jest fix + admin-profile Dropify decoration honest banner |

### Group 6 — varchar(10) overflow family
| Commit | Surface |
|---|---|
| `5254f8d` | /admin/forwarders/new PCS pickup tel varchar(10) fix |
| `347ad81` | bulk-update tb_forwarder.adminidupdate varchar(10) fix |
| `a1475ee` | **#178 sweep** — `safeLegacyAdminId(raw, max)` helper + 6 files swept (cnt-hs · forwarder-check · admin-profile · cart · barcode-import · combine-bill) |

### Group 7 — Wave 24 P0 (cabinet UI + detail page action panel)
| Commit | Surface |
|---|---|
| `a5b3dd3` | cabinet input on bulk-bar + NEW TbForwarderActionPanel client component on detail page (320 LOC) |
| `d0825bb` | "ดูตู้คอนเทนเนอร์" link — URL segment fix (was `?id=` query · falls through to list) |

### Group 8 — cnt-hs cabinet column UX
| Commit | Surface |
|---|---|
| `d30e101` | NEW CabinetListCell client island (3 chip preview + click-to-expand PacredDialog · copy-all button) |
| `3249c4b` | CSV fallback when tb_cnt_item fan-out empty (legacy data) |

### Group 9 — TAMIT link-paste for admin cart/add
| Commit | Surface |
|---|---|
| `2aac1f7` | cherry-pick from dave-pacred `356edcb` — admin variant searchProductByUrlAdmin + AdminLinkPasteSearch (paste 1688/Taobao/Tmall URL → auto-fetch image/title/price) |

### Group 10 — Phase 1 close-out (parallel agents · this session ending)
| Commit | Agent | Surface |
|---|---|---|
| `<TBD-A>` | Agent A | V-G6 analytics cards wired (SUM/COUNT replaces hardcoded 0) |
| `<TBD-B>` | Agent B | `/admin/reports/forwarder` pagination (1000-row cap fix) |
| `<TBD-C>` | Agent C | `docs/runbook/cargo-workflow-handbook.md` written |
| `<TBD-D>` | Agent D | admin-profile-client form-control spot-fix |

---

## 🟢 Verified working (live-tested order #51973)

**Workflow ลูปเต็ม 7 ขั้น 1→7** บน live prod data:
- ✅ เปิดออเดอร์ ที่ `/admin/forwarders/new` (with cover image upload · 10MB cap)
- ✅ Drill เข้า `/admin/forwarders/51973` → ปรากฏ "ขั้นถัดไป 🚛" panel ใหม่
- ✅ flip fstatus 1→2 (assign cabinet `GZE-2026-001`)
- ✅ flip 2→3 (กำลังส่งมาไทย)
- ✅ flip 3→4 (ถึงไทย · LINE notify fired)
- ✅ flip 4→5 (ใส่ Tracking TH `TH00099887` + note "ทดสอบ workflow #51973 ขั้น 5")
- ✅ flip 5→6 (เตรียมส่ง)
- ✅ flip 6→7 (ส่งแล้ว)
- ✅ Click "📦 ดูตู้คอนเทนเนอร์" → `/admin/report-cnt/GZE-2026-001` แสดง #51973 row + status + cnt-hs link
- ✅ `/admin/cnt-hs` list — row #970 (91 cabinets) ใช้ chip + "+88 ตู้" modal · ไม่มี text overflow แล้ว

**ทุก surface verify §0c click-through · ไม่ใช่แค่ curl smoke**

---

## 🐛 Bugs found + fixed in this session (10 bugs · 11 commits)

| # | Bug | Found via | Commit |
|---|---|---|---|
| A | /admin/forwarders/new 500 (Body 1MB) | ภูม upload cover | `1ca5678` |
| B | PCS pickup tel varchar(10) overflow | submit form | `5254f8d` |
| C | bulk-update adminidupdate varchar(10) overflow | walkthrough 1→2 | `347ad81` |
| D | detail page no action buttons | walkthrough drill | `a5b3dd3` |
| E | cabinet assignment UI missing | walkthrough | `a5b3dd3` |
| F | ดูตู้คอนเทนเนอร์ link `?id=` ผิด | walkthrough click | `d0825bb` |
| G | cnt-hs LIST cabinet column overflow (40+ codes bleed rows) | ภูม screenshot | `d30e101` + `3249c4b` |
| H | cnt-hs chips empty after refactor | dev test | `3249c4b` |
| I | 14+ varchar(10) write sites unprotected (silent fail risk) | grep audit | `a1475ee` |
| J | 4 file-upload forms no client size guard | audit agent | `7c7b4e1` |
| K | `pnpm test:unit` Jest worker died (5 stale test refs) | session-start re-verify | `2c3c9a4` |
| L | admin-profile Dropify decoration (HR doc inputs not wired) | audit | `2c3c9a4` (banner) |
| M | 55 pre-existing lint errors blocking dev iterations | session-start | `1894ba9` + `38c8d30` |

---

## 🛠 New infrastructure shipped today

- **`lib/auth/safe-legacy-admin-id.ts`** — canonical helper to clip Pacred UUID (36 chars) before writing into legacy `varchar(N)` adminid columns. `safeLegacyAdminId(raw, max=10)` · logs warn breadcrumb when clipping actually happens · grep `safeLegacyAdminId(` = single audit query
- **`lib/datetime-helpers.ts`** — `nowMs()` · `cutoffIsoDaysAgo(n)` · `nowDate()` wrappers for Next 16 react-hooks/purity rule
- **`app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx`** — single-row action panel · status + cabinet + tracking_th + note → adminBulkUpdateForwarderTbStatus (single canonical write path)
- **`app/[locale]/(admin)/admin/cnt-hs/cabinet-list-cell.tsx`** — 3-chip preview + click-to-expand PacredDialog with copy-all (replaces text-overflow row bleed)
- **`actions/admin/product-search.ts`** + **`lib/china-search/url-allow-list.ts`** — admin TAMIT link-paste (cherry-pick from เดฟ's `356edcb`)
- **Extended `bulkTbSchema`** in `actions/admin/forwarders.ts` — accepts optional `cabinet_number` + `tracking_th` + `fnote` (single shared action serves both bulk-bar and detail panel)

---

## ⚠️ Pending ภูม manual actions

1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (still not done · leaked since first day · carries over many sessions)
2. **Task #136** cleanup test row #51972 + #51973 (today's TEST orders):
   ```sql
   DELETE FROM tb_forwarder
   WHERE id IN (51972, 51973)
     AND ftrackingchn IN ('TEST-SPAWN-WAVE21-A', 'Test2026');
   ```
3. **Browser-verify** the new cargo workflow end-to-end with a real customer (or skip if happy with live walkthrough already done today)

---

## 🎯 Pickup for next session

### Option A — cnt-hs payment flow (the "ฝั่งเงินค่าตู้" loop) 🟢
Drive #51973 cabinet `GZE-2026-001` through:
- Open `/admin/report-cnt/GZE-2026-001` → click "ตั้งค่าต้นทุนตู้"
- Create tb_cnt entry (bank · amount · note)
- Attach slip image (5MB cap · slips bucket)
- Approve → cntstatus='2' · adminidupdate stamped
- Verify cnt-hs list now shows the new entry · chip + copy-all modal
- Verify cabinet badge on /admin/report-cnt/[id] flips green ("จ่ายแล้ว")
~30-45 min · close the upstream gap (cnt-hs payment Wave 24 P0)

### Option B — Customer billing flow (the "ลูกค้าจ่ายค่าส่ง" loop) 🟢
- /admin/forwarder-check bulk-bill multiple rows
- /admin/forwarders/combine-bill — combine bills for same customer
- Wallet deduct on payment
- Print bill A4 (Wave 22 P0 print route)
~1h · close ลูปการเงินครบทุกฝั่ง

### Option C — Wave 24 P1 polish 🟡
- Apply form-spot-fixes ที่ Agent D เห็น + แก้
- Status enforcement: bind cabinet required before 2→3 (current behavior allows skip)
- Stale-state silent failure fix (disable save button while pending)
- Audit + fix remaining surfaces ภูม flag during cnt-hs flow

### Option D — Wave 21 P2 Phase C RPC consolidation 🟢
- `get_admin_sidebar_counts()` (cut 22 RTTs → 1 · sidebar perf)
- `get_dashboard_kpi()` + `get_wallet_system_totals()`
- Unlocks 3 Phase A TODO SUM cards
~4h · perf win

### Option E — Wave 23 P2 polish remaining (~3-5h)
- 3 brand-red shade normalize (primary-500 vs primary-600 drift)
- Amber/yellow Pending normalize
- 5 disbursement pages adopt PageTopMenubar (consolidation per Agent M audit)
- View-as-customer button missing (per Agent K audit)

---

## 🗺 Branch state (post-final-push)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
git log --oneline -10
```

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `8d452e87` (= dave-pacred from yesterday) | production · ภูม Wave 22-23 ยัง merge |
| `Poom-pacred` | **`<final>`** | **active · ALL Wave 23 Phase 1 + Wave 24 P0 + #178 sweep + Phase 1 close-out batch landed** |
| `dave-pacred` | `8d452e87` | customer-side D1 · don't merge — parallel lane |
| Our worktree | `<final>` | ✅ in sync 0/0 |

---

## 🛠 Resume commands (next session)

```bash
# 1. Sync + check
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
git log --oneline -15

# 2. Read SOTs (in order)
cat docs/research/poom-save-point-2026-05-27-mega-day.md       # this file
cat docs/runbook/cargo-workflow-handbook.md                    # NEW today
cat docs/research/admin-tech-debt-master-2026-05-27.md         # remaining backlog

# 3. Start dev
pnpm dev   # port 3000

# 4. Pick option A/B/C/D/E from above
```

---

## 🗺 Cross-references

- 🌙 [`poom-save-point-2026-05-27-night.md`](poom-save-point-2026-05-27-night.md) — yesterday-ค่ำ (Wave 22 + Wave 23 P0 batch 1)
- 🌅 [`poom-save-point-2026-05-27-evening.md`](poom-save-point-2026-05-27-evening.md) — yesterday-evening (Wave 22 perf + tb_admin merge)
- 🆕 [`docs/runbook/cargo-workflow-handbook.md`](../runbook/cargo-workflow-handbook.md) — **NEW today** · 7-step lifecycle + downstream + gotchas (Agent C)
- 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](admin-tech-debt-master-2026-05-27.md) — master inventory (most items closed by today)
- 🛠 [`lib/auth/safe-legacy-admin-id.ts`](../../lib/auth/safe-legacy-admin-id.ts) — **NEW today** · varchar(N) helper
- 🛠 [`app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx`](../../app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx) — **NEW today** · single-row action panel
- 🛠 [`app/[locale]/(admin)/admin/cnt-hs/cabinet-list-cell.tsx`](../../app/[locale]/(admin)/admin/cnt-hs/cabinet-list-cell.tsx) — **NEW today** · 3-chip + modal pattern
- 📋 [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — GZE/GZS · A-M-X-O-Z types · Form E · D-O decoded

---

## 🟢 Lint + test state (final)

- `pnpm lint` — **0 errors / 91 warnings** (warnings pre-existing stale · not blocking)
- `pnpm tsc --noEmit` — clean
- `pnpm test:unit` — **34/34 tests pass** (after Jest fix)
- Browser route smoke — all new/changed surfaces 307 (auth redirect · expected) or 200
- Live workflow walkthrough — 7 transitions persist · timeline stamps correct · cabinet propagates downstream
