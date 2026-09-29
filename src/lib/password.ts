// ─────────────────────────────────────────────────────────────
// 비밀번호 도구 — "해시" 만들기 / 확인하기 / 초기 비밀번호 자동 생성
//
// 해시(hash)란?
//   비밀번호를 되돌릴 수 없는 긴 문자열로 바꾼 것입니다.
//   예: "1234" → "scrypt$16384$8$1$(무작위 소금)$(결과값)"
//   데이터베이스에는 이 해시만 저장하므로, 누가 데이터베이스를 봐도 원래 비밀번호를 알 수 없습니다.
//   로그인할 때는 입력한 비밀번호를 같은 방식으로 해시해서 저장된 값과 비교합니다.
//
// 소금(salt)이란?
//   사람마다 다른 무작위 값을 섞어서, 같은 비밀번호라도 해시 결과가 달라지게 합니다.
//
// 여기서는 Node.js에 내장된 scrypt(일부러 계산을 느리게 만든 해시 방식)를 씁니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

// scrypt 설정값 (클수록 안전하지만 느려짐). 로그인 1회에 수십 밀리초 정도 걸리는 값입니다.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

// scrypt 를 async/await 로 쓰기 위한 작은 포장 함수
function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

// 비밀번호 → 저장용 해시 문자열
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

// 입력한 비밀번호가 저장된 해시와 맞는지 확인
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  // timingSafeEqual: 비교 시간이 항상 같아서, 시간 차이로 비밀번호를 추측하는 공격을 막습니다.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 없는 이름으로 로그인할 때도 비슷한 시간이 걸리게 하려고 쓰는 가짜 해시.
// (응답 속도 차이로 "이 이름이 등록돼 있다"는 사실이 드러나지 않게 함)
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  return dummyHash;
}

// 초기 비밀번호 자동 생성: 무작위 숫자 6자리 (예: "048213")
// randomInt 는 암호학적으로 안전한 난수를 씁니다.
export function generateInitialPassword(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += String(randomInt(0, 10));
  return s;
}

// 새 비밀번호 규칙 (사용자가 직접 바꿀 때)
export const MIN_PASSWORD_LENGTH = 6;
export function checkNewPassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  if (pw.length > 100) return "비밀번호가 너무 깁니다.";
  return null; // null = 문제 없음
}
