/**
 * Shared row/document types for the ฝากสั่งซื้อ (shop-order) print document.
 *
 * Extracted from `page.tsx` so BOTH the legacy/PCS skin (the page) and the
 * new PEAK skin (`shop-document-paper.tsx`) describe the same resolved
 * document shape — and the shared computation in `shop-document-data.ts`
 * can type its input without importing the page (which is a Server
 * Component, not a plain module). Pure types — no runtime.
 */

/** The columns printShop.php SELECTs from tb_header_order ⋈ tb_users. */
export type HeaderRow = {
  usercompany: string | null;
  userfullname: string | null;
  userid: string;
  userpicture: string | null;
  useremail: string | null;
  hstatus: string;
  hno: string;
  hdate: string | null;
  hdate2: string | null;
  htransporttype: string;
  hrate: number;
  hdatepayment: string | null;
  fulladdress: string | null;
};

/** The columns printShop.php SELECTs per item from tb_order. */
export type OrderRow = {
  cprovider: string;
  cnameshop: string;
  cshippingnumber: string;
  ctrackingnumber: string;
  ctitle: string;
  ccolor: string;
  csize: string;
  cimages: string;
  cprice: number;
  cshippingchn: number;
  camount: number;
  crewallet: string;
};

/** A single fully-resolved order ready to render as one print document. */
export type PrintDoc = {
  hNo: string;
  dataTitleEntry: string; // the raw $_GET['id'][$count0] value
  nameBill: string;       // ใบเสร็จรับเงิน | ใบแจ้งหนี้
  classText: string;      // h-title | h-title-danger
  isReceipt: boolean;     // print==1
  header: HeaderRow;
  corporateNumber: string;
  fName: string;          // 'คุณ' | '' (juristic)
  dateCreate: string;
  datePay: string;
  datePayExp: string;
  providers: {
    cProvider: string;
    shops: {
      cNameShop: string;
      cShippingNumber: string;
      cTrackingNumber: string;
      items: OrderRow[];
    }[];
  }[];
};
