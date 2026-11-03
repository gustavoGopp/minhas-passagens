import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Minhas Passagens",
    short_name: "Passagens",
    description: "Suas passagens, preços e feriados em um só lugar.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0e1116",
    theme_color: "#1e4fd8",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
