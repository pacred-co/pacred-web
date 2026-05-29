# Legacy gap audit — `cust-07-sales` (Sales · affiliate commission · LINE-notify · mail)

> Lane: **cust-07-sales** · side: **customer** · auditor pass 2026-05-30
> Legacy = source of truth (ADR-0017 · owner "ห้าม death · copy 100% first").
> Branch audited: `dave-pacred` (HEAD).
> Legacy source: `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/`

---

## Overview

### Legacy scope (what PCS Cargo actually does)

This lane covers the **affiliate / "ลูกค้าตัวแทน" commission** flow + the **per-customer LINE
notification** channel + **transactional mail**. There is **no customer self-serve commission
dashboard** in legacy — the four sales screens are **admin-only** (under `member/pcs-admin/`),
gated to a **hardcoded whitelist of 5 member codes** (`PCS888/PCS2000/PCS352/PCS2678/PCS4155`).

The legacy commission model (4 tables, verified against migration `0081` + the admin PHP):

| table | role |
|---|---|
| `tb_user_sales` | one earned-commission row per forwarder order, `usStatus` 1=ยังไม่เบิกจ่าย / 2=รอดำเนินการ / 3=เบิกจ่ายแล้ว |
| `tb_user_sales_admin_pay` | one payout batch (bank info + slip + `status` 2=รอดำเนินการ/3=สำเร็จ) |
| `tb_user_sales_pay` | join: which `tb_user_sales` rows belong to which payout batch |
| `tb_users.coID` | which VIP sales-group a customer belongs to (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN) |

**Canonical workflow + step ORDER:**

1. **Referral capture** — a prospect registers via `register/?recom=THADA|SIN|OOAEOM|SWAN`; this
   sets the new customer's `tb_users.coID` to the team. *(The `register.php` root file is stripped
   from this extract — confirmed via the `$urlRecom` derivation in `user-sales.php` L49-58 and the
   `coID` joins throughout `report-user-sales.php`.)*
2. **Earn-trigger** — when a referred customer's forwarder order reaches a billed/final status,
   admin `forwarder.php` (L1354-1389, also L1656-1696) checks `coID` and `INSERT INTO tb_user_sales
   (userIDMain, userID, IDF, date, usStatus) VALUES (…, 1)` — guarded by a `SELECT IDF … WHERE
   IDF='$ID'` dedup. **Only the 4 VIP groups accrue.**
3. **View team / report** — the whitelisted agent (admin) views `user-sales.php` (team members +
   invite link), `report-user-sales.php` (all team-sales rows, filter by `usStatus` + date range),
   `report-user-sales-add.php` (the unpaid rows, `usStatus=1`).
4. **Withdraw (payout)** — agent selects unpaid rows in `report-user-sales-add` →
   `getListForwarder.php` AJAX modal computes commission (`fTotalPrice−fDiscount` × 1% − 3% WHT,
   **min ฿1,000**) → POST `add` → `INSERT tb_user_sales_admin_pay` + `INSERT tb_user_sales_pay` +
   `UPDATE tb_user_sales SET usStatus='2'` (pending). Uploads ID-card PDF.
5. **Approve / pay** — accounting opens `report-user-sales-history.php?page=<ID>` (status=2) →
   uploads transfer slip → `UPDATE tb_user_sales_admin_pay SET status=3` (paid). *(Note: legacy
   does **not** flip `tb_user_sales.usStatus` 2→3 at this step — the `add` step set it to 2 and the
   history detail only renders `usStatus` labels 1/2; the "3" label exists but the 2→3 transition is
   not wired in legacy. Faithful behaviour = stop at the batch `status=3` flip.)*

**LINE notification (per-customer):** legacy stores an **OAuth `userLineNotify` access token** per
customer (`tb_users.userLineNotify`), obtained via the **LINE Notify** OAuth flow
(`api/linenotify/callback/index.php` → `UPDATE tb_users SET userLineNotify`). On **every** status
change (forwarder / shop / payment / wallet top-up), admin code calls `sendLine($userLineNotify,
$msg)` (`function.php` L1004) so the customer gets a push. A connect-nag popup
(`include/pages/index/all-popup/line-notify.php`) prompts unconnected customers. **LINE Notify was
EOL'd by LINE on 2025-03-31** — this exact integration is dead upstream.

**Mail:** `sendMail($email,$title,$body)` (`function.php` L403) via **PHPMailer + SMTP
`mail.tam-i-t.com`** (the ไอแต้ม借用 mail server) — used on registration + select status events;
**most status-change `sendMail()` calls are commented out** in the admin PHP (only LINE is live).

**Cron:** `pcs-admin/api/autorun/send-line-sales/index.php` — a **daily 00:05** roll-up that pushes
yesterday's + month-to-date paid totals (ฝากสั่ง / ฝากนำเข้า / ฝากโอน) to **internal** LINE groups
(hardcoded group tokens). Not customer-facing.

### Pacred scope (what's built on `dave-pacred`)

Pacred has **THREE overlapping commission systems** — significant sprawl:

| # | system | tables | routes | data |
|---|---|---|---|---|
| **A** | **legacy-faithful read** | `tb_user_sales` / `tb_user_sales_admin_pay` / `tb_user_sales_pay` (real 8,898-cust data) | `/sales` · `/sales/report` · `/sales/report/add` · `/sales/history` · `/sales/history/[id]` | READ-ONLY · **no write path** |
| **B** | **rebuilt affiliate** | `sales_commissions` / `sales_payouts` / `team_leaders` (migration `0013`) | `/commissions` (customer) · `/admin/sales-payouts` · `/admin/forwarder-sales` · `actions/commissions.ts` · `actions/admin/sales-payouts.ts` | full CRUD · **EMPTY tables · dead-write** |
| **C** | **staff commission** (out-of-lane) | `commission_accruals` / `commission_withdrawals` (migration `0054`) | `/commissions/me` · `/admin/commissions` | the interpreter/sales-rep STAFF model — unrelated to this customer lane (noted, not scored) |

- **LINE:** modernised correctly — `/line-settings` + `actions/line-settings.ts` + `lib/notifications/*`
  write `profiles.line_user_id` and push via the **LINE Messaging API** (`api.line.me/v2/bot/message/push`),
  a sound D1-acceptable replacement for the dead LINE Notify. Status-change pushes funnel through
  `lib/notifications/status-flip-helper.ts` (`notifyStatusFlip`) — wired from `actions/admin/*`.
- **Mail:** `lib/notifications/index.ts` `sendEmail()` via **Resend** (env-gated; key pending).

### % complete (this lane) — **~48%**

- LINE channel (connect + push + status-flip): **~85%** — modern, well-built; minor gaps (connect-nag
  popup not ported, legacy `userLineNotify` token column ignored — acceptable since LINE Notify is dead).
- Affiliate commission **read** screens: **~90%** faithful transcription on the right `tb_*` tables.
- Affiliate commission **write** (earn-trigger + withdraw + approve): **~5%** — the legacy-faithful
  path has **no earn-trigger and no withdraw handler**; the only working write path targets the
  **empty rebuilt** tables (dead-write). This is the lane's core failure.
- Mail: **~70%** (infra present, parity-fine; legacy mostly commented mail anyway).

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equiv | status | flow-order correct? | owner |
|---|---|---|---|---|---|
| W1 | Referral capture `register/?recom=X` → set `tb_users.coID` | `actions/auth.ts` register (grep `recom` present) — **needs verify it writes `coID`** | 🟡 | ? unverified | เดฟ |
| W2 | **Earn-trigger**: forwarder final status → `INSERT tb_user_sales (usStatus=1)` for VIP `coID` | **NONE** — zero inserts to `tb_user_sales` anywhere; `forwarder-check.ts` doesn't touch it | 💀 | ❌ missing | ภูม |
| W3 | `user-sales.php` — team members + invite link | `/sales/page.tsx` — 1:1 transcription, reads `tb_users WHERE coID` + addresses | ✅ | ✅ | ปอน |
| W4 | `report-user-sales.php` — team-sales report, filter usStatus+date | `/sales/report/page.tsx` — 1:1, reads `tb_user_sales`→`tb_forwarder`→`tb_users` | ✅ | ✅ (POST→GET noted) | ปอน |
| W5 | `report-user-sales-add.php` (read) — unpaid rows `usStatus=1` | `/sales/report/add/page.tsx` — 1:1 read transcription | ✅ | ✅ | ปอน |
| W6 | `report-user-sales-add` **POST `add`** — withdraw: INSERT admin_pay+pay, UPDATE usStatus=2, PDF upload, min ฿1,000, 1%−3% | **NONE** — explicitly deferred ("NOT transcribed §1"); no Server Action exists | 💀 | ❌ missing | เดฟ |
| W7 | `getListForwarder.php` AJAX — select→confirm-pay modal (bank + ID-card PDF) | **NONE** — `<div id="list-forwarder-data">` rendered empty; no AJAX/action | 💀 | ❌ missing | เดฟ |
| W8 | `report-user-sales-history.php` (list) — payout batches | `/sales/history/page.tsx` — reads `tb_user_sales_admin_pay` | ✅ | ✅ (always empty — W6 never writes) | ปอน |
| W9 | `report-user-sales-history.php?page=ID` — payout detail + slip-upload → status=3 | `/sales/history/[id]/page.tsx` — reads admin_pay+pay+user_sales; **slip-upload approve handler missing** | 🟡 | 🟡 read-only | เดฟ |
| W10 | LINE Notify OAuth connect → `tb_users.userLineNotify` | `/line-settings` + `actions/line-settings.ts` → `profiles.line_user_id` (Messaging API) | ✅ | ✅ (modern substitution) | ปอน |
| W11 | Per-customer LINE push on every status change `sendLine($token,$msg)` | `lib/notifications/status-flip-helper.ts` `notifyStatusFlip` + `sendNotification` | 🟡 | 🟡 wired from admin actions; coverage not 100% per-transition | ภูม |
| W12 | Connect-nag popup `all-popup/line-notify.php` (cookie `set_linenotify`) | **NONE** — no popup prompting unconnected customers to link LINE | ❌ | ❌ missing | ปอน |
| W13 | `sendMail()` registration + status (PHPMailer/SMTP tam-i-t) | `lib/notifications/index.ts` `sendEmail()` via Resend (env-gated) | 🟡 | ✅ (parity-fine; legacy mostly commented) | เดฟ |
| W14 | Cron `send-line-sales` daily 00:05 internal roll-up | **NONE** found for this digest | ❌ | ❌ missing (internal-only, low cust impact) | ภูม |
| W15 | `/commissions` customer dashboard (rebuilt) writing `sales_*` | `actions/commissions.ts` + `/commissions/page.tsx` | 💀 | dead-write to EMPTY `0013` tables; orphan (not in either sidebar) | เดฟ |

Legend: ✅ done · 🟡 partial · ❌ missing · 💀 dead/dead-write.

---

## Death-flows (P0 / P1 — detailed)

### 💀 P0-1 — Commission system split across legacy-faithful (read-only, no writes) + rebuilt (dead-write to empty tables)

**The single most important finding.** The affiliate commission feature has **two disconnected
implementations**, and **neither is functional end-to-end**:

- **Path A (legacy-faithful, `/sales/*`)** reads the **real** `tb_user_sales` /
  `tb_user_sales_admin_pay` / `tb_user_sales_pay` data (where the 8,898 customers' real commission
  history lives) — but has **zero write path**: no earn-trigger inserts rows, and the withdraw POST
  handler was explicitly deferred. So these screens render correctly but are **permanently empty +
  read-only** (the data they read is also never written by Pacred).
- **Path B (rebuilt, `/commissions` + `/admin/sales-payouts`)** is fully built with CRUD
  (`actions/commissions.ts` withdraw, `actions/admin/sales-payouts.ts` approve) — but writes to
  `sales_commissions` / `sales_payouts` / `team_leaders` (migration `0013`), which are **created
  empty and never backfilled** from `tb_user_sales` (verified: no `INSERT … SELECT FROM tb_user_sales`
  in any migration, no `team_leaders` seed). It is the **silent dead-write pattern** (Rule 3) — looks
  present, writes nowhere real. It is also an **orphan**: `/commissions` is in neither the legacy
  `pcs-left-menu` nor the modern `protected-sidebar`, so a customer can't even reach it.

**Impact:** the 4 partner agents (THADA/SIN/OOAEOM/SWAN) cannot see or withdraw any commission.
Revenue-share for the affiliate program is dead. Either path could be the chosen one, but **the
architecture decision must be made** (Path A faithful vs Path B rebuilt) and the unchosen one removed.

- Evidence: `actions/commissions.ts` L3-46 header (admits 0013 model); `0013_sales_referral.sql`
  (no backfill); `app/[locale]/(protected)/sales/report/add/page.tsx` L52-61 (withdraw deferred);
  grep confirms **zero** `insert`/`update` to any `tb_user_sales*` table in `actions/ app/ lib/`.
- Owner: **เดฟ** (architecture / integration-spine decision: pick one model; if Path A, backfill `0013`
  or repoint `actions/commissions.ts` to `tb_*`; if Path B, write a `tb_user_sales → sales_commissions`
  backfill migration). This is the cross-cutting call this lane hinges on.

### 💀 P0-2 — Earn-trigger missing: nothing INSERTs `tb_user_sales` when a forwarder order completes

Legacy `forwarder.php` L1354-1389 / L1656-1696: on the billing status transition, for VIP `coID`
customers, it dedups + `INSERT INTO tb_user_sales (… usStatus=1)`. **Pacred has no equivalent** —
grep finds zero `tb_user_sales` inserts; `actions/admin/forwarder-check.ts` (the fstatus writer)
never touches it. Even if P0-1 picks Path A, commission rows will never accrue without this.

This **confirms + extends prior-art C5** (`docs/audit/master-fidelity-2026-05-30-evening.md` L127).

- Owner: **ภูม** (admin back-office backend — the forwarder fstatus writer is his lane; add the
  VIP-`coID` earn INSERT into the fstatus→final transition, on whichever table P0-1 chooses).

### 💀 P1-3 — Withdraw POST handler + select-confirm modal not implemented

Legacy `report-user-sales-add.php` POST `add` + `getListForwarder.php` AJAX = the actual money flow:
select unpaid rows → compute 1%−3% WHT, enforce **min ฿1,000** → INSERT `tb_user_sales_admin_pay` +
`tb_user_sales_pay` + UPDATE `usStatus=2`, upload ID-card PDF. Pacred `/sales/report/add` renders
the table + button but the `#select1` → modal → POST chain is **entirely deferred** (header §1/§3);
`<div id="list-forwarder-data">` is an empty placeholder. The agent cannot request a payout on the
faithful path. (Path B's `requestCommissionWithdraw` exists but writes empty tables — see P0-1.)

- Owner: **เดฟ** (customer-backend Server Action + the select-confirm client modal, on the chosen table).

### 🟡 P1-4 — Payout-approve slip-upload handler missing (admin side of the faithful path)

Legacy `report-user-sales-history.php?page=ID` POST `update`: accounting uploads transfer slip →
`UPDATE tb_user_sales_admin_pay SET status=3`. Pacred `/sales/history/[id]` is read-only — no
approve/slip-upload action against `tb_user_sales_admin_pay`. (Path B's `adminUpdateSalesPayout`
exists but on `sales_payouts`.)

- Owner: **เดฟ** (pairs with P1-3 on the chosen table; the rebuilt-table `adminUpdateSalesPayout`
  could be repointed if Path B wins).

---

## Flow-order divergences

1. **POST → GET on the report filters** (`/sales/report`, `/sales/report/add`) — deliberate + correct
   per the faithful-port runbook §9 (Server Components can't read a POST body). Semantics (WHERE
   clauses, default month range, status options) transcribed 1:1. **Not a real divergence** — noted
   for completeness.
2. **`usStatus` label "กำลังดำเนินการ" (2)** — Pacred `/sales/report` uses "กำลังดำเนินการ" for
   status 2; legacy `report-user-sales.php` L194 uses "รอดำเนินการ". Cosmetic copy drift — fix to
   match legacy exactly (owner: ปอน).
3. **`tb_user_sales.usStatus` 2→3 transition** — legacy never flips it 2→3 (only the batch
   `tb_user_sales_admin_pay.status` goes 2→3). Any Pacred re-implementation must **not** invent a
   2→3 flip on `tb_user_sales` — faithful behaviour stops at the batch flip. (Path B's
   `adminUpdateSalesPayout` flips `sales_commissions` unpaid→paid, which is a *divergence* from
   legacy — another reason to prefer Path A.)
4. **LINE token storage location** — legacy `tb_users.userLineNotify` (OAuth access token) vs Pacred
   `profiles.line_user_id` (Messaging-API user id). Different by necessity (LINE Notify dead). The
   migrated `tb_users.userLineNotify` column carries **dead** tokens — do **not** try to use them.

---

## Modals / AJAX / cron / print inventory

| kind | legacy | Pacred status |
|---|---|---|
| Modal | `getListForwarder.php` — select→confirm-pay (bank dropdown + ID-card PDF, min ฿1,000) | ❌ not ported (empty `#list-forwarder-data`) |
| Modal | `all-popup/line-notify.php` — LINE connect nag (cookie `set_linenotify`, 1h dismiss) | ❌ not ported |
| AJAX | `report-user-sales.php` `#select1` → POST `getListForwarder.php` | ❌ not ported |
| OAuth | `api/linenotify/callback/index.php` — LINE Notify code→token → `userLineNotify` | 🟡 replaced by `/liff/link` + Messaging API (`profiles.line_user_id`) |
| Cron | `api/autorun/send-line-sales/index.php` — daily 00:05 internal sales roll-up (3 LINE groups) | ❌ not ported |
| Helper | `sendLine($token,$msg)` per-customer push | ✅ `sendLinePush` in `lib/notifications/index.ts` |
| Helper | `lineNotify*` 5 internal-group pushers (`function.php` L196-315) | ❌ internal-group pushes not ported (low cust impact) |
| Helper | `sendMail()` PHPMailer/SMTP | ✅ `sendEmail()` Resend (env-gated) |
| Print/PDF | none in this lane (slip is an uploaded image, ID-card an uploaded PDF) | n/a |
| Email tmpl | `contentMail` / `contentRegister` (`function.php` L429-462) | 🟡 `lib/notifications/templates.ts` — verify register-email parity |

---

## Recommended fixes (ranked, with owner)

1. **[P0 · เดฟ] Decide the commission architecture (Path A faithful vs Path B rebuilt) and kill the
   other.** This unblocks everything below. Recommendation: **Path A** (the real `tb_*` data + zero
   divergence). If Path A: delete/freeze `/commissions`, `actions/commissions.ts`,
   `actions/admin/sales-payouts.ts`, `/admin/forwarder-sales` (or repoint them to `tb_*`). If Path B:
   write a `tb_user_sales → sales_commissions` + `tb_co → team_leaders` backfill migration. Either
   way, document in an ADR. ~1 day decision + scoping.
2. **[P0 · ภูม] Implement the earn-trigger** in the forwarder fstatus→final transition
   (`actions/admin/forwarder-check.ts` / wherever fstatus is written): for VIP `coID`
   (THADA.VIP/SIN.VIP/OOAEOM.VIP/SWAN), dedup-then-INSERT the commission row on the table P0-1 chose.
   Mirror `forwarder.php` L1354-1389 exactly (the `SELECT IDF … WHERE IDF` dedup). ~2-3h.
3. **[P1 · เดฟ] Build the withdraw flow** — the `/sales/report/add` select→confirm modal + Server
   Action: 1%−3% WHT, **min ฿1,000** gate, ID-card PDF upload, INSERT payout batch + join + UPDATE
   `usStatus=2`. Transcribe `getListForwarder.php` + the `add` POST 1:1. ~1 day.
4. **[P1 · เดฟ] Build the payout-approve handler** — `/sales/history/[id]` slip-upload Server Action
   → batch `status=3`. ~3h.
5. **[P2 · ภูม] LINE push per-transition coverage audit** — confirm `notifyStatusFlip` fires on
   EVERY customer-visible transition legacy pushed (forwarder 1-7, shop, payment, wallet top-up),
   not just the migrated subset. Cross-check against legacy `sendLine` call sites. ~3h.
   *(Confirms/extends prior-art master-fidelity L69.)*
6. **[P2 · ปอน] Port the LINE-connect nag popup** (`all-popup/line-notify.php` → a `/line-settings`
   banner/modal shown to unconnected customers, cookie-dismissable). ~2h.
7. **[P2 · ปอน] Fix the `usStatus=2` label** "กำลังดำเนินการ" → "รอดำเนินการ" to match legacy
   `report-user-sales.php` exactly. ~5min.
8. **[P3 · ภูม] Port the `send-line-sales` daily roll-up cron** (internal-only; low customer impact —
   defer). ~2h.

---

### Cross-lane notes

- **`actions/commissions.ts` self-flagged P2 race** (double-attach on concurrent withdraw, header
  L374-381) — moot if Path B is killed; otherwise needs `unique(payout_id) where not null` + retry.
- The **STAFF commission model** (`commission_accruals`/`commission_withdrawals`, `/commissions/me`,
  `/admin/commissions`, migration `0054`) is a **separate feature** (interpreter/sales-rep payouts) —
  out of this customer-lane's scope; listed only so the auditor of that lane (admin) knows it's the
  third overlapping system and the naming collision (`/commissions` customer vs `/commissions/me`
  staff vs `/admin/commissions` staff) is a real footgun worth a rename.
