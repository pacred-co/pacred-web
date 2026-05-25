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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) {
    return NextResponse.json({ yuan_rate: 5, service_fee: 50 }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("settings")
    .select("yuan_rate, service_fee")
    .eq("id", 1)
    .maybeSingle<{ yuan_rate: number; service_fee: number }>();
  if (error) {
    console.error(`[settings list] failed`, { code: error.code, message: error.message });
  }
  return NextResponse.json({
    yuan_rate:   Number(data?.yuan_rate ?? 5),
    service_fee: Number(data?.service_fee ?? 50),
  });
}
