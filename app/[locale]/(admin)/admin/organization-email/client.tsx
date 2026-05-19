"use client";

/**
 * Client component for the "อีเมลในองค์กร" page (1:1 with
 * `pcs-admin/include/pages/organization-email/home.php` L65-220).
 *
 * Carries:
 *   - The "เพิ่มใหม่" + "คำอธิบายระบบ" trigger buttons (HR/ITDT/CEO gated
 *     via `canMutate` from the server page)
 *   - The 2 Bootstrap-4 modals (add-form · recom)
 *   - The DataTables-wrapped table (11 columns)
 *   - The row "แก้ไข / ลบ" buttons + the edit modal
 *   - The password-eye toggle (home.php L196-199 inline jQuery — done as
 *     React `useState` here, same UX)
 *
 * Mutations call into `actions/admin/organization-email.ts`:
 *   - addOrgEmail · updateOrgEmail · deleteOrgEmail
 *
 * Pattern: the Bootstrap-4 markup (data-toggle / data-target / .modal /
 * .btn / .form-control) is transcribed verbatim and works at runtime
 * because the (admin) layout loads jQuery + Bootstrap-4 globally per
 * the customer-pilot vendor-JS rule (gotcha §9 #3).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addOrgEmail,
  updateOrgEmail,
  deleteOrgEmail,
} from "@/actions/admin/organization-email";

type DisplayRow = {
  id:              number;
  date:            string;
  dateupdate:      string;
  email:           string;
  emailtel:        string;
  passemail:       string;
  emailtype:       string;
  emailtype_label: string;
  adminidcreate:   string;
  adminidupdate:   string;
  note:            string;
};

export function OrgEmailForms({
  canMutate,
  rows,
}: {
  canMutate: boolean;
  rows: DisplayRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [alert, setAlert] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<DisplayRow | null>(null);
  const [shownPwIds, setShownPwIds] = useState<Set<number>>(new Set());

  function flashOk(msg: string) {
    setAlert(msg);
    router.refresh();
    setTimeout(() => setAlert(null), 3000);
  }

  function togglePw(id: number) {
    setShownPwIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function onAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addOrgEmail({
        email:     String(fd.get("email") ?? ""),
        passEmail: String(fd.get("passEmail") ?? ""),
        emailType: String(fd.get("emailType") ?? "") as "1" | "2",
        emailTel:  String(fd.get("emailTel") ?? "") || undefined,
        note:      String(fd.get("note") ?? "")     || undefined,
      });
      if (res.ok) {
        flashOk("เพิ่มข้อมูลสำเร็จ");
        (e.target as HTMLFormElement).reset();
      } else {
        setAlert(res.error === "eDuplicate" ? "อีเมลนี้มีอยู่แล้ว" : res.error);
      }
    });
  }

  function onEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRow) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgEmail({
        ID:        editRow.id,
        email:     String(fd.get("email") ?? ""),
        emailOld:  editRow.email,
        passEmail: String(fd.get("passEmail") ?? ""),
        emailType: String(fd.get("emailType") ?? "") as "1" | "2",
        emailTel:  String(fd.get("emailTel") ?? "") || undefined,
        note:      String(fd.get("note") ?? "")     || undefined,
      });
      if (res.ok) {
        flashOk("แก้ไขข้อมูลสำเร็จ");
        setEditRow(null);
      } else {
        setAlert(res.error === "eDuplicate" ? "อีเมลนี้มีอยู่แล้ว" : res.error);
      }
    });
  }

  function onDelete(id: number, email: string) {
    if (!confirm(`ลบรายการ "${email}" ?`)) return;
    startTransition(async () => {
      const res = await deleteOrgEmail({ ID: id });
      if (res.ok) flashOk("ลบรายการสำเร็จ");
      else        setAlert(res.error);
    });
  }

  return (
    <>
      {/* Mutate-button row + modals (home.php L65-144) — gated */}
      {canMutate && (
        <div className="content-header-right col-md-4 col-12" style={{ marginTop: -56 }}>
          <div className="text-center text-md-right">
            <a href="#" data-toggle="modal" data-target="#add-form">
              <button className="btn btn-sm btn-circle btn-success text-white">
                <i className="ft-plus"></i>
              </button>
              <span className="font-normal text-dark"> เพิ่มใหม่</span>
            </a>{" "}
            <span className="btn btn-sm bg-color-select box-shadow-2 cursor-pointer" data-toggle="modal" data-target="#recom">คำอธิบายระบบ</span>
          </div>
        </div>
      )}

      {alert && (
        <div className="col-12">
          <div className="alert alert-info" role="alert" style={{ margin: "8px 0" }}>
            {alert}
          </div>
        </div>
      )}

      {/* DataTables (home.php L145-220) — markup-only, server-rendered */}
      <div className="col-md-12">
        <div className="table-responsive p-05">
          <form className="" id="frm-example" method="GET">
            <input type="hidden" name="id" id="arrID" />
            <table id="myTable" className="table display table-bordered table-striped dataTable no-footer dtr-inline header-fixed">
              <thead>
                <tr className="text-center">
                  <th>วันที่สร้าง</th>
                  <th>ผู้สร้าง</th>
                  <th>อีเมลในองค์กร</th>
                  <th>เบอร์โทรศัพท์ที่ใช้สมัคร</th>
                  <th>รหัสผ่านที่ใช้อยู่</th>
                  <th>ประเภทของอีเมล</th>
                  <th>โน๊ตช่วยจำ</th>
                  <th>รายละเอียดคนที่ใช้งาน</th>
                  <th>อัปเดตล่าสุดเมื่อ</th>
                  <th>อัปเดตโดย</th>
                  <th>ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center" style={{ padding: "32px 0" }}>
                      <em>ยังไม่มีรายการ — กด &quot;เพิ่มใหม่&quot; เพื่อเริ่ม</em>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const pwShown = shownPwIds.has(r.id);
                    return (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>
                          <a href={`/admin/admins/${encodeURIComponent(r.adminidcreate)}`}>{r.adminidcreate}</a>
                        </td>
                        <td>{r.email}</td>
                        <td>{r.emailtel}</td>
                        <td className="password-container">
                          <input
                            className="password"
                            type={pwShown ? "text" : "password"}
                            value={r.passemail}
                            readOnly
                          />
                          <span
                            className="toggle-button"
                            role="button"
                            tabIndex={0}
                            onClick={() => togglePw(r.id)}
                            onKeyDown={(e) => { if (e.key === "Enter") togglePw(r.id); }}
                          >
                            <i className={pwShown ? "fa fa-eye" : "fa fa-eye-slash"} aria-hidden="true"></i>
                          </span>
                        </td>
                        <td>{r.emailtype_label}</td>
                        <td>{r.note}</td>
                        <td></td>
                        <td>{r.dateupdate}</td>
                        <td>
                          {r.adminidupdate && (
                            <a href={`/admin/admins/${encodeURIComponent(r.adminidupdate)}`}>{r.adminidupdate}</a>
                          )}
                        </td>
                        <td className="text-center">
                          {canMutate ? (
                            <div className="btn-group-pcs">
                              <button
                                type="button"
                                onClick={() => setEditRow(r)}
                                disabled={pending}
                                className="btn btn-sm btn-warning btn-rounded"
                              >
                                แก้ไขข้อมูล
                              </button>{" "}
                              <button
                                type="button"
                                onClick={() => onDelete(r.id, r.email)}
                                disabled={pending}
                                className="btn btn-sm btn-danger btn-rounded"
                              >
                                ลบรายการ
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </form>
        </div>
      </div>

      {/* Add form modal (home.php L66-128) — gated */}
      {canMutate && (
        <div id="add-form" className="modal fade in" tabIndex={-1} role="dialog" aria-hidden="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content header-from">
              <div className="modal-header">
                <h4 className="modal-title">ฟอร์มเพิ่มข้อมูลอีเมลบริษัท</h4>
                <button type="button" className="close" data-dismiss="modal" aria-hidden="true">
                  <i className="la la-close"> </i>
                </button>
              </div>
              <div className="modal-body header-from">
                <form className="form-horizontal" onSubmit={onAddSubmit} autoComplete="off">
                  <div className="row">
                    <div className="col-md-6">
                      <label className="form-control-label" htmlFor="email">ชื่ออีเมล</label>
                      <input id="email" className="form-control form-control-lg" name="email" type="email" placeholder="ชื่ออีเมล" maxLength={255} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-control-label" htmlFor="emailType">ประเภทอีเมล</label>
                      <div className="form-group">
                        <select id="emailType" className="form-control" name="emailType" required defaultValue="">
                          <option value="" disabled>กรุณาเลือกประเภท</option>
                          <option value="1">Google workspace แบบซื้อ</option>
                          <option value="2">แบบฟรีผ่าน Gmail</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="row mb-1">
                    <div className="col-md-6">
                      <label className="form-control-label" htmlFor="emailTel">เบอร์โทรศัพท์ที่ใช้สมัคร</label>
                      <input id="emailTel" className="form-control form-control-lg" name="emailTel" type="text" placeholder="เบอร์โทรศัพท์ที่ใช้สมัคร" maxLength={255} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-control-label" htmlFor="passEmail">รหัสผ่านอีเมล</label>
                      <input id="passEmail" className="form-control form-control-lg" name="passEmail" type="text" placeholder="รหัสผ่านอีเมล" maxLength={255} required />
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-12">
                      <label className="form-control-label" htmlFor="note">โน๊ตช่วยจำ</label>
                      <textarea id="note" className="form-control form-control-lg" name="note" rows={4}></textarea>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary round" data-dismiss="modal">ยกเลิก</button>
                    <button type="submit" className="btn btn-color-main round" disabled={pending}>
                      {pending ? "..." : "บันทึก"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recom modal (home.php L130-144) */}
      <div id="recom" className="modal fade in" tabIndex={-1} role="dialog" aria-hidden="true">
        <div className="modal-dialog modal-lg">
          <div className="modal-content header-from">
            <div className="modal-header">
              <h4 className="modal-title">คำอธิบายความเป็นมาของข้อมูลต่าง ๆ </h4>
              <button type="button" className="close" data-dismiss="modal" aria-hidden="true">
                <i className="la la-close"> </i>
              </button>
            </div>
            <div className="modal-body header-from">
              <h5>เป็นอีเมลของบริษัทที่แต่ละคนหรือแผนกใช้งาน</h5>
              <h5>CEO HR IT เพิ่ม ลบ แก้ไขได้</h5>
            </div>
          </div>
        </div>
      </div>

      {/* Edit modal — React-controlled (replaces legacy AJAX editItem() injection) */}
      {editRow && (
        <div className="modal fade in show" tabIndex={-1} role="dialog" aria-hidden="false" style={{ display: "block", background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content header-from">
              <div className="modal-header">
                <h4 className="modal-title">ฟอร์มแก้ไขข้อมูลอีเมลบริษัท</h4>
                <button type="button" className="close" onClick={() => setEditRow(null)} aria-hidden="true">
                  <i className="la la-close"> </i>
                </button>
              </div>
              <div className="modal-body header-from">
                <form className="form-horizontal" onSubmit={onEditSubmit} autoComplete="off">
                  <input type="hidden" name="ID" defaultValue={editRow.id} />
                  <input type="hidden" name="emailOld" defaultValue={editRow.email} />
                  <div className="row">
                    <div className="col-md-6">
                      <label className="form-control-label">ชื่ออีเมล</label>
                      <input className="form-control form-control-lg" name="email" type="email" defaultValue={editRow.email} maxLength={255} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-control-label">ประเภทอีเมล</label>
                      <select className="form-control" name="emailType" defaultValue={editRow.emailtype} required>
                        <option value="1">Google workspace แบบซื้อ</option>
                        <option value="2">แบบฟรีผ่าน Gmail</option>
                      </select>
                    </div>
                  </div>
                  <div className="row mb-1">
                    <div className="col-md-6">
                      <label className="form-control-label">เบอร์โทรศัพท์ที่ใช้สมัคร</label>
                      <input className="form-control form-control-lg" name="emailTel" type="text" defaultValue={editRow.emailtel} maxLength={255} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-control-label">รหัสผ่านอีเมล</label>
                      <input className="form-control form-control-lg" name="passEmail" type="text" defaultValue={editRow.passemail} maxLength={255} required />
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-12">
                      <label className="form-control-label">โน๊ตช่วยจำ</label>
                      <textarea className="form-control form-control-lg" name="note" rows={4} defaultValue={editRow.note}></textarea>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary round" onClick={() => setEditRow(null)}>ยกเลิก</button>
                    <button type="submit" className="btn btn-color-main round" disabled={pending}>
                      {pending ? "..." : "บันทึก"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
