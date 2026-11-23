// 작은 알약 표시 — 홈 화면과 간부 홈이 같이 씁니다.
// 작은 알약 표시 (역할·상태). tone: blue=연한 파랑(희망), solid=진한 파랑, gray=회색, outline=윤곽(미응답), orange=주황(지금 해야 할 일·경고), red=빨강
export function Chip({
  tone,
  children,
  aligned = false,
}: {
  tone: "blue" | "solid" | "gray" | "outline" | "orange" | "red";
  children: React.ReactNode;
  aligned?: boolean; // 목록 행의 상태 배지: 최소 폭을 맞춰 왼쪽 끝선을 정돈
}) {
  const color = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    solid: "bg-blue-600 text-white",
    gray: "bg-hairline/60 text-foreground/80",
    outline: "border border-hairline text-muted", // 미응답: 눈에 덜 띄는 윤곽
    orange:
      "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  }[tone];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${aligned ? "inline-block min-w-[4.5rem] text-center" : ""} ${color}`}>
      {children}
    </span>
  );
}
