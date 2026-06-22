/**
 * Shared render-time formatters for the ฝากสั่งซื้อ print document —
 * used by BOTH the legacy/PCS skin (`page.tsx`) and the PEAK skin
 * (`shop-document-paper.tsx`) so money strings + the Thai baht-text +
 * the marketplace name + dates render IDENTICALLY across skins.
 *
 * Every function is transcribed 1:1 from `member/include/function.php`
 * (the legacy helpers printShop.php used). Pure module — no React/IO.
 */

/** number_format($n, $d) — the PHP money formatter (default 2dp). */
export function numberFormat(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** MySQL DATE_FORMAT(x,'%d/%m/%Y %T') → 'DD/MM/YYYY HH:MM:SS' (no tz shift). */
export function fmtDMYHMS(s: string | null): string {
  if (!s) return "";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]} ${pad2(Number(m[4]))}:${pad2(Number(m[5]))}:${pad2(Number(m[6]))}`;
}

/** nameProvider($cProvider) — member/include/function.php L25-34. */
export function nameProvider(cProvider: string): string {
  switch (cProvider) {
    case "1": return "1688";
    case "2": return "Taobao";
    case "3": return "Tmall";
    case "4": return "Shops";
    case "5": return "Nice";
    default:  return cProvider;
  }
}

/** replaceSpace($str) — member/include/function.php L376-378. */
export function replaceSpace(str: string): string {
  return str.replace(/ /g, "");
}

/* ── Convert($amount) — the Thai baht-text reader.
 *    member/include/function.php (Convert + ReadNumber). ── */
const POSITION_CALL = ["แสน", "หมื่น", "พัน", "ร้อย", "สิบ", ""];
const NUMBER_CALL = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

function readNumber(numStr: string): string {
  let number = Number(numStr) || 0;
  let ret = "";
  if (number === 0) return ret;
  if (number > 1000000) {
    ret += readNumber(String(Math.trunc(number / 1000000))) + "ล้าน";
    number = Math.trunc(number % 1000000);
  }
  let divider = 100000;
  let pos = 0;
  while (number > 0) {
    const d = Math.trunc(number / divider);
    ret +=
      divider === 10 && d === 2
        ? "ยี่"
        : divider === 10 && d === 1
          ? ""
          : divider === 1 && d === 1 && ret !== ""
            ? "เอ็ด"
            : NUMBER_CALL[d];
    ret += d ? POSITION_CALL[pos] : "";
    number = number % divider;
    divider = divider / 10;
    pos++;
  }
  return ret;
}

export function convert(amount: number): string {
  // number_format($amount, 2, ".", "") — no thousands separator.
  const amountNumber = (Number(amount) || 0).toFixed(2);
  const pt = amountNumber.indexOf(".");
  const numberPart = pt === -1 ? amountNumber : amountNumber.slice(0, pt);
  const fractionPart = pt === -1 ? "" : amountNumber.slice(pt + 1);

  let ret = "";
  const baht = readNumber(numberPart);
  if (baht !== "") ret += baht + "บาท";
  const satang = readNumber(fractionPart);
  if (satang !== "") ret += satang + "สตางค์";
  else ret += "ถ้วน";
  return ret;
}
