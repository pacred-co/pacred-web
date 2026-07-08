# Faithful port: legacy CARRIES on one frozen row — we RE-DERIVE at every hop (2026-07-08)

**The single most load-bearing continuity lesson of the D1 port.** Surfaced by the owner's
multi-day frustration with the container→bill→pay→receipt→dispatch combo ("แก้มาหลายวันไม่จบ ·
เอกสาร·ข้อมูล·profile·เรทขาย ไม่ต่อเนื่องเชื่อมโยงกัน"). Source-grounded audit →
`docs/research/forwarder-check-combo-continuity-audit-2026-07-08.md`.

## The pattern

**Legacy PCS threads a whole multi-step flow on ONE frozen row + ONE reduce function + ONE
status column.** Every money value is a STORED column on `tb_forwarder` (locked upstream at the
price-update step). Every downstream surface (ตรวจตู้ · confirm modal · notify · bill · receipt)
only ever (a) `SELECT`s those columns and (b) reduces them through ONE function
(`calPriceForwarderMain`). Identity/credit/นิติ is re-JOINed from `tb_users`/`tb_credit` on the
`userID` FK **the same way every render**. `fStatus` is the single thread driving each queue into
the next. Result: **the number, the document, the identity, and the selection cannot drift** —
there is nowhere for them to diverge.

**Our port re-queries + re-computes at every hop**, each with a slightly different formula/join.
So the SAME logical value comes out different per surface → the owner sees "the number keeps
changing / ไม่เชื่อมโยง". Concrete drifts we found + fixed:

- **Receipt ≠ paid bill** — the ใบเสร็จ re-read `tb_forwarder` live + recomputed (+ live `tb_corporate`
  WHT); a row edit between issue↔pay drifted the receipt off what the customer paid. (Only เหมาๆ had
  been pinned — mig 0209 — proving the class already bit; it just wasn't generalized.)
- **SMS ≠ portal ≠ bill** — three formulas for the same "what you owe" (per-row-no-เหมาๆ vs
  gross+separate-line vs batch-once). The SMS under-stated by ~เหมาๆ ฿100/shipment.
- **Selection thrown away** — the ตรวจตู้ tick (`tb_check_forwarder`) was never read by the bill;
  the bill re-derived by `userid+fstatus`.
- **Identity re-fetched 3 ways** — step1 SOT vs forwarder-check re-fetch vs the bill's own inline
  นิติ logic → นิติ header could differ bill vs receipt.

## The fix pattern — PIN / SNAPSHOT / CARRY (never re-derive)

When porting a legacy flow that "just works" continuously, do NOT re-compute the value at each
Next.js surface. Instead:

1. **Compute once, freeze it** (the legacy stored-column model). The bill's `total_thb` /
   `net_payable` / `is_juristic` / `buyer_*` are the frozen truth.
2. **Downstream surfaces reconcile-not-recompute** — pass the frozen values as overrides; if a
   live recompute differs, **prefer the frozen (paid) value + `console.error` the drift** for
   accounting (don't silently show a different number). (G1 receipt pin · G8 identity snapshot.)
3. **One SOT per value** — route every surface's "what the customer owes" through the SAME
   function the customer actually pays against (`computeForwarderCollectTotal`), not a per-surface
   variant. (G2.)
4. **Carry the selection object**, don't re-derive the set — read the same link table the user
   ticked (`tb_check_forwarder`). (G3.)
5. **Let the status flip happen where the work happens** — don't require a separate step to lift
   `fstatus` before the next queue can see the row (the bill lifts its own 4→5). (G4.)

## How to spot it before the owner does

Grep a flow for the SAME logical amount/identity computed in >1 place (`calcForwarder*`,
`resolve*Identity`, a re-`SELECT` of `tb_corporate`/`tb_users` on a surface that already had the
row). Each duplicate reduce/join is a drift point. The faithful move is ONE frozen source +
reconcile-not-recompute everywhere else. **A "carry" bug hides behind a green build** — every
surface renders fine in isolation; only stepping the whole flow (or a row edit mid-flow) exposes
the drift. Verify the WHOLE combo, not each screen.

Related: [[money-audit-and-doc-fidelity-2026-06-25]] · [[audit-discipline]] (verify claimed gaps vs
current source) · the เหมาๆ-pin precedent (mig 0209 / `receipt-mao-fee.ts`).
