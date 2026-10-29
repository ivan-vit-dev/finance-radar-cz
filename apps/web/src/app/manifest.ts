import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Umožňuje nainstalovat aplikaci jako desktopovou PWA (Chrome/Edge).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance Radar",
    short_name: "Finance Radar",
    description: "Váš přehled českého finančního trhu. Každý den.",
    start_url: "/",
    display: "standalone",
    background_color: "#070a13",
    theme_color: "#070a13",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
