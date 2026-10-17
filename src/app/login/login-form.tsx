"use client";
// ─────────────────────────────────────────────────────────────
// 로그인 입력 폼 (브라우저에서 동작하는 부분)
// "use client" = 이 부품은 휴대폰 브라우저에서 실행됩니다(입력·버튼 반응 담당).
// 실제 비밀번호 확인은 서버 액션(loginAction)이 서버에서 합니다.
// ─────────────────────────────────────────────────────────────
import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/auth-actions";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export function LoginForm() {
  // state = 서버가 돌려준 결과(오류 문구 등), formAction = 폼 제출 시 실행할 동작, pending = 처리 중 여부
  const [state, formAction, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <ActionForm action={formAction} className="space-y-4">
      <Field label="이름" name="name" autoComplete="username" required />
      <Field label="비밀번호" name="password" type="password" autoComplete="current-password" required />
      {/* 자동 로그인: 켜 두면 이 기기에서 90일 동안 로그인이 유지됩니다(공용 기기에서는 끄세요). 비밀번호는 저장하지 않고, 아이폰·크롬 비밀번호 저장 기능과도 같이 쓸 수 있습니다. */}
      <label className="flex cursor-pointer items-start gap-2.5 px-1 text-[15px]">
        <input type="checkbox" name="remember" defaultChecked className="mt-0.5 size-5 shrink-0 accent-[#0066cc]" />
        <span>
          <span className="font-semibold">자동 로그인</span>
          <span className="block text-xs text-muted">이 기기에서 90일 동안 로그인을 유지해요 (공용 기기에서는 꺼 주세요)</span>
        </span>
      </label>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <SubmitButton pending={pending}>로그인</SubmitButton>
    </ActionForm>
  );
}
