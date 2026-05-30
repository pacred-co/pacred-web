# ภูม prep spec — Crons + forwarder ops (P0-22 + P1-1/2/4/5/6/7/9) · 2026-05-31

> Author: เดฟ-lane READ-ONLY auditor. No code written; sources read from the
> 2026-05-24 canonical legacy extract (`/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`)
> + current Pacred `dave-pacred` working tree.
>
> ⚠️ **READ THIS FIRST — the task premise is partly STALE.** The brief describes
> P0-22 (3 crons) + P1-1/P1-2/P1-4/P1-5 as still dead-writing rebuilt tables.
> **They are NOT.** They were retargeted on **2026-05-30 night** (P0-22 close-out)
> and the docblocks + code confirm they now write the correct `tb_*` tables.
> I verified every one against the legacy PHP. What remains genuinely open is a
> short list of **fidelity refinements on the crons** + **3 still-missing forwarder
> functions** (P1-6, P1-7, P1-9) + **1 newly-discovered dead-write** (`adminMarkForwarderPaid`).
> Do NOT "re-fix" the already-correct code — see the per-gap "Current Pacred" sections.

---

## Summary table

| Gap | Status | Legacy file:line | Dead Pacred table (if any) | Correct `tb_*` | Effort |
|---|---|---|---|---|---|
| **P0-22a** refresh-active-customers | ✅ DONE + 🟡 1 missing side-effect | `api/autorun/update-active-customers/index.php` L12-49 | ~~`profiles.is_active`~~ (was) | `tb_users.useractive='1'` | 15 min (add the `tb_check_forwarder` cleanup) |
| **P0-22b** sales-daily-digest | ✅ reads right table + 🟠 2 fidelity drifts | `api/autorun/send-line-sales/index.php` L20-94 | ~~`wallet_transactions`~~ (was); recipients still read rebuilt `admins`+`profiles` | `tb_wallet_hs` (✓) · recipient → `notifyStaffGroup()` | 1-1.5h |
| **P0-22c** expire-probation | ✅ DONE (faithful) | `api/autorun/check-apprentice/index.php` L13-21 | ~~`admin_contact_extras`~~ (was) | `tb_admin` (camelCase cols) | 0 — verify only |
| **P1-1** bulkUpdateStatus | ✅ DONE | `forwarder-action.php` L162-189 (dispatch) | ~~`forwarders`~~ (was) | `tb_forwarder.fstatus` via `adminBulkUpdateForwarderTbStatus` | 0 — verify only |
| **P1-2** bulkAssignDriver | ✅ DONE (batch shape correct) | `forwarder-driver.php?page=add` L22-111 | ~~`forwarder_driver` flat~~ (was) | `tb_forwarder_driver` + `tb_forwarder_driver_item` | 0 — verify only |
| **P1-4** driver-expiry cron | ✅ DONE | `forwarder-driver.php` L4-17 | ~~`forwarder_driver`~~ (was) | `tb_forwarder_driver` + item | 0 — verify only |
| **P1-5** earn-trigger on `fstatus=7` | ✅ DONE (wired both paths) | `forwarder.php` L1354-1389 / L1656-1696 | (none — was missing entirely) | `tb_user_sales` INSERT | 0 — verify only |
| **P1-6** single-container cnt-payment + image slip | ❌ REAL GAP | `report-cnt.php?id=` POST `add` L741-810 | n/a (function absent) | `tb_cnt` w/ `cntimagesslip` populated | 2-3h |
| **P1-7** per-row bill-to-customer 4→5 | ❌ REAL GAP (+ `adminMarkForwarderPaid` is a dead-write) | `report-cnt.php` `update_forwarder_to5` L835-911 | `adminMarkForwarderPaid` reads `forwarders` + writes `wallet_transactions` (both rebuilt/empty) | `tb_forwarder.fstatus='5'` + notify | 3-4h |
| **P1-9** saveNote (note-only save + notify) | ❌ REAL GAP (function absent) | `forwarder.php` `saveNote` L1166-1231 | n/a (function absent) | `tb_forwarder.fnote/fnoteuser/fnotedate/fnoteuserread` | 1.5-2h |

**Net for ภูม:** the cheap correctness wins (3 crons) are already banked. Real
remaining build work is **P1-6 + P1-7 + P1-9** (~7-9h) plus the cron fidelity
polish (~1.5-2h). The **P1-7 discovery** (`adminMarkForwarderPaid` dead-write) is
the most important — it is a silent money-path bug in the admin override.

---

## CASING REFERENCE (do not get this wrong)

| Table family | Column casing | Examples (verified in code/migration 0081) |
|---|---|---|
| `tb_users` | **camelCase** | `userID`, `userActive`, `coID`, `userTel`, `userEmail`, `userLineNotify` |
| `tb_admin` | **camelCase** | `adminID`, `adminStatusA`, `endDate`, `adminType`, `adminDel`, `dateDel`, `adminName`, `adminLastName`, `adminEmail` |
| `tb_co` | **camelCase** | `coID` |
| **all other `tb_*`** | **lowercase** | `tb_forwarder.fstatus`, `tb_forwarder.fcabinetnumber`, `tb_forwarder.userid`, `tb_forwarder_driver.fdstatus`, `tb_cnt.cntimagesslip`, `tb_wallet_hs.amount`, `tb_user_sales.idf` |

> The dead rebuilt tables use yet different names — `profiles.is_active`,
> `wallet_transactions`, `admin_contact_extras`, `forwarder_driver` (flat),
> `forwarders.f_no`/`forwarders.status`. Never write those for live data.
>
> ⚠️ **PostgREST quirk in the cnt tables:** `actions/admin/cnt-payment.ts` queries
> `tb_cnt_item` / `tb_cnt` with **camelCase** keys (`fCabinetNumber`, `cntID`,
> `cntImagesSlip`, `ID`). The other cnt action (`report-cnt-detail.ts`) uses
> **lowercase** (`fcabinetnumber`, `id`). Both apparently work because PostgREST
> fuzzy-resolves — but this is a documented schema-casing-drift landmine
> (`docs/learnings/php-port-patterns.md`). For P1-6 **match the existing
> `cnt-payment.ts` casing** (camelCase quoted), since that file is the one you
> extend, and it already reads/writes `tb_cnt` successfully today.

---

## P0-22a — refresh-active-customers ✅ DONE + 🟡 one missing side-effect

### Legacy behaviour
`api/autorun/update-active-customers/index.php` L12-49. Three independent
SELECT…GROUP BY `userID` streams, each flips `tb_users.userActive='1'`:

```sql
-- Stream 1 (L12)
SELECT userID FROM `tb_header_order` WHERE hStatus>2 AND hStatus<>6 GROUP BY userID;
-- Stream 2 (L24)
SELECT userID FROM `tb_forwarder` WHERE fStatus>5 GROUP BY userID;
-- Stream 3 (L36)
SELECT userID FROM `tb_payment` WHERE payStatus=2 GROUP BY userID;
-- per matched userID:
UPDATE `tb_users` SET `userActive`='1' WHERE userID='$userID';
-- Stream 4 — cleanup (L48), NOT a userActive flip:
DELETE FROM `tb_check_forwarder` WHERE fID=0;
```

**The active-value is the literal string `'1'`** (column is `varchar(1)`, comment
"1=ใช้งานแล้ว"). Legacy never demotes (no `userActive='0'` path here).

### Current Pacred
`app/api/cron/refresh-active-customers/route.ts` — **already retargeted** (docblock
"P0-22 — RETARGETED 2026-05-30 night"). It:
- reads `tb_header_order.hstatus IN ('3','4','5')` (= `>2 AND <>6` ✓),
  `tb_forwarder.fstatus IN ('6','7','8','9')` (= `>5` ✓),
  `tb_payment.paystatus='2'` (✓);
- `UPDATE tb_users SET useractive='1' ... .neq('useractive','1')` (idempotent ✓).

This is faithful. **One legacy side-effect is missing:** the
`DELETE FROM tb_check_forwarder WHERE fID=0` housekeeping (L48) is not ported.

### The fix (🟡 minor — optional but faithful)
In `route.ts`, after the `tb_users` update succeeds, add:
```
const { error: cleanErr } = await supabase
  .from("tb_check_forwarder")
  .delete()
  .eq("fID", 0);            // NOTE: tb_check_forwarder column is `fID` — verify
                            //  exact casing against migration 0081 / the existing
                            //  report-cnt-detail.ts which writes `fID` (camelCase quoted).
```
- The legacy intent: purge orphan audit-queue rows whose forwarder id is 0
  (rows that lost their forwarder link). Low-risk, idempotent.
- ⚠️ Confirm the column name: `report-cnt-detail.ts` reads/writes `tb_check_forwarder`
  using `fID` (camelCase) + `cfStatus` + `adminID`. Match that.

### Test assertion (tsx, real `tb_*`)
```
// seed a tb_header_order row with hstatus='3' for a known userid whose
// tb_users.useractive='0', run the handler, then:
const { data } = await admin.from("tb_users").select("useractive").eq("userid", SEED_UID).single();
assert(data.useractive === "1");
// + seed a tb_check_forwarder row with fID=0 → assert it's gone after run.
```

### Reachability
- Cron: `vercel.json` has `{ "path": "/api/cron/refresh-active-customers", "schedule": "0 1 * * *" }` (daily 01:00 UTC = 08:00 ICT). ✅ already scheduled.
- Manual trigger: GET the route with the `CRON_SECRET` bearer (instrumentCron gates it). No dedicated admin button — if owner wants one, add a "รันตอนนี้" button under `/admin/system/crons` (out of scope here).

---

## P0-22b — sales-daily-digest ✅ right table + 🟠 two fidelity drifts

### Legacy behaviour
`api/autorun/send-line-sales/index.php` L20-94. Daily 00:05 digest, **three
streams**, each computed yesterday-sum + month-to-date-sum from `tb_wallet_hs`
joined to the source order table, then `sendLineNotify($token, $msg)` per stream
(legacy fires **3 separate LINE messages**, one per stream). Exact SQL:

```sql
-- ฝากสั่งซื้อ (L21-24 yday · L31-34 MTD)
SELECT SUM(wh.amount) AS sumTotalPriceUser, COUNT(hNo)
FROM `tb_wallet_hs` AS wh
LEFT JOIN tb_header_order AS ho ON ho.hNo=wh.refOrder
WHERE (DATE(wh.date)='$yesterday') AND wh.status='2' AND ho.hNo<>'';
-- ฝากนำเข้า (L47-50 yday · L57-60 MTD)
SELECT SUM(wh.amount) AS sumTotalPriceUser, COUNT(f.ID)
FROM `tb_wallet_hs` AS wh
LEFT JOIN tb_forwarder AS f ON f.ID=wh.refOrder
WHERE (DATE(wh.date)='$yesterday') AND wh.status='2' AND wh.type=4;
-- ฝากโอนหยวน (L73-76 yday · L83-86 MTD)
SELECT SUM(wh.amount) AS sumTotalPriceUser, COUNT(p.ID)
FROM `tb_wallet_hs` AS wh
LEFT JOIN tb_payment AS p ON p.ID=wh.refOrder
WHERE (DATE(wh.date)='$yesterday') AND wh.status='2' AND p.payStatus=2 AND wh.type=6;
```

Key legacy facts:
- **Filter `wh.status='2'`** (=สำเร็จ) on all three — non-negotiable.
- The **ฝากสั่งซื้อ** stream is NOT filtered by `wh.type`; it's filtered by
  `ho.hNo<>''` (the wallet-hs row joins a real header-order). So "ฝากสั่งซื้อ"
  = "wallet-hs rows whose `refOrder` is a real `tb_header_order.hNo`", regardless
  of type.
- The **ฝากนำเข้า** stream = `wh.type=4` AND join `tb_forwarder` on `f.ID=wh.refOrder`.
- The **ฝากโอนหยวน** stream = `wh.type=6` AND `p.payStatus=2` AND join `tb_payment`.
- **Recipient = a hardcoded staff-group LINE-Notify token** `$token =
  "bb2BEqq1lS9gX2kVtYb1CTDL9DvwW1fjxLJ96H0HJm2"` (L19). This is the
  **staff/ops group ping** — NOT per-admin. LINE Notify is **EOL (April 2025)**
  so the token is dead → Pacred replacement is `notifyStaffGroup()` (the LINE OA
  group push, env-gated on `LINE_STAFF_GROUP_ID`).
- `getThaiMonth($thisMonth*1)` produces the Thai month name in the message.

### Current Pacred
`app/api/cron/sales-daily-digest/route.ts` — **reads the right table** (`tb_wallet_hs`,
filtered `status='2'` ✓, yday + MTD ✓). But two divergences from legacy:

**🟠 Drift 1 — stream classification.** Pacred classifies the three streams purely
by `tb_wallet_hs.type` (`'2'` order / `'4'` import / `'6'` yuan). Legacy classifies
**ฝากสั่งซื้อ by the `tb_header_order` join (`ho.hNo<>''`), not by type**, and
import/yuan by type+join. The Pacred docblock itself flags this ("legacy joins on
tb_header_order.hno=refOrder, but filtering by type is the SOT classification" —
that's an assumption, not what the legacy SQL does). Net effect: Pacred's
"ฝากสั่งซื้อ" count can differ from legacy when an order-payment wallet-hs row has
a type other than `'2'` (e.g. the "เติมเพิ่ม" top-up sub-class the docblock mentions).

**🟠 Drift 2 — recipient transport.** Pacred sends via `sendNotification(profileId, …)`
to admins read from the **rebuilt `admins`+`profiles`** tables filtered on
`role IN ('super','sales_admin') AND is_active=true AND profiles.notify_channels.daily_digest=true`.
On prod those rebuilt tables are sparse/empty for channel-prefs → **likely zero
recipients** → the digest computes correctly but **goes nowhere**. Legacy fired to
one fixed staff LINE group.

### The fix
1. **Recipient (do this first — highest leverage).** Replace the rebuilt-`admins`
   recipient loop with a single `notifyStaffGroup(message)` call (the helper is
   already built + reachable at `lib/notifications/staff-group.ts`). Keep the
   computed `message` text. This matches legacy "1 staff-group ping" exactly and
   removes the dependency on rebuilt `profiles.notify_channels`.
   - Legacy fires **3 messages** (one per stream); Pacred currently composes **1
     combined message** (`formatDigestMessage`). Owner-decision: keep the 1-combined
     (cleaner) OR split into 3 to match legacy verbatim. **Recommend 1 combined** —
     the design-latitude rule lets us improve format; only the *numbers* must match.
   - ⚠️ `notifyStaffGroup` is a **no-op until `LINE_STAFF_GROUP_ID` is set on Vercel
     prod** (owner activation item — already tracked in CLAUDE.md top-section). Wiring
     it now means "the moment the id lands, the digest pings staff" with zero further
     change. This is the same pluggable pattern as P1-24.
2. **ฝากสั่งซื้อ classification (fidelity).** To match legacy, the order stream
   should be "wallet-hs rows whose `refOrder` matches a real `tb_header_order.hno`"
   not "type='2'". Options:
   - (a) Faithful: 2-step — fetch yday `tb_wallet_hs` rows with `status='2'`, then
     filter to those whose `reforder` is in the set of `tb_header_order.hno`. Heavier
     (no FK join in PostgREST without an embed).
   - (b) Embed: `tb_wallet_hs.select("amount, reforder, tb_header_order!inner(hno)")`
     if a PostgREST relationship exists between the tables (verify — `reforder` is a
     bare text column, likely NO FK, so the embed may not resolve).
   - **Recommend:** keep type-based for import (`type='4'`) + yuan (`type='6'`) since
     those legacy queries DO filter on type, and only re-do the **order** stream to
     the header-order-join semantics if owner wants exact-match digests. Low priority
     vs the recipient fix.
   - Column names: `tb_wallet_hs.amount` (numeric), `.status` (varchar(1)), `.type`
     (varchar(1)), `.date` (timestamp), `.reforder` (text — the order/forwarder/payment id).

### Test assertion (tsx, real `tb_*`)
```
// seed: tb_wallet_hs rows with status='2', date=yesterday, type='4', known amount
// run handler; assert payload.totals.import_payment.yday.sum === seededSum.
// + monkeypatch / spy notifyStaffGroup to assert it's invoked once with a message
//   containing the formatted sum (in dev LINE_PUSH_BYPASS=true makes it a logged no-op,
//   so assert on the returned summary instead of a real push).
```

### Reachability
- Cron: `vercel.json` `{ "path": "/api/cron/sales-daily-digest", "schedule": "5 17 * * *" }` (17:05 UTC = 00:05 ICT ✓ matches legacy "00:05"). ✅ scheduled.
- Output reachability: the digest only "arrives" once `LINE_STAFF_GROUP_ID` is set (owner). Until then it's a computed-but-undelivered report — acceptable per the pluggable pattern.

---

## P0-22c — expire-probation ✅ DONE (faithful — verify only)

### Legacy behaviour
`api/autorun/check-apprentice/index.php` L13-21 (the admin-probation half; L26-43 is
the driver-expiry half — that's P1-4, ported separately into its own cron). Exact SQL:

```sql
SELECT endDate, adminID FROM `tb_admin`
  WHERE `adminStatusA`<>'0' AND `endDate`<'$now'
    AND endDate<>'0000-00-00 00:00' AND adminType<>1;
-- per matched adminID:
UPDATE `tb_admin` SET `adminStatusA`='0', adminDel='ลบโดยระบบ', dateDel='$now'
  WHERE adminID='$adminID';
```
camelCase columns: `adminStatusA` ('1'=active,'0'=suspended), `endDate`, `adminType`
('1'=ประจำ → never expires), `adminDel`, `dateDel`, `adminID`.

### Current Pacred
`app/api/cron/expire-probation/route.ts` — **already faithful** (docblock "P0-22 —
RETARGETED 2026-05-30 night"). Filters `tb_admin` on `adminstatusa<>'0'`,
`admintype<>'1'`, `enddate IS NOT NULL`, `enddate < now`; updates
`{ adminstatusa:'0', admindel:'ลบโดยระบบ', datedel: nowIso }`. Note Pacred uses
**lowercase** PostgREST keys (`adminstatusa`, `admintype`, `enddate`) — PostgREST
resolves them against the camelCase `tb_admin` columns. The `0000-00-00` sentinel is
handled by `.not('enddate','is',null)` (a MySQL zero-date became NULL on import).

### The fix
**None.** This is correct. Verify-only.
- ⚠️ **Data gate:** like P1-15, this is a no-op until ภูม recreates the 13 legacy
  admins via `/admin/admins/new` (they currently don't exist as `tb_admin` rows with
  `endDate` set, per the Wave-22 manual-recreate task). Once admins exist, the sweep
  works automatically.

### Test assertion (tsx, real `tb_*`)
```
// seed tb_admin row: adminstatusa='1', admintype='2', enddate=yesterday
// run handler; assert that row now has adminstatusa='0', admindel='ลบโดยระบบ'.
// + seed a admintype='1' row with past enddate → assert it is NOT suspended.
```

### Reachability
- Cron: `vercel.json` `{ "path": "/api/cron/expire-probation", "schedule": "0 2 * * *" }` (02:00 UTC = 09:00 ICT). ✅ scheduled.

---

## P1-1 — bulkUpdateStatus (list-bar status-flip) ✅ DONE (verify only)

### Legacy behaviour
The forwarder list-bar "เปลี่ยน status" dispatches a `tb_forwarder.fStatus='<n>'`
UPDATE for the checked rows (`forwarder-action.php` L162-189 region — multi-mode
dispatcher; the status tabs are q=1..7). Numeric enum (varchar(2)):
`'1'` รอเข้าโกดังจีน · `'2'` ถึงโกดังจีน · `'3'` กำลังส่งมาไทย · `'4'` ถึงไทยแล้ว ·
`'5'` รอชำระเงิน · `'6'` เตรียมส่ง · `'7'` ส่งแล้ว · `'99'` สถานะพิเศษ.

### Current Pacred
`actions/admin/forwarders-bulk.ts::bulkUpdateStatus` (L197-246) — **already
correct.** It parses stringified bigint ids, then **delegates to the faithful
`adminBulkUpdateForwarderTbStatus`** (`actions/admin/forwarders.ts` L544) which
writes `tb_forwarder.fstatus`, stamps `fdatestatusN` (via `TB_STATUS_DATE_COL`),
appends `tb_log_forwarder_status`, resolves legacy userid→profile_id, fires
customer notifications, and on a bulk-to-`'7'` fires the P1-5 earn-trigger.
Input schema uses the legacy numeric enum (`TB_FORWARDER_STATUSES = ['1'..'7','99']`).

> ⚠️ **`forwarders-bulk-tb.ts` does NOT exist** — the faithful twin the brief asks
> about is the **method** `adminBulkUpdateForwarderTbStatus` inside `forwarders.ts`,
> and `bulkUpdateStatus` already calls it.

### The fix
**None** — open task #41 is effectively closed for the status path. Verify-only.

### Test assertion (tsx, real `tb_*`)
```
// seed tb_forwarder id=X fstatus='3'; call bulkUpdateStatus([X],'4');
// assert tb_forwarder.fstatus==='4' AND fdatestatus4 is set AND a
// tb_log_forwarder_status row (fstatusold='3', fstatusnew='4') exists.
```

### Reachability
- `app/[locale]/(admin)/admin/forwarders/bulk-actions-toolbar.tsx` L6,L129 imports
  + calls `bulkUpdateStatus`. Path: sidebar → ฝากนำเข้า/forwarders → tick rows →
  "เปลี่ยน status" bar. ✅ reachable (≤3 clicks).

---

## P1-2 — bulkAssignDriver (batch shape) ✅ DONE (verify only)

### Legacy behaviour — the BATCH shape
`forwarder-driver.php?page=add` (the `if(!isset($_GET["page"]))` + `isset($_POST['add'])`
block, L22-111). One **parent** row + N **child** rows, inserted in two statements:

```sql
-- parent (L46-48):
INSERT INTO `tb_forwarder_driver`
  (`fdDate`, `fdName`, `fdAdminID`, `fdAdminCreator`, `fdStatus`, `fdAmount`, `endTime`)
VALUES ('$datetime_now', '$fdName', '$adminIDFrom', '$adminID', '1', '$fdAmount', '$endTime');
-- children (L60-63), one VALUES tuple per selected forwarder id:
INSERT INTO `tb_forwarder_driver_item`(`fdID`, `fID`) VALUES ('$fdID','$fID'), ('$fdID','$fID2'), …;
```
Legacy field derivations:
- `fdName = date('Y-m-d-H').'-'.$adminIDFrom` (L29) — the driver's adminID, "YYYY-MM-DD-HH-{driverId}".
- `$adminIDFrom = $_POST['adminID']` — the **driver** being assigned (legacy admin/driver text id).
- `$adminID` (the `fdAdminCreator`) = the logged-in ops user (`$_COOKIE["pcs_admin_adminID"]`).
- `$fdAmount = $_POST['fdAmount']` — number of delivery stops (admin types it).
- `endTime` = NOW + `$_POST['endTime']` hours (the 17/24/30 picker, L35-39).
- `fdStatus='1'` กำลังดำเนินการ.
- Then it fires **2 LINE messages** (L103, L105) — a staff token + the driver's own
  LINE token (`getTokenLineDriver`) — with the batch summary (stops, tracking count,
  box count, deadline, link).

**Authoritative schema (migration 0081 L1976-1985 / L2011-2018):**
```
tb_forwarder_driver:
  id              bigint PK (autoinc)
  fddate          timestamp without time zone
  fdname          varchar(200) NOT NULL
  fdamount        integer       NOT NULL
  fdadminid       varchar(20)   NOT NULL   -- the DRIVER's text id
  fdadmincreator  varchar(20)   NOT NULL   -- the OPS creator's text id
  fdstatus        varchar(1)    NOT NULL   -- '1' active, '3' expired, etc.
  endtime         timestamp without time zone

tb_forwarder_driver_item:
  id              bigint PK (autoinc)
  fdid            bigint        NOT NULL   -- FK → tb_forwarder_driver.id
  fid             bigint        NOT NULL   -- = tb_forwarder.id (NOT "forwarderid")
  fdistatus       varchar(1)    NOT NULL   -- '' ยังไม่ขึ้นรถ, '1' ขึ้นรถ, '2' ส่งสำเร็จ, '3' ส่งไม่ได้
  fdipictureon    varchar(150)  NOT NULL   -- 'รูปขึ้นรถ'
  fdipictureoff   varchar(150)  NOT NULL   -- 'ลงรถ'
```

### Current Pacred
`actions/admin/forwarders-bulk.ts::bulkAssignDriver` (L330-578) — **already writes
this exact shape.** It resolves the driver UUID → `admins.role='driver'` →
`profiles.member_code` (PR-format) for `fdadminid`; snapshots `tb_forwarder` by id;
guards per-row (`fstatus!='6'` → reject, `paydeposit='1'` → reject, open-batch via
`tb_forwarder_driver_item.fdistatus IN ('','1')` → reject); INSERTs the parent
(`fddate`, `fdname="YYYY-MM-DD-HH-{driverId}"`, `fdamount=count`, `fdadminid`,
`fdadmincreator`, `fdstatus='1'`, `endtime=NOW+hrs`); INSERTs N children
(`fdid`, `fid`, `fdistatus:''`, `fdipictureon:''`, `fdipictureoff:''`); rolls back the
parent if children fail; audits + pushes one driver notification. The **column is
`fid` not `forwarderid`** — the Pacred code has this right (the task brief had it wrong,
and the Pacred docblock at L293 calls that out explicitly).

The reference `createDriverBatch` (`actions/admin/driver-batches.ts` L72+) writes the
identical shape and is the standalone `/admin/drivers/new` path.

### The fix
**None** for the batch shape. Verify-only.
- 🟡 Minor fidelity notes (optional): (a) Pacred uses `fdamount = item count` as a
  conservative "stops" proxy whereas legacy lets the admin **type** the stop count —
  if owner wants the typed value, add a field to the toolbar. (b) Pacred sends **1**
  driver notification; legacy sends **2** LINE messages (staff token + driver token).
  The driver push is covered; the staff-group ping would be `notifyStaffGroup(...)`
  if owner wants it. Both are design-latitude, not death-gaps.

### Test assertion (tsx, real `tb_*`)
```
// seed tb_forwarder id=X fstatus='6' paydeposit=null; an active admins.role='driver'
// with a profiles.member_code. call bulkAssignDriver([X], driverProfileId, 17).
// assert: one tb_forwarder_driver parent (fdstatus='1', fdadminid=memberCode) +
// one tb_forwarder_driver_item child (fid=X, fdistatus='', fdid=parent.id).
```

### Reachability
- `bulk-actions-toolbar.tsx` L7,L159 → "มอบหมายคนขับ" with fuzzy driver search + endTime picker. ✅ reachable. Also `/admin/drivers/new` standalone. ✅

---

## P1-4 — driver-expiry cron ✅ DONE (verify only)

### Legacy behaviour
Two legacy sweeps do the same thing:
- `forwarder-driver.php` L4-17 (runs on admin page-load): `endTime<NOW() AND fdStatus=1`
  → `fdStatus='3'`, cascade `tb_forwarder_driver_item.fdiStatus='3' WHERE fdiStatus='' AND fdID IN(...)`.
- `api/autorun/check-apprentice/index.php` L26-43: the constant-threshold fallback
  `fdDate < NOW()-17h AND fdStatus=1` → same updates.

### Current Pacred
`app/api/cron/expire-driver-assignments/route.ts` — **already faithful**, uses the
canonical per-row `endtime<now()` path (the `forwarder-driver.php` L4-17 semantics).
Flips `tb_forwarder_driver.fdstatus='1'→'3'` then cascades
`tb_forwarder_driver_item.fdistatus=''→'3'`. Columns lowercase (correct for these tables).

### The fix
**None.** Verify-only.

### Reachability
- Cron `vercel.json` `{ "path": "/api/cron/expire-driver-assignments", "schedule": "0 * * * *" }` (hourly). ✅

---

## P1-5 — tb_user_sales earn-trigger on `fstatus=7` delivery ✅ DONE (verify only)

### Legacy behaviour
`forwarder.php` L1354-1389 / L1656-1696 (+ the driver-deliver path): when a forwarder
flips to `fstatus='7'` (ส่งสำเร็จ), look up `tb_users.coID`; if it's one of the **4
hardcoded VIP teams** (`THADA.VIP`, `SIN.VIP`, `OOAEOM.VIP`, `SWAN` — note SWAN has no
`.VIP` suffix), INSERT a `tb_user_sales` row the team-leader withdraws later. Dedup by
`SELECT IDF … WHERE IDF='$ID'`.

`tb_user_sales` schema (0081): `id` (PK), `usstatus` varchar(1), `date` timestamp,
`useridmain` varchar(10) (= the team coID), `userid` varchar(10) (the customer),
`idf` bigint (= `tb_forwarder.id`, the dedup key).

### Current Pacred
`actions/admin/earn-trigger-tb-user-sales.ts::fireUserSalesEarnTriggerOnDelivery` —
**already built + wired into BOTH flip-to-7 paths:**
1. `actions/admin/driver-work.ts` L314 (driver mobile "ส่งสำเร็จ" auto-flip).
2. `actions/admin/forwarders.ts` `adminBulkUpdateForwarderTbStatus` L754-756 (bulk list-bar flip to '7').

It inserts `{ useridmain: coid, userid, idf: forwarder.id, date: fdatestatus7 ?? now,
usstatus: '1' }`, idempotent on `idf`, best-effort (never rolls back the delivery).
The 4-VIP whitelist (`VIP_COID_WHITELIST`) is exact.

### The fix
**None.** Verify-only.
- 🟡 Coverage note: the **single** non-bulk admin flip-to-7 paths — if any UI flips a
  forwarder to '7' WITHOUT going through `adminBulkUpdateForwarderTbStatus` or
  driver-work — would miss the trigger. Both known entry points are covered; no other
  flip-to-7 writer was found in `actions/admin/`.

### Test assertion (tsx, real `tb_*`)
```
// seed tb_users userid=U coid='THADA.VIP'; tb_forwarder id=X userid=U fstatus='6'.
// flip via adminBulkUpdateForwarderTbStatus({fids:[X],fstatus:'7'}).
// assert one tb_user_sales row exists with idf=X, useridmain='THADA.VIP', usstatus='1'.
// re-run → assert still exactly one row (idempotent).
```

### Reachability
- Inherited from P1-1 (bulk bar) + driver mobile work-list (`/admin/drivers/work`). ✅

---

## P1-6 — single-container manual cnt-payment WITH image slip ❌ REAL GAP

### Legacy behaviour
`report-cnt.php?id=<fCabinetNumber>` POST `add` handler, **L741-810** — this is the
**per-container detail-page** payment (distinct from the list-bar bulk path L4-101).
Key differences from the bulk path:
- Operates on **ONE** `fCabinetNumber` (from `$_POST['fCabinetNumber']`, the container
  you drilled into) — NOT a CSV of many.
- **Requires an IMAGE slip** `$_FILES['cntImagesSlip']` — validated as PNG/JPEG via
  `exif_imagetype` (L750-755), renamed `{adminID}_{uniqid}{time}.{ext}`, moved to
  `../storage/slip/`. The bulk path takes an optional **PDF** (`cntFile`); this path
  takes a **required image** (`cntImagesSlip`).
- Duplicate guard (L768): `SELECT ID FROM tb_cnt WHERE fCabinetNumber='$x'` — if a row
  already exists for this cabinet → `eRe` (ข้อมูลซ้ำ). (Bulk path guards against
  `tb_cnt_item`; this path guards against `tb_cnt` directly.)
- Fan-out (L771-796): `SELECT fIDorCO, fTrackingCHN FROM tb_forwarder WHERE
  fCabinetNumber='$x'` → bulk-INSERT `tb_cnt_pay_idorco` + `tb_cnt_pay_trackingchn`
  (same as bulk path).
- INSERT (L797-799):
  ```sql
  INSERT INTO `tb_cnt` (`fCabinetNumber`, `cntAmount`, `cntImagesSlip`, `date`, adminID)
  VALUES ('$fCabinetNumber', '$cntAmount', '$cntImagesSlip', NOW(), '$adminID');
  ```
  **NOTE:** the single path inserts into a `cntName`-less / `cntStatus`-less shape
  using `fCabinetNumber` + `cntImagesSlip` + `adminID` (different column set than the
  bulk path which uses `cntName` CSV + `cntStatus='1'` + `adminIDCreate`). Both are the
  same `tb_cnt` table; the column set written differs.

### Current Pacred
`actions/admin/cnt-payment.ts::adminCreateCntPayment` is **only the BULK path** (the
list-bar `?page=succeed` flow). It:
- takes `cabinetNumbers: string[]` (CSV/array) — multi-cabinet;
- takes an optional **PDF** (`.pdf` only, L191-194) → `member-docs/cnt-payment/<id>/<name>`;
- writes `tb_cnt` with **`cntImagesSlip: ""`** (L248 — explicitly empty) + `cntName`
  CSV + `cntStatus:'1'` + `adminIDCreate`;
- guards on `tb_cnt_item` (not `tb_cnt`).

→ **There is no single-container + image-slip entry path.** The container drill-down
(`/admin/report-cnt/[fNo]`) has no "ทำรายการจ่ายเงินตู้นี้ + แนบสลิป" action (its client
only exposes `adminReportCntAddCheck` + cost-rate modals).

### The fix
Add a new action (in `cnt-payment.ts`, alongside `adminCreateCntPayment`) +
its UI entry on the container detail page. Function shape:

```
adminCreateCntPaymentSingle(input: { fCabinetNumber: string; cntAmount: number },
                            slipImage: File): AdminActionResult<{ cntId }>
```
Steps (faithful to L741-810):
1. Validate `slipImage` is a real File, PNG or JPEG (mirror legacy `exif_imagetype`
   allow-list — `.png`/`.jpg`/`.jpeg`), size cap (reuse the 10 MB guard).
2. **Duplicate guard against `tb_cnt`** (NOT `tb_cnt_item`):
   `from("tb_cnt").select("ID").eq("fCabinetNumber", cab)` → if exists, error
   "ตู้นี้มีการจ่ายเงินแล้ว".
3. Resolve `adminID` (reuse `resolveLegacyAdminId()` already in the file).
4. Upload the image to storage — `member-docs/cnt-payment/<cnt_id>/<safeName>` is fine,
   OR mirror legacy `storage/slip/` prefix. Store the relative path (or filename) in
   `cntImagesSlip`. (Legacy inserts the filename FIRST then moves the file; PostgREST
   needs the row id for the path, so: INSERT with `cntImagesSlip:''`, upload, then
   UPDATE `cntImagesSlip` with the path — same 2-step `adminCreateCntPayment` uses for
   the PDF.) **`cntImagesSlip` must end up populated, not `''`** — that's the whole point.
5. INSERT `tb_cnt`. **Match the existing camelCase casing in this file:**
   `{ fCabinetNumber: cab, cntAmount, cntImagesSlip: "", cntStatus: "1", date: nowIso,
      adminIDCreate: legacyAdminId, … }`. (Legacy single-path used the column `adminID`;
   Pacred's bulk path uses `adminIDCreate` — keep `adminIDCreate` for consistency with the
   row the rest of the system reads, and set the other NOT-NULL varchars to `""` as the
   bulk path does. Confirm which the report-cnt list reads as "ผู้ทำรายการ".)
6. Fan-out to `tb_cnt_pay_idorco` + `tb_cnt_pay_trackingchn` from `tb_forwarder`
   `WHERE fcabinetnumber=cab` (lowercase keys here — `cnt-payment.ts` already does this
   at L319-322 reading `fidorco, ftrackingchn, fcabinetnumber`).
7. INSERT `tb_cnt_item` `{ fCabinetNumber: cab, cntID: cntId }` so the "จ่ายแล้ว" badge
   shows.
8. `logAdminAction` + `revalidatePath('/admin/report-cnt/'+cab)` + `/admin/report-cnt`.

> Decision for ภูม: the bulk path and the single path BOTH end up writing `tb_cnt` +
> `tb_cnt_item`. You could refactor `adminCreateCntPayment` to accept either a PDF
> (`cntFile`) or an image (`cntImagesSlip`) + single-or-multi cabinets — but legacy keeps
> them as two distinct handlers, so a sibling function is the faithful + lower-risk move.

### Test assertion (tsx, real `tb_*`)
```
// seed tb_forwarder fcabinetnumber='TESTCAB' fidorco='PRX' ftrackingchn='CN123'.
// call adminCreateCntPaymentSingle({fCabinetNumber:'TESTCAB',cntAmount:500}, fakeJpgFile).
// assert: tb_cnt row with fCabinetNumber='TESTCAB' AND cntImagesSlip <> '' (populated);
//         tb_cnt_item row {fCabinetNumber:'TESTCAB', cntID:<id>};
//         tb_cnt_pay_idorco has fIDorCO='PRX'. Re-run → 'ตู้นี้มีการจ่ายเงินแล้ว'.
```

### Reachability
- **NEW entry point required.** Add a "ทำรายการจ่ายเงินค่าตู้ + แนบสลิป" button on
  `/admin/report-cnt/[fNo]` (the container drill-down · `container-detail-client.tsx`)
  opening a modal (amount + image upload), calling the new action. Path: sidebar →
  report-cnt → click a container row → detail page → button. ≤3 clicks. **Without the
  button this function is an orphan (AGENTS.md §0d).**

---

## P1-7 — per-row bill-to-customer 4→5 (`update_forwarder_to5`) ❌ REAL GAP + dead-write found

### Legacy behaviour
`report-cnt.php` `update_forwarder_to5` POST handler, **L835-911**. This is the
**"ตัวหลักในการชำระเงิน"** (the primary billing trigger) — from the container
drill-down it flips ONE forwarder row to `fStatus=5` (รอชำระเงิน) and **notifies the
customer of the amount due**. Flow (exact):
1. `UPDATE tb_forwarder SET fDateStatus5=NOW(), fStatus='5', adminIDUpdate='$adminID' WHERE ID='$ID'` (L840).
2. `saveHistory($sql, 41)` — legacy history log.
3. Re-read the row (L848) + look up `tb_promotion.promoID WHERE fID='$ID'` (L862).
4. **Promo discount recompute** (L870-874): `promoID==3` → `fDiscount = price*0.10`;
   `promoID==4` → `fDiscount = price*0.07`; then `UPDATE tb_forwarder SET fDiscount=...`.
5. Compute `pricePay = (fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService) - fDiscount` (L880).
6. Look up customer (`tb_users` — `coID, userEmail, userName, userLastName, userTel, userLineNotify`).
7. **Notify 3 channels:**
   - **SMS** (L893-896): `send_sms("ยอดค่าขนส่ง $pricePay บ. ดู-> $url", $userTel)` where `url = basePathMain.'f/'.$ID`.
   - **Email** (L898-904): if `userEmail` → `contentMailForwarder(...)` + `sendMail(...)`.
   - **LINE** (L905-909): if `userLineNotify` → `sendLine($userLineNotify, $sMessage)` with member code + tracking + status + amount due + link.

### Current Pacred
**Two problems:**
1. **`report-cnt-detail.ts` does NOT have this handler.** It has `adminReportCntCustomRate`,
   `adminReportCntResetRate`, `adminReportCntAddCheck` — but NOT the 4→5 bill-to-customer.
2. **The nearest existing function, `actions/admin/forwarders.ts::adminMarkForwarderPaid`
   (L257), is itself a SILENT DEAD-WRITE** 🚨 — it reads `.from("forwarders")` (rebuilt
   UUID table, EMPTY on prod, L268) and writes `.from("wallet_transactions")` (rebuilt,
   empty, L324-331). It is the admin override for *recording a payment* (debit wallet),
   NOT the *"set status to 5 and tell the customer the amount due"* trigger — but even for
   its own purpose it's broken against live data. **Flag this to the money-loop owner.**
   (`adminBulkUpdateForwarderTbStatus` CAN flip a row to `'5'` faithfully + stamps
   `fdatestatus5` + fires `notify.forwarderStatusChanged` — but it does NOT do the
   promo-discount recompute or the explicit "amount due ฿X" SMS/email that the legacy
   billing trigger sends.)

### The fix
Add a faithful `adminReportCntBillToCustomer(fId: number)` (in `report-cnt-detail.ts`
or `forwarders.ts`) porting L835-911 against `tb_forwarder` (lowercase cols):
1. `UPDATE tb_forwarder SET fstatus='5', fdatestatus5=now, adminidupdate=<slug> WHERE id=fId`.
2. Re-read `fid`'s pricing cols: `ftotalprice, ftransportprice, fpriceupdate, fshippingservice,
   fdiscount, userid, ftrackingchn`.
3. Promo recompute: read `tb_promotion.promoid WHERE fid=fId`; if `'3'`→`fdiscount=ftotalprice*0.10`,
   if `'4'`→`*0.07`; `UPDATE tb_forwarder SET fdiscount=...`.
   (Mirror the promo logic the order-side already ports — reuse it if a helper exists.)
4. `pricePay = (ftotalprice + ftransportprice + fpriceupdate + fshippingservice) - fdiscount`.
5. Resolve customer: `tb_users` `userid, usertel, useremail, username, userlastname` (camelCase
   columns `userTel`/`userEmail`/etc — PostgREST resolves lowercase keys). Resolve profile_id
   for in-app/LINE-OA push via the existing `resolveProfileIdsForLegacyUserids` helper.
6. Notify (use Pacred's notification stack, NOT the dead `sendLine`/`send_sms` legacy fns):
   - SMS via the Pacred SMS gateway with "ยอดค่าขนส่ง {pricePay} บ. ดู-> /f/{id}" (or the
     Pacred customer-facing forwarder URL).
   - Email via the Pacred mail path (if `useremail`).
   - LINE OA push via `sendNotification(profileId, notify.forwarder…)` (the channel matrix
     already routes a status-change; add/confirm an "amount due" template).
7. `appendStatusLog(admin, fId, prevFstatus, '5', adminSlug)` + `logAdminAction` +
   `revalidatePath`.
8. Append `tb_log_forwarder_status` (the Pacred analogue of legacy `saveHistory(...,41)`).

> ⚠️ **Separately fix or retire `adminMarkForwarderPaid`** — repoint it to `tb_forwarder`
> + the canonical `tb_wallet`/`tb_wallet_hs` ledger (ADR-0018) OR delete it if the
> faithful wallet-debit path lives elsewhere. This is a money-path dead-write; do not
> leave it. (Out of strict P1-7 scope but discovered here — escalate to the wallet-SOT owner.)

### Test assertion (tsx, real `tb_*`)
```
// seed tb_forwarder id=X fstatus='4' ftotalprice=1000 ftransportprice=200
//   fpriceupdate=0 fshippingservice=0; tb_promotion fid=X promoid='3'; tb_users for the customer.
// call adminReportCntBillToCustomer(X).
// assert: tb_forwarder.fstatus==='5', fdatestatus5 set, fdiscount===100 (1000*0.10);
//   a tb_log_forwarder_status row (…->'5') exists; SMS/notify spy invoked with pricePay=1100.
```

### Reachability
- **NEW entry point required.** Add a per-row "บันทึกรอชำระเงิน (แจ้งยอดลูกค้า)" button on
  the `/admin/report-cnt/[fNo]` container drill-down rows (`container-detail-client.tsx`),
  calling the new action. ≤3 clicks from sidebar. (Legacy exposes it as the green
  "ตัวหลักในการชำระเงิน" per-row action on report-cnt detail.)

---

## P1-9 — saveNote (note-only save + notify) ❌ REAL GAP (function absent)

### Legacy behaviour
`forwarder.php` `saveNote` POST handler, **L1166-1231** (there's a second copy at
L2351+ — same logic, different page mode). Saves an admin note to a forwarder + fires
a LINE ping. Flow:
1. Read `userID, fCover, fTrackingCHN` from `tb_forwarder WHERE ID='$ID'`.
2. `fNoteUser` flag: `==1` → "เห็นเฉพาะแอดมิน" (admin-only, `fNoteUserRead=''`); else →
   customer-visible (`fNoteUserRead=1` = ลค ยังไม่อ่าน).
3. `UPDATE tb_forwarder SET fNoteDate=NOW(), fNoteUser='$fNoteUser', fNoteUserRead='$fNoteUserRead',
   fNote='$fNote', adminIDUpdate='$adminID' WHERE ID='$ID'` (L1183).
4. **Notify (always — even when `fNote` is empty, it sends "แก้ไขเรียบร้อยแล้ว"):**
   - If `fNoteUser==1` (admin-only): `sendLine($token=staff-token, $sMessage)` (L1196-1197) — a
     STAFF-group ping with order/member/detail/admin/link.
   - Else (customer-visible): a staff ping (L1217-1218) **AND** if `userLineNotify` → a
     customer LINE ping (L1219-1226) **AND** `require_once 'sendLineOAForwarderNotify.php'`
     (L1228 — the LINE-OA customer notify).

### Current Pacred
**No forwarder-note save action exists.** Grep across `actions/` for
`fnoteuser`/`fnotedate`/`saveNote`/`fnote`-write found only unrelated files
(carrier-manual, service-orders, api-forwarder-manual — none is the forwarder note
handler). `adminUpdateForwarder` (`forwarders.ts` L60) writes forwarder fields + fires a
status-change notification but does **not** touch `fnote`/`fnoteuser`/`fnotedate` and is
itself a rebuilt-`forwarders` writer (separate concern). So the entire
"admin saves a note on a forwarder" function — and its notify — is missing.

### The fix
Add `adminSaveForwarderNote(input: { id: number; fnote: string; fnoteuser: "1" | "0" })`
(new file `actions/admin/forwarder-note.ts` or inside `forwarders.ts`), porting L1166-1231
against `tb_forwarder` (lowercase cols):
1. Read `userid, fcover, ftrackingchn` from `tb_forwarder WHERE id=$id`.
2. `fnoteuserread = fnoteuser==='1' ? '' : '1'` (admin-only → no unread flag; customer →
   unread='1').
3. `UPDATE tb_forwarder SET fnotedate=now, fnoteuser, fnoteuserread, fnote, adminidupdate=<slug>
   WHERE id=$id`.
4. Notify via Pacred stack:
   - Admin-only note → `notifyStaffGroup(<message with order/member/detail/admin/link>)`
     (the LINE-OA group ping — the Pacred analogue of the legacy staff token; no-op until
     `LINE_STAFF_GROUP_ID` set).
   - Customer-visible note → `notifyStaffGroup(...)` AND resolve `userid`→profile_id and
     `sendNotification(profileId, notify.forwarderNote({...}))` (in-app + LINE-OA push; the
     analogue of legacy `sendLine($userLineNotify,...)` + `sendLineOAForwarderNotify.php`).
   - **Always notify** even when `fnote` is empty (legacy sends "แก้ไขเรียบร้อยแล้ว") —
     match this so the customer/staff see the edit happened.
5. `logAdminAction` + `revalidatePath('/admin/forwarders')` + the detail path.

> Column casing: `tb_forwarder` is lowercase — write keys `fnote`, `fnoteuser`,
> `fnoteuserread`, `fnotedate`, `adminidupdate`. (Confirm each exists in migration 0081 —
> `forwarder.php` L294 + L1234 read `fNote, fNoteDate, fNoteUser, fNoteUserRead`, so the
> columns exist; the import lowercased them.)

### Test assertion (tsx, real `tb_*`)
```
// seed tb_forwarder id=X userid=U fnote='' fnoteuser='0'.
// call adminSaveForwarderNote({id:X, fnote:'รอลูกค้าโอน', fnoteuser:'0'}).
// assert: tb_forwarder.fnote==='รอลูกค้าโอน', fnoteuser==='0', fnoteuserread==='1',
//   fnotedate set; notify spy invoked (staff + customer). Re-run with fnoteuser='1'
//   → fnoteuserread==='' and only the staff-group notify path runs.
```

### Reachability
- **NEW entry point required.** Add a "บันทึกหมายเหตุ" (admin-only / customer-visible
  toggle + text) action on the forwarder detail page (`/admin/forwarders/[fNo]`) and/or as a
  row-action on `/admin/forwarders`. ≤3 clicks. (Legacy exposes it as a note box on the
  forwarder detail page.)

---

## Open questions for owner / ภูม

1. **sales-daily-digest recipient (P0-22b):** keep Pacred's 1-combined-message format,
   or split into 3 messages to match legacy verbatim? (Recommend 1-combined — numbers must
   match, format is design-latitude.) And confirm the digest should go to `notifyStaffGroup`
   (1 staff LINE-OA group) rather than per-admin `notify_channels` (which is likely empty on
   prod).
2. **sales-daily-digest ฝากสั่งซื้อ classification (P0-22b):** is type-based (`type='2'`)
   acceptable, or must the order stream use the legacy `tb_header_order`-join semantics
   (`ho.hNo<>''`, type-agnostic)? Affects only the ฝากสั่งซื้อ count, not import/yuan.
3. **`adminMarkForwarderPaid` dead-write (found under P1-7):** who owns the repoint to
   `tb_forwarder` + `tb_wallet`/`tb_wallet_hs` (ADR-0018)? This is a silent money-path bug
   in the admin payment override — should it be a separate P0?
4. **P1-6 vs bulk cnt-payment:** sibling function (faithful, recommended) or refactor
   `adminCreateCntPayment` into one function that takes PDF-or-image + single-or-multi
   cabinets?
5. **P1-7 promo math:** is there a shared promo-discount helper already ported on the
   order side to reuse (promoID 3=10%, 4=7%), or port inline?
6. **P1-9 second copy:** legacy has `saveNote` twice (`forwarder.php` L1166 + L2351). Are
   they reached from different page modes (detail vs list) needing two Pacred entry points,
   or is one Pacred `adminSaveForwarderNote` + buttons on both pages enough? (Recommend one
   action, two buttons.)
7. **Staff-group pings (P1-2, P1-9):** several legacy paths fire BOTH a staff-group ping
   and a per-user push. Pacred currently sends only the per-user push on most. Wire
   `notifyStaffGroup` everywhere legacy did, or is the per-user push sufficient? (All
   no-op until `LINE_STAFF_GROUP_ID` is set anyway.)
