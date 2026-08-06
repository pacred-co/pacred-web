/**
 * shop-cart-group.test.ts — ล็อกกติกา "1 ตะกร้าจีน = 1 กลุ่ม = 1 แทรคกิ้ง"
 * (owner 2026-08-06 · เคสจริง P22467 · "อย่าให้มั่ว ระวังด้วย คิดเยอะๆ")
 */
import { shopCartKey, shopCartLabel, groupShopRowsByCart, countCartSlots } from "./shop-cart-group";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${got !== undefined ? ` · got=${JSON.stringify(got)}` : ""}`); }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), got);
}

console.log("▸ shopCartKey — เลขตะกร้ามาก่อนชื่อร้าน");
eq("มีเลขตะกร้า → cart:", shopCartKey({ cnameshop: "kevap168", cshippingnumber: "3315869258164077296" }), "cart:3315869258164077296");
eq("ไม่มีเลขตะกร้า → shop:", shopCartKey({ cnameshop: "kevap168", cshippingnumber: "" }), "shop:kevap168");
eq("ไม่มีทั้งคู่ → ''", shopCartKey({ cnameshop: " ", cshippingnumber: null }), "");
eq("ช่องว่างหน้า-หลัง ถูก trim", shopCartKey({ cshippingnumber: "  331  " }), "cart:331");

console.log("▸ เคสจริง P22467 — 4 ชื่อร้าน แต่ 2 ตะกร้า");
const P22467 = [
  { cnameshop: "kevap168", cshippingnumber: "3315869258164077296" },
  { cnameshop: "kevap168", cshippingnumber: "3315869258164077296" },
  { cnameshop: "广州海帝博斯五金有限公司", cshippingnumber: "3315869258164077296" },
  { cnameshop: "乐马五金", cshippingnumber: "3316463688810004459" },
  { cnameshop: "广东乐马五金精密制造有限公司", cshippingnumber: "3316463688810004459" },
];
const g = groupShopRowsByCart(P22467);
eq("ยุบเหลือ 2 กลุ่ม (ไม่ใช่ 4)", g.length, 2);
eq("กลุ่ม 1 = ตะกร้าแรก", g[0].cshippingnumber, "3315869258164077296");
eq("กลุ่ม 1 รวม 2 ชื่อร้าน", g[0].shopNames, ["kevap168", "广州海帝博斯五金有限公司"]);
eq("กลุ่ม 1 มี 3 แถว", g[0].rows.length, 3);
eq("กลุ่ม 2 รวม 2 ชื่อร้าน", g[1].shopNames, ["乐马五金", "广东乐马五金精密制造有限公司"]);
eq("slot = 2 (เดิมนับ 4 → ออเดอร์ไม่มีวันครบ)", countCartSlots(P22467), 2);
eq("ป้ายกลุ่มโชว์ทั้ง 2 ชื่อ", shopCartLabel(g[0].shopNames), "kevap168 / 广州海帝博斯五金有限公司");

console.log("▸ ไม่ regress ของเดิม (ยังไม่มีเลขตะกร้า = แยกตามร้านเหมือนเดิม)");
const noCart = [
  { cnameshop: "ร้าน A", cshippingnumber: "" },
  { cnameshop: "ร้าน B", cshippingnumber: null },
  { cnameshop: "ร้าน A", cshippingnumber: "" },
];
eq("ไม่มีเลขตะกร้า → 2 กลุ่มตามร้าน", groupShopRowsByCart(noCart).length, 2);
eq("slot = 0 (ยังไม่มีตะกร้าให้คีย์)", countCartSlots(noCart), 0);

console.log("▸ ร้านเดียวกันแต่คนละตะกร้า (สั่ง 2 ครั้ง) — ห้ามยุบรวม");
const twice = [
  { cnameshop: "ร้าน A", cshippingnumber: "111111111" },
  { cnameshop: "ร้าน A", cshippingnumber: "222222222" },
];
eq("2 ครั้ง = 2 กลุ่ม (ไม่กลืนกัน)", groupShopRowsByCart(twice).length, 2);
eq("slot = 2", countCartSlots(twice), 2);

console.log("▸ ผสม (บางร้านคีย์ตะกร้าแล้ว บางร้านยัง)");
const mixed = [
  { cnameshop: "A", cshippingnumber: "999" },
  { cnameshop: "A-บริษัท", cshippingnumber: "999" },
  { cnameshop: "B", cshippingnumber: "" },
];
const gm = groupShopRowsByCart(mixed);
eq("ได้ 2 กลุ่ม (ตะกร้า 999 + ร้าน B)", gm.length, 2);
eq("slot นับเฉพาะกลุ่มที่มีเลขตะกร้า = 1", countCartSlots(mixed), 1);
eq("แถวขยะถูกข้าม", groupShopRowsByCart([{ cnameshop: "", cshippingnumber: "" }]).length, 0);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
