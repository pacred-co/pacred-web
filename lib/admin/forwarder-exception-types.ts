// Plain (non-"use server") home for the forwarder parcel-exception constants +
// types. A "use server" file (actions/admin/forwarder-exception.ts) may ONLY
// export async functions — exporting a const array/object from it makes the
// build fail at "collect page data" ("can only export async functions, found
// object") even though tsc passes. So these live here and both the action and
// the UI import them from here. (G7 · 2026-06-30.)

// The exception kinds the China-ops chats actually show. Kept in sync with the
// migration 0230 documented enum + the client labels below.
export const EXCEPTION_TYPES = [
  "not_mine",
  "damaged",
  "container_returned",
  "customs_held",
  "wrong_pr",
  "other",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  not_mine:           "พัสดุไม่ใช่ของลูกค้ารายนี้",
  damaged:            "ของแตก/ชำรุด",
  container_returned: "ตู้ตีกลับ",
  customs_held:       "ของติดด่าน/ศุลกากร",
  wrong_pr:           "PR สลับ/ทักผิดราย",
  other:              "อื่นๆ",
};
