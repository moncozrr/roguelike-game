// 단계 9 통합 테스트: 실제 game.js에서 카드 화면 그리기, 숫자 키/마우스 클릭 선택, 선택 강조, 정지/재개를 검증한다.
// 브라우저 없이 가짜 캔버스로 실행하며(tests/helpers/gameHarness.js), 카드의 실제 픽셀 모양과 색은 검증하지 않는다.
// 대신 캔버스에 그려진 사각형 좌표와 글자를 기록해서 "그려진 위치 = 클릭되는 위치"와 표시 내용을 확인한다.
// 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';
import { computeCardLayout } from '../src/rewardCards.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const FLASH = 0.25; // 선택 강조(약 0.15초)가 끝나기에 충분한 시간

function startPlaying(options = {}) {
  const h = launchGame(loaded.startGame, { seed: 5, ...options });
  h.step();
  h.tap('Enter');
  assert.equal(h.game.state.current, 'playing');
  return h;
}

// 레벨업 화면을 열고 한 프레임 그려서 화면 기록을 만든다.
function openScreen(h) {
  h.tap('KeyX');
  assert.equal(h.game.state.current, 'levelup');
  h.step();
}

const loadout = (h) => JSON.stringify({ s: h.game.weapons.slots.map((w) => [w.id, w.level]), m: h.game.experience.magnetLevel });

// 후보가 2장 또는 1장만 남도록 상태를 만든다(슬롯 3개 채우고 일부 최대 레벨).
function leaveCandidates(h, count) {
  const g = h.game;
  g.weapons.equip('pulse');
  g.weapons.equip('chainLightning');
  g.weapons.setLevel('shard', 5);
  g.weapons.setLevel('pulse', 5);
  if (count === 1) g.weapons.setLevel('chainLightning', 5);
  // count 2: 연쇄 번개 강화 + 자석, count 1: 자석만
}

// 화면에 그려진 카드 테두리 사각형(카드 크기와 같은 stroke 사각형)
function drawnCardRects(h, layout) {
  return layout.map((r) => h.rects.find((q) => q.op === 'stroke' && q.x === r.x && q.y === r.y && q.width === r.width && q.height === r.height));
}

test('카드 화면: 제목과 어두운 오버레이, 최대 3장의 카드가 화면 중앙에 그려지고 카드 사각형이 배치 계산과 같다', () => {
  const h = startPlaying();
  try {
    openScreen(h);
    const view = { width: 800, height: 600 };
    const layout = computeCardLayout(3, view);
    assert.ok(h.texts.includes('LEVEL UP'));
    // 화면 전체 오버레이
    assert.ok(h.rects.some((q) => q.op === 'fill' && q.x === 0 && q.y === 0 && q.width === 800 && q.height === 600 && /rgba\(0, 0, 0/.test(q.fillStyle)));
    // 카드 배경과 테두리가 배치 계산과 같은 좌표에 그려진다
    for (const r of layout) {
      assert.ok(h.rects.some((q) => q.op === 'fill' && q.x === r.x && q.y === r.y && q.width === r.width && q.height === r.height), '카드 배경 없음');
    }
    assert.ok(drawnCardRects(h, layout).every(Boolean), '카드 테두리 없음');
    // 카드 번호 1, 2, 3과 제목 외 추가 문구 없음(부제/설명 문구가 없다)
    for (const n of ['1', '2', '3']) assert.ok(h.texts.includes(n));
    assert.ok(!h.texts.includes('4'));
    assert.ok(!h.texts.some((t) => t.includes('숫자 키로 선택') || t.includes('남은 레벨업')));
    // 가운데 정렬
    const left = layout[0].x;
    const right = layout[2].x + layout[2].width;
    assert.ok(Math.abs(left + right - view.width) < 1e-9);
  } finally {
    h.dispose();
  }
});

test('카드 내용: 각 카드에 번호, 유형, 이름, 효과 수치, 설명이 보상 데이터 그대로 표시된다', () => {
  const h = startPlaying();
  try {
    openScreen(h);
    const drawn = h.texts.join(' ');
    h.game.levelUp.candidates.forEach((c, i) => {
      assert.ok(h.texts.includes(String(i + 1)));
      for (const text of [c.category, c.title, c.effect, c.description]) assert.ok(drawn.includes(text), `"${text}" 없음`);
    });
    // 신규 무기와 무기 강화/자석 유형이 구분되어 표시된다
    const categories = new Set(h.game.levelUp.candidates.map((c) => c.category));
    for (const category of categories) assert.ok(['신규 무기', '무기 강화', '자석 강화'].includes(category));
  } finally {
    h.dispose();
  }
});

test('카드가 2장이면 2장만, 1장이면 1장만 그려지고 가짜 카드는 없다', () => {
  for (const count of [2, 1]) {
    const h = startPlaying();
    try {
      leaveCandidates(h, count);
      openScreen(h);
      assert.equal(h.game.levelUp.candidates.length, count);
      const layout = computeCardLayout(count, { width: 800, height: 600 });
      assert.ok(drawnCardRects(h, layout).every(Boolean));
      // 카드 크기의 테두리 사각형은 count개뿐이다
      assert.equal(h.rects.filter((q) => q.op === 'stroke' && q.width === layout[0].width && q.height === layout[0].height).length, count);
      for (let n = 1; n <= count; n++) assert.ok(h.texts.includes(String(n)));
      assert.ok(!h.texts.includes(String(count + 1)));
    } finally {
      h.dispose();
    }
  }
});

test('마우스 클릭: 카드 중앙을 클릭하면 같은 번호의 숫자 키와 똑같은 보상이 적용된다', () => {
  // 같은 난수(seed)로 한 번은 숫자 키로, 한 번은 클릭으로 고른다(게임은 한 번에 하나씩만 실행한다).
  const play = (index, how) => {
    const h = startPlaying();
    try {
      openScreen(h);
      const cards = h.game.levelUp.candidates.map((c) => c.id);
      const r = computeCardLayout(3, { width: 800, height: 600 })[index];
      if (how === 'key') h.tap(`Digit${index + 1}`);
      else h.click(r.x + r.width / 2, r.y + r.height / 2);
      const applied = loadout(h);
      h.run(FLASH);
      assert.equal(h.game.state.current, 'playing');
      return { cards, applied };
    } finally {
      h.dispose();
    }
  };
  for (const index of [0, 1, 2]) {
    const byKey = play(index, 'key');
    const byClick = play(index, 'click');
    assert.deepEqual(byClick.cards, byKey.cards); // 같은 후보가 같은 순서로 나왔다
    assert.equal(byClick.applied, byKey.applied); // 같은 보상이 적용되었다
    assert.notEqual(byClick.applied, JSON.stringify({ s: [['shard', 1]], m: 0 })); // 실제로 무언가 바뀌었다
  }
});

test('마우스 클릭: 카드 바깥, 카드 사이 틈, 없는 카드 자리는 무시된다', () => {
  const h = startPlaying();
  try {
    leaveCandidates(h, 2);
    openScreen(h);
    const before = loadout(h);
    const layout = computeCardLayout(2, { width: 800, height: 600 });
    h.click(5, 5); // 화면 모서리
    h.click(400, layout[0].y - 20); // 카드 위
    h.click(400, layout[0].y + layout[0].height + 20); // 카드 아래
    h.click((layout[0].x + layout[0].width + layout[1].x) / 2, layout[0].y + 20); // 카드 사이 틈
    h.click(layout[1].x + layout[1].width + 60, layout[0].y + 20); // 표시되지 않은 3번째 자리
    h.run(FLASH);
    assert.equal(h.game.state.current, 'levelup');
    assert.equal(loadout(h), before);
    assert.equal(h.game.levelUp.candidates.length, 2);
  } finally {
    h.dispose();
  }
});

test('마우스 클릭: 캔버스가 페이지 안에서 떨어져 있고 크기가 달라도 그려진 카드 위치가 클릭된다', () => {
  const h = startPlaying({ width: 1000, height: 700, left: 130, top: 70 });
  try {
    openScreen(h);
    const layout = computeCardLayout(3, { width: 1000, height: 700 });
    assert.ok(drawnCardRects(h, layout).every(Boolean)); // 그린 좌표
    const chosen = h.game.levelUp.candidates[2];
    h.click(layout[2].x + layout[2].width - 3, layout[2].y + layout[2].height - 3); // 세 번째 카드의 오른쪽 아래 모서리 근처
    assert.equal(h.game.levelUp.active, false); // 클릭이 받아들여져 후보가 소비되었다(레벨업은 1번뿐)
    h.run(FLASH);
    assert.equal(h.game.state.current, 'playing');
    if (chosen.kind === 'newWeapon') assert.equal(h.game.weapons.has(chosen.id), true);
    if (chosen.kind === 'magnet') assert.equal(h.game.experience.magnetLevel, 1);
    if (chosen.kind === 'weaponUpgrade') assert.equal(h.game.weapons.levelOf(chosen.id), 2);
  } finally {
    h.dispose();
  }
});

test('표시되지 않은 번호 키는 무시된다(카드가 1장이면 1만, 2장이면 1과 2만 유효)', () => {
  const h = startPlaying();
  try {
    leaveCandidates(h, 1);
    openScreen(h);
    const before = loadout(h);
    h.tap('Digit2');
    h.tap('Digit3');
    h.tap('Numpad2');
    h.run(FLASH);
    assert.equal(h.game.state.current, 'levelup');
    assert.equal(loadout(h), before);
    h.tap('Digit1');
    h.run(FLASH);
    assert.equal(h.game.state.current, 'playing');
    assert.notEqual(loadout(h), before);
  } finally {
    h.dispose();
  }
});

test('중복 입력: 키와 클릭이 연달아 들어와도, 같은 카드를 여러 번 눌러도 보상은 한 번만 적용된다', () => {
  const h = startPlaying();
  try {
    openScreen(h);
    const layout = computeCardLayout(3, { width: 800, height: 600 });
    const start = JSON.parse(loadout(h));
    h.tap('Digit1');
    h.click(layout[1].x + 10, layout[1].y + 10); // 바로 이어서 다른 카드를 클릭
    h.tap('Digit3');
    h.tap('Digit1');
    h.click(layout[0].x + 10, layout[0].y + 10);
    h.run(FLASH);
    const end = JSON.parse(loadout(h));
    // 정확히 하나의 보상만 반영되었다: 무기 수 + 무기 레벨 합 + 자석 레벨의 증가량이 1이다.
    const score = (x) => x.s.length + x.s.reduce((sum, [, level]) => sum + level, 0) + x.m;
    assert.equal(score(end) - score(start), x1(start, end));
    assert.equal(h.game.state.current, 'playing');
  } finally {
    h.dispose();
  }
});

// 새 무기 획득은 (무기 수 + 1, 그 무기 레벨 1)이라 점수가 2 늘고, 강화/자석은 1 늘어난다.
function x1(start, end) {
  return end.s.length > start.s.length ? 2 : 1;
}

test('선택 강조: 선택한 카드가 강조되고, 강조 중에도 게임은 정지 상태이며, 끝나면 재개된다', () => {
  const h = startPlaying();
  try {
    openScreen(h);
    const layout = computeCardLayout(3, { width: 800, height: 600 });
    const shown = h.game.levelUp.candidates.map((c) => c.title);
    const frozen = JSON.stringify([h.game.gameTime(), h.game.player.x, h.game.player.y]);
    h.tap('Digit2');
    h.step(); // 강조 상태 그리기
    assert.equal(h.game.state.current, 'levelup');
    // 방금 보여 준 카드가 그대로 그려지고, 선택한 카드(2번)만 흰색 굵은 테두리로 강조된다
    const strokes = layout.map((r) => h.rects.find((q) => q.op === 'stroke' && q.x === r.x && q.y === r.y && q.width === r.width && q.height === r.height));
    assert.ok(strokes.every(Boolean));
    assert.equal(strokes[1].strokeStyle, '#ffffff');
    assert.notEqual(strokes[0].strokeStyle, '#ffffff');
    assert.notEqual(strokes[2].strokeStyle, '#ffffff');
    const drawn = h.texts.join(' ');
    for (const title of shown) assert.ok(drawn.includes(title));
    // 강조 중 입력은 무시되고 게임은 멈춰 있다
    h.tap('Digit1');
    h.click(layout[0].x + 5, layout[0].y + 5);
    h.run(0.05);
    assert.equal(JSON.stringify([h.game.gameTime(), h.game.player.x, h.game.player.y]), frozen);
    assert.equal(h.game.state.current, 'levelup');
    h.run(FLASH);
    assert.equal(h.game.state.current, 'playing');
    h.run(0.3);
    assert.notEqual(JSON.stringify([h.game.gameTime(), h.game.player.x, h.game.player.y]), frozen);
  } finally {
    h.dispose();
  }
});

test('연속 레벨업: 카드 화면이 순서대로 나타나고(매번 현재 상태 기준), 마지막 선택이 끝나기 전에는 전투가 재개되지 않는다', () => {
  const h = startPlaying();
  try {
    h.tap('KeyX', { shiftKey: true }); // 5번 레벨업
    const g = h.game;
    assert.equal(g.experience.level, 6);
    const screens = [];
    for (let i = 0; i < 5; i++) {
      assert.equal(g.state.current, 'levelup', `${i + 1}번째 화면`);
      h.step();
      const cards = g.levelUp.candidates.map((c) => `${c.kind}:${c.id}`);
      screens.push(cards);
      const layout = computeCardLayout(cards.length, { width: 800, height: 600 });
      assert.ok(drawnCardRects(h, layout).every(Boolean), `${i + 1}번째 화면의 카드가 그려져야 한다`);
      const timeBefore = g.gameTime();
      // 마우스로 가운데 카드(없으면 첫 카드)를 고른다
      const target = layout[Math.min(1, layout.length - 1)];
      h.click(target.x + target.width / 2, target.y + target.height / 2);
      if (i < 4) {
        // 다음 화면으로 넘어가기 전에 강조 시간 동안 이전 카드가 보이고, 게임은 계속 정지다
        h.run(0.05);
        assert.equal(g.state.current, 'levelup');
        h.run(FLASH);
        assert.equal(g.state.current, 'levelup'); // 다음 화면이 열려 있다(전투 재개 아님)
        assert.equal(g.gameTime(), timeBefore);
      } else {
        h.run(FLASH);
      }
    }
    assert.equal(g.state.current, 'playing'); // 모든 선택이 끝난 뒤에만 재개
    assert.equal(g.levelUp.pending, 0);
    assert.equal(screens.length, 5);
    // 직전 선택이 반영되어 이미 얻은 무기는 이후 화면에서 신규 무기 후보로 나오지 않는다
    const acquiredBefore = new Set(['shard']);
    screens.forEach((cards) => {
      for (const card of cards) {
        const [kind, id] = card.split(':');
        if (kind === 'newWeapon') assert.ok(!acquiredBefore.has(id), `${id}가 이미 보유 중인데 신규 무기로 나왔다`);
      }
    });
    const t = g.gameTime();
    h.run(0.5);
    assert.ok(g.gameTime() > t);
  } finally {
    h.dispose();
  }
});

test('레벨업 상태 밖에서 한 클릭은 아무 일도 하지 않는다', () => {
  const h = startPlaying();
  try {
    const before = loadout(h);
    const layout = computeCardLayout(3, { width: 800, height: 600 });
    h.click(layout[0].x + 10, layout[0].y + 10); // 전투 중
    h.tap('Escape');
    h.click(layout[0].x + 10, layout[0].y + 10); // 일시 정지 중
    assert.equal(h.game.state.current, 'paused');
    h.tap('Escape');
    h.run(0.2);
    assert.equal(loadout(h), before);
    assert.equal(h.game.state.current, 'playing');
  } finally {
    h.dispose();
  }
});

test('여러 레벨업이 대기 중일 때 연타해도 한 번에 한 화면만 처리된다(강조 중 입력은 다음 화면에 새지 않는다)', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    h.tap('KeyX', { shiftKey: true }); // 5번 레벨업: 지금 화면 1개 + 대기 4개
    assert.equal(g.levelUp.pending, 4);
    const layout = computeCardLayout(3, { width: 800, height: 600 });
    h.tap('Digit1'); // 첫 화면 선택
    assert.equal(g.levelUp.pending, 3); // 다음 화면이 열렸다(대기 3개)
    const afterFirst = loadout(h);
    // 강조 중에 키와 클릭을 연타해도 다음 화면의 카드가 선택되지 않는다
    for (let i = 0; i < 4; i++) {
      h.tap('Digit1');
      h.tap('Digit2');
      h.click(layout[0].x + 10, layout[0].y + 10);
    }
    assert.equal(g.levelUp.pending, 3);
    assert.equal(loadout(h), afterFirst);
    h.run(FLASH); // 강조가 끝나면 두 번째 화면이 정상적으로 선택을 받는다
    assert.equal(g.state.current, 'levelup');
    h.tap('Digit1');
    assert.equal(g.levelUp.pending, 2);
    assert.notEqual(loadout(h), afterFirst);
  } finally {
    h.dispose();
  }
});
