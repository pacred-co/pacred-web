// Plain (NON-"use server") module — holds the value/type exports that the
// `"use server"` action file service-orders-bulk.ts must NOT export directly.
//
// WHY: Next 16 rejects ANY non-async-function VALUE export from a `"use server"`
// file — `export const SHOP_STATUSES = [...]` compiles under tsc but at runtime
// the client receives a server-action reference, NOT the array, so
// `SHOP_STATUSES.map(...)` throws "SHOP_STATUSES.map is not a function" and the
// client component crashes (ภูม flag 2026-06-11 — the "กดไม่ได้เลย" bug). Same
// fix as forwarders-bulk-types.ts (Wave 25 #196). The client component imports
// the const + type FROM HERE; only the async action stays in the "use server"
// file.

// "40" = ถึงโกดังจีน (owner 2026-06-16 · MOMO arrival) slots between 4 and 5.
export const SHOP_STATUSES = ["1", "2", "3", "4", "40", "5", "6"] as const;
export type ShopOrderStatus = (typeof SHOP_STATUSES)[number];
