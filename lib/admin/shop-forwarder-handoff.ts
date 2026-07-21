import { derivePayMethod } from "@/lib/forwarder/pay-method";

/**
 * Header and forwarder use opposite legacy warehouse codes:
 *   tb_header_order: 1=Yiwu, 2=Guangzhou
 *   tb_forwarder:    1=Guangzhou, 2=Yiwu
 */
export function mapShopWarehouseToForwarder(
  headerWarehouse: string | null | undefined,
): "1" | "2" {
  return (headerWarehouse ?? "").trim() === "1" ? "2" : "1";
}

export function buildShopForwarderHandoff(input: {
  fShipBy: string | null | undefined;
  headerWarehouse: string | null | undefined;
  taxDocPref: string | null | undefined;
  taxDocTaxId: string | null | undefined;
  taxDocAddress: string | null | undefined;
  headerPriceUpdate: number | string | null | undefined;
}): {
  paymethod: "1" | "2";
  fwarehousechina: "1" | "2";
  tax_doc_pref: string | null;
  tax_doc_tax_id: string | null;
  tax_doc_address: string | null;
  fallbackPriceUpdate: number;
} {
  const fallbackPriceUpdate = Number(input.headerPriceUpdate ?? 0);
  return {
    paymethod: derivePayMethod(input.fShipBy),
    fwarehousechina: mapShopWarehouseToForwarder(input.headerWarehouse),
    tax_doc_pref: input.taxDocPref ?? null,
    tax_doc_tax_id: input.taxDocTaxId ?? null,
    tax_doc_address: input.taxDocAddress ?? null,
    fallbackPriceUpdate: Number.isFinite(fallbackPriceUpdate) && fallbackPriceUpdate >= 0
      ? fallbackPriceUpdate
      : 0,
  };
}
