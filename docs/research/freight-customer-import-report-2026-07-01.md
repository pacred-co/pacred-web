# รายงานนำเข้าลูกค้าฝั่งเฟรท — 2026-07-01

จาก AXELRA & NNB BOOKING + PACRED BOOKING (sheet `1.MEMBER SALE`). แก้ PR มั่ว → resolve ด้วยเบอร์ · เก็บข้อมูลครบ (เลขนิติ/บัตร/passport · LINE/FB · email · ที่อยู่ · หมายเหตุชีต) ลงหมายเหตุแอดมิน (userNote) + email/LINE ลงฟิลด์จริง.

## สรุป

| หมวด | จำนวน | คำอธิบาย |
|---|---|---|
| ✅ มีอยู่แล้ว (LINK) | 118 | เบอร์ตรง DB → ใช้ PR เดิม (ไม่แตะรหัส) |
| ✅ สร้างใหม่ (CREATE) | 251 | PR ใหม่ (ต่ำ-ว่าง) · login=เบอร์ · รหัส 123456 · userActive=1 |
| 🔴 ไม่มีเบอร์ (เข้า DB ไม่ได้) | 86 | ไม่มีเบอร์ทำ login → ต้องตามเบอร์ก่อน |
| 🔴 ตรวจมือ (เข้า DB ไม่ได้) | 1 | PR dup-key — เช็คมือ |

**ไฟล์ละเอียดทุกราย (เปิด Excel):** `/Users/dev/Desktop/freight-customer-report-2026-07-01.csv` (456 แถว · ทุกฟิลด์)

## 🔴 เข้า DB ไม่ได้ — ให้เซลไล่ตามเบอร์ (87 ราย)

มีข้อมูลให้ตามต่อ (เลขนิติ/บัตร/email/LINE/ที่อยู่) ครบในไฟล์ CSV. ตัวอย่าง:

| ชื่อ | เซล | เลขนิติ/บัตร | Email | LINE/FB | ชีต |
|---|---|---|---|---|---|
| ใบขนพ่วงแวท |  |  |  |  | PACRED |
| Great Minerva / PCS3546 | JEEN |  |  | PCS3546 / GM Golf  | PACRED |
| คุณแบม / PCS9530 | JEEN |  |  | PCS9530 / bambymm | PACRED |
| บริษัท ติ๊ อควาเรี่ยม จำกัด | PLOY |  |  |  | PACRED |
| บริษัท สมาร์ทเฮลท์โซลูชั่น จ | Jean |  |  | SURIYA.9365 | PACRED |
| Wisarut | Jean |  |  | Wisarut | PACRED |
| ป.รุ่งเรือง บี.เอส.เอ็น จําก | Jean |  |  | Est | PACRED |
| บริษัท มิสเตอร์ ออคโทพุส | Bam | 0105567073347 |  | PCS3174/k.สิน | PACRED |
| คุณชิว / PCS10634 | Jean |  |  | PCS10634 | PACRED |
| บริษัท อินโนเวทีฟ ฟู๊ด ทรัคส | WIN | 0105558077572 (สำนักงานใหญ่) |  |  | PACRED |
| บริษัท ทรีดีเน็กซ์เจน จำกัด | WIN | 0105568204267 |  | ทรีดีเน็กซ์เจน/Pac | PACRED |
| อัครวัฒน์ | Pee |  |  | Gift / Line | PACRED |
| บจก. เค ยีนส์แฟชั่น (ประเทศไ |  |  |  |  | PACRED |
| B.F.F AROMA CO. LTD | Mayjang | 0105565033836 |  | BFF AROMA x Pacred | PACRED |
| I.VOWLY CO.,LTD. |  | 0105568054320 |  |  | PACRED |
| mrnonaki | Pee | PR014 |  | mrnonaki/Line | PACRED |
| บริษัท เจดีเอ็น อิเล็กทริค จ | Mayjang | 0745568009671 |  | PCS10594 | PACRED |
| บริษัท แรพพิด มอเตอร์ส จำกัด | Pee | 0105565133245 |  | Tati Raris/L PR742 | PACRED |
| NK RELATION |  |  |  |  | PACRED |
| บริษัท อิน 789 คอนสตรัคชั่น  | Mayjang |  |  |  | PACRED |
| บริษัท พี.ซี.เอส.ซีเฟรท จำกั | Mayjang |  |  |  | PACRED |
| PACGOLD TRADING | WIN |  |  |  | PACRED |
| A.T. Complete Co., Ltd. | Mayjang |  |  | PR023annty_eiei/L | PACRED |
| บริษัท เจ เเนต (ประเทศไทย) จ | Mayjang |  |  |  | PACRED |
|  | Mayjang |  |  |  | PACRED |
| บริษัท โฮมคาเมร่า แอนด์ ไอที | Mayjang |  |  |  | PACRED |
| อริศรา เทิดประเสริฐ | Mayjang |  |  | PR137YUAN♡⸝⸝ | PACRED |
|  | Mayjang |  |  |  | PACRED |
| TTW |  |  |  |  | PACRED |
|  | Mayjang |  |  |  | PACRED |
| - |  |  |  |  | AXELRA |
| AXELRA (THAILAND) CO., LTD. |  | 105564077716 |  |  | AXELRA |
| THE N N B TRADING CO., LTD. |  |  |  |  | AXELRA |
| THE N N B TRADING CO., LTD. |  |  |  |  | AXELRA |
| THE N N B TRADING CO., LTD. |  |  |  |  | AXELRA |
| MARK |  |  |  | MARK | AXELRA |
| NANICHA | BEST |  |  | NANICHA | AXELRA |
| BEBEBUS | PARE |  |  | BEBEBUS | AXELRA |
| เอสที่เค บิลด์เดอร์ จำกัด | PARE | 0105567253981 |  | Gauze™Saran | AXELRA |
| เอเชีย ไบโอ แคร์ | BEST | 125566011925 |  | เอเชีย ไบโอ แคร์ | AXELRA |
| _...อีก 46 ราย (ดูใน CSV)_ | | | | | |
| คชาธร ทองศรี (0922750655) | | | | | no auth match either |

## หมายเหตุ
- เซล: Mayjang/MAY→เมย์ · Pupu→ปุ๊ · Pee→พี่ · ที่เหลือ(ออกแล้ว)→ส่วนกลาง · CS→พลอย
- ข้อมูลทั้งหมดอยู่ในหมายเหตุแอดมิน (userNote) ของลูกค้าแต่ละราย + email/LINE ลงฟิลด์จริงด้วย (234 field-fills)
- ลูกค้าสร้างใหม่: รหัส 123456 ทุกคน · ลูกค้าให้รีเซ็ตตอน login จริง
