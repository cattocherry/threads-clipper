import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RETHREAD",
  description: "쓰레드 링크를 빠르게 저장하고 다시 찾는 로컬 우선 아카이브",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RETHREAD"
  },
  icons: {
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#070707",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
