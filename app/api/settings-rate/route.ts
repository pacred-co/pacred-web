import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings-rate → { yuan_rate, service_fee }
 *
 * Authenticated read of the public settings row used by client code
 * (variant grid, cart preview) to display live conversions before
 * the user submits. The server actions read the same row again at
 * submit time — this endpoint is for display only.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ yuan_rate: 5, service_fee: 50 }, { status: 401 });
  }
  const { data } = await supabase
    .from("settings")
    .select("yuan_rate, service_fee")
    .eq("id", 1)
    .maybeSingle<{ yuan_rate: number; service_fee: number }>();
  return NextResponse.json({
    yuan_rate:   Number(data?.yuan_rate ?? 5),
    service_fee: Number(data?.service_fee ?? 50),
  });
}
