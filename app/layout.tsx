/**
 * RootLayout (app/layout.tsx)
 * 
 * 애플리케이션의 최상위 레이아웃 컴포넌트입니다.
 * 폰트 설정, 메타데이터 정의 및 전역 스타일(globals.css)을 로드하며,
 * 모든 페이지의 공통 뼈대를 형성합니다.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist 폰트 설정
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 애플리케이션 메타데이터 (SEO 및 브라우저 탭 제목)
export const metadata: Metadata = {
  title: "🎭 Party Game - 단어 맞추기 게임",
  description: "심판과 함께하는 실시간 단어 맞추기 웹 채팅 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
