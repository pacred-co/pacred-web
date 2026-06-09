import { redirect } from "next/navigation";

/**
 * `/addresses/add` — DEFENSIVE route (2026-06-09 · owner-reported 404).
 *
 * The "เพิ่มที่อยู่ใหม่" add flow is a CLIENT MODAL on `/addresses`
 * (add-address-modal.tsx) — there is no standalone add page. Several links
 * historically pointed at `/addresses/add` (now repointed to `/addresses`),
 * but a stale/cached client or a missed link could still hit this path and
 * 404. This route guarantees that never happens: it forwards to `/addresses`
 * (the address book, where the green "เพิ่มที่อยู่" pill opens the add modal).
 *
 * `?add=1` is passed so a future enhancement on /addresses can auto-open the
 * modal; today the address book renders the add trigger prominently.
 */
export const dynamic = "force-dynamic";

export default function AddAddressRedirect() {
  redirect("/addresses?add=1");
}
