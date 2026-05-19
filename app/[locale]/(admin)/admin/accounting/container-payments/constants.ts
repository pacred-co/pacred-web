/**
 * D1 Phase B — legacy `tb_cnt` shared constants.
 *
 * Plain module (NOT "use server") so both server pages and client
 * components can import the value. The server actions in
 * actions/admin/pcs-container-payments.ts re-export this — a "use server"
 * file may only export async functions, so the constant must live here.
 *
 * Legacy `tb_cnt.cntstatus` is a varchar(1): "1" = ยังไม่จ่ายเงิน,
 * "2" = จ่ายเงินแล้ว. That paid/unpaid flag IS the container "status"
 * the PCS accounting team knows — not a logistics state-machine.
 */
export const PCS_CNT_STATUS = {
  UNPAID: "1", // ยังไม่จ่ายเงิน
  PAID:   "2", // จ่ายเงินแล้ว
} as const;

export type PcsCntStatus = (typeof PCS_CNT_STATUS)[keyof typeof PCS_CNT_STATUS];
