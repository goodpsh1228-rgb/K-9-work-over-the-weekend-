"use client";
// ─────────────────────────────────────────────────────────────
// "복사" 버튼 — 글을 클립보드(복사해 둔 내용 보관함)에 넣습니다.
// 누른 뒤 카카오톡 입력창을 길게 눌러 "붙여넣기" 하면 됩니다.
//   1순위: 브라우저의 클립보드 기능 (https 사이트에서 동작)
//   2순위: 예전 방식 (숨긴 입력칸에 글을 넣고 선택 → 복사) — 일부 오래된 휴대폰 대비
// ─────────────────────────────────────────────────────────────
import { useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // 아이폰 Safari 대비
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "카카오톡용 명단 복사" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        setState((await copyText(text)) ? "done" : "fail");
        setTimeout(() => setState("idle"), 2500);
      }}
      className={`w-full rounded-lg px-4 py-3 font-semibold ${
        state === "done" ? "bg-green-600 text-white" : state === "fail" ? "bg-red-600 text-white" : "bg-yellow-300 text-zinc-900"
      }`}
    >
      {state === "done" ? "✓ 복사했습니다. 카카오톡에 붙여넣으세요" : state === "fail" ? "복사 실패 — 아래 글을 길게 눌러 복사하세요" : `📋 ${label}`}
    </button>
  );
}
