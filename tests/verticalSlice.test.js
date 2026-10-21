// 단계 13: 5분 수직 슬라이스 검수용 시뮬레이션과 성능/누적 측정.
// 실제 game.js를 처음부터 6분 넘게 진행한다. 이전 통합 테스트와 달리 일반 적을 치우지 않고(자연스러운 적 생성/전투),
// 플레이어가 죽지 않도록 HP만 계속 채운다. 보상 화면은 1번을 골라 넘긴다.
// 성능 측정은 "게임 상태 갱신 + 그리기 호출 기록(가짜 컨텍스트)"의 CPU 시간이며, 실제 화면 렌더링(래스터화) 성능이 아니다.
// 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance as nodePerformance } from 'node:perf_hooks';
import { loadGame, launchGame } from './helpers/gameHarness.js';
import { SPAWN, TIMELINE, BOSS } from '../src/config.js';
import { createEnemy, updateEnemies } from '../src/enemy.js';
import { createWeaponSystem } from '../src/weapons.js';
import { createSpawner, densityPercent } from '../src/spawner.js';
import { createExperience } from '../src/experience.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const REPORT = process.env.SLICE_REPORT === '1'; // 측정 수치를 콘솔에 출력(검수 보고용)
const log = (...args) => REPORT && console.log('[slice]', ...args);

function startPlaying(seed) {
  const h = launchGame(loaded.startGame, { seed });
  h.step();
  h.tap('Enter');
  assert.equal(h.game.state.current, 'playing');
  return h;
}

// 6분(360초)을 실제 프레임(0.05초)으로 진행하며 관찰값을 모은다. 일반 적은 치우지 않는다.
// keepFinalAlive: 최종 보스를 계속 살려 둔다(5:00 이후에도 보스가 살아 있는 상황을 만들기 위해). 기본은 보스를 그대로 두어 자연스럽게 처치될 수 있다.
function simulate(seed, { untilTime = 360, onFrame, keepFinalAlive = false } = {}) {
  const h = startPlaying(seed);
  const g = h.game;
  const obs = {
    h,
    maxSeenId: 0,
    spawnedAtMinute: {}, // 분 경계에서의 누적 생성 수(번호표 최댓값)
    bossAppeared: {}, // 'miniBoss'/'finalBoss' -> 처음 보인 게임 시간
    maxEnemies: 0,
    maxProjectiles: 0,
    maxEnemyProjectiles: 0,
    maxBoomerangs: 0,
    maxEffects: 0,
    maxOrbs: 0,
    levelUpScreens: 0,
    boundaryScreens: 0,
    frames: 0,
    frameMs: [],
    ended: null,
    levelupFrozenViolations: 0,
    timeDuringRewardViolations: 0,
  };
  let guard = 0;
  while (g.gameTime() < untilTime && guard++ < 40000) {
    if (g.state.is('levelup')) {
      if (g.boundaryUpgrades().active) obs.boundaryScreens++;
      else obs.levelUpScreens++;
      // 보상 화면이 열려 있는 동안 게임 시간과 적 위치가 변하지 않는지 확인한다.
      const t = g.gameTime();
      const positions = JSON.stringify(g.enemies.map((e) => [e.id, e.x, e.y]));
      h.run(0.5);
      if (g.gameTime() !== t) obs.timeDuringRewardViolations++;
      if (JSON.stringify(g.enemies.map((e) => [e.id, e.x, e.y])) !== positions) obs.levelupFrozenViolations++;
      h.tap('Digit1');
      h.run(0.25);
      continue;
    }
    if (g.state.current !== 'playing') {
      obs.ended = g.state.current;
      break;
    }
    g.health.reset(); // 플레이어가 죽지 않게 HP만 채운다(적, 투사체, 구슬은 그대로 둔다).
    const t0 = nodePerformance.now();
    h.step(0.05);
    obs.frameMs.push(nodePerformance.now() - t0);
    obs.frames++;
    const time = g.gameTime();
    for (const e of g.enemies) {
      if (e.id > obs.maxSeenId) obs.maxSeenId = e.id;
      if (e.kind === 'miniBoss' && !(e.kind in obs.bossAppeared)) obs.bossAppeared[e.kind] = time;
      if (e.kind === 'finalBoss' && !(e.kind in obs.bossAppeared)) obs.bossAppeared[e.kind] = time;
    }
    const minute = Math.floor(time / 60);
    if (!(minute in obs.spawnedAtMinute)) obs.spawnedAtMinute[minute] = obs.maxSeenId;
    obs.maxEnemies = Math.max(obs.maxEnemies, g.enemies.length);
    obs.maxProjectiles = Math.max(obs.maxProjectiles, g.weapons.projectiles.length);
    obs.maxEnemyProjectiles = Math.max(obs.maxEnemyProjectiles, g.enemyProjectiles.projectiles.length);
    obs.maxBoomerangs = Math.max(obs.maxBoomerangs, g.weapons.boomerangs.length);
    obs.maxEffects = Math.max(obs.maxEffects, g.weapons.effects.length);
    obs.maxOrbs = Math.max(obs.maxOrbs, g.experience.orbs.length);
    if (keepFinalAlive) for (const e of g.enemies) if (e.kind === 'finalBoss') e.hp = e.maxHp;
    onFrame?.(h, obs, time);
  }
  return obs;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

test('수직 슬라이스: 6분 연속 진행(일반 적 방치) - 보스 출현 시각, 5:00 이후 계속 진행, 적 상한, 보상 중 정지', () => {
  const obs = simulate(11);
  try {
    const g = obs.h.game;
    log('summary', JSON.stringify({ frames: obs.frames, spawnedAtMinute: obs.spawnedAtMinute, bossAppeared: obs.bossAppeared, maxEnemies: obs.maxEnemies, maxProjectiles: obs.maxProjectiles, maxEnemyProjectiles: obs.maxEnemyProjectiles, maxBoomerangs: obs.maxBoomerangs, maxEffects: obs.maxEffects, maxOrbs: obs.maxOrbs, levelUpScreens: obs.levelUpScreens, boundaryScreens: obs.boundaryScreens, ended: obs.ended, level: g.experience.level, finalState: g.state.current }));
    // 5:00(300초)을 넘어서까지 계속 진행되었다(최종 보스를 못 잡았거나 잡았다면 victory로 끝났을 수 있으므로 둘 중 하나)
    assert.ok(g.gameTime() >= TIMELINE.targetTime || obs.ended === 'victory', `진행이 ${g.gameTime().toFixed(1)}초에서 멈춤: ${obs.ended}`);
    // 보스 출현 시각: 중간 보스 2:00, 최종 보스 3:00(프레임 한 번 이내 오차)
    assert.ok(obs.bossAppeared.miniBoss >= TIMELINE.midBossAt && obs.bossAppeared.miniBoss < TIMELINE.midBossAt + 0.2, String(obs.bossAppeared.miniBoss));
    assert.ok(obs.bossAppeared.finalBoss >= TIMELINE.finalBossAt && obs.bossAppeared.finalBoss < TIMELINE.finalBossAt + 0.2, String(obs.bossAppeared.finalBoss));
    // 일반 적 수 상한(+보스 2마리)
    assert.ok(obs.maxEnemies <= SPAWN.maxEnemies + 2, `동시 적 수 ${obs.maxEnemies}`);
    // 보상 화면이 열려 있는 동안 시간과 적이 멈춰 있었다
    assert.equal(obs.timeDuringRewardViolations, 0);
    assert.equal(obs.levelupFrozenViolations, 0);
    assert.ok(obs.levelUpScreens > 0, '6분 동안 레벨업이 한 번도 없었다');
  } finally {
    obs.h.dispose();
  }
});

test('수직 슬라이스: 적 생성량이 시간표대로 늘어난다(밀도 +20%p/분)와 5:00 이후 신규 생성 중단', () => {
  const obs = simulate(11, { keepFinalAlive: true });
  try {
    const at = (m) => obs.spawnedAtMinute[m];
    assert.ok(at(6) !== undefined, '6:00까지 진행되지 않았다');
    const perMinute = [1, 2, 3, 4].map((m) => at(m) - at(m - 1)); // 0~1분, 1~2분, ...
    log('spawned per minute (보스 포함)', JSON.stringify(perMinute), 'at 5:00', at(5), 'at 6:00', at(6));
    assert.ok(perMinute[3] > perMinute[0], `4번째 분의 생성(${perMinute[3]})이 첫 분(${perMinute[0]})보다 많아야 한다`);
    assert.equal(densityPercent(0), 100);
    assert.equal(densityPercent(60), 120);
    assert.equal(densityPercent(240), 180);
    // 5:00 이후: 신규 적 생성 없음(번호표가 더 늘지 않는다). 6:00 경계가 관찰되었다면 5:00 때의 값과 같아야 한다.
    assert.equal(at(6), at(5), '5:00 이후에 적이 새로 생겼다');
  } finally {
    obs.h.dispose();
  }
});

test('수직 슬라이스: 최종 보스가 살아 있으면 5:00을 지나 6:00까지 런이 계속되고 보스와 기존 적이 계속 활동한다', () => {
  const obs = simulate(11, { keepFinalAlive: true });
  try {
    const g = obs.h.game;
    log('keepFinalAlive', JSON.stringify({ time: g.gameTime(), state: g.state.current, enemies: g.enemies.length, ended: obs.ended }));
    assert.equal(obs.ended, null);
    assert.equal(g.state.current, 'playing');
    assert.ok(g.gameTime() >= 360);
    const boss = g.enemies.find((e) => e.kind === 'finalBoss');
    assert.ok(boss, '최종 보스가 사라졌다');
    assert.ok(g.enemies.length > 1, '5:00 이후 기존 적이 모두 사라졌다');
  } finally {
    obs.h.dispose();
  }
});

test('수직 슬라이스: 같은 시드로 다시 돌리면 결과가 같다(재현 가능한 검수)', () => {
  const a = simulate(5, { untilTime: 150 });
  const sa = JSON.stringify([a.spawnedAtMinute, a.levelUpScreens, a.maxEnemies]);
  a.h.dispose();
  const b = simulate(5, { untilTime: 150 });
  const sb = JSON.stringify([b.spawnedAtMinute, b.levelUpScreens, b.maxEnemies]);
  b.h.dispose();
  assert.equal(sa, sb);
});

test('성능/누적(게임 상태 갱신 + 그리기 호출 기록, 실제 렌더링 아님): 프레임당 CPU 시간과 객체 수가 6분 동안 한도 안이다', () => {
  const obs = simulate(11, { keepFinalAlive: true });
  try {
    const ms = obs.frameMs;
    const stats = { frames: ms.length, meanMs: +mean(ms).toFixed(3), p95Ms: +percentile(ms, 0.95).toFixed(3), maxMs: +Math.max(...ms).toFixed(3) };
    log('frame cost (update + draw 기록, 가짜 컨텍스트)', JSON.stringify(stats));
    // 매우 넉넉한 한도: 한 프레임 평균이 16ms(60fps 예산)의 절반 이내. 기기마다 다르므로 엄격한 성능 보증이 아니라 이상 징후 감시용이다.
    assert.ok(stats.meanMs < 8, `평균 프레임 CPU ${stats.meanMs}ms`);
    // 누적 객체가 한도 안에 머문다(계속 늘어나는 누수 감시)
    assert.ok(obs.maxEnemies <= SPAWN.maxEnemies + 2);
    assert.ok(obs.maxProjectiles < 200, `플레이어 투사체 최대 ${obs.maxProjectiles}`);
    assert.ok(obs.maxEnemyProjectiles < 200, `적 투사체 최대 ${obs.maxEnemyProjectiles}`);
    assert.ok(obs.maxEffects < 100, `효과 최대 ${obs.maxEffects}`);
    assert.ok(obs.maxBoomerangs < 20);
    // 끝난 뒤 투사체/효과가 쌓여 있지 않다(일정 시간 내에 사라지는 것들)
    const g = obs.h.game;
    assert.ok(g.weapons.projectiles.length < 200);
    assert.ok(g.enemyProjectiles.projectiles.length < 200);
  } finally {
    obs.h.dispose();
  }
});

test('성능(순수 로직만, 화면 없음): 적 100마리 이동/밀어내기/무기 갱신의 1회 처리 시간', () => {
  const player = { x: 2000, y: 2000 };
  const enemies = [];
  for (let i = 0; i < 100; i++) enemies.push(createEnemy(i + 1, 2000 + ((i * 37) % 300) - 150, 2000 + ((i * 53) % 300) - 150, player, undefined, i % 4 === 0 ? 'ranged' : 'melee'));
  const weapons = createWeaponSystem();
  weapons.equip('pulse');
  weapons.equip('chainLightning');
  const runs = 300;
  const t0 = nodePerformance.now();
  for (let i = 0; i < runs; i++) {
    updateEnemies(enemies, 0.05, player);
    weapons.update(0.05, player, enemies);
    for (const e of enemies) if (e.dead) e.dead = false, (e.hp = e.maxHp); // 계속 같은 부하를 유지(죽은 적을 되살림)
  }
  const perFrame = (nodePerformance.now() - t0) / runs;
  log('pure update(100 enemies: updateEnemies + weapons.update)', perFrame.toFixed(3), 'ms/frame');
  assert.ok(perFrame < 8, `100마리 갱신 ${perFrame.toFixed(3)}ms`);
  // 생성기와 경험치 구슬 계산도 가볍다
  const spawner = createSpawner();
  const experience = createExperience();
  const t1 = nodePerformance.now();
  for (let i = 0; i < 2000; i++) {
    spawner.update(0.05, { gameTime: 200, enemyCount: 50, cam: { x: 1500, y: 1500 }, view: { width: 800, height: 600 } });
    experience.collect(player);
  }
  assert.ok((nodePerformance.now() - t1) / 2000 < 2);
  assert.equal(BOSS.finalBoss.maxHp, 400);
});
