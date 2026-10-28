// M2: game.js의 시작/종료 생명주기, 런 결과(처치 수), 업그레이드 보정값, 터치 입력 연결을 실제 game.js로 검증한다.
// 브라우저 없이 가짜 브라우저 객체로 실행한다(tests/helpers/gameHarness.js). 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';
import { createMiniBoss, createFinalBoss } from '../src/boss.js';
import { PLAYER_HEALTH, MAGNET, BOUNDARY, PLAYER, DASH } from '../src/config.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const PLAYER_POS = { x: 0, y: 0 };
const deadNormal = (id) => ({ id, x: 10, y: 10, kind: 'melee', facing: 'right', hp: 0, maxHp: 10, dead: true });
const deadRanged = (id) => ({ ...deadNormal(id), kind: 'ranged' });
const deadBoss = (boss) => ({ ...boss, hp: 0, dead: true });

test('destroy: 모든 리스너, 화면 크기 관찰자, 대기 중인 프레임이 해제되고 여러 번 불러도 안전하다', () => {
  const h = launchGame(loaded.startGame, { gameOptions: {} });
  try {
    assert.ok(h.listenerCount() > 0);
    assert.equal(h.liveResizeObservers(), 1);
    assert.equal(h.hasPendingFrame(), true);
    h.handle.destroy();
    assert.equal(h.listenerCount(), 0);
    assert.equal(h.liveResizeObservers(), 0);
    assert.equal(h.hasPendingFrame(), false);
    assert.doesNotThrow(() => h.handle.destroy());
    h.press('Enter'); // 해제된 뒤에는 키 입력이 아무 일도 하지 않는다
    assert.equal(h.handle.state, 'ready');
  } finally {
    h.dispose();
  }
});

test('반복 시작/종료: 리스너와 관찰자가 쌓이지 않는다', () => {
  for (let i = 0; i < 5; i++) {
    const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true } });
    try {
      h.run(0.5);
      h.handle.destroy();
      assert.equal(h.listenerCount(), 0, `${i + 1}번째 종료 후 남은 리스너`);
      assert.equal(h.liveResizeObservers(), 0);
    } finally {
      h.dispose();
    }
  }
});

test('autoStart: Enter 없이 바로 playing이 되고 시간이 흐른다', () => {
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true } });
  try {
    assert.equal(h.handle.state, 'playing');
    h.run(1);
    assert.ok(h.handle.getResult().survivalSeconds >= 0);
    assert.equal(h.handle.getResult().outcome, 'playing');
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('onRunEnd: 게임 오버 때 결과와 함께 정확히 한 번만 불리고, Enter로 다시 시작하지 않는다', () => {
  const results = [];
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true, dungeonId: 'ruinedJoseon', onRunEnd: (r) => results.push(r) } });
  try {
    h.run(0.5);
    h.tap('KeyG'); // 개발 모드: 게임 오버 강제 발생
    h.run(0.5);
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome, 'gameover');
    assert.equal(results[0].dungeonId, 'ruinedJoseon');
    h.tap('Enter');
    h.run(0.5);
    assert.equal(h.handle.state, 'gameover');
    assert.equal(results.length, 1);
    assert.equal(h.texts.some((t) => t.includes('Enter')), false, '로비가 관리할 때는 Enter 안내를 그리지 않는다');
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('onRunEnd가 없으면 예전처럼 Enter로 다시 시작한다(기존 동작 보존)', () => {
  const h = launchGame(loaded.startGame, { gameOptions: {} });
  try {
    h.tap('Enter');
    h.tap('KeyG');
    h.step();
    assert.equal(h.handle.state, 'gameover');
    h.tap('Enter');
    assert.equal(h.handle.state, 'playing');
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('처치 수: 일반(원거리 포함)과 보스를 따로 세고 몬스터별로도 센다', () => {
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true } });
  try {
    h.step();
    h.game.enemies.push(deadNormal(901), deadNormal(902), deadRanged(903), deadBoss(createMiniBoss(904, 0, 0, PLAYER_POS)), deadBoss(createFinalBoss(905, 0, 0, PLAYER_POS)));
    h.step();
    const r = h.handle.getResult();
    assert.equal(r.normalKills, 3);
    assert.equal(r.bossKills, 2);
    assert.deepEqual(r.kills, { wonyon: 3, midBoss: 1, finalBoss: 1 });
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('업그레이드 보정값: 최대 HP, 줍기 반경, 경계 내구도에 반영된다', () => {
  const h = launchGame(loaded.startGame, {
    gameOptions: { autoStart: true, modifiers: { maxHpBonus: 20, magnetBonus: 9, boundaryDurabilityMultiplier: 1.5 } },
  });
  try {
    h.step();
    assert.equal(h.game.health.maxHp, PLAYER_HEALTH.maxHp + 20);
    assert.equal(h.game.health.hp, PLAYER_HEALTH.maxHp + 20);
    assert.equal(h.game.experience.pickupRadius, MAGNET.basePickupRadius + 9);
    assert.equal(h.game.boundary().maxDurability, BOUNDARY.maxDurability * 1.5);
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('이동 속도 보정값: 같은 시간에 더 멀리 간다', () => {
  const moved = (multiplier) => {
    const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true, modifiers: { moveSpeedMultiplier: multiplier } } });
    try {
      h.step();
      const startX = h.game.player.x;
      h.press('KeyD');
      h.run(0.2);
      h.release('KeyD');
      return h.game.player.x - startX;
    } finally {
      h.handle.destroy();
      h.dispose();
    }
  };
  const base = moved(1);
  assert.ok(base > 0);
  assert.ok(Math.abs(moved(1.5) / base - 1.5) < 0.05);
});

test('조이스틱: 8방향으로 움직이고, 대각선도 같은 속도이며, 0으로 되돌리면 멈춘다', () => {
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true } });
  try {
    h.step();
    const p = h.game.player;
    const start = { x: p.x, y: p.y };
    h.handle.setMoveVector(1, 0);
    h.run(0.5);
    const straight = Math.hypot(p.x - start.x, p.y - start.y);
    assert.ok(straight > 0 && p.y === start.y);

    const mid = { x: p.x, y: p.y };
    h.handle.setMoveVector(0.7, -0.7);
    h.run(0.5);
    const diagonal = Math.hypot(p.x - mid.x, p.y - mid.y);
    assert.ok(p.y < mid.y && p.x > mid.x);
    assert.ok(Math.abs(diagonal / straight - 1) < 0.05, `대각선 ${diagonal} 대 직선 ${straight}`);

    h.handle.setMoveVector(0, 0);
    const stop = { x: p.x, y: p.y };
    h.run(0.5);
    assert.deepEqual({ x: p.x, y: p.y }, stop);

    h.handle.setMoveVector(NaN, Infinity); // 잘못된 값은 0으로 취급
    h.run(0.2);
    assert.deepEqual({ x: p.x, y: p.y }, stop);
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('조이스틱: 정지 중에는 움직이지 않고, 포커스를 잃으면 0으로 되돌아간다', () => {
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true } });
  try {
    h.step();
    const p = h.game.player;
    h.handle.setMoveVector(1, 0);
    h.handle.togglePause();
    const before = p.x;
    h.run(0.5);
    assert.equal(p.x, before);
    h.handle.togglePause();
    h.run(0.2);
    assert.ok(p.x > before);
    window.dispatch('blur', {});
    h.handle.togglePause(); // 포커스 상실로 멈춘 게임을 재개
    const afterBlur = p.x;
    h.run(0.3);
    assert.equal(p.x, afterBlur, '포커스 상실 뒤 조이스틱 값이 남아 있으면 안 된다');
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('터치 대시: 키보드 Space와 같은 규칙(쿨다운, 정지 중 무시)을 따르고 한 번만 발동한다', () => {
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true } });
  try {
    h.step();
    const p = h.game.player;
    h.handle.setMoveVector(1, 0);
    h.handle.requestDash();
    h.handle.requestDash(); // 같은 프레임의 중복 요청은 하나로 합쳐진다
    h.run(0.4);
    const dashed = p.x;
    assert.ok(dashed > 2000 + DASH.distance - 1, '대시 거리만큼은 움직였어야 한다');

    h.handle.togglePause();
    h.handle.requestDash(); // 정지 중 요청은 무시
    h.handle.togglePause();
    h.handle.setMoveVector(0, 0);
    h.run(1);
    assert.ok(Math.abs(p.x - dashed) < 1, '정지 중에 쌓인 대시 요청이 재개 후 실행되면 안 된다');
    assert.ok(PLAYER.speed > 0);
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});

test('abandon: 진행 중인 런을 게임 오버 결과로 끝내고, 결과는 한 번만 보고된다', () => {
  const results = [];
  const h = launchGame(loaded.startGame, { gameOptions: { autoStart: true, onRunEnd: (r) => results.push(r) } });
  try {
    h.run(0.3);
    h.handle.togglePause();
    h.handle.abandon();
    h.run(0.3);
    h.handle.abandon();
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome, 'gameover');
  } finally {
    h.handle.destroy();
    h.dispose();
  }
});
