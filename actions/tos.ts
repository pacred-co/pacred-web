"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_TOS_VERSION } from "@/lib/tos";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function acceptCurrentTos(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("profiles")
    .update({
      tos_accepted_version: CURRENT_TOS_VERSION,
      tos_accepted_at:      new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    // PostgREST returns this when migration 0006 hasn't run yet
    if (error.message?.includes("schema cache") || error.message?.includes("tos_accepted")) {
      return { ok: false, error: "ระบบยังไม่พร้อม — โปรดให้แอดมินรัน migration ของฐานข้อมูลก่อน (supabase/migrations/0006_tos_acceptance.sql)" };
    }
    return { ok: false, error: error.message };
  }

  // Revalidate everything under (protected) since the gate component
  // lives in the layout
  revalidatePath("/", "layout");
  return { ok: true };
}
