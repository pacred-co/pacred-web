"use server";

// 🪦 DEAD CODE — TOMBSTONED (ADR-0018 D-3 · completed 2026-06-04 reachability/
// dead-flow audit). Superseded by actions/admin/wallet-hs.ts.
//
// Every export here wrote the REBUILT `wallet_transactions` table which is
// EMPTY on prod. Calling these was a "silent dead-write" (Master Gap Audit §5
// #1) — UI shows a green toast, zero real rows change. The canonical wallet
// ledger per ADR-0018 D-1 is `tb_wallet` + `tb_wallet_hs` (legacy schema,
// 104,591 rows).
//
// Faithful replacements (use these instead):
//   adminUpdateWalletTransaction      → adminApproveWalletDeposit /
//                                       adminRejectWalletDeposit  (wallet-hs.ts)
//   adminBulkApproveDeposits          → adminBulkApproveWalletDeposits (wallet-hs.ts)
//   adminGetWalletTxSlipSignedUrl     → resolveLegacyUrl(filename, 'slip')
//                                       (lib/storage/legacy-resolver.ts)
//   adminSetWalletTxSlipTransferredAt → adminUpdateWalletHsDateSlip
//                                       (actions/admin/wallet-trans.ts)
//   adminCreateManualWalletEntry      → adminCreateWalletHsManual (wallet-hs.ts)
//
// `grep -rn` (2026-06-04) confirms ZERO importers of `@/actions/admin/wallet`
// across app/actions/lib/components — the live UI imports `wallet-hs.ts`. The
// file is NOT deleted (a deletion could mask a hidden dynamic import); instead
// every exported async function now THROWS so any future accidental import
// fails loudly instead of silently dead-writing. Exported `*Input` type aliases
// + their backing Zod schemas are preserved so `tsc` (and any type-only
// importer) stays green.

import { z } from "zod";
import type { AdminActionResult } from "./common";

const DEAD = "actions/admin/wallet is dead code — use actions/admin/wallet-hs.ts (writes the live tb_wallet/tb_wallet_hs ledger; this module wrote the 0-row rebuilt wallet_transactions table)";

const STATUSES = ["pending", "completed", "failed", "cancelled"] as const;

const updateSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(STATUSES),
  note:   z.string().trim().max(1000).optional(),
});
export type AdminUpdateWalletTxInput = z.infer<typeof updateSchema>;

export async function adminUpdateWalletTransaction(
  _input: AdminUpdateWalletTxInput,
): Promise<AdminActionResult> {
  throw new Error(DEAD);
}

const slipSignedUrlSchema = z.object({ id: z.string().uuid() });

export async function adminGetWalletTxSlipSignedUrl(
  _input: z.infer<typeof slipSignedUrlSchema>,
): Promise<AdminActionResult<{ url: string | null; mime: string | null }>> {
  throw new Error(DEAD);
}

const bulkApproveSchema = z.object({
  ids:  z.array(z.string().uuid()).min(1, "ต้องเลือกอย่างน้อย 1 รายการ").max(50, "เลือกได้สูงสุด 50 รายการต่อรอบ"),
  note: z.string().trim().max(500).optional(),
});
export type AdminBulkApproveDepositsInput = z.infer<typeof bulkApproveSchema>;

type BulkResult = { approved: number; skipped: number; errors: Array<{ id: string; reason: string }> };

export async function adminBulkApproveDeposits(
  _input: AdminBulkApproveDepositsInput,
): Promise<AdminActionResult<BulkResult>> {
  throw new Error(DEAD);
}

const setWalletTxSlipTransferredAtSchema = z.object({
  id:                  z.string().uuid(),
  slip_transferred_at: z.string().trim().max(40), // "" → clear
});
export type SetWalletTxSlipTransferredAtInput = z.infer<typeof setWalletTxSlipTransferredAtSchema>;

export async function adminSetWalletTxSlipTransferredAt(
  _input: SetWalletTxSlipTransferredAtInput,
): Promise<AdminActionResult<{ id: string; slip_transferred_at: string | null }>> {
  throw new Error(DEAD);
}

const manualEntrySchema = z.object({
  profile_id:     z.string().uuid({ message: "เลือกสมาชิกก่อน" }),
  bucket:         z.enum(["main", "cashback", "credit"]).default("main"),
  kind:           z.enum(["deposit", "withdraw", "adjustment", "refund"]),
  amount:         z.number().refine((n) => n !== 0, { message: "จำนวนต้องไม่เท่ากับ 0" }),
  bank_name:      z.string().trim().max(100).optional(),
  account_name:   z.string().trim().max(200).optional(),
  account_number: z.string().trim().max(50).optional(),
  slip_date:      z.string().optional(), // YYYY-MM-DD or empty
  note:           z.string().trim().max(1000).optional(),
});
export type AdminCreateManualWalletEntryInput = z.infer<typeof manualEntrySchema>;

export async function adminCreateManualWalletEntry(
  _input: AdminCreateManualWalletEntryInput,
): Promise<AdminActionResult<{ id: string }>> {
  throw new Error(DEAD);
}
