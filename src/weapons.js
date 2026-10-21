// 무기 시스템: 공통 무기 데이터, 자동 조준, 원거리 투사체, 근접(범위) 공격. 화면(DOM)에 의존하지 않는다.
// 무기 정의(WEAPONS)는 config.js에 있고, 이 모듈은 슬롯/레벨 규칙과 공격 실행만 맡는다.
// 시간이 흐르는 곳은 update(dt)뿐이므로, 게임이 정지 중일 때 update를 부르지 않으면 쿨다운과 투사체도 멈춘다.
// 적은 enemy.js의 damageEnemy로만 다친다. 죽은 적을 목록에서 빼는 일은 게임 쪽이 한다(removeDeadEnemies).

import { WEAPONS, WEAPON_RULES, STARTING_WEAPONS, WORLD, ENEMY } from './config.js';
import { enemyRadius, damageEnemy, findNearestEnemy } from './enemy.js';

// 레벨을 1~maxLevel 정수로 제한한다. 숫자가 아니거나 NaN이면 1, Infinity는 최대, 소수는 버린다.
export function clampWeaponLevel(level, maxLevel = WEAPON_RULES.maxLevel) {
  if (typeof level !== 'number' || Number.isNaN(level)) return 1;
  return Math.min(Math.max(Math.trunc(level), 1), maxLevel);
}

// 선분(a -> b)과 점(p) 사이 거리의 제곱, 그리고 선분 위 가장 가까운 지점의 비율 t(0~1)
function segmentDistance(ax, ay, bx, by, px, py) {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((px - ax) * vx + (py - ay) * vy) / lenSq, 0), 1);
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  const dx = px - cx;
  const dy = py - cy;
  return { distSq: dx * dx + dy * dy, t };
}

export function createWeaponSystem({
  defs = WEAPONS,
  rules = WEAPON_RULES,
  startingWeapons = STARTING_WEAPONS,
  world = WORLD,
  enemyConfig = ENEMY,
} = {}) {
  const hitRadius = enemyRadius(enemyConfig); // 적 충돌 반지름(표시 크기와 별개)
  let slots = []; // 보유 무기: { id, level, cooldown }
  let projectiles = []; // 날아가는 투사체: { x, y, dx, dy, speed, radius, damage, traveled, maxDistance, weaponId }
  let effects = []; // 근접 공격 표시 효과: { weaponId, radius, age, duration }

  const find = (id) => slots.find((w) => w.id === id) ?? null;

  function equip(id) {
    if (!Object.hasOwn(defs, id)) return false; // 모르는 무기
    if (find(id)) return false; // 종류마다 하나만 보유
    if (slots.length >= rules.maxSlots) return false; // 슬롯이 가득 참
    slots.push({ id, level: 1, cooldown: 0 });
    return true;
  }

  function fireProjectile(def, id, player, target) {
    let dx = target.x - player.x;
    let dy = target.y - player.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    } else {
      dx = 1; // 완전히 겹쳐 있으면 오른쪽으로(방향이 정해지지 않는 경우 대비)
      dy = 0;
    }
    projectiles.push({
      x: player.x,
      y: player.y,
      dx,
      dy,
      speed: def.projectileSpeed,
      radius: def.projectileRadius,
      damage: def.damage,
      traveled: 0,
      maxDistance: def.projectileMaxDistance,
      weaponId: id,
    });
  }

  // 범위 안의 살아 있는 모든 적을 한 번씩 때린다(적마다 피해는 한 번).
  function strikeArea(def, id, player, enemies) {
    const rangeSq = def.range * def.range;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy <= rangeSq) damageEnemy(e, def.damage);
    }
    effects.push({ weaponId: id, radius: def.range, age: 0, duration: def.flashDuration });
  }

  // 한 투사체를 dt만큼 움직이고 적에 맞았는지 본다. 이번 이동 선분과 겹치는 적 중 가장 먼저 닿는 적 하나만 맞힌다.
  // 맞았거나 월드 밖으로 나갔거나 최대 거리를 넘었으면 false(제거).
  function stepProjectile(p, dt, enemies) {
    const step = Math.min(p.speed * dt, Math.max(p.maxDistance - p.traveled, 0));
    const nx = p.x + p.dx * step;
    const ny = p.y + p.dy * step;
    const reach = p.radius + hitRadius;
    let hit = null;
    let hitT = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const { distSq, t } = segmentDistance(p.x, p.y, nx, ny, e.x, e.y);
      if (distSq <= reach * reach && (t < hitT || (t === hitT && e.id < hit.id))) {
        hit = e;
        hitT = t;
      }
    }
    if (hit) {
      damageEnemy(hit, p.damage);
      return false;
    }
    p.x = nx;
    p.y = ny;
    p.traveled += step;
    if (p.x < 0 || p.x > world.width || p.y < 0 || p.y > world.height) return false;
    return p.traveled < p.maxDistance;
  }

  const system = {
    get slots() {
      return slots;
    },
    get projectiles() {
      return projectiles;
    },
    get effects() {
      return effects;
    },
    // 무기를 얻는다. 성공하면 true. 이미 있거나 슬롯이 가득 찼거나 모르는 무기면 false.
    equip,
    has: (id) => find(id) !== null,
    // 레벨을 정한다(획득/강화 UI는 이후 단계). 1~maxLevel로 제한되며, 없는 무기면 false.
    setLevel(id, level) {
      const weapon = find(id);
      if (!weapon) return false;
      weapon.level = clampWeaponLevel(level, rules.maxLevel);
      return true;
    },
    // dt초 동안 진행한다. player: {x, y}, enemies: 적 목록(살아 있는 적만 대상이 된다).
    // 쿨다운이 끝난 무기는 사거리 안에 적이 있을 때 자동으로 발동한다. 대상이 없으면 쿨다운은 0에서 기다린다.
    update(dt, player, enemies) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      for (const w of slots) {
        w.cooldown = Math.max(0, w.cooldown - step);
        if (w.cooldown > 0) continue;
        const def = defs[w.id];
        const target = findNearestEnemy(enemies, player, def.range);
        if (!target) continue;
        if (def.type === 'projectile') fireProjectile(def, w.id, player, target);
        else strikeArea(def, w.id, player, enemies);
        w.cooldown = def.cooldown;
      }
      projectiles = projectiles.filter((p) => stepProjectile(p, step, enemies));
      for (const f of effects) f.age += step;
      effects = effects.filter((f) => f.age < f.duration);
    },
    // 새 런: 투사체와 효과를 지우고, 무기를 시작 구성으로 되돌린다(레벨 1, 쿨다운 0).
    reset() {
      projectiles = [];
      effects = [];
      slots = [];
      for (const id of startingWeapons) equip(id);
    },
  };
  system.reset(); // 시작 무기를 장착한다.
  return system;
}
