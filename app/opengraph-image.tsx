import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Pacred — นำเข้า ส่งออก ชิปปิ้ง เคลียร์ศุลกากร ครบวงจร";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [regular, bold] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Sarabun-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/Sarabun-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(135deg, #B30000 0%, #7A0000 60%, #420000 100%)",
          color: "white",
          fontFamily: "Sarabun",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#B30000",
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -2,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
            Pacred
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
              maxWidth: 980,
            }}
          >
            นำเข้า ส่งออก ชิปปิ้ง
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
              color: "#FFE0E0",
            }}
          >
            เคลียร์ศุลกากรครบวงจร
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 26,
            opacity: 0.95,
          }}
        >
          <div style={{ display: "flex", gap: 24 }}>
            <span>FCL · LCL</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>รถ · เรือ · อากาศ</span>
          </div>
          <div style={{ fontWeight: 700 }}>pacred.co</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Sarabun", data: regular, style: "normal", weight: 400 },
        { name: "Sarabun", data: bold,    style: "normal", weight: 700 },
      ],
    },
  );
}
