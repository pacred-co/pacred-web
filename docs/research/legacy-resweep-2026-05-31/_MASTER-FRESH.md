# 🎯 FRESH gap status — verified re-sweep · 2026-05-31 (supersedes 2026-05-30 _MASTER for STATUS)

> Owner asked: *"อะไรที่ legacy มีแล้วเรายังไม่มีอีก เหลืออีกเยอะมั้ย? กวาดมาหลายรอบละยังไม่หมดอีกหรือ ทั้ง member และ admin"*
>
> Answer: re-audited all 4 quadrants (customer auth+misc · customer money · admin customers+accounting+settle · admin ops+reports+infra) **against live `dave-pacred` HEAD `6f570b53`** (NOT the stale 2026-05-30 snapshot). 4 read-only agents. Per-quadrant ledgers: `m1-auth-profile-misc.md` · `m2-money-loop.md` · `a1-customers-accounting.md` · `a2-ops-reports-infra.md`.

---

## TL;DR — the honest answer

**The launch-blocking holes (money loss · security · customer-facing death/404) are essentially CLOSED.** The 2026-05-30 audit's headline "23 P0" was real then but is now **~80% stale** — the marathon + ภูม batches since closed almost all of it. What remains is **concentrated, not scattered**, and is mostly **admin operational tooling + 2 pricing-config editors that write the wrong table + one forwarder admin-payment dead-write** — not customer money holes.

| Quadrant | Still-open | P0 | P1 | P2 | One-line state |
|---|---|---|---|---|---|
| **M1** customer auth/profile/misc | 12 | 0–1* | 4 | 5 | Core auth+CRUD faithful. Gap = 5 login-popup gates dropped + address delete/set-main inert (*ปอน lane). **OTP is NOT bypassed in prod** (stale claim corrected). |
| **M2** customer money loop | 9 | **0** | 4 | 5 | **Money loop SOLID — no double-spend.** cart/order/yuan/withdraw/commission all write real `tb_*` via the live UI path w/ idempotency+rollback. Gap = credit-line on rebuilt (฿0 for migrated) + wallet-shortfall model dropped. |
| **A1** admin customers/accounting/settle | 7 | **0** | 4 | 3 | **All settle paths WORK** — top-up-slip credits `tb_wallet`, yuan-approve settles `tb_payment`, pay-on-behalf built, identity→`tb_users`, juristic→`tb_corporate`. Gap = pay-on-behalf doesn't auto-mint `tb_receipt`. |
| **A2** admin ops/reports/infra | 40 | **6** | 22 | 12 | Crons/reports/bulk-bar all FIXED. Remaining = the big un-ported chunks (settings matrix, HR, printAll, monitoring) + forwarder detail editor + 1 money dead-write. |
| **TOTAL** | **~68** | **~7** | **34** | **25** | down from 23 P0 / 31 P1 — P0 collapsed ~70% |

\* M1's "1 P0" (customer address delete/set-main inert) is really P1 + ปอน's lane.

**So: not a lot of launch-blockers left, and zero customer-money-loss holes. The remaining P0s are admin-side and concentrated in 3 themes (below).** The owner's instinct ("ยังไม่หมด") is correct about the *un-ported chunks* — but they're operational tooling, not death-flows.

---

## The ~7 P0 that genuinely remain (verified at HEAD)

All admin-side. Grouped by theme:

### Theme A — Forwarder detail + its money dead-write (1 architecture + 1 repoint · เดฟ)
1. **`[fNo]` detail editor dead on real rows** (A2 #2) — full edit/driver/cost/bill panels render only on the empty rebuilt-UUID branch; real `tb_forwarder` rows get near-read-only legacy view. The architectural root. **(= the old P1-3, but it strands money → P0.)**
2. **`adminMarkForwarderPaid` dead-write** (A2 #1 · NEW) — `forwarders.ts:257` reads empty rebuilt `forwarders` + writes rebuilt `wallet_transactions`; 404s on every real row. The **last standing forwarder money dead-write** (bulk-bar + crons already fixed). Repoint to `tb_forwarder` + `tb_wallet`/`tb_wallet_hs` — fix WITH #1.

### Theme B — Pricing config writes the wrong table → admin edits do nothing (money · ภูม + ADR)
3. **General rate-card editor `tb_rate_g_*`** (A2 #30) — `/admin/rates/general` writes rebuilt `rate_general`, but the pricing engine (`resolve-rate.ts`) READS `tb_rate_g_*`. **Admin "changes the general rates" → changes nothing the engine uses.** (Per-customer VIP/HS path already correct via `rate-edits.ts`.)
4. **128-cell default forwarder-cost matrix** (A2 #28) — `settings.php` per-partner car×ship default-cost grid that auto-fills new-forwarder cost has NO editor; `tb_settings` cost cells are raw-SQL-only. Drives money on every new forwarder.

### Theme C — Whole-base comms + agent commission (ภูม)
5. **`tb_notify_wp` customer popup** (A2 #34) — the login banner ALL 8,898 customers see. `/admin/broadcasts` writes rebuilt `broadcasts` reaching only the logged-in subset. Whole-base announcements impossible.
6. **`tb_user_sales` agent-commission on `fstatus=7`** (A2 #11) — ⚠️ CONTESTED: marathon close-out said P1-5 shipped (earn-trigger via `adminBulkUpdateForwarderTbStatus`); A2 says the `driver-work.ts` deliver path doesn't INSERT it. **Needs a 5-min verify** before counting as open (which trigger path fires on real deliveries).

> (M1's address-inert is the 7th if counted P0 — but it's ปอน's customer-frontend lane.)

---

## The big un-ported chunks (owner's "ยังไม่หมด" — confirmed, but mostly P1/operational)

Verified ZERO Pacred equivalent (grep returned nothing):
- **HR on migrated `tas_*`/`tb_post_job`** — attendance/leave/recruitment all write rebuilt twins; the migrated PCS staff data is touched by nothing. → pivot to `tas_*` OR formally declare HR a Phase-C rebuild (stop calling it "ported").
- **`printAll.php` (969) + `printDriver.php` (248)** — warehouse scan-to-print + driver picking slip. Zero routes.
- **3 monitoring reports** — product-search demand (`tb_history_key`), China-API volume, SMS credit (`tb_sms_hs`).
- **4 of 5 org-channel registries** (tell/line/wechat/domainname — only email ported).
- **Admin-push เบิกจ่ายค่าสินค้า** (`tb_shop_pay_h`) + **agent-commission payout report** + **TTP integration** + **MK/MX/Sang sheet adapters** (only CTT built).

These are real but **operational tooling / Phase-C** — none lose customer money or 404 a customer.

---

## ✅ Owner decisions captured this session (2026-05-31) — these are COMMANDS, execute as written

| # | Decision | What it means for the build |
|---|---|---|
| 1 | Daily-profit graph → **เอา** | Wire `getForwarderProfitDailySeries`+`getYuanProfitDailySeries` (+ add shops series) back into the 3 report pages |
| 2 | VAT7 → **ตาม legacy ก่อน** (อนาคตค่อยเพิ่ม) | shops-profit keeps VAT7; **drop** vat7 col from forwarder-profit + yuan-profit |
| 3 | Shops profit → **คำนวณสดในตาราง + มีไกด์แนะนำ** | Recompute `(htotalpricechn+hshippingchn)*hrate − hratecost*hcostall` live + show a guidance hint/tooltip explaining the formula |
| 4 | sales-monthly → **เอาตาม legacy ก่อน, ไกด์เสริมทีหลัง** | Port the `tb_sales_report` snapshot model (+ the backfill that populates it from `fstatus=7`); layer Pacred guide later |
| 5 | sales-rep attribution → **snapshot at delivery** (ตามแนะนำ) | Commission to the rep recorded at delivery. **⚠️ + BIG OPS TASK:** owner will **purge ALL old non-customer staff (sales + CS/admin) and re-register fresh** — see §Staff-purge below |
| 6 | closing juristic split → **ทั้งสองอย่าง** (flexible) | Support BOTH `corporatetype` (snapshot) AND `userCompany` (live) — a toggle/filter; "องค์กรเราต้องยืดหยุ่น" |
| 7 | OTP report → **เก็บ** (data is king) | Keep the Pacred-added date filter + `purpose` column; add a role gate |
| 8 | `LINE_STAFF_GROUP_ID` → **BLOCKED** | Wire-test failed: bot @pacred not a member of group `C61f…` (404). Owner must add the bot to the real LINE group → read real groupId from webhook. See §LINE below |
| 9 | Yuan approve fidelity → **ต้องมี** + **re-sweep** | Add slip + real cost-rate on yuan approve (stamp `paythbcost`/`payprofitthb`) so margin isn't under-reported. Re-sweep = THIS doc |

### §Staff-purge (NEW major task from decision #5)
Owner: *"เรายังไม่ได้เปลี่ยน/โล๊ะ พนักงานเก่าออกเลย — พนักงานทั้งหมดที่ไม่ใช่ลูกค้าเปลี่ยนหมด (ทั้ง sale และ cs) — เดี๋ยวต้องไล่ลบ เซลเก่า + admin เก่าออกทั้งหมด สมัครใหม่ดีกว่า"*
→ A planned migration: **purge all legacy staff rows (`tb_admin` / `admins`) + re-register the new team** via `/admin/admins/new`. Must handle FK refs: `tb_users.adminIDSale` (customers' sales rep), `tb_user_sales.*` (commission), `tb_sales_report.srAdminIDSale`, `adminIDUpdate`/`adminIDIP` across forwarder/shop/payment. **Do NOT hard-delete before re-mapping these** — orphaned refs = blank rep on customers + broken commission. Needs a plan/ADR before executing. Unblocks P1-15 (sales-rep auto-assign) once new admins exist.

### §LINE_STAFF_GROUP_ID (decision #8 blocker detail)
- chat.line.biz link `…/chat/C61f60d763a766e4f391812381281e3d9` → that `C…` is the OA-Manager chat-thread id, NOT a Messaging-API groupId the bot can push to.
- Verified: `/v2/bot/info` 200 (token OK, @pacred, `chatMode:"chat"`) · `/v2/bot/group/C61f…/summary` **404** = bot not in that group · push **400**.
- **Fix:** in the LINE app, add the @pacred bot **into the actual staff group** → someone sends a message → read the real `groupId` from the webhook (routes to ปอน's Cloudflare Worker — coordinate to log it, or temporarily point the webhook at `/api/webhooks/line`). Then replace the env value. `notifyStaffGroup()` is a safe no-op until then.

---

## What to do next (recommended sequence)
1. **เดฟ — Theme A** (forwarder `[fNo]` dual-mode rewrite + fix `adminMarkForwarderPaid` together · ~3-4h · closes 2 P0). Owner go-ahead to enter the forwarder lane needed.
2. **ภูม — Theme B** (repoint `tb_rate_g_*` editor + build the cost-matrix editor · the "edits do nothing" money holes) + the report decisions #1-4,#6,#7,#9 (mostly in `reports.ts` — pre-spec'd in `docs/port-specs/poom-prep-2026-05-31/`).
3. **ภูม/owner — Theme C** (`tb_notify_wp` broadcast repoint) + verify the #6 commission-trigger contested item.
4. **Plan — §Staff-purge** (needs an ADR + FK-remap script before the owner deletes old staff).
5. **Phase-C / triage** — HR-on-`tas_*`, printAll, monitoring reports, org registries, TTP/sheets (operational, post-launch).

> Lane note: Theme A = เดฟ (architecture). Theme B/C + reports = ภูม. Customer items (M1 popups, address, credit-line, wallet-shortfall) = ปอน + เดฟ. None collide.
