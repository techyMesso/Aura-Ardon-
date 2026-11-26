import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 78,
          fontFamily: "Georgia, serif",
          letterSpacing: "-0.04em"
        }}
      >
        AA
      </div>
    ),
    size
  );
}

