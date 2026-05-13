"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveCustomer, suspendCustomer, editCustomer } from "@/actions/admin/customers";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  id: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  customerGroup: string;
  sex: string | null;
  birthday: string | null;
  lineId: string | null;
  recommendedBy: string | null;
};

export function CustomerActions(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const [firstName,   setFirstName]   = useState(p.firstName ?? "");
  const [lastName,    setLastName]    = useState(p.lastName ?? "");
  const [email,       setEmail]       = useState(p.email ?? "");
  const [phone,       setPhone]       = useState(p.phone ?? "");
  const [group,       setGroup]       = useState(p.customerGroup);
  const [sex,         setSex]         = useState(p.sex ?? "");
  const [birthday,    setBirthday]    = useState(p.birthday ?? "");
  const [lineId,      setLineId]      = useState(p.lineId ?? "");
  const [recommended, setRecommended] = useState(p.recommendedBy ?? "");

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { setMsg("บันทึกแล้ว"); router.refresh(); setTimeout(() => setMsg(null), 3000); }
      else setErr(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  function onEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    act(() => editCustomer({
      id: p.id,
      first_name: firstName, last_name: lastName,
      email, phone,
      customer_group: group as "normal" | "vip" | "special",
      sex: (sex || null) as "M" | "F" | "other" | null,
      birthday: birthday || null,
      line_id: lineId || null,
      recommended_by: recommended || null,
    }));
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm">การจัดการ</h3>

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <div className="flex flex-wrap gap-2">
        {p.status !== "active" && (
          <Button size="sm" onClick={() => act(() => approveCustomer(p.id))} disabled={pending}>
            ✅ อนุมัติ
          </Button>
        )}
        {p.status === "active" && (
          <Button size="sm" variant="outline" onClick={() => act(() => suspendCustomer(p.id))} disabled={pending}>
            🚫 ระงับ
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowEdit((v) => !v)} disabled={pending}>
          {showEdit ? "ซ่อนฟอร์มแก้ไข" : "✏️ แก้ไขข้อมูล"}
        </Button>
      </div>

      {showEdit && (
        <form onSubmit={onEditSubmit} className="space-y-3 pt-2 border-t border-border">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium">ชื่อ</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">นามสกุล</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">อีเมล</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">เบอร์โทร</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium">กลุ่มลูกค้า</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className={inputCls}>
                <option value="normal">ทั่วไป</option>
                <option value="vip">VIP</option>
                <option value="special">พิเศษ</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">เพศ</span>
              <select value={sex} onChange={(e) => setSex(e.target.value)} className={inputCls}>
                <option value="">—</option>
                <option value="M">ชาย</option>
                <option value="F">หญิง</option>
                <option value="other">อื่นๆ</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium">วันเกิด</span>
              <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">LINE ID</span>
              <input value={lineId} onChange={(e) => setLineId(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">แนะนำโดย</span>
            <input value={recommended} onChange={(e) => setRecommended(e.target.value)} className={inputCls} />
          </label>
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </Button>
        </form>
      )}
    </div>
  );
}
