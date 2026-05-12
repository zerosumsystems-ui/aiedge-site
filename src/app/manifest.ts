import type { MetadataRoute } from "next"

/**
 * PWA manifest. Lets the user "Add to Home Screen" on iOS / Android
 * and get a standalone app shell with the AI Edge icon and theme.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Edge",
    short_name: "AI Edge",
    description: "Brooks Price Action trading command center",
    start_url: "/chart",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141414",
    theme_color: "#141414",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
