"use client";
// ─────────────────────────────────────────────────────────────
// 전역 진행률 카드(어두운 단색 타일) — 입대일 0시부터 전역일 0시(한국 시간)까지 지난 비율을
// 소수점 7자리까지 보여 주고, 0.1초마다 조금씩 올라갑니다.
// 화면을 열면 막대가 0%부터 지금 값까지 약 2초간 차오르고, 흑백 강아지가 막대 끝을 따라 달립니다.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { RunningDog } from "./running-dog";

const kst = (date: string) => new Date(`${date}T00:00:00+09:00`).getTime();
const INTRO_MS = 2000; // 처음 차오르는 데 걸리는 시간

export function ServiceProgress({ enlist, discharge, dDay }: { enlist: string; discharge: string; dDay: number }) {
  const [pct, setPct] = useState<number | null>(null); // 화면이 뜬 뒤 계산 (처음엔 "--")
  useEffect(() => {
    const start = kst(enlist);
    const end = kst(discharge);
    const real = () => Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    let id: ReturnType<typeof setInterval> | undefined;
    // 1) 처음 2초: 매 화면마다 부드럽게 차오름 (끝으로 갈수록 천천히)
    const intro = (now: number) => {
      const k = Math.min(1, (now - t0) / INTRO_MS);
      setPct(real() * (1 - Math.pow(1 - k, 2.4)));
      if (k < 1) raf = requestAnimationFrame(intro);
      else id = setInterval(() => setPct(real()), 100); // 2) 그다음엔 0.1초마다 실제 값
    };
    if (reduce) {
      raf = requestAnimationFrame(() => setPct(real()));
      id = setInterval(() => setPct(real()), 100);
    } else raf = requestAnimationFrame(intro);
    return () => {
      cancelAnimationFrame(raf);
      if (id) clearInterval(id);
    };
  }, [enlist, discharge]);

  return (
    <div className="rounded-[18px] bg-tile px-5 py-6 text-white">
      <div className="flex items-baseline justify-between">
        <p className="text-[21px] leading-[1.19] font-semibold tracking-[-0.01em]">전역</p>
        <p className="text-[21px] font-semibold tabular-nums">{dDay > 0 ? `D-${dDay}` : dDay === 0 ? "D-Day" : "전역 완료"}</p>
      </div>
      {/* 진행 막대: 회색 트랙 + 밝은 파랑(#2997ff) 채움. 위쪽 빈 공간에서 강아지가 달림 */}
      <div className="relative mt-2 pt-[34px]">
        {pct !== null && (
          // 강아지 코끝이 채워진 막대 끝에 오도록 위치 (왼쪽 끝을 넘지 않게)
          <RunningDog className="absolute bottom-2 h-[34px] w-12" style={{ left: `max(0px, calc(${pct}% - 35px))` }} />
        )}
        <div className="h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#2997ff]" style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>
      <p className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] tabular-nums">{pct === null ? "--" : `${pct.toFixed(7)}%`}</p>
    </div>
  );
}
