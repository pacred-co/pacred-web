/**
 * ข้อมูลนิติบุคคลครบพอจะ "รับเงิน + ออกใบเสร็จนามนิติ" หรือยัง — แยกตัวที่คิดเงิน ออกจาก
 * ตัวที่แค่พิมพ์บนเอกสาร.
 *
 * Owner (2026-07-23): บัญชีกดยืนยันสลิปให้ลูกค้าไม่ได้ ขึ้น
 * `ตรวจสอบยอดรายการจริงไม่สำเร็จ (corporate_billing_profile_incomplete)` — ทั้งที่
 * **ลูกค้าโอนเงินมาแล้ว**. เคสจริง PR022 (บริษัท เจ แนค): ชื่อ ✓ เลขภาษี ✓ แต่ **ที่อยู่นิติว่าง**.
 *
 * ── ทำไมต้องแยก ─────────────────────────────────────────────
 * ตัวที่คิดเงินคือ `isCorporate` (boolean) ตัวเดียว — ส่งเข้า computeForwarderDebitBatch
 * แล้วไปกำหนดหัก ณ ที่จ่าย 1% ผ่าน `legacyReceiptAmount`. **ที่อยู่ไม่ได้เข้าสูตรเงินเลย**
 * (grep แล้ว: corporateaddress ถูกใช้เฉพาะตอน render เอกสาร/โปรไฟล์). ยอดเงินจึงเท่ากันเป๊ะ
 * ไม่ว่าจะมีที่อยู่หรือไม่ → ไม่มีเหตุผลให้มันบล็อกเส้นเงิน.
 *
 * ── ทำไมมันเจ็บ ─────────────────────────────────────────────
 * guard ตัวนี้ถูกเรียก **2 จังหวะ**:
 *   · ก่อนลูกค้าจ่าย (quote)      → บล็อก = ป้องกันได้จริง (กันสร้างสถานะพัง)
 *   · หลังเงินเข้าแล้ว (บัญชีอนุมัติ) → บล็อก = **กันอะไรไม่ได้เลย** เงินอยู่ในบัญชีแล้ว
 *     ลูกค้าจ่ายแล้ว แต่ออกใบเสร็จไม่ได้ · งานค้าง · บัญชีไปต่อไม่ถูก
 * คลาสเดียวกับบทเรียน 2026-06-14 (credit fstatus=6 บล็อกการยิงรับของ) — guard ที่ port
 * เพิ่มเข้ามาบนเส้นที่ legacy ไม่เคยกั้น แล้วไปโผล่ผิดฝั่งของเหตุการณ์เงิน.
 *
 * ── กฎที่ใช้ ────────────────────────────────────────────────
 *   ชื่อนิติ + เลขประจำตัวผู้เสียภาษี = MONEY-CRITICAL → ขาด = บล็อก (พิสูจน์ตัวตนนิติไม่ได้
 *     จะออกใบเสร็จนามนิติ + หัก 1% ไม่ได้ · ตรงกับเจตนาเดิมของ guard)
 *   ที่อยู่นิติ                      = DOCUMENT-ONLY → ขาด = ผ่าน + เตือนให้ไปเติม
 *
 * PURE — ไม่มี I/O. ตัวตัดสินที่เดียว เพื่อไม่ให้ quote กับ approve ตัดสินคนละแบบ.
 */

export type CorporateProfileInput = {
  corporatename: string | null | undefined;
  corporatenumber: string | null | undefined;
  corporateaddress: string | null | undefined;
};

export type CorporateProfileVerdict = {
  /** ช่อง money-critical ที่ขาด — ว่าง = ผ่าน · มีค่า = ต้องบล็อก. */
  blockingMissing: string[];
  /** ข้อความเตือนเรื่องเอกสาร (ไม่บล็อก) · null = ไม่มีอะไรต้องเตือน. */
  warning: string | null;
};

const t = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * ตัดสินโปรไฟล์นิติ. เรียกเฉพาะเมื่อรู้แล้วว่าลูกค้าเป็นนิติ (userCompany='1' หรือมีแถว
 * tb_corporate) — ฟังก์ชันนี้ไม่ตัดสินว่าเป็นนิติหรือไม่.
 */
export function classifyCorporateProfile(
  corp: CorporateProfileInput | null | undefined,
): CorporateProfileVerdict {
  const name = t(corp?.corporatename);
  const taxId = t(corp?.corporatenumber);
  const address = t(corp?.corporateaddress);

  const blockingMissing: string[] = [];
  if (!name) blockingMissing.push("ชื่อนิติบุคคล");
  if (!taxId) blockingMissing.push("เลขประจำตัวผู้เสียภาษี");

  // เตือนเรื่องที่อยู่เฉพาะตอนที่ "ผ่านแล้ว" — ถ้ายังบล็อกอยู่ ให้บอกเรื่องที่บล็อกอย่างเดียว
  // ไม่งั้นคนอ่านจะไม่รู้ว่าต้องแก้อะไรก่อน
  const warning =
    blockingMissing.length === 0 && !address
      ? "ยังไม่ได้กรอกที่อยู่นิติบุคคล (ยอดเงินถูกต้อง แต่เอกสารจะไม่มีที่อยู่)"
      : null;

  return { blockingMissing, warning };
}
