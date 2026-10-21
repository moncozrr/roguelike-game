// 경험치 구슬, 경험치/레벨, 경험치 자석. 화면(DOM)에 의존하지 않고 모두 월드 좌표로 다룬다.
// 구슬은 플레이어가 줍거나 새 런이 시작될 때까지 월드에 남는다. 자석은 줍기 반경만 넓히며 무기와 무관하다.
// 레벨업 보상 선택은 rewards.js가 맡는다. 이 모듈은 "경험치가 얼마나 쌓였고 몇 번 레벨이 올랐는지"만 계산한다.

import { XP, MAGNET } from './config.js';

// 현재 레벨에서 다음 레벨까지 필요한 경험치: 8, 12, 16, ... (첫 요구량 + 증가량 × (레벨 - 1))
export function xpToNext(level, config = XP) {
  return config.firstLevelXp + config.levelXpIncrease * (level - 1);
}

export function createExperience({ config = XP, magnet = MAGNET } = {}) {
  let orbs = []; // { id, x, y, value }
  let nextOrbId = 1;
  let xp = 0; // 현재 레벨에서 쌓은 경험치(레벨업하면 남은 양이 이월된다)
  let level = 1;
  let magnetLevel = 0;

  const pickupRadius = () => magnet.basePickupRadius + magnetLevel * magnet.radiusPerLevel;

  // 경험치를 더하고 몇 번 레벨이 올랐는지 돌려준다. 한 번에 여러 레벨이 오를 수 있다.
  function addXp(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    xp += amount;
    let gained = 0;
    while (xp >= xpToNext(level, config)) {
      xp -= xpToNext(level, config);
      level += 1;
      gained += 1;
    }
    return gained;
  }

  return {
    get orbs() {
      return orbs;
    },
    get xp() {
      return xp;
    },
    get level() {
      return level;
    },
    get xpToNext() {
      return xpToNext(level, config);
    },
    get magnetLevel() {
      return magnetLevel;
    },
    get pickupRadius() {
      return pickupRadius();
    },
    // 죽은 적의 자리에 구슬을 만든다. 한 적에게서는 한 번만 만들어지고(rewarded 표시), 죽지 않은 적에게서는 만들지 않는다.
    spawnOrbFor(enemy) {
      if (!enemy.dead || enemy.rewarded) return null;
      enemy.rewarded = true;
      const value = config.orbValue[enemy.kind] ?? config.orbValue.melee;
      const orb = { id: nextOrbId++, x: enemy.x, y: enemy.y, value };
      orbs.push(orb);
      return orb;
    },
    addXp,
    // 플레이어 중심에서 줍기 반경 안(경계 포함)의 구슬을 모두 줍는다. 같은 프레임에 여러 개를 주워도 경험치를 합친 뒤 레벨을 계산한다.
    // { collected: 주운 구슬 수, xpGained: 얻은 경험치, levelsGained: 오른 레벨 수 }
    collect(player) {
      const radius = pickupRadius();
      const radiusSq = radius * radius;
      let xpGained = 0;
      let collected = 0;
      const remaining = [];
      for (const orb of orbs) {
        const dx = orb.x - player.x;
        const dy = orb.y - player.y;
        if (dx * dx + dy * dy <= radiusSq) {
          xpGained += orb.value;
          collected += 1;
        } else {
          remaining.push(orb);
        }
      }
      orbs = remaining;
      return { collected, xpGained, levelsGained: addXp(xpGained) };
    },
    canUpgradeMagnet: () => magnetLevel < magnet.maxLevel,
    // 자석을 1단계 올린다. 최대 레벨이면 false(레벨 변화 없음).
    upgradeMagnet() {
      if (magnetLevel >= magnet.maxLevel) return false;
      magnetLevel += 1;
      return true;
    },
    // 새 런: 구슬, 경험치, 레벨, 자석을 모두 초기 상태로 되돌린다.
    reset() {
      orbs = [];
      nextOrbId = 1;
      xp = 0;
      level = 1;
      magnetLevel = 0;
    },
  };
}
