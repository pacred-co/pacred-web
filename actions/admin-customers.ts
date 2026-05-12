"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveCustomer(id: string): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: "active" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/customers");
  revalidatePath("/admin/customers/pending");
  revalidatePath(`/admin/customers/${id}`);
  return { ok: true };
}

export async function suspendCustomer(id: string): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: "suspended" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  return { ok: true };
}
