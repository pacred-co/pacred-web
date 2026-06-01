# คำตอบ ภูม · MOMO Review 2 คำถาม · 2026-06-02 ค่ำ

> ภูม ถามที่ /admin/api-forwarder-momo/review:
> 1. PR99 — ของเก่าคือใคร · แก้ให้เป็น PR99 ตามที่ MOMO ใส่
> 2. "ยังไม่ join cabinet (รอ container_closed sync)" — คืออะไร · ใช้งานได้มั้ย · แก้ได้มั้ย

---

## 🟦 Q1 · PR99 candidate hunt

### Context

MOMO ส่ง `user_group="PR" + user_code="99"` → ระบบรวมเป็น `PR99` → probe `tb_users.userID = 'PR99'` → not found → "ไม่มี PR99 ในระบบ" สีแดง.

**ตาม pattern 2026-05-30 ดึก** (ที่ ภูม แก้รอบก่อน):
- MOMO `005` → Pacred เคยออกเป็น `PR9370` (รุ่งรัศมี) → rename → `PR005`
- MOMO `032` → Pacred เคยออกเป็น `PR1282` (ปภัสรา) → rename → `PR032`
- MOMO `116` → Pacred เคยออกเป็น `PR1321` (พงศธร) → rename → `PR116` (178 FK refs cascaded)

ทีนี้ MOMO ส่ง **99** มา → คำถามคือ Pacred reissue เป็น userID อะไร?

### วิธีหา → 2 scripts (read-only investigate + atomic rename)

**Step 1 — Investigate (read-only · ปลอดภัย):**
```bash
cd C:/Users/Admin/pacred-web/pacred-web
pnpm tsx scripts/investigate-pr99-candidate.mjs
```

Script จะ:
1. Probe `PR99` exact match → ถ้ามีแล้วก็จบ
2. List ทุก `PR99*` (PR99 + suffix digits) ใน tb_users
3. List `tb_forwarder` recent activity ของ PR99* ใน 30 วันล่าสุด
4. Cross-ref MOMO `momo_import_tracks.raw.user_code = '99'`
5. แสดงคำแนะนำ next step

**Step 2 — Rename (atomic 9-table · idempotent):**

หลัง investigate confirm OLD_USERID แล้ว:
```bash
# 1. เปิดไฟล์ scripts/rename-userid-to-pr99.mjs
# 2. แก้ const OLD_USERID = "PR99XX" → ตัวจริงที่ investigate เจอ (เช่น "PR9999")
# 3. รัน:
pnpm tsx scripts/rename-userid-to-pr99.mjs
```

Script จะ:
1. Preview count rows ต่อตาราง (9 tables)
2. Collision check: `PR99` ว่างใน tb_users มั้ย (ถ้าชนจะ abort)
3. y/n confirm prompt
4. Atomic UPDATE 9 tables (tb_users + 8 FK ref tables)
5. Summary report

**ตารางที่ update** (faithful port ของ rename ครั้งก่อน):

| # | ตาราง | column |
|---|---|---|
| 1 | `tb_users` | `userID` (camelCase per migration 0081) |
| 2 | `tb_forwarder` | `userid` |
| 3 | `tb_payment` | `userid` |
| 4 | `tb_wallet` | `userid` |
| 5 | `tb_wallet_hs` | `userid` |
| 6 | `tb_header_order` | `userid` |
| 7 | `tb_address` | `userid` |
| 8 | `tb_user_sales` | `userid` |
| 9 | `tb_receipt` | `userid` |

**ทำไมผมไม่ rename ให้เลย:**
- ไม่มี DB direct access จากที่นี่
- ไม่รู้ใครคือ Pacred-issued ตัวจริง (ต้อง investigate ใน prod data)
- ภูม ต้อง verify candidate ก่อน — เพราะถ้าเลือกผิด → bill ลูกค้าผิดคน · cascade bug

---

## 🟦 Q2 · "ยังไม่ join cabinet (รอ container_closed sync)"

### มันคืออะไร

**TL;DR:** ตู้ของรายการนี้ MOMO ยังไม่ได้ส่ง event "container_closed" มา → ระบบจึงยังไม่รู้ real cabinet ID (เช่น `GZS260525-2`) → แสดง MOMO routing batch (เช่น `PR20260601-SEA01`) แทน + chip "⏳ ยังไม่ join cabinet"

**กลไกข้างหลัง:**

```
                MOMO API
                 ↓
  ┌─────────────────────────────────────┐
  │ /api/cron/momo-sync (ทุก 5 นาที)    │
  │  Step 1: pull /getImportTrack       │
  │          → momo_import_tracks       │
  │  Step 2: pull /getContainerClosed   │
  │          → momo_container_closed    │
  │  Step 2.5: PROPAGATE cabinet       │
  │  for each container c in step 2:    │
  │    cabinet = c.cid                  │
  │    UPDATE momo_import_tracks        │
  │    SET container_batch_no = cabinet │
  │    WHERE momo_tracking_no IN        │
  │      (c.track_details[].reTrack)    │
  └─────────────────────────────────────┘
```

**Row จะ "join cabinet" สำเร็จ** ก็ต่อเมื่อทั้ง 2 เงื่อนไขจริง:
- ✅ MOMO ส่ง `container_closed` event มาแล้ว (มี `cid`)
- ✅ Tracking number ของ row นี้อยู่ใน `track_details[].reTrack` ของ container นั้น

### เหตุที่ row อาจ "ยังไม่ join":

| เหตุ | ความเป็นไปได้ | หมายเหตุ |
|---|---|---|
| **A) Container ยังไม่ปิด** | สูง | MOMO รอ schedule ปิดตู้ตาม batch · อาจช้า 1-7 วัน |
| **B) Sync window แคบ** | ปานกลาง | Cron ดึง yesterday-today · ถ้าตู้ปิดนานแล้วก่อนหน้านั้น = ไม่อยู่ใน window |
| **C) MOMO data quality** | ต่ำ | Tracking ของเราไม่ตรงกับ track_details[] ของ MOMO |

### ใช้งานปกติได้มั้ย? — ✅ ใช่

**Admin commit (กด "สร้างใหม่") ทำงานได้ปกติ:**
- INSERT `tb_forwarder` สำเร็จ
- `fcabinetnumber` จะถูก fill ด้วย MOMO routing batch (เช่น `PR20260601-SEA01`)
- เมื่อ MOMO ส่ง container_closed event ภายหลัง → cron step 2.5 propagate
- Propagation pipeline (`lib/integrations/momo-isolated/propagate.ts`) จะ **overwrite** `fcabinetnumber` ด้วย real cabinet (เช่น `GZS260525-2`) **automatically**

**ทำไมตอนนี้เห็น chip ก่อน commit:**
- Review grid แสดง chip เพื่อ disclose ให้ admin รู้ว่า data ยังไม่สมบูรณ์
- ไม่ block การ commit · แค่ informational

### แก้ได้มั้ย? — 3 ทาง

| วิธี | เวลา | ใช้เมื่อ |
|---|---|---|
| **A) รอ cron** | ≤ 5 นาที | Default · cron ทำงานทุก 5 นาทีอยู่แล้ว |
| **B) Manual sync** | ทันที | กดปุ่ม "Sync MOMO ตอนนี้" ที่ `/admin/api-forwarder-momo/sync` |
| **C) Date-range override** | 1 นาที | curl `/api/cron/momo-sync?start=2026-05-01&end=2026-06-02` (ต้องมี CRON_SECRET) → re-sync wider window ถ้า container ปิดก่อน yesterday |

**Recommend:** ลอง **A→B** ก่อน. ถ้าค้างเกิน 24 ชม. → **C** ขยาย window. ถ้ายังค้าง → ติดต่อ MOMO ตรวจ track_details ของ container ที่ tracking นี้ควรอยู่.

### "รอบก่อนก็ขึ้น" — มันค้างนานมั้ย?

ขึ้นกับเงื่อนไข MOMO:
- ถ้าตู้กำลังจะปิด (วันนั้น-สองวัน) → ค้างเพียงไม่กี่ชั่วโมง · ปกติ
- ถ้าตู้รอ batch (เพิ่งเริ่มสะสม) → ค้างได้ 3-7 วัน · ปกติ
- ถ้าค้างเกิน 7 วัน → ไม่ปกติ · ลอง C (date-range override) หรือเช็คใน MOMO platform โดยตรง

### Activity counter — ตรวจสุขภาพ cron

ดูได้จาก `momo_sync_logs`:
```sql
SELECT triggered_at, sync_source, upserted_count, error_count, errors
FROM momo_sync_logs
ORDER BY triggered_at DESC
LIMIT 20;
```

ถ้า cron healthy → triggered_at จะมี entry ทุก 5 นาที + upserted_count > 0 ในช่วง business hours · error_count = 0.

---

## 📋 สรุป next steps สำหรับ ภูม

### Q1 (PR99):
1. ☐ รัน `pnpm tsx scripts/investigate-pr99-candidate.mjs`
2. ☐ ดูผล: ใครคือ candidate (likely PR99xx ที่มี recent forwarder activity)
3. ☐ เปิด `scripts/rename-userid-to-pr99.mjs` → แก้ `OLD_USERID = "<candidate>"`
4. ☐ รัน `pnpm tsx scripts/rename-userid-to-pr99.mjs` → confirm y → done
5. ☐ Refresh /admin/api-forwarder-momo/review → PR99 ขึ้น "พบใน tb_users" สีเขียว

### Q2 (รอ container_closed sync):
1. ☐ เข้าใจแล้วว่ามันคือ "tracking ยังไม่ link ตู้จริง" · ใช้งานได้ปกติ
2. ☐ ถ้ารีบ — กด manual sync ที่ `/admin/api-forwarder-momo/sync`
3. ☐ ถ้าค้างนานเกินสมเหตุสมผล — re-sync wider window

---

**Branch state:** `Poom-pacred` · scripts + this doc shipped together (commit pending below).
