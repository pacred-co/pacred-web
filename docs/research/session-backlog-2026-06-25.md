# Session backlog + root-causes (2026-06-25 · เดฟ) — ห้ามงานหาย

> รอบนี้ owner ใส่งานมาเยอะมากในรอบเดียว. ไฟล์นี้ล็อกทุก lane + root cause ที่เจอแล้ว เพื่อให้ใครมาทำต่อ (หรือผมรอบถัดไป) ลุยได้เลย gate ทุก step. กฎคุม: [[cost-editable-sell-locked]] · [[owner-directives-2026-06-25]].

## ✅ เสร็จแล้ว (commit local 8 อัน บน claude/intelligent-bell-6b7b0f · gate tsc/verify/build เขียว · ยังไม่ push)
- WHT 1% gross-store fix (`3e529b42`) · ระบบไกด์ Explain/GuideNote+registry (`5b085ab9`) · WHT explicit box (`d7d2f222`) · content PRF+wallet (`29c5a7ff`) · momo cost-pay banner+JSDoc+flow-doc (`eabb0991`) · wallet dashboard note actionable (`6a22df5a`) · doc correction (`1e7c04d7`)

## 🔬 Root cause ที่เจอแล้ว (พร้อมแก้)
1. **ใบเสร็จ ผู้ออก/อนุมัติ ขึ้น uuid ไม่ใช่ชื่อ** — [actions/admin/forwarder-invoice.ts:354,366](../../actions/admin/forwarder-invoice.ts) เก็บ `safeLegacyAdminId(adminId,30)`=uuid ลง `adminid` + `documentissuer="Admin <uuid> (manual)"`. load [load-receipt-document.ts:464](../../lib/receipt/load-receipt-document.ts) `documentissuer || adminid` → โชว์ uuid. **FIX:** resolve adminId→ชื่อพนักงาน (เขียน + load · เผื่อใบเก่า FRG2606-00002). auto-receipt เก็บ "ระบบอัตโนมัติ" ถูกแล้ว.
2. **ใบเสร็จ 4 หน้า/ของล่างตก** — pagination บั๊ก · `ROWS_PER_PAGE` ใน load-receipt-document.ts · ต้อง repro.
3. **PR018 สถานะไม่ขยับ** — P22325 hstatus='4'. tracking `SF0219344032022` = เลข SF Express (ร้าน→โกดัง) **ไม่มีใน tb_forwarder + ไม่มีใน momo_import_tracks** (MOMO ใช้ `momo_tracking_no` คนละเลข) → auto-sync จับคู่ไม่ได้. **FIX (รอ workflow w2pz6588o ยืนยัน):** ปุ่ม manual "ถึงโกดังจีน" / reconcile SF↔MOMO / auto-create forwarder.
4. **wallet ติดลบ** — `tb_wallet.wallettotal` (stored) · แถว "เติมแอดมิน" = `type='2'`=DEBIT ไม่ใช่เครดิต (คู่เติม-แล้วจ่าย ขาเติมไม่เข้า). **FIX:** deep-link จากจุดติดลบ → `/admin/wallet/add?q=<PR>` (reuse `adminCreateWalletHsManual` เขียน wallettotal ถูกอยู่แล้ว). dashboard note แก้ข้อความแล้ว.

## 📋 Lane รอลุย (ไฟล์ไม่ชนกัน · gate ทุกอัน)
| lane | งาน | ต้อง |
|---|---|---|
| **DOC** | เอกสารครบ-ละเอียดเท่า PCS (footer แจง Delivery CHN/TH·Other·Discount·WHT line·order-no·page) + apply ทุกเอกสาร (ใบเสร็จ/บิล/ใบกำกับ) · เทียบ legacy `create-f-receipt.php` | legacy-fidelity-check |
| **RCPT** | แก้ชื่อ-uuid (#1) + 4หน้า (#2) | fix เล็ก |
| **INT** | integrate ภูม(5)+ปอน(1)→dave-pacred+gate | ผมทำ |
| **M1** | MOMO cost: อ่าน 4 invoice (`วางบิลต้นทุน MOMO`) + packing-list xlsx (`Packing List/MOMO`) → ingest `fcosttotalprice` + **วิธีจ่าย** | 🔴 owner เคาะวิธีจ่าย + เจาะ legacy |
| **M2** | backfill ต้นทุน MOMO ย้อนหลัง | dry-run→owner→apply (เงิน) |
| **M3** | packing-list detail (น้ำหนัก/คิว/กล่อง ต่อ tracking) ละเอียดในระบบ | — |
| **VAR** | variant สี→รุ่น→สเปค + ร้าน Taobao/1688 ไม่ตรง (ร้านเดียวคนละชื่อ) ทั้ง customer+admin | รอ workflow w2pz6588o |
| **YUAN** | ต้นทุนหยวนจริง แก้ได้ (ปลดล็อกทุกสถานะ · [[cost-editable-sell-locked]]) | รอ workflow |
| **PRF** | PRF/PRE display label (nameShipBy·ใบบิล·ใบเสร็จ·ฟอร์ม) keep stored PCSF | display only |
| **PUSH** | push 8 commit+งานน้อง→prod | 🔴 owner เคาะ |
| **FRI06** | FRI2606-00006 ฿21.57 re-issue/ปล่อย | 🔴 owner |

## 🔴 รอ owner เคาะ
1. วิธีจ่ายต้นทุน MOMO (ลงเฉยๆ / ปุ่มจ่ายต่อ invoice-ตู้?)
2. push prod ตอนนี้ไหม
3. FRI2606-00006
