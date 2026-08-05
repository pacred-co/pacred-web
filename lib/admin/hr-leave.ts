import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * HR การลา (item 4b · owner) — โหลดคำขอลา 2 ชั้น (HR → CEO).
 *
 * join ชื่อพนักงานจาก `tb_admin.adminName`/`adminLastName` โดย admin_login_id (batch ·
 * แบบเดียวกับ loader HR อื่น). fail-soft: อ่านไม่ได้ (รวมเคสตาราง hr_leave_request ยัง
 * ไม่ถูก apply บน dev) → console.error + คืน [] แทนที่จะให้ทั้งหน้าล้ม (§0c).
 */

export type LeaveStatus = "pending" | "hr_approved" | "approved" | "rejected";

export type LeaveRow = {
  id: string;
  adminLoginId: string;
  staffName: string;              // resolve จาก tb_admin (fallback = adminLoginId)
  leaveType: string | null;
  startDate: string | null;       // yyyy-mm-dd
  endDate: string | null;         // yyyy-mm-dd
  days: number | null;
  reason: string | null;
  status: LeaveStatus;
  hrApprovedBy: string | null;
  hrApprovedAt: string | null;
  ceoApprovedBy: string | null;
  ceoApprovedAt: string | null;
  rejectReason: string | null;
  createdAt: string | null;
};

type LeaveRaw = {
  id: string;
  admin_login_id: string;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  reason: string | null;
  status: string;
  hr_approved_by: string | null;
  hr_approved_at: string | null;
  ceo_approved_by: string | null;
  ceo_approved_at: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

/** โหลดคำขอลาทั้งหมด (หรือกรองตามสถานะ) · ใหม่สุดก่อน · resolve ชื่อผู้ยื่น */
export async function loadLeaveRequests(filter?: { status?: LeaveStatus }): Promise<LeaveRow[]> {
  const admin = createAdminClient();
  try {
    let q = admin
      .from("hr_leave_request")
      .select("id,admin_login_id,leave_type,start_date,end_date,days,reason,status,hr_approved_by,hr_approved_at,ceo_approved_by,ceo_approved_at,reject_reason,created_at")
      .order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    const { data, error } = await q;
    if (error) {
      console.error("[hr-leave] load failed", { code: error.code, message: error.message });
      return [];
    }
    const rows = (data ?? []) as LeaveRaw[];

    // resolve ชื่อผู้ยื่น (batch จาก tb_admin) — fail-soft
    const loginIds = [...new Set(rows.map((r) => r.admin_login_id).filter(Boolean))];
    const nameById = new Map<string, string>();
    if (loginIds.length) {
      const { data: tba, error: tErr } = await admin
        .from("tb_admin")
        .select("adminID,adminName,adminLastName")
        .in("adminID", loginIds);
      if (tErr) console.error("[hr-leave] resolve ชื่อผู้ยื่นไม่ได้", { code: tErr.code, message: tErr.message });
      for (const a of ((tba ?? []) as { adminID: string; adminName: string | null; adminLastName: string | null }[])) {
        const nm = [a.adminName, a.adminLastName].filter(Boolean).join(" ").trim();
        nameById.set(a.adminID, nm || a.adminID);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      adminLoginId: r.admin_login_id,
      staffName: nameById.get(r.admin_login_id) ?? r.admin_login_id,
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days != null ? Number(r.days) : null,
      reason: r.reason,
      status: (["pending", "hr_approved", "approved", "rejected"].includes(r.status) ? r.status : "pending") as LeaveStatus,
      hrApprovedBy: r.hr_approved_by,
      hrApprovedAt: r.hr_approved_at,
      ceoApprovedBy: r.ceo_approved_by,
      ceoApprovedAt: r.ceo_approved_at,
      rejectReason: r.reject_reason,
      createdAt: r.created_at,
    }));
  } catch (e) {
    // ตาราง hr_leave_request อาจยังไม่ถูก apply บน dev → กันทั้งหน้าล้ม
    console.error("[hr-leave] load threw (ตารางอาจยังไม่มีบน dev)", e);
    return [];
  }
}
