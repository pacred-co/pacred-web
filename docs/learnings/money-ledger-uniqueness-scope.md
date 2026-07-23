# Money-ledger uniqueness guards — scope to the RACE, not the KEY (2026-07-23)

## The lesson in one line

A UNIQUE index on a money ledger must forbid exactly the **race you are closing**
(two *simultaneous pending* legs) — not the *key* in general — because real
business legitimately re-uses the key later (follow-up collections, re-billing,
เก็บเพิ่ม). Always pre-flight the **exact predicate** against prod data before
shipping the migration.

## The case (mig 0274 · 2026-07-23)

The atomic payment-group migration drafted a partial unique index on
`tb_wallet_hs (userid, reforder) WHERE type='4' AND typeservice='2' AND status IN ('1','2')`
— "one active/settled allocation per forwarder, closes double-submit even outside
the RPC". Sounds airtight.

The prod pre-flight (running the migration's own duplicate check as a read-only
query first) found **one violation that was not a bug**: PR215 / forwarder 52328
carried TWO settled (`status='2'`) allocations — `#105614 ฿7,319.51` +
`#105622 ฿1,880.99`. That second row is the **legitimate follow-up collection of a
forgotten crate fee** (save-point 2026-07-15), and legacy PCS even has a dedicated
type for it (`typeNew='6'` "ชำระเงินนำเข้าเติมเพิ่ม" — *additional* payment).

With `status IN ('1','2')`:
1. the migration **fails on prod** (duplicate under the index predicate), and
2. even after a data "fix", every future เก็บเพิ่ม dies at approve time — the new
   pending row flips `1→2` **beside** the old settled row → unique violation on
   a legitimate money flow.

## The fix

Narrow the predicate to `status = '1'` (pending) **only**:
- two *simultaneous pending* allocations for one forwarder — the actual
  double-submit race — remain structurally impossible;
- a settled row + a later follow-up pending row (the real business shape) is legal;
- the RPC keeps its own stricter `IN ('1','2')` pre-insert check for the *new*
  rail (fail-closed there is fine — admin lanes still handle re-collection).

Plus a SQL test locking the contract: settled+pending = allowed · pending+pending
= unique_violation.

## The reusable protocol

1. **Extract the migration's guard predicate and run it read-only on prod first**
   (`scripts/_preflight-*.mjs`, throwaway, never committed with credentials).
2. Any hit → ask "is this a bug or a business pattern?" **before** reconciling
   data. A settled duplicate with real money on both rows is almost always a
   pattern, not corruption (here: เก็บเพิ่ม).
3. Re-scope the guard to the transition you actually need to serialize
   (usually *pending/in-flight* states), leave history alone.
4. Encode the discovered-legal shape in a test so a future "tighten the index"
   refactor can't silently outlaw it again.

## Related traps in the same family

- mig 0183 (2026-06-14) needed a prod dup-precheck before its 4 partial-UNIQUE
  indexes for the same reason — pre-existing rows fail `CREATE UNIQUE INDEX`.
- The deploy-order coupling is the mirror image: an index that assumes the NEW
  atomic writer degrades the OLD non-atomic writer's failure mode (dup children →
  stranded header) — so apply-mig and deploy-code must land in the **same window**
  (see CLAUDE.md 2026-07-23 รอบ 3 block).
