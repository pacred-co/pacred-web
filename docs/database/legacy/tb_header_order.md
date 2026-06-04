# `tb_header_order`

> ✅ canonical / live · **lowercase** columns · referenced **116×** in code

ฝากสั่งซื้อ / shop orders — order header (hno is the key). Customer asks Pacred to buy goods in China. Holds cart-line snapshot + shop info + shipping.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminidupdate` | ✏️ |  |
| `camount` |  | Cart: qty |
| `ccolor` |  | Cart: color variant |
| `cimages` |  | Cart: image |
| `cnameshop` |  | Cart: shop name |
| `cprice` |  | Cart: price |
| `cprovider` |  | Cart: provider |
| `crate` |  | Cart: rate |
| `csize` |  | Cart: size variant |
| `ctitle` |  | Cart: product title |
| `curl` |  | Cart: product URL |
| `hcostall` |  | Total cost |
| `hcostallth` |  | Total cost (THB) |
| `hcount` |  | Item count |
| `hcover` |  | Cover |
| `hdate3` | ✏️ |  |
| `hdate4` | ✏️ |  |
| `hdateupdate` | ✏️ |  |
| `hdetail` |  | Detail |
| `hfreeshipping` |  | Free-shipping flag (41-ZIP) |
| `hno` |  | Order number (PK) |
| `hnote` | ✏️ | Admin note |
| `hnoteuser` |  | Customer note |
| `hrate` |  | Exchange rate (customer) |
| `hratecost` |  | Exchange rate (cost) |
| `hshipby` |  | Carrier |
| `hshippingchn` |  | China shipping |
| `hshippingservice` |  | Service |
| `hshoppay` | ✏️ | Shop-pay disbursement flag |
| `hstatus` | ✏️ | Order status (tabs 1-5 → spawns forwarder on land) |
| `htitle` |  | Title |
| `htotalpricechn` |  | Total (China-side) |
| `htotalpriceuser` |  | Total (customer) |
| `htransporttype` |  | Transport mode |
| `hwarehousechina` |  | China warehouse |
| `paydeposit` | ✏️ |  |
| `paystatus` |  | Payment status |
| `promoid` |  | Applied promo (tb_promotion) |
| `userid` |  | Customer |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/shop-disbursement.ts`
- `actions/admin/service-orders.ts`
- `actions/admin/wallet-hs.ts`
- `actions/admin/customers.ts`
- `actions/admin/customer-profile.ts`
- …and more (116 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
