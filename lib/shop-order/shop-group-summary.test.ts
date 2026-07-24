/**
 * ล็อกกฎ "จำนวนชิ้น + ราคาเฉลี่ยต่อชิ้น" ของหัวร้านค้า ฝากสั่งซื้อ.
 *
 * เคสตัวเลขจริงทั้งหมดมาจาก prod (สแกนทุกกลุ่มร้าน ทุกออเดอร์ 2026-07-24) —
 * โดยเฉพาะ 3 เคสร้านขายส่งราคาต่ำที่พิสูจน์ว่า 2 ตำแหน่งไม่พอ.
 *
 * Run: tsx lib/shop-order/shop-group-summary.test.ts
 */
import assert from "node:assert/strict";
import { shopPieces, shopAveragePerPiece, formatAveragePerPiece } from "./shop-group-summary";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("shopPieces — ชิ้น ≠ รายการ");

ok("Σ camount ไม่ใช่จำนวนบรรทัด (เคสจริง 祥超饰品168: 52 บรรทัด = 756 ชิ้น)", () => {
  const rows = Array.from({ length: 52 }, () => ({ camount: 12 }));
  rows[0]!.camount = 12;
  const { pieces } = shopPieces(rows);
  assert.equal(pieces, 624, "52 บรรทัด × 12 = 624 ชิ้น (ไม่ใช่ 52)");
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
  const { pieces } = shopPieces([
    { camount: Number.NaN },
    { camount: 3 },
    { camount: undefined as unknown as number },
  ]);
  assert.equal(pieces, 3);
});

console.log("\nshopAveragePerPiece — ห้ามหารศูนย์");

ok("ชิ้น = 0 → null (ทั้งร้านคืนเงินหมด)", () => {
  assert.equal(shopAveragePerPiece(500, 0), null);
});

ok("ชิ้นติดลบ / ค่าไม่ใช่ตัวเลข → null", () => {
  assert.equal(shopAveragePerPiece(500, -3), null);
  assert.equal(shopAveragePerPiece(Number.NaN, 10), null);
});

ok("เคสจริง 嘉立饰品厂 (P22453): ¥3,686.50 ÷ 1,140 ชิ้น", () => {
  const avg = shopAveragePerPiece(3686.5, 1140)!;
  assert.ok(Math.abs(avg - 3.23377) < 0.0001, `ได้ ${avg}`);
  assert.equal(formatAveragePerPiece(avg), "3.23");
});

ok("เคสจริง 祥超饰品168 (P22453): ¥1,716.20 ÷ 756 ชิ้น", () => {
  const avg = shopAveragePerPiece(1716.2, 756)!;
  assert.equal(formatAveragePerPiece(avg), "2.27");
});

console.log("\nformatAveragePerPiece — 🔴 ทศนิยมต้องพอ (วัดเป็น % ไม่ใช่บาท)");

/** ความคลาดเคลื่อนสัมพัทธ์ของเลขที่โชว์ เทียบค่าจริง (เป็น %). */
function relErrPct(shown: string, exact: number): number {
  return (Math.abs(Number(shown.replace(/,/g, "")) - exact) / exact) * 100;
}

ok("🔴 P22352 ¥1,838.70 ÷ 10,000 → 0.1839 (2 ตำแหน่งคลาด 2.1% = ราคาผิด)", () => {
  const exact = shopAveragePerPiece(1838.7, 10000)!;
  assert.equal(formatAveragePerPiece(exact), "0.1839");
  assert.ok(relErrPct("0.1839", exact) < 0.05, "4 ตำแหน่ง ต้องคลาด < 0.05%");
  assert.ok(relErrPct("0.18", exact) > 2, "พิสูจน์ว่า 2 ตำแหน่งใช้ไม่ได้จริง (นี่คือเหตุผลของกฎ)");
});

ok("🔴 P22367 ¥9,851.19 ÷ 19,900 → 0.495 (2 ตำแหน่งคลาด ~1%)", () => {
  const exact = shopAveragePerPiece(9851.19, 19900)!;
  assert.equal(formatAveragePerPiece(exact), "0.495");
  assert.ok(relErrPct("0.495", exact) < 0.05);
  assert.ok(relErrPct("0.50", exact) > 0.9);
});

ok("🔴 P22349 ¥3,412.39 ÷ 6,000 → 0.5687", () => {
  const exact = shopAveragePerPiece(3412.39, 6000)!;
  assert.equal(formatAveragePerPiece(exact), "0.5687");
  assert.ok(relErrPct("0.5687", exact) < 0.05);
});

ok("ค่า ≥ 1 คงที่ 2 ตำแหน่งเสมอ (เงินปกติไม่รกตา)", () => {
  assert.equal(formatAveragePerPiece(153.18333), "153.18");
  assert.equal(formatAveragePerPiece(1), "1.00");
  assert.equal(formatAveragePerPiece(196.4615), "196.46");
});

ok("0 → 0.00 (ไม่ใช่ 0.0000)", () => {
  assert.equal(formatAveragePerPiece(0), "0.00");
});

ok("null / NaN → — (ไม่โชว์เลขมั่ว)", () => {
  assert.equal(formatAveragePerPiece(null), "—");
  assert.equal(formatAveragePerPiece(Number.NaN), "—");
});

ok("สกุลต่างประเทศใช้ en-US (ตรงกับ helper fcur บนหน้าจอ)", () => {
  assert.equal(formatAveragePerPiece(1234.5, "en-US"), "1,234.50");
  assert.equal(formatAveragePerPiece(0.1839, "en-US"), "0.1839");
});

console.log("\ninvariant — ราคาที่โชว์ต้องเชื่อได้ ≤ 0.5% ทุกเคสจริงบน prod");

ok("ทุกกลุ่มร้านจริงที่สแกนมา: เลขที่โชว์คลาดจากค่าจริง ≤ 0.5%", () => {
  // 12 กลุ่มร้านจริงจาก prod (ครอบทั้งของถูกมากหลักสตางค์ → ของแพงหลักหมื่น)
  const real: Array<[number, number]> = [
    [3686.5, 1140], [1716.2, 756], [2279, 380], [1838.7, 10000],
    [9851.19, 19900], [3412.39, 6000], [36764, 240], [38310, 195],
    [247.5, 165], [593, 1200], [2249.13, 4200], [1506.7, 630],
  ];
  for (const [total, pieces] of real) {
    const exact = shopAveragePerPiece(total, pieces)!;
    const shown = formatAveragePerPiece(exact);
    assert.ok(
      relErrPct(shown, exact) <= 0.5,
      `${total} ÷ ${pieces} → โชว์ ${shown} · จริง ${exact} · คลาด ${relErrPct(shown, exact).toFixed(3)}%`,
    );
  }
});

ok("ตัวส่วนต้องมาจากชุดแถวเดียวกับตัวเศษ (แถวคืนเงินตัดทั้งคู่)", () => {
  // ร้านมี 3 บรรทัด · 1 บรรทัดคืนเงิน → เงินและชิ้นต้องตัดบรรทัดเดียวกัน
  const rows = [{ camount: 10 }, { camount: 90, crewallet: "1" }, { camount: 10 }];
  const { pieces } = shopPieces(rows);
  const totalExcludingRefund = 200; // = lineOf ของ 2 บรรทัดที่เหลือ
  assert.equal(pieces, 20, "ชิ้นต้องไม่รวม 90 ที่คืนเงิน");
  assert.equal(shopAveragePerPiece(totalExcludingRefund, pieces), 10);
  // ถ้าเผลอเอา 110 ชิ้น (รวมคืนเงิน) มาหาร จะได้ 1.82 = ราคาผิดเกือบ 6 เท่า
  assert.ok(shopAveragePerPiece(totalExcludingRefund, 110)! < 2);
});

console.log(`\n✅ shop-group-summary: ${passed} assertions passed`);
