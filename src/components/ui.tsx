// ─────────────────────────────────────────────────────────────
// 여러 화면에서 같이 쓰는 작은 화면 부품들 (입력칸, 버튼, 안내 상자, 카드)
// 디자인: 피그마 "Voting App" 템플릿 — 회색 입력칸, 보라 버튼, 그림자 카드
// 휴대폰에서 누르기 쉽도록 크고 넓게 만들었습니다.
// ─────────────────────────────────────────────────────────────
import type { InputHTMLAttributes, ReactNode } from "react";

// 제목(라벨) + 입력칸 (템플릿처럼 테두리 없는 회색 바탕)
export function Field({ label, ...inputProps }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <input
        {...inputProps}
        className="h-[52px] w-full rounded-lg bg-input px-4 text-base text-foreground outline-none ring-blue-600 placeholder:text-zinc-400 focus:ring-2"
      />
    </label>
  );
}

// 제출 버튼 (템플릿의 큰 보라 버튼). pending(처리 중)일 때는 눌리지 않고 "처리 중…" 으로 바뀝니다.
export function SubmitButton({ pending, children }: { pending?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-14 w-full rounded-lg bg-blue-600 px-4 text-lg font-bold text-white transition-colors active:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "처리 중…" : children}
    </button>
  );
}

// 오류(빨강) / 성공(초록) / 안내(주황) 상자
export function Notice({ kind, children }: { kind: "error" | "success" | "warn"; children: ReactNode }) {
  const color =
    kind === "error"
      ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
      : kind === "success"
        ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
        : "bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200";
  return (
    <p role="status" className={`rounded-lg p-3 text-sm ${color}`}>
      {children}
    </p>
  );
}

// 그림자 있는 흰 카드 (템플릿의 목록 카드) — 화면의 한 구역(section)
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg bg-white shadow-[0_4px_12px_rgba(15,16,32,0.08)] dark:bg-zinc-900 ${className}`}>
      {children}
    </section>
  );
}

// 화면 전체를 감싸는 틀 (가운데 정렬, 휴대폰 폭 기준)
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground/85">{title}</h1>
      {children}
    </main>
  );
}
