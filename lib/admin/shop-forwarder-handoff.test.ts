import assert from "node:assert/strict";
import { buildShopForwarderHandoff, mapShopWarehouseToForwarder } from "./shop-forwarder-handoff";

assert.equal(mapShopWarehouseToForwarder("1"), "2", "header Yiwu(1) -> forwarder Yiwu(2)");
assert.equal(mapShopWarehouseToForwarder("2"), "1", "header Guangzhou(2) -> forwarder Guangzhou(1)");
assert.equal(mapShopWarehouseToForwarder(null), "1", "unassigned header -> Guangzhou default");

assert.deepEqual(
  buildShopForwarderHandoff({
    fShipBy: "2", // Flash/private
    headerWarehouse: "1",
    taxDocPref: "tax_invoice",
    taxDocTaxId: "0105564077716",
    taxDocAddress: "Pacred Co., Ltd.",
    headerPriceUpdate: "125.50",
  }),
  {
    paymethod: "2",
    fwarehousechina: "2",
    tax_doc_pref: "tax_invoice",
    tax_doc_tax_id: "0105564077716",
    tax_doc_address: "Pacred Co., Ltd.",
    fallbackPriceUpdate: 125.5,
  },
  "private carrier + Yiwu + tax snapshot survives shop->import handoff",
);

assert.equal(
  buildShopForwarderHandoff({
    fShipBy: "PCS",
    headerWarehouse: "2",
    taxDocPref: "receipt",
    taxDocTaxId: null,
    taxDocAddress: null,
    headerPriceUpdate: 0,
  }).paymethod,
  "1",
  "own fleet remains pay-at-origin",
);

console.log("✓ shop-forwarder-handoff: warehouse/paymethod/tax/price survive");
