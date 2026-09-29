"use client";
// ─────────────────────────────────────────────────────────────
// 확인창 버튼 / 경고 확인 폼 (브라우저 쪽 부품)
//
// ConfirmButton: 누르면 "정말 진행하시겠어요?" 확인창 → "확인"을 눌러야 폼이 제출됩니다.
// WarnSelectForm: 목록에서 고른 사람이 휴가·부상 중(data-warn 표시)이면 경고 확인창을 띄웁니다.
//                 "취소"하면 제출하지 않고, "확인"하면 그대로 넣습니다. (경고만, 막지는 않음)
// ─────────────────────────────────────────────────────────────
import type { ReactNode } from "react";

export function ConfirmButton({
  message,
  children,
  className,
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault(); // "취소"를 누르면 제출하지 않음
      }}
      className={className}
    >
      {children}
    </button>
  );
}

export function WarnSelectForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        const select = e.currentTarget.querySelector<HTMLSelectElement>("select[data-warn-select]");
        const option = select?.selectedOptions[0];
        const warn = option?.dataset.warn;
        if (warn && !confirm(`${warn}\n그래도 넣을까요?`)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
