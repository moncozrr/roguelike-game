// 이동 방향 벡터에서 8방향 스프라이트 방향을 고르는 순수 함수 모음. 화면(DOM)이나 게임 상태에 의존하지 않는다.
// game.js가 이동 방향마다 호출하고, dalSprite.js가 시트 칸을 찾을 때 이 모듈의 배치를 쓴다.
// 좌표는 화면 기준이다: x는 오른쪽, y는 아래쪽(카메라 쪽)이 +이다.

// 동쪽(오른쪽)에서 시작해 화면에서 시계 방향으로 45도씩 도는 순서. 인덱스 0~7.
export const DIRECTION_NAMES = ['right', 'front-right', 'front', 'front-left', 'left', 'back-left', 'back', 'back-right'];

// 달(Dal) 8방향 시트의 칸 배치(4열 x 2행). 위의 인덱스 순서와 다르므로 이름으로 찾는다.
//   1행: front, front-right, right, back-right
//   2행: back, back-left, left, front-left
export const DAL_SHEET_LAYOUT = {
  front: { col: 0, row: 0 },
  'front-right': { col: 1, row: 0 },
  right: { col: 2, row: 0 },
  'back-right': { col: 3, row: 0 },
  back: { col: 0, row: 1 },
  'back-left': { col: 1, row: 1 },
  left: { col: 2, row: 1 },
  'front-left': { col: 3, row: 1 },
};

export const DEFAULT_DIRECTION_INDEX = 2; // 'front' (처음 시작할 때 카메라를 바라본다)
export const DEFAULT_HYSTERESIS_DEG = 8; // 구간 경계에서 방향이 깜빡이지 않게 하는 여유 각도

const STEP = Math.PI / 4;
const MIN_LENGTH = 1e-6; // 이보다 짧은 벡터는 "멈춤"으로 본다

// 두 각도의 차이(0~PI). 각도가 -PI/PI에서 이어지는 것을 처리한다.
function angleDistance(a, b) {
  const twoPi = Math.PI * 2;
  const d = (((a - b + Math.PI) % twoPi) + twoPi) % twoPi;
  return Math.abs(d - Math.PI);
}

function indexToAngle(index) {
  return index * STEP;
}

// (x, y): 이동 벡터(크기는 상관없음). prevIndex: 직전 방향 인덱스 또는 null.
// 멈춰 있거나 입력이 이상하면 직전 방향을 유지하고, 직전 방향도 없으면 기본(정면)을 돌려준다.
// 직전 방향이 있으면 그 구간 경계를 hysteresisDeg만큼 넘어야 다른 방향으로 바뀐다.
export function directionIndexFromVector(x, y, prevIndex = null, hysteresisDeg = DEFAULT_HYSTERESIS_DEG) {
  const hasPrev = Number.isInteger(prevIndex) && prevIndex >= 0 && prevIndex < 8;
  const fallback = hasPrev ? prevIndex : DEFAULT_DIRECTION_INDEX;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  if (Math.hypot(x, y) < MIN_LENGTH) return fallback;

  const angle = Math.atan2(y, x);
  if (hasPrev) {
    const limit = STEP / 2 + (hysteresisDeg * Math.PI) / 180;
    if (angleDistance(angle, indexToAngle(prevIndex)) <= limit) return prevIndex;
  }
  return (((Math.round(angle / STEP) % 8) + 8) % 8);
}

export function directionName(index) {
  return DIRECTION_NAMES[index] ?? DIRECTION_NAMES[DEFAULT_DIRECTION_INDEX];
}

// 방향 이름으로 시트의 칸(열/행)을 찾는다. 알 수 없는 이름이면 정면 칸.
export function dalSheetCell(name) {
  return DAL_SHEET_LAYOUT[name] ?? DAL_SHEET_LAYOUT.front;
}
