/**
 * สรุปหัวร้านค้าบนหน้า ฝากสั่งซื้อ — จำนวนชิ้น + ราคาเฉลี่ยต่อชิ้นของทั้งร้าน.
 *
 * owner 2026-07-24: *"หัวแถวร้านค้า เพิ่ม จำนวนรวมทั้งหมดกี่ชิ้น ราคาเฉลี่ยต่อชิ้นของทั้งร้าน
 * ทำให้เอื้ออำนวยต่อคนทำงานจริง"* + *"เช็คชัวร์ด้วยนะครับ ว่า ราคารวม หารจำนวนชิ้นทั้งหมด
 * ของร้านค้านั้น คำนวณออกมาครบถูกต้องเป็นตัวเลขตามจริงทั้งหมด"*
 *
 * ── กฎที่ห้ามหลุด ────────────────────────────────────────────────────────
 * 1. **ชิ้น ≠ รายการ** — "รายการ" = จำนวนบรรทัด · "ชิ้น" = Σ camount
 * 2. **แถวคืนเงิน = 0 ทั้งเงินและชิ้น** (ตรงกับ `lineOf`/`foreignSubtotal` บนหน้าจอ)
 *    → ตัวเศษกับตัวส่วนมาจากชุดแถวเดียวกันเสมอ เฉลี่ยจึงไม่มีทางเพี้ยนเชิงโครงสร้าง
 * 3. **🔴 ทศนิยมต้อง "คูณกลับได้เป๊ะ" — ไม่ใช่แค่คลาดน้อย** (owner 2026-07-24, verbatim:
 *    *"ถ้าคำนวณกลับ คำนวณย้อนกลับสลับไปมาในแต่ละค่า ของชิปเม้นนั้น เลขต้องกลับมาตรงกัน
 *    ทั้งหมดครับ ขยายทศนิยมเป็นตามจริงเลยครับ มันกระทบกับเรื่องเงินเรื่องบัญชีครับ
 *    ขนาด คิวยังต้องทศนิยมละเอียดเลยครับ"*)
 *
 *    ⛔ เกณฑ์ "คลาด ≤ 0.5%" ที่เคยตั้งไว้ = **ผิด · owner ตีตก** — บัญชีเอาตัวเลขไปกระทบยอด
 *    เฉลี่ย × ชิ้น ต้องได้ยอดรวมเดิม **ถึงสตางค์** ไม่งั้นงบไม่ลง.
 *    (precedent: คิว/CBM ก็ถูกขยายเป็น 6 ตำแหน่งด้วยเหตุผลเดียวกัน — mig 0192)
 *
 *    → `reconcilableDecimals` หาจำนวนทศนิยม **น้อยที่สุดที่ยังคูณกลับได้เป๊ะ**
 *      แล้วโชว์เท่านั้น (ไม่ยัด 10 ตำแหน่งรกตาโดยไม่จำเป็น)
 *
 *    เคสจริงบน prod ที่พิสูจน์ว่า 2 ตำแหน่งใช้ไม่ได้:
 *      P22352  ¥1,838.70 ÷ 10,000 → "0.18" คูณกลับได้ 1,800.00  (ห่าง ฿38.70)
 *      P22367  ¥9,851.19 ÷ 19,900 → "0.50" คูณกลับได้ 9,950.00  (ห่าง ฿98.81)
 *      P22453  ¥3,686.50 ÷  1,140 → "3.23" คูณกลับได้ 3,682.20  (ห่าง  ฿4.30)
 */

export type ShopSummaryRow = {
  /** จำนวนชิ้นของบรรทัดนั้น (tb_order.camount) */
  camount: number;
  /** '1' = คืนเงินแล้ว → นับ 0 ทั้งเงินและชิ้น */
  crewallet?: string | null;
};

/** จำนวนชิ้นของร้าน — แยก "ที่นับ" กับ "ที่คืนเงินไปแล้ว" ให้ชัด (ไม่ให้ตัวเลขหายเงียบ). */
export function shopPieces(rows: ShopSummaryRow[]): { pieces: number; refundedPieces: number } {
  let pieces = 0;
  let refundedPieces = 0;
  for (const r of rows) {
    const n = Number(r.camount) || 0;
    if (r.crewallet === "1") refundedPieces += n;
    else pieces += n;
  }
  return { pieces, refundedPieces };
}

/** ราคาเฉลี่ยต่อชิ้น (ตัวเลขดิบ) — ชิ้น ≤ 0 → null (หน้าจอโชว์ "—" ห้ามหารศูนย์). */
export function shopAveragePerPiece(total: number, pieces: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(pieces) || pieces <= 0) return null;
  return total / pieces;
}

/** ปัดเป็นสตางค์ (หน่วยที่บัญชีกระทบยอด). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** ปัดที่ d ตำแหน่ง. */
const roundTo = (n: number, d: number) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** เพดานทศนิยม — พอสำหรับ ชิ้น ระดับหลักล้าน (ยังไม่เคยต้องใช้ถึงขนาดนี้บน prod). */
export const MAX_AVG_DECIMALS = 10;

/**
 * จำนวนทศนิยม **น้อยที่สุด** ที่ทำให้ `เฉลี่ย × ชิ้น` กลับมาได้ยอดรวมเดิมเป๊ะ (ถึงสตางค์).
 *
 * นี่คือหัวใจของกฎ owner: บัญชีต้องคูณ/หารย้อนไปมาแล้วเลขตรงกันหมด.
 * เริ่มจาก 2 แล้วไล่ขึ้น → ตัวเลขปกติยังได้ 2-3 ตำแหน่งสวยๆ ส่วนเคสที่ต้องการ
 * ความละเอียดจริงๆ ก็จะขยายให้เอง โดยไม่ต้องยัด 10 ตำแหน่งรกตาทุกร้าน.
 */
export function reconcilableDecimals(total: number, pieces: number, max = MAX_AVG_DECIMALS): number {
  if (!Number.isFinite(total) || !Number.isFinite(pieces) || pieces <= 0) return 2;
  const target = round2(total);
  for (let d = 2; d <= max; d += 1) {
    if (round2(roundTo(total / pieces, d) * pieces) === target) return d;
  }
  return max;
}

/**
 * ฟอร์แมตราคาเฉลี่ยด้วยทศนิยม "ตามจริง" — คูณกลับด้วยจำนวนชิ้นแล้วต้องได้ยอดรวมเดิม.
 *
 * ต้องส่ง `total` + `pieces` มาด้วย (ไม่ใช่แค่ค่าเฉลี่ย) เพราะความละเอียดที่ต้องใช้
 * ขึ้นกับ **จำนวนชิ้น** — ยิ่งชิ้นเยอะ ยิ่งต้องละเอียด (19,900 ชิ้น ต้องการมากกว่า 20 ชิ้น).
 *
 * @param locale "th-TH" สำหรับ ¥ (ตรงกับ helper `cny`) · "en-US" สำหรับสกุลต่างประเทศ (ตรง `fcur`)
 */
export function formatAveragePerPiece(
  total: number,
  pieces: number,
  locale: "th-TH" | "en-US" = "th-TH",
): string {
  const avg = shopAveragePerPiece(total, pieces);
  if (avg == null) return "—";
  const d = reconcilableDecimals(total, pieces);
  return avg.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: d });
}

/**
 * แยกส่วน "อ่านเร็ว" (2 ตำแหน่งแรก) กับ "หางความละเอียด" ที่มีไว้ให้บัญชีกระทบยอด —
 * หน้าจอโชว์หางด้วยสีจางกว่า เพื่อให้กวาดตาอ่านราคาได้เร็วเหมือนเดิม แต่เลขยังครบ.
 */
export function splitAveragePerPiece(
  total: number,
  pieces: number,
  locale: "th-TH" | "en-US" = "th-TH",
): { head: string; tail: string } {
  const full = formatAveragePerPiece(total, pieces, locale);
  if (full === "—") return { head: "—", tail: "" };
  const dot = full.indexOf(".");
  if (dot < 0) return { head: full, tail: "" };
  return { head: full.slice(0, dot + 3), tail: full.slice(dot + 3) };
}
