"use client";
// ─────────────────────────────────────────────────────────────
// 보라 그라데이션 카드 + 남은 시간 (템플릿의 "Remaining time for the election")
//   예) ⏳ 이번 주 투표 마감까지  1일 4시간 30분 29초
//   target 시각까지 1초마다 줄어듭니다. 지나면 "새로고침" 안내.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

export function CountdownCard({ title, target, sub }: { title: string; target: string; sub?: string }) {
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

  return (
    <div className="rounded-2xl bg-[linear-gradient(141deg,#4b2afa_15%,#2c1994_94%)] p-4 text-white shadow-lg shadow-blue-600/25">
      <p className="flex items-center gap-2 font-bold">
        <span aria-hidden>⏳</span>
        {title}
      </p>
      <div className="mt-3 grid grid-cols-4 text-center">
        {parts.map((p) => (
          <div key={p.unit}>
            <p className="text-3xl leading-tight font-bold tabular-nums">{p.n}</p>
            <p className="text-sm font-semibold opacity-90">{p.unit}</p>
          </div>
        ))}
      </div>
      {sub && <p className="mt-2 text-center text-xs opacity-80">{sub}</p>}
      {left === 0 && <p className="mt-1 text-center text-xs">시간이 지났습니다. 화면을 새로고침하세요.</p>}
    </div>
  );
}
