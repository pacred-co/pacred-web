import assert from "node:assert/strict";
import { CARGO_PROMO_PACKAGES, FDA_SPECIAL_RATE, rateFor } from "./cargo-promo-packages";
import { seedQuotePackages, newBlankPackage, parseQuotePackages, emptyPackageGrid } from "./quote-packages-shared";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}

console.log("lib/quote/quote-packages-shared");

// ── seedQuotePackages ───────────────────────────────────────────────────────
t("seed = 3 แพ็ก (จาก CARGO_PROMO_PACKAGES) · id/name/days ตรง", () => {
  const seed = seedQuotePackages();
  assert.equal(seed.length, CARGO_PROMO_PACKAGES.length);
  seed.forEach((s, i) => {
    const p = CARGO_PROMO_PACKAGES[i];
    assert.equal(s.id, p.id);
    assert.equal(s.name, p.name);
    assert.equal(s.days.truck, p.rates.truck.days);
    assert.equal(s.days.ship, p.rates.ship.days);
  });
});

t("seed grid: general = rateFor · fda = FDA_SPECIAL_RATE (7600/6600 · 45/35)", () => {
  const s = seedQuotePackages()[0];
  const p = CARGO_PROMO_PACKAGES[0];
  // general (ทั่วไป) = เรทฐาน rateFor ต่อโกดัง×ทาง
  assert.equal(s.rates["1"]["1"].general.cbm, rateFor(p, false, "guangzhou", "truck").cbm);
  assert.equal(s.rates["1"]["2"].general.kg, rateFor(p, false, "guangzhou", "ship").kg);
  assert.equal(s.rates["2"]["1"].general.cbm, rateFor(p, false, "yiwu", "truck").cbm);
  // fda (อย.·พิเศษ) = FDA_SPECIAL_RATE (เหมาทุกโกดัง)
  assert.equal(s.rates["1"]["1"].fda.cbm, FDA_SPECIAL_RATE.truck.cbm);
  assert.equal(s.rates["2"]["2"].fda.cbm, FDA_SPECIAL_RATE.ship.cbm);
  assert.equal(s.rates["1"]["1"].fda.kg, FDA_SPECIAL_RATE.truck.kg);
  assert.equal(s.rates["1"]["2"].fda.kg, FDA_SPECIAL_RATE.ship.kg);
});

t("seed: yiwu-รถ ≥ กวางโจว-รถ (surcharge อยู่ใน rateFor)", () => {
  const s = seedQuotePackages()[0];
  assert.ok(s.rates["2"]["1"].general.cbm >= s.rates["1"]["1"].general.cbm);
});

// ── newBlankPackage ─────────────────────────────────────────────────────────
t("newBlankPackage: id/name จากผู้เรียก · conditions ว่าง · เรทมีค่า (template)", () => {
  const b = newBlankPackage("pkg-test", "แพ็กใหม่");
  assert.equal(b.id, "pkg-test");
  assert.equal(b.name, "แพ็กใหม่");
  assert.deepEqual(b.conditions, []);
  assert.ok(b.rates["1"]["1"].general.cbm > 0);
  assert.equal(b.rates["1"]["1"].fda.cbm, FDA_SPECIAL_RATE.truck.cbm);
});

// ── emptyPackageGrid ────────────────────────────────────────────────────────
t("emptyPackageGrid: 0 ทุกช่อง · ครบ 2×2×2", () => {
  const g = emptyPackageGrid();
  for (const wh of ["1", "2"] as const) for (const t of ["1", "2"] as const) for (const grp of ["general", "fda"] as const) {
    assert.equal(g[wh][t][grp].cbm, 0);
    assert.equal(g[wh][t][grp].kg, 0);
  }
});

// ── parseQuotePackages ──────────────────────────────────────────────────────
t("parse: seed → round-trip (length + ค่า)", () => {
  const seed = seedQuotePackages();
  const r = parseQuotePackages(seed);
  assert.ok(r && r.length === seed.length);
  assert.equal(r![0].rates["1"]["1"].general.cbm, seed[0].rates["1"]["1"].general.cbm);
});

t("parse: input พัง → null", () => {
  assert.equal(parseQuotePackages(null), null);
  assert.equal(parseQuotePackages([]), null);
  assert.equal(parseQuotePackages("x"), null);
  assert.equal(parseQuotePackages([{ name: "no id" }]), null);
  assert.equal(parseQuotePackages([{ id: "p", /* no name */ }]), null);
});

t("parse: normalize — ติดลบ→0 · ช่องขาด→0 · conditions กรอง non-string · days ขาด→''", () => {
  const r = parseQuotePackages([
    { id: "p1", name: "P1", conditions: ["a", 5, "b"], days: { truck: "5 วัน" },
      rates: { "1": { "1": { general: { cbm: -50, kg: 10 } } } } },
  ]);
  assert.ok(r);
  assert.equal(r![0].rates["1"]["1"].general.cbm, 0); // -50 → 0
  assert.equal(r![0].rates["1"]["1"].general.kg, 10);
  assert.equal(r![0].rates["1"]["2"].general.cbm, 0); // ช่องขาด → 0
  assert.equal(r![0].rates["2"]["2"].fda.kg, 0); // ช่องขาด → 0
  assert.deepEqual(r![0].conditions, ["a", "b"]); // 5 (number) ถูกกรอง
  assert.equal(r![0].days.truck, "5 วัน");
  assert.equal(r![0].days.ship, ""); // ขาด → ''
});

console.log(`\n${pass} passed`);
