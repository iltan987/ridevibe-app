import type { MetadataRoute } from "next";
import { THEME_COLORS } from "../lib/theme.ts"; // relative + extension: `node --test` can't resolve `@/`

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ride & Vibe",
    short_name: "Ride & Vibe",
    id: "/",
    start_url: "/",
    // Lets getInstalledRelatedApps() recognise the installed copy of this very app (the install store reads it).
    related_applications: [{ platform: "webapp", url: "https://ridevibe.com.tr/manifest.webmanifest" }],
    display: "standalone",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
