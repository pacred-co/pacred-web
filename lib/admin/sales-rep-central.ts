/**
 * Central sales-rep fallback — the adminID that owns a freshly-signed-up lead
 * when NO active sales rep is available in the round-robin pool.
 *
 * Owner decision (2026-06-02): the sales pool is the LEGACY model —
 * `tb_admin` WHERE adminStatusA='1' AND adminStatusSale='1' (= พี `admin_pee`
 * + เมย์ `admin_may` once provisioned). When that pool is empty (the reps
 * haven't been provisioned yet, or are all paused), the lead must STILL be
 * owned — never left rep-less — so `pickLeastLoadedSalesRep` returns this
 * central fallback instead of null. The fallback is a provisioned `tb_admin`
 * row (`admin_center`) that ops watches; a real rep can re-assign later.
 *
 * Why a constant and not a magic string: the round-robin
 * (`lib/admin/assign-sales-rep.ts`) writes this into `tb_users.adminIDSale`,
 * and `getSalesRepContactForUserid` (`lib/admin/sales-rep-contact.ts`, which
 * reads `tb_admin` by adminID for the register success popup) looks it back
 * up — keeping the id in one place avoids a drift bug where the assigned id
 * and the looked-up rep diverge.
 */
export const CENTRAL_SALES_ADMIN_ID = "admin_center";
