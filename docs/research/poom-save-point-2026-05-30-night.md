# 🌙 ภูม Save-Point — 2026-05-30 night · MOMO unblock + master fidelity audit

**Branch:** `claude/adoring-chandrasekhar-0f8ad7` → push to `Poom-pacred`
**HEAD:** `3b864858` · **23 commits ahead Poom-pacred** · all pushed in this session
**Handoff goal:** home computer Claude reads this first · resumes with the same context as ภูม

---

## 🎯 5 ลำดับงานวันนี้ (chronological)

1. **MOMO cabinet display fix** (ภูม flag morning) — propagation pipeline was writing MOMO routing batch IDs to `tb_forwarder.fcabinetnumber` · fixed root cause + display mask + cron override + backfill (6 rows)
2. **service-orders table** — sticky action column · 500 error tb_users camelCase trap · service-orders/print signpost
3. **5 parallel fidelity audits** (forwarders · service-orders · yuan-payments · drivers+barcode · cnt+warehouse) + master synthesis
4. **MOMO commit unblock** — fwarehousename `7→8` + fusercompany `null→""` + 3 customer userID renames (PR9370→PR005, PR1282→PR032, PR1321→PR116 · 181 rows updated)
5. **Final cleanup** — captured 4 learnings · pushed to Poom-pacred

---

## 📦 23 commits landed (push range covers this whole session)

| # | Hash | Type | Title (1-line) |
|---|---|---|---|
| 1 | `31cb3e50` | fix | A1+#8+A3 forwarders/print signpost + Code128 + per-row entry |
| 2 | `91432e74` | fix | #231 bulk MOMO commit threw 'CommitMomoRowInput is not defined' |
| 3 | `9406d46f` | docs | #230 diagnosis · MOMO status drift root cause |
| 4 | `d0664018` | fix | warehouse-history "สแกนรายการเพิ่ม" link |
| 5 | `62b5d536` | fix | report-cnt/[fNo] tracking + employee links 404 |
| 6 | `60815d6b` | fix | #2 forwarders search whole-history multi-axis |
| 7 | `3384bfb0` | fix | admin/drivers page wasn't syncing sidebar badge |
| 8 | `7c5d05ae` | feat | #230 P1 · MOMO → tb_forwarder match-by-tracking propagation (Wave 30.6) |
| 9 | `3e6abb24` | feat | #230 P1 · MOMO health snapshot widget |
| 10 | `49944504` | fix | #7 ใบแจ้งหนี้ menu pointed at receipt history |
| 11 | `1447bef9` | fix | #4 receipt/invoice form-title audit |
| 12 | `b1156e64` | docs | status report + shop-order gap audit (35-45%) |
| 13 | `61082ef1` | feat | #9 accounting PEAK 30-day revenue trend chart |
| 14 | `2c198bc4` | fix | #2-c cabinet from cid join · 2-b date sanitize · 2-a userID pre-validate |
| 15 | `2ce23e57` | feat | #1 service-orders bring to forwarders-list fidelity (12-of-14 features) |
| 16 | `b2694d6e` | fix | #3 driver-assignment legacy fidelity port (P0 batch) |
| 17 | `7e36f151` | fix | **#232 HOT P0** · tb_users camelCase trap (service-orders/drivers 500) |
| 18 | `92876d7e` | fix | **#232 HOT P0 part2** · service-orders fn-as-prop to Client Component |
| 19 | `0dd79949` | fix | **ภูม MOMO flag** · backfill Step 5 + UI mask + service-orders sticky |
| 20 | `f0847c6b` | feat | cron/momo-sync accept `?start=&end=` overrides |
| 21 | `3b9e745f` | fix | **propagation root-cause** · never write MOMO routing batch ID |
| 22 | `b5b8c675` | fix | MOMO commit fwarehousename `7→8` (Cargo Center → MOMO) |
| 23 | `3b864858` | fix | fusercompany `null→""` (NOT NULL constraint violation) |

---

## 🐛 4 bugs discovered + fixed today (the recurring pattern story)

### Bug 1 — MOMO routing batch ID written to fcabinetnumber

**Symptom:** `/admin/forwarders` showed cryptic "PR20260527-SEA02" instead of real cabinet "GZS260529-1" for MOMO-committed rows.

**Root cause** (3 layers):
1. **Propagation pipeline** (`lib/integrations/momo-isolated/propagate.ts:194`) wrote `m.containerNo` (MOMO's INTERNAL routing batch ID) to `tb_forwarder.fcabinetnumber` the moment a tracking matched
2. **Forward-only safety** then locked that stale value · real cabinet from later `container_closed` sync could never replace it
3. **Cron window** was hardcoded to `yesterday..today` only — containers that closed earlier never made it into the local `momo_container_closed` table at all

**Fix (3 commits · `0dd79949` + `f0847c6b` + `3b9e745f`):**
1. **Propagation** — pre-load real cabinet (cid) per tracking from `momo_import_tracks.container_batch_no` (filled by sync.ts step 2.5 from `momo_container_closed.raw.cid`). Write ONLY real cabinet. Treat stale MOMO routing pattern (`^(PR|MO)\d{8}-(SEA|EK)\d{2}$`) as a replacement target — not "non-empty so skip".
2. **Cron route** — accept optional `?start=&end=` URL overrides (gated NODE_ENV !== production OR valid CRON_SECRET Bearer). vercel.json schedule unchanged.
3. **Display mask** (`forwarders-table.tsx`) — render "ตู้ · รอปิด" (amber chip) + skip drill-down link when value matches MOMO routing pattern (defensive · stale rows that escape the propagation fix still display correctly).
4. **One-off backfill** (`scripts/backfill-momo-cabinet.mjs` Step 5) — propagate cabinet to tb_forwarder retroactively · ran APPLY=true · 6 rows updated (51976-51981).

### Bug 2 — fwarehousename "7" instead of "8" for MOMO

**Symptom:** `/admin/report-cnt/GZS260525-2` showed "โกดังจีน: Cargo Center (กวางโจว)" for MOMO-committed row id=51981.

**Root cause:** `lib/admin/commit-momo-row-core.ts:426` hardcoded `fwarehousename: "7"` with a self-contradictory comment `"MOMO = Cargo Center per legacy"`. Display map (`/admin/report-cnt/[fNo]/page.tsx:55`) is `"7":"Cargo Center", "8":"MOMO"`. Comment lies. Copy-paste origin from CargoCenter manual-entry form where "7" IS correct.

**Legacy verification (D:\REALSHITDATAPCS\... · grep `fwarehousename`):**
- Legacy PHP `api-forwarder-momo.php:246, 438` ALSO writes `"7"` for MOMO
- BUT legacy display uses a SEPARATE variable `$fWarehouseNameName` (double Name) computed from a different signal · displays "MOMO" correctly anyway
- = legacy quirk · Pacred design is cleaner (code-based map · single source)

**Fix (`b5b8c675`):** change `"7"` → `"8"` · update misleading comment · backfill 6 rows (51976-51981) prod via Node script.

**Pacred enhances legacy quirk** per AGENTS.md §0a — workflow stays faithful · the data model becomes self-describing (`WHERE fwarehousename='8'` now correctly filters MOMO).

### Bug 3 — fusercompany NULL violates NOT NULL constraint

**Symptom:** PR005 row (รุ่งรัศมี · userCompany="1") failed "สร้างทั้งหมด" with `null value in column 'fusercompany' violates not-null constraint`. Other 3 rows (PR032/PR116/PR121 · all userCompany="") committed fine.

**Root cause:**
- `lib/admin/commit-momo-row-core.ts:401` AND `actions/admin/api-forwarder-manual.ts:430` both:
  ```ts
  const fUserCompany = customer.userCompany === "1" ? null : "0";
  ```
- The original comment said "NULL not allowed — use '0'" but the code still wrote `null` (half-applied fix)
- **Legacy PHP** `api-forwarder-momo.php:241-243`:
  ```php
  $fUserCompany=0;
  if($userCompany=='1') { $fUserCompany=NULL; }       // PHP literal NULL
  $sql = "VALUES (..., '$fUserCompany', ...)";         // String interp → "''"
  ```
- Legacy effectively wrote **empty string** (PHP NULL → string `''` via interpolation) · Pacred translated to JS `null` → Postgres NULL → constraint violation.

**Prod data check:** company customers (PR124 · PR2503 · AIGA) all show `fusercompany=""` (empty string) in existing tb_forwarder rows · confirms convention.

**Fix (`3b864858`):**
```ts
const fUserCompany = customer.userCompany === "1" ? "" : "0";
```
Convention now explicit: `""` = บริษัท · `"0"` = บุคคล.

### Bug 4 — MOMO user_code ≠ Pacred userID (mapping gap)

**Symptom:** Review-grid showed "ไม่มี PR005 ในระบบ" / "ไม่มี PR032 ในระบบ" / "ไม่มี PR116 ในระบบ" — 3 of 4 MOMO rows ungated for commit.

**Root cause:** MOMO sends `user_code` as their **internal legacy 3-digit code** ("005" · "032" · "116"). Pacred reissued these customers with new `userID` ("PR9370" · "PR1282" · "PR1321") during migration. The 2 systems disagree.

**MOMO raw payload only has** `user_code` + `user_group` — NO phone · NO name · NO email · can't auto-resolve by phone-match from MOMO data alone.

**Fix (DB-only · ภูม authorized):**
| MOMO code | Pacred old | Pacred new | FK refs cascaded |
|---|---|---|---|
| PR005 | PR9370 (รุ่งรัศมี) | PR005 | 0 (clean) |
| PR032 | PR1282 (ปภัสรา) | PR032 | 0 (clean) |
| PR116 | PR1321 (พงศธร) | PR116 | **178 across 8 tables** ⚠️ |

**Total 181 rows updated atomically** (3 tb_users + 178 FK refs in tb_forwarder/tb_payment/tb_wallet/tb_wallet_hs/tb_header_order/tb_address/tb_user_sales/tb_receipt).

**Open question for next session:** ~8,898 customers · how many have MOMO ≠ Pacred? Need long-term solution:
- **A** `pcs_legacy_code_map` side-table (30 min seed · MOMO commit lookup fallback)
- **B** `pcs_legacy_code` column on tb_users (1-2h · seed from legacy DB)
- **C** ask MOMO to update user_code on their side (external dependency)

---

## 📚 4 learnings captured today (compounding knowledge)

| File | Topic | Why future agents need this |
|---|---|---|
| `docs/learnings/partner-apis-quirks.md` | MOMO `container_no` ≠ cabinet · routing batch trap | Any partner API integration: ask "is this field the ID our staff uses OR an internal partner ID?" |
| `docs/learnings/nextjs-16-quirks.md` | react-hooks/purity rejects raw `Date.now()`/`new Date()` in render bodies | Mechanical fix · easy to miss · captured pattern + helper template |
| (this doc) | Legacy PHP NULL string-interpolation = empty string · NOT Postgres NULL | When porting · always check what legacy SQL VALUE actually got vs what the PHP variable was |
| (this doc) | Silent dead-write pattern · admin actions write to REBUILT empty tables | The #1 recurring bug across 5 audits · always verify which table the action targets |

---

## 📊 Master fidelity audit synthesis (the big picture)

**Doc:** [`docs/audit/master-fidelity-2026-05-30-evening.md`](../audit/master-fidelity-2026-05-30-evening.md) — synthesizes 5 per-system audits.

**Counts:**
| ระบบ | ✅ | ⚠️ | ❌ | 🔧 | % เสร็จ | Top P0 |
|---|---:|---:|---:|---:|---:|---:|
| ฝากนำเข้า (forwarders) | 31 | 12 | 9 | 5 | ~80% | ~17h |
| ฝากสั่งซื้อ (service-orders) | 11 | 4-7 | 13 | 17 | **~15-25%** | ~12-18h |
| ฝากโอน (yuan-payments) | 22 | 18 | 23 | 11 | ~60% | revenue hole |
| คนขับ + barcode | partial | partial | 4 | 12 | ~75-80% | ~5h |
| ตู้/cnt + warehouse | partial | partial | 5 | 16 | 70-88% | ~15h |

**Grand total:** ~57 P0 launch blockers + ~63 P1 polish · estimated **~70 dev hours** for P0s alone.

### 🚨 6 recurring patterns (root causes that span systems)

1. **SILENT DEAD-WRITES** — admin actions target REBUILT (empty on prod) tables instead of `tb_*` (where 21,950 real orders live). UI shows green toast · data goes nowhere. Found in 7 surfaces (yuan-payments/service-orders/forwarders).
2. **DUPLICATE ACTION FILES** — `yuan-payments.ts` vs `yuan-payments-tb.ts` · `forwarders.ts` vs `forwarders-edit.ts` · `resolveLegacyAdminId` duplicated 3× · easy to grab wrong one.
3. **WALLET LEDGER NOT DEBITED** — admin approve → wallet doesn't decrement · cash leak (ฝากโอน manual-create · service-orders mark-paid).
4. **NOTIFY GAPS** — LINE/SMS/email unwired on driver photo · forwarder note · yuan approve · bulk-approve. Exception: `forwarder-check` Pacred EXCEEDS legacy (legacy was commented out).
5. **PRINT/PDF ROUTES MISSING** — service-orders/print absent · forwarders 7-button ribbon missing · warehouse-history bulk-print deferred · printAll.php TODO.
6. **SESSION LOCK MISSING** — legacy has `updateLock.php` 60s heartbeat · 13 prod admins = collision risk · unported.

### 🔴 Tier A revenue holes (~9h · Day 1 priority)

| # | Fix | System | ETA |
|---|---|---|---:|
| A1 | `adminCreateYuanPaymentManual` debit `tb_wallet` + insert `tb_wallet_hs` type=6 | ฝากโอน | 1h |
| A2 | `adminMarkServiceOrderPaid` pivot `tb_wallet` + `tb_wallet_hs` | ฝากสั่งซื้อ | 2h |
| A3 | `bulkCancel` (forwarders) pivot rebuilt → `tb_forwarder` | ฝากนำเข้า | 1h |
| A4 | `adminUpdateServiceOrder` pivot rebuilt → `tb_header_order` | ฝากสั่งซื้อ | 2h |
| A5 | `adminUpdateYuanPayment` + refund modal pivot `tb_payment` | ฝากโอน | 2h |
| A6 | Fix `tb_settings.rsdefault` → `rpDefault` + admin CNY rate UI | ฝากโอน | 1h |

### ⚡ Quick wins (≤30 min each)

1. CNY rate column typo (1-line)
2. Yuan admin-add default `paystatus='1'` (1-line)
3. Cron retarget `tb_forwarder_driver` (SLA breach fix · 20 min)
4. `resolveLegacyAdminId` refactor (delete 3 duplicates · 10 min)
5. Delete dead `actions/admin/yuan-payments.ts` rebuilt-write (5 min)

### 6 decisions pending ภูม (before sprint starts)

1. **GOOGLE_MAPS_API_KEY** — drivers detail page GPS map (set env or remove map?)
2. **LINE Notify token** — Apr 2025 EOL · migrate to LINE OA push?
3. **Cron retarget timing** — tonight or post-launch?
4. **Print routes brand** — `PCS Cargo Co., Ltd. · 0105560160694` (legacy) or `Pacred (Thailand) Co., Ltd. · 0105564077716`?
5. **Numeric pallet 1-40** — keep letter-only (A1-Z6) or build numeric too?
6. **Push notify on fstatus 3→4** — auto SMS+LINE when MOMO/CN says "ถึงไทย"?

---

## 🏠 Resume command (home computer · next session)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
# Read in order:
head -120 CLAUDE.md                                              # this top section
cat docs/research/poom-save-point-2026-05-30-night.md            # this save-point
cat docs/audit/master-fidelity-2026-05-30-evening.md             # master gap doc
# Then pick next-up:
# A) Push 23 commits already done (if not yet pushed)
# B) Tier A revenue holes (6 fixes · ~9h)
# C) Quick wins (5 items · ≤30 min each)
# D) Decide 6 pending questions for ภูม
```

---

## 🗺 Branch state (post-push 2026-05-30 night)

| Branch | HEAD | Status |
|---|---|---|
| `main` | (production) | 14 commits ahead of our worktree (Vercel auto-deploy main) |
| `Poom-pacred` | `3b864858` | **ACTIVE · all 23 commits today landed** |
| Our worktree | `3b864858` | ✅ in sync with Poom-pacred 0/0 |

---

## 🟠 Pending ภูม manual actions (post-close-out · trimmed 2026-05-30 night)

1. ✅ **PR005 commit ลงตู้ GZS260529-1** — DONE (ภูม confirmed)
2. **Browser-verify 2 surfaces post-deploy:**
   - `/admin/forwarders` — all 6 SEA01/SEA02 rows show real cabinet (no "PR20260527-*" routing batch)
   - `/admin/report-cnt/GZS260529-1` + `/admin/report-cnt/GZS260525-2` — "โกดังจีน: MOMO" (not Cargo Center)
3. **Decide A/B/C** for the MOMO user_code mapping (8,898 customers · this will recur if many MOMO customers have legacy 3-digit codes that don't match Pacred userID)

**Removed from earlier list (already handled):**
- ~~S3 access key rotation~~ — ตัดออกตาม ภูม
- ~~Apply migrations 0118 + 0119 to prod~~ — applied นานแล้ว

## ✅ 6 master-audit decisions — ภูม answered 2026-05-30 night

| # | คำถาม | ภูม answer | งานที่ตามมา · effort |
|---|---|---|---|
| 1 | GOOGLE_MAPS_API_KEY · drivers GPS map | "เดะเอามาให้อีกที / สอน" | ✅ doc written: [`docs/setup/google-maps-api-key.md`](../setup/google-maps-api-key.md) — ภูม follows steps to get key from Google Cloud Console · adds to `.env.local` + Vercel env vars · ~15 min setup |
| 2 | LINE Notify (Apr 2025 EOL) | "ย้ายไป LINE OA push + สอนเซ็ท" | ✅ doc written: [`docs/setup/line-oa-push-migration.md`](../setup/line-oa-push-migration.md) — full migration guide · pacred OA already exists (https://lin.ee/Yg3fU0I) · need channel access token + webhook + LIFF flow to capture userID ↔ Pacred PR-code mapping · ~2-3h setup + code |
| 3 | Cron retarget `tb_forwarder_driver` | "เดะทำที่บ้านอีกที" | deferred to home session · 20 min · `app/api/cron/expire-driver-assignments/route.ts` retarget the empty rebuilt table → `tb_forwarder_driver` |
| 4 | Print routes brand | **"Pacred (Thailand)"** | update mPDF receipt + invoice templates to use `Pacred (Thailand) Co., Ltd. · TaxID 0105564077716` (not legacy `PCS Cargo Co., Ltd. · 0105560160694`) · check `lib/admin/print-receipt.ts` / `lib/admin/print-invoice.ts` · 1h |
| 5 | Numeric pallet 1-40 | **"ทำให้รองรับได้ทั้งคู่"** | dual-mode pallet input · accept both `A1`-`Z6` (legacy 6-letter+digit) AND `1`-`40` (numeric) · update `/admin/barcode/driver/import` form + validation regex + display logic · 3-4h |
| 6 | Auto SMS+LINE on fstatus 3→4 | **"yes"** | wire on MOMO/CN cron when status transitions 3→4 (`AT_WAREHOUSE_TH`) · set env `MOMO_SYNC_PROPAGATE_STATUS=true` + add SMS via ThaiBulkSMS + LINE OA push via #2 channel · depends on #2 done first · 2h |

**Sequencing recommended for home-computer session:**
1. **Day 1 (~3h)** — #1 set Google Maps key (15 min) + #4 print brand swap (1h) + #3 cron retarget (20 min) + verify browser-verify items #2 from pending list (30 min)
2. **Day 2 (~4-5h)** — #2 LINE OA push setup (LINE Developers Console + webhook + LIFF · 3h) + #6 auto-notify wire up (2h) — these are paired
3. **Day 3+ (~3-4h)** — #5 numeric pallet support (P1 polish · not launch-blocking)

Total remaining for the 6 decisions: **~10-12h work** (mostly setup + integration, light coding).

---

## 🧠 Today's recurring meta-lesson for future Claude sessions

When ภูม flags a UI symptom (wrong display · failed commit · missing data) · **always trace the WRITE path first**, not the read path. The pattern across all 4 bugs today:

- Read code looked sensible — the value displayed was determined by a map / convention
- Write code had a subtle inversion / quirk / type mismatch / hardcoded wrong default
- The bug accumulated over time because each row went through the bad write once, then "forward-only safety" locked the wrong value in

The fix is **always 2-part:** (a) fix the write to never re-introduce, (b) backfill the existing bad rows. If you only do (a), ภูม sees the same symptom on the existing data and concludes you didn't fix anything.

Per AGENTS.md §0c: "**every Supabase query MUST destructure error** + HTTP 200 ≠ working". Add today's corollary: **"every WRITE path must be verified end-to-end at least once with a real row · including the symptom that motivated the fix."**
