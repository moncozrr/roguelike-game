// 영구 업그레이드 정의. 최대 레벨 10은 [확정], 종류/효과/비용은 모두 [임시](2026-10-27 사용자 위임으로 정한 제안값)다.
// perLevel은 레벨 하나당 효과량이고, modifier는 game.js의 modifiers 이름이다.

import { MAX_UPGRADE_LEVEL } from '../save/saveStore.js';

export { MAX_UPGRADE_LEVEL };

export const UPGRADES = [
  { id: 'vitality', name: '생기', description: '최대 HP가 늘어난다.', unit: 'HP', perLevel: 5, kind: 'add', modifier: 'maxHpBonus' },
  { id: 'might', name: '기세', description: '공격력이 늘어난다.', unit: '%', perLevel: 3, kind: 'percent', modifier: 'attackMultiplier' },
  { id: 'swiftness', name: '경공', description: '이동 속도가 늘어난다.', unit: '%', perLevel: 2, kind: 'percent', modifier: 'moveSpeedMultiplier' },
  { id: 'reach', name: '흡혼', description: '경험치 구슬 줍기 반경이 넓어진다.', unit: 'px', perLevel: 3, kind: 'add', modifier: 'magnetBonus' },
  { id: 'ward', name: '결계', description: '경계의 최대 내구도가 늘어난다.', unit: '%', perLevel: 3, kind: 'percent', modifier: 'boundaryDurabilityMultiplier' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// 레벨 n -> n+1에 드는 엽전. [임시] 10 × (n+1): 10, 20, ..., 100
export function upgradeCost(level) {
  return 10 * (level + 1);
}
