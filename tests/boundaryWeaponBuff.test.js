// 경계 안 무기 보너스: 원거리 투사체 수 2배, 근접(범위) 공격 범위 2배. 경계 밖은 기존과 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeaponSystem } from '../src/weapons.js';
import { WEAPONS, BOUNDARY } from '../src/config.js';

const enemyAt = (id, x) => ({ id, x: 500 + x, y: 500, hp: 100, maxHp: 100, dead: false });

test('원거리: 경계 안이면 투사체가 2개 나가고, 밖이면 1개다', () => {
  const run = (inside) => {
    const system = createWeaponSystem();
    system.update(0.01, { x: 500, y: 500 }, [enemyAt(1, 100)], 1, inside);
    return system.projectiles;
  };
  assert.equal(run(false).length, 1);
  const two = run(true);
  assert.equal(two.length, BOUNDARY.projectileCountMultiplier);
  assert.notEqual(two[0].dy, two[1].dy); // 같은 자리에 겹쳐 날아가지 않는다
});

test('근접: 경계 안이면 범위가 2배라 두 배 먼 적도 맞고, 밖이면 맞지 않는다', () => {
  const far = WEAPONS.pulse.range * 1.5;
  const run = (inside) => {
    const system = createWeaponSystem({ startingWeapons: ['pulse'] });
    const e = enemyAt(1, far);
    system.update(0.01, { x: 500, y: 500 }, [e], 1, inside);
    return { hp: e.hp, radius: system.effects[0]?.radius };
  };
  assert.equal(run(false).hp, 100);
  const inside = run(true);
  assert.ok(inside.hp < 100);
  assert.equal(inside.radius, WEAPONS.pulse.range * BOUNDARY.meleeRangeMultiplier);
});
