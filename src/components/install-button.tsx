"use client";
// ─────────────────────────────────────────────────────────────
// "홈 화면에 추가" 버튼 — 맨 위 검정 바 오른쪽에 작게 붙습니다. 앱처럼 쓰고 싶을 때 누릅니다.
//   · 안드로이드 크롬: 브라우저가 "설치 가능"이라고 알려 주면(beforeinstallprompt) 버튼 한 번으로 설치 창이 바로 뜹니다.
//   · 아이폰(사파리): 웹사이트는 설치 창을 직접 띄울 수 없어서, 공유 버튼 → "홈 화면에 추가" 순서를 그림 없이 안내합니다.
//   · 카카오톡·네이버 같은 앱 안 브라우저: 거기서는 추가가 안 되므로 "사파리/크롬으로 열기" 안내 + 주소 복사 버튼.
//   · 이미 앱으로 열었거나(홈 화면에서 실행) 설치를 마쳤으면 버튼을 숨깁니다. 휴대폰이 아닌 화면에서는 설치 창이 뜰 때만 보입니다.
// "use client": 설치 이벤트와 기기 종류는 브라우저에서만 알 수 있어서 브라우저 쪽 부품입니다.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Env = { ios: boolean; android: boolean; inApp: "kakao" | "other" | null; samsung: boolean; standalone: boolean };

function detect(): Env {
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /KAKAOTALK/i.test(ua) ? "kakao" : /NAVER\(|FBAN|FBAV|Instagram|Line\/|DaumApps|; wv\)/i.test(ua) ? "other" : null;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  return { ios, android, inApp, samsung: /SamsungBrowser/i.test(ua), standalone };
}

export function InstallButton() {
  const [env, setEnv] = useState<Env | null>(null); // 화면이 뜬 뒤에 기기를 확인 (서버 화면과 어긋나지 않게)
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEnv(detect()));
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 설치 배너 대신 우리 버튼으로
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!env || env.standalone || done) return null; // 이미 앱으로 쓰는 중
  if (!env.ios && !env.android && !deferred) return null; // 휴대폰이 아니면 설치 창이 뜰 때만

  async function onClick() {
    if (deferred) {
      await deferred.prompt(); // 안드로이드 크롬: 설치 창 바로 띄우기
      const choice = await deferred.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setDone(true);
      setDeferred(null);
      return;
    }
    setOpen(true); // 직접 설치 창을 못 띄우는 환경: 방법 안내
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/home");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  // 안내 문구 (환경별)
  let title = "홈 화면에 추가";
  let steps: string[];
  if (env.inApp) {
    title = `${env.inApp === "kakao" ? "카카오톡" : "앱 안"} 브라우저에서는 추가할 수 없어요`;
    steps = env.ios
      ? ["화면 오른쪽 아래 공유(□↑) 또는 ⋯ 버튼을 누르세요", "'Safari로 열기'를 누르세요", "열린 Safari에서 이 버튼을 다시 눌러 안내를 따라 주세요"]
      : ["화면 오른쪽 위(또는 아래) ⋮ 버튼을 누르세요", "'다른 브라우저로 열기'(Chrome)를 누르세요", "열린 Chrome에서 이 버튼을 다시 누르면 바로 설치됩니다"];
  } else if (env.ios) {
    steps = ["Safari 아래쪽의 공유 버튼(□↑)을 누르세요 (안 보이면 ⋯ 메뉴 안에 있어요)", "목록을 아래로 내려 '홈 화면에 추가'를 누르세요", "오른쪽 위 '추가'를 누르면 홈 화면에 앱 아이콘이 생겨요"];
  } else if (env.samsung) {
    steps = ["화면 아래 메뉴(≡)를 누르세요", "'+ 현재 페이지 추가' → '홈 화면'을 누르세요", "'추가'를 누르면 홈 화면에 앱 아이콘이 생겨요"];
  } else {
    steps = ["브라우저 오른쪽 위 ⋮ 메뉴를 누르세요", "'앱 설치' 또는 '홈 화면에 추가'를 누르세요", "'설치'(추가)를 누르면 홈 화면에 앱 아이콘이 생겨요"];
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="홈 화면에 추가"
        className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-[#0071e3] px-2.5 text-[11px] leading-none font-semibold text-white"
      >
        <span aria-hidden className="text-[13px] leading-none">＋</span>
        홈 화면에 추가
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-[18px] bg-card px-5 pt-5 pb-8 text-foreground" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black tracking-[-0.02em]">{title}</p>
            <ol className="mt-3 space-y-2.5 text-[15px] leading-snug">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0071e3] text-xs font-bold text-white">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {env.inApp && (
              <button type="button" onClick={copyUrl} className="mt-4 min-h-11 w-full rounded-full border border-hairline text-base font-semibold text-link">
                {copied ? "주소를 복사했어요 — 브라우저에 붙여넣으세요" : "사이트 주소 복사"}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="mt-3 min-h-12 w-full rounded-full bg-[#0071e3] text-base font-semibold text-white">
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
