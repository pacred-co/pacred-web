/**
 * Public quotation view — `/q/[token]` (owner 2026-06-22).
 *
 * The shareable read-only render of a ใบเสนอราคา. The `[token]` is a stateless
 * base64url blob of the quote inputs (lib/quote/quote-share.ts) — the link IS
 * the quote, no DB row (matches the editor's pure-client design). A sales rep
 * builds the link from the customer-360 quote tab's "แชร์ลิงก์" button and
 * sends it to the customer, who opens this mobile-friendly page (and can print
 * / save a PDF themselves).
 *
 * No auth: the quote is customer-facing document data the rep chose to share.
 * noindex so a quotation is never search-indexed.
 */

import { PublicQuoteView } from "./public-quote-view";

// Renders under the (public) layout (NavBar reads cookies) → force-dynamic.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "ใบเสนอราคา — Pacred",
  robots: { index: false, follow: false },
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicQuoteView token={token} />;
}
