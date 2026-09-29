"use client";
// 비밀번호 변경 입력 폼 (브라우저 쪽). 실제 변경은 서버 액션이 합니다.
import { useActionState } from "react";
import { changePasswordAction, type FormState } from "@/app/auth-actions";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export function ChangePasswordForm({ needCurrent }: { needCurrent: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <ActionForm action={formAction} className="space-y-4">
      {/* 스스로 바꿀 때만 현재 비밀번호를 묻습니다 */}
      {needCurrent && (
        <Field label="현재 비밀번호" name="current" type="password" autoComplete="current-password" required />
      )}
      <Field label="새 비밀번호 (6자 이상)" name="next" type="password" autoComplete="new-password" minLength={6} required />
      <Field label="새 비밀번호 한 번 더" name="confirm" type="password" autoComplete="new-password" minLength={6} required />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <SubmitButton pending={pending}>비밀번호 바꾸기</SubmitButton>
    </ActionForm>
  );
}
