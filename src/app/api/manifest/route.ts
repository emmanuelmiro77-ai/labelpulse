import { NextResponse } from "next/server";

export async function GET() {
  const manifest = {
    name: "LabelPulse — DJ & Producer Demo Manager",
    short_name: "LabelPulse",
    description:
      "Track your demo submissions, manage label contacts, and generate professional A&R pitch emails. Built for DJs and producers.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0a14",
    theme_color: "#a855f7",
    orientation: "any",
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["music", "productivity", "utilities"],
    lang: "it",
    dir: "ltr",
  };

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=604800",
    },
  });
}
