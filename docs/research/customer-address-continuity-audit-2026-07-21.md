# Customer Address Continuity: Dave/Poom Commit Audit & Recurrence Guard

วันที่ตรวจ: 2026-07-21
ผู้ตรวจ/ผู้แก้: Codex (`codex`)
ฐานงาน: เริ่มจาก `origin/dave-pacred@4c66ca9e`; final sync/merge ถึง `origin/dave-pacred@28d9be64` แล้ว และตรวจ `origin/Poom-pacred@0e19e2b4` ที่นำหน้า Dave 3 commit แล้ว (แตะเฉพาะ label ขนส่ง/สีสถานะใน 2 UI files; ไม่มี file/table/migration ชน)
ขอบเขต: member/admin บันทึกและตั้งที่อยู่ → แก้ที่อยู่บน forwarder → MOMO/manual import ใช้ที่อยู่ → data-health ตรวจการถอยกลับ
ข้อจำกัด: รอบนี้ไม่มี write ใดไป DEV/PROD และ migration 0270 ยังไม่ถูก apply

## Executive result

ปัญหาไม่ได้อยู่ที่ propagation กล่องเพียงอย่างเดียว แต่เกิดจาก “ที่อยู่จริงของลูกค้า” มี 3 แหล่งที่ไม่มี invariant ร่วมกัน:

```text
tb_address (สมุดที่อยู่) ──► tb_address_main (ค่าเริ่มต้น)
             │                       │
             └──── tb_users.userAddressID (ที่ใช้ล่าสุดในตะกร้า)
                                     │
                                     ▼
                         tb_forwarder.fAddress* (snapshot ของงาน)
```

ก่อนแก้ พนักงานพิมพ์ซ่อม `tb_forwarder.fAddress*` ได้ แต่ข้อมูลไม่ย้อนกลับเข้า `tb_address`; ครั้งถัดไป MOMO จึงยังหา default ไม่พบและสร้าง snapshot ว่างได้ ขณะเดียวกัน `tb_address_main` ไม่มี unique/ownership/active constraint ทำให้มีแถวซ้ำ ชี้คนอื่น ชี้แถวลบ หรือหายไปทั้งแถวได้

หลัง patch นี้ เส้นทางตั้งใจเป็น:

```text
พนักงานพิมพ์แก้ ─► validate+normalize ─► save/reuse tb_address
                                      └► set tb_address_main + userAddressID
                                      └► snapshot เข้า forwarder + propagate siblings

MOMO/manual import ─► PCS รับเอง ? ใช้โกดัง : ต้องมี active owned address
                                      └► ไม่มี = หยุดสร้างงานพร้อมข้อความแก้ไข
```

## Commit audit ของ Dave และ Poom

| Commit | ผู้ทำ | สิ่งที่แก้ | จุดที่ตรวจพบต่อ |
|---|---|---|---|
| `15eefd3e` | Poom | inline edit ราย field บน forwarder detail | UI เปิดทางพิมพ์ snapshot ได้สะดวก แต่ไม่ได้เปลี่ยน address-book semantics |
| `f9aac406` | Poom | propagate address/carrier/paymethod ไป sibling ของ split shipment | แก้ “กล่องเดียวกันคนละที่อยู่” ถูกทิศ แต่ propagate เพียง `tb_forwarder`; ต้นทาง reusable address ยังไม่ถูกบันทึก |
| `de9b083b` | Dave | review/อุด 6 จุดเงินและข้อมูล: PRF/PRE, paid/invoice guards, paymethod, disjoint lots, status scope, read cap | money isolation ดีขึ้นและต้องคงไว้; patch รอบนี้เรียก persistence ก่อน snapshot แล้วปล่อย propagation เดิมทำงานต่อ ไม่แก้กติกาเงิน |
| `7db368e5` | Poom | report-cnt entity badge จาก `tb_users.userCompany` | ไม่เกี่ยวที่อยู่และไม่ชนไฟล์ patch; ไม่ cherry-pick เพราะรอ Dave integrate ตาม workflow |
| `49e5875b` | Dave | เพิ่มขนส่งและล็อกขนส่งเอกชนเป็น COD/ค่าส่งไทย 0 | ชนตรง 4 action ของ address flow; final merge รักษาทั้ง validated address snapshot และ COD lock ทั้งแถวหลัก/sibling แล้ว |
| `0a8eea30` | Poom | แสดงชื่อขนส่งแทนรหัสใน forwarder-check | อยู่บน Poom ที่นำหน้า Dave; ไม่ชน source/table/migration ของ patch นี้ จึงไม่ cherry-pick ข้าม integration branch |
| `0e19e2b4` | Poom | แก้ carrier label และสี status badge ใน customer legacy view | ตรวจหลัง final gate; แตะ UI file เดียว ไม่ชน address action/helper/table/migration และรอ Dave integrate ตาม workflow |

## Root causes ที่ยืนยันจาก source

| ID | ระดับ | ต้นเหตุ | ผลกระทบ |
|---|---|---|---|
| ADR-01 | P0 | `adminUpdateForwarderAddressDetails` เขียนเฉพาะ `tb_forwarder.fAddress*` | พนักงานซ่อมงานปัจจุบันสำเร็จ แต่ลูกค้ากลับมาครั้งหน้าระบบยังไม่มีที่อยู่ให้ใช้ |
| ADR-02 | P0 | `adminAddCustomerAddress` insert `tb_address` แต่ไม่สร้าง/ซ่อม `tb_address_main` | address picker เห็นข้อมูล แต่ MOMO default resolver ยังเห็นว่าไม่มีค่าเริ่มต้น |
| ADR-03 | P0 | `tb_address_main` มีเพียง PK `id`; ไม่มี unique `userid`, FK-like ownership หรือ active guard | duplicate ทำ `.maybeSingle()` error; dangling/cross-user/deleted pointer ทำให้ดึงที่อยู่ผิดหรือไม่ได้ |
| ADR-04 | P0 | interactive MOMO commit fallback เป็น `EMPTY_ADDRESS` แต่ cron skip เมื่อไม่มี default | manual กับ cron มี business rule คนละชุด และ manual สร้างงานข้อมูลผู้รับว่างได้ |
| ADR-05 | P0 | manual import fallback ไป PCS warehouse ทั้งที่ไม่ได้เลือกรับเอง | ปลายทางดู “ครบ” แต่เป็นโกดัง Pacred ผิดความจริง |
| ADR-06 | P1 | member add ใช้ INSERT แล้ว SELECT address ล่าสุดด้วย query แยก | concurrent submit อาจเอา addressid ของอีก request ไปตั้งเป็น main |
| ADR-07 | P1 | member/admin set-main ตรวจ ownership แต่ไม่ตรวจ `addressstatus='1'` และไม่ align `tb_users.userAddressID` | แถวลบกลับมาเป็น default ได้; cart “ใช้ล่าสุด” กับ main แยกทิศ |
| ADR-08 | P1 | validation แต่ละหน้าต่างกัน: field ว่าง, zip ไม่ตรง 5, tel2 เกิน DB varchar(10), จังหวัดไม่ canonical | ข้อมูลคุณภาพต่ำหรือ DB reject หลัง user กดยืนยันแล้ว |
| ADR-09 | P1 | ไม่มี monitor สำหรับ pointer drift และ live forwarder ที่ผู้รับไม่ครบ | ปัญหาบานปลายจนพนักงาน/ลูกค้าเจอก่อนระบบ |

## สิ่งที่ patch แก้

1. เพิ่ม `lib/admin/customer-address-book.ts` เป็น save-or-reuse/default SOT:
   - normalize NFKC/ช่องว่างและชื่อจังหวัดไทย;
   - บังคับชื่อ–นามสกุล–โทร–ที่อยู่–ตำบล–อำเภอ–จังหวัด–zip;
   - reuse ที่อยู่ core เดิม แทนการสร้าง duplicate; refresh เบอร์สำรอง/หมายเหตุ/พิกัด;
   - ซ่อม duplicate main แบบ deterministic และ align `userAddressID` เมื่อเลือก default.
2. ที่อยู่ที่ staff พิมพ์ใน forwarder จะ save/reuse และตั้ง default **ก่อน** เขียน snapshot; ถ้าบันทึก reusable address ไม่ผ่าน จะไม่สร้าง one-off snapshot อีก.
3. ปุ่มเพิ่มที่อยู่ reusable ของ admin ใช้ helper เดียวกัน; บน forwarder ที่อยู่ใหม่ถูกบอกใน confirm และตั้งเป็นค่าเริ่มต้นครั้งถัดไป.
4. member add เลิก INSERT→SELECT latest race; member/admin set-main ใช้ active+ownership guard และจำค่าให้ checkout ครั้งถัดไป.
5. MOMO/manual import ยังคงอนุญาต `PCS` แบบ explicit แต่ path อื่นต้องมี active owned address; ไม่มีแล้ว fail closed พร้อมข้อความให้บันทึกก่อน.
6. migration `0270_customer_address_main_guard.sql`:
   - dedupe โดย prefer pointer ที่ active+owned;
   - repair dangling pointer และ backfill missing main จาก active address แรก;
   - unique index ต่อ `userid`;
   - NOT VALID completeness constraint: historical dirty rows remain for correction, but new/updated active rows must be delivery-complete;
   - trigger guard complete+active+ownership;
   - first active address auto-main แบบ concurrency-safe;
   - main change sync `tb_users.userAddressID`;
   - ห้าม hard/soft delete หรือ reassign current main จนกว่าจะเลือกตัวใหม่.
7. เพิ่ม Data Health ระดับ red สอง invariant:
   - `customer_main_address_invalid`;
   - `live_forwarder_missing_delivery`.

## PROD read-only preview ที่ Dave ควรรันก่อน apply

ห้ามใช้ตัวเลขจากการเดา รอบนี้ไม่ได้ต่อฐาน PROD. ให้ Dave เก็บผลก่อน/หลังด้วย query read-only ต่อไปนี้:

```sql
-- A. user ที่มี main ซ้ำ
select userid, count(*) as main_rows, array_agg(id order by id) as ids
from public.tb_address_main
group by userid
having count(*) > 1;

-- B. main ชี้ missing/deleted/cross-user
select m.id, m.userid, m.addressid,
       a.userid as address_owner, a.addressstatus
from public.tb_address_main m
left join public.tb_address a on a.addressid = m.addressid
where a.addressid is null
   or a.userid <> m.userid
   or a.addressstatus <> '1';

-- C. มี active address แต่ไม่มี main
select a.userid, count(*) as active_addresses, min(a.addressid) as repair_candidate
from public.tb_address a
left join public.tb_address_main m on m.userid = a.userid
where a.addressstatus = '1' and m.id is null
group by a.userid;

-- C2. active address เดิมที่ข้อมูลผู้รับไม่ครบ (migration จะไม่ใช้เป็น main)
select addressid, userid
from public.tb_address
where addressstatus = '1'
  and (
    coalesce(btrim(addressname), '') = '' or
    coalesce(btrim(addresslastname), '') = '' or
    coalesce(btrim(addresstel), '') !~ '^[0-9]{9,10}$' or
    (coalesce(btrim(addresstel2), '') <> '' and btrim(addresstel2) !~ '^[0-9]{9,10}$') or
    coalesce(btrim(addressno), '') = '' or
    coalesce(btrim(addresssubdistrict), '') = '' or
    coalesce(btrim(addressdistrict), '') = '' or
    coalesce(btrim(addressprovince), '') = '' or
    coalesce(btrim(addresszipcode), '') !~ '^[0-9]{5}$'
  )
order by userid, addressid;

-- D. งาน live ที่ไม่ได้เลือกรับเองและผู้รับไม่ครบ
select id, userid, ftrackingchn, fstatus, fshipby
from public.tb_forwarder
where fstatus in ('1','2','3','4','5','6')
  and coalesce(btrim(fshipby), '') <> 'PCS'
  and (
    coalesce(btrim(faddressname), '') = '' or
    coalesce(btrim(faddresslastname), '') = '' or
    coalesce(btrim(faddressno), '') = '' or
    coalesce(btrim(faddresssubdistrict), '') = '' or
    coalesce(btrim(faddressdistrict), '') = '' or
    coalesce(btrim(faddressprovince), '') = '' or
    coalesce(btrim(faddresszipcode), '') = '' or
    coalesce(btrim(faddresstel), '') = ''
  )
order by fstatus, userid, id;
```

## Verification record

ผ่านบน worktree:

- `pnpm test:customer-address-continuity` — 14 assertions ผ่าน: normalization, validation, legacy-row completeness, reuse fingerprint, default repair plan และ source/migration recurrence contracts.
- PostgreSQL local integration — apply migration 0270 จริงบนฐานชั่วคราว: duplicate/dangling/incomplete repair, missing-main backfill, PCS sentinel preservation, first-address default, last-used sync, new-row completeness/unique/cross-user guards, hard+soft-delete protection.
- regression: `auto-commit-momo-safety` 58, `momo-live-discovery-plan` 15, `carrier-coverage-guard` 69, `cart/ship-by-eligibility` 39, `pay-method` 31 — ผ่านทั้งหมด.
- `lib/admin/data-health/checks.test.ts` — 4 checks ผ่าน.
- `pnpm typecheck` — ผ่าน.
- `pnpm test:unit` หลัง merge `origin/dave-pacred@28d9be64` — full unit suite ผ่าน.
- `pnpm build` หลัง merge — production build, TypeScript และ static generation 28 pages ผ่าน (warning เฉพาะ local `NEXT_PUBLIC_SITE_URL` ไม่ได้ตั้ง จึง fallback ไป `https://pacred.co.th`).
- targeted ESLint — 0 errors; forwarder inline editorมี 3 warnings เดิม (`nameShipBy`, `_zip`, `_fshipby`) ไม่ได้เกิดจาก patch.
- `pnpm audit:md` — 6,363 local links ใน 1,493 Markdown files ผ่าน.
- `git diff --check` — ผ่าน.

ยังไม่ได้ยืนยัน:

- ไม่ได้ apply migration 0270 กับ DEV/PROD และไม่ได้แก้ข้อมูล PROD.
- ยังไม่ได้รัน authenticated browser E2E เพราะต้องใช้ DEV deployment/session และฐานที่ apply 0270 แล้ว.
- helper ฝั่ง application เป็นหลาย query ไม่ใช่ RPC transaction เดียว; migration ทำให้ pointer/default/last-used ลงท้ายแบบถูก invariant และ snapshot จะไม่เขียนถ้า helper error แต่ควรทำ failure-injection บน DEV ตาม acceptance ก่อน PROD.

## DEV acceptance ก่อนอนุมัติ PROD

1. ลูกค้าไม่มี address: MOMO/manual import ต้องหยุดพร้อมข้อความ; ห้ามมี `tb_forwarder` แถวใหม่.
2. staff พิมพ์ที่อยู่ครบใน forwarder: `tb_address` ต้องมีแถวเดียว (retry ไม่ duplicate), `tb_address_main` ชี้แถวนั้น, `tb_users.userAddressID` ตรง และ sibling snapshot ตรงกัน.
3. ลูกค้ากลับเข้าตะกร้าโดยไม่เลือกใหม่: ต้อง preload ที่อยู่ที่จำไว้.
4. member เพิ่ม address แรก: main+last-used ต้องถูกสร้าง; ยิงพร้อมกันสอง request ต้องมี main แถวเดียว.
5. เพิ่ม address ที่สองโดยไม่เลือก default: main เดิมต้องอยู่; กดตั้งเป็นหลักแล้วทั้ง main+last-used เปลี่ยน.
6. soft-delete/hard-delete current main ต้องถูกปฏิเสธ; เปลี่ยน main ก่อนแล้วจึงลบแถวเก่าได้.
7. ลองชี้ main ไป address ของคนอื่นหรือ deleted address ด้วย SQL ใน transaction: ต้องได้ SQLSTATE 23514.
8. explicit `PCS` ต้องสร้างงานด้วยที่อยู่โกดังได้; private/own-fleet delivery ที่ไม่ใช่ PCS ต้องมี customer address.
9. `/admin/data-health` ต้องแสดง pointer anomaly/live missing delivery จาก fixture และกลับ green เมื่อซ่อม.
10. ตรวจ money isolation ของ Dave: billed/paid/disjoint split siblings ต้องคง guard เดิมทุกตัว.

## Deployment order / rollback posture

1. Dave review report + migration repair preview A-D; export affected `tb_address_main`, `tb_users.userAddressID` ก่อน apply.
2. Apply 0270 ที่ DEV แล้วรัน acceptance 1-10 และ data-health.
3. Deploy codeพร้อม migration; ห้าม deploy fail-closed code ก่อนมี backfill/default migration เพราะจะ block ลูกค้าเก่าที่ pointer หายมากเกินจำเป็น.
4. ซ่อม existing live forwarder จาก Data Health โดยใช้หน้า edit ใหม่ เพื่อให้ snapshot และ address book ถูกพร้อมกัน; ห้าม bulk เดาที่อยู่.
5. Apply PROD ด้วย transaction/dry-run ตาม Dave runbook แล้วเทียบ count A-D ก่อน/หลัง.
6. Rollback application ทำได้ด้วย revert commit; migration 0270 ไม่ควรถูก `DROP` แบบรีบเร่ง เพราะจะเปิด recurrence. หาก trigger กระทบ path ที่ไม่พบใน DEV ให้ disable trigger เฉพาะตัวหลังเก็บ incident/evidenceและให้ Dave ตัดสิน.

## Branch handoff

- งานอยู่บน `codex` เท่านั้น; ไม่ push `main`/`dave-pacred`.
- migration 0270 เป็น branch-only และ next free migration ถูกจองเป็น 0271.
- รอ Dave review, apply DEV และ merge ตาม workflow ทีม; PROD ต้องรอ Confirm จากเจ้าของ.
