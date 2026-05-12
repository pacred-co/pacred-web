import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/auto-cancel-orders
 *
 * Cancels service_orders where status='awaiting_payment' AND
 * payment_due_at < now(). Mirrors the legacy auto-cancel rule from
 * pcscargo (hStatus=2 AND hDatePayment<NOW() → hStatus=6).
 *
 * Schedule via vercel.json:
 *   { "crons": [{ "path": "/api/cron/auto-cancel-orders", "schedule": "*\/15 * * * *" }] }
 *
 * Authentication: in production Vercel attaches an x-vercel-cron header
 * to scheduled requests; we additionally require CRON_SECRET as a
 * defense-in-depth check that protects against accidental exposure.
 */
export async function GET(request: Request) {
  // Defense-in-depth: require a shared secret from Vercel cron config
  const authHeader = request.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso   = new Date().toISOString();

  // Find candidates first so we can report numbers; using service-role
  // client bypasses RLS (admin scope).
  const { data: candidates, error: selErr } = await supabase
    .from("service_orders")
    .select("id, h_no")
    .eq("status", "awaiting_payment")
    .lt("payment_due_at", nowIso);

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, cancelled: 0 });
  }

  const ids = candidates.map((r) => r.id);
  const { error: updErr } = await supabase
    .from("service_orders")
    .update({ status: "cancelled" })
    .in("id", ids);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cancelled: candidates.length,
    h_nos: candidates.map((r) => r.h_no),
    ran_at: nowIso,
  });
}
