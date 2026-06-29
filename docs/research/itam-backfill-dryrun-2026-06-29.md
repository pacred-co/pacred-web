# 🧾 iTAM → tb_forwarder backfill — DRY-RUN reconciliation (2026-06-29)

> **READ-ONLY. NO DB ROW WAS WRITTEN.** This is the plan for the human to review and then
> apply via the existing audited reconcile (`actions/admin/taem-reconcile.ts` ·
> `/admin/api-forwarder-momo` reconcile UI). It quantifies the MOMO-API data shortfall
> (confirmed dropping 30-40% of warehouse-arrival records since 16/06/26 ·
> `docs/research/taem-momo-containers-2026-06-29.md` §2a) by reconciling the iTAM (แต้ม)
> packing-lists (the TRUTH source) against live PROD `tb_forwarder`.
>
> **Sources:** iTAM packing-lists `C:\Users\Admin\Desktop\Packing List\TAM - Packing List\`
> (13 xlsx · sheet "Shipment Report") · PROD Supabase `yzljakczhwrpbxflnmco` (read-only,
> chat-only pw) · synthesis `docs/research/taem-momo-containers-2026-06-29.md`.
>
> **Method (mirrors the reconcile exactly — `lib/admin/taem-reconcile-parser.ts`):** parse
> the Shipment-Report rows (col [0]Container · [7]Type · [8]Code · [9]Tracking ·
> [13]Total Parcel · [16]Total Wt · [17]Total Vol), de-dup the `-N/M` box-suffix rows to the
> **base tracking** (sum parcel/wt/vol), then match each base to `tb_forwarder.ftrackingchn`
> (1:1, first match wins, also matching split `-N` rows by prefix). The reconcile writes the
> measurement basis (`fweight`/`fvolume`/`famount`/`famountcount="1"`/`fcabinetnumber`/
> `ftransporttype`) only on **non-billed** rows (`fstatus ∉ {5,6,7}`), then re-derives the
> SELL price via `computeAndFillForwarderImportRate`.

---

## TL;DR (the numbers)

| Metric | Count |
|---|--:|
| **Containers parsed (iTAM truth)** | **10** (9 GZS sea + 1 GZE road) |
| **Distinct base-trackings (de-duped)** | **127** |
| iTAM rows matched to a `tb_forwarder` row | **17** |
| **iTAM trackings MISSING from `tb_forwarder`** | **110** |
| → of which genuine **PR drop victims** | **22** (≈1,247 kg / 4.23 CBM unrecorded) |
| → PCS-branch items (excluded — not Pacred-billable by design) | 82 |
| → container/sack-header artifacts + no-code rows | 6 |
| **WILL-UPDATE** (matched, non-billed, basis differs) | **12** |
| → of those currently at **freight ฿0** (under-charged) | **11** (≈15,227 kg / 44.76 CBM) |
| OK (matched, already correct) | 3 |
| BILLED-LOCKED (matched but billed — ⚠ surfaced, never written) | 2 |
| **Est. under-charged freight that backfill would recover** | **≈ ฿294,000** (matched ฿0 rows) + ≈ ฿25,000 (missing PR victims, once created) |
| `taem_container_etd_eta` rows currently on prod | **0** (never populated) |

**The drop is starkly visible in the match ratios:** the post-16/06 containers are nearly
empty in `tb_forwarder` — `GZS260628-1` = **2/20** matched, `GZS260628-2` = **1/17**,
`GZS260626-1` = **2/6**, `GZS260620-2` = **2/5** — while the iTAM packing-list has the full
truth. 11 of the 12 matched-but-stale rows are bare shells (`fcabinetnumber=(none)`,
`fweight=0`, `fvolume=0`, `ftotalprice=0`) — they were spawned from the order but never got
the warehouse arrival event because the MOMO API dropped it.

---

## §1 — Per-container table (iTAM truth, de-duped to base tracking)

| Container | Mode | iTAM trk (deduped) | boxes | weight kg | CBM | distinct codes | matched in tb_forwarder |
|---|---|--:|--:|--:|--:|--:|--:|
| GZS260524-1 | เรือ | 65 | 178 | 4,480.9 | 16.3392 | 40 | **2/65** |
| GZS260617-1 | เรือ | 3 | 7 | 510.0 | 1.5693 | 3 | 3/3 |
| GZS260620-1 | เรือ | 2 | 21 | 567.5 | 0.6174 | 2 | 1/2 |
| GZS260620-2 | เรือ | 5 | 7 | 1,565.5 | 6.1048 | 2 | 2/5 |
| GZS260622-1 | เรือ | 4 | 32 | 7,219.0 | 8.0092 | 4 | 2/4 |
| GZS260624-1 | เรือ | 3 | 27 | 530.0 | 1.0680 | 3 | 2/3 |
| GZE260624-1 | **รถ** | 2 | 2 | 18.5 | 0.1745 | 1 | 0/2 |
| GZS260626-1 | เรือ | 6 | 15 | 2,897.5 | 10.7668 | 5 | 2/6 |
| GZS260628-1 | เรือ | 20 | 173 | 2,855.8 | 17.4568 | 14 | **2/20** |
| GZS260628-2 | เรือ | 17 | 136 | 3,634.6 | 15.7535 | 10 | **1/17** |

Box/weight/CBM totals reconcile to the synthesis doc §1 exactly (e.g. GZS260524-1
178/4,480.9/16.3392, GZS260622-1 32/7,219/8.0092). The "trk (deduped)" count is lower than
the synthesis doc's raw-row count because that's the point of the reconcile — collapse the
`-N/M` box rows to one base tracking before matching (e.g. GZS260524-1 = 65 base from 94 raw
rows; GZS260620-2 = 5 base from 7). GZS260524-1 and GZS260628-1/-2 are the "PCS x PR"
contaminated containers (mostly PCS-branch items not Pacred-billable — see §2 note).

---

## §2 — Per-tracking reconciliation

### 2a. WILL-UPDATE (matched · non-billed · basis differs) — **12 rows · the highest-confidence backfill**

These exist in `tb_forwarder` but never got their warehouse measurements. The backfill WOULD
write the iTAM weight/CBM/box/cabinet and re-price. **11 of 12 currently bill freight ฿0.**

| Container | base tracking | code | fid | fstatus | cur fweight → iTAM | cur fvolume → iTAM | cur cabinet | cur price | DELTA written |
|---|---|---|--:|:--:|--:|--:|---|--:|---|
| GZS260620-1 | 1781577646 | PR072 | 52103 | 2 | 0 → **457.5** | 0 → **0.317898** | (none) → GZS260620-1 | ฿0 | wt+457.5 · cbm+0.3179 |
| GZS260620-2 | 1781515241 | PR012 | 52095 | 2 | 0 → **971** | 0 → **4.343346** | (none) → GZS260620-2 | ฿0 | wt+971 · cbm+4.343 |
| GZS260620-2 | 1781683835 | PR012 | 52105 | 2 | 0 → **515** | 0 → **1.626768** | (none) → GZS260620-2 | ฿0 | wt+515 · cbm+1.627 |
| GZS260622-1 | 1781675788 | PR015 | 52104 | 2 | 0 → **6,632** | 0 → **5.283024** | (none) → GZS260622-1 | ฿0 | wt+6,632 · cbm+5.283 |
| GZS260622-1 | 1782029840 | PR053 | 52113 | 2 | 0 → **470** | 0 → **2.5088** | (none) → GZS260622-1 | ฿0 | wt+470 · cbm+2.509 |
| GZS260624-1 | 1782110296 | PR021 | 52109 | 2 | 0 → **82.5** | 0 → **0.358124** | (none) → GZS260624-1 | ฿0 | wt+82.5 · cbm+0.358 |
| GZS260624-1 | 1782113771 | PR047 | 52110 | 2 | **200 → 444.5** | **0.2328 → 0.694082** | GZS260624-1 (set) | ฿861.36 | wt+244.5 · cbm+0.461 (split under-count fix) |
| GZS260626-1 | 1782103385 | PR102 | 52111 | 2 | 0 → **2,753** | 0 → **9.7719** | (none) → GZS260626-1 | ฿0 | wt+2,753 · cbm+9.772 |
| GZS260626-1 | 800020986676 | PR050 | 52126 | 1 | 0 → **33** | 0 → **0.074382** | (none) → GZS260626-1 | ฿0 | wt+33 · cbm+0.074 |
| GZS260628-1 | 1782453952 | PR179 | 52132 | 2 | 0 → **1,453.3** | 0 → **11.255772** | (none) → GZS260628-1 | ฿0 | wt+1,453 · cbm+11.256 |
| GZS260628-1 | 1782459481 | PR10601 | 52128 | 2 | 0 → **266** | 0 → **0.8545** | (none) → GZS260628-1 | ฿0 | wt+266 · cbm+0.855 |
| GZS260628-2 | 1782288609 | PR009 | 52115 | 2 | 0 → **1,594** | 0 → **8.361312** | (none) → GZS260628-2 | ฿0 | wt+1,594 · cbm+8.361 |

> **fid 52110 (PR047)** is the §2b split-container under-count: it has 200 kg / 0.2328 CBM
> from a partial arrival, but iTAM truth is **444.5 kg / 0.694 CBM** — the rest of the
> shipment arrived in a later split that the API dropped. Backfill corrects it.
>
> **fid 52132 (PR179)** has `famount=92` currently (from the order) but iTAM Total Parcel =
> the deduped box sum; the reconcile overwrites `famount` with iTAM's value — verify this
> single high-count row before applying.

### 2b. PR DROP VICTIMS — in iTAM but **MISSING from `tb_forwarder` entirely** — **22 rows**

These PR trackings have NO `tb_forwarder` row at all — the arrival event never reached Pacred
(the API outage). They **cannot be billed until the row is created.** The reconcile's
`applyTaemReconcile` only UPDATEs existing rows (verdict `no-match` is skipped) — so these
need either a create-path (commit-momo / manual create) BEFORE the reconcile can fill them,
OR confirmation they belong to PCS-branch / are mislabeled (the §2c contamination). Total
unrecorded: **≈1,247.5 kg / 4.2313 CBM.**

| Container | tracking | code | iTAM wt | iTAM CBM | boxes | note |
|---|---|---|--:|--:|--:|---|
| GZE260624-1 | JYM188058166365 | PR028 | 18 | 0.1664 | 1 | road container |
| GZS260620-1 | LJ20464732 | PR10190 | 110 | 0.29952 | 20 | |
| GZS260620-2 | DPK202760913241 | PR012 | 17 | 0.0348 | 1 | |
| GZS260620-2 | KY4001045590371 | PR10634 | 61 | 0.07872 | 1 | |
| GZS260622-1 | 70692409023 | PR117 | 47 | 0.12996 | 2 | |
| GZS260622-1 | 800204571045 | PR029 | 70 | 0.0874 | 2 | |
| GZS260624-1 | **SF0219344032022** | PR018 | 3 | 0.01584 | 1 | = the known #10 MOMO carryover (reTrack-harvest) |
| GZS260626-1 | 880019331098 | PR117 | 6.5 | 0.00972 | 1 | |
| GZS260626-1 | KY982669997 | PR145 | 74.5 | 0.58696 | 2 | |
| GZS260626-1 | LJ20479565 | PR9903 | 23 | 0.252875 | 3 | |
| GZS260628-1 | 100029558416 | PR078 | 44.5 | 0.048585 | 3 | |
| GZS260628-1 | 983824005 | PR134 | 660 | 1.62 | 40 | biggest single PR victim |
| GZS260628-1 | DPK301899651812 | PR103 | 3 | 0.0675 | 1 | PR103 5-box split (next 4 rows) |
| GZS260628-1 | DPK301899673249 | PR 103 | 7.5 | 0.145728 | 1 | code has stray space "PR 103" |
| GZS260628-1 | DPK301899675129 | PR 103 | 3 | 0.0675 | 1 | |
| GZS260628-1 | DPK301899677142 | PR 103 | 3 | 0.0675 | 1 | |
| GZS260628-1 | DPK301899688662 | PR 103 | 3 | 0.0675 | 1 | |
| GZS260628-1 | JYM188058571523 | PR028 | 19.5 | 0.168084 | 1 | |
| GZS260628-1 | SF1565650839176 | PR148 | 15 | 0.02052 | 1 | |
| GZS260628-2 | 79014489632554 | PR043 | 32 | 0.10336 | 2 | PR043 3-box split (next 2 rows) |
| GZS260628-2 | 79014495220346 | PR043 | 16 | 0.12744 | 2 | |
| GZS260628-2 | YT7629647967871 | PR043 | 11 | 0.065436 | 2 | |

### 2c. EXCLUDED from drop-victim count (context, not Pacred-billable now)

- **82 PCS-coded trackings** (63 in GZS260524-1, 7 in GZS260628-1, 12 in GZS260628-2) — these
  are PCS-branch items (the "PCS x PR" contaminated containers · synthesis §2c). They live in
  the PCS system, not Pacred `tb_forwarder`, by design. **Do NOT backfill these into
  `tb_forwarder`.** They matter only as the PCS↔PR contamination context — any genuinely
  Pacred (PR) item that got filed under a PCS code must be **moved before payment** (the
  dev 3-step fix in the synthesis), and that's a manual CS task, not a reconcile write.
- **2 NOCODE rows** (760234558829, YT7629136113433 in GZS260628-1) — no customer code on the
  iTAM line; can't be attributed. Surface for CS.
- **4 container/sack-header artifacts** (CBX260621-EK06, CBX260620-SEA07, CBX260625-SEA05,
  CBX260628-SEA02) — these are MOMO routing-batch / sack-header rows that leaked into iTAM
  continuation lines, NOT real customer trackings. Skip.

### 2d. BILLED-LOCKED (matched but billed — ⚠ never written) — 2 rows

Both already match iTAM exactly, so no diff anyway. Listed for completeness (the reconcile
guard would skip them regardless):

| Container | tracking | code | fid | fstatus | iTAM = current |
|---|---|---|--:|:--:|---|
| GZS260524-1 | 801738086049 | PCS10190 | 52090 | 7 | 4 kg / 0.03276 (OK) |
| GZS260524-1 | JT3163896605904 | PCSPR10190 | 52018 | 7 | 7 kg / 0.04186 (OK) |

---

## §3 — `taem_container_etd_eta` plan (mig 0195)

`taem_container_etd_eta` is **empty on prod (0 rows)** — never populated. The xlsx files carry
NO ETD/ETA (the columns exist but are blank in every file — confirmed). Plan per the synthesis
§3a: **ETD = container close-date parsed from the GZS code** (deterministic, free); **ETA = the
LINE chat announcement** where present, else a derived default (the one known datapoint —
GZS260617-1 closed 2026-06-17 → ถึงไทย 2026-07-01 — is a 14-day sea transit, used as the
default suggestion for the other GZS; surface as editable, don't hard-write a guessed ETA).

| Container | ETD (= close-date) | ETA (chat) | ETA (ETD+14 suggest) | source |
|---|---|---|---|---|
| GZS260524-1 | 2026-05-24 | — | 2026-06-07 | derive |
| GZS260617-1 | 2026-06-17 | **2026-07-01** | 2026-07-01 | **taem (chat)** |
| GZS260620-1 | 2026-06-20 | — | 2026-07-04 | derive |
| GZS260620-2 | 2026-06-20 | — | 2026-07-04 | derive |
| GZS260622-1 | 2026-06-22 | — | 2026-07-06 | derive |
| GZS260624-1 | 2026-06-24 | — | 2026-07-08 | derive |
| GZE260624-1 | 2026-06-24 (road) | — | 2026-07-08 | derive |
| GZS260626-1 | 2026-06-26 | — | 2026-07-10 | derive |
| GZS260628-1 | 2026-06-28 | — | 2026-07-12 | derive |
| GZS260628-2 | 2026-06-28 | — | 2026-07-12 | derive |

The reconcile's `applyTaemReconcile` already upserts ETD/ETA per container via
`collectContainerEtdEta` (`source="taem"`, `onConflict: container_no`) — but since the xlsx has
no ETD/ETA, that path will store nulls. To actually fill ETD/ETA, either (a) add the close-date
+ chat-ETA via the admin per-container field, or (b) extend the reconcile to derive ETD from
the GZS code when the cell is blank. Recommend (a) for now (no code change · human sets the
chat ETA). MOMO `container/closed` stays the fallback/compare per mig 0195's design.

---

## §4 — What to apply + how

### The tool to run (DO NOT rewrite — it's already audited)
- **`actions/admin/taem-reconcile.ts`** → `previewTaemReconcile` (read-only diff) then
  `applyTaemReconcile` (writes basis + re-prices). Reached from the reconcile paste box under
  **`/admin/api-forwarder-momo`** (gated `ops`/`super`/`warehouse` + god).
- **Workflow:** open each iTAM xlsx → copy the Shipment-Report rows INCLUDING the header →
  paste into the reconcile box → **PREVIEW** → review the diff (esp. the ⚠ billed + the
  high-count `famount` rows) → **APPLY**. One container at a time (clean audit trail).

### Row counts the apply WILL produce (per the dry-run)
- **12 rows basis-updated** (the §2a WILL-UPDATE set) → `fweight`/`fvolume`/`famount`/
  `famountcount="1"`/`fcabinetnumber`/`ftransporttype="2"` (sea) written, then re-priced.
  11 of them go from ฿0 freight to a real charge.
- **0 rows touched** for the 22 PR drop victims (verdict `no-match` — skipped). They need a
  CREATE first (see "Gaps the reconcile can't close" below).
- **3 OK rows** unchanged · **2 billed rows** surfaced as ⚠, never written.
- **ETD/ETA:** the reconcile upserts containers, but with the blank-xlsx caveat in §3.

### Money-impact estimate
- **Under-charged freight currently at ฿0 on the 11 matched rows: ≈ ฿294,000**
  (15,227 kg / 44.76 CBM · estimated at the OK-row-derived sea rate ≈ ฿15/kg KG-basis when
  KG/CBM > 250, else ≈ ฿5,000/CBM — the apply re-derives the EXACT figure via the live rate
  card + per-order ค่าเทียบ/manual override). This is the headline recovery.
- **PR drop victims (22 rows, ≈1,247 kg / 4.23 CBM): ≈ ฿25,000** additional, only realizable
  once their rows are created and reconciled.

### Safety notes (money-adjacent → handle with care)
1. **SELL is not bypassed.** The reconcile writes the *measured basis*; the SELL price is
   re-derived by the canonical `computeAndFillForwarderImportRate`, which honours manual rate
   + per-order ค่าเทียบ overrides. It never writes a silent ฿0 — a row with no rate card is
   reported as `repriceFailed` for manual pricing. Cost stays editable / SELL locks only after
   billing (the [[cost-editable-sell-locked]] rule).
2. **Billed rows are protected.** `fstatus ∈ {5,6,7}` is re-asserted in the UPDATE WHERE
   (TOCTOU-safe) — a row billed between preview and apply is never overwritten.
3. **De-dup is mandatory** (already in the parser): the `-N/M` box rows are summed to the base
   tracking BEFORE matching, so a multi-box shipment isn't multiplied. Don't paste MOMO's
   over-counted list — paste iTAM (the `momo-bill-header.ts` discipline).
4. **No double-count of CBM:** `famountcount` is forced to "1" because iTAM's Total Vol IS the
   aggregate (the 2026-06-16 rule — CBM reads `fvolume` directly, not `fvolume × famount`).
5. **Don't ingest PCS rows** into `tb_forwarder` (§2c) — they're a different branch.
6. **Verify `famount` overwrites** on the 2 high-count rows (PR179 fid 52132 famount 92→iTAM;
   PR134 once created = 40 boxes) before applying that container.
7. **Apply per-container + re-run preview after** to confirm verdicts flip to `ok`.

### Gaps the reconcile can't close (need a separate step)
- The **22 PR drop victims** have no `tb_forwarder` row. The reconcile only UPDATEs. To bring
  them in: create the rows (via the MOMO commit path if a routing-batch row exists, or a manual
  forwarder create), THEN reconcile to fill the basis. OR confirm with CS whether each is a
  PCS-contamination case (move-before-payment) vs a genuine never-arrived record.
- **ETD/ETA** won't populate from the xlsx (blank) — set per §3 manually or extend the
  reconcile to derive ETD from the GZS code.

---

## Provenance
- iTAM parse: 13 xlsx in `TAM - Packing List` (10 per-container + the Pacred 2026-06-19
  overview + 2 cost-invoice PDFs excluded). Parser mirrors `lib/admin/taem-reconcile-parser.ts`
  CANON columns. 127 distinct base-trackings.
- DB read: PROD `yzljakczhwrpbxflnmco` pooler (read-only) · `tb_forwarder` = 121 rows total ·
  17 matched the iTAM trackings · `taem_container_etd_eta` = 0 rows.
- No DB write performed. No git commit. No push.
