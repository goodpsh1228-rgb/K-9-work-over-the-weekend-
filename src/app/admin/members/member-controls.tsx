"use client";
// ─────────────────────────────────────────────────────────────
// 인원 관리 화면의 브라우저 쪽 부품
//   - RankSelect: 계급을 고르면 바로 저장
//   - DeleteButton: 체크한 인원 수를 세어 "정말 삭제할까요?" 확인 후 제출
// ─────────────────────────────────────────────────────────────
export function RankSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      name="rank"
      defaultValue={defaultValue}
      // 값을 바꾸면 이 select 가 들어 있는 폼(계급 저장)을 바로 제출
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded border border-zinc-300 bg-white px-1 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <option value="">계급?</option>
      <option value="이병">이병</option>
      <option value="일병">일병</option>
      <option value="상병">상병</option>
      <option value="병장">병장</option>
    </select>
  );
}

export function DeleteButton() {
  return (
    <button
      type="submit"
      form="delete-form"
      onClick={(e) => {
        const n = document.querySelectorAll('input[name="ids"]:checked').length;
        if (n === 0) {
          e.preventDefault();
          alert("삭제할 인원을 먼저 체크해 주세요.");
          return;
        }
        if (!confirm(`선택한 ${n}명을 삭제할까요?\n(과거 근무 명단에 있던 사람은 기록 보존을 위해 비활성화됩니다)`)) {
          e.preventDefault();
        }
        // 확인을 누르면 그대로 제출됩니다. (버튼을 여기서 비활성화하면 제출이 취소될 수 있어 두지 않음)
      }}
      className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white"
    >
      선택한 사람 삭제
    </button>
  );
}
