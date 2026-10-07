// ─────────────────────────────────────────────────────────────
// 여러 화면에서 같이 쓰는 작은 화면 부품들 (입력칸, 버튼, 안내 상자, 카드)
// 디자인: Apple 디자인 시스템 (docs/DESIGN-apple.md)
//   - 입력칸: 알약(pill) 모양, 흰 바탕 + 가는 테두리
//   - 버튼: 파란 알약(높이 44px), 누르면 살짝 작아짐
//   - 카드: 흰 바탕 + 가는 테두리 + 둥근 모서리 18px, 그림자 없음
// 휴대폰에서 누르기 쉽도록 최소 44px 높이를 지킵니다.
// ─────────────────────────────────────────────────────────────
import type { InputHTMLAttributes, ReactNode } from "react";

// 제목(라벨) + 입력칸
export function Field({ label, ...inputProps }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-sm text-muted">{label}</span>
      <input
        {...inputProps}
        className="h-12 w-full rounded-full border border-hairline bg-input px-5 text-base text-foreground outline-none placeholder:text-muted focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </label>
  );
}

// 제출 버튼 (파란 알약). pending(처리 중)일 때는 눌리지 않고 "처리 중…" 으로 바뀝니다.
export function SubmitButton({ pending, children }: { pending?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-full bg-blue-600 px-[22px] text-base font-normal text-white disabled:opacity-50"
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
    <p role="status" className={`rounded-[11px] p-3 text-sm ${color}`}>
      {children}
    </p>
  );
}

// 카드: 흰 바탕 + 1px 가는 테두리 + 모서리 18px (그림자 없음) — 화면의 한 구역(section)
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[18px] border border-hairline bg-card ${className}`}>{children}</section>;
}

// 화면 전체를 감싸는 틀 (가운데 정렬, 휴대폰 폭 기준). 제목은 크고 자간을 좁게.
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="mb-6 text-[32px] leading-[1.12] font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
      {children}
    </main>
  );
}
