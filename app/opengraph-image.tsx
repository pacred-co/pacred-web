import { renderOgImage } from "@/lib/og/render-og-image";

export const alt = "Pacred — นำเข้า ส่งออก ชิปปิ้ง เคลียร์ศุลกากร ครบวงจร";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgImage({
    line1: "นำเข้า ส่งออก ชิปปิ้ง",
    line2: "เคลียร์ศุลกากรครบวงจร",
    chips: ["FCL · LCL", "รถ · เรือ · อากาศ"],
  });
}
