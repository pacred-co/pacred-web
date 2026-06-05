# 📚 CLAUDE.md archive — dated save-points 2026-05-19 → 2026-05-31

> Moved out of [`../../CLAUDE.md`](../../CLAUDE.md) on 2026-06-05 to keep the live context doc under the
> AGENTS.md §12 2000-line cap (oversized .md files truncate when read into an agent context window).
> These are historical session save-points — all superseded / shipped-history. Newer save-points
> (2026-06-01+) and every permanent section stay in CLAUDE.md. Read here only for deep history.

---
# 🟢 2026-05-31 — เดฟ AUTONOMOUS BATCH 2+3 (P0-23 · corporate-SOT · P1-15 · ภูม sitting-H · P1-24) · read FIRST

**Batch-3 add-on (main `1befe969` → `bfb19b70`):**
- **ภูม sitting-H integrated** — PEAK accounting: tax-invoices 7-tab + receipts explorer (3 commits, clean merge)
- **P1-24 staff-group LINE notify** — `notifyStaffGroup()` wired into BOTH yuan-create paths (slip + wallet). ⚠️ **no-op จนกว่า owner ตั้ง `LINE_STAFF_GROUP_ID`** (legacy lineNotify ใช้ LINE Notify API ที่ EOL → ต้อง LINE OA group ID ใหม่: เพิ่ม @pacred bot เข้า staff group → อ่าน groupId จาก join webhook)
- **P1-23 = NOT a real gap** (deep-searched full legacy w/ owner's bypass): legacy yuan-create gates only `walletTotal>0`; ไม่มี never-paid/juristic gate. Pacred createYuanPayment มี pending-aware balance + slip-required แล้ว → ครอบคลุม. customer ฝากโอน self-submit = Pacred-added (legacy = admin สร้างให้ via pcs-admin/payment.php). ไม่ต้องแก้.

**🔑 3 ACTIVATION items รอ owner/teammate (โค้ดพร้อม pluggable):**
1. **`LINE_STAFF_GROUP_ID`** (owner) → P1-24 staff notify เริ่มยิง
2. **ภูม สร้าง 13 admins** (`/admin/admins/new`) → P1-15 sales-rep assign เริ่มทำงาน
3. **ปอน migrate 3 customer-UI corporate readers** (ADR-0021) → ลบ rebuilt `corporate` write ได้

---

# 🟢 2026-05-31 — เดฟ AUTONOMOUS BATCH 2 (P0-23 admin pay-out · corporate-SOT · P1-15)

เดฟ autonomous run ต่อจาก batch ใหญ่. ส่ง main อีก batch (`d3f991ea` → `631713da`):
- **P0-23 admin pay-out** (agent E) — `/admin/sales-payouts` repoint จาก dead rebuilt → faithful `tb_user_sales_admin_pay` (status 2→3 + slip · `AND status=2` guard กัน double-pay). คู่กับ customer earn→withdraw (D). 10/0 test.
- **Corporate SOT** (agent F) — migrate 4 เดฟ-lane readers (`/admin/customers` inline juristic queue + service-orders/[hNo] + service-order.ts + profile.ts) จาก rebuilt `corporate` (profile_id) → legacy `tb_corporate` (userid) ให้ตรง P0-18 ที่ ship แล้ว · **ADR-0021**. 8,898 migrated juristic เห็นได้แล้ว. 9/0 test.
- **P1-15** (เดฟ) — assign sales-rep ตอน **register** ไม่ใช่ approve (`lib/admin/assign-sales-rep.ts` shared · faithful check-otp-register.php). 3/0 test.

**🟢 GATE GREEN:** `pnpm verify` EXIT 0 · DB tests 42 pass/0 (E10·F9·P1-15:3·register-seed23 regression... ) + qa-flow 17 · `pnpm build` EXIT 0.

**⚠️ 2 FINDINGS (action needed):**
1. **P1-15 gated on data:** prod `admins` มี **0 active sales-rep** ที่มี legacy_admin_id → assignment คืน null จนกว่า **ภูม สร้าง 13 admins** (B-3 pending). โค้ด pluggable — พอมี sales admin assignment ทำงานทันที.
2. **Corporate cleanup ยังไม่จบ 100%:** rebuilt `corporate` write ยังอยู่ (B + profile.ts dual-write) — **ลบไม่ได้จนกว่า ปอน migrate 3 customer-UI readers** (service-payment/[id] · service-import/[fNo]/receipt · register/page.tsx) → ADR-0021 checklist. ลบก่อน = migrated juristic เห็น blank บนใบเสร็จ (death gap).

**🔴 เดฟ-backend lane "ครบ" แล้วเท่าที่ทำ solo ได้** — ที่เหลือติด lane/source (ดู §ด้านล่าง batch report):
- P1-23/P1-24 (yuan gate + staff-notify): customer `payment.php` front-controller **หายจาก extract** — ห้ามเดา · target LINE group ต้อง owner ตัดสิน
- P1-3 forwarder [fNo] dual-mode: **ภูม adm-09 lane** (big rewrite · ต้อง coord)
- P1-19/22/29/30 + /add gates: **customer UI = ปอน lane**
- P1-20 forwarder cluster: มี preserved WIP branch (reconcile ระวัง)

---

# 🔱 2026-05-31 — 4-AGENT PARALLEL SPRINT + 3-BATCH SHIP

เดฟ session — owner "เอามาทำเอง ไม่ต้องรอ ก๊อต · แยกร่างรุมทำ". ส่ง main 3 batch จบในรอบเดียว.

**📦 SHIPPED to main (`a58a6893` → `f56625b3`):**
1. **ภูม Poom-pacred** (11 commits) — P0-13 5-tab shop UPDATE · P0-16 per-item refund · P1-5 earn-trigger · P1-10 promo carry · P1-13 refund repoint · bug#2 hnote · ws polyfill
2. **ปอน InwPond007** (1,913 LOC) — `/payment-due` NEW page · address-book CRUD popups (P1-29) · sidebar badge
3. **เดฟ 4-agent parallel** (worktree-isolated · disjoint files · no host-thrash):
   - **A · P0-19 Phase 3** slip-top-up (wallet ไม่พอ → admin slip ส่วนต่าง → จ่ายจังหวะเดียว · `tb_wallet`/`_hs`/`_paydeposit`)
   - **B · P1-16** register seed `tb_wallet`+`tb_cash_back` · juristic→`tb_corporate`
   - **C · P1-18** getShipBy carrier picker + checkFreeArea (func-first, ปอน styles)
   - **D · P0-23** commission earn→withdraw E2E บน `tb_user_sales` (Path A) + **ADR-0020**

**🟢 GATE GREEN ก่อน ship:** `pnpm verify` EXIT 0 · 5 DB tests **84 pass/0 fail** (A15+B23+C9+D20+qa-flow17) · `pnpm build` EXIT 0.

**🔑 4-agent pattern ที่ WORK (ตรงข้าม 119-agent bonfire):** flat `Agent` calls (ไม่ใช่ Workflow {schema}) · `isolation:"worktree"` · disjoint files verified BEFORE spawn · agents ห้าม `pnpm build`/`pnpm dev` (tsc+tsx เท่านั้น) → ไม่ thrash · merge serial (clean) · verify ครั้งเดียว. **ใช้ pattern นี้ต่อไป.**

**⚠️ LANDMINE ใหม่ (learnings/php-port-patterns.md):** `tb_users`/`tb_admin`/`tb_co` = **camelCase บน prod** (`userID`,`userShipBy`,`coID`); `tb_*` อื่นทั้งหมด lowercase. migration file 0081 โกหก (โชว์ lowercase เก่า). tsc จับ column string ผิดไม่ได้ — ต้อง DB test ที่ยิง prod จริง.

**🔐 ENV:** `CRON_SECRET=594bf48b…52106a` owner set Vercel prod แล้ว (redeploying). OTP env-gated ถูกต้อง — ห้ามตั้ง `EMERGENCY_OTP_BYPASS=true` prod.

**🔴 เหลือ (next session):** P0-12 yuan self-approve+notify (ภูม) · P0-23 admin pay-out side (D ทำแค่ customer earn→withdraw) · B's rebuilt-`corporate` write cleanup · ปอน frontend polish + P1-30 · ภูม P1 batch (~20h: P1-2/4/6/7/9/11/12/25/26/27).

**🧹 prune ได้:** 4 agent worktree (a5cb83/ad7d1b/a67cd9/a6589a) MERGED แล้ว.

---

# 🚀 2026-05-31 — POOM-PACRED INTEGRATE + MAIN SHIP (batch 1 · superseded by 4-agent above)

เดฟ session — owner สั่ง "เอามาทำเอง ไม่ต้องรอ ก๊อต". รวม ภูม Poom-pacred (11 commits, clean merge no conflict) → run qa-flow ก่อน push → push main.

**📦 ที่ ship (main `a58a6893` → `ba1cb477`):**
- ภูม **P0-13** 5-tab admin shop UPDATE workflow + tb_promotion carry (1079 LOC + 468 tests)
- ภูม **P0-16** per-item refund shop-order line items (346 LOC + 215 tests)
- ภูม **P1-5** tb_user_sales earn-trigger on forwarder delivery (4 agent codes)
- ภูม **P1-10** tab-4 spawn auto-flip 4→5 + promo carry
- ภูม **P1-13** refund-modal repointed `yuan_payments` → `tb_payment` (faithful)
- ภูม **§0d UX** 4 sitting-F handlers mounted on legacy-view (reachability rule)
- ภูม **bug#2** `tb_header_order.hnote` NOT NULL violation fix + regression test
- ws polyfill for qa-flow Node<22 compat

**🟢 GATE GREEN — qa-flow wallet-delta 17 pass / 0 fail:**
deposit-approve · shop-debit · deposit-reject · withdraw-hold→reject-refund · withdraw-hold→approve · yuan-debit — assert REAL `tb_wallet.wallettotal` delta per ADR-0018.

**🔐 ENV — ขอ user set บน Vercel prod:**
- `CRON_SECRET=594bf48b18fa3750369ccb0cbb9ef0a98d9c40ff47f2bd63c185fbc1db52106a` (generated 2026-05-30 · already in `.env.local`)
- `EMERGENCY_OTP_BYPASS` — ✅ **already env-gated correctly** at `actions/otp.ts:51` (fail-closed when unset). Master gap audit was wrong; no code fix needed. แค่อย่า set `true` บน prod.

**🗺 Branch state (post-push):**
| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `ba1cb477` | **production · Vercel auto-deploys** |
| `dave-pacred` | `ba1cb477` | = main (0/0) |
| `Poom-pacred` | `61bca6b7` (origin) | fully absorbed via merge `6d8da245` — ภูม sync `git pull origin main` ตอนกลับมา |
| `InwPond007`/`podeng` | own lane | ปอน customer frontend |

**🎯 Pickup options for next session:**
- **A** P0-12 yuan manual-create self-approve bypass + notify (ภูม · ~2h)
- **B** P0-19 Phase 3 insufficient-balance slip top-up (เดฟ · WIP @ `worktree-agent-ae275c01…`)
- **C** P0-23 commission earn-trigger E2E architecture (เดฟ+ภูม · partial via P1-5)
- **D** เดฟ P1 batch: register inversion (P1-16) · getShipBy carrier picker (P1-18) · QRPay shortfall (P1-22)

---

# 🎯 2026-05-30 night — MASTER GAP AUDIT + WORK-SPLIT · read FIRST

17-agent exhaustive legacy-vs-Pacred audit (14 subsystem lanes + 2 critics + synthesis). **Canonical SOT for what's broken + who does what: [`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../../docs/research/legacy-gap-2026-05-30/_MASTER.md)** (+ 14 per-lane `cust-*`/`adm-*` docs + 2 critics in that folder).

**Headline — "Potemkin village":** READ surfaces faithful (wired to legacy `tb_*` where 8,898 customers live); many WRITE surfaces silently write **rebuilt empty tables** → green toast, 0 real rows change. Passes route-200 smoke, fails only on submit. **23 P0 + 31 P1.** Customer ~55% · Admin ~58% faithful.

**🔴 #1 GATE — WALLET SOT decision (เดฟ + ก๊อต, hour-1):** the money loop never closes across 4 lanes; ALL money fixes wait on one call — is the canonical ledger `tb_wallet`+`tb_wallet_hs` (legacy, has balances) or `wallet`+`wallet_transactions` (rebuilt, empty)? Recommend `tb_wallet`. Write `docs/decisions/0018-wallet-sot.md` first. **#2:** OTP fully bypassed (`EMERGENCY_OTP_BYPASS=true` `actions/otp.ts:42`) — security hole.

**Work-split (no lane collision — _MASTER §6):** เดฟ = wallet-SOT + customer write-path + architecture · ภูม = admin backend (start: yuan-UUID one-liner P0-10 + 4 cron retargets + render form in legacy-view + task#41) · ปอน = frontend + monitoring dashboards + **orphan/entry-point sweep** · ก๊อต = co-decide wallet SOT + partner-API + production gate (qa-flow-simulator asserting real `tb_wallet` delta, NOT route-200).

**3 audit dimensions** (all must pass): 1=function exists · 2=writes right `tb_*` table + correct flow-order · **3=reachable (clickable entry point ≤3 clicks — AGENTS.md §0d, owner directive).** Sprint sequence in _MASTER §7.

> ⚠️ The recurring pattern: **the FAITHFUL action is the orphan, the DEAD rebuilt twin is LIVE** (`submitCartOrder` vs `placeServiceOrder` · `wallet-hs.ts` vs `wallet.ts` · `yuan-payments-tb.ts` vs `yuan-payments.ts`). Fix = repoint import + delete twin. Verified intentional divergences (NOT gaps): PCS→PR code · Sheets→CSV cost upload · forwarder-check LINE+email.

---

# 🌃 2026-05-30 evening — 2 PARALLEL SAVE-POINTS · read BOTH

Owner ส่งหน้า legacy customer-profile + ภูม กลับบ้านทำ MOMO ต่อ → 2 sessions ขนานในวันเดียว · ปิดเย็น (เดฟ) + ปิดดึก (ภูม).

---

## 🌙 2026-05-30 night — ภูม MOMO UNBLOCK + 5-SYSTEM FIDELITY AUDIT

ภูม session 2026-05-30 ตอนเย็น→ดึก · กลับบ้าน ต่อจาก home computer · **23 commits pushed to Poom-pacred** (merged into dave-pacred 2026-05-29 reset) · master gap doc + 4 critical learnings captured.

**📦 Cluster ของวันนี้:**

1. **MOMO cabinet display bug (4 commits)** — propagation pipeline เขียน MOMO routing batch IDs (`PR20260527-SEA02`) ลง `tb_forwarder.fcabinetnumber` แทน real cabinet (`GZS260529-1`); forward-only safety ล็อกค่าผิดถาวร; cron window แคบ (`yesterday..today`) ดึง container_closed ที่ปิดก่อนหน้าไม่ได้.
   - `0dd79949` — backfill Step 5 + UI mask (รอปิดตู้ amber chip) + service-orders sticky action column
   - `f0847c6b` — cron `?start=&end=` overrides (manual reseed)
   - `3b9e745f` — propagation root-cause fix · NEVER write routing batch; pre-load real cabinet per tracking; replace stale routing patterns with real cabinets
   - `b5b8c675` — fwarehousename `7→8` (was Cargo Center, now MOMO)
   - Backfill prod: 6 tb_forwarder rows fixed (51976-51981) — real cabinets + warehouse=8

2. **MOMO commit unblock — fusercompany NOT NULL violation (1 commit · `3b864858`)** — ภูม "สร้างทั้งหมด" partial fail (3/4 success · PR005 stuck). Root cause: `lib/admin/commit-momo-row-core.ts:401` + `actions/admin/api-forwarder-manual.ts:430` both wrote JS `null` when `userCompany="1"` (company customer); legacy PHP wrote PHP `NULL` but string-interpolated as `''` (empty string). Fix: `null → ""`. Verified prod company customers (PR124/PR2503/AIGA) all have `fusercompany=""`.

3. **3 customer userID renames** (DB-only · ภูม authorized) — MOMO sends 3-digit legacy codes (`005`/`032`/`116`); Pacred had reissued these as `PR9370`/`PR1282`/`PR1321` during migration. Renamed back atomically across 9 tables · **181 rows updated** (PR1321 had 178 FK refs · PR9370/PR1282 clean). After rename: review-grid ungated all 4 MOMO rows.

4. **🚨 5-system parallel fidelity audit + master synthesis** ([`docs/audit/master-fidelity-2026-05-30-evening.md`](../../docs/audit/master-fidelity-2026-05-30-evening.md)) — ภูม asked "อะไรตกหล่น อะไรยังใช้งานไม่ได้จริง". Spawned 5 agents (forwarders / service-orders / yuan-payments / drivers+barcode / cnt+warehouse) per AGENTS.md §0b deep-audit-from-source. Result:

   | ระบบ | ✅ | ⚠️ | ❌ | 🔧 | % done | Top P0 |
   |---|---:|---:|---:|---:|---:|---:|
   | ฝากนำเข้า (forwarders) | 31 | 12 | 9 | 5 | ~80% | ~17h |
   | ฝากสั่งซื้อ (service-orders) | 11 | 4-7 | 13 | 17 | **~15-25%** | ~12-18h |
   | ฝากโอน (yuan-payments) | 22 | 18 | 23 | 11 | ~60% | revenue hole |
   | คนขับ + barcode | partial | partial | 4 | 12 | ~75-80% | ~5h |
   | ตู้/cnt + warehouse | partial | partial | 5 | 16 | 70-88% | ~15h |

   **Grand total: ~57 P0 + ~63 P1 · ~70h dev work · 8-9 wallclock days with parallel agents**

5. **6 recurring patterns** (root causes ข้ามทุกระบบ):
   - 🚨 **SILENT DEAD-WRITES** — admin actions write to REBUILT empty tables instead of `tb_*` (#1 bug · 7 surfaces affected)
   - 🚨 **DUPLICATE ACTION FILES** — `yuan-payments.ts` vs `yuan-payments-tb.ts`; pick wrong = silent dead-write
   - 🚨 **WALLET LEDGER NOT DEBITED** — admin approve, wallet doesn't decrement (cash leak in yuan-payments + service-orders)
   - 🚨 **NOTIFY GAPS** — LINE/SMS/email unwired on key transitions (exception: forwarder-check EXCEEDS legacy)
   - 🚨 **PRINT/PDF ROUTES MISSING** — /admin/service-orders/print absent; forwarders 7-button ribbon missing
   - 🚨 **SESSION LOCK MISSING** — legacy `updateLock.php` heartbeat; 13 admins on prod = collision risk

6. **Tier A revenue holes (~9h · Day 1 priority)** — A1 yuan adminCreateManual debit wallet · A2 service-orders adminMarkPaid wallet · A3 forwarders bulkCancel pivot to tb_forwarder · A4 adminUpdateServiceOrder pivot to tb_header_order · A5 adminUpdateYuanPayment pivot to tb_payment · A6 CNY rate `rsdefault → rpDefault` typo + admin UI.

**📋 4 new learnings captured today** (compounding for next agent · home computer Claude reads):
- `docs/learnings/partner-apis-quirks.md` — MOMO `container_no` ≠ cabinet (routing batch trap)
- `docs/learnings/nextjs-16-quirks.md` — `react-hooks/purity` rejects raw `Date.now()` / `new Date()` in render
- `docs/learnings/php-port-patterns.md` — legacy PHP `NULL` string-interpolation = empty string · NOT Postgres NULL
- `docs/learnings/verify-deep-flow.md` — the "silent dead-write" pattern (#1 across 5-system audit)

**🟠 Pending ภูม manual actions** (post-2026-05-30 close-out · trimmed):
1. ✅ ~~PR005 commit ลงตู้ GZS260529-1~~ — DONE (ภูม confirmed 2026-05-30 night)
2. **Browser-verify 2 surfaces post-deploy:** `/admin/forwarders` (real cabinets, no "PR20260527-*") · `/admin/report-cnt/GZS260525-2` + `/admin/report-cnt/GZS260529-1` ("โกดังจีน: MOMO")
3. **Decide A/B/C** for ~8,898 customer MOMO mapping problem (will recur if many MOMO customers have legacy user_codes)

**✅ 6 decisions ภูม answered 2026-05-30 night** (before going home):

| # | คำถาม | ภูม answer | งานที่ตามมา |
|---|---|---|---|
| 1 | GOOGLE_MAPS_API_KEY | "เดะเอามาให้อีกที / สอนวิธีเอา" | doc: [`docs/setup/google-maps-api-key.md`](../../docs/setup/google-maps-api-key.md) — step-by-step setup guide |
| 2 | LINE Notify (Apr 2025 EOL) | "ย้ายไป LINE OA push + สอนเซ็ท" | **✅ Pacred infrastructure ALREADY wired** — `sendLinePush()` at `lib/notifications/index.ts:125` · channel access token in `.env.local` · LIFF link flow at `/liff/link` · token VERIFIED working (probe LINE API → Pacred Shipping @pacred · 0/300 quota used) · 3 steps left: (a) add 4 LINE env vars to Vercel prod, (b) `LINE_PUSH_BYPASS=false` Production scope only, (c) upgrade quota plan FREE→Light/Standard. Guide: [`docs/setup/line-oa-push-migration.md`](../../docs/setup/line-oa-push-migration.md) |
| 3 | Cron retarget `tb_forwarder_driver` | "เดะทำที่บ้านอีกที" | deferred to home-computer session · ~20 min fix |
| 4 | Print routes brand | "Pacred (Thailand)" | update print templates + `components/seo/site.ts` if needed (verify tax ID `0105564077716`) |
| 5 | Numeric pallet 1-40 | "ทำให้รองรับได้ทั้งคู่" (letter A1-Z6 + numeric 1-40) | new feature work · ~3-4h · build dual-mode pallet input |
| 6 | Auto SMS+LINE on fstatus 3→4 | "yes" | wire `MOMO_SYNC_PROPAGATE_STATUS=true` + add SMS/LINE on transition (depends on #2 LINE OA done) |

---

## 🌅 2026-05-30 ค่ำ — เดฟ CUSTOMER-PROFILE + RATE + TAX (P0→P2)

เดฟ session — owner ส่งหน้า legacy customer-profile ถาม "เอามาครบไหม ปรับเรทในหน้า user เชื่อมวางบิล". ทำจนจบ + push **dave-pacred (= main)**. **Resume:** `git pull origin dave-pacred` + อ่าน **[`docs/research/save-point-2026-05-30-rate-tax-profile.md`](../../docs/research/save-point-2026-05-30-rate-tax-profile.md)** (canonical · file map · flags · pickup).

**ที่ ship (migrations 0125-0129 applied prod · NEXT FREE 0130):**
- ✅ **ตัวปรับเรทขายต่อลูกค้า ในหน้า profile** (`/admin/customers/[id]`) — live `tb_rate_custom_*` + history · cost-floor · SVIP · ปุ่มย่อ/ขยาย
- ✅ **Thai tax engine** `lib/tax/wht.ts` — owner 5 กฎ: transport 1% · service 3% · rental 5% · goods 0% (ใน VAT base · ไม่หัก) · VAT 7% (intl leg 0%) · 45 tests
- ✅ **Profile ครบ** — 8 stat cards · note · edit นิติ · address CRUD · editSale (แก้ split-brain)
- ✅ **P2 เชื่อมวางบิล** — dimension-edit auto-price (resolve-rate waterfall · 49 tests · กัน ฿0) + ใบกำกับ/VAT/WHT ตอน payment (opt-in `tax_doc_pref`) + ใบเสร็จ per-line WHT
- 🟡 flags (money · ดู save-point §FLAGGED): ใบเสร็จปกติยัง flat-1% · promo-discount ไม่ port · VAT-per-leg + 50ทวิ รอบัญชี · write-actions ยังไม่ click-test (เลี่ยง mutate prod)

verified: tsc 0 · lint 0 · build 0 · wht 45 + resolve-rate 49 tests · browser (profile PW+PR124 · edit page render)

---

# 🗺 Branch state (post 2026-05-29 reset merge)

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | (post-merge) | production · Vercel auto-deploy |
| `dave-pacred` | (= main) | integrator + customer-backend lane (เดฟ) — both Poom-pacred + podeng merged 2026-05-29 |
| `Poom-pacred` | active | V3 backend primary lane (ภูม) |
| `podeng` | active | frontend + brand SOT (ปอน) |
| `Poom` · `dave` | dormant | V3 secondary lanes |

**🎯 Pickup options:**
- **A** Tier A revenue holes (6 fixes · ~9h)
- **B** Quick wins (5 items · ≤30 min each · CNY rate typo · cron retarget · delete dupes)
- **C** Click-test the 4 MOMO fixes from today on prod (after deploy)
- **D** Decide 6 pending questions (ภูม-only)

---

# Legacy 1:1 strategy (unchanged from 2026-05-24)

---

# 🎯 2026-05-30 — STRATEGY RESET · OWNER FINAL · SINGLE-REPO · read FIRST (supersedes 2-repo + 3-deploy below)

Owner ตัดสินใจ final 2026-05-30: **กลับมาใช้แผนเดิม · repo เดียว (`pacred-web`) ก่อน** ให้รับงาน-ส่งงานได้จริง. `pacred-admin-next` **แขวนไว้** — เอาไว้หลังทำ admin เสร็จ ค่อยแยกไปทำ full-performance version อีกที.

**🗺 BRANCH MODEL (final · 1 repo = pacred-web):**

| Branch | คน | บทบาท | สถานะ (2026-05-30) |
|---|---|---|---|
| `main` | ก๊อต/เดฟ gate | **production** · Vercel auto-deploy (pacred.co.th) | `b23fa282` · prod env + migrations 0119-0122 applied |
| `dave-pacred` | **เดฟ** | integrator — ทุก branch verify → main | `= main` (0/0) |
| `InwPond007` | **ปอน** | หน้าบ้านเว็บไซต์ลูกค้า **+ หลังบ้าน member ลูกค้าทั้งหมด** | `= main` (0/0) · clean base |
| `podeng` | **ปอน sub** | 🔒 **LOCKED** — member pages ที่ทำ stage ไกลเกินไป · ปอน เอาแค่ **MOMO** มาต่อ | `b2bf7ef4` · 34 behind / 9 ahead |
| `Poom-pacred` | **ภูม** | **Admin หลังบ้านพนักงาน** · ทำต่อหลัง Owner Approved | `1e2104cc` · 1 behind / **46 ahead** (Wave 28-30) |

**📌 pacred-admin-next = SHELVED** (ก๊อต baseline · งาน import + work-distribution ที่ทำ session ก่อน ไม่หาย · park ไว้). admin งานจริง = **กลับมาที่ `pacred-web/Poom-pacred`** (ภูม owner-approved lane).

**🟢 ที่ทำเสร็จ session ก่อน (KEEP — ยังใช้ได้):**
- ✅ Local + Vercel = **prod Supabase** (`yzljakczhwrpbxflnmco`) — `.env.local` switched + backed up (`.env.local.dev-backup-2026-05-29-pre-prod-switch`)
- ✅ ปอน MOMO migrations **0119-0122 applied to prod** + tracked on main (momo_* isolated · legacy intact)

**🟢 migration number COLLISION (verified prod 2026-05-30 — ปลอดภัยกว่าที่คิด):**
ภูม (Poom-pacred) มี 2 migration ที่ไม่อยู่ main + เลข **ชน** filename กับ main — แต่ **DB ทั้งคู่ apply prod แล้ว · คนละ object · ไม่ชนข้อมูล**:

| เลข | main (ปอน · applied ✅) | Poom-pacred (ภูม · applied ✅) | DB ชน? |
|---|---|---|---|
| 0118 | `momo_promote_raw_columns` | `admins_role_manager` (admins role +'manager') | ❌ คนละ object |
| 0119 | `momo_disambiguate_container_naming` | `momo_commit_tracking` (4 cols: committed_at/forwarder_id/by/userid) | ❌ same table คนละ column |

→ **ตอน integrate Poom-pacred → main: แค่ renumber filename ภูม's 0118→0123 + 0119→0124** (main's เลขนี้ครอง prod แล้ว). **ไม่ต้อง apply อะไรเพิ่ม** — ภูม apply ทั้ง 2 ตัวลง prod เองแล้ว · renumbered files = idempotent no-op re-run. Integration = pure code-merge + filename fix · zero DB risk.

**🗄 MIGRATION — เคลียร์แล้ว (2026-05-30):** canonical state + numbering authority = `docs/runbook/migration-ledger.md`. **NEXT FREE = 0125** (เช็คก่อนเขียนเสมอ · กันชน). ภูม renumber 0118→0123, 0119→0124 (ทั้งคู่ apply prod แล้ว · แค่เปลี่ยนชื่อไฟล์). ปอน 0118-0122 (MOMO) applied prod.

**🔄 MOMO SYNC — ที่เดียว = main (ตัดสินแล้ว):** single-repo → 1 deploy → 1 cron. ภูม's momo-sync (cron 10 นาที) = canonical · ไหลเข้า main ทาง Poom-pacred→dave-pacred→main · **ไม่มี double-pull**. ปอน podeng MOMO data-foundation = ตาราง apply แล้ว · reconcile consuming code ตอน integrate (ห้ามสร้าง cron ตัวที่ 2).

**📤 HANDOFF ทุกคน:** `docs/handoff-2026-05-30-go-run.md` (per-person sync + scope + ภูม renumber commands)

**🎯 Pickup options (เลือกเอง):**
- **A — Integrate Poom-pacred → dave-pacred → main** (ภูม admin Wave 27-30 · 46 commits) · ภูม renumber 0118→0123/0119→0124 ก่อน · ใช้ `branch-integrate-loop` skill
- **B — Integrate podeng MOMO → main** (9 commits · MOMO consuming code ที่ทำให้ตาราง 0119-0122 ที่ apply แล้วมีข้อมูลจริง · surgical cherry-pick)
- **C — 3 BIG P0 cluster D** (search rewrite + 5 reports + containers-hs) from B-4 audit
- **D — 4 LOAD-BEARING fidelity gaps** (login remember-me + register channel=8 + forgot-password)

**Resume command:**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git pull origin main --no-edit
head -80 CLAUDE.md                                       # this reset section
cat docs/review-2026-05-30-strategy-reset.md             # full review + branch state
```

> ⚠️ **2 sessions ด้านล่าง (3-deploy + 2-repo) = SUPERSEDED by this reset.** pacred-admin-next docs (team-2026-05-28-2repo-workflow · team-2026-05-29-3-deploy · got-vercel-cloudflare-admin2) parked — revive ถ้ากลับไป multi-repo ทีหลัง.

---

# 🚀 2026-05-29 — 3-DEPLOY ARCHITECTURE FINAL · PROD ENV WIRED · ADMIN2 = Poom-pacred (~~read FIRST~~ SUPERSEDED 2026-05-30)

**Owner directive 2026-05-29:** ตั้ง **3 deploys คู่ขนาน** · ใช้ DB prod เดียวกัน · ทีมเลือกใช้ admin version ตามถนัด.

```
┌─────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ pacred.co.th            │  │ admin.pacred.co.th           │  │ admin2.pacred.co.th          │
│ pacred-web/main         │  │ pacred-admin-next/main       │  │ pacred-web/Poom-pacred       │
│ Website + customer      │  │ ก๊อต admin baseline 246 pages│  │ ภูม admin V2 (Wave 1-30+)    │
│ HEAD: 53104312 (QR fix) │  │ HEAD: d630b7c                │  │ HEAD: 1e2104cc (Wave 30 #2)  │
│ (legacy /admin still in) │  │ DEV_BYPASS=true              │  │ active dev · 46 ahead main   │
└─────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
            │                              │                                │
            └──────────────────────────────┼────────────────────────────────┘
                                           ▼
                  Shared Supabase prod:  yzljakczhwrpbxflnmco.supabase.co
                  (3 deploys · 1 DB · ลูกค้า/ตู้/wallet/admins ใช้ชุดเดียว)
```

**🔄 Env switch (CRITICAL):** ก่อนหน้านี้ทุกคนต่อ **dev** project (`pprrlabgebrnocthwdmg`). **2026-05-29 ดึก** owner ส่ง prod env (`yzljakczhwrpbxflnmco`) → ผม update `.env.local` ในทั้ง 2 repo + ทดสอบ local pass แล้ว.

| คน | Local env source | Backup ของ DEV เก็บไว้ที่ |
|---|---|---|
| เดฟ | `pacred-web/.env.local` (prod) | `.env.local.dev-backup-2026-05-29-pre-prod-switch` |
| ภูม | `pacred-admin-next/.env.local` (prod) | `.env.local.dev-backup-2026-05-29` |
| ปอน | ใช้ของเดิม (pacred-web · ขอจากเดฟ) | TBD |

**🟢 Local verified 2026-05-29 (against PROD DB yzljakczhwrpbxflnmco):**
- pacred-web :3000 → `/`, `/en`, `/login`, `/register` = 200 · `/service-import/truck`, `/dashboard` = 307 (auth-gate ปกติ)
- pacred-admin-next :3001 → `/dashboard`, `/admins`, `/accounting`, `/api-forwarder-momo`, `/barcode`, `/acc-payment` = 200
- Supabase health probe `https://yzljakczhwrpbxflnmco.supabase.co/auth/v1/health` = 401 (alive · needs apikey)

**📦 3-deploy branch state (post-2026-05-29 ดึก):**

| Deploy | Repo | Branch | HEAD | Vercel project |
|---|---|---|---|---|
| pacred.co.th | pacred-web | main | `53104312` | (existing · auto-deploy main) |
| **admin.pacred.co.th** | pacred-admin-next | main | `d630b7c` | (existing · pacred-admin-next.vercel.app) |
| **admin2.pacred.co.th** | pacred-web | Poom-pacred | `1e2104cc` Wave 30 #2 | ⚠️ **NEW · ก๊อต ตั้ง Vercel project** |

**🔥 NEW deploy needed: admin2.pacred.co.th**
- ก๊อต ตั้ง Vercel project ใหม่ใน org pacred-co
- Repo: `pacred-web` (เดิม) · Production Branch: `Poom-pacred`
- Domain: admin2.pacred.co.th
- Env vars: copy full `.env.local` (prod yzljakczhwrpbxflnmco) จาก pacred-web Vercel project · เพิ่ม `NEXT_PUBLIC_SITE_URL=https://admin2.pacred.co.th`
- ภูม push commit ใหม่ → Vercel auto-deploy admin2 ทันที (เหมือน main · auto-CI)

**🎯 ทีมเลือกใช้ตามถนัด:**
- admin.pacred.co.th (ก๊อต baseline · 246 pages · 1:1 PHP→Next · Auth.js v5 · clean Next 16)
- admin2.pacred.co.th (ภูม Wave 1-30+ · enhanced UX · Pacred Tailwind · brand-red · sidebar groups)

**⚠️ Migrations ปอน 0119-0122 (pending verify):**
- ปอน push migrations 0119/0120/0121/0122 ขึ้น `podeng` branch (MOMO Phase A/B/C/D)
- ยังไม่ใช่ confirm apply prod แล้วหรือยัง — เดฟ ต้องตรวจกับ ปอน + apply ถ้ายัง
- Files: `supabase/migrations/0119..0122_momo_*.sql` บน `origin/podeng` (`d40fb868..b2bf7ef4` range)

**📁 Resources:**
- Legacy backup: `C:\Users\Admin\Desktop\REALSHITDATAPCS.rar` (37.5 GB · งานเก่าทั้งหมดที่ไม่ใช่ Pacred · ใช้เป็น reference)
- Active legacy reference path: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\*.php` (per AGENTS.md §0b)
- Cross-repo reference materials: ดูใน pacred-admin-next/docs/, .claude/skills/, supabase/migrations-pacred-web/ (imported 2026-05-28 ดึก-3)

**🎯 Pickup options for next session:**
- **A** ก๊อต Vercel setup: admin2.pacred.co.th project (Poom-pacred branch · prod env vars)
- **B** เดฟ + ปอน confirm migrations 0119-0122 apply prod (MOMO Phase A/B/C/D)
- **C** 3 BIG P0 cluster D (search rewrite + 5 reports + containers-hs) from B-4 audit
- **D** 4 LOAD-BEARING fidelity gaps (login remember-me + register channel=8 + forgot-password layout + email mode)
- **E** S3 access key rotation (ภูม · 5 นาที · ค้างจาก 2026-05-20)

**Resume command (next session at home/work):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git pull origin main --no-edit
head -100 CLAUDE.md                                       # 3-deploy architecture (this section)
cat docs/team-2026-05-29-3-deploy-architecture.md         # detailed deploy + setup guide
bash scripts/setup-dave.sh                                # auto status + pickup
```

> ✅ **ภูม Poom-pacred Wave 27-30 INTEGRATED to main 2026-05-30** (this commit · 46 commits · migrations renumbered 0118→0123, 0119→0124). ภูม save-point ด้านล่างเก็บไว้เป็น shipped-history.

---

# 🌅 2026-05-30 — WAVE 29 + WAVE 30 #2 (ภูม · INTEGRATED to main · shipped-history)

ภูม session **ตอนเย็น 2026-05-30** — มา session ใหม่ขอ workflow audit ของ MOMO/accounting/barcode พร้อมแก้. ปิด session ด้วย:
- ✅ **4-agent legacy deep-audit** เผย legacy accounting = 95% UI stub (ไม่มี backend) · workflow ที่ทำได้คือ "ใบเสร็จรับเงิน" (tb_receipt) เท่านั้น ไม่ใช่ "ใบแจ้งหนี้"
- ✅ **Wave 29 pivot** Wave 28 F3 invoice → auto-receipt on payment-land (legacy callPriceUser path)
- ✅ **Wave 30 #2 cron** MOMO pull every 10 min · live test pulled 6 new rows
- ✅ **Pacred Tailwind mobile-first** rewrite ของ `/admin/barcode/driver/import` (net -60 LOC · sticky pallet · 56px tap targets)
- ✅ **Legacy verbatim sidebar** flatten recordIntake + remove redundant menubar barcode tab

**📦 17+ commits today (push range `8e9d8ef..709d8ca` บน Poom-pacred):**

### Wave 29 — pivot accounting + barcode polish
| Commit | งาน |
|---|---|
| `c3087d1` | feat(#205) doc-number minter `{FRC|FRG}{yyMM}-{NNNNN}` · 21 unit tests · port functions.php:457-486 |
| `30ff78d` | merge(#209) barcode sidebar flat shortcut + 2 orphan redirects (Agent F) |
| `945c848` | feat(#207) printReceipt mPDF faithful · ต้นฉบับ+สำเนา · WHT 1% · 4-sig · disclaimer (Agent E) |
| `7a43c81` | feat(#206+#208) pivot to receipt-flow · auto on payment-land + batch manual override (Agent G) |
| `b24c003` | merge(#207) Agent E printReceipt port |
| `457d225` | merge(#206+#208) Agent G auto-receipt + batch UI · resolved mint-receipt-doc-no.ts conflict (kept main's full 200-LOC vs G's 79-LOC stub) |
| `2bf54b4` | fix(#212) post-merge lint cleanup · extract inline SortableTh components |
| `8c210b1` | fix(#214+#215) sidebar verbatim · flatten recordIntake + remove menubar barcode tab |
| `631a458` | feat(#213) /admin/barcode/driver/import Pacred Tailwind mobile-first (Agent #213) |
| `99e6d37` | merge(#213) Agent #213 barcode UI rewrite |

### Wave 30 #2 — MOMO cron auto-pull
| `709d8ca` | feat(#2) cron `*/10 * * * *` + auto-commit hook (deferred to Wave 30.5) · 🎯 LIVE 6 rows pulled in test |

**🟢 Live state (post-push 2026-05-30):**
- `pnpm verify` EXIT 0 (lint 0 errors · tsc 0 · 54 tests · audits green)
- `/admin/barcode/driver/import` mobile-first Pacred design verified at viewport 1568×744 (sidebar shortcut active · sticky pallet amber alert · 56px tap targets · 18px input)
- Cron `/api/cron/momo-sync` live tested with curl → 6 NEW import-track rows synced + log row db02a7b9 logged

**🟠 Pending — ภูม manual actions (carry-over):**
1. 🟠 **B-3 13 admins recreate** via `/admin/admins/new` (~45 min · use `docs/research/tb-admin-13-row-reference.md` · unblocks F1 auto-assign sales rep)
2. 🔴 **B-2 ROTATE S3 key** `e913d7da34ca0089638f100afb74c972` (carry-over many sessions)
3. 🟡 **SQL cleanup #51972** (`DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';`)
4. 🟡 **5 rows date corruption** (`fdatestatus3 + fdatetothai` ปี 2037/2027 · `docs/runbook/wave-29-tb-receipt-pollution-audit.md` adjacent issue)
5. 🟡 **Apply migrations** 0118 (manager role) + 0119 (MOMO commit-tracking cols) to prod if not applied yet
6. 🟡 **Run prod audit** Step 1 of `docs/runbook/wave-29-tb-receipt-pollution-audit.md` to count PR-format rows in tb_receipt
7. 🟡 **ก๊อต/เดฟ decision** — receipt issuer brand: keep `PCS Cargo Co., Ltd. · TaxID 0105560160694` (legacy) หรือ switch เป็น `Pacred (Thailand) Co., Ltd. · TaxID 0105564077716`

**🟡 Wave 30 P1 backlog (next session):**
- **#30.5** Auto-commit body extraction (commit-momo-row-core.ts) — let cron auto-commit eligible MOMO rows · today fails 7/7 because withAdmin rejects
- **#30.6** Barcode axis rename `cargo/driver` → `camera/scanner` (~4 hr · 8 routes + 16 nav refs + redirects)
- **#30.7** Receive payment monitoring · alert if cron-pulled rows accumulate uncommitted for > N hrs

**🟢 Prod snapshot 2026-05-30:**
- **tb_forwarder distribution:** 45,840 ส่งแล้ว (long tail · OK) · **457 รอชำระเงิน** (revenue waiting!) · 268 เตรียมส่ง · 613 ถึงโกดังจีน · 261 กำลังส่งมาไทย · 34 ถึงไทยแล้ว
- **tb_cnt:** 0 rows (cnt-payment flow ภูม ยังไม่ได้ใช้)
- **Latest order:** #51971 fdate=2026-05-18 · ระบบ idle ~12 วัน · รอ hard launch
- **MOMO sync lag pre-cron:** 17h 38m → **post-cron ทุก 10 นาที** ⚡

**🎯 SOTs for next session — read in order:**
1. 🌅 **THIS top section** — Wave 29 + Wave 30 #2 ครบ
2. 📋 `docs/research/legacy-accounting-reality-2026-05-30.md` — 4-agent deep-audit (Wave 29 SOT · legacy "ระบบบัญชี" = 95% stub)
3. 📋 `docs/runbook/wave-29-tb-receipt-pollution-audit.md` — prod cleanup gate (Step 1-4) สำหรับ Wave 28 PR-format pollution
4. 🛠 `lib/admin/mint-receipt-doc-no.ts` + tests · `lib/admin/auto-issue-receipt.ts` · `lib/admin/auto-commit-momo.ts` · `lib/integrations/momo-isolated/sync.ts` (NEW core libs)
5. 🤖 `app/api/cron/momo-sync/route.ts` (Wave 30 #2 · pull every 10 min) · vercel.json cron schedule

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
head -100 CLAUDE.md                                            # this top section
pnpm dev   # port 3000 (if not running)
# Next pickup options:
# A) Wave 30.5 — extract commit body + enable cron auto-commit
# B) ภูม B-3 13 admins recreate (manual ~45 min)
# C) ภูม run SQL pollution audit Step 1 (read-only · 2 min)
# D) Wave 30.6 — barcode axis camera/scanner rename
```

---

# 🌌 2026-05-28 ดึก-3 — SESSION WRAP · 2-REPO LOCAL VERIFIED · SETUP SCRIPTS LANDED

ปิด session ดึกนี้: 2-repo architecture **เชื่อม local + ทดสอบ pass แล้ว** (pacred-web :3000 + pacred-admin-next :3001 · shared Supabase prod). Setup scripts สำหรับ **เดฟ + ปอน + ภูม** push ขึ้น main + dave-pacred แล้ว · พร้อม resume ที่บ้านได้.

**📦 ส่ง main วันนี้ (cluster ดึก-2 → ดึก-3):**

| Commit | งาน |
|---|---|
| `f3147052` | docs(CLAUDE.md): 2026-05-28 ดึก-2 — 2-REPO ARCHITECTURE + LAUNCH PLAN |
| `a9482d71` | docs(team): setup scripts + 2-repo workflow for ปอน + ภูม |
| `<this commit>` | docs(audit): B-4 click-through cluster a/b/c/d + cross-branch inventory + setup-dave.sh |

**🗺 ความพร้อม resume:**

| คน | Repo | Branch | Setup command (เครื่องใหม่ครั้งแรก) | Daily sync |
|---|---|---|---|---|
| **เดฟ** | pacred-web | dave-pacred | `bash scripts/setup-dave.sh` | `git fetch origin && git pull origin main --no-edit` |
| **ปอน** | pacred-web | InwPond007 | `bash scripts/setup-podeng.sh` | `git pull origin dave-pacred --no-edit` |
| **ภูม** | pacred-admin-next ⚠️ NEW | admin | `bash setup-poom-admin.sh` (อยู่ใน repo ใหม่) | `git pull origin admin --no-edit` |

**🟢 Local verified working (post ดึก-3):**
- pacred-web :3000 (Ready in 786ms) — `/`, `/en`, `/login`, `/register` = 200 · `/service-import/truck` + `/admin` + `/dashboard` = 307 (auth-gate ปกติ)
- pacred-admin-next :3001 (Ready in 491ms · DEV_BYPASS=true) — `/dashboard`, `/admins`, `/accounting`, `/api-forwarder-momo`, `/api-forwarder-jmf`, `/barcode`, `/acc-payment`, `/acc-shop` = 200

**🎯 Pickup options for next session (เลือกเอง):**
- **A — Soft-launch sprint** (8-11 วัน · ปลาย 5-8 มิย.): 3 BIG P0 cluster D + 4 LOAD-BEARING fidelity gaps + ก๊อต coord (S3 rotate + CRON_SECRET + API switchover)
- **B — ภูม coordination:** Pull cross-repo migrations + Pacred infra alignment review
- **C — P1 backlog (33 items)** from B-4 audit: `docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md`
- **D — camelCase batch 2b** (tb_forwarder family ~177 renames · page-by-page approach)

**Resume command (next session at home/work):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
bash scripts/setup-dave.sh                              # auto-sync + status + pickup list
head -120 CLAUDE.md                                      # this section + ดึก-2 2-repo plan
```

---

# 🚀 2026-05-28 ดึก-2 — 2-REPO ARCHITECTURE + LAUNCH PLAN · read FIRST (supersedes earlier today)

ก๊อต directive 2026-05-28: ตัด admin ออกเป็น **repo แยก** เพื่อให้ ภูม ทำ 1:1 port จากก๊อต baseline. Production = pacred-web/main + pacred-admin-next/admin (deployed คู่กัน).

**🗺 2-REPO ARCHITECTURE (production = both):**

```
┌─────────────────────────────────────────────┐  ┌─────────────────────────────┐
│ pacred-web   (this repo)                    │  │ pacred-admin-next           │
│ → frontend + member back-office + integrator│  │ → admin back-office only    │
│                                             │  │                             │
│  InwPond007 (ปอน) ────┐                     │  │  admin (ภูม)                │
│  podeng (ปอน sub-task)│                     │  │   ↓ ก๊อต baseline + ภูม sweep│
│  dave-pacred (เดฟ)   ─┴→ main → Vercel     │  │  main → Vercel              │
│                                             │  │                             │
│ Shared: Supabase prod yzljakczhwrpbxflnmco  │←→│ Same DB · same env · same   │
│         + env-config + tb_*/profiles tables │  │   auth (Supabase SSR)       │
└─────────────────────────────────────────────┘  └─────────────────────────────┘
                  pacred.co.th                          (admin sub-domain TBD)
```

| Repo | Branch | คน | งาน |
|---|---|---|---|
| `pacred-web` | `main` | ก๊อต gates | production · Vercel auto-deploy (pacred.co.th) |
| `pacred-web` | `dave-pacred` | **เดฟ** | integrator → main |
| `pacred-web` | `InwPond007` | **ปอน หลัก** | website + customer member back-office |
| `pacred-web` | `podeng` | **ปอน sub-task** | API MOMO / JMF integration (landed) |
| **`pacred-admin-next`** | **`admin`** | **ภูม** | **1:1 admin port จากก๊อต baseline + Pacred infra** |
| `pacred-admin-next` | `main` | ก๊อต gates | admin production · separate Vercel (admin subdomain TBD) |
| `pacred-web` | `Poom-pacred` / `Poom` | (ปล่อยไว้) | dormant · จะกลับมาทีหลัง |

**🟢 ก๊อต's `pacred-admin-next` state (cloned 2026-05-28 ดึก):**
- 133 admin route folders (1:1 จาก legacy `pcs-admin/*.php`)
- 246 page.tsx · 20,246 LOC
- Distribution: 4% stub · 33% small · **57% medium · 6% large** = ~63% มี real implementation
- 4 SQL migrations + docs/database/ × 108 table specs (camelCase canonical schema spec — same target as Pacred batch 1/2a)
- Same Next 16 + Supabase + lucide stack
- ภูม pulls + continues 1:1 port + integrates with Pacred DB

**🎯 OWNER DIRECTIVES (2026-05-28 ดึก):**
1. **Ship ทั้ง 4 LOAD-BEARING fidelity gaps ก่อน launch** (login remember-me · register channel=8 · forgot-password layout · forgot-password email mode)
2. **All 246 admin pages 1:1 จบตามก๊อต** (D1 rule: 100% sameness FIRST, then improve)
3. Launch ASAP — realistic window below

**⏰ Realistic LAUNCH ETA (เวลาไทย · Claude Code × 3 + parallel agents):**

| Path | ETA | Conditions |
|---|---|---|
| 🟢 **Soft-launch (50-100 beta)** | **5-8 มิย. 2026** (~8-11 วัน) | ปอน member polish DONE · เดฟ 3 BIG P0 + 4 fidelity gaps DONE · ภูม 30 core admin pages working · S3 rotate + CRON_SECRET + API switchover ก๊อต DONE |
| 🟠 **Hard-launch (~8,898 cust)** | **15-22 มิย. 2026** (~18-25 วัน) | + ภูม 246 admin pages 1:1 DONE · 33 P1 backlog DONE · camelCase remaining batches DONE · click-through audit 90 buttons DONE · real-world QA DONE |
| 🔴 **Aggressive sprint** | **3-4 มิย. 2026** (~6-7 วัน) | ทุกคน 14-16 ชม/วัน · skip P1 backlog · skip camelCase batches >2a · ภูม 20 core pages only · accept silent-bug risk · feedback fix in week 2 |

**Realistic recommendation:** Soft-launch 5-8 มิย. + hard-launch 15-22 มิย. ตามที่ owner ตอบ "Ship ทั้ง 4 fidelity + 246 admin 1:1". Pure ATM math: ก๊อต ทำ 63% แล้ว + Claude Code × 3 × parallel agents เร่งได้ ~7-10 effective × dev hrs per calendar day.

**📋 Critical path (ลำดับงาน):**

### สัปดาห์นี้ (29-31 พค.) — Decision week + kickoff
1. 🔴 ก๊อต ROTATE S3 + CRON_SECRET + API switchover plan (1 ชม)
2. 🟠 ภูม checkout `pacred-admin-next/admin` + setup integration layer (1 วัน · Pacred DB + env + i18n)
3. 🟢 ปอน กลับมา InwPond007 polish + click-through test
4. 🟢 เดฟ ปิด 3 BIG P0 cluster D (search rewrite + 5 reports + containers-hs) — ~10 ชม
5. 🟢 เดฟ ship 4 LOAD-BEARING fidelity gaps — ~6 ชม

### สัปดาห์หน้า (1-7 มิย.) — Beta-ready sprint
- ปอน: InwPond007 final polish · final QA on member-side
- เดฟ: P1 priority batch + B-2/B-3/B-5 schema drift + camelCase batch 2b (tb_forwarder)
- ภูม: 60-80 core admin pages working + camelCase aligned + Pacred auth wired
- ก๊อต: API switchover progress + admin subdomain DNS

### สัปดาห์ที่ 3 (8-14 มิย.) — Soft-launch + feedback loop
- 🟢 Soft-launch beta 50-100 คน
- Daily feedback fixes
- ภูม fills remaining admin pages

### สัปดาห์ที่ 4 (15-22 มิย.) — Hard-launch ramp
- 🟠 Hard-launch ทั้ง ~8,898 customers
- Full admin available

---

**🎯 SOTs for next session — read in order:**
1. 🚀 **THIS top section** — 2-repo architecture + ETA + critical path
2. 📋 [`docs/audit/poom-wave-25-merge-audit-2026-05-28.md`](../../docs/audit/poom-wave-25-merge-audit-2026-05-28.md)
3. 📋 [`docs/audit/fidelity-auth-screens-2026-05-28.md`](../../docs/audit/fidelity-auth-screens-2026-05-28.md) — 4 LOAD-BEARING gaps spec
4. 📋 [`docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md`](../../docs/audit/) — 10 P0 + 33 P1 click-through audit
5. 🆕 `pacred-admin-next` repo (sibling clone at `C:\Users\Admin\pacred-admin-next\`) — ภูม's working baseline

**Resume command (next session):**
```bash
# pacred-web side (เดฟ + ปอน)
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git rev-list --left-right --count HEAD...origin/main   # = 0/0
head -100 CLAUDE.md

# admin side (ภูม)
cd /c/Users/Admin/pacred-admin-next
git fetch origin && git checkout admin && git pull origin admin
# Pacred infra reference: ../pacred-web (.env.local · supabase config · auth helpers)
```

---

# 🌃 2026-05-28 ดึก — NEW BRANCH MODEL + ปอน MOMO LANDED (mid-session · superseded by ดึก-2 above)

เดฟ session **ดึกวันนี้** — พี่เดฟอัพเดท branch ownership ใหม่ + ปอน push งาน MOMO API + TAMIT เสร็จเข้า podeng → เดฟ merge เข้า main + apply migration 0116 + sync InwPond007 ให้ตรง main.

**🗺 BRANCH OWNERSHIP ใหม่ (2026-05-28 ดึก — read FIRST):**

| Branch | คน | งาน |
|---|---|---|
| `main` | (ก๊อต/เดฟ gates) | production · Vercel auto-deploy |
| `dave-pacred` | **เดฟ** | integrator → main (= main ตลอด) |
| `InwPond007` | **ปอน หลัก** | website + customer member back-office · **ปอน main lane** |
| `podeng` | **ปอน sub-task** | งาน MOMO API (เสร็จแล้ว · จะกลับมาทำ InwPond007 ต่อ) |
| `Poom-pacred` | **ภูม** | admin lane · V3 enhancements |

**📦 3 commits ดึกนี้ (push range `7a4a449d..05e7e30e` on main):**

| Commit | งาน | Source |
|---|---|---|
| `91ddb369` | merge `origin/podeng` — ปอน MOMO + TAMIT (resolved 2 §0c conflicts in tracking-page.tsx) | ปอน → เดฟ |
| `05e7e30e` | apply-pilot-migration.mjs → point at 0116 | เดฟ |
| (migration `0116_momo_isolated_tables.sql` applied to prod in 152ms) | 4 NEW isolated tables · NO legacy touch | ปอน |

**🟢 ปอน's MOMO Admin Sync — landed + applied to prod:**
- `supabase/migrations/0116_momo_isolated_tables.sql` — 4 new tables (`momo_import_tracks` + `momo_container_closed` + `momo_sack_infos` + `momo_sync_logs`) · service_role-only RLS · NO FK to legacy · **applied to prod 2026-05-28 ดึก (152ms)**
- `lib/integrations/momo-isolated/` — parallel client (NOT touching existing `momo-jmf/`) · 14 statuses × 3 phases · real-API verified live
- `app/[locale]/(admin)/admin/api-forwarder-momo/sync/` — admin page · date range + sack lookup + 5 buttons + preview + DB snapshot + counter dashboard
- `/api/admin/momo/{import-track,container-closed,sack-info,sync-preview,sync}` — admin-gated proxies
- 14 new files / +2234 LOC · entirely isolated (zero risk to revenue path)

**🟢 ปอน's TAMIT URL paste + SearchBar fix:**
- SearchBar wrapped in `<form action="/search" method="GET">` — Enter + submit work now
- `/service-import/table` legacy header restyle (matches legacy PCS · pink→orange gradient · 9 status pills)
- `/search?url=…` MODE A URL-paste wired (best-effort — TAMIT vendor was down at push time)

**🗺 Branch state (post-push · 2026-05-28 ดึก):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `05e7e30e` | **production · all today's work landed** |
| `dave-pacred` | `05e7e30e` | = main |
| `InwPond007` | `05e7e30e` | **force-synced to main** (ปอน's primary lane · clean base for next sprint) |
| `podeng` | `d3898012` | 2 commits behind (cosmetic — sub-task done, can be deleted or kept for ref) |
| `Poom-pacred` | `123a3409` | **13 commits behind** — ภูม ต้อง `git pull origin main` ก่อนงานใหม่ |

**📋 สรุปงานต่อให้แต่ละคน (next-steps brief):**

### 🟢 ปอน (lead: InwPond007)
- ✅ งาน MOMO เสร็จแล้ว · landed บน main · prod applied
- ✅ InwPond007 sync = main แล้ว — clean base
- ▶️ ขั้นต่อไป: กลับมาทำ InwPond007 ตามที่บอก (website + customer member back-office)
- 🟡 Pending verify: click-test `/admin/api-forwarder-momo/sync` ที่ prod หลัง Vercel rebuild (~3 นาที)
- 🛠 Resume:
  ```bash
  cd <your-pacred-clone>
  git checkout InwPond007
  git pull origin InwPond007    # = main, includes MOMO + ภูม wave-25 + เดฟ surgical merges
  ```

### 🟢 ภูม (lead: Poom-pacred)
- ✅ Wave-25 #194-#196 ของ ภูม ถูก surgical-merge เข้า main เรียบร้อย (per `docs/audit/poom-wave-25-merge-audit-2026-05-28.md`)
- 🟠 Poom-pacred ตามหลัง main **13 commits** — pull ก่อนงานใหม่:
  ```bash
  git checkout Poom-pacred
  git pull origin main          # absorb เดฟ's batch 2a + ปอน's MOMO + ปอน's LCL + fidelity fixes
  git push origin Poom-pacred   # publish
  ```
- ▶️ ขั้นต่อไป (จาก ภูม's afternoon save-point):
  - **B-1** NOTIFY_BYPASS env (1 ชม)
  - **B-2** 🔴 ROTATE S3 key (5 นาที · ภูม) — carry-over
  - **B-3** 13 legacy admins recreate via `/admin/admins/new` (45 นาที · ภูม)
  - **B-4** Click-through audit ทุก mutation button (~90 ปุ่ม · 5-7 ชม)
  - **B-5** Schema casing drift decision (Option A camelCase vs B revert · ~2 ชม)
- 🟡 Heads-up: เดฟ pick Option A (camelCase) เพราะตรงกับ ก๊อต spec. tb_forwarder family (~177 renames) เป็นงาน batch 2b ที่รอ — ทำ page-by-page ดีกว่า big-bang

### 🟢 เดฟ (lead: dave-pacred → main)
- ✅ Integrator role done · all 3 lanes merged · build + lint green
- ▶️ ขั้นต่อไป:
  - Coordinate ก๊อต API switchover (PCS/TTP brand split per `docs/runbook/pcs-scrub-plan.md`)
  - Pick up next camelCase batch (tb_forwarder ↑ or smaller — wallet/payment family ~60 renames)
  - 4 LOAD-BEARING fidelity gaps (owner-decide)

**🎯 SOTs for next session — read in order:**
1. 🌃 **THIS top section** — new branch model + ปอน MOMO landed
2. 🌙 `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` — surgical-merge playbook (reference for future ภูม pulls)
3. 📋 `docs/audit/fidelity-auth-screens-2026-05-28.md` — 4 LOAD-BEARING fidelity gaps pending owner
4. 🌅 `docs/research/poom-save-point-2026-05-28-afternoon.md` — ภูม's 5 launch-blockers + decision asks

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main   # should be 0/0
head -100 CLAUDE.md                                    # this top section
# Pick from per-developer "ขั้นต่อไป" above
```

---

# 🌙 2026-05-28 ค่ำ — INTEGRATION COMPLETE (mid-session · superseded by ดึก above)

เดฟ session **ค่ำวันนี้** — รับงาน ภูม (Wave 25 #194-#196) + ปอน (LCL tracking pages c6ca71fb) มา **surgical-merge เข้า main** หลังจากปอน flag "หน้าของผมหายไปไหนหมด" + ภูม push 9 commits ใหม่ที่เดฟยังไม่ได้ merge.

**📦 12 commits today (push range `227231a2..337183d5` on main):**

| Commit | งาน | Source |
|---|---|---|
| `1845fff2` | jQuery load-order fix (legacy chrome) | เดฟ |
| `125369a0` | register mobile + error-visibility fix | เดฟ |
| `7a4a4750` | register juristic parallel uploads + progress | เดฟ |
| `a8af737d` | register hard-nav post-signup | เดฟ |
| `54c7b22d` | camelCase **batch 2a** (`tb_cnt + tb_cnt_item + tb_check_forwarder` = 19 renames · migration 0115 applied prod) | เดฟ |
| `d5f46290` | /login fidelity + protected-CSS prefetch-leak fix | เดฟ |
| `9c2571da` | docs: prefetch-leak learning | เดฟ |
| `227231a2` | §0c lint sweep (20 files) | เดฟ |
| `51a7f408` | **🟢 ปอน LCL tracking restore** — cherry-pick `c6ca71fb` (9 files / 1243 lines · /service-import/{truck,sea,air} + _tracking/*) | ปอน → เดฟ |
| `61a87bff..341466ff` | **🟢 ภูม wave-25 surgical merge** — 9 cherry-picks (#194 codemod + 4 batches + post-fix + #195 lint + #196 Zod demote + close-out) | ภูม → เดฟ |
| `337183d5` | lint §0c fix on ปอน's tracking-page.tsx | เดฟ |

**🟢 ที่ทำได้ในรอบนี้:**
1. **ปอน restore** — Audit agent ยืนยัน 1 commit / 9 ไฟล์ / byte-identical กับ podeng. รากปัญหา: ปอน commit ทั้ง `podeng` + `InwPond007` ในวันเดียว แต่เดฟ merge แค่ InwPond007 (commit `80528602`)
2. **ภูม wave-25 surgical merge** — Audit doc `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` ระบุ 20 HARD conflicts + ภูม 1 bug (`adminConvertToJuristic` `.eq("ID", ...)`). ใช้ Option A surgical cherry-pick → ปกป้องทั้ง batch 2a camelCase + ภูม's wave-25 sweep + เดฟ's prefetch leak fix + เดฟ's fidelity work
3. **Build + lint green** — `pnpm build` (Turbopack) + `pnpm lint` 0 errors, 94 warnings (CI ยอม)

**🟢 Schema state (prod Supabase yzljakczhwrpbxflnmco):**
- Batch 1 (2026-05-27): `tb_users` + `tb_admin` + `tb_co` = 80 renames camelCase
- Batch 2a (2026-05-28): `tb_cnt` + `tb_cnt_item` + `tb_check_forwarder` = 19 renames camelCase
- Total renamed: **99 columns** across 6 tables. **102 tables / ~897 renames remain** (tb_forwarder family deferred as batch 2b — needs page-by-page approach)

**🗺 Branch state (post-push · 2026-05-28 ค่ำ):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `337183d5` | **production · all today's work landed** |
| `dave-pacred` | `337183d5` | = main (post-2026-05-24 model: dave-pacred = integration → main) |
| `Poom-pacred` | `123a3409` | **11 commits behind** — ภูม ควร `git pull origin main` ก่อนงานใหม่ |
| `podeng` | `c6ca71fb` | **24 commits behind** — ปอน ควร `git pull origin main` ก่อนงานใหม่ |
| `InwPond007` | = main | already merged earlier this week |

**📋 Audit/research docs created this session:**
- `docs/audit/fidelity-auth-screens-2026-05-28.md` — agent audit · 40 divergences (/login + /register + /forgot-password vs legacy PCS PHP) · 4 LOAD-BEARING top picks
- `docs/audit/podeng-lost-pages-2026-05-28.md` — agent audit · ปอน lost work investigation · confirmed 1 commit only, restore complete
- `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` — agent audit · 9-commit ภูม integration playbook (used to drive the surgical cherry-pick)
- `docs/research/poom-save-point-2026-05-28-afternoon.md` — ภูม save-point + launch-blocker analysis

**🎯 SOTs for next session — read in order:**
1. 🌙 **THIS top section** — what's just shipped + branch state
2. 📋 [`docs/audit/poom-wave-25-merge-audit-2026-05-28.md`](../../docs/audit/poom-wave-25-merge-audit-2026-05-28.md) — the 9-commit ภูม surgical-merge playbook (reference for future ภูม merges)
3. 📋 [`docs/audit/fidelity-auth-screens-2026-05-28.md`](../../docs/audit/fidelity-auth-screens-2026-05-28.md) — fidelity gap list for /login + /register + /forgot-password (4 LOAD-BEARING items pending owner decision)
4. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](../../docs/research/poom-save-point-2026-05-28-afternoon.md) — ภูม's 5 launch-blocker analysis + 5 decision asks
5. 📋 NEW learnings (5 entries today):
   - `docs/learnings/nextjs-16-quirks.md` × 3 (jQuery script-order · `<Link>` prefetch CSS leak · `"use server"` non-async-export rejection)
   - `docs/learnings/php-port-patterns.md` × 1 (schema casing drift)
   - `docs/learnings/verify-deep-flow.md` × 1 (round-2 case study)
   - (`docs/learnings/_index.md` updated 2026-05-28 evening consolidated)

**🟡 Pending decisions for next session:**
1. **Schema casing drift** (ภูม flag): rewrite code to camelCase **A** or write migration to lowercase **B**. Current direction = A (camelCase everywhere — ก๊อต's spec north-star)
2. **camelCase batch 2b** — tb_forwarder family (~177 renames / 18 customer-facing pages) — needs page-by-page approach, not big-bang
3. **5 launch-blockers** from ภูม's afternoon save-point:
   - B-1 `NOTIFY_BYPASS` env (1 ชม · Claude)
   - B-2 🔴 ROTATE S3 key (5 นาที · ภูม) — carry-over
   - B-3 13 legacy admins recreate (45 นาที · ภูม)
   - B-4 Click-through audit ทุก mutation button (~90 ปุ่ม · 5-7 ชม)
   - B-5 Schema casing drift audit (~2 ชม · Claude)
4. **Top 5 fidelity gaps** from auth audit (4 LOAD-BEARING — owner decisions):
   - Login remember-me wiring (M ~1.5h)
   - Register channel=8 "ผู้ใช้งานแนะนำ" referral input (S ~30m)
   - Forgot-password as same-route toggle vs separate route (L ~4h — owner-decide)
   - Forgot-password email mode keep or hide (30m if hidden)

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main   # should be 0/0
head -120 CLAUDE.md                                    # this top section
cat docs/audit/poom-wave-25-merge-audit-2026-05-28.md  # if more ภูม commits to merge
# Pick from "Pending decisions" above
```

---

# 🌅 2026-05-28 afternoon — WAVE 25 SHIPPED (mid-session · superseded by ค่ำ above)

ภูม session **บ่ายวันนี้** — เริ่มเช้าด้วย sync `dave-pacred` (เพราะพี่เดฟแก้ Supabase เมื่อวาน · migration 0113 rename ~78 columns ตู้/admin/co lowercase → camelCase บน prod) → merge + sweep → fix tsc + lint → ภูม click-test เจอ P0 bug → ปิดแล้ว push เก็บงานให้พี่เดฟ review.

**📦 8 commits today (push range `6ec9d7b..6d88c8e` on Poom-pacred):**

| Commit | งาน |
|---|---|
| `aac4583` | Wave 25 #194 codemod (13 single-table tb_users/admin/co readers) |
| `2f36711` | batch A (24 admin core pages camelCase) |
| `546b528` | batch B (25 admin QA + forwarders + service-orders + cnt) |
| `6bf00c5` | batch C (25 actions + lib + rates) |
| `2db1c81` | batch D (27 customer-facing protected pages) |
| `7779902` | post-cherry-pick repair · 31 tsc errors (profiles.id + auth.user.id over-rename) |
| `0699fe3` | Wave 25 #195 · 61 §0c lint sweep (19 files) + tsconfig/package/.env verify-gate cleanups |
| `6d88c8e` | Wave 25 #196 · **cnt-payment P0 bug fix** (demote 4 Zod schema exports from `"use server"`) |

**🟢 Verify state (post-Wave 25 close):**
- `pnpm verify` EXIT 0 (lint 0 errors · tsc 0 · ~280 tests · audits green)
- Browser-verify 2 surfaces end-to-end success: `/admin/report-cnt` cnt-payment + `/admin/forwarder-check` bulk-bill
- Schema casing drift discovered + documented (tb_cnt* camelCase quoted vs action lowercase keys · PostgREST fuzzy-matches but raw SQL/RPC future bug)

**🔴 5 launch-blockers identified (ภูม สั่งวิเคราะห์ Phase 1 launch-readiness):**
1. **B-1** SMS/LINE/Email ส่งจริงตอน admin test — ต้องเพิ่ม `NOTIFY_BYPASS` env (~1 ชม · Claude)
2. **B-2** ROTATE S3 key `e913d7da34ca0089638f100afb74c972` (carry-over · ~5 นาที · ภูม)
3. **B-3** 13 legacy admins recreate via `/admin/admins/new` (~45 นาที · ภูม)
4. **B-4** Click-through audit ทุก mutation button ใน `/admin/*` (~90 ปุ่ม · ~5-7 ชม wallclock · 3-4 parallel agents)
5. **B-5** Schema casing drift audit + fix (~2 ชม · Claude + agents)

**🟡 Decision asks for ภูม / พี่เดฟ:**
1. Schema drift fix: **A) rewrite code** to match schema camelCase OR **B) write migration** rename columns to lowercase
2. Launch strategy: **soft-launch beta cohort** (50-100 คน) OR hard-launch
3. Launch date — ถ้ามี hard date จะช่วยตัด P1/P2 ที่ slip

**🎯 SOTs for resume — read in order:**
1. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](../../docs/research/poom-save-point-2026-05-28-afternoon.md) — **this session's canonical resume** (8 commits · launch-blocker analysis · decision asks · 5 B-items + 5 S-items prioritized)
2. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](../../docs/research/poom-save-point-2026-05-27-night.md) — Wave 22+23 close-out yesterday
3. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](../../docs/research/admin-tech-debt-master-2026-05-27.md) — 19-item inventory (18 closed by Wave 23-24-25 · 1 deferred design call)
4. 📋 NEW learnings (3 entries today):
   - [`docs/learnings/nextjs-16-quirks.md`](../../docs/learnings/nextjs-16-quirks.md) [2026-05-28] — `"use server"` files reject ALL non-async-function value exports
   - [`docs/learnings/php-port-patterns.md`](../../docs/learnings/php-port-patterns.md) [2026-05-28] — Schema casing drift (tb_cnt* camelCase quoted vs action lowercase)
   - [`docs/learnings/verify-deep-flow.md`](../../docs/learnings/verify-deep-flow.md) [2026-05-28] — round-2 case study · cnt-payment click-through gap · hardened protocol added

**🗺 Branch state (post-push · 2026-05-28 14:59):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9c2571d` | production (ภูม Wave 20-25 ยัง merge) |
| `Poom-pacred` | `6d88c8e` | **active · Wave 25 work landed · awaiting พี่เดฟ review** |
| `dave-pacred` | `9c2571d` | customer-side (12 commits ahead Poom · ยังไม่ sync) |
| Our worktree | `6d88c8e` | ✅ in sync 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-28-afternoon.md     # canonical resume
# Then: pick B-1..B-5 (launch blockers) per ภูม decision
```

---

# 🌙 2026-05-27 ค่ำ — WAVE 22 + WAVE 23 P0 SHIPPED · read FIRST (supersedes 2026-05-26 ค่ำ below)

ภูม mega-session วันนี้ — เช้า/บ่าย Wave 22 (perf root-cause + tb_admin merge) · ค่ำ ภูม flag 4 bugs → 3 audit agents → master tech-debt doc → Wave 23 P0 batch 1 ครบ 4 fixes. ภูม กลับบ้านจาก work computer → resume ที่บ้าน.

**📦 28+ commits today (push range `22d5e37..<see save-point>` on Poom-pacred):**

**Wave 20-22 sweep (เช้า/บ่าย):**
- Wave 20 P1 batch 2 (wallet/add · yuan-payments/new · reports/{payment,shop,forwarder}) — Tailwind chrome
- Wave 21 P0 — shop→forwarder auto-spawn · Wave 21 deferred admin-profile jQuery → native dialog
- Wave 21 P2 — migration 0109 (23 partial indexes · applied to prod · /admin warm 1.88s vs cold 2.6s confirmed) + Phase A 4 quick wins
- NEW skills (`debug-mantra` + `management-talk` · 16 total) + learning (`debug-discipline.md` · "2 Issues" case study)
- **Wave 22 tb_admin → admins merge** (5 phases · migration 0110 + 3 intel docs + list page + CRUD forms + pre-existing bug fix · 10+ agents)
- **PostgREST PGRST200 cross-embed fix** (4 files · captured as learning in `supabase-rls-patterns.md`)

**Wave 22 close-out (ค่ำ · ภูม 4-issue flag):**
- fix · sanitize 9 placeholders (พี่ป๊อป's name leaked into form examples · my brief mistake)
- fix · sidebar 4 icons missing (Banknote · KanbanSquare · Smartphone · Save) + dev-only console.warn
- fix · 2 dangling-Bootstrap modals (organization-email + barcode/driver/import) + extract shared `components/ui/pacred-dialog.tsx`
- docs · master tech-debt inventory `admin-tech-debt-master-2026-05-27.md` (19 items prioritized · 6 closed in-session)

**Wave 23 P0 batch 1 (ค่ำ · 4 critical fixes per master tech-debt):**
- `0dce2b9` Agent O — `/admin/customers` suspend + Approve confirm wrapper (no more instant mutate)
- `f48dea8` Main — `/admin/accounting` menubar 96+ 404 leaves → catch-all stub "🚧 Wave 24+" + 4 placeholder no-op fixes
- `cddeea3` Agent N — `/admin/admins/[uuid]` detail rewrite (admins JOIN profiles JOIN admin_contact_extras · -83 LOC · 5 sidecar areas banner'd as Wave 23 follow-up)
- `19ae7ff` Agent P — `/admin/forwarders/combine-bill` 4 bugs FIXED (built ใบส่งสินค้า A4 print route · bill# clickable · items column root-cause = PGRST200 family · ลบรายการ PacredDialog confirm)

**🟢 Wave 23 P0 done · awaiting ภูม browser-verify ที่บ้าน (6 surfaces):**
1. /admin/customers suspend/Approve → confirm dialog
2. /admin/accounting menubar → ทุก dropdown ไป stub (no 404)
3. /admin/organization-email "เพิ่มใหม่" + "คำอธิบายระบบ" modal
4. /admin/barcode/driver/import "คำอธิบายระบบ" modal
5. /admin/admins/[uuid] detail
6. /admin/forwarders/combine-bill (list + print + delete confirm)

**⚠️ Pending ภูม manual actions (carried over):**
1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (carry over many sessions)
2. **#136** cleanup test row #51972:
   ```sql
   DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';
   ```
3. **Browser-verify Wave 23 P0 6 surfaces** above

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](../../docs/research/poom-save-point-2026-05-27-night.md) — **canonical resume** (28+ commits · 13 agents · Wave 23 P0 ครบ)
2. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](../../docs/research/admin-tech-debt-master-2026-05-27.md) — **THE NEXT-SESSION SOT** · 19 items prioritized · 10 closed today · 9 P1 + 4 P2 remain (~12-18h dev sprint)
3. 📋 3 audit reports (`admin-click-through-audit` · `admin-ui-design-audit` · `admin-sidebar-and-disbursement-audit` — all 2026-05-27)
4. 📋 Wave 22 intel trio (`tb-admin-merge-intel` · `tb-admin-code-audit` · `tb-admin-13-row-reference` — all 2026-05-27)
5. 📋 [`docs/learnings/debug-discipline.md`](../../docs/learnings/debug-discipline.md) + [`docs/learnings/supabase-rls-patterns.md`](../../docs/learnings/supabase-rls-patterns.md) (PGRST200 entry NEW today)
6. 🛠 [`.claude/skills/debug-mantra/SKILL.md`](../../.claude/skills/debug-mantra/SKILL.md) + [`management-talk`](../../.claude/skills/management-talk/SKILL.md) + [`components/ui/pacred-dialog.tsx`](../../components/ui/pacred-dialog.tsx) — NEW today

**🟡 Pickup options for next session:**
- **A** Wave 23 P1 batch (9 items · ~5-7h wallclock with parallel agents) — withdrawals param drop · ดู/แก้ไข labels mislead · cnt-hs GZE overflow · 2 dead routes · 9 Bootstrap chrome pages · disbursement header drift · brand-red 2 shades · PCS Freight legacy port gap
- **B** Wave 23 P2 polish (~6-8h) — 4 form-legacy pages · /admin/reports V-G6 cards wire-up · admin-profile-client form-control verify
- **C** Wave 21 P2 Phase C RPC consolidation (~4h) — get_admin_sidebar_counts() + 2 more RPCs (unlocks 3 Phase A TODO SUM cards)
- **D** Browser-verify ภูม เอง (~30-45min) — 6 Wave 23 P0 surfaces ที่บ้าน

**🗺 Branch state (post-push · 2026-05-27 ค่ำ final):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 20+22+23 ยัง merge) |
| `Poom-pacred` | `19ae7ff` (+ save-point) | **active · all Wave 20-21-22-23-P0 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `19ae7ff` (+ save-point) | ✅ in sync |

**Resume command (ที่บ้าน):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
cat docs/research/poom-save-point-2026-05-27-night.md
cat docs/research/admin-tech-debt-master-2026-05-27.md
pnpm dev   # port 3000
# Then pick option A/B/C/D from above
```

---

# 🌅 2026-05-27 เย็น — WAVE 22 PERF-FIX + tb_admin MERGE SHIPPED (mid-session · superseded by ค่ำ above)

ภูม กลับมา session เย็น · Wave 22 = perf root-cause kill + 5+2 parallel agents (10 total this session) + 2 new skills + tb_admin → admins consolidation Phase 1-5.

**📦 13 commits today (push range `22d5e37..1a40af6` on Poom-pacred):**
- **Wave 20 P1 batch 2** — wallet/add · yuan-payments/new (`fc9aabe`) + reports/{payment,shop,forwarder} (`f47c179`) Tailwind chrome
- **Wave 21 P0** — shop→forwarder auto-spawn (`fe98da3` · closes taxonomy §6 gap)
- **Wave 21 deferred (Task #128)** — admin-profile-client jQuery → native dialog (`003439b` · 5 modals + 2 confirms · 3 inline helpers `PacredDialog` + `DialogFooter` + `useConfirmDialogs`)
- **Wave 21 P2 perf fix** — query survey (`cbed382`) → migration 0109 (`5372346` · 23 partial indexes) → Phase A 4 quick wins (`5b065c6` · 3 TODOs + 1 real fix on `report-cnt`). **Applied to prod** → admin chrome 1.5-3s → 100-300ms confirmed (/admin warm 1.88s vs cold 2.6s)
- **NEW skills** — `debug-mantra` + `management-talk` (`8050eef` · 16 total)
- **Learnings** — `debug-discipline.md` case study of today's "2 Issues" misdiagnosis (`c9b5446`)
- **Off-target fix kept as evidence** — `a2e7b25` (image qualities · doc'd in debug-discipline)
- **🆕 Wave 22 tb_admin → admins merge (Phase 1-5)** — migration 0110 + 3 intel docs (`09f410d`) + list page rewrite (`f2e731d`) + pre-existing bug fix (`7a9e019`) + CRUD forms (`1a40af6` · 1734 LOC new · 5 server actions)

**🟢 Verified working (post-0109):**
- /admin home — 1.88s warm (was 2.6s)
- /admin/customers list — 0.52-0.72s
- /admin/wallet/add + /admin/yuan-payments/new (Tailwind chrome · BS4 form-island banner-flagged)
- /admin/reports/{payment,shop,forwarder} — full Tailwind · prod data flowing
- /admin/admins/[id] modal port — code clean (jQuery/BS4 zero · all 7 modals native `<dialog>`)

**🟠 Wave 22 tb_admin → admins merge — code shipped · awaits 2 actions ภูม:**
1. **Apply migration 0110** in Supabase Dashboard SQL Editor (paste `0110_admin_contact_extras_legacy_bridge.sql` · ~50ms · 0-row table)
2. **Recreate 13 legacy admins via `/admin/admins/new`** form (use reference doc `docs/research/tb-admin-13-row-reference.md` alongside · ~45-60 min)
- After both: /admin/admins shows 4 native + 13 new admins · transfer-rep dropdown works · all 24 legacy tb_admin readers eventually swap to admins (gradual decommission over future sessions)

**⚠️ Pending ภูม manual actions (priority order):**
1. 🟠 **Apply migration `0110`** in Supabase SQL Editor — unblocks /admin/admins (currently 500)
2. 🟠 **Recreate 13 admins via `/admin/admins/new`** form — open reference doc + sip coffee · 45-60 min
3. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (still not done · leaked วันแรก)
4. **#136** cleanup test row #51972 — `DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';`

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌅 [`docs/research/poom-save-point-2026-05-27-evening.md`](../../docs/research/poom-save-point-2026-05-27-evening.md) — **canonical resume** (13 commits · 10 agents output · verified pages · pickup options A-E)
2. 🔥 [`docs/research/wave-21-p2-query-survey.md`](../../docs/research/wave-21-p2-query-survey.md) — perf root-cause + 3-phase plan (Phase B done · Phase A done · Phase C waits)
3. 🔧 [`docs/research/tb-admin-merge-intel-2026-05-27.md`](../../docs/research/tb-admin-merge-intel-2026-05-27.md) + [`docs/research/tb-admin-code-audit-2026-05-27.md`](../../docs/research/tb-admin-code-audit-2026-05-27.md) + [`docs/research/tb-admin-13-row-reference.md`](../../docs/research/tb-admin-13-row-reference.md) — Wave 22 merge intelligence (read together · the 13-row reference is the action checklist for ภูม)
4. 📋 [`docs/learnings/debug-discipline.md`](../../docs/learnings/debug-discipline.md) — **NEW** "2 Issues" case study · pair with debug-mantra skill
5. 🛠 [`.claude/skills/debug-mantra/SKILL.md`](../../.claude/skills/debug-mantra/SKILL.md) + [`.claude/skills/management-talk/SKILL.md`](../../.claude/skills/management-talk/SKILL.md) — **NEW skills** (16 total)

**🟡 Pickup options for next session (ภูม pick when resuming):**
- **A** Wave 22 Phase 6 + cleanup leftovers (~1-2h · after 13-admin recreate) — rewrite `/admin/admins/[id]` detail page (Task #150 · still queries tb_admin · row-click 404 now) · avatar upload (Wave 23 deferred · Agent J) · #136 cleanup
- **B** Phase C RPC consolidation (~4h) — `get_admin_sidebar_counts()` + `get_dashboard_kpi()` + `get_wallet_system_totals()` (cuts 22 RTTs → 1 + unlocks the 3 TODO surfaces from Phase A)
- **C** Wave 21 batch 3 — `/admin/service-orders/cart` + `cart/add` (port `cart.php`)
- **D** Wave 21 P1 follow-ups — #137 paginate /reports/forwarder · combine-bill PDF print · warehouse-history bulk-print
- **E** Migrate remaining 16 `resolveLegacyAdminId` callers (~2h · Agent G audit) — swap to query admins+admin_contact_extras · cuts files for eventual `DROP TABLE tb_admin CASCADE`

**🗺 Branch state (post-push · 2026-05-27 เย็น):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 20+22 ยัง merge) |
| `Poom-pacred` | `1a40af6` (or later) | **active · all Wave 20+21+22 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel) |
| Our worktree | `1a40af6` | ✅ in sync with Poom-pacred 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-27-evening.md       # canonical resume
pnpm dev   # port 3000 (if not running)
# Then: pick option A/B/C/D/E from above
```

---

# 🚨 2026-05-26 ค่ำ — WAVE 20 ALL DONE · read FIRST (supersedes 2026-05-25 below)

ภูม **mega-session วันนี้ · 30+ commits บน `Poom-pacred`** (เกือบทั้งวัน). ที่ผ่านมา Wave 19 ปิด BUG #1-4 เสร็จ → วันนี้ดำเนินการ Wave 20 ครบทั้ง 5 layer (P0 schema swaps + P0-4 reports + P1 batch 1 Tailwind rewrites + qw1/qw2 + bonus). **ทุกหน้า browser-verified §0c** (ไม่ใช่แค่ route smoke).

**📦 30+ commits today (push range `2ab967b..22d5e37`):**
- **§0c sprint** — codemod 244 files + ESLint rule `pacred/no-bare-supabase-data-destructure`
- **4 bugs** — BUG #1 PR10899 500 · #2 forwarders badge · #3 wallet/[id] type-aware · #4 paydeposit slip join
- **Wave 20 P0-1..3** — customers/[id] · accounting hub (+ unified PEAK chrome) · KPI dashboard — all → tb_*
- **Wave 20 P0-4** — reports hub + 5 sub-reports (credit-pending 143 · pending-payments 1,470 · refunds 60 · monthly-orders ฿1.8M+ · debtors 0+banner)
- **Wave 20 P1 batch 1 (7 หน้า)** — notes (+ schema swap) · transfer-rep · admins + [id] · warehouse-history (+ helpers) · combine-bill + add
- **Wave 20 fixes** — qw1 fcover URL rewriter + smart placeholder · qw2 warehouse-history 7d default · forwarders avatar revert · 2× menubar link wiring for /notes
- **Bonus** — /admin/service-orders → tb_header_order (21,950 rows) · /admin/accounting/cargo redirect
- **Docs** — admin pages audit (175) · marketplace thumbnails research · order taxonomy · **agent orchestration learnings (NEW)**

**🟢 23 pages verified working with real prod data:**
- /admin/accounting (฿35M+ cards), /accounting/cargo (redirect)
- /admin/customers/PR10899, /customers/transfer-rep
- /admin/kpi (฿6.8M MTD), /service-orders (200 rows)
- /admin/forwarders + /[fNo] enhanced detail, /warehouse-history, /notes (500 rows), /combine-bill (997 rows), /combine-bill/add
- /admin/admins (13), /admins/admin_nat (identity + KPI)
- /admin/reports (5 tabs) + credit-pending (143) + pending-payments (4) + refunds (60) + monthly-orders + debtors
- /admin/wallet/105410 (topup+slip), /wallet/105411 (partner slip via paydeposit join)

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-26-night.md`](../../docs/research/poom-save-point-2026-05-26-night.md) — canonical resume (30+ commits · verified pages · pickup options · resume commands)
2. 📋 [`docs/learnings/agent-orchestration.md`](../../docs/learnings/agent-orchestration.md) — **NEW** 6 lessons from running 8 parallel agents (stale base · dual-write · API timeout · 1000-row cap · PEAK chrome · §0c click-through)
3. 📋 [`docs/audit/admin-pages-audit-2026-05-25-night.md`](../../docs/audit/admin-pages-audit-2026-05-25-night.md) — 175-page audit (Wave 21 backlog source)

**🟡 Pickup options for next session (ภูม pick when resuming):**
- **A** Wave 20 P1 batch 2 (~2-3h) — wallet/add · yuan-payments/new · reports/{payment,shop,forwarder} · service-orders/cart
- **B** Wave 21 P0 task #106 (~3-4h) — port shop→forwarder auto-spawn (legacy shops.php L1675-1721) — biggest backlog impact (spawn chip ready)
- **C** Browser-verify ภูม เอง (~30min) on prod surfaces before going further
- **D** Wave 21 P1 follow-ups (~2h) — task #128 admin-profile-client modals + combine-bill backend stubs

**⚠️ Pending ภูม manual actions (carried over · ยัง):**
1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972` leaked วันที่แรก)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply

**🗺 Branch state (post-push · 2026-05-26 ค่ำ):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม wave 20 ยังไม่ merge) |
| `Poom-pacred` | `22d5e37` | **active · all Wave 20 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `22d5e37` | ✅ in sync with Poom-pacred 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-26-night.md         # canonical resume
pnpm dev   # port 3000 (if not running)
# Then: pick option A/B/C/D from above
```

---

# 🚨 2026-05-25 ค่ำ — WAVE 15 + 16 + 17 ALL DONE · read FIRST (supersedes 2026-05-24 below)

ภูม **mega-session วันนี้ · 18 commits บน `Poom-pacred`** (16:00 → 23:30). ภูม catch ผม audit ผิวเกินไป (compared HTML paste only · missed 2 huge pages) → dispatched 4+3+3 parallel agents ในชุดต่างๆ. ผลลัพธ์: 5 P0 + 3 P0 follow-ups + UX fix + 3 P1 + close-out · **~7,200 LOC** ลง production-ready Cargo flow.

**📦 18 commits today (16:00 → 23:30):**
- **Wave 15** — 3 P0 fidelity fixes (wallet balance summary · yuan 60d filter · forwarders ยอดค้างชำระ)
- **Wave 16 prep** — `docs/audit/cargo-flow-deep-audit-2026-05-25.md` (44 legacy PHP vs ~70 Pacred · 47 gaps) + new `AGENTS.md §0b` rule + `docs/learnings/audit-discipline.md`
- **Wave 16 P0 (5)** — `/admin/report-cnt/[fNo]` per-container detail (1601 LOC) · `/admin/forwarder-check` bulk-bill (1572) · inline cost-edit modal · stub cleanup · barcode schema-split
- **Wave 16 follow-ups (3)** — **8,886 profiles UUIDs provisioned** (LINE+email channels enabled) · internal cost-update tab (no Sheets) · dual-mode cost-rate modal (CBM+Weight all carriers)
- **Wave 17 ux-fix** — report-cnt inline checkbox + modal + "ทำรายการเบิกเงินค่าตู้" wording (legacy used "เบิก" in cnt-hs.php · our "บันทึก" was wrong)
- **Wave 17 P1 (3)** — MOMO + CN manual entry · api-sheets quartet (CTT/Sang/MK/MX) · barcode AJAX writer (auto-flips fStatus=4 when fi2Amount >= fAmount)
- **Close-out** — wired deferred LINE in `actions/admin/forwarders.ts:538` (Agent A side-finding)

**🟢 Browser-test queue (~30 min next session):**
1. `/admin/report-cnt?page=succeed` — ติ๊กตู้ + เปิด modal เบิกเงิน
2. `/admin/report-cnt/<fNo>` — drill-down + cost-edit + cost-update tab
3. `/admin/forwarder-check` — 3 tabs + bulk-bill
4. `/admin/api-forwarder-momo/manual` + `/admin/api-forwarder-cn/manual`
5. `/admin/api-sheets-sang` (live preview ค่าขนส่ง · Sang's PCSE rule)
6. `/admin/barcode/driver/import` — USB scanner · auto-flip status

**🟡 Phase C — Defer:** JMF/GOGO API · real Sheets API (`check-sang-cost`) · MOMO/CN/JMF cron jobs · standalone `forwarder-driver` · MOMO Sack API · CargoCenter `containerReport` (legacy ยังไม่เคยทำ).

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-25-night.md`](../../docs/research/poom-save-point-2026-05-25-night.md) — canonical resume (Wave 15 done + Wave 16 plan + branch state + resume commands)
2. 📋 [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../../docs/audit/cargo-flow-deep-audit-2026-05-25.md) — Wave 16 gap report (44 legacy PHP vs ~70 Pacred) · P0/P1/P2 prioritized
3. 🛠 [`docs/learnings/audit-discipline.md`](../../docs/learnings/audit-discipline.md) — **NEW** the lesson from today (audit from PHP source, not HTML paste)
4. 🧭 [`AGENTS.md`](../../AGENTS.md) §0b — **NEW** rule: deep-audit-from-source protocol
5. 📝 [`docs/research/poom-save-point-2026-05-24-night.md`](../../docs/research/poom-save-point-2026-05-24-night.md) — Wave 14 context

**⚠️ ภูม manual actions pending (carried over · ยัง):**
1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972` leaked วันแรก)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

**🗺 Branch state map (post-fetch · 2026-05-25 ค่ำ):**

| Branch | HEAD | vs main | vs Poom-pacred | สถานะ |
|---|---|---|---|---|
| `main` | `9d8467b` | — | -127 | production · ปอน frontend landed |
| `Poom-pacred` | `152add3` (Wave 15) | +127 | — | **active · ภูม admin port** |
| `dave-pacred` | `26cf183` | +40 | +12, -99 | **active · เดฟ customer port** |
| `dave` | (frozen) | (old V3) | — | FROZEN per 2026-05-19 pivot |
| `podeng` | `9d8467b` | (= main) | — | merged into main |
| `faithful-port` | `e8a0ba0` | — | — | customer 12/24 transcription |
| Our worktree (`claude/adoring-chandrasekhar-0f8ad7`) | `152add3` | (= Poom-pacred) | 0/0 | ✅ in sync |

**dave-pacred has 12 commits Poom-pacred doesn't** = customer-side D1 (cart end-to-end · OTP TTL · PromptPay QR fix). **ไม่ต้อง merge** — parallel lanes per `docs/runbook/faithful-port-plan.md`.

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-25-night.md         # canonical resume
# Then: browser-test 7 surfaces above OR start Phase C (JMF/GOGO/cron)
```

---

# 🌙 2026-05-24 EVENING — WAVE 14 COMPLETE (read FIRST · supersedes 2026-05-22 below)

ภูม session ที่บ้านวันนี้. **1 new commit** บน `Poom-pacred` (`d287992`).
พักก่อน · พรุ่งนี้ว่ากันใหม่.

**📦 What landed tonight (Wave 14 · 3 parallel streams):**
- **Agent D** — Wave 12-C ภาค 2: forwarder edit dimensions (4 files · ~860 LOC ·
  `actions/admin/forwarders-edit.ts` + `[fNo]/edit/{page,edit-form}.tsx` +
  detail page entry button). Pure Tailwind UI per §0a — admin กรอก weight/CBM/
  crate AFTER goods arrive China warehouse.
- **Agent B** — Fidelity audit: `docs/audit/fidelity-gap-2026-05-24.md` (282 LOC ·
  **47 gaps** documented: 18 🔴 workflow · 22 🟠 polish · 7 🟢 keep). Top 3 P0
  ranked with file paths + LOC estimates.
- **Me (orchestration)** — 10 routes smoke + 3 Chrome screenshots verified
  brand-red theme + Wave 12-D inline edit + Wave 12-C v2 form. **Phantom
  discovered:** Phase A migration `tb_priceuser_*` ไม่เคยมี · Wave 9 ภูมิรู้แล้ว ·
  ของจริง `tb_rate_vip_*` + `tb_hs_rate_custom_*` ทั้งหมดบน prod แล้ว.

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-24-night.md`](../../docs/research/poom-save-point-2026-05-24-night.md) — canonical resume (1-commit summary · top 3 P0 queue · 6 decision options)
2. 📋 [`docs/audit/fidelity-gap-2026-05-24.md`](../../docs/audit/fidelity-gap-2026-05-24.md) — 47-gap inventory with line citations to legacy PHP
3. 📝 [`docs/research/poom-save-point-2026-05-23-night.md`](../../docs/research/poom-save-point-2026-05-23-night.md) — yesterday's context (Wave 9-13 details)

**⚠️ Pending ภูม manual actions (carried over):**
1. 🔴 ROTATE S3 access key (security · `e913d7da34ca0089638f100afb74c972` leaked)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` via Supabase dashboard
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

**Top pickup ลำดับแนะนำ:** D (5 นาที cleanup) → B (yuan date filter, 30 นาที)
→ A (Top 3 P0, 3 ชม). หรือเลือก option อื่นจาก 6 ตัวเลือกใน save-point §"พรุ่งนี้ตัดสิน".

---

# 🚨 2026-05-22 EVENING — WAVE 7.3 + WAVE 8 COMPLETE (read FIRST · supersedes 2026-05-20 below)

ภูม ran tonight's session at the home computer. **4 new commits**
land on `Poom-pacred` (`245e206..01fdebc`). Machine change tonight
(home → work tomorrow).

**📦 What landed tonight (19 surfaces · ~3,800 LOC):**
- **Wave 7.3** (`11ebcbc`) — wired the last 12 orphan admin pages
  into sidebar (`ระบบ` + `เครื่องมือ` Settings groups) + 4 page
  top-menubars (cargo/forwarders/wallet/reports). Closes the
  re-audit-2026-05-21-night 🔴 DEAD list.
- **Wave 8 Group A** (`9fccdd2`) — 3 bulk-approve bars on `tb_*` schema:
  wallet · yuan · customer-pending. Browser-verified on PROD data
  (1,470 wallet pending rows show checkbox each).
- **Wave 8 Group B+C** (`01fdebc`) — admin manual entry forms (wallet/add
  + yuan/new + customers/transfer-rep) + reports SQL rewrites
  (sales-by-rep · user-sales-history × 2) + Postgres view
  `vw_sales_by_rep` (migration 0094).

**⚠️ ภูม manual steps before next session:**
1. Apply migration `supabase/migrations/0094_view_sales_by_rep.sql` via
   Supabase dashboard (idempotent · `create or replace view`).
2. Browser-test the 4 new Wave 8 surfaces with small entries on PROD.
3. Re-install Claude for Chrome extension on the work computer.

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-22-night.md`](../../docs/research/poom-save-point-2026-05-22-night.md) — the canonical resume doc (commit list · env state · pending actions · resume commands)
2. 📋 [`docs/audit/page-inventory-2026-05-21-night.md`](../../docs/audit/page-inventory-2026-05-21-night.md) — page-by-page checklist (Wave 7.3 rows now all ✅)
3. 🛠 [`docs/audit/re-audit-2026-05-21-night.md`](../../docs/audit/re-audit-2026-05-21-night.md) — P0/P1/P2 list (P0 + P1 + most-P2 closed by Wave 7.3+8)

**Top next pickup:** Phase A migration backlog (`tb_priceuser_*`
unblock rates pages · 2-3 ชม · ภูม+ก๊อต).

---

# 🚨 2026-05-20 EVENING — PHASE 1 PUSH (read FIRST · supersedes 2026-05-19 below)

ภูม ran a 12-hour Phase 1 push tonight. 8 commits land on `Poom-pacred`
(`b584c22..90c1dbe` + this save-point commit). Customers tapping in from
running ads — the sprint is "rip the band-aid before they hit the rough edges".

**🔥 Env change:** Pacred is now **Supabase prod only** —
`https://yzljakczhwrpbxflnmco.supabase.co` (ก๊อต took dev project for
other work · Pro plan upgraded). `.env.local` updated locally (gitignored
so backup at `.env.local.dev-backup-2026-05-20`). **Resume on a new
machine → manually update `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY` per the save-point doc.**

**📦 What landed today:** Wave 1 (faithful port of `report-cnt.php` +
11-button audit menu + 9 audit queues + spine list tombstoned) · Wave 2
(8 barcode routes faithful-ported · gateway routing · `tb_cnt` cnt-payment
flow · 3 audit queues wired with `tb_header_order` + 41-ZIP free-shipping
list · 8 spine scan routes deleted) · Wave 3 (Quagga2 installed ·
DataTables-Responsive added · iOS auto-zoom fixed on register · 4 audits
landed: fidelity / mobile / pcs-complete-analysis / pcs-admin-roles /
pcs-business-flow). Spine retirement migration `0090` written but DEFERRED
(14 cargo_* consumers still need cleanup · Wave 4).

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-20-night.md`](../../docs/research/poom-save-point-2026-05-20-night.md) — the canonical resume doc (env-change steps · 8-commit summary · open questions · resume commands)
2. 📋 [`docs/audit/pcs-master-synthesis-2026-05-20.md`](../../docs/audit/pcs-master-synthesis-2026-05-20.md) — P0/P1/P2 action list from 5 audits (6 P0 items remain · ~14-21 ชม)
3. 🛠 [`docs/runbook/faithful-port-plan.md`](../../docs/runbook/faithful-port-plan.md) — Option A locked · Wave 2 done · Wave 3 partial · Wave 4 backlog
4. 🧰 [`docs/audit/fidelity-2026-05-20.md`](../../docs/audit/fidelity-2026-05-20.md) — element-by-element diff of 7 admin screens vs legacy

**🚨 Top P0 for next session:** rewrite `/admin/forwarders` to read
`tb_forwarder` (currently reads the REBUILT `forwarders` table — staff
will read wrong status to customers). 4-6 ชม.

**Critical discovery — newrealdatapcs:** ภูม pointed at
`C:\Users\Admin\Downloads\newrealdatapcs\` as พี่เดฟ's "real latest"
PCS Cargo update. The PHP code there is BYTE-IDENTICAL to our existing
snapshot (16,184 files · 0 hash diffs). The real value = พี่เดฟ's 5
markdown analysis docs at `N'POOM - PCS LEARNNING/` (6,826L combined),
which we've digested into the 4 audits above.

---

# 🚨 2026-05-19 EVENING — DIRECTION SHIFT

The team pivoted from V3 (the `main → dave → Poom` loop where Wave A/B/R1
sidebar-fidelity work shipped this morning) to a **literal 1:1 transcription**
of legacy PHP → Next.js per the owner's "100% sameness FIRST" rule.

**New branch loop:**
- **`Poom-pacred`** (ภูม · admin transcription · 187 `pcs-admin/*.php` files)
- **`dave-pacred`** (เดฟ · customer transcription + integrates)
- **`podeng`** (ปอน · customer-portal frontend)
- → **`faithful-port`** (integration target · เดฟ-owned)
- → ก๊อต production gate → **`main`** (Vercel auto-deploy)

V3 branches (`Poom`, `dave`) are **FROZEN** — preserved + already merged into
`faithful-port`, so today's morning work isn't lost — but no new commits land
there until further notice.

**Method:** 1:1 transcription · same HTML markup · same SQL · `PCS → PR` branding
only · zero design decisions. Legacy source on ภูม's machine at
`C:\Users\Admin\pcscargo\` (187 admin + 42 customer-portal `.php` files).

**Status (2026-05-19 night):** register/login fix shipped to `main` · customer
portal **7/~24** screens transcribed 1:1 on `dave-pacred` (`menu`→dashboard ·
china-address · account-settings · search · wallet · addresses · cart) · admin
pilot done (`admin-table`→`/admin/admins`) · Bootstrap-4 + jQuery + FontAwesome
vendor JS being staged for 1:1 interactivity. Full status + the 4-person
work-split → [`docs/runbook/faithful-port-plan.md`](../../docs/runbook/faithful-port-plan.md).

**Authoritative SOTs (read in order):**
1. 🚨 [`docs/research/poom-save-point-2026-05-19-night.md`](../../docs/research/poom-save-point-2026-05-19-night.md) — the direction-shift save-point · branch state · per-role lanes · PCS→PR table · resume commands
2. 📋 [`docs/runbook/faithful-port-plan.md`](../../docs/runbook/faithful-port-plan.md) — the plan · branch model · 4-person work-split · status · cross-cutting infra
3. 🛠 [`docs/runbook/faithful-port-transcription.md`](../../docs/runbook/faithful-port-transcription.md) — the canonical method · 1:1 transcription steps + admin pattern §8
4. 🧰 [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md) — supporting skill
5. 🗺 [`docs/runbook/pcs-data-migration.md`](../../docs/runbook/pcs-data-migration.md) — Phase A data load (the `tb_*` table inventory)

**Pattern references (read before transcribing your first screen):**
- Customer pilot: `app/[locale]/(protected)/dashboard/page.tsx` + `public/legacy/pcs/menu.css`
- Admin pilot: `app/[locale]/(admin)/admin/admins/page.tsx` + `public/legacy/pcs/admin/admin-base.css`

The D1 phase doc + per-role briefs below are still authoritative for company
context · the SHIFT only changes the **work-loop** and the **method**, not the
goal. Goal stays: faithful PCS Cargo port · zero retraining · D1.

---
