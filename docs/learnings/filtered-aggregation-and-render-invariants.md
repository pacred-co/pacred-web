# Filtered-view aggregation + the two-render-path invariant

**Date:** 2026-07-22 · **Surface:** `/admin/momo-containers` (MOMO ตรวจข้อมูล) · **Case:** `888073444322` (PR106) โชว์ Σ 1 กล่อง ทั้งที่ของจริง 4 กล่อง

---

## L-1 · A HEADER over a filtered list must state the UNFILTERED truth

A grouped list (ตู้ ⊃ ชิปเม้น ⊃ แทรคกิ้ง ⊃ กล่อง) renders group **headers** with Σ. If the Σ is computed over the **tab/search-filtered** rows, the header lies the moment a filter hides part of the group — and it lies *quietly*, because the header still looks like a total.

**The concrete failure.** The shipment family had two REAL lots:

```
888073444322     1 กล่อง · 15.0 kg · ftotalprice 128.76   (committed 10:40)
888073444322-2   3 กล่อง · 64.5 kg · ftotalprice 800.40   (committed 10:07)
                 → truth = 4 กล่อง / 79.5 kg / 0.3204 คิว
```

Because the two lots were committed **32 minutes apart**, on the "ยังไม่เข้าระบบ" tab only the bare row was visible. The discriminator that recognises disjoint lots (`isAdditiveLotBare`) lives inside an `if (hasBareMember && hasSuffixMembers)` branch — with the sibling filtered out, `hasSuffixMembers = false`, so **the discriminator never ran** and Σ collapsed to the bare's own 1 กล่อง.

**Tell-tale of this bug class:** the header contradicts its own expanded detail rows (header said "1 กล่อง" sitting above two box rows of 15kg + 64.5kg). If a header and its children disagree, suspect filtered-vs-unfiltered aggregation before suspecting the data.

**Fix shape.** Compute group totals from the **unfiltered** source, keyed the same way the visible grouping is keyed, and **reuse the same aggregation function** (no second formula):

```ts
const familyTruth = /* Map<baseKey, {agg: famAgg(unfilteredFam), members}> */;
const truth = familyTruth.get(famKey);
const famQty = truth?.agg.qty ?? 0;          // header Σ  = whole group
const hiddenLots = (truth?.members ?? fam.length) - fam.length;
// countable / extraBoxes stay from famAgg(filteredFam) — they drive the RENDERED rows
```

…and **tell the user the view is partial** (`แสดง 1/2` badge). A correct-but-unexplained total is its own confusion.

**Precedent to copy, not re-invent:** the ตู้ (container) tier had already been fixed for this exact class a month earlier (`containerTruthOf()` + "แสดง n/N"). The shipment tier one level down was left behind. **When you fix a filtered-aggregation bug at one tier, sweep every other tier of the same hierarchy in the same change** — the bug is per-tier, not per-page.

---

## L-2 · Two render paths keyed on ONE flag carry an unwritten mutual-exclusivity invariant

The box sub-rows painted on two paths:

```tsx
{!hasSuffixMembers && isOpen && t.boxes.map(...)}   // path A — all box_detail rows
{isOpen && extraBoxes.map(...)}                      // path B — boxes with no member row
```

They never collided **only because** `extraBoxes` was gated `hasSuffixMembers ? … : []` — i.e. path B could only be non-empty exactly when path A was switched off. That invariant was **nowhere written down**.

The obvious fix for L-1's second root (open the gate so a lot living only in `box_detail` counts) **breaks that invariant**: with `(hasSuffixMembers || bareHasOwnBox)` both paths fire and the same box renders twice — trading a wrong-Σ bug for a duplicate-row bug **in the same shape you're fixing**. An adversarial verify pass caught this before it shipped; the Σ math had been correct in isolation.

**Rule:** before widening a condition, grep every other consumer of that same flag. If two branches are keyed on one boolean, they probably encode "exactly one of these runs" — flipping the gate needs an explicit de-dup, not just correct arithmetic:

```ts
const extraBoxKeys = new Set(extraBoxes.map((b) => (b.tracking ?? "").trim()).filter(Boolean));
// path A now skips whatever path B already owns → each box has exactly one owner row
```

**Generalisation:** "Σ is right" ≠ "the screen is right". Verify the *rendered rows*, not only the computed total.

---

## L-3 · Dedup one set, sum another = a silent double-count (and a false alarm flag)

Both cabinet loaders did:

```ts
const boxes  = countable.reduce(...)   // deduped (drops an aggregate bare)
const weight = rows.reduce(...)        // NOT deduped  ← different set
const cbm    = rows.reduce(...)        // NOT deduped
```

So a bare row whose `fweight` is already the sum of its box siblings (`ftotalprice = 0` = the หัวบิลรวม shape) was dropped from the box count but **counted twice in weight/คิว** — which then fed `deriveContainerVerify` and could falsely raise ⚖️น้ำหนักไม่ตรง.

**Rule:** metrics displayed side-by-side must be summed over the **same** row set. A per-metric filter difference is almost never intentional.

Prod impact when fixed: 1 of 51 cabinets moved — `GZS260606-1`, row `1780629608` (PR107) `fweight 324.5` = **exactly** the sum of its 8 box siblings, `fvolume` exactly equal too, `ftotalprice = 0` → an unambiguous aggregate header, correctly dropped, **zero baht affected**.

---

## L-4 · When the UI can't be authed-clicked, REPLAY the logic over real rows

There is no admin test login, so §0c click-verification was impossible. Instead: copy the shipped functions into a script, feed them the **real prod rows**, and assert. Crucially, also keep a copy of the **pre-fix** function so the delta is proven, not asserted:

```
[7] เดิม → {qty:1, wt:15}       (the bug, reproduced)
    ใหม่ → {qty:4, wt:79.5}      (fixed)
[8] แตกกล่องธรรมดา · หัวบิลรวม · แทรคเดี่ยว · แท็บทั้งหมด  → เดิม === ใหม่ (no regression)
```

This is stronger than a unit test with invented fixtures (fixtures can encode the same misunderstanding — see the 2026-07-17 fixture-that-lied lesson) and stronger than "tsc + build pass".

**The verification also caught a wrong assertion of mine** — I expected 2 box sub-rows on the "ทั้งหมด" tab, but both lots legitimately render as ↳ member rows there (📦 sub-rows only appear for lots with no row of their own). The *test* was wrong, not the code. Write assertions that force you to state the render model out loud; a failing assertion that turns out to be your own misunderstanding is the check doing its job.

---

## Cross-links

- [`momo-truth-hierarchy-and-mao-key`] — which source wins for MOMO box/weight truth
- [`model-evolution-debt-aggregate-fanout`](model-evolution-debt-aggregate-fanout.md) — the mirror-image bug (a helper written for the 1-row model fanned the family Σ into every sibling)
- `lib/admin/momo-bill-header.ts` — the `isAdditiveLotBare` / `filterCountableForwarderRows` SOT (reused, not edited)
- The 4 "bare + suffix" shapes: proper-split · aggregate-header · residue · **disjoint-lots** (this case)
