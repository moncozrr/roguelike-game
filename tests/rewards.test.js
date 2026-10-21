// 단계 8: 보상 후보, 적용, 연속 레벨업 진행, levelup 상태.
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_RULES, STARTING_WEAPONS } from '../src/config.js';
import { createGameState, STATES } from '../src/gameState.js';
import { createWeaponSystem, weaponDamage } from '../src/weapons.js';
import { createExperience } from '../src/experience.js';
import { buildCandidates, listValidRewards, applyReward, createLevelUpFlow, REWARD_KINDS } from '../src/rewards.js';
import { createEnemy, damageEnemy } from '../src/enemy.js';

// 재현 가능한 난수(mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(startingWeapons = STARTING_WEAPONS) {
  return { weapons: createWeaponSystem({ startingWeapons }), experience: createExperience() };
}
const ids = (list) => list.map((r) => `${r.kind}:${r.id}`);

test('시작 무기는 shard뿐이고, 무기는 4종이다', () => {
  assert.deepEqual(STARTING_WEAPONS, ['shard']);
  assert.deepEqual(Object.keys(WEAPONS), ['shard', 'pulse', 'chainLightning', 'boomerangBlade']);
  const { weapons } = setup();
  assert.deepEqual(weapons.slots.map((w) => w.id), ['shard']);
});

test('시작 상태의 유효한 보상: 신규 무기 3종, shard 강화, 자석', () => {
  const state = setup();
  assert.deepEqual(ids(listValidRewards(state)), [
    'weaponUpgrade:shard',
    'newWeapon:pulse',
    'newWeapon:chainLightning',
    'newWeapon:boomerangBlade',
    'magnet:magnet',
  ]);
  const categories = new Set(listValidRewards(state).map((r) => r.category));
  assert.deepEqual([...categories], ['무기 강화', '신규 무기', '자석 강화']); // 신규 무기와 강화는 따로 구분
});

test('후보는 최대 3개이고, 여러 번 뽑으면 pulse/Chain Lightning/Boomerang Blade가 모두 나올 수 있다', () => {
  const state = setup();
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const c = buildCandidates({ ...state, rng: seeded(seed) });
    assert.equal(c.length, 3);
    assert.equal(new Set(ids(c)).size, 3); // 중복 후보 없음
    for (const r of c) seen.add(`${r.kind}:${r.id}`);
  }
  for (const key of ['newWeapon:pulse', 'newWeapon:chainLightning', 'newWeapon:boomerangBlade', 'weaponUpgrade:shard', 'magnet:magnet']) {
    assert.ok(seen.has(key), `${key} 후보가 나온 적이 없음`);
  }
});

test('같은 난수열이면 같은 후보가 나온다(결정적 난수 주입)', () => {
  const state = setup();
  const a = ids(buildCandidates({ ...state, rng: seeded(7) }));
  const b = ids(buildCandidates({ ...state, rng: seeded(7) }));
  assert.deepEqual(a, b);
});

test('무기 슬롯 3개: 가득 차면 신규 무기 후보가 사라지고 강화 후보만 남는다', () => {
  const state = setup(['shard', 'pulse', 'chainLightning']);
  assert.equal(WEAPON_RULES.maxSlots, 3);
  const valid = listValidRewards(state);
  assert.ok(valid.every((r) => r.kind !== REWARD_KINDS.NEW_WEAPON));
  assert.ok(!ids(valid).includes('newWeapon:boomerangBlade'));
  assert.equal(state.weapons.equip('boomerangBlade'), false); // 직접 얻으려 해도 막힌다
  assert.equal(state.weapons.slots.length, 3);
});

test('이미 보유한 무기는 신규 획득 후보에 나오지 않고 강화 후보로 나온다', () => {
  const state = setup(['shard', 'pulse']);
  const valid = ids(listValidRewards(state));
  assert.ok(!valid.includes('newWeapon:shard'));
  assert.ok(!valid.includes('newWeapon:pulse'));
  assert.ok(valid.includes('weaponUpgrade:shard'));
  assert.ok(valid.includes('weaponUpgrade:pulse'));
});

test('최대 레벨(5) 무기는 강화 후보에서 빠지고, 자석 최대 레벨이면 자석 후보가 빠진다', () => {
  const state = setup(['shard', 'pulse']);
  state.weapons.setLevel('shard', 5);
  assert.ok(!ids(listValidRewards(state)).includes('weaponUpgrade:shard'));
  assert.ok(ids(listValidRewards(state)).includes('weaponUpgrade:pulse'));
  for (let i = 0; i < 3; i++) state.experience.upgradeMagnet();
  assert.ok(!ids(listValidRewards(state)).includes('magnet:magnet'));
});

test('후보가 1~2개면 있는 만큼만 보여 주고, 0개면 비어 있다', () => {
  const state = setup(['shard', 'pulse', 'chainLightning']);
  for (const id of ['shard', 'pulse']) state.weapons.setLevel(id, 5);
  for (let i = 0; i < 3; i++) state.experience.upgradeMagnet();
  assert.deepEqual(ids(buildCandidates({ ...state })), ['weaponUpgrade:chainLightning']);
  state.weapons.setLevel('chainLightning', 4);
  assert.equal(buildCandidates({ ...state }).length, 1);
  state.weapons.setLevel('chainLightning', 5);
  assert.deepEqual(buildCandidates({ ...state }), []);

  const two = setup(['shard', 'pulse', 'chainLightning']);
  two.weapons.setLevel('shard', 5);
  two.weapons.setLevel('pulse', 5);
  assert.equal(buildCandidates({ ...two }).length, 2); // 신규 무기 불가, 강화(chain)와 자석
});

test('신규 무기는 보상을 선택한 뒤에만 획득된다', () => {
  const state = setup();
  const flow = createLevelUpFlow({ ...state, rng: seeded(3) });
  flow.addLevelUps(1);
  assert.equal(flow.active, false); // advance 전에는 열리지 않는다
  assert.equal(flow.advance(), true);
  assert.deepEqual(state.weapons.slots.map((w) => w.id), ['shard']); // 후보가 보이기만 한 상태
  const index = flow.candidates.findIndex((c) => c.kind === REWARD_KINDS.NEW_WEAPON);
  assert.ok(index >= 0);
  const wanted = flow.candidates[index].id;
  assert.equal(flow.select(index), true);
  assert.equal(state.weapons.has(wanted), true);
  assert.equal(state.weapons.levelOf(wanted), 1);
});

test('무기 강화 보상을 선택하면 레벨이 정확히 1 오른다', () => {
  const state = setup();
  const reward = listValidRewards(state).find((r) => r.kind === REWARD_KINDS.WEAPON_UPGRADE);
  assert.equal(applyReward(reward, state), true);
  assert.equal(state.weapons.levelOf('shard'), 2);
});

test('자석 보상을 선택하면 자석 레벨이 1 오른다', () => {
  const state = setup();
  const reward = listValidRewards(state).find((r) => r.kind === REWARD_KINDS.MAGNET);
  assert.equal(applyReward(reward, state), true);
  assert.equal(state.experience.magnetLevel, 1);
  assert.equal(state.experience.pickupRadius, 66);
});

test('불가능한 보상은 적용되지 않는다', () => {
  const state = setup(['shard']);
  state.weapons.setLevel('shard', 5);
  assert.equal(applyReward({ kind: REWARD_KINDS.WEAPON_UPGRADE, id: 'shard' }, state), false);
  assert.equal(applyReward({ kind: REWARD_KINDS.NEW_WEAPON, id: 'shard' }, state), false); // 이미 보유
  assert.equal(applyReward({ kind: REWARD_KINDS.NEW_WEAPON, id: 'unknown' }, state), false);
  assert.equal(applyReward({ kind: 'nothing' }, state), false);
  assert.equal(applyReward(null, state), false);
  for (let i = 0; i < 3; i++) state.experience.upgradeMagnet();
  assert.equal(applyReward({ kind: REWARD_KINDS.MAGNET }, state), false);
  assert.equal(state.weapons.levelOf('shard'), 5);
  assert.equal(state.experience.magnetLevel, 3);
});

test('잘못된 입력과 중복 선택은 무시되고 보상은 한 번만 적용된다', () => {
  const state = setup();
  const flow = createLevelUpFlow({ ...state, rng: seeded(11), maxCandidates: 2 });
  flow.addLevelUps(1);
  flow.advance();
  assert.equal(flow.candidates.length, 2);
  for (const bad of [2, 3, -1, NaN, Infinity, 1.5, '0', '1', null, undefined, {}, true]) assert.equal(flow.select(bad), false);
  assert.equal(flow.active, true); // 아무 일도 없었다
  const before = JSON.stringify({ s: state.weapons.slots, m: state.experience.magnetLevel });
  assert.equal(flow.select(0), true);
  assert.equal(flow.active, false);
  const after = JSON.stringify({ s: state.weapons.slots, m: state.experience.magnetLevel });
  assert.notEqual(before, after);
  assert.equal(flow.select(0), false); // 같은 화면에서 다시 눌러도 무시
  assert.equal(flow.select(1), false);
  assert.equal(JSON.stringify({ s: state.weapons.slots, m: state.experience.magnetLevel }), after);
});

test('후보가 하나도 없으면 보상 없이 건너뛰고 대기하지 않는다', () => {
  const state = setup(['shard', 'pulse', 'chainLightning']);
  for (const id of ['shard', 'pulse', 'chainLightning']) state.weapons.setLevel(id, 5);
  for (let i = 0; i < 3; i++) state.experience.upgradeMagnet();
  const flow = createLevelUpFlow(state);
  flow.addLevelUps(4);
  assert.equal(flow.advance(), false);
  assert.equal(flow.active, false);
  assert.equal(flow.pending, 0);
  assert.equal(flow.select(0), false);
});

test('연속 레벨업: 화면이 하나씩 열리고, 마지막 선택 후에만 끝난다. 후보는 매번 현재 상태로 새로 계산된다', () => {
  const state = setup();
  const flow = createLevelUpFlow({ ...state, rng: seeded(5) });
  flow.addLevelUps(3);
  assert.equal(flow.advance(), true);
  assert.equal(flow.pending, 2);
  const states = [];
  for (let step = 0; step < 3; step++) {
    assert.equal(flow.active, true, `${step + 1}번째 화면이 열려 있어야 한다`);
    // 표시 중인 후보는 현재 상태에서 유효한 보상이어야 한다(직전 선택 결과 반영).
    const valid = new Set(ids(listValidRewards(state)));
    for (const c of flow.candidates) assert.ok(valid.has(`${c.kind}:${c.id}`));
    states.push(flow.candidates.length);
    assert.equal(flow.select(0), true);
  }
  assert.equal(flow.active, false); // 모든 선택을 마쳤다
  assert.equal(flow.pending, 0);
  assert.deepEqual(states, [3, 3, 3]);
});

test('큰 경험치 한 번으로 여러 번 레벨업하면 보상 화면이 순차로 열린다', () => {
  const state = setup();
  const flow = createLevelUpFlow({ ...state, rng: seeded(9) });
  const gained = state.experience.addXp(100); // 5레벨업
  assert.equal(gained, 5);
  flow.addLevelUps(gained);
  let screens = 0;
  while (flow.advance()) {
    screens += 1;
    assert.equal(flow.select(0), true);
    assert.ok(screens <= 5);
  }
  assert.equal(screens, 5);
  assert.equal(flow.pending, 0);
});

test('리셋: 대기 중인 보상과 열린 후보를 지운다', () => {
  const state = setup();
  const flow = createLevelUpFlow(state);
  flow.addLevelUps(3);
  flow.advance();
  flow.reset();
  assert.equal(flow.active, false);
  assert.equal(flow.pending, 0);
  assert.equal(flow.select(0), false);
});

test('levelup 상태: 선택이 끝나야만 playing으로 돌아가고, 정지/게임 오버/시작은 막힌다', () => {
  const s = createGameState();
  s.send('start');
  assert.equal(s.send('levelUp'), true);
  assert.equal(s.is(STATES.LEVELUP), true);
  for (const action of ['pause', 'resume', 'gameOver', 'start', 'levelUp']) {
    assert.equal(s.send(action), false, action);
    assert.equal(s.is(STATES.LEVELUP), true);
  }
  assert.equal(s.send('rewardDone'), true);
  assert.equal(s.is(STATES.PLAYING), true);
  // 다른 상태에서는 levelUp/rewardDone이 막힌다
  assert.equal(s.send('rewardDone'), false);
  s.send('pause');
  assert.equal(s.send('levelUp'), false);
  s.send('resume');
  s.send('gameOver');
  assert.equal(s.send('levelUp'), false);
});

test('무기 레벨 피해 배율: 100/120/140/160/180%', () => {
  const dmg = [1, 2, 3, 4, 5].map((l) => weaponDamage(WEAPONS.shard, l));
  const expected = [3, 3.6, 4.2, 4.8, 5.4];
  dmg.forEach((d, i) => assert.ok(Math.abs(d - expected[i]) < 1e-9, `shard Lv${i + 1}: ${d}`));
  assert.equal(weaponDamage(WEAPONS.pulse, 1), 5);
  assert.ok(Math.abs(weaponDamage(WEAPONS.pulse, 5) - 9) < 1e-9);
  assert.ok(Math.abs(weaponDamage(WEAPONS.chainLightning, 2) - 2.4) < 1e-9);
  assert.ok(Math.abs(weaponDamage(WEAPONS.boomerangBlade, 4) - 3.2) < 1e-9);
  assert.equal(weaponDamage(WEAPONS.shard, 99), weaponDamage(WEAPONS.shard, 5)); // 레벨 제한
  assert.equal(weaponDamage(WEAPONS.shard, 0), 3);
});

test('무기 강화는 공격력만 올리고 쿨다운과 사거리는 그대로다', () => {
  const sys = createWeaponSystem({ startingWeapons: ['shard'] });
  const player = { x: 2000, y: 2000 };
  const e = createEnemy(1, 2100, 2000, player);
  e.hp = e.maxHp = 1000;
  sys.upgrade('shard');
  sys.upgrade('shard');
  sys.upgrade('shard');
  sys.upgrade('shard');
  assert.equal(sys.levelOf('shard'), 5);
  assert.equal(sys.upgrade('shard'), false); // 최대 레벨
  sys.update(0, player, [e]);
  assert.equal(sys.projectiles[0].damage, weaponDamage(WEAPONS.shard, 5));
  assert.equal(sys.slots[0].cooldown, WEAPONS.shard.cooldown); // 쿨다운 그대로
  assert.equal(WEAPONS.shard.range, 320);
});

test('소수 피해의 부동소수점 잔여값 때문에 살아남지 않는다', () => {
  const e = createEnemy(1, 0, 0, { x: 0, y: 0 });
  const third = 10 / 3;
  damageEnemy(e, third);
  damageEnemy(e, third);
  damageEnemy(e, third);
  assert.equal(e.dead, true);
  assert.equal(e.hp, 0);
});
