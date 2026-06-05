/**
 * Central CS fallback — the adminID that owns a freshly-signed-up customer's
 * CS slot when NO active CS is in the round-robin pool. Mirror of
 * `CENTRAL_SALES_ADMIN_ID` (lib/admin/sales-rep-central.ts).
 *
 * Owner 2026-06-05: the workflow has BOTH a เซล (รับลูกค้า) and a CS
 * (ติดตามสถานะให้ลูกค้า). The CS pool = `tb_admin` WHERE adminStatusA='1' AND
 * adminStatusCS='1', seeded with พลอย (`admin_ploy`) — the real CS today, and
 * the holder of the central CS line `CONTACT.phoneCs` (062-603-4456). When the
 * pool is empty the customer must STILL get a CS (never null), so
 * `pickLeastLoadedCsRep` returns this central fallback. Keeping the id in one
 * constant avoids a drift bug between the assigned id and the looked-up rep.
 */
export const CENTRAL_CS_ADMIN_ID = "admin_ploy";
