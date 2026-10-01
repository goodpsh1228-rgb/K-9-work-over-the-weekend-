"use client";
// ─────────────────────────────────────────────────────────────
// 전역 진행률 카드 — 입대일 0시부터 전역일 0시(한국 시간)까지 지난 비율을
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
    <div className="rounded-2xl bg-[linear-gradient(141deg,#2c1994_10%,#150b47_95%)] p-4 text-white shadow-lg shadow-blue-900/30">
      <div className="flex items-baseline justify-between">
        <p className="text-xl font-bold">전역</p>
        <p className="text-xl font-bold tabular-nums">{dDay > 0 ? `D-${dDay}` : dDay === 0 ? "D-Day" : "전역 완료"}</p>
      </div>
      <div className="relative mt-3 h-11 overflow-hidden rounded-lg bg-white/10">
        <div className="absolute inset-y-0 left-0 bg-[#b8942f]" style={{ width: `${pct ?? 0}%` }} />
        <p className="relative px-3 text-2xl leading-[44px] font-bold tabular-nums">{pct === null ? "--" : `${pct.toFixed(7)}%`}</p>
      </div>
    </div>
  );
}
