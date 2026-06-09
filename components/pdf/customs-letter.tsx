/**
 * W11 — Customs-letter kit PDF generator.
 *
 * One component renders any of the kit's letter types (DO-release LOI per
 * carrier · ZIM Split-DO · 45-day waiver · POA · amend · lost-doc) from a
 * `CustomsLetterData`. Pure templating over shipment + parties data — mirrors
 * the existing `freight-do-letter.tsx` pattern (Sarabun font, A4 Thai letter,
 * cancelled-watermark unused here since letters are stateless drafts).
 *
 * Source: `Project dev/FORM/` doc-kit. See `lib/customs/customs-letters.ts`.
 *
 * Server-rendered via `@react-pdf/renderer` from
 * `app/api/customs-letter/route.tsx`.
 *
 * Server-only.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS } from "./styles";
import { CONTACT } from "@/components/seo/site";
import {
  type CustomsLetterData,
  findCarrier,
  findLetterType,
  BL_RELEASE_STATUS_LABEL,
} from "@/lib/customs/customs-letters";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

function formatDateThai(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatTaxId(id: string | null): string {
  if (!id) return "—";
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

function carrierDisplayName(data: CustomsLetterData): string {
  if (data.carrierNameOverride && data.carrierNameOverride.trim()) {
    return data.carrierNameOverride.trim();
  }
  const c = findCarrier(data.carrierCode);
  return c ? `${c.nameEn} (${c.nameTh})` : "[Shipping Line Agent]";
}

// ── Reusable row ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <Text style={{ fontSize: 10, color: COLORS.muted, width: 150 }}>{label}</Text>
      <Text style={{ fontSize: 10, color: COLORS.foreground, flex: 1 }}>{value}</Text>
    </View>
  );
}

function SignatureBlock({ data }: { data: CustomsLetterData }) {
  return (
    <View style={{ marginTop: 28, alignItems: "flex-end" }}>
      <Text style={{ fontSize: 10, marginBottom: 36 }}>ขอแสดงความนับถือ</Text>
      <View style={{ alignItems: "center", minWidth: 240 }}>
        <View
          style={{
            width: "100%",
            borderTopWidth: 1,
            borderTopColor: COLORS.foreground,
            borderTopStyle: "solid",
            marginBottom: 4,
          }}
        />
        <Text style={{ fontSize: 10, fontWeight: "bold" }}>{data.senderName}</Text>
        {data.signatoryName && (
          <Text style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>
            {data.signatoryName}
          </Text>
        )}
        <Text style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>
          ตำแหน่ง: {data.signatoryTitle ?? "กรรมการบริษัท"}
        </Text>
        {data.senderTaxId && (
          <Text style={{ fontSize: 8, color: COLORS.muted, marginTop: 2 }}>
            เลขประจำตัวผู้เสียภาษี: {formatTaxId(data.senderTaxId)}
          </Text>
        )}
      </View>
    </View>
  );
}

function Letterhead({ data }: { data: CustomsLetterData }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontSize: 13, fontWeight: "bold", color: COLORS.foreground, marginBottom: 2 }}>
        {data.senderName}
      </Text>
      <Text style={{ fontSize: 9, color: COLORS.foreground, lineHeight: 1.4 }}>
        {data.senderAddress}
      </Text>
      {data.senderTaxId && (
        <Text style={{ fontSize: 9, color: COLORS.foreground, marginTop: 2 }}>
          เลขประจำตัวผู้เสียภาษี: {formatTaxId(data.senderTaxId)}
        </Text>
      )}
    </View>
  );
}

// ── Body builders per letter type ──────────────────────────────────────

function DoReleaseBody({ data }: { data: CustomsLetterData }) {
  const carrier = carrierDisplayName(data);
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: "bold" }}>
          เรียน  แผนกออกใบสั่งปล่อยสินค้า (D/O / Release Office)
        </Text>
        <Text style={{ fontSize: 10, marginTop: 2 }}>{carrier}</Text>
      </View>

      <ReferenceBlock data={data} />

      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: "justify" }}>
          {"        "}
          เนื่องด้วยใบตราส่งฉบับนี้เป็นแบบ{" "}
          {data.blStatus ? BL_RELEASE_STATUS_LABEL[data.blStatus] : "Surrender / Telex Release"}{" "}
          ซึ่งไม่มีต้นฉบับ B/L บริษัทจึงขอแลกใบสั่งปล่อยสินค้า (Delivery Order)
          สำหรับสินค้าตามรายละเอียดข้างต้น โดย{" "}
          <Text style={{ fontWeight: "bold" }}>
            บริษัทยินดีรับผิดชอบทุกประการ
          </Text>{" "}
          (Letter of Indemnity) หากเกิดความเสียหายใดๆ จากการออกใบสั่งปล่อยดังกล่าว
          กรุณาออกใบสั่งปล่อยให้กับบริษัทด้วย จะขอบพระคุณยิ่ง
        </Text>
      </View>
    </>
  );
}

function SplitDoBody({ data }: { data: CustomsLetterData }) {
  const carrier = carrierDisplayName(data);
  const sets = data.splitSets ?? [];
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: "bold" }}>เรียน  ZIM Delivery Order / Release Office</Text>
        <Text style={{ fontSize: 10, marginTop: 2 }}>{carrier}</Text>
      </View>
      <ReferenceBlock data={data} />
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6 }}>
          {"        "}
          บริษัทขอแยกใบสั่งปล่อยสินค้า (Split Delivery Order) ออกเป็น{" "}
          {sets.length || "N"} ชุด ตามรายละเอียดแต่ละชุดดังนี้
        </Text>
      </View>
      {sets.length === 0 ? (
        <Text style={{ fontSize: 9, color: COLORS.muted, marginBottom: 12 }}>
          (ยังไม่ได้ระบุชุดแยก — เพิ่มชุดในหน้าจอก่อนออกเอกสาร)
        </Text>
      ) : (
        sets.map((s) => (
          <View
            key={s.setNo}
            style={{
              marginBottom: 8,
              padding: 8,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderStyle: "solid",
              borderRadius: 3,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 3 }}>
              ชุดที่ {s.setNo}
            </Text>
            <DetailRow label="ผู้รับ (Consignee)" value={s.consignee || "—"} />
            <DetailRow label="Marks & Numbers" value={s.marksAndNumbers ?? "—"} />
            <DetailRow label="Packages" value={s.packages ?? "—"} />
            <DetailRow label="Description" value={s.description ?? "—"} />
            <DetailRow label="Container No." value={s.containerNo ?? "—"} />
            <DetailRow
              label="Weight / Volume"
              value={`${s.weightKg != null ? `${s.weightKg.toFixed(2)} KG` : "—"}${
                s.volumeCbm != null ? ` · ${s.volumeCbm.toFixed(3)} CBM` : ""
              }`}
            />
          </View>
        ))
      )}
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6 }}>
          ทั้งนี้บริษัทยินดีรับผิดชอบทุกประการ (Letter of Indemnity) สำหรับการแยกชุดดังกล่าว
        </Text>
      </View>
    </>
  );
}

function Waiver45Body({ data }: { data: CustomsLetterData }) {
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: "bold" }}>
          เรียน  นายด่านศุลกากร {data.customsOffice ?? "[ระบุด่าน]"}
        </Text>
      </View>
      <ReferenceBlock data={data} />
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: "justify" }}>
          {"        "}
          ด้วยสินค้าตามใบตราส่งข้างต้น ซึ่งมาถึงเมื่อวันที่{" "}
          {formatDateThai(data.arrivalDateIso)} ยังไม่ได้นำออกจากอารักขาศุลกากร
          เกินกำหนดระยะเวลา บริษัทขอผ่อนผันการนำของออก (ตามแบบ 304 04 15)
          โดยยินดีวางประกันเป็นจำนวน{" "}
          <Text style={{ fontWeight: "bold" }}>
            25% ของอากรประเมิน
            {data.estimatedDutyThb != null
              ? ` (ประมาณ ฿${(data.estimatedDutyThb * 0.25).toLocaleString("th-TH", { minimumFractionDigits: 2 })})`
              : ""}
          </Text>{" "}
          และจะดำเนินการเคลียร์สินค้าให้แล้วเสร็จภายใน 15 วันทำการนับจากวันที่ได้รับอนุมัติ
          จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ จะขอบพระคุณยิ่ง
        </Text>
      </View>
    </>
  );
}

function PoaBody({ data }: { data: CustomsLetterData }) {
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: "bold", color: COLORS.primary, textAlign: "center" }}>
          หนังสือมอบอำนาจ
        </Text>
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: "justify" }}>
          {"        "}
          โดยหนังสือฉบับนี้ <Text style={{ fontWeight: "bold" }}>{data.senderName}</Text>
          {data.senderTaxId ? ` (เลขประจำตัวผู้เสียภาษี ${formatTaxId(data.senderTaxId)})` : ""}{" "}
          ขอมอบอำนาจให้{" "}
          <Text style={{ fontWeight: "bold" }}>{data.granteeName ?? "[ชื่อผู้รับมอบอำนาจ]"}</Text>
          {data.granteeIdCardNo ? ` (บัตรประชาชนเลขที่ ${data.granteeIdCardNo})` : ""}{" "}
          เป็นผู้มีอำนาจกระทำการแทนในการ{" "}
          <Text style={{ fontWeight: "bold" }}>รับใบสั่งปล่อยสินค้า (Delivery Order)</Text>{" "}
          สำหรับสินค้าตามรายละเอียดดังต่อไปนี้
        </Text>
      </View>
      <ReferenceBlock data={data} />
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6 }}>
          การใดที่ผู้รับมอบอำนาจได้กระทำไปภายใต้หนังสือมอบอำนาจนี้
          ให้ถือเสมือนว่าผู้มอบอำนาจได้กระทำด้วยตนเองทุกประการ
        </Text>
      </View>
    </>
  );
}

function AmendBody({ data }: { data: CustomsLetterData }) {
  const carrier = carrierDisplayName(data);
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: "bold" }}>เรียน  แผนกเอกสาร / Documentation</Text>
        <Text style={{ fontSize: 10, marginTop: 2 }}>{carrier}</Text>
      </View>
      <ReferenceBlock data={data} />
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: "justify" }}>
          {"        "}
          บริษัทขอแก้ไขข้อมูล{" "}
          <Text style={{ fontWeight: "bold" }}>{data.amendField ?? "[ระบุข้อมูลที่แก้]"}</Text>{" "}
          ในเอกสารขนส่งข้างต้น จากเดิม "{data.amendOldValue ?? "—"}" เป็น{" "}
          "{data.amendNewValue ?? "—"}" โดยข้อมูลที่ถูกต้องเป็นไปตามที่ระบุข้างต้น
          กรุณาดำเนินการแก้ไข (Amend) ให้กับบริษัทด้วย จะขอบพระคุณยิ่ง
        </Text>
      </View>
    </>
  );
}

function LostDocBody({ data }: { data: CustomsLetterData }) {
  const list = data.lostReceiptNumbers ?? [];
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: "bold" }}>
          เรียน  นายด่านศุลกากร {data.customsOffice ?? "[ระบุด่าน]"}
        </Text>
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: "justify" }}>
          {"        "}
          ด้วยใบเสร็จรับเงินศุลกากร (กศก.122) ได้สูญหายระหว่างการขนส่งทาง{" "}
          {data.courierName ?? "[ขนส่ง]"}
          {data.courierTrackingNo ? ` (เลขพัสดุ ${data.courierTrackingNo})` : ""}{" "}
          บริษัทจึงขอแจ้งเอกสารสูญหายและขอออกใบแทน ตามรายการเลขที่ใบเสร็จดังต่อไปนี้
        </Text>
      </View>
      <View
        style={{
          marginBottom: 12,
          padding: 10,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderStyle: "solid",
          borderRadius: 3,
          backgroundColor: COLORS.surfaceAlt,
        }}
      >
        {list.length === 0 ? (
          <Text style={{ fontSize: 9, color: COLORS.muted }}>(ยังไม่ได้ระบุเลขใบเสร็จที่สูญหาย)</Text>
        ) : (
          list.map((n, i) => (
            <Text key={`${n}-${i}`} style={{ fontSize: 10, marginBottom: 2 }}>
              {i + 1}. {n}
            </Text>
          ))
        )}
      </View>
      {data.policeReportNote && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 9, color: COLORS.muted }}>
            หมายเหตุ: {data.policeReportNote}
          </Text>
        </View>
      )}
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6 }}>
          จึงเรียนมาเพื่อโปรดพิจารณาออกใบแทนให้กับบริษัทด้วย (แนบรายงานประจำวันตำรวจ)
          จะขอบพระคุณยิ่ง
        </Text>
      </View>
    </>
  );
}

/** Shared reference detail block (logistics + cargo). */
function ReferenceBlock({ data }: { data: CustomsLetterData }) {
  return (
    <View
      style={{
        marginBottom: 14,
        padding: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderStyle: "solid",
        borderRadius: 3,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      {data.refNo && <DetailRow label="อ้างอิง (Ref.)" value={data.refNo} />}
      {data.jobNo && <DetailRow label="งาน (Job)" value={data.jobNo} />}
      <DetailRow
        label="ผู้รับ (Consignee)"
        value={data.consigneeName + (data.consigneeTaxId ? ` · ${formatTaxId(data.consigneeTaxId)}` : "")}
      />
      {data.blNo && <DetailRow label="B/L No." value={data.blNo + (data.blStatus ? ` (${data.blStatus})` : "")} />}
      {data.awbTrackingNo && <DetailRow label="AWB / Tracking" value={data.awbTrackingNo} />}
      {data.vesselVoyage && <DetailRow label="M.V./VOY" value={data.vesselVoyage} />}
      {data.portLoading && <DetailRow label="Port of Loading" value={data.portLoading} />}
      {data.portDischarge && <DetailRow label="Port of Discharge" value={data.portDischarge} />}
      {data.placeDelivery && <DetailRow label="Place of Delivery" value={data.placeDelivery} />}
      {(data.containerNo || data.containerCodeInternal) && (
        <DetailRow
          label="Container Nos."
          value={[data.containerNo, data.containerCodeInternal ? `(Pacred: ${data.containerCodeInternal})` : null]
            .filter(Boolean)
            .join(" ")}
        />
      )}
      {data.cargoDescription && <DetailRow label="Cargo" value={data.cargoDescription} />}
      {data.totalCartons != null && (
        <DetailRow label="Packages" value={`${Number(data.totalCartons).toLocaleString("en-US")} cartons`} />
      )}
      {data.totalWeightKg != null && (
        <DetailRow
          label="Weight"
          value={`${Number(data.totalWeightKg).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`}
        />
      )}
      {data.totalVolumeCbm != null && (
        <DetailRow
          label="Volume"
          value={`${Number(data.totalVolumeCbm).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} CBM`}
        />
      )}
    </View>
  );
}

function LetterBody({ data }: { data: CustomsLetterData }) {
  switch (data.letterType) {
    case "do_release": return <DoReleaseBody data={data} />;
    case "do_split":   return <SplitDoBody data={data} />;
    case "waiver_45":  return <Waiver45Body data={data} />;
    case "poa":        return <PoaBody data={data} />;
    case "amend":      return <AmendBody data={data} />;
    case "lost_doc":   return <LostDocBody data={data} />;
    default:           return <DoReleaseBody data={data} />;
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function CustomsLetter({ data }: { data: CustomsLetterData }) {
  const meta = findLetterType(data.letterType);
  return (
    <Document
      title={`Pacred ${meta?.titleTh ?? "Customs Letter"} ${data.refNo ?? data.jobNo ?? ""}`}
      author="Pacred"
      subject={meta?.titleTh ?? "Customs letter"}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        <Letterhead data={data} />

        {/* Date — right-aligned, Thai พ.ศ. */}
        <View style={{ alignItems: "flex-end", marginBottom: 14 }}>
          <Text style={{ fontSize: 10 }}>วันที่ {formatDateThai(data.issueDateIso)}</Text>
        </View>

        {/* Subject */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: "bold", color: COLORS.primary }}>
            เรื่อง  {meta?.subjectTh ?? "—"}
          </Text>
        </View>

        <LetterBody data={data} />

        <SignatureBlock data={data} />

        {/* Draft banner — these letters are stateless drafts for staff to print + stamp */}
        <View style={{ marginTop: 18, alignItems: "center" }}>
          <Text style={{ fontSize: 8, color: COLORS.muted }}>
            (ร่างเอกสาร — โปรดประทับตราบริษัทและลงนามก่อนใช้งานจริง)
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Pacred · {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
