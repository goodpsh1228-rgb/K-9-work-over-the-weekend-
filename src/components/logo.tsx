// ─────────────────────────────────────────────────────────────
// 로고: 방패 + 발바닥 (군견훈육중대 마크)
//   tone="blue"  → 파랑 방패 + 흰 발바닥 (로그인 화면 등 밝은 바탕)
//   tone="white" → 흰 방패 + 검정 발바닥 (상단 검정 바)
//   같은 모양을 public 이 아닌 src/app/icon.svg 에도 한 벌 둡니다(브라우저 탭 아이콘).
// ─────────────────────────────────────────────────────────────
export function Logo({ size = 24, tone = "blue" }: { size?: number; tone?: "blue" | "white" }) {
  const shield = tone === "blue" ? "#0066cc" : "#ffffff";
  const paw = tone === "blue" ? "#ffffff" : "#000000";
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className="shrink-0">
      <path d="M48 6 L82 18 V46 Q82 74 48 90 Q14 74 14 46 V18 Z" fill={shield} />
      <ellipse cx="48" cy="60" rx="13" ry="10" fill={paw} />
      <ellipse cx="31" cy="44" rx="5" ry="6.5" fill={paw} transform="rotate(-20 31 44)" />
      <ellipse cx="42" cy="34" rx="5" ry="7" fill={paw} />
      <ellipse cx="54" cy="34" rx="5" ry="7" fill={paw} />
      <ellipse cx="65" cy="44" rx="5" ry="6.5" fill={paw} transform="rotate(20 65 44)" />
    </svg>
  );
}
