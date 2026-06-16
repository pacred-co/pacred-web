"use server";

/**
 * Public sales-roster reader — the LIVE flagged sales reps, for the
 * customer-facing team display (components/sections/contact-sales.tsx).
 *
 * Owner directive (2026-06-15): the customer-facing sales list must reflect the
 * REAL active sales team (the same flagged pool the round-robin assigns from),
 * automatically — so flagging a 4th/5th rep updates the public site with zero
 * code change. Returns ONLY data already shown publicly on the site (name +
 * phone + photo) — no PII beyond the existing on-site cards.
 *
 * Serializable shape only (no functions) — it crosses the server→client
 * boundary into the "use client" ContactSales component.
 */
import { getActiveSalesReps } from "@/lib/admin/sales-roster";

export type PublicSalesRep = {
  adminID: string;
  name: string;
  phone: string;        // display form (0xx-xxx-xxxx)
  photo: string | null; // adminPicture or null (UI supplies a fallback icon)
};

export async function getPublicSalesRoster(): Promise<PublicSalesRep[]> {
  const reps = await getActiveSalesReps();
  return reps.map((r) => ({
    adminID: r.adminID,
    name: r.name,
    phone: r.phoneDisplay || r.phone,
    photo: r.photo,
  }));
}
