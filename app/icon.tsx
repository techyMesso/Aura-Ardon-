import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 16,
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

