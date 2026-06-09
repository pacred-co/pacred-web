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
  mutedLt:    "#9CA3AF",   // gray-400
  border:     "#E5E7EB",   // gray-200
  borderDk:   "#D1D5DB",   // gray-300
  surfaceAlt: "#F9FAFB",   // gray-50
  surfaceTotal: "#F3F4F6", // gray-100 — totals row highlight
  accent:     "#FFF7ED",   // orange-50 — Peak notes block tint
  accentBorder: "#FED7AA", // orange-200
  accentText: "#C2410C",   // orange-700
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

/**
 * Peak-style v2 (2026-06-09 · ภูม flag round 2).
 *
 * v1 used boxes/cards everywhere → looked เละ. Peak is borderless — every
 * section is just a row separated by a single 1px gray divider. No card
 * chrome around issuer/customer/totals/payment. Only the meta box (top-right
 * 3-row card) and the items table itself have borders.
 *
 * Peak palette (sampled from the screenshot):
 *   - body white background, no shadows
 *   - section dividers = 1px solid #e5e7eb (COLORS.border)
 *   - orange accent only for the brand wordmark + meta-box tint
 *   - body text #111827, secondary #6b7280, danger #DC2626 (totals only)
 *
 * Typography:
 *   - body 9pt
 *   - section labels 10pt bold
 *   - amount numbers 11pt bold
 */
export const peakStyles = StyleSheet.create({
  // ── Top band: brand wordmark left · copy badge right ────────────────
  peakTopBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  peakBrandWord: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.accentText, // Pacred orange wordmark
    letterSpacing: 0.5,
  },
  peakCopyLabel: {
    fontSize: 9,
    color: COLORS.muted,
  },
  peakDocTitleRight: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.foreground,
    marginTop: 2,
    textAlign: "right",
  },
  peakDocTitleEnRight: {
    fontSize: 7,
    color: COLORS.muted,
    letterSpacing: 1.2,
    textAlign: "right",
  },

  // ── Section divider (full-width 1px line) ────────────────────────────
  peakDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    marginVertical: 6,
  },

  // ── Section row (issuer block, customer block — borderless stacked) ─
  peakSectionRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  peakSectionMain: {
    flex: 3,
    paddingRight: 8,
  },
  peakSectionSide: {
    flex: 2,
    alignItems: "flex-end",
  },
  peakRoleLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 1,
  },
  peakRoleName: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: COLORS.foreground,
    marginBottom: 2,
  },
  peakContactLine: {
    fontSize: 8.5,
    color: COLORS.foreground,
    lineHeight: 1.4,
  },
  peakContactInline: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 1,
  },
  peakContactItem: {
    fontSize: 8,
    color: COLORS.muted,
    marginRight: 10,
  },

  // ── Right-aligned meta card (เลขที่ · วันที่ · อ้างอิง) — keeps a border ─
  peakMetaCard: {
    borderWidth: 0.5,
    borderColor: COLORS.borderDk,
    borderStyle: "solid",
    borderRadius: 2,
    width: 180,
    backgroundColor: COLORS.surfaceAlt,
  },
  peakMetaRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  peakMetaRowLast: {
    borderBottomWidth: 0,
  },
  peakMetaLabel: {
    width: 60,
    fontSize: 8,
    color: COLORS.muted,
  },
  peakMetaValue: {
    flex: 1,
    fontSize: 8.5,
    color: COLORS.foreground,
    textAlign: "right",
  },

  // ── Items table (Pacred 7-col — only the table itself has thin borders) ─
  peakTable: {
    marginVertical: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderDk,
    borderTopStyle: "solid",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderDk,
    borderBottomStyle: "solid",
  },
  peakTableHead: {
    flexDirection: "row",
    backgroundColor: COLORS.surfaceAlt,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  peakTableHeadCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.muted,
  },
  peakTableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  peakTableRowLast: {
    borderBottomWidth: 0,
  },
  peakTableCell: {
    fontSize: 8.5,
    color: COLORS.foreground,
  },
  peakTableCellRight: {
    textAlign: "right",
  },
  peakTableCellCenter: {
    textAlign: "center",
  },

  // ── Section heading (📋/💳/📝/✍ inline icon + bold label) ──────────────
  peakSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 3,
  },
  peakSectionHeadLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.foreground,
  },

  // ── Totals: RIGHT-aligned text rows (NO box, NO border) ───────────────
  peakTotalsWrap: {
    alignItems: "flex-end",
    marginBottom: 4,
  },
  peakTotalsRow: {
    flexDirection: "row",
    paddingVertical: 1.5,
    minWidth: 220,
    justifyContent: "flex-end",
  },
  peakTotalsLabel: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: "right",
    marginRight: 14,
  },
  peakTotalsValue: {
    width: 80,
    fontSize: 9,
    color: COLORS.foreground,
    textAlign: "right",
  },
  peakTotalsGrandRow: {
    flexDirection: "row",
    paddingTop: 4,
    paddingBottom: 4,
    marginTop: 2,
    minWidth: 260,
    justifyContent: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderDk,
    borderTopStyle: "solid",
  },
  peakTotalsGrandLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.foreground,
    textAlign: "right",
    marginRight: 14,
  },
  peakTotalsGrandValue: {
    width: 80,
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.foreground,
    textAlign: "right",
  },
  peakAmountInWords: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 2,
  },
  peakTotalsAccent: {
    color: "#DC2626",
  },

  // ── Payment section: left ชำระโดย inline · right bank stacked ─────────
  peakPaymentRow: {
    flexDirection: "row",
    marginVertical: 3,
  },
  peakPaymentLeft: {
    flex: 1,
    paddingRight: 10,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.border,
    borderRightStyle: "solid",
  },
  peakPaymentRight: {
    flex: 1,
    paddingLeft: 10,
  },
  peakPaymentLine: {
    fontSize: 8.5,
    color: COLORS.foreground,
    lineHeight: 1.5,
  },
  peakPaymentLineMuted: {
    fontSize: 8,
    color: COLORS.muted,
    lineHeight: 1.5,
  },

  // ── Signature mini-boxes (~80pt wide each, single thin line at bottom) ─
  peakSigRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  peakQrSmall: {
    width: 60,
    alignItems: "center",
    marginRight: 6,
  },
  peakQrSmallBox: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 0.5,
    borderColor: COLORS.borderDk,
    borderStyle: "solid",
    alignItems: "center",
    justifyContent: "center",
  },
  peakQrSmallText: {
    fontSize: 6,
    color: COLORS.mutedLt,
    textAlign: "center",
    lineHeight: 1.2,
  },
  peakQrSmallLabel: {
    fontSize: 6.5,
    color: COLORS.muted,
    marginTop: 1,
    textAlign: "center",
  },
  peakSigBox: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: 2,
    marginRight: 4,
    alignItems: "center",
  },
  peakSigBoxLast: {
    marginRight: 0,
  },
  peakSigContent: {
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  peakSigLine: {
    width: "100%",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.foreground,
    borderBottomStyle: "solid",
    marginBottom: 2,
  },
  peakSigRoleLabel: {
    fontSize: 7.5,
    color: COLORS.foreground,
    textAlign: "center",
  },
  peakSigDateLabel: {
    fontSize: 6.5,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 1,
  },
});
