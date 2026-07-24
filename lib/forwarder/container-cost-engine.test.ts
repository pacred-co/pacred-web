import assert from "node:assert/strict";
import {
  rateForProductType,
  costBasisForWarehouse,
  resolveContainerWarehouse,
  resolveRowContainerCost,
  rollupContainerCost,
  checkCostWritePlausible,
  COST_MAX_CBM_MULTIPLE,
  type ContainerRates,
  type CostEngineRow,
} from "./container-cost-engine";

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks += 1; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.equal(a, b, msg); checks += 1; };

const RATES: ContainerRates = { p1: 4700, p2: 4700, p3: 4700, p4: 4700 };

// ── เลือกเรทตามประเภทสินค้า ───────────────────────────────────────────────
{
  const r: ContainerRates = { p1: 1, p2: 2, p3: 3, p4: 4 };
  eq(rateForProductType(r, "1"), 1, "ประเภท 1 → p1");
  eq(rateForProductType(r, "3"), 3, "ประเภท 3 → p3");
  eq(rateForProductType(r, " 4 "), 4, "ตัดช่องว่างก่อนเทียบ");
  eq(rateForProductType(r, ""), 0, "ประเภทว่าง → 0 (ไม่คิดสด)");
  eq(rateForProductType(r, null), 0, "ประเภท null → 0");
  eq(rateForProductType(r, "9"), 0, "ประเภทที่ไม่รู้จัก → 0");
}

// ── ฐานคิดต้นทุน = CARRIER เท่านั้น ────────────────────────────────────────
{
  eq(costBasisForWarehouse("8"), "cbm", "MOMO(8) = คิว");
  eq(costBasisForWarehouse("9"), "cbm", "TTW(9) = คิว");
  eq(costBasisForWarehouse("1"), "weight", "Sang(1) = น้ำหนัก (ของเดิม ห้ามพัง)");
  eq(costBasisForWarehouse("4"), "weight", "MX(4) = น้ำหนัก (ของเดิม ห้ามพัง)");
  // 🔴 หัวใจของบั๊ก 2026-07-23: โกดังว่าง ต้องไม่กลายเป็น "น้ำหนัก"
  eq(costBasisForWarehouse(""), "cbm", "โกดังว่าง → คิว (ไม่ใช่ น้ำหนัก)");
  eq(costBasisForWarehouse(null), "cbm", "โกดัง null → คิว");
  eq(costBasisForWarehouse("  "), "cbm", "โกดังช่องว่าง → คิว");
}

// ── โกดังของตู้ = ตัวแรกที่ไม่ว่าง ─────────────────────────────────────────
{
  eq(resolveContainerWarehouse([{ fwarehousename: "" }, { fwarehousename: "8" }]), "8",
    "แถวแรกโกดังว่าง → ข้ามไปหาแถวที่มีจริง (GZE260720-1 เคสจริง)");
  eq(resolveContainerWarehouse([{ fwarehousename: "8" }, { fwarehousename: "" }]), "8", "เจอตัวแรกก็ใช้เลย");
  eq(resolveContainerWarehouse([{ fwarehousename: null }]), "", "ไม่มีเลย → ว่าง");
  eq(resolveContainerWarehouse([]), "", "ไม่มีแถว → ว่าง");
}

// ── ต้นทุนต่อแถว · กฎ famountcount ────────────────────────────────────────
{
  // famountcount='1' → fvolume เป็นยอดรวมแล้ว (แถว MOMO)
  const row: CostEngineRow = {
    fvolume: 0.410874, famount: 3, famountcount: "1",
    fweight: 48, fproductstype: "1", fcosttotalprice: 225600,
  };
  const rc = resolveRowContainerCost(row, { rates: RATES, containerWarehouse: "8", cabinetIsPaid: false });
  eq(rc.basis, "cbm", "MOMO → ฐานคิว");
  eq(rc.dimension, 0.410874, "famountcount='1' → ใช้ fvolume ตรงๆ ไม่คูณกล่อง");
  eq(rc.liveCost, 1931.11, "เคสจริง #52751: 0.410874 × 4,700 = 1,931.11");
  eq(rc.cost, 1931.11, "ยังไม่จ่ายค่าตู้ + มีเรท → คิดสด");
  eq(rc.isLive, true, "isLive = true");
  ok(rc.storedCost === 225600 && rc.cost !== rc.storedCost,
    "ค่าที่เก็บไว้ 225,600 (= 48 กก. × 4,700 ขยะ) ถูกแทนที่ด้วยค่าสด");
}
{
  // famountcount ≠ '1' → fvolume เป็นต่อกล่อง → × จำนวนกล่อง
  const row: CostEngineRow = {
    fvolume: 0.0251, famount: 1, famountcount: null,
    fweight: 16.5, fproductstype: "1", fcosttotalprice: 77550,
  };
  const rc = resolveRowContainerCost(row, { rates: RATES, containerWarehouse: "8", cabinetIsPaid: false });
  eq(rc.dimension, 0.0251, "1 กล่อง → คิวรวม = ต่อกล่อง");
  eq(rc.liveCost, 117.97, "เคสจริง #52746: 0.0251 × 4,700 = 117.97 (ของเดิมเก็บ 77,550)");
}
{
  const row: CostEngineRow = {
    fvolume: 0.5, famount: 4, famountcount: "0",
    fweight: 100, fproductstype: "1", fcosttotalprice: 0,
  };
  const rc = resolveRowContainerCost(row, { rates: RATES, containerWarehouse: "8", cabinetIsPaid: false });
  eq(rc.dimension, 2, "ต่อกล่อง 0.5 × 4 กล่อง = 2 คิว");
  eq(rc.liveCost, 9400, "2 × 4,700 = 9,400");
}

// ── ตู้ที่จ่ายค่าตู้แล้ว → ล็อกค่าที่เก็บไว้ ────────────────────────────────
{
  const row: CostEngineRow = {
    fvolume: 1, famount: 1, famountcount: "1",
    fweight: 10, fproductstype: "1", fcosttotalprice: 9999,
  };
  const paid = resolveRowContainerCost(row, { rates: RATES, containerWarehouse: "8", cabinetIsPaid: true });
  eq(paid.cost, 9999, "จ่ายแล้ว → ใช้ค่าที่เก็บไว้ (เอกสารแล้ว · บัญชีอาจปรับมือ)");
  eq(paid.isLive, false, "จ่ายแล้ว → ไม่ใช่ค่าสด");

  const noRate = resolveRowContainerCost(row, {
    rates: { p1: 0, p2: 0, p3: 0, p4: 0 }, containerWarehouse: "8", cabinetIsPaid: false,
  });
  eq(noRate.cost, 9999, "ไม่มีเรท → ใช้ค่าที่เก็บไว้ (ไม่เดาเรท)");
  eq(noRate.isLive, false, "ไม่มีเรท → ไม่ใช่ค่าสด");
}

// ── ฐานน้ำหนัก (Sang/MX) ยังทำงานเหมือนเดิม ───────────────────────────────
{
  const row: CostEngineRow = {
    fvolume: 0.5, famount: 1, famountcount: "1",
    fweight: 20, fproductstype: "1", fcosttotalprice: 0,
  };
  const rc = resolveRowContainerCost(row, { rates: { p1: 50, p2: 50, p3: 50, p4: 50 }, containerWarehouse: "1", cabinetIsPaid: false });
  eq(rc.basis, "weight", "Sang → ฐานน้ำหนัก");
  eq(rc.dimension, 20, "ใช้ fweight");
  eq(rc.liveCost, 1000, "20 × 50 = 1,000");
}

// ── Σ ทั้งตู้ = ตัวเลขที่หน้า DETAIL โชว์ ─────────────────────────────────
{
  const rows: CostEngineRow[] = [
    { fvolume: 0.410874, famount: 3, famountcount: "1", fweight: 48,  fproductstype: "1", fcosttotalprice: 225600 },
    { fvolume: 0.076704, famount: 1, famountcount: "1", fweight: 7.5, fproductstype: "1", fcosttotalprice: 35250 },
    { fvolume: 0.0251,   famount: 1, famountcount: null, fweight: 16.5, fproductstype: "1", fcosttotalprice: 77550 },
    { fvolume: 0.0151,   famount: 1, famountcount: null, fweight: 6.5,  fproductstype: "1", fcosttotalprice: 30550 },
  ];
  const r = rollupContainerCost(rows, { rates: RATES, containerWarehouse: "8", cabinetIsPaid: false });
  // 0.410874+0.076704+0.0251+0.0151 = 0.527578 คิว × 4,700 = 2,479.62 (ปัดต่อแถว → 2,480.55)
  eq(r.liveRows, 4, "คิดสดครบ 4 แถว");
  eq(r.storedRows, 0, "ไม่มีแถวที่ใช้ค่าที่เก็บไว้");
  ok(r.costSum > 2470 && r.costSum < 2490,
    `Σ ต้นทุน 4 แถวขยะ = ${r.costSum} (~2,480 ไม่ใช่ 368,950)`);
  const storedSum = rows.reduce((s, x) => s + Number(x.fcosttotalprice), 0);
  eq(storedSum, 368950, "ค่าที่เก็บไว้รวม = 368,950 (คือที่ LIST เคยโชว์)");
}

// ── WRITE GUARD ───────────────────────────────────────────────────────────
{
  // ด่าน 1 — ฐานน้ำหนัก บน carrier ที่คิดเป็นคิว
  const bad = checkCostWritePlausible({
    rate: 4700, basis: "weight", warehouse: "", totalCbm: 0.410874, cost: 225600,
  });
  eq(bad.ok, false, "โกดังว่าง + ฐานน้ำหนัก → ปฏิเสธ (บั๊กตัวจริง 2026-07-23)");
  if (!bad.ok) ok(bad.reason.includes("น้ำหนัก"), "เหตุผลบอกว่าคิดด้วยน้ำหนักผิด");

  const badMomo = checkCostWritePlausible({
    rate: 4700, basis: "weight", warehouse: "8", totalCbm: 0.5, cost: 100000,
  });
  eq(badMomo.ok, false, "MOMO + ฐานน้ำหนัก → ปฏิเสธ");

  // ด่าน 1 ต้องไม่ยิงใส่ carrier ที่คิดตามน้ำหนักจริง
  const sang = checkCostWritePlausible({
    rate: 50, basis: "weight", warehouse: "1", totalCbm: 0.5, cost: 1000,
  });
  eq(sang.ok, true, "Sang(1) + ฐานน้ำหนัก = ถูกต้อง ห้ามบล็อก");
}
{
  // ด่าน 2 — ขนาดตัวเลข (ตรวจทุกฐานตามที่ owner สั่ง)
  const okRow = checkCostWritePlausible({ rate: 4700, basis: "cbm", warehouse: "8", totalCbm: 1, cost: 4700 });
  eq(okRow.ok, true, "คิว × เรท พอดี → ผ่าน");

  const edge = checkCostWritePlausible({
    rate: 4700, basis: "cbm", warehouse: "8", totalCbm: 1, cost: 4700 * COST_MAX_CBM_MULTIPLE,
  });
  eq(edge.ok, true, "เท่าเพดานพอดี → ยังผ่าน (เผื่อปรับมือ)");

  const over = checkCostWritePlausible({
    rate: 4700, basis: "cbm", warehouse: "8", totalCbm: 1, cost: 4700 * COST_MAX_CBM_MULTIPLE + 1,
  });
  eq(over.ok, false, "เกินเพดาน → ปฏิเสธ");
  if (!over.ok) eq(over.maxPlausible, 23500, "บอกเพดานกลับไปด้วย");

  // 4 แถวจริงที่หลุดเข้า prod ต้องถูกจับทุกตัว แม้ writer จะอ้างฐานคิว
  const real: Array<[number, number, string]> = [
    [0.410874, 225600, "#52751"],
    [0.076704, 35250,  "#52903"],
    [0.0251,   77550,  "#52746"],
    [0.0151,   30550,  "#52747"],
  ];
  for (const [cbm, cost, id] of real) {
    const r = checkCostWritePlausible({ rate: 4700, basis: "cbm", warehouse: "8", totalCbm: cbm, cost });
    eq(r.ok, false, `${id} ต้องถูกปฏิเสธ แม้ writer จะบอกว่าใช้ฐานคิว`);
  }
}
{
  // ตัดสินไม่ได้ → ไม่บล็อกงานปกติ
  eq(checkCostWritePlausible({ rate: 0, basis: "cbm", warehouse: "8", totalCbm: 1, cost: 999999 }).ok, true,
    "ไม่มีเรท → ไม่ตัดสิน");
  eq(checkCostWritePlausible({ rate: 4700, basis: "cbm", warehouse: "8", totalCbm: 0, cost: 5000 }).ok, true,
    "ไม่มีคิว → ไม่ตัดสิน (ห้ามบล็อกแถวที่ยังไม่วัดขนาด)");
  eq(checkCostWritePlausible({ rate: 4700, basis: "cbm", warehouse: "8", totalCbm: 1, cost: 0 }).ok, true,
    "ต้นทุน 0 → ผ่าน");
}

console.log(`container-cost-engine.test.ts — ${checks} checks passed`);
