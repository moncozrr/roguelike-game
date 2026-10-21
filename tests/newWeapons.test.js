// 단계 8: 신규 무기 Chain Lightning, Boomerang Blade.
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/config.js';
import { createEnemy, damageEnemy } from '../src/enemy.js';
import { createWeaponSystem } from '../src/weapons.js';
import { strikeChain } from '../src/weaponAttacks.js';

const player = { x: 2000, y: 2000 };
const enemyAt = (id, x, y, hp = 10) => {
  const e = createEnemy(id, x, y, player);
  e.hp = e.maxHp = hp;
  return e;
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---------- Chain Lightning ----------

test('Chain Lightning 사양: 피해 2, 주기 1.2초, 사거리 180, 최대 3마리, 연쇄 거리 100', () => {
  const d = WEAPONS.chainLightning;
  assert.deepEqual([d.damage, d.cooldown, d.range, d.chainCount, d.chainDistance], [2, 1.2, 180, 3, 100]);
});

test('Chain Lightning: 사거리 안의 가장 가까운 적에서 시작해 최대 3마리까지 연쇄한다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['chainLightning'] });
  const a = enemyAt(1, 2050, 2000); // 가장 가까움(50)
  const b = enemyAt(2, 2120, 2000); // a에서 70
  const c = enemyAt(3, 2200, 2000); // b에서 80
  const d = enemyAt(4, 2300, 2000); // c에서 100 이지만 3마리 제한
  const list = [d, c, b, a]; // 순서와 무관해야 한다
  sys.update(0.016, player, list);
  assert.deepEqual(list.map((e) => e.hp).reverse(), [8, 8, 8, 10]);
  assert.equal(sys.effects.length, 1);
  assert.equal(sys.effects[0].points.length, 4); // 플레이어 + 3마리
});

test('Chain Lightning: 연쇄 거리(100px)를 벗어난 적에게는 이어지지 않는다', () => {
  const a = enemyAt(1, 2050, 2000);
  const b = enemyAt(2, 2100, 2000); // 50
  const c = enemyAt(3, 2201, 2000); // b에서 101 > 100
  const points = strikeChain(WEAPONS.chainLightning, 2, player, [a, b, c]);
  assert.equal(points.length, 3);
  assert.deepEqual([a.hp, b.hp, c.hp], [8, 8, 10]);
  // 정확히 100px는 이어진다(경계 포함)
  const x = enemyAt(4, 2150, 2000);
  const y = enemyAt(5, 2250, 2000);
  strikeChain(WEAPONS.chainLightning, 2, player, [x, y]);
  assert.deepEqual([x.hp, y.hp], [8, 8]);
});

test('Chain Lightning: 한 공격에서 같은 적을 두 번 때리지 않고, 다음 적이 없으면 끝난다', () => {
  const a = enemyAt(1, 2050, 2000);
  const b = enemyAt(2, 2080, 2000);
  const points = strikeChain(WEAPONS.chainLightning, 2, player, [a, b]);
  assert.equal(points.length, 3); // 플레이어 + 2마리(세 번째 대상 없음)
  assert.deepEqual([a.hp, b.hp], [8, 8]);
  const solo = enemyAt(3, 2050, 2000);
  strikeChain(WEAPONS.chainLightning, 2, player, [solo]);
  assert.equal(solo.hp, 8);
});

test('Chain Lightning: 사거리 밖이면 공격하지 않고 쿨다운 0에서 기다린다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['chainLightning'] });
  const e = enemyAt(1, 2000 + 181, 2000);
  sys.update(0.5, player, [e]);
  assert.equal(e.hp, 10);
  assert.equal(sys.effects.length, 0);
  assert.equal(sys.slots[0].cooldown, 0);
  e.x = 2000 + 180; // 사거리 경계 포함
  sys.update(0.016, player, [e]);
  assert.equal(e.hp, 8);
});

test('Chain Lightning: 죽은 적은 시작점도 연쇄 대상도 아니다. 대상이 모두 죽어 있어도 오류가 없다', () => {
  const a = enemyAt(1, 2040, 2000);
  const b = enemyAt(2, 2080, 2000);
  const c = enemyAt(3, 2120, 2000);
  damageEnemy(a, 1000);
  strikeChain(WEAPONS.chainLightning, 2, player, [a, b, c]);
  assert.deepEqual([a.hp, b.hp, c.hp], [0, 8, 8]);
  const dead = enemyAt(4, 2040, 2000);
  damageEnemy(dead, 1000);
  assert.equal(strikeChain(WEAPONS.chainLightning, 2, player, [dead]), null);
  assert.equal(strikeChain(WEAPONS.chainLightning, 2, player, []), null);
});

test('Chain Lightning: 공격 주기 1.2초와 레벨별 피해(2 × 배율)', () => {
  const sys = createWeaponSystem({ startingWeapons: ['chainLightning'] });
  const e = enemyAt(1, 2050, 2000, 1000);
  sys.update(0, player, [e]);
  assert.equal(e.hp, 998);
  sys.update(1.1, player, [e]); // 아직 쿨다운 중
  assert.equal(e.hp, 998);
  sys.update(0.1, player, [e]); // 합계 1.2초
  assert.equal(e.hp, 996);
  for (let i = 0; i < 4; i++) sys.upgrade('chainLightning'); // Lv.5 = 180%
  sys.update(1.2, player, [e]);
  assert.ok(near(e.hp, 996 - 3.6));
});

test('Chain Lightning: 번개 효과는 시간이 지나면 사라진다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['chainLightning'] });
  const e = enemyAt(1, 2050, 2000, 1000);
  sys.update(0, player, [e]);
  assert.equal(sys.effects.length, 1);
  e.x = 99999; // 더 쏘지 못하게 사거리 밖으로
  sys.update(WEAPONS.chainLightning.flashDuration + 0.01, player, [e]);
  assert.equal(sys.effects.length, 0);
});

// ---------- Boomerang Blade ----------

test('Boomerang Blade 사양: 피해 2, 주기 2초, 사거리 220, 속도 300', () => {
  const d = WEAPONS.boomerangBlade;
  assert.deepEqual([d.damage, d.cooldown, d.range, d.projectileSpeed], [2, 2, 220, 300]);
});

function runBoomerang(sys, list, seconds, dt = 0.02, p = player) {
  for (let t = 0; t < seconds; t += dt) sys.update(dt, p, list);
}

test('Boomerang: 발사 후 타깃 쪽으로 날아가고, 도달하면 귀환해서 플레이어에게 닿으면 제거된다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const e = enemyAt(1, 2150, 2000, 1000);
  sys.update(0, player, [e]);
  assert.equal(sys.boomerangs.length, 1);
  const b = sys.boomerangs[0];
  assert.equal(b.phase, 'out');
  sys.update(0.1, player, [e]);
  assert.ok(near(b.x, 2030)); // 300px/s × 0.1초
  e.hp = 1000;
  const phases = new Set();
  for (let i = 0; i < 100 && sys.boomerangs.length > 0; i++) {
    sys.update(0.02, player, [e]);
    if (sys.boomerangs[0]) phases.add(sys.boomerangs[0].phase);
  }
  assert.ok(phases.has('return'));
  assert.equal(sys.boomerangs.length, 0); // 플레이어에게 돌아와 제거됨
});

test('Boomerang: 이동 경로의 적에게 피해를 주고, 왕복 중 같은 적은 한 번만 맞는다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const target = enemyAt(1, 2200, 2000, 1000);
  sys.update(0, player, [target]); // 발사
  const pathEnemy = enemyAt(2, 2100, 2000, 1000); // 발사 뒤 경로 위에 나타난 적
  const list = [target, pathEnemy];
  runBoomerang(sys, list, 1.9); // 쿨다운 2초가 끝나기 전: 한 번의 왕복이 끝난다
  assert.equal(sys.boomerangs.length, 0);
  // 나갈 때와 돌아올 때 두 번 지나가지만 같은 적은 한 번만 맞는다
  assert.ok(near(target.hp, 998));
  assert.ok(near(pathEnemy.hp, 998));
});

test('Boomerang: 돌아오는 길에도 아직 맞지 않은 적을 맞힌다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const target = enemyAt(1, 2200, 2000, 1000);
  const list = [target];
  sys.update(0, player, list);
  let guard = 0;
  while (sys.boomerangs[0]?.phase === 'out' && guard++ < 200) sys.update(0.02, player, list);
  assert.equal(sys.boomerangs[0].phase, 'return');
  const late = enemyAt(2, 2100, 2000, 1000); // 돌아오는 길 위
  list.push(late);
  guard = 0;
  while (sys.boomerangs.length > 0 && guard++ < 200) sys.update(0.02, player, list);
  assert.ok(near(late.hp, 998));
});

test('Boomerang: 느린 프레임에서도 경로의 적을 지나치지 않는다(선분 판정)', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const target = enemyAt(1, 2200, 2000, 1000);
  sys.update(0, player, [target]);
  const mid = enemyAt(2, 2100, 2000, 1000);
  sys.update(0.5, player, [target, mid]); // 한 프레임에 150px 이동
  assert.ok(near(mid.hp, 998));
});

test('Boomerang: 플레이어가 움직여도 현재 위치로 돌아온다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const p = { x: 2000, y: 2000 };
  const target = enemyAt(1, 2150, 2000, 1000);
  sys.update(0, p, [target]);
  let guard = 0;
  while (sys.boomerangs[0]?.phase === 'out' && guard++ < 200) sys.update(0.02, p, [target]);
  p.x = 2000;
  p.y = 1900; // 귀환 중 플레이어가 위로 이동
  guard = 0;
  while (sys.boomerangs.length > 0 && guard++ < 300) sys.update(0.02, p, [target]);
  assert.equal(sys.boomerangs.length, 0);
  assert.ok(guard < 300);
});

test('Boomerang: 계속 도망가는 플레이어를 쫓다가도 수명(안전장치)이 다하면 제거된다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const p = { x: 2000, y: 2000 };
  const target = enemyAt(1, 2150, 2000, 1e9);
  sys.update(0, p, [target]);
  target.x = 99999; // 더 쏘지 못하게 사거리 밖으로
  for (let t = 0; t < 8; t += 0.05) {
    p.x += 20 * 1.5; // 600px/s로 도망(부메랑 속도보다 빠름)
    sys.update(0.05, p, [target]);
  }
  assert.equal(sys.boomerangs.length, 0);
});

test('Boomerang: 타깃이 도중에 죽어도 오류 없이 마지막 위치까지 갔다가 귀환한다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const target = enemyAt(1, 2200, 2000);
  const list = [target];
  sys.update(0, player, list);
  sys.update(0.1, player, list);
  damageEnemy(target, 1000); // 타깃 사망
  list.length = 0; // 목록에서도 제거
  for (let i = 0; i < 200 && sys.boomerangs.length > 0; i++) sys.update(0.02, player, list);
  assert.equal(sys.boomerangs.length, 0);
});

test('Boomerang: 타깃이 멀리 도망가면 최대 거리(300px)에서 귀환한다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const target = enemyAt(1, 2200, 2000, 1e9);
  sys.update(0, player, [target]);
  const b = sys.boomerangs[0];
  for (let i = 0; i < 100 && b.phase === 'out'; i++) {
    target.x = 3500;
    sys.update(0.02, player, [target]);
  }
  assert.equal(b.phase, 'return');
  assert.ok(near(b.traveled, WEAPONS.boomerangBlade.maxDistance));
});

test('Boomerang: 공격 주기 2초로 발사하고 레벨별 피해(2 × 배율)를 쓴다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const e = enemyAt(1, 2150, 2000, 1e6);
  const seen = new Set();
  for (let t = 0; t < 3; t += 0.05) {
    sys.update(0.05, player, [e]);
    for (const b of sys.boomerangs) seen.add(b);
  }
  assert.equal(seen.size, 2); // 0초와 2초 근처에서 한 번씩
  const lv = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  for (let i = 0; i < 4; i++) lv.upgrade('boomerangBlade'); // Lv.5
  lv.update(0, player, [e]);
  assert.ok(near(lv.boomerangs[0].damage, 3.6));
});

test('Boomerang: 타깃이 없으면 발사하지 않고 쿨다운 0에서 기다린다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade'] });
  const e = enemyAt(1, 2000 + 221, 2000);
  sys.update(1, player, [e]);
  assert.equal(sys.boomerangs.length, 0);
  assert.equal(sys.slots[0].cooldown, 0);
});

test('일시 정지/게임 오버(시간이 흐르지 않음)에서는 부메랑과 쿨다운이 그대로이고, 리셋하면 모두 지워진다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['boomerangBlade', 'chainLightning'] });
  const e = enemyAt(1, 2150, 2000, 1000);
  sys.update(0.1, player, [e]);
  const snap = JSON.stringify({ s: sys.slots, b: sys.boomerangs.map((b) => [b.x, b.y, b.phase, b.age]), f: sys.effects });
  for (const dt of [0, -1, NaN, -Infinity]) sys.update(dt, player, [e]);
  assert.equal(JSON.stringify({ s: sys.slots, b: sys.boomerangs.map((b) => [b.x, b.y, b.phase, b.age]), f: sys.effects }), snap);
  assert.ok(sys.boomerangs.length > 0 && sys.effects.length > 0);
  sys.reset();
  assert.equal(sys.boomerangs.length, 0);
  assert.equal(sys.effects.length, 0);
  assert.deepEqual(sys.slots.map((w) => [w.id, w.level, w.cooldown]), [['boomerangBlade', 1, 0], ['chainLightning', 1, 0]]); // 시작 구성으로 복귀
});
