"use client";
// ─────────────────────────────────────────────────────────────
// 인원 일괄 등록 입력 폼 (브라우저 쪽)
//  - 방법 1: CSV 파일 선택 → 내용이 아래 입력칸에 자동으로 채워짐
//  - 방법 2: 엑셀/Numbers 에서 표를 복사해 입력칸에 바로 붙여넣기
//  - 등록이 끝나면 이름 + 초기 비밀번호 표와 "결과 파일 받기" 버튼이 나타남
// ─────────────────────────────────────────────────────────────
import { useActionState, useState } from "react";
import { importMembersAction, type ImportState } from "./actions";
import { buildResultCsv } from "@/lib/member-import";
import { Notice, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

const EXAMPLE = "이름,초기비밀번호,진료반 여부,관리자 여부\n가짜1,,O,X\n가짜2,,X,X\n가짜3,1234,X,O";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importMembersAction, {});
  const [text, setText] = useState("");

  // CSV 파일을 골랐을 때: 파일 글자를 읽어서 입력칸에 넣습니다.
  // 한국어 윈도우 엑셀은 CSV 를 EUC-KR 로 저장하는 경우가 있어서, UTF-8 로 읽다가 깨지면 EUC-KR 로 다시 읽습니다.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const bytes = await file.arrayBuffer();
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      content = new TextDecoder("euc-kr").decode(bytes);
    }
    setText(content);
  }

  // 결과 파일(CSV) 내려받기
  function downloadResult() {
    if (!state.created) return;
    const blob = new Blob([buildResultCsv(state.created)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "초기비밀번호_목록.csv";
    document.body.appendChild(a); // 일부 브라우저(아이패드 Safari 등)는 화면에 붙은 링크만 파일 이름을 지켜 줌
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000); // 내려받기가 시작된 뒤에 임시 주소 정리
  }

  // 등록 성공 화면
  if (state.created) {
    return (
      <div className="space-y-4">
        <Notice kind="success">{state.created.length}명을 등록했습니다.</Notice>
        <Notice kind="warn">
          아래 초기 비밀번호는 <b>지금 한 번만</b> 보입니다. 결과 파일을 받아 두거나 각자에게 전달하세요. 첫
          로그인 때 각자 새 비밀번호로 바꾸게 됩니다.
        </Notice>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
              <th className="py-1">이름</th>
              <th className="py-1">초기 비밀번호</th>
            </tr>
          </thead>
          <tbody>
            {state.created.map((r) => (
              <tr key={r.name} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-1">{r.name}</td>
                <td className="py-1 font-mono">
                  {r.password} {r.generated && <span className="text-xs text-zinc-400">(자동)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={downloadResult}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white"
        >
          결과 파일 받기 (CSV)
        </button>
        <button
          type="button"
          onClick={() => location.reload()}
          className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700"
        >
          추가로 더 등록하기
        </button>
      </div>
    );
  }

  // 입력 화면
  return (
    <ActionForm action={formAction} className="space-y-4">
      <div className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">목록 형식 (한 줄에 한 명)</p>
        <p className="mt-1">이름, 초기비밀번호, 진료반 여부(O/X), 관리자 여부(O/X)</p>
        <p className="mt-1">· 초기비밀번호를 비우면 6자리 숫자가 자동으로 만들어집니다.</p>
        <p>· 동명이인은 홍길동A / 홍길동B 처럼 이름이 겹치지 않게 적어 주세요.</p>
        <button type="button" onClick={() => setText(EXAMPLE)} className="mt-2 text-blue-600 underline">
          예시 넣어 보기
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">CSV 파일 선택 (선택 사항)</span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="block w-full text-sm" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">목록 (파일 내용이 여기에 채워지거나, 표를 붙여넣으세요)</span>
        <textarea
          name="table"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          required
          placeholder={EXAMPLE}
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {state.errors && state.errors.length > 0 && (
        <Notice kind="error">
          아무도 등록되지 않았습니다. 아래를 고친 뒤 다시 눌러 주세요.
          <br />
          {state.errors.map((e) => (
            <span key={e} className="block">
              · {e}
            </span>
          ))}
        </Notice>
      )}
      <SubmitButton pending={pending}>등록하기</SubmitButton>
    </ActionForm>
  );
}
