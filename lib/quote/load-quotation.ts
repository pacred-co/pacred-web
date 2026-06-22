import "server-only";

/**
 * Quotation loader for the public share-link page (`/q/[token]`) — owner ภูม
 * 2026-06-22. The ใบเสนอราคา twin of `lib/receipt/load-receipt-document.ts`.
 *
 * Reads ONE `customer_quotations` row with the service-role client (bypasses RLS)
 * so the public page can render the document WITHOUT a session — the unguessable
 * `/q/{token}` capability link (lib/quote/quote-token.ts) is the gate, identical
 * to how the public receipt page loads. Returns `null` when the id isn't found
 * (the CALLER 404s).
 *
 * The stored `payload` IS the QuoteModel; the public page renders it as-is (no
 * recompute → byte-identical to the admin card the rep saw).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { QuoteModel } from "@/components/quote/quote-paper";

export type LoadedQuotation = {
  id: number;
  refNo: string;
  model: QuoteModel;
};

export async function loadQuotation(id: number): Promise<LoadedQuotation | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customer_quotations")
    .select("id, ref_no, payload")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    // Surface, don't silently 404 a transient DB error (AGENTS §0c).
    console.error("loadQuotation: query failed", { id, error });
    throw new Error("loadQuotation query failed");
  }
  if (!data || !data.payload) return null;

  // The payload was written from a serialized QuoteModel; trust the shape (the
  // write path validated it). Render-only.
  return {
    id: Number(data.id),
    refNo: String(data.ref_no ?? ""),
    model: data.payload as QuoteModel,
  };
}
