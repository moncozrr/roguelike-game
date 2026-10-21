// 경계 강화 후보와 적용. 일반 레벨업 후보(rewards.js)와 섞이지 않는 별도 성장 트랙이다.
// 화면 연결은 중간 보스를 처치한 뒤에 열리는 단계 11에서 한다. 여기서는 "무슨 후보가 있고 적용하면 어떻게 되는가"만 다룬다.
// 문서에서 수치가 확정된 강화는 반경 강화뿐이라 그것만 만든다(나머지 후보는 수치가 정해지면 추가).

import { radiusForLevel } from './boundary.js';
import { BOUNDARY } from './config.js';
import { createRewardFlow } from './rewards.js';

export const BOUNDARY_REWARD_KINDS = { RADIUS: 'boundaryRadius' };

// 카드 UI(rewardCards)가 일반 보상과 같은 모양으로 그릴 수 있게 title/category/effect/description을 갖는다.
export function listBoundaryRewards({ boundary, rules = BOUNDARY }) {
  const rewards = [];
  if (boundary.radiusLevel < rules.maxRadiusLevel) {
    const from = boundary.radiusLevel;
    const radiusFrom = radiusForLevel(boundary.baseRadius, from, rules.radiusUpgradePercent);
    const radiusTo = radiusForLevel(boundary.baseRadius, from + 1, rules.radiusUpgradePercent);
    rewards.push({
      kind: BOUNDARY_REWARD_KINDS.RADIUS,
      id: 'radius',
      title: '경계 반경 증가',
      category: '경계 강화',
      effect: `Lv.${from} → Lv.${from + 1} · 반경 ${radiusFrom}px → ${radiusTo}px`,
      description: `기본 반경의 ${rules.radiusUpgradePercent}%만큼 경계가 넓어집니다. 중심은 그대로입니다.`,
      fromLevel: from,
      toLevel: from + 1,
    });
  }
  return rewards;
}

// 유효한 후보 중 무작위로 최대 maxCandidates개(중복 없음). rng: () => [0, 1)
export function buildBoundaryCandidates({ boundary, rng = Math.random, maxCandidates = 3, rules = BOUNDARY }) {
  const pool = listBoundaryRewards({ boundary, rules });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, maxCandidates);
}

// 강화를 적용한다. 지금 상태에서 불가능하면 아무것도 바꾸지 않고 false.
export function applyBoundaryReward(reward, { boundary, rules = BOUNDARY }) {
  if (!reward) return false;
  if (reward.kind === BOUNDARY_REWARD_KINDS.RADIUS) {
    if (boundary.radiusLevel >= rules.maxRadiusLevel) return false;
    boundary.radiusLevel = boundary.radiusLevel + 1;
    return true;
  }
  return false;
}

// 경계 강화 화면 진행. 중간 보스 처치마다 addUpgrades(1)로 화면 하나를 예약하고, 일반 레벨업 후보와는 완전히 따로 동작한다.
// 적용할 수 있는 강화가 없으면(예: 반경이 이미 최대) 화면 없이 건너뛴다.
export function createBoundaryUpgradeFlow({ boundary, rng = Math.random, maxCandidates = 3, rules = BOUNDARY }) {
  const flow = createRewardFlow({
    build: () => buildBoundaryCandidates({ boundary, rng, maxCandidates, rules }),
    apply: (reward) => applyBoundaryReward(reward, { boundary, rules }),
  });
  flow.addUpgrades = flow.addPending;
  return flow;
}
