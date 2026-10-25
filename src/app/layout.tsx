import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/manrope";
import "@fontsource/dm-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kept — a record of the things you live with",
  description: "Remember when you bought it, how long you have used it, and when it was last cared for.",
  applicationName: "Kept",
  openGraph: {
    title: "Kept — a record of the things you live with",
    description: "A personal time-index for things you own, use, and maintain.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#f4f5ef", width: "device-width", initialScale: 1 };

const themeBootstrap = `try { const saved = localStorage.getItem("kept-theme-v1"); const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; document.documentElement.dataset.theme = saved === "dark" || (saved !== "light" && prefersDark) ? "dark" : "light"; } catch { document.documentElement.dataset.theme = "light"; }`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><Script id="kept-theme-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />{children}</body></html>;
}
