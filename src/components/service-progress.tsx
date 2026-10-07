"use client";
// ─────────────────────────────────────────────────────────────
// 전역 진행률 카드(어두운 단색 타일) — 입대일 0시부터 전역일 0시(한국 시간)까지 지난 비율을
// 소수점 7자리까지 보여 주고, 0.1초마다 조금씩 올라갑니다.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

const kst = (date: string) => new Date(`${date}T00:00:00+09:00`).getTime();

export function ServiceProgress({ enlist, discharge, dDay }: { enlist: string; discharge: string; dDay: number }) {
  const [pct, setPct] = useState<number | null>(null); // 화면이 뜬 뒤 계산 (처음엔 "--")
  useEffect(() => {
    const start = kst(enlist);
    const end = kst(discharge);
    const tick = () => setPct(Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [enlist, discharge]);

  return (
    <div className="rounded-[18px] bg-tile px-5 py-6 text-white">
      <div className="flex items-baseline justify-between">
        <p className="text-[21px] leading-[1.19] font-semibold tracking-[-0.01em]">전역</p>
        <p className="text-[21px] font-semibold tabular-nums">{dDay > 0 ? `D-${dDay}` : dDay === 0 ? "D-Day" : "전역 완료"}</p>
      </div>
      {/* 진행 막대: 회색 트랙 + 밝은 파랑(#2997ff) 채움 */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-[#2997ff]" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] tabular-nums">{pct === null ? "--" : `${pct.toFixed(7)}%`}</p>
    </div>
  );
}
