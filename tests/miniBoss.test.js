// 단계 11: 중간 보스(2:00 출현, 전투, 처치 시 경계 강화 화면)와 보상 순서 처리.
// 순수 로직(boss.js, 보상 흐름)과 실제 game.js 통합 테스트를 함께 둔다. 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';
import { BOSS, ENEMY, BOUNDARY, TIMELINE, WORLD } from '../src/config.js';
import { createMiniBoss, isMiniBoss, miniBossSpawnPosition } from '../src/boss.js';
import { createEnemy, damageEnemy, removeDeadEnemies } from '../src/enemy.js';
import { createWeaponSystem } from '../src/weapons.js';
import { createExperience } from '../src/experience.js';
import { createBoundary } from '../src/boundary.js';
import { listValidRewards, buildCandidates, createLevelUpFlow } from '../src/rewards.js';
import { computeCardLayout } from '../src/rewardCards.js';
import { createBoundaryUpgradeFlow } from '../src/boundaryRewards.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const PLAYER = { x: 2000, y: 2000 };

// ---------- 순수 로직 ----------

test('보스 만들기: 별도 HP/속도, isBoss 표시, 일반 적 설정은 바뀌지 않는다', () => {
  const boss = createMiniBoss(7, 100, 100, PLAYER);
  assert.equal(boss.kind, 'miniBoss');
  assert.equal(isMiniBoss(boss), true);
  assert.equal(boss.isBoss, true);
  assert.equal(boss.hp, BOSS.miniBoss.maxHp);
  assert.equal(boss.maxHp, BOSS.miniBoss.maxHp);
  assert.equal(boss.speed, BOSS.miniBoss.speed);
  assert.equal(boss.dead, false);
  assert.equal(BOSS.sizeScale, 1.1); // 단계 10의 크기 설정 유지
  assert.equal(ENEMY.maxHp, 10);
  const normal = createEnemy(1, 0, 0, PLAYER);
  assert.equal(isMiniBoss(normal), false);
  assert.equal(normal.isBoss, undefined);
});

test('보스 출현 위치: 화면 밖 고리 위이고 월드 안이다', () => {
  const view = { width: 800, height: 600 };
  for (const r of [0, 0.25, 0.5, 0.9]) {
    const p = miniBossSpawnPosition(PLAYER, view, () => r);
    const d = Math.hypot(p.x - PLAYER.x, p.y - PLAYER.y);
    assert.ok(d >= Math.min(view.width, view.height) / 2, `화면 안에 생김 d=${d}`);
    assert.ok(p.x >= 0 && p.x <= WORLD.width && p.y >= 0 && p.y <= WORLD.height);
  }
  const corner = miniBossSpawnPosition({ x: 10, y: 10 }, view, () => 0.5); // 월드 모서리에서도 월드 안
  assert.ok(corner.x >= 0 && corner.y >= 0);
});

test('보스는 일반 피해 규칙으로 다치고 죽으며 목록에서 한 번만 제거된다', () => {
  const boss = createMiniBoss(1, 0, 0, PLAYER);
  assert.deepEqual(damageEnemy(boss, 5), { killed: false });
  assert.equal(boss.hp, BOSS.miniBoss.maxHp - 5);
  assert.deepEqual(damageEnemy(boss, 1e9), { killed: true });
  assert.equal(damageEnemy(boss, 5), null); // 죽은 뒤에는 피해 없음
  const list = [boss, createEnemy(2, 0, 0, PLAYER)];
  let calls = 0;
  assert.equal(removeDeadEnemies(list, () => calls++), 1);
  assert.equal(removeDeadEnemies(list, () => calls++), 0);
  assert.equal(calls, 1);
});

test('일반 레벨업 후보에는 경계 강화가 절대 섞이지 않는다', () => {
  const weapons = createWeaponSystem();
  const experience = createExperience();
  for (const r of listValidRewards({ weapons, experience })) assert.ok(!String(r.kind).startsWith('boundary'), r.kind);
  for (let i = 0; i < 20; i++) {
    for (const c of buildCandidates({ weapons, experience, rng: Math.random })) assert.notEqual(c.category, '경계 강화');
  }
});

test('보상 흐름: 경계 강화 화면은 예약한 횟수만큼만 열리고, 선택은 한 번만 적용되며, 최대 반경이면 건너뛴다', () => {
  const boundary = createBoundary(PLAYER);
  const flow = createBoundaryUpgradeFlow({ boundary });
  assert.equal(flow.advance(), false); // 예약이 없으면 열리지 않는다
  flow.addUpgrades(1);
  assert.equal(flow.advance(), true);
  assert.equal(flow.candidates.length, 1);
  assert.equal(flow.select(5), false); // 없는 카드 번호
  assert.equal(flow.select('0'), false);
  assert.equal(boundary.radiusLevel, 0);
  assert.equal(flow.select(0), true);
  assert.equal(boundary.radiusLevel, 1);
  assert.equal(flow.select(0), false); // 같은 화면을 다시 선택할 수 없다
  assert.equal(boundary.radiusLevel, 1);
  assert.equal(flow.active, false);
  boundary.radiusLevel = 3;
  flow.addUpgrades(1);
  assert.equal(flow.advance(), false); // 적용할 강화가 없으면 화면 없이 건너뜀
  assert.equal(flow.pending, 0);
});

test('레벨업 흐름은 기존과 같게 동작한다(addLevelUps, 순차 화면, 초기화)', () => {
  const weapons = createWeaponSystem();
  const experience = createExperience();
  const flow = createLevelUpFlow({ weapons, experience });
  flow.addLevelUps(2);
  assert.equal(flow.advance(), true);
  assert.equal(flow.pending, 1);
  assert.equal(flow.select(0), true);
  assert.equal(flow.active, true); // 두 번째 화면이 바로 열림
  flow.reset();
  assert.equal(flow.active, false);
  assert.equal(flow.pending, 0);
});

// ---------- game.js 통합 ----------

const bossObject = (id, x, y, hp = BOSS.miniBoss.maxHp) => ({ ...createMiniBoss(id, x, y, PLAYER), hp });

function startPlaying(seed = 1) {
  const h = launchGame(loaded.startGame, { seed });
  h.step();
  h.tap('Enter');
  assert.equal(h.game.state.current, 'playing');
  return h;
}

// 일반 적을 계속 치워서 플레이어가 죽거나 레벨업이 열리지 않게 하며 게임 시간을 목표까지 진행한다(보스는 남긴다).
function advanceTo(h, seconds) {
  const g = h.game;
  let guard = 0;
  while (g.gameTime() < seconds && guard++ < 5000) {
    h.step(0.05);
    for (let i = g.enemies.length - 1; i >= 0; i--) if (!g.enemies[i].isBoss) g.enemies.splice(i, 1);
    g.experience.orbs.length = 0;
  }
}

const bosses = (h) => h.game.enemies.filter((e) => e.isBoss);
const cardKinds = (h) => h.game.boundaryUpgrades().candidates.map((c) => c.kind);

// 보스를 플레이어 바로 옆에 두고 HP를 1로 만든 뒤 shard가 죽일 때까지 진행한다(실제 무기 시스템 사용).
function killBossWithWeapons(h) {
  const g = h.game;
  const boss = bosses(h)[0];
  boss.x = g.player.x + 40;
  boss.y = g.player.y;
  boss.hp = 1;
  h.runUntil(() => g.state.is('levelup') || !g.enemies.includes(boss), 5, '보스 처치');
  return boss;
}

test('1. 2:00에 보스가 정확히 한 번 나온다(프레임이 시각을 건너뛰어도 반복되지 않음)', () => {
  const h = startPlaying();
  try {
    assert.equal(TIMELINE.midBossAt, 120);
    advanceTo(h, 119);
    assert.equal(bosses(h).length, 0);
    advanceTo(h, 121);
    assert.equal(bosses(h).length, 1);
    const first = bosses(h)[0];
    const id = first.id;
    advanceTo(h, 140);
    assert.equal(bosses(h).length, 1);
    assert.equal(bosses(h)[0].id, id);
    assert.ok(bosses(h)[0].hp <= BOSS.miniBoss.maxHp); // 무기에 맞아 줄어들 수는 있지만 다시 만들어지지는 않는다
  } finally {
    h.dispose();
  }
});

test('2. 일시 정지 중에는 시간이 멈추고 보스 출현이 앞당겨지거나 중복되지 않는다', () => {
  const h = startPlaying();
  try {
    advanceTo(h, 118);
    h.tap('Escape');
    assert.equal(h.game.state.current, 'paused');
    const t = h.game.gameTime();
    h.run(30);
    assert.equal(h.game.gameTime(), t);
    assert.equal(bosses(h).length, 0); // 정지 시간 동안 출현하지 않는다
    h.tap('Escape');
    assert.equal(h.game.state.current, 'playing');
    advanceTo(h, 119.5);
    assert.equal(bosses(h).length, 0);
    advanceTo(h, 121);
    assert.equal(bosses(h).length, 1);
  } finally {
    h.dispose();
  }
});

test('3~4. 보스는 실제 무기로 다치고 죽으며, 처치 직후 경계 강화 화면이 정확히 한 번 열린다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 121);
    const boss = bosses(h)[0];
    assert.ok(boss.maxHp > ENEMY.maxHp);
    boss.x = g.player.x + 40;
    boss.y = g.player.y;
    h.runUntil(() => boss.hp < boss.maxHp, 5, '보스 피격');
    assert.equal(boss.dead, false);
    assert.equal(g.state.current, 'playing'); // 피격만으로는 보상이 열리지 않는다
    assert.equal(g.boundaryUpgrades().active, false);
    boss.hp = 1;
    killBossWithWeapons(h);
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.boundaryUpgrades().active, true);
    assert.deepEqual(cardKinds(h), ['boundaryRadius']);
    assert.equal(g.enemies.includes(boss), false); // 정리됨
    h.step();
    assert.ok(h.texts.includes('BOUNDARY UPGRADE'), h.texts.join('|'));
    assert.ok(!h.texts.includes('LEVEL UP'));
    assert.equal(g.boundaryUpgrades().pending, 0); // 예약은 한 번뿐
  } finally {
    h.dispose();
  }
});

test('5. 일반 적을 아무리 처치해도 경계 강화 화면은 열리지 않는다(일반 레벨업은 별개로 열림)', () => {
  const h = startPlaying(3);
  try {
    const g = h.game;
    let kills = 0;
    let sawLevelUp = false;
    for (let i = 0; i < 60 * 40 && kills < 15; i++) {
      if (g.state.is('levelup')) {
        sawLevelUp = true;
        assert.equal(g.boundaryUpgrades().active, false);
        assert.equal(h.texts.includes('BOUNDARY UPGRADE'), false);
        h.tap('Digit1');
        h.run(0.25);
        continue;
      }
      const before = g.enemies.length;
      h.step();
      kills += Math.max(0, before - g.enemies.length);
      if (g.health.isDead) break;
    }
    assert.equal(g.boundaryUpgrades().pending, 0);
    assert.equal(g.boundaryUpgrades().active, false);
    assert.equal(g.boundary().radiusLevel, 0);
    assert.ok(kills > 0);
    assert.ok(sawLevelUp || kills >= 1);
  } finally {
    h.dispose();
  }
});

test('6. 보상 화면이 열려 있는 동안 전투와 게임 시간이 모두 멈춘다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 121);
    const other = bosses(h)[0];
    other.x = g.player.x + 400; // 멀리 둔다(곧 죽이지 않을 보스)
    g.enemies.push(bossObject(900, g.player.x + 40, g.player.y, 1));
    h.runUntil(() => g.state.is('levelup'), 5, '보상 화면');
    const snap = () => JSON.stringify({ t: g.gameTime(), p: [g.player.x, g.player.y], e: g.enemies.map((e) => [e.id, e.x, e.y, e.hp]), hp: g.health.hp, d: g.boundary().durability });
    const before = snap();
    h.run(5);
    assert.equal(snap(), before);
    assert.equal(g.state.current, 'levelup');
  } finally {
    h.dispose();
  }
});

function openBossReward(h) {
  const g = h.game;
  g.enemies.length = 0;
  g.enemies.push(bossObject(900, g.player.x + 40, g.player.y, 1));
  h.runUntil(() => g.state.is('levelup'), 5, '경계 강화 화면');
  assert.equal(g.boundaryUpgrades().active, true);
}

test('7~9. 숫자 키로 선택하면 반경 강화가 정확히 한 번 적용되고 전투가 재개된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    openBossReward(h);
    assert.equal(g.boundary().radius, 300);
    const center = { ...g.boundary().center };
    h.tap('Digit1');
    assert.equal(g.boundary().radiusLevel, 1); // 즉시 적용
    h.tap('Digit1'); // 강조 중 반복 입력 무시
    h.press('Digit1', { repeat: true });
    h.run(0.25);
    assert.equal(g.state.current, 'playing');
    assert.equal(g.boundary().radiusLevel, 1);
    assert.equal(g.boundary().radius, 330);
    assert.deepEqual({ ...g.boundary().center }, center);
    h.tap('Digit1'); // 재개 뒤 입력은 보상과 무관
    h.run(1);
    assert.equal(g.boundary().radiusLevel, 1);
    const t = g.gameTime();
    h.run(1);
    assert.ok(g.gameTime() > t); // 게임 시간 재개
  } finally {
    h.dispose();
  }
});

test('7~9. 마우스 클릭으로도 같은 보상이 한 번만 적용된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    openBossReward(h);
    const [card] = computeCardLayout(1, { width: 800, height: 600 }); // 카드 1장(반경 강화뿐)
    h.click(card.x + card.width / 2, card.y + card.height / 2);
    h.click(card.x + card.width / 2, card.y + card.height / 2); // 같은 곳을 또 클릭
    assert.equal(g.boundary().radiusLevel, 1);
    h.run(0.25);
    assert.equal(g.state.current, 'playing');
    assert.equal(g.boundary().radius, 330);
  } finally {
    h.dispose();
  }
});

test('10. 없는 카드 번호, 다른 키, 카드 밖 클릭은 보상을 적용하지 않고 화면을 닫지 않는다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    openBossReward(h);
    h.step();
    for (const code of ['Digit2', 'Digit3', 'Digit0', 'KeyA', 'Space', 'KeyR', 'Numpad3']) h.tap(code);
    h.click(1, 1);
    h.click(790, 590);
    h.run(0.5);
    assert.equal(g.boundary().radiusLevel, 0);
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.boundaryUpgrades().active, true);
    h.tap('Digit1');
    h.run(0.25);
    assert.equal(g.boundary().radiusLevel, 1);
  } finally {
    h.dispose();
  }
});

test('11. 일반 레벨업은 여전히 LEVEL UP 제목과 일반 후보로 열린다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    h.tap('KeyX'); // 개발 키: 경험치 +10 -> 레벨업
    assert.equal(g.state.current, 'levelup');
    assert.equal(g.boundaryUpgrades().active, false);
    assert.ok(g.levelUp.candidates.length > 0);
    for (const c of g.levelUp.candidates) assert.notEqual(c.category, '경계 강화');
    h.step();
    assert.ok(h.texts.includes('LEVEL UP'));
    assert.ok(!h.texts.includes('BOUNDARY UPGRADE'));
    h.tap('Digit1');
    h.run(0.25);
    assert.equal(g.state.current, 'playing');
    assert.equal(g.boundary().radiusLevel, 0);
  } finally {
    h.dispose();
  }
});

test('12. 레벨업과 보스 처치가 같은 프레임에 겹쳐도 두 보상 모두 한 번씩만 순서대로 적용된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    g.enemies.length = 0;
    g.weapons.equip('pulse'); // 즉시 발동하는 범위 공격으로 보스를 같은 프레임에 처치한다.
    g.weapons.slots.forEach((w) => (w.cooldown = 0));
    g.enemies.push(bossObject(900, g.player.x + 30, g.player.y, 1));
    g.experience.orbs.push({ id: 9001, x: g.player.x, y: g.player.y, value: 20 }); // 레벨 2개 상승분
    const levelBefore = g.experience.level;
    h.step(); // 한 프레임에 보스 처치 + 구슬 획득
    assert.equal(g.state.current, 'levelup');
    // 경계 강화가 먼저, 레벨업은 예약만 되어 있다
    assert.equal(g.boundaryUpgrades().active, true);
    assert.equal(g.levelUp.active, false);
    assert.equal(g.experience.level - levelBefore, 2);
    assert.equal(g.levelUp.pending, 2);
    h.step();
    assert.ok(h.texts.includes('BOUNDARY UPGRADE'));
    h.tap('Digit1'); // 경계 강화 선택
    assert.equal(g.boundary().radiusLevel, 1);
    assert.equal(g.levelUp.pending, 2); // 아직 레벨업 보상은 적용되지 않았다
    assert.equal(g.weapons.slots.length, 2);
    h.run(0.25);
    assert.equal(g.state.current, 'levelup'); // 이어서 레벨업 화면
    assert.equal(g.boundaryUpgrades().active, false);
    assert.equal(g.levelUp.active, true);
    h.step();
    assert.ok(h.texts.includes('LEVEL UP'));
    assert.ok(!h.texts.includes('BOUNDARY UPGRADE'));
    h.tap('Digit1'); // 첫 번째 레벨업 보상
    h.run(0.25);
    assert.equal(g.state.current, 'levelup'); // 두 번째 레벨업 화면
    h.tap('Digit1');
    h.run(0.25);
    assert.equal(g.state.current, 'playing');
    assert.equal(g.boundary().radiusLevel, 1); // 경계 강화는 중복 적용되지 않았다
    assert.equal(g.levelUp.pending, 0);
    assert.equal(g.boundaryUpgrades().pending, 0);
  } finally {
    h.dispose();
  }
});

test('13. 보스 처치 후에도 중심은 고정, 반경은 300/330/360/390, 내구도 규칙은 그대로다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    const center = { ...g.boundary().center };
    g.boundary().damage(40);
    const radii = [g.boundary().radius];
    for (let i = 0; i < 3; i++) {
      openBossReward(h);
      h.tap('Digit1');
      h.run(0.25);
      assert.equal(g.state.current, 'playing');
      radii.push(g.boundary().radius);
    }
    assert.deepEqual(radii, [300, 330, 360, 390]);
    assert.deepEqual({ ...g.boundary().center }, center);
    assert.equal(g.boundary().durability <= 60 + 1e-9, true); // 보스 보상이 내구도를 회복시키지 않는다
    // 최대 반경에서는 보스를 잡아도 화면이 열리지 않는다(적용할 강화가 없음)
    g.enemies.length = 0;
    g.enemies.push(bossObject(901, g.player.x + 40, g.player.y, 1));
    h.runUntil(() => g.enemies.length === 0, 5, '보스 처치');
    h.run(0.3);
    assert.equal(g.state.current, 'playing');
    assert.equal(g.boundary().radius, 390);
  } finally {
    h.dispose();
  }
});

test('새 런을 시작하면 예약된 경계 강화와 보스 출현 기록이 초기화된다', () => {
  const h = startPlaying();
  try {
    const g = h.game;
    advanceTo(h, 121);
    assert.equal(bosses(h).length, 1);
    h.tap('KeyG');
    h.tap('Enter');
    assert.equal(g.state.current, 'playing');
    assert.equal(bosses(h).length, 0);
    assert.equal(g.boundaryUpgrades().pending, 0);
    assert.equal(g.boundaryUpgrades().active, false);
    advanceTo(h, 121);
    assert.equal(bosses(h).length, 1); // 새 런에서도 다시 2:00에 한 번 나온다
  } finally {
    h.dispose();
  }
});
