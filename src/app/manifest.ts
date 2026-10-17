// ─────────────────────────────────────────────────────────────
// 홈 화면에 추가했을 때의 앱 정보 (이름·아이콘·색)
//   아이폰: 공유 버튼 → "홈 화면에 추가" 하면 군견(파란 바탕) 아이콘이 생깁니다(아이콘은 src/app/apple-icon.png).
//   안드로이드: 아래 icons 를 사용합니다.
//   맨 위 검정 바의 [홈 화면에 추가] 버튼은 src/components/install-button.tsx 입니다.
// ─────────────────────────────────────────────────────────────
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "군견훈육중대 주말출근 관리체계",
    short_name: "주말출근",
    description: "주말·공휴일 출근 희망 투표 및 추첨",
    id: "/home",
    start_url: "/home",
    scope: "/",
    lang: "ko",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f7",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
