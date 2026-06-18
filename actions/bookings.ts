"use server";

/**
 * BK-1 — booking-flow Server Actions.
 *
 * Per design [docs/research/booking-flow-system-2026-05-18.md] §5 / §6.
 *
 * Surface area (the four actions BK-1 needs + the two customer-side reads
 * the portal consumes, plus a thin `getBookingDraftRoute` helper Agent C
 * uses to resolve a draft id during the auth gate):
 *
 *   1. createDraftBooking   — anon-callable (RLS bookings_anon_insert_draft).
 *      Persists the picked options as a `draft` row + child booking_options;
 *      server recomputes the estimate from `booking_rates` (never trusts
 *      the client total) and stores the QuoteLine[] in estimate_breakdown.
 *   2. updateBookingDraft   — review-step option tweak. Allowed while
 *      status='draft'; DELETE + re-INSERT children; recompute estimate.
 *   3. submitBooking        — auth-required. Flips draft → submitted,
 *      assigns booking_no via next_booking_no() RPC, spawns the
 *      work_item job via ensure_work_item() RPC, fan-out notifications.
 *   4. getMyBookings        — authenticated customer list.
 *   5. getMyBookingByNo     — authenticated customer detail (single row).
 *   6. getBookingDraftRoute — pre-bind helper for the /book-start gate.
 *
 * Result<T> contract (mirrors actions/admin/common.ts):
 *   { ok: true; data: T } | { ok: false; error: string }
 *
 * The exported `ActionResult<T>` name is preserved for Agent C's pages
 * that already import it from this file.
 *
 * Notes:
 *   - The admin client (service-role) drives draft writes so the anon
 *     guest path returns the bookings.id back to the caller (RLS forbids
 *     anon SELECT — the action surfaces the id directly).
 *   - work_item spawn + notifications are best-effort: their failure must
 *     NOT roll back the submit (the booking row IS the durable record).
 *   - All option rate lookups read from `booking_rates`.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { sendNotification } from "@/lib/notifications";
import { logger, redactId } from "@/lib/logger";
import {
  createBookingDraftSchema,
  submitBookingSchema,
  updateBookingDraftSchema,
  tractorClassToRateKey,
  docModeToRateKey,
  intakePriorityForService,
  type BookingServiceSlug,
  type BookingStatus,
} from "@/lib/validators/booking";
import { getServiceConfig } from "@/lib/booking/service-config";
import type {
  BookingDocKind,
  BookingDocument,
  BookingOptionState,
  CreateBookingDraftInput,
  QuoteLine,
  SubmitBookingInput,
  SubmitBookingResult,
} from "@/types/booking";

// ════════════════════════════════════════════════════════════
// Result<T> contract
// ════════════════════════════════════════════════════════════

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Alias for the Pacred repo-wide `Result<T>` convention. */
export type Result<T> = ActionResult<T>;

// ════════════════════════════════════════════════════════════
// Read types — used by the customer portal pages
// ════════════════════════════════════════════════════════════

/** Shape rendered by `/bookings` list + per-booking detail page. */
export interface MyBookingSummary {
  id: string;
  booking_no: string | null;
  status: string;
  service_slug: string;
  route_slug: string | null;
  transport_mode: string | null;
  estimate_total: number;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  customer_note: string | null;
  submitted_at: string | null;
  created_at: string;
  freight_quote_id: string | null;
  /** Frozen JSONB snapshot of the QuoteLine[]. */
  estimate_breakdown: unknown;
  pickup_address: string | null;
  dropoff_address: string | null;
  doc_mode: string;
}

/** /book-start route-resolver shape — see getBookingDraftRoute. */
export interface DraftRouteInfo {
  id: string;
  status: string;
  service_slug: string;
  route_slug: string | null;
  /** Set once submit binds it — `null` while the draft is still pre-gate. */
  profile_id: string | null;
}

// ════════════════════════════════════════════════════════════
// Rate-resolution helpers — read booking_rates + compute QuoteLine[]
// ════════════════════════════════════════════════════════════

interface RateRow {
  scope:        "labor" | "tractor" | "doc" | "upgrade";
  rate_key:     string;
  service_slug: string | null;
  label_th:     string;
  label_en:     string;
  unit_amount:  number;
}

/** Load every active booking_rate (small table — ~12 seed rows). */
async function loadActiveRates(): Promise<RateRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("booking_rates")
    .select("scope, rate_key, service_slug, label_th, label_en, unit_amount")
    .eq("active", true);
  if (error) {
    logger.warn("bookings", "loadActiveRates failed", { error: error.message });
    return [];
  }
  return (data ?? []) as unknown as RateRow[];
}

/** Pick the most-specific rate (service-slug match wins over the catch-all). */
function pickRate(
  rates:       RateRow[],
  scope:       RateRow["scope"],
  rateKey:     string,
  serviceSlug: string,
): RateRow | null {
  const exact = rates.find(
    (r) => r.scope === scope && r.rate_key === rateKey && r.service_slug === serviceSlug,
  );
  if (exact) return exact;
  const catchAll = rates.find(
    (r) => r.scope === scope && r.rate_key === rateKey && r.service_slug === null,
  );
  return catchAll ?? null;
}

interface OptionInsert {
  position:    number;
  option_key:  string;
  option_label: string;
  detail:      string | null;
  quantity:    number;
  unit_amount: number;
  line_amount: number;
}

/**
 * Build the canonical QuoteLine[] + option line-items + total for a
 * booking, given the server-recomputed rate sheet + the picked options.
 * Server-side — never trusts a client total.
 */
function buildQuote(args: {
  serviceSlug: BookingServiceSlug;
  baseAmount:  number;
  baseLabel:   string;
  options:     BookingOptionState;
  rates:       RateRow[];
}): { rows: QuoteLine[]; total: number; optionInserts: OptionInsert[] } {
  const { serviceSlug, baseAmount, baseLabel, options, rates } = args;
  const rows: QuoteLine[] = [];
  const optionInserts: OptionInsert[] = [];
  let position = 1;

  // Base service row — always row 1. NOT persisted as a booking_option
  // (it is the calculator's output, not a chosen option).
  rows.push({ key: "base", label: baseLabel, amount: round2(baseAmount) });

  // Labor — N workers + optional heavy-lift.
  if (options.labor > 0) {
    const r = pickRate(rates, "labor", "worker", serviceSlug);
    if (r) {
      const lineAmount = round2(r.unit_amount * options.labor);
      const detail = `×${options.labor} คน`;
      rows.push({
        key:        "labor",
        label:      r.label_th,
        detail,
        quantity:   options.labor,
        unitAmount: r.unit_amount,
        amount:     lineAmount,
      });
      optionInserts.push({
        position:    position++,
        option_key:  "labor",
        option_label: r.label_th,
        detail,
        quantity:    options.labor,
        unit_amount: r.unit_amount,
        line_amount: lineAmount,
      });
    }
  }
  if (options.laborHeavyLift) {
    const r = pickRate(rates, "labor", "heavy_lift", serviceSlug);
    if (r) {
      rows.push({
        key:        "labor_heavy_lift",
        label:      r.label_th,
        unitAmount: r.unit_amount,
        amount:     round2(r.unit_amount),
      });
      optionInserts.push({
        position:    position++,
        option_key:  "labor_heavy_lift",
        option_label: r.label_th,
        detail:      null,
        quantity:    1,
        unit_amount: r.unit_amount,
        line_amount: round2(r.unit_amount),
      });
    }
  }

  // Tractor.
  const tractorRateKey = tractorClassToRateKey(options.tractor);
  if (tractorRateKey) {
    const r = pickRate(rates, "tractor", tractorRateKey, serviceSlug);
    if (r) {
      rows.push({
        key:        `tractor_${tractorRateKey}`,
        label:      r.label_th,
        unitAmount: r.unit_amount,
        amount:     round2(r.unit_amount),
      });
      optionInserts.push({
        position:    position++,
        option_key:  `tractor_${tractorRateKey}`,
        option_label: r.label_th,
        detail:      null,
        quantity:    1,
        unit_amount: r.unit_amount,
        line_amount: round2(r.unit_amount),
      });
    }
  }

  // Document-handling.
  const docRateKey = docModeToRateKey(options.docMode);
  if (docRateKey) {
    const r = pickRate(rates, "doc", docRateKey, serviceSlug);
    if (r) {
      rows.push({
        key:        `doc_${docRateKey}`,
        label:      r.label_th,
        unitAmount: r.unit_amount,
        amount:     round2(r.unit_amount),
      });
      optionInserts.push({
        position:    position++,
        option_key:  `doc_${docRateKey}`,
        option_label: r.label_th,
        detail:      null,
        quantity:    1,
        unit_amount: r.unit_amount,
        line_amount: round2(r.unit_amount),
      });
    }
  }

  // Upgrades (deduplicated — defensive against double-checked client state).
  const seenUpgrades = new Set<string>();
  for (const up of options.upgrades) {
    if (seenUpgrades.has(up)) continue;
    seenUpgrades.add(up);
    const r = pickRate(rates, "upgrade", up, serviceSlug);
    if (!r) continue;
    rows.push({
      key:        `upgrade_${up}`,
      label:      r.label_th,
      unitAmount: r.unit_amount,
      amount:     round2(r.unit_amount),
    });
    optionInserts.push({
      position:    position++,
      option_key:  `upgrade_${up}`,
      option_label: r.label_th,
      detail:      null,
      quantity:    1,
      unit_amount: r.unit_amount,
      line_amount: round2(r.unit_amount),
    });
  }

  const total = round2(rows.reduce((acc, r) => acc + r.amount, 0));
  return { rows, total, optionInserts };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtThb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

// ════════════════════════════════════════════════════════════
// (1) createDraftBooking — anon OR auth, persists draft
// ════════════════════════════════════════════════════════════

/**
 * Creates a `bookings` row at status='draft' + the picked `booking_options`
 * children. Anon-callable (a guest needs to be able to start a booking
 * before the auth gate — §5.4 draft-booking carry mechanism).
 *
 * The server recomputes the estimate from `booking_rates`. The client-
 * supplied `baseAmount` is the calculator's `calc*` output (the base
 * service row); option line-items are priced server-side.
 */
export async function createDraftBooking(
  input: CreateBookingDraftInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createBookingDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Pin profile_id if a logged-in user is calling.
  let profileId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: dataErr } = await supabase.auth.getUser();
    if (dataErr) {
      console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
    }
    profileId = user?.id ?? null;
  } catch {
    /* anon path — leave profileId null */
  }

  // Source-url best-effort capture (overrides client value when present).
  let sourceUrl: string | null = d.sourceUrl ?? null;
  try {
    const h = await headers();
    sourceUrl = h.get("referer") ?? sourceUrl;
  } catch { /* swallow */ }

  // Validate the service slug against the static manifest.
  const cfg = getServiceConfig(d.serviceSlug);
  if (!cfg) {
    return { ok: false, error: "unknown_service_slug" };
  }

  // Server-side estimate recompute.
  const rates = await loadActiveRates();
  const quote = buildQuote({
    serviceSlug: d.serviceSlug,
    baseAmount:  d.baseAmount,
    baseLabel:   d.baseLabel,
    options:     d.options,
    rates,
  });

  const admin = createAdminClient();

  const { data: inserted, error: insErr } = await admin
    .from("bookings")
    .insert({
      status:             "draft",
      service_slug:       d.serviceSlug,
      route_slug:         d.routeSlug ?? null,
      transport_mode:     d.transportMode ?? null,
      profile_id:         profileId,
      doc_mode:           d.options.docMode,
      pickup_lat:         d.options.pickup.lat,
      pickup_lng:         d.options.pickup.lng,
      pickup_address:     d.options.pickup.address || null,
      dropoff_lat:        d.options.dropoff.lat,
      dropoff_lng:        d.options.dropoff.lng,
      dropoff_address:    d.options.dropoff.address || null,
      estimate_total:     quote.total,
      estimate_breakdown: quote.rows,
      is_estimate:        true,
      source_channel:     d.sourceChannel ?? null,
      source_url:         sourceUrl,
    })
    .select("id")
    .single<{ id: string }>();

  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? "draft_insert_failed" };
  }

  // Insert option children — best-effort; on failure the header survives
  // and the customer can re-pick on the review step.
  if (quote.optionInserts.length > 0) {
    const { error: optErr } = await admin
      .from("booking_options")
      .insert(
        quote.optionInserts.map((o) => ({ ...o, booking_id: inserted.id })),
      );
    if (optErr) {
      logger.warn("bookings", "booking_options insert failed", {
        bookingId: redactId(inserted.id),
        error:     optErr.message,
      });
    }
  }

  return { ok: true, data: { id: inserted.id } };
}

// ════════════════════════════════════════════════════════════
// (2) updateBookingDraft — re-pick options on review step
// ════════════════════════════════════════════════════════════

/**
 * Replace the option-set on an existing draft. Allowed only while
 * status='draft'. Anon-OR-auth: verified via the admin client by matching
 * the draft id to a status='draft' row that is either profile-less (an
 * anon draft) or owned by the calling user.
 */
export async function updateBookingDraft(input: {
  bookingId:  string;
  options:    BookingOptionState;
  baseAmount: number;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = updateBookingDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Resolve caller (optional).
  let profileId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: dataErr } = await supabase.auth.getUser();
    if (dataErr) {
      console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
    }
    profileId = user?.id ?? null;
  } catch {
    /* anon path */
  }

  const admin = createAdminClient();

  const { data: existing, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, service_slug, profile_id")
    .eq("id", d.bookingId)
    .maybeSingle<{
      id: string;
      status: BookingStatus;
      service_slug: string;
      profile_id: string | null;
    }>();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "booking_not_found" };
  if (existing.status !== "draft") return { ok: false, error: "booking_not_draft" };
  if (existing.profile_id && existing.profile_id !== profileId) {
    return { ok: false, error: "booking_not_yours" };
  }

  const rates = await loadActiveRates();
  const cfg = getServiceConfig(existing.service_slug);
  const baseLabel = cfg?.titleTh ?? existing.service_slug;
  const quote = buildQuote({
    serviceSlug: existing.service_slug as BookingServiceSlug,
    baseAmount:  d.baseAmount,
    baseLabel,
    options:     d.options,
    rates,
  });

  const { error: updErr } = await admin
    .from("bookings")
    .update({
      doc_mode:           d.options.docMode,
      pickup_lat:         d.options.pickup.lat,
      pickup_lng:         d.options.pickup.lng,
      pickup_address:     d.options.pickup.address || null,
      dropoff_lat:        d.options.dropoff.lat,
      dropoff_lng:        d.options.dropoff.lng,
      dropoff_address:    d.options.dropoff.address || null,
      estimate_total:     quote.total,
      estimate_breakdown: quote.rows,
    })
    .eq("id", d.bookingId);
  if (updErr) return { ok: false, error: updErr.message };

  const { error: delErr } = await admin
    .from("booking_options")
    .delete()
    .eq("booking_id", d.bookingId);
  if (delErr) return { ok: false, error: delErr.message };

  if (quote.optionInserts.length > 0) {
    const { error: optErr } = await admin
      .from("booking_options")
      .insert(
        quote.optionInserts.map((o) => ({ ...o, booking_id: d.bookingId })),
      );
    if (optErr) {
      logger.warn("bookings", "booking_options re-insert failed", {
        bookingId: redactId(d.bookingId),
        error:     optErr.message,
      });
    }
  }

  return { ok: true, data: { id: d.bookingId } };
}

// ════════════════════════════════════════════════════════════
// (3) submitBooking — auth-required, flips draft → submitted
// ════════════════════════════════════════════════════════════

/**
 * Customer presses "ยืนยันการจอง" on the review step. The booking flips
 * draft → submitted, binds profile_id (if not bound yet), assigns a
 * booking_no, spawns a work_item for the Sales desk + fires notifications.
 *
 * The work_item spawn and notification fan-out are best-effort: their
 * failure does NOT roll back the submit (the bookings row is the durable
 * record — the rep can be notified out-of-band if the rails are down).
 */
export async function submitBooking(
  input: SubmitBookingInput,
): Promise<ActionResult<SubmitBookingResult>> {
  const parsed = submitBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Auth-required — redirects to /login if no session (per requireAuth).
  const { user, profile } = await requireAuth();
  if (!profile) {
    return { ok: false, error: "profile_required" };
  }

  const admin = createAdminClient();

  const { data: existing, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, service_slug, profile_id, estimate_total")
    .eq("id", d.bookingId)
    .maybeSingle<{
      id:               string;
      status:           BookingStatus;
      service_slug:     string;
      profile_id:       string | null;
      estimate_total:   number;
    }>();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "booking_not_found" };
  if (existing.status !== "draft") return { ok: false, error: "booking_not_draft" };
  if (existing.profile_id && existing.profile_id !== user.id) {
    return { ok: false, error: "booking_not_yours" };
  }

  const serviceSlug = existing.service_slug as BookingServiceSlug;
  const cfg = getServiceConfig(serviceSlug);
  const serviceTitle = cfg?.titleTh ?? serviceSlug;

  // Assign booking_no — atomic via the security-definer fn.
  const { data: bookingNoData, error: noErr } = await admin.rpc("next_booking_no");
  if (noErr || typeof bookingNoData !== "string") {
    return { ok: false, error: `booking_no_failed: ${noErr?.message ?? "rpc"}` };
  }
  const bookingNo = bookingNoData;

  // Flip status + bind profile + contact snapshot.
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status:        "submitted",
      booking_no:    bookingNo,
      profile_id:    user.id,
      submitted_at:  new Date().toISOString(),
      contact_name:  d.contactName,
      contact_phone: digitsOnly(d.contactPhone).slice(0, 15),
      contact_line:  d.contactLine ?? null,
      customer_note: d.customerNote ?? null,
    })
    .eq("id", d.bookingId)
    .eq("status", "draft");
  if (updErr) return { ok: false, error: updErr.message };

  // ── Spawn work_item (best-effort) ──
  try {
    const priority = intakePriorityForService(serviceSlug);
    const title =
      `จองใหม่ · ${serviceTitle} · ฿${fmtThb(existing.estimate_total)} (ประมาณ)`;
    const { error: wiErr } = await admin.rpc("ensure_work_item", {
      p_entity_type:   "booking",
      p_entity_ref:    bookingNo,
      p_type:          "intake_review",
      p_title:         title,
      p_assigned_role: "sales_admin",
      p_priority:      priority,
      p_due_at:        null,
    });
    if (wiErr) {
      logger.warn("bookings", "ensure_work_item failed", {
        bookingNo, error: wiErr.message,
      });
    }
  } catch (e) {
    logger.warn("bookings", "ensure_work_item threw", {
      bookingNo, error: e instanceof Error ? e.message : "unknown",
    });
  }

  // ── Customer confirmation notification (best-effort) ──
  try {
    await sendNotification(user.id, {
      category:       "booking",
      severity:       "success",
      title:          "ได้รับการจองแล้ว",
      body:           `เลขที่จอง ${bookingNo} · ทีมขายจะติดต่อกลับเร็วๆ นี้`,
      link_href:      `/bookings/${bookingNo}`,
      reference_type: "booking",
      reference_id:   d.bookingId,
    });
  } catch (e) {
    logger.warn("bookings", "customer notify failed", {
      bookingNo, error: e instanceof Error ? e.message : "unknown",
    });
  }

  // ── Admin fan-out (best-effort — mirrors actions/contact.ts) ──
  try {
    const { data: targetAdmins, error: targetAdminsErr } = await admin
      .from("admins")
      .select("profile_id")
      .in("role", ["sales_admin", "ops", "super", "ultra"])
      .eq("is_active", true);
    if (targetAdminsErr) {
      console.error(`[admins list] failed`, { code: targetAdminsErr.code, message: targetAdminsErr.message });
    }

    const seen = new Set<string>();
    for (const row of targetAdmins ?? []) {
      const pid = (row as { profile_id: string }).profile_id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      await sendNotification(pid, {
        category:       "booking",
        severity:       "info",
        title:          `จองใหม่ · ${serviceTitle}`,
        body:           `฿${fmtThb(existing.estimate_total)} (ประมาณ) · ${d.contactName} ${d.contactPhone}`,
        link_href:      `/admin/bookings/${bookingNo}`,
        reference_type: "booking",
        reference_id:   d.bookingId,
      });
    }
  } catch (e) {
    logger.warn("bookings", "admin fan-out failed", {
      bookingNo, error: e instanceof Error ? e.message : "unknown",
    });
  }

  // Revalidate the affected portal lists (best-effort).
  try {
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingNo}`);
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/board");
  } catch { /* swallow */ }

  return { ok: true, data: { bookingId: d.bookingId, bookingNo } };
}

// ════════════════════════════════════════════════════════════
// (4) Customer read helpers
// ════════════════════════════════════════════════════════════

/**
 * List the signed-in customer's bookings — open statuses first, then
 * closed (won/lost/cancelled), each segment newest-first. Drafts are
 * EXCLUDED (the customer reaches an unfinished draft via its opaque
 * `?draft=<id>` link, not via the portal list).
 * RLS `bookings_customer_read` scopes the query to `auth.uid()`.
 */
export async function getMyBookings(): Promise<ActionResult<MyBookingSummary[]>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_no, status, service_slug, route_slug, transport_mode, " +
      "estimate_total, contact_name, contact_phone, contact_line, " +
      "customer_note, submitted_at, created_at, freight_quote_id, " +
      "estimate_breakdown, pickup_address, dropoff_address, doc_mode",
    )
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  // Order: open statuses (submitted/contacted/quoted) first, then closed.
  const closed = new Set<string>(["won", "lost", "cancelled"]);
  const rows = ((data ?? []) as unknown as MyBookingSummary[]).slice();
  rows.sort((a, b) => {
    const aClosed = closed.has(a.status);
    const bClosed = closed.has(b.status);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return b.created_at.localeCompare(a.created_at);
  });

  return { ok: true, data: rows };
}

/**
 * One booking by booking_no (the BKYYMMDD-NNNN id). RLS scopes it to the
 * owner. Returns `not_found` for any miss (including not-yours).
 */
export async function getMyBookingByNo(
  bookingNo: string,
): Promise<ActionResult<MyBookingSummary>> {
  if (!bookingNo || typeof bookingNo !== "string" || bookingNo.length > 32) {
    return { ok: false, error: "invalid_booking_no" };
  }

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_no, status, service_slug, route_slug, transport_mode, " +
      "estimate_total, contact_name, contact_phone, contact_line, " +
      "customer_note, submitted_at, created_at, freight_quote_id, " +
      "estimate_breakdown, pickup_address, dropoff_address, doc_mode",
    )
    .eq("booking_no", bookingNo)
    .maybeSingle<MyBookingSummary>();

  if (error) return { ok: false, error: error.message };
  if (dataErr) {
    console.error(`[supabase mutation lookup] failed`, { code: dataErr.code, message: dataErr.message });
    return { ok: false, error: `db_error:${dataErr.code ?? "unknown"}` };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, data };
}

/**
 * Pre-bind draft read for `/book-start` — looks up a draft by id via the
 * admin client so a guest (anon) can resolve where to route (which
 * service/route URL to redirect into) even before the auth gate binds the
 * profile_id. The action returns ONLY route info — no PII.
 */
export async function getBookingDraftRoute(
  draftId: string,
): Promise<ActionResult<DraftRouteInfo>> {
  if (!draftId) return { ok: false, error: "invalid_draft_id" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select("id, status, service_slug, route_slug, profile_id")
    .eq("id", draftId)
    .maybeSingle<DraftRouteInfo>();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, data };
}

// ════════════════════════════════════════════════════════════
// BK-1.5 (G1) — booking attachment upload / list / remove
// ════════════════════════════════════════════════════════════
// Per design [docs/research/booking-flow-system-2026-05-18.md] §6.2:
//   "a booking's uploads are documents rows tagged with the booking_id,
//    RLS owner-only."
//
// Storage layout under the existing private bucket `member-docs`:
//   member-docs/{user_id}/booking/{booking_id}/{kind}-{ts}-{filename}
//
// All 3 actions are auth-required (uploads happen at the REVIEW step —
// after the auth gate has bound profile_id).  This keeps the design
// simpler than the "anon-uploads-into-temp-prefix + re-key on submit"
// pattern §6.2 mentions as an option.

const VALID_DOC_KINDS: readonly BookingDocKind[] = [
  "booking_invoice",
  "booking_packing_list",
  "booking_certificate",
  "booking_vat_paw20",
  "booking_national_id",
  "booking_passport",
] as const;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"] as const;
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const SIGNED_URL_TTL_SECS = 60 * 60; // 1 hour

function isAllowedMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function sanitiseFilename(name: string): string {
  // Strip path components + restrict to a safe set.  Storage key has its
  // own server-controlled prefix so this is defence-in-depth.
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 100);
}

/**
 * Upload a single file as a booking attachment.  Auth-required.
 *
 * Verifies the customer owns the booking before writing storage / inserting
 * the documents row — the RLS floor covers it too, but the early ownership
 * check gives a clearer error than RLS denial.
 */
export async function uploadBookingDocument(
  bookingId: string,
  kind: BookingDocKind,
  file: File,
): Promise<ActionResult<BookingDocument>> {
  // 1) Auth
  const { profile } = await requireAuth();
  if (!profile) return { ok: false, error: "auth_required" };

  // 2) Input validation
  if (!bookingId || typeof bookingId !== "string") {
    return { ok: false, error: "invalid_booking_id" };
  }
  if (!VALID_DOC_KINDS.includes(kind)) {
    return { ok: false, error: "invalid_doc_kind" };
  }
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "no_file" };
  }
  if (file.size <= 0) return { ok: false, error: "empty_file" };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `file_too_large_max_${MAX_UPLOAD_BYTES}` };
  }
  if (!isAllowedMime(file.type)) {
    return { ok: false, error: `unsupported_mime:${file.type || "unknown"}` };
  }

  // 3) Ownership check on the booking
  const admin = createAdminClient();
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, profile_id, booking_no, status")
    .eq("id", bookingId)
    .maybeSingle<{ id: string; profile_id: string | null; booking_no: string | null; status: string }>();
  if (bookingErr) return { ok: false, error: `booking_read_failed: ${bookingErr.message}` };
  if (!booking) return { ok: false, error: "booking_not_found" };
  if (booking.profile_id !== profile.id) {
    return { ok: false, error: "forbidden_not_owner" };
  }
  // Terminal bookings shouldn't get new attachments.
  if (booking.status === "won" || booking.status === "lost" || booking.status === "cancelled") {
    return { ok: false, error: `booking_terminal:${booking.status}` };
  }

  // 4) Build the storage key + upload
  const safeName = sanitiseFilename(file.name || "file");
  const ts = Date.now();
  const storagePath = `${profile.id}/booking/${booking.id}/${kind}-${ts}-${safeName}`;

  const supabase = await createClient();
  const bytes = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from("member-docs")
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) return { ok: false, error: `upload_failed: ${upErr.message}` };

  // 5) Insert the documents row (admin client — we already verified ownership)
  const { data: inserted, error: insErr } = await admin
    .from("documents")
    .insert({
      profile_id:   profile.id,
      booking_id:   booking.id,
      doc_type:     kind,
      storage_path: storagePath,
      mime_type:    file.type,
      size_bytes:   file.size,
    })
    .select("id, doc_type, storage_path, mime_type, size_bytes, uploaded_at")
    .single<{
      id: string;
      doc_type: BookingDocKind;
      storage_path: string;
      mime_type: string | null;
      size_bytes: number | null;
      uploaded_at: string;
    }>();
  if (insErr || !inserted) {
    // Best-effort: orphan storage cleanup (the insert failed so the
    // file would otherwise hang around).
    try {
      await supabase.storage.from("member-docs").remove([storagePath]);
    } catch {
      logger.warn("booking", "orphan storage cleanup failed", {
        bookingId: redactId(booking.id),
        storagePath,
      });
    }
    return { ok: false, error: `db_insert_failed: ${insErr?.message ?? "unknown"}` };
  }

  // 6) Sign a download URL for the caller
  const { data: signed } = await supabase.storage
    .from("member-docs")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECS);

  // 7) Revalidate the customer + admin views that show docs
  if (booking.booking_no) {
    revalidatePath(`/bookings/${booking.booking_no}`);
    revalidatePath(`/admin/bookings/${booking.booking_no}`);
  }

  return {
    ok: true,
    data: {
      id:          inserted.id,
      bookingId:   booking.id,
      kind:        inserted.doc_type,
      storagePath: inserted.storage_path,
      mimeType:    inserted.mime_type,
      sizeBytes:   inserted.size_bytes,
      uploadedAt:  inserted.uploaded_at,
      signedUrl:   signed?.signedUrl ?? null,
    },
  };
}

/**
 * Remove a booking attachment (storage file + DB row).  Auth-required.
 */
export async function removeBookingDocument(
  documentId: string,
): Promise<ActionResult<{ removed: true }>> {
  const { profile } = await requireAuth();
  if (!profile) return { ok: false, error: "auth_required" };

  if (!documentId || typeof documentId !== "string") {
    return { ok: false, error: "invalid_document_id" };
  }

  const admin = createAdminClient();
  const { data: doc, error: readErr } = await admin
    .from("documents")
    .select("id, profile_id, booking_id, storage_path")
    .eq("id", documentId)
    .maybeSingle<{
      id: string;
      profile_id: string;
      booking_id: string | null;
      storage_path: string;
    }>();
  if (readErr) return { ok: false, error: `read_failed: ${readErr.message}` };
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.profile_id !== profile.id) {
    return { ok: false, error: "forbidden_not_owner" };
  }
  if (!doc.booking_id) {
    // Not a booking attachment — refuse (juristic docs are managed elsewhere).
    return { ok: false, error: "not_a_booking_document" };
  }

  // Best-effort storage delete first (DB row is the canonical record;
  // a dangling storage object is worse than a dangling DB row).
  const supabase = await createClient();
  const { error: storageErr } = await supabase.storage
    .from("member-docs")
    .remove([doc.storage_path]);
  if (storageErr) {
    logger.warn("booking", "storage delete failed (continuing)", {
      docId: redactId(doc.id),
      error: storageErr.message,
    });
  }

  const { error: delErr } = await admin
    .from("documents")
    .delete()
    .eq("id", doc.id);
  if (delErr) return { ok: false, error: `db_delete_failed: ${delErr.message}` };

  // Revalidate the surfaces.
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("booking_no")
    .eq("id", doc.booking_id)
    .maybeSingle<{ booking_no: string | null }>();
  if (bookingErr) {
    console.error(`[bookings list] failed`, { code: bookingErr.code, message: bookingErr.message });
  }
  if (booking?.booking_no) {
    revalidatePath(`/bookings/${booking.booking_no}`);
    revalidatePath(`/admin/bookings/${booking.booking_no}`);
  }

  return { ok: true, data: { removed: true } };
}

/**
 * List all attachments for a booking.  Auth-required.
 *
 * Admins see attachments for ANY booking; customers see attachments for own
 * bookings only — explicit ownership check up front + admin role lookup
 * (so callers don't need to branch).  Returns each document with a
 * freshly-signed download URL.
 */
export async function listBookingDocuments(
  bookingId: string,
): Promise<ActionResult<{ documents: BookingDocument[] }>> {
  const { profile } = await requireAuth();
  if (!profile) return { ok: false, error: "auth_required" };

  if (!bookingId || typeof bookingId !== "string") {
    return { ok: false, error: "invalid_booking_id" };
  }

  const admin = createAdminClient();
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("profile_id")
    .eq("id", bookingId)
    .maybeSingle<{ profile_id: string | null }>();
  if (bookingErr) {
    console.error(`[bookings mutation lookup] failed`, { code: bookingErr.code, message: bookingErr.message });
    return { ok: false, error: `db_error:${bookingErr.code ?? "unknown"}` };
  }
  if (!booking) return { ok: false, error: "booking_not_found" };

  const isOwner = booking.profile_id === profile.id;
  let isAdmin = false;
  if (!isOwner) {
    const { data: adminRow, error: adminRowErr } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", profile.id)
      .maybeSingle<{ role: string }>();
    if (adminRowErr) {
      console.error(`[admins list] failed`, { code: adminRowErr.code, message: adminRowErr.message });
    }
    isAdmin = !!adminRow && ["super", "ops", "sales_admin", "accounting"].includes(adminRow.role);
  }
  if (!isOwner && !isAdmin) return { ok: false, error: "forbidden" };

  const { data: docs, error: listErr } = await admin
    .from("documents")
    .select("id, booking_id, doc_type, storage_path, mime_type, size_bytes, uploaded_at")
    .eq("booking_id", bookingId)
    .order("uploaded_at", { ascending: true })
    .returns<Array<{
      id: string;
      booking_id: string;
      doc_type: BookingDocKind;
      storage_path: string;
      mime_type: string | null;
      size_bytes: number | null;
      uploaded_at: string;
    }>>();
  if (listErr) return { ok: false, error: `list_failed: ${listErr.message}` };

  // Sign each storage path via the admin storage client (avoids needing
  // user-bound auth on the storage layer; admin policies are unrestricted).
  const documents: BookingDocument[] = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data: signed } = await admin.storage
        .from("member-docs")
        .createSignedUrl(d.storage_path, SIGNED_URL_TTL_SECS);
      return {
        id:          d.id,
        bookingId:   d.booking_id,
        kind:        d.doc_type,
        storagePath: d.storage_path,
        mimeType:    d.mime_type,
        sizeBytes:   d.size_bytes,
        uploadedAt:  d.uploaded_at,
        signedUrl:   signed?.signedUrl ?? null,
      };
    }),
  );

  return { ok: true, data: { documents } };
}
