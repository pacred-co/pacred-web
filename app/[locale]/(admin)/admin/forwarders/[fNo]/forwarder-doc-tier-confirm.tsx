/**
 * <ForwarderDocTierConfirm> — self-gating server wrapper for the per-order
 * doc-tier-discount ติ๊กยืนยัน (ภูม 2026-06-18 · C · mig 0188).
 *
 * Async server component: gates to the pricing-authority roles
 * (super/accounting/pricing — same as the cost editor; granting a ฿800/CBM
 * discount is a pricing call), reads the order's doc/eligibility fields, resolves
 * the discount config, and renders the client toggle. Non-authority roles see
 * nothing (the flag is a pricing-internal concern).
 *
 * §0c: every Supabase read destructures `error`. §0d: reachable inline on the
 * forwarder detail page (next to the cost section).
 * §0e ISOLATION: the only mutation it surfaces (adminSetForwarderDocTierConfirmed)
 * writes ONLY tb_forwarder.doc_tier_confirmed — never the selling price/status/notify.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles, hasRole } from "@/lib/auth/require-admin";
import {
  isDocTierTaxDoc,
  getDocTierDiscountConfig,
} from "@/lib/forwarder/doc-tier-discount";
import { ForwarderDocTierConfirmClient } from "./forwarder-doc-tier-confirm-client";

type Row = {
  id: number;
  doc_tier_confirmed: boolean | null;
  tax_doc_pref: string | null;
};

export async function ForwarderDocTierConfirm({ fId }: { fId: number }) {
  // Gate: only the pricing-authority roles (super/accounting/pricing).
  const roles = await getAdminRoles();
  if (!roles || !hasRole(roles, ["accounting", "pricing"])) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_forwarder")
    .select("id, doc_tier_confirmed, tax_doc_pref")
    .eq("id", fId)
    .maybeSingle<Row>();
  if (error) {
    console.error(`[ForwarderDocTierConfirm read] failed`, { code: error.code, message: error.message, fId });
    return null;
  }
  if (!data) return null;

  const { cbmThb, enabled } = await getDocTierDiscountConfig();

  return (
    <ForwarderDocTierConfirmClient
      fId={fId}
      initialConfirmed={data.doc_tier_confirmed === true}
      taxDocEligible={isDocTierTaxDoc(data.tax_doc_pref)}
      discountCbm={cbmThb}
      enabled={enabled}
    />
  );
}
