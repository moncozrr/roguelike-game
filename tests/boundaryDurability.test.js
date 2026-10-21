// 단계 10: 경계 내구도/회복, 버프 약화, 경계 안/밖 적용, 인간형 공유, 경계 강화 후보(순수 로직).
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoundary } from '../src/boundary.js';
import { weakenPercent, effectiveBuffPercent, attackMultiplier, sharesBoundaryBuff } from '../src/boundaryBuffs.js';
import { listBoundaryRewards, buildBoundaryCandidates, applyBoundaryReward } from '../src/boundaryRewards.js';
import { createWeaponSystem } from '../src/weapons.js';
import { BOUNDARY, BOSS, WEAPONS } from '../src/config.js';

const CENTER = { x: 2000, y: 2000 };
const make = (options) => createBoundary(CENTER, options);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const INSIDE = { x: 2100, y: 2000 };
const OUTSIDE = { x: 2000 + 301, y: 2000 };

test('내구도 초기화: 최대 내구도로 시작하고, 회복 기본값은 설정을 따른다', () => {
  const b = make();
  assert.equal(b.maxDurability, BOUNDARY.maxDurability);
  assert.equal(b.durability, b.maxDurability);
  assert.equal(b.recoveryOn, BOUNDARY.recoveryDefaultOn);
  assert.equal(make({ recoveryOn: false }).recoveryOn, false);
  assert.equal(make({ maxDurability: 250 }).durability, 250);
  for (const bad of [0, -5, NaN, Infinity, '100', null]) assert.throws(() => make({ maxDurability: bad }), RangeError);
});

test('내구도 범위: 0~최대로 제한되고, 잘못된 피해는 무시된다', () => {
  const b = make();
  assert.equal(b.damage(30), true);
  assert.equal(b.durability, 70);
  for (const bad of [0, -10, NaN, Infinity, '5', null, undefined]) assert.equal(b.damage(bad), false);
  assert.equal(b.durability, 70);
  b.damage(1e9);
  assert.equal(b.durability, 0); // 음수가 되지 않는다
  b.setRecovery(true);
  b.update(1000);
  assert.equal(b.durability, b.maxDurability); // 최대를 넘지 않는다
});

test('경계는 내구도 0이어도 파괴되지 않는다: 중심, 반경, 안/밖 판정이 그대로다', () => {
  const b = make({ radiusLevel: 2 });
  const radius = b.radius;
  b.damage(1e9);
  assert.equal(b.durability, 0);
  assert.equal(b.radius, radius);
  assert.deepEqual({ ...b.center }, CENTER);
  assert.equal(b.contains(INSIDE), true);
  assert.equal(b.contains({ x: 2000 + radius + 1, y: 2000 }), false);
  b.damage(50); // 0에서 다시 맞아도 문제 없다
  assert.equal(b.durability, 0);
});

test('회복 토글: ON/OFF가 바뀌고, OFF에서는 회복하지 않는다', () => {
  const b = make({ recoveryOn: true });
  assert.equal(b.toggleRecovery(), false);
  assert.equal(b.recoveryOn, false);
  b.damage(50);
  b.update(30);
  assert.equal(b.durability, 50); // OFF: 오래 기다려도 그대로
  assert.equal(b.toggleRecovery(), true);
  b.update(0.5);
  assert.equal(b.durability > 50, true); // ON으로 바꾸면(대기 시간이 이미 지났으므로) 회복 시작
  b.setRecovery('yes'); // true가 아닌 값은 OFF로 본다
  assert.equal(b.recoveryOn, false);
});

test('회복 속도: 초당 최대 내구도의 5%, 0에서 100%까지 약 20초, 프레임 속도와 무관하다', () => {
  const run = (dt, seconds) => {
    const b = make({ recoveryOn: true });
    b.damage(b.maxDurability); // 0으로
    const frames = Math.round((seconds + BOUNDARY.recoveryDelay) / dt);
    for (let i = 0; i < frames; i++) b.update(dt);
    return b;
  };
  near(run(1 / 60, 10).durability, 50, 1e-6); // 대기 3초 + 10초 회복 = 50%
  near(run(1 / 30, 10).durability, 50, 1e-6);
  near(run(0.5, 10).durability, 50, 1e-6);
  near(run(1 / 60, 20).durability, 100, 1e-6);
  const big = make({ maxDurability: 400 });
  big.damage(400);
  big.update(BOUNDARY.recoveryDelay);
  big.update(1);
  near(big.durability, 20); // 최대 400의 5% = 20/초
});

test('피해 후 대기 시간: 대기 중에는 회복하지 않고, 새 피해가 오면 대기가 처음부터 다시 시작된다', () => {
  const b = make({ recoveryOn: true });
  b.damage(50);
  b.update(BOUNDARY.recoveryDelay - 0.01);
  assert.equal(b.durability, 50); // 아직 대기 중
  b.update(0.01 + 1); // 대기 끝 + 1초 회복
  near(b.durability, 55);
  b.damage(10); // 피해가 오면 다시 대기
  const after = b.durability;
  b.update(BOUNDARY.recoveryDelay - 0.5);
  assert.equal(b.durability, after);
  b.update(0.5 + 1);
  near(b.durability, after + 5);
});

test('한 프레임 안에서 대기가 끝나는 경우에는 끝난 뒤의 시간만 회복에 쓴다', () => {
  const b = make({ recoveryOn: true });
  b.damage(50);
  b.update(BOUNDARY.recoveryDelay + 2); // 한 번에 큰 dt
  near(b.durability, 60);
  const c = make({ recoveryOn: true });
  c.damage(50);
  c.update(0); // dt가 0/음수/비정상이면 아무 일도 없다
  c.update(-1);
  c.update(NaN);
  assert.equal(c.durability, 50);
  assert.equal(c.timeSinceDamage, 0);
});

test('버프 약화: 손실 10%마다 5%, 최대 50%, 가득 찼을 때는 0', () => {
  const w = (percent) => weakenPercent(percent, 100);
  assert.equal(w(100), 0); // 가득
  assert.equal(w(95), 0); // 손실 5%: 아직 한 단계 미만
  assert.equal(w(91), 0);
  assert.equal(w(90), 5); // 손실 10%
  assert.equal(w(85), 5);
  assert.equal(w(80), 10);
  assert.equal(w(50), 25);
  assert.equal(w(10), 45);
  assert.equal(w(5), 45);
  assert.equal(w(0), 50); // 0%: 상한 50%
  assert.equal(weakenPercent(-20, 100), 50); // 범위를 벗어난 값도 상한을 넘지 않는다
  assert.equal(weakenPercent(500, 100), 0);
  assert.equal(weakenPercent(50, 0), 0); // 비정상 최대값
  assert.equal(weakenPercent(NaN, 100), 0);
  assert.equal(weakenPercent(70, 70.0), 0);
  assert.equal(weakenPercent(63, 70), 5); // 최대 70에서 7 손실 = 정확히 10%
  assert.equal(weakenPercent(0.3 * 3, 1), 0 + weakenPercent(0.9, 1)); // 0.1 단위 부동소수점 경계
  assert.equal(weakenPercent(0.9, 1), 5);
});

test('경계 안/밖: 안에서만 버프를 받는다(경계선 위는 안)', () => {
  const b = make();
  assert.equal(effectiveBuffPercent(50, b, INSIDE), 50);
  assert.equal(effectiveBuffPercent(50, b, OUTSIDE), 0);
  assert.equal(effectiveBuffPercent(50, b, { x: 2000 + b.radius, y: 2000 }), 50); // 경계선 위
  assert.equal(attackMultiplier(b, INSIDE), 1.5);
  assert.equal(attackMultiplier(b, OUTSIDE), 1); // 밖: 변화 없음
  assert.equal(effectiveBuffPercent(50, b, null), 0);
});

test('내구도에 따른 약화가 공격력 버프에 적용된다(가득/일부/0)', () => {
  const b = make();
  assert.equal(attackMultiplier(b, INSIDE), 1.5); // 가득: +50%
  b.damage(40); // 손실 40% -> 20% 약화 -> +40%
  near(attackMultiplier(b, INSIDE), 1.4);
  b.damage(1000); // 0% -> 50% 약화 -> +25%
  near(attackMultiplier(b, INSIDE), 1.25);
  assert.equal(attackMultiplier(b, OUTSIDE), 1); // 밖은 약화 여부와 무관하게 0
});

test('인간형 적과 보스는 버프의 50%를 공유하고, 비인간형 적은 받지 않는다(경계 안에서만)', () => {
  const b = make();
  const human = { id: 1, x: 2100, y: 2000, human: true };
  const boss = { id: 2, x: 2000, y: 2100, isBoss: true };
  const ghost = { id: 3, x: 2050, y: 2050, kind: 'melee' };
  const outsideBoss = { id: 4, x: 2400, y: 2000, isBoss: true };
  assert.equal(sharesBoundaryBuff(human), true);
  assert.equal(sharesBoundaryBuff(boss), true);
  assert.equal(sharesBoundaryBuff(ghost), false);
  assert.equal(effectiveBuffPercent(50, b, human, 'enemy'), 25);
  assert.equal(effectiveBuffPercent(50, b, boss, 'enemy'), 25);
  assert.equal(effectiveBuffPercent(50, b, ghost, 'enemy'), 0);
  assert.equal(effectiveBuffPercent(50, b, outsideBoss, 'enemy'), 0); // 경계 밖 보스는 공유 없음
  assert.equal(attackMultiplier(b, boss, 'enemy'), 1.25);
  b.damage(1000); // 약화가 먼저 적용된 뒤 50%: 50 × 0.5 × 0.5
  near(effectiveBuffPercent(50, b, boss, 'enemy'), 12.5);
  assert.equal(effectiveBuffPercent(50, b, ghost, 'enemy'), 0);
});

test('반경 강화: 레벨 0~3은 300/330/360/390이고 중심은 고정이다', () => {
  const b = make();
  const radii = [];
  for (let i = 0; i <= 3; i++) {
    radii.push(b.radius);
    assert.deepEqual({ ...b.center }, CENTER);
    if (i < 3) assert.equal(applyBoundaryReward(listBoundaryRewards({ boundary: b })[0], { boundary: b }), true);
  }
  assert.deepEqual(radii, [300, 330, 360, 390]);
  assert.equal(b.radius, 390);
  assert.equal(b.radiusLevel, 3);
});

test('경계 강화 후보: 최대 레벨이면 후보에서 빠지고, 후보와 적용은 분리되어 있다', () => {
  const b = make();
  const [card] = listBoundaryRewards({ boundary: b });
  assert.equal(card.kind, 'boundaryRadius');
  assert.equal(card.category, '경계 강화');
  assert.equal(card.effect, 'Lv.0 → Lv.1 · 반경 300px → 330px');
  for (const field of ['title', 'effect', 'description']) assert.ok(card[field].length > 0);
  assert.equal(b.radiusLevel, 0); // 후보를 만든 것만으로는 바뀌지 않는다
  assert.equal(buildBoundaryCandidates({ boundary: b }).length, 1); // 가짜 카드 없이 있는 만큼만
  b.radiusLevel = 3;
  assert.deepEqual(listBoundaryRewards({ boundary: b }), []);
  assert.equal(applyBoundaryReward(card, { boundary: b }), false); // 최대 레벨에서는 적용되지 않는다
  assert.equal(b.radiusLevel, 3);
  assert.equal(applyBoundaryReward(null, { boundary: b }), false);
  assert.equal(applyBoundaryReward({ kind: 'unknown' }, { boundary: b }), false);
});

test('무기 피해 배율: 발동하는 공격에만 적용되고, 기본값 1이면 기존과 같다', () => {
  const enemy = (id) => ({ id, x: 100, y: 0, hp: 10, maxHp: 10, dead: false });
  const fire = (scale) => {
    const system = createWeaponSystem();
    system.update(0.01, { x: 0, y: 0 }, [enemy(1)], scale);
    return system.projectiles[0].damage;
  };
  const base = WEAPONS.shard.damage;
  assert.equal(fire(undefined), base);
  assert.equal(fire(1), base);
  assert.equal(fire(1.5), base * 1.5);
  assert.equal(fire(NaN), base); // 비정상 값은 무시
  assert.equal(fire(-2), base);
});

test('보스 표시 크기는 일반 적의 110%다', () => {
  assert.equal(BOSS.sizeScale, 1.1);
});
