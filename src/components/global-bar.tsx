// ─────────────────────────────────────────────────────────────
// 맨 위 얇은 검정 바 (애플 global-nav): 높이 44px, 순수 검정, 흰 글자 12px
//   모든 화면 위에 붙어 다니며(sticky), 사이트 이름을 보여 줍니다.
// ─────────────────────────────────────────────────────────────
export function GlobalBar() {
  return (
    <header className="sticky top-0 z-30 flex h-11 items-center bg-black">
      <p className="mx-auto w-full max-w-md px-4 text-xs font-normal tracking-[-0.01em] text-white">군견훈육중대 주말출근 관리체계</p>
    </header>
  );
}
