/**
 * POST /api/customs-letter
 *
 * W11 — Streams a customs-kit letter PDF (DO-release LOI per carrier · ZIM
 * Split-DO · 45-day waiver · POA · amend · lost-doc). STATELESS — the request
 * body IS the letter data; nothing is persisted (these are draft letters the
 * Docs team prints + stamps).
 *
 * Auth: admin (super/accounting/freight_*_doc/pricing — Docs workflow). The
 * generator UI lives at /admin/accounting/customs-doc-kit.
 *
 * No money / customs filing — pure templating over the posted fields.
 */

import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdmin } from "@/lib/auth/require-admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { logAdminAction } from "@/actions/admin/common";
import { CustomsLetter } from "@/components/pdf/customs-letter";
import { generateCustomsLetterSchema } from "@/lib/validators/customs-letter";
import {
  SITE_LEGAL_NAME_TH,
  TAX_ID,
  ADDRESSES,
} from "@/components/seo/site";
import type { CustomsLetterData } from "@/lib/customs/customs-letters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Docs-workflow roles only (mirrors the generator page + actions).
  const { user } = await requireAdmin([
    "super", "accounting", "freight_import_doc", "freight_export_doc", "pricing",
  ]);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = generateCustomsLetterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", detail: parsed.error.issues[0]?.message ?? "invalid" },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Build the full letter data — apply Pacred defaults for blank sender fields.
  const data: CustomsLetterData = {
    letterType:           d.letterType,
    carrierCode:          d.carrierCode ?? null,
    carrierNameOverride:  d.carrierNameOverride ?? null,
    jobNo:                d.jobNo ?? null,
    refNo:                d.refNo ?? null,
    issueDateIso:         d.issueDateIso,
    senderName:           d.senderName?.trim() || SITE_LEGAL_NAME_TH,
    senderAddress:        d.senderAddress?.trim() || ADDRESSES.office.full,
    senderTaxId:          d.senderTaxId?.trim() || TAX_ID,
    signatoryName:        d.signatoryName ?? null,
    signatoryTitle:       d.signatoryTitle ?? null,
    consigneeName:        d.consigneeName,
    consigneeAddress:     d.consigneeAddress ?? "",
    consigneeTaxId:       d.consigneeTaxId ?? null,
    blNo:                 d.blNo ?? null,
    blStatus:             d.blStatus ?? null,
    vesselVoyage:         d.vesselVoyage ?? null,
    portLoading:          d.portLoading ?? null,
    portDischarge:        d.portDischarge ?? null,
    placeDelivery:        d.placeDelivery ?? null,
    containerNo:          d.containerNo ?? null,
    containerCodeInternal: d.containerCodeInternal ?? null,
    cargoDescription:     d.cargoDescription ?? null,
    totalCartons:         d.totalCartons ?? null,
    totalWeightKg:        d.totalWeightKg ?? null,
    totalVolumeCbm:       d.totalVolumeCbm ?? null,
    granteeName:          d.granteeName ?? null,
    granteeIdCardNo:      d.granteeIdCardNo ?? null,
    awbTrackingNo:        d.awbTrackingNo ?? null,
    amendOldValue:        d.amendOldValue ?? null,
    amendNewValue:        d.amendNewValue ?? null,
    amendField:           d.amendField ?? null,
    lostReceiptNumbers:   d.lostReceiptNumbers ?? null,
    courierName:          d.courierName ?? null,
    courierTrackingNo:    d.courierTrackingNo ?? null,
    policeReportNote:     d.policeReportNote ?? null,
    splitSets:            d.splitSets ?? null,
    customsOffice:        d.customsOffice ?? null,
    arrivalDateIso:       d.arrivalDateIso ?? null,
    estimatedDutyThb:     d.estimatedDutyThb ?? null,
  };

  // Best-effort audit (a doc was generated; not a money/state mutation).
  await logAdminAction(user.id, "customs_letter_generated", "customs_letter", d.refNo ?? d.jobNo ?? d.letterType, {
    letterType: d.letterType,
    carrier:    d.carrierCode,
    jobNo:      d.jobNo,
  });

  registerPdfFonts();
  const buffer = await renderToBuffer(<CustomsLetter data={data} />);

  const filename = `pacred-${d.letterType}-${(d.refNo ?? d.jobNo ?? "draft").replace(/[^\w-]/g, "")}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
