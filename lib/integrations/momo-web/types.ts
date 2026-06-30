/**
 * MOMO web — client-SAFE types + constants (no "server-only").
 *
 * These are shared by the server-only client (`client.ts`) AND client
 * components (e.g. the /live mirror). They must live in a module WITHOUT
 * `import "server-only"` so a "use client" component can import the runtime
 * `MOMO_LIVE_STATUSES` const without dragging the server-only client into the
 * browser bundle.
 */

/** Statuses the MOMO import board exposes (the 6 tabs), newest-flow first. */
export const MOMO_LIVE_STATUSES = [
  "waiting", // รอเข้าโกดังจีน
  "arrival_kodang", // ถึงโกดังจีน
  "sending_thai", // กำลังส่งมาไทย
  "wait_pay", // รอชำระค่าขนส่ง
  "sending", // กำลังนำส่ง
  "done", // จัดส่งให้แล้ว
] as const;

export type MomoLiveStatus = (typeof MOMO_LIVE_STATUSES)[number];

/** A single parcel — SAFE operational fields only. NO cost/price/rate ever. */
export type MomoLiveParcel = {
  tracking: string;
  memberCode: string; // cn_usercode, e.g. "PR043"
  weightKg: number;
  cbm: number;
  width: number;
  length: number;
  height: number;
  quantity: number;
  containerName: string; // cabinet (เลขตู้), e.g. "GZS260629-1"
  containerCode: string; // physical container, e.g. "CSNU6757856"
  containerNo: string; // MOMO routing batch, e.g. "PR20260628-SEA02"
  statusId: number;
  statusText: string; // Thai, e.g. "กำลังส่งมาไทย"
  shipBy: string; // "ship" | "truck" | ...
  type: string; // "general" | ...
  imageUrl: string | null; // cn_image[0]
  qrCode: string; // PO.041987-<seq>
  statusDate: Record<string, string>;
};
