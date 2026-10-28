// 로비 쪽 진행도 규칙: 런 보상, 도감(이름 해독), 영구 업그레이드, 업적.
// 저장 데이터(save 객체)를 직접 고치는 순수 함수들이며 화면에 의존하지 않는다. 저장소에 쓰는 일은 profile.js가 맡는다.
// 모든 수치(지급량, 비용, 공개 기준)는 data/*.js에 있고 [임시]다.

import { MONSTERS, MONSTER_BY_ID } from '../data/monsters.js';
import { UPGRADES, UPGRADE_BY_ID, MAX_UPGRADE_LEVEL, upgradeCost } from '../data/upgrades.js';
import { ACHIEVEMENT_BY_ID } from '../data/achievements.js';

// ----- 런 보상 -----
// [임시] 엽전 = 일반 처치 × 1 + 보스 처치 × 20 + 생존 10초당 1. 이름 조각 = 보스 처치 1회당 1.
export const RUN_REWARD = { coinsPerNormalKill: 1, coinsPerBossKill: 20, secondsPerCoin: 10, fragmentsPerBossKill: 1 };

export function calcRunRewards(result) {
  const normal = Math.max(0, Math.floor(result.normalKills) || 0);
  const boss = Math.max(0, Math.floor(result.bossKills) || 0);
  const seconds = Math.max(0, Math.floor(result.survivalSeconds) || 0);
  return {
    coins: normal * RUN_REWARD.coinsPerNormalKill + boss * RUN_REWARD.coinsPerBossKill + Math.floor(seconds / RUN_REWARD.secondsPerCoin),
    nameFragments: boss * RUN_REWARD.fragmentsPerBossKill,
  };
}

// ----- 도감 -----
export function monsterKills(save, monsterId) {
  return save.bestiary[monsterId]?.kills ?? 0;
}

export function revealedLetterCount(monster, kills) {
  return monster.revealAt.filter((need) => kills >= need).length;
}

export function isNameComplete(monster, kills) {
  return revealedLetterCount(monster, kills) === monster.revealAt.length;
}

// 공개된 글자는 보여 주고 나머지는 ○로 가린다. 단어 사이 공백은 그대로 둔다.
export function maskedName(monster, kills) {
  const shown = revealedLetterCount(monster, kills);
  let index = 0;
  return Array.from(monster.name)
    .map((ch) => (/\s/.test(ch) ? ch : index++ < shown ? ch : '○'))
    .join('');
}

// 다음 글자가 공개되는 누적 처치 수. 모두 공개했으면 null.
export function nextRevealAt(monster, kills) {
  return monster.revealAt.find((need) => kills < need) ?? null;
}

// [임시] 이름 등록: 이름을 모두 해독한 몬스터를 이름 조각 1개로 등록하면 엽전을 한 번 받는다.
export const REGISTRY = { fragmentCost: 1, rewardCoins: { normal: 100, boss: 300 } };

export function registerMonster(save, monsterId) {
  const monster = MONSTER_BY_ID[monsterId];
  if (!monster) return { ok: false, reason: 'unknown' };
  const entry = save.bestiary[monsterId];
  if (entry?.registered) return { ok: false, reason: 'already-registered' };
  if (!isNameComplete(monster, entry?.kills ?? 0)) return { ok: false, reason: 'name-incomplete' };
  if (save.nameFragments < REGISTRY.fragmentCost) return { ok: false, reason: 'not-enough-fragments' };
  save.nameFragments -= REGISTRY.fragmentCost;
  const coins = REGISTRY.rewardCoins[monster.kind];
  save.coins += coins;
  save.bestiary[monsterId] = { kills: entry.kills, registered: true };
  return { ok: true, coins };
}

// ----- 런 결과를 저장 데이터에 반영 -----
// 처치 수, 통계, 도감, 재화를 갱신하고 화면에 보여 줄 요약을 돌려준다. 같은 결과를 두 번 넣지 않는 책임은 부르는 쪽(profile.js)에 있다.
export function applyRunResult(save, result) {
  const rewards = calcRunRewards(result);
  const newlyRevealed = [];
  for (const monster of MONSTERS) {
    const gained = Math.max(0, Math.floor(result.kills?.[monster.id]) || 0);
    if (gained === 0) continue;
    const before = monsterKills(save, monster.id);
    const entry = save.bestiary[monster.id] ?? { kills: 0 };
    save.bestiary[monster.id] = { ...entry, kills: before + gained };
    const letters = revealedLetterCount(monster, before + gained) - revealedLetterCount(monster, before);
    if (letters > 0) newlyRevealed.push({ monsterId: monster.id, letters, nameComplete: isNameComplete(monster, before + gained) });
  }
  save.stats.runs += 1;
  save.stats.normalKills += Math.max(0, Math.floor(result.normalKills) || 0);
  save.stats.bossKills += Math.max(0, Math.floor(result.bossKills) || 0);
  save.stats.bestSurvivalSeconds = Math.max(save.stats.bestSurvivalSeconds, Math.max(0, Math.floor(result.survivalSeconds) || 0));
  save.coins += rewards.coins;
  save.nameFragments += rewards.nameFragments;
  return { ...rewards, newlyRevealed };
}

// ----- 영구 업그레이드 -----
export function upgradeLevel(save, id) {
  return save.upgrades[id] ?? 0;
}

// 1회 구매에 1레벨. 반환: { ok: true, level, cost } 또는 { ok: false, reason }
export function buyUpgrade(save, id) {
  if (!UPGRADE_BY_ID[id]) return { ok: false, reason: 'unknown' };
  const level = upgradeLevel(save, id);
  if (level >= MAX_UPGRADE_LEVEL) return { ok: false, reason: 'max-level' };
  const cost = upgradeCost(level);
  if (save.coins < cost) return { ok: false, reason: 'not-enough-coins' };
  save.coins -= cost;
  save.upgrades[id] = level + 1;
  return { ok: true, level: level + 1, cost };
}

// 저장된 레벨을 game.js의 modifiers로 바꾼다. 레벨이 0이면 기본값(보정 없음)이다.
export function computeModifiers(save) {
  const mods = { maxHpBonus: 0, attackMultiplier: 1, moveSpeedMultiplier: 1, magnetBonus: 0, boundaryDurabilityMultiplier: 1 };
  for (const upgrade of UPGRADES) {
    const level = Math.min(upgradeLevel(save, upgrade.id), MAX_UPGRADE_LEVEL);
    const amount = level * upgrade.perLevel;
    mods[upgrade.modifier] = upgrade.kind === 'percent' ? 1 + amount / 100 : amount;
  }
  return mods;
}

// ----- 업적 -----
// 'locked'(미달성) | 'claimable'(달성, 수령 가능) | 'claimed'(수령 완료)
export function achievementStatus(save, achievement) {
  if (save.achievements[achievement.id]?.claimed) return 'claimed';
  const { current, target } = achievement.progress(save);
  return current >= target ? 'claimable' : 'locked';
}

// 수동 수령. 이미 받았거나 아직 달성하지 못했으면 보상을 주지 않는다(중복 수령 방지).
export function claimAchievement(save, id) {
  const achievement = ACHIEVEMENT_BY_ID[id];
  if (!achievement) return { ok: false, reason: 'unknown' };
  const status = achievementStatus(save, achievement);
  if (status === 'claimed') return { ok: false, reason: 'already-claimed' };
  if (status === 'locked') return { ok: false, reason: 'not-achieved' };
  save.achievements[id] = { claimed: true };
  save.coins += achievement.reward.coins ?? 0;
  save.nameFragments += achievement.reward.nameFragments ?? 0;
  return { ok: true, reward: achievement.reward };
}
