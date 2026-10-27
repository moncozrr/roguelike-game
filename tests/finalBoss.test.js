// 단계 12: 최종 보스(5:00 출현, 처치하면 승리), 두 번째 보스(3:00 출현, 처치해도 런은 계속), 승리/게임 오버 상태, 5:00 이후 계속 진행.
// 순수 로직(boss.js, 상태 기계)과 실제 game.js 통합 테스트를 함께 둔다. 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';
import { BOSS, ENEMY, PLAYER_HEALTH, SPAWN, TIMELINE } from '../src/config.js';
import { createFinalBoss, createMiniBoss, createSecondBoss, isFinalBoss, isMiniBoss, isSecondBoss } from '../src/boss.js';
import { createGameState, STATES } from '../src/gameState.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const PLAYER = { x: 2000, y: 2000 };

// ---------- 순수 로직 ----------

test('보스 설정: 최종 보스(5:00, HP 800, 속도 80)와 두 번째 보스(3:00, HP 400, 속도 80)가 중간 보스와 따로 분리되어 있다', () => {
  assert.equal(TIMELINE.midBossAt, 120);
  assert.equal(TIMELINE.secondBossAt, 180);
  assert.equal(TIMELINE.finalBossAt, 300);
  assert.equal(BOSS.finalBoss.maxHp, 800);
  assert.equal(BOSS.finalBoss.speed, 80);
  assert.equal(BOSS.secondBoss.maxHp, 400);
  assert.equal(BOSS.secondBoss.speed, 80);
  assert.notEqual(BOSS.finalBoss, BOSS.miniBoss);
  assert.notEqual(BOSS.finalBoss, BOSS.secondBoss);
  assert.equal(BOSS.miniBoss.maxHp, 200); // 중간 보스 HP는 그대로
  assert.equal(BOSS.miniBoss.speed, 80);
});

test('두 번째 보스 만들기: 설정의 HP/속도, isBoss 표시, 다른 보스와 다른 종류', () => {
  const boss = createSecondBoss(5, 10, 10, PLAYER);
  assert.equal(boss.kind, 'secondBoss');
  assert.equal(isSecondBoss(boss), true);
  assert.equal(isFinalBoss(boss), false);
  assert.equal(isMiniBoss(boss), false);
  assert.equal(boss.isBoss, true);
  assert.equal(boss.hp, BOSS.secondBoss.maxHp);
  assert.equal(boss.speed, BOSS.secondBoss.speed);
  assert.equal(isSecondBoss(createFinalBoss(1, 0, 0, PLAYER)), false);
});

test('최종 보스 만들기: 설정의 HP/속도, isBoss 표시, 중간 보스/일반 적과 다른 종류', () => {
  const boss = createFinalBoss(5, 10, 10, PLAYER);
  assert.equal(boss.kind, 'finalBoss');
  assert.equal(isFinalBoss(boss), true);
  assert.equal(isMiniBoss(boss), false);
  assert.equal(boss.isBoss, true);
  assert.equal(boss.hp, BOSS.finalBoss.maxHp);
  assert.equal(boss.maxHp, BOSS.finalBoss.maxHp);
  assert.equal(boss.speed, BOSS.finalBoss.speed);
  assert.equal(isFinalBoss(createMiniBoss(1, 0, 0, PLAYER)), false);
  assert.equal(isFinalBoss(createSecondBoss(1, 0, 0, PLAYER)), false);
  const custom = createFinalBoss(6, 0, 0, PLAYER, { maxHp: 77, speed: 5 }); // 설정만 바꾸면 값이 따라온다
  assert.equal(custom.hp, 77);
  assert.equal(custom.speed, 5);
  assert.equal(ENEMY.maxHp, 10); // 일반 적 설정은 그대로
});

test('상태 기계: victory는 playing에서만 들어가고, victory에서는 start만 가능하며, 이중 전환은 무시된다', () => {
  for (const from of [STATES.READY, STATES.PAUSED, STATES.LEVELUP, STATES.GAMEOVER]) {
    const s = createGameState(from);
    assert.equal(s.send('victory'), false, from);
    assert.equal(s.current, from);
  }
  const s = createGameState(STATES.PLAYING);
  assert.equal(s.send('victory'), true);
  assert.equal(s.current, 'victory');
  for (const action of ['victory', 'gameOver', 'pause', 'resume', 'levelUp', 'rewardDone']) {
    assert.equal(s.send(action), false, action);
    assert.equal(s.current, 'victory');
  }
  assert.equal(s.send('start'), true);
  assert.equal(s.current, 'playing');
  // 게임 오버가 먼저면 승리로 바뀌지 않는다
  const d = createGameState(STATES.PLAYING);
  d.send('gameOver');
  assert.equal(d.send('victory'), false);
  assert.equal(d.current, 'gameover');
});

// ---------- game.js 통합 ----------

function startPlaying(seed = 1) {
  const h = launchGame(loaded.startGame, { seed });
  h.step();
  h.tap('Enter');
  assert.equal(h.game.state.current, 'playing');
  return h;
}

const bosses = (h) => h.game.enemies.filter((e) => e.isBoss);
const finals = (h) => h.game.enemies.filter(isFinalBoss);
const minis = (h) => h.game.enemies.filter(isMiniBoss);
const secondBosses = (h) => h.game.enemies.filter(isSecondBoss);

// 게임 시간을 목표까지 진행한다. 일반 적은 계속 치우고 HP는 채워서 플레이어가 죽지 않게 한다.
//   miniBoss: 'far'면 중간 보스와 두 번째 보스를 멀리 두어 살려 두고, 'remove'면 없앤다. 최종 보스는 건드리지 않는다.
//   레벨업/보상 화면이 열리면 1번을 골라 계속한다.
function advanceTo(h, seconds, { miniBoss = 'far', keepFinalAlive = false, clearNormal = true } = {}) {
  const g = h.game;
  let guard = 0;
  while (g.gameTime() < seconds && guard++ < 20000) {
    if (g.state.is('levelup')) {
      h.tap('Digit1');
      h.run(0.25);
      continue;
    }
    if (g.state.current !== 'playing') break;
    h.step(0.05);
    g.health.reset();
    if (clearNormal) for (let i = g.enemies.length - 1; i >= 0; i--) if (!g.enemies[i].isBoss) g.enemies.splice(i, 1);
    g.experience.orbs.length = 0;
    for (const m of [...minis(h), ...secondBosses(h)]) {
      if (miniBoss === 'remove') g.enemies.splice(g.enemies.indexOf(m), 1);
      else {
        m.x = g.player.x + 1500; // 중간/두 번째 보스를 멀리 두어 살려 둔다
        m.y = g.player.y;
        m.hp = m.maxHp;
      }
    }
    if (keepFinalAlive) for (const f of finals(h)) f.hp = f.maxHp;
  }
}

// 최종 보스를 플레이어 바로 옆에 HP 1로 두고 즉시 발동하는 범위 무기(pulse)를 준비한다.
function armFinalBossKill(h, { atPlayer = false } = {}) {
  const g = h.game;
  g.weapons.equip('pulse');
  g.weapons.slots.forEach((w) => (w.cooldown = 0));
  const boss = finals(h)[0];
  boss.x = g.player.x + (atPlayer ? 0 : 30);
  boss.y = g.player.y;
  boss.hp = 1;
  return boss;
}

const snapshot = (h) => {
  const g = h.game;
  return JSON.stringify({
    time: g.gameTime(),
    player: [g.player.x, g.player.y],
    enemies: g.enemies.map((e) => [e.id, e.x, e.y, e.hp]),
    projectiles: g.weapons.projectiles.map((p) => [p.x, p.y]),
    boomerangs: g.weapons.boomerangs.length,
    effects: g.weapons.effects.map((f) => f.age),
    slots: g.weapons.slots.map((w) => [w.id, w.level, w.cooldown]),
    enemyProjectiles: g.enemyProjectiles.projectiles.map((p) => [p.x, p.y]),
    orbs: g.experience.orbs.length,
    xp: [g.experience.level, g.experience.xp],
    hp: [g.health.hp, g.health.hitProtection, g.health.dashInvuln],
    boundary: [g.boundary().durability, g.boundary().radius, g.boundary().timeSinceDamage],
  });
};

test('1. 5:00에 최종 보스가 정확히 한 번 나오고, 정지 중에는 당겨지거나 중복되지 않는다', () => {
  const h = startPlaying();
  try {
    advanceTo(h, 297.5);
    assert.equal(finals(h).length, 0);
    h.tap('Escape');
    assert.equal(h.game.state.current, 'paused');
    h.run(30);
    assert.equal(finals(h).length, 0); // 정지 시간 동안은 출현하지 않는다
    h.tap('Escape');
    advanceTo(h, 299.5);
    assert.equal(finals(h).length, 0);
    advanceTo(h, 301);
    assert.equal(finals(h).length, 1);
    const id = finals(h)[0].id;
    advanceTo(h, 320, { keepFinalAlive: true });
    assert.equal(finals(h).length, 1);
    assert.equal(finals(h)[0].id, id);
  } finally {
    h.dispose();
  }
});

test('2. 중간 보스/두 번째 보스가 살아 있어도, 이미 죽었어도 최종 보스는 5:00에 똑같이 나온다', () => {
  for (const miniBoss of ['far', 'remove']) {
    const h = startPlaying();
    try {
      advanceTo(h, 121, { miniBoss });
      assert.equal(minis(h).length, miniBoss === 'far' ? 1 : 0);
      advanceTo(h, 299.5, { miniBoss });
      assert.equal(finals(h).length, 0);
      advanceTo(h, 301, { miniBoss });
      assert.equal(finals(h).length, 1, `중간 보스 ${miniBoss}`);
      assert.equal(minis(h).length, miniBoss === 'far' ? 1 : 0); // 다른 보스 상태에 영향 없음
      assert.equal(secondBosses(h).length, miniBoss === 'far' ? 1 : 0);
    } finally {
      h.dispose();
    }
  }
});

test('3. 최종 보스의 HP/속도는 설정에서 오고(HP 800, 속도 80), 중간 보스와 같은 규칙으로 움직인다', () => {
  const h = startPlaying();
  try {
    advanceTo(h, 301, { miniBoss: 'remove' });
    const boss = finals(h)[0];
    assert.equal(boss.maxHp, BOSS.finalBoss.maxHp);
    assert.equal(boss.speed, BOSS.finalBoss.speed);
    const before = Math.hypot(boss.x - h.game.player.x, boss.y - h.game.player.y);
    advanceTo(h, 303, { miniBoss: 'remove', keepFinalAlive: true });
    const after = Math.hypot(boss.x - h.game.player.x, boss.y - h.game.player.y);
    assert.ok(after < before, '보스가 플레이어 쪽으로 다가오지 않는다');
    assert.equal(boss.isBoss, true);
  } finally {
    h.dispose();
  }
});

test('두 번째 보스: 3:00에 정확히 한 번 나오고, 처치해도 승리하지 않으며 런과 최종 보스 출현은 그대로 이어진다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 179.5, { miniBoss: 'far' });
    assert.equal(secondBosses(h).length, 0);
    advanceTo(h, 181, { miniBoss: 'far' });
    assert.equal(secondBosses(h).length, 1);
    assert.equal(finals(h).length, 0); // 3:00에는 최종 보스가 아니다
    const second = secondBosses(h)[0];
    advanceTo(h, 200, { miniBoss: 'far' });
    assert.equal(secondBosses(h).length, 1); // 중복 출현 없음
    // 두 번째 보스를 처치한다: 승리가 아니라 계속 진행
    g.weapons.equip('pulse');
    g.weapons.slots.forEach((w) => (w.cooldown = 0));
    second.x = g.player.x + 30;
    second.y = g.player.y;
    second.hp = 1;
    h.step();
    assert.equal(second.dead, true);
    assert.equal(g.enemies.includes(second), false);
    assert.equal(g.state.current, 'playing'); // 승리하지 않는다
    assert.equal(g.levelUp.active || g.boundaryUpgrades().active, false); // 보상 화면도 없다
    h.run(3);
    assert.equal(g.state.current, 'playing');
    advanceTo(h, 299.5, { miniBoss: 'remove' });
    assert.equal(finals(h).length, 0);
    advanceTo(h, 301, { miniBoss: 'remove' });
    assert.equal(finals(h).length, 1); // 최종 보스는 예정대로 5:00에 나온다
  } finally {
    h.dispose();
  }
});

test('4. 최종 보스를 처치하면 즉시 승리가 되고, 화면에 승리 문구/생존 시간/Enter 안내가 보인다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 301, { miniBoss: 'remove' });
    const boss = armFinalBossKill(h);
    h.step(); // 같은 프레임 안에서 처치와 승리 전환
    assert.equal(boss.dead, true);
    assert.equal(g.state.current, 'victory');
    assert.equal(g.enemies.includes(boss), false);
    h.step();
    assert.ok(h.texts.includes('승리'), h.texts.join('|'));
    assert.ok(h.texts.some((t) => t.startsWith('생존 시간 5:0')), h.texts.join('|'));
    assert.ok(h.texts.some((t) => t.includes('Enter')));
    assert.ok(!h.texts.includes('게임 오버'));
  } finally {
    h.dispose();
  }
});

test('승리 뒤에는 모든 진행이 멈춘다: 시간, 적 생성/이동, 투사체, 쿨다운, 타이머, 입력(이동/대시/일시정지/숫자/클릭)', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 301, { miniBoss: 'remove' });
    // 승리 직전에 움직이는 것들이 있는 상태를 만든다
    g.enemies.push({ id: 7001, x: g.player.x + 200, y: g.player.y, kind: 'melee', facing: 'right', hp: 10, maxHp: 10, dead: false });
    g.enemies.push({ id: 7002, x: g.player.x + 250, y: g.player.y, kind: 'ranged', facing: 'right', hp: 10, maxHp: 10, dead: false, shotCooldown: 0.5 });
    armFinalBossKill(h);
    h.step();
    assert.equal(g.state.current, 'victory');
    const before = snapshot(h);
    h.press('KeyD');
    h.tap('Space');
    h.tap('Escape');
    h.tap('Digit1');
    h.tap('Digit2');
    h.tap('KeyR');
    h.tap('KeyX');
    h.tap('KeyB', { shiftKey: true });
    h.tap('KeyG');
    h.click(400, 300);
    h.run(10); // 적 생성 간격(3초)을 여러 번 넘기는 시간
    h.release('KeyD');
    assert.equal(g.state.current, 'victory');
    assert.equal(snapshot(h), before);
    assert.equal(g.levelUp.active, false);
    assert.equal(g.boundaryUpgrades().active, false);
  } finally {
    h.dispose();
  }
});

test('Enter로 새 런이 시작되고 모든 것이 초기화되며, 새 런에서도 시간표대로 진행된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 301, { miniBoss: 'remove' });
    g.boundary().damage(30);
    armFinalBossKill(h);
    h.step();
    assert.equal(g.state.current, 'victory');
    h.tap('Enter', { repeat: true }); // 누르고 있는 반복 입력은 무시
    assert.equal(g.state.current, 'victory');
    h.tap('Enter');
    assert.equal(g.state.current, 'playing');
    assert.ok(g.gameTime() < 1);
    assert.equal(g.enemies.length, 0);
    assert.equal(bosses(h).length, 0);
    assert.equal(g.health.hp, PLAYER_HEALTH.maxHp);
    assert.equal(g.boundary().durability, g.boundary().maxDurability);
    assert.deepEqual(g.weapons.slots.map((w) => w.id), ['shard']);
    assert.equal(g.experience.level, 1);
    const t = g.gameTime();
    h.run(1);
    assert.ok(g.gameTime() > t); // 다시 진행된다
    advanceTo(h, 301, { miniBoss: 'remove' }); // 새 런에서도 5:00에 최종 보스가 한 번 나온다
    assert.equal(finals(h).length, 1);
    assert.equal(g.state.current, 'playing'); // 이전 승리 기록이 새 런을 끝내지 않는다
    h.run(1);
    assert.equal(g.state.current, 'playing');
  } finally {
    h.dispose();
  }
});

test('5. 플레이어가 죽으면 게임 오버가 되고, 이후 진행이 멈추며 Enter로 재시작된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    g.enemies.length = 0;
    g.health.takeDamage(PLAYER_HEALTH.maxHp - 1);
    g.health.update(10); // 피격 후 보호 해제
    g.enemies.push({ id: 7003, x: g.player.x, y: g.player.y, kind: 'melee', facing: 'right', hp: 10, maxHp: 10, dead: false });
    h.step();
    assert.equal(g.state.current, 'gameover');
    const before = snapshot(h);
    h.run(3);
    assert.equal(snapshot(h), before);
    h.step();
    assert.ok(h.texts.includes('게임 오버'));
    h.tap('Enter');
    assert.equal(g.state.current, 'playing');
  } finally {
    h.dispose();
  }
});

test('같은 프레임에 플레이어 사망과 최종 보스 처치가 겹치면 게임 오버가 우선이고 승리는 없다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 301, { miniBoss: 'remove' });
    const boss = armFinalBossKill(h);
    g.health.takeDamage(PLAYER_HEALTH.maxHp - 1);
    g.health.update(10); // 보호 해제
    g.enemies.push({ id: 7004, x: g.player.x, y: g.player.y, kind: 'melee', facing: 'right', hp: 100, maxHp: 100, dead: false }); // pulse로 안 죽는 접촉 적
    h.step();
    assert.equal(boss.dead, true); // 최종 보스는 이 프레임에 처치되었지만
    assert.equal(g.state.current, 'gameover'); // 결과는 게임 오버
    h.run(3);
    assert.equal(g.state.current, 'gameover');
    h.step();
    assert.ok(h.texts.includes('게임 오버'));
    assert.ok(!h.texts.includes('승리'));
    h.tap('Enter'); // 재시작하면 정상 진행(이전 처치 기록이 새 런을 승리로 끝내지 않음)
    assert.equal(g.state.current, 'playing');
    h.run(2);
    assert.equal(g.state.current, 'playing');
  } finally {
    h.dispose();
  }
});

test('승리 프레임에 보류 중이던 보상(레벨업, 경계 강화)은 다시 열리지 않고, 이미 적용된 보상은 그대로다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 301, { miniBoss: 'far' });
    const mini = minis(h)[0];
    mini.x = g.player.x + 40; // 중간 보스도 같은 프레임에 처치(경계 강화 예약)
    mini.y = g.player.y;
    mini.hp = 1;
    armFinalBossKill(h);
    g.experience.orbs.push({ id: 9100, x: g.player.x, y: g.player.y, value: 20 }); // 레벨업 예약이 될 구슬
    const radiusBefore = g.boundary().radiusLevel;
    h.step();
    assert.equal(g.state.current, 'victory');
    assert.equal(g.levelUp.active, false);
    assert.equal(g.levelUp.pending, 0);
    assert.equal(g.boundaryUpgrades().active, false);
    assert.equal(g.boundaryUpgrades().pending, 0);
    assert.equal(g.boundary().radiusLevel, radiusBefore); // 적용되지 않은 보상이 몰래 적용되지 않는다
    h.run(5);
    h.step();
    assert.equal(g.state.current, 'victory');
    assert.ok(!h.texts.includes('LEVEL UP') && !h.texts.includes('BOUNDARY UPGRADE'));
  } finally {
    h.dispose();
  }
});

test('연속 레벨업 중에는 최종 보스가 죽지 않고, 보상을 모두 고른 뒤에 처치되면 승리가 한 번만 된다(소프트락 없음)', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 301, { miniBoss: 'remove' });
    const boss = finals(h)[0];
    boss.x = g.player.x + 800; // 무기 사거리 밖(선택이 끝난 뒤에 가까이 데려와 처치한다)
    boss.y = g.player.y;
    boss.hp = 1;
    h.tap('KeyX', { shiftKey: true }); // 경험치 +100: 연속 레벨업
    assert.equal(g.state.current, 'levelup');
    const levelsBefore = 1;
    const gained = g.experience.level - levelsBefore;
    assert.ok(gained >= 2, `레벨업 ${gained}번`);
    let screens = 0;
    while (g.state.is('levelup') && screens < 20) {
      h.run(1); // 보상 선택 중에는 보스가 멈춰 있다
      assert.equal(boss.hp, 1);
      assert.equal(boss.dead, false);
      h.tap('Digit1');
      h.run(0.25);
      screens++;
    }
    assert.equal(screens, gained); // 레벨업 보상 화면이 정확히 레벨업 수만큼 열렸다
    assert.equal(g.state.current, 'playing');
    assert.equal(boss.dead, false);
    armFinalBossKill(h);
    h.step();
    assert.equal(g.state.current, 'victory');
    h.run(3);
    assert.equal(g.state.current, 'victory');
    assert.equal(g.levelUp.active, false);
  } finally {
    h.dispose();
  }
});

test('6. 5:00에 나온 최종 보스를 잡지 못해도 런이 끝나지 않고, 보스와 기존 적은 계속 움직이며, 일반 적 생성은 5:00부터 멈춘다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    assert.equal(TIMELINE.finalBossAt, 300);
    assert.equal(SPAWN.stopAtTime, 300);
    advanceTo(h, 301, { miniBoss: 'remove' });
    const boss = finals(h)[0];
    boss.x = g.player.x + 3000; // 멀리서 시작해서 이동 거리를 볼 수 있게
    boss.y = g.player.y;
    advanceTo(h, 305, { miniBoss: 'remove', keepFinalAlive: true, clearNormal: false });
    assert.equal(g.state.current, 'playing'); // 보스가 살아 있으면 자동 종료 없음
    assert.equal(g.gameTime() >= 300, true);
    assert.equal(finals(h).length, 1);
    // 5:00 이후: 새 일반 적이 생기지 않는다(번호는 계속 커지므로 최대 번호가 그대로여야 한다)
    const maxId = () => Math.max(0, ...g.enemies.map((e) => e.id));
    const idAfter300 = maxId();
    boss.x = g.player.x + 600;
    boss.y = g.player.y;
    const startDistance = Math.hypot(boss.x - g.player.x, boss.y - g.player.y);
    advanceTo(h, 330, { miniBoss: 'remove', keepFinalAlive: true, clearNormal: false });
    assert.equal(g.state.current, 'playing');
    assert.ok(maxId() <= idAfter300, '5:00 이후에 일반 적이 새로 생겼다'); // 새 적은 항상 더 큰 번호를 받는다
    assert.ok(Math.hypot(boss.x - g.player.x, boss.y - g.player.y) < startDistance); // 최종 보스는 계속 다가온다
    // 무기와 처치/승리는 정상 동작한다
    armFinalBossKill(h);
    h.step();
    assert.equal(g.state.current, 'victory');
  } finally {
    h.dispose();
  }
});
