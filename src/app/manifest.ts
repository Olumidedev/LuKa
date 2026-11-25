import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luka — Your Sous-Chef",
    short_name: "Luka",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#d97706",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
