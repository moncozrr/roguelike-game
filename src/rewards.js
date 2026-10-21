// 레벨업 보상: 후보 생성, 적용, 연속 레벨업 진행. 화면(DOM/Canvas)과 입력에 의존하지 않는다.
// 임시 선택 화면(game.js)과 이후 정식 보상 카드 UI(단계 9)가 이 모듈을 그대로 재사용할 수 있도록
// "무슨 후보가 있고 무엇을 골랐는가"만 다룬다. 난수는 주입할 수 있어서 테스트를 재현할 수 있다.

import { MAGNET } from './config.js';

export const REWARD_KINDS = {
  NEW_WEAPON: 'newWeapon',
  WEAPON_UPGRADE: 'weaponUpgrade',
  MAGNET: 'magnet',
};

// 화면에 표시할 구분 이름(신규 무기와 무기 강화는 따로 구분해 보여 준다)
const CATEGORY_LABELS = {
  [REWARD_KINDS.NEW_WEAPON]: '신규 무기',
  [REWARD_KINDS.WEAPON_UPGRADE]: '무기 강화',
  [REWARD_KINDS.MAGNET]: '자석 강화',
};

// 지금 상태에서 선택 가능한 모든 보상(순서는 무기 정의 순서). 불가능한 보상은 만들지 않는다.
//   - 신규 무기: 아직 없고 슬롯이 남았을 때
//   - 무기 강화: 보유 무기 중 최대 레벨 미만
//   - 자석 강화: 최대 레벨 미만
export function listValidRewards({ weapons, experience, magnet = MAGNET }) {
  const rewards = [];
  for (const [id, def] of Object.entries(weapons.catalog)) {
    if (weapons.canEquip(id)) {
      rewards.push({ kind: REWARD_KINDS.NEW_WEAPON, id, title: def.name, description: def.description });
    } else if (weapons.canUpgrade(id)) {
      const from = weapons.levelOf(id);
      rewards.push({
        kind: REWARD_KINDS.WEAPON_UPGRADE,
        id,
        title: def.name,
        description: `Lv.${from} → Lv.${from + 1} (피해 증가)`,
        fromLevel: from,
        toLevel: from + 1,
      });
    }
  }
  if (experience.canUpgradeMagnet()) {
    const from = experience.magnetLevel;
    rewards.push({
      kind: REWARD_KINDS.MAGNET,
      id: 'magnet',
      title: '경험치 자석',
      description: `줍기 반경 ${experience.pickupRadius}px → ${experience.pickupRadius + magnet.radiusPerLevel}px`,
      fromLevel: from,
      toLevel: from + 1,
    });
  }
  return rewards.map((r) => ({ ...r, category: CATEGORY_LABELS[r.kind] }));
}

// 유효한 보상 중 무작위로 최대 maxCandidates개를 고른다(후보가 적으면 있는 만큼만). rng: () => [0, 1)
export function buildCandidates({ weapons, experience, rng = Math.random, maxCandidates = 3, magnet = MAGNET }) {
  const pool = listValidRewards({ weapons, experience, magnet });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, maxCandidates);
}

// 보상 하나를 적용한다. 지금 상태에서 불가능하면 아무것도 바꾸지 않고 false.
export function applyReward(reward, { weapons, experience }) {
  if (!reward) return false;
  switch (reward.kind) {
    case REWARD_KINDS.NEW_WEAPON:
      return weapons.equip(reward.id);
    case REWARD_KINDS.WEAPON_UPGRADE:
      return weapons.upgrade(reward.id);
    case REWARD_KINDS.MAGNET:
      return experience.upgradeMagnet();
    default:
      return false;
  }
}

// 연속 레벨업 진행. 레벨업 횟수를 쌓아 두고 보상 화면을 한 번에 하나씩 연다.
//   - addLevelUps(n): 레벨업 n번을 대기열에 더한다.
//   - advance(): 화면이 열려 있지 않으면 다음 화면을 연다. 후보가 하나도 없는 레벨업은 보상 없이 건너뛴다.
//     화면이 열려 있으면 true.
//   - select(index): 지금 표시 중인 후보의 번호(0부터)를 고른다. 유효하면 보상을 한 번만 적용하고, 다음 화면을 연다.
//     표시되지 않은 번호, 숫자가 아닌 값, 이미 처리된 선택은 무시하고 false를 돌려준다.
// 후보는 화면을 열 때마다 그 시점의 상태로 새로 계산한다(직전 선택 결과가 반영된다).
export function createLevelUpFlow({ weapons, experience, rng = Math.random, maxCandidates = 3 }) {
  let pending = 0; // 아직 화면을 열지 않은 레벨업 수
  let candidates = null; // 표시 중인 후보 목록. 화면이 없으면 null

  function advance() {
    while (!candidates && pending > 0) {
      pending -= 1;
      const next = buildCandidates({ weapons, experience, rng, maxCandidates });
      if (next.length > 0) candidates = next; // 후보가 0개면 이 레벨업은 건너뛴다(무한 대기 없음)
    }
    return candidates !== null;
  }

  return {
    get active() {
      return candidates !== null;
    },
    get candidates() {
      return candidates ?? [];
    },
    get pending() {
      return pending;
    },
    addLevelUps(count) {
      if (Number.isInteger(count) && count > 0) pending += count;
    },
    advance,
    select(index) {
      if (!candidates || !Number.isInteger(index) || index < 0 || index >= candidates.length) return false;
      const reward = candidates[index];
      candidates = null; // 먼저 비워서 같은 화면에서 두 번 적용되지 않게 한다.
      const applied = applyReward(reward, { weapons, experience });
      advance();
      return applied;
    },
    reset() {
      pending = 0;
      candidates = null;
    },
  };
}
