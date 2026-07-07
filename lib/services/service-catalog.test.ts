/**
 * Service-catalog unit tests — locks the 8-service identity + resolveServiceKey
 * derivation + the account-routing bridge (owner 2026-06-30).
 *
 * Pure module (no DB). Run: tsx lib/services/service-catalog.test.ts
 */
import assert from "node:assert";
import {
  SERVICE_CATALOG,
  SERVICE_CATALOG_LIST,
  SERVICE_KEYS,
  serviceEntry,
  resolveServiceKey,
  serviceAccountFor,
} from "./service-catalog";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
};

// ── catalog integrity ──────────────────────────────────────────────
t("all 13 catalog keys exist (8 live + 5 marketing)", () => {
  assert.equal(SERVICE_KEYS.length, 13);
  for (const k of SERVICE_KEYS) {
    assert.ok(SERVICE_CATALOG[k], `missing entry: ${k}`);
    assert.equal(SERVICE_CATALOG[k].serviceKey, k);
  }
});

t("exactly 8 services are live (run today)", () => {
  const live = SERVICE_CATALOG_LIST.filter((e) => e.isLive).map((e) => e.serviceKey);
  assert.deepEqual(live, [
    "shop_order",
    "yuan_transfer",
    "import_cargo",
    "freight_import",
    "freight_export",
    "customs_clearance",
    "tax_documents",
    "domestic_logistics",
  ]);
});

t("the 5 soon lanes are not live + have no order table", () => {
  for (const k of ["tax_refund", "fumigation", "consignment", "bill_payment", "broker_matching"] as const) {
    assert.equal(SERVICE_CATALOG[k].isLive, false, `${k} should not be live`);
    assert.equal(SERVICE_CATALOG[k].orderTable, null, `${k} should have no order table`);
  }
});

t("group_kind values are valid", () => {
  for (const e of SERVICE_CATALOG_LIST) {
    assert.ok(["cargo", "freight", "service"].includes(e.group), `${e.serviceKey} bad group ${e.group}`);
  }
});

t("transportModes are a subset of {truck,sea,air}", () => {
  for (const e of SERVICE_CATALOG_LIST) {
    for (const m of e.transportModes) {
      assert.ok(["truck", "sea", "air"].includes(m), `${e.serviceKey} bad mode ${m}`);
    }
  }
});

t("fcl_lcl + direction enums valid", () => {
  for (const e of SERVICE_CATALOG_LIST) {
    assert.ok(["fcl", "lcl", "both", "na"].includes(e.fclLcl), `${e.serviceKey} bad fclLcl`);
    assert.ok(["import", "export", "both", "na"].includes(e.direction), `${e.serviceKey} bad direction`);
  }
});

t("the owner's cargo-vs-freight axis is correct", () => {
  assert.equal(SERVICE_CATALOG.shop_order.group, "cargo");
  assert.equal(SERVICE_CATALOG.import_cargo.group, "cargo");
  assert.equal(SERVICE_CATALOG.freight_import.group, "freight");
  assert.equal(SERVICE_CATALOG.freight_export.group, "freight");
});

t("FCL/LCL is 'both' only for the freight lanes; cargo is lcl", () => {
  assert.equal(SERVICE_CATALOG.import_cargo.fclLcl, "lcl");
  assert.equal(SERVICE_CATALOG.shop_order.fclLcl, "lcl");
  assert.equal(SERVICE_CATALOG.freight_import.fclLcl, "both");
  assert.equal(SERVICE_CATALOG.freight_export.fclLcl, "both");
});

t("freight import vs export differ only by direction", () => {
  assert.equal(SERVICE_CATALOG.freight_import.direction, "import");
  assert.equal(SERVICE_CATALOG.freight_export.direction, "export");
  assert.equal(SERVICE_CATALOG.freight_import.orderTable, "freight_shipments");
  assert.equal(SERVICE_CATALOG.freight_export.orderTable, "freight_shipments");
});

t("each live lane points at its live order table", () => {
  assert.equal(SERVICE_CATALOG.shop_order.orderTable, "tb_header_order");
  assert.equal(SERVICE_CATALOG.yuan_transfer.orderTable, "tb_payment");
  assert.equal(SERVICE_CATALOG.import_cargo.orderTable, "tb_forwarder");
  assert.equal(SERVICE_CATALOG.customs_clearance.orderTable, "customs_declarations");
});

t("serviceEntry handles null/unknown", () => {
  assert.equal(serviceEntry(null), undefined);
  assert.equal(serviceEntry(""), undefined);
  assert.equal(serviceEntry("nope"), undefined);
  assert.equal(serviceEntry("shop_order")?.serviceKey, "shop_order");
});

// ── resolveServiceKey — per table ──────────────────────────────────
t("tb_header_order → shop_order; htransporttype → mode", () => {
  assert.equal(resolveServiceKey({ htransporttype: "1" }, "tb_header_order").serviceKey, "shop_order");
  assert.equal(resolveServiceKey({ htransporttype: "1" }, "tb_header_order").transportMode, "truck");
  assert.equal(resolveServiceKey({ htransporttype: "2" }, "tb_header_order").transportMode, "sea");
  assert.equal(resolveServiceKey({ htransporttype: "3" }, "tb_header_order").transportMode, "air");
  assert.equal(resolveServiceKey({}, "tb_header_order").transportMode, null);
});

t("tb_payment → yuan_transfer; no transport", () => {
  const r = resolveServiceKey({ paytype: "1" }, "tb_payment");
  assert.equal(r.serviceKey, "yuan_transfer");
  assert.equal(r.transportMode, null);
  assert.equal(r.fclLcl, "na");
  assert.equal(r.direction, "na");
});

t("tb_forwarder → import_cargo; container NAME wins over ftransporttype", () => {
  // name says sea (GZS), stored type says air ("3") — name wins
  const r = resolveServiceKey({ fcabinetnumber: "GZS260620-2", ftransporttype: "3" }, "tb_forwarder");
  assert.equal(r.serviceKey, "import_cargo");
  assert.equal(r.transportMode, "sea");
  // GZE / EK suffix = ROAD (truck)
  assert.equal(resolveServiceKey({ fcabinetnumber: "CBX260616-EK08" }, "tb_forwarder").transportMode, "truck");
  assert.equal(resolveServiceKey({ fcabinetnumber: "GZA-AIR" }, "tb_forwarder").transportMode, "air");
  // no name → fall back to stored type
  assert.equal(resolveServiceKey({ ftransporttype: "2" }, "tb_forwarder").transportMode, "sea");
  // cargo always lcl, import
  assert.equal(r.fclLcl, "lcl");
  assert.equal(r.direction, "import");
});

t("freight_shipments → freight_import by default, freight_export when direction=export", () => {
  assert.equal(resolveServiceKey({ transport_mode: "sea_fcl" }, "freight_shipments").serviceKey, "freight_import");
  assert.equal(
    resolveServiceKey({ transport_mode: "sea_fcl", direction: "export" }, "freight_shipments").serviceKey,
    "freight_export",
  );
});

t("freight transport_mode decodes mode + fcl/lcl", () => {
  const fcl = resolveServiceKey({ transport_mode: "sea_fcl" }, "freight_shipments");
  assert.equal(fcl.transportMode, "sea");
  assert.equal(fcl.fclLcl, "fcl");
  const lcl = resolveServiceKey({ transport_mode: "sea_lcl" }, "freight_shipments");
  assert.equal(lcl.fclLcl, "lcl");
  const air = resolveServiceKey({ transport_mode: "air" }, "freight_shipments");
  assert.equal(air.transportMode, "air");
  // air/truck carry no fcl/lcl → keep the catalog default ("both")
  assert.equal(air.fclLcl, "both");
  const truck = resolveServiceKey({ transport_mode: "truck" }, "freight_shipments");
  assert.equal(truck.transportMode, "truck");
});

t("resolveServiceKey tolerates null row", () => {
  assert.equal(resolveServiceKey(null, "tb_forwarder").serviceKey, "import_cargo");
  assert.equal(resolveServiceKey(undefined, "tb_payment").serviceKey, "yuan_transfer");
});

// ── account routing bridge ─────────────────────────────────────────
t("serviceAccountFor: ใบกำกับ → TRADING (+VAT) regardless of service", () => {
  assert.equal(serviceAccountFor("shop_order", { issuesTaxInvoice: true }).key, "trading");
  assert.equal(serviceAccountFor("import_cargo", { issuesTaxInvoice: true }).key, "trading");
  assert.equal(serviceAccountFor("domestic_logistics", { issuesTaxInvoice: true }).key, "trading");
});

t("serviceAccountFor: domestic_logistics + import_cargo (no ใบกำกับ) → LOGISTICS", () => {
  assert.equal(serviceAccountFor("domestic_logistics").key, "logistics");
  assert.equal(serviceAccountFor("domestic_logistics", { issuesTaxInvoice: false }).key, "logistics");
  // owner 2026-07-07 v2: ฝากนำเข้าคาร์โก้ = LOGISTICS (งานขนส่งผ่านบริษัทเฟรทเจ้าอื่น)
  assert.equal(serviceAccountFor("import_cargo").key, "logistics");
  assert.equal(serviceAccountFor("import_cargo", { issuesTaxInvoice: false }).key, "logistics");
});

t("serviceAccountFor: shop/yuan/freight (no ใบกำกับ) → SERVICE PromptPay", () => {
  assert.equal(serviceAccountFor("freight_import").key, "service");
  assert.equal(serviceAccountFor("yuan_transfer").key, "service");
  assert.equal(serviceAccountFor("shop_order").key, "service");
});

t("serviceAccountFor: unknown service → SERVICE (safe default)", () => {
  assert.equal(serviceAccountFor("totally_unknown").key, "service");
  assert.equal(serviceAccountFor("totally_unknown", { issuesTaxInvoice: true }).key, "trading");
});

console.log(`service-catalog: ${n} passed`);
