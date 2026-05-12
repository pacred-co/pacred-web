"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addressSchema, type AddressInput } from "@/lib/validators/addresses";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type Address = {
  id: string;
  profile_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone2: string | null;
  address_line: string;
  sub_district: string;
  district: string;
  province: string;
  postal_code: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// ────────────────────────────────────────────────────────────
// LIST — active only
// ────────────────────────────────────────────────────────────
export async function listAddresses(): Promise<ActionResult<Address[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Address[] };
}

// ────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────
export async function createAddress(
  input: AddressInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // If user wants this row to be default, clear any existing default first
  // (the unique partial index would reject otherwise).
  if (d.is_default) {
    await supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("profile_id", user.id)
      .eq("is_default", true)
      .is("deleted_at", null);
  }

  const { data: created, error } = await supabase
    .from("addresses")
    .insert({
      profile_id:   user.id,
      first_name:   d.first_name,
      last_name:    d.last_name,
      phone:        d.phone,
      phone2:       d.phone2 ?? null,
      address_line: d.address_line,
      sub_district: d.sub_district,
      district:     d.district,
      province:     d.province,
      postal_code:  d.postal_code,
      note:         d.note ?? null,
      latitude:     d.latitude ?? null,
      longitude:    d.longitude ?? null,
      is_default:   d.is_default ?? false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/addresses");
  return { ok: true, data: { id: created.id } };
}

// ────────────────────────────────────────────────────────────
// UPDATE
// ────────────────────────────────────────────────────────────
export async function updateAddress(
  id: string,
  input: AddressInput,
): Promise<ActionResult> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Same default-uniqueness handling as create
  if (d.is_default) {
    await supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("profile_id", user.id)
      .eq("is_default", true)
      .is("deleted_at", null)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("addresses")
    .update({
      first_name:   d.first_name,
      last_name:    d.last_name,
      phone:        d.phone,
      phone2:       d.phone2 ?? null,
      address_line: d.address_line,
      sub_district: d.sub_district,
      district:     d.district,
      province:     d.province,
      postal_code:  d.postal_code,
      note:         d.note ?? null,
      latitude:     d.latitude ?? null,
      longitude:    d.longitude ?? null,
      is_default:   d.is_default ?? false,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/addresses");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// SET DEFAULT — promote a specific address to default
// ────────────────────────────────────────────────────────────
export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Clear current default(s)
  await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("profile_id", user.id)
    .eq("is_default", true)
    .is("deleted_at", null);

  // Set new default — DB CHECK constraint rejects soft-deleted rows
  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/addresses");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// SOFT DELETE — set deleted_at (RLS allows update, blocks DELETE)
// ────────────────────────────────────────────────────────────
export async function softDeleteAddress(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // If deleting the default, the next active address auto-promotes via trigger
  const { error } = await supabase
    .from("addresses")
    .update({ deleted_at: new Date().toISOString(), is_default: false })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/addresses");
  return { ok: true };
}
