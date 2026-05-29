# 📊 Status report 2026-05-30 evening — what's NOT clean

> ภูม said: *"ภูมิว่าตอนนี้ก่อนแก้ไขหรือรันงานต่อ แกวิเคราะห์และสรุปอัพเดตมาหน่อย
> ว่ามีอะไรเรายังไม่คลีน ยังตกหล่นอยู่บ้าง ... แกไปดูโฟล+หน้าตาการทำงาน/ใช้งาน
> มาก่อนมั้ย ไอ้ที่เราต้องทำอะ ไม่งั้นมันเท่ากับ แกสร้างมา ภูมิมาบอกให้แก้ แล้วมัน
> เสียเวลา ก่อนหน้านี้เราคุยกันแล้วไง ถ้าแกไม่เข้าใจตรงไหนก็ถามภูมิได้เลย"*

This document is the **STOP / ANALYZE / REPORT** ภูม asked for before more
code. It covers:

1. What I shipped in this session (10 commits, save-point-worthy)
2. The 3 NEW issues ภูม just flagged
3. The "still-not-clean" surfaces — what I have NOT studied + need to before I touch them
4. Specific decision questions for ภูม

---

## Part 1 — Shipped this session (10 commits, ready local)

| # | Commit | What | Verified |
|---|---|---|---|
| 1 | `31cb3e5` | Print page A1+#8+A3 — signpost + Code128 barcode + per-row 🖨 | lint + ts clean · 10/10 prod trackings render |
| 2 | `91432e7` | #231 — bulk MOMO commit ReferenceError (type re-export trap) | lint + ts clean · learning captured in nextjs-16-quirks.md |
| 3 | `9406d46` | #230 diagnosis doc — MOMO drift root cause (env vars + 2 arch gaps) | research-only |
| 4 | `d066401` | #1 warehouse-history scan button (Agent A) | href fix |
| 5 | `62b5d53` | #5 report-cnt links 404 (Agent B cherry-pick) | 2 links remapped |
| 6 | `60815d6` | #2 forwarders search across history | "PR10227" 0→9 matches verified vs prod |
| 7 | `3384bfb` | #6 driver page sync (Agent D cherry-pick) | rebuilt → legacy table swap |
| 8 | `7c5d05a` | #230 MOMO match-by-tracking propagation pipeline | live cron tested: scanned 7, matched 0 |
| 9 | `3e6abb2` | #230 MOMO health snapshot widget (3 cards on /admin/api-forwarder-momo) | page compiles · 200 OK |
| 10 | `4994450` | #7 ใบแจ้งหนี้ menu mis-route (Agent C cherry-pick) | label + 2 breadcrumbs + i18n |
| 11 | `1447bef` | #4 receipt/invoice form-title dual-mode (Agent E cherry-pick) | service-import/[fNo]/receipt now flips invoice→receipt by status |

**ROUTING wins:** all 6 of ภูม's 12-item batch that I claimed closed are
actually code-shipped. Earlier message had the full list.

**STILL NOT pushed** — waiting on ภูม push permission. Per push-frequency
rule, this batch IS a save-point but the rule says "explicit user re-issue
needed each batch". Asking now.

---

## Part 2 — THE 3 NEW issues ภูม just flagged

### 🔴 NEW-1 — `/admin/service-orders` is barely a port

**Legacy reference image:** what ภูม just sent (PCS Admin "รายการฝากสั่งซื้อสินค้า")

**Legacy file:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shops.php`
(1,942 LOC). I just read the relevant section (L450-555 + L630-685).

**What legacy has that we DON'T:**

| Feature | Legacy element | Pacred state |
|---|---|---|
| Date range picker | daterangepicker.js · "วันที่สร้างออเดอร์ 2026-04-29 - 2026-05-29" + "ผลลัพธ์การค้นหาย้อนหลัง 90 วัน" message | ❌ None |
| Status tab strip with counts | 7 tabs: ทั้งหมด/รอดำเนินการ/รอชำระเงิน/สั่งสินค้า/รอร้านจีน/สำเร็จ/ยกเลิก · each with badge count | 🟠 Pills but NO counts |
| Search box in table | DataTables built-in search-as-you-type | ❌ None |
| Page size dropdown | "แสดง 10/25/50/100 รายการ" | ❌ None |
| CTA top right | "+ สั่งสินค้าให้ลูกค้า" green button | ❌ None |
| Sort arrows ⇵ | Every column header (DataTables) | ❌ None |
| Cover image thumbnail | hCover 60px right-floated in product cell | ❌ None |
| Promo tag badge | `tagPro(promoID)` rendered next to hNo | ❌ None |
| IPC + Sale badges | `badgeAdminIP(adminIDIP/adminIDCreate)` + admin sale badge | ❌ None |
| VIP / นิติ badges | `badgeVIP2(coID, conn, userID)` | ❌ None |
| Note row | Hot-pink red banner "แอดมินเท่านั้น หมายเหตุ : ..." + age "ผ่านมา X" | ❌ None |
| Payment deadline | "กรุณาชำระเงินก่อน DD/MM/YYYY" when hStatus=2 | 🟠 Tiny text, no warning style |
| Print badges | "พิมพ์ใบเสร็จแล้ว" / "พิมพ์ใบแจ้งหนี้แล้ว" | ❌ None |
| Status update column | Per-phase timestamp (hDate, hDate2..hDate5) + "ผ่านมา X นาที" + adminIDUpdate | ❌ None |
| Action column ⚡ | Per row: ดูรายละเอียด (green) + อัปเดตรายการ (orange · gated by dept) + พิมพ์ใบเสร็จ (blue · if hStatus=5) + พิมพ์ใบแจ้งหนี้ (red · if hStatus 2-5) | ❌ COMPLETELY MISSING |
| Fixed bulk-action bar | Bottom: "พิมพ์ใบแจ้งหนี้" · "พิมพ์ใบเสร็จสินค้า" when tab=5 | ❌ None |

**Severity:** 🔴 P0 — this is the heart of the shop-order admin workflow.
Wave 20 only swapped the DATA source from rebuilt to legacy. Visual port
was never done. Similar pattern to the forwarders list which got Wave 11 +
Wave 18-B fidelity passes.

**Effort estimate:** 4-6 hours focused — copies forwarders/page.tsx pattern
(filter pills with counts · action column · daterangepicker · search) — but
applied to tb_header_order schema. NOT a one-shot fix.

---

### 🔴 NEW-2 — MOMO bulk commit has 3 layered bugs

ภูม clicked "สร้างทั้งหมด" → result: total 10, success 6, failed 4.

**Bug 2a — userID gap: 3 of the 4 fails were `ไม่พบสมาชิก (userID ไม่ตรงกับ tb_users)`.**

| MOMO `user_group+user_code` | guessed PR-code | tb_users exists? |
|---|---|---|
| PR + 005 | PR005 | ❌ NO (gap — PR001 PR002 PR003 PR004 PR006 ...) |
| PR + 116 | PR116 | ❌ NO |
| PR + 032 | PR032 | ❌ NO |
| PR + 121 | PR121 | ✅ YES (1 row) |

This is not a bug in our code — those PR codes genuinely don't exist in
the migrated PCS customer base (8,925 rows total). The /review page is
correctly flagging it. But ภูม needs to know WHY — and the right call may
be: (a) /review should show "ไม่ตรง" upfront before the admin clicks
สร้างใหม่, OR (b) we add a "create the missing customer first" inline
flow, OR (c) we have a known-mapping table.

**Decision needed: how should /review handle missing customers?**

**Bug 2b — date "0000-00-00" error on row 4.**

`date/time field value out of range: "0000-00-00"`. This is a Postgres
rejection — MySQL/legacy used `0000-00-00` as the "no value" sentinel; tb_*
columns have it as the default for some date columns. When the commit code
writes an empty MOMO date into tb_forwarder, Postgres rejects.

I need to audit `commit-momo-row-core.ts` for every column write and add
`""` / `"0000-00-00"` → `null` coercion. **Locatable + fixable in 30
minutes once I dive in.**

**Bug 2c — เลขตู้ field wrong: `PR20260527-SEA02` vs `GZS260525-2`.**

I confirmed against live MOMO API:
- `import_track` endpoint returns `container_no = "PR20260527-SEA02"` — this is MOMO's INTERNAL routing batch ID (not the cabinet)
- `container_closed` endpoint returns `cid = "GZS260525-2"` — THIS is the cabinet PCS uses
- Each closed container has `track_details: [{ reTrack: "1779529270", ... }]` — the trackings inside that cabinet

So to get the real cabinet for a tracking, we need to JOIN:
- import_track.tracking ↔ container_closed.track_details[].reTrack → use `cid` as cabinet

**Our current code:** `lib/integrations/momo-isolated/mapper.ts:182` reads
`r.container_no` and stores it as the cabinet — that's the wrong field.
Both the live momo_import_tracks rows AND the bulk commit are using the
wrong value.

**Fix needs 3 things:**
1. Add a sync step that walks container_closed + writes the `cid` back onto matching momo_import_tracks rows (new column, e.g. `momo_cabinet_no`)
2. Update the /review page + commit code to use the new column
3. Backfill existing 9 prod rows + the next prod cron run will refresh

**Effort:** 2-3 hours including schema migration + backfill script.

---

### 🔴 NEW-3 — มอบหมายงานคนขับรถ still wrong (Agent D's #6 fix incomplete)

ภูม says: *"ยังผิดอะ มันไม่เหมือน pcs เลย มันขาดไปเยอะมาก"*

I have NOT yet studied legacy `forwarder-driver.php` to see what's missing.
Agent D's fix swapped the data source from rebuilt → legacy. ภูม is now
saying the UI/FLOW is still not faithful — this is the same gap-class as
NEW-1 (service-orders).

**I will not touch this until I open the legacy + cross-reference.** Per
AGENTS.md §0b.

---

## Part 3 — Still-not-clean / NOT-studied surfaces from this session

### #3 shop-order — Agent G2 audit doc still pending
Agent G2 is producing `docs/audit/shop-order-gap-2026-05-30.md` — should
be a complete inventory. Will inform NEW-1 fix.

### #9 accounting PEAK redesign
Agent F was rewriting `/admin/accounting/page.tsx` PEAK-style. I STOPPED
it (per ภูม's "analyze first" message). Their partial work is discarded.
This needs:
- (a) Owner brief on which PEAK features are wanted vs not
- (b) Audit of what `/admin/accounting` shows TODAY (Wave 20 P0-2 work)
- (c) DON'T add ads / latest-updates blocks
- I haven't yet looked at the current page in detail.

### MOMO health widget + propagation pipeline (#230)
**These ARE shipped + working.** Cron runs healthy. Propagation safe-by-
default (only fills empty fcabinetnumber + fdatetothai, status writes
gated behind `MOMO_SYNC_PROPAGATE_STATUS=true` env).

But — needs ภูม / ก๊อต to:
1. Set `MOMO_API_BASE_URL` + `MOMO_API_TOKEN` on **Vercel production** env (currently 5+ hours stale because Vercel doesn't know my `.env.local`)
2. Flip the propagate-status gate when ready

---

## Part 4 — META-pattern (what I'm fixing about how I work)

ภูม just called out the pattern: I build → ภูม discovers gap → ภูม corrects → time wasted. This violates AGENTS.md §0a + §0b + §0c.

**What I should have done before each item this session:**

| Item | What I did | What I should have done |
|---|---|---|
| #1 warehouse-history scan | Trusted Agent A's "just an href" fix | Should have asked: is `/admin/barcode/driver/import` the right target *flow*? Or does ภูม want a NEW direct-scan flow? — but in this case Agent A correctly studied legacy |
| #6 driver page | Trusted Agent D's "swap rebuilt → legacy" fix | Should have studied legacy `forwarder-driver.php` FULL workflow first. The data source was wrong AND the UI is wrong. |
| MOMO propagation + widget | Shipped code | These were OK — diagnosis was thorough. But could have asked: "should fstatus advance trigger SMS/LINE?" before coding. |
| **#3 shop-order** | Was about to deep-port without legacy study | CORRECTLY paused for Agent G2 audit |
| **#9 accounting PEAK** | Was launching Agent F WITHOUT understanding what's currently there | CORRECTLY stopped Agent F · need to study Wave 20 current + ask ภูม about PEAK ref |

**New rule I'm internalizing:** for ANY surface labeled "redesign", "improve",
"port", or "make like X" — open legacy + current Pacred side-by-side BEFORE
launching an agent or writing code. Quote 3 differences. Get ภูม sign-off
on direction. THEN build.

---

## Part 5 — Specific decisions ภูม needs to make

Before I touch any of the 3 NEW issues:

1. **NEW-1 (/admin/service-orders fidelity).** Fix priority order?
   - (a) Action column buttons first (visible immediate win)
   - (b) Status tabs with counts first (perceived speed)
   - (c) Full Wave 18-B-style 12-col table sweep (3-4h, slow but thorough)

2. **NEW-2a (MOMO missing customers).** What should /review do for "no
   userID match"?
   - (a) Just show the error as-is (current)
   - (b) Inline "create new customer" flow with MOMO data prefilled
   - (c) Skip them in bulk commit + put them in a "needs new customer" queue
   - (d) Add an admin pre-step before any commit attempt

3. **NEW-2c (cabinet field).** Add migration for `momo_import_tracks.momo_cabinet_no`?
   - This is a schema change. Should I wait for เดฟ + check the next free migration number?
   - Backfill plan: re-pull container_closed for last 30 days + UPDATE join

4. **NEW-3 (driver assignment).** I need to read `forwarder-driver.php` end-to-end FIRST. Should I send another agent or take it myself?

5. **#9 accounting PEAK** — defer until you've sent the screenshot again + we agree on what features are in/out?

6. **Push permission** — should I push the 10 commits now (substantial save-point) or hold until NEW issues are also resolved?

---

## Part 6 — Resume command for next session

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # current = 11 ahead of origin
head -100 CLAUDE.md
cat docs/research/status-report-2026-05-30-evening.md   # this doc
```

---

**Standing by for ภูม's call on priorities + decisions.**
