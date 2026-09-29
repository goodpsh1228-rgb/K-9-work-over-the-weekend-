// ─────────────────────────────────────────────────────────────
// 모든 화면을 감싸는 "공통 틀" (layout)
// 여기서 정한 설정(언어, 제목, 글꼴 등)이 모든 페이지에 적용됩니다.
// ─────────────────────────────────────────────────────────────
import type { Metadata, Viewport } from "next";
import "./globals.css";

// 브라우저 탭에 보이는 제목과 설명
export const metadata: Metadata = {
  title: "주말·공휴일 출근 투표",
  description: "주말·공휴일 출근 희망 투표 및 추첨",
};

// 휴대폰 화면 폭에 맞춰 보이도록 하는 설정
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // lang="ko": 이 사이트가 한국어라는 표시
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
