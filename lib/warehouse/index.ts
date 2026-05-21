/**
 * Warehouse spine — STUB barrel (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * The 0033 spine modules (containers · shipments · sacks · tracking ·
 * bulletin · lifecycle · code-gen) were retired under D1 Option A in Wave 2
 * in favour of the legacy `tb_forwarder` flow (faithful port of
 * `report-cnt.php`). The only re-exports kept here are the pure-helper
 * cargo-type taxonomy (still used by `lib/integrations/momo-jmf/*` to
 * normalise legacy A/M/X/O/Z or G/T/F codes on import).
 *
 * Type aliases (Container · Shipment · etc.) are NO LONGER exported —
 * consumers that need to type a spine row should declare locally. Only
 * cargo-type re-exports survive.
 */

export * from "./cargo-type";
