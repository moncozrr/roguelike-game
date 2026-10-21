// 단계 6: 적 HP/사망, 대상 선택, 원거리/근접 무기, 슬롯/레벨 규칙, 정지/리셋.
// 실행: npm test (Node 내장 테스트 러너, 추가 의존성 없음)

import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY, WEAPONS, WEAPON_RULES } from '../src/config.js';
import { createEnemy, damageEnemy, removeDeadEnemies, findNearestEnemy, updateEnemies, separateEnemies } from '../src/enemy.js';
import { createWeaponSystem, clampWeaponLevel } from '../src/weapons.js';

const player = { x: 2000, y: 2000 };
const enemyAt = (id, x, y) => createEnemy(id, x, y, player);

test('원혼은 HP 10으로 시작한다', () => {
  const e = enemyAt(1, 2100, 2000);
  assert.equal(e.hp, 10);
  assert.equal(e.maxHp, 10);
  assert.equal(e.dead, false);
  assert.equal(ENEMY.maxHp, 10);
});

test('원거리 피해 3: 4번 맞으면 처치', () => {
  const e = enemyAt(1, 2100, 2000);
  const dmg = WEAPONS.shard.damage;
  assert.equal(dmg, 3);
  for (let i = 1; i <= 3; i++) {
    assert.deepEqual(damageEnemy(e, dmg), { killed: false });
    assert.equal(e.hp, 10 - 3 * i);
    assert.equal(e.dead, false);
  }
  assert.deepEqual(damageEnemy(e, dmg), { killed: true });
  assert.equal(e.hp, 0);
  assert.equal(e.dead, true);
});

test('근접 피해 5: 2번 맞으면 처치', () => {
  const e = enemyAt(1, 2100, 2000);
  const dmg = WEAPONS.pulse.damage;
  assert.equal(dmg, 5);
  assert.deepEqual(damageEnemy(e, dmg), { killed: false });
  assert.equal(e.hp, 5);
  assert.deepEqual(damageEnemy(e, dmg), { killed: true });
  assert.equal(e.dead, true);
});

test('죽은 적은 더 이상 피해를 받지 않고 죽음 처리도 반복되지 않는다', () => {
  const e = enemyAt(1, 2100, 2000);
  damageEnemy(e, 100);
  assert.equal(e.hp, 0);
  assert.equal(damageEnemy(e, 5), null);
  assert.equal(e.hp, 0);
  assert.equal(damageEnemy(enemyAt(2, 0, 0), -3), null); // 잘못된 피해값
  assert.equal(damageEnemy(enemyAt(3, 0, 0), NaN), null);
});

test('죽은 적은 대상이 되지 않고, 가장 가까운 살아 있는 적을 고른다(동률이면 id가 작은 쪽)', () => {
  const near = enemyAt(1, 2050, 2000);
  const far = enemyAt(2, 2200, 2000);
  assert.equal(findNearestEnemy([far, near], player, 300), near);
  damageEnemy(near, 100);
  assert.equal(findNearestEnemy([far, near], player, 300), far);
  assert.equal(findNearestEnemy([far, near], player, 100), null); // 사거리 밖
  const a = enemyAt(5, 2100, 2000);
  const b = enemyAt(4, 1900, 2000);
  assert.equal(findNearestEnemy([a, b], player, 300), b);
  assert.equal(findNearestEnemy([b, a], player, 300), b);
});

test('removeDeadEnemies: 죽은 적만 제거하고 순서를 유지한다', () => {
  const list = [enemyAt(1, 0, 0), enemyAt(2, 0, 0), enemyAt(3, 0, 0)];
  list[1].dead = true;
  assert.equal(removeDeadEnemies(list), 1);
  assert.deepEqual(list.map((e) => e.id), [1, 3]);
});

test('죽은 적은 이동과 밀어내기에서 제외된다', () => {
  const dead = enemyAt(1, 2100, 2000);
  const alive = enemyAt(2, 2100, 2000);
  damageEnemy(dead, 100);
  const before = { x: dead.x, y: dead.y };
  updateEnemies([dead, alive], 0.1, player);
  assert.deepEqual({ x: dead.x, y: dead.y }, before);
  const a = enemyAt(3, 500, 500);
  const d = enemyAt(4, 500, 500);
  damageEnemy(d, 100);
  separateEnemies([a, d]);
  assert.deepEqual({ x: a.x, y: a.y }, { x: 500, y: 500 }); // 죽은 적과는 밀어내지 않는다
});

test('무기 슬롯 3개, 종류당 하나, 레벨 최대 5', () => {
  const defs = { a: WEAPONS.shard, b: WEAPONS.pulse, c: WEAPONS.shard, d: WEAPONS.pulse };
  const sys = createWeaponSystem({ defs, startingWeapons: [] });
  assert.equal(WEAPON_RULES.maxSlots, 3);
  assert.equal(WEAPON_RULES.maxLevel, 5);
  assert.equal(sys.equip('a'), true);
  assert.equal(sys.equip('a'), false); // 중복
  assert.equal(sys.equip('b'), true);
  assert.equal(sys.equip('c'), true);
  assert.equal(sys.equip('d'), false); // 슬롯 가득
  assert.equal(sys.equip('nope'), false);
  assert.equal(sys.slots.length, 3);
  assert.equal(sys.setLevel('a', 99), true);
  assert.equal(sys.slots[0].level, 5);
  sys.setLevel('a', Infinity);
  assert.equal(sys.slots[0].level, 5);
  sys.setLevel('a', -3);
  assert.equal(sys.slots[0].level, 1);
  assert.equal(clampWeaponLevel(NaN), 1);
  assert.equal(clampWeaponLevel(3.9), 3);
  assert.equal(sys.setLevel('zzz', 2), false);
});

test('기본 구성: 시작 무기는 shard 하나뿐이다(pulse는 레벨업 보상으로 얻는다)', () => {
  const sys = createWeaponSystem();
  assert.deepEqual(sys.slots.map((w) => w.id), ['shard']);
  assert.ok(sys.slots.every((w) => w.level === 1 && w.cooldown === 0));
});

test('적이 사거리 밖이면 공격하지 않는다', () => {
  const sys = createWeaponSystem();
  const e = enemyAt(1, 3000, 2000);
  sys.update(0.016, player, [e]);
  assert.equal(sys.projectiles.length, 0);
  assert.equal(e.hp, 10);
});

test('원거리 무기: 투사체가 발사되어 적을 맞히고 사라진다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard'] });
  const e = enemyAt(1, 2200, 2000);
  sys.update(0.016, player, [e]);
  assert.equal(sys.projectiles.length, 1);
  assert.equal(e.hp, 10); // 아직 닿지 않음
  for (let i = 0; i < 60 && e.hp === 10; i++) sys.update(0.016, player, [e]);
  assert.equal(e.hp, 7); // 피해 3, 정확히 한 번
  assert.equal(sys.projectiles.length, 0); // 맞은 투사체는 제거(쿨다운 중이라 새 발사 없음)
});

test('원거리 무기: 쿨다운마다 한 발씩 쏘고 4발로 처치한다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard'] });
  const e = enemyAt(1, 2100, 2000);
  let shots = 0;
  let t = 0;
  while (!e.dead && t < 10) {
    const before = sys.projectiles.length;
    sys.update(0.05, player, [e]);
    t += 0.05;
    if (sys.projectiles.length > before) shots++;
  }
  assert.equal(e.dead, true);
  assert.equal(shots, 4);
  assert.ok(t >= WEAPONS.shard.cooldown * 3 - 0.05); // 4발 사이에 쿨다운 3번
});

test('투사체는 느린 프레임에서도 적을 뚫고 지나가지 않는다(선분 판정)', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard'] });
  const e = enemyAt(1, 2150, 2000);
  sys.update(0, player, [e]); // dt 0: 발사만
  assert.equal(sys.projectiles.length, 1);
  sys.update(0.5, player, [e]); // 한 프레임에 210px 이동: 적(150px)을 지나치는 거리
  assert.equal(e.hp, 7);
  assert.equal(sys.projectiles.length, 0);
});

test('투사체는 월드 밖으로 나가면 제거된다', () => {
  const world = { width: 400, height: 400 };
  const sys = createWeaponSystem({ startingWeapons: ['shard'], world });
  const p = { x: 300, y: 200 };
  const e = enemyAt(1, 390, 200);
  sys.update(0, p, [e]); // 오른쪽 월드 가장자리 쪽으로 발사
  assert.equal(sys.projectiles.length, 1);
  e.x = 5000; // 맞히지 못하게 치운다
  sys.update(0.3, p, [e]); // 126px 이동 -> x=426 > 400
  assert.equal(e.hp, 10);
  assert.equal(sys.projectiles.length, 0);
});

test('투사체는 최대 거리를 넘으면 제거된다', () => {
  const defs = { s: { ...WEAPONS.shard, projectileMaxDistance: 50 } };
  const sys = createWeaponSystem({ defs, startingWeapons: ['s'] });
  const e = enemyAt(1, 2300, 2000);
  sys.update(0, player, [e]);
  assert.equal(sys.projectiles.length, 1);
  e.x = 99999;
  for (let i = 0; i < 4; i++) sys.update(0.05, player, [e]);
  assert.equal(sys.projectiles.length, 0);
});

test('근접 무기: 범위 안의 모든 적을 한 번 때리고 2번에 처치, 범위 밖은 그대로', () => {
  const sys = createWeaponSystem({ startingWeapons: ['pulse'] });
  const a = enemyAt(1, 2040, 2000);
  const b = enemyAt(2, 2000, 1950);
  const far = enemyAt(3, 2500, 2000);
  const list = [a, b, far];
  sys.update(0.016, player, list);
  assert.equal(a.hp, 5);
  assert.equal(b.hp, 5);
  assert.equal(far.hp, 10);
  assert.equal(sys.effects.length, 1);
  sys.update(0.5, player, list); // 쿨다운 중
  assert.equal(a.hp, 5);
  sys.update(0.6, player, list);
  assert.equal(a.dead, true);
  assert.equal(b.dead, true);
  assert.equal(far.dead, false);
});

test('이미 죽은 적은 대상이 되거나 피해를 받지 않는다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard', 'pulse'] }); // 원거리 + 근접
  const e = enemyAt(1, 2040, 2000);
  damageEnemy(e, 100);
  sys.update(0.016, player, [e]);
  assert.equal(sys.projectiles.length, 0);
  assert.equal(e.hp, 0);
  assert.equal(sys.effects.length, 0);
});

test('정지/게임 오버: 시간이 흐르지 않으면(dt 0 또는 잘못된 값) 쿨다운, 투사체, 효과가 그대로다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard', 'pulse'] });
  const far = enemyAt(1, 2200, 2000);
  const near = enemyAt(2, 2040, 2000);
  sys.update(0.016, player, [far, near]);
  const snapshot = JSON.stringify({ s: sys.slots, p: sys.projectiles, f: sys.effects });
  // 게임은 실행 중(PLAYING)일 때만 update를 부른다. 그래도 dt가 0/음수/NaN이면 아무것도 진행하지 않아야 한다.
  for (const dt of [0, -1, NaN, -Infinity]) sys.update(dt, player, [far, near]);
  assert.equal(JSON.stringify({ s: sys.slots, p: sys.projectiles, f: sys.effects }), snapshot);
});

test('리셋: 투사체/효과를 지우고 쿨다운과 레벨을 되돌린다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard', 'pulse'] });
  const e = enemyAt(1, 2060, 2000);
  sys.update(0.016, player, [e]);
  sys.setLevel('shard', 4);
  assert.ok(sys.projectiles.length > 0 && sys.effects.length > 0);
  assert.ok(sys.slots.some((w) => w.cooldown > 0));
  sys.reset();
  assert.equal(sys.projectiles.length, 0);
  assert.equal(sys.effects.length, 0);
  assert.deepEqual(sys.slots.map((w) => [w.id, w.level, w.cooldown]), [['shard', 1, 0], ['pulse', 1, 0]]);
});
