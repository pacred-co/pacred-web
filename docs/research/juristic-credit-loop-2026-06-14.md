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

## Remaining — OWNER-GATED (need the decisions below)

- **W4 — credit settlement reconcile** (P1): `customerPayCreditFromWallet` (actions/credit.ts) doesn't clear `fcredit` oldest-fcreditdate-first like the admin path → `tb_credit.creditvalue` can drift from Σ(fcredit='1'). Port `reset-credit-forwarder.php` as a reconcile cron. **Gated on:** the 1% locus decision (below).
- **W5 — structural decouple / policy** (P1/P2): EITHER (a) add a dedicated `physical_status`/`arrived_at` column (migration) so credit never overwrites the physical axis, OR (b) policy: restrict credit-grant to fstatus 4|5 (after arrival) so the stuck state can't happen. Also: the 50-ทวิ print-lock chicken-and-egg + the `ใบเสนอราคา` dead-label for cargo.

## 🔴 Owner decisions (asked 2026-06-14)

1. **หัก ณ ที่จ่าย 1% (juristic):** taken ONCE at credit-grant OR at วางบิล/ใบเสร็จ? (must be exactly one — `calcForwarderOutstanding` already deducts 1%, and the credit-grant also deducts 1% on the tb_credit debt → double-deduction risk).
2. **Credit doc timing:** issue วางบิล at credit-grant / on-demand / monthly? date_due = `fcreditdate` or +7d?
3. **Policy:** allow credit-grant BEFORE goods arrive (fstatus<4)? If no → lock canOfferCredit + the grant to fstatus 4|5 (kills the bug at source · Wave 5b).
4. **Long-term:** decouple physical_status from fstatus permanently (migration · Wave 5a)? Currently using the faithful 6→4 restoration.

## 🙏 Repro data still wanted
The stuck order's PR/F-no (to verify fstatus/fcredit/fdatestatus4 on prod) + the exact scan screen + verbatim error the worker saw.

## Learning
A value-overloaded column (fstatus = physical journey + money lifecycle) is fragile; legacy tolerated it by leaving the repair-path (arrival writers) un-guarded. **A port that "hardens" a faithful flow with NEW guards (a transition matrix, status filters) can turn a latent overload into a hard production failure.** Before adding a guard the legacy never had, check what legacy's permissiveness was load-bearing for. Cross-link: [[verify-deep-flow]] · the §0b "read the legacy, don't assume" discipline.
