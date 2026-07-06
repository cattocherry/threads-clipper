import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모음 moeum — 흩어진 글을 한 곳에",
  description: "흩어진 글을 한 곳에 모아 균형 있게 다시 찾는 로컬 우선 아카이브",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "모음 moeum — 흩어진 글을 한 곳에",
    description: "흩어진 글을 한 곳에 모아 균형 있게 다시 찾는 로컬 우선 아카이브",
    siteName: "moeum"
  },
  appleWebApp: {
    capable: true,
    title: "moeum"
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#141518",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
