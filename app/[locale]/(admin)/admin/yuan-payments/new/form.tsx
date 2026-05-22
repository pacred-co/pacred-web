"use client";

/**
 * Client form for /admin/yuan-payments/new — talks to
 * `adminCreateYuanPaymentManual` in actions/admin/yuan-payments-tb.ts.
 * Submits → revalidates → resets on success.
 *
 * Faithful-port: writes to legacy `tb_payment`. Customer is identified
 * by `userid` (PR####). THB total previewed client-side.
 */

import { useRef, useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminCreateYuanPaymentManual } from "@/actions/admin/yuan-payments-tb";

export type CustomerLite = {
  userid:       string;
  username:     string | null;
  userlastname: string | null;
  usertel:      string | null;
  useremail:    string | null;
};

function labelCustomer(c: CustomerLite | null | undefined): string {
  if (!c) return "—";
  const name = `${c.username ?? ""} ${c.userlastname ?? ""}`.trim();
  return `${c.userid} · ${name || c.usertel || c.useremail || "(ไม่มีชื่อ)"}`;
}

const PAYTYPE_OPTIONS = [
  { value: "1", label: "Alipay" },
  { value: "2", label: "Wechat" },
  { value: "3", label: "Union Pay / Bank" },
  { value: "4", label: "USDT" },
] as const;

type PayType = typeof PAYTYPE_OPTIONS[number]["value"];

export function AdminYuanPaymentNewForm({
  preset,
  recent,
  defaultRate,
}: {
  preset:      CustomerLite | null;
  recent:      CustomerLite[];
  defaultRate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [userid, setUserid]       = useState<string>(preset?.userid ?? "");
  const [paytype, setPaytype]     = useState<PayType>("1");
  const [paydetail, setPaydetail] = useState<string>("");
  const [payyuan, setPayyuan]     = useState<string>("");
  const [payrate, setPayrate]     = useState<string>(defaultRate ? defaultRate.toFixed(2) : "5.00");
  const [paycost, setPaycost]     = useState<string>("");      // admin cost rate (optional)
  const [paydeposit, setPaydeposit] = useState<boolean>(false);
  const [note, setNote]           = useState<string>("");

  // Wave 12-A — slip-file state (optional · uploads to slips bucket on submit)
  const [slipFile, setSlipFile]       = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (slipPreview) URL.revokeObjectURL(slipPreview);
    };
  }, [slipPreview]);

  function selectSlip(f: File | null) {
    setError(null);
    setSlipFile(f);
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    if (f && f.type.startsWith("image/")) {
      setSlipPreview(URL.createObjectURL(f));
    } else {
      setSlipPreview(null);
    }
  }

  // Preview computed THB total.
  const previewThb = useMemo(() => {
    const yuan = parseFloat(payyuan.replace(/,/g, ""));
    const rate = parseFloat(payrate.replace(/,/g, ""));
    if (Number.isNaN(yuan) || Number.isNaN(rate) || yuan <= 0 || rate <= 0) return null;
    return Math.round(yuan * rate * 100) / 100;
  }, [payyuan, payrate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userid) { setError("เลือกสมาชิกก่อน"); return; }

    const yuan = parseFloat(payyuan.replace(/,/g, ""));
    const rate = parseFloat(payrate.replace(/,/g, ""));
    if (Number.isNaN(yuan) || yuan <= 0) { setError("จำนวน CNY ไม่ถูกต้อง"); return; }
    if (Number.isNaN(rate) || rate <= 0) { setError("เรทไม่ถูกต้อง"); return; }
    if (!paydetail.trim()) { setError("ระบุชื่อ/บัญชีผู้รับ"); return; }

    const costRate = paycost.trim() ? parseFloat(paycost.replace(/,/g, "")) : undefined;
    if (paycost.trim() && (Number.isNaN(costRate ?? NaN) || (costRate ?? -1) < 0)) {
      setError("cost rate ไม่ถูกต้อง"); return;
    }

    startTransition(async () => {
      const result = await adminCreateYuanPaymentManual(
        {
          userid,
          paytype,
          paydetail: paydetail.trim(),
          payyuan: yuan,
          payrate: rate,
          payratecost: costRate,
          paydeposit,
          note: note || undefined,
        },
        slipFile,                       // Wave 12-A — optional admin-attached slip
      );

      if (!result.ok) { setError(result.error); return; }

      setSuccess(
        `บันทึกสำเร็จ (id ${result.data?.id}) · THB total = ฿${(result.data?.paythb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
      setPayyuan("");
      setPaydetail("");
      setNote("");
      selectSlip(null);
      if (slipInputRef.current) slipInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="form-horizontal" style={{ marginTop: 16 }}>
      {/* Customer */}
      <div className="row mb-1">
        <div className="col-md-12">
          <label className="form-control-label">สมาชิก <span style={{ color: "red" }}>*</span></label>
          {preset && (
            <div className="alert alert-info" role="alert" style={{ marginBottom: 8 }}>
              ✓ Preselected: <strong>{labelCustomer(preset)}</strong>
            </div>
          )}
          <select
            className="form-control"
            value={userid}
            onChange={(e) => setUserid(e.target.value)}
            disabled={pending}
            required
          >
            <option value="">— เลือกจากสมาชิกล่าสุด —</option>
            {recent.map((c) => (
              <option key={c.userid} value={c.userid}>{labelCustomer(c)}</option>
            ))}
            {preset && !recent.find((c) => c.userid === preset.userid) && (
              <option value={preset.userid}>{labelCustomer(preset)}</option>
            )}
          </select>
          <small className="form-text text-muted">
            ถ้าไม่เห็นสมาชิก ใช้ <code>/admin/yuan-payments/new?q=PR1234</code> เพื่อระบุตรง
          </small>
        </div>
      </div>

      {/* Channel + Detail */}
      <div className="row mb-1">
        <div className="col-md-4">
          <label className="form-control-label">ช่องทาง</label>
          <select
            className="form-control"
            value={paytype}
            onChange={(e) => setPaytype(e.target.value as PayType)}
            disabled={pending}
          >
            {PAYTYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="col-md-8">
          <label className="form-control-label">ผู้รับ (ชื่อ / บัญชี / wallet ID) <span style={{ color: "red" }}>*</span></label>
          <input
            type="text"
            className="form-control"
            value={paydetail}
            onChange={(e) => setPaydetail(e.target.value)}
            placeholder="เช่น 张三 · alipay 123@xx.com"
            disabled={pending}
            required
            maxLength={2000}
          />
        </div>
      </div>

      {/* Amount + Rate */}
      <div className="row mb-1">
        <div className="col-md-4">
          <label className="form-control-label">จำนวน CNY <span style={{ color: "red" }}>*</span></label>
          <input
            type="text"
            inputMode="decimal"
            className="form-control"
            value={payyuan}
            onChange={(e) => setPayyuan(e.target.value)}
            placeholder="¥100.00"
            disabled={pending}
            required
          />
        </div>
        <div className="col-md-4">
          <label className="form-control-label">เรท (THB/CNY) <span style={{ color: "red" }}>*</span></label>
          <input
            type="text"
            inputMode="decimal"
            className="form-control"
            value={payrate}
            onChange={(e) => setPayrate(e.target.value)}
            placeholder="5.00"
            disabled={pending}
            required
          />
          <small className="form-text text-muted">default = tb_settings.rsdefault</small>
        </div>
        <div className="col-md-4">
          <label className="form-control-label">cost rate (admin)</label>
          <input
            type="text"
            inputMode="decimal"
            className="form-control"
            value={paycost}
            onChange={(e) => setPaycost(e.target.value)}
            placeholder="เช่น 4.95"
            disabled={pending}
          />
          <small className="form-text text-muted">(optional) ใช้คำนวน margin</small>
        </div>
      </div>

      {/* Preview */}
      {previewThb != null && (
        <div className="alert alert-success" role="alert" style={{ marginTop: 8 }}>
          พรีวิว THB total = <strong>฿{previewThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
      )}

      {/* Wave 12-A — slip upload (optional · admin-attached proof) */}
      <div className="row mb-1">
        <div className="col-md-12">
          <label className="form-control-label">
            หลักฐานการโอน (สลิป) <small className="text-muted">— optional · เก็บใน imagesslipadmin</small>
          </label>
          <label
            style={{
              display:      "block",
              border:       slipFile ? "2px dashed #5cb85c" : "2px dashed #d1d5db",
              borderRadius: 12,
              padding:      14,
              background:   slipFile ? "rgba(92,184,92,0.05)" : "rgba(241,243,247,0.4)",
              cursor:       pending ? "not-allowed" : "pointer",
              transition:   "all 0.15s",
            }}
          >
            <input
              ref={slipInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              style={{ display: "none" }}
              disabled={pending}
              onChange={(e) => selectSlip(e.currentTarget.files?.[0] ?? null)}
            />
            {slipFile ? (
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {slipPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slipPreview}
                    alt="พรีวิวสลิป"
                    style={{
                      maxHeight: 120,
                      maxWidth: 160,
                      borderRadius: 6,
                      border: "1px solid #e2e6ee",
                      background: "#fff",
                      objectFit: "contain",
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 500, wordBreak: "break-all" }}>{slipFile.name}</p>
                  <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#6b7280" }}>
                    {(slipFile.size / 1024).toFixed(1)} KB · {slipFile.type || "unknown"}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={(e) => {
                      e.preventDefault();
                      selectSlip(null);
                      if (slipInputRef.current) slipInputRef.current.value = "";
                    }}
                    style={{
                      marginTop: 6,
                      background: "transparent",
                      border:     "none",
                      color:      "#dc2626",
                      fontSize:   12,
                      cursor:     "pointer",
                      padding:    0,
                    }}
                  >
                    ลบไฟล์
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontSize: 22 }}>📄</div>
                <p style={{ margin: "4px 0 0 0", fontWeight: 500 }}>คลิกเพื่อเลือกไฟล์สลิป</p>
                <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#6b7280" }}>
                  JPG / PNG / PDF · ≤ 5 MB
                </p>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Paid via wallet */}
      <div className="row mb-1">
        <div className="col-md-12">
          <div className="form-check">
            <label className="form-check-label">
              <input
                type="checkbox"
                className="form-check-input"
                checked={paydeposit}
                onChange={(e) => setPaydeposit(e.target.checked)}
                disabled={pending}
              />{" "}
              ลูกค้าจ่ายจาก wallet (paydeposit=1)
            </label>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="row mb-1">
        <div className="col-md-12">
          <label className="form-control-label">หมายเหตุ</label>
          <textarea
            className="form-control"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            maxLength={1000}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" role="alert" style={{ marginTop: 12 }}>
          ✓ {success}
        </div>
      )}

      <div className="modal-footer" style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <button
          type="button"
          className="btn btn-outline-secondary round"
          onClick={() => {
            setPayyuan(""); setPaydetail(""); setNote(""); setPaycost("");
            setError(null); setSuccess(null);
            selectSlip(null);
            if (slipInputRef.current) slipInputRef.current.value = "";
          }}
          disabled={pending}
        >
          ล้างฟอร์ม
        </button>
        <button
          type="submit"
          className="btn btn-color-main round"
          disabled={pending || !userid || !payyuan || !paydetail}
        >
          {pending ? "กำลังบันทึก..." : "บันทึกรายการ"}
        </button>
      </div>
    </form>
  );
}
