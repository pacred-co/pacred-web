# Workstream C — Delivery address (ตจว vs กทม/ปริมณฑล) · Thai-leg carrier choice · COD ต้นทาง/ปลายทาง · pay-on-arrival-at-Thai-warehouse

> ## 🔴 CORRECTION (2026-06-11 PM · เดฟ verify-from-source) — most of this doc's "NOT ported" verdicts are WRONG
> This audit only read `actions/forwarder.ts` (the rebuilt-era **orphan**) + a non-existent `forwarder-form.tsx`.
> It **missed the live faithful path entirely**: **`actions/forwarder-legacy.ts`** + the live add form
> `app/[locale]/(protected)/service-import/add/{service-import-add-form,service-import-shipby-select}.tsx`.
> Re-verified against source, the LIVE customer ฝากนำเข้า create flow already does:
> - **C-1 carrier `<select>`** ✅ `service-import-shipby-select.tsx` (NOT free-text).
> - **C-2 zone→carrier gating** ✅ `getShipByOptions` (in-free-area = Flash(2)+J&T(24); else the 21-courier roster), gated by `isFreeShippingZip`.
> - **C-3/C-4 PCSF free-area + promo** ✅ `checkFreeArea` + the `#input-12` promo (forces `fShipBy='PCSF'`, hides the select).
> - **C-5 COD carrier-coupling** ✅ `createLegacyForwarder` derives `paymethod` from `fShipBy` (`inOrigin` ∈ {PCS,PCSF,PCSE,24,2} → '1' origin, else '2' dest).
> - **C-6 address snapshot** ✅ copies from `tb_address` by `addressID` (+ "PCS" self-pickup → Pacred TH warehouse).
> - **C-9 split-brain** ✅ **ALREADY RESOLVED** — `createLegacyForwarder` writes **`tb_forwarder`** (every legacy column); the orphan `createForwarder` that wrote rebuilt `forwarders` **no longer exists in `actions/forwarder.ts`** (cleaned a prior session — grep confirms zero `.from("forwarders")` there). **Nothing to fix.**
>
> **What's genuinely left (small):** **C-7** per-customer overrides (PCSFAM free-choice · VIP-maomao-outside-zone · 50฿-exempt) — niche owner-data, the หนองแขม-exempt half is already in `actions/forwarder.ts`. **C-8** the PathumThani `12000` zip-drift decision (owner picks the canonical set). Both are owner-input, not build work.
> **Lesson:** a gap-map agent that greps the feature name (`createForwarder`) finds the FIRST/orphan match, not the live `*-legacy` twin. Verify the WIRED path (which form/action the live route imports) before declaring "not ported". See `docs/learnings/audit-discipline.md`.
> The legacy-decode sections below (zone arrays, carrier-by-province map, status spine, pay-on-arrival total) remain CORRECT + useful as reference; only the Pacred-state "GAP" verdicts (§0, §5.2, §6) are superseded by this banner.

> **Grounded legacy audit — 2026-06-11.** AUDIT ONLY (no code changed). Source = staged legacy at
> `C:/Users/Admin/AppData/Local/Temp/pacred-legacy/member` + `.../pcs-admin`. Cross-ref =
> Pacred worktree `dave-pacred @ 0f3f5443`. Owner mandate: ห้ามเดา ห้ามตกหล่น — every claim below cites a
> `file:line`. The customer must, at order time, set: the Thai delivery address with the ตจว-vs-กทม/ปริมณฑล
> zone distinction, choose the Thai-leg carrier (zone-gated), choose COD ต้นทาง/ปลายทาง, and there is a
> later step (status 5) where they pay the import/Thai-shipping charges when goods ARRIVE at the Thai
> warehouse, BEFORE final delivery.

---

## 0. TL;DR — what's faithful, what's missing

| Capability | Legacy | Pacred | Verdict |
|---|---|---|---|
| ตจว vs กทม/ปริมณฑล zip whitelist | `function.php` arrays merged in ~6 places | `lib/bkk-zip.ts` (verbatim port) | ✅ ported (helper only — see §4 caveat: PathumThani drift + it isn't wired into the create form) |
| Zone → carrier list (47 carriers, province/amphoe-gated) | `api-shipBy.php`, `getShipBy.php`, `check-shipby.php`, `optionHShipBy*` | **none** — `ship_by` is a free-text `<input>` | 🔴 NOT ported (the heart of this workstream) |
| Carrier ID → name map (47 + sentinels) | `nameShipBy()` `function.php:91-148` | **none** | 🔴 NOT ported |
| COD ต้นทาง/ปลายทาง selector (payMethod) | `getShipBy.php:64-86` radio + carrier-driven hide | static 2-option `<select>`, no carrier coupling | 🟠 partial — exists but not zone/carrier-driven |
| PCSF "PCS เหมาๆ / จัดส่งฟรี กทม.+ปริมณฑล" promo | `getShipBy.php:36-51`, `optionHShipBy*`, `checkFreeArea.php` | **none** at create (the +50฿ math is ported in `actions/forwarder.ts`, but the option can't be picked) | 🔴 NOT ported (selectable promo) |
| Pay-on-arrival at Thai warehouse (status 5 → ชำระเงิน) | `getListPayForwarder.php`, `calPrice.php`, `forwarder.php` L2140 | `service-import/[fNo]/page.tsx` (reads `tb_forwarder`) + `pay-from-wallet-button.tsx` | ✅ faithful (detail page) |
| Pay-total sum (China freight+crate+Thai+service+other−disc, +50 PCSF, −1% WHT) | `calPrice.php`, `getListPayForwarder.php:116` | `actions/forwarder.ts:40-170` (`calForwarderPayTotal`, reads `tb_forwarder`) | ✅ faithful |
| **Split-brain (cross-cutting)** | n/a | create writes rebuilt **`forwarders`**; everything that matters reads legacy **`tb_forwarder`** | 🔴 §0e dead-write trap — see §6 |

**One-line build verdict:** the *back half* of the flow (status-5 pay-on-arrival, reading `tb_forwarder`) is faithful;
the *front half* (the order-time address-zone → carrier-list → COD coupling) is essentially un-ported, and worse,
the create form writes a different table (`forwarders`) than the live consumers read (`tb_forwarder`).

---

## 1. The zone model — ตจว vs กทม/ปริมณฑล (HOW it's decided, WHAT changes)

### 1.1 The decision rule — a hardcoded zip whitelist, not a province lookup

The "in-zone" test is **`in_array($addressZIPCode, $arrZIPCode)`** where `$arrZIPCode` is a fixed merge of 6 arrays.
It is duplicated verbatim in **at least 7 places** (each re-declares the same arrays inline):

- `member/include/function.php:822-828` (`optionHShipByCart2`) and `:885-892` (`optionHShipByCart3`)
- `member/include/pages/forwarder/getDataAddressF.php:4-10`
- `member/include/pages/forwarder/checkFreeArea.php:4-10`
- `member/include/pages/forwarder/getShipBy.php:6-12`
- `member/include/pages/cart/api-shipBy.php:23-29`
- `member/include/pages/cart/checkPCSMaoMao.php:8-14`

The canonical arrays (`api-shipBy.php:23-29`, the most complete copy):

```php
$arrZIPCodeBKK          = array(10600,10510,10110,10230,10900,10150,10210,10400,10300,10170,10170,10140,
                                10600,10700,10600,10240,10150,10120,10800,10260,10150,10700,10500,10220,
                                10160,10240,10330,10250,10100,10400,10200,10260,10160,10510,10120,10400,
                                10140,10520,10230,10310,10110,10250,10240,10100,10120,10220,10530,10160,
                                10210,10310);                 // Bangkok (~50 entries, with dups)
$arrZIPCodeNakhonPathom = array(73170,73110);
$arrZIPCodeNonthaburi   = array(11130,11110,11140,11120,11000,11150);
$arrZIPCodePathumThani  = array(12000);                       // ⚠️ NOTE: present here…
$arrZIPCodeSamutPrakan  = array(10560,10540,10540,10130,10290,10270);
$arrZIPCodeSamutSakhon  = array(74110,74000);
$arrZIPCode = array_merge( … all six … );
```

> **Drift inside legacy itself:** `$arrZIPCodePathumThani` is `array(12000)` in `api-shipBy.php`, `checkFreeArea.php`,
> `getDataAddressF.php`, `checkPCSMaoMao.php` — but **empty `array()`** in `function.php`'s `optionHShipByCart2`/`3`
> (`:825`, `:888`) and in `getShipBy.php:9`. So the SAME customer could be "in-zone" for the free-area badge yet
> "out-of-zone" for the carrier dropdown. We must pick ONE canonical set (recommend: include `12000`).

### 1.2 What CHANGES when in-zone vs out-of-zone

| Aspect | กทม/ปริมณฑล (in `$arrZIPCode`) | ตจว (not in `$arrZIPCode`) |
|---|---|---|
| Carrier list offered | **Very short** — `optionHShipByCart3` (the live forwarder cart) offers only **Flash (2) + J&T (24)** plus the PCSF promo (`function.php:922-926`) | **Long** — Flash + the full province-matched private-carrier set (`function.php:899-921` / `api-shipBy.php:44-557`) |
| PCSF "PCS เหมาๆ จัดส่งฟรี กทม.+ปริมณฑล" option | **Offered** (`getShipBy.php:36-51`, `optionHShipBy2:730-733`) | **Hidden / disabled** with the red note `**ที่อยู่ไม่อยู่ในพื้นที่ PCS จัดส่ง กทม. และปริมณฑลบางพื้นที่` (`optionHShipBy2:738-740`) |
| Free-area validation | `checkFreeArea.php:15-18` → console "ผ่าน" | `checkFreeArea.php:19-30` → SweetAlert "ที่อยู่ของคุณ ไม่ได้อยู่ในพื้นที่จัดส่งฟรี!!!" + clears `hShipBy` |
| The +50฿ "เหมาๆ" surcharge | applies once per bill if a PCSF row has `fTransportPrice=0` (`calPrice.php:29-31,40-42`) | n/a (no PCSF) |

### 1.3 ตจว carrier-by-province map (the real selection brain)

For out-of-zone addresses, the carrier list is **built dynamically from the destination province (and sometimes amphoe)**.
Two equivalent copies exist:
- **Customer cart**: `member/include/pages/cart/api-shipBy.php:50-557` (resolves province via `raw_database.json` zip lookup, then `in_array($nameProvince, $carrierProvinces)` per carrier).
- **Admin reference tool**: `member/pcs-admin/check-shipby.php:68-575` (same logic, by zip input).

The map keys carrier-id → eligible provinces. ~40 carriers with region rules; representative slice
(`api-shipBy.php`; line numbers approximate the same blocks in `check-shipby.php`):

| Carrier id | Name | Province rule (examples) |
|---|---|---|
| 2 | Flash Express | **always** (default seed everywhere) |
| 24 | J&T Express | always (in-zone pair with Flash) |
| 13 | ธนามัย ขนส่งด่วน | `$northeast` (all Isan) |
| 16 | มะม่วงขนส่ง | นครสวรรค์, อุทัยธานี, ชัยนาท, นนทบุรี, อยุธยา, สุพรรณบุรี, กาญจนบุรี, เพชรบุรี, ระยอง, จันทบุรี, ตราด … |
| 7 | SB สมใจขนส่ง | `$northeast` + เพชรบูรณ์/นครสวรรค์/พิจิตร/พิษณุโลก/สุโขทัย/กำแพงเพชร/ตาก/อุดรธานี/ขอนแก่น |
| 9 | เคพีเอ็น | ปทุมธานี, อยุธยา, ชลบุรี, ฉะเชิงเทรา, นครปฐม, ราชบุรี, เพชรบุรี, ประจวบฯ … |
| 12 | จันทร์สว่างขนส่ง | `$northeast` + East/West-central cluster |
| 21 | นิ่มซี่เส็งขนส่ง 1988 | `$north` (all upper-north) |
| 41 | สิรินครขนส่ง | full Isan (20 provinces) |
| 17 | วันชนะ แอนด์ วันณิสา | ชัยภูมิ, นครราชสีมา **AND amphoe NOT in** (วังน้ำเขียว, บัวลาย, ลำทะเมนชัย) — `api-shipBy.php:178-180` |
| 20 | ตองสอง ขนส่ง | สระบุรี, อยุธยา **OR** (นครราชสีมา AND amphoe ∈ {โคราช, เมืองฯ, โชคชัย, …}) — `:240-243` |
| 28 | พัฒนาเอ็กซ์เพลส | (ปัตตานี/ยะลา/นราธิวาส) AND amphoe ∈ {สุไหงโก-ลก, เมืองนราธิวาส, …} — `:290-292` |
| 31 | อาร์.ซี.เอ็กซเพรส | สุพรรณบุรี AND amphoe ∈ {บางเลน, ลาดบัวหลวง} — `:330-332` |
| … | (≈25 more) | see `api-shipBy.php:50-557` / `check-shipby.php:68-575` for the full list |

Region helper sets (defined once, reused — `api-shipBy.php:50-53`):
- `$south` (14), `$north` (9), `$central` (22), `$northeast` (20).

> ⚠️ **Province resolution depends on `raw_database.json`** — the Thailand zip→{province,amphoe} dataset at
> `assets/plugins/jquery.Thailand.js/database/raw_database/raw_database.json`. Pacred must ship an equivalent
> dataset (or a `tb`/lookup table) to drive the carrier map. The dropdown form (`addresses`) already uses a Thai
> address picker — confirm it carries province+amphoe so the carrier resolver has its inputs.

### 1.4 Per-customer overrides (special VIP rules — data-driven in late legacy)

The cart header comment (`api-shipBy.php:5-11`) documents 3 JSON override files that relax the zone rule per-customer:

- `include/pages/oop/user-shipby-freedom.json` — customers who may pick **any** carrier with no zone condition ("ลูกค้าที่เลือกขนส่งได้อิสระ").
- `include/pages/oop/user-vip-maomao.json` — customers allowed to use **PCSF เหมาๆ even outside the zone** ("ลูกค้าที่ใช้เหมาๆ นอกเขตได้"); keyed by `{userID, addressFullText}` (`checkPCSMaoMao.php:26-32`).
- `include/pages/oop/user-not-50.json` — customers exempt from the 50฿ surcharge ("ลูกค้าที่ส่งเหมาๆ ฟรีไม่มี 50 บาท").

> **NOTE:** these JSON files are NOT in the staged extract (`include/pages/oop/` is absent). The admin pages
> `check-customer-shipby-freedom.php`, `check-customer-maomao-vip.php`, `check-customer-maomao-free.php`
> (each dispatches to `include/pages/check-customer-*/home.php`, present but scaffold-only `SELECT … FROM tb_name`
> placeholders) are the admin UIs that maintain these lists. Older hardcoded equivalents survive in the source as
> `userID=='PCSFAM'` (free carrier choice — `optionHShipBy2:683-728`), `userID=='PCS2515' && zip=='24130'`
> (`getShipBy.php:36`, `optionHShipBy2:736-737`), and the 50฿-exempt set
> `array('PCS50','PCS3083','PCS3983','PCS999')` + district "หนองแขม" (`calPrice.php:34-38`,
> `getListPayForwarder.php:107-110`). Pacred port should model these as a small override table, not JSON-on-disk.

---

## 2. The Thai-leg carrier choice — order-time UI (the `getShipBy` flow)

`member/include/pages/forwarder/getShipBy.php` is the AJAX fragment rendered when the customer picks a delivery
address inside the ฝากนำเข้า (forwarder) order. It is the single richest artifact for this workstream. It produces,
in order:

1. **Free-promo checkbox (PCSF / free50)** — shown only if in-zone OR a whitelisted VIP (`getShipBy.php:36-51`).
   Checking it hides the carrier select + drops the `required` flag (`:120-128`), i.e. "PCS handles delivery free".
2. **Carrier `<select name="hShipBy">`** — populated by `optionHShipByCart3($conn, $addressID)` (`:59-61`),
   which is zone-gated (in-zone = Flash+J&T; out-of-zone = province-matched list — `function.php:884-930`).
   Special address `'PCS'` = "รับเองโกดัง PCS" self-pickup → `<input hidden name="hShipBy" value="PCS">` + map link (`:55-57`).
3. **COD radio (payMethod) "การเรียกเก็บเงินขนส่งในประเทศไทย"** — see §3.

### 2.1 The carrier-list functions (which one is live)

`function.php` has FIVE generations of the carrier-list builder. The **live one for the forwarder order is
`optionHShipByCart3`** (called by `getShipBy.php:60`). The others are kept for other surfaces / history:

| Function | `function.php` | Behaviour | Used by |
|---|---|---|---|
| `optionHShipBy($freeShipping)` | 649-678 | Flat 22-carrier list + PCS + (cond) PCSF | legacy/older |
| `optionHShipBy2($free,$zip…)` | 679-788 | Branch on PCSFAM / in-zone / PCS2515; longest list (47) | older forwarder |
| `optionHShipByCart($conn)` | 789-820 | 22-carrier + PCS, PCSF if `tb_settings.freeShipping=1` | cart (ฝากสั่ง) — `getDataAddress.php:14` |
| `optionHShipByCart2($conn,$addr)` | 821-883 | Zone-gated (out=22 carriers, in=22+PCSF) | mid cart |
| **`optionHShipByCart3($conn,$addr)`** | **884-930** | **Zone-gated: out=26 carriers, in=Flash(2)+J&T(24) only** | **live forwarder order** |

> The "carrier registry" (the union of all ids) is the `nameShipBy()` switch — `function.php:91-148` — which is the
> canonical ID→display-name map. **Reproduced in full in §A (appendix)** because Pacred has none.

---

## 3. COD — เก็บเงินต้นทาง (origin) vs ปลายทาง (destination)

### 3.1 The selector + its carrier-coupling (the rule)

`getShipBy.php:64-86` renders two radios under "การเรียกเก็บเงินขนส่งในประเทศไทย":
- **payMethod=1 → "เก็บเงินต้นทาง"** (origin — Pacred collects the Thai-leg fee upfront, default)
- **payMethod=2 → "เก็บเงินปลายทาง"** (destination — customer pays the courier on delivery / true COD)

Default = the customer's saved `tb_users.userPayMethod` (`getShipBy.php:31`), falling back to `1` when blank (`:69-70`).

**The carrier→payMethod coupling (JS `getShipBy.php:137-153`)** — for certain carriers the COD choice is *forced*
and the radio block is **hidden**:

```js
var hShipBy = $('#hShipBy').val();
if (hShipBy==2 || hShipBy==11 || hShipBy==24 || hShipBy=='PCS') {  // Flash, ไปรษณีย์ไทย, J&T, self-pickup
    $('.cpayMethod').hide();    // no COD choice — these are origin-pay / prepaid by nature
} else {
    $('.cpayMethod').show();    // private carriers → customer may choose ต้นทาง/ปลายทาง
}
// (re-evaluated on every #hShipBy change; PCSE opens the PCS-Express price modal)
```

### 3.2 The business policy behind it (the admin reference cards)

- `pcs-admin/check-payMethod.php:43-46` (the policy text staff see): *"การคิดค่าขนส่งต้นทาง โดยปกติจะมีแต่ Flash
  และ PCS เหมาๆ · ขนส่งเอกชนต่างๆ จะเป็นปลายทางทั้งหมด · ยกเว้นแต่มีความจำเป็นจากลูกค้า … สามารถปรับได้ในแต่ละกรณี"* —
  i.e. **Flash + PCS-เหมาๆ = origin-pay; private carriers = destination-pay by default; admin may override per-case.**
- Display: `namePayMethod()` `pcs-admin/include/function.php:1682-1691` → `1='ต้นทาง'`, `2='ปลายทาง'`
  (rendered red). Used on the admin forwarder row (`forwarder-action.php:546`).

### 3.3 How COD/carrier are persisted

Legacy stores them **denormalized on `tb_forwarder`** at order create — columns `fShipBy` and `payMethod`, alongside
the captured destination address (`fAddressName/…/fAddressProvince/fAddressDistrict/fAddressSubDistrict/
fAddressZIPCode/fAddressTel/fAddressTel2`). Evidence: the admin row query
`forwarder-action.php:111-118` selects `payMethod, …, fShipBy, …, fAddressZIPCode, …` and reconstructs the full
address via `CONCAT(…fAddressProvince…' '…fAddressZIPCode…)`. The pay-on-arrival sums also read these
(`calPrice.php:21`, `getListPayForwarder.php:82-86`). So **address is a snapshot on the order, not a live FK** to
`tb_address` — important: editing the address book later does not change a placed order's ship-to.

---

## 4. Pay-on-arrival at the Thai warehouse (status 5 → ชำระเงิน) — the WHICH-status / WHICH-charge answer

### 4.1 The status spine (`statusForwarderBadge` `member/include/function.php:581-592`)

```
1  รอสินค้าเข้าโกดังจีน
2  สินค้าถึงโกดังจีนแล้ว
3  กำลังส่งมาประเทศไทย
4  สินค้าถึงประเทศไทยแล้ว          ← goods physically at the Thai warehouse
5  รอชำระเงิน                       ← *** PAY-ON-ARRIVAL GATE *** (admin has priced it; customer must pay)
6  เตรียมส่ง                        ← paid → being dispatched on the Thai-leg carrier
7  ส่งแล้ว
```

So the "pay when goods arrive at the Thai warehouse, before final delivery" step = **fStatus transition 4→5→6**:
admin weighs/prices the arrived goods (sets `fStatus=5`), the customer pays, then it moves to 6 (เตรียมส่ง) and
ships via the chosen carrier with the chosen COD side.

### 4.2 The charge that's collected (`getListPayForwarder.php:116` + `calPrice.php:26`)

Per order, the payable total =

```
fTotalPrice            (China→Thailand freight, the rate × weight/cbm)
+ fTransportPrice      (Thai-leg delivery fee — 0 if payMethod=2/ปลายทาง or PCSF-free)
+ fPriceUpdate         (adjustment carried from a linked ฝากสั่ง order)
+ fShippingService     (service fee)
+ priceCrate           (ตีลัง crate)
+ fTransportPriceCHNTHB (in-China domestic transport)
+ priceOther           (misc)
− fDiscount
```
then **bill-level**: `+50฿` once if any PCSF row has `fTransportPrice=0` (`calPrice.php:40-42` /
`getListPayForwarder.php:221-237`, unless 50-exempt customer), and **−1% WITHHOLDING TAX** if juristic
(`userCompany=1`) and total ≥ 1000 (`getListPayForwarder.php:243-248`; note `calPrice.php:43-45` instead applies a
1% *discount* on the preview — the modal is the authoritative one). Wallet balance is deducted, remainder shown as a
PromptPay QR (`ppID="0105560160694"`) + slip upload (`getListPayForwarder.php:276-309`); submit posts
`paymentForwarderNew`. **Wallet top-up for this service is disabled** ("ระบบกระเป๋าตังไม่สามารถใช้งานได้กับบริการนี้แล้ว"
`getListPayForwarder.php:67-68`) — pay by QR/slip, not wallet credit.

> The eligibility filter for "what can be paid now" is **`(fStatus='5' OR fCredit=1)`** (`calPrice.php:21`,
> `getListPayForwarder.php:86`) — credit customers (`fCredit=1`) can pay/defer regardless of status.

---

## 5. Pacred current state (cross-ref) + GAP table

### 5.1 What exists in Pacred

| File | What it is |
|---|---|
| `lib/bkk-zip.ts` | `isFreeShippingZip(zip)` — **verbatim port** of the BKK+5-province whitelist (header cites `function.php:3-9`). PathumThani = `[]` (matches the `function.php` copy, NOT the `12000` copy — §1.1 drift). |
| `actions/forwarder.ts:40-170` `calForwarderPayTotal` | **Faithful port** of `calPrice.php` / `getListPayForwarder` sum — reads **`tb_forwarder`** (line 97), the `(fStatus=5 OR fCredit=1)` filter via `.or()`, PCSF +50, หนองแขม-exempt set, juristic −1%. ✅ |
| `app/[locale]/(protected)/service-import/[fNo]/page.tsx` | **Faithful port of `forwarder.php`** — reads `tb_forwarder` (lines 366, 539), renders the status-1..7 stepper, the cost breakdown at `fStatus>=5`, and the "ชำระเงิน" button at `fStatus=5`. ✅ pay-on-arrival entry exists + reachable. |
| `…/[fNo]/pay-from-wallet-button.tsx` | the pay action surface on the detail page. |
| `app/[locale]/(protected)/service-import/add/forwarder-form.tsx` | **the order-CREATE form** — see gaps below. |
| `actions/forwarder.ts` `createForwarder` (~line 576) | **writes the rebuilt `forwarders` table** (`.from("forwarders").insert(…)`). |

### 5.2 GAP table (per-item: legacy → Pacred → gap → fix)

| # | Item | Legacy (file:line) | Pacred state | GAP | Fix |
|---|---|---|---|---|---|
| C-1 | **Carrier select is free-text, not a list** | `getShipBy.php:59-61` + `optionHShipByCart3` `function.php:884-930` | `forwarder-form.tsx:306-308` `<input value={form.ship_by}>` | 🔴 No carrier registry, no `<select>`, customer types anything | Build a carrier registry (`lib/shipping/carriers.ts` from `nameShipBy` §A) + a `<select>` populated from it. |
| C-2 | **No zone→carrier gating** | `api-shipBy.php:50-557` / `optionHShipByCart3` in/out-zone branch | none (flat free-text) | 🔴 Out-of-zone (ตจว) customers aren't restricted to province-eligible carriers; in-zone aren't restricted to Flash/J&T+PCSF | Port the province→carrier map (`lib/shipping/carrier-zones.ts`) + a resolver `carriersForZip(zip, province, amphoe)`. Needs a Thai zip→{province,amphoe} dataset (port `raw_database.json` or a lookup table). |
| C-3 | **No ตจว vs กทม/ปริมณฑล UX at create** | `getDataAddressF.php:24-41` (disable + "**ไม่ใช่พื้นที่จัดส่งฟรี"), `checkFreeArea.php`, `getShipBy.php:36-51` | `forwarder-form.tsx:362-398` plain address fields; `isFreeShippingZip` exists but is **never called in the form** | 🔴 The zone helper is dead-imported (orphan) at order time | Call `isFreeShippingZip(postal)` on the postal field → drive the PCSF option + the carrier list + the free-area note. |
| C-4 | **No PCSF "PCS เหมาๆ/จัดส่งฟรี" selectable promo** | `getShipBy.php:36-51,110-136`; `optionHShipBy2:730-733`; `tb_settings.freeShipping` | `actions/forwarder.ts` computes the +50 math, but `forwarder-form.tsx` offers no PCSF choice | 🔴 Customer can never *pick* PCSF → the +50 / free-zone path is unreachable from the new UI | Add a PCSF promo checkbox (gated on in-zone or VIP) that sets `ship_by='PCSF'`, hides the carrier select, sets `fTransportPrice=0`. |
| C-5 | **COD not carrier-coupled** | `getShipBy.php:137-153` (hide for 2/11/24/PCS) + policy `check-payMethod.php:43-46` | `forwarder-form.tsx:300-305` static `<select>` always shown; no coupling | 🟠 Customer can pick "ปลายทาง" for Flash/ไปรษณีย์/J&T/self-pickup where legacy forbids it | When `ship_by ∈ {Flash(2), ไปรษณีย์(11), J&T(24), PCS, PCSF}` force `pay_method='origin'` + hide the selector; else show ต้นทาง/ปลายทาง. Seed default from the customer's saved `userPayMethod`. |
| C-6 | **No saved-address picker at order time** | `option-address-thai.php` (modal: last-added / last-ordered / main / self-pickup PCS + add/edit) → `getDataAddressF.php` | `forwarder-form.tsx` re-enters the address by hand every time (only seeds from one `defaultAddress`) | 🟠 No multi-address chooser; no "รับเองโกดัง PCS" self-pickup option | Add an address picker reading `tb_address` (+ a PCS self-pickup pseudo-option). On select → re-resolve carriers/zone. |
| C-7 | **Per-customer overrides not modeled** | `user-shipby-freedom.json` / `user-vip-maomao.json` / `user-not-50.json` (+ admin pages `check-customer-*`) | none | 🟠 PCSFAM-style free-choice, VIP-maomao-outside-zone, 50฿-exempt customers can't be honoured | Model as override flags/table (`shipping_overrides`), checked in the carrier resolver + the +50 calc. (The +50-exempt หนองแขม set is already half-ported in `actions/forwarder.ts`.) |
| C-8 | **Zip whitelist drift** | `12000` present in `api-shipBy.php`/`checkFreeArea.php`/etc. but absent in `function.php`/`getShipBy.php` | `lib/bkk-zip.ts` chose the **empty** PathumThani variant | 🟠 ปทุมธานี 12000 customers fall out of the free zone (may be wrong) | Decide canonical set with owner; recommend including `12000`. Centralize so there is ONE list. |
| C-9 | **(cross-cutting) Split-brain table** | n/a | `createForwarder` writes **`forwarders`** (rebuilt, ~0 rows in prod); `[fNo]` detail, lists, and `calForwarderPayTotal` read **`tb_forwarder`** | 🔴 **§0e dead-write**: a new order placed via the Pacred form lands in `forwarders` and is **invisible** to the detail page / pay flow / admin (all `tb_forwarder`). The COD/carrier the customer sets never reaches any consumer. | Out of this workstream's *primary* scope but blocks it: repoint `createForwarder` to `tb_forwarder` (matching legacy columns `fShipBy`,`payMethod`,`fAddress*`), OR confirm a sync. Flag to the lead — see §6. |

---

## 6. ⚠️ Cross-cutting blocker discovered — the `forwarders` vs `tb_forwarder` split-brain

While auditing the COD/carrier persistence path I confirmed a §0e trap that **must** be resolved for this workstream
to mean anything:

- **Write path:** `actions/forwarder.ts` `createForwarder` → `.from("forwarders").insert(…)` (rebuilt table; lines 576-577).
  Reads for detail/edit/list/audit also hit `forwarders` (lines 427, 477, 706, 824, 891, 914).
- **Read path that matters:** the pay-on-arrival sum `calForwarderPayTotal` reads `tb_forwarder` (line 97); the
  faithful detail page `service-import/[fNo]/page.tsx` reads `tb_forwarder` (lines 366, 539); the admin back-office
  reads `tb_forwarder`. Prod `tb_forwarder` holds the ~8,898-customer real history; `forwarders` is a near-empty rebuilt twin.

**Consequence:** an order created through the current Pacred create form (with whatever ship_by/pay_method the
customer sets) is written to `forwarders` and is **never seen** by the status-5 pay flow or admin. So even if we built
the perfect zone→carrier→COD UI on top of the current `createForwarder`, the data would evaporate. This is the same
class of bug catalogued for `/admin/settings` yuan_rate etc. (CLAUDE.md §0e). **Recommend the lead decides the
create-path table BEFORE building C-1..C-7** — the cleanest is to make `createForwarder` write `tb_forwarder` with
the legacy column names (so the customer's COD/carrier/address snapshot lands where every consumer reads).

> This is reported, not fixed (audit-only). It is in-scope to FLAG because it directly governs whether the address /
> carrier / COD fields this workstream is about ever reach a consumer.

---

## 7. Concrete build plan (sequenced)

**Phase 0 — unblock (lead decision).** Resolve C-9: point `createForwarder` at `tb_forwarder` (legacy columns
`fShipBy`, `payMethod`, `fAddressName/…/fAddressZIPCode`, `fStatus=1`) OR confirm the sync that makes `forwarders`
reach the consumers. Nothing below ships value until this is settled.

**Phase 1 — the carrier registry + zone resolver (pure data, no UI).**
1. `lib/shipping/carriers.ts` — the ID→name map (port `nameShipBy` §A: ids 1-47 + `PCS`,`PCSF`,`PCSE`,`F`).
2. `lib/shipping/carrier-zones.ts` — the province→carrier map + region sets (`$south/$north/$central/$northeast`),
   ported from `api-shipBy.php:50-557` (the customer copy is canonical; cross-check `check-shipby.php`). Include the
   amphoe-conditional carriers (17,20,28,31, …).
3. `carriersForZip(zip, province, amphoe, opts)` resolver: in-zone (`isFreeShippingZip`) → `[Flash(2), J&T(24)]` +
   `PCSF` (gated); out-of-zone → `[Flash(2)] ∪ province-matched`. Honour overrides (Phase 4).
4. A Thai zip→{province,amphoe} dataset: port `raw_database.json` to `lib/shipping/th-postal.json` or reuse the
   Pacred address-picker dataset if it already carries province+amphoe. **Add unit tests** (zone in/out, a couple of
   amphoe-conditional carriers, the +50 trigger) per the test-coverage discipline.

**Phase 2 — wire the create form (C-1..C-5).** In `forwarder-form.tsx`:
- Replace the free-text `ship_by` with a `<select>` populated by `carriersForZip(...)`, re-resolved whenever the
  postal/province/address changes.
- Add the PCSF promo checkbox (gated on in-zone or VIP) → sets `ship_by='PCSF'`, hides carrier, zeroes Thai delivery.
- Couple COD: force `pay_method='origin'` + hide the selector for `ship_by ∈ {2,11,24,PCS,PCSF}`; otherwise show
  ต้นทาง/ปลายทาง defaulting from the customer's saved `userPayMethod`.
- Show the legacy free-area note / disable out-of-zone PCSF. Confirm-before-submit per §0f.

**Phase 3 — saved-address picker (C-6).** A modal/select reading `tb_address` (last-added / last-ordered / main /
"รับเองโกดัง PCS" self-pickup), porting `option-address-thai.php`; on select, snapshot the address onto the order and
re-resolve carriers.

**Phase 4 — per-customer overrides (C-7).** A small override store (table or config) for: free-carrier-choice
(PCSFAM-class), VIP-maomao-outside-zone, 50฿-exempt. Read it in the resolver + the +50 calc (the หนองแขม-exempt
piece is already in `actions/forwarder.ts`). Admin maintenance UI mirrors `check-customer-*` pages.

**Phase 5 — reconcile the zip list (C-8).** Pick the canonical PathumThani set (recommend incl. `12000`),
centralize on `lib/bkk-zip.ts`, delete the inline copies' divergence.

**Already faithful (leave as-is):** the status-5 pay-on-arrival modal + the payable-total math (`calForwarderPayTotal`
+ `service-import/[fNo]`). Just ensure (Phase 0) that newly-created orders reach them.

---

## Appendix A — canonical carrier ID→name registry (port `nameShipBy` `member/include/function.php:91-148`)

```
1  DHL Express                      17 วันชนะ แอนด์ วันณิสา ขนส่ง        33 แพปลา​สมบัติ​วัฒนา
2  Flash Express                    18 สมพงษ์อุบลรัตน์ ขนส่ง             34 ทวีทรัพย์ระยอง
3  J.K. เอ็กซ์เพรส                   19 อาร์.ซี.อาร์ เพลส                 35 ศิริสมบูรณ์
4  Kerry Express                    20 ตองสอง ขนส่ง                     36 นิวสอง อัศวินขนส่ง
5  Nim Express                      21 นิ่มซี่เส็งขนส่ง 1988             37 โชคสถาพรขนส่ง
6  S & J ขนส่งด่วนสุพรรณบุรี          22 ธนาไพศาล ขนส่ง                   38 ทรัพย์สมบูรณ์ถาวร
7  SB สมใจขนส่ง                      23 PL ขนส่งด่วน                     39 MNB Transport
8  SCG Express                      24 J&T Express                      40 หจก.โชคพูลทรัพย์ขนส่ง 2014
9  เคพีเอ็น                          25 มังกรทองขนส่ง 2019               41 สิรินครขนส่ง
10 เฟิร์ส เอ็กเพรส ขนส่ง             26 PM ชลบุรี ขนส่งด่วน              42 พาณิชย์การขนส่ง KSD
11 ไปรษณีย์ไทย                       27 ทรัพย์ปรีชา                      43 นวรรณขนส่ง
12 จันทร์สว่างขนส่ง                  28 พัฒนาเอ็กซ์เพลส                  44 กุญชรมณี ขนส่ง
13 ธนามัย ขนส่งด่วน                  29 หาดใหญ่ทัวร์                     45 บริษัท เอ็มพอร์ท โลจิสติกส์ จำกัด
14 บุญอนันต์ขนส่ง                    30 หาดใหญ่ โอ.พี. 2012              46 ซี.เอ็น.ทรานสปอร์ต
15 พี.เจ. ด่วนอีสาน ขนส่ง            31 อาร์.ซี.เอ็กซเพรส                47 ภูเก็ตแหลมทองขนส่ง
16 มะม่วงขนส่ง                       32 สี่สหาย

Sentinels:  PCS = รับเองโกดัง PCS กทม (self-pickup) · PCSF = PCS เหมาเหมา (free-zone promo) ·
            PCSE = PCS Express · F = บริษัทจัดหาให้อัตโนมัติ (auto-assigned)

payMethod:  1 = ต้นทาง (origin-pay) · 2 = ปลายทาง (destination / true COD)   [namePayMethod, function.php:629 / pcs-admin function.php:1682]
fStatus:    1 รอเข้าโกดังจีน · 2 ถึงโกดังจีน · 3 กำลังส่งมาไทย · 4 ถึงไทยแล้ว · 5 รอชำระเงิน(pay-on-arrival) · 6 เตรียมส่ง · 7 ส่งแล้ว
```
