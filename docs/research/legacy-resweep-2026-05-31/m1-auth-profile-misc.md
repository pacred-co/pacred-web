# Re-sweep M1 — customer auth/profile/misc · 2026-05-31

**Slice:** customer-side auth + profile + addresses + search + the login-time
notification/popup gates. Read-only audit. Verified against live code at HEAD
(branch `dave-pacred`), NOT against the stale 2026-05-30 `_MASTER` audit.

## Honest verdict

**12 still-open gaps of ~24 legacy customer features audited in this slice; 1 is P0.**
The auth core (login + remember-me, register personal/juristic + DBD autofill,
forgot-password phone+email, OTP) and the data CRUD (profile→`tb_users`,
addresses add/edit→`tb_address`/`tb_address_main`, search URL/keyword→`tb_product`)
are **faithfully ported and correct** — better than the master audit implies.

The real hole is the **login-time popup-gate cluster**. Legacy `all-script.php`
fires up to **6 distinct auto-popups** on every member page load (7-15-day
re-verify OTP · admin-broadcast notify images · 1d/3d/past-due credit reminders ·
unread-receipt popup · order-note read popups). Pacred's `(protected)/layout.tsx`
**only addressed the ToS modal** (correctly omitted — legacy commented it out)
and silently dropped the other five — even though their underlying data
(`countFCredit`, `tb_notify`, `tb_receipt`) is real and, for credit, already
computed in `pcs-chrome.ts`. The single P0 is the missing **customer
delete/set-main-address** action: the buttons render but are **inert
`data-legacy-onclick` markers with no handler** — a customer literally cannot
remove or re-prioritise a saved shipping address (data-correctness / wrong-parcel
risk).

**OTP is NOT bypassed in prod.** `actions/otp.ts:51` —
`EMERGENCY_OTP_BYPASS === "true"`, default-FALSE / fail-closed. The 2026-05-30
"OTP fully bypassed" claim is STALE.

---

## Ledger (gaps only — ❌ / 💀 / ⚠️ / 🔌)

| # | Feature | Legacy file:line | Pacred file | Status | Reachable? | Sev | 1-line fix |
|---|---|---|---|---|---|---|---|
| 1 | **Customer delete-address** | `include/pages/address/deleteAddress.php` (soft-delete `tb_address.addressStatus='0'`, refuse if main) | `(protected)/addresses/page.tsx:275,365` (`data-legacy-onclick="deleteAddress(...)"`) | 🔌 inert — button renders, no JS/action behind it; the `adminDeleteAddress` in `actions/admin/customer-profile.ts:533` is admin-only | ❌ button visible but does nothing | **P0** | Add customer `deleteAddressAction` (soft-delete `addressstatus='0'`, refuse if `tb_address_main`), wire the button |
| 2 | **Customer set-main-address** | `include/pages/address/setMainAddress.php` (`UPDATE tb_address_main SET addressID`) | `(protected)/addresses/page.tsx:297,387` (`data-legacy-onclick="setMainAddress(...)"`) | 🔌 inert — no handler; `adminSetMainAddress` is admin-only | ❌ button visible, does nothing | **P0** | Add customer `setMainAddressAction` (UPSERT `tb_address_main`), wire the button |
| 3 | **7-15-day re-verify OTP gate** | `include/all-script.php:266-377` (auto-pop `#pcs-otp` when `tb_users_otp` has 0 rows for user + `tb_users_otp_hs` req <5/day → POST `verify-tel.php`) | none — `(protected)/layout.tsx` ports no re-verify gate | ❌ MISSING. `tb_users_otp` is only DELETED on phone-change (`profile/actions.ts:161`) + read in admin reports; nothing re-prompts an unverified customer | n/a | **P1** | Add a layout gate: if no `tb_users_otp` row → render a re-verify OTP modal (reuse `requestOtp`/`verifyOtp`, purpose `change_phone`) |
| 4 | **Admin-broadcast notify popups** | `include/all-script.php:615-691` (`tb_notify` WHERE now BETWEEN dateStart/dateExp AND id NOT IN read-set `tb_notify_read`; image popup, cookie 1h, special YT embed id=15) | none. Pacred `notifications`/`notification_reads` (`actions/notifications.ts`) is a **different**, per-user event feed keyed `profile_id` — NOT the admin image-broadcast carousel | 💀/❌ legacy `tb_notify`/`tb_notify_read` have **zero readers** in Pacred customer code | n/a (bell feed unrelated) | **P1** | Add a chrome reader for `tb_notify`/`tb_notify_read` + an image-popup modal in the protected layout (writer `userReadNotify`) — OR confirm with owner the bell-feed supersedes it |
| 5 | **Credit-due nudge popups (1d / 3d / past-due)** | `include/all-script.php:429-722` (auto-pop `#pcs-pay-credit1/3/error` from `tb_forwarder.fCredit` + `fCreditDate`) | counts only: `pcs-chrome.ts` `countFCredit`/`countFCreditError`; surfaced as a **badge** on the "ชำระ" floating tab → `/payment-due` (`floating-tabs.tsx:143`) | ⚠️ PARTIAL — reachable via badge, but the proactive auto-popup nudge is gone | ✅ via badge | **P1** | Add the 1d/3d/past-due auto-popups (data already in `pcs-chrome.ts`) OR accept badge-only as a deliberate Phase-C UX change |
| 6 | **Unread-receipt popup** | `include/all-script.php:384-426` (`tb_receipt` WHERE `rPopup=''` AND `reCompName<>''` → popup w/ "พิมพ์ใบเสร็จ" + `userReadReForwarder` writer) | none in protected layout | ❌ MISSING — no `tb_receipt.rPopup` reader on the customer side | n/a | **P2** | Add receipt-popup in layout reading `tb_receipt rPopup=''` (writer `userReadReForwarder`) |
| 7 | **Order-note read popups (hNote/fNote)** | `include/all-script.php:498-614` (`tb_header_order.hNoteUserRead='1'` shop-note + `tb_forwarder.fNoteUserRead='1'` import-note → popup + `userReadNoteShop`/`userReadNoteForwarder` writers) | none in protected layout | ❌ MISSING — customer is never auto-shown an admin note on an order/import | n/a | **P2** | Add note-popup readers in layout; writers `userReadNoteShop` / `userReadNoteForwarder` |
| 8 | **Reverse-image (camera) search** | `top-menu.php:106-112` camera `<input name="imagesSearch">` → `include/pages/search/searchIMG.php` (laonet `item_search_img`, taobao+1688) | `components/sections/search-bar.tsx:115` camera `<button type="button">` with **no onClick**; `lib/china-search/laonet.ts` + a `searchByImage` action exist but UI deferred (`service-order/add/link-paste-search.tsx:22`) | 🔌 inert — camera icon renders, clicking does nothing | ❌ icon visible, no action | **P1** | Wire the camera button to an image-upload → `searchByImage` (laonet) → results, or hide the icon until wired |
| 9 | **Search-log write** (`tb_history_key`) | `search.php:370-372` INSERT on every search render | `(protected)/search/page.tsx:268-277` — INSERT deliberately deferred (SC render must stay pure); a `SearchHistoryLogger` fire-and-forget exists but writes Pacred `search_history` (migration 0102), not `tb_history_key` | ⚠️ logs to rebuilt table, not legacy `tb_history_key` | ✅ | **P2** | Acceptable if admin reports read `search_history`; else point logger at `tb_history_key` |
| 10 | **Customer top-menu dropdowns** (about / promo / ที่อยู่โกดังจีน / ToS / privacy / contact) | `top-menu.php:58-76` "เกี่ยวกับเรา" dropdown w/ 11 marketing links | layout renders `<NavBar>` not `<PcsTopMenu>` (`layout.tsx:206`); `components/legacy/pcs-top-menu.tsx` (has the links) is **dormant/unused** | ⚠️ PARTIAL — links exist in a dead component; NavBar may not expose all 11 | partial | **P2** | Confirm NavBar exposes the key links (china-warehouse-address / ToS / promo); the rest are marketing-site nav |
| 11 | **`tb_keyword_product` popular-tag bar** | `top-menu.php:114-126` (renders clickable popular keywords from `tb_keyword_product`) | `pcs-chrome.ts:280` READS `tb_keyword_product`, but `search-bar.tsx` quick-keys come from i18n `searchBar.quick1..7` (hardcoded), NOT the table | ⚠️ data read but unused; tags are static i18n strings, not the live admin-managed `tb_keyword_product` rows | ✅ (static tags) | **P2** | Feed `search-bar.tsx` quick-keys from the `tb_keyword_product` rows already loaded in chrome |
| 12 | **DBD juristic autofill — legacy endpoint** | `api/check-juristic-person/index.php` (openapi.dbd.go.th v1 + dataapi.moc.go.th v2 fallback → name+address autofill) | `register-client.tsx:580` `/api/dbd/[taxId]` (CKAN 2.10 datastore_search) | ✅ ported (different endpoint, current API). Listed only as a note — **NOT a gap** | ✅ | — | none — verify `/api/dbd/[taxId]` route still resolves prod |

---

## Newly-found (not in the 2026-05-30 _MASTER audit)

The master audit (`docs/research/legacy-gap-2026-05-30/_MASTER.md`) framed the
customer side as "address buttons inert" generically. This slice pins down the
specifics it missed:

1. **The login-popup-gate cluster is 5 separate missing features, not one.**
   `all-script.php` is a single ~890-line gate file that fires re-verify OTP +
   notify images + 3 credit nudges + receipt popup + 2 order-note popups. Only
   the ToS modal (1 of 7) was consciously handled in `layout.tsx`; the other 5
   active gates were dropped without a note. (#3-#7 above.) The layout comment
   block claims faithfulness but only argues the ToS case.

2. **`tb_notify` / `tb_notify_read` have ZERO readers in Pacred** and are NOT
   the same thing as the rebuilt `notifications` table. Anyone reading the
   master audit might assume the notification feed covers it — it does not
   (admin can't broadcast a login-popup image to all customers). (#4.)

3. **Customer delete/set-main-address actions don't exist at all** — only the
   ADMIN equivalents (`adminDeleteAddress` / `adminSetMainAddress` in
   `actions/admin/customer-profile.ts`) were built. The customer page buttons
   are `data-legacy-onclick` strings the integrator never re-wired. The master
   audit said "address buttons inert" but didn't note the actions exist
   admin-side and just need a customer twin. (#1, #2 — the P0.)

4. **The camera/reverse-image search button is inert** (`search-bar.tsx`) with
   the backend (`laonet.ts` + `searchByImage`) already built — a pure
   wiring gap, not a build gap. (#8.)

5. **`tb_keyword_product` is loaded in chrome but unused** — popular-keyword
   tags are static i18n strings instead of the admin-managed table rows. (#11.)

6. **STALE-LABEL CORRECTION:** OTP is **NOT** bypassed in prod
   (`actions/otp.ts:51`, fail-closed). And DBD juristic autofill **IS** ported
   (`/api/dbd/[taxId]`). Both were either flagged or implied broken by older
   notes; both are fine now.

**Caveat — extract gap:** the legacy customer **full-page entry files**
(`login/index.php`, `register/index.php`, `profile/index.php`,
`search/index.php`, `account-settings/index.php`) are **⚠️ NOT present** in this
2026-05-24 extract — only the `include/pages/*` AJAX sub-handlers + the shared
chrome (`all-script.php`, `header.php`, `top-menu.php`). Field-level form
fidelity of those full pages could not be diffed line-by-line; this audit
verified them via the AJAX handlers + chrome + the Pacred ports' own
transcription headers (which cite specific legacy line numbers, implying the
author had the full files at port time).

---

## Count (this slice)

**P0: 1 · P1: 4 · P2: 5** (+ 2 ⚠️ partials that may be acceptable Phase-C
divergences: #5 credit-badge-vs-popup, #9 search-log table)

- **P0 (1):** #1+#2 customer delete/set-main-address (counted as one P0 fix —
  same file, same pattern).
- **P1 (4):** #3 re-verify OTP gate · #4 admin-broadcast notify popups · #5
  credit-due nudge popups · #8 reverse-image search wiring.
- **P2 (5):** #6 receipt popup · #7 order-note popups · #9 search-log table ·
  #10 top-menu dropdowns · #11 popular-keyword tags.
