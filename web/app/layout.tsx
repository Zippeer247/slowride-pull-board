import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Pull Board" };
// Use the screen's real width; Board scales the 1920x1080 layout to fit it. (A fixed width=1920 here
// made the Fire Stick, whose 1080p screen is 960 CSS px wide, show the board at 2x.)
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
