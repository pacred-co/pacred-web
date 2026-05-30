# ภูม prep spec — Yuan ops (P0-10/11/12) · 2026-05-31

Execution-ready spec for the 3 P0 gaps in the yuan-payment (ฝากโอน) admin flow.
Legacy SOT = `pcs-admin/payment.php` (1047 lines · the only `INSERT INTO tb_payment`
in the whole tree). All file:line citations are exact; column casing verified against
migration `0081` table DDL **and** live Pacred `tb_payment` code (lowercase columns —
`tb_payment` is NOT in the camelCase set; `tb_admin.adminID` IS camelCase).

> ⚠️ **Read this first — two of the three "gaps" are already fixed in the tree.**
> Honest re-audit from source (per AGENTS.md §0b) found: **P0-10 already fixed +
> unit-tested** (the live bulk path resolves the legacy admin id), and **P0-11
> already built** (the per-row approve/reject form + refund modal are mounted on
> `[id]/page.tsx`). What remains for P0-10/11 is **verification + 2 fidelity gaps**,
> not the original fix. **P0-12 is the only fully-open gap.** Details + evidence below.

| Gap | One-line status | Action for ภูม |
|---|---|---|
| **P0-10** UUID→`adminid` varchar(10) → 22001 | ✅ **Already fixed** (`tb-bulk.ts:316` resolves legacy id · tested `tb-bulk-yuan-uuid.test.ts`). The *dead twin* `yuan-payments.ts` still validates `z.string().uuid()` against the empty `yuan_payments` table — that's the contrast, not the live path. | Verify-only + delete/quarantine the dead twin's bulk fn |
| **P0-11** per-row approve/reject form | ✅ **Already built** (`actions-cell.tsx` → `adminUpdateYuanPayment`, mounted on `[id]/page.tsx:251`). | Close 2 fidelity gaps: (a) approve has no slip-required + no real cost-rate prompt; (b) labels say เริ่มโอน/โอนสำเร็จ but legacy is a single 1→2 approve |
| **P0-12** manual-create self-approves + no notify | 🔴 **OPEN** — `yuan-payments-tb.ts:201` inserts `paystatus:"2"` + zero notify. Legacy inserts pending (`'1'`/default) + fires customer LINE + staff `lineNotify`. | Real fix: flip to `'1'`, add customer `sendNotification` + `notifyStaffGroup` |

---

## Casing reference (verified — do not trust 0081 comments, trust the DDL + live code)

`tb_payment` DDL (migration `0081_pcs_legacy_schema.sql` L3611+), **all lowercase**:

| Column | Type | Notes |
|---|---|---|
| `paystatus` | `varchar(1)` DEFAULT `'1'` NOT NULL | `'1'`=pending · `'2'`=approved/completed · `'3'`=rejected/refunded |
| `paytype` | `varchar(1)` NOT NULL | `'1'`=จ่ายผ่านเว็บไซต์จีน · `'2'`=Alipay ร้านค้าจีน · `'3'`=อื่นๆ (legacy) |
| `userid` | `varchar(10)` NOT NULL | the customer `PR####` code |
| `adminid` | `varchar(10)` NOT NULL | ⚠️ **10 chars** — the P0-10 landmine |
| `adminidupdate` | `varchar(10)` NOT NULL | 10 chars |
| `payadminidcreator` | `varchar(10)` NOT NULL | 10 chars |
| `session` | `varchar(100)` NOT NULL | |
| `paydeposit`, `paydetail`, `payyuan`, `payrate`, `payratecost`, `paythb`, `paythbcost`, `payprofitthb`, `paydate`, `paydateadmin`, `imagesslip`, `certifiedtruecopy`, `imagesslipadmin` | (see 0081) | lowercase |

`tb_admin` IS camelCase: lookup column is **`adminID`** matched on **`adminEmail`**.
`tb_wallet` is lowercase: **`userid`**, **`wallettotal`**.
`tb_wallet_hs` is lowercase: `date`, `amount`, `status`, `type`, `userid`, `reforder`, `adminid` (varchar(20) here, NOT 10), …

> The `paytype` legacy values differ between the customer self-submit and the admin form
> vs the Pacred `PAYTYPE_LABEL` map (`[id]/page.tsx:41` says 1=Alipay/2=Wechat/3=Union/4=USDT).
> The **legacy `payment.php` add form** (L406-411) uses 1=เว็บไซต์จีน / 2=Alipay / 3=อื่นๆ.
> This is an existing divergence in the Pacred code, **out of scope** for these 3 gaps —
> flag to owner (see Open Questions), do not "fix" it inside this work.

---

## P0-10 — Yuan bulk-approve UUID → `tb_payment.adminid` (varchar(10)) → Postgres 22001

### 1. Legacy behaviour
`payment.php` has **no bulk-approve** — approval is per-row in the `update` mode
(`payment.php:607-692`). The single-row approve UPDATE (`payment.php:644`):

```sql
UPDATE `tb_payment` SET payProfitTHB='$payProfitTHB', payTHBCost='$payTHBCost',
  payRateCost='$payRateCost', `payStatus`='$payStatus', payDateAdmin=NOW(),
  adminID='$adminID', adminIDUpdate='$adminID' WHERE ID='$ID';
```

`$adminID` is the **session admin slug** — set in `include/header.php:6,15` from the
`pcs_admin_adminID` cookie and re-read out of `tb_admin.adminID` (a short ascii
nickname, e.g. `koy`, `fah`, `admin_nat` — always ≤ 10 chars by construction).
**Legacy never writes a 36-char value into `adminID`.** The Pacred bulk path is a
Pacred-added convenience (no legacy equivalent), so "faithful" here = "writes a
≤10-char legacy admin slug, like the single-row path does".

### 2. Current Pacred state — **already fixed** (verify-only)
The page (`/admin/yuan-payments/page.tsx:29`) wires `TbYuanBulkBar` (`tb-bulk-bar.tsx:16`)
→ **`adminBulkApproveYuanPaymentsTb`** in `actions/admin/tb-bulk.ts`. That function
**already resolves the legacy admin id** before the UPDATE:

- `actions/admin/tb-bulk.ts:316` — `const legacyAdminId = await resolveLegacyAdminId();`
- `actions/admin/tb-bulk.ts:333` — `.update({ paystatus: "2", adminid: legacyAdminId, paydateadmin: nowIso })`
- `resolveLegacyAdminId()` defined `tb-bulk.ts:38-61` — reads `tb_admin.adminID` by
  `adminEmail`, falls back to `email.split("@")[0].slice(0, 20)`.
- Regression test already exists: `actions/admin/tb-bulk-yuan-uuid.test.ts` (L113 = buggy
  UUID variant; L118 = fixed legacy-id variant).
- The fix is documented inline at `tb-bulk.ts:309-316` ("2026-05-30 P0-10 fix").

So the live bulk-approve does **NOT** hard-error today. The master-audit framing
("the yuan path skips resolveLegacyAdminId") was true at audit time but has since
been fixed.

**The contrast / dead twin** (the master audit's `~L318`): `actions/admin/yuan-payments.ts`
contains a SECOND bulk fn `adminBulkApproveYuanPayments` (L295) whose Zod schema is
`ids: z.array(z.string().uuid())` (L288) and which UPDATEs the **rebuilt empty
`yuan_payments` table** (L308, `.from("yuan_payments")`) writing `admin_id_update: adminId`
(the raw UUID, L327). This one is **not reachable from the live yuan-payments page**
(the page imports the `*Tb` variant). It's the dead-write twin — it neither errors
(it's never called from the live UI) nor works (the table is empty on prod).

### 3. The fix — verification + quarantine (no money-path code change needed)
1. **Verify** the live path on prod: tick ≥2 pending rows on `/admin/yuan-payments`
   (the "รอดำเนินการ" tab) → click the bulk-approve button → confirm rows flip to
   `paystatus='2'` AND `tb_payment.adminid` shows the short slug (NOT a UUID), no 22001.
2. **Confirm the slip-side fidelity question first** (see P0-11 #3 below): legacy approval
   requires a slip + a real cost-rate. The bulk path skips both. Decide with owner whether
   bulk-approve-without-slip is acceptable for ops (legacy had no bulk path at all, so this
   is a Pacred policy call, not a fidelity bug).
3. **Quarantine the dead twin** to prevent a future "imported the wrong action" footgun
   (the exact Potemkin pattern in the master audit): in `actions/admin/yuan-payments.ts`,
   the `adminBulkApproveYuanPayments` fn (L287-366) + the rebuilt `adminSetYuanSlipTransferredAt`
   (L737-783, writes `yuan_payments`) are dead. Either delete them or add a top-of-fn
   `throw new Error("dead: yuan_payments rebuilt table is empty on prod — use *Tb variant")`.
   ⚠️ **Do NOT delete** `adminUpdateYuanPayment` / `adminMarkYuanPaymentRefunded` /
   `uploadYuanRefundSlip` / `adminGetYuanPaymentSlipSignedUrl` from that same file —
   those were re-pointed to `tb_payment` and ARE live (mounted via P0-11).

`resolveLegacyAdminId()` pattern (reference — already present at `tb-bulk.ts:38`):
```ts
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin").select("adminID")        // tb_admin = camelCase
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (data?.adminID) return data.adminID;
  return email.split("@")[0].slice(0, 10);     // ⚠️ tb_payment.adminid = varchar(10), so slice 10 (NOT 20)
}
```
> ⚠️ **Width nuance:** `tb-bulk.ts:60` slices the fallback to **20** (a copy-paste from the
> `tb_wallet_hs.adminid` varchar(20) context). For `tb_payment.adminid` the column is
> **varchar(10)** — a fallback email local-part longer than 10 chars would re-introduce
> 22001. Low-risk (the `tb_admin.adminID` happy-path returns a ≤10 slug), but for
> correctness change the fallback slice in `tb-bulk.ts:60` to `.slice(0, 10)`, OR call
> the shared `safeLegacyAdminId(raw, 10)` from `lib/auth/safe-legacy-admin-id.ts`.
> This is the only actual code change P0-10 still warrants, and it's a hardening, not the
> original hard-error.

### 4. Test assertions (`tsx`, no jest — pattern = `tb-bulk-yuan-uuid.test.ts`)
- `adminid` written by the bulk path is **≤ 10 chars** and equals the `tb_admin.adminID`
  slug, never a 36-char UUID (regression already covers the shape; extend it to assert
  `result.adminid.length <= 10`).
- After bulk-approve of 2 pending ids: both `tb_payment.paystatus === "2"`, `paydateadmin`
  set, `adminid` = slug. (Live DB test needs `--env-file=.env.local`.)
- Negative: the dead twin `adminBulkApproveYuanPayments` either throws or, if kept,
  a test asserts it's not imported by any file under `app/[locale]/(admin)/admin/yuan-payments/`.

### 5. Reachability (AGENTS.md §0d)
Sidebar → **ฝากโอนหยวน** (`/admin/yuan-payments`) → "รอดำเนินการ" tab → tick row checkboxes
→ bulk-approve bar appears (`TbYuanBulkBar`) → click approve. ✅ reachable (≤3 clicks).

---

## P0-11 — Yuan per-row approve/reject form

### 1. Legacy behaviour
Per-row approve/reject lives in `payment.php` **update mode** (`?page=update&id=N`,
`payment.php:607-982`). The detail page (`payment.php:761-918`) renders, for a
`payStatus='1'` row (`payment.php:853-897`), a `<form method=POST enctype=multipart/form-data>`:

- **Required slip upload** — `<input type="file" name="imagesSlip" ... required>` (`payment.php:859`)
- **Real cost-rate input** — `name="payRateCost"`, prefilled from `tb_settings.hRateCostDefault`
  (`payment.php:863-877`) — the อัตราต้นทุนจริง used to compute profit.
- **Status select** — `name="payStatus"` with options `''`(รอดำเนินการ) / `2`(สำเร็จ) /
  `3`(ไม่สำเร็จ) (`payment.php:882-890`).
- **Confirm dialog** — `onsubmit="return confirm('คุณแน่ใจเหรอ? รายการนี้ไม่สามารถแก้ไขได้อีกภายหลัง!!')"`
  (`payment.php:854`).

**On `payStatus='2'` (approve)** — `payment.php:638-657`, guarded by a re-read that the
row is still `payStatus='1'` (`payment.php:640`):
```sql
UPDATE `tb_payment` SET payProfitTHB='$payProfitTHB', payTHBCost='$payTHBCost',
  payRateCost='$payRateCost', `payStatus`='2', payDateAdmin=NOW(),
  adminID='$adminID', adminIDUpdate='$adminID' WHERE ID='$ID';
```
Where `payTHBCost = payYuan × payRateCost` and `payProfitTHB = payTHB − payTHBCost`
(`payment.php:624-625`). Then `saveHistory($sql,22)` (`payment.php:650`) and a customer
LINE notify (`payment.php:651-655`): *"รายการฝากโอน/ชำระ เลขที่#N · สถานะ : สำเร็จ"*.
**No wallet movement on approve** — the wallet was already debited at create time
(`payment.php:51-52` for admin-add, or the customer self-submit debit).

**On `payStatus='3'` (reject)** — `payment.php:658-689`:
```sql
UPDATE `tb_payment` SET ... `payStatus`='3', payDateAdmin=NOW(),
  adminID='$adminID', adminIDUpdate='$adminID' WHERE ID='$ID';
```
Then **auto-refund the wallet** (`payment.php:665-682`):
```sql
INSERT INTO `tb_wallet_hs` (date, amount, status, userID, type, adminIDUpdate, refOrder)
  VALUES (NOW(), '$wDepositAmount', '2', '$userID', '5', '$adminID', '$ID');
UPDATE `tb_wallet` SET `walletTotal`='$walletTotal' WHERE userID='$userID';  -- += payTHB
```
(`type='5'` = refund · `status='2'`). Plus a customer LINE notify *"สถานะ : ไม่สำเร็จ"*
(`payment.php:684-688`).

> Legacy has only a **2-way** terminal flip from pending: `1→2` (approve) or `1→3`
> (reject+refund). There is **no "processing"** intermediate state in legacy.

### 2. Current Pacred state — **already built** (close fidelity gaps)
The detail page is **no longer read-only**. `[id]/page.tsx:251` mounts
`<YuanPaymentActions>` (`actions-cell.tsx`), which calls the **live, tb_payment-backed**
`adminUpdateYuanPayment` (`actions/admin/yuan-payments.ts:73`) — that action correctly:
- maps the legacy char paystatus ↔ Pacred 5-state via `lib/legacy-paystatus-map.ts`,
- enforces a transition allow-list (`isYuanTransitionAllowed`) that blocks
  refunded→completed etc. (`yuan-payments.ts:126`),
- stamps `paydateadmin` + `adminid`/`adminidupdate` with the resolved legacy slug
  (`yuan-payments.ts:138-139`),
- on `refunded` (paid-via-wallet) writes the `tb_wallet_hs` type='5' refund + bumps
  `tb_wallet.wallettotal` (`yuan-payments.ts:166-237`) — faithful to `payment.php:665-682`,
- fires the customer `sendNotification` (`yuan-payments.ts:248-266`).

The refund-with-slip path (`refund-modal.tsx` → `uploadYuanRefundSlip` +
`adminMarkYuanPaymentRefunded`) is also built + mounted.

**So the "form is not built" framing is stale.** What remains are **2 fidelity gaps**:

- **Gap 11a — approve has no slip + no cost-rate prompt.** `actions-cell.tsx:29-36`
  fires a **bare** `adminUpdateYuanPayment({ id, status })` with no `cost_rate` and no
  slip. Legacy approve (`payment.php:853-897`) **requires** `imagesSlip` + a real
  `payRateCost`, and uses that cost-rate to compute `payTHBCost`/`payProfitTHB` (margin
  reporting). The Pacred action *accepts* `cost_rate`/`cost_thb`/`profit_thb` optionally
  (`yuan-payments.ts:60-62`) but the UI never sends them → approved rows land with the
  create-time `payratecost` (often = sell-rate) and `payprofitthb` left as set at create
  (frequently 0) → **profit reports under-count**.
- **Gap 11b — label/flow mismatch.** `actions-cell.tsx:44-55` exposes
  เริ่มโอน(`processing`) → โอนสำเร็จ(`completed`) → ล้มเหลว(`failed`). Legacy is a
  single approve(`1→2`) or reject(`1→3`). `processing` has **no DB representation**
  (`legacy-paystatus-map.ts:91-99` returns `null` → the action no-ops the paystatus
  column for `processing`, only fires a notify). This is a Pacred superset, not a bug,
  **but** an admin who clicks "เริ่มโอน" then never clicks "โอนสำเร็จ" leaves the row
  at `paystatus='1'` forever (looks pending in reports). Decide with owner whether to
  keep the 3-step Pacred flow or collapse to legacy's 2-button approve/reject.

### 3. The fix
**File:** `app/[locale]/(admin)/admin/yuan-payments/actions-cell.tsx` (the client island) +
optionally a small wrapper around `adminUpdateYuanPayment`.

**For Gap 11a (the load-bearing one — money/margin correctness):**
1. On the `completed` (= legacy approve) transition, require an admin slip upload +
   a `cost_rate` input, mirroring `payment.php:859` + `payment.php:863-877`. Reuse the
   existing upload plumbing: `tb_payment.imagesslipadmin` is the admin-slip column
   (the create-side already uses it via `uploadToBucket(..., "slips", "admin/yuan-payment/...")`
   in `yuan-payments-tb.ts:189-193`; the refund modal uses `uploadYuanRefundSlip` →
   `imagesslipadmin`). Simplest: add a `cost_rate` number field + a file input to the
   approve action and pass `{ id, status: "completed", cost_rate, cost_thb, profit_thb }`
   to `adminUpdateYuanPayment` (it already writes `payratecost`/`paythbcost`/`payprofitthb`
   at `yuan-payments.ts:143-145`). Compute in the client (or a tiny server wrapper):
   `cost_thb = payyuan × cost_rate`, `profit_thb = paythb − cost_thb` — exactly
   `payment.php:624-625`.
2. Prefill `cost_rate` from `tb_settings.hRateCostDefault` (legacy default, `payment.php:865`).
   ⚠️ **Verify** the live column name on `tb_settings` before reading it — see Open Questions.

**For Gap 11b (policy):** if owner wants legacy fidelity, change the `pending` branch
buttons (`actions-cell.tsx:44-48`) to **อนุมัติ**(`completed`) + **ปฏิเสธ**(`failed`/`refunded`)
and drop the `processing` intermediate. If owner keeps the richer flow, leave as-is and
just add the slip/cost-rate to the terminal `completed` step.

**Do NOT** touch the refund branch — it's faithful already (`yuan-payments.ts:166-237`).

### 4. Test assertions (`tsx`)
- Approve (`completed`) with `cost_rate=R`: assert `tb_payment.paystatus==='2'`,
  `payratecost===R`, `paythbcost === round(payyuan*R,2)`, `payprofitthb === round(paythb-paythbcost,2)`,
  `paydateadmin` set, `adminid` = ≤10-char slug. **No** `tb_wallet` delta on approve
  (wallet was debited at create).
- Reject/refund (`refunded`, paid_via_wallet=true): assert a `tb_wallet_hs` row with
  `type='5'`, `status='2'`, `amount===paythb`, `reforder===String(id)`; and
  `tb_wallet.wallettotal` increased by `paythb`; idempotent (re-run does not double-credit
  — guarded by the existing refund-row probe `yuan-payments.ts:104-115`).
- Transition guard: `adminUpdateYuanPayment({id, status:"completed"})` on an already
  `refunded` row returns `{ok:false}` (allow-list `legacy-paystatus-map.ts:48-54`).

### 5. Reachability (AGENTS.md §0d)
Sidebar → **ฝากโอนหยวน** → click a row's "ดู/แก้ไข" → `/admin/yuan-payments/[id]` →
"การดำเนินการ" card → approve/reject/refund buttons. ✅ reachable (≤3 clicks). Already wired.

---

## P0-12 — Yuan manual-create self-approves (`paystatus='2'`) + no notify  🔴 OPEN

### 1. Legacy behaviour
Admin manual-create lives in `payment.php` **add mode** (`?page=add`, `payment.php:4-95`).
The INSERT (`payment.php:34-47`):
```sql
INSERT INTO `tb_payment` (`payDate`, `payType`, `payDetail`, `payYuan`, `payRate`,
  `payTHB`, `userID`)
VALUES (NOW(), '$payType', '$payDetail', '$payYuan', '$payRate', '$payTHB', '$userID');
```
**Critical fidelity facts:**
- The INSERT lists **only 7 columns** and **does NOT set `payStatus`** → it lands on the
  schema default **`'1'` (pending)** (`0081` DDL: `paystatus ... DEFAULT '1'`). So a legacy
  admin-created yuan payment is **pending**, awaiting a *second* admin to approve it in
  update-mode (segregation of duties: creator ≠ approver). `payDateAdmin`, `adminID`,
  `adminIDUpdate`, `payAdminIDCreator` are **not set on create** — they get stamped only
  at approval (`payment.php:644`).
- Wallet IS debited on create (`payment.php:51-52`): `walletTotal -= payTHB`, after a
  pre-check that `walletTotal > 0` (L17) and `payTHB <= walletTotal` (L33). Refuse path =
  "eWallet" alert.
- A `tb_wallet_hs` debit row is written (`payment.php:67-68`):
  `INSERT tb_wallet_hs(date, amount=payTHB, status='1', type='6', userID, refOrder=newID)`
  — note legacy uses **`status='1'`** here (pending), `type='6'` (ฝากชำระ).
- **2 notifications fire on create:**
  - **(a) Staff LINE** (`payment.php:64-65`): `lineNotify("มีรายการฝากชำระสินค้าใหม่ #N
    จากคุณ PRxxxx · URL: …/payment/update/N/")` — the ops-group ping so a 2nd admin
    verifies promptly.
  - **(b) Customer LINE** (`payment.php:81-85`, only if `userLineNotify != ''`):
    *"มีรายการฝากโอน/ชำระใหม่จากแอดมิน · เลขที่ #N · สถานะ : รอดำเนินการ"*.

### 2. Current Pacred state
`actions/admin/yuan-payments-tb.ts` → `adminCreateYuanPaymentManual` (L125). It correctly
ports the wallet pre-check + debit + `tb_wallet_hs` write (the Tier A1 fix), BUT:
- **L201** — inserts `paystatus: "2"` (approved) with a comment *"admin-initiated means
  admin has already confirmed"* (`yuan-payments-tb.ts:24-26, 201`). This is a
  **segregation-of-duties bypass** — the creator self-approves; legacy required a 2nd
  admin. It also means profit fields are finalized at create from a default cost-rate
  (`payratecost = payrate` if not supplied, L155) → margin reporting wrong.
- **No notify at all** — there is no `sendNotification` (customer) and no
  `notifyStaffGroup` (ops) anywhere in the function. Legacy fires both.
- (Minor) `tb_wallet_hs.status` is written as `"2"` (L243) vs legacy `'1'`; the file
  documents this normalization (`yuan-payments-tb.ts:55-59`). Leave as-is unless owner
  wants strict legacy parity — it's a Pacred convention already applied consistently to
  admin-verified entries (`wallet-hs.ts:202`).

The UI form (`app/[locale]/(admin)/admin/yuan-payments/new/form.tsx:119`) calls this action.

### 3. The fix
**File:** `actions/admin/yuan-payments-tb.ts` (function `adminCreateYuanPaymentManual`).

1. **Flip to pending.** Change L201 `paystatus: "2"` → **`paystatus: "1"`** (matches legacy
   default + the customer self-submit path `payment.ts:364`). Update the docblock
   (`yuan-payments-tb.ts:24-26`) to drop the self-approve rationale.
   - Consequence: the row now shows in the "รอดำเนินการ" tab and is approved later via the
     P0-11 detail-page form (by any admin, ideally a different one). This restores the
     2-step verify.
   - Keep `payadminidcreator: legacyAdminId` (L214) — that's the *creator* stamp (legacy's
     `payAdminIDCreator`), correct to set on create. But **clear** `adminid`/`adminidupdate`
     to `""` on create (L212-213) so they're only stamped at *approval* (faithful to legacy,
     and consistent with `payment.ts:374-375` for the customer path). The approve action
     (`adminUpdateYuanPayment`) will set them.
   - Re-check `tb_wallet_hs.status`: legacy create writes `'1'` (pending) (`payment.php:68`).
     If you flip the payment to pending, consider writing the hs row `status:"1"` too for
     internal consistency, OR leave `"2"` per the existing Pacred normalization — **owner
     call** (the wallet was really debited, so `'2'` is defensible). Note this either way.

2. **Add the 2 notifications** (mirror `payment.ts:426-444`, the canonical create path):
   - **Customer notify** — resolve the legacy `userid` → profile uuid via
     `resolveProfileIdForLegacyUserid` (already imported in `yuan-payments.ts`; import it
     into `yuan-payments-tb.ts` from `@/lib/auth/tb-users-resolver`) then:
     ```ts
     const profileId = await resolveProfileIdForLegacyUserid(customer.userID);
     if (profileId) {
       void sendNotification(profileId, {
         category: "yuan_payment",
         severity: "info",
         title:    "ฝากโอนหยวน — รอดำเนินการ",
         body:     `¥${d.payyuan.toFixed(2)} = ฿${paythb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (สร้างโดยแอดมิน)`,
         link_href: "/service-payment",
         reference_type: "yuan_payment",
         reference_id:   String(row.id),
       });
     }
     ```
     (`sendNotification` from `@/lib/notifications` — already env-gated by `LINE_PUSH_BYPASS`
     / `NOTIFY_BYPASS`, see `lib/notifications/index.ts:38-40`; dev-safe, never spams.)
   - **Staff-group notify** — `notifyStaffGroup` from `@/lib/notifications/staff-group`
     (the Pacred replacement for the **dead** LINE Notify API — legacy `lineNotify()` POSTed
     to `notify-api.line.me` which reached EOL Apr 2025; the new transport is LINE OA push
     to a group). Mirror `payment.ts:439-444`:
     ```ts
     void notifyStaffGroup(
       `📩 มีรายการฝากโอน/ฝากชำระใหม่ (แอดมินสร้าง) #${row.id}\n` +
       `จากลูกค้า: ${customer.userID}\n` +
       `ยอด: ¥${d.payyuan.toFixed(2)} = ฿${paythb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n` +
       `สถานะ: รอดำเนินการ`,
     );
     ```
     ⚠️ **This is a no-op until `LINE_STAFF_GROUP_ID` is set** (owner one-time setup — see
     `lib/notifications/staff-group.ts:30-38`). Wire it anyway (pluggable; activates with
     zero further code change). Both calls are `void`-ed (best-effort; must NOT fail the
     create — a failed staff ping can't roll back a debited wallet).

3. Place both notify calls **after** the wallet debit succeeds and **before** the final
   `return { ok: true, ... }` (`yuan-payments-tb.ts:318`) — i.e. after the `logAdminAction`
   at L299-311.

> The wallet pre-check + debit + `tb_wallet_hs` + partial-failure rollback (`yuan-payments-tb.ts:161-297`)
> are **already faithful** — do not touch them. The only changes are the paystatus flip,
> the create-time admin-id stamping, and the 2 notify calls.

### 4. Test assertions (`tsx` — pattern = `actions/admin/yuan-payments-tb.test.ts`)
- After `adminCreateYuanPaymentManual({...})`: `tb_payment.paystatus === "1"` (pending,
  NOT "2"), `payadminidcreator` = creator slug (≤10 chars), `adminid === ""` and
  `adminidupdate === ""` (unset until approval), `paydate` set.
- Wallet debit still happens: `tb_wallet.wallettotal` decreased by `paythb`; a `tb_wallet_hs`
  row exists with `type='6'`, `reforder===String(id)`, `amount===paythb`.
- Insufficient balance still refuses (`error` starts with `insufficient_balance`) and writes
  **nothing** (no `tb_payment`, no `tb_wallet_hs`, no wallet change).
- Notifications: assert `sendNotification` + `notifyStaffGroup` are invoked (mock/spy them;
  the existing test file stubs the supabase client — extend it to stub these two). In a
  pure-logic test, assert the function calls them with `reference_id === String(id)` and a
  "รอดำเนินการ" body. (Both are `void`-ed best-effort, so a throw inside them must not fail
  the action — add a test that a throwing `notifyStaffGroup` still returns `{ok:true}`.)

### 5. Reachability (AGENTS.md §0d)
Sidebar → **ฝากโอนหยวน** → "เพิ่มรายการ" / "สร้างฝากโอน" button → `/admin/yuan-payments/new`
→ fill form → submit (`new/form.tsx:119` → `adminCreateYuanPaymentManual`). ✅ reachable
(≤3 clicks). After the fix, the created row appears in the "รอดำเนินการ" tab for a 2nd
admin to approve via the P0-11 detail form — verify that round-trip end-to-end.

---

## Open questions for owner / ภูม (could not resolve from source)

1. **Staff-notify LINE group target** — `LINE_STAFF_GROUP_ID` is **not set** anywhere
   (env-gated no-op, `lib/notifications/staff-group.ts:52-64`). The P0-12 staff ping (and
   the already-wired customer-create staff ping in `payment.ts:439`) stay silent until the
   owner adds the @pacred bot to the ops LINE group and reads the `groupId` from the join
   webhook. **Owner action, not code.** Ship the wired no-op now.
2. **`tb_settings` cost-rate column name** — legacy reads `hRateCostDefault` for the approve
   prefill (`payment.php:865`) and `rpDefault` for the create-form rate prefill
   (`payment.php:129, 423`). I did **not** verify these column names exist with that casing
   on the live `tb_settings` table (out of read scope — only `tb_payment`/`tb_admin`/wallet
   were in the brief). ⚠️ **Verify against prod before reading them** in the P0-11 cost-rate
   prefill — if absent or differently-cased, the approve form must fall back to a manual
   entry (no silent ฿0/NaN cost-rate).
3. **P0-11 flow policy (Gap 11b)** — keep the Pacred 3-step (pending→processing→completed)
   or collapse to legacy's 2-button approve/reject? Legacy has no `processing`. Pacred's
   `processing` writes no DB column (notify-only) and risks rows stranded at pending if an
   admin clicks "เริ่มโอน" but never "โอนสำเร็จ". **Owner UX call.**
4. **Approve-without-slip on bulk path (P0-10)** — legacy per-row approve **requires** a
   slip + cost-rate; the Pacred bulk-approve bar flips `1→2` with neither. Legacy had no
   bulk approve, so this is a new Pacred affordance. Is slip-less bulk approve acceptable
   for ops, or should bulk-approve be removed in favour of the per-row form? **Owner call.**
5. **`tb_wallet_hs.status` on admin-create** — legacy writes `'1'` (pending) on the create
   debit row (`payment.php:68`); Pacred normalizes admin entries to `'2'`
   (`yuan-payments-tb.ts:243`). If P0-12 flips the payment back to pending, should the hs
   row also be `'1'` for consistency, or stay `'2'` (the money really moved)? **Owner call**
   — low-risk either way; flag don't guess.
6. **`paytype` value taxonomy mismatch** — legacy add-form uses 1=เว็บไซต์จีน/2=Alipay/3=อื่นๆ
   (`payment.php:406-411`); Pacred `PAYTYPE_LABEL` says 1=Alipay/2=Wechat/3=Union/4=USDT
   (`[id]/page.tsx:41`); the manual-create schema allows `["1","2","3","4"]`
   (`yuan-payments-tb.ts:107`). Pre-existing divergence, **out of scope** for these 3 gaps —
   surface for a separate fidelity pass, do not change here.
