"use server";

/**
 * ย้อนการชำระ "ทั้งชุด" ของสลิปรวม (owner 2026-07-28 · เคสจริง PR189).
 *
 * ── ทำไมต้องมี ─────────────────────────────────────────────────────────────
 * ลูกค้าโอน **สลิปใบเดียว** ครอบหลายออเดอร์ (1 ชิปเม้น = หลายแทรคกิ้ง) → ระบบเขียนเป็น
 * "ชุด": header (type='1' ถือสลิป+ยอดรวม) + children (type='4' ต่อออเดอร์ ·
 * reforder2→header) + สะพาน tb_wallet_paydeposit. `adminReverseForwarderPayment`
 * (ตัวเดี่ยว) ปฏิเสธชุดพวกนี้โดยดีไซน์ (ย้อนทีละใบ = คืนเงินผิดชุด) — แต่เดิม **ไม่มีปุ่ม
 * ย้อนทั้งชุดเลย** ทำให้เคส "บันทึกผิด/ออกเอกสารผิด" ต้องเรียกเทคนิคมารันสคริปต์
 * (scripts/reverse-payment-group-106474-2026-07-28.mjs = แม่แบบของ action นี้ ·
 * รันสำเร็จบน prod แล้ว 1 ชุด). owner: "พนักงานทำงานได้ ลูกค้าใช้งานได้ on prod ได้อุ่นใจ".
 *
 * ── กติกาเงิน (V1 · เสี่ยงต่ำก่อน) ───────────────────────────────────────────
 * รองรับเฉพาะชุดที่ **โอนตรงธนาคาร** (depositnamebank = 'KBANK-…' ฯลฯ) — การย้อน
 * ไม่ขยับเงินเลย (เงินอยู่ในบัญชีบริษัทตามสลิปเหมือนเดิม แค่ยกเลิก "การบันทึก" เพื่อ
 * บันทึกใหม่ให้ถูก). ชุดที่ตัดจากกระเป๋า (WALLET) / เครดิต → REFUSE ชี้ไปทางบัญชี
 * (ต้องมี logic คืนเงิน/คืนวงเงิน — ทำแยกเมื่อ owner เคาะ).
 *
 * Mirror guard ทุกตัวจาก adminReverseForwarderPayment: fstatus>=7 refuse ·
 * คนขับออกรถแล้ว refuse · ATOMIC CLAIM header ก่อน (single winner) · TOCTOU ทุก write ·
 * void ใบเสร็จเฉพาะใบที่ครอบด้วย fid ในชุดนี้ทั้งหมด (ใบที่แชร์กับออเดอร์นอกชุด = ไม่แตะ).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { assertNoDriverEnRoute, removeOpenDriverStops } from "@/lib/admin/revert-driver-cleanup";
import { MAO_FLAT_FEE } from "@/lib/forwarder/mao-fee";

// ── local resolveLegacyAdminId (แพทเทิร์นเดียวกับ pay-user.ts/forwarder-cost.ts) ──
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error(`[group-reverse resolveLegacyAdminId auth] failed`, { code: error.code, message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error(`[group-reverse resolveLegacyAdminId tb_admin] failed`, { code: aErr.code, message: aErr.message });
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20);
}

type GroupMember = {
  payId: number;
  fid: number;
  amount: number;
  tracking: string;
  fstatus: string;
};

export type ReverseGroupPreview = {
  /** 'single' = ไม่ใช่ชุดรวม → ใช้ปุ่มย้อนตัวเดี่ยวเดิม. */
  kind: "single" | "group";
  headerId?: number;
  headerAmount?: number;
  /** สลิปเข้าบัญชีไหน — WALLET = ชุดที่ V1 ไม่รองรับ. */
  fundedBy?: string;
  members?: GroupMember[];
  /** null = ย้อนได้ · ไม่ null = เหตุที่ย้อนไม่ได้ (ภาษาคน + ทางออก). */
  blockReason?: string | null;
};

const previewSchema = z.object({ fid: z.coerce.number().int().positive() });

/**
 * พรีวิวชุดการชำระของออเดอร์นี้ — READ-ONLY. ปุ่มย้อนเรียกก่อนเสมอ เพื่อโชว์
 * ให้เจ้าหน้าที่เห็น "ทั้งชุดมีใครบ้าง ยอดรวมเท่าไร" ก่อนยืนยัน (§0f).
 */
export async function previewReversePaymentGroup(
  input: unknown,
): Promise<AdminActionResult<ReverseGroupPreview>> {
  return withAdmin<ReverseGroupPreview>(["super", "accounting"], async () => {
    const parsed = previewSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const fid = parsed.data.fid;
    const admin = createAdminClient();

    // settled funding row ของ fid นี้ (ตัวเดียวกับที่ single reverse หา)
    const { data: fundingRows, error: pErr } = await admin
      .from("tb_wallet_hs")
      .select("id, amount, depositnamebank, reforder2, wusercredit")
      .eq("reforder", String(fid))
      .eq("typeservice", "2")
      .in("typenew", ["5", "6"])
      .eq("status", "2")
      .order("id", { ascending: false })
      .limit(1);
    if (pErr) {
      console.error(`[previewReversePaymentGroup funding] failed`, { code: pErr.code, message: pErr.message, fid });
      return { ok: false, error: `db_error:${pErr.code ?? "unknown"}` };
    }
    const funding = (fundingRows ?? [])[0] as
      | { id: number; amount: number | string | null; depositnamebank: string | null; reforder2: number | string | null; wusercredit: string | null }
      | undefined;
    if (!funding) {
      return { ok: false, error: `ไม่พบรายการชำระที่ตัดจ่ายแล้วสำหรับออเดอร์ #${fid} (อาจย้อนไปแล้ว — โปรดรีเฟรช)` };
    }

    // หา header ของชุด: reforder2 บนแถวจ่าย → ไม่มีก็ลองสะพาน paydeposit
    let headerId = Number(String(funding.reforder2 ?? "").trim() || 0);
    if (!headerId) {
      const { data: link, error: linkErr } = await admin
        .from("tb_wallet_paydeposit").select("whid").eq("hno", String(fid))
        .limit(1).maybeSingle<{ whid: number | null }>();
      if (linkErr) console.error(`[previewReversePaymentGroup paydeposit] failed`, { code: linkErr.code, message: linkErr.message, fid });
      headerId = Number(link?.whid ?? 0);
    }
    if (!headerId) return { ok: true, data: { kind: "single" } };

    const { data: header, error: hErr } = await admin
      .from("tb_wallet_hs")
      .select("id, userid, amount, status, depositnamebank")
      .eq("id", headerId)
      .maybeSingle<{ id: number; userid: string | null; amount: number | string | null; status: string | null; depositnamebank: string | null }>();
    if (hErr) {
      console.error(`[previewReversePaymentGroup header] failed`, { code: hErr.code, message: hErr.message, headerId });
      return { ok: false, error: `db_error:${hErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: `ไม่พบหัวชุดการชำระ #${headerId}` };

    const g = await loadGroup(admin, headerId);
    if ("error" in g) return { ok: false, error: g.error };

    const fundedBy = (header.depositnamebank ?? "").trim();
    let blockReason: string | null = null;
    if ((header.status ?? "") !== "2") blockReason = `ชุด #${headerId} ถูกย้อนไปแล้ว (โปรดรีเฟรช)`;
    else if (fundedBy.toUpperCase() === "WALLET" || (funding.wusercredit ?? "").trim() === "1")
      blockReason = "ชุดนี้ตัดจากกระเป๋า/เครดิต — ต้องคืนเงิน/คืนวงเงิน ให้ฝ่ายบัญชีดำเนินการ (ยังไม่เปิดย้อนอัตโนมัติ)";
    else if (g.members.some((m) => Number(m.fstatus) >= 7))
      blockReason = `มีออเดอร์ในชุดที่จัดส่ง/สำเร็จแล้ว (${g.members.filter((m) => Number(m.fstatus) >= 7).map((m) => `#${m.fid}`).join(", ")}) — ย้อนไม่ได้`;

    return {
      ok: true,
      data: {
        kind: "group",
        headerId,
        headerAmount: Math.round(Number(header.amount ?? 0) * 100) / 100,
        fundedBy,
        members: g.members,
        blockReason,
      },
    };
  });
}

/** โหลดสมาชิกชุด: children (reforder2=header) + fid จากสะพาน paydeposit. */
async function loadGroup(
  admin: ReturnType<typeof createAdminClient>,
  headerId: number,
): Promise<{ members: GroupMember[]; childIds: number[]; linkIds: number[] } | { error: string }> {
  const { data: children, error: cErr } = await admin
    .from("tb_wallet_hs")
    .select("id, amount, status, reforder")
    .eq("reforder2", headerId)
    .eq("status", "2");
  if (cErr) {
    console.error(`[group-reverse loadGroup children] failed`, { code: cErr.code, message: cErr.message, headerId });
    return { error: `db_error:${cErr.code ?? "unknown"}` };
  }
  const { data: links, error: lErr } = await admin
    .from("tb_wallet_paydeposit")
    .select("id, hno")
    .eq("whid", headerId);
  if (lErr) {
    console.error(`[group-reverse loadGroup links] failed`, { code: lErr.code, message: lErr.message, headerId });
    return { error: `db_error:${lErr.code ?? "unknown"}` };
  }

  const fids = [...new Set([
    ...((children ?? []) as Array<{ reforder: string | null }>).map((c) => Number(String(c.reforder ?? "").trim())).filter((n) => n > 0),
    ...((links ?? []) as Array<{ hno: string | null }>).map((l) => Number(String(l.hno ?? "").trim())).filter((n) => n > 0),
  ])];
  if (fids.length === 0) return { error: `ชุด #${headerId} ไม่มีออเดอร์ลูก — ข้อมูลผิดรูป แจ้งทีมเทคนิคพร้อมเลขชุดนี้` };

  const { data: fwds, error: fErr } = await admin
    .from("tb_forwarder")
    .select("id, fstatus, ftrackingchn, ftotalprice, ftransportprice, fshipby")
    .in("id", fids);
  if (fErr) {
    console.error(`[group-reverse loadGroup forwarders] failed`, { code: fErr.code, message: fErr.message, headerId });
    return { error: `db_error:${fErr.code ?? "unknown"}` };
  }
  const byFid = new Map(((fwds ?? []) as Array<{ id: number; fstatus: string | null; ftrackingchn: string | null }>).map((f) => [f.id, f]));
  const payByFid = new Map(((children ?? []) as Array<{ id: number; amount: number | string | null; reforder: string | null }>)
    .map((c) => [Number(String(c.reforder ?? "").trim()), c]));

  const members: GroupMember[] = fids.map((fid) => {
    const f = byFid.get(fid);
    const c = payByFid.get(fid);
    return {
      payId: c?.id ?? 0,
      fid,
      amount: Math.round(Number(c?.amount ?? 0) * 100) / 100,
      tracking: (f?.ftrackingchn ?? "").trim() || "—",
      fstatus: (f?.fstatus ?? "").trim(),
    };
  });
  return {
    members,
    childIds: ((children ?? []) as Array<{ id: number }>).map((c) => c.id),
    linkIds: ((links ?? []) as Array<{ id: number }>).map((l) => l.id),
  };
}

const reverseSchema = z.object({
  headerId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(300).optional(),
});

export type ReverseGroupResult = {
  reversedPayRows: number;
  fids: number[];
  receiptsVoided: string[];
};

/**
 * ย้อนทั้งชุด — เขียนจริง. เงินไม่ขยับ (direct-slip เท่านั้น · เงินอยู่ในบัญชีบริษัทเดิม)
 * ยกเลิกการบันทึก + ถอยออเดอร์ทุกใบกลับ "รอชำระเงิน" ให้บันทึกใหม่รวมใบเดียวได้.
 */
export async function adminReverseForwarderPaymentGroup(
  input: unknown,
): Promise<AdminActionResult<ReverseGroupResult>> {
  return withAdmin<ReverseGroupResult>(["super", "accounting"], async ({ adminId }) => {
    const parsed = reverseSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const { headerId } = parsed.data;
    const reason = (parsed.data.reason ?? "").trim();
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // 1. header ต้องยัง settled อยู่ (สถานะอื่น = ย้อนแล้ว/ไม่ใช่ชุด)
    const { data: header, error: hErr } = await admin
      .from("tb_wallet_hs")
      .select("id, userid, amount, status, depositnamebank, wusercredit")
      .eq("id", headerId)
      .maybeSingle<{ id: number; userid: string | null; amount: number | string | null; status: string | null; depositnamebank: string | null; wusercredit: string | null }>();
    if (hErr) {
      console.error(`[adminReverseForwarderPaymentGroup header] failed`, { code: hErr.code, message: hErr.message, headerId });
      return { ok: false, error: `db_error:${hErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: `ไม่พบชุดการชำระ #${headerId}` };
    if ((header.status ?? "") !== "2") return { ok: false, error: `ชุด #${headerId} ถูกย้อนไปแล้ว (โปรดรีเฟรช)` };

    // 2. V1: direct-slip เท่านั้น (การย้อนไม่ขยับเงิน) — WALLET/เครดิต = บัญชี
    const fundedBy = (header.depositnamebank ?? "").trim();
    if (fundedBy.toUpperCase() === "WALLET" || (header.wusercredit ?? "").trim() === "1") {
      return { ok: false, error: "ชุดนี้ตัดจากกระเป๋า/เครดิต — ต้องคืนเงิน/คืนวงเงิน ให้ฝ่ายบัญชีดำเนินการ" };
    }

    // 3. สมาชิกชุด + guard สถานะ
    const g = await loadGroup(admin, headerId);
    if ("error" in g) return { ok: false, error: g.error };
    const fids = g.members.map((m) => m.fid);
    const shipped = g.members.filter((m) => Number(m.fstatus) >= 7);
    if (shipped.length > 0) {
      return { ok: false, error: `มีออเดอร์ในชุดที่จัดส่ง/สำเร็จแล้ว (${shipped.map((m) => `#${m.fid}`).join(", ")}) — ย้อนทั้งชุดไม่ได้` };
    }
    const enRoute = await assertNoDriverEnRoute(admin, fids);
    if (!enRoute.ok) {
      return { ok: false, error: `มีออเดอร์ในชุดกำลังจัดส่ง (คนขับออกรถแล้ว) — เอาออกจากรอบคนขับก่อน แล้วค่อยย้อน` };
    }

    // 4. ATOMIC CLAIM header 2→3 — ผู้ชนะคนเดียว (กันกด 2 คนพร้อมกัน = ย้อนซ้ำไม่ได้)
    const note = reason || `ย้อนการชำระทั้งชุด #${headerId} (เจ้าหน้าที่)`;
    const { data: claimed, error: claimErr } = await admin
      .from("tb_wallet_hs")
      .update({ status: "3", adminid: legacyAdminId, adminidupdate: legacyAdminId, note })
      .eq("id", headerId)
      .eq("status", "2")
      .select("id");
    if (claimErr) {
      console.error(`[adminReverseForwarderPaymentGroup claim] failed`, { code: claimErr.code, message: claimErr.message, headerId });
      return { ok: false, error: claimErr.message };
    }
    if (!claimed || claimed.length === 0) {
      return { ok: false, error: "ชุดนี้ถูกย้อนไปแล้ว (โปรดรีเฟรช)" };
    }

    // 5. ลูกทุกแถว 2→3 (best-effort ต่อแถว · TOCTOU ต่อแถว · log ดังเมื่อพลาด)
    let reversedPayRows = 1;
    for (const childId of g.childIds) {
      const { data: cUpd, error: cErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "3", adminidupdate: legacyAdminId, note })
        .eq("id", childId)
        .eq("status", "2")
        .select("id");
      if (cErr) console.error(`[adminReverseForwarderPaymentGroup child ${childId}] FAILED — แถวลูกค้างสถานะ 2`, { code: cErr.code, message: cErr.message, headerId });
      else reversedPayRows += (cUpd?.length ?? 0);
    }

    // 6. ลบสะพาน paydeposit ของชุด (ค้างไว้ = guard ยังเห็นเป็น "จ่ายแล้ว")
    for (const linkId of g.linkIds) {
      const { error: dErr } = await admin.from("tb_wallet_paydeposit").delete().eq("id", linkId);
      if (dErr) console.error(`[adminReverseForwarderPaymentGroup link ${linkId}] delete failed`, { code: dErr.code, message: dErr.message, headerId });
    }

    // 7. ออเดอร์ทุกใบ → รอชำระเงิน (mirror single-reverse: PCSF50 reset ค่าเหมาๆ ด้วย)
    for (const m of g.members) {
      const { data: fRow, error: frErr } = await admin
        .from("tb_forwarder").select("fshipby, ftransportprice").eq("id", m.fid)
        .maybeSingle<{ fshipby: string | null; ftransportprice: number | string | null }>();
      if (frErr) console.error(`[adminReverseForwarderPaymentGroup fshipby ${m.fid}] failed`, { code: frErr.code, message: frErr.message, headerId });
      const isPCSF50 = ["PCSF", "PRF"].includes((fRow?.fshipby ?? "").trim())
        && Number(fRow?.ftransportprice) === MAO_FLAT_FEE;
      const patch: Record<string, unknown> = isPCSF50
        ? { fstatus: "5", ftransportprice: 0, fusercompany: "", paydeposit: "", adminidupdate: legacyAdminId }
        : { fstatus: "5", paydeposit: "", adminidupdate: legacyAdminId };
      const { error: fErr } = await admin
        .from("tb_forwarder").update(patch).eq("id", m.fid).in("fstatus", ["5", "6"]);
      if (fErr) console.error(`[adminReverseForwarderPaymentGroup forwarder ${m.fid}] revert failed`, { code: fErr.code, message: fErr.message, headerId });
    }
    await removeOpenDriverStops(admin, fids);

    // 8. void ใบเสร็จที่ครอบด้วย fid ในชุดนี้ **ทั้งใบ** (ใบที่แชร์ออเดอร์นอกชุด = ไม่แตะ)
    const receiptsVoided: string[] = [];
    try {
      const { data: items, error: itemsErr } = await admin
        .from("tb_receipt_item").select("rid, fid").in("fid", fids);
      if (itemsErr) console.error(`[adminReverseForwarderPaymentGroup receipt-items] failed`, { code: itemsErr.code, message: itemsErr.message, headerId });
      const rids = [...new Set(((items ?? []) as Array<{ rid: string | null }>).map((r) => r.rid).filter((x): x is string => !!x))];
      for (const rid of rids) {
        const { data: allItems, error: allErr } = await admin.from("tb_receipt_item").select("fid").eq("rid", rid);
        if (allErr) console.error(`[adminReverseForwarderPaymentGroup receipt-items ${rid}] failed`, { code: allErr.code, message: allErr.message, headerId });
        const recFids = ((allItems ?? []) as Array<{ fid: number }>).map((r) => r.fid);
        if (recFids.length === 0 || !recFids.every((f) => fids.includes(f))) {
          console.warn(`[adminReverseForwarderPaymentGroup] ใบเสร็จ ${rid} ครอบออเดอร์นอกชุด — ไม่ void อัตโนมัติ`, { headerId, recFids });
          continue;
        }
        const { data: voided, error: vErr } = await admin
          .from("tb_receipt")
          .update({ rstatus: "2" })
          .eq("rid", rid)
          .in("rstatus", ["1", "3"])
          .select("id");
        if (vErr) console.error(`[adminReverseForwarderPaymentGroup receipt ${rid}] void failed`, { code: vErr.code, message: vErr.message, headerId });
        else if ((voided ?? []).length > 0) {
          receiptsVoided.push(rid);
          await logAdminAction(adminId, "receipt.void", "tb_receipt", rid, {
            rid, reason: `ย้อนการชำระทั้งชุด #${headerId}: ${reason || "(ไม่ระบุเหตุผล)"}`,
          });
        }
      }
    } catch (e) {
      console.error(`[adminReverseForwarderPaymentGroup receipt-void] unexpected`, { message: String(e), headerId });
    }

    await logAdminAction(adminId, "pay-user.reverse-payment-group", "tb_wallet_hs", String(headerId), {
      userid: header.userid, headerAmount: header.amount, fids, reversedPayRows, receiptsVoided,
      fundedBy, reason: reason || null,
    });
    revalidatePath("/admin/wallet/pay-user");
    return { ok: true, data: { reversedPayRows, fids, receiptsVoided } };
  });
}
