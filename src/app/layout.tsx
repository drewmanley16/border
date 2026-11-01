import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { AppShell } from "@/components/dashboard/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "StableFlow",
  description: "Watch money move at internet speed. A simulated global network of stablecoin transfers on a live 3D globe.",
};

export const viewport: Viewport = {
  themeColor: "#05070D",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
