# D1 Fidelity Audit — Customer Portal · Legacy PCS vs Pacred

> **Purpose / วัตถุประสงค์:** the rigorous, per-screen, per-element gap map for
> **Phase B** of [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md). The owner
> rejected Pacred because it looks + behaves nothing like the legacy **PCS Cargo**
> portal that ~8,898 existing customers use daily. D1 = Pacred must become a
> **faithful, wholesale copy** of legacy PCS — identical layout, identical button
> positions, identical workflow loops — rebranded `PCS`→`PR` only — and only THEN
> enhanced. Migrated customers must feel **zero change**.
>
> This doc is the precise map of where Pacred **diverges** from legacy today.
> A Phase-B builder reads a screen's table and knows exactly what to change.
>
> **Companion / cross-links:** [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md) —
> the prior lighter gap map (workflow + status + container model; read it for the
> back-office + DB-model context). This doc is the **rigorous customer-portal**
> half — it supersedes that doc's §1 "Customer portal" + §4 "Customer" bullet with
> screen-level detail. Also: [`poom-phase-b-prep.md`](poom-phase-b-prep.md),
> [`poom-d1-open-questions.md`](poom-d1-open-questions.md).
>
> **Sources audited (read-only):**
> - Legacy = `/Users/dev/Desktop/pcscargo/member/` — PHP customer portal:
>   `menu.php` (dashboard), `login.php`, `register.php`, `shops.php` + `cart.php`
>   (order flow), `forwarder.php` + `forwarder-table.php` (import flow),
>   `payment.php` (ฝากชำระ), `20260311wallet.php` + `wallet.php` (wallet),
>   `address.php` + `china-address.php` (address book),
>   `account-settings.php` + `profile.php` (account), plus
>   `include/{left-menu,top-menu,header}.php`.
> - Pacred = this repo — `app/[locale]/(public|protected|auth)/` + their
>   components, `components/sections/{protected-sidebar,navbar,top-menu}.tsx`.
>
> **Legend for the "gap" column:** 🔴 paradigm gap (whole screen rebuilt) ·
> 🟠 layout/position gap (elements moved) · 🟡 missing element · 🟢 extra
> (Pacred-only — usually keep but de-emphasise) · ⚪ low-risk / cosmetic.
>
> **Rebrand rule throughout:** every legacy `PCS` / `PCS Cargo` / `PCS<num>`
> becomes `PR` / `Pacred` / `PR<num>`. Where this doc says "match legacy" it
> always means *match legacy structure, rebranded* — never copy the literal
> string `PCS`.

---

## 0. Executive summary — the customer-portal fidelity verdict

Pacred's customer portal is a **competent modern rebuild that shares almost no
surface with legacy PCS**. It is not "PCS with a new skin" — it is a different
app that happens to do similar things. The ~8,898 migrated customers will hit a
wall of unfamiliarity on **every screen**. Severity ranking:

| # | Fidelity gap | Severity | Screens affected |
|---|---|---|---|
| 1 | **No 9-icon launchpad.** Legacy post-login = one icon-grid home screen. Pacred = a stats/banners "Dashboard" + a left sidebar. The single most recognisable PCS surface is gone. | 🔴🔴 | Dashboard |
| 2 | **Persistent left sidebar that doesn't exist in legacy customer portal.** Legacy customer has a *collapsible* `pcs-left-menu` (hamburger-toggled, hidden by default on the icon-grid). Pacred shows an always-on desktop sidebar with different grouping + different items. | 🔴 | Every protected screen |
| 3 | **Order flow split + renamed.** Legacy `shops/` = a Taobao/1688 **link-paste search** that adds products; `cart/` = the cart. Pacred `/service-order/add` is a **manual product form** with no link-search, and `/service-order` is a status-tab list. The defining PCS "paste a link" entry point is missing. | 🔴 | Order flow |
| 4 | **Import-status order inverted** (pay-then-ship vs legacy ship-arrive-then-pay) — see `d1-phase-b-gap-map.md` §2; the customer-facing tab labels + order in `/service-import` differ from `forwarder.php`. | 🔴 | Import flow |
| 5 | **Wallet is 3 screens, legacy is 1 screen / 4 tabs.** Legacy `wallet/` has 4 in-page tabs (เดินบัญชี / เติมเงิน / ชำระเงิน / ถอนเงิน) + a top-up modal. Pacred splits into `/wallet/history` `/wallet/deposit` `/wallet/withdraw`. | 🟠 | Wallet |
| 6 | **Top chrome differs.** Legacy `top-menu.php` = a brand bar with a **product-search box**, a **cart icon with badge**, a notification bell, language flag. Pacred protected pages render the **public marketing NavBar** (red social bar + mega-menu). The in-app top bar is a marketing header, not an app header. | 🟠 | Every protected screen |
| 7 | **Sales-rep card position.** Legacy: a fixed card high on the dashboard *and* pinned in the sidebar. Pacred: a card at the top of `/dashboard` + a sidebar card only when expanded. Close but not pinned. | 🟡 | Dashboard / sidebar |
| 8 | **Extra Pacred-only customer modules** with no legacy equivalent: `/freight`, `/bookings`, `/commissions/me`, `/refunds`, `/my-issues`, `/shipments`. Legacy customer had none of these as customer-facing screens. Keep them (they are real Pacred scope) but they must not crowd the legacy launchpad. | 🟢 | Sidebar / dashboard |

**Phase-B headline:** restore the **9-icon launchpad** as the post-login home,
restore the **app top bar** (search + cart badge), re-merge wallet to one
screen, and rebuild the order entry as a **link-paste search**. Everything
else is element-position alignment.

---

## 1. Member dashboard / launchpad — `menu.php` → Pacred post-login home

**Legacy route:** `member/menu.php` — reached at `member/` root after login;
this is the screen a customer sees first, every session.

**Pacred route:** `/dashboard` (`app/[locale]/(protected)/dashboard/page.tsx`).
Note: Pacred login redirects a non-admin user to `/` (the public home), **not**
`/dashboard` — see login `dest = res.data?.isAdmin ? "/admin" : (nextUrl ?? "/")`.
So a migrated customer logs in and lands on the **marketing homepage**, not any
portal screen. 🔴 First fidelity break of the session.

### 1.1 Legacy `menu.php` layout (top → bottom)

1. **Red gradient header band** (`bg-gradient-x-danger bg-box`, rounded bottom
   corners) containing:
   - top-right: two icon buttons — **แก้ไขข้อมูล** (edit profile, opens modal) +
     **ตั้งค่าบัญชีผู้ใช้งาน** (→ `account-settings/`).
   - centred: **circular avatar** (80px) with a small camera button to change
     photo (opens crop modal — dropify + croppie).
   - below avatar: **ชื่อ-นามสกุล** (white H2) + **รหัสสมาชิก : PCS####** (white H5).
2. **Wallet card** — a white rounded card overlapping the red band
   (`.col-123`, absolute, pulled up −45px): label **"กระเป๋าสตางค์ (บาท)"**,
   the balance as a large animated counter, the PCS logo, a full-width gold
   progress bar. The whole card is a link → `wallet/`.
3. **Sales-rep card** (`box-sale-main`) — circular admin photo (55px) + **"ผู้ดูแล"**
   + **"เซลล์ <nickname>"** + **"Tel : <phone>"** (tappable `tel:` link).
4. **The 9-icon grid** — a `row text-center`, each cell `col-4` (→ **3 columns ×
   3 rows** on all widths). Each icon is a 70px PNG + an `<h4>` label. Order:

   | pos | icon | label | href |
   |---|---|---|---|
   | 1 | pcs-shops | ฝากสั่งสินค้า | `shops/` |
   | 2 | pcs-forwarder | ฝากนำเข้าสินค้า | `forwarder/` |
   | 3 | pcs-forwarder | ประวัติใบเสร็จรายการนำเข้า | `receipt-f-hs/` |
   | 4 | pcs-payment | ฝากชำระ/โอน | `payment/` |
   | 5 | pcs-wallet | เป๋าตัง | `wallet/` |
   | 6 | pcs-wallet-add | เติมเงิน | `wallet/add/` |
   | 7 | pcs-wallet-drop | ถอนเงิน | `wallet/withdraw/` |
   | 8 | pcs-address | ที่อยู่จัดส่งสินค้า | `address/` |
   | 9 | pcs-log-out | ออกจากระบบ | `logout/` |

   No stats, no banners, no "recent orders" lists. The whole screen is the
   header + wallet + rep + grid. **That's it.**

### 1.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Post-login destination | Land on `menu.php` (the launchpad) | Non-admin lands on `/` (public marketing home) | 🔴 Change login redirect: non-admin → `/dashboard` (the rebuilt launchpad). `app/[locale]/(auth)/login/page.tsx` line ~68. |
| Red gradient header band | Full-width, rounded bottom, avatar + name + member code inside | `/dashboard` has a red gradient "greeting" section but it holds a kicker, `t("greeting")`, member code, and **rate chips** — no avatar, different content | 🟠 Rebuild the header band: centred avatar (80px, with edit-photo button), name, `PR####` code. Move the rate chips out (legacy had no rates here). |
| Avatar + inline edit | 80px circular avatar centred in band; camera button → crop modal | No avatar on dashboard at all (avatar lives only on `/profile`) | 🟡 Add avatar + camera/crop affordance to the dashboard header. |
| Edit-profile / settings icons | Two icons top-right of the red band | Not on dashboard | 🟡 Add the two top-right icon buttons (edit profile modal/link + → settings). |
| Wallet card | White card overlapping the band, balance as animated counter, gold progress bar, links to `wallet/` | Wallet is **one of four flat stat cards** in a grid lower down ("กระเป๋าสตางค์", number, no overlap, no counter animation) | 🟠 Restore the single prominent overlapping wallet card with the animated counter + progress bar, directly under the header band. |
| Sales-rep card | Photo + "ผู้ดูแล" + "เซลล์ <name>" + tappable phone, immediately under wallet | `<SalesRepCard>` rendered at the very top of `/dashboard`, **above** the greeting — wrong order, and it is a different card design | 🟠 Move `<SalesRepCard>` to **below** the wallet card; restyle to legacy `box-sale-main` (round photo left, text right). |
| **9-icon grid** | 3×3 icon launcher, the core PCS surface | **Absent.** Pacred has: a greeting w/ 4 quick-action text buttons; admin banners; a 4-card stats row; two "recent" lists | 🔴🔴 **Build the 9-icon grid** as the dashboard's primary block. 3 columns, PNG/Lucide icon + Thai label per legacy order/labels. This is the #1 Phase-B item. |
| `receipt-f-hs/` icon | Grid slot 3 — "ประวัติใบเสร็จรายการนำเข้า" | No top-level entry; receipts live under `/service-import/receipts` (sidebar sub-item) | 🟡 Add grid icon "ประวัติใบเสร็จรายการนำเข้า" → `/service-import/receipts`. |
| `เติมเงิน` / `ถอนเงิน` icons | Grid slots 6 & 7 — first-class icons | Demoted into the Wallet accordion sub-menu | 🟡 Surface เติมเงิน + ถอนเงิน as their own launchpad icons. |
| `logout` icon | Grid slot 9 — explicit icon | Logout only in the navbar user dropdown | 🟡 Add a launchpad logout icon (legacy users expect it on the grid). |
| 4-card stats row | — (legacy had no stats on the dashboard) | Pacred adds 4 stat cards (orders / imports / payments / wallet count) | 🟢 Pacred-only. Acceptable as a *secondary* row **below** the icon grid; do not let it replace the grid. |
| "Recent orders" + "Recent forwarders" lists | — (not in legacy `menu.php`) | Two-column recent-activity lists | 🟢 Pacred-only. Keep below the grid as enhancement; legacy users reach lists via the icons. |
| Marketing banners (`<DashboardBanners>`) | — (not in legacy) | Admin-managed banner carousel on dashboard | 🟢 Pacred-only. Fine lower down. |
| Live rate chips (ฝากสั่ง / Alipay) | — (legacy showed rates inside each flow, not the dashboard) | Two rate chips in the greeting band | ⚪ Pacred-only; harmless but not faithful. Optionally move into the order/payment screens. |
| Page `<title>` | `โปรไฟล์ <userID> | PCS Cargo` | next-intl `dashboard` namespace title | ⚪ Rebrand → `… | Pacred`. |

**Phase-B build target for the dashboard:** red header band (avatar + name +
`PR####` + 2 corner icons) → overlapping wallet card (animated counter) →
sales-rep card → **9-icon grid**. Pacred's stats/banners/recent-lists may stay
as an *appended* lower section, clearly secondary.

---

## 2. Login — `login.php` → `/login`

**Legacy route:** `member/login.php`. **Pacred route:** `/login`
(`app/[locale]/(auth)/login/page.tsx`).

### 2.1 Legacy layout

A single centred card (`max-width-480`, `box-shadow-2`):
- card header: `<h4 class="line-on-side">เข้าสู่ระบบ</h4>` (text with side rules) +
  the **PCS logo** (`logo-text-dark.png`) + a line *"ยังไม่มีบัญชีผู้ใช้งาน?
  สร้างบัญชี"* (link to `register/`).
- form (`#form-login`):
  - label **"เบอร์โทรศัพท์หรือรหัสสมาชิก"** + text input (`userTelORuserID`,
    left user-icon, maxlength 20).
  - row: label **"รหัสผ่าน"** on the left, **"ลืมรหัสผ่าน?"** link on the right.
  - password input (left lock-icon, an eye toggle SVG, minlen 6 maxlen 20).
  - checkbox **"จำฉันไว้ในระบบ"** — *checked by default*.
  - submit button **"เข้าสู่ระบบ"** (`btn-main btn-block`, user-login icon).
  - bottom-right: a **language dropdown** (TH / EN / Chinese flags).
- a hidden `#form-resetpass` panel toggled by the "ลืมรหัสผ่าน?" link (inline
  phone → "ขอรหัสผ่านใหม่" → SMS OTP). **No social login. No "or continue with".**

### 2.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Card width / shape | `max-width-480`, square-ish, Bootstrap card shadow | `max-w-[520px]`, `rounded-[30px]`, soft shadow | ⚪ Close. Optionally narrow to ~480px, reduce radius for legacy feel. |
| Logo | PCS text-logo in the header | Pacred logo PNG, 76px circular-ish | ⚪ Already rebranded — correct. |
| Heading | `<h4 "line-on-side">เข้าสู่ระบบ` (text with side rules) | `<h1>` `t("title")`, plain centred | ⚪ Cosmetic; legacy "line-on-side" rule is a nice-to-match detail. |
| Identifier field label | **"เบอร์โทรศัพท์หรือรหัสสมาชิก"** | `t("emailLabel")` — Pacred copy mentions email | 🟡 Legacy login is **phone/member-code**, never email-first. Re-label to "เบอร์โทรศัพท์หรือรหัสสมาชิก"; member code is now `PR####`. |
| "ลืมรหัสผ่าน?" link | Inline, **right of the password label** | Present, right of password label, → `/forgot-password` | 🟢 Position matches. ⚪ Legacy opened an *inline* reset panel; Pacred routes to a page — acceptable. |
| "จำฉันไว้ในระบบ" checkbox | Present, **checked by default** | **Absent** — Pacred login has no remember-me | 🟡 Add a "จำฉันไว้ในระบบ" checkbox, checked by default. |
| Submit button | "เข้าสู่ระบบ" full-width | "เข้าสู่ระบบ" (`t("submit")`) full-width red | 🟢 Matches. |
| Social login block | **None** | A 3-button Google/LINE/Facebook block + an "or continue with" divider — currently **gated off** by `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` (renders greyed-out "COMING SOON") | 🟢 Already handled per D1 — the gate keeps it off and code comments cite the faithful port. For full fidelity, **hide the block entirely** (not greyed) until Phase C, since legacy showed nothing there. |
| Sign-up link | "ยังไม่มีบัญชีผู้ใช้งาน? สร้างบัญชี" in the **header** | "ยังไม่มีบัญชี? สมัครสมาชิก" at the **bottom** of the card | ⚪ Both exist; legacy had it up top. Low priority. |
| Language switcher | Flag dropdown bottom-right of the card | Handled by the NavBar `LocaleSwitcher` (TH/EN only) | ⚪ Pacred is TH/EN; legacy had TH/EN/Chinese. Acceptable. |
| Chrome around the card | Legacy login is a **blank-page layout** (no marketing header) | Pacred renders the full marketing `<NavBar>` + `<Footer>` | 🟠 Legacy login had no marketing chrome. Consider a minimal header on `/login` `/register` for fidelity (low priority — both are pre-portal). |
| Page `<title>` | `เข้าสู่ระบบ | PCS Cargo` | `login` namespace title | ⚪ Rebrand. |

---

## 3. Register — `register.php` → `/register`

**Legacy route:** `member/register.php`. **Pacred route:** `/register`
(`app/[locale]/(auth)/register/page.tsx`).

### 3.1 Legacy layout

One card, `<h4 "line-on-side">สมัครสมาชิก`. One long `multipart/form-data` form
(NOT a wizard — all on one page, juristic fields **revealed inline** by a radio):
- a read-only **"รหัสตัวแทนกลุ่ม"** (`coIDC`) when arrived via an agent link.
- radio **"ลูกค้า"**: `1` บุคคลธรรมดา (default) / `2` นิติบุคคล. Choosing
  นิติบุคคล reveals: เลขผู้เสียภาษี (13), ชื่อบริษัท, **ที่อยู่บริษัท** (บ้านเลขที่,
  ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ — Thai address autocomplete), 2 file uploads
  (ภพ.20 etc.).
- **ข้อมูลผู้ติดต่อ**: ชื่อจริง, นามสกุล.
- เบอร์โทรศัพท์ (intl-tel-input), อีเมล (**optional** — "ไม่ต้องกรอกก็ได้"),
  รหัสผ่าน (**6-30**).
- select **"ซื้อไปใช้เอง / ซื้อไปขาย"** (`shopUser`).
- select **"รู้จักเราจากช่องทางใด"** (`channel`) — **10 options** (Google / FB-IG
  ads / Youtube / banner / Tiktok / Twitter / friend / referred-user / Pantip /
  booth). Option 8 reveals a **referrer-code** input.
- checkbox **"termsOFService"** (accept terms — required).
- submit **"สมัครสมาชิก"** (`name=registerOTP`) → an **OTP panel** (`finalInput`,
  6-digit, ref-no, countdown, resend). After OTP a popup shows the assigned sales
  rep's photo + name + "ทีมเซลล์จะโทรเข้าไปแนะนำ".

### 3.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Form shape | One long single-page form; juristic fields revealed inline by a radio | Pacred uses **`FloatingTabs` (personal / juristic)** + the juristic path is a **3-step wizard** | 🟠 Different mental model. Legacy = one page, one radio. Pacred = tabs + wizard. For fidelity, consider personal/juristic as an **inline radio reveal** on one page; if keeping the wizard, ensure the personal path stays one screen. |
| Account-type control | Radio **"ลูกค้า: บุคคลธรรมดา / นิติบุคคล"** | Tab switcher (`personal` / `นิติบุคคล`) | 🟠 Convert to a radio pair, or accept tabs (low risk since both label correctly). |
| Contact fields | ชื่อจริง / นามสกุล | ชื่อจริง / นามสกุล | 🟢 Matches. |
| Phone | intl-tel-input, required | Phone field, required, drives OTP | 🟢 Matches. |
| Email | **Optional** ("ไม่ต้องกรอกก็ได้") | Email field labelled "ไม่จำเป็น" | 🟢 Matches — correctly optional. |
| Password | 6-**30** chars | "รหัสผ่าน 6-30 ตัวอักษร" | 🟢 Matches. |
| "ซื้อไปใช้เอง / ซื้อไปขาย" | A required `<select>` | **Absent** in Pacred register | 🟡 Add the use-self/resell select (legacy `shopUser` — feeds sales segmentation). |
| "รู้จักเราจากช่องทาง" | `<select>` with **10** options; option 8 → referrer code | Pacred has a **`SOURCES` icon picker with 8 options** (Line/FB/Google/Youtube/TikTok/IG/friend/ad) | 🟠 Pacred dropped Twitter, Pantip, booth, banner; merged to 8. Re-add the missing channels OR accept the 8-set. The **referrer-code reveal** must exist when "friend/referred" is picked — verify it does. |
| Referrer / agent code | Read-only `coIDC` when via agent link; manual referrer input on channel-8 | Verify Pacred captures a referrer code path | 🟡 Confirm agent-link + referrer-code capture exists; legacy customers referred by an agent expect it. |
| Terms checkbox | "termsOFService" required | Pacred has a terms-accept gate | 🟢 Matches. |
| OTP step | Post-submit OTP panel (6-digit, ref-no, countdown, resend) | Pacred has an OTP phase (`OtpInput`, countdown, resend) | 🟢 Matches — good fidelity here. |
| Post-register sales-rep popup | Popup: rep photo + name + "ทีมเซลล์จะโทรหา" | Verify Pacred shows a post-signup rep intro | 🟡 Add the assigned-rep confirmation screen/popup — sets the legacy expectation that a human will call. |
| Juristic address | Thai address fields w/ district/amphoe/province autocomplete | Wizard step 2 collects company address | ⚪ Verify the Thai-cascade autocomplete exists; legacy used `jquery.Thailand`. |
| Page `<title>` | `สมัครสมาชิก | PCS Cargo` | `register` namespace | ⚪ Rebrand. |

---

## 4. Order flow — `shops.php` + `cart.php` → `/service-order` (+ `/add`, `/cart`)

This is the **highest-divergence flow** after the dashboard. Legacy has **two
distinct screens** with a defining feature Pacred lacks entirely.

### 4.1 Legacy structure

**`shops.php` / `cart/add/`** — the **product search & add** screen. Top of the
page is a big search box: *"พิมค้นหาสั่งซื้อสินค้า + วางลิ้งสินค้า 1688 เถาเปา
แปลภาษาไทยทันที"* — the customer **pastes a Taobao/1688/Tmall URL** (or an image,
via the image-upload input) and the system fetches/translates the product, which
they then add to the cart. This paste-a-link entry is *the* iconic PCS workflow.
(`shops.php` is also the order-**list** with status tabs in one of its modes —
legacy reuses the file; the canonical order list is `shops/` with `?q=` tabs.)

The **order list** (`shops/`) — header "รายการฝากสั่งซื้อสินค้า" + a green
"เพิ่ม" circle-button; a **status tab bar** `<h4>สถานะรายการ</h4>`:

| tab | label | `?q=` |
|---|---|---|
| 1 | ทั้งหมด | (none) |
| 2 | รอดำเนินการ | `q=1` |
| 3 | รอชำระเงิน | `q=2` |
| 4 | สั่งสินค้า | `q=3` |
| 5 | รอร้านจีนจัดส่ง | `q=4` |
| 6 | สำเร็จ | `q=5` |
| 7 | ออเดอร์ที่ยกเลิก | `q=6` |

Each order row has per-row buttons: **"พิมพ์ใบเสร็จ"**, **"พิมพ์ใบแจ้งหนี้"**;
a bulk **"ยกเลิกออเดอร์รายการที่เลือก"**; a sticky bottom **"ชำระเงิน"** bar
showing `จำนวนรายการ : NN`.

**`cart.php`** — the cart: a Thai delivery-address selector (top), the line-items
table (columns: checkbox / รูป / ราคาต่อชิ้น / จำนวน / ราคารวม, a "ลบ" per row),
a **transport selector** (รถ EK / เรือ SEA radios with truck/ship images), a
**crate option** (ตีลังไม้ / ไม่ตีลังไม้ radios), a "โปรโมชันสำหรับคุณ" block,
and a **"สรุปรายการสั่งซื้อ"** panel (รวม / เรทแลกเปลี่ยน / ราคารวมสุทธิ) with the
final **"สั่งซื้อสินค้า"** button. **Cart cap = 151 items** (`151 - countCart`).

### 4.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| **Link-paste product search** | Big search box on `shops/` / `cart/add/`: paste a 1688/Taobao/Tmall URL (or upload an image) → fetch + translate → add to cart | `/service-order/add` is a **manual product form** (`AddItemForm`) — name, price, qty typed by hand; no URL fetch, no image search | 🔴🔴 **Build the link-paste search** as the order entry point. This is the defining PCS feature; manual entry is alien to migrated customers. |
| Order-list header | "รายการฝากสั่งซื้อสินค้า" + green "เพิ่ม" circle-button | "รายการฝากสั่งซื้อสินค้า" + "เปิดรถเข็น" + "สั่งสินค้าเพิ่ม" buttons in a card header | 🟠 Close. Legacy "เพิ่ม" was a small green circle-button; Pacred uses two pill buttons. Acceptable; align labels. |
| Status tab bar | 7 tabs (ทั้งหมด / รอดำเนินการ / รอชำระเงิน / สั่งสินค้า / รอร้านจีนจัดส่ง / สำเร็จ / ยกเลิก), `?q=` | `TAB_DEFS` — 7 tabs, same set, `?q=` param | 🟢 **Tab set + order match well.** ⚪ Pacred's last tab key is `cancelled`; legacy `q=6`. Functionally equivalent. |
| Per-row print buttons | "พิมพ์ใบเสร็จ" + "พิมพ์ใบแจ้งหนี้" on every order row | Verify `/service-order` rows expose receipt + invoice print | 🟡 Confirm both print actions exist per row; legacy users print constantly. |
| Bulk cancel | "ยกเลิกออเดอร์รายการที่เลือก" — checkbox-select + bulk cancel | Verify Pacred order list supports multi-select cancel | 🟡 Add bulk-cancel if absent. |
| Sticky "ชำระเงิน" bar | Bottom bar w/ selected-count, animated, → pay | Pacred pays per-order from the order detail page | 🟠 Legacy let you select multiple then pay from a sticky bar. Re-add the multi-select + sticky pay bar for fidelity. |
| Cart — address selector | Thai delivery-address picker at the **top** of `cart.php` | `CartManager` pre-fills the default address | 🟢 Functionally present; verify it is a *selector* (switch address), not just a prefill. |
| Cart — line-items table | Columns: ☑ / รูป / ราคาต่อชิ้น / จำนวน / ราคารวม / ลบ | `CartManager` table | ⚪ Verify column order + a per-row "ลบ" + qty stepper match. |
| Cart — transport selector | รถ (EK) / เรือ (SEA) radios **with images** | Verify cart has the transport radios | 🟡 Confirm truck/sea selector with the legacy image style. |
| Cart — crate option | ตีลังไม้ / ไม่ตีลังไม้ radios (default ไม่ตีลังไม้) | Verify cart exposes crate choice | 🟡 Confirm the crate radio pair exists. |
| Cart — promo block | "โปรโมชันสำหรับคุณ" checkboxes (เหมาๆ promo, free-50-baht) | Likely absent | ⚪ Legacy-specific promo UI; low priority, flag for Phase C. |
| Cart — summary panel | "สรุปรายการสั่งซื้อ": รวม / เรทแลกเปลี่ยน / ราคารวมสุทธิ + "สั่งซื้อสินค้า" | `CartManager` shows yuanRate + serviceFee + a checkout button | 🟢 Present; align labels to legacy ("ราคารวมสุทธิ", "สั่งซื้อสินค้า"). |
| Cart 151-item cap | Hard cap 151 items per cart | Verify Pacred enforces / shows the cap | ⚪ Confirm; legacy showed "remaining slots". |
| Page `<title>` | `รายการฝากสั่งซื้อสินค้า` / `รถเข็นสินค้า` ` | PCS Cargo` | namespace titles | ⚪ Rebrand. |

---

## 5. Import / forwarder flow — `forwarder.php` → `/service-import` (+ `/add`)

**Legacy route:** `member/forwarder.php` (full view) + `forwarder-table.php`
(table view). **Pacred route:** `/service-import` + `/service-import/add`.

### 5.1 Legacy structure

`forwarder.php` header has a **two-tab view switch**: "รายการฝากนำเข้าสินค้าแบบ
เต็ม" (`forwarder/`) vs "รายการฝากนำเข้าสินค้าแบบตาราง" (`forwarder-table/`) — two
ways to view the same data. Plus a green "เพิ่มรายการนำเข้า" button.

Below: a **status tab bar** `<h4>สถานะรายการ</h4>` — **9 tabs**:

| tab | label | `?q=` | maps to `fStatus` |
|---|---|---|---|
| 1 | ทั้งหมด | (none) | — |
| 2 | รอเข้าโกดัง | `q=1` | 1 |
| 3 | ถึงโกดังจีนแล้ว | `q=2` | 2 |
| 4 | กำลังส่งมาไทย | `q=3` | 3 |
| 5 | ถึงไทยแล้ว | `q=4` | 4 |
| 6 | **รอชำระเงิน** | `q=5` | 5 ← pay happens HERE, after arrival |
| 7 | เตรียมส่ง | `q=6` | 6 |
| 8 | กำลังจัดส่ง | `q=6.1` | 6 (sub-state) |
| 9 | ส่งแล้ว | `q=7` | 7 |
| + | เครดิตสินค้า | `q=c` | (credit users only) |

The **add modal** ("สร้างออเดอร์ฝากนำเข้าสินค้า") — fields: เลข Tracking,
รายละเอียด, รูปสินค้า (optional), จำนวนกล่อง, transport (รถ EK / เรือ SEA radios
w/ images), crate (ตีลังไม้/ไม่). Header has badges → "ที่อยู่โกดังจีน" +
"เช็คเรทนำเข้า". Bottom of the list: a sticky **"ชำระเงิน"** bar.

### 5.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| **Status tab order** | ship → arrive → **THEN pay** ("รอชำระเงิน" is tab 6 of 9, *after* "ถึงไทยแล้ว") — the cargo COD model | Pacred `TAB_DEFS`: `pending_payment` is tab **2** (right after "ทั้งหมด"), *before* the in-transit/arrived tabs | 🔴 **Workflow inversion.** Re-order Pacred's import tabs to legacy: ทั้งหมด → รอเข้าโกดัง → ถึงโกดังจีน → กำลังส่งมาไทย → ถึงไทยแล้ว → **รอชำระเงิน** → เตรียมส่ง → กำลังจัดส่ง → ส่งแล้ว. (Same finding as `d1-phase-b-gap-map.md` §2 — here it is the customer-screen action.) |
| Tab count | **9** tabs (+ credit) | Pacred has **8** tabs | 🟡 Pacred merged/dropped: "เตรียมส่ง" vs "กำลังจัดส่ง" (legacy splits `q=6` / `q=6.1`); legacy "รอเข้าโกดัง"+"ถึงโกดังจีน" are 2 tabs, Pacred has "ถึงโกดังจีนแล้ว" (1). Re-expand to the 9-tab legacy set. |
| Tab labels | "รอเข้าโกดัง", "ถึงโกดังจีนแล้ว", "กำลังส่งมาไทย", "ถึงไทยแล้ว", "เตรียมส่ง", "กำลังจัดส่ง", "ส่งแล้ว" | "รอชำระเงิน", "ถึงโกดังจีนแล้ว", "กำลังส่งมาไทย", "ถึงไทยแล้ว", "กำลังจัดส่ง", "ส่งแล้ว" | 🟠 Add the missing "รอเข้าโกดัง" + "เตรียมส่ง" labels; match wording exactly. |
| "เครดิตสินค้า" tab | A `q=c` tab for credit-line users | Verify a credit tab/filter exists for enrolled customers | 🟡 Add credit-items tab gated on credit enrolment. |
| Full vs table view switch | Two-tab "แบบเต็ม / แบบตาราง" view toggle | Pacred has **one** list view | 🟡 Add the table-view alternative (`forwarder-table.php` equivalent) — legacy power users use it. |
| Add modal vs add page | Legacy = a **modal** on the list page; Pacred = a separate `/service-import/add` route | `/service-import/add` is a full page (`ForwarderForm`) | 🟠 Legacy added imports without leaving the list. Either restore an add-modal or accept the route (low risk; verify field parity). |
| Add fields | เลข Tracking, รายละเอียด, รูปสินค้า (optional), จำนวนกล่อง, transport, crate | `ForwarderForm` collects transport_type, weight, volume… (and a booking prefill) | 🟡 Verify field parity: legacy keys on **Tracking number + box count**, not weight/volume at creation (weight is measured at the warehouse). Align. |
| Header quick-links | Badges → "ที่อยู่โกดังจีน" + "เช็คเรทนำเข้า" | `/service-import` header has a `MapPin` link | ⚪ Add a "เช็คเรทนำเข้า" link badge too. |
| Sticky "ชำระเงิน" bar | Multi-select + sticky pay bar | Pay per-row from detail | 🟠 Same as order flow — re-add multi-select + sticky pay. |
| Container code badge | — (legacy `fCabinetNumber` is a free-text field, shown in row detail) | Pacred shows a `cargo_containers` code badge per row | 🟢 Pacred-only enhancement; harmless. |
| Page `<title>` | `รายการฝากนำเข้า | PCS Cargo` | namespace | ⚪ Rebrand. |

---

## 6. Payment (ฝากชำระ/โอนหยวน) — `payment.php` → `/service-payment`

**Legacy route:** `member/payment.php`. **Pacred route:** `/service-payment` (+ `/add`).

### 6.1 Legacy structure

Header "รายการฝากชำระสินค้า/ฝากโอนหยวน" + a green "เพิ่มรายการ" button. A
**3-tab** status bar `<h5>สถานะรายการ</h5>`: ทั้งหมด / รอดำเนินการ (`q=1`) /
สำเร็จ (`q=2`) / ไม่สำเร็จ (`q=3`). A **table**: วันที่สร้าง / เลขที่ออเดอร์ /
รายละเอียด / วิธีการชำระ / ยอดรวม(บาท) / สถานะ / ตัวเลือก.

**Gate:** the whole page is blocked unless the customer *"เคยชำระเงินบริการ
ฝากสั่งซื้อ หรือ ฝากนำเข้าสินค้ามาก่อน"* — a big red banner shows otherwise.

The **add modal** ("สร้างออเดอร์ฝากชำระสินค้า"): a `payType` select (legacy
shows option `2` = "โอนเข้าบัญชี Alipay ร้านค้าจีน"), `payDetail` textarea,
`certifiedTrueCopy` file upload (the China invoice/QR), `payYuan` amount with a
live THB calc.

### 6.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Status tabs | **3** tabs: ทั้งหมด / รอดำเนินการ / สำเร็จ / ไม่สำเร็จ (4 incl. all) | Pacred `TAB_DEFS`: **6** tabs — ทั้งหมด / รอตรวจสอบ / กำลังโอน / สำเร็จ / ไม่สำเร็จ / คืนเงินแล้ว | 🟠 Pacred added `processing` ("กำลังโอน") + `refunded` ("คืนเงินแล้ว"). For fidelity collapse to the legacy 3-state (รอดำเนินการ / สำเร็จ / ไม่สำเร็จ) — or keep extra states but verify the customer-facing labels read like legacy. |
| Status label | "รอดำเนินการ" | Pacred `pending` → "รอตรวจสอบ" | ⚪ Re-label `pending` to "รอดำเนินการ" to match legacy wording. |
| First-payment gate | Page **blocked** until the customer has paid for ฝากสั่ง/ฝากนำเข้า before | Verify Pacred enforces the same gate | 🟡 Confirm `/service-payment` shows the "ต้องเคยชำระบริการก่อน" gate; legacy enforced it to curb fraud. |
| Table columns | วันที่สร้าง / เลขที่ออเดอร์ / รายละเอียด / วิธีการชำระ / ยอดรวม / สถานะ / ตัวเลือก | Pacred table: วันที่ / ช่องทาง / ผู้รับ-รายละเอียด / ยอด CNY / ยอด THB / สถานะ / หลักฐาน | 🟠 Pacred dropped "เลขที่ออเดอร์", split amount into CNY+THB, renamed "ตัวเลือก"→"หลักฐาน". Re-add an order-number column; legacy users reference it. |
| Rate banner | — (legacy showed rate inside the add modal calc) | Pacred shows a purple "เรทแลกเปลี่ยน Alipay" banner on the list | 🟢 Pacred-only; harmless enhancement. |
| Add: modal vs page | Legacy = modal on the list; Pacred = `/service-payment/add` page | Separate page | 🟠 Acceptable; verify fields. |
| Add fields | payType select, payDetail textarea, certifiedTrueCopy upload, payYuan + live THB | Verify `/service-payment/add` parity | 🟡 Confirm: a recipient/detail field, a slip/invoice **upload**, a CNY amount with live THB. |
| Channel options | Legacy `payType` — Alipay (and historically WeChat/bank) | Pacred `CHANNEL_LABEL`: Alipay / WeChat / Bank | 🟢 Superset of legacy — fine. |
| Page `<title>` | `รายการฝากชำระเงิน | PCS Cargo` | namespace | ⚪ Rebrand. |

---

## 7. Wallet (กระเป๋าสตางค์) — `20260311wallet.php` → `/wallet/*`

**Legacy route:** `member/20260311wallet.php` (the current wallet; older
`wallet.php` etc. are superseded). **Pacred routes:** `/wallet/history`,
`/wallet/deposit`, `/wallet/withdraw` — **three** routes.

### 7.1 Legacy structure

**One screen.** Breadcrumb (หน้าแรก / กระเป๋าสตางค์). A balance card with a
**"เติมเงินเข้ากระเป๋า"** button. Below — **4 in-page tabs** (`data-toggle="tab"`):

| tab | label | content |
|---|---|---|
| 1 | รายการเดินบัญชี | the running statement (default) |
| 2 | รายการเติมเงิน | top-up history |
| 3 | รายการชำระเงิน | payment history |
| 4 | รายการถอนเงิน | withdrawal history |

The **top-up modal** ("เติมเงินเข้าเป๋าตัง"): bank details (ธนาคารกสิกรไทย,
account no + PromptPay, each with a **copy** button), a **"สร้าง QR Code ชำระเงิน"**
button, a slip upload (`imagesSlip`), a "ดูวิธีการเติมเงิน" link, and the
**withdrawal conditions** list (ถอนได้เมื่อเคยชำระบริการ; ต้องแนบบัตร ปชช + หน้า
สมุดบัญชี; ขั้นต่ำ 25 บาท; ค่าธรรมเนียม 25 บาท ถ้า < 500). Submit "เติมเงิน".

### 7.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Screen count | **One** wallet screen, 4 in-page tabs | **Three** routes: `/wallet/history`, `/wallet/deposit`, `/wallet/withdraw` | 🟠 Re-merge to **one** `/wallet` screen with 4 in-page tabs (เดินบัญชี / เติมเงิน / ชำระเงิน / ถอนเงิน). Keep `/deposit` `/withdraw` as deep-links if needed, but the default surface is the 4-tab page. |
| In-page tabs | 4 tabs: รายการเดินบัญชี / รายการเติมเงิน / รายการชำระเงิน / รายการถอนเงิน | `/wallet/history` has 4 tabs — `TAB_DEFS`: รายการเดินบัญชี / รายการเติมเงิน / รายการชำระเงิน / รายการถอนเงิน | 🟢 **Tab set matches** — good. The gap is only that they live on `/wallet/history`, not the wallet root. |
| Balance card | One card, "เติมเงินเข้ากระเป๋า" button | Pacred shows balance with cashback/credit buckets | 🟠 Legacy showed a single cash balance. Pacred surfaces cashback + credit too — keep but make the main cash balance dominant, legacy-style. |
| Top-up = modal | "เติมเงิน" opens a **modal** with bank info + QR + slip upload | Pacred `/wallet/deposit` is a **full page** | 🟠 Restore a top-up **modal** off the wallet screen (or accept the page; verify it has bank details + copy buttons + QR + slip upload). |
| Bank details + copy | กสิกรไทย acct + PromptPay, each with a copy-to-clipboard button | Verify `/wallet/deposit` shows Pacred bank details w/ copy buttons | 🟡 Confirm; rebrand the account to Pacred's. |
| "สร้าง QR Code" | A button to generate a PromptPay QR | Verify deposit flow offers a QR | 🟡 Confirm a QR generator exists. |
| Withdrawal conditions | A visible bullet list of the 4 rules | Verify `/wallet/withdraw` shows the rules (min 25฿, fee 25฿ < 500฿, ID+bankbook docs, must-have-paid-before) | 🟡 Confirm the conditions list is shown — legacy users rely on it. |
| `credit` wallet | Legacy had a *separate* `wallet-credit.php` for credit users | Pacred folds credit into the one wallet (`CreditLinePanel`) | 🟢 Pacred-only consolidation; acceptable. |
| Page `<title>` | `กระเป๋าสตางค์ | PCS Cargo` | namespace | ⚪ Rebrand. |

---

## 8. Address book — `address.php` (+ `china-address.php`) → `/addresses`

**Legacy route:** `member/address.php` (Thai delivery addresses) +
`china-address.php` (China-warehouse address — a near-empty info page).
**Pacred route:** `/addresses`.

### 8.1 Legacy structure

`address.php` — breadcrumb-less card "ที่อยู่จัดส่งสินค้าในไทย" + a green
"เพิ่มที่อยู่" button. A list of address cards; each card has 3 buttons:
**"ลบที่อยู่"** (red), **"แก้ไขที่อยู่"** (orange), **"ตั้งเป็นที่อยู่หลัก"** (blue)
— the default address shows a "ที่อยู่หลัก" badge instead. The **add/edit modal**
("เพิ่มที่อยู่จัดส่งสินค้า"): ชื่อจริง, นามสกุล, เบอร์โทร, เบอร์โทร2 (optional),
บ้านเลขที่, ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ (Thai autocomplete), หมายเหตุ, +
hidden lat/long (map pin). The top-bar user-dropdown also links **"ที่อยู่โกดังจีน"**.

### 8.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Page title | "ที่อยู่จัดส่งสินค้าในไทย" | "ที่อยู่จัดส่งสินค้าในไทย 🇹🇭" | 🟢 Matches (Pacred adds a flag emoji — fine). |
| Add button | Green "เพิ่มที่อยู่" circle-button, top-right | `AddressesManager` add affordance | ⚪ Verify an "เพิ่มที่อยู่" button exists, top-right. |
| Per-card buttons | 3 buttons: ลบที่อยู่ / แก้ไขที่อยู่ / ตั้งเป็นที่อยู่หลัก | Verify `AddressesManager` cards expose all 3 actions | 🟡 Confirm delete + edit + set-default; legacy users expect all three on each card. |
| "ที่อยู่หลัก" badge | Default address shows a badge instead of the set-default button | Verify the default card shows a distinguishing badge | 🟡 Confirm. |
| Add/edit modal fields | ชื่อ, นามสกุล, เบอร์, เบอร์2, บ้านเลขที่, ต/อ/จ/ไปรษณีย์ (autocomplete), หมายเหตุ | Verify `/addresses` form parity | 🟡 Confirm field set; ensure **เบอร์โทร2** (secondary phone, optional) + **หมายเหตุ** exist. |
| Thai address autocomplete | district/amphoe/province/zip cascade | Verify Pacred has the Thai cascade | ⚪ Confirm autocomplete; legacy used `jquery.Thailand`. |
| Map pin (lat/long) | Hidden lat/long captured via a map | Likely absent | ⚪ Low priority; legacy captured a pin. Flag for Phase C. |
| **China-warehouse address** | `china-address.php` — a (mostly empty) info page; also linked "ที่อยู่โกดังจีน" from the top-bar | Pacred has public `warehouses/*` pages + `service-import/warehouse-addresses` | 🟠 Legacy customers expect a **"ที่อยู่โกดังจีน"** link reachable from inside the portal (top-bar dropdown). Add an in-portal China-warehouse address link/page. |
| "← กลับโปรไฟล์" link | — (legacy address page stood alone) | Pacred adds a "กลับโปรไฟล์" link | ⚪ Pacred-only; harmless. |
| Page `<title>` | `ที่อยู่จัดส่งสินค้าในไทย | PCS Cargo` | namespace | ⚪ Rebrand. |

---

## 9. Account settings + profile — `account-settings.php` / `profile.php` → `/profile`

**Legacy routes:** `account-settings.php` (password change) + `profile.php`
(profile detail/edit; the edit form also appears as a **modal on `menu.php`**).
**Pacred route:** `/profile` (one page: `ProfileForm` + `AvatarPanel` +
`SecurityPanel`).

### 9.1 Legacy structure

`account-settings.php` — a card "ตั้งค่าบัญชีผู้ใช้งาน <userID>", a name header,
and a **"เปลี่ยนรหัสผ่านใหม่"** form: รหัสผ่านเดิม, รหัสผ่านใหม่, ยืนยันรหัสผ่านใหม่
(each 6-20, with inline validation messages), buttons ยกเลิก / "เปลี่ยนรหัสผ่านใหม่".

Profile editing in legacy is the **`menu.php` modal** ("แก้ไขข้อมูลโปรไฟล์"):
ชื่อจริง, นามสกุล, อีเมล (with async dup-check), เบอร์โทร (async dup-check),
วันเกิด, เพศ, เฟสบุ๊ค, ไอดีไลน์ — and a separate avatar crop modal.

### 9.2 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Profile edit surface | A **modal** off the dashboard (`menu.php`) | A dedicated `/profile` page (`ProfileForm`) | 🟠 Legacy edited profile in a modal from the launchpad. Pacred uses a page. Acceptable — but the **dashboard must keep an "แก้ไขข้อมูล" entry point** (see §1: the two corner icons). |
| Profile fields | ชื่อ, นามสกุล, อีเมล, เบอร์, วันเกิด, เพศ, เฟสบุ๊ค, ไอดีไลน์ | Verify `ProfileForm` field set | 🟡 Confirm parity; legacy captured **วันเกิด, เพศ, เฟสบุ๊ค, ไอดีไลน์** — re-add any missing. |
| Email / phone dup-check | Async "is this taken" check on blur | Verify Pacred validates uniqueness | ⚪ Confirm; legacy did a live check. |
| Avatar | A crop modal (dropify + croppie) on the dashboard | `/profile` has an `AvatarPanel` | 🟠 Move/duplicate an avatar affordance onto the dashboard header (§1) — legacy changed the photo from the launchpad. |
| Password change | A standalone `account-settings.php` page | `/profile` `SecurityPanel` (Pacred also has `/profile/security/change-phone`) | 🟠 Legacy had a *dedicated* "ตั้งค่าบัญชีผู้ใช้งาน" page reachable from the dashboard corner-icon. Pacred folds it into `/profile`. Acceptable IF the dashboard corner-icon routes there; otherwise re-add the route. |
| Password rules | old / new / confirm, 6-**20** | Verify `SecurityPanel` rules (note register allows 6-30 — legacy account-settings used 6-20; reconcile) | ⚪ Align the min/max; pick one consistent rule. |
| Page `<title>` | `ตั้งค่าบัญชีผู้ใช้งาน <userID> | PCS Cargo` | namespace | ⚪ Rebrand. |

---

## 10. Shipment tracking — legacy tracking → `/shipments`

**Legacy:** there is **no dedicated customer "shipments" screen** in `member/`.
Tracking in legacy PCS is **per-order**: the customer opens an order/forwarder
detail (`shops/<hNo>`, `forwarder/` row) and reads its status + the `fTrackingTH`
/ `fTrackingCHN` numbers there. The order/forwarder **status tabs** *are* the
tracking UI. There is also a top-bar product-search, not a shipment-tracking box.

**Pacred route:** `/shipments` + `/shipments/[code]` — a first-class
customer-facing shipment list keyed to the `cargo_shipments` / `cargo_containers`
spine, with status pills, a freshness indicator, and a per-shipment timeline.

### 10.1 Per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Customer "shipments" screen | **Does not exist.** Tracking = the status of an order/forwarder, read on its detail page | A whole `/shipments` list + `[code]` detail with timeline + freshness pill | 🟢 **Pacred-only.** This is genuinely *better* than legacy and is real Pacred cargo-spine scope — **keep it**. But: it must not be presented as a *primary* launchpad icon (legacy has no such icon), and the **order/forwarder detail pages must still show tracking inline** (legacy's actual mental model). |
| Tracking numbers on detail | `fTrackingCHN` (China) + `fTrackingTH` (Thailand) shown on the forwarder detail | Verify `/service-import/[fNo]` shows both tracking numbers | 🟡 Confirm the import-detail page surfaces CHN + TH tracking — that is where legacy customers look. |
| Status = the tabs | The forwarder/order status tabs are how customers "track" | Pacred has the tabs **and** `/shipments` | 🟢 Fine — just ensure the tabs (§4, §5) are faithful. |
| Sidebar entry | — | Pacred sidebar has a `/shipments` "Truck" item | 🟢 Acceptable as a sidebar item; do not promote it onto the 9-icon grid. |

**Verdict:** `/shipments` is the one place where Pacred *exceeds* legacy and
should **not** be removed for fidelity — but legacy customers will instinctively
look at the **order/forwarder detail** to "track", so inline tracking there is
mandatory. Treat `/shipments` as a bonus, not the primary tracking surface.

---

## 11. Cross-cutting chrome — navigation that wraps every protected screen

This is a screen-independent fidelity gap and a Phase-B workstream of its own.

### 11.1 Legacy customer chrome

- **`top-menu.php`** — the in-app top bar: hamburger toggle, the **brand**
  ("PCS Cargo"), a **product-search form** (`action=search/`, the "พิมค้นหา…
  วางลิ้ง" box + an image-upload search), a **cart icon with a live badge**, a
  **notification dropdown**, a **language flag** dropdown, a user dropdown.
- **`left-menu.php`** — the customer sidebar (`#pcs-left-menu`, `menu-accordion`,
  **collapsible / hamburger-toggled**, hidden by default on the icon-grid). Items:
  user block (โปรไฟล์ / ตั้งค่า / ออกจากระบบ) · sales-rep card pinned in the menu ·
  หน้าแรก · ระบบสมาชิก · **บริการฝากสั่งสินค้า** (sub: รายการทั้งหมด / รอชำระเงิน /
  รถเข็น / เพิ่มสินค้า — each with a count **badge**) · **บริการฝากนำเข้า** (sub:
  รายการทั้งหมด / รอชำระเงิน / รายการเครดิต* / ประวัติใบเสร็จ / เพิ่ม) · **บริการ
  ฝากชำระ/โอน** · **กระเป๋าสตางค์เงินสด** (เดินบัญชี / ถอนเงิน / เติมเงิน) ·
  กระเป๋าสตางค์เครดิต* · ประวัติตัวแทน* · ที่อยู่จัดส่งสินค้า. (`*` = conditional.)

### 11.2 Pacred customer chrome

- Protected pages render the **public marketing `<NavBar>`** — a red social-icon
  strip + the marketing mega-menu (`TopMenu`) + a `SearchBar` + `CartBadge` +
  `NotificationBell` + theme/locale toggles + a user dropdown.
- A **`ProtectedSidebar`** (`components/sections/protected-sidebar.tsx`) —
  desktop, **always-on** (collapsible 64↔208px), `hidden lg:flex`. Its `MENU`:
  หน้าแรก · Dashboard · ฝากสั่ง (group) · ฝากนำเข้า (group) · ฝากชำระ (group) ·
  Wallet (group) · **Freight (group)** · **Shipments** · **Commissions** ·
  **Refunds** · Addresses · Profile · Notifications · Sales — badges on some.

### 11.3 Gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Top bar identity | An **app** top bar (`top-menu.php`) — brand, search, cart, bell, flag | The **marketing** NavBar (red social strip + mega-menu) | 🟠 Protected pages should render an **app top bar**, not the marketing header. Build a portal top bar: brand → product-search → cart-badge → bell → user. |
| Product-search box | In the top bar, on every screen — paste-a-link search | `SearchBar` exists in the NavBar | 🟡 Verify the in-portal search is the **product link/image search** (→ adds to cart), not a site search. Legacy's is the Taobao/1688 paste box. |
| Cart icon + badge | Top bar, persistent, live item-count badge | `CartBadge` in the NavBar | 🟢 Present — verify it shows the live count and links to the cart. |
| Notification bell | Top bar dropdown | `NotificationBell` | 🟢 Present. |
| Sidebar — default state | **Collapsible, hidden by default** (hamburger); the icon-grid is the nav | Sidebar **always shown** on desktop (`lg:flex`) | 🟠 Legacy customers navigate via the **icon grid**, with the sidebar as a hamburger extra. Pacred's always-on sidebar competes with (a missing) grid. Once the grid exists (§1), make the sidebar secondary/optional. |
| Sidebar — item set | Order / Import / Payment / Wallet + Address + agent-history + profile | Adds **Freight, Shipments, Commissions, Refunds** as top-level items | 🟢 Extra items are real Pacred scope — keep, but they bloat vs legacy's tight set. Group the non-legacy items under one "เพิ่มเติม"/Freight section so the legacy items stay prominent. |
| Sidebar — count badges | **Every** legacy menu item has a live-count badge | Pacred has badges on *some* (`serviceOrderPending`, etc.) | 🟡 Extend badge coverage to match legacy (รถเข็น count, รอชำระ counts, credit-error count). |
| Sales-rep in sidebar | A rep card **pinned** in the menu | Pacred shows a rep card **only when expanded** | 🟡 Pin the rep card so it shows in both states (legacy always showed it). |
| "ระบบสมาชิก" / "หน้าแรก" split | Legacy had both a "หน้าแรก" (public site) and "ระบบสมาชิก" (portal) link | Pacred sidebar has "หน้าแรก" (→ `/`) + "Dashboard" | ⚪ Roughly equivalent; align labels. |
| Logout placement | In the sidebar user block **and** the icon grid | NavBar user dropdown only | 🟡 Add logout to the sidebar user area + the grid (§1). |

---

## 12. Phase-B build checklist (customer portal — priority order)

Ordered by fidelity impact. Each line is a discrete Phase-B task; severities
carry over from the tables above.

1. 🔴🔴 **Dashboard = 9-icon launchpad.** Rebuild `/dashboard` as: red header
   band (avatar + name + `PR####` + 2 corner icons) → overlapping wallet card
   (animated counter) → sales-rep card → **3×3 icon grid** (§1.1 order/labels).
   Demote Pacred's stats/banners/recent-lists to an appended secondary section.
2. 🔴🔴 **Login redirect.** Non-admin → `/dashboard`, not `/`.
3. 🔴🔴 **Order entry = link-paste search.** Rebuild `/service-order/add` (or a
   new `/service-order/search`) as a Taobao/1688/Tmall **URL/image paste** that
   fetches + translates a product into the cart. Manual entry stays as a fallback.
4. 🔴 **Import status order.** Re-order `/service-import` tabs to legacy
   ship→arrive→**pay** (§5.2); re-expand to the 9-tab set.
5. 🟠 **Wallet = one screen, 4 tabs.** Make `/wallet` the 4-tab page; keep
   deposit/withdraw as deep-links + restore the top-up modal.
6. 🟠 **App top bar.** Replace the marketing NavBar on protected pages with a
   portal top bar (brand · product-search · cart-badge · bell · user).
7. 🟠 **Order/payment multi-select + sticky pay bar** (§4.2, §6 — restore the
   select-many-then-pay loop).
8. 🟠 **Sidebar fidelity.** Make it collapsible-secondary once the grid exists;
   group non-legacy items; full count-badge coverage; pin the rep card.
9. 🟡 **Login: re-add "จำฉันไว้ในระบบ"; re-label identifier to phone/member-code.**
10. 🟡 **Register: re-add "ซื้อไปใช้เอง/ขาย" select; verify referrer-code +
    post-signup rep popup; reconcile the channel list.**
11. 🟡 **Verify-and-align** the field-parity 🟡 items across cart, forwarder-add,
    payment-add, address-add, profile (tables §4–§9 — each "verify…" row).
12. 🟢 **Keep** `/shipments`, `/freight`, `/bookings`, `/commissions/me`,
    `/refunds`, `/my-issues` — real Pacred scope — but ensure they never crowd
    the legacy launchpad, and that order/import **detail** pages show tracking
    inline (legacy's actual tracking model).
13. ⚪ **Rebrand sweep:** every `<title>` and visible string `PCS`/`PCS Cargo`
    → `Pacred`; `PCS<num>` → `PR<num>`. (Per ADR-0017 — and the team's existing
    PCS-scrub guard for *borrowed APIs* does **not** apply to these
    customer-visible strings, which are pure branding.)

---

## 13. Notes / open questions for the Phase-B lead

- **Login chrome:** legacy `login.php` / `register.php` are blank-page layouts
  (no marketing header). This audit flags rendering the full marketing NavBar
  there as ⚪ low-risk — confirm with the owner whether the auth pages should be
  chrome-free for full fidelity.
- **`/shipments` keep-or-cut:** I judged it 🟢 keep (it is real cargo-spine
  scope and strictly better than legacy). If D1 is read *maximally* literally
  ("zero new screens"), it could instead be demoted to a non-grid sidebar item
  only. Owner call.
- **Wallet route shape:** legacy is one screen; whether to physically delete
  `/wallet/deposit` `/wallet/withdraw` or keep them as modal-equivalent
  deep-links is a builder's-discretion call — the *fidelity requirement* is only
  that the **default wallet surface is the 4-tab page**.
- **Field-parity rows (🟡 "verify…"):** several rows could not be 100% confirmed
  from a read of the page files alone — they depend on the child client
  components (`CartManager`, `ForwarderForm`, `AddressesManager`, `ProfileForm`,
  the `*/add` forms). A Phase-B builder should open each component and tick the
  parity rows; this audit lists *what* to check, not a confirmed yes/no.
- **Legacy file ambiguity:** `shops.php` doubles as both the product-search/add
  surface and (in a `?q=` mode) an order list; `cart.php` is the cart;
  `forwarder.php` vs `forwarder-table.php` are two views of imports;
  `20260311wallet.php` is the live wallet (older `wallet*.php` are dead). The
  tables above use the live files; the dead variants are out of scope.
- **Container / `tb_cnt` model, admin RBAC, barcode/QA queues** — those are
  back-office gaps and are covered by [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
  §3–§6, not repeated here (this doc is customer-portal only).

---

*End of customer-portal fidelity audit. Cross-links:
[ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md) ·
[`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md) ·
[`poom-phase-b-prep.md`](poom-phase-b-prep.md) ·
[`poom-d1-open-questions.md`](poom-d1-open-questions.md).*
