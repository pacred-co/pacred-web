"use server";

/**
 * W11 — Customs doc-kit admin actions (ADVISORY / DOC-GENERATION ONLY).
 *
 * Surface:
 *   adminCheckFormEEligibility — provisional ACFTA/Form-E check (advisory)
 *   adminSuggestHsCodes        — HS-code AI-assist (stub unless endpoint set)
 *   adminPrefillLetterFromShipment — pull a shipment + parties into the
 *                                    customs-letter fields (for the generator)
 *
 * RBAC: super + accounting + freight_import_doc + freight_export_doc + pricing
 * (Docs-workflow roles). NONE of these touch wallet / payment / quote-recompute
 * / commission — they read shipment/parties and run pure advisory helpers.
 *
 * NO money / tax / customs-filing action executes here. The actual letter PDF
 * is rendered by the stateless `/api/customs-letter` route from query params;
 * these actions only assist data capture + advisory checks.
 */

import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkFormEEligibility,
  type FormEEligibilityResult,
  type FormEOriginCriterion,
} from "@/lib/customs/form-e";
import { suggestHsCodes, type HsAssistResult } from "@/lib/customs/hs-assist";
import { carrierFromBlPrefix, type CustomsLetterData } from "@/lib/customs/customs-letters";
import {
  SITE_LEGAL_NAME_TH,
  TAX_ID,
  ADDRESSES,
} from "@/components/seo/site";

const ROLES = [
  "super", "accounting", "freight_import_doc", "freight_export_doc", "pricing",
] as const;

// ── 1) Form-E / ACFTA eligibility (advisory) ───────────────────────────

export async function adminCheckFormEEligibility(input: {
  hsCode?: string | null;
  originCountry?: string | null;
  originCriterion?: FormEOriginCriterion | null;
}): Promise<AdminActionResult<FormEEligibilityResult>> {
  return withAdmin([...ROLES], async () => {
    const result = checkFormEEligibility({
      hsCode: input.hsCode,
      originCountry: input.originCountry,
      originCriterion: input.originCriterion ?? null,
    });
    return { ok: true, data: result };
  });
}

// ── 2) HS-code AI-assist (stub unless endpoint configured) ─────────────

export async function adminSuggestHsCodes(input: {
  productDescription: string;
}): Promise<AdminActionResult<HsAssistResult>> {
  return withAdmin([...ROLES], async () => {
    const result = await suggestHsCodes(input.productDescription ?? "");
    return { ok: true, data: result };
  });
}

// ── 3) Prefill the letter generator from a shipment ────────────────────

type ShipmentRow = {
  id: string;
  job_no: string | null;
  transport_mode: string | null;
  bl_no: string | null;
  vessel_voyage: string | null;
  port_loading: string | null;
  port_discharge: string | null;
  place_delivery: string | null;
  container_code: string | null;
  carrier_container_no: string | null;
  profile_id: string | null;
};

type PartyRow = { role: string; name: string; address: string; tax_id: string | null };

/**
 * Read a freight shipment + its consignee party and return a partial
 * `CustomsLetterData` the generator form pre-fills. READ-ONLY. The carrier is
 * best-effort-detected from the B/L prefix; the operator confirms/overrides.
 */
export async function adminPrefillLetterFromShipment(input: {
  shipmentId: string;
}): Promise<AdminActionResult<Partial<CustomsLetterData>>> {
  return withAdmin([...ROLES], async ({ adminId }) => {
    const shipmentId = (input.shipmentId ?? "").trim();
    if (!shipmentId) return { ok: false, error: "shipment_id_required" };

    const admin = createAdminClient();

    const { data: shipment, error: shipmentErr } = await admin
      .from("freight_shipments")
      .select(
        "id, job_no, transport_mode, bl_no, vessel_voyage, port_loading, port_discharge, place_delivery, container_code, carrier_container_no, profile_id",
      )
      .eq("id", shipmentId)
      .maybeSingle<ShipmentRow>();
    if (shipmentErr) {
      console.error("[customs-doc-kit prefill] shipment lookup failed", {
        code: shipmentErr.code, message: shipmentErr.message,
      });
      return { ok: false, error: "shipment_lookup_failed" };
    }
    if (!shipment) return { ok: false, error: "shipment_not_found" };

    const { data: parties, error: partiesErr } = await admin
      .from("freight_parties")
      .select("role, name, address, tax_id")
      .eq("freight_shipment_id", shipmentId);
    if (partiesErr) {
      console.error("[customs-doc-kit prefill] parties lookup failed", {
        code: partiesErr.code, message: partiesErr.message,
      });
    }
    const partyList = (parties ?? []) as unknown as PartyRow[];
    const consignee = partyList.find((p) => p.role === "consignee");

    await logAdminAction(adminId, "customs_doc_kit_prefill", "freight_shipment", shipmentId, {
      job_no: shipment.job_no,
    });

    const prefill: Partial<CustomsLetterData> = {
      carrierCode: carrierFromBlPrefix(shipment.bl_no),
      jobNo: shipment.job_no,
      // Default sender = Pacred (the doc team can switch to NNB-shipping by hand).
      senderName: SITE_LEGAL_NAME_TH,
      senderAddress: ADDRESSES.office.full,
      senderTaxId: TAX_ID,
      signatoryTitle: "กรรมการบริษัท",
      consigneeName: consignee?.name ?? "",
      consigneeAddress: consignee?.address ?? "",
      consigneeTaxId: consignee?.tax_id ?? null,
      blNo: shipment.bl_no,
      vesselVoyage: shipment.vessel_voyage,
      portLoading: shipment.port_loading,
      portDischarge: shipment.port_discharge,
      placeDelivery: shipment.place_delivery,
      containerNo: shipment.carrier_container_no,
      containerCodeInternal: shipment.container_code,
    };

    return { ok: true, data: prefill };
  });
}
