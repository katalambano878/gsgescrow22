import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sell-Safe Buy-Safe",
    short_name: "SBBS",
    description:
      "Ghana's protected checkout. SBBS holds the buyer's money safely until the goods arrive as promised.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBFAFC",
    theme_color: "#4F2BB8",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
