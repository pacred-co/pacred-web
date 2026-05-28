/**
 * GET /api/commission-withdrawal/[id]
 *
 * Streams the commission withdrawal receipt PDF (V-E8 / V-H1 / V-H2).
 * `[id]` is the `commission_withdrawals.id` uuid.
 *
 * Used by:
 *   • Earner "ดาวน์โหลดใบสำคัญรับเงิน" button on /commissions/me/[id]
 *   • Admin downloads from /admin/commissions/[id]
 *
 * Auth & visibility:
 *   - Row visibility gated by `commission_withdrawals` RLS (migration 0054):
 *       earner → own rows (earner_admin_id = auth.uid())
 *       admin  → all rows when is_admin(['super','accounting'])
 *   - We use the RLS-scoped client for the row read — null → 404.
 *   - Once authorised, items + accruals are fetched via admin client
 *     (the RLS read already proved access).
 *
 * Rendering:
 *   - Live re-render — the receipt reflects current paid/approved/rejected
 *     state (mirror freight-receipt pattern).
 *
 * Cache-Control: private, no-store.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { CommissionReceipt, type CommissionReceiptData } from "@/components/pdf/commission-receipt";
import {
  ROLE_KIND_LABEL,
  SOURCE_KIND_LABEL,
  type RoleKind,
  type SourceKind,
  type WithdrawalStatus,
} from "@/lib/validators/commission";

export const runtime = "nodejs";          // @react-pdf/renderer needs node fs (font load)
export const dynamic = "force-dynamic";

type WithdrawalRow = {
  id:                  string;
  withdrawal_no:       string;
  status:              WithdrawalStatus;
  earner_admin_id:     string;
  role_kind:           RoleKind;
  title:               string;
  gross_thb:           number;
  wht_rate_pct:        number;
  wht_amount_thb:      number;
  net_thb:             number;
  payee_bank_name:     string;
  payee_account_name:  string;
  payee_account_no:    string;
  requested_at:        string;
  approved_at:         string | null;
  paid_at:             string | null;
  slip_storage_path:   string | null;
  notes:               string | null;
};

type ItemDbRow = {
  id:                       string;
  included_amount_thb:      number;
  accrual: {
    source_kind:        SourceKind;
    source_ref:         string;
    accrued_at:         string;
  } | { source_kind: SourceKind; source_ref: string; accrued_at: string }[] | null;
};

type EarnerProfile = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── 1. Auth + row visibility via RLS ──
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    console.error(`[commission-withdrawal/[id] getUser] failed`, { message: userErr.message });
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { data: row, error: rowErr } = await supabase
    .from("commission_withdrawals")
    .select(`
      id, withdrawal_no, status, earner_admin_id, role_kind, title,
      gross_thb, wht_rate_pct, wht_amount_thb, net_thb,
      payee_bank_name, payee_account_name, payee_account_no,
      requested_at, approved_at, paid_at, slip_storage_path, notes
    `)
    .eq("id", id)
    .maybeSingle<WithdrawalRow>();
  if (rowErr) {
    console.error(`[commission-withdrawal/[id] row lookup] id=${id}`, { code: rowErr.code, message: rowErr.message });
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  // ── 2. Related data via admin client (row visibility already proved access) ──
  const admin = createAdminClient();

  const { data: earnerRaw, error: earnerErr } = await admin
    .from("profiles")
    .select("member_code, first_name, last_name")
    .eq("id", row.earner_admin_id)
    .maybeSingle<EarnerProfile>();
  if (earnerErr) {
    // Soft-fail — earnerName falls back to '—' via the existing null-handling below.
    console.error(`[commission-withdrawal/[id] earner lookup] id=${row.earner_admin_id}`, { code: earnerErr.code, message: earnerErr.message });
  }

  const { data: itemsRaw, error: itemsErr } = await admin
    .from("commission_withdrawal_items")
    .select(`
      id, included_amount_thb,
      accrual:commission_accruals!commission_accrual_id (
        source_kind, source_ref, accrued_at
      )
    `)
    .eq("commission_withdrawal_id", id);
  if (itemsErr) {
    console.error(`[commission-withdrawal/[id] items lookup] id=${id}`, { code: itemsErr.code, message: itemsErr.message });
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const items = ((itemsRaw ?? []) as ItemDbRow[]).map((it, i) => {
    const acc = Array.isArray(it.accrual) ? it.accrual[0] ?? null : it.accrual;
    return {
      position:            i + 1,
      source_label:        acc ? SOURCE_KIND_LABEL[acc.source_kind] : "—",
      source_ref:          acc?.source_ref ?? "—",
      included_amount_thb: Number(it.included_amount_thb),
      accrued_at:          acc?.accrued_at ?? row.requested_at,
    };
  });

  // ── 3. Render ──
  registerPdfFonts();

  const earnerName =
    [earnerRaw?.first_name, earnerRaw?.last_name].filter(Boolean).join(" ") ||
    (earnerRaw?.member_code ?? "—");

  const data: CommissionReceiptData = {
    withdrawal_no:      row.withdrawal_no,
    status:             row.status,
    title:              row.title,
    role_label:         ROLE_KIND_LABEL[row.role_kind],
    requested_at:       row.requested_at,
    approved_at:        row.approved_at,
    paid_at:            row.paid_at,
    earner_name:        earnerName,
    earner_code:        earnerRaw?.member_code ?? null,
    payee_bank_name:    row.payee_bank_name,
    payee_account_name: row.payee_account_name,
    payee_account_no:   row.payee_account_no,
    gross_thb:          Number(row.gross_thb),
    wht_rate_pct:       Number(row.wht_rate_pct),
    wht_amount_thb:     Number(row.wht_amount_thb),
    net_thb:            Number(row.net_thb),
    items,
    notes:              row.notes,
    slip_storage_path:  row.slip_storage_path,
  };

  const filename = `pacred-commission-${row.withdrawal_no}.pdf`;
  const buffer = await renderToBuffer(<CommissionReceipt data={data} />);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
