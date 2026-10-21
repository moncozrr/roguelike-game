// 단계 8: 경험치 구슬, 경험치/레벨, 경험치 자석.
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { XP, MAGNET } from '../src/config.js';
import { createEnemy, damageEnemy, removeDeadEnemies } from '../src/enemy.js';
import { createExperience, xpToNext } from '../src/experience.js';
import { createWeaponSystem } from '../src/weapons.js';

const player = { x: 2000, y: 2000 };
const enemyAt = (id, x, y, kind = 'melee') => createEnemy(id, x, y, player, undefined, kind);
const kill = (e) => damageEnemy(e, 1000);

test('적이 죽으면 구슬이 정확히 한 개 생기고, 같은 적에게서 다시 생기지 않는다', () => {
  const xp = createExperience();
  const e = enemyAt(1, 2500, 2100);
  assert.equal(xp.spawnOrbFor(e), null); // 살아 있는 적에게서는 만들지 않는다
  kill(e);
  const orb = xp.spawnOrbFor(e);
  assert.deepEqual([orb.x, orb.y], [2500, 2100]); // 사망 위치
  assert.equal(xp.spawnOrbFor(e), null);
  assert.equal(xp.orbs.length, 1);
});

test('무기로 죽인 적이 목록에서 제거될 때 구슬이 한 번만 생긴다(중복 제거 시도 포함)', () => {
  const xp = createExperience();
  const sys = createWeaponSystem({ startingWeapons: ['pulse'] });
  const list = [enemyAt(1, 2040, 2000), enemyAt(2, 2000, 1960), enemyAt(3, 3000, 3000)];
  sys.update(0.016, player, list);
  sys.update(1.1, player, list); // 두 번째 타격으로 처치(5 + 5)
  assert.equal(list.filter((e) => e.dead).length, 2);
  assert.equal(removeDeadEnemies(list, (e) => xp.spawnOrbFor(e)), 2);
  assert.equal(removeDeadEnemies(list, (e) => xp.spawnOrbFor(e)), 0); // 이미 제거됨
  assert.equal(xp.orbs.length, 2);
  assert.equal(list.length, 1);
});

test('적 종류별 경험치: 일반 1, 원거리 2', () => {
  const xp = createExperience();
  const a = enemyAt(1, 100, 100, 'melee');
  const b = enemyAt(2, 100, 100, 'ranged');
  kill(a);
  kill(b);
  assert.equal(xp.spawnOrbFor(a).value, 1);
  assert.equal(xp.spawnOrbFor(b).value, 2);
  assert.deepEqual(XP.orbValue, { melee: 1, ranged: 2 });
});

test('구슬은 줍거나 리셋하기 전까지 남아 있다', () => {
  const xp = createExperience();
  const e = enemyAt(1, 3000, 3000);
  kill(e);
  xp.spawnOrbFor(e);
  for (let i = 0; i < 100; i++) xp.collect(player); // 멀리 있어서 줍지 못함
  assert.equal(xp.orbs.length, 1);
  xp.reset();
  assert.equal(xp.orbs.length, 0);
});

test('줍기: 반경 안(경계 포함)이면 줍고 경험치가 오른다, 밖이면 남는다', () => {
  const xp = createExperience();
  for (const [id, dx] of [[1, 60], [2, 61], [3, 0]]) {
    const e = enemyAt(id, 2000 + dx, 2000);
    kill(e);
    xp.spawnOrbFor(e);
  }
  const result = xp.collect(player);
  assert.equal(result.collected, 2);
  assert.equal(result.xpGained, 2);
  assert.equal(xp.xp, 2);
  assert.equal(xp.orbs.length, 1);
  assert.equal(xp.orbs[0].x, 2061);
});

test('경험치 자석: 반경 60/66/72/78px, 최대 3회', () => {
  const xp = createExperience();
  assert.deepEqual([MAGNET.basePickupRadius, MAGNET.radiusPerLevel, MAGNET.maxLevel], [60, 6, 3]);
  const radii = [xp.pickupRadius];
  for (let i = 0; i < 3; i++) {
    assert.equal(xp.canUpgradeMagnet(), true);
    assert.equal(xp.upgradeMagnet(), true);
    radii.push(xp.pickupRadius);
  }
  assert.deepEqual(radii, [60, 66, 72, 78]);
  assert.equal(xp.canUpgradeMagnet(), false);
  assert.equal(xp.upgradeMagnet(), false);
  assert.equal(xp.magnetLevel, 3);
  assert.equal(xp.pickupRadius, 78);
});

test('자석 강화로 넓어진 반경이 줍기에 적용된다', () => {
  const xp = createExperience();
  const e = enemyAt(1, 2000 + 70, 2000);
  kill(e);
  xp.spawnOrbFor(e);
  assert.equal(xp.collect(player).collected, 0); // 60px로는 못 줍는다
  xp.upgradeMagnet();
  xp.upgradeMagnet(); // 72px
  assert.equal(xp.collect(player).collected, 1);
});

test('레벨 요구 경험치: 8, 12, 16, 20 ...', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => xpToNext(l)), [8, 12, 16, 20, 24]);
});

test('레벨업과 경험치 이월', () => {
  const xp = createExperience();
  assert.equal(xp.addXp(7), 0);
  assert.deepEqual([xp.level, xp.xp], [1, 7]);
  assert.equal(xp.addXp(1), 1);
  assert.deepEqual([xp.level, xp.xp], [2, 0]);
  assert.equal(xp.addXp(13), 1); // 12가 필요 -> 1 이월
  assert.deepEqual([xp.level, xp.xp], [3, 1]);
});

test('큰 경험치는 여러 레벨을 한 번에 올리고 남는 양을 이월한다', () => {
  const xp = createExperience();
  assert.equal(xp.addXp(100), 5); // 8 + 12 + 16 + 20 + 24 = 80, 남은 20(다음 28)
  assert.deepEqual([xp.level, xp.xp, xp.xpToNext], [6, 20, 28]);
});

test('잘못된 경험치는 무시한다', () => {
  const xp = createExperience();
  for (const v of [0, -5, NaN, Infinity, '3', null, undefined]) assert.equal(xp.addXp(v), 0);
  assert.deepEqual([xp.level, xp.xp], [1, 0]);
});

test('한 프레임에 여러 구슬을 주우면 합쳐서 레벨업을 계산한다', () => {
  const xp = createExperience();
  for (let i = 0; i < 8; i++) {
    const e = enemyAt(i + 1, 2010 + i, 2000);
    kill(e);
    xp.spawnOrbFor(e);
  }
  const r = xp.collect(player);
  assert.deepEqual([r.collected, r.xpGained, r.levelsGained], [8, 8, 1]);
  assert.deepEqual([xp.level, xp.xp], [2, 0]);
});

test('리셋: 구슬, 경험치, 레벨, 자석이 모두 초기화된다', () => {
  const xp = createExperience();
  const e = enemyAt(1, 2000, 2000);
  kill(e);
  xp.spawnOrbFor(e);
  xp.addXp(50);
  xp.upgradeMagnet();
  xp.reset();
  assert.deepEqual([xp.orbs.length, xp.xp, xp.level, xp.magnetLevel, xp.pickupRadius], [0, 0, 1, 0, 60]);
  const e2 = enemyAt(2, 2000, 2000);
  kill(e2);
  assert.equal(xp.spawnOrbFor(e2).id, 1); // 구슬 번호도 처음부터
});
