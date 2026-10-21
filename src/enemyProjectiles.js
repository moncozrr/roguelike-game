// 원거리 적의 발사와 적 투사체. 화면(DOM)에 의존하지 않는 순수 로직이다.
// 투사체는 발사 순간의 플레이어 위치로 방향을 한 번 정하고 직선으로만 날아간다(유도/관통/지속 피해 없음).
// 시간이 흐르는 곳은 update(dt)뿐이므로, 게임이 정지 중일 때 update를 부르지 않으면 쿨다운과 투사체도 멈춘다.
// 피해는 호출한 쪽이 넘겨 주는 onHit(damage)로 처리한다(보호/대시 무적 규칙은 combat.js가 맡는다).

import { ENEMY_PROJECTILE, WORLD } from './config.js';

// 선분(a -> b)과 점(p) 사이 거리의 제곱
function segmentDistSq(ax, ay, bx, by, px, py) {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((px - ax) * vx + (py - ay) * vy) / lenSq, 0), 1);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return dx * dx + dy * dy;
}

export function createEnemyProjectileSystem({ config = ENEMY_PROJECTILE, world = WORLD } = {}) {
  let projectiles = []; // { x, y, dx, dy, traveled }

  function fire(enemy, player) {
    let dx = player.x - enemy.x;
    let dy = player.y - enemy.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    } else {
      dx = 1; // 완전히 겹쳐 있으면 오른쪽으로
      dy = 0;
    }
    projectiles.push({ x: enemy.x, y: enemy.y, dx, dy, traveled: 0 });
  }

  // 한 투사체를 dt만큼 움직이고, 이번 이동 선분이 플레이어 원과 겹치면 명중. 명중/월드 밖/최대 거리 초과면 false(제거).
  function step(p, dt, player, playerRadius, onHit) {
    const dist = Math.min(config.speed * dt, Math.max(config.maxDistance - p.traveled, 0));
    const nx = p.x + p.dx * dist;
    const ny = p.y + p.dy * dist;
    const reach = config.radius + playerRadius;
    if (segmentDistSq(p.x, p.y, nx, ny, player.x, player.y) <= reach * reach) {
      onHit(config.damage); // 피해 여부와 상관없이 투사체는 사라진다. 한 투사체는 한 번만 명중한다.
      return false;
    }
    p.x = nx;
    p.y = ny;
    p.traveled += dist;
    if (p.x < 0 || p.x > world.width || p.y < 0 || p.y > world.height) return false;
    return p.traveled < config.maxDistance;
  }

  return {
    get projectiles() {
      return projectiles;
    },
    // dt초 진행: 살아 있는 원거리 적의 쿨다운을 줄이고, 쿨다운이 끝났고 플레이어가 사거리 안이면 발사한다.
    // 그다음 투사체를 이동/명중 처리한다. 명중 횟수를 돌려준다.
    update(dt, { player, playerRadius, enemies, onHit }) {
      const time = Number.isFinite(dt) && dt > 0 ? dt : 0;
      const rangeSq = config.range * config.range;
      for (const e of enemies) {
        if (e.dead || e.kind !== 'ranged') continue; // 죽은 적은 쏘지 못한다
        e.shotCooldown = Math.max(0, e.shotCooldown - time);
        if (e.shotCooldown > 0) continue;
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        if (dx * dx + dy * dy > rangeSq) continue; // 사거리 밖이면 쿨다운 0에서 기다린다
        fire(e, player);
        e.shotCooldown = config.cooldown;
      }
      let hits = 0;
      projectiles = projectiles.filter((p) => {
        const alive = step(p, time, player, playerRadius, (damage) => {
          hits++;
          onHit(damage);
        });
        return alive;
      });
      return hits;
    },
    // 새 런: 투사체를 모두 지운다(쿨다운은 적 객체에 있고 적 목록과 함께 지워진다).
    reset() {
      projectiles = [];
    },
  };
}
