# 🧾 Legacy PCS-admin deep-read — Forwarder · MOMO-API · Warehouse-scan · Payment (2026-06-14)

> **What this is.** A comprehensive, source-grounded read of 8 legacy PCS-admin screens the owner handed over (the ฝากนำเข้า/import operating loop + its two live data feeds + the ฝากโอนหยวน money path), cross-referenced against **(a)** the rendered HTML, **(b)** the canonical legacy PHP source at `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`, and **(c)** the current Pacred implementation. Produced by a 4-reader + synthesis workflow (§0b discipline: the PHP dispatcher is the source of truth; the HTML is one rendered mode).
>
> **Source HTML read:** `forwarder.html` (96k lines · structural) · `foewarder6.htnl` · `momo api upadate.html` · `momoapi dateupadate.html` · `hisupdatemomoapi.html` · `wh scanbarcode.html` · `wh scan cam.html` · `payment.html`.

---

## TL;DR — the port is far more complete than a screen-count would suggest

**~26 of 30 screens are faithfully BUILT + live on the canonical `tb_*` schema · money flows present · ZERO §0e dead-write traps in this set.** The deep-read's first pass produced **3 FALSE gaps** that were corrected by reading the Pacred code (see Learnings #1). The genuine remaining work is small + concentrated: **one money-concurrency hole** (yuan verify lock), a few **detail-page polish** items, and **MOMO debug/observability** screens that Pacred deliberately re-architected away.

---

## The daily cargo operating loop (what these 8 screens collectively ARE)

A parcel is **born** (forwarder add / MOMO manual-insert / API sync) → **travels** (warehouse barcode scans flip `fStatus` 1→2→3→4 with China→TH dates) → **audited + billed** (forwarder-check + the 9 forwarder-action QA queues) → **paid** (yuan-payment slip-verify with wallet debit/refund + the yuan-profit report) → **dispatched** (driver assignment + prepare/deliver scans flip 6→7) → **reconciled** (combine-bill · notes · warehouse-history). The single canonical spine is **`tb_forwarder` (~47K prod rows)** — Pacred reads it directly via PostgREST; the rebuilt UUID-keyed `forwarders`/`yuan_payments` twins are empty + intentionally bypassed (Wave 3 / Wave 7.1 corrections held).

---

## Per-group summary

**FORWARDER / ฝากนำเข้า (11 screens) — the most complete group.** All 11 built + live on `tb_forwarder`: list+add modal · detail (2-query + 6 inline editors) · status-update editor (status-gated + driver/cost/credit panels) · forwarder-check billing queue (4→5 + real ThaiBulkSMS) · the 9-queue forwarder-action QA hub · warehouse-history import log · combine-bill · notes (admin-only vs customer-visible w/ LINE) · single+bulk add · single+bulk search. Only partial = driver-assignment (built at `/admin/drivers` + `/driver-runs` but no mobile barcode driver-app + GPS — both deferred AND absent in legacy → **parity, not regression**). Verdict: faithful, money-safe, reachable.

**MOMO PARTNER-API (5 screens) — the most architecturally divergent; where the real backlog lives.** Only the daily manual-insert form is a 1:1 port (`/api-forwarder-momo/manual`, sharing `commit-momo-row-core.ts` price logic with the cron path). The other 4 legacy screens were **deliberately re-architected**: legacy's `tb_tmp_forwarder_item_momo` staging + multi-step in-page review→INSERT became **cron auto-sync into `momo_import_tracks` + 3 NEW screens legacy never had** (`/review` commit grid · `/sync` manual trigger · `/history` + `momo_sync_logs`). So `updateAPI` + `hisAutomation` are functionally subsumed (partial); `APICheckSM` (per-SM upstream debug) + the date-batch editor are genuinely absent (low-value debug). The bill-header de-dup (drop the bare zero-weight header so a 6-box parcel isn't counted as 12) is correctly ported to `lib/admin/momo-bill-header.ts`.

**WAREHOUSE BARCODE-SCAN (6 screens) — fully built, operationally sharp.** USB-scanner intake (driver/import) · mobile-camera intake (Quagga) · prepare-scanner (→6) · driver/delivery scanner (6→7 + un-deliver edge) · the unified gateway router (type=4/6/7/from with Type6Confirm/Ambiguity/NotFound) · the W10 NEW China-warehouse worker intake (1→2, a Pacred addition). Auto-flip threshold (scan-count `fi2amount ≥ famount` → `fstatus=4`), orphan-scan upsert + later relink, cookie-persisted pallet location, role-gated flip matrix (`canAnyRoleFlipFstatus`, soft-fail), container-completeness LINE notify — all present. Verdict: clean, faithful, well-isolated.

**PAYMENT / ฝากโอนหยวน (3 screens) — money-critical, more complete than first concluded.** List (reads `tb_payment` directly post-Wave-7.1, 60-day default, status tabs, CSV) + detail+slip-verify (wallet debit on create, refund reverses via `tb_wallet_hs` type=5, LINE + in-app notify) are faithful. The "missing accounting report" was **FALSE**: `acc-payment.php` is built at `/admin/reports/yuan-profit` (faithful `report-payments-profit.php` port · reads `tb_payment WHERE paystatus=2` · full `payratecost`/`paythbcost`/`payprofitthb` + daily chart · super/accounting). Bulk-approve IS wired (`TbYuanBulkBar`); the add-form is real (`adminCreateYuanPaymentManual`). Pacred even ADDS yuan tax-invoice issuance (flag-gated OFF). True partials = detail-page polish (below).

---

## Fidelity scoreboard (screen → status → Pacred file → gap)

| Screen | Status | Pacred | Gap |
|---|---|---|---|
| Forwarder list + add modal | ✅ BUILT | `/admin/forwarders` + forwarders-table | — |
| Forwarder detail | ✅ BUILT | `/admin/forwarders/[fNo]` (2-query + 6 editors) | — |
| Forwarder edit / status-update | ✅ BUILT | `/admin/forwarders/[fNo]/edit` | inline-vs-grouped = deliberate UX |
| Forwarder-check (billing queue) | ✅ BUILT | `/admin/forwarder-check` (4→5 + SMS) | — |
| Forwarder-action (9 QA queues) | ✅ BUILT | `/admin/forwarder-action?action=` | — |
| Driver assignment | 🟡 PARTIAL | `/admin/drivers` + `/driver-runs` | mobile driver-app + GPS (deferred · also absent in legacy = parity) |
| Warehouse-import log | ✅ BUILT | `/admin/forwarders/warehouse-history` | — |
| Combine-bill | ✅ BUILT | `/admin/forwarders/combine-bill` | — |
| Notes | ✅ BUILT | `/admin/forwarders/notes` | — |
| Add (single + bulk) | ✅ BUILT | `/admin/forwarders/new` + `/new-bulk` | — |
| Search (single + bulk) | ✅ BUILT | `?focus=search` + `/bulk-search` | — |
| MOMO manual insert | ✅ BUILT | `/api-forwarder-momo/manual` + commit-momo-row-core | auto-notify (P2) |
| MOMO API-pull preview (updateAPI) | 🟡 RE-ARCH | cron `momo-sync` + `/review` + `/sync` | no manual date-scoped pull-with-preview |
| MOMO status check (APICheckSM) | 🔴 MISSING | — | no per-SM upstream debug (low-freq) |
| MOMO date-batch update | 🔴 MISSING | — | no date-range multi-row editor (cron obviates) |
| MOMO automation history | 🟡 PARTIAL | `/api-forwarder-momo/history` + momo_sync_logs | no raw per-run cron-failure drill-down |
| WH USB-scanner intake | ✅ BUILT | `/admin/barcode/driver/import` | — |
| WH mobile-camera intake | ✅ BUILT | `/admin/barcode/cargo/import` (Quagga) | — |
| WH prepare scanner (→6) | ✅ BUILT | `/admin/barcode/driver/prepare` | — |
| WH driver/delivery scanner (6↔7) | ✅ BUILT | `/admin/barcode/driver/{from,all}` + gateway | — |
| China-WH worker intake (W10) | ✅ BUILT | `/admin/warehouse/worker/intake` (1→2) | Pacred addition |
| Barcode gateway router | ✅ BUILT | `/admin/barcode/gateway` | — |
| Yuan payment list | ✅ BUILT | `/admin/yuan-payments` (tb_payment · CSV · bulk) | sort id-DESC vs paydate-DESC (minor) |
| Yuan detail + slip-verify + refund | 🟡 PARTIAL | `/admin/yuan-payments/[id]` + refund-modal | **no concurrent-edit lock** · no slip re-upload · no inline cost-rate input |
| Yuan profit report (acc-payment) | ✅ BUILT *(was mis-flagged)* | `/admin/reports/yuan-profit` | — |
| Yuan add form | ✅ BUILT *(was mis-flagged)* | `/admin/yuan-payments/new` | — |

---

## 🔴 Ranked REAL gaps (the actionable backlog)

1. **[MONEY/AUDIT · highest] yuan-verify concurrency lock.** Two accountants opening the same pending ฝากโอน can both verify/refund → **double wallet reversal risk**. Legacy guarded this (`payment.php` L695 `payLockDate` + session). Pacred `/admin/yuan-payments/[id]` has no equivalent. A money-correctness hole, not just UX.
2. **[WORKFLOW] yuan-verify slip re-upload + inline cost-rate.** Expose (a) `imagesSlip` re-upload at verify time (legacy L857-860) and (b) the `payratecost` input — the action schema already accepts `cost_rate`, only the UI island is missing; without it the cost rate driving every downstream profit number can't be set on the detail page. Low effort, money-accuracy payoff.
3. **[OBSERVABILITY] MOMO cron failure drill-down.** `momo_sync_logs` already records each run + errors — surface a raw run-log tab (timestamp · status · inserted/updated · error) on `/api-forwarder-momo/history`. Today ops reads Vercel logs to answer "why did sync stop?". Protects the data feed the whole loop depends on.
4. **[WORKFLOW] MOMO manual API-pull with preview.** No staff-triggered, date-scoped "pull now → preview → selectively commit". When cron is behind or a special shipment needs an immediate pull, staff can't force a scoped fetch. Re-add as `/sync` gaining a date-range + dry-run preview. Mostly resilience.
5. **[DEBUG · low] MOMO per-SM status check (APICheckSM).** Query one SM code upstream → phase timeline + linked `tb_forwarder` rows. ~1–2×/week troubleshooting only.
6. **[POLISH · lowest] yuan list sort (id→paydate DESC, one-liner) + MOMO date-batch editor** (largely obviated by cron date-sync). Bundle into a cleanup wave or skip.

---

## ✅ Confirmed BUILT (parity evidence — do NOT rebuild)

Forwarder: list/detail/edit/check/action/warehouse-history/combine-bill/notes/add(×2)/search(×2). MOMO: manual-insert (+ shared `live-rate.ts` price calc) · review grid · sync trigger · history · bill-header de-dup. Warehouse: USB + camera intake · prepare · driver/delivery · gateway · W10 worker-intake. Payment: list · detail+verify+refund · yuan-profit report · add-form. Driver: `/admin/drivers` + `/driver-runs`. Files cited in the scoreboard above.

---

## 🧠 Learnings (durable)

1. **A screen's Pacred home is organized by FUNCTION, not by the legacy file's directory.** 3 of this batch's "gaps" were false: `acc-payment.php` lives at `/admin/reports/yuan-profit` (it's a REPORT — the auditor looked under `/yuan-payments/*`), yuan bulk-approve is wired (`TbYuanBulkBar`), the yuan add-form is real. **Re-verify every "missing" verdict against the live route tree, searching by the data a screen reads — not the legacy name.**
2. **§0e dead-write trap = CLEAN across this whole money set.** Every live surface (yuan list/detail/profit-report · forwarder list/check) reads the populated `tb_payment`/`tb_forwarder`, not the empty rebuilt twins. The Wave 3 + Wave 7.1 repoints held. Verify-table-before-claiming paid off as *confirmation*, not a finding.
3. **"Missing legacy screen" often means "re-architected into a better Pacred mechanism."** MOMO's `tb_tmp` staging + in-page review→INSERT became cron→`momo_import_tracks` + review/sync/history + `momo_sync_logs`. Score such cases PARTIAL/re-arch; flag a REAL gap only when a *capability* (per-SM debug · force-pull-preview · raw cron log) has no equivalent at all.
4. **The price-calc spine is shared, not duplicated.** Legacy `calPriceForwarder` → one `computeAndFillForwarderImportRate` (`lib/forwarder/live-rate.ts`), consumed by BOTH the MOMO manual form AND the cron commit (`commit-momo-row-core.ts`) → manual + auto produce identical `fTotalPrice`. Preserve this single-source convergence for any new `tb_forwarder` write path.
5. **New audit dimension: money-mutating DETAIL pages need a concurrent-edit guard, not just a reachable mutate action.** The highest-value gap here wasn't a missing screen — it was the absent yuan-verify lock on a built page (double-refund risk). Add "is there a concurrency/lock guard?" to the §0c/§0e money checklist.
6. **`tb_forwarder` is the ~47K-row spine for the ENTIRE import + warehouse + driver + MOMO loop** (`fStatus` 1→7 lifecycle · `fDateStatus1..7` timeline cols · flip ACL via `canAnyRoleFlipFstatus` soft-fail · orphan-scan upsert into `tb_forwarder_import2` + later relink). Any new cargo-state feature must write `fStatus` + the matching `fDateStatusN` + append `tb_log_forwarder_status`, and respect the MOMO bill-header de-dup so box counts don't double.

---

> **Cross-links:** CLAUDE.md §0b (read source not HTML) · §0e (dead-write) · `docs/learnings/audit-discipline.md` · `docs/research/legacy-admin-gap-waves-2026-06-12.md` (the 5-wave gap plan this refines). The owner is feeding more legacy HTML gradually — fold subsequent reads into this doc.
