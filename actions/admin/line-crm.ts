"use server";

/**
 * Admin LINE inbox — CRM mutation + snapshot actions (Task 3 · ปอน · 2026-06-02).
 *
 * The read-only inbox (`line-inbox.ts`) shows the conversation; these actions
 * turn it into a working CRM:
 *   - assignLineAgent       — route a contact to a CS/sales agent (internal write)
 *   - linkLineContactToMember / unlinkLineContact — tie a LINE contact to a
 *     real `tb_users` (PR) account so the agent sees wallet/shipments in-chat
 *     (the owner's "ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover")
 *   - getMemberSnapshotForChat — the read-only tb_* snapshot for the link card
 *
 * SAFE BY DESIGN — every write here is INTERNAL (a Podeng_* column update) or a
 * READ of tb_*. There is NO outbound LINE message send in this file: replying
 * to a customer has a real external side-effect AND depends on the
 * webhook-consolidation gate (P0-3 / G-15 · Podeng_* vs repo 0131) being
 * settled with เดฟ/ก๊อต first — deferred, see the gated reply box in the UI.
 *
 * All writes go through createAdminClient() (Podeng_* + tb_* are service-role)
 * and are admin-gated (requireAdmin + the (admin) layout guard).
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CsAgent, MemberChatSnapshot } from "@/lib/admin/line-inbox-types";

const CUSTOMERS_TABLE = "Podeng_customers_line";
const AGENTS_TABLE = "Podeng_cs_agents";

/** Active CS/sales agents for the assign dropdown. */
export async function getLineCsAgents(): Promise<CsAgent[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(AGENTS_TABLE)
    .select("id, agent_code, display_name, role, is_active")
    .eq("is_active", true)
    .order("display_name", { ascending: true });
  if (error) {
    console.error("[line-crm agents] failed", { code: error.code, message: error.message });
    throw new Error("Failed to load CS agents");
  }
  return (data ?? []) as unknown as CsAgent[];
}

/** Back to the open thread after a mutation (keep ?c=<id> so the panel stays). */
function backToThread(customerLineId: string): never {
  revalidatePath("/admin/line-inbox");
  redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}`);
}

/** Assign (or clear, when agentId is empty) the CS agent for a contact. */
export async function assignLineAgent(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerLineId = String(formData.get("customerLineId") ?? "").trim();
  const agentIdRaw = String(formData.get("agentId") ?? "").trim();
  if (!customerLineId) redirect("/admin/line-inbox");

  const admin = createAdminClient();
  const { error } = await admin
    .from(CUSTOMERS_TABLE)
    .update({ assigned_agent_id: agentIdRaw === "" ? null : agentIdRaw })
    .eq("id", customerLineId);
  if (error) {
    console.error("[line-crm assignAgent] failed", { customerLineId, code: error.code, message: error.message });
    redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}&crmError=assign`);
  }
  backToThread(customerLineId);
}

/** Link a LINE contact to a tb_users PR account (verified to exist first). */
export async function linkLineContactToMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerLineId = String(formData.get("customerLineId") ?? "").trim();
  const memberCode = String(formData.get("memberCode") ?? "").trim().toUpperCase();
  if (!customerLineId) redirect("/admin/line-inbox");
  if (!memberCode) {
    redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}&crmError=nocode`);
  }

  const admin = createAdminClient();

  // Verify the PR account exists before linking (no dangling codes).
  const { data: user, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userTel")
    .eq("userID", memberCode)
    .maybeSingle<{ userID: string; userTel: string | null }>();
  if (userErr) {
    console.error("[line-crm link:userlookup] failed", { code: userErr.code, message: userErr.message });
    redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}&crmError=assign`);
  }
  if (!user) {
    redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}&crmError=notfound`);
  }

  // Set customer_code; backfill phone from tb_users only when the contact has none.
  const patch: { customer_code: string; phone?: string } = { customer_code: memberCode };
  if (user.userTel) patch.phone = user.userTel;

  const { error } = await admin.from(CUSTOMERS_TABLE).update(patch).eq("id", customerLineId);
  if (error) {
    console.error("[line-crm link] failed", { customerLineId, code: error.code, message: error.message });
    redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}&crmError=assign`);
  }
  backToThread(customerLineId);
}

/** Clear the member link. */
export async function unlinkLineContact(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerLineId = String(formData.get("customerLineId") ?? "").trim();
  if (!customerLineId) redirect("/admin/line-inbox");

  const admin = createAdminClient();
  const { error } = await admin
    .from(CUSTOMERS_TABLE)
    .update({ customer_code: null })
    .eq("id", customerLineId);
  if (error) {
    console.error("[line-crm unlink] failed", { customerLineId, code: error.code, message: error.message });
    redirect(`/admin/line-inbox?c=${encodeURIComponent(customerLineId)}&crmError=assign`);
  }
  backToThread(customerLineId);
}

/**
 * Read-only snapshot of the linked tb_users account — wallet balance + shipment
 * counts — for the in-chat "ลูกค้าในระบบ" card. Returns null if the code has no
 * matching account (the link UI then offers to re-link).
 */
export async function getMemberSnapshotForChat(
  memberCode: string,
): Promise<MemberChatSnapshot | null> {
  await requireAdmin();
  const code = (memberCode ?? "").trim();
  if (!code) return null;

  const admin = createAdminClient();
  const [userRes, walletRes, fwdTotalRes, fwdActiveRes] = await Promise.all([
    admin.from("tb_users").select("userID, userName, userTel").eq("userID", code).maybeSingle<{
      userID: string;
      userName: string | null;
      userTel: string | null;
    }>(),
    admin.from("tb_wallet").select("wallettotal").eq("userid", code).maybeSingle<{
      wallettotal: number | string | null;
    }>(),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("userid", code),
    admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("userid", code)
      .neq("fstatus", "7"),
  ]);

  if (userRes.error) {
    console.error("[line-crm snapshot:user] failed", { code: userRes.error.code, message: userRes.error.message });
    return null;
  }
  if (!userRes.data) return null;
  if (walletRes.error) {
    console.error("[line-crm snapshot:wallet] failed", { code: walletRes.error.code, message: walletRes.error.message });
  }
  if (fwdTotalRes.error) {
    console.error("[line-crm snapshot:fwd] failed", { code: fwdTotalRes.error.code, message: fwdTotalRes.error.message });
  }

  return {
    memberCode: userRes.data.userID,
    name: userRes.data.userName,
    tel: userRes.data.userTel,
    walletTotal: Number(walletRes.data?.wallettotal ?? 0) || 0,
    forwarderTotal: fwdTotalRes.count ?? 0,
    forwarderInTransit: fwdActiveRes.count ?? 0,
  };
}
