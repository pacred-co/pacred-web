# Learnings — Pacred order taxonomy (ฝากสั่งซื้อ ↔ ฝากนำเข้า ↔ ฝากโอน)

> Briefing for any new dev / agent confused by *"ทำไมหน้าฝากนำเข้า มีออเดอร์ของฝากสั่ง ไรมาด้วย"* — and the related questions that fall out of it.
>
> The 3 services SHARE customers + a wallet, but they live in 3 different tables and have 3 different lifecycle owners. The confusion comes from the **shop → forwarder auto-spawn**: when a ฝากสั่งซื้อ goods get shipped, legacy code creates a row in `tb_forwarder` referencing the original `tb_header_order` row — so the same physical job shows up in BOTH admin lists with different lenses.
>
> Read once. Stop re-investigating. (Last updated: 2026-05-25, Wave 19.)

---

## 1. The 3 services + their tables

| Service | Thai | What it does | Main table(s) | Code prefix | Admin URL | Customer URL |
|---|---|---|---|---|---|---|
| **ฝากสั่งซื้อ** (shop-order) | Customer fills a cart from a China shop site, Pacred buys it on their behalf, ships it. | Cart + checkout + buy-on-behalf | `tb_shop` (line items) + `tb_header_order` (cart header) | `P<int>` (header) | `/admin/service-orders` | `/service-order` |
| **ฝากนำเข้า** (forwarder-import) | Customer (or admin) declares "this parcel/shipment is mine — receive it at our China warehouse and ship to TH". | Cargo intake + ship + deliver | `tb_forwarder` (one row per shipment) | `F<int>` (id) | `/admin/forwarders` | `/service-import` |
| **ฝากโอน / ฝากชำระ** (yuan-transfer) | Customer asks Pacred to wire CNY to a Chinese supplier (or pay an Alipay invoice) on their behalf. | Outbound payment service | `tb_payment` | `T<int>` | `/admin/yuan-payments` | `/service-payment` |

Three things to internalise:

1. **They share `tb_users`** — one customer (`PR0xxxx`) uses all 3 services.
2. **They share `tb_wallet` + `tb_wallet_hs`** — every spend is a wallet event regardless of service.
3. **One service can spawn another.** That's §2 below — the "why is it on the forwarder page" answer.

---

## 2. The link: when ฝากสั่งซื้อ spawns ฝากนำเข้า

This is the source of *"ทำไมหน้าฝากนำเข้า มีออเดอร์ของฝากสั่ง ไรมาด้วย"*.

**Lifecycle (legacy chronology):**

```
 (1) customer cart-checkout  → tb_header_order row created (hNo=Pxxxxx, hStatus=1)
 (2) admin reviews cart      → admin sets price, hStatus advances
 (3) customer pays           → tb_header_order.hStatus=4 (ผูกจ่ายเงินแล้ว)
 (4) admin orders from China → physical procurement (no DB change)
 (5) shop emails admin the   → admin opens /admin/shops/update/<hNo>/
     shipping number + the    types each cTrackingNumber inline
     tracking #               (legacy update4.php L88-116 form)
 (6) admin clicks "บันทึก     → shops.php L1584 POST handler runs
     และสร้างรายการ            INSERT INTO tb_forwarder (...,
     ฝากนำเข้า"                 adminIDCreator='<staffID>', refOrder='Pxxxxx')
                                One forwarder row PER cTrackingNumber.
 (7) downstream forwarder    → notify customer LINE + email
     lifecycle starts        → forwarder advances through fStatus 1..7
                                independently of the shop-order
```

**Trigger code:** `pcs-admin/shops.php` L1584 (the POST handler) — fires when admin submits the per-tracking inline form on `/admin/shops/update/<hNo>/` (the L88-116 `<form>` in `pcs-admin/include/pages/shops/update/update4.php`, named `arrSaveTarcking`).

**The SQL** (legacy `shops.php` L1677-1683 verbatim):

```php
$sql = "INSERT INTO `tb_forwarder` (`fFreeShipping`,`fTrackingCHN`, `fDetail`, `fDate`, `userID`, `fShipBy`, fCover,
                                    `fPriceUpdate`, `fTransportType`, `adminIDCreator`, `fAddressName`, `fAddressLastname`, `fAddressNo`,
                                    `fAddressSubDistrict`, `fAddressDistrict`, `fAddressProvince`, `fAddressZIPCode`, `fAddressNote`,
                                    `fAddressTel`, `fAddressTel2`, `refOrder`, fShippingService)
       VALUES ('$fFreeShipping','$fTrackingCHN','$fDetail','$datetime_now','$userID','$fShipBy','$cImages','$fPriceUpdate',
               '$fTransportType','$adminID','$fAddressName','$fAddressLastname','$fAddressNo','$fAddressSubDistrict',
               '$fAddressDistrict','$fAddressProvince','$fAddressZIPCode','$fAddressNote','$fAddressTel','$fAddressTel2','$hNo','$fShippingService');";
```

The two load-bearing fields are written together:
- `adminIDCreator = $adminID` — the staff who clicked the button (cookie `pcs_admin_adminID`)
- `refOrder = $hNo` — the originating cart header (`P00001`-style)

**What this means downstream:**
- A row in `tb_forwarder` with `refOrder != ''` ALWAYS originated from a shop order.
- The shipping address, the cover image, and the price-update delta are copied FROM the shop header.
- The customer + LINE notification ("รายการอัตโนมัติจากออเดอร์ฝากสั่งซื้อ #P00001") fires from `shops.php` L1715, NOT from `forwarder.php`. The customer experiences this as "one extra shipment in my ฝากนำเข้า list, magic".

**Why legacy does it this way:** physical reality — the goods *are* a forwarder shipment now (they need warehouse intake, CBM measurement, container loading, TH delivery). The shop-order lifecycle ends at "ordered from China shop"; everything from there is forwarder mechanics. Forking to a new table separates the two concerns cleanly.

---

## 3. The 3 source categories on `/admin/forwarders`

Legacy tabs in `pcs-admin/forwarder.php` L263-280 expose 4 filters via `?create=<key>`:

| URL param | Legacy label | Filter clause | Who creates · When · What's empty |
|---|---|---|---|
| `?create=all` | ฝากนำเข้าทั้งหมด | (no filter) | Everything · always · n/a |
| `?create=user` | ฝากนำเข้าจากลูกค้า | `adminIDCreator='' AND refOrder=''` | Customer types it via `/service-import/add` (or the legacy `/forwarder/add` form). Created at submit. `adminIDCreator` empty + `refOrder` empty. |
| `?create=system` | ฝากนำเข้าจากระบบ | `refOrder!=''` | The shop → forwarder auto-spawn (§2). Created when admin clicks "บันทึก และสร้างรายการฝากนำเข้า". Has BOTH `adminIDCreator` AND `refOrder` populated. |
| `?create=admin` | ฝากนำเข้าจากแอดมิน | `adminIDCreator!='' AND refOrder=''` | Admin manually types a forwarder on customer's behalf via `/admin/forwarder/add` (or MOMO/CN manual entry pages). Created at admin submit. `adminIDCreator` set, `refOrder` empty. |

The 4 (adminIDCreator × refOrder) combinations explained:

```
adminIDCreator empty + refOrder empty  → create=user    → badge: "ฝากนำเข้าจาก : users"
adminIDCreator empty + refOrder set    → impossible¹    → (would be: customer self-spawned from shop — never happens)
adminIDCreator set   + refOrder empty  → create=admin   → badge: "ฝากนำเข้า : <adminID>"
adminIDCreator set   + refOrder set    → create=system  → badge: shop-link only (NOT the admin badge — see §4)
```

¹ Impossible in legacy because only admin-side `shops.php` runs the spawn — customers can't trigger it. If you see this combo in data, it's an import-script artifact or a manual SQL fix.

**Pacred port:** [`app/[locale]/(admin)/admin/forwarders/page.tsx`](../../app/[locale]/(admin)/admin/forwarders/page.tsx) L364-378 implements the exact same 3-filter logic on the supabase-js query builder. The Wave 11 commit added these tabs faithfully.

---

## 4. The badge logic (exact legacy reference)

The list-row badges (`pcs-admin/forwarder.php` L623-624 verbatim, the 2 mutually-exclusive blocks):

```php
// Block 1 (L623) — the "creator" badge. Renders one of: admin-badge, users-badge, NOTHING.
<?php if($row['adminIDCreator']!='' && $row['refOrder']==''){
    echo '<div class=""><span class="font-9 badge badge-warning badge-pill">ฝากนำเข้า : '.$row['adminIDCreator'].'</span></div>';
} else if($row['refOrder']==''){
    echo '<br/><div class=""><span class="font-9 badge badge-primary badge-pill">ฝากนำเข้าจาก : users</span></div>';
} ?>

// Block 2 (L624) — the "shop-link" badge. Independent of block 1.
<?php if($row['refOrder']!=''){
    echo '<br/><div class=""><a href="'.basePathAdmin.'shops/detail/'.$row['refOrder'].'/"><span class="font-9 badge badge-info badge-pill">ฝากสั่งซื้อ : '.$row['refOrder'].'</span></a></div>';
} ?>
```

**Decoded as a truth table** (per row):

| adminIDCreator | refOrder | Block-1 renders | Block-2 renders | Visible badges |
|---|---|---|---|---|
| `''` | `''` | "ฝากนำเข้าจาก : users" (else-if hits) | nothing | 1 — `users` (gray-blue) |
| `'admin_pop'` | `''` | "ฝากนำเข้า : admin_pop" (if hits) | nothing | 1 — `admin_pop` (amber) |
| `''` | `'P00123'` | nothing (if false; else-if false because `refOrder==''` is false) | "ฝากสั่งซื้อ : P00123" (link) | 1 — shop-link (blue) |
| `'admin_pop'` | `'P00123'` | nothing (if false because refOrder!=''; else-if false too) | "ฝากสั่งซื้อ : P00123" (link) | 1 — shop-link (blue) |

**Critical:** when refOrder is set, NEITHER block-1 branch fires. Legacy hides the admin-creator info on system-spawned rows — the operator only sees "this came from shop #P00123" + clicks through to inspect there. The admin who pressed the spawn button is recorded in `adminIDCreator` (used later for audit) but isn't displayed in the list.

**Pacred Wave 11 port** ([`app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx`](../../app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx) L379-390) currently shows only ONE badge per row (mutex via `isSystem ? : isAdminInitiated ? : default`) and uses the legacy "ฝากนำเข้า : ระบบ" wording for system-spawned rows instead of the shop-link. **This matches the legacy block-1 visibility (correct: no admin badge on refOrder rows), but omits block-2's clickable shop link** — see §6 cross-link "bug #2" — main session is fixing this in Wave 19.

---

## 5. The 3 sister tables (what else lives nearby)

If you're touching one, know these exist:

| Table | Purpose | Row granularity | Code shape |
|---|---|---|---|
| `tb_shop` | Single product line (one shop checkout row) | One per cart line | embedded — has its own pkey, links to `tb_header_order.hNo` |
| `tb_header_order` | Cart header (one row per checkout) | One per cart | `hNo = 'P' + auto-int` (`pcs-admin/shops.php` L3-9 in legacy / `actions/cart.ts` L255-269 in Pacred) |
| `tb_order` | Per-tracking detail under a header | Many per `hNo` | Holds `cShippingNumber` + `cTrackingNumber` (the legacy spawn input · `shops.php` L1597) |
| `tb_cnt` | Container payment | One per container | The "ทำรายการเบิกเงินค่าตู้" flow — `/admin/report-cnt` |
| `tb_cnt_item` | Per-shipment cost inside a container | Many per `cntNo` | Wave 16 P0 surface |
| `tb_wallet_hs` | Every wallet event (topup/spend/refund) | One per money event | `reforder` here = the f_no OR hNo OR cntNo it's paying for (NOT the same `refOrder` semantic as `tb_forwarder.refOrder` — name collision) |
| `tb_payment` | Yuan transfer requests | One per transfer | The ฝากโอน table — same customer relationship, different lifecycle |
| `tb_forwarder_driver_item` | Driver-leg assignment | One per shipment that's on a truck | The `?q=6.1` filter on `/admin/forwarders` joins through here (legacy L401-405) |

**Naming trap:** `tb_forwarder.refOrder` (varchar(30)) is the **shop header** that spawned this forwarder. `tb_wallet_hs.reforder` is **anything being paid for** — different semantic, just reused name. Don't conflate.

---

## 6. Cross-links (where this taxonomy is encoded in Pacred today)

Source-of-truth files that consume the `refOrder`/`adminIDCreator` distinction:

| File | Lines | What it does |
|---|---|---|
| [`app/[locale]/(admin)/admin/forwarders/page.tsx`](../../app/[locale]/(admin)/admin/forwarders/page.tsx) | L209-219 (typedef), L364-378 (filter), L274-275 (Row shape) | The 3-tab filter port. Faithful match to legacy L283-339. |
| [`app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx`](../../app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx) | L379-390 | The badge render. Partial port — Block 1 visibility matches legacy but Block 2 (shop-link clickable badge) is MISSING. See Wave 19 bug #2 fix. |
| [`actions/admin/forwarders-new.ts`](../../actions/admin/forwarders-new.ts) | L341-396 | Admin-side INSERT — sets `adminidcreator=<legacyAdminId>`, `reforder=""`. Match legacy `forwarder.php` L115-120 (admin add). |
| [`actions/admin/carrier-manual.ts`](../../actions/admin/carrier-manual.ts) | L312-314 | MOMO/CN sheet-import INSERT — sets `reforder=""`, `adminidcreator=<importer>`. |
| [`actions/admin/api-forwarder-manual.ts`](../../actions/admin/api-forwarder-manual.ts) | (similar) | MOMO/CN manual entry INSERT path. |
| [`actions/admin/barcode-import.ts`](../../actions/admin/barcode-import.ts) | L140-188 | The 3-stage primary lookup — uses `refOrder<>''` as tiebreaker #1 (matches legacy `barcode-c-import2.php` L41), `adminIDCreator<>''` as tiebreaker #2 (L58). |
| [`supabase/migrations/0081_pcs_legacy_schema.sql`](../../supabase/migrations/0081_pcs_legacy_schema.sql) | L1686, L1691 | Schema: both columns are `character varying NOT NULL` — default `""`, never NULL. Filter with `.eq('', '')` not `.is(null)`. |

**Gap — NOT yet ported (as of Wave 19):**
- The shop → forwarder AUTO-SPAWN. Legacy `pcs-admin/shops.php` L1675-1721 has no Pacred equivalent. `grep -rln "from(\"tb_forwarder\").*\.insert" actions/` returns only 3 hits: `forwarders-new.ts`, `carrier-manual.ts`, `api-forwarder-manual.ts` — none from a shop-detail server action. When admin advances a service_order to "ordered" / "shipped_china", no `tb_forwarder` row is created. This is a Wave-17/Phase-C item, not a bug per-se (the customer-facing flow degrades gracefully — admin can still manually create the forwarder), but it's the reason a fully-faithful audit will show "fewer rows on /admin/forwarders than legacy /forwarder/" until ported.

---

## 7. Quick FAQ

**Q1. Why does an order on `/admin/forwarders` sometimes show no admin?**
A: The customer typed it themselves at `/service-import/add`. `adminIDCreator=''` so the badge falls through to "ฝากนำเข้าจาก : users". Pacred-Wave-11 hides the badge text but the row's `admin_creator` column is `""`.

**Q2. Why does `/admin/forwarders/<fNo>` sometimes link back to `/admin/service-orders/<hNo>`?**
A: That row was auto-spawned by the shop-order flow (§2). The detail page should show a "ที่มา : ฝากสั่งซื้อ P00xxxx" chip (matches legacy `forwarder.php` L624 badge). Click-through opens the cart that triggered the spawn — useful when accounting asks "where did this shipment come from?"

**Q3. What's the difference between `adminIDCreator` and `adminID`?**
A:
- `adminIDCreator` = the staff who INSERTED the row (set once, never overwritten). Used for the source-tab filter.
- `adminID` / `adminIDUpdate` = the staff who LAST modified the row (overwritten on every update). Used for "last touched by".
- Same naming convention applies on `tb_payment`, `tb_header_order`, `tb_wallet_hs` (search the schema for `*Creator` vs `*Update`).

**Q4. If a forwarder is system-spawned, is the customer charged once or twice?**
A: Once — but on TWO different surfaces. The shop-order itself (`tb_header_order.hTotalPrice`) is paid via `actions/service-order.ts::payServiceOrderFromWallet` (`reference_type=order_header`, `reference_id=hNo`). The forwarder shipping fee (`tb_forwarder.fTotalPrice`) is paid SEPARATELY via `actions/forwarder.ts::payForwarderFromWallet` (`reference_type=forwarder`, `reference_id=fNo`). Two wallet events, two `tb_wallet_hs` rows, two distinct receipts. The customer sees them in two different lists. Idempotency is keyed on `(reference_type, reference_id, kind)` — see `pacred-domain-knowledge.md` L77-86.

**Q5. Can a `tb_payment` (ฝากโอน) row be linked to a shop order or a forwarder?**
A: Legacy didn't model this — `tb_payment.refOrder` exists in the schema but is only used for tracking which Alipay invoice the customer asked Pacred to pay (free-text). The 3 services are operationally independent: shop = goods, forwarder = shipping, yuan = supplier payment. A customer commonly uses all three sequentially for the same purchase but the rows aren't FK-linked.

**Q6. One shop order can spawn many forwarders — how come?**
A: A single cart (`hNo`) can have N different cTrackingNumbers (one per parcel the China shop ships separately — common when a customer buys from 5 stores). The spawn POST handler runs once per tracking number entry (legacy `shops.php` L1584 form is inline-repeated for each tracking). Result: `tb_forwarder WHERE refOrder='Pxxxxx'` can return 1..N rows. The `/admin/forwarders?create=system` tab counts THOSE rows, NOT the cart count — which is why "เลขฝากสั่งที่จ่ายแล้ว 50 ออเดอร์" can spawn "~200 แถวฝากนำเข้าจากระบบ".

**Q7. Why does Pacred's `/admin/forwarders` list look shorter than legacy `/forwarder/`?**
A: Because the shop → forwarder auto-spawn (§2) isn't ported yet (Wave 19 audit confirmed only 3 INSERT-paths exist in Pacred actions: admin-add, MOMO/CN manual entry, sheet-import — none from service-order). Until the spawn is ported, every customer who pays a shop order then needs admin to MANUALLY create their forwarder. The row count gap = the "missing automation" gap.

---

## Cross-links

- [`docs/learnings/pacred-domain-knowledge.md`](pacred-domain-knowledge.md) §"Cargo loop architecture — both shop-order AND forwarder need pay-from-wallet" — the wallet-side of the same separation
- [`docs/learnings/php-port-patterns.md`](php-port-patterns.md) — legacy `tb_*` schema patterns (numeric VARCHAR status, per-status DATETIME cols, NOT-NULL defaults of `""`)
- [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../audit/cargo-flow-deep-audit-2026-05-25.md) — Wave 16 gap report (the shop → forwarder spawn is one of the deferred Phase-C items)
- [`docs/architecture.md`](../architecture.md) — `tb_*` schema diagram
- Legacy SOT: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\forwarder.php` (L263-280 tabs, L283-339 filter SQL, L623-624 badges) + `pcs-admin\shops.php` (L1584 POST handler, L1675-1721 spawn block)
