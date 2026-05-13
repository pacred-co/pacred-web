/**
 * Thai number → text conversion for receipts.
 *
 * Ported from PHP `ReadNumber()` in pcs-cargo legacy
 * (`C:\xampp\htdocs\pcscargo\member\include\function.php:1046`).
 *
 * Two exports:
 *   - `readThaiInteger(n)` — bare integer to text (returns "" for 0)
 *   - `readThaiBaht(amount)` — full "X บาท Y สตางค์" / "ถ้วน" for receipts
 *
 * Used by PDF receipt templates (`components/pdf/receipt-template.tsx`).
 */

const POSITION = ["แสน", "หมื่น", "พัน", "ร้อย", "สิบ", ""] as const;
const DIGIT    = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"] as const;

/**
 * Convert a non-negative integer to Thai text.
 *
 * Handles arbitrary size via recursion at the million boundary.
 * Returns "" for 0 (caller is expected to substitute "ศูนย์" if needed).
 *
 * @example
 *   readThaiInteger(0)          // ""
 *   readThaiInteger(1)          // "หนึ่ง"
 *   readThaiInteger(10)         // "สิบ"
 *   readThaiInteger(11)         // "สิบเอ็ด"
 *   readThaiInteger(21)         // "ยี่สิบเอ็ด"
 *   readThaiInteger(101)        // "หนึ่งร้อยเอ็ด"
 *   readThaiInteger(1000000)    // "หนึ่งล้าน"
 *   readThaiInteger(12345678)   // "สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปด"
 */
export function readThaiInteger(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  let num = Math.floor(n);
  if (num === 0) return "";

  let ret = "";

  // Recurse at million boundary — handles arbitrarily large numbers
  if (num >= 1_000_000) {
    ret += readThaiInteger(Math.floor(num / 1_000_000)) + "ล้าน";
    num = num % 1_000_000;
    if (num === 0) return ret;
  }

  let divider = 100_000;
  let pos = 0;
  while (num > 0) {
    const d = Math.floor(num / divider);
    if (d > 0) {
      if (divider === 10 && d === 2) {
        ret += "ยี่";                            // 20 → "ยี่สิบ" not "สองสิบ"
      } else if (divider === 10 && d === 1) {
        // 10 → "สิบ" (skip "หนึ่ง" prefix)
      } else if (divider === 1 && d === 1 && ret !== "") {
        ret += "เอ็ด";                           // 11 → "สิบเอ็ด", 21 → "ยี่สิบเอ็ด"
      } else {
        ret += DIGIT[d];
      }
      ret += POSITION[pos];
    }
    num = num % divider;
    divider = Math.floor(divider / 10);
    pos++;
  }
  return ret;
}

/**
 * Format a baht amount as Thai receipt text.
 *
 * Convention used in Thai accounting:
 *   - Whole baht: "...บาทถ้วน"
 *   - Baht + satang: "...บาท...สตางค์"
 *   - Satang only: "...สตางค์"
 *   - Zero: "ศูนย์บาทถ้วน"
 *   - Negative: "ลบ..." prefix (rare; used for refund vouchers)
 *
 * @example
 *   readThaiBaht(0)         // "ศูนย์บาทถ้วน"
 *   readThaiBaht(100)       // "หนึ่งร้อยบาทถ้วน"
 *   readThaiBaht(100.50)    // "หนึ่งร้อยบาทห้าสิบสตางค์"
 *   readThaiBaht(0.25)      // "ยี่สิบห้าสตางค์"
 *   readThaiBaht(1234.05)   // "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสตางค์"
 *   readThaiBaht(-50)       // "ลบห้าสิบบาทถ้วน"
 */
export function readThaiBaht(amount: number): string {
  if (!Number.isFinite(amount)) return "ศูนย์บาทถ้วน";

  const abs = Math.abs(amount);
  const baht = Math.floor(abs);
  // Round satang to integer (avoid floating-point drift from e.g. 0.1 + 0.2)
  const satang = Math.round((abs - baht) * 100);

  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";

  const sign = amount < 0 ? "ลบ" : "";
  const bahtText   = baht   > 0 ? `${readThaiInteger(baht)}บาท`     : "";
  const satangText = satang > 0 ? `${readThaiInteger(satang)}สตางค์` : "ถ้วน";

  // Edge case: only satang (baht=0) — drop the "ถ้วน" suffix from satangText branch above
  // (already handled: when baht=0, bahtText="" and satang>0 means satangText="...สตางค์", not "ถ้วน")
  if (baht === 0) return `${sign}${satangText}`;

  return `${sign}${bahtText}${satangText}`;
}
