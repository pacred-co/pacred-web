# PHP `pcscargo` deep audit — integrations + env (2026-05-14)

> **Source:** `C:\xampp\htdocs\pcscargo\member\` (customer) + `\member\pcs-admin\` (admin)
> **Why:** Pacred (Next.js port) hit "API blocked" issues wiring Taobao/1688 product search. Need verbatim spec of legacy PHP integrations to port correctly. เดฟ asked "เจาะมาทุกซอกทุกมุม"
> **Critical finding:** Pacred `lib/china-search/index.ts` is **wired to wrong endpoints**. PHP doesn't actually use RCGroup-TH (dead code in legacy too). Real product API = TAMIT-cloud + AkuCargo + Laonet. See §2-§4 + Pacred port followup task in `PORT_PLAN.md` Sprint 7+ Track G

---

## TL;DR — what production PHP actually does

```
user pastes URL → convertURLChinna() classifies →
  short-URL? → tam-i-t.com/api/convert-link-china/get/[/taobao] (cache lookup)
              ↓ if 204
              fetch URL itself (curl with desktop UA spoof) → scrape productID → save back to tam-i-t.com/save/
  full URL? → regex extract productID
→ call https://tamit-cloud.com/api-product/get/{1688|taobao}/?id={productID}
   (no auth headers; SSL verify off; 15s timeout; 3 retries; sleep(5) between)
→ render $json->data->{title, vendor, listImage, sku, skuMap, priceRanges, mainVedio, detail}
```

**Companion:** keyword search uses **AkuCargo**, image-similar uses **Laonet** (`key=tam011plus@gmail.com` literal email-as-key — same vendor that runs tam-i-t.com).

**RCGroup-TH = dead code in PHP** — `$APIKEY` flag never assigned anywhere → that branch never executes.

---

## 1. Hard-coded credentials / API keys / URLs (config layer)

**No `define()` constants for secrets exist** — *everything is inline in business logic files*. Two `config.inc.php` files only define DB + basePath.

### 1.1 Production DB (live secret in plain text)

| File | Content |
|---|---|
| `member\config\config.inc.php` (lines 12-15) + `member\pcs-admin\config\config.inc.php` (lines 18-21) | `$db_host = 'localhost'`, `$db_user = 'pcsc_pcs2'`, `$db_pass = 'P%F7*bu98NUB'`, `$db_name = 'pcsc_main'` (plus PDO mirror in admin) |

### 1.2 Server hostname routing

- Localhost detected via `$_SERVER['SERVER_NAME']=='localhost'` → `basePath` = `/pcscargo/member/`; production → `/member/`
- Production absolute URLs hardcoded: `https://pcscargo.co.th/member/...` (used in OAuth `redirect_uri`, mail templates, image links)
- `cPanel paths` hardcoded in cron scripts: `/home/pcscafym/public_html/member/...` (apprentice, send-line) **and** `/home/pcsc/public_html/member/...` (update-active-customers) — TWO different cPanel users, signal of a migration

### 1.3 All inline credentials/keys (across the codebase, by service)

| Service | Token / ID / pwd | Where (file:line) |
|---|---|---|
| **Facebook Graph SDK v3.2** | `app_id = 616147022451017`<br/>`app_secret = acefb36ee8bf522746823e1c0abaf621` | `member\fb-callback.php:5-7,51` |
| **Google Maps JS API** | `AIzaSyA3urnty1XJM38uaJi18yk3M_Nx2dHxEJU` | `member\address.php:145` (and `pcs-admin\map.php`) |
| **ThaiBulkSMS OTP v2** | `key = 1764539584235228`<br/>`secret = fefd5d805b76721a6b292416a55535de` | `member\login.php:95` (recover OTP — POST to `/v2/otp/request`)<br/>`member\api\otp\check-otp-recover.php:18` |
| **ThaiBulkSMS legacy** | `username = 0948782006`<br/>`password = 622168`<br/>`sender = PCSCargo` | `member\include\function.php:182-188` (`send_sms()`) — XML API at `http://www.thaibulksms.com/sms_api.php` |
| **Tiso AI SMS** | `apiSecret = mwz390ddx9cHeslPlYhQzelL7YR8Q3jFudZWm4pQICIEqtLFfBBhFIxHZgiIWFT7`<br/>`apiKey = dZWm4pQICIEqtLFfBBhFIxHZgiIWFT7`<br/>`customerID = PCSCargo` | `member\register.php:141-145, 201-205`<br/>`member\api\otp\check-otp.php:16-22`<br/>`member\api\otp\check-otp-register.php:15-21` |
| **TechSol SMS** *(same key/secret as Tiso!)* | identical credentials as Tiso | `member\verify-tel.php:19-25` (re-verify OTP)<br/>`member\pcs-admin\include\function.php:2851-2858` (`sendSMSAPI()`) |
| **LINE Notify Personal token** | `ILcTVlfT3RmCtnwsmg7JEZfvtzr8ML1Z4o0DeB85NnG` | `member\include\function.php:196` |
| **LINE Notify "TopUp Shops"** | `sEevWjwzqxQJqJBt1VUXf6logDcGs4NVm74otcN5nPE` | admin function.php:747+773 (lineNotifyTopUpShops + lineNotifyTopUp) |
| **LINE Notify "TopUp Forwarder"** | `GLt02QeM7uamWBPTpKKVorSE8YqzOpS8RGpHZQQlW8J` | function.php:248 + admin:799 |
| **LINE Notify "Shops orders"** | `L4DFVmFt3ehWchW1YmHd8VFhElQ4OOQZeiPZkSA3cDv` | function.php:274 + admin:825 |
| **LINE Notify "Forwarder orders"** | `3TlDUthIZimRe2BGn6GjKHVKR0BT9RycuForyCkgykm` | function.php:300 + admin:851 |
| **LINE Notify "Daily Sales Summary"** | `bb2BEqq1lS9gX2kVtYb1CTDL9DvwW1fjxLJ96H0HJm2` | `pcs-admin\api\autorun\send-line-sales\index.php:19` |
| **LINE Notify OAuth (customer subscribe)** | `client_id = plAEkDQ8ayiWoLZ0YSwzt9`<br/>`client_secret = lUQk1P0LBkcIFBP3U42HPcF6Qfz4zz8uSdWJMCysiYQ`<br/>`redirect_uri = https://pcscargo.co.th/member/api/linenotify/callback/index.php` | `member\api\linenotify\callback\index.php:3-5` |
| **LINE Notify OAuth (admin subscribe)** | `client_id = 4G0QlYx3x9BRL94COg76xR` | `pcs-admin\get-token-linenotify.php:26-27` |
| **JMF carrier sync (PCS↔JMF)** | `token = dZWm4pQICIEqtLFfBBhFIxHZgiIWFT7mwz390ddx9cHeslPlYhQzelL7YR8Q3jFu` (concatenation of Tiso key+secret) | `pcs-admin\api\update-forwarder\JMFCARGO\GET\index.php:11`<br/>`pcs-admin\api\update-forwarder\JMFCARGO\PUT\index.php:24` |
| **CargoThai TTP container API** | `_token = a807f4fe8c5bbf0010f6b3abfc52b4` | `pcs-admin\testAPITTP.php:8`, `include\pages\api-forwarder-ttp\processTable\processTable.php:11` |
| **CargoThai CN GetDetail variant** | `_token = aea07c4d3d1709313c4bb2d07a4702` | `pcs-admin\include\pages\api-forwarder-cn\processTable\GetContainer.php:18`, `pageUpdateAPI.php:87,253`, `GetDetail.php:15` |
| **TAMIT-cloud product API** | unauthenticated — `https://tamit-cloud.com/api-product/get/{1688\|taobao}/?id={productID}` | `pcs-admin\include\functions.php:100, 174, 191` (canonical resolver) + `pcs-admin\test-curl-tamit-cloud.php` |
| **TAM cache server** | unauthenticated — `https://tam-i-t.com/api/convert-link-china/{get,save}/...` | functions.php:37, 72, 121, 150 + `member\api\otp\check-otp-recover.php:23` |
| **TAM-i-T SMS proxy (admin)** | `key = Y3V6SG` (in URL) | `pcs-admin\test-sms2.php:57` |
| **PHPMailer SMTP (app emails — currently DISABLED)** | `Host = mail.tam-i-t.com:465 SSL`<br/>`Username = pcscargo@tam-i-t.com`<br/>`Password = )+zzgT9ve~2s`<br/>`From = no-reply@pcscargo.co.th` | `member\include\function.php:399-422` (`sendMail()`) + `pcs-admin\include\function.php:912-930` |
| **PHPMailer SMTP (test invoice mail)** | `Host = smtp.gmail.com:587 STARTTLS`<br/>`Username = info@pcscargo.co.th`<br/>`Password = bblf ftlg vucv qysz` (Gmail App Password) | `pcs-admin\api\send-mail\index.php:29-34` |
| **Google Sheets API (service account JSON)** | `pcs-admin\cryptic-album-325611-f8d67b670cf9.json` (project: `cryptic-album-325611`)<br/>Scope: `SPREADSHEETS_READONLY` | `pcs-admin\api\autorun\update-sheet-sang.php:8` |
| **Google Sheets IDs** | `15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk` (sangNew + CTT-New + MK + MX + gogo)<br/>`1zGyZoApdvsVN8UDOQ3c8tlUsa4FxyUvQhYKRV86xGzI` (cnt-hs)<br/>`13ufkMUoYGnz9sm4gQXiaFp9G6Lx1mRR9to0rqEVK0FA` (sang cost ref + cnt report)<br/>`1JKUjbJmFYLI6FisgqhWncuAWnkQY1aH678rUZDSDJAA` (1212 promo) | per files |
| **PromptPay (PCS Cargo legacy — Pacred ต้อง new)** | Bank account `064-174-3836` Kasikorn, PromptPay number `0-1055-64077-71-6`, Account name "บริษัท พีซีเอส คาร์โก้" | `include\pages\payment\QRPay.php:43-45` (HARDCODED) |

---

## 2. RCGroup-TH (1688/Taobao URL parser) — DEAD CODE in PHP

`convertURL.php` gated by `if($APIKEY && ...)` — **`$APIKEY` is never assigned** in the file or its includes. Branch never executes in production.

If it were to run (`member\convertURL.php:420-470`):
```php
$url = "https://rcgroup-th.com/api-china/api-search/taobao/?q=".$_GET['url']."&page=".$pageno;
// or "/api-search/" for 1688
$ch = curl_init($url);
// max_attempts=3, sleep(5) on retry, no auth header, SSL verify off
```
Response: `$json['datalist'][i]` with `item_url, image_value, thid_item_id` + `pImages` rewritten through `g.search{N}.alicdn.com → cbu01.alicdn.com`.

Old commented endpoint: `https://rcgroup-th.com/api-china/get/?id={productID}` (`dataAPI.php:39`)

> **Pacred implication:** Current `lib/china-search/index.ts` is wired to RCGroup. **Replace with TAMIT (§3) for product detail + AkuCargo (§4a) for keyword + Laonet (§4b) for image search.**

---

## 3. TAMIT-cloud — THE CANONICAL product API (active)

### 3a. Product detail — `convertURLChinna()` in `pcs-admin\include\functions.php:1-220`

URL classifier:
```
1688:    $API = "https://tamit-cloud.com/api-product/get/1688/?id=$productID";
taobao:  $API = "https://tamit-cloud.com/api-product/get/taobao/?id=$productID";
tmall:   $API = "https://tamit-cloud.com/api-product/get/taobao/?id=$productID"; // same as taobao
```
- **Auth:** none (no key, no header)
- **Method:** GET, no body
- **Response:** `$json->status == '200'` → `$json->data->{title, vendor, listImage, mainImage, sku[], skuMap[], priceRanges[], referencePrice, mainVedio, detail, provider, ...}`
- **Caller:** `member\include\pages\search\dataAPI.php`

### 3b. Short-URL cache (tk → productID)

Before calling TAMIT, `convertURLChinna` first checks a CACHE service:
- `https://tam-i-t.com/api/convert-link-china/get/?tk={tk}` (1688 short links `qr.1688.com/s/{tk}`)
- `https://tam-i-t.com/api/convert-link-china/get/taobao/?tk={tk}` (Taobao `m.tb.cn/{tk}`)
- If cache miss (status 204) → fetches the short URL itself with curl + USER_AGENT spoof to a desktop Firefox UA, scrapes the `Id%3D` / `Foffer%2F` / `id=` from response, then SAVES back via `/save/?tk=...&userID=...&provider={1\|2}&productID=...`

### 3c. Smoke test (admin)

`pcs-admin\test-curl-tamit-cloud.php` — hardcoded test fetch of `https://tamit-cloud.com/api-product/get/1688/?id=808456582517`

---

## 4. AkuCargo + Laonet (alternate / image-search providers)

### 4a. AkuCargo — keyword search + product detail (active fallback)

- Keyword search: `https://akucargo.com/api3/api-2022/search/v1/{taobao,'')}/?page_size={15\|36}&q={key}&page={N}&lang=zh-CN`
  - Files: `include\pages\search\search.php:47,50`, `search1.php`, `search2.php`, `search3.php`, `searchKey.php`
  - Response: `$json['items']['item'][i]` with `detail_url, pic_url, title, price, promotion_price, sales`
- Product detail v2: `https://akucargo.com/api3/api-2022/get/v2/?id={productID}` (1688) + `.../v2/taobao/?id={productID}`
  - File: `include\pages\search\searchURL.php:343, 371`
  - Used together with Laonet (below) — Laonet returns `item.item_imgs`, AkuCargo's v2 returns `data.mainVedio`. They are merged.
- **Auth:** none
- **Method:** GET, USER_AGENT = `"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:53.0) Gecko/20100101 Firefox/53.0"`

### 4b. Laonet (1688.laonet.online + laonet.online) — used for product detail + image search

- 1688 detail: `https://1688.laonet.online/index.php?route=api_tester/call&api_name=item_get&lang={zh-CN\|en\|th}&num_iid={productID}&is_promotion=1&key=tam011plus@gmail.com`
- Taobao detail: `https://laonet.online/index.php?route=api_tester/call&api_name=item_get&...`
- Image search (reverse-image): `?api_name=item_search_img&imgid={url}&key=tam011plus@gmail.com` (`searchIMG.php:52, 55`)
- Image upload (returns imgid): `?api_name=upload_img&imgcode={base64?}&key=tam011plus@gmail.com` (`searchIMG2.php:51, 54`)
- **Auth:** API key = `tam011plus@gmail.com` (literally an email as key — wrapper around the 3rd-party Taobao Open API)
- **Method:** GET

---

## 5. LINE integrations

### 5a. LINE Notify (LEGACY — EOL 2025-04-01)

**11 distinct send sites** (function.php customer:5 + admin:6) — all hit `https://notify-api.line.me/api/notify` POST with `Content-type: application/x-www-form-urlencoded`, header `Authorization: Bearer {sToken}`, body `message={url-encoded-message}`. SSL verify OFF. Tokens hardcoded inline (see §1.3).

| Function | Token | Trigger |
|---|---|---|
| `lineNotify` (customer + admin) | `ILcTVlfT...` | personal admin alerts (general) |
| `lineNotifyTopUpShops` | `sEevWjwz...` | wallet topup for shop orders |
| `lineNotifyTopUp` | `sEevWjwz...` (same) | wallet topup variant |
| `lineNotifyTopUpForwarder` | `GLt02QeM...` | forwarder topup wallet |
| `lineNotifyShops` | `L4DFVmFt...` | new shop order |
| `lineNotifyForwarder` | `3TlDUthI...` | new import order |
| `sendLineNotify($token,$msg)` | dynamic | reusable; daily-sales cron uses `bb2BEqq1...` |
| `sendLine` / `sendLine2` / `sendLine3` (admin function.php:1231-1361) | dynamic | with optional sticker/image attachments (multipart/form-data) |
| **+ stored per-user token in `tb_users.userLineNotify`** | each customer's own | OAuth subscribe flow (§5b); read by JMF/PUT to push status updates to user's own LINE |

### 5b. LINE Notify subscribe/revoke (OAuth flow)

- **Customer subscribe**: redirect to `https://notify-bot.line.me/oauth/authorize?response_type=code&client_id={plAEkDQ8...}&redirect_uri={...}&scope=notify&state={csrf}`
- **Customer callback**: exchanges `code` for `access_token` at `https://notify-bot.line.me/oauth/token` via `file_get_contents` (NOT curl) with `grant_type=authorization_code`. Saves to `tb_users.userLineNotify`
- **Customer revoke**: POST to `https://notify-api.line.me/api/revoke` with current `Bearer {token}` → on success NULLs out `tb_users.userLineNotify`
- **Admin subscribe**: parallel pair at `pcs-admin\get-token-linenotify.php` (`client_id=4G0Q...`)

### 5c. LINE OA (Messaging API)

**No LINE Login OAuth code exists**. There IS endpoint `member\api\getLineOA.php` that receives a `user_line_id` POST (presumably from LINE OA chatbot/admin) and stores it in `tb_users.userLineIDOA`. Reads use it for personalized push but the actual push code is missing — likely lives in the LINE OA chatbot/Make.com/N8N etc., NOT in this repo.

> **Pacred implication:** Pacred has **NEW** LINE Messaging API channel (creds set 2026-05-14):
> - Channel ID: `2009931373`
> - Channel Secret: `51b428ebc490190e35660bfc816dc30a`
> - Long-lived access token: stored in `.env.local` as `LINE_CHANNEL_ACCESS_TOKEN`
>
> Pacred uses LINE Messaging API push (`api.line.me/v2/bot/message/push`) NOT LINE Notify. `lib/notifications/index.ts` already has the right shape — just need to set `LINE_PUSH_BYPASS=false` in production Vercel env to activate

---

## 6. SMS gateways (4 of them, 3 active)

| Gateway | Endpoint | Active? | Used for |
|---|---|---|---|
| **ThaiBulkSMS legacy** | `http://www.thaibulksms.com/sms_api.php` (XML response) | YES (`include/function.php:181-190` `send_sms()`) | bulk customer SMS |
| **ThaiBulkSMS OTP v2** | `https://otp.thaibulksms.com/v2/otp/{request,verify}` | YES — used **only** for password recovery (`login.php:87`) | recover password OTP |
| **Tiso AI** | `https://sms.tiso-ai.com/api/SMS/{postOTP,verify}/` | YES — primary OTP for **register** (`register.php:146,207` request; `check-otp.php:14` + `check-otp-register.php:13` verify) | register OTP |
| **TechSol-th** | `https://sms.techsol-th.com/api/SMS/{postOTP,postSMS,getCredit}/` | YES — primary OTP for **change-phone** (`verify-tel.php:25`) AND admin bulk SMS (`pcs-admin\include\function.php:2858` `sendSMSAPI()`) | profile tel verify + admin bulk |
| **TAM-i-T proxy** | `https://tam-i-t.com/tam-admin/api/tam-sms/sms.php?key=Y3V6SG&...&cs=PCS` | TEST only — `pcs-admin\test-sms2.php` | testing |

> **Per Pacred PORT_PLAN decision (locked):** consolidate → ThaiBulkSMS only. Drop Tiso/TechSol after migration

---

## 7. DBD juristic-person check

Two-tier failover, no auth:

1. **Primary:** `https://openapi.dbd.go.th/api/v1/juristic_person/{juristic_id}` → `$json['status']['code']=='1000'` → unpacks deeply nested `$json['data'][0]['cd:OrganizationJuristicPerson']['cd:OrganizationJuristicAddress']['cr:AddressType']['cd:...']`
2. **Fallback (v2):** `https://dataapi.moc.go.th/juristic?juristic_id={id}` → flat JSON `juristicNameTH, juristicNameEN, registerDate, addressDetail{...}`

Both calls have local geography enrichment: response sub-district matched against local `member\api\check-juristic-person\data-address\geography.json` (TH/EN translation).

**Curl timeout 7s, 2 attempts only**, SSL verify off.

File: `member\api\check-juristic-person\index.php` (single endpoint).

> Pacred already has this at `app/api/dbd/[taxId]/route.ts` ✅

---

## 8. Google Sheets sync

**Auth:** Service account JSON `pcs-admin\cryptic-album-325611-f8d67b670cf9.json` (project = `cryptic-album-325611`), scope `SPREADSHEETS_READONLY`. Loaded via Composer `assets\plugins\api-spreadsheets\vendor\google\apiclient`.

**Cron:** `pcs-admin\api\autorun\update-sheet-sang.php` reads from sheet `15g49hwP...` → caches as `database\{sheet-sang,ctt,mkcargo,mxcargo,gogo}\index.json`.

> Pacred dropped this per Sprint 5 cron audit (admin dashboards replace it)

---

## 9. Carrier APIs (JMF / TTP / CN / Flash)

### 9a. JMFCARGO (sister cargo company at `jmfcargo.com`)

Two-way sync over HTTP (NOT direct DB):
- **PCS → JMF (GET user balance)**: `pcs-admin\api\update-forwarder\JMFCARGO\GET\index.php` POSTs `{token: 'dZWm4pQI...3JFu', userID: 'PP', date: ''}` to `https://jmfcargo.com/jmf-cargo/jmf-admin/api/forwarder/PCSCARGO/GET/userID/index.php`
- **PCS → JMF (GET forwarder list)**: same pattern in `pcs-admin\include\function.php:3554-3557`
- **JMF → PCS (PUT inbound shipment)**: `pcs-admin\api\update-forwarder\JMFCARGO\PUT\index.php` is the *receiving* endpoint — JMF POSTs full forwarder fields with `token === 'dZWm4pQI...3JFu'`, server runs price calc + INSERT/UPDATE `tb_forwarder` + log to `tb_forwarder_jmf_tmp`. Auto-creates user address, picks last-used `fShipBy`
- **List/datatable fetch**: `pcs-admin\include\pages\api-forwarder-jmf\view.php` uses 2 endpoints + datatable server-side

### 9b. TTP / CN cargo (CargoThai / CargoCenter)

Single shared backend at `cargothai.tech`:
- **Container list (TTP-style)**: `https://cargothai.tech/api/service/GetContainer?_token=a807f4fe8c5bbf0010f6b3abfc52b4&Sdate={Y-m-d}&Edate={Y-m-d}&limit={N}&page={N}` (GET)
- **Container detail/SM**: `https://cargothai.tech/api/service/GetDetail?_token={token}&sm={sm_code}` — `aea07c4d3d1709313c4bb2d07a4702` for CN variant, `a807f4fe...4` for TTP
- **Image storage**: `https://cargothai.tech/uploads/{epoch}_{hash}.jpg` (referenced as direct image URLs)
- **Files**: `pcs-admin\include\pages\api-forwarder-cn\{pageUpdateAPI,processTable\GetContainer,processTable\GetDetail,pageManualUpdate,pageAPICheckSM}.php`, `api-forwarder-ttp\{processTable\processTable,processTableDetail}.php`, `pcs-admin\testAPITTP.php`
- Auth: query-string `_token` only; no auth headers

### 9c. Flash Express

**No API integration**. Only manual links to flashexpress.co.th external admin tool.

---

## 10. Email / SMTP

### 10a. PHPMailer #1 (transactional emails — currently DISABLED)

`member\include\function.php:398-422` — `sendMail($email,$title,$body)` configured for `mail.tam-i-t.com:465 SSL` with `pcscargo@tam-i-t.com / )+zzgT9ve~2s`. Templates in `contentMail()` embed `https://pcscargo.co.th/member/assets/images/theme/logo-full.png`, footer with company contact (02-444-7046, pcscargo@gmail.com), social links.

Every call site is currently commented-out (e.g., registration emails: `//sendMail($userEmail,$title,$body);`). System has the infrastructure but isn't sending.

### 10b. PHPMailer #2 (admin attachment test)

`pcs-admin\api\send-mail\index.php`: SMTP via Gmail (`smtp.gmail.com:587 STARTTLS`, app password `bblf ftlg vucv qysz`), generates an mPDF PDF inline + attaches it. Sends from `info@pcscargo.co.th` to `info@tam-i-t.com`. One-off test/admin tool.

### 10c. mPDF (PDF generation)

Two installed copies: `assets\plugins\mpdf\` (legacy v6/7) + `assets\plugins\mpdf8\` (v8). Used inline across many admin pages for Thai-text receipts using THSarabunNew font.

> Pacred replaced with `@react-pdf/renderer` (D-2 decision locked). Done for forwarder + shop receipts (C-7 + P-14)

---

## 11. PromptPay / payment

**No payment gateway** — no 2C2P, Omise, SCB, Kbank, Stripe. Payment flow is entirely manual:
1. `member\include\pages\payment\QRPay.php` renders a PromptPay QR client-side using `promptpay.js` (jQuery plugin in `assets/plugins/promptpay/`)
2. Hardcoded into the QR page (line 43-45):
   - Bank account: `064-174-3836` Kasikorn (KBank)
   - PromptPay number: `0-1055-64077-71-6`
   - Account name: บริษัท พีซีเอส คาร์โก้ (LEGACY)
3. User uploads slip image; admin manually approves in `acc-topup.php` / `wallet.php`

Same hardcoded numbers appear in `wallet.php` family, `shops.php`, `pcs-admin\barcode-d-prepare.php`, `pay-users\get*.php`.

> **Pacred:** these are PCS Cargo legacy company numbers. Pacred needs **NEW** company bank acct + PromptPay number. Until then `PROMPTPAY_ID` env var unset → wallet QR throws

---

## 12. Storage / upload paths

All uploads → LOCAL filesystem (no S3/cloud). Paths relative under `member\` web root or `pcs-admin\` web root:

| Bucket equivalent | Local path | Used by |
|---|---|---|
| Customer avatars | `member\images\users\` | `account-settings.php`, `register.php` |
| Slips (transfer proofs) | `member\storage\slip\` | `wallet*.php`, `payment.php` |
| General uploads | `member\storage\file\` | misc |
| Forwarder cover/multi-img | `member\images\forwarder\` (inferred) | `forwarder.php`, JMF PUT |
| Shop product imgs | `member\images\shops\` | `shops.php`, search results |
| Run-time temp PDFs | `member\tmp\`, `pcs-admin\tmp\` | mPDF output before download |
| Receipt PDFs | `pcs-admin\f-receipt\` | `create-f-receipt.php`, `printReceiptF.php` |

**Image converter API** (`member\api\convert-img-to-webp\index.php`): multipart upload → WebP via GD, names `{userID}-{YYYYMMDD}-{epoch}.webp`. Stores under `folder_path` POST param.

> Pacred uses Supabase Storage with buckets: `avatars/`, `member-docs/`, `slips/`, `forwarder-covers/`, `carts/`, `resumes/`, `csv-imports/` ✅

---

## 13. Cron / autorun (5 actual jobs)

**Located in:** `pcs-admin\api\autorun\` — registered via cPanel cron, no IP restriction, no auth. Each writes `system_log.json` heartbeat.

| # | Path | What it does | Pacred port |
|---|---|---|---|
| 1 | `check-apprentice/index.php` | Disables admins past `endDate` + marks driver assignments older than 17h as failed (`fdStatus=3`) | ✅ split into P-17 (admin half) + P-18 (driver half) |
| 2 | `send-line-sales/index.php` | Daily 00:05 — yesterday revenue summary → 3 LINE Notify msgs | ✅ P-15 (Pacred uses LINE Messaging API push instead) |
| 3 | `update-active-customers/index.php` | Marks `tb_users.userActive=1` for any user with active records | ✅ P-16 |
| 4 | `update-sheet-sang.php` | Pulls 5 ranges from Google Sheet → caches as JSON | ⚪ obsolete (admin dashboards replace) |
| 5 | `update-sheet-sang2.php` | Same as #4, single sheet | ⚪ obsolete |

---

## 14. Things NOT found (negative findings — confirmed missing)

- ❌ No 2C2P / Omise / SCB / KBank / Stripe / GBPrimePay / TrueMoney / Rabbit LINE Pay / Bank-API integration
- ❌ No LINE **Login** (Messaging API LIFF) — only LINE **Notify** OAuth (going EOL)
- ❌ No LINE Messaging API push (`api.line.me/v2/bot/message/...`) — push happens via per-user Notify access tokens
- ❌ No Resend/SendGrid/Mailgun/SES — only PHPMailer SMTP
- ❌ No Cloudinary/Imgix/S3 — local filesystem only
- ❌ No webhook receivers other than JMF PUT and LINE OA POST
- ❌ No Aliexpress/Tmall/JD direct API (uses TAMIT-cloud/Laonet wrappers instead)
- ❌ No Discord/Telegram/Slack
- ❌ No analytics SDK server-side (GA is purely client JS)

---

## 15. Hidden test/dev endpoints (still callable in production)

- `pcs-admin\testAPITTP.php`, `test-curl-tamit-cloud.php`, `test-line.php`, `test-line2.php`, `test-line-re-f.php`, `test-FRG.php`, `test-FRGS.php`, `test-FRGSA.php`, `test-FRGSA2.php`, `test-blank.php`, `test-move-forwarder.php`, `test-sms2.php`, `test_get_contents.php`, `addmail-test.php`, `a-Test-Bill.php`, `a-Test-commision.php` — production-accessible, no auth checks beyond standard admin gate
- `member\test-system\` (payForwarder/, runReceiptF/) — customer-side test scripts

---

## 16. function.php helpers (which touch external APIs)

`member\include\function.php` (~2451 LOC) — only those that hit external resources flagged 🌐:

| Function | External? | Purpose |
|---|---|---|
| `send_sms($message,$msisdn)` | 🌐 ThaiBulkSMS XML | bulk SMS (legacy) |
| `lineNotify($sMessage)` | 🌐 LINE Notify | personal alert |
| `lineNotifyTopUp` / `TopUpForwarder` / `Shops` / `Forwarder` | 🌐 LINE Notify | group alerts (5 tokens) |
| `sendMail($email,$title,$body)` | 🌐 SMTP `mail.tam-i-t.com` | transactional mail (mostly disabled) |

`pcs-admin\include\function.php` (~3500 LOC) adds:

| Function | External? | Purpose |
|---|---|---|
| `sendLine($token,$msg)` / `sendLineNotify(...)` | 🌐 LINE Notify | dynamic-token version |
| `sendLine2(...)` / `sendLine3(...)` | 🌐 LINE Notify (multipart) | with image attachment |
| `sendSMSAPI($conn,$data)` | 🌐 TechSol-th | bulk SMS, logs to `tb_sms_hs` |
| `getJMFData(...)` (line 3554) | 🌐 JMFCARGO | pulls forwarder list from JMF |

---

## 17. Why Pacred's "API blocked" issue + what to do

Symptom: ภูม said wiring Taobao/1688 link converter hit "API blocked".

**Root cause:** Pacred `lib/china-search/index.ts` uses `PACRED_RCGROUP_API_URL` for product detail. RCGroup-TH is dead code in PHP (never used in production). The legacy URL pattern in `.env.example` (`https://rcgroup-th.com/api-china/api-search`) is wrong AND the service is unresponsive.

**Fix path** (assigned as Sprint 7+ Track G P-50 in PORT_PLAN):

1. **Replace product-detail wire** (`convertProductUrl` + `convertProductUrlDetail`):
   - Endpoint: `https://tamit-cloud.com/api-product/get/{1688|taobao}/?id={productID}`
   - Auth: NONE
   - Response: `json.data.{title, vendor, listImage, mainImage, sku[], skuMap[], priceRanges[], referencePrice, mainVedio, detail}`

2. **Add short-URL cache layer** (new function):
   - First check: `https://tam-i-t.com/api/convert-link-china/get[/taobao]/?tk={tk}`
   - If 204 → fetch URL with desktop UA spoof → scrape productID via regex → save back via `/save/?tk=...`

3. **Replace keyword-search wire** (`searchKeyword`):
   - Endpoint: `https://akucargo.com/api3/api-2022/search/v1/[/taobao]/?page_size=15&q={words}&page={N}&lang=zh-CN`
   - Auth: NONE (UA spoof to desktop Firefox)
   - Response: `json.items.item[i].{detail_url, pic_url, title, price, promotion_price, sales}`

4. **Replace image-search wire** (`searchByImage`):
   - Upload first: `https://laonet.online/index.php?route=api_tester/call&api_name=upload_img&imgcode={base64}&key=tam011plus@gmail.com` → returns `imgid`
   - Search: `?api_name=item_search_img&imgid={imgid}&key=tam011plus@gmail.com`

5. **Verify outbound IP whitelisting** with the upstream services (TAMIT, AkuCargo, tam-i-t, Laonet):
   - Vercel function egress IP differs from legacy XAMPP / cPanel — may need to ask vendor to allowlist
   - PHP code disables SSL verify (`CURLOPT_SSL_VERIFYPEER=false`) — Vercel/Node fetch defaults to verify; if these hosts have cert issues, may need explicit `https.Agent({rejectUnauthorized:false})`

6. **Add carrier API integrations** (later, lower priority):
   - JMFCARGO sync (token = concatenation of Tiso key+secret, see §1.3)
   - CargoThai TTP+CN container API (`a807f4fe...`, `aea07c4d...`)

---

**End of audit.** Source-of-truth for porting decisions; preserve as the legacy maps are not in version control.
