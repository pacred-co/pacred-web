/**
 * <DocCertRow> — the SHARED "✍️ รับรอง" (certified signature/stamp) row used by
 * EVERY money-doc "paper" template (ใบเสร็จ · ใบวางบิล · ฝากสั่งซื้อ doc · …).
 *
 * Owner directive 2026-07-05 (ROOT-FIX): each paper hand-rolled its own cert
 * row → they drifted (box order, box shapes, missing boxes, the ผู้รับ box
 * rendered as a full square instead of a signing line). This ONE component is
 * now the single home for the cert row; every paper imports it and deletes its
 * copy, so one fix fixes every document and it can never re-drift.
 *
 * Box order (left→right), matching PEAK + the owner's spec:
 *   1. ผู้ออกเอกสาร (ผู้ขาย)   — SIGNATURE box: sign image + bottom LINE + name/date
 *   2. ผู้อนุมัติเอกสาร (ผู้ขาย) — SIGNATURE box (same shape)   [optional]
 *   3. ตราประทับ (ผู้ขาย)      — the PACRED stamp image over a line
 *   4. ผู้รับเอกสาร (ลูกค้า)    — SIGNATURE box: empty space + bottom SIGNING LINE
 *                                 + customer name.  ⚠️ NOT a bordered square —
 *                                 a square is reserved for a stamp (owner:
 *                                 "ต้องเป็นแค่ขีดให้เซ็นลายเซ็น ไม่ใช่กรอบสี่เหลี่ยม").
 *   5. ตราประทับ (ลูกค้า)      — an empty DASHED SQUARE box for the customer stamp
 *   6. QR (สแกนเพื่อเปิดด้วยเว็บไซต์) — MOVED TO LAST so the ลายเซ็นรับรอง headers
 *                                 aren't crowded/covered.  [optional]
 *
 * The row label "✍️ รับรอง" stays at the LEFT (rendered by the caller via
 * <DocSectionLabel section="certify"/> OR pass `showLabel` to have this render it).
 *
 * Server Component — imports only site constants + next/image. No supabase/auth.
 */

import Image from "next/image";
import { DOC_SIGNATORY } from "@/components/seo/site";
import { DocSectionLabel } from "./doc-section-label";

const SIGNATURE_SRC = DOC_SIGNATORY.signature; // "/legacy/pcs/assets/images/theme/sin-wandee.jpg"
const STAMP_SRC = "/images/pacred-stamp-tight.png";
const LINE = "0.5px solid #374151"; // the bottom signing line (solid, like PEAK's cert boxes)

export type DocCertRowProps = {
  /** QR data-url for "สแกนเพื่อเปิดด้วยเว็บไซต์" — rendered as the LAST box.
   *  Omit → the QR box is not shown (e.g. a surface with no public view). */
  qrDataUrl?: string;
  qrAlt?: string;
  /** The customer name printed under the ผู้รับเอกสาร signing line. */
  customerName: string;
  /** The seller signatory name (defaults to DOC_SIGNATORY.name). */
  signatoryName?: string;
  /** Date shown under the seller signature boxes (issue/create date). */
  dateIssued?: string;
  /** Approver name — when set, the ผู้อนุมัติเอกสาร box is shown. Pass "" to hide. */
  approverName?: string;
  /** Label of the first seller signature box. Default "ผู้ออกเอกสาร (ผู้ขาย)"
   *  (ใบวางบิล passes "ผู้วางบิล (ผู้ขาย)" · quote passes its own). */
  issuerLabel?: string;
  /** Label of the customer receive box. Default "ผู้รับเอกสาร (ลูกค้า)". */
  receiverLabel?: string;
  /** Box body height. Receipt uses 13mm, ใบวางบิล/shop use 18mm. Default 13mm. */
  boxHeight?: string;
  /** Render the "✍️ รับรอง" left label inside this component. Default false —
   *  most papers render it themselves so they control the row wrapper. */
  showLabel?: boolean;
  /** Gap between boxes (matches each paper's existing row gap). Default "2mm". */
  gap?: string;
};

export function DocCertRow({
  qrDataUrl,
  qrAlt = "QR",
  customerName,
  signatoryName = DOC_SIGNATORY.name,
  dateIssued,
  approverName,
  issuerLabel = "ผู้ออกเอกสาร (ผู้ขาย)",
  receiverLabel = "ผู้รับเอกสาร (ลูกค้า)",
  boxHeight = "13mm",
  showLabel = false,
  gap = "2mm",
}: DocCertRowProps) {
  const showApprover = approverName !== "";
  return (
    <div style={{ display: "flex", gap, alignItems: "stretch", flex: 1 }}>
      {showLabel && (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", minWidth: "14mm" }}>
          <DocSectionLabel section="certify" />
        </div>
      )}

      {/* 1 · ผู้ออกเอกสาร (ผู้ขาย) — signature box */}
      <SignBox label={issuerLabel}>
        <SignImage boxHeight={boxHeight} />
        <SignFooter name={signatoryName} date={dateIssued} />
      </SignBox>

      {/* 2 · ผู้อนุมัติเอกสาร (ผู้ขาย) — signature box (optional) */}
      {showApprover && (
        <SignBox label="ผู้อนุมัติเอกสาร (ผู้ขาย)">
          <SignImage boxHeight={boxHeight} />
          <SignFooter name={approverName || signatoryName} date={dateIssued} />
        </SignBox>
      )}

      {/* 3 · ตราประทับ (ผู้ขาย) — the Pacred stamp image */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <BoxLabel>ตราประทับ (ผู้ขาย)</BoxLabel>
        <div style={{ display: "flex", justifyContent: "center", height: boxHeight, alignItems: "center" }}>
          <Image
            src={STAMP_SRC}
            alt="ตราประทับ"
            width={106}
            height={58}
            unoptimized
            style={{ width: "auto", height: boxHeight }}
          />
        </div>
        <div style={{ borderTop: LINE, paddingTop: "2px" }}>
          <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>&nbsp;</p>
        </div>
      </div>

      {/* 4 · ผู้รับเอกสาร (ลูกค้า) — SIGNING LINE (empty space + bottom line + name).
             NOT a bordered square (owner: a square is only for a stamp). */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <BoxLabel>{receiverLabel}</BoxLabel>
        {/* empty space to sign in — no border */}
        <div style={{ height: boxHeight }} />
        <div style={{ borderTop: LINE, paddingTop: "2px" }}>
          <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{customerName || " "}</p>
        </div>
      </div>

      {/* 5 · ตราประทับ (ลูกค้า) — empty DASHED SQUARE for the customer stamp */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <BoxLabel>ตราประทับ (ลูกค้า)</BoxLabel>
        <div style={{ height: boxHeight, border: "0.5px dashed #d1d5db", borderRadius: "2px" }} />
        <div style={{ borderTop: LINE, paddingTop: "2px" }}>
          <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>&nbsp;</p>
        </div>
      </div>

      {/* 6 · QR — MOVED TO LAST (optional) */}
      {qrDataUrl && (
        <div style={{ flex: 1, textAlign: "center" }}>
          <BoxLabel>สแกนเพื่อเปิดด้วยเว็บไซต์</BoxLabel>
          <div style={{ display: "flex", justifyContent: "center", height: boxHeight, alignItems: "center" }}>
            <Image
              src={qrDataUrl}
              alt={qrAlt}
              width={120}
              height={120}
              unoptimized
              style={{ width: boxHeight, height: boxHeight, display: "block" }}
            />
          </div>
          {/* QR box has NO signing line (owner 2026-07-06: "QR ไม่ต้องใส่ขีดเส้นใต้").
              Keep the same paddingTop spacer so its height still lines up with the
              signature/stamp boxes that DO carry a bottom line. */}
          <div style={{ paddingTop: "2px" }}>
            <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>&nbsp;</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── internal presentational helpers (kept private to the shared component) ──

function BoxLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>{children}</p>
  );
}

function SignBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <BoxLabel>{label}</BoxLabel>
      {children}
    </div>
  );
}

function SignImage({ boxHeight }: { boxHeight: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", height: boxHeight, alignItems: "flex-end" }}>
      <Image
        src={SIGNATURE_SRC}
        alt="ลายมือชื่อ"
        width={70}
        height={28}
        unoptimized
        style={{ width: "20mm", height: "auto" }}
      />
    </div>
  );
}

function SignFooter({ name, date }: { name: string; date?: string }) {
  return (
    <div style={{ borderTop: LINE, paddingTop: "2px" }}>
      <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{name}</p>
      {date != null && date !== "" && (
        <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>{date}</p>
      )}
    </div>
  );
}
