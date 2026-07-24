/**
 * ล็อกกฎ "จำนวนชิ้น + ราคาเฉลี่ยต่อชิ้น" ของหัวร้านค้า ฝากสั่งซื้อ.
 *
 * 🔴 กฎเหล็ก (owner 2026-07-24): *"ถ้าคำนวณกลับ คำนวณย้อนกลับสลับไปมาในแต่ละค่า
 * ของชิปเม้นนั้น เลขต้องกลับมาตรงกันทั้งหมดครับ ขยายทศนิยมเป็นตามจริงเลยครับ
 * มันกระทบกับเรื่องเงินเรื่องบัญชีครับ"*
 * → เกณฑ์คือ **เฉลี่ย × ชิ้น = ยอดรวม เป๊ะถึงสตางค์** ไม่ใช่ "คลาดน้อย"
 *
 * ตัวเลขทุกเคสมาจาก prod จริง (สแกนทุกกลุ่มร้าน ทุกออเดอร์ 2026-07-24).
 *
 * Run: tsx lib/shop-order/shop-group-summary.test.ts
 */
import assert from "node:assert/strict";
import {
  shopPieces,
  shopAveragePerPiece,
  formatAveragePerPiece,
  reconcilableDecimals,
  splitAveragePerPiece,
} from "./shop-group-summary";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** คูณกลับจากเลขที่หน้าจอโชว์จริง — ต้องได้ยอดรวมเดิมเป๊ะ. */
function multiplyBack(total: number, pieces: number): number {
  const shown = Number(formatAveragePerPiece(total, pieces).replace(/,/g, ""));
  return round2(shown * pieces);
}

console.log("shopPieces — ชิ้น ≠ รายการ");

ok("Σ camount ไม่ใช่จำนวนบรรทัด (52 บรรทัด × 12 = 624 ชิ้น)", () => {
  const rows = Array.from({ length: 52 }, () => ({ camount: 12 }));
  assert.equal(shopPieces(rows).pieces, 624);
});

ok("แถวคืนเงินไม่นับเป็นชิ้น แต่รายงานแยกให้เห็น", () => {
  const { pieces, refundedPieces } = shopPieces([
    { camount: 10 },
    { camount: 20, crewallet: "1" },
    { camount: 5 },
  ]);
  assert.equal(pieces, 15);
  assert.equal(refundedPieces, 20, "ต้องไม่หายเงียบ — หน้าจอโชว์ชิปบอก");
});

ok("camount เพี้ยน/ว่าง → นับ 0 ไม่พัง", () => {
  assert.equal(
    shopPieces([{ camount: Number.NaN }, { camount: 3 }, { camount: undefined as unknown as number }]).pieces,
    3);
});

console.log("\nshopAveragePerPiece — ห้ามหารศูนย์");

ok("ชิ้น = 0 → null (ทั้งร้านคืนเงินหมด)", () => {
  assert.equal(shopAveragePerPiece(500, 0), null);
});

ok("ชิ้นติดลบ / ค่าไม่ใช่ตัวเลข → null", () => {
  assert.equal(shopAveragePerPiece(500, -3), null);
  assert.equal(shopAveragePerPiece(Number.NaN, 10), null);
});

console.log("\n🔴 reconcilableDecimals — ทศนิยมต้องพอให้คูณกลับได้เป๊ะ");

ok("ยิ่งชิ้นเยอะ ยิ่งต้องละเอียด (ความละเอียดขึ้นกับจำนวนชิ้น ไม่ใช่ขนาดของราคา)", () => {
  const dSmall = reconcilableDecimals(36.5, 20);
  const dBig = reconcilableDecimals(9851.19, 19900);
  assert.ok(dBig > dSmall, `20 ชิ้นใช้ ${dSmall} ตำแหน่ง · 19,900 ชิ้นใช้ ${dBig}`);
});

ok("หารลงตัว → 2 ตำแหน่งพอ ไม่ขยายเกินจำเป็น", () => {
  assert.equal(reconcilableDecimals(247.5, 165), 2); // = 1.50 พอดี
  assert.equal(formatAveragePerPiece(247.5, 165), "1.50");
});

ok("ยอด 0 → 2 ตำแหน่ง", () => {
  assert.equal(reconcilableDecimals(0, 100), 2);
  assert.equal(formatAveragePerPiece(0, 100), "0.00");
});

console.log("\n🔴 INVARIANT — เฉลี่ยที่โชว์ × ชิ้น = ยอดรวม เป๊ะถึงสตางค์");

/** 15 กลุ่มร้านจริงบน prod — ครอบตั้งแต่ของถูกหลักสตางค์ ถึงของแพงหลักหมื่น. */
const REAL: Array<[number, number, string]> = [
  [3686.5, 1140, "嘉立饰品厂 P22453"],
  [1716.2, 756, "祥超饰品168 P22453"],
  [2279, 380, "义乌市卿闻饰品厂 P22453"],
  [1838.7, 10000, "泰州市固卓不锈钢 P22352 (เคยโชว์ 0.18 → 1,800)"],
  [9851.19, 19900, "广州海帝博斯 P22367 (เคยโชว์ 0.50 → 9,950)"],
  [3412.39, 6000, "广州海帝博斯 P22349"],
  [36764, 240, "抹香鲸电子 P22359"],
  [38310, 195, "抹香鲸电子 P22324"],
  [247.5, 165, "顺成饰品电子 P22328"],
  [593, 1200, "海帝博斯 P22326"],
  [2249.13, 4200, "海帝博斯 P22331"],
  [1506.7, 630, "新之叶电子 P22328"],
  [36.5, 20, "董妈百货 P22322"],
  [1198.8, 17 * 10, "宸迎饰品"],
  [477.9, 9 * 30, "涵锜饰品"],
];

ok("ทุกเคสจริง 15 กลุ่ม: คูณกลับได้ยอดรวมเดิมเป๊ะ (ไม่ใช่ใกล้เคียง)", () => {
  for (const [total, pieces, label] of REAL) {
    const back = multiplyBack(total, pieces);
    assert.equal(
      back, round2(total),
      `${label}: ${total} ÷ ${pieces} → โชว์ ${formatAveragePerPiece(total, pieces)} · คูณกลับ ${back}`,
    );
  }
});

ok("🔴 กันถอยหลัง: 2 ตำแหน่งตายตัว จะ FAIL เคสพวกนี้ (เหตุผลที่ต้องขยาย)", () => {
  const twoDp = (t: number, p: number) => round2(Number((t / p).toFixed(2)) * p);
  assert.notEqual(twoDp(1838.7, 10000), round2(1838.7));  // 1,800.00
  assert.notEqual(twoDp(9851.19, 19900), round2(9851.19)); // 9,950.00
  assert.notEqual(twoDp(3686.5, 1140), round2(3686.5));    // 3,682.20
});

ok("สุ่มตรวจ 3,000 ชุด (ยอด × จำนวนชิ้น หลากหลาย) — คูณกลับตรงทุกชุด", () => {
  let seed = 20260724;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 3000; i += 1) {
    const pieces = 1 + Math.floor(rnd() * 25000);
    const total = round2(rnd() * 50000);
    if (total === 0) continue;
    assert.equal(
      multiplyBack(total, pieces), round2(total),
      `${total} ÷ ${pieces} → ${formatAveragePerPiece(total, pieces)}`,
    );
  }
});

console.log("\nการแสดงผล");

ok("ตัวส่วนต้องมาจากชุดแถวเดียวกับตัวเศษ (แถวคืนเงินตัดทั้งคู่)", () => {
  const { pieces } = shopPieces([{ camount: 10 }, { camount: 90, crewallet: "1" }, { camount: 10 }]);
  assert.equal(pieces, 20, "ชิ้นต้องไม่รวม 90 ที่คืนเงิน");
  assert.equal(shopAveragePerPiece(200, pieces), 10);
  // ถ้าเผลอเอา 110 ชิ้น (รวมคืนเงิน) มาหาร จะได้ 1.82 = ราคาผิดเกือบ 6 เท่า
  assert.ok(shopAveragePerPiece(200, 110)! < 2);
});

ok("ชิ้น = 0 → — (ไม่โชว์เลขมั่ว)", () => {
  assert.equal(formatAveragePerPiece(500, 0), "—");
  assert.deepEqual(splitAveragePerPiece(500, 0), { head: "—", tail: "" });
});

ok("splitAveragePerPiece: หัว = 2 ตำแหน่งแรก (อ่านเร็ว) · หาง = ที่เหลือ (ให้บัญชีกระทบยอด)", () => {
  const s = splitAveragePerPiece(1838.7, 10000);
  assert.equal(s.head + s.tail, formatAveragePerPiece(1838.7, 10000));
  assert.ok(s.head.endsWith("18"), `head=${s.head}`);
  assert.ok(s.tail.length > 0, "เคสนี้ต้องมีหาง");
});

ok("หารลงตัว → ไม่มีหาง (ไม่รกตาโดยไม่จำเป็น)", () => {
  assert.deepEqual(splitAveragePerPiece(247.5, 165), { head: "1.50", tail: "" });
});

ok("สกุลต่างประเทศใช้ en-US (ตรงกับ helper fcur บนหน้าจอ)", () => {
  assert.equal(formatAveragePerPiece(2469, 2, "en-US"), "1,234.50");
});

console.log(`\n✅ shop-group-summary: ${passed} assertions passed`);
