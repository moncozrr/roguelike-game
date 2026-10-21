// 단계 1~5 기능이 단계 6 이후에도 유지되는지 확인하는 회귀 테스트(순수 로직만 다룬다).
// 이동/대시/카메라는 game.js 안에 있어 DOM 없이 불러올 수 없으므로 여기서는 다루지 않는다(수동 검수 대상).

import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_HEALTH, DASH_INVULN, SPAWN, WORLD } from '../src/config.js';
import { createPlayerHealth, anyContact } from '../src/combat.js';
import { createBoundary } from '../src/boundary.js';
import { createSpawner, densityPercent } from '../src/spawner.js';
import { createGameState, STATES } from '../src/gameState.js';
import { computeCamera } from '../src/camera.js';
import { createEnemy, updateEnemies, enemyRadius } from '../src/enemy.js';

test('HP: 접촉 피해 후 보호 시간 동안 반복 피해가 없고, 대시 무적은 별개다', () => {
  const h = createPlayerHealth();
  assert.equal(h.takeContactDamage(), true);
  assert.equal(h.hp, PLAYER_HEALTH.maxHp - PLAYER_HEALTH.contactDamage);
  assert.equal(h.takeContactDamage(), false); // 보호 중
  h.update(PLAYER_HEALTH.hitProtection);
  h.startDashInvulnerability();
  assert.equal(h.canTakeDamage, false); // 대시 무적
  h.update(DASH_INVULN);
  assert.equal(h.canTakeDamage, true);
});

test('HP 0이면 죽고, reset으로 복구된다', () => {
  const h = createPlayerHealth({ config: { ...PLAYER_HEALTH, maxHp: 10, hitProtection: 0 } });
  h.takeContactDamage();
  assert.equal(h.isDead, true);
  h.reset();
  assert.equal(h.hp, 10);
});

test('접촉 판정은 죽은 적을 목록에서 뺀 뒤에는 닿지 않는다', () => {
  const r = enemyRadius();
  const e = createEnemy(1, 100, 100, { x: 100, y: 100 });
  assert.equal(anyContact({ x: 100, y: 100 }, 14, [e], r), true);
  assert.equal(anyContact({ x: 100, y: 100 }, 14, [], r), false);
});

test('경계: 중심에 고정되고 안/밖을 판정한다', () => {
  const center = { x: 2000, y: 2000 };
  const b = createBoundary(center);
  assert.equal(b.contains({ x: 2000 + b.radius, y: 2000 }), true);
  assert.equal(b.contains({ x: 2000 + b.radius + 1, y: 2000 }), false);
});

test('적 생성: 밀도 규칙과 5:00 중단, 최대 수', () => {
  assert.equal(densityPercent(0), 100);
  assert.equal(densityPercent(60), 120);
  assert.equal(densityPercent(299), 100 + 4 * 20);
  assert.equal(densityPercent(300), 0);
  const spawner = createSpawner({ rng: () => 0.5 });
  const cam = computeCamera({ x: 2000, y: 2000 }, { width: 800, height: 600 }, WORLD);
  const made = spawner.update(SPAWN.baseInterval, { gameTime: 0, enemyCount: 0, cam, view: { width: 800, height: 600 } });
  assert.equal(made.length, SPAWN.baseGroupSize);
  const full = spawner.update(SPAWN.baseInterval, { gameTime: 0, enemyCount: SPAWN.maxEnemies, cam, view: { width: 800, height: 600 } });
  assert.equal(full.length, 0);
  assert.deepEqual(spawner.update(10, { gameTime: 300, enemyCount: 0, cam, view: { width: 800, height: 600 } }), []);
});

test('적은 플레이어를 향해 이동한다', () => {
  const p = { x: 1000, y: 1000 };
  const e = createEnemy(1, 1500, 1000, p);
  updateEnemies([e], 1, p);
  assert.ok(e.x < 1500);
});

test('게임 상태 전환: 일시 정지/재개, 게임 오버 후 재시작', () => {
  const s = createGameState();
  assert.equal(s.send('start'), true);
  assert.equal(s.send('pause'), true);
  assert.equal(s.is(STATES.PAUSED), true);
  assert.equal(s.send('gameOver'), false); // 정지 중에는 게임 오버로 가지 않는다
  assert.equal(s.send('resume'), true);
  assert.equal(s.send('gameOver'), true);
  assert.equal(s.send('pause'), false);
  assert.equal(s.send('start'), true); // 재시작
  assert.equal(s.is(STATES.PLAYING), true);
});
