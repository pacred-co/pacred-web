"use server";

/**
 * Demo: Orders Server Actions.
 *
 * Pattern reference for future systems:
 *   1. Auth check (createClient → getUser)
 *   2. Validate (Zod schema)
 *   3. Mutate (RLS policies enforce ownership at DB level)
 *   4. Return ActionResult<T>
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validators/orders";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type Order = {
  id: string;
  user_id: string;
  service_type: string;
  origin: string | null;
  destination: string | null;
  description: string | null;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  created_at: string;
  updated_at: string;
};

export async function listOrders(): Promise<ActionResult<Order[]>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Order[] };
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: created, error } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      service_type: data.serviceType,
      origin: data.origin ?? null,
      destination: data.destination ?? null,
      description: data.description,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/orders");
  return { ok: true, data: { id: created.id } };
}
