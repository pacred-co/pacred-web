/**
 * Shared StyleSheet for Pacred PDF receipts.
 *
 * Page size: A4 (210 × 297 mm) — react-pdf default
 * Font: Sarabun (registered via `lib/pdf/register-fonts.ts`)
 * Colors mirror Tailwind theme tokens from `app/globals.css`.
 */

import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  primary:    "#B30000",   // brand red (primary-600)
  primaryDk:  "#7A0000",   // darker variant
  foreground: "#111827",   // gray-900
  muted:      "#6B7280",   // gray-500
  border:     "#E5E7EB",   // gray-200
  surfaceAlt: "#F9FAFB",   // gray-50
} as const;

export const styles = StyleSheet.create({
  page: {
    fontFamily: "Sarabun",
    fontSize:   10,
    padding:    36,                 // ~12.7mm margin
    color:      COLORS.foreground,
    backgroundColor: "#fff",
  },

  // ── Header ────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    borderBottomStyle: "solid",
  },
  brandBlock: {
    flexDirection: "column",
    width: "60%",
  },
  brandName: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 2,
  },
  brandTagline: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 4,
  },
  brandAddress: {
    fontSize: 8,
    color: COLORS.foreground,
    lineHeight: 1.4,
  },

  receiptMeta: {
    width: "40%",
    alignItems: "flex-end",
  },
  receiptTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  receiptNo: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.foreground,
    marginBottom: 2,
  },
  receiptDate: {
    fontSize: 9,
    color: COLORS.muted,
  },

  // ── Customer block ───────────────────────────────────────────────────
  customerBlock: {
    flexDirection: "row",
    marginBottom: 14,
  },
  customerCol: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "solid",
    borderRadius: 3,
    marginRight: 6,
  },
  customerColLast: {
    marginRight: 0,
  },
  customerLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.foreground,
    marginBottom: 2,
  },
  customerLine: {
    fontSize: 9,
    color: COLORS.foreground,
    lineHeight: 1.4,
  },

  // ── Table ────────────────────────────────────────────────────────────
  table: {
    flexDirection: "column",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "solid",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: COLORS.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableHeadCell: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.foreground,
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableCellBold: {
    fontWeight: "bold",
  },

  // ── Totals ───────────────────────────────────────────────────────────
  totalsBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
    minWidth: 200,
  },
  totalLabel: {
    fontSize: 10,
    color: COLORS.muted,
    width: 120,
    textAlign: "right",
    marginRight: 12,
  },
  totalValue: {
    fontSize: 10,
    color: COLORS.foreground,
    width: 80,
    textAlign: "right",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: COLORS.primary,
    borderTopStyle: "solid",
    minWidth: 200,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.foreground,
    width: 120,
    textAlign: "right",
    marginRight: 12,
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.primary,
    width: 80,
    textAlign: "right",
  },

  amountInWords: {
    fontSize: 9,
    fontStyle: "italic",
    color: COLORS.foreground,
    marginTop: 8,
    padding: 6,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 3,
  },

  // ── Footer ───────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
  },
  footerText: {
    fontSize: 8,
    color: COLORS.muted,
  },
  pageNumber: {
    fontSize: 8,
    color: COLORS.muted,
  },

  // ── Misc ─────────────────────────────────────────────────────────────
  signature: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 32,
    paddingHorizontal: 24,
  },
  signatureBox: {
    width: "40%",
    alignItems: "center",
  },
  signatureLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: COLORS.foreground,
    borderTopStyle: "solid",
    marginTop: 32,
    paddingTop: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: COLORS.muted,
  },
});

// Number formatter — `1234.56` → `"1,234.56"`
export function fmtBaht(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
