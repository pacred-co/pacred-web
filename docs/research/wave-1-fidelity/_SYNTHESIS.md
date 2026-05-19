# Wave 1 Fidelity Audit — Synthesis (ภูม → เดฟ)

> **Audit run:** 2026-05-19 evening by ภูม via 4 parallel shadow-clone reviewers.
> **Sources:** the 4 per-slice audit docs in this folder (`audit-b{1,3,4,6}-*.md`).
> **Lens:** the D1 fidelity bar — owner's verbatim rule: *"copy the original to
> 100% sameness FIRST, then improve"* + the save-point-2026-05-19 §4 finding
> ("`B-0` is the missing layer").
>
> **TL;DR for เดฟ:** Wave 1 chrome is **good** — layouts / status enums /
> section IA are faithful 3-of-4 slices, the 4th (`B-6`) is genuinely faithful
> end-to-end. **The blocker is bigger than data routing** — empirical probe
> against dev Supabase (§8) shows **only 6 of 8,898 migrated PCS customers
> have a `profiles` row at all** (0.067%).  B-auth provisions `auth.users`
> ✅ but NOT a `profiles` row — every migrated customer is a ghost in
> Pacred-land regardless of which table the UI reads.  Spot-checked PR169
> = 1,956 forwarders in `tb_forwarder`, zero `profiles` row.
>
> **Wave 2 (UPDATED) = 3-step bundle** (per §8.5):
> 1. `0088_pcs_profiles_backfill.sql` — bulk INSERT 8,898 profile rows from
>    `tb_users` (recommended) — fixes the ghost problem.
> 2. Extend `pcs-legacy-bridge.ts` to bind `auth.users.id ↔ profiles.id` on
>    first login.
> 3. The §7.2-7.4 swap diffs (re-point reads at `tb_*` · re-key B-2 status
>    vocab) — already implementation-ready in this synthesis.
>
> **Without step 1 the §7 swap diffs are necessary but NOT sufficient.**
> Ship Wave 1 chrome as-is, do not rebuild.

---

## 1. Verdict matrix

| Slice | Layout fidelity | Data fidelity (B-0) | Severity | Recommendation |
|---|---|---|---|---|
| **B-1** 9-icon launchpad | 🟢 EXCELLENT (icons · wallet card · sales-rep) | 🔴🔴 0 `tb_*` refs | 🔴 paradigm | Ship chrome · B-0 bundles fix |
| **B-3** customer order-flow | 🟢 strong (6 tabs + Thai labels + 151-cap + link-paste) | 🔴 0 `tb_*` refs (`service_orders` / `cart_items` instead of `tb_header_order` / `tb_cart`) | 🔴 paradigm | Same — B-0 bundles fix · +4 secondary gaps for Wave 2.1 |
| **B-4** admin RBAC sidebar+badges | 🟢 structure faithful (17 OOP blocks · 7 hand-assembled menus · 6 EN headers Cargo&Freight/Freight/Cargo/Settings/Learning/Extension) | 🔴 14 of 14 badge queries hit rebuilt-era | 🔴 paradigm (badges = 0 = lose work radar) | Same — B-0 bundles fix · 1 stale `cnt = 0` line ภูม patches now |
| **B-6** `tb_cnt` container payments | 🟢 reads all 4 legacy tables + faithful fan-out + `report-cnt.php` loop | 🟢 ALL `tb_*` (the exception) | 🟡 ship-as-is + 2 plumbing | Ship · ภูม patches 2 trivial menu issues |

**The pattern is striking:** the slice ภูม's save-point already flagged as
faithful (`B-6`) IS faithful end-to-end (Agent D confirms). The 3 flagged-as-
gap slices ARE the same kind of gap (data routing, not architecture).

---

## 2. The B-0 fix — what Wave 2 must do

Per Agent A's concrete swap list (verified vs `0081_pcs_legacy_schema.sql`),
the canonical re-pointings for the 3 affected slices:

| Rebuilt-era → Legacy (`tb_*`) | Used by |
|---|---|
| `profiles` (joined to `wallet`) → **`tb_users`** + **`tb_wallet`** | B-1 wallet card · B-1 sales-rep · B-4 customers count |
| `service_orders` (status enum strings) → **`tb_header_order`** (`hStatus tinyint(4)` 1-6) | B-1 recent activity · B-3 list · B-4 order-stage badges |
| `service_order_items` / `cart_items` → **`tb_cart`** + **`tb_header_order_item`** | B-3 cart + per-order line items |
| `forwarders` (rebuilt status enum) → **`tb_forwarder`** (`fStatus` 1-7 + `fStatusCarOn/Off`) | B-1 forwarder count · B-4 forwarder stage badges |
| `yuan_payments` → **`tb_payment`** | B-1 recent activity · B-4 yuan-payment badges |
| `wallet_transactions` → **`tb_deposit`** + **`tb_withdraw_*`** | B-4 deposit/withdraw badges |
| `commissions` / `sales_payouts` → (TBD — check legacy `tb_commission*`) | B-4 sales-rep badges |
| `refund_requests` → (TBD — check legacy `tb_refund*` if exists) | B-4 refund badge |

**Pairing requirement (Agent A's call):** B-0 re-points the data reads · B-2
re-keys the status vocabularies (rebuilt-era enum strings → legacy integer
codes). They MUST land together — re-pointing reads without re-keying badge
maps will mis-label `hStatus=3` ("สั่งสินค้า") as a string the badge query
doesn't know about, so the recent-activity strip would render the wrong
Thai labels.

---

## 3. Secondary findings (Wave 2.1 — not blocking the B-0 swap)

### B-3 sub-gaps (Agent B)
- **Address selector** — edits the prefilled default address instead of letting customer SWITCH to a saved address from `tb_user_address`. Legacy has a saved-addresses picker.
- **Sticky pay bar** gated to single-row — no bulk pay (legacy lets you bulk-pay multiple `hStatus=2` orders).
- **`tb_shop` master missing** — `shop_name` is free-text instead of FK to `tb_shop`. Legacy has a curated shop list.
- **Status column type mismatch** — `hStatus tinyint(4)` in `tb_header_order` vs text-enum reads in Pacred actions (the B-2 reconcile fixes this).

### B-6 sticky-fixes (Agent D — ภูม can patch in 10 min)
1. **Sidebar entry on agent worktree, not `dave`** — commit `71f4737` (add `/admin/accounting/container-payments` to sidebar) only lives on the worktree branch, never merged to `dave`. Result: page reachable only by URL — no menu link. Fix: merge or re-commit on `dave`.
2. **`sidebar-counts.ts` L119** hard-codes `const cnt = 0` → legacy `cnt-hs ⑤` unpaid-badge never lights. The actual query is already inside `listPcsContainerPayments` L109-112 — one lift fixes it.

### B-4 stale comment (Agent C)
- `cntDrawMoney = 0` comment says "tb_cnt not yet ported" but B-6 shipped the ledger this wave. One-line cleanup.

---

## 4. Recommendation to เดฟ — concrete next-wave brief

**Send-back package:**

> เดฟ — Wave 1 fidelity audit done (`docs/research/wave-1-fidelity/`).
> Chrome verdict: **3/4 ship-as-is**, do not rebuild — layouts/IA/section
> headers are faithful. The 4th (`B-6` container payments) is the gold
> standard — fully `tb_*`-backed.
>
> **The single common blocker** — 3 of 4 slices (B-1 launchpad · B-3 order
> flow · B-4 admin badges) read the rebuilt-era schema where the 8,898
> migrated customers have zero rows. A migrated PCS customer logs in via
> B-auth ✅ and sees a beautiful empty UI.
>
> **Asks for Wave 2:**
>
> 1. **B-0 + B-2 bundled as one wave** (re-point + re-key together, per Agent A
>    — splitting them would break badge labels mid-wave). Concrete swap list
>    in `_SYNTHESIS.md` §2.
> 2. **Sequencing:** B-0+B-2 swap → re-verify each of B-1/B-3/B-4 vs the
>    migrated data → then Wave 3 attacks B-5 (ship→arrive→THEN-pay forwarder)
>    + B-7..B-9 with the data foundation already in place.
> 3. **Hold B-6** — don't touch, it's faithful. Just fix the 2 menu-plumbing
>    stickies (sidebar link + the hardcoded `cnt = 0` badge lift) — ภูม will
>    patch those himself.
> 4. **Secondary B-3 gaps** (address selector · bulk pay · `tb_shop` master ·
>    status column type) — schedule for Wave 2.1, not blocking.

**For ก๊อต — still hanging:** Q2 auth-bridge posture ratification (B-auth is
provisional). Ping when ready.

---

## 5. What ภูม does next (this session)

1. **Patch B-6 plumbing** (10-min fixes) — lift the `sidebar-counts.ts` L119 hardcode + the B-4 stale comment. Do NOT touch the B-1/B-3/B-4 data-source issues (that's เดฟ's B-0 wave).
2. **Push this synthesis + the 4 audits** so เดฟ sees them.
3. **LINE-ping เดฟ** with the §4 summary so the next wave starts informed.
4. Optional: smoke-test on `http://localhost:3000` — log in as a migrated PCS customer (B-auth) and visually confirm the empty-UI symptom on `/dashboard` + `/service-order` + `/admin/board` (validates the audit findings on real dev data).

---

## 7. Concrete Wave-2 swap diffs (Wave-2-ready — schemas verified)

ภูม-added 2026-05-19 post-audit: turn the spec into implementation-ready by mapping every Pacred `.from(<rebuilt>)` call in the 3 affected slices to the exact `tb_*` table + column + the key column quirks.  Schemas read from `supabase/migrations/0081_pcs_legacy_schema.sql`; tested in dev Supabase (8,898 rows).

### 7.1 The 7 `tb_*` tables Wave 2 needs (one-shot reference)

| `tb_*` table | What it holds | Join key | Status col + values | Key quirk |
|---|---|---|---|---|
| **`tb_users`** | Customer header (8,898 rows) | `userid varchar(10)` PK (e.g. `PR1234`) | `userstatus varchar(1)` · `'1'`=active `'0'`=disabled | `userpass` = legacy `passTam` hash (B-auth bridge consumes) · `useremail` NULL ~94% · phone in `usertel varchar(13)` |
| **`tb_wallet`** | Wallet balance (1 row per user) | `userid varchar(10)` | n/a | TWO columns: `userid` + `wallettotal numeric(10,2)`.  No history here. |
| **`tb_wallet_hs`** | Wallet movement history (deposits + withdrawals) | `userid` | `status varchar(1)` · `'1'`=รออนุมัติ `'2'`=อนุมัติแล้ว | `amount` + `date` + `dateslip` — single table for top-up + withdraw |
| **`tb_header_order`** | Order header (cargo/shop order) | `userid varchar(30)` · row PK = `hno varchar(30)` | `hstatus varchar(1)` · `'1'-'6'` per legacy enum (1=รอดำเนินการ · 2=รอชำระเงิน · 3=สั่งสินค้า · 4=รอร้านจีนจัดส่ง · 5=สำเร็จ · 6=ยกเลิก) | Totals in `htotalpriceuser` (customer-facing) + `htotalpricechn` (China cost) · payment date in `hdatepayment` |
| **`tb_cart`** | Per-customer cart line items | `userid varchar(30)` | n/a | `cnameshop` = shop name FREE TEXT (default `'pcs'`) — **no `tb_shop` master · the audit's "missing tb_shop" was a false flag — legacy treats shop as free text** |
| **`tb_order`** | Per-order line items (post cart→order conversion) | `hno varchar(30)` + `userid` | n/a | Mirror of `tb_cart` shape + `hno` FK · split per `cprovider` (1/2/3/4) |
| **`tb_forwarder`** | Forwarder (import) header | `userid varchar(30)` + `fidorco varchar(30)` | `fstatus varchar(2)` · `'1'-'7'` legacy enum (ship→arrive→THEN-pay) | Sub-states `fstatuscaron / fstatuscaroff varchar(1)` (truck load/unload) · `fcabinetnumber varchar(300)` ↔ `tb_cnt.cntname` (free-text container code · the `tb_cnt_item` link is the legacy way) |
| **`tb_payment`** | Yuan transfer payment | `userid varchar(10)` | `paystatus varchar(1)` · `'1'`=pending | `payyuan / payrate / paythb` triple · slip in `imagesslip varchar(250)` (filename) |

**Sales rep:** `tb_users.adminidsale varchar(20)` → join to `tb_admin.adminid` for display name.  No separate "sales_rep" table.

### 7.2 B-1 launchpad — concrete swap (5 calls)

`app/[locale]/(protected)/dashboard/page.tsx` + sub-components:

```diff
-- Wallet card
- admin.from("wallet").select("balance").eq("profile_id", profile.id)
+ admin.from("tb_wallet").select("wallettotal").eq("userid", profile.member_code)
  // (member_code = "PR<n>" — matches legacy tb_users.userid)

-- Recent cart (current-cart preview chip)
- admin.from("cart_items").select("id", { count: "exact", head: true })
-   .eq("profile_id", profile.id)
+ admin.from("tb_cart").select("id", { count: "exact", head: true })
+   .eq("userid", profile.member_code)

-- Recent orders (latest 3 hno for "ล่าสุด" strip)
- admin.from("service_orders").select("h_no, status, total_thb, created_at")
-   .eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(3)
+ admin.from("tb_header_order").select("hno, hstatus, htotalpriceuser, hdate")
+   .eq("userid", profile.member_code).order("hdate", { ascending: false }).limit(3)

-- Recent forwarders (latest 3 for cargo strip)
- admin.from("forwarders").select("f_no, status, total_thb, created_at")
-   .eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(3)
+ admin.from("tb_forwarder").select("fidorco, fstatus, fdate, fdatestatus5")
+   .eq("userid", profile.member_code).order("fdate", { ascending: false }).limit(3)

-- Sales rep card
- admin.from("admin_contact_extras").select("...").eq("profile_id", profile.sales_admin_id)
+ const userRow = await admin.from("tb_users").select("adminidsale").eq("userid", profile.member_code).single();
+ const repRow  = await admin.from("tb_admin").select("adminname, adminphone, adminpicture")
+                  .eq("adminid", userRow.data.adminidsale).single();
```

### 7.3 B-3 order flow — concrete swap (~6 calls)

`app/[locale]/(protected)/service-order/page.tsx` (list) + `actions/service-order.ts`:

```diff
-- List query (per-tab)
- admin.from("service_orders").select("...").eq("profile_id", profile.id)
-   .eq("status", "pending").order("created_at", { ascending: false })
+ admin.from("tb_header_order").select("hno, hstatus, htotalpriceuser, hcount, hdate")
+   .eq("userid", profile.member_code).eq("hstatus", "1")
+   .order("hdate", { ascending: false })
  // map status filter: "pending"→"1" · "awaiting_payment"→"2" · "ordered"→"3"
  // · "awaiting_china_ship"→"4" · "completed"→"5" · "cancelled"→"6"

-- Per-order detail (app/[locale]/(protected)/service-order/[hNo]/page.tsx)
- admin.from("service_orders").select("...").eq("h_no", hNo).single()
+ admin.from("tb_header_order").select("*").eq("hno", hNo).single()
- admin.from("service_order_items").select("...").eq("order_h_no", hNo)
+ admin.from("tb_order").select("*").eq("hno", hNo)

-- Cart (app/[locale]/(protected)/service-order/cart/*)
- admin.from("cart_items").select("...").eq("profile_id", profile.id)
+ admin.from("tb_cart").select("*").eq("userid", profile.member_code)
  // 151-cap still enforced on tb_cart (already at app + DB layer; verify the
  // DB trigger lives on tb_cart not cart_items)
```

### 7.4 B-4 admin sidebar+badges — concrete swap (the 14 hardcoded queries)

`actions/admin/sidebar-counts.ts` Promise.all fan-out:

```diff
- admin.from("wallet_transactions").select("id", { count:"exact", head:true })
-   .eq("kind", "deposit").eq("status", "pending")
+ admin.from("tb_wallet_hs").select("id", { count:"exact", head:true })
+   .eq("status", "1").gt("amount", 0)
  // walletTopup — tb_wallet_hs.status='1' = รออนุมัติ; deposit = amount > 0

- admin.from("wallet_transactions").select("id", { count:"exact", head:true })
-   .eq("kind", "withdraw").eq("status", "pending")
+ admin.from("tb_wallet_hs").select("id", { count:"exact", head:true })
+   .eq("status", "1").lt("amount", 0)
  // walletWithdraw — withdraw = amount < 0 (legacy stores negative)

- admin.from("service_orders").select("id", { count:"exact", head:true })
-   .eq("status", "pending")
+ admin.from("tb_header_order").select("id", { count:"exact", head:true })
+   .eq("hstatus", "1")
  // shopPending; legacy hstatus=1

- admin.from("service_orders").select("id", { count:"exact", head:true })
-   .eq("status", "awaiting_payment")
+ admin.from("tb_header_order").select("id", { count:"exact", head:true })
+   .eq("hstatus", "2")
  // shopAwaitPay

- admin.from("service_orders").select("id", { count:"exact", head:true })
-   .eq("status", "ordered")
+ admin.from("tb_header_order").select("id", { count:"exact", head:true })
+   .eq("hstatus", "3")
  // shopOrdered

- admin.from("forwarders").select("id", { count:"exact", head:true })
-   .eq("status", "arrived_thailand")
+ admin.from("tb_forwarder").select("id", { count:"exact", head:true })
+   .eq("fstatus", "4")
  // forwarderArrived — legacy fstatus=4 = ถึงไทยแล้ว

- admin.from("forwarders").select("id", { count:"exact", head:true })
-   .eq("status", "out_for_delivery")
+ admin.from("tb_forwarder").select("id", { count:"exact", head:true })
+   .eq("fstatus", "6")
  // forwarderDelivery + driverItems — legacy fstatus=6 = เตรียมส่ง

- admin.from("forwarders").select("id", { count:"exact", head:true })
-   .eq("status", "pending_payment").eq("credit_used", true)
+ admin.from("tb_forwarder").select("id", { count:"exact", head:true })
+   .eq("fstatus", "5").eq("paydeposit", "1")
  // forwarderCredit — fstatus=5 = รอชำระเงิน; credit-flag in paydeposit='1'

- admin.from("yuan_payments").select("id", { count:"exact", head:true })
-   .in("status", ["pending", "processing"])
+ admin.from("tb_payment").select("id", { count:"exact", head:true })
+   .in("paystatus", ["1", "2"])
  // yuanPending; '1'=pending '2'=processing (verify)

- admin.from("profiles").select("id", { count:"exact", head:true })
-   .eq("account_type", "juristic").eq("status", "incomplete")
+ admin.from("tb_users").select("id", { count:"exact", head:true })
+   .eq("usercompany", "1").eq("useractive", "0")
  // corporatePending — usercompany='1' = นิติบุคคล; useractive='0' = รอ approve

- admin.from("profiles").select("id", { count:"exact", head:true })
-   .eq("status", "incomplete")
+ admin.from("tb_users").select("id", { count:"exact", head:true })
+   .eq("useractive", "0")
  // customerPending

# sales_payouts + commissions + refund_requests + contact_messages stay as-is
# (those are Pacred-native tables — no legacy equivalent in tb_*).
# bookings + platform_incidents (BK-1 + IO-1) stay as-is (Phase C).
# cntUnpaid (just lifted) stays as-is (tb_cnt — already faithful per B-6).
```

### 7.5 Identity-bridge note (cross-cutting)

The join key in EVERY swap above is `userid` (legacy varchar(10) / varchar(30) — `'PR1234'` style).  Pacred-side, the join field is `profile.member_code` (added pre-D1 for the original 0067 PCS-customer migration — kept post-D1 per ADR-0017 §"Consequences").

**Two integrity asks for Wave 2:**
1. Confirm `profiles.member_code` is populated for every migrated row (B-auth bridge writes it on first login — verify the bulk-fill is current for the 8,898 ported customers; if not, a one-shot UPDATE before Wave 2 ships).
2. Add an index `profiles_member_code_idx` if not present (every customer-side query joins through it).

### 7.6 Status-vocab table for B-2 (the bundled re-key)

| Pacred enum string (rebuilt) | `tb_header_order.hstatus` | Thai label (legacy) |
|---|---|---|
| `pending` | `'1'` | รอดำเนินการ |
| `awaiting_payment` | `'2'` | รอชำระเงิน |
| `ordered` | `'3'` | สั่งสินค้า |
| `awaiting_china_ship` | `'4'` | รอร้านจีนจัดส่ง |
| `completed` | `'5'` | สำเร็จ |
| `cancelled` | `'6'` | ยกเลิก |

| Pacred enum string (rebuilt) | `tb_forwarder.fstatus` | Thai label (legacy) |
|---|---|---|
| `awaiting_china_warehouse` | `'1'` | รอสินค้าเข้าโกดังจีน |
| `at_china_warehouse` | `'2'` | สินค้าถึงโกดังจีน |
| `in_transit_to_thailand` | `'3'` | กำลังส่งมาไทย |
| `arrived_thailand` | `'4'` | ถึงไทยแล้ว |
| `pending_payment` | `'5'` | รอชำระเงิน |
| `out_for_delivery` | `'6'` | เตรียมส่ง |
| `delivered` | `'7'` | ส่งแล้ว |

→ Wave 2 (B-2 part) emits a `lib/legacy-status-map.ts` with `toLegacyOrderStatus(rebuilt)` / `fromLegacyOrderStatus(legacy)` + same for forwarder.  Every UI render through this map → labels render in Thai legacy strings regardless of which source the data came from during the rollout.

---

## 8. 🔴 EMPIRICAL FINDING — the gap is BIGGER than "data routing" (added post-synthesis · 2026-05-19)

Probed dev Supabase directly to validate the audit.  **The empty-UI problem
is worse than the per-slice audits suggested** — it's not only that Wave 1
reads rebuilt-era tables; it's that the **identity layer itself is missing**
for migrated customers.

### 8.1 The numbers (live dev Supabase, `pprrlabgebrnocthwdmg`)

| Table | Count | Note |
|---|---|---|
| `tb_users` (migrated PCS customers) | **8,898** | Phase A loaded ✅ |
| `profiles` rows where `member_code LIKE 'PR%'` | **6** | Only 0.067% have a matching profile · the other 8,892 customers have NO `profiles` row at all |

### 8.2 Spot-checked sample customers

| `tb_users.userid` | `tb_header_order` count | `tb_forwarder` count | `profiles` row? | Pacred-side data? |
|---|---|---|---|---|
| `PR2791` (รุจิรา · 098-365-6539) | 2 | 9 | **❌ NONE** | ❌ ghost |
| `PR169` (นันทพร · 065-952-9829) | 33 | **1,956** | **❌ NONE** | ❌ ghost |

PR169 is a real heavyweight (1,956 forwarders!) and yet — completely
invisible to Pacred today, because the join key `profiles.member_code = 'PR169'`
matches nothing.

### 8.3 Why this happens

The B-auth bridge (`lib/auth/pcs-legacy-bridge.ts` L145-155) creates an
`auth.users` row on first legacy login.  It does **NOT** create a `profiles`
row.  There is no `on auth.users INSERT → handle_new_user()` trigger in the
schema (grep confirmed: zero `handle_new_user` / `on_auth_user_created` refs).
Result:

```
First-login migrated customer
  ↓ types phone + legacy passTam password
  ↓ B-auth verifies + provisions auth.users   ✅
  ↓ session set, redirect to /dashboard
  ↓ /dashboard calls getCurrentUserWithProfile()
  ↓ returns { user, profile: null }            ⚠️
  ↓ protected layout / pages → either crash or redirect to /register/complete
  ↓ customer cannot use the app                🔴
```

The 6 `profiles` rows with `PR<n>` member codes are likely from the
**pre-D1 0067 PCS-customer-migration scaffold** that ภูม originally built
(now superseded per Q5).  The current B-auth bridge skipped wiring this
because the original Q2 answer assumed "just provision auth.users" — the
profile-row half wasn't called out.

### 8.4 Fix options (เดฟ + ก๊อต call)

| Option | What | Effort | Trade-off |
|---|---|---|---|
| **(a) Bulk pre-fill** (recommended) | One-shot SQL: `INSERT INTO profiles (member_code, first_name, last_name, phone, account_type, status, ...) SELECT userid, username, userlastname, usertel, CASE WHEN usercompany='1' THEN 'juristic' ELSE 'personal' END, 'active', ... FROM tb_users` — populate all 8,898 profiles up front · auth.users gets bound on first login as today | ~1h SQL + verify | All migrated customers visible immediately · profile.id ≠ auth.users.id until first login (the auth-user UUID gets stamped onto the existing profile row at first login via a small bridge extension) |
| **(b) Bridge-extend** | Extend `bridgeLegacyLogin()` to ALSO `INSERT INTO profiles (id, member_code, ...) VALUES (createdAuthUserId, row.userid, ...)` after `createUser` succeeds · profiles gets created lazily on first login | ~2h code + test | Profile row only appears when customer logs in — many migrated customers won't log in immediately, so cross-customer queries (admin "show all customers") still miss them |
| **(c) Auth trigger** | Add a Postgres trigger `on auth.users INSERT → create matching profile row` reading legacy_user_id from user_metadata | ~1.5h | Couples auth.users to public.profiles via trigger — Pacred convention so far has been Server-Action-managed (not trigger-managed) |

**Recommendation:** **(a) bulk pre-fill** because (i) it makes the 8,898
customers visible to admin tooling immediately (sales-rep transfers · audit
exports · the `B-4` admin sidebar customer count), (ii) it's the
faithful-port stance (legacy admins see all customers always), (iii) one
SQL migration is reviewable + idempotent.  Bind `auth.users.id ↔ profiles.id`
via a small bridge extension on first login (UPDATE the placeholder UUID).

### 8.5 Updated Wave-2 brief for เดฟ (supersedes §4 "Asks for Wave 2")

Wave 2 = **bundled 3-step migration + code swap, atomic**:

1. **`0088_pcs_profiles_backfill.sql`** — INSERT 8,898 profile rows from
   `tb_users` with legacy member_code, placeholder UUIDs, and a `legacy_pcs_pending = true` flag (drop the flag once auth-bound).
2. **`lib/auth/pcs-legacy-bridge.ts` extension** — on first legacy login,
   look up `profiles WHERE member_code = row.userid AND legacy_pcs_pending = true`, then `UPDATE profiles SET id = <auth.users.id>, legacy_pcs_pending = false WHERE id = <placeholder>`.
3. **The §7.2-7.4 swap diffs** apply as written — already implementation-ready in this synthesis.

After Wave 2, login → profile bound → all 14 admin badges + all customer
pages render the real legacy data.

### 8.6 Run the same probe yourself (reproducer)

```bash
# Pick any tb_users row
curl -s -H "apikey: <SERVICE_ROLE>" -H "Authorization: Bearer <SERVICE_ROLE>" \
  "https://pprrlabgebrnocthwdmg.supabase.co/rest/v1/tb_users?select=userid,username,usertel,useractive&userid=like.PR*&useractive=eq.1&limit=3"

# Check if profile exists for that PR<n>
curl -s -H "apikey: <SERVICE_ROLE>" -H "Authorization: Bearer <SERVICE_ROLE>" \
  "https://pprrlabgebrnocthwdmg.supabase.co/rest/v1/profiles?select=id,member_code&member_code=eq.PR2791"
# → returns [] for ~all 8,898 rows
```

---

## 6. Cross-references

- 🧭 D1 ADR → [`../../decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md)
- 🚀 Phase plan → [`../../UPGRADE_PLAN.md`](../../UPGRADE_PLAN.md)
- 🗺 Gap maps → [`../d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) · [`../d1-fidelity-admin.md`](../d1-fidelity-admin.md) · [`../d1-fidelity-customer.md`](../d1-fidelity-customer.md) · [`../d1-fidelity-workflow.md`](../d1-fidelity-workflow.md)
- 📝 ภูม save-point that started this → [`../poom-save-point-2026-05-19.md`](../poom-save-point-2026-05-19.md) §4 "Wave 1 — landed on dave"
- ❓ Open questions (Q2 pending ก๊อต) → [`../poom-d1-open-questions.md`](../poom-d1-open-questions.md)
- 📂 Per-slice audits → `audit-b1-launchpad.md` · `audit-b3-order-flow.md` · `audit-b4-admin-sidebar.md` · `audit-b6-container-payments.md`
