import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/app/providers";
import { MobileTabs, Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Exercise Coach",
  description: "Build, refine and run whole-body routines with an AI coach",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1014" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Suspense>
            <Nav />
          </Suspense>
          <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 sm:py-6">{children}</main>
          <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">
            Not medical advice; consult your care team.
          </footer>
          <Suspense>
            <MobileTabs />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
