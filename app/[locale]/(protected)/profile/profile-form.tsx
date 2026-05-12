"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateProfileBasic, upsertCorporate, updateNotifyChannels, unlinkLine } from "@/actions/profile";
import type { Profile } from "@/lib/auth/get-user";

type Corporate = {
  profile_id: string;
  tax_id: string;
  company_name: string;
  company_address: string | null;
  status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
};

type Props = {
  profile: Profile;
  corporate: Corporate | null;
};

export function ProfileForm({ profile, corporate }: Props) {
  const isJuristic = profile.account_type === "juristic";
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function onSubmitBasic(formData: FormData) {
    startTransition(async () => {
      const res = await updateProfileBasic({
        first_name:     String(formData.get("first_name") ?? ""),
        last_name:      String(formData.get("last_name") ?? ""),
        phone:          String(formData.get("phone") ?? ""),
        email:          String(formData.get("email") ?? ""),
        sex:            (formData.get("sex") || undefined) as "male" | "female" | "other" | undefined,
        birthday:       String(formData.get("birthday") ?? ""),
        line_id:        String(formData.get("line_id") ?? ""),
        facebook_url:   String(formData.get("facebook_url") ?? ""),
        freight_type:   (formData.get("freight_type") || undefined) as "seafreight" | "cargo" | undefined,
        pay_method:     (formData.get("pay_method") || undefined) as "origin" | "destination" | undefined,
        transport_type: String(formData.get("transport_type") ?? ""),
        ship_by:        String(formData.get("ship_by") ?? ""),
        shop_user:      formData.get("shop_user") === "on",
        note:           String(formData.get("note") ?? ""),
      });
      flash(res.ok ? "ok" : "err", res.ok ? "บันทึกแล้ว" : res.error);
    });
  }

  async function onSubmitCorporate(formData: FormData) {
    startTransition(async () => {
      const res = await upsertCorporate({
        tax_id:          String(formData.get("tax_id") ?? ""),
        company_name:    String(formData.get("company_name") ?? ""),
        company_address: String(formData.get("company_address") ?? ""),
      });
      flash(res.ok ? "ok" : "err", res.ok ? "บันทึกข้อมูลบริษัทแล้ว" : res.error);
    });
  }

  async function onToggleChannel(channel: "line" | "email", checked: boolean) {
    const next = {
      line:  profile.notify_channels?.line ?? true,
      email: profile.notify_channels?.email ?? true,
      [channel]: checked,
    };
    startTransition(async () => {
      const res = await updateNotifyChannels(next);
      flash(res.ok ? "ok" : "err", res.ok ? "อัพเดทแล้ว" : res.error);
    });
  }

  async function onUnlinkLine() {
    if (!confirm("ยกเลิกเชื่อม LINE? คุณจะไม่ได้รับ notification ผ่าน LINE อีก")) return;
    startTransition(async () => {
      const res = await unlinkLine();
      flash(res.ok ? "ok" : "err", res.ok ? "ยกเลิกเชื่อม LINE แล้ว" : res.error);
    });
  }

  return (
    <div className="space-y-8">
      {/* Flash message */}
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          msg.kind === "ok"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* ─── BASIC ─── */}
      <form action={onSubmitBasic} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">ข้อมูลส่วนตัว</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="ชื่อจริง" required>
            <input name="first_name" defaultValue={profile.first_name ?? ""} className={inputCls} required />
          </FormField>
          <FormField label="นามสกุล" required>
            <input name="last_name" defaultValue={profile.last_name ?? ""} className={inputCls} required />
          </FormField>
          <FormField label="เบอร์โทร" required hint="ขึ้นต้น 0 ตามด้วยตัวเลข 8-9 หลัก">
            <input name="phone" defaultValue={profile.phone ?? ""} className={inputCls} required />
          </FormField>
          <FormField label="อีเมล">
            <input name="email" type="email" defaultValue={profile.email ?? ""} className={inputCls} />
          </FormField>
          <FormField label="เพศ">
            <select name="sex" defaultValue={profile.sex ?? ""} className={inputCls}>
              <option value="">— ไม่ระบุ —</option>
              <option value="male">ชาย</option>
              <option value="female">หญิง</option>
              <option value="other">อื่นๆ</option>
            </select>
          </FormField>
          <FormField label="วันเกิด">
            <input name="birthday" type="date" defaultValue={profile.birthday ?? ""} className={inputCls} />
          </FormField>
          <FormField label="LINE ID">
            <input name="line_id" defaultValue={profile.line_id ?? ""} className={inputCls} />
          </FormField>
          <FormField label="Facebook URL">
            <input name="facebook_url" defaultValue={profile.facebook_url ?? ""} className={inputCls} />
          </FormField>
        </div>

        <hr className="border-border" />

        <h3 className="text-sm font-semibold text-foreground">การจัดส่ง</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="ประเภท Freight">
            <select name="freight_type" defaultValue={profile.freight_type ?? ""} className={inputCls}>
              <option value="">— ไม่ระบุ —</option>
              <option value="cargo">Cargo</option>
              <option value="seafreight">Sea Freight</option>
            </select>
          </FormField>
          <FormField label="วิธีเก็บเงิน">
            <select name="pay_method" defaultValue={profile.pay_method ?? ""} className={inputCls}>
              <option value="">— ไม่ระบุ —</option>
              <option value="origin">เก็บต้นทาง</option>
              <option value="destination">เก็บปลายทาง</option>
            </select>
          </FormField>
          <FormField label="Transport type">
            <input name="transport_type" defaultValue={profile.transport_type ?? ""} className={inputCls} placeholder="เช่น 1, 2" />
          </FormField>
          <FormField label="Ship by">
            <input name="ship_by" defaultValue={profile.ship_by ?? ""} className={inputCls} />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shop_user" defaultChecked={profile.shop_user} />
            <span>ซื้อไปใช้เอง (ไม่ได้ขายต่อ)</span>
          </label>
        </div>

        <FormField label="หมายเหตุ">
          <textarea name="note" rows={3} defaultValue={profile.note ?? ""} className={inputCls} />
        </FormField>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "กำลังบันทึก..." : "บันทึกข้อมูลส่วนตัว"}
          </Button>
        </div>
      </form>

      {/* ─── CORPORATE (juristic only) ─── */}
      {isJuristic && (
        <form action={onSubmitCorporate} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">ข้อมูลบริษัท (นิติบุคคล)</h2>
            {corporate && (
              <StatusBadge status={corporate.status} />
            )}
          </div>
          {corporate?.status === "rejected" && corporate.rejection_reason && (
            <p className="text-sm text-red-700 bg-red-50 rounded p-3">
              เหตุผลการปฏิเสธ: {corporate.rejection_reason}
            </p>
          )}

          <FormField label="เลขประจำตัวผู้เสียภาษี" required hint="13 หลัก">
            <input name="tax_id" defaultValue={corporate?.tax_id ?? profile.tax_id ?? ""} className={inputCls} required maxLength={13} />
          </FormField>
          <FormField label="ชื่อบริษัท" required>
            <input name="company_name" defaultValue={corporate?.company_name ?? profile.company_name ?? ""} className={inputCls} required />
          </FormField>
          <FormField label="ที่อยู่บริษัท" required>
            <textarea name="company_address" rows={3} defaultValue={corporate?.company_address ?? ""} className={inputCls} required />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก..." : "บันทึกข้อมูลบริษัท"}
            </Button>
          </div>
        </form>
      )}

      {/* ─── NOTIFICATIONS ─── */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">การแจ้งเตือน</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">LINE</p>
            <p className="text-xs text-muted">
              {profile.line_user_id
                ? `เชื่อมแล้ว ตั้งแต่ ${profile.line_linked_at ? new Date(profile.line_linked_at).toLocaleDateString("th-TH") : ""}`
                : "ยังไม่ได้เชื่อม LINE — กดเชื่อมเพื่อรับ notification ผ่าน LINE OA @pacred"}
            </p>
          </div>
          {profile.line_user_id ? (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.notify_channels?.line ?? true}
                onChange={(e) => onToggleChannel("line", e.target.checked)}
                disabled={pending}
              />
              <Button type="button" variant="outline" size="sm" onClick={onUnlinkLine} disabled={pending}>
                ยกเลิกเชื่อม
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled title="LINE Messaging API linking — coming in Phase F2">
              เชื่อม LINE (เร็วๆนี้)
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Email</p>
            <p className="text-xs text-muted">รับ notification สำคัญทาง email (fallback)</p>
          </div>
          <input
            type="checkbox"
            checked={profile.notify_channels?.email ?? true}
            onChange={(e) => onToggleChannel("email", e.target.checked)}
            disabled={pending}
          />
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function StatusBadge({ status }: { status: "pending" | "verified" | "rejected" }) {
  const styles = {
    pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
    verified: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  const labels = {
    pending:  "รอตรวจสอบ",
    verified: "ยืนยันแล้ว",
    rejected: "ปฏิเสธ",
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
