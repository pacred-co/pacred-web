# `tb_forwarder`

> ✅ canonical / live · **lowercase** columns · referenced **267×** in code

ฝากนำเข้า / import orders — the ~47k-row revenue spine. China→Thailand shipment with full cost/profit ledger, container assignment, 7-stage status flow.

> **fstatus flow:** 1=draft · 2=confirmed · 3=ถึงโกดังจีน · 4=กำลังส่งมาไทย · **5=รอชำระเงิน(AR)** → **6=ชำระแล้ว** · 7=ส่งแล้ว. The 5→6 advance + receipt mint = the "mark-paid" money loop (PM-4).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminIDSale` |  | Sales rep |
| `adminidcreator` | ✏️ | Created-by admin |
| `adminidupdate` | ✏️ | Updated-by admin |
| `famount` | ✏️ | Quantity |
| `famountcount` | ✏️ | Quantity count |
| `fbilltoname` | ✏️ | Bill-to name (migration 0132) |
| `fcabinetnumber` |  | Container/cabinet number (e.g. GZS260529-1) |
| `fcosttotalprice` | ✏️ | Our cost (internal) |
| `fcosttotalpricesheet` |  | Our cost (sheet) |
| `fcover` | ✏️ |  |
| `fcredit` | ✏️ | Credit applied |
| `fcreditdate` |  | Credit date |
| `fdate` | ✏️ |  |
| `fdateadminstatus` | ✏️ |  |
| `fdatecontainerclose` | ✏️ |  |
| `fdatestatus6` | ✏️ |  |
| `fdetail` |  | Detail |
| `fdiscount` |  | Discount |
| `fheight` |  | Height |
| `fidorco` |  | Corporate/order link |
| `flength` |  | Length |
| `fnote` |  | Admin note |
| `fnoteuser` |  | Customer note |
| `fpallet` |  | Pallet |
| `fpriceupdate` |  | Price-updated flag |
| `fproductstype` |  | Product category (A/M/X/O/Z) |
| `fproductstype2` |  | Product category 2 |
| `fprofittotal` |  | Computed profit (CEO ≤15k/ตู้ guard) |
| `frefprice` | ✏️ | Reference price |
| `fshipby` | ✏️ | Carrier |
| `fshippingservice` |  | Service |
| `fstatus` | ✏️ | Status 1-7 (see flow above) |
| `ftotalprice` |  | Customer-facing total |
| `ftrackingchn` |  | China tracking # |
| `ftrackingchn2` |  | China tracking #2 |
| `ftrackingth` |  | Thai tracking # |
| `ftransportprice` | ✏️ | Transport cost |
| `ftransportpricechnthb` |  | Transport CN→TH (THB) |
| `ftransporttype` | ✏️ | Transport mode |
| `fusercompany` | ✏️ | "" for company customers (PHP-NULL→empty port quirk) |
| `fvolume` |  | Volume |
| `fwarehousechina` |  | Source China warehouse |
| `fwarehousename` |  | Warehouse name (8=MOMO) |
| `fweight` |  | Weight |
| `fwidth` |  | Width |
| `id` |  | Order id (=fid) |
| `paydate` |  | Payment date |
| `paydeposit` |  | Deposit paid |
| `paymethod` | ✏️ | Payment method |
| `paystatus` |  | 0=unpaid 1=paid |
| `paythb` |  | Paid THB |
| `paytype` |  | Payment type |
| `payyuan` |  | Paid CNY |
| `pricecrate` |  | Crate surcharge |
| `priceother` | ✏️ | Other surcharge |
| `subuserid` | ✏️ |  |
| `tax_doc_pref` |  | Tax-doc mode (ใบกำกับ/ใบขน/none) |
| `userid` | ✏️ | Customer (tb_users.userID) |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/forwarder-legacy.ts`
- `actions/admin/forwarder-cost.ts`
- `actions/admin/combine-bill.ts`
- `actions/admin/wallet-hs.ts`
- `actions/admin/forwarders-new.ts`
- …and more (267 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
