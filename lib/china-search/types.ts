/**
 * Shared types for the china-search adapters (P-50 / P-51 / P-52 / P-53).
 *
 * Lives outside the `server-only` boundary so pure-helper modules and
 * their tsx tests can `import type` without dragging the Next.js
 * server-only sentinel into a node test runner.
 */

export type ChinaSearchHit = {
  provider: "1688" | "taobao" | "tmall";
  product_id?: string;
  title: string;
  url:   string;
  image_url?: string;
  price_cny?: number;
  shop_name?: string;
};

/** Rich product detail returned when a single URL is converted.
 *  Mirrors the legacy `json->data` shape so callers don't care which
 *  upstream provider answered. */
export type ChinaProductDetail = {
  provider:     "1688" | "taobao" | "tmall";
  product_id?:  string;
  title:        string;
  url:          string;
  shop_name?:   string;
  main_image?:  string;
  images?:      string[];
  base_price_cny?: number;
  promo_price_cny?: number;
  stock_total?: number;

  /** Property axes: e.g. [{ name: 'สี', values: [{label:'แดง', image, data}, ...]}, ...] */
  sku_axes?: Array<{
    name: string;
    values: Array<{ label: string; image?: string; data?: string; is_image?: boolean }>;
  }>;

  /** Flattened combinations — one row per buyable SKU.
   *  prop_path identifies which axis-values combine to make this row. */
  sku_map?: Array<{
    sku_id:     string;
    prop_path:  Record<string, string>;     // { 'สี': 'แดง', 'ขนาด': 'M' }
    price_cny:  number;
    stock:      number;
    image?:     string;
  }>;

  /**
   * ทำไมถึงได้การ์ดเปล่า (demo) แทนของจริง — undefined = ของจริง.
   *
   * เดิมทุกความล้มเหลวยุบเป็นก้อนเดียว ทำให้จอบอกลูกค้าว่า "ไม่พบข้อมูลสินค้า"
   * ทั้งที่บางทีสินค้ามีอยู่จริง แค่ TAMIT ตอบช้าเกิน timeout (owner 2026-08-04
   * "ลิงก์สินค้าใช้ไม่ได้ ... พอกดรายการถัดไปแล้วเพิ่มลิงก์ดันใช้ได้เฉย" — การเพิ่ม
   * แท็บใหม่คือการลองใหม่นั่นเอง). แยก 2 กรณีเพื่อให้ข้อความตรงความจริง:
   *   - `not_found`   TAMIT ตอบ status 204 = ไม่มีสินค้านี้จริง → กรอกเอง (ลองใหม่ไม่ช่วย)
   *   - `unreachable` timeout / เน็ตล่ม / HTTP พัง = ยังไม่รู้ → เสนอ "ลองอีกครั้ง"
   *   - `no_product_id` สกัดรหัสสินค้าจาก URL ไม่ได้ → กรอกเอง
   */
  fallback_reason?: "not_found" | "unreachable" | "no_product_id";
};

export type ConvertProductResult =
  | { available: false; reason: string; message?: string }
  | { available: true; detail: ChinaProductDetail };

export type ChinaSearchResult =
  | { available: false; reason: "not_configured" | "network_error" | "rate_limited"; message?: string }
  | { available: true;  hits: ChinaSearchHit[]; page: number; has_more: boolean };
