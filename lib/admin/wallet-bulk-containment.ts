/**
 * Pure containment rules for the legacy tb_wallet_hs bulk-approve surface.
 *
 * Linked payment headers/children must be settled through the cascade-aware
 * detail flow. The generic bulk loop only claims individual ledger rows, so
 * accepting either shape can leave one customer payment half-settled.
 */

export type WalletBulkContainmentRow = {
  id: number;
  type: string | null;
  reforder2: string | number | null;
  payment_group_id?: string | null;
};

export type WalletBulkContainmentBlock = {
  id: number;
  kind: "linked-payment-header" | "linked-payment-child" | "atomic-payment-group";
};

function hasParentReference(value: string | number | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

/**
 * Return the first unsafe row in a bulk request, or null when every row may use
 * the generic per-row loop. `linkedHeaderIds` comes from tb_wallet_paydeposit.
 */
export function findWalletBulkContainmentBlock(
  rows: readonly WalletBulkContainmentRow[],
  linkedHeaderIds: ReadonlySet<number>,
): WalletBulkContainmentBlock | null {
  for (const row of rows) {
    if (row.payment_group_id?.trim()) {
      return { id: row.id, kind: "atomic-payment-group" };
    }
    if (hasParentReference(row.reforder2)) {
      return { id: row.id, kind: "linked-payment-child" };
    }
    if ((row.type ?? "").trim() === "1" && linkedHeaderIds.has(row.id)) {
      return { id: row.id, kind: "linked-payment-header" };
    }
  }
  return null;
}

/**
 * One receipt batch equals one exact physical slip for one customer. Rows with
 * no slip deliberately fall back to their own wallet_hs id and never coalesce
 * merely because they share a transfer day.
 */
export function walletReceiptBatchKey(row: {
  id: number;
  userid: string;
  imagesslip: string | null;
}): string {
  const slip = row.imagesslip?.trim();
  return JSON.stringify([
    row.userid.trim(),
    slip ? "slip" : "row",
    slip || row.id,
  ]);
}

/** UI containment only; the server preflight remains authoritative. */
export function canRenderWalletBulkCheckbox(input: {
  canSettle: boolean;
  status: string | null;
  reforder2: string | number | null;
  groupKind?: "ledger" | "direct-slip";
  type?: string | null;
  typeservice?: string | null;
  reforder?: string | null;
  paymentGroupId?: string | null;
}): boolean {
  const isDirectForwarderSlip = input.type === "4"
    && input.typeservice === "2"
    && Boolean(input.reforder?.trim())
    && !hasParentReference(input.reforder2);
  return input.canSettle
    && (input.status ?? "1") === "1"
    && !hasParentReference(input.reforder2)
    && input.groupKind !== "ledger"
    && input.groupKind !== "direct-slip"
    && !input.paymentGroupId?.trim()
    && !isDirectForwarderSlip;
}
