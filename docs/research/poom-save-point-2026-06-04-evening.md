# 🌙 2026-06-04 EVENING — SAVE POINT (ภูม session ที่ทำงาน · กลับบ้านต่อ)

**Branch:** `Poom-pacred` HEAD = `691060cb` · pushed · 0/0 vs origin
**Resume:** `cd <repo> && git fetch origin && git pull origin Poom-pacred --no-edit`
**Workforce next:** ภูมไปทำต่อที่บ้าน · AI ที่บ้าน อ่านไฟล์นี้ + `CLAUDE.md` top section ก่อนเริ่มงาน

---

## 🎯 สรุป Session นี้ (7 commits ใน 1 บ่าย)

| # | Commit | สรุปสั้นๆ | ไฟล์หลักที่แตะ |
|---|---|---|---|
| 1 | `ce403fb5` | `/admin/forwarders/new` **ลบ dropdown โกดัง** · auto-detect ONLY (ภูม: "ถ้าพนักงานกดผิดมั่วตาย") | `forwarders/new/form.tsx` |
| 2 | `d37b0c7a` | **Smart tracking lookup** (AJAX duplicate-check + MOMO sync) · **Step pills → icons** ใน `service-orders/[hNo]/edit` | `forwarders/new/form.tsx` · `service-orders/[hNo]/edit/page.tsx` · NEW `api/admin/forwarders/check-tracking/route.ts` |
| 3 | `63e22aa2` | **Per-shop status-aware fields** (legacy update3/update4 port · status 3 → ขอ `cshippingnumber` per shop · status 4 → ขอ `ctrackingnumber` per shop) | NEW `service-orders/[hNo]/shop-fields-board.tsx` · `actions/admin/service-orders-shop-workflow.ts` (extended) |
| 4 | `09ad130a` | **Step pills sync** detail ↔ edit (ภูม catch ผม sync ครึ่งทาง) · **PR023 lookup script v1** | `service-orders/[hNo]/legacy-view.tsx` · NEW `scripts/lookup-pr023-by-phone.mjs` |
| 5 | `f0580c0d` | **PR023 mapping resolution** ผ่าน legacy `tb_users.ID` + เบอร์โทร · ยืนยัน PR1395 (ฮูเซ็น) + PR089 (ธนชัย) | NEW `scripts/lookup-pr023-final.mjs` |
| 6 | `4751c411` | MOMO review-grid **thumbnail + quick-zoom modal** สำหรับรูปป้ายแปะกระสอบ | `api-forwarder-momo/review/{page,review-client}.tsx` |
| 7 | `691060cb` | **Multi-image lightbox** (ภูม catch ผมเปิดได้แค่รูปแรก · บาง row มี > 1 รูป) · เลื่อน ← → · thumbnail strip · counter "N/M" | `review-client.tsx` (extracted `<ZoomLightbox>`) |

---

## 🟢 ปัญหาที่แก้ + บริบทเชิงลึก

### A. `/admin/forwarders/new` (commit 1, 2)

**ก่อน:**
- Wave ก่อนหน้า ผมเผลอเพิ่ม dropdown ให้ admin เลือกโกดังเองได้
- + Auto-detect MO/CC prefix only

**Discovery ของภูม:**
> "ถ้าพนักงานมันกดกันผิดมั่วตายเลย" · "เวลา momo มันอัพตู้มา api ก็จับเลข tracking ไรงี้ไปไม่ได้หรอ"

**ทำใหม่:**
- ✅ ลบ dropdown ออก · admin เลือกโกดังเองไม่ได้
- ✅ Smart tracking AJAX (debounce 600ms): หลัง admin หยุดพิมพ์ tracking
  - 🔴 **Duplicate check** — ถ้าเลขซ้ำกับ `tb_forwarder.ftrackingchn` → red badge + link ดูออเดอร์เก่า (legacy `scriptfTrackingCHN.php` port)
  - 🟢 **MOMO sync lookup** — query `momo_import_tracks.momo_tracking_no` → ถ้าเจอ = MOMO มี tracking นี้ → set warehouse=8 อัตโนมัติ (authoritative · ครอบคลุม tracking ที่ไม่ได้ขึ้นต้น MO/CC)
  - 🏬 **Fallback** — MO* → 8 · CC* → 7 (เก่า · เก็บไว้)
- ✅ ระบบไม่จับ → ปล่อยช่องว่าง · admin แก้ใน /edit ภายหลัง

**Endpoint ใหม่:** `GET /api/admin/forwarders/check-tracking?t=<tracking>` → return `{duplicate, warehouse, source, note}`

### B. `/admin/service-orders/[hNo]` step pills (commit 2, 4)

**ก่อน:** เลข 1-5 ในวงกลม + label เล็กๆใต้
**ตอนนี้:** Icon + label + สีต่าง (ClipboardList → CircleDollarSign → ShoppingCart → Clock → PackageCheck) · **เหมือนกับ forwarders/[fNo]/edit ที่ภูมว่า "สวยเลย"**

⚠️ **ภูม catch ครั้งหนึ่ง:** ผมแก้แค่ `/edit` page · ลืม `legacy-view.tsx` (detail page) → ภูมส่ง screenshot บอก. แก้แล้วใน commit 4. **Lesson: ทุกครั้งที่แก้ UI component ใช้ใน 2 ที่ → ตรวจให้ครบทุกที่**

### C. `/admin/service-orders/[hNo]/edit` per-shop fields (commit 3) — **งานใหญ่สุด**

**Legacy `shops.php` + `update3.php` + `update4.php` workflow:**
- **status 3 (สั่งสินค้า)** → ในแต่ละร้าน (cnameshop) มี input "เลขออเดอร์ร้านจีน" (`cshippingnumber`) per shop · save → flip 3→4 + notify
- **status 4 (รอร้านจีนจัดส่ง)** → "เลขออเดอร์ร้านจีน" lock · เพิ่ม input "เลข Tracking จีน" (`ctrackingnumber`) per shop + ปุ่ม "ตรวจสอบรายการนำเข้า" → ค้นใน /admin/forwarders

**Pacred ก่อน fix:**
- ❌ มี input cshippingnumber **เลขเดียว** ใช้กับทุกร้าน (ผิด)
- ❌ ไม่มี ctrackingnumber input ที่ status 4 เลย
- ❌ "เลขออเดอร์ร้านจีน" และ "เลข Tracking จีน" ไม่แยก concept

**Pacred ตอนนี้:**
- ✅ NEW component `<ShopFieldsBoard>` — แสดง 1 card per unique `cnameshop`
- ✅ status 3 → cshippingnumber input per shop · ปุ่มเดียวบันทึก + flip 3→4 + notify 3-CH
- ✅ status 4 → cshippingnumber locked + ctrackingnumber input per shop + ปุ่ม "ตรวจสอบรายการนำเข้า" → `/admin/forwarders?q=<tracking>`
- ✅ status 5 → read-only display + "ออเดอร์สำเร็จ" banner
- ✅ Extended `adminMarkShopOrderOrdered` server action: รับได้ทั้ง legacy single scalar OR per-shop array (backward-compat)
- ✅ NEW server action `adminUpdateShopTracking` for status 4 per-shop ctrackingnumber

### D. PR023 mystery resolution (commit 4, 5) — **ภูมสอนผม insight สำคัญ**

**Symptom:**
- MOMO review-grid row 11: tracking 300649279386 · MOMO ส่ง `user_code="023"` → Pacred wrap → `PR023` → "ไม่มี PR023 ในระบบ"

**ผม research ครั้งแรก (commit 4):**
- ไปแกะ legacy SQL dump → PR023/PCS023 ไม่มีในระบบเก่าเลย
- เสนอ ภูม 3 options: contact MOMO / placeholder / skip

**ภูมสอนใหม่ (commit 5):**
- "ลูกค้าจะลงทะเบียนกับ MOMO ไม่ได้" — เซลของ Pacred เป็นคนเปิดบัญชี MOMO ให้ลูกค้า
- → MOMO `user_code` ต้องมาจาก Pacred (หรือ legacy PCS)

**ผม dig ลึก:**
- MOMO ใช้ **`tb_users.ID` (integer PK ของ legacy) เป็น user_code** ไม่ใช่ `userID` (string)
- เลข `023` = legacy `tb_users.ID=23` = userID=`PCS1395` · เบอร์ `0831915627`
- ตอน migrate → Pacred ก็เก็บ tb_users.ID=23 ตัวเดิม + เปลี่ยน userID → PR1395
- match by phone (0831915627) → **PR1395 = ฮูเซ็น** ✅

**ภูม screenshot สำคัญ:**
- ภูมเปิด `raw.images[0]` URL ของ MOMO ขึ้นมาดู → ป้ายของจริงเขียน **"PR025"** ไม่ใช่ "023"
- **สรุป: พนักงาน MOMO กรอกเลขผิด** (ไม่ใช่ logic Pacred ผิด)

### E. MOMO review-grid thumbnails (commit 6, 7) — **ภูม insight**

**ภูม ask:**
> "เอารูปมาแสดงโชว์แต่ละรายการไปเลยได้มั้ย เวลาภูมิมาsync จะได้กดรูปเช็คว่าถูกต้องมั้ยได้เลยด้วย เอารูปมาแทรกตรงระหว่าง ตู้ / sack กับ Phase อะ แล้วทำเป็นควิกซูม จะได้ตรวจสอบได้ง่ายจัดๆไปเลย"

**ทำ v1 (commit 6):**
- Thumbnail 48×48 ในตาราง + badge "+N" ถ้ามีหลายรูป
- Click → lightbox modal full-screen ของ images[0]
- ⚠️ **ผมพลาดตรงนี้:** เปิดได้แค่รูปแรก แม้ badge "+1" จะมี

**ภูม catch (commit 7):**
> "ไปเช็คดีๆ บางรายการมันมี มากกว่า 1 link นะ"

**ทำ v2 (current):**
- Extracted `<ZoomLightbox>` component
- Keyboard nav ← → · prev/next chevron buttons · counter "รูป N/M"
- Thumbnail strip ใต้ modal · คลิกเลือกได้
- ตรวจ DB: 2 ใน 35 rows มี > 1 รูป (เช่น tracking 800200527062 มี 2 รูป)

---

## 🔴 รอ ภูม ตัดสินใจ (กลับบ้านมาทำต่อ)

### 🟠 PR023 + PR99 — Smart mapping หรือ Rename?

ทั้ง 2 case มีลูกค้าจริงใน Pacred แล้ว แต่ MOMO ส่ง code ไม่ตรง:

| MOMO ส่ง | Pacred ปัจจุบัน | ลูกค้า |
|---|---|---|
| `user_code="023"` | userID=`PR1395` | ฮูเซ็น · 0831915627 |
| `user_code="99"` | userID=`PR089` | ธนชัย ปานพรมมา · 0843369559 |

**ทาง 1 (แนะนำเดิม):** Rename Pacred → matched MOMO
- `PR1395 → PR023` · atomic rename ข้าม 9 tables
- `PR089 → PR099`
- ภูมเคยทำแบบนี้ 3 คนแล้ว (PR9370→PR005 etc.) — script `scripts/rename-userid-to-pr99.mjs` พร้อมใช้

**ทาง 2:** Smart mapping ใน commit-momo-row-core.ts
- ถ้า MOMO code ไม่เจอ user → ลอง `tb_users.id = Number(code)` → ถ้าเจอใช้ userID นั้น
- ลูกค้าไม่ต้องโดน rename

**ทาง 3 (ที่ ภูม น่าจะเลือกหลังเห็นป้าย):** **ไม่ทำอะไรฝั่ง Pacred · แจ้งเซล**
- ภูมเปิด `raw.images[0]` → ป้ายเขียน "PR025" ไม่ใช่ "023"
- พิสูจน์ว่า MOMO กรอกผิดเอง · ไม่ใช่ระบบใครพัง
- → เซลแจ้ง MOMO ฝั่งโน้นแก้ user_code ของลูกค้าให้ตรงกับ Pacred userID
- **Pacred ไม่ต้อง touch อะไรเลย · ระบบ commit-momo-row-core.ts ของเราถูกอยู่แล้ว**

**Decision pending จาก ภูม** ตอนกลับบ้าน:
- ถ้าเลือก ทาง 3 → no work needed Pacred side
- ถ้าเลือก ทาง 2 → ผมเขียน smart-fallback ใน `lib/admin/commit-momo-row-core.ts`
- ถ้าเลือก ทาง 1 → ภูม run `scripts/rename-userid-to-pr99.mjs --apply` (dry-run ก่อน)

### 🟡 อื่นๆ ค้าง (ของเก่า):

- `#228` (pending) — บริการฝากสั่ง (shop-order) faithful port in detail (ตอนนี้แก้ไปเยอะแล้วใน commit 3 · ดูว่ายังขาดอะไร)
- `#259` (pending) — Cabinet manual override + lock flag (Option B · backlog)

---

## 🎯 Pickup options for next session (เลือกได้ตามที่อยาก)

**A. ภูม browser-test ที่บ้าน** (~30 min)
- `/admin/forwarders/new` → พิมพ์ tracking · ดู duplicate warning + MOMO sync chip
- `/admin/service-orders/<hNo>/edit` (status 3) → ดู per-shop card + กดบันทึก → flip 3→4
- `/admin/service-orders/<hNo>/edit` (status 4) → ใส่ ctrackingnumber per shop + กด "ตรวจสอบรายการนำเข้า"
- `/admin/api-forwarder-momo/review` → คลิก thumbnail ที่มี badge "+1" → ใช้ ← → เปลี่ยนรูป
- ทั้ง detail + edit page ของ service-orders → step pills ต้องเหมือนกัน

**B. ตัดสิน PR023 / PR99** (decision)
- เลือก 1/2/3 จากข้างบน + ลุยตามเลือก

**C. Wave ถัดไป** ดู memory `big_audit_master_plan_2026_06_01.md` (PM-4) ที่ค้าง:
- ใบเสร็จ "PCS Cargo" → "Pacred" (brand swap)
- Shop per-line pricing engine
- Tier A revenue holes (อะไรที่ยังเหลือ)

---

## 🧠 Learnings ที่ภูมสอนผม Session นี้ (capture ลง docs/learnings/)

### 1. **MOMO API ใช้ legacy integer ID เป็น user_code** (ไม่ใช่ string userID)
   - Path: `docs/learnings/partner-apis-quirks.md` (ภาษาคน — เพื่อ home Claude อ่านเข้าใจ)

### 2. **ภูม catch pattern — "ตรวจรูปจริงก่อนเชื่อข้อมูล"**
   - MOMO ส่ง user_code "023" → ผมไป trust + research แค่ DB
   - ภูมเปิด `raw.images[0]` URL → เจอป้ายของจริง = "PR025" → MOMO กรอกผิด
   - **Pattern: เมื่อมี image/attachment ใน raw payload → เปิดดูจริงก่อนเชื่อ field อื่น**

### 3. **Per-shop loop pattern** (legacy PHP → Pacred)
   - legacy `update3.php` loops `$_POST['cNameShop'][]` array — แต่ละร้านมีค่าตัวเอง
   - port → ต้องเป็น array argument + backend loop UPDATE per cnameshop
   - WHERE clause: `hno + cnameshop` (ไม่ใช่แค่ hno)

### 4. **Status-aware UI conditional fields**
   - แต่ละ status แสดง input ไม่เหมือนกัน (status 3 → cshippingnumber · status 4 → ctrackingnumber)
   - ของจริงคือ legacy `update3.php` กับ `update4.php` แยกคนละไฟล์
   - Pacred → component เดียว `<ShopFieldsBoard>` + `if (status === '3') ... else if (status === '4') ...`

### 5. **multi-image นาน gallery design** ใน admin tools
   - Lightbox ต้อง support arrow keys + thumbnail strip + counter
   - 2/35 rows ใน MOMO sync มี > 1 รูป (~5%) — เล็กแต่ไม่ใช่ "ignore"

### 6. **ภูม working style insight**
   - ภูมพูดสั้นกระชับ + ส่ง screenshot ทันที (ภาพชัดกว่าคำอธิบาย)
   - ถ้า ภูม catch ผมพลาด → ขอ confirm ความเข้าใจ ก่อน rewrite (ไม่ผลีผลาม)
   - ภูมต้องการ **เหตุผลย้อนกลับ** ("เพราะ legacy ทำแบบนี้ · เซลกรอกผิด · etc.")

---

## 🛠 ใช้ Tools ไหนใน Session นี้ + how to (สำหรับ home Claude)

### `scripts/lookup-pr023-by-phone.mjs` + `lookup-pr023-final.mjs`
- รัน: `node --env-file=.env.local scripts/lookup-pr023-final.mjs`
- ใช้ `@supabase/supabase-js` createClient + service-role key
- **ต้องระวัง:** column names ใน `momo_import_tracks` = `momo_user_code` (ไม่ใช่ `momo_user_id`) · `momo_tracking_no` (ไม่ใช่ `tracking_no`)

### Direct SQL query (ภาษาคน):
```js
import('@supabase/supabase-js').then(async ({createClient}) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data} = await c.from('momo_import_tracks').select('id, momo_tracking_no, raw').limit(10);
  console.log(data);
});
```
- รันใน Bash one-liner ผ่าน `node --env-file=.env.local -e "..."`
- ระวัง: ถ้า await ต้องใช้ `import().then(async ...)` pattern (top-level await ไม่ work ใน CLI mode)

### Legacy SQL dump path:
- `/d/REALSHITDATAPCS/pcsc_main.sql` (Windows D drive)
- INSERT INTO tb_users ที่ line 1261140+ (3 INSERT batches)
- Format: `(ID, userID, userTel, userStatus, ...)` — ID = integer PK · userID = string display code
- Search pattern: `sed -n '1261140,1261550p' file | grep -oE "\(<ID>, 'PCS[^']+', '[^']*'"` — pin range to tb_users block first (หลีกเลี่ยง match table อื่น)

---

## 📋 Decision tree สำหรับ home Claude

```
ภูม กลับบ้าน + รัน sync
       ↓
อ่าน CLAUDE.md top section
       ↓
อ่านไฟล์นี้ทั้งฉบับ (~5 นาที)
       ↓
อ่าน docs/learnings/_index.md (ใหม่ๆ + relevant)
       ↓
ภูม สั่งงานต่อ:
       ├── "browser test" → option A ข้างบน
       ├── "PR023 ตัดสิน" → ดู 3 ทาง · default ทาง 3 (no Pacred work)
       └── "ลุย Wave X" → ดู §"Pickup options"
```

---

## ⚠️ Anti-patterns (สิ่งที่ home Claude ไม่ควรทำ)

1. ❌ **ไม่ trust MOMO raw payload field โดยไม่ดูรูป** — ป้ายของจริงคือ source of truth
2. ❌ **ไม่ rename ลูกค้า Pacred ทันที** — ภูม เคยทำมาแล้ว 3 ราย ตอนนี้ pause + รอ ภูม ตัดสินกับเรื่องเซลแจ้ง MOMO
3. ❌ **ไม่ใส่ dropdown ให้ admin เลือกอะไรที่ส่งผลต่อข้อมูล** — ภูมรู้สึก "พนักงานกดผิดมั่วตาย"
4. ❌ **ไม่ port single-value where legacy ใช้ per-shop array** — เคยพลาดมาแล้วใน mark-ordered-form.tsx · เพิ่งแก้ใน commit 3
5. ❌ **ไม่ลืม sync UI 2 หน้าที่ใช้ component เดียวกัน** — step pills detail + edit หน้า · ผมพลาดครั้งหนึ่ง

---

## 🟢 Quality Gate ทุก commit (ก่อน push)

ทุก commit ผ่าน:
- ✅ `pnpm exec tsc --noEmit` (0 errors)
- ✅ `pnpm exec eslint <file>` (0 errors)
- ⚠️ ยังไม่ได้รัน full `pnpm verify` + `pnpm build` (= ภูม browser-test แทน)
- ⚠️ ยังไม่ได้ click-through test สำหรับ:
  - per-shop save → tb_order WHERE hno+cnameshop UPDATE (ไม่ได้ submit test order)
  - thumbnail in modal navigation (ไม่ได้ click ทดสอบรูป multi-image)

**ภูม browser-test list** (สำคัญ):
1. `/admin/forwarders/new` พิมพ์ tracking ที่ซ้ำ → ขึ้น red warning?
2. `/admin/service-orders/<hNo>/edit` (status 3) → ใส่ cshippingnumber ทุกร้าน → กด save → flip 3→4 + notify ลูกค้า
3. `/admin/service-orders/<hNo>/edit` (status 4) → ใส่ ctrackingnumber per shop → กด save → tb_order WHERE hno+cnameshop ได้ update
4. `/admin/api-forwarder-momo/review` row 11 → คลิก thumbnail → modal เปิด · row ที่มี "+1" → ลูกศรซ้าย/ขวาเปลี่ยนรูป
5. `/admin/service-orders/<hNo>` (detail) + `/edit` → step pills เหมือนกัน

---

## 🔗 Cross-links

- Branch: `Poom-pacred` HEAD `691060cb`
- Commits: `ce403fb5..691060cb` (7 commits)
- Server actions changed: `actions/admin/service-orders-shop-workflow.ts`
- API routes new: `app/api/admin/forwarders/check-tracking/route.ts`
- Components new: `app/[locale]/(admin)/admin/service-orders/[hNo]/shop-fields-board.tsx`
- Scripts new: `scripts/lookup-pr023-by-phone.mjs` · `scripts/lookup-pr023-final.mjs`
- Related learnings (ที่ home Claude ควรอ่าน):
  - `docs/learnings/partner-apis-quirks.md` (MOMO integer ID gotcha · NEW entry)
  - `docs/learnings/php-port-patterns.md` (per-shop loop pattern)
  - `docs/learnings/verify-deep-flow.md` (ตรวจรูปจริงก่อนเชื่อ field)

ส่วน CLAUDE.md top section ก็ update แล้ว — home Claude อ่านก่อนสุด

---

**🟢 ส่งต่อให้ ภูม ที่บ้าน + AI คอมบ้าน** — ขอให้สนุก! · ภูม ลุยเลย 🚀
