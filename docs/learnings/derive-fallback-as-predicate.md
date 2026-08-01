# derive-ที่มี-fallback ห้ามใช้เป็น predicate + กู้ WIP ด้วย tsc ชี้จุดตาย

> เพิ่ม 2026-08-02 (เดฟ · กู้ WIP เมลหลักติดลิมิท — งาน NO CODE auto-resolve + pay-user เลขเอกสาร/กรุปรอบชำระ · commit `c0ef5113`)

## 1) ฟังก์ชัน derive ที่มี fallback = โกหกเมื่อถูกใช้เป็นตัวตัดสิน "มี/ไม่มี"

**เคสจริง (owner: "งาน NO CODE ยังเอาเข้าไม่ได้จริง เด้ง มี PR แล้ว…ทำไมไม่เติมให้เราเลย"):**
`deriveMomoMemberCode(userGroup, userCode)` ลงท้ายด้วย `return code || prefix` — ออกแบบมาเพื่อ **display**
(ช่องรหัสว่างก็ยังโชว์กลุ่ม "PR" ได้) แต่ถูกยืมไปใช้เป็น **existence test** ในด่าน commit:

- **จอ** จำแนก NO CODE ด้วย `userGroup && userCode ? derive(...) : null` (ต้องมีครบทั้งคู่)
- **ด่าน commit** เรียก `derive(...)` ตรงๆ → คู่ `("PR","")` คืน prefix เปล่า `"PR"` → ด่านตีความว่า
  "มีรหัสลูกค้า PR แล้ว" → refuse

ผล = **ทางตันสมบูรณ์แบบ**: นำเข้าปกติก็ไม่ได้ (ไม่มี PR จริง) นำเข้า NO CODE ก็เด้ง (ด่านว่ามีรหัส)
ทั้งที่โค้ดทั้งสองฝั่ง "อ่านข้อมูลเดียวกัน" — แค่อ่านคนละแบบ.

**กติกา:**
1. ค่าที่จะใช้ตัดสิน มี/ไม่มี ต้องผ่าน **normalizer ที่คืน `null` เมื่อระบุตัวตนไม่ได้จริง**
   (ที่นี่ = `normalizeMomoPrCode`: ต้อง match `^PR\d+$` เท่านั้น · prefix เปล่า/ขยะ → `null`).
   ฟังก์ชัน display ที่มี fallback ใช้ต่อได้ แต่ **ห้ามเป็น predicate**.
2. จอกับด่านที่ตัดสินเรื่องเดียวกัน ต้องเรียก **helper ตัวเดียวกัน** (ที่นี่ = `firstResolvableMomoPr`
   เดินลำดับแหล่งเดียวกัน: admin_patch → raw → คอลัมน์ staging) — สองสมองบนข้อเท็จจริงเดียว
   จะ drift เสมอ (ญาติของ [[display-vs-stored-money-formula]] แต่เป็นฝั่ง boolean ไม่ใช่ฝั่งเงิน).
3. เจอ dead-end ทรง "ทำทาง A ก็ไม่ได้ ทาง B ก็เด้ง" → สงสัยไว้ก่อนว่า **ตัวจำแนกสองตัวไม่ตรงกัน**
   แล้ว grep หา predicate ทั้งสองฝั่งมาเทียบบรรทัดต่อบรรทัด.
4. ทางแก้ระดับ product: ด่านที่ "รู้คำตอบอยู่แล้ว" อย่าแค่ refuse — **ทำให้เลย** (auto-resolve แล้ววิ่ง
   path ปกติผ่านด่านเดิมครบ ไม่ fork path ที่สอง) · เหลือ refuse เฉพาะเคสที่ต้องการมนุษย์จริง
   พร้อมบอกว่าเจออะไร + แก้ตรงไหน (§0g self-explaining).

## 2) กู้ WIP ที่ตายกลางคัน: `tsc` คือตัวชี้จุดตายที่ถูกที่สุด

Session ติดลิมิทตายกลางการแก้ไฟล์ (รอบนี้: ตายตอนผูกปุ่มบน modal — type + JSX เขียนแล้ว แต่
destructure/caller ยังไม่ได้แก้). ก่อนไล่อ่าน diff ทั้งก้อน **รัน tsc ก่อน** — error cluster
บอกแม่นว่างานค้างตรงไหน:

- `Type ... is missing properties: issued, issuing, ...` ที่ call site = **type อัปเดตแล้ว caller ยังไม่ส่ง**
- `Cannot find name 'issued'` ใน JSX = **ใช้แล้วแต่ยังไม่ bind ใน destructure**
- args ขาดใน call = **signature ฝั่งถูกเรียกต้องการมากกว่าที่ draft ส่ง**

ลำดับกู้ที่ใช้ได้จริง (ครั้งที่ 3 แล้ว · ดู memory [[recovered-payuser-nocode-wip-2026-08-02]]):
`git worktree list` หา worktree ที่มี uncommitted → `git status`+`diff --stat` ดูขอบเขต →
**tsc หาจุดตาย** → อ่านเฉพาะไฟล์ใหม่เต็มๆ + diff ของไฟล์ที่พัง → ปิดงานตามภาษาดีไซน์เดิมของ draft →
gate เต็ม (test:unit/lint/BUILD_EXIT อ่านจาก log) + money-review เอง → commit + push branch เป็น backup.
ห้ามเชื่อว่า draft "เกือบเสร็จ = ถูก" — args ที่ขาดต้องเติมแบบ **fail-closed** (รอบนี้: 3 ด่าน
ack ของ createBillingRunInvoice ส่ง `false` ให้ server refuse เอง ไม่ใช่ `true` เพื่อให้ผ่าน).
