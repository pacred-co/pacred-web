# ThaiBulkSMS Setup

วิธีต่อ ThaiBulkSMS เป็น SMS gateway สำหรับ OTP

> 💡 ในระหว่าง dev สามารถข้ามได้ — เซ็ต `OTP_BYPASS=true` ใน `.env.local` แล้ว OTP จะข้ามไม่ต้องส่งจริง

## 1. Sign up + get keys

1. สมัครที่ <https://thaibulksms.com>
2. หลังยืนยันบัญชีแล้ว ไปที่ **Dashboard → API → API Key Management** (URL อาจเปลี่ยนตามเวอร์ชัน)
3. สร้าง API Key ใหม่ — จะได้ **API Key** และ **API Secret**

## 2. Sender ID (optional)

โดย default จะใช้ `Pacred` หรือชื่อ default ของบัญชี — บางเครือข่ายมือถืออาจ block ถ้าไม่ได้ลงทะเบียน sender

ถ้าต้องการ sender ชื่อบริษัท:
1. **Sender Management → Request New Sender**
2. ส่ง doc บริษัท (ภ.พ.20, หนังสือรับรอง)
3. รอ 1-2 วันทำการ
4. หลังอนุมัติ ใช้ชื่อนี้แทน "Pacred" ใน env

## 3. Configure env

แก้ `.env.local`:

```env
OTP_BYPASS=false
OTP_PEPPER=<random-32-char-string>

SMS_PROVIDER=thaibulksms
THAIBULKSMS_API_KEY=<your-api-key>
THAIBULKSMS_API_SECRET=<your-api-secret>
THAIBULKSMS_SENDER=Pacred
```

## 4. Test

### 4.1 ส่ง SMS test (curl)

```bash
AUTH=$(echo -n "$THAIBULKSMS_API_KEY:$THAIBULKSMS_API_SECRET" | base64)
curl -X POST https://api-v2.thaibulksms.com/sms \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "msisdn=66812345678" \
  --data-urlencode "message=Pacred test" \
  --data-urlencode "sender=Pacred"
```

ถ้าได้ response ที่มี `messageId` = ส่งสำเร็จ

### 4.2 ผ่าน app

1. ตั้ง `OTP_BYPASS=false` + ใส่ ThaiBulkSMS keys
2. `pnpm dev`
3. ไป `/register` → เพิ่ม UI ส่ง/กรอก OTP (ตอนนี้ยังไม่มี — ดู roadmap)
4. ตอนนี้ทดสอบโดยตรงผ่าน Server Action `requestOtp` ก่อน:

```ts
// ใน Server Action ชั่วคราว
import { requestOtp } from "@/actions/otp";
await requestOtp("0812345678", "register");
// → ดู console: "[SMS BYPASS]" จะหายไป, มาเป็น actual API call แทน
// → เช็ค otp_codes table ใน Supabase
// → เบอร์ปลายทางได้รับ SMS
```

## 5. Production checklist

- [ ] `OTP_BYPASS=false`
- [ ] `OTP_PEPPER` เป็น random string (ไม่ใช่ `default-pepper`)
- [ ] `THAIBULKSMS_API_KEY` + `_SECRET` ถูก set ที่ Vercel env vars
- [ ] Test ส่ง SMS จริงแล้ว
- [ ] Sender ID ลงทะเบียน (ถ้าต้องการ)
- [ ] Rate limit (3 ครั้ง/ชม./เบอร์) ทำงาน

## 💰 Cost estimate

(เช็ค pricing page ให้ใหม่ทุกครั้ง — เปลี่ยนได้)
- ราคาประมาณ 0.20–0.40 บาท/SMS
- ถ้าสมัคร 1,000 user/เดือน × ส่ง 1 ครั้ง = 200-400 บาท/เดือน
- หาก budget tight ตอนเริ่มต้น สามารถเปิด `OTP_BYPASS=true` ใน prod ชั่วคราวได้

## 🆘 Troubleshooting

### `http_401`
- API key/secret ผิด หรือ deactivate

### `http_400 invalid msisdn`
- เบอร์ format ไม่ถูก — `lib/utils/phone.ts` `normalizePhone()` ควรแปลงให้แล้วเป็น `+66...` แต่ ThaiBulkSMS ต้องการ `66...` (ไม่มี +) — ใน [`lib/sms/gateway.ts`](../../lib/sms/gateway.ts) เราตัด `+` ออกอยู่แล้ว

### `http_402 insufficient credit`
- บัญชี credit หมด — เติมที่ Dashboard → Billing

### SMS ส่งไม่ถึง
- เครือข่ายปลายทางอาจ block sender ID — ลอง sender อื่น หรือ register sender ใหม่
- เช็ค **Delivery Report** ใน ThaiBulkSMS Dashboard

## 🔄 Switch to other providers

ถ้าจะเปลี่ยนไปใช้ Twilio/MessageBird/1moby แทน:
1. แก้ [`lib/sms/gateway.ts`](../../lib/sms/gateway.ts) — เพิ่ม case ใหม่ใน switch
2. เพิ่ม env vars ใหม่
3. เปลี่ยน `SMS_PROVIDER=<new>`

โครงสร้างถูกออกแบบให้สลับ provider ได้ — interface `SmsGateway` อยู่ตัวเดียวกัน
