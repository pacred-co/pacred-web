# PCS↔Pacred Sync — Upload Guide for ภูม

**สิ่งที่ต้องทำ:** อัพโหลด PHP 1 ไฟล์ ขึ้น PCS server ผ่าน CoreFTP · set token 1 ตัวใน Vercel · apply migration 1 ตัวใน Supabase · เสร็จ

⏱ **เวลา:** ~10-15 นาที total

---

## ภาพรวมระบบ

```
PCS server (vps185)              Pacred (Vercel cloud)
────────────────────             ──────────────────────
pcscargo.com/api/                cron ทุก 10 นาที
  pacred-sync.php   ◀─── HTTPS ──── /api/cron/pcs-sync
       │                                │
       ▼                                ▼
   tb_forwarder                    tb_forwarder
   (PCS MySQL)                     (Pacred Supabase)
   พนักงานใช้                       ระบบใหม่ที่กำลังทำ
```

ทุก 10 นาที Pacred ดึง forwarder ที่ "เพิ่งเปลี่ยน" จาก PCS · merge ลง tb_forwarder ของเรา · ข้อมูลตรงกันตลอด

---

## STEP 1 · Generate token (1 นาที)

เปิด PowerShell บนเครื่องนี้ · พิมพ์:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

จะได้ string ยาวๆ เช่น `7f3a8b...e91d` (64 ตัวอักษร) → **copy เก็บไว้** · จะใช้ 2 ที่:
- Step 2 · ใส่ใน PHP ไฟล์
- Step 4 · ใส่ใน Vercel env

---

## STEP 2 · แก้ token ในไฟล์ PHP (1 นาที)

เปิดไฟล์: `scripts/pcs-sync-endpoint/pacred-sync.php`

หา บรรทัด:
```php
$PACRED_SYNC_TOKEN = 'REPLACE_ME_BEFORE_UPLOAD';
```

เปลี่ยนเป็น token ที่ generate ใน Step 1:
```php
$PACRED_SYNC_TOKEN = '7f3a8b...e91d';   // ของจริง 64 chars
```

Save ไฟล์

---

## STEP 3 · อัพโหลดขึ้น PCS server ผ่าน CoreFTP (3-5 นาที)

1. เปิดไฟล์ `D:/REALSHITDATAPCS/vps185.nokhosting.com.coreftp` (double-click) → CoreFTP เปิด + connect อัตโนมัติ
2. ใน CoreFTP ทาง **right pane (remote)** → navigate ไป `/public_html/api/`
3. ถ้ายังไม่มี folder `api` → click ขวา → New Folder → ตั้งชื่อ `api`
4. ใน **left pane (local)** → navigate ไป `C:/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7/scripts/pcs-sync-endpoint/`
5. Upload **2 ไฟล์:**
   - `pacred-sync.php`
   - `.htaccess`

   (drag จาก left → right · หรือ click ขวา → Upload)

6. ตรวจ permission · ขวาบน `pacred-sync.php` → Properties → ตั้ง `644` (rw-r--r--)

---

## STEP 4 · ตั้ง Vercel env vars (2 นาที)

1. เปิด https://vercel.com/pacred-co/pacred-web/settings/environment-variables
2. คลิก **Add New**
3. เพิ่ม 2 ตัว:

   | Key | Value | Environment |
   |---|---|---|
   | `PCS_SYNC_URL` | `https://pcscargo.com/api/pacred-sync.php` | All (Production, Preview, Development) |
   | `PCS_SYNC_TOKEN` | token 64 chars จาก Step 1 | All |

4. Save → Vercel auto-redeploy production

---

## STEP 5 · Apply migration 0135 (3 นาที)

1. เปิด https://supabase.com/dashboard/project/yzljakczhwrpbxflnmco/sql/new
2. Copy เนื้อหาทั้งหมดจาก `supabase/migrations/0135_pcs_sync_state.sql`
3. Paste ลง SQL editor → คลิก **Run** → ต้องขึ้น "Success. No rows returned"

---

## STEP 6 · Test (2 นาที)

1. รอ Vercel deploy เสร็จ (~2 นาที)
2. เปิด https://pacred.co.th/admin/system/pcs-sync (logged in as super admin)
3. คลิก **"Test endpoint"** → ควรขึ้น JSON · `"ok": true` · `"rows": [...]`
4. คลิก **"Trigger sync now"** → ควรขึ้น `"rows_upserted": <จำนวน>`
5. กลับไปดู `/admin/forwarders/51994` → เลขตู้ควรเป็น `GZS260519-1` แล้ว ✅

---

## เมื่อทุกอย่าง work

cron จะรันเอง ทุก 10 นาที · ภูม ไม่ต้องทำอะไรอีก

ถ้าเข้า `/admin/system/pcs-sync` จะเห็น log ทุก run · last_sync_at update ตลอด

---

## Troubleshooting

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| `PCS_NOT_CONFIGURED` | env vars ยังไม่ set ใน Vercel | Step 4 |
| `PCS_AUTH_INVALID` (401) | token PCS ≠ token Vercel | recheck ทั้ง 2 ที่ |
| `PCS_NOT_FOUND` (404) | URL ผิด หรือ ไฟล์ยังไม่ upload | check Step 3 |
| `PCS_NETWORK_ERROR` | DNS / hosting down | ลองเปิด `https://pcscargo.com` ใน browser |
| `PCS_PARSE_ERROR` | PHP error · response ไม่ใช่ JSON | เปิด URL ตรงๆ ใน browser ดู error message |

ถ้าติดอะไร → ถามผมได้เลย
