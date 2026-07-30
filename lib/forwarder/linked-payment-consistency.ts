import type { ForwarderDebitBatch } from "./forwarder-debit-total";

export type StoredLinkedPaymentLine = { reforder: string | null; amount: number | string | null };

const cents = (value: number | string | null | undefined): number =>
  Math.round(Number(value ?? 0) * 100);

export function checkLinkedPaymentConsistency(
  storedTotal: number | string | null,
  storedLines: ReadonlyArray<StoredLinkedPaymentLine>,
  batch: ForwarderDebitBatch,
): { ok: true } | { ok: false; expectedTotal: number; differences: string[] } {
  const differences: string[] = [];
  if (cents(storedTotal) !== cents(batch.total_thb)) {
    differences.push(`total:${Number(storedTotal ?? 0).toFixed(2)}!=${batch.total_thb.toFixed(2)}`);
  }

  const storedById = new Map(storedLines.map((line) => [String(line.reforder ?? ""), line.amount]));
  for (const line of batch.lines) {
    const stored = storedById.get(line.id);
    if (stored === undefined) differences.push(`missing:${line.id}`);
    else if (cents(stored) !== cents(line.price_thb)) {
      differences.push(`${line.id}:${Number(stored).toFixed(2)}!=${line.price_thb.toFixed(2)}`);
    }
  }
  for (const ref of storedById.keys()) {
    if (!batch.lines.some((line) => line.id === ref)) differences.push(`unexpected:${ref}`);
  }

  return differences.length === 0
    ? { ok: true }
    : { ok: false, expectedTotal: batch.total_thb, differences };
}

/**
 * แปลรหัสส่วนต่างเป็นภาษาคน — "แถวไหน เปลี่ยนจากเท่าไรเป็นเท่าไร"
 *
 * 🔴 owner 2026-07-30 (/admin/wallet/106611): *"ยอดก็ตรงหมดนี่ครับ แล้วทำไมถึงกด
 * ตรวจสลิปออกใบเสร็จไม่ได้หละครับ"* — จอโชว์ "ยอดรวมทุกรายการ" = ผลรวมของ **ยอดที่แช่ไว้
 * ตอนสร้างรายการ** จึงเท่ากับสลิปเสมอ ส่วนด่านอนุมัติเทียบกับ **ยอดที่คิดสดจากแถวจริงวันนี้**
 * → เป็นคนละเวลา. เคสจริง: ลูกค้าโอน 29,990.88 ตอน 2 แถวเป็นเหมาๆ ฿100 แล้ว **หลังจากนั้น**
 * มีคนเปลี่ยนขนส่งเป็น PCSE + ล้างค่าส่งเป็น ฿0 (audit log 09:19 · 09:30 น. · หลังตรวจ
 * สลิปรอบ 1 ไปแล้วด้วยซ้ำ) → ยอดจริงเหลือ 29,890.88 = ลูกค้าจ่ายเกิน ฿100.
 *
 * ตัวเช็คคำนวณ `differences` รายแถวไว้ครบอยู่แล้ว แต่ข้อความ error เดิม**ทิ้งทั้งหมด**
 * เหลือแค่ยอดรวม ⇒ พนักงานเห็นแค่ "ควรเป็น X" แล้วไปต่อไม่ถูก (คลาสเดียวกับ
 * [[wrong-error-message-hides-real-block]] — error ที่ไม่บอกตัวจริงที่บล็อก).
 *
 * PURE — ไม่มี IO · แปลอย่างเดียว ไม่ตัดสินเงินใหม่.
 *
 * @param differences รหัสจาก `checkLinkedPaymentConsistency`
 * @returns บรรทัดภาษาไทย เรียงตามลำดับที่ตรวจเจอ
 */
export function describeLinkedPaymentDifferences(
  differences: ReadonlyArray<string>,
): string[] {
  const baht = (v: number) =>
    v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const out: string[] = [];
  for (const code of differences) {
    const missing = /^missing:(.+)$/.exec(code);
    if (missing) {
      out.push(`รายการ #${missing[1]} — มีในยอดจริง แต่ไม่ได้อยู่ในการชำระนี้`);
      continue;
    }
    const unexpected = /^unexpected:(.+)$/.exec(code);
    if (unexpected) {
      out.push(`รายการ #${unexpected[1]} — อยู่ในการชำระนี้ แต่ไม่อยู่ในยอดจริงแล้ว (ถูกลบ/ย้าย/จ่ายทางอื่น)`);
      continue;
    }
    const pair = /^(.+?):(-?[\d.]+)!=(-?[\d.]+)$/.exec(code);
    if (pair) {
      const [, who, storedRaw, liveRaw] = pair;
      const stored = Number(storedRaw);
      const live = Number(liveRaw);
      const delta = Math.round((stored - live) * 100) / 100;
      const label = who === "total" ? "ยอดรวม" : `รายการ #${who}`;
      const dir = delta > 0 ? "ลูกค้าจ่ายเกิน" : "ลูกค้าจ่ายขาด";
      out.push(
        `${label} — ตอนรับชำระ ฿${baht(stored)} · คิดจากข้อมูลวันนี้ ฿${baht(live)}`
        + ` (${dir} ฿${baht(Math.abs(delta))})`,
      );
      continue;
    }
    out.push(code); // รูปแบบที่ยังไม่รู้จัก — โชว์ดิบดีกว่ากลืนหาย
  }
  return out;
}
