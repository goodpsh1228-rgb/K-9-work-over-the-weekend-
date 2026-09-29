"use client";
// 비상 관리자 복구 입력 폼 (브라우저 쪽). 키 확인과 저장은 서버 액션이 합니다.
import Link from "next/link";
import { useActionState } from "react";
import { emergencyRecoverAction, type FormState } from "@/app/auth-actions";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export function EmergencyForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(emergencyRecoverAction, {});
  return (
    <ActionForm action={formAction} className="space-y-4">
      <Field label="비상 키 (EMERGENCY_KEY)" name="key" type="password" autoComplete="off" required />
      <Field label="관리자 이름" name="name" autoComplete="off" maxLength={30} required />
      <Field label="새 비밀번호 (6자 이상)" name="password" type="password" autoComplete="new-password" minLength={6} required />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && (
        <Notice kind="success">
          {state.success}{" "}
          <Link href="/login" className="underline">
            로그인하러 가기
          </Link>
        </Notice>
      )}
      <SubmitButton pending={pending}>관리자로 설정</SubmitButton>
    </ActionForm>
  );
}
