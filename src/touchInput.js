// 터치 입력 계산(화면 요소 없음). 가상 조이스틱의 손가락 위치를 이동 값으로 바꾸는 순수 함수들이다.
// 화면 좌표(CSS 픽셀)와 게임 월드 좌표를 섞지 않는다: 여기서는 조이스틱 중심에서 손가락까지의 화면 거리만 다룬다.

export const JOYSTICK_DEADZONE = 0.25; // [임시] 이 비율(반지름 대비)보다 작게 움직이면 입력 없음으로 본다.

// 손가락 위치(조이스틱 중심 기준 dx, dy 픽셀)를 길이 0~1의 벡터로 바꾼다. 반지름을 넘으면 길이 1로 잘린다.
export function joystickVector(dx, dy, radius) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return { x: 0, y: 0 };
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  const scale = Math.min(length, radius) / radius / length;
  return { x: dx * scale, y: dy * scale };
}

// 조이스틱 벡터를 가장 가까운 8방향의 길이 1 벡터로 맞춘다(대각선도 길이 1이라 빨라지지 않는다). 데드존 안이면 null.
export function quantizeToEightDirections(x, y, deadzone = JOYSTICK_DEADZONE) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.hypot(x, y) < deadzone) return null;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(y, x) / step) * step;
  const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : v); // cos(90°) 같은 부동소수점 잔여값 제거
  return { x: clean(Math.cos(angle)), y: clean(Math.sin(angle)) };
}
