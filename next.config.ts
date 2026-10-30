import type { NextConfig } from "next";

/**
 * Folders holding uploaded media — images and the product-page videos.
 *
 * Every upload is saved with a timestamp in its name ("…-1784789404995.mp4"),
 * so a given URL always means the same bytes and replacing a video in the admin
 * produces a different URL. That makes these safe to cache forever.
 */
const MEDIA_FOLDERS = ["icons", "images", "product-sections", "products", "reviews", "videos"];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /**
         * Tell the phone it may keep these.
         *
         * Vercel serves files from public/ as "max-age=0, must-revalidate",
         * which means a phone asks about every image and every video on every
         * visit before it may show what it already has. On mobile data that
         * round trip is most of the wait, and it is paid again on each page —
         * the product-page video sat as an empty gap while the browser checked
         * whether a file that cannot change had changed.
         *
         * "immutable" is the part that matters: it stops the revalidation
         * request being made at all, so a returning visitor paints the video
         * from disk instead of the network.
         */
        source: `/:folder(${MEDIA_FOLDERS.join("|")})/:path*`,
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
