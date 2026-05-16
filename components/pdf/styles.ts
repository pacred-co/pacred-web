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
  // Tax invoice extras (G2c)
  receiptTitleEn: {
    fontSize: 8,
    fontWeight: "normal",
    color: COLORS.muted,
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: -2,
  },
  originalCopy: {
    // U1-8 fix: removed `fontStyle: italic` — Sarabun italic variant is
    // not registered (only Regular + Bold in public/fonts/). Visual
    // distinction comes from the smaller size + muted color instead.
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 2,
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
  // Tax invoice — buyer block takes more horizontal space than payment-method block
  buyerColWide: {
    flex: 2,
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
    // U1-8 fix: removed `fontStyle: italic` — Sarabun italic isn't
    // registered (only Regular + Bold available). Visual distinction
    // comes from the surface-alt background + smaller font.
    fontSize: 9,
    color: COLORS.foreground,
    marginTop: 8,
    padding: 6,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 3,
  },

  // ── Bank-transfer payment block (post-T-G3 Bundle 1 — BANK constant) ──
  bankBlock: {
    marginTop: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: "solid",
    borderRadius: 4,
    backgroundColor: COLORS.surfaceAlt,
  },
  bankTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 6,
  },
  bankRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  bankLabel: {
    fontSize: 9,
    color: COLORS.muted,
    width: 80,
  },
  bankValue: {
    fontSize: 10,
    color: COLORS.foreground,
    flex: 1,
  },
  bankAccountNumber: {
    fontWeight: "bold",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  bankNote: {
    marginTop: 6,
    fontSize: 8,
    color: COLORS.muted,
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

  // ── Cancelled watermark (tax invoice) ────────────────────────────────
  // Diagonal stamp drawn over the page when status='cancelled'. Big +
  // semi-transparent so the underlying invoice is still readable for
  // audit purposes but unmistakably marked as voided.
  cancelledOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelledText: {
    fontSize: 80,
    fontWeight: "bold",
    color: COLORS.primary,
    opacity: 0.18,
    transform: "rotate(-30deg)",
    letterSpacing: 8,
  },
});

// Number formatter — `1234.56` → `"1,234.56"`
export function fmtBaht(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
