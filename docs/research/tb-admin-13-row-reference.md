# tb_admin — 13-row reference for manual re-creation

> **Generated:** 2026-05-26 by Agent H · read-only dump from prod `tb_admin`
> **Purpose:** ภูม uses this as a visual checklist when manually adding the 13 admins through the new Pacred `/admin/admins/new` UI (Phase 3 of Wave 22 merge).
> **Source:** prod Supabase `tb_admin` (camelCase quoted columns) · 13 rows total
> **Sensitive fields OMITTED from this dump:** `adminPass`, `nationalIDCard`, `salary`, `nationalIDCardFile`, `copyHouseRegistrationFile`, `resumeFile`, `bearer_token`.
> **Legacy code → readable label tables** below are conservative best-guesses (`lib/auth/require-admin.ts` + `supabase/migrations/0017_org_chart.sql`). ภูม has authoritative knowledge — override per-row as needed.

## Quick stats

- **Total:** 13
- **Active (`adminStatusA='1'` AND `adminDel=''`):** 10
- **Suspended (`adminStatusA='1'` AND `adminDel!=''`):** 1
- **Inactive (`adminStatusA!='1'`):** 2

**By companyType:**
  - `1` (Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)): 8
  - `3` (Other / Mixed): 4
  - `2` (Freight (FCL/LCL · นำเข้า-ส่งออก ระหว่างประเทศ)): 1

**By department:**
  - `0`: 4
  - `1` (Management): 3
  - `4` (Accounting): 2
  - `3` (Sales): 2
  - `2` (Operations): 1
  - `5` (HR): 1

**By section:**
  - `0`: 4
  - `9` (Tech): 2
  - `2` (Sales): 2
  - `4` (Accounting): 1
  - `12`: 1
  - `10`: 1
  - `6` (Warehouse): 1
  - `1` (Management): 1

**By adminType:**
  - `1` (Full-time employee): 7
  - `2` (Intern): 6

**Suggested Pacred role distribution (heuristic):**
  - ops: 5
  - accounting: 3
  - super: 3
  - freight_sales (or freight_sales_manager if Mgr): 1
  - warehouse: 1

## Legacy code → label cheat sheet

### `companyType`
| code | meaning |
|---|---|
| `1` | Cargo (จีน-ไทย ฝากสั่ง / นำเข้า) |
| `2` | Freight (FCL/LCL · นำเข้า-ส่งออก ระหว่างประเทศ) |
| `3` | Other / Mixed |
| `4` | Family / Other |

### `department`
| code | meaning |
|---|---|
| `1` | Management |
| `2` | Operations |
| `3` | Sales |
| `4` | Accounting |
| `5` | HR |
| `6` | Tech |
| `7` | Logistics |
| `8` | QA/QC |

### `section`
| code | meaning |
|---|---|
| `1` | Management |
| `2` | Sales |
| `3` | CS / Docs |
| `4` | Accounting |
| `5` | QA / QC |
| `6` | Warehouse |
| `7` | Driver |
| `8` | Interpreter |
| `9` | Tech |

### `adminType`
| code | meaning |
|---|---|
| `1` | Full-time employee |
| `2` | Intern |
| `3` | Partner / contractor |
| `4` | Family |
| `7` | Family / "คนในบ้าน" |

### Suggested-role mapping logic
- `section=4` OR `department=4` → **accounting**
- `section=5` OR `department=8` → **qa**
- `section=6` → **warehouse**
- `section=7` → **(driver · NOT an admin · provision profile only)**
- `section=8` → **interpreter**
- `adminType=4` or `adminType=7` → **(family · ภูม decides per-person)**
- `companyType=1` + sales/CS section → **sales** / **sales_admin** / **ops**
- `companyType=2` + sales/CS section → **freight_sales** / **freight_import_cs** / **freight_export_cs**
- `department=1` (Management) → **super**

The 7 Pacred AdminRole values (`lib/auth/require-admin.ts`): `super · ops · accounting · sales_admin · sales · qa · warehouse · driver · interpreter` + 13 `freight_*` variants.

---

## The 13 admins (active first · ordered by `adminRegistered`)

### ✅ Active (10)

#### 1. `admin_pop` — วิสิฐ ศิลปเลิศลักษณ์ (ป๊อบ)
  - **DB ID (`ID`):** 14
  - **Email (personal):** pop_visit@pcs-seafreight.com
  - **Phone (personal):** 0948782006
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`0` → department=`0`
    - section=`0` → section=`0`
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `ops`**
  - **Registered:** 2024-04-11T17:52:54
  - **Start date:** (none) · End date: (none) · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=1992-11-05T00:00:00 · religion=1 · nationality=ไทย · marital=2
  - **Last login:** 2026-05-08T06:22:04
  - **LINE Notify token:** (set · redacted in this dump)

#### 2. `admin_nat` — วันดี พริกใย (แนต)
  - **DB ID (`ID`):** 29
  - **Email (personal):** cs@pcs-seafreight.com
  - **Phone (personal):** 0941178515
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`0` → department=`0`
    - section=`0` → section=`0`
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `ops`**
  - **Registered:** 2024-04-18T10:59:17
  - **Start date:** 2024-04-18T00:00:00 · End date: 2024-04-18T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=หญิง · birthday=2024-04-18T00:00:00 · religion=(none) · nationality=(none) · marital=(none)
  - **Last login:** 2026-05-04T17:22:16
  - **LINE Notify token:** (set · redacted in this dump)

#### 3. `admin_admin_jane` — จุฑามณี จุดอน (เจน)
  - **DB ID (`ID`):** 169
  - **Email (personal):** jutamaneei1999@gmail.com
  - **Phone (personal):** 0805161603
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`4` → Accounting
    - section=`9` → Tech
    - adminType=`2` → Intern
  - **→ Suggested Pacred role: `accounting`**
  - **Registered:** 2026-04-07T10:35:02
  - **Start date:** 2026-05-01T00:00:00 · End date: 2026-04-07T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=หญิง · birthday=1999-06-03T00:00:00 · religion=(none) · nationality=(none) · marital=(none)
  - **Last login:** 2026-05-06T22:43:36
  - **LINE Notify token:** (none)

#### 4. `admin_admin_web` — จตุพร ปานพลอย (เว็บ)
  - **DB ID (`ID`):** 171
  - **Email (personal):** jatuporn.panploy2000@gmail.com
  - **Phone (personal):** 0996235500
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`3` → Other / Mixed
    - department=`2` → Operations
    - section=`4` → Accounting
    - adminType=`2` → Intern
  - **→ Suggested Pacred role: `accounting`**
  - **Registered:** 2026-04-08T13:37:32
  - **Start date:** 2026-05-01T00:00:00 · End date: 2026-04-08T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=2000-11-21T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** 2026-05-13T10:26:35
  - **LINE Notify token:** (none)

#### 5. `admin_admin_win` — วัธนพงษ์ จันทเพชร (วิน)
  - **DB ID (`ID`):** 175
  - **Email (personal):** wattanapong600@gmail.com
  - **Phone (personal):** 0986582484
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`0` → department=`0`
    - section=`0` → section=`0`
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `ops`**
  - **Registered:** 2026-04-08T14:51:05
  - **Start date:** (none) · End date: (none) · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=1997-10-11T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** 2026-05-18T09:53:06
  - **LINE Notify token:** (none)

#### 6. `admin_admin_dev` — ทรรศกร นัทธีศรี (เดฟ)
  - **DB ID (`ID`):** 176
  - **Email (personal):** tadsakorn.n@gmail.com
  - **Phone (personal):** 0991921177
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`5` → HR
    - section=`12` → section=`12`
    - adminType=`2` → Intern
  - **→ Suggested Pacred role: `ops`**
  - **Registered:** 2026-04-08T14:55:42
  - **Start date:** 2026-05-01T00:00:00 · End date: 2026-04-08T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=1998-03-02T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** (none)
  - **LINE Notify token:** (none)

#### 7. `admin_admin_gring` — อมินตรา ไกรกิตติวุฒิ (กริ๊ง)
  - **DB ID (`ID`):** 177
  - **Email (personal):** amintrakraikittiwut@gmail.com
  - **Phone (personal):** 0926616199
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`2` → Freight (FCL/LCL · นำเข้า-ส่งออก ระหว่างประเทศ)
    - department=`3` → Sales
    - section=`10` → section=`10`
    - adminType=`2` → Intern
  - **→ Suggested Pacred role: `freight_sales (or freight_sales_manager if Mgr)`**
  - **Registered:** 2026-04-08T14:59:53
  - **Start date:** 2026-05-01T00:00:00 · End date: 2026-04-08T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=หญิง · birthday=1996-11-02T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** (none)
  - **LINE Notify token:** (none)

#### 8. `admin_admin_aom` — สรวิชญ์ กัวศรีนนท์ (ออม)
  - **DB ID (`ID`):** 178
  - **Email (personal):** sorrawit_peep@hotmail.com
  - **Phone (personal):** 0877587656
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`4` → Accounting
    - section=`9` → Tech
    - adminType=`2` → Intern
  - **→ Suggested Pacred role: `accounting`**
  - **Registered:** 2026-04-20T16:01:49
  - **Start date:** 2026-04-20T00:00:00 · End date: 2026-04-20T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=1999-01-07T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** 2026-05-15T15:07:34
  - **LINE Notify token:** (none)

#### 9. `admin_admin_pee` — พีรชัย ชื่นเปรื่อง (พี)
  - **DB ID (`ID`):** 180
  - **Email (personal):** peerachai.chuanpueng@gmail.com
  - **Phone (personal):** 0955361869
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`3` → Other / Mixed
    - department=`1` → Management
    - section=`2` → Sales
    - adminType=`2` → Intern
  - **→ Suggested Pacred role: `super`**
  - **Registered:** 2026-05-13T09:47:11
  - **Start date:** 2026-05-13T00:00:00 · End date: 2026-05-13T23:59:59 · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=2004-04-25T00:00:00 · religion=(none) · nationality=(none) · marital=(none)
  - **Last login:** (none)
  - **LINE Notify token:** (none)

#### 10. `admin_ploypr01` — ขวัญเรือน บัวหลาง (พลอย)
  - **DB ID (`ID`):** 182
  - **Email (personal):** meejing007@gmail.com
  - **Phone (personal):** 0954612345
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`3` → Other / Mixed
    - department=`1` → Management
    - section=`2` → Sales
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `super`**
  - **Registered:** 2026-05-14T12:31:06
  - **Start date:** (none) · End date: (none) · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=หญิง · birthday=2001-01-01T00:00:00 · religion=(none) · nationality=(none) · marital=(none)
  - **Last login:** 2026-05-14T12:34:28
  - **LINE Notify token:** (none)

### 🚫 Suspended (1)

#### 11. `admin_pond` — ชูเกียรติ ศรีเพ็ชร (ปอนด์)
  - **DB ID (`ID`):** 160
  - **Email (personal):** reddophinbrain@gmail.com
  - **Phone (personal):** 0958612835
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`0` → department=`0`
    - section=`0` → section=`0`
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `ops`**
  - **Registered:** 2026-01-16T16:18:08
  - **Start date:** (none) · End date: (none) · End-of-login: (none)
  - **Status flags:** adminStatusA=`1` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **🚫 adminDel=`admin_pop` · dateDel=(none)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=2003-01-10T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** 2026-05-14T12:11:53
  - **LINE Notify token:** (none)


### 🚫 Inactive (2)

#### 12. `admin_Warehouse` — Warehouse Warehouse (Warehouse)
  - **DB ID (`ID`):** 27
  - **Email (personal):** warehouse@pcs.com
  - **Phone (personal):** 0811154441
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`1` → Cargo (จีน-ไทย ฝากสั่ง/นำเข้า)
    - department=`3` → Sales
    - section=`6` → Warehouse
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `warehouse`**
  - **Registered:** 2024-04-18T09:04:43
  - **Start date:** (none) · End date: (none) · End-of-login: (none)
  - **Status flags:** adminStatusA=`0` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **🚫 adminDel=`admin_pop` · dateDel=(none)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=ชาย · birthday=2024-04-18T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** 2024-04-22T17:27:41
  - **LINE Notify token:** (none)

#### 13. `admin_admin_ploy` — ขวัญเรือน บัวหลวง (พลอย)
  - **DB ID (`ID`):** 173
  - **Email (personal):** ploy-fc_nomotear@hotmail.com
  - **Phone (personal):** 0863201354
  - **Work email:** 0
  - **Work phone:** 0
  - **Org placement (legacy codes):**
    - companyType=`3` → Other / Mixed
    - department=`1` → Management
    - section=`1` → Management
    - adminType=`1` → Full-time employee
  - **→ Suggested Pacred role: `super`**
  - **Registered:** 2026-04-08T14:43:22
  - **Start date:** (none) · End date: (none) · End-of-login: (none)
  - **Status flags:** adminStatusA=`0` · adminStatus=`(blank)` · salaryType=`2` (Daily)
  - **⚠️ adminTMP=1 (พักงานชั่วคราว)**
  - **🚫 adminDel=`admin_pond` · dateDel=(none)**
  - **Picture file:** `user.jpg`
  - **Personal:** sex=หญิง · birthday=1994-12-30T00:00:00 · religion=1 · nationality=ไทย · marital=1
  - **Last login:** 2026-05-14T12:11:33
  - **LINE Notify token:** (none)



---

## Migration tracking checklist

ภูม ticks each as the admin is recreated through Pacred UI (`/admin/admins/new`) — fill in the new `profiles.id` so we can cross-reference back to legacy `tb_admin.ID`:

- [ ] 1. `admin_pop` (วิสิฐ ศิลปเลิศลักษณ์) → created via UI · new `profiles.id` = `______`
- [ ] 2. `admin_nat` (วันดี พริกใย) → created via UI · new `profiles.id` = `______`
- [ ] 3. `admin_pond` (ชูเกียรติ ศรีเพ็ชร) → created via UI · new `profiles.id` = `______`
- [ ] 4. `admin_admin_jane` (จุฑามณี จุดอน) → created via UI · new `profiles.id` = `______`
- [ ] 5. `admin_admin_web` (จตุพร ปานพลอย) → created via UI · new `profiles.id` = `______`
- [ ] 6. `admin_admin_win` (วัธนพงษ์ จันทเพชร) → created via UI · new `profiles.id` = `______`
- [ ] 7. `admin_admin_dev` (ทรรศกร นัทธีศรี) → created via UI · new `profiles.id` = `______`
- [ ] 8. `admin_admin_gring` (อมินตรา ไกรกิตติวุฒิ) → created via UI · new `profiles.id` = `______`
- [ ] 9. `admin_admin_aom` (สรวิชญ์ กัวศรีนนท์) → created via UI · new `profiles.id` = `______`
- [ ] 10. `admin_admin_pee` (พีรชัย ชื่นเปรื่อง) → created via UI · new `profiles.id` = `______`
- [ ] 11. `admin_ploypr01` (ขวัญเรือน บัวหลาง) → created via UI · new `profiles.id` = `______`
- [ ] 12. `admin_Warehouse` (Warehouse Warehouse) → created via UI · new `profiles.id` = `______`
- [ ] 13. `admin_admin_ploy` (ขวัญเรือน บัวหลวง) → created via UI · new `profiles.id` = `______`

---

## Notes for ภูม

1. **Picture files** — legacy avatars live under `public/legacy/pcs/admin/images/` (or wherever the static asset folder is on Pacred); re-uploading through the new UI may regenerate filenames.
2. **adminTMP=1** flag = พักงานชั่วคราว (suspended). Treat as inactive when recreating, but keep the row for history.
3. **LINE Notify token (`adminLineTokenNotify`)** = redacted in this dump (LINE Notify EOL'd Apr 2025; new flow uses LINE OA + bearer auth — different token).
4. **Driver-section rows (`section=7`)** are NOT admins — they should get a `profiles` row only, not an `admins` table row. Skip during admin recreation.
5. **Family rows (`adminType=7`)** = "คนในบ้าน" — ภูม decides per-person whether they need admin access at all.
6. **Email/phone** are workplace contacts, NOT credentials — they're shown in full so you can copy-paste during recreation. The original password (`adminPass`) is deliberately NOT in this dump; new admins set a fresh password through the UI.
