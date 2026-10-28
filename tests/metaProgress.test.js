// M1~M8 로비 쪽 규칙 검증: 데이터 정합성, 던전 선택, 런 보상, 도감, 업그레이드, 업적, 프로필 저장. 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS, createDungeonSelection, getDungeon } from '../src/data/dungeons.js';
import { MONSTERS, MONSTER_BY_ID, monsterIdForEnemy } from '../src/data/monsters.js';
import { UPGRADES, MAX_UPGRADE_LEVEL, upgradeCost } from '../src/data/upgrades.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { NOTICES } from '../src/data/notices.js';
import { createDefaultSave, validateSave, createSaveStore } from '../src/save/saveStore.js';
import { createProfile } from '../src/meta/profile.js';
import {
  calcRunRewards,
  applyRunResult,
  maskedName,
  revealedLetterCount,
  isNameComplete,
  nextRevealAt,
  registerMonster,
  REGISTRY,
  buyUpgrade,
  computeModifiers,
  achievementStatus,
  claimAchievement,
} from '../src/meta/progress.js';

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// ----- 데이터 정합성 -----
test('던전: 2개, 첫 던전 이름은 확정값, 둘째는 가칭이며 입장 불가', () => {
  assert.equal(DUNGEONS.length, 2);
  assert.equal(DUNGEONS[0].name, '폐허가 된 조선');
  assert.equal(DUNGEONS[0].available, true);
  assert.equal(DUNGEONS[1].placeholder, true);
  assert.equal(DUNGEONS[1].available, false);
  assert.equal(getDungeon('nope'), null);
});

test('몬스터: 이름 글자 수와 공개 기준 수가 같고, 기준은 오름차순이며, id가 겹치지 않는다', () => {
  assert.equal(new Set(MONSTERS.map((m) => m.id)).size, MONSTERS.length);
  for (const m of MONSTERS) {
    assert.equal(m.revealAt.length, Array.from(m.name.replace(/\s/g, '')).length, m.id);
    assert.deepEqual([...m.revealAt].sort((a, b) => a - b), m.revealAt, m.id);
  }
});

test('적 -> 도감 번호표: 일반(원거리 포함)은 원혼, 보스는 각자', () => {
  assert.equal(monsterIdForEnemy({ kind: 'melee' }), 'wonyon');
  assert.equal(monsterIdForEnemy({ kind: 'ranged' }), 'wonyon');
  assert.equal(monsterIdForEnemy({ kind: 'miniBoss' }), 'midBoss');
  assert.equal(monsterIdForEnemy({ kind: 'secondBoss' }), 'secondBoss');
  assert.equal(monsterIdForEnemy({ kind: 'finalBoss' }), 'finalBoss');
  assert.equal(monsterIdForEnemy(null), 'wonyon');
});

test('업그레이드/업적/공지: id 중복 없음, 최대 레벨 10, 비용은 10씩 증가', () => {
  for (const list of [UPGRADES, ACHIEVEMENTS, NOTICES]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  assert.equal(MAX_UPGRADE_LEVEL, 10);
  assert.deepEqual([0, 1, 9].map(upgradeCost), [10, 20, 100]);
  assert.ok(NOTICES.length >= 1);
  for (const n of NOTICES) assert.ok(n.title && n.body && n.date);
});

// ----- 던전 선택 -----
test('던전 선택: 처음엔 입장 불가, 고르면 강조(선택됨), 입장 가능 던전만 입장 가능', () => {
  const sel = createDungeonSelection();
  assert.equal(sel.selectedId, null);
  assert.equal(sel.canEnter, false);
  assert.equal(sel.enter(), null);
  assert.equal(sel.select('nope'), false);
  assert.equal(sel.selectedId, null);
  assert.equal(sel.select('dungeon2'), true);
  assert.equal(sel.selectedId, 'dungeon2');
  assert.equal(sel.canEnter, false); // 준비 중
  assert.equal(sel.enter(), null);
  sel.select('ruinedJoseon');
  assert.equal(sel.canEnter, true);
  assert.equal(sel.enter(), 'ruinedJoseon');
});

// ----- 런 보상 -----
test('런 보상: 엽전 = 일반 + 보스×20 + 10초당 1, 이름 조각 = 보스당 1, 이상한 입력은 0', () => {
  assert.deepEqual(calcRunRewards({ normalKills: 50, bossKills: 2, survivalSeconds: 305 }), { coins: 50 + 40 + 30, nameFragments: 2 });
  assert.deepEqual(calcRunRewards({ normalKills: 0, bossKills: 0, survivalSeconds: 9 }), { coins: 0, nameFragments: 0 });
  assert.deepEqual(calcRunRewards({ normalKills: -5, bossKills: NaN, survivalSeconds: undefined }), { coins: 0, nameFragments: 0 });
});

test('런 결과 반영: 재화, 통계, 도감 처치 수가 쌓이고 새로 공개된 글자를 알려 준다', () => {
  const save = createDefaultSave();
  const summary = applyRunResult(save, { outcome: 'victory', normalKills: 40, bossKills: 1, survivalSeconds: 120, kills: { wonyon: 40, midBoss: 1 } });
  assert.equal(save.coins, 40 + 20 + 12);
  assert.equal(save.nameFragments, 1);
  assert.deepEqual(save.stats, { runs: 1, normalKills: 40, bossKills: 1, bestSurvivalSeconds: 120 });
  assert.deepEqual(save.bestiary, { wonyon: { kills: 40 }, midBoss: { kills: 1 } });
  assert.deepEqual(summary.newlyRevealed, [
    { monsterId: 'wonyon', letters: 1, nameComplete: false },
    { monsterId: 'midBoss', letters: 1, nameComplete: false },
  ]);
  applyRunResult(save, { normalKills: 0, bossKills: 0, survivalSeconds: 60, kills: {} });
  assert.equal(save.stats.bestSurvivalSeconds, 120); // 최고 기록은 줄지 않는다
  assert.equal(save.stats.runs, 2);
  assert.equal(validateSave(save).ok, true);
});

// ----- 도감 -----
test('도감: 처치 수에 따라 글자가 공개되고 공백은 유지된다', () => {
  const won = MONSTER_BY_ID.wonyon;
  const ahgwi = MONSTER_BY_ID.midBoss;
  assert.equal(maskedName(won, 0), '○○');
  assert.equal(maskedName(won, 29), '○○');
  assert.equal(maskedName(won, 30), '원○');
  assert.equal(maskedName(won, 100), '원혼');
  assert.equal(isNameComplete(won, 99), false);
  assert.equal(isNameComplete(won, 100), true);
  assert.equal(maskedName(ahgwi, 0), '○○○ ○○');
  assert.equal(maskedName(ahgwi, 3), '굶주린 ○○');
  assert.equal(revealedLetterCount(ahgwi, 99), 5);
  assert.equal(nextRevealAt(won, 30), 100);
  assert.equal(nextRevealAt(won, 100), null);
});

test('이름 등록: 이름 완성 + 이름 조각이 있어야 하고, 한 번만 보상을 준다', () => {
  const save = createDefaultSave();
  assert.deepEqual(registerMonster(save, 'nope'), { ok: false, reason: 'unknown' });
  assert.equal(registerMonster(save, 'wonyon').reason, 'name-incomplete');
  save.bestiary.wonyon = { kills: 100 };
  assert.equal(registerMonster(save, 'wonyon').reason, 'not-enough-fragments');
  save.nameFragments = 2;
  assert.deepEqual(registerMonster(save, 'wonyon'), { ok: true, coins: REGISTRY.rewardCoins.normal });
  assert.equal(save.nameFragments, 1);
  assert.equal(save.coins, REGISTRY.rewardCoins.normal);
  assert.deepEqual(save.bestiary.wonyon, { kills: 100, registered: true });
  assert.equal(registerMonster(save, 'wonyon').reason, 'already-registered');
  assert.equal(save.nameFragments, 1);
  assert.equal(validateSave(save).ok, true);
});

// ----- 영구 업그레이드 -----
test('업그레이드: 1회 구매에 1레벨, 비용 차감, 부족하면 거부, 최대 10레벨', () => {
  const save = createDefaultSave();
  assert.deepEqual(buyUpgrade(save, 'nope'), { ok: false, reason: 'unknown' });
  assert.deepEqual(buyUpgrade(save, 'vitality'), { ok: false, reason: 'not-enough-coins' });
  save.coins = 9;
  assert.equal(buyUpgrade(save, 'vitality').ok, false);
  save.coins = 10;
  assert.deepEqual(buyUpgrade(save, 'vitality'), { ok: true, level: 1, cost: 10 });
  assert.equal(save.coins, 0);
  assert.equal(save.upgrades.vitality, 1);
  save.coins = 100000;
  while (buyUpgrade(save, 'vitality').ok);
  assert.equal(save.upgrades.vitality, MAX_UPGRADE_LEVEL);
  const coins = save.coins;
  assert.deepEqual(buyUpgrade(save, 'vitality'), { ok: false, reason: 'max-level' });
  assert.equal(save.coins, coins);
  assert.equal(validateSave(save).ok, true);
});

test('보정값: 레벨 0이면 기본값, 레벨에 비례해 늘어난다', () => {
  const save = createDefaultSave();
  assert.deepEqual(computeModifiers(save), { maxHpBonus: 0, attackMultiplier: 1, moveSpeedMultiplier: 1, magnetBonus: 0, boundaryDurabilityMultiplier: 1 });
  save.upgrades = { vitality: 10, might: 10, swiftness: 5, reach: 2, ward: 1 };
  const m = computeModifiers(save);
  assert.equal(m.maxHpBonus, 50);
  assert.ok(Math.abs(m.attackMultiplier - 1.3) < 1e-9);
  assert.ok(Math.abs(m.moveSpeedMultiplier - 1.1) < 1e-9);
  assert.equal(m.magnetBonus, 6);
  assert.ok(Math.abs(m.boundaryDurabilityMultiplier - 1.03) < 1e-9);
});

// ----- 업적 -----
test('업적: 조건 전에는 수령 불가, 달성하면 수령 가능, 한 번 받으면 다시 받을 수 없다', () => {
  const save = createDefaultSave();
  const first = ACHIEVEMENTS.find((a) => a.id === 'firstRun');
  assert.equal(achievementStatus(save, first), 'locked');
  assert.equal(claimAchievement(save, 'firstRun').reason, 'not-achieved');
  assert.equal(claimAchievement(save, 'nope').reason, 'unknown');
  assert.equal(save.coins, 0);
  save.stats.runs = 1;
  assert.equal(achievementStatus(save, first), 'claimable');
  assert.equal(claimAchievement(save, 'firstRun').ok, true);
  assert.equal(save.coins, 20);
  assert.equal(achievementStatus(save, first), 'claimed');
  assert.equal(claimAchievement(save, 'firstRun').reason, 'already-claimed');
  assert.equal(save.coins, 20);
  assert.equal(validateSave(save).ok, true);
});

test('업적: 이름 조각 보상과 도감/통계 기반 조건', () => {
  const save = createDefaultSave();
  save.bestiary.midBoss = { kills: 1 };
  assert.equal(claimAchievement(save, 'midBoss1').ok, true);
  assert.equal(save.nameFragments, 1);
  save.stats.bestSurvivalSeconds = 299;
  assert.equal(claimAchievement(save, 'survive5').reason, 'not-achieved');
  save.stats.bestSurvivalSeconds = 300;
  assert.equal(claimAchievement(save, 'survive5').ok, true);
  save.upgrades.might = 1;
  assert.equal(claimAchievement(save, 'firstUpgrade').ok, true);
});

// ----- 프로필(저장 연동) -----
test('프로필: 구매/수령/런 기록이 즉시 저장되고 새로고침(새 프로필) 후에도 유지된다', () => {
  const storage = memoryStorage();
  const p1 = createProfile(createSaveStore(storage));
  assert.equal(p1.loadStatus, 'new');
  p1.recordRun({ normalKills: 30, bossKills: 1, survivalSeconds: 130, kills: { wonyon: 30, midBoss: 1 } });
  assert.equal(p1.claimAchievement('firstRun').ok, true);
  assert.equal(p1.buyUpgrade('might').ok, true);
  assert.equal(p1.persistOk, true);

  const p2 = createProfile(createSaveStore(storage)); // 페이지를 다시 연 것과 같다
  assert.equal(p2.loadStatus, 'ok');
  assert.deepEqual(p2.save, p1.save);
  assert.equal(p2.claimAchievement('firstRun').reason, 'already-claimed'); // 새로고침 후 중복 수령 불가
  assert.equal(p2.save.upgrades.might, 1);
});

test('프로필: 실패한 동작은 저장을 건드리지 않고, 저장소가 막혀도 계속 동작한다', () => {
  const storage = memoryStorage();
  const profile = createProfile(createSaveStore(storage));
  const before = storage.map.size;
  assert.equal(profile.buyUpgrade('might').ok, false);
  assert.equal(storage.map.size, before);

  const blocked = createProfile(createSaveStore(null));
  assert.equal(blocked.loadStatus, 'unavailable');
  blocked.recordRun({ normalKills: 20, bossKills: 0, survivalSeconds: 0, kills: { wonyon: 20 } });
  assert.equal(blocked.persistOk, false);
  assert.equal(blocked.buyUpgrade('vitality').ok, true); // 메모리에서는 계속 진행된다
});

test('프로필: 초기화는 모든 진행을 지우고, 가져오기는 검증된 데이터로 통째로 바꾼다', () => {
  const storage = memoryStorage();
  const profile = createProfile(createSaveStore(storage));
  profile.recordRun({ normalKills: 100, bossKills: 0, survivalSeconds: 0, kills: { wonyon: 100 } });
  const exported = structuredClone(profile.save);
  assert.equal(profile.reset(), true);
  assert.deepEqual(profile.save, createDefaultSave());
  assert.equal(createProfile(createSaveStore(storage)).loadStatus, 'new');
  profile.replaceWith(exported);
  assert.deepEqual(createProfile(createSaveStore(storage)).save, exported);
});
