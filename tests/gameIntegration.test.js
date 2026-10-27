// game.js 통합 테스트: 실제 game.js를 실행하고, 실제 키 입력 경로와 프레임 루프로 상태 연결을 검증한다.
// 브라우저 없이 Vite의 ssrLoadModule과 가짜 브라우저 객체로 동작한다(tests/helpers/gameHarness.js). 픽셀 렌더링은 검증하지 않는다.
// 개발 모드 전용 핸들(window.__ninefoldVeil)로 상태를 읽고, 시험 상황(낮은 HP, 근접한 적과 구슬 등)을 만든다.
// 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const livingEnemy = (id, x, y) => ({ id, x, y, kind: 'melee', facing: 'right', hp: 10, maxHp: 10, dead: false });
const deadEnemy = (id, x, y) => ({ id, x, y, kind: 'melee', facing: 'right', hp: 0, maxHp: 10, dead: true });

// 게임을 시작하고(Enter) playing 상태까지 간다.
function startPlaying(seed = 1) {
  const h = launchGame(loaded.startGame, { seed });
  h.step();
  h.tap('Enter');
  assert.equal(h.game.state.current, 'playing');
  return h;
}

// 전투 중 상황을 만든다: 적이 다가와 shard가 발사되고, 투사체가 떠 있고, 쿨다운이 흐르는 상태까지 진행한다.
// 레벨업이 저절로 열리면(구슬을 주워서) 1번을 골라 계속한다.
function playUntilCombat(h) {
  h.runUntil(
    () => {
      if (h.game.state.is('levelup')) h.tap('Digit1');
      return h.game.weapons.projectiles.length > 0 && h.game.enemies.length > 0;
    },
    60,
    '전투 상황(적과 투사체)',
  );
}

// 게임 상태 전체의 스냅샷(정지 검증용). 서로 같으면 아무것도 진행되지 않았다는 뜻이다.
function snapshot(h) {
  const g = h.game;
  return JSON.stringify({
    time: g.gameTime(),
    player: [g.player.x, g.player.y],
    enemies: g.enemies.map((e) => [e.id, e.x, e.y, e.hp]),
    slots: g.weapons.slots.map((w) => [w.id, w.level, w.cooldown]),
    projectiles: g.weapons.projectiles.map((p) => [p.x, p.y]),
    boomerangs: g.weapons.boomerangs.map((b) => [b.x, b.y, b.phase]),
    effects: g.weapons.effects.map((f) => f.age),
    enemyProjectiles: g.enemyProjectiles.projectiles.map((p) => [p.x, p.y]),
    orbs: g.experience.orbs.length,
    xp: [g.experience.level, g.experience.xp],
    hp: [g.health.hp, g.health.hitProtection, g.health.dashInvuln],
  });
}

// 보상을 고르고 선택 강조 시간(약 0.15초)이 지나 다음 화면이나 전투 재개까지 진행한다.
// 보상 자체는 키를 누른 즉시 적용되지만, 화면 전환은 강조 시간 뒤에 일어난다.
const FLASH_FRAMES_SECONDS = 0.25;
function choose(h, code) {
  h.tap(code);
  h.run(FLASH_FRAMES_SECONDS);
}

// 무기/자석 상태(보상 적용 확인용)
const loadout = (h) => JSON.stringify({ s: h.game.weapons.slots.map((w) => [w.id, w.level]), m: h.game.experience.magnetLevel });

test('시작: Enter로 playing이 되고 개발 핸들이 있으며 시작 무기는 shard뿐이다', () => {
  const h = launchGame(loaded.startGame);
  try {
    h.step();
    assert.equal(h.game.state.current, 'ready');
    h.tap('Enter');
    assert.equal(h.game.state.current, 'playing');
    assert.deepEqual(h.game.weapons.slots.map((w) => w.id), ['shard']);
    h.run(1);
    assert.ok(h.game.gameTime() > 0.9);
  } finally {
    h.dispose();
  }
});

test('1. 레벨업 진입: 플레이어, 적, 투사체, 쿨다운, 게임 타이머, 접촉/투사체 피해가 모두 멈춘다', () => {
  const h = startPlaying(3);
  try {
    playUntilCombat(h);
    h.press('ArrowRight'); // 이동 키를 누른 채로
    h.run(0.3);
    const g = h.game;
    const timeBefore = g.gameTime();
    h.tap('KeyX'); // 개발용 XP 키: +10 XP -> 레벨업
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.levelUp.active, true);
    assert.equal(g.levelUp.candidates.length, 3);

    const frozen = snapshot(h);
    h.press('KeyD');
    h.press('Space');
    h.tap('Escape'); // 정지 키
    h.tap('Enter'); // 시작/재개 키
    h.tap('KeyG'); // 개발용 게임 오버 키
    h.run(3);
    assert.equal(g.state.current, 'levelup'); // 어떤 입력으로도 상태가 바뀌지 않는다
    assert.equal(snapshot(h), frozen); // 3초 동안 아무것도 진행되지 않았다
    assert.ok(g.gameTime() === timeBefore || g.gameTime() > 0); // 타이머 값은 스냅샷에 포함되어 위에서 검증됨

    h.tap('Digit1'); // 선택하면 보상이 적용되고, 짧은 강조 동안은 여전히 정지 상태다
    assert.equal(g.state.current, 'levelup');
    const duringFlash = snapshot(h);
    h.run(0.05);
    assert.equal(snapshot(h), duringFlash); // 강조 중에도 아무것도 진행되지 않는다
    h.run(0.2); // 강조가 끝나면 재개
    assert.equal(g.state.current, 'playing');
    h.run(0.5);
    assert.notEqual(snapshot(h), frozen);
    assert.ok(g.gameTime() > timeBefore);
    // 선택 중에 눌러 둔 이동 키는 재개 후 이어서 적용된다
    h.release('ArrowRight');
    h.release('KeyD');
    h.release('Space');
  } finally {
    h.dispose();
  }
});

test('일시 정지(Esc): 전투가 멈추고, Esc로 재개하면 이어진다', () => {
  const h = startPlaying(3);
  try {
    playUntilCombat(h);
    h.tap('Escape');
    assert.equal(h.game.state.current, 'paused');
    const frozen = snapshot(h);
    h.run(2);
    assert.equal(snapshot(h), frozen);
    h.tap('Escape');
    assert.equal(h.game.state.current, 'playing');
    h.run(0.5);
    assert.notEqual(snapshot(h), frozen);
  } finally {
    h.dispose();
  }
});

for (const [key, index] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Numpad2', 1]]) {
  test(`2. ${key} 입력이 ${index + 1}번째 후보를 적용한다`, () => {
    const h = startPlaying(7);
    try {
      const g = h.game;
      h.tap('KeyX');
      assert.equal(g.state.current, 'levelup');
      h.step(); // 선택 화면 그리기
      const shown = g.levelUp.candidates.map((c) => ({ ...c }));
      assert.equal(shown.length, 3);
      // 화면에는 카드마다 번호, 유형, 이름, 효과 수치, 설명이 표시된다(보상 데이터의 값 그대로)
      assert.ok(h.texts.includes('LEVEL UP'));
      shown.forEach((c, i) => {
        // 긴 문장은 카드 너비에 맞춰 여러 줄로 나뉘어 그려지므로 이어 붙인 텍스트에서 찾는다.
        const drawn = h.texts.join(' ');
        for (const text of [c.category, c.title, c.effect, c.description]) {
          assert.ok(drawn.includes(text), `${i + 1}번 카드에 "${text}"가 없습니다: ${drawn}`);
        }
        assert.ok(h.texts.includes(String(i + 1)), `${i + 1}번 번호가 없습니다`);
      });
      const before = {
        level: (id) => g.weapons.levelOf(id),
        magnet: g.experience.magnetLevel,
        shard: g.weapons.levelOf('shard'),
      };
      h.tap(key);
      h.run(FLASH_FRAMES_SECONDS);
      assert.equal(g.state.current, 'playing');
      const chosen = shown[index];
      if (chosen.kind === 'newWeapon') {
        assert.equal(g.weapons.has(chosen.id), true);
        assert.equal(g.weapons.levelOf(chosen.id), 1);
        assert.equal(g.weapons.slots.length, 2); // 정확히 하나만 늘었다
      } else if (chosen.kind === 'weaponUpgrade') {
        assert.equal(g.weapons.levelOf(chosen.id), before.shard + 1);
        assert.equal(g.weapons.slots.length, 1);
      } else {
        assert.equal(g.experience.magnetLevel, before.magnet + 1);
        assert.equal(g.weapons.slots.length, 1);
      }
      // 선택하지 않은 보상은 적용되지 않았다
      for (const other of shown.filter((_, i) => i !== index)) {
        if (other.kind === 'newWeapon') assert.equal(g.weapons.has(other.id), false);
      }
    } finally {
      h.dispose();
    }
  });
}

test('3. 표시되지 않은 번호, 숫자가 아닌 키, 키 반복(repeat)은 무시되고, 같은 선택은 한 번만 적용된다', () => {
  const h = startPlaying(5);
  try {
    const g = h.game;
    h.tap('KeyX');
    assert.equal(g.state.current, 'levelup');
    const before = loadout(h);
    const shown = JSON.stringify(g.levelUp.candidates);
    for (const code of ['Digit4', 'Digit0', 'Numpad9', 'KeyQ', 'Backspace']) h.tap(code);
    h.press('Digit1', { repeat: true }); // 누르고 있어서 반복되는 입력은 무시
    assert.equal(g.state.current, 'levelup');
    assert.equal(loadout(h), before);
    assert.equal(JSON.stringify(g.levelUp.candidates), shown);

    h.tap('Digit1');
    assert.equal(g.state.current, 'levelup'); // 강조 중
    h.tap('Digit1'); // 강조 중에 다시 눌러도 무시(한 번만 적용)
    h.tap('Digit2');
    h.run(FLASH_FRAMES_SECONDS);
    assert.equal(g.state.current, 'playing');
    const after = loadout(h);
    assert.notEqual(after, before);
    h.tap('Digit1'); // 이미 처리된 선택을 다시 누름 -> 아무 일도 없다
    h.tap('Digit2');
    h.tap('Digit3');
    assert.equal(loadout(h), after);
    assert.equal(g.state.current, 'playing');
  } finally {
    h.dispose();
  }
});

test('3. 후보가 1~2개뿐인 화면에서는 없는 번호가 무시되고, 모든 보상을 소진한 뒤에는 화면이 열리지 않는다', () => {
  const h = startPlaying(11);
  try {
    const g = h.game;
    let sawFewer = 0;
    for (let round = 0; round < 15 && g.levelUp.active === false; round++) {
      h.tap('KeyX', { shiftKey: true }); // +100 XP: 여러 번 연속 레벨업
      while (g.state.is('levelup')) {
        const count = g.levelUp.candidates.length;
        if (count < 3) {
          sawFewer += 1;
          const snap = JSON.stringify(g.levelUp.candidates);
          for (const code of ['Digit3', 'Digit2'].filter((_, i) => 3 - i > count)) h.tap(code); // 표시되지 않은 번호
          assert.equal(g.state.current, 'levelup');
          assert.equal(JSON.stringify(g.levelUp.candidates), snap);
        }
        choose(h, 'Digit1');
      }
      if (g.weapons.slots.length === 3 && g.weapons.slots.every((w) => w.level === 5) && g.experience.magnetLevel === 3) break;
    }
    assert.ok(sawFewer > 0, '후보가 3개 미만인 화면이 한 번도 나오지 않았습니다');
    // 규칙: 슬롯 3개, 레벨 5 이하, 자석 3 이하
    assert.equal(g.weapons.slots.length, 3);
    assert.ok(g.weapons.slots.every((w) => w.level === 5));
    assert.equal(g.experience.magnetLevel, 3);
    // 소진 뒤 추가 레벨업: 레벨은 오르지만 화면은 열리지 않고 게임은 계속된다
    const level = g.experience.level;
    h.tap('KeyX', { shiftKey: true });
    assert.ok(g.experience.level > level);
    assert.equal(g.state.current, 'playing');
    assert.equal(g.levelUp.active, false);
    assert.equal(g.levelUp.pending, 0);
    const t = g.gameTime();
    h.run(0.5);
    assert.ok(g.gameTime() > t); // 멈추지 않고 진행된다
  } finally {
    h.dispose();
  }
});

test('4. 연속 레벨업: 선택마다 정지가 유지되고, 마지막 선택 뒤에만 전투가 재개된다', () => {
  const h = startPlaying(13);
  try {
    const g = h.game;
    playUntilCombat(h);
    h.press('ArrowRight');
    h.tap('KeyX', { shiftKey: true }); // +100 XP: 5번 레벨업
    assert.equal(g.experience.level, 6);
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.levelUp.pending, 4);
    const seenLoadouts = new Set();
    for (let i = 0; i < 5; i++) {
      assert.equal(g.state.current, 'levelup', `${i + 1}번째 화면`);
      assert.equal(g.levelUp.pending, 4 - i);
      h.step();
      assert.ok(!h.texts.some((t) => t.includes('남은 레벨업')), '카드 화면에는 제목 외 추가 문구가 없다');
      const frozen = snapshot(h);
      h.run(1);
      assert.equal(snapshot(h), frozen); // 화면이 열려 있는 동안 정지
      seenLoadouts.add(loadout(h));
      choose(h, 'Digit1');
    }
    assert.equal(g.state.current, 'playing'); // 모든 선택이 끝난 뒤에만 재개
    assert.equal(g.levelUp.pending, 0);
    assert.equal(seenLoadouts.size, 5); // 선택할 때마다 상태가 바뀌었다(보상 5번 적용)
    const timeBefore = g.gameTime();
    h.run(1);
    assert.ok(g.gameTime() > timeBefore);
    h.release('ArrowRight');
  } finally {
    h.dispose();
  }
});

// 낮은 HP + 겹친 적 + 주울 구슬 + 레벨업 직전 XP를 만든다.
function arrangeOverlap(h, { hp }) {
  const g = h.game;
  g.experience.addXp(7); // 8이 필요: 구슬 1 XP를 주우면 레벨업
  g.experience.spawnOrbFor(deadEnemy(900, g.player.x + 30, g.player.y)); // 줍기 반경(60px) 안
  if (hp < g.health.maxHp) g.health.takeDamage(g.health.maxHp - hp);
  g.health.update(5); // 피격 후 보호 시간을 지워 다음 접촉이 바로 피해가 되게 한다
  g.enemies.push(livingEnemy(901, g.player.x, g.player.y)); // 플레이어와 완전히 겹침
}

test('5. 게임 오버와 레벨업이 같은 프레임에 겹치면 게임 오버가 이기고 XP/레벨업/보상은 처리되지 않는다', () => {
  const h = startPlaying(17);
  try {
    const g = h.game;
    arrangeOverlap(h, { hp: 10 });
    assert.equal(g.experience.xp, 7);
    h.step(); // 이 프레임에서 접촉 피해로 HP 0, 같은 프레임에 구슬이 줍기 반경 안에 있다
    assert.equal(g.health.hp, 0);
    assert.equal(g.state.current, 'gameover');
    assert.equal(g.experience.xp, 7, 'XP가 올라가면 안 된다');
    assert.equal(g.experience.level, 1);
    assert.equal(g.experience.orbs.length, 1, '구슬을 주우면 안 된다');
    assert.equal(g.levelUp.active, false);
    assert.equal(g.levelUp.pending, 0);
    // 이후 프레임에도 구슬은 줍히지 않고 보상 입력은 무시된다
    h.run(1);
    h.tap('Digit1');
    h.tap('KeyX');
    assert.equal(g.state.current, 'gameover');
    assert.equal(g.experience.orbs.length, 1);
    assert.equal(g.weapons.slots.length, 1);
  } finally {
    h.dispose();
  }
});

test('5. (대조) 같은 배치에서 HP가 충분하면 같은 프레임의 구슬 줍기로 레벨업 화면이 열린다', () => {
  const h = startPlaying(17);
  try {
    const g = h.game;
    arrangeOverlap(h, { hp: 100 });
    h.step();
    assert.equal(g.health.hp, 90); // 접촉 피해는 받았지만 죽지 않았다
    assert.equal(g.experience.orbs.length, 0);
    assert.equal(g.experience.level, 2);
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.levelUp.active, true);
  } finally {
    h.dispose();
  }
});

test('6. 재시작: 경험치, 레벨, 자석, 무기, 구슬, 투사체, 대기 보상이 모두 초기화된다', () => {
  const h = startPlaying(19);
  try {
    const g = h.game;
    // 진행 상태를 쌓는다: 레벨업 보상으로 무기/자석 변경
    h.tap('KeyX', { shiftKey: true });
    while (g.state.is('levelup')) choose(h, 'Digit1');
    g.weapons.equip('boomerangBlade'); // 부메랑까지 날려 둔다
    g.weapons.equip('chainLightning');
    g.enemies.push(livingEnemy(800, g.player.x + 120, g.player.y));
    h.run(0.2);
    g.experience.spawnOrbFor(deadEnemy(801, 3500, 3500)); // 멀어서 안 줍는 구슬
    g.experience.addXp(3);
    g.enemyProjectiles.projectiles.push({ x: 1, y: 1, dx: 1, dy: 0, traveled: 0 });
    // 정상적인 접촉 사망으로 게임 오버
    g.enemies.push(livingEnemy(802, g.player.x, g.player.y));
    g.health.takeDamage(g.health.maxHp - 10);
    g.health.update(5);
    h.runUntil(() => g.state.is('gameover'), 5, '게임 오버');
    // 재시작 전: 초기 상태가 아니라는 것을 확인(검증이 헛돌지 않게)
    assert.ok(g.experience.level > 1);
    assert.ok(g.weapons.slots.length > 1);
    assert.ok(g.experience.orbs.length > 0);
    assert.ok(g.experience.xp > 0 || g.experience.level > 1);
    assert.ok(g.enemies.length > 0);

    h.tap('Enter');
    assert.equal(g.state.current, 'playing');
    assert.deepEqual([g.experience.level, g.experience.xp, g.experience.magnetLevel, g.experience.pickupRadius], [1, 0, 0, 60]);
    assert.equal(g.experience.orbs.length, 0);
    assert.deepEqual(g.weapons.slots.map((w) => [w.id, w.level, w.cooldown]), [['shard', 1, 0]]);
    assert.equal(g.weapons.projectiles.length, 0);
    assert.equal(g.weapons.boomerangs.length, 0);
    assert.equal(g.weapons.effects.length, 0);
    assert.equal(g.enemyProjectiles.projectiles.length, 0);
    assert.equal(g.enemies.length, 0);
    assert.equal(g.levelUp.active, false);
    assert.equal(g.levelUp.pending, 0);
    assert.equal(g.health.hp, g.health.maxHp);
    assert.equal(g.gameTime(), 0);
    // 재시작 후에도 정상 동작: 다시 레벨업이 열린다
    h.tap('KeyX');
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.levelUp.candidates.length, 3);
  } finally {
    h.dispose();
  }
});

test('6. 레벨업 선택 화면이 열려 있는 동안에는 Enter로 재시작할 수 없다', () => {
  const h = startPlaying(23);
  try {
    h.tap('KeyX');
    const frozen = snapshot(h);
    h.tap('Enter');
    h.run(0.5);
    assert.equal(h.game.state.current, 'levelup');
    assert.equal(snapshot(h), frozen);
    assert.equal(h.game.levelUp.active, true);
  } finally {
    h.dispose();
  }
});

test('7. 개발용 XP 키: X는 +10, Shift+X는 +100 XP를 주고, 실행 중일 때만 동작한다', () => {
  const h = startPlaying(29);
  try {
    const g = h.game;
    h.tap('KeyX');
    assert.deepEqual([g.experience.level, g.experience.xp], [2, 2]); // 8 필요 -> 레벨 2, 2 이월
    assert.equal(g.state.current, 'levelup');
    h.tap('KeyX'); // 선택 중에는 동작하지 않는다
    h.tap('KeyX', { shiftKey: true });
    assert.deepEqual([g.experience.level, g.experience.xp], [2, 2]);
    choose(h, 'Digit1');
    h.press('KeyX', { repeat: true }); // 키 반복은 무시
    assert.deepEqual([g.experience.level, g.experience.xp], [2, 2]);
    h.tap('Escape'); // 정지 중에는 동작하지 않는다
    assert.equal(g.state.current, 'paused');
    h.tap('KeyX');
    assert.deepEqual([g.experience.level, g.experience.xp], [2, 2]);
    h.tap('Escape');
    h.tap('KeyX', { shiftKey: true }); // 12 + 16 + 20 + 24 = 72 -> 2 + 100 = 102 -> 4번 레벨업, 30 이월(다음 28) -> 5번째도 오름
    assert.equal(g.experience.level, 7);
    assert.equal(g.levelUp.pending + 1, 5);
  } finally {
    h.dispose();
  }
});

test('7. 프로덕션 조건(import.meta.env.DEV = false): XP 테스트 키와 개발 핸들이 동작하지 않는다', async () => {
  const prod = await loadGame({ simulateProduction: true });
  try {
    const h = launchGame(prod.startGame, { seed: 1 });
    try {
      h.step();
      h.tap('Enter');
      h.step();
      assert.equal(h.game, undefined, '개발 핸들이 노출되면 안 된다');
      h.run(0.5);
      h.tap('KeyX');
      h.tap('KeyX', { shiftKey: true });
      h.step();
      assert.ok(!h.texts.includes('LEVEL UP'), '프로덕션에서 XP 키로 레벨업이 열렸다');
      assert.ok(h.texts.some((t) => t.startsWith('LV 1   XP 0 / 8')), `경험치가 올라갔을 수 있다: ${h.texts.join(' / ')}`);
      assert.ok(!h.texts.some((t) => t.startsWith('player (')), '개발용 좌표 표시가 프로덕션에서 그려졌다');
      // 개발용 게임 오버 키(G)도 꺼져 있다
      h.tap('KeyG');
      h.step();
      assert.ok(!h.texts.includes('게임 오버'));
      // 일반 기능(레벨업 화면 문구 등)은 프로덕션에서도 있으므로 시작 화면이 정상 진행됐는지만 본다
      assert.ok(h.texts.some((t) => /^\d+:\d\d$/.test(t)), '시간 표시가 없습니다');
    } finally {
      h.dispose();
    }
  } finally {
    await prod.close();
  }
});
