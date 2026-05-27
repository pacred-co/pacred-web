"use client";

/**
 * Client buttons + forms for the admin-profile page.
 *
 * Wave 21 (Task #128) — converted from jQuery + Bootstrap-4 modals
 * (`data-toggle="modal" / data-target="#…"`) to NATIVE `<dialog>`
 * elements opened via `dialogRef.current?.showModal()` and closed via
 * `dialogRef.current?.close()`. Confirm/alert popups (legacy SweetAlert
 * replaced earlier by `confirm()`/`alert()`) are now native `<dialog>`
 * confirm modals matching the Pacred admin idiom (see
 * `forwarders/warehouse-history/warehouse-history-relink-modal.tsx`).
 *
 * Per AGENTS.md §0a — we keep the SAME logic + the SAME form fields,
 * but the modal chrome is Tailwind (rounded · backdrop · spacing) and
 * brand-aligned (primary-600 submit · gray cancel · red destructive).
 * Form internals still use the `.form-control-lg` / `.form-control-label`
 * classes because the dialog is rendered inside the `.pcs-legacy`
 * scope on the parent page — keeping them avoids visually breaking the
 * form fields out of the surrounding legacy CSS context. Only the
 * Bootstrap modal CHROME (open mechanism · header · footer · sizing) is
 * Tailwind-ified.
 *
 * Server-action imports + business logic are unchanged.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAddBankAccount, adminDeleteBankAccount,
  adminUpdateFurlough, adminAddEducation, adminDeleteEducation,
  adminUpdateInterpreterCommission, adminUpdateProfile,
} from "@/actions/admin/admin-profile";
import { PacredDialog, DialogFooter, useConfirmDialogs } from "@/components/ui/pacred-dialog";

// ============================================================================
// Shared bits
// ============================================================================

/** Inline status row — replaces the SweetAlert toast. */
function StatusLine({ status }: { status: { kind: "ok" | "err"; msg: string } | null }) {
  if (!status) return null;
  return (
    <div
      className={
        status.kind === "ok"
          ? "mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700"
          : "mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
      }
    >
      {status.kind === "ok" ? "สำเร็จ — " : "ผิดพลาด — "}{status.msg}
    </div>
  );
}

// Pacred dialog kit (PacredDialog · DialogFooter · useConfirmDialogs) is
// now in `components/ui/pacred-dialog.tsx` — extracted on 2026-05-27 so
// organization-email/client.tsx + barcode/driver/import/import-scanner-panel.tsx
// can share the same idiom (both had Bootstrap data-toggle="modal" left
// dangling after Wave 21 dropped jQuery).

// ============================================================================
// Set comm-interpreter cog (legacy L363-404)
// ============================================================================
function SetCommCog({ adminId, currentPerCom }: { adminId: string; currentPerCom: number }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [perCom, setPerCom] = useState<string>(String(currentPerCom));
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminUpdateInterpreterCommission({ admin_id: adminId, per_com: Number(perCom) });
      if (res.ok) {
        setStatus({ kind: "ok", msg: "บันทึกค่าคอมล่ามจีนแล้ว" });
        router.refresh();
      } else {
        setStatus({ kind: "err", msg: res.error });
      }
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={() => { setStatus(null); dialogRef.current?.showModal(); }}
        className="inline-flex items-center bg-transparent border-0 p-0"
      >
        <span className="d-inline-block badge-warning badge-pill pl-1 pr-1 text-white">
          <span className="btn tn-icon text-white btn-pure p-0 pull-up">
            <svg viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span className="font-normal text-white d-none d-sm-inline-block d-sm-none">ตั้งค่า ค่าคอมล่ามจีน</span>
        </span>
      </button>
      <PacredDialog dialogRef={dialogRef} title={`ตั้งค่าค่าคอมล่ามจีน ${adminId}`}>
        <form onSubmit={onSubmit} autoComplete="off">
          <div className="mb-1">
            <label className="form-control-label" htmlFor="perCom">
              กรอกเปอร์เซ็นของค่าคอมที่ต้องการให้ ยึดจากผลต่างที่ต่อรองราคาได้
            </label>
            <input
              id="perCom"
              value={perCom}
              onChange={(e) => setPerCom(e.target.value)}
              className="form-control form-control-lg"
              placeholder="เช่น 5%"
              type="number"
              max={100}
              step={0.01}
              pattern="\d*"
              required
            />
          </div>
          <StatusLine status={status} />
          <DialogFooter onCancel={() => dialogRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>
    </>
  );
}

// ============================================================================
// Set-furlough cog (legacy L407-444)
// ============================================================================
function SetFurloughCog({ adminId }: { adminId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [adminTmp, setAdminTmp] = useState<string>("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (adminTmp !== "1" && adminTmp !== "2") {
      setStatus({ kind: "err", msg: "กรุณาเลือกสถานะ" });
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateFurlough({ admin_id: adminId, admin_tmp: adminTmp as "1" | "2" });
      if (res.ok) {
        setStatus({ kind: "ok", msg: "เปลี่ยนสถานะแล้ว" });
        router.refresh();
      } else {
        setStatus({ kind: "err", msg: res.error });
      }
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={() => { setStatus(null); dialogRef.current?.showModal(); }}
        className="inline-flex items-center bg-transparent border-0 p-0"
      >
        <span className="d-inline-block badge-warning badge-pill pl-1 pr-1 text-white">
          <span className="btn tn-icon text-white btn-pure p-0 pull-up">
            <svg viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span className="font-normal text-white d-none d-sm-inline-block d-sm-none">ตั้งค่า พักงานชั่วคราว</span>
        </span>
      </button>
      <PacredDialog dialogRef={dialogRef} title={`ตั้งค่าพักงานชั่วคราว/ปิดรับออเดอร์ ${adminId}`}>
        <form onSubmit={onSubmit} autoComplete="off">
          <div className="mb-1">
            <label className="form-control-label" htmlFor="adminTMP">สถานะที่ต้องการเปลี่ยน</label>
            <select
              id="adminTMP"
              name="adminTMP"
              value={adminTmp}
              onChange={(e) => setAdminTmp(e.target.value)}
              className="form-control form-control-lg"
            >
              <option value="">กรุณาเลือก</option>
              <option value="2">พักงานชั่วคราว</option>
              <option value="1">ทำงานต่อ</option>
            </select>
          </div>
          <StatusLine status={status} />
          <DialogFooter onCancel={() => dialogRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>
    </>
  );
}

// ============================================================================
// Edit-profile button + modal (legacy L448-754)
// ============================================================================
type ProfileFormValues = {
  admin_tel: string; admin_email: string; admin_name: string; admin_last_name: string;
  admin_nickname: string; admin_sex: string; marital_status: string; religion: string;
  nationality: string; national_id_card: string; admin_birthday: string; expiry_date: string;
  address_no: string; district: string; amphoe: string; province: string; zipcode: string;
  address_note: string;
  company_type: string; admin_type: string; admin_tmp: string; salary_type: string;
  department: string; section: string; start_date: string; end_date: string; salary: string;
  admin_email_org: string; admin_tel_org: string; admin_line_org: string; admin_wechat_org: string;
};

function EditProfileButton({
  adminId, showJobPosition, initialValues, orgEmailOpts, orgTelOpts, orgLineOpts, orgWechatOpts,
}: {
  adminId: string;
  showJobPosition: boolean;
  initialValues: ProfileFormValues;
  orgEmailOpts:  Array<{ id: number; email:  string }>;
  orgTelOpts:    Array<{ id: number; tell:   string }>;
  orgLineOpts:   Array<{ id: number; line:   string }>;
  orgWechatOpts: Array<{ id: number; wechat: string }>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState<ProfileFormValues>(initialValues);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function up<K extends keyof ProfileFormValues>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminUpdateProfile({
        admin_id: adminId,
        // (a) personal
        admin_tel:        v.admin_tel || undefined,
        admin_email:      v.admin_email || undefined,
        admin_name:       v.admin_name || undefined,
        admin_last_name:  v.admin_last_name || undefined,
        admin_nickname:   v.admin_nickname || undefined,
        admin_sex:        v.admin_sex || undefined,
        marital_status:   v.marital_status || undefined,
        religion:         v.religion || undefined,
        nationality:      v.nationality || undefined,
        national_id_card: v.national_id_card || undefined,
        admin_birthday:   v.admin_birthday || undefined,
        expiry_date:      v.expiry_date || undefined,
        address_no:       v.address_no || undefined,
        district:         v.district || undefined,
        amphoe:           v.amphoe || undefined,
        province:         v.province || undefined,
        zipcode:          v.zipcode || undefined,
        address_note:     v.address_note || undefined,
        admin_email_org:  v.admin_email_org || undefined,
        admin_tel_org:    v.admin_tel_org || undefined,
        admin_line_org:   v.admin_line_org || undefined,
        admin_wechat_org: v.admin_wechat_org || undefined,
        // (b) job position
        company_type:    showJobPosition ? (v.company_type || undefined) : undefined,
        admin_type:      showJobPosition ? (v.admin_type   || undefined) : undefined,
        admin_tmp:       showJobPosition ? (v.admin_tmp    || undefined) : undefined,
        salary_type:     showJobPosition ? (v.salary_type  || undefined) : undefined,
        department:      showJobPosition ? (v.department   || undefined) : undefined,
        section:         showJobPosition ? (v.section      || undefined) : undefined,
        start_date:      showJobPosition ? (v.start_date   || undefined) : undefined,
        end_date:        showJobPosition ? (v.end_date     || undefined) : undefined,
        salary:          showJobPosition ? (v.salary       || undefined) : undefined,
        update_job_position: showJobPosition,
      });
      if (res.ok) {
        setStatus({ kind: "ok", msg: "แก้ไขข้อมูลแล้ว" });
        router.refresh();
      } else {
        setStatus({ kind: "err", msg: res.error });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setStatus(null); dialogRef.current?.showModal(); }}
        className="inline-flex items-center bg-transparent border-0 p-0"
      >
        <span className="d-inline-block badge-warning badge-pill pl-1 pr-1 text-white">
          <span className="btn tn-icon text-white btn-pure p-0 pull-up">
            <i className="ft-edit"></i>
          </span>
          <span className="font-normal text-white d-none d-sm-inline-block d-sm-none">แก้ไขข้อมูลส่วนตัว</span>
        </span>
      </button>
      <PacredDialog dialogRef={dialogRef} title={`แก้ไขข้อมูล ${adminId}`} size="lg">
        <form onSubmit={onSubmit} autoComplete="off">
          {showJobPosition && (
            <div className="form-posit">
              <h3>ข้อมูลตำแหน่งงาน</h3>
              <div className="row mb-1">
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> บริษัท</label>
                  <select className="form-control form-control-lg" value={v.company_type} onChange={up("company_type")} required>
                    <option value="">กรุณาเลือก...</option>
                    <option value="1">PCS Cargo & PCS Freight</option>
                    <option value="2">PCS Freight</option>
                    <option value="3">PCS Cargo</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> ประเภทพนักงาน</label>
                  <select className="form-control form-control-lg" value={v.admin_type} onChange={up("admin_type")} required>
                    <option value="">กรุณาเลือกรายการ</option>
                    <option value="1">พนักงานประจำ</option>
                    <option value="2">ทดลองงาน</option>
                    <option value="3">เด็กฝึกงาน</option>
                    <option value="4">สหกิจศึกษา</option>
                    <option value="5">พาสเนอร์</option>
                    <option value="6">ฟรีแลนซ์</option>
                    <option value="7">คนในบ้าน</option>
                  </select>
                </div>
              </div>
              <div className="row mb-1 ele-department-section">
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> แผนก/ฝ่าย/ทีม</label>
                  <input type="text" className="form-control form-control-lg" value={v.department} onChange={up("department")} placeholder="หมายเลขแผนก" />
                </div>
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> ตำแหน่ง</label>
                  <input type="text" className="form-control form-control-lg" value={v.section} onChange={up("section")} placeholder="หมายเลขตำแหน่ง" />
                </div>
              </div>
              <div className="row apprentice mb-1">
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> เวลาเริ่มต้นงาน</label>
                  <input type="date" className="form-control form-control-lg" value={v.start_date} onChange={up("start_date")} />
                </div>
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> เวลาสิ้นสุดงาน</label>
                  <input type="date" className="form-control form-control-lg" value={v.end_date} onChange={up("end_date")} />
                </div>
              </div>
              <div className="row mb-1">
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> สถานะการพักงานรับออเดอร์</label>
                  <select className="form-control form-control-lg" value={v.admin_tmp} onChange={up("admin_tmp")} required>
                    <option value="">กรุณาเลือก</option>
                    <option value="2">พักงานชั่วคราว</option>
                    <option value="1">ทำงานอยู่</option>
                  </select>
                </div>
              </div>
              <div className="row mb-1">
                <div className="col-md-6">
                  <label className="form-control-label"><span className="text-danger">*</span> ประเภทการจ่ายเงินเดือน</label>
                  <select className="form-control form-control-lg" value={v.salary_type} onChange={up("salary_type")} required>
                    <option value="">กรุณาเลือก...</option>
                    <option value="1">รายวัน</option>
                    <option value="2">รายเดือน</option>
                    <option value="3">ไม่มีเงินเดือนประจำ</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-control-label">เงินเดือน (หากเป็นฝึกงานจะเป็นแบบรายวัน)</label>
                  <input className="form-control form-control-lg text-right" value={v.salary} onChange={up("salary")} type="number" min={0.01} step={0.01} />
                </div>
              </div>
            </div>
          )}
          <hr />
          <div className="form-posit">
            <h3>ข้อมูลทั่วไปพนักงาน</h3>
            <div className="row mb-1">
              <div className="col-md-6">
                <label className="form-control-label"><span className="text-danger">*</span> เบอร์โทรศัพท์ส่วนตัว <span className="text-danger">(ใช้ซ้ำกันไม่ได้)</span></label>
                <input className="form-control form-control-lg" value={v.admin_tel} onChange={up("admin_tel")} type="text" pattern="\d*" placeholder="เบอร์โทรศัพท์ส่วนตัว" maxLength={13} required />
              </div>
              <div className="col-md-6">
                <label className="form-control-label"><span className="text-danger">*</span> ชื่ออีเมลส่วนตัว</label>
                <input className="form-control form-control-lg" value={v.admin_email} onChange={up("admin_email")} type="email" placeholder="ชื่ออีเมลส่วนตัว" maxLength={255} required />
              </div>
            </div>
            <div className="row mb-1">
              <div className="col-md-6">
                <label className="form-control-label"><span className="text-danger">*</span> ชื่อจริง</label>
                <input className="form-control form-control-lg" value={v.admin_name} onChange={up("admin_name")} type="text" placeholder="ชื่อจริง" maxLength={200} required />
              </div>
              <div className="col-md-6">
                <label className="form-control-label"><span className="text-danger">*</span> นามสกุล</label>
                <input className="form-control form-control-lg" value={v.admin_last_name} onChange={up("admin_last_name")} type="text" placeholder="นามสกุล" maxLength={200} required />
              </div>
            </div>
            <div className="row mb-1">
              <div className="col-6">
                <label className="form-control-label"><span className="text-danger">*</span> ชื่อเล่น</label>
                <input className="form-control form-control-lg" value={v.admin_nickname} onChange={up("admin_nickname")} type="text" placeholder="ชื่อเล่น" maxLength={200} required />
              </div>
              <div className="col-md-6">
                <label className="form-control-label"><span className="text-danger">*</span> เพศ</label>
                <select className="form-control form-control-lg" value={v.admin_sex} onChange={up("admin_sex")} required>
                  <option value="">กรุณาเลือก</option>
                  <option value="1">ชาย</option>
                  <option value="2">หญิง</option>
                  <option value="3">LGBTQ</option>
                </select>
              </div>
            </div>
            <div className="row mb-1">
              <div className="col-6">
                <label className="form-control-label"><span className="text-danger">*</span> สถานะภาพ</label>
                <select className="form-control form-control-lg" value={v.marital_status} onChange={up("marital_status")} required>
                  <option value="">--เลือกสถานะภาพ--</option>
                  <option value="1">โสด</option>
                  <option value="2">แต่งงานแล้ว</option>
                  <option value="3">หย่าร้าง</option>
                  <option value="4">ม่าย</option>
                  <option value="5">แยกกันอยู่</option>
                  <option value="6">มีความสัมพันธ์</option>
                  <option value="7">หมั้น</option>
                  <option value="8">อื่นๆ</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-control-label"><span className="text-danger">*</span> ศาสนา</label>
                <select className="form-control form-control-lg" value={v.religion} onChange={up("religion")} required>
                  <option value="">--เลือกศาสนา--</option>
                  <option value="1">พุทธ</option>
                  <option value="2">คริสต์</option>
                  <option value="3">อิสลาม</option>
                  <option value="4">ฮินดู</option>
                  <option value="5">ซิกข์</option>
                  <option value="6">ยูดาห์</option>
                  <option value="7">ไม่มีศาสนา</option>
                  <option value="8">ศาสนาอื่น ๆ</option>
                </select>
              </div>
            </div>
            <div className="row mb-1">
              <div className="col-6">
                <label className="form-control-label"><span className="text-danger">*</span> สัญชาติ</label>
                <input className="form-control form-control-lg" value={v.nationality} onChange={up("nationality")} type="text" placeholder="สัญชาติ เช่น ไทย" maxLength={200} required />
              </div>
            </div>
            <div className="row mb-1">
              <div className="col-6">
                <label className="form-control-label"> สำเนาบัตรประชาชน + ทะเบียนบ้าน + Resume</label>
                {/* Wave 23 audit (2026-05-27): the legacy `<input type="file" class="dropify"
                    data-max-file-size="5M">` markup is jQuery-Dropify decoration only — never
                    wired to a Pacred storage bucket / server action. Banner the gap honestly
                    per AGENTS §0a; real upload backend (admin-docs bucket + 3 URL columns on
                    `admin_contact_extras` + server action + delete UI) is Wave 24/Phase C. */}
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                  🚧 อัพโหลดเอกสาร HR (บัตรประชาชน · ทะเบียนบ้าน · Resume) — <strong>ยังไม่เปิดใช้งานจริง</strong>.
                  ระหว่างนี้: ส่งไฟล์ทาง LINE OA หรือ HR แล้วให้ admin บันทึก path ที่ <code className="font-mono">admin_note</code> ใต้ &quot;Note ภายใน&quot;.
                  Backend (storage bucket + server action + 3 URL columns) กำหนดส่งใน Phase C / Wave 24+ ตาม
                  <code className="font-mono"> docs/research/admin-tech-debt-master-2026-05-27.md </code>
                  ข้อ #2 (P1 ที่ deferred จาก audit วันนี้).
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-control-label"> เลขที่บัตรประชาชน</label>
                <input type="text" value={v.national_id_card} onChange={up("national_id_card")} placeholder="x-xxxxx-xxxxx-xx-x" className="inputbox autowidth form-control form-control-lg" minLength={13} maxLength={20} />
                <br />
                <label className="form-control-label"> วันเดือนปีเกิด</label>
                <input type="date" className="form-control form-control-lg" value={v.admin_birthday} onChange={up("admin_birthday")} />
                <br />
                <label className="form-control-label"> วันที่บัตรประชาชนหมดอายุ</label>
                <input type="date" className="form-control form-control-lg" value={v.expiry_date} onChange={up("expiry_date")} />
              </div>
            </div>
            <hr />
            <div className="row mb-1">
              <div className="col-md-12">
                <h4>ที่อยู่ปัจจุบัน</h4>
                <div className="form-group">
                  <div className="mb-1">
                    <label className="form-control-label">ทึ่อยู่ <span className="text-danger">ชื่อหมู่บ้านและหมู่ที่*</span></label>
                    <input className="form-control form-control-lg" value={v.address_no} onChange={up("address_no")} type="text" placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่*" maxLength={200} />
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label">ตำบล/แขวง</label>
                    <input className="form-control form-control-lg" value={v.district} onChange={up("district")} type="text" placeholder="ตำบล/แขวง" />
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label">อำเภอ/เขต</label>
                    <input className="form-control form-control-lg" value={v.amphoe} onChange={up("amphoe")} type="text" placeholder="อำเภอ/เขต" />
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label">จังหวัด</label>
                    <input className="form-control form-control-lg" value={v.province} onChange={up("province")} type="text" placeholder="จังหวัด" />
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label">รหัสไปรษณีย์</label>
                    <input className="form-control form-control-lg" value={v.zipcode} onChange={up("zipcode")} type="text" pattern="\d*" placeholder="รหัสไปรษณีย์" />
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label">หมายเหตุ (ไม่จำเป็น)</label>
                    <input className="form-control form-control-lg" value={v.address_note} onChange={up("address_note")} type="text" placeholder="หมายเหตุ" />
                  </div>
                </div>
              </div>
            </div>
            <hr />
            <div className="row mb-1">
              <div className="col-md-6">
                <label className="form-control-label">อีเมลในองค์กรที่ใช้งาน</label>
                <select value={v.admin_email_org} onChange={up("admin_email_org")} style={{ width: "100%" }} className="form-control form-control-lg">
                  <option value="">กรุณาเลือก</option>
                  {orgEmailOpts.map((o) => <option key={o.id} value={o.id}>{o.email}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-control-label">เบอร์โทรในองค์กรที่ใช้งาน</label>
                <select value={v.admin_tel_org} onChange={up("admin_tel_org")} style={{ width: "100%" }} className="form-control form-control-lg">
                  <option value="">กรุณาเลือก</option>
                  {orgTelOpts.map((o) => <option key={o.id} value={o.id}>{o.tell}</option>)}
                </select>
              </div>
            </div>
            <div className="row mb-1">
              <div className="col-md-6">
                <label className="form-control-label">ไลน์ในองค์กรที่ใช้งาน</label>
                <select value={v.admin_line_org} onChange={up("admin_line_org")} style={{ width: "100%" }} className="form-control form-control-lg">
                  <option value="">กรุณาเลือก</option>
                  {orgLineOpts.map((o) => <option key={o.id} value={o.id}>{o.line}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-control-label">We Chat ในองค์กรที่ใช้งาน</label>
                <select value={v.admin_wechat_org} onChange={up("admin_wechat_org")} style={{ width: "100%" }} className="form-control form-control-lg">
                  <option value="">กรุณาเลือก</option>
                  {orgWechatOpts.map((o) => <option key={o.id} value={o.id}>{o.wechat}</option>)}
                </select>
              </div>
            </div>
          </div>
          <StatusLine status={status} />
          <DialogFooter
            onCancel={() => dialogRef.current?.close()}
            pending={pending}
            submitLabel="อัปเดตข้อมูล"
          />
        </form>
      </PacredDialog>
    </>
  );
}

// ============================================================================
// Add bank account button + modal (legacy L1167-1207)
// ============================================================================
function AddBankAccountButton({ adminId }: { adminId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminAddBankAccount({
        admin_id:       adminId,
        bank_name:      bankName,
        account_number: accountNumber,
        account_name:   accountName,
      });
      if (res.ok) {
        setStatus({ kind: "ok", msg: "เพิ่มเลขที่บัญชีแล้ว" });
        setBankName(""); setAccountNumber(""); setAccountName("");
        router.refresh();
      } else {
        setStatus({ kind: "err", msg: res.error });
      }
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={() => { setStatus(null); dialogRef.current?.showModal(); }}
        className="inline-flex items-center bg-transparent border-0 p-0"
      >
        <span className="btn btn-sm btn-circle btn-success text-white">
          <i className="ft-plus"></i>
        </span>
        <span className="font-normal text-dark">เพิ่มข้อมูล</span>
      </button>
      <PacredDialog dialogRef={dialogRef} title={`เพิ่มเลขที่บัญชีธนาคาร ให้กับ ${adminId}`}>
        <form onSubmit={onSubmit} autoComplete="off">
          <div className="mb-1">
            <select name="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} className="form-control form-control-lg" style={{ width: "100%" }} required>
              <option value="">กรุณาเลือกธนาคาร</option>
              <option value="1">กรุงเทพ</option>
              <option value="2">กสิกรไทย</option>
              <option value="3">กรุงไทย</option>
              <option value="4">ทหารไทย</option>
              <option value="5">ไทยพาณิชย์</option>
              <option value="6">กรุงศรีอยุธยา</option>
              <option value="7">เกียรตินาคิน</option>
              <option value="8">ซีไอเอ็มบีไทย</option>
              <option value="9">ทิสโก้</option>
              <option value="10">ธนชาต</option>
              <option value="11">ยูโอบี</option>
              <option value="12">แลนด์ แอนด์ เฮาส์</option>
              <option value="13">ออมสิน</option>
              <option value="14">พร้อมเพย์</option>
              <option value="15">CIMB</option>
              <option value="16">ICBC</option>
            </select>
          </div>
          <div className="mb-1">
            <label className="form-control-label">เลขที่บัญชี</label>
            <input className="form-control form-control-lg" placeholder="เลขที่บัญชี" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} type="text" required />
          </div>
          <div className="mb-1">
            <label className="form-control-label">ชื่อบัญชี</label>
            <input className="form-control form-control-lg" placeholder="ชื่อบัญชี" value={accountName} onChange={(e) => setAccountName(e.target.value)} type="text" required />
          </div>
          <StatusLine status={status} />
          <DialogFooter onCancel={() => dialogRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>
    </>
  );
}

// ============================================================================
// Delete bank-account button (legacy L1240 + L1474-1509 confirm flow)
// ============================================================================
function DeleteBankButton({ accountId, adminId }: { accountId: number; adminId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function onClick() {
    const ok = await confirm("ต้องการลบเลขที่บัญชีนี้?");
    if (!ok) return;
    startTransition(async () => {
      const res = await adminDeleteBankAccount({ account_id: accountId, admin_id: adminId });
      if (res.ok) router.refresh();
      else await alert("ผิดพลาด: " + res.error);
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn font-12 btn-sm btn-danger btn-rounded"
      >
        {pending ? "กำลังลบ..." : "ลบข้อมูล"}
      </button>
      {dialogs}
    </>
  );
}

// ============================================================================
// Add education-entry button + modal (legacy L1279-1309)
// ============================================================================
type EducationEntry = {
  education_status:     "1" | "2";
  education_level:      string;
  institution:          string;
  faculty:              string;
  education_department: string;
  graduate_year:        string;
  gpa:                  string;
};
const blankEducationEntry: EducationEntry = {
  education_status: "1", education_level: "", institution: "",
  faculty: "", education_department: "", graduate_year: "", gpa: "",
};
function AddEducationButton({ adminId }: { adminId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<EducationEntry[]>([{ ...blankEducationEntry }]);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(i: number, k: keyof EducationEntry, val: string) {
    setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, [k]: val } : e));
  }
  function addRow()    { setEntries((prev) => [...prev, { ...blankEducationEntry }]); }
  function removeRow(i: number) { setEntries((prev) => prev.filter((_, idx) => idx !== i)); }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminAddEducation({
        admin_id: adminId,
        entries: entries.map((e) => ({
          education_status:     e.education_status,
          education_level:      e.education_level,
          institution:          e.institution,
          faculty:              e.faculty || null,
          education_department: e.education_department || null,
          graduate_year:        e.graduate_year || null,
          gpa:                  e.gpa || null,
        })),
      });
      if (res.ok) {
        setStatus({ kind: "ok", msg: "เพิ่มประวัติการศึกษาแล้ว" });
        setEntries([{ ...blankEducationEntry }]);
        router.refresh();
      } else {
        setStatus({ kind: "err", msg: res.error });
      }
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={() => { setStatus(null); dialogRef.current?.showModal(); }}
        className="inline-flex items-center bg-transparent border-0 p-0"
      >
        <span className="btn btn-sm btn-circle btn-success text-white">
          <i className="ft-plus"></i>
        </span>
        <span className="font-normal text-dark">เพิ่มข้อมูล</span>
      </button>
      <PacredDialog dialogRef={dialogRef} title={`เพิ่มประวัติการศึกษาให้กับ ${adminId}`} size="lg">
        <form onSubmit={onSubmit} autoComplete="off">
          {entries.map((e, i) => (
            <div key={i} className={`form-group removeclass${i + 1}`}>
              {i > 0 && (
                <div className="row mb-1"><div className="col-md-12">
                  <div className="float-right">
                    <button type="button" className="btn btn-danger btn-circle btn-add" onClick={() => removeRow(i)}>
                      <i className="fa fa-minus"></i>
                    </button>
                  </div>
                </div></div>
              )}
              <div className="form-education-background">
                <div className="mb-1 row">
                  <div className="col-md-6">
                    <label className="form-control-label">สถานภาพทางการศึกษา</label>
                    <select className="form-control form-control-lg" value={e.education_status} onChange={(ev) => patch(i, "education_status", ev.target.value)}>
                      <option value="1">จบการศึกษา</option>
                      <option value="2">กำลังศึกษาอยู่</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-control-label"><span className="text-danger">*</span> ระดับการศึกษา</label>
                    <select className="form-control form-control-lg" value={e.education_level} onChange={(ev) => patch(i, "education_level", ev.target.value)} required>
                      <option value="">--เลือกระดับการศึกษา--</option>
                      <option value="1">ต่ำกว่ามัธยมศึกษา</option>
                      <option value="2">มัธยมศึกษาตอนต้น</option>
                      <option value="3">มัธยมศึกษาตอนปลาย</option>
                      <option value="4">ปวช.</option>
                      <option value="5">ปวท.</option>
                      <option value="6">ปวส.</option>
                      <option value="7">อนุปริญญา</option>
                      <option value="8">ปริญญาตรี</option>
                      <option value="9">ปริญญาโท</option>
                      <option value="10">ปริญญาเอก</option>
                    </select>
                  </div>
                </div>
                <div className="mb-1 row">
                  <div className="col-md-6">
                    <label className="form-control-label"><span className="text-danger">*</span> สถานศึกษา</label>
                    <input className="form-control form-control-lg" maxLength={255} value={e.institution} onChange={(ev) => patch(i, "institution", ev.target.value)} placeholder="สถานศึกษา" required />
                  </div>
                  <div className="col-md-6 faculty">
                    <label className="form-control-label">คณะ</label>
                    <input className="form-control form-control-lg" maxLength={255} value={e.faculty} onChange={(ev) => patch(i, "faculty", ev.target.value)} placeholder="คณะ" />
                  </div>
                </div>
                <div className="mb-1 row">
                  <div className="col-md-6">
                    <label className="form-control-label">สาขา</label>
                    <input className="form-control form-control-lg" maxLength={255} value={e.education_department} onChange={(ev) => patch(i, "education_department", ev.target.value)} placeholder="สาขา" />
                  </div>
                  <div className="col-md-6 graduateYear">
                    <label className="form-control-label"><span className="text-danger">*</span> ปีที่จบการศึกษา</label>
                    <input className="form-control form-control-lg" maxLength={255} value={e.graduate_year} onChange={(ev) => patch(i, "graduate_year", ev.target.value)} placeholder="ปีที่จบการศึกษา" required />
                  </div>
                </div>
                <div className="mb-1 row">
                  <div className="col-md-6">
                    <label className="form-control-label">เกรดเฉลี่ย</label>
                    <input className="form-control form-control-lg" maxLength={255} value={e.gpa} onChange={(ev) => patch(i, "gpa", ev.target.value)} placeholder="เกรดเฉลี่ย" />
                  </div>
                </div>
              </div>
              <hr />
            </div>
          ))}
          <div className="text-center">
            <button className="btn btn-sm btn-success round" type="button" onClick={addRow}>
              <i className="fa fa-plus"></i> เพิ่มประวัติการศึกษา
            </button>
          </div>
          <StatusLine status={status} />
          <DialogFooter onCancel={() => dialogRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>
    </>
  );
}

// ============================================================================
// Delete education-entry button (legacy L1345 + L1510-1545 confirm flow)
// ============================================================================
function DeleteEducationButton({ educationId, adminId }: { educationId: number; adminId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function onClick() {
    const ok = await confirm("ต้องการลบประวัติการศึกษานี้?");
    if (!ok) return;
    startTransition(async () => {
      const res = await adminDeleteEducation({ education_id: educationId, admin_id: adminId });
      if (res.ok) router.refresh();
      else await alert("ผิดพลาด: " + res.error);
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn font-12 btn-sm btn-danger btn-rounded"
      >
        {pending ? "กำลังลบ..." : "ลบข้อมูล"}
      </button>
      {dialogs}
    </>
  );
}

// ============================================================================
// Bundle export — keeps the parent import shape simple.
// ============================================================================
export const AdminProfileClient = {
  SetCommCog,
  SetFurloughCog,
  EditProfileButton,
  AddBankAccountButton,
  DeleteBankButton,
  AddEducationButton,
  DeleteEducationButton,
};
