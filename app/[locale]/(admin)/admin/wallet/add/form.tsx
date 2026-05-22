"use client";

/**
 * Client form for /admin/wallet/add — talks to `adminCreateWalletHsManual`
 * in actions/admin/wallet-hs.ts. Submits → revalidates → resets on success.
 *
 * Faithful-port note: writes to legacy `tb_wallet_hs` (NOT rebuilt
 * `wallet_transactions`). Customer is identified by `userid` (PR####
 * varchar), NOT a Pacred profile UUID.
 */

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminCreateWalletHsManual } from "@/actions/admin/wallet-hs";

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

const KIND_OPTIONS = [
  { value: "deposit",    label: "เติมเงิน (ยอด +)" },
  { value: "withdraw",   label: "ถอนเงิน (ยอด −)" },
  { value: "adjustment", label: "ปรับยอด (ใส่ +/− เอง)" },
] as const;

const TYPESERVICE_OPTIONS = [
  { value: "1", label: "ฝากสั่งซื้อ (cargo)" },
  { value: "2", label: "ฝากนำเข้า (freight)" },
  { value: "3", label: "ฝากโอน (transfer)" },
] as const;

type Kind = typeof KIND_OPTIONS[number]["value"];
type TypeService = typeof TYPESERVICE_OPTIONS[number]["value"];

export function AdminWalletAddForm({
  preset,
  recent,
}: {
  preset: CustomerLite | null;
  recent: CustomerLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [userid, setUserid]         = useState<string>(preset?.userid ?? "");
  const [kind, setKind]             = useState<Kind>("deposit");
  const [typeService, setTypeService] = useState<TypeService>("1");
  const [amount, setAmount]         = useState<string>("");
  const [bankName, setBankName]     = useState<string>("");
  const [acctName, setAcctName]     = useState<string>("");
  const [acctNumber, setAcctNumber] = useState<string>("");
  const [slipDate, setSlipDate]     = useState<string>("");
  const [paydeposit, setPaydeposit] = useState<boolean>(false);
  const [note, setNote]             = useState<string>("");

  // Wave 12-A — slip-file state (optional · uploads to slips bucket on submit)
  const [slipFile, setSlipFile]       = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Revoke any in-flight ObjectURL when the file changes / component unmounts
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userid) {
      setError("เลือกสมาชิกก่อน");
      return;
    }

    const amt = parseFloat(amount.replace(/,/g, ""));
    if (Number.isNaN(amt) || amt === 0) {
      setError("จำนวนเงินไม่ถูกต้อง");
      return;
    }

    startTransition(async () => {
      const result = await adminCreateWalletHsManual(
        {
          userid,
          kind,
          amount: amt,
          deposit_namebank: bankName || undefined,
          nameuserbank:     acctName || undefined,
          nouserbank:       acctNumber || undefined,
          dateslip:         slipDate || undefined,
          paydeposit,
          typeservice:      typeService,
          note:             note || undefined,
        },
        slipFile,                       // Wave 12-A — optional slip upload
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(
        `บันทึกสำเร็จ (id ${result.data?.id}) · ยอดใหม่ของลูกค้า = ฿${(result.data?.new_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
      setAmount("");
      setNote("");
      setSlipDate("");
      selectSlip(null);
      if (slipInputRef.current) slipInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="form-horizontal" style={{ marginTop: 16 }}>
      {/* Customer selection */}
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
            ถ้าไม่เห็นสมาชิก ใช้ <code>/admin/wallet/add?q=PR1234</code> เพื่อระบุตรง
          </small>
        </div>
      </div>

      {/* Kind + TypeService */}
      <div className="row mb-1">
        <div className="col-md-6">
          <label className="form-control-label">ประเภทรายการ</label>
          <select
            className="form-control"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            disabled={pending}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-control-label">บริการ (typeservice)</label>
          <select
            className="form-control"
            value={typeService}
            onChange={(e) => setTypeService(e.target.value as TypeService)}
            disabled={pending}
          >
            {TYPESERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div className="row mb-1">
        <div className="col-md-6">
          <label className="form-control-label">จำนวน (บาท) <span style={{ color: "red" }}>*</span></label>
          <input
            type="text"
            inputMode="decimal"
            className="form-control"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={kind === "adjustment" ? "เช่น -250 หรือ 500" : "เช่น 1000.00"}
            disabled={pending}
            required
          />
          <small className="form-text text-muted">
            {kind === "deposit"
              ? "ใส่เป็นเลขบวก (เช่น 1500.00) · ระบบจะบวกยอดให้"
              : kind === "withdraw"
                ? "ใส่เป็นเลขบวก · ระบบจะหักยอดให้อัตโนมัติ"
                : "ใส่ตัวเลขบวก/ลบเองได้ตามต้องการ (เช่น -250)"}
          </small>
        </div>
        <div className="col-md-6">
          <label className="form-control-label">วันที่สลิป</label>
          <input
            type="date"
            className="form-control"
            value={slipDate}
            onChange={(e) => setSlipDate(e.target.value)}
            disabled={pending}
          />
          <small className="form-text text-muted">(optional) ถ้ามีหลักฐานการโอน</small>
        </div>
      </div>

      {/* Bank info */}
      <div className="row mb-1">
        <div className="col-md-4">
          <label className="form-control-label">ธนาคารปลายทาง</label>
          <input
            type="text"
            className="form-control"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="เช่น KBANK / SCB"
            disabled={pending}
            maxLength={100}
          />
        </div>
        <div className="col-md-4">
          <label className="form-control-label">ชื่อบัญชี</label>
          <input
            type="text"
            className="form-control"
            value={acctName}
            onChange={(e) => setAcctName(e.target.value)}
            disabled={pending}
            maxLength={200}
          />
        </div>
        <div className="col-md-4">
          <label className="form-control-label">เลขที่บัญชี</label>
          <input
            type="text"
            className="form-control"
            value={acctNumber}
            onChange={(e) => setAcctNumber(e.target.value)}
            disabled={pending}
            maxLength={200}
          />
        </div>
      </div>

      {/* Wave 12-A — slip upload (optional) */}
      <div className="row mb-1">
        <div className="col-md-12">
          <label className="form-control-label">หลักฐานการโอน (สลิป) <small className="text-muted">— optional</small></label>
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

      {/* VIP credit flag */}
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
              เป็นเครดิต VIP (paydeposit=1) — ใช้กับลูกค้าเครดิต
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
            placeholder="เหตุผลที่บันทึกรายการนี้ (เช่น 'สลิปลูกค้า PR1234 ระบบไม่จับ — เพิ่มเข้าด้วยตนเอง')"
            disabled={pending}
            maxLength={1000}
          />
        </div>
      </div>

      {/* Feedback */}
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

      {/* Actions */}
      <div className="modal-footer" style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <button
          type="button"
          className="btn btn-outline-secondary round"
          onClick={() => {
            setAmount(""); setNote(""); setBankName(""); setAcctName("");
            setAcctNumber(""); setSlipDate(""); setError(null); setSuccess(null);
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
          disabled={pending || !userid || !amount}
        >
          {pending ? "กำลังบันทึก..." : "บันทึกรายการ"}
        </button>
      </div>
    </form>
  );
}
