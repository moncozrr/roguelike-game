// 단계 7: 원거리 적 발사, 직선 투사체, 명중/보호 규칙, 정지/리셋.
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_PROJECTILE, PLAYER, PLAYER_HEALTH, SPAWN, WORLD } from '../src/config.js';
import { createEnemy, damageEnemy } from '../src/enemy.js';
import { createEnemyProjectileSystem } from '../src/enemyProjectiles.js';
import { createPlayerHealth } from '../src/combat.js';
import { createSpawner } from '../src/spawner.js';
import { computeCamera } from '../src/camera.js';

const R = PLAYER.radius;
const makeEnemy = (id, x, y, kind = 'ranged') => createEnemy(id, x, y, { x: 0, y: 0 }, undefined, kind);
// 발사 쿨다운을 비워 바로 쏘게 한다.
const ready = (e) => {
  e.shotCooldown = 0;
  return e;
};
function ctx(player, enemies, hits = []) {
  return { player, playerRadius: R, enemies, onHit: (d) => hits.push(d) };
}

test('설정값: 피해 10, 속도 240, 최대 사거리 350, 쿨다운 2.5초, 생성 확률 25%', () => {
  assert.equal(ENEMY_PROJECTILE.damage, 10);
  assert.equal(ENEMY_PROJECTILE.speed, 240);
  assert.equal(ENEMY_PROJECTILE.maxDistance, 350);
  assert.equal(ENEMY_PROJECTILE.cooldown, 2.5);
  assert.equal(SPAWN.rangedChance, 0.25);
});

test('원거리 적은 쿨다운 2.5초로 시작하고, 일반 적은 발사 필드가 없다', () => {
  assert.equal(makeEnemy(1, 0, 0).shotCooldown, 2.5);
  assert.equal(makeEnemy(2, 0, 0, 'melee').shotCooldown, undefined);
  assert.equal(createEnemy(3, 0, 0, { x: 0, y: 0 }).kind, 'melee');
});

test('일반 적은 발사하지 않는다', () => {
  const sys = createEnemyProjectileSystem();
  const e = makeEnemy(1, 1000, 1000, 'melee');
  sys.update(10, ctx({ x: 1100, y: 1000 }, [e]));
  assert.equal(sys.projectiles.length, 0);
});

test('쿨다운이 끝나면 한 발 쏘고, 그 뒤 2.5초가 지나야 다시 쏜다', () => {
  const sys = createEnemyProjectileSystem();
  const player = { x: 1100, y: 1000 };
  const e = makeEnemy(1, 1000, 1000);
  sys.update(2.4, ctx(player, [e]));
  assert.equal(sys.projectiles.length, 0);
  sys.update(0.11, ctx(player, [e])); // 부동소수점 오차를 피하려고 0.1이 아니라 0.11
  assert.equal(sys.projectiles.length, 1);
  sys.update(0, ctx({ x: 5000, y: 5000 }, [e])); // 시간이 안 흐르면 아무 일도 없다
  assert.equal(e.shotCooldown, 2.5);
});

test('사거리 밖이면 쏘지 않고 쿨다운 0에서 기다리다가 들어오면 바로 쏜다', () => {
  const sys = createEnemyProjectileSystem();
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0.1, ctx({ x: 1000 + ENEMY_PROJECTILE.range + 1, y: 1000 }, [e]));
  assert.equal(sys.projectiles.length, 0);
  assert.equal(e.shotCooldown, 0);
  sys.update(0.016, ctx({ x: 1000 + ENEMY_PROJECTILE.range, y: 1000 }, [e]));
  assert.equal(sys.projectiles.length, 1);
});

test('죽은 적은 발사할 수 없다', () => {
  const sys = createEnemyProjectileSystem();
  const e = ready(makeEnemy(1, 1000, 1000));
  damageEnemy(e, 100);
  sys.update(1, ctx({ x: 1100, y: 1000 }, [e]));
  assert.equal(sys.projectiles.length, 0);
});

test('발사 순간의 위치로 직선 이동하고, 플레이어가 움직여도 추적하지 않는다', () => {
  const sys = createEnemyProjectileSystem();
  const player = { x: 1200, y: 1000 };
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0, ctx(player, [e])); // 발사만(dt 0)
  const p = sys.projectiles[0];
  assert.deepEqual([p.dx, p.dy], [1, 0]);
  player.x = 1000; // 플레이어가 위로 피한다
  player.y = 800;
  for (let i = 0; i < 5; i++) sys.update(0.05, ctx(player, [e]));
  assert.equal(p.dx, 1);
  assert.equal(p.dy, 0);
  assert.equal(p.y, 1000); // 직선: y가 바뀌지 않았다
  assert.ok(Math.abs(p.x - (1000 + 240 * 0.25)) < 1e-9);
});

test('명중하면 피해를 한 번 주고 사라진다(한 투사체는 한 번만)', () => {
  const sys = createEnemyProjectileSystem();
  const hits = [];
  const player = { x: 1100, y: 1000 };
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0, ctx(player, [e], hits));
  for (let i = 0; i < 40; i++) sys.update(0.016, ctx(player, [e], hits));
  assert.deepEqual(hits, [10]);
  assert.equal(sys.projectiles.length, 0);
});

test('느린 프레임에서도 플레이어를 관통하지 않는다(이동 구간 전체 검사)', () => {
  const sys = createEnemyProjectileSystem();
  const hits = [];
  const player = { x: 1100, y: 1000 };
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0, ctx(player, [e], hits));
  sys.update(0.4, ctx(player, [e], hits)); // 한 프레임에 96px 이동: 플레이어(100px)를 지나치는 거리
  assert.deepEqual(hits, [10]);
  assert.equal(sys.projectiles.length, 0);
});

test('빗나간 투사체는 최대 거리 350px에서 사라진다', () => {
  const sys = createEnemyProjectileSystem();
  const player = { x: 1100, y: 1000 };
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0, ctx(player, [e]));
  player.y = 1500; // 비켜 있음
  let t = 0;
  while (sys.projectiles.length > 0 && t < 5) {
    sys.update(0.05, ctx(player, [e]));
    e.shotCooldown = 99; // 더 쏘지 않게
    t += 0.05;
  }
  assert.equal(sys.projectiles.length, 0);
  assert.ok(t >= 350 / 240 - 0.06 && t <= 350 / 240 + 0.06);
});

test('월드 밖으로 나가면 사라진다', () => {
  const sys = createEnemyProjectileSystem({ world: { width: 400, height: 400 } });
  const player = { x: 390, y: 200 };
  const e = ready(makeEnemy(1, 300, 200));
  sys.update(0, ctx(player, [e]));
  assert.equal(sys.projectiles.length, 1);
  player.y = 380;
  e.shotCooldown = 99;
  sys.update(0.5, ctx(player, [e])); // 120px 이동: x=420 > 400
  assert.equal(sys.projectiles.length, 0);
});

test('보호 시간/대시 무적 중 명중: 투사체는 사라지고 플레이어는 피해가 없다', () => {
  const health = createPlayerHealth();
  const sys = createEnemyProjectileSystem();
  const player = { x: 1100, y: 1000 };
  const e = ready(makeEnemy(1, 1000, 1000));
  const onHit = (d) => health.takeDamage(d);
  health.startDashInvulnerability();
  sys.update(0, { player, playerRadius: R, enemies: [e], onHit });
  for (let i = 0; i < 40; i++) sys.update(0.016, { player, playerRadius: R, enemies: [e], onHit });
  assert.equal(sys.projectiles.length, 0);
  assert.equal(health.hp, PLAYER_HEALTH.maxHp); // 대시 무적 중
  // 피격 후 보호 중
  const h2 = createPlayerHealth();
  assert.equal(h2.takeContactDamage(), true);
  const hp = h2.hp;
  const sys2 = createEnemyProjectileSystem();
  const e2 = ready(makeEnemy(2, 1000, 1000));
  sys2.update(0, { player, playerRadius: R, enemies: [e2], onHit: (d) => h2.takeDamage(d) });
  for (let i = 0; i < 40; i++) sys2.update(0.016, { player, playerRadius: R, enemies: [e2], onHit: (d) => h2.takeDamage(d) });
  assert.equal(sys2.projectiles.length, 0);
  assert.equal(h2.hp, hp);
});

test('투사체 피해는 보호가 없을 때 적용되고 보호 시간을 시작한다. 접촉 피해는 그대로다', () => {
  const h = createPlayerHealth();
  assert.equal(h.takeDamage(ENEMY_PROJECTILE.damage), true);
  assert.equal(h.hp, 90);
  assert.equal(h.isProtected, true);
  assert.equal(h.takeContactDamage(), false); // 보호 중
  h.update(PLAYER_HEALTH.hitProtection);
  assert.equal(h.takeContactDamage(), true);
  assert.equal(h.hp, 80);
  assert.equal(h.takeDamage(NaN), false);
  assert.equal(h.takeDamage(-5), false);
});

test('투사체 피해로 HP가 0이 되면 죽는다', () => {
  const h = createPlayerHealth({ config: { ...PLAYER_HEALTH, maxHp: 10 } });
  h.takeDamage(ENEMY_PROJECTILE.damage);
  assert.equal(h.isDead, true);
});

test('정지/게임 오버: 시간이 흐르지 않으면 쿨다운과 투사체가 그대로다', () => {
  const sys = createEnemyProjectileSystem();
  const player = { x: 1100, y: 1000 };
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0.016, ctx(player, [e]));
  const snap = JSON.stringify({ p: sys.projectiles, c: e.shotCooldown });
  for (const dt of [0, -1, NaN, -Infinity]) sys.update(dt, ctx(player, [e]));
  assert.equal(JSON.stringify({ p: sys.projectiles, c: e.shotCooldown }), snap);
});

test('리셋: 투사체를 지운다(새 런의 새 적은 쿨다운 2.5초로 시작)', () => {
  const sys = createEnemyProjectileSystem();
  const e = ready(makeEnemy(1, 1000, 1000));
  sys.update(0, ctx({ x: 1100, y: 1000 }, [e]));
  assert.equal(sys.projectiles.length, 1);
  sys.reset();
  assert.equal(sys.projectiles.length, 0);
  assert.equal(makeEnemy(2, 0, 0).shotCooldown, ENEMY_PROJECTILE.cooldown);
});

test('생성: 원거리 확률 25%이고, 간격/그룹 크기/최대 수/5분 중단 규칙은 그대로다', () => {
  const view = { width: 800, height: 600 };
  const cam = computeCamera({ x: 2000, y: 2000 }, view, WORLD);
  // rng가 0.1이면 ranged, 0.9이면 melee(위치 계산에는 어느 값이든 쓸 수 있다)
  const all = createEnemyProjectileSystem; // 사용하지 않는 import 경고 방지용 참조
  assert.ok(all);
  const low = createSpawner({ rng: () => 0.1 }).update(SPAWN.baseInterval, { gameTime: 0, enemyCount: 0, cam, view });
  assert.equal(low.length, SPAWN.baseGroupSize);
  assert.ok(low.every((p) => p.kind === 'ranged'));
  const high = createSpawner({ rng: () => 0.9 }).update(SPAWN.baseInterval, { gameTime: 0, enemyCount: 0, cam, view });
  assert.ok(high.every((p) => p.kind === 'melee'));
  const full = createSpawner({ rng: () => 0.1 }).update(SPAWN.baseInterval, { gameTime: 0, enemyCount: SPAWN.maxEnemies, cam, view });
  assert.equal(full.length, 0);
  assert.deepEqual(createSpawner().update(10, { gameTime: 300, enemyCount: 0, cam, view }), []);
  // 통계: 많이 뽑으면 약 25%
  let seed = 12345;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sp = createSpawner({ rng });
  let ranged = 0;
  let total = 0;
  for (let i = 0; i < 400; i++) {
    for (const p of sp.update(SPAWN.baseInterval * 2, { gameTime: 0, enemyCount: 0, cam, view })) {
      total++;
      if (p.kind === 'ranged') ranged++;
    }
  }
  assert.ok(total > 1000);
  assert.ok(Math.abs(ranged / total - 0.25) < 0.05, `원거리 비율 ${ranged / total}`);
});
