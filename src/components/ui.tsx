// ─────────────────────────────────────────────────────────────
// 여러 화면에서 같이 쓰는 작은 화면 부품들 (입력칸, 버튼, 안내 상자)
// 휴대폰에서 누르기 쉽도록 크고 넓게 만들었습니다.
// ─────────────────────────────────────────────────────────────
import type { InputHTMLAttributes, ReactNode } from "react";

// 제목(라벨) + 입력칸
export function Field({ label, ...inputProps }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        {...inputProps}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </label>
  );
}

// 제출 버튼. pending(처리 중)일 때는 눌리지 않고 "처리 중…" 으로 바뀝니다.
export function SubmitButton({ pending, children }: { pending?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
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

// 화면 전체를 감싸는 틀 (가운데 정렬, 휴대폰 폭 기준)
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
