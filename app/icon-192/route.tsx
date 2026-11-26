import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1A1216",
          color: "#B8923E",
          fontSize: 84,
          fontFamily: "Georgia, serif",
          letterSpacing: "-0.04em"
        }}
      >
        AA
      </div>
    ),
    { width: 192, height: 192 }
  );
}

