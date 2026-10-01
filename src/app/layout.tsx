// ─────────────────────────────────────────────────────────────
// 모든 화면을 감싸는 "공통 틀" (layout)
// 여기서 정한 설정(언어, 제목, 글꼴 등)이 모든 페이지에 적용됩니다.
// ─────────────────────────────────────────────────────────────
import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// 템플릿 글꼴 Poppins (영문·숫자용). 배포할 때 사이트 안에 함께 저장되어 외부 접속 없이 보입니다.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

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
    <html lang="ko" className={`h-full antialiased ${poppins.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
