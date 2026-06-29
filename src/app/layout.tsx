import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PWAInstall } from "@/components/pwa-install";
import { SWUpdater } from "@/components/sw-updater";
import { AuthProvider } from "@/components/auth-provider";
import { PostHogProvider } from "@/components/posthog-provider";
import { BugsnagErrorBoundary } from "@/components/bugsnag-error-boundary";
import { CookieConsent } from "@/components/cookie-consent";
import { StorageQuotaWarning } from "@/components/storage-quota-warning";

const geistSans = localFont({
  src: [
    { path: "../fonts/geist-sans/Carlito-Regular.ttf", style: "normal", weight: "400" },
    { path: "../fonts/geist-sans/Carlito-Bold.ttf", style: "normal", weight: "700" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    { path: "../fonts/geist-mono/DejaVuSansMono.ttf", style: "normal", weight: "400" },
    { path: "../fonts/geist-mono/DejaVuSansMono-Bold.ttf", style: "normal", weight: "700" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#a855f7",
};

export const metadata: Metadata = {
  title: "LabelPulse — Demo Manager for DJs & Producers",
  description:
    "Track your demo submissions, manage label contacts, and generate professional A&R pitch emails. Built for DJs and producers.",
  keywords: [
    "demo tracker",
    "label database",
    "A&R pitch",
    "DJ tools",
    "music production",
  ],
  authors: [{ name: "LabelPulse" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LabelPulse",
  },
  openGraph: {
    title: "LabelPulse",
    description: "DJ & Producer Demo Manager",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="LabelPulse" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <PostHogProvider>
            <BugsnagErrorBoundary>
              {children}
            </BugsnagErrorBoundary>
          </PostHogProvider>
        </AuthProvider>
        <Toaster />
        <PWAInstall />
        <SWUpdater />
        <CookieConsent />
        <StorageQuotaWarning />
      </body>
    </html>
  );
}
