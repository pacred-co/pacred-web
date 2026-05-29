# Master Fidelity Audit — 2026-05-30 evening · launch-readiness synthesis

**Sources (5 parallel agents · AGENTS.md §0b deep-audit-from-source):**
- [`forwarders-fidelity-2026-05-30-evening.md`](forwarders-fidelity-2026-05-30-evening.md) — Agent A
- [`service-orders-fidelity-2026-05-30-evening.md`](service-orders-fidelity-2026-05-30-evening.md) — Agent B
- [`yuan-payments-fidelity-2026-05-30-evening.md`](yuan-payments-fidelity-2026-05-30-evening.md) — Agent C
- [`drivers-barcode-fidelity-2026-05-30-evening.md`](drivers-barcode-fidelity-2026-05-30-evening.md) — Agent D
- [`cnt-warehouse-fidelity-2026-05-30-evening.md`](cnt-warehouse-fidelity-2026-05-30-evening.md) — Agent E

ภูม คำถาม: *"มีอะไรตกหล่น อะไรที่ยังใช้งานไม่ได้จริง อะไรที่หน้าระบบการใช้งานและฟังก์ชันยังไม่เหมือน PCS"* · ทุกระบบเจาะลึก legacy `.php` source บนดิสก์ vs Pacred current state · เทียบ feature-by-feature.

---

## Executive summary — counts at a glance

| ระบบ | Legacy LOC | Pacred LOC | ✅ | ⚠️ | ❌ | 🔧 | Top P0 ETA | % completeness |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ฝากนำเข้า (forwarders) | ~10,000 | ~8,500 | 31 | 12 | 9 | 5 | ~17h | ~80% |
| ฝากสั่งซื้อ (service-orders) | ~12,000 | ~3,500 | 11 | 4-7 | 13 P0 | 17 P1 | ~12-18h | **~15-25%** |
| ฝากโอน (yuan-payments) | ~3,500 | ~2,800 | 22 | 18 | 23 | 11 | (revenue hole) | ~60% |
| มอบหมายคนขับ + barcode | 8,696 (24 files) | 1,927 (16 routes) | — | partial | 4 P0 | 12 P1 | ~5h | driver ~75% · barcode ~80% |
| ตู้/cnt + warehouse | 6,299 (6 files) | 4,647 (17 files) | partial | partial | 5 P0 | 16 P1 | ~15h | cnt ~88% · check ~85% · wh ~70% |

**Grand total:** ~57 P0 launch blockers + ~63 P1 polish · estimated **~70 dev hours** for P0s alone · **2-3 wallclock days with 4-5 parallel agents**.

---

## 🔥 The 6 recurring patterns (this is where the bugs hide)

The 5 agents independently found **the same 6 underlying issues** across all systems. Fix the pattern once = clean up many surfaces:

### Pattern 1: 🚨 SILENT DEAD-WRITES (revenue-critical · most common)

Admin actions write to **REBUILT** (empty on prod) tables instead of `tb_*` (where the 21,950 real orders live). UI shows green success toast — data goes nowhere.

| ระบบ | Action | Writes to | Should write to |
|---|---|---|---|
| service-orders | `adminUpdateServiceOrder` | rebuilt `service_orders` | `tb_header_order` |
| service-orders | `adminMarkServiceOrderPaid` | rebuilt | `tb_wallet` + `tb_wallet_hs` |
| service-orders | status writes (5-tab) | rebuilt (empty) | `tb_header_order.hstatus` |
| yuan-payments | `adminUpdateYuanPayment` | rebuilt `yuan_payments` | `tb_payment` |
| yuan-payments | refund modal (`YuanRefundModal`) | rebuilt | `tb_payment` |
| forwarders | `bulkCancel` (`bulk-actions-toolbar.tsx`) | rebuilt `forwarders` | `tb_forwarder` |
| forwarders | `[fNo]/page.tsx` aside panels | rebuilt-UUID path only | both paths |

**Detection signal:** UI works · toast says "สำเร็จ" · but row in tb_* doesn't change. Staff reports "edit ไม่ติด" or "ลูกค้าเช็คดูยังเป็นแบบเดิม".

### Pattern 2: 🚨 DUPLICATE ACTION FILES (easy to grab wrong one)

Multiple action files with similar names · half writes to rebuilt, half to tb_*. Picking wrong import = silent dead-write.

- `actions/admin/yuan-payments.ts` (rebuilt) vs `actions/admin/yuan-payments-tb.ts` (tb_payment)
- `actions/admin/forwarders.ts` (mixed) vs `actions/admin/forwarders-edit.ts` (tb_forwarder)
- `resolveLegacyAdminId()` duplicated identically in 3 files (forwarders-edit / forwarders-new / combine-bill) — `lib/auth/safe-legacy-admin-id.ts` exists for this

**Fix:** rename rebuilt-table actions to `*-legacy.ts` or delete entirely once verified no consumer.

### Pattern 3: 🚨 WALLET LEDGER NOT DEBITED (cash leaks)

Several admin "approval" paths skip the wallet ledger update. Customer wallet shows full balance + payment exists at the same time.

- ฝากโอน admin manual-create: insert tb_payment paystatus='2' · **no `UPDATE tb_wallet.walletTotal` + no `INSERT tb_wallet_hs type=6`**
- ฝากสั่งซื้อ admin-mark-paid: same hole · 21,950 migrated orders at risk

**Detection signal:** customer wallet doesn't decrement after admin marks payment done.

### Pattern 4: 🚨 NOTIFICATION GAPS (customer trust)

LINE OA / LINE Notify / SMS / email pushes that legacy fires on key transitions are unwired in Pacred. Customer doesn't get told when their order moves forward.

| Trigger | Legacy notify | Pacred status |
|---|---|---|
| Driver photo upload (fstatus=7) | LINE OA + SMS | ❌ not wired + fstatus doesn't even flip |
| forwarder note save | LINE OA push | ❌ saves silently |
| tb_payment approve | LINE OA | ❌ silent |
| Bulk-approve yuan | LINE/SMS | ❌ silent |
| forwarder-check bulk-bill | LINE + email | ✅ **Pacred exceeds legacy (legacy commented out)** |

### Pattern 5: 🚨 PRINT/PDF ROUTES MISSING OR WRONG

Print buttons point at routes that 404 or render wrong template. The print is THE handoff to the customer/driver/warehouse — when it breaks, the physical workflow breaks.

- `/admin/service-orders/print` route missing entirely (D9+D29+D30+D31)
- forwarders detail "7-button quick-action ribbon" (ใบเสร็จ · พิมพ์จากกล่อง · พิมพ์ที่อยู่) absent
- warehouse-history bulk-print "พิมพ์จากหน้ากล่อง" deferred
- `printAll.php` (969 LOC) — `gateway/page.tsx` has TODO comment (L78-82) but no implementation

### Pattern 6: 🚨 SESSION LOCK / CONCURRENCY MISSING

Legacy has `updateLock.php` heartbeat (60s ping) + per-row lock columns (`payLockDate`, etc.) to prevent two admins editing the same row simultaneously. **None ported.** 13 admins on prod = collision risk.

---

## 🔴 Master P0 list — ranked by revenue + customer-trust impact

(Combined from all 5 audits · sequenced so each unblocks the next)

### Tier A — Revenue holes (DAY 1 · ~9h)

| # | Fix | System | Impact | ETA |
|---|---|---|---|---:|
| A1 | Pivot `adminCreateYuanPaymentManual` to debit `tb_wallet` + insert `tb_wallet_hs` type=6 | ฝากโอน | Wallet leak · admin approval = double-spend | 1h |
| A2 | Pivot `adminMarkServiceOrderPaid` to write `tb_wallet` + `tb_wallet_hs` | ฝากสั่งซื้อ | Wallet leak · 21,950 orders | 2h |
| A3 | Pivot `bulkCancel` (forwarders bulk-actions-toolbar) from rebuilt → tb_forwarder | ฝากนำเข้า | Silent dead-write on cancel | 1h |
| A4 | Pivot `adminUpdateServiceOrder` from rebuilt → `tb_header_order` | ฝากสั่งซื้อ | 80% of staff complaints resolve | 2h |
| A5 | Pivot `adminUpdateYuanPayment` + refund modal to `tb_payment` (delete duplicate file) | ฝากโอน | single-row approve/reject works | 2h |
| A6 | Fix `tb_settings.rsdefault` → `rpDefault` typo (CNY rate) + admin edit UI | ฝากโอน | unblock CNY rate change without redeploy | 1h |

### Tier B — Customer-trust (DAY 2 morning · ~10h)

| # | Fix | System | Impact | ETA |
|---|---|---|---|---:|
| B1 | Driver photo upload cascade `tb_forwarder.fstatus='7' + fdatestatus7=NOW()` (legacy L166/580/1328) | คนขับ | ตู้ stuck on "เตรียมส่ง" forever · "ส่งแล้ว" never shown | 1h |
| B2 | Wire LINE OA + SMS on fstatus=7 cascade (above) | คนขับ + notify | Customer trust on delivery | 2h |
| B3 | Wire `saveNote` LINE OA push (forwarders TbForwarderActionPanel) | ฝากนำเข้า | Notes invisible to customer | 1h |
| B4 | Build `/admin/service-orders/print` with pdf-lib (closes D9+D29+D30+D31) | ฝากสั่งซื้อ | Print invoice/receipt + juristic | 3-4h |
| B5 | Detail-page 7-button quick-action ribbon (ใบเสร็จ · พิมพ์จากกล่อง · พิมพ์ที่อยู่) | ฝากนำเข้า | Daily print workflow | 3h |

### Tier C — Operational gaps (DAY 2 afternoon · ~10h)

| # | Fix | System | Impact | ETA |
|---|---|---|---|---:|
| C1 | Wire `[fNo]/page.tsx` aside panels on legacy-row path (currently only UUID path) | ฝากนำเข้า | Edit form · driver assign · cost adjust missing on legacy rows | 4h |
| C2 | Retarget expire-driver-assignments cron from rebuilt → `tb_forwarder_driver` | คนขับ | SLA: 17/24/30h auto-expiry not running | 20min |
| C3 | Single-container manual cnt-payment on `report-cnt/[fNo]` (image upload) | ตู้/cnt | Only bulk mode works now | 2h |
| C4 | forwarder-check totals row (t5/t9/t10/t18/t20/t23 aggregates) | ตู้/check | Operators can't gut-check queue | 1h |
| C5 | `tb_user_sales` agent commission INSERT on fstatus=7 (THADA/SIN/OOAEOM/SWAN VIPs) | ฝากนำเข้า | 4 partner agents lose visibility every delivery | 1h |
| C6 | `update_fAddress` re-pick from saved tb_address list | ฝากนำเข้า | Address changes need re-typing | 2h |

### Tier D — Critical workflow (DAY 3 · ~12h · biggest gap)

| # | Fix | System | Impact | ETA |
|---|---|---|---|---:|
| D1 | Build the **5-tab process-model workflow** on `/admin/service-orders` (Tab 1/2/3/5 · Tab 4 already Wave 21) | ฝากสั่งซื้อ | Largest single gap · entire workflow missing | 6-8h |
| D2 | Port `repayItem.php` refund flow (the shopping-return path · D10+D28) | ฝากสั่งซื้อ | Cannot refund returned items | 3h |
| D3 | Port `tb_promotion` carry on shop→forwarder spawn (L1514-1523) | ฝากสั่งซื้อ | 3.3/Valentine/PCSF customers lose discount | 1h |

**Total Tier A+B+C+D = ~41h focused work · 3 wallclock days with parallel agents.**

---

## ⚡ Quick wins (≤30 min each · do first to clear noise)

1. Fix CNY rate column typo `rsdefault` → `rpDefault` (1-line)
2. Set yuan admin-add default `paystatus='1'` (not '2') for 2-admin separation
3. Cron retarget (`tb_forwarder_driver`)
4. Refactor `resolveLegacyAdminId()` to import from `lib/auth/safe-legacy-admin-id.ts` (delete 3 duplicates)
5. Delete `actions/admin/yuan-payments.ts` rebuilt-write version (or rename to `*-legacy.ts`)
6. Add "Verified work BEYOND legacy" banner to forwarder-check (LINE + email actually fire — legacy never did)
7. Replace `bulk-actions-toolbar` STATUS_LABELS rebuilt enum with tb_forwarder fstatus 1..7

---

## 🟡 P1 backlog (63 items · post-launch within 14 days)

Summarised totals (full per-item lists in source docs):
- **Forwarders:** 16 items / ~16h — credit-mode lifecycle, `update_fTransportType` standalone, `tb_log_forwarder_status` writes, 1%-VAT footer, combine-bill detail, search 7-key axes, fStatusCarDateOn/Off who-when display
- **Service-orders:** 17 items / ~22h — heartbeat lock, inline tracking-edit, IP-reassign modal, juristic print, overdue auto-cancel
- **Yuan-payments:** 11 items / ~10h — schema drift cleanups, paytype enum, status-label drift admin↔customer
- **Drivers + barcode:** 12 items / ~10h — orphan-linking, gateway type=6 SweetAlert, axis rename
- **Cnt + warehouse:** 16 items / ~25h — bulk-print PDF, wait-day average, CostUpdate diff preview

---

## 🟢 Verified matching (no action needed)

- **Wave 16 closed:** report-cnt/[fNo], forwarder-check bulk-bill, inline cost-edit modal, barcode schema split
- **Wave 17 ux-fix:** report-cnt inline checkbox + modal · "เบิก"/"จ่าย" wording is CORRECT (legacy uses both on different surfaces)
- **Wave 21:** shop→forwarder auto-spawn (idempotent + dedup)
- **Wave 22:** tb_admin → admins merge + admins list/new/edit
- **Wave 23:** /admin/cnt-hs cabinet column overflow truncate + modal, ดูตู้คอนเทนเนอร์ URL fix, cnt-hs/[id] detail
- **Wave 24:** SKU variant picker, /admin/forwarders bounce fix, fdatecontainerclose auto-set
- **Wave 26.2:** /admin/service-orders list page (12-of-14 features · ไม่ใช่ workflow)
- **Wave 29:** doc-number minter FRG/FRC, auto-receipt on payment land, mPDF printReceipt, batch billing, barcode sidebar fix
- **Wave 30:** MOMO cron auto-pull 10-min, cabinet propagation fix (today)
- **forwarder-check LINE + email:** Pacred is FIRST version where they fire (legacy was commented out)
- **Google Sheets dependency dropped:** Wave 16-B Pacred-native CSV replacement is RIGHT call
- **`cnt.php` (76 LOC):** debug script, not a feature · skip-port confirmed

---

## Recommended launch sprint (8-9 days · with parallel agents)

| Day | Focus | Hours | Outcome |
|---|---|---|---|
| 1 | Tier A (revenue holes) + quick wins | ~12h | No more silent dead-writes · wallet ledger correct |
| 2 | Tier B (customer-trust) | ~10h | Notifications + print work · driver status flows end-to-end |
| 3 | Tier C (operational gaps) | ~10h | Daily ops workflows match legacy |
| 4-5 | Tier D (service-orders 5-tab + refund) | ~12h | The biggest single missing workflow |
| 6 | Re-audit + click-through verify all Tier A-D | ~6h | §0c discipline pass · regression check |
| 7-8 | P1 batch (top 30 of 63) | ~16h | Polish · removes obvious-divergence flags |
| 9 | Re-test on prod + ship to main | — | Launch |

**This assumes 4-5 parallel agents per day · 1 main coordinator (Claude main session) · ~10 effective dev-hours/day per agent.**

---

## Things ภูม should DECIDE before sprint starts

(per agent reports · 6 pending decisions)

1. **GOOGLE_MAPS_API_KEY** — drivers detail page GPS map (set env or remove map?)
2. **LINE Notify token migration** — Apr 2025 EOL · use LINE OA push instead?
3. **expire-driver-assignments cron retarget timing** — tonight or post-launch?
4. **Print routes brand** — keep `PCS Cargo Co., Ltd. · TaxID 0105560160694` (legacy) or switch to `Pacred (Thailand) Co., Ltd. · TaxID 0105564077716`?
5. **Numeric pallet 1-40 variant** — keep letter-only (A1-Z6) or build numeric too?
6. **Push notify on fstatus 3→4** — auto-fire SMS+LINE when MOMO/CN says "ถึงไทยแล้ว"?

---

## Cross-reference

- Master tech-debt: [`docs/research/admin-tech-debt-master-2026-05-27.md`](../research/admin-tech-debt-master-2026-05-27.md)
- Pacred design philosophy: [`docs/learnings/pacred-design-philosophy.md`](../learnings/pacred-design-philosophy.md)
- Verify deep-flow: [`docs/learnings/verify-deep-flow.md`](../learnings/verify-deep-flow.md)
- AGENTS.md §0a (workflow vs UI) · §0b (deep-audit-from-source) · §0c (click-through verify)
