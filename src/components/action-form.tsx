"use client";
// ─────────────────────────────────────────────────────────────
// 입력값이 지워지지 않는 폼
//
// React 는 <form action={...}> 으로 제출하면, 처리가 끝난 뒤 입력칸을 자동으로 비웁니다.
// 그러면 비밀번호를 한 번 틀렸을 때 이름까지 다시 적어야 해서 불편합니다.
// 이 부품은 제출을 직접 처리해서, 오류가 나도 입력한 내용이 그대로 남게 합니다.
// ─────────────────────────────────────────────────────────────
import { startTransition, type ReactNode } from "react";

export function ActionForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void; // useActionState 가 준 formAction
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      className={className}
      // action 도 함께 달아 둡니다: 화면이 완전히 준비되기 전에 버튼을 눌러도
      // 입력값이 주소창(URL)에 노출되지 않고 서버로 안전하게(POST) 전송됩니다.
      action={action}
      onSubmit={(e) => {
        e.preventDefault(); // 브라우저 기본 제출(페이지 새로고침 + 입력칸 초기화)을 막음
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data)); // 서버 액션 실행 (처리 중 표시 pending 도 정상 동작)
      }}
    >
      {children}
    </form>
  );
}
