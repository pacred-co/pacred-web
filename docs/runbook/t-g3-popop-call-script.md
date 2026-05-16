# T-G3 — พี่ป๊อป Bundle 1 call script (เดฟ + ลูกพี่)

> **Status:** ⏳ pending — ลูกพี่ takes call with พี่ป๊อป (lower friction than ก๊อต since family relationship).
> **Date opened:** 2026-05-16 night
> **Time budget:** ~30 minutes
> **Goal:** unblock 5 critical items before Monday 2026-05-18 launch (3 original Bundle 1 items + 2 added during 2026-05-16 night review session).
>
> **Read with:** [`docs/briefs/got-cheatsheet-2026-05-17.md`](../briefs/got-cheatsheet-2026-05-17.md) §2.2 · [`docs/decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md) · [`docs/audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md) §7.

---

## 🎯 What's locked vs what's blocked on this call

| Status | Item |
|---|---|
| ✅ DV-2 LIFF DONE | LINE channel + LIFF ID set ใน Vercel (ลูกพี่ ทำคืน 2026-05-16) |
| ✅ OTP_PEPPER rotated | Default placeholder → cryptographic value |
| ✅ T-G3 #1 PromptPay | DONE 2026-05-17 — ใช้ tax-ID `0105564077716` ผูกบัญชี กสิกร `225-2-91144-0` → ลูกพี่ set Vercel env `PROMPTPAY_ID=0105564077716` |
| ✅ T-G3 #2 Bank account | DONE 2026-05-17 — กสิกรไทย `225-2-91144-0` บจก. แพคเรด (ประเทศไทย) **กระแสรายวัน** → wired ใน `BANK` constant + pacred-info.md. ⏳ บัญชี **ออมทรัพย์** พี่ป๊อป จะส่งให้ทีหลัง (add as `BANK.savings` เมื่อมี) |
| 🟡 T-G3 #3 Pacred legal info | PARTIAL — tax-ID `0105564077716` confirmed ✅; remaining 6 fields existing in pacred-info.md (need confirm with พี่ป๊อป they're correct) |
| ⚠️ T-G3 #4 Payment gateway | **DECISION CHANGED 2026-05-17** — Omise → **Xendit + K-Biz + K-Shop** (Kasikorn-centric stack per พี่ป๊อป). See [D-7 §9 change log](../decisions/d7-payment-gateway-decision-matrix.md#9-decision-change-log) |
| ⏳ T-G3 #5 PDPA reg status | **STILL NEEDS** — required ก่อน K-sec-4 pen test |

---

## 📞 Call script — 5 asks ใน 30 นาที

### ปฐมบท (~2 นาที — set context)

> "พี่ป๊อป ก่อนเปิดระบบจันทร์เช้า ขอข้อมูล 5 อย่างให้ทีมตั้งระบบครับ. ทุกอย่างจะ enter เข้า Vercel + เขียนใน code ของ Pacred. ขอคุยให้จบในรอบเดียวเลยไม่ต้อง schedule ใหม่."

---

### Ask #1 — PromptPay number (~5 นาที)

**ขอ:** เลขที่ใช้รับเงินผ่าน PromptPay (เลือก 1)
- **เบอร์โทร 10 หลัก** (ตรงกับบัญชีที่ผูก PromptPay), หรือ
- **เลขประจำตัวผู้เสียภาษี 13 หลัก** (บริษัท Pacred — `0105564077716`)

**ทำไม:** Pacred web app generate QR code อัตโนมัติให้ลูกค้าจ่ายเงิน. ระบบ wallet จะ live ทันทีหลังเซต.

**คำถาม follow-up:**
- ใช้บัญชีบริษัท หรือ บัญชีส่วนตัวของพี่ป๊อป?
- ถ้า tax-ID 13 หลัก — มีบัญชีธนาคารผูกไว้แล้วใช่ไหม? เพราะ PromptPay tax-ID ต้องผูกบัญชีก่อน

**Vercel env ที่ตั้ง:** `PROMPTPAY_ID=<10-or-13-digits-no-dash>` → Production + Preview + Development

---

### Ask #2 — Bank account info — ✅ DONE 2026-05-17

**ที่ได้:** กสิกรไทย `225-2-91144-0` บจก. แพคเรด (ประเทศไทย) → wired ใน [`components/seo/site.ts`](../../components/seo/site.ts) `BANK` constant + [`docs/pacred-info.md`](../pacred-info.md) §"💳 Bank account" + ภูม wire ลง receipt/invoice PDFs in same refactor batch as CONTACT.* migration tracker.

> ⚠️ **ขอ confirm:** "ออมทรัพย์" หรือ "กระแสรายวัน"? (เรา default = ออมทรัพย์ ใน `BANK.accountType`; ถ้าผิด แจ้ง ลูกพี่ → เดฟ flip)

**Original ask (preserved for ref):**

**ขอ:** 3 อย่าง
1. **ชื่อธนาคาร** (เช่น "ธนาคารกสิกรไทย")
2. **เลขที่บัญชี** (รูปแบบ XXX-X-XXXXX-X)
3. **ชื่อบัญชี** (ตามที่ปรากฏใน statement — มักจะเป็นชื่อบริษัท "บริษัท แพคเรด (ประเทศไทย) จำกัด")

**ทำไม:** print ใน receipt PDF + tax invoice PDF เพื่อให้ลูกค้าโอนเงินเข้าบัญชีโดยตรงได้ (alternative ของ PromptPay).

**คำถาม follow-up:**
- บัญชีนี้ใช้รับโอนจากลูกค้าจริงๆ ไหม? หรือมีบัญชีอื่นที่ขอใส่แทน?
- มีหลายบัญชีรับเงินไหม? (ถ้ามี ขอตัวที่จะใส่ใน receipt เป็นหลัก)

**Code update ที่จะทำ:** `components/seo/site.ts` constants (เดฟ ทำ)

---

### Ask #3 — Pacred legal info (~5-10 นาที)

**ขอ:** ครบ 7 อย่าง
1. **ชื่อบริษัทเต็ม TH** = "บริษัท แพคเรด (ประเทศไทย) จำกัด" ✅ มีแล้ว — confirm
2. **ชื่อบริษัทเต็ม EN** = "Pacred (Thailand) Co., Ltd." ✅ มีแล้ว — confirm
3. **เลขทะเบียนนิติบุคคล** = `0105564077716` ✅ มีแล้ว — confirm
4. **เลขประจำตัวผู้เสียภาษี** (มัก = เลขทะเบียนนิติฯ 13 หลัก) — confirm same as #3
5. **ที่อยู่จดทะเบียน** — full address ตามใบจดทะเบียน (ขอเขียนเป็นบรรทัด ๆ ครบทุกบรรทัดให้ใส่ใน receipt)
6. **เบอร์กลางบริษัท** = `066-131-0253` ✅ มีใน [pacred-info.md](../pacred-info.md) — confirm ยังใช้อยู่
7. **อีเมลกลาง** (สำหรับ receipt + footer + contact) — มี 7 emails per dept; ขอ "central" หรือใช้ "info@pacred.co.th"

**ทำไม:** receipt PDF + tax invoice PDF + website footer + JSON-LD structured data (SEO) ทุกอย่างต้องใช้.

**Code update:** [`components/seo/site.ts`](../../components/seo/site.ts) constants + [`docs/pacred-info.md`](../pacred-info.md) (เดฟ ทำหลังคุย).

---

### Ask #4 — Payment gateway approval — ✅ DONE 2026-05-17 (DECISION CHANGED)

**ผลลัพธ์:** พี่ป๊อป overrode the Omise pre-decision → **Xendit + K-Biz + K-Shop** (Kasikorn-centric stack).

**Rationale captured (per ลูกพี่):**
- Pacred banks with Kasikorn (acct `225-2-91144-0`) → same-bank T+0 settlement preference
- พี่ป๊อป familiar with K-Biz (KBank biz internet banking) + K-Shop (merchant QR) — both Kasikorn-native
- Xendit acts as orchestration layer for card payments + cross-border e-wallets (Alipay/WeChat for Chinese cargo customers)
- D-7 matrix updated → [§5.1 + §6 + §9 change log](../decisions/d7-payment-gateway-decision-matrix.md)

**Next action (post-launch T+30d):**
- ลูกพี่ + พี่ป๊อป: sign up Xendit Thailand sandbox + activate K-Biz API access via KBank dev portal + set up K-Shop merchant QR via KBank app/branch
- ภูม implements per [updated D-7 §5.3](../decisions/d7-payment-gateway-decision-matrix.md#53-pacred-side-wiring-estimate-xendit--k-biz--k-shop) (~16-22h)
- onboarding documents (สำเนาบัตรประชาชนกรรมการ + ทะเบียนพาณิชย์ + ใบ ภ.พ.20) — ขอเตรียมไว้ตอน T+30d เริ่มกรอก

**Original Omise call script preserved below for trace:**

~~"พี่ พวกเราเลือก payment gateway ชื่อ **Omise (Opn Payments)** แล้ว — เป็นเจ้าที่ใช้กันเยอะในไทย, fee 3.65% บัตรเครดิต + 0.55% PromptPay, ครอบคลุมทั้งบัตรไทย + TrueMoney + AliPay + WeChat Pay. เริ่ม sandbox testing ที่ T+30 วันหลังเปิดระบบ. ขอ approval สมัครได้ไหมครับ?"~~ → owner picked Xendit instead.

---

### Ask #5 — PDPA registration status (~5 นาที)

**ขอ:** confirm Pacred registered กับ **PDPA Committee (สคส.)** หรือยัง

**ทำไม:** ก่อนทำ K-sec-4 external pen test (T+8-13wk) — vendor (Aiwen Tech) จะ touch synthetic customer data ใน staging. ตามกฎ PDPA Thailand ต้องมี data processor agreement + registration.

**คำถามที่ใช้:**
> "พี่ Pacred จดทะเบียน PDPA Committee แล้วใช่ไหม? หรือต้องเริ่ม register? ถ้ายังต้องเริ่มเลยตอนนี้เพราะ ก.ค. มี pen test ที่ vendor จะเจอข้อมูลลูกค้า (synthetic) ใน staging server."

**ถ้ายัง:** ขอ engaged ทนายเริ่ม register process — usually ~2-4 สัปดาห์.

**ถ้าจดแล้ว:** ขอใบ PDPA registration certificate (PDF) → file ใน internal docs.

---

## 📝 หลังจบ call — เดฟ ทำต่อ (~30m total)

ทันทีหลังโทรเสร็จ commit ข้อมูลที่ได้:

```bash
# 1. Vercel env (manual via dashboard)
PROMPTPAY_ID=<from-ask-1>

# 2. Code constants
# Edit components/seo/site.ts:
#   - Add bank info from Ask #2
#   - Confirm/update legal info from Ask #3
#   - Update central email if changed

# 3. Update docs
# Edit docs/pacred-info.md:
#   - Confirm all 7 legal fields
#   - Add PDPA registration status from Ask #5
# Edit docs/integrations/momo-jmf.md or new note:
#   - PDPA registration cert filed (if applicable)

# 4. Mark this runbook done
# Move t-g3-popop-call-script.md → docs/runbook/done/ OR
# Update front-matter Status: ✅ done <date>

# 5. Commit
git add . && git commit -m "feat: T-G3 พี่ป๊อป Bundle 1 ack — PromptPay + bank + legal info + Omise approval + PDPA status"
git push origin dave + main
```

---

## 🚨 If พี่ป๊อป cannot answer right now

- **Item-by-item OK** — ถ้าได้ 3/5 ก็ commit ส่วนที่ได้ก่อน, schedule follow-up สำหรับที่เหลือ.
- **PromptPay (Ask #1) + Bank (Ask #2)** เป็น **load-bearing สำหรับ Monday launch** — ถ้าได้แค่อันนี้สองอันก็พอเริ่มแล้ว.
- **Legal info (Ask #3)** มี defaults บางอันใน [pacred-info.md](../pacred-info.md) แล้ว — confirm + update where wrong.
- **Omise (Ask #4) + PDPA (Ask #5)** เป็น post-launch items — ถ้าวันนี้พี่ป๊อปไม่พร้อมตอบ, schedule ภายใน week 2 post-launch (ก่อน T+30d Omise wiring + ก่อน T+5wk pen-test RFP).

---

## Cross-references

- D-7 Omise matrix → [`docs/decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md)
- K-sec-4 pen test plan → [`docs/audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md)
- Pacred legal info canonical → [`docs/pacred-info.md`](../pacred-info.md)
- Site constants code → [`components/seo/site.ts`](../../components/seo/site.ts)
- ก๊อต cheat-sheet (where T-G3 referenced) → [`docs/briefs/got-cheatsheet-2026-05-17.md`](../briefs/got-cheatsheet-2026-05-17.md) §2.2
- Pre-launch checklist → [`docs/runbook/pre-launch-checklist-2026-05-18.md`](pre-launch-checklist-2026-05-18.md)
- Env var docs → [`docs/env.md`](../env.md) §"PromptPay" section

---

**End of T-G3 call script.** ลูกพี่ takes call when ready. เดฟ implements code updates per "After call" section.
