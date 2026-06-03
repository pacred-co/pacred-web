# 📘 Facebook / Instagram integration — owner setup guide + integration architecture (2026-06-02)

> 2 ส่วน: **A** = เจ้าของ (พี่ป๊อป) ทำตามเพื่อเอา token/id มาให้ครบ · **B** = integrator (เดฟ) สร้างต่อ (mirror LINE pattern).
> บริบท: Meta App "Pacred" App ID `27209891118650099` (= pixel id ที่ hardcode · App โหมด Development) · เพจ "Pacred Shipping Booking" (~700 fol · Page id `100690994769905` · Business `2183565002409207`) · IG ผูกแล้ว · Events Manager **ว่าง** (ยังไม่มี Pixel/Dataset จริง).
> ⚠️ secrets ส่งทางช่องทางลับ — ห้าม commit/แชตเปิด.

## ส่วน A — เจ้าของ: เอา 8 ค่า env มาให้ครบ
| env | ได้จาก | จำเป็น |
|---|---|---|
| `FACEBOOK_APP_ID` | มีแล้ว `27209891118650099` | ✅ |
| `FACEBOOK_APP_SECRET` | App→การตั้งค่า→พื้นฐาน→App Secret→แสดง | ✅ (verify ลายเซ็น webhook) |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **System User** (Business Settings→Users→System Users→Add asset เพจ→Generate Token: **Never** + perms `pages_messaging`,`pages_manage_metadata`,`pages_show_list`,`instagram_basic`,`instagram_manage_messages`) = ไม่หมดอายุ | ✅ (ตอบข้อความ+ดึงโปรไฟล์) |
| `FACEBOOK_PAGE_ID` | `100690994769905` | ✅ |
| `INSTAGRAM_ACCOUNT_ID` | `graph.facebook.com/v21.0/me?fields=instagram_business_account&access_token=<PAGE_TOKEN>` | ✅ (IG DM) |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | **ตั้งเอง** (สุ่มยาวๆ เช่น `pacred_fb_wh_8x2k9d4m7q1z`) | ✅ |
| `NEXT_PUBLIC_FB_PIXEL_ID` | **สร้าง Dataset จริงใน Events Manager** (Connect Data Sources→Web→Meta Pixel) → เอา id (15-16 หลัก) — ⚠️ แทน App ID ที่ผิดอยู่ → ads track ลงถูกที่ | ✅ |
| `FACEBOOK_CAPI_TOKEN` | Events Manager→Dataset→Settings→Conversions API→Generate | 🟡 optional (server-side conversion) |

**Webhook:** App→Add Product **Messenger** + **Instagram** → Messenger Settings→Webhooks→Callback `https://pacred.co.th/api/webhooks/facebook` + verify token → subscribe fields `messages`/`messaging_postbacks`/`message_reactions` (+ IG `messages`) → **Subscribe เพจ** (สำคัญ).
**App Review:** App อยู่ Development → รับข้อความได้แค่ tester (App Roles→Add tester). เปิดให้ลูกค้าทั่วไป = ยื่น App Review (`pages_messaging`+`instagram_manage_messages` · ต้องมี Privacy Policy + screencast) → อนุมัติ → flip **Development→Live**.
> ทดสอบก่อนได้เลยด้วย tester (พี่ป๊อป+เดฟ) ระหว่างรอ review.

## ส่วน B — integration architecture (mirror LINE · สำหรับ integrator)
หลักการ: ทุกไฟล์ FB จับคู่ 1:1 กับ LINE ที่ทำงานจริงบน prod (review ง่าย · ไม่ชน money-path · เขียนเฉพาะ `fb_*` ใหม่ · อ่านอย่างเดียวจากตารางเงิน).

| LINE (proven) | FB ใหม่ | บทบาท |
|---|---|---|
| `app/api/webhooks/line/route.ts` | `app/api/webhooks/facebook/route.ts` (+ GET verify-challenge · `X-Hub-Signature-256` HMAC hex/App-Secret · parse `entry[].messaging[]` + IG `changes[]`) | รับ event |
| `0131_line_oa_inbox.sql` | `0136_fb_messenger_inbox.sql` (`fb_customers`/`fb_messages`/`fb_webhook_events` · service-role RLS · no FK · NEXT FREE = เช็ค ledger) | schema |
| `actions/admin/line-inbox.ts` + `lib/admin/line-inbox-types.ts` | `actions/admin/fb-inbox.ts` + `lib/admin/fb-inbox-types.ts` | read actions |
| `sendLinePush()` | `lib/fb/send.ts:sendFbMessage()` (Graph `me/messages` · 24-hr window · env-gated) | ตอบกลับ |
| CRM FB tab placeholder (`crm-types.ts:46` `live:false`) | → `live:true` + `getFbConversations()` (match `tb_users.userFacebook`) | omni-inbox |

**Pixel/CAPI:** แก้ `NEXT_PUBLIC_FB_PIXEL_ID`=Dataset id จริง → PageView ลง · เพิ่ม `fbq('track',...)` (CompleteRegistration/Purchase/Lead) ที่ register/cart/payment/contact · CAPI `lib/fb/capi.ts` (server-side · event_id dedup กับ browser).
**ROAS:** เก็บ `fbclid`/`_fbc`/`_fbp` ตอน landing→signup → CAPI user_data → funnel by `lead_source_name` → ปิด loop ad→register→order→revenue→optimize.

**Build order:** migration 0136 → webhook route (inert 503 จนกว่า secret มา) → fb-inbox actions+CRM tab → send.ts+reply → userFacebook matching → pixel fix+CAPI → App Review→Live.

> รายละเอียดเต็ม (ขั้นต่อขั้น + signature logic + 24-hr rule + SQL เต็ม) = session transcript 2026-06-02 (agent abba791b). gate: §0c (destructure error · click-through) + §0d (reachable ≤3 คลิก — CRM อยู่ sidebar แล้ว) + อย่าแตะ money-path.
