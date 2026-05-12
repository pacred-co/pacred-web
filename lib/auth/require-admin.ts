import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithProfile, type Profile } from "./get-user";
import type { User } from "@supabase/supabase-js";

export type AdminProfile = Profile & { role: "admin" | "staff" | null };

export async function requireAdmin(): Promise<{
  user: User;
  profile: AdminProfile;
}> {
  const data = await getCurrentUserWithProfile();
  if (!data?.user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, role")
    .eq("id", data.user.id)
    .maybeSingle<AdminProfile>();

  if (!profile || profile.role !== "admin") redirect("/");

  return { user: data.user, profile };
}
