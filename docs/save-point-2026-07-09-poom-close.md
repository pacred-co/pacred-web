# 💾 Save-point · ภูม · 2026-07-09 (ปิด session — พรุ่งนี้ทำต่อ)

> อ่านไฟล์นี้ก่อนเริ่มพรุ่งนี้. งานเซฟ + push แล้ว ไม่มีอะไรค้างที่ยังไม่ commit.

## สถานะ branch
- **Poom-pacred = `a7d9a680`** (push แล้ว · HEAD = origin/Poom-pacred · FF สะอาด)
- branch ทำงาน: `claude/adoring-chandrasekhar-0f8ad7` (integrate → Poom-pacred ตามปกติ)
- **ไม่มี migration ใหม่** session นี้ · NEXT FREE ยังคง **0236**
- prod = read-only (เดฟ owns) · **`.env.local` เครื่องนี้ = DEV** (`lozntlidlqqzzcaathnm`) ไม่ใช่ prod

## commit session นี้ (ทั้งหมด push Poom-pacred แล้ว)
- `a7d9a680` — fix(billing-run · FRI2607-00015): **surface auto-receipt failure to admin** (เดิมเงียบ) + let→const + handoff diagnosis
- `7a679ef6` — fix(momo): normalize `user_group "PR+PR"` → รหัส PR#### ถูกต้อง (+10 tests)
- `d3286e75` — fix(comm-batch): ค้นหา error `column tb_forwarder.fid does not exist`
- `bd78a3b0` — feat(กลุ่มรายการเบิกเงิน C): เบิกค่าคอมเซล/ล่าม สร้าง+จ่าย (money-loop) + driver-runs rebuild + sidebar dup-key
- `b98460dc`, `64dd7f22`, `328275b6`, `e3d825d2`, ... — faithful-look 2026-07-09 (รายงานรับรู้รายได้ + house-style สี + คอลัมน์ค่าคอม 1%)

## 🔴 งานที่ค้าง / ส่งต่อเดฟ (prod = โดเมนเดฟ)
รายละเอียดเต็ม + query อยู่ใน **[docs/handoff-dave-2026-07-09.md](handoff-dave-2026-07-09.md)**:
1. **FRI2607-00015 (PR086) ใบเสร็จไม่ออก** — วินิจฉัยจากโค้ดแล้ว (best-effort auto-receipt พลาดเงียบ · PR086 = เคส void→re-bill บุคคล→นิติ · น่าจะมีใบเสร็จเก่าค้างสถานะ '2'/'3' คลุม fids). เดฟ รัน read-only query (handoff ข้อ 6) หาว่าติดกรณีไหน → ออก/sync ใบเสร็จให้ PR086. **ผมใส่ตัวเตือน UI แล้ว** (auto-receipt พลาด → หน้า billing-run โชว์ warning ไม่เงียบอีก).
2. **C1 money-write (เบิกค่าคอม)** ยังไม่ test จ่ายจริง — owner/เดฟ ลองสร้าง+จ่าย 1 รายการบน prod (เช็ค WHT 3% + status '1'→'2' + row เข้า tb_withdraw_comm_sale_h/_item).
3. **ล่าม (interpreter) เบิกไม่ได้** จนกว่า owner seed `tb_set_comm_interpreter` (% ต่อล่าม) + แก้ adminidip ในออเดอร์เป็นล่ามจริง.
4. **MOMO tracking ตกหล่น ฿294k drift** — เดฟ ตรวจว่าลดลงจริงหลัง MOMO อ้างว่าแก้ + set Vercel `MOMO_WEB_USER/PASS`.

## 🟡 ของภูมทำต่อพรุ่งนี้ (Poom-pacred lane)
- (ถ้า) faithful-look หน้าอื่นที่ owner/พี่ป๊อป flag เพิ่ม
- payee dropdown fallback → ถ้าอยากถาวร ตั้ง org fields บน tb_admin ให้ตรง legacy (handoff ข้อ 3)
- pre-existing: `lib/sales-commission/resolve-active-rep.test.ts` import "server-only" → พังใน `pnpm test:unit` (ของ teammate · แยก pure-logic ออกถ้าจะแก้)

## ✅ verify ก่อนปิด (workflow close-out-verify-fri2607 · 2 agent)
- **gate:** tsc exit 0 · real error 0 · lint 2 ไฟล์สะอาด · **test:unit ทั้ง suite ผ่าน exit 0** (resolve-active-rep.test.ts ก็ผ่าน — chain สุดท้ายใช้ `tsconfig.test.json`). ที่แก้ไม่ทำอะไรพัง.
- **adversarial diagnosis (FRI2607):** ยืนยัน fix money-safe · จับเพิ่ม 3 อย่าง → ผมแก้แล้วใน `a7d9a680`+commit ถัดไป:
  1. "ค้นหาไม่เจอ" อาจเพราะหน้าใบเสร็จกรอง **เดือนปัจจุบัน** (ใบเสร็จอาจมีจริง) → เพิ่ม check (0) ใน handoff + client เตือน "ค้นแบบไม่กรองเดือน".
  2. fix เดิม**ไม่ครอบเคส `already_issued`** (ใบเสร็จ '3' คลุมไม่ครบ = เคสน่าจะเป็นที่สุด) → เพิ่ม branch: Path A sync แล้ว=โชว์ rID · ไม่ sync=เตือน.
  3. handoff query (3) บั๊ก (`mark_paid` เก็บ id ใน `target_id`) + S2 เป็นไปไม่ได้เชิงโครงสร้าง → แก้ query + note แล้ว.

## หมายเหตุ verify สด
ตัวเตือน UI (receiptWarning/already_issued branch) **ยังไม่ได้ authed-test สด** (headless ไม่ authed + env=DEV) — จะเห็นจริงตอนตัดจ่ายบิลบน prod. gate + adversarial-review ผ่าน แต่ยังไม่ได้กดจริง.
