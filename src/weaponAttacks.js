// 신규 무기(Chain Lightning, Boomerang Blade)의 공격 로직. 화면(DOM)에 의존하지 않는 순수 함수 모음이다.
// 무기 슬롯/레벨/쿨다운 관리는 weapons.js가 맡고, 이 모듈은 "한 번의 공격이 어떻게 동작하는지"만 맡는다.
// 적에게 피해를 줄 때는 enemy.js의 damageEnemy만 쓰고, 죽은 적은 대상에서 제외된다.

import { damageEnemy, findNearestEnemy } from './enemy.js';

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

// 연쇄 번개 한 번: 사거리 안의 가장 가까운 적에서 시작해, 직전 적에서 chainDistance 이내의 가장 가까운
// "아직 맞지 않은" 적으로 최대 chainCount마리까지 이어진다. 다음 적이 없으면 거기서 끝난다.
// 맞힌 적마다 damage를 한 번 준다. 대상이 없으면 null, 있으면 번개 경로의 점들([플레이어, 적1, 적2, ...])을 돌려준다.
export function strikeChain(def, damage, player, enemies) {
  const first = findNearestEnemy(enemies, player, def.range);
  if (!first) return null;
  const chain = [first];
  const used = new Set(chain);
  let current = first;
  while (chain.length < def.chainCount) {
    const next = findNearestEnemy(
      enemies.filter((e) => !used.has(e)),
      current,
      def.chainDistance,
    );
    if (!next) break;
    chain.push(next);
    used.add(next);
    current = next;
  }
  for (const e of chain) damageEnemy(e, damage);
  return [{ x: player.x, y: player.y }, ...chain.map((e) => ({ x: e.x, y: e.y }))];
}

// 부메랑 한 개를 만든다. 타깃 쪽으로 날아가는 'out' 단계로 시작하고, damage는 발사 시점의 값으로 고정된다.
// hit: 이번 왕복에서 이미 맞힌 적(같은 적은 한 번만 맞는다).
export function createBoomerang(def, damage, player, target) {
  return {
    def,
    x: player.x,
    y: player.y,
    phase: 'out',
    target,
    aimX: target.x,
    aimY: target.y,
    traveled: 0,
    age: 0,
    angle: 0,
    damage,
    hit: new Set(),
  };
}

// 부메랑을 dt만큼 움직이고 지나온 선분에 걸린 적을 때린다. 계속 살아 있어야 하면 true, 제거해야 하면 false.
// - 나가는 단계: 타깃이 살아 있으면 타깃의 현재 위치를, 죽었으면 마지막으로 알던 위치를 향한다. 그 위치에 닿거나
//   maxDistance만큼 날아가면 귀환 단계로 바뀐다.
// - 돌아오는 단계: 매 프레임 플레이어의 현재 위치를 향한다. catchRadius 안에 들어오면 제거된다.
// - 두 단계 모두 이동한 선분 전체로 충돌을 검사하므로 느린 프레임에서도 적을 지나치지 않는다.
export function stepBoomerang(b, dt, player, enemies, enemyHitRadius) {
  const def = b.def;
  const time = Number.isFinite(dt) && dt > 0 ? dt : 0;
  b.age += time;
  if (b.age > def.maxLifetime) return false; // 안전장치: 어떤 경우에도 영원히 남지 않는다.
  b.angle += time * 12; // 표시용 회전
  const reach = def.projectileRadius + enemyHitRadius;
  const startX = b.x;
  const startY = b.y;
  let finished = false;

  if (b.phase === 'out') {
    if (b.target && !b.target.dead) {
      b.aimX = b.target.x;
      b.aimY = b.target.y;
    }
    const dx = b.aimX - b.x;
    const dy = b.aimY - b.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.min(def.projectileSpeed * time, dist, Math.max(def.maxDistance - b.traveled, 0));
    if (dist > 0) {
      b.x += (dx / dist) * step;
      b.y += (dy / dist) * step;
    }
    b.traveled += step;
    if (step >= dist || b.traveled >= def.maxDistance) b.phase = 'return';
  } else {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.min(def.projectileSpeed * time, dist);
    if (dist > 0) {
      b.x += (dx / dist) * step;
      b.y += (dy / dist) * step;
    }
    if (Math.hypot(player.x - b.x, player.y - b.y) <= def.catchRadius) finished = true;
  }

  for (const e of enemies) {
    if (e.dead || b.hit.has(e)) continue;
    if (segmentDistSq(startX, startY, b.x, b.y, e.x, e.y) <= reach * reach) {
      b.hit.add(e);
      damageEnemy(e, b.damage);
    }
  }
  return !finished;
}
