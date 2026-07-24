/**
 * ฟอร์ม "หนังสือรับรองการหักภาษี ณ ที่จ่าย (มาตรา 50 ทวิ)" — กระดาษกลาง 1 ฉบับ.
 *
 * ใช้ 2 ทิศ (fix-at-root — ห้ามก๊อปฟอร์มไว้ 2 ที่):
 *  · ลูกค้าเป็นผู้หัก  → /r/[token]/wht-form        (ผู้หัก=นิติลูกค้า · ผู้ถูกหัก=Pacred)
 *  · Pacred เป็นผู้หัก → /admin/accounting/ap/[id]/wht-form (ผู้หัก=Pacred · ผู้ถูกหัก=vendor)
 *
 * เลย์เอาต์ตามฟอร์มมาตรฐานกรมสรรพากร · 1 ฉบับ = ครึ่ง A4 (พิมพ์ 2 ฉบับ/แผ่น) ·
 * ⚠️ อย่าเพิ่มความสูง (ลายเซ็น = overlay absolute) — 2 ฉบับต้อง ≤ ~281mm
 * ไม่งั้นฉบับที่ 2 กระเด็นไปหน้า 2 (print-verify L-2 · วัดจริง 133.6mm/ฉบับ).
 */

const baht = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ช่องข้อมูลฝั่งบน (ผู้หัก/ผู้ถูกหัก) — คู่ label + ค่า ในกรอบมาตรฐานฟอร์ม. */
function Party({
  role,
  name,
  taxId,
  address,
}: {
  role: string;
  name: string;
  taxId: string;
  address: string;
}) {
  return (
    <div className="border border-gray-800 px-2 py-1">
      <p className="text-[11px] font-bold">{role}</p>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-gray-600">ชื่อ</span>
        <span className="border-b border-dotted border-gray-500 font-medium">{name || " "}</span>
        <span className="text-gray-600">เลขประจำตัวผู้เสียภาษีอากร</span>
        <span className="border-b border-dotted border-gray-500 font-mono tracking-wider">
          {taxId || " "}
        </span>
        <span className="text-gray-600">ที่อยู่</span>
        <span className="border-b border-dotted border-gray-500">{address || " "}</span>
      </div>
    </div>
  );
}

export function WhtFormPaper({
  copyLabel,
  copyNote,
  withholderName,
  withholderTaxId,
  withholderAddress,
  recipientName,
  recipientTaxId,
  recipientAddress,
  incomeLabel,
  payDate,
  paidAmount,
  whtAmount,
  whtAmountText,
  refLine,
  certNo,
  signatureUrl,
  stampUrl,
  signerName,
}: {
  copyLabel: string;
  copyNote: string;
  /** ผู้มีหน้าที่หักภาษี (ผู้จ่ายเงิน) — คนที่เซ็น+ประทับตราฟอร์มนี้ */
  withholderName: string;
  withholderTaxId: string;
  withholderAddress: string;
  /** ผู้ถูกหักภาษี (ผู้รับเงิน) */
  recipientName: string;
  recipientTaxId: string;
  recipientAddress: string;
  /** บรรทัดประเภทเงินได้ เช่น "ค่าบริการขนส่ง — หักภาษี ณ ที่จ่าย 1% (ท.ป.4/2528 · ม.3 เตรส)" */
  incomeLabel: React.ReactNode;
  payDate: string;
  paidAmount: number;
  whtAmount: number;
  /** ตัวอักษรของยอดภาษี (readThaiBaht ฝั่ง caller — component นี้ pure render) */
  whtAmountText: string;
  /** บรรทัดอ้างอิงใต้ เล่มที่/เลขที่ เช่น "เลขที่อ้างอิง (ใบเสร็จ Pacred): FRC…" */
  refLine: string;
  /** เลขที่เอกสารใบหัก — ว่าง = จุดให้เขียนมือ */
  certNo: string;
  /** ลายเซ็น/ตรายาง ของ "ผู้หัก" — null = เว้นช่องให้เซ็น/ประทับมือ */
  signatureUrl: string | null;
  stampUrl: string | null;
  /** ชื่อในวงเล็บใต้ลายเซ็น */
  signerName: string;
}) {
  return (
    <div className="wht-form bg-white px-4 py-2.5 text-black" style={{ fontSize: "11px", lineHeight: 1.3 }}>
      <div className="flex items-start justify-between">
        <div className="text-[10px] leading-tight">
          <p>
            เล่มที่ ..................{" "}
            เลขที่{" "}
            {certNo ? <span className="font-mono font-bold">{certNo}</span> : ".................."}
          </p>
          <p className="text-gray-600">{refLine}</p>
        </div>
        <div className="text-right text-[10px]">
          <p className="font-bold">{copyLabel}</p>
          <p>{copyNote}</p>
        </div>
      </div>

      <h1 className="mt-1 text-center text-[13px] font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
      <p className="text-center text-[10.5px]">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>

      <div className="mt-1.5 space-y-1.5">
        <Party
          role="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่ายเงิน)"
          name={withholderName}
          taxId={withholderTaxId}
          address={withholderAddress}
        />
        <Party
          role="ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเงิน)"
          name={recipientName}
          taxId={recipientTaxId}
          address={recipientAddress}
        />
      </div>

      {/* ลำดับที่ในแบบ — นิติจ่ายนิติ ค่าบริการ/ขนส่ง = นำส่งด้วย ภ.ง.ด.53 (ติ๊กให้เลย) */}
      <p className="mt-1 text-[10.5px]">
        ลำดับที่ .......... ในแบบ{" "}
        <span className="text-gray-600">
          ☐ ภ.ง.ด.1ก &nbsp;☐ ภ.ง.ด.1ก พิเศษ &nbsp;☐ ภ.ง.ด.2 &nbsp;☐ ภ.ง.ด.3 &nbsp;☐
          ภ.ง.ด.2ก &nbsp;☐ ภ.ง.ด.3ก
        </span>{" "}
        <span className="font-bold">☑ ภ.ง.ด.53</span>
      </p>

      <table className="mt-1.5 w-full border-collapse text-[11px] [&_td]:border [&_td]:border-gray-800 [&_td]:px-1 [&_td]:py-0.5 [&_th]:border [&_th]:border-gray-800 [&_th]:px-1 [&_th]:py-0.5">
        <thead>
          <tr className="text-center">
            <th className="p-1">ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th className="w-[92px] p-1">วัน เดือน ปี ที่จ่าย</th>
            <th className="w-[110px] p-1">จำนวนเงินที่จ่าย</th>
            <th className="w-[110px] p-1">ภาษีที่หักและนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-1">{incomeLabel}</td>
            <td className="p-1 text-center">{payDate}</td>
            <td className="p-1 text-right tabular-nums">{baht(paidAmount)}</td>
            <td className="p-1 text-right tabular-nums">{baht(whtAmount)}</td>
          </tr>
          <tr className="font-bold">
            <td className="p-1 text-right" colSpan={2}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
            <td className="p-1 text-right tabular-nums">{baht(paidAmount)}</td>
            <td className="p-1 text-right tabular-nums">{baht(whtAmount)}</td>
          </tr>
          <tr>
            <td className="p-1" colSpan={4}>
              รวมเงินภาษีที่หักนำส่ง (ตัวอักษร): <span className="font-medium">{whtAmountText}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-1.5 text-[11px]">
        ผู้จ่ายเงิน: <span className="font-bold">☑ (1) หัก ณ ที่จ่าย</span>
        <span className="ml-3 text-gray-600">☐ (2) ออกให้ตลอดไป ☐ (3) ออกให้ครั้งเดียว ☐ (4) อื่น ๆ</span>
      </p>

      <div className="mt-1.5 grid grid-cols-[1fr_120px] gap-2">
        <div className="border border-gray-800 px-2 py-1.5 text-center">
          <p className="text-[10.5px]">
            ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
          </p>
          {/* ลายเซ็น = overlay ทับเส้นจุด (absolute · สูง +0) — print-verify L-2 */}
          <p className="relative mt-5">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt=""
                className="absolute bottom-0 left-1/2 h-9 -translate-x-1/2 object-contain"
                style={{ mixBlendMode: "multiply" }}
              />
            ) : null}
            ลงชื่อ ............................................................ ผู้จ่ายเงิน
          </p>
          <p className="mt-1">( {signerName || "............................................................"} )</p>
          <p className="mt-1">วันที่ ............ / ................... / ...............</p>
        </div>
        {stampUrl ? (
          <div className="relative flex items-center justify-center border border-gray-800 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stampUrl}
              alt="ตรายางนิติบุคคล"
              className="max-h-[84px] object-contain"
              style={{ mixBlendMode: "multiply" }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center border border-gray-800 p-2 text-center text-[10.5px] text-gray-500">
            ประทับตรา
            <br />
            นิติบุคคล
            <br />
            (ถ้ามี)
          </div>
        )}
      </div>

      <p className="mt-0.5 text-[9.5px] leading-snug text-gray-600">
        คำเตือน: ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ
        แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
      </p>
    </div>
  );
}
