// 원형 경계의 데이터와 판정. 화면(DOM)에 의존하지 않고 모두 월드 좌표로 다룬다.
// 경계는 월드에 고정되어 플레이어를 따라다니지 않는다. 반경만 강화 레벨에 따라 커지고 중심은 그대로다.

import { BOUNDARY } from './config.js';

// 강화 레벨을 0~maxLevel 정수로 제한한다.
// 숫자(number)가 아닌 값(문자열, null, undefined, 불리언, 객체 등)과 NaN은 잘못된 입력이므로 0으로 본다.
// 숫자라면 범위로 제한한다: Infinity는 최대 레벨, -Infinity는 0, 소수는 버린다.
export function clampRadiusLevel(level, maxLevel = BOUNDARY.maxRadiusLevel) {
  if (typeof level !== 'number' || Number.isNaN(level)) return 0;
  return Math.min(Math.max(Math.trunc(level), 0), maxLevel);
}

// 반경 = 기본 반경 × (1 + 레벨 × 0.1). 소수 오차가 생기지 않도록 정수 퍼센트로 계산한다.
export function radiusForLevel(baseRadius, level, percentPerLevel = BOUNDARY.radiusUpgradePercent) {
  return (baseRadius * (100 + clampRadiusLevel(level) * percentPerLevel)) / 100;
}

// center: 월드 좌표 {x, y}. 값만 복사해 두므로 원본 객체(예: 플레이어)가 움직여도 경계는 움직이지 않는다.
// 기본 반경은 경계를 만들 때 한 번 정해지는 읽기 전용 값이다(바꾸려면 새 경계를 만든다. 새 런마다 새로 만든다).
// 기본 반경이 유한한 양수가 아니면 캔버스 arc가 오류를 내거나 판정이 조용히 틀어지므로, 만들 때 바로 오류를 낸다.
export function createBoundary(center, { baseRadius = BOUNDARY.baseRadius, radiusLevel = 0 } = {}) {
  if (typeof baseRadius !== 'number' || !Number.isFinite(baseRadius) || baseRadius <= 0) {
    throw new RangeError(`경계 기본 반경은 0보다 큰 유한한 숫자여야 합니다: ${String(baseRadius)}`);
  }
  const fixedCenter = Object.freeze({ x: center.x, y: center.y });
  let level = clampRadiusLevel(radiusLevel);

  return {
    center: fixedCenter,
    // 기본 반경과 강화 레벨은 따로 관리한다. getter만 있어서 값을 대입하려 하면 오류가 난다(조용히 무시되지 않음).
    get baseRadius() {
      return baseRadius;
    },
    get radiusLevel() {
      return level;
    },
    set radiusLevel(value) {
      level = clampRadiusLevel(value);
    },
    get radius() {
      return radiusForLevel(baseRadius, level);
    },
    // 월드 좌표 점이 경계 중심에서 얼마나 떨어져 있는지
    distanceTo(point) {
      return Math.hypot(point.x - fixedCenter.x, point.y - fixedCenter.y);
    },
    // 거리 ≤ 반경이면 내부(경계선 위도 내부), 반경을 넘으면 외부. 제곱끼리 비교해 제곱근 계산을 피한다.
    contains(point) {
      const dx = point.x - fixedCenter.x;
      const dy = point.y - fixedCenter.y;
      const r = radiusForLevel(baseRadius, level);
      return dx * dx + dy * dy <= r * r;
    },
  };
}
