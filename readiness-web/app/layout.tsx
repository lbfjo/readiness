import type { Metadata, Viewport } from "next";
import { Inter, Unbounded } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Readiness — Athlete Recovery App",
  description: "Understand recovery. Optimize performance. Be ready for what matters.",
  manifest: "/manifest.webmanifest",
  applicationName: "Readiness",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Readiness",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1320",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
