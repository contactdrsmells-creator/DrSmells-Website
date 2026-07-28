import { ImageResponse } from "next/og";

/**
 * Browser tab icon. Without this, Next.js serves its default favicon — the
 * Vercel triangle — which is what was showing on the live site.
 *
 * Generated rather than a static file because there is no logo asset in the
 * repo (the header is text). To use the real logo instead, drop a square PNG at
 * src/app/icon.png and delete this file — Next.js prefers the static file.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2B3A1B", // brand olive
          color: "#FFFFFF",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          borderRadius: 6,
        }}
      >
        Dr
      </div>
    ),
    size,
  );
}
