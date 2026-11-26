import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

// The Slowride brand font. Regular is the original drawing; Bold comes from the family
// built in the Slowride workspace (Tools/slowride-font).
const slowride = localFont({
  src: [
    { path: "./fonts/SlowRide-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SlowRide-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-slowride",
  display: "swap",
});

export const metadata: Metadata = { title: "Pull Board" };
// Use the screen's real width; Board scales the 1920x1080 layout to fit it. (A fixed width=1920 here
// made the Fire Stick, whose 1080p screen is 960 CSS px wide, show the board at 2x.)
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={slowride.variable}>
      <body>{children}</body>
    </html>
  );
}
