// 단계 10 통합 테스트: 실제 game.js에서 R 키 토글, 시간 기반 회복, 정지 중 멈춤, 경계 안/밖 공격력 버프, 새 런 초기화를 확인한다.
// 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';
import { BOUNDARY, WEAPONS } from '../src/config.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

function startPlaying(seed = 1) {
  const h = launchGame(loaded.startGame, { seed });
  h.step();
  h.tap('Enter');
  assert.equal(h.game.state.current, 'playing');
  return h;
}

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('R 키로 회복이 켜지고 꺼지며, 꺼져 있으면 오래 기다려도 회복하지 않는다', () => {
  const h = startPlaying();
  try {
    const b = () => h.game.boundary();
    assert.equal(b().recoveryOn, BOUNDARY.recoveryDefaultOn);
    h.tap('KeyR');
    assert.equal(b().recoveryOn, !BOUNDARY.recoveryDefaultOn);
    h.press('KeyR', { repeat: true }); // 누르고 있는 반복 입력은 무시
    assert.equal(b().recoveryOn, !BOUNDARY.recoveryDefaultOn);
    b().setRecovery(false);
    b().damage(50);
    h.run(6);
    assert.equal(b().durability, 50);
    h.tap('KeyR'); // ON
    h.run(BOUNDARY.recoveryDelay + 1);
    assert.ok(b().durability > 50);
  } finally {
    h.dispose();
  }
});

test('개발 키 B로 내구도를 깎고(경계는 그대로), 회복은 대기 3초 뒤 초당 5%씩 진행된다', () => {
  const h = startPlaying();
  try {
    const b = () => h.game.boundary();
    h.tap('KeyB', { shiftKey: true });
    assert.equal(b().durability, 0);
    assert.equal(b().radius, BOUNDARY.baseRadius); // 파괴되지 않는다
    const first = b().durability;
    h.run(BOUNDARY.recoveryDelay - 0.2);
    assert.equal(b().durability, first); // 대기 중
    h.run(0.2 + 2); // 대기 끝 + 2초
    near(b().durability, (b().maxDurability * 5 * 2) / 100, 0.5); // 프레임 단위 반올림 허용
  } finally {
    h.dispose();
  }
});

test('일시 정지 중에는 회복 시간이 흐르지 않고, R 키도 먹지 않는다', () => {
  const h = startPlaying();
  try {
    const b = () => h.game.boundary();
    b().damage(50);
    h.run(1);
    h.tap('Escape');
    assert.equal(h.game.state.current, 'paused');
    h.tap('KeyR');
    assert.equal(b().recoveryOn, BOUNDARY.recoveryDefaultOn); // 정지 중에는 토글되지 않는다
    h.run(10);
    assert.equal(b().durability, 50);
    assert.ok(b().timeSinceDamage < 1.5); // 정지 시간은 대기 시간에 포함되지 않는다
  } finally {
    h.dispose();
  }
});

test('경계 안에서 쏜 투사체는 공격력 +50%, 밖에서 쏜 투사체는 기본 피해이며 내구도 0이면 +25%다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    const base = WEAPONS.shard.damage;
    const enemyAt = (x, y) => ({ id: 900, x, y, kind: 'melee', facing: 'right', hp: 10, maxHp: 10, dead: false });
    const fireDamage = () => {
      g.enemies.length = 0;
      g.weapons.projectiles.length = 0;
      g.weapons.slots[0].cooldown = 0;
      g.enemies.push(enemyAt(g.player.x + 100, g.player.y));
      h.step();
      return g.weapons.projectiles[0]?.damage;
    };
    // 경계 안(플레이어는 시작 위치 = 경계 중심)
    assert.equal(fireDamage(), base * 1.5);
    g.boundary().damage(1e9);
    near(fireDamage(), base * 1.25);
    // 경계 밖으로 이동: 플레이어를 경계 밖에 놓는다
    g.player.x += BOUNDARY.baseRadius + 50;
    assert.equal(fireDamage(), base);
  } finally {
    h.dispose();
  }
});

test('새 런을 시작하면 내구도, 회복 설정, 반경 강화가 초기화된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    g.boundary().damage(70);
    g.boundary().setRecovery(false);
    g.boundary().radiusLevel = 2;
    h.tap('KeyG'); // 개발 키: 게임 오버
    assert.equal(g.state.current, 'gameover');
    h.tap('Enter');
    assert.equal(g.state.current, 'playing');
    assert.equal(g.boundary().durability, g.boundary().maxDurability);
    assert.equal(g.boundary().recoveryOn, BOUNDARY.recoveryDefaultOn);
    assert.equal(g.boundary().radiusLevel, 0);
  } finally {
    h.dispose();
  }
});

test('HUD에 경계 내구도 퍼센트와 회복 상태가 표시된다', () => {
  const h = startPlaying();
  try {
    h.game.boundary().damage(25);
    h.step();
    assert.ok(h.texts.some((t) => t.includes('경계 내구도 75%') && t.includes('회복 ON')), h.texts.join(' | '));
    h.tap('KeyR');
    h.step();
    assert.ok(h.texts.some((t) => t.includes('회복 OFF')));
  } finally {
    h.dispose();
  }
});
