// 경계 버프 계산(순수 함수). 화면(DOM)에 의존하지 않는다.
//   1) 내구도가 줄면 경계 버프가 약해진다: 손실 10%마다 5%, 최대 50%.
//   2) 경계 안에 있는 개체만 버프를 받는다(개체 중심 기준, 경계선 위는 안).
//   3) 플레이어는 100%, 인간형 적과 보스는 50%만 공유하고, 비인간형 적은 받지 않는다.
// 모든 계산은 정수 퍼센트로 해서 소수 오차를 피한다.

import { BOUNDARY } from './config.js';

// 내구도 current/max에서 버프가 몇 % 약해지는지(0~maxWeakenPercent).
// 손실이 10%에 못 미치면 0, 10%가 되는 순간 5%, ... 계단식으로 늘고 0%에서 50%가 상한이다.
export function weakenPercent(current, max, rules = BOUNDARY) {
  if (typeof current !== 'number' || typeof max !== 'number' || !Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return 0;
  const clamped = Math.min(Math.max(current, 0), max);
  const lossPercent = ((max - clamped) * 100) / max;
  const steps = Math.floor(lossPercent / rules.weakenStepLossPercent + 1e-9); // 부동소수점 오차(예: 9.999999)로 한 단계 놓치지 않게
  return Math.min(steps * rules.weakenPercentPerStep, rules.maxWeakenPercent);
}

// 인간형 적 또는 보스인가. (현재 게임에는 인간형 적이 없고, 적 데이터의 human / isBoss 표시로 구분한다.)
export function sharesBoundaryBuff(enemy) {
  return enemy?.human === true || enemy?.isBoss === true;
}

// 개체가 실제로 받는 버프 효과(퍼센트). basePercent: 약화 전 기본 효과.
//   role 'player': 경계 안이면 약화만 적용, 'enemy': 경계 안의 인간형 적/보스만 약화 적용 후 50%.
// 경계 밖이거나 받을 수 없는 개체는 0.
export function effectiveBuffPercent(basePercent, boundary, entity, role = 'player', rules = BOUNDARY) {
  if (!entity || !boundary.contains(entity)) return 0;
  const weakened = (basePercent * (100 - weakenPercent(boundary.durability, boundary.maxDurability, rules))) / 100;
  if (role === 'player') return weakened;
  return sharesBoundaryBuff(entity) ? (weakened * rules.enemySharePercent) / 100 : 0;
}

// 공격력 배율(1 = 변화 없음). 플레이어가 경계 안에 있으면 1 + 효과%.
export function attackMultiplier(boundary, entity, role = 'player', rules = BOUNDARY) {
  return (100 + effectiveBuffPercent(rules.attackBuffPercent, boundary, entity, role, rules)) / 100;
}
