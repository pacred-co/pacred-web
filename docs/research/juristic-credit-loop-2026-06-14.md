# Juristic + credit customer loop — prod-bug trace + fix (2026-06-14)

> **Trigger (owner · live prod):** a นิติบุคคล+เครดิต customer's goods arrived in TH but the container status didn't update, **workers couldn't scan** ("คนงานแสกนไม่ได้"), the customer couldn't see where their goods were, + the whole loop (สั่งซื้อ · นำเข้า · momo · บัญชี · จ่ายเงิน · วางบิล · ใบเสนอราคา · เครดิต) needed sweeping. "โดนด่ากันหมด."
>
> **Method:** a 6-segment source-grounded workflow (`juristic-credit-loop-trace-2026-06-14`) — legacy PHP as SOT vs Pacred. **24 bugs** found.

## Root cause (the headline)

`tb_forwarder.fstatus` is ONE column carrying TWO orthogonal dimensions: the **physical journey** (1=รอเข้าโกดังจีน · 2=ถึงโกดังจีน · 3=กำลังส่งมาไทย · 4=ถึงไทยแล้ว) AND the **money/dispatch lifecycle** (5=รอชำระเงิน · 6=เตรียมส่ง · 7=ส่งแล้ว). **Granting credit is a MONEY event that writes `fstatus='6'` onto the physical axis** (adminMarkForwarderCredit · faithful to legacy forwarder.php:1431), destroying the physical position. If credit is granted BEFORE arrival, the goods then land and the warehouse scan needs `6→4` — but Pacred **ADDED a transition matrix + `.lt('fstatus','5')` scan filters that legacy never had**, which blocked the arrival scan. Legacy's 3 arrival writers (forwarder.php:2231 · forwarder-import-warehouse.php:29 · gateway.php type=4) had NO from-status guard and freely re-stamped 6→4. **So the headline is a port-introduced regression on top of a faithful-but-fragile overloaded-axis design.** The juristic flag is incidental (credit lines go to juristic accounts).

## Shipped (prod · dave=main)

| Wave | fix | commit |
|---|---|---|
| **W1 — unblock the scan** (P0 · the fire) | `6→4` matrix → +warehouse+ops (`check-fstatus-transition.ts`) · the ARRIVE scan accepts from=6 for credit (`warehouse-intake.ts`) · the import-scanner's 5 `.lt('fstatus','5')` lookups also find credit-6 (`barcode-import.ts`) · the relink lock exempts credit-6 (`warehouse-history.ts`). Arrival now stamps `fdatestatus4`. | `7c01b85e` |
| **W2 — customer sees real location** (P1) | the customer timeline (`track.ts` + `service-import/[fNo]/page.tsx`) drives PHYSICAL steps (2/3/4) off the real `fdatestatusN` stamp (`hasRealStamp` rejects null/''/0000-00-00), not the fstatus integer; money steps 5/6/7 still key off fstatus; credit order w/ null fdatestatus4 shows "รอสินค้าถึงไทย" not a misleading "เตรียมส่ง". | `c5023037` |
| **W3 — billing revenue leak + credit eligibility** (P0 money) | bill line + subtotal now use `calcForwarderOutstanding` (Σ 7 price cols − discount − 1% juristic) instead of `ftotalprice` alone (was under-charging by 6 columns); credit orders (fstatus 5/6 · fcredit='1') made eligible for billing/receipt via the new tested `lib/forwarder/billing-eligibility.ts`. | `8f4f1d4a` |

## W4 — credit settlement (SHIPPED `6d627d06`)

`customerPayCreditFromWallet` (actions/credit.ts) now clears `fcredit` on the
orders a wallet→credit paydown settles — OLDEST-FIRST (fcreditdate ASC),
fully-covered-only, per-order outstanding via `calcForwarderOutstanding`,
`.eq("fcredit","1")`-guarded (idempotent/TOCTOU-safe), all inside the existing
rollback envelope. Mirrors the admin pure-wallet settle (pay-user.ts L584 /
legacy pay-users.php L469 · no paydeposit on the forwarder — the wallet-hs row
carries paydeposit). Keeps `tb_credit.creditvalue` in lock-step with
Σ(outstanding over fcredit='1'). **NOTE:** the customer amount-driven oldest-first
allocation has no EXACT legacy precedent (legacy credit settle is order-SELECTED);
oldest-first is the Pacred default (flagged to owner).

## Owner decisions — RESOLVED ตาม legacy (2026-06-14 · source-cited)

1. **1% juristic** — ✅ it's the single canonical allowance in `calPriceForwarderMain()` (function.php:1878 = Pacred `calcForwarderOutstanding` L59-66). Applied at the outstanding-balance helper + credit-grant (forwarder.php:1427) + receipt (create-f-receipt.php:353/689 `$Dis1per`); NOT on the วางบิล (forwarder-bill.php has no *0.01). All loci compute 99% from gross INDEPENDENTLY → consistent, **NOT a double-deduction**. W3 (bill = calcForwarderOutstanding) is correct. No change. (`fCompany1Per` in api-sheets = internal cost/profit; `*0.01` in report-sale = sales commission — different.)
2. **Credit doc timing** — ✅ on-demand (legacy forwarder-bill.php:952 bills selected order IDs · Pacred billing-run/add already does this); date_due is an admin input on the create form (billing-run.ts:1089) → admin sets it (= fcreditdate for credit). No code change.
3. **Credit before arrival** — ✅ legacy ALLOWS it (credit-grant has no fstatus precondition) → W1's "let arrival scan re-stamp 6→4" is the faithful fix. No lock.
4. **Decouple physical_status / migration** — ✅ legacy uses a single fstatus (no separate physical_status column) → ตาม legacy = NO migration. W2's date-stamp-driven timeline already gives the physical truth. **No migration run** (owner: "ข้อ 4 ตามสมควร · ถ้าต้องรันก็รัน" → it doesn't need to run).

## STATUS: LOOP COMPLETE + P3 CLEARED
Shipped to prod (dave=main): W1 (scan `7c01b85e`) · W2 (timeline `c5023037`) · W3 (billing leak `8f4f1d4a`) · W4 (settlement `6d627d06`) · W4b (read-only credit-AR reconcile cron `04ade340`) · P3#1 (50-ทวิ receipt unblock — print no longer cert-gated `f7c411e8`) · P3#2 (dead CARGO ใบเสนอราคา label removed — cargo has no quote stage; freight quote kept `e7f3c14f`). All 4 owner decisions resolved ตาม legacy. **No migration needed.** Nothing left in this loop. Owner repro data (stuck order PR/F-no) still welcome to verify against the real row.

## 🙏 Repro data still wanted
The stuck order's PR/F-no (to verify fstatus/fcredit/fdatestatus4 on prod) + the exact scan screen + verbatim error the worker saw.

## Learning
A value-overloaded column (fstatus = physical journey + money lifecycle) is fragile; legacy tolerated it by leaving the repair-path (arrival writers) un-guarded. **A port that "hardens" a faithful flow with NEW guards (a transition matrix, status filters) can turn a latent overload into a hard production failure.** Before adding a guard the legacy never had, check what legacy's permissiveness was load-bearing for. Cross-link: [[verify-deep-flow]] · the §0b "read the legacy, don't assume" discipline.
