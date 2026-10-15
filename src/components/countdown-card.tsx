"use client";
// ─────────────────────────────────────────────────────────────
// 남은 시간 카드 — 애플의 어두운 타일(#272729 단색, 그라데이션·그림자 없음)
//   예) 이번 주 투표 마감까지  1일 4시간 30분 29초
//   target 시각까지 1초마다 줄어듭니다. 지나면 "새로고침" 안내.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

export function CountdownCard({ title, target, sub, compact = false }: { title: string; target: string; sub?: string; compact?: boolean }) {
  // 남은 밀리초 (처음엔 모름 → "--" 표시, 화면이 뜬 뒤 계산)
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = new Date(target).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const s = left === null ? null : Math.floor(left / 1000);
  const parts = [
    { n: s === null ? "--" : Math.floor(s / 86400), unit: "일" },
    { n: s === null ? "--" : Math.floor((s % 86400) / 3600), unit: "시간" },
    { n: s === null ? "--" : Math.floor((s % 3600) / 60), unit: "분" },
    { n: s === null ? "--" : s % 60, unit: "초" },
  ];

  // 작은 한 줄 표시 (홈 화면: 눈에 덜 띄게)
  if (compact) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-full bg-tile px-4 py-2 text-xs text-white">
        <span className="min-w-0 truncate text-[#cccccc]">
          {title}
          {sub ? ` · ${sub}` : ""}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">
          {parts[0].n}일 {parts[1].n}시간 {parts[2].n}분
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-tile px-5 py-6 text-white">
      <p className="text-[21px] leading-[1.19] font-semibold tracking-[-0.01em]">{title}</p>
      <div className="mt-4 grid grid-cols-4 text-center">
        {parts.map((p) => (
          <div key={p.unit}>
            <p className="text-[40px] leading-[1.1] font-semibold tracking-[-0.02em] tabular-nums">{p.n}</p>
            <p className="mt-1 text-sm text-[#cccccc]">{p.unit}</p>
          </div>
        ))}
      </div>
      {sub && <p className="mt-4 text-center text-xs text-[#cccccc]">{sub}</p>}
      {left === 0 && <p className="mt-1 text-center text-xs text-[#2997ff]">시간이 지났습니다. 화면을 새로고침하세요.</p>}
    </div>
  );
}
