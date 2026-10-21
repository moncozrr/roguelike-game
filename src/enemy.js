// 일반 적의 데이터와 행동(플레이어 추적, 적끼리 밀어내기). 화면(DOM)에 의존하지 않고 모두 월드 좌표로 다룬다.
// 플레이어와 적은 서로 통과한다. 적은 HP를 갖고, 피해로 HP가 0 이하가 되면 죽은 것으로 표시되어 목록에서 제거된다(보상 없음).

import { ENEMY, WORLD } from './config.js';

// 충돌(밀어내기) 반지름. 표시 크기와는 별개의 값이다.
export function enemyRadius(config = ENEMY) {
  return config.displaySize * config.collisionRadiusRatio;
}

// 플레이어 쪽의 수평 방향. 수평 거리가 deadZone보다 작으면 이전 방향을 유지해서 깜빡임을 막는다.
export function facingToward(previous, dx, deadZone = ENEMY.facingDeadZone) {
  if (Math.abs(dx) < deadZone) return previous;
  return dx > 0 ? 'right' : 'left';
}

// 적을 만든다. 최초 방향은 플레이어 쪽이다(수평 거리가 거의 0이면 'right').
export function createEnemy(id, x, y, player, config = ENEMY) {
  return { id, x, y, facing: facingToward('right', player.x - x, config.facingDeadZone), hp: config.maxHp, maxHp: config.maxHp, dead: false };
}

// 적에게 피해를 한 번 준다. 이미 죽은 적이거나 피해가 0 이하/유한하지 않으면 아무것도 바꾸지 않고 null을 돌려준다.
// 적용되면 { killed }를 돌려준다. HP가 0 이하가 되면 HP를 0으로 두고 dead를 켠다(죽음 처리는 한 번만 일어난다).
export function damageEnemy(enemy, amount) {
  if (enemy.dead || !Number.isFinite(amount) || amount <= 0) return null;
  enemy.hp = Math.max(0, enemy.hp - amount);
  if (enemy.hp > 0) return { killed: false };
  enemy.dead = true;
  return { killed: true };
}

// 죽은 적을 목록에서 제자리에서 제거하고 제거한 수를 돌려준다. 살아 있는 적의 순서는 유지된다.
export function removeDeadEnemies(enemies) {
  let kept = 0;
  for (let i = 0; i < enemies.length; i++) {
    if (!enemies[i].dead) enemies[kept++] = enemies[i];
  }
  const removed = enemies.length - kept;
  enemies.length = kept;
  return removed;
}

// origin에서 range(적 중심까지의 거리) 이내에 있는 살아 있는 적 중 가장 가까운 적. 없으면 null.
// 거리가 같으면 번호(id)가 작은 적을 골라서 목록 순서가 바뀌어도 결과가 같다(안정적인 대상 선택).
export function findNearestEnemy(enemies, origin, range) {
  const rangeSq = range * range;
  let best = null;
  let bestSq = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - origin.x;
    const dy = e.y - origin.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq) continue;
    if (distSq < bestSq || (distSq === bestSq && e.id < best.id)) {
      best = e;
      bestSq = distSq;
    }
  }
  return best;
}

// 월드 안쪽(충돌 반지름만큼 안쪽)으로 이동 가능한 범위
export function enemyBounds(world = WORLD, radius = enemyRadius()) {
  return { minX: radius, maxX: world.width - radius, minY: radius, maxY: world.height - radius };
}

function clampToBounds(enemy, bounds) {
  enemy.x = Math.min(Math.max(enemy.x, bounds.minX), bounds.maxX);
  enemy.y = Math.min(Math.max(enemy.y, bounds.minY), bounds.maxY);
}

// 공간 격자(칸 크기 = 지름)에 적을 나눠 담는다. 서로 겹칠 수 있는 적은 같은 칸이나 이웃한 칸에만 있으므로
// 모든 쌍을 비교하지 않아도 된다. cells: Map(칸 번호 -> 적 인덱스 배열)
const CELL_OFFSET = 4096; // 음수 좌표에서도 칸 번호가 겹치지 않게 하는 보정값
function cellKey(cx, cy) {
  return (cx + CELL_OFFSET) * 65536 + (cy + CELL_OFFSET);
}
function buildGrid(enemies, cellSize) {
  const cells = new Map();
  for (let i = 0; i < enemies.length; i++) {
    const key = cellKey(Math.floor(enemies[i].x / cellSize), Math.floor(enemies[i].y / cellSize));
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
  }
  return cells;
}

// 서로 겹친(중심 거리 < 지름) 모든 쌍을 한 번씩 callback(i, j, dx, dy, dist)으로 알려 준다. (i < j, d = j - i 방향)
export function forEachOverlappingPair(enemies, radius, callback) {
  const diameter = radius * 2;
  const diameterSq = diameter * diameter;
  const cells = buildGrid(enemies, diameter);
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    const cx = Math.floor(a.x / diameter);
    const cy = Math.floor(a.y / diameter);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const list = cells.get(cellKey(cx + ox, cy + oy));
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue; // 각 쌍을 한 번만 처리
          const dx = enemies[j].x - a.x;
          const dy = enemies[j].y - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < diameterSq) callback(i, j, dx, dy, Math.sqrt(distSq));
        }
      }
    }
  }
}

// 적끼리 겹침을 줄이도록 서로 밀어낸다.
// 한 번에 겹침의 일부(strength)만 풀고 여러 번 반복해서 떨림을 줄인다. 한 번에 밀리는 거리는 반지름을 넘지 않는다.
export function separateEnemies(allEnemies, { radius = enemyRadius(), iterations = ENEMY.separationIterations, strength = ENEMY.separationStrength, bounds = enemyBounds(WORLD, radius) } = {}) {
  // 죽은 적은 밀어내기에서 제외한다(보통은 이미 목록에서 제거되어 있다).
  const enemies = allEnemies.some((e) => e.dead) ? allEnemies.filter((e) => !e.dead) : allEnemies;
  const n = enemies.length;
  if (n === 0) return;
  const diameter = radius * 2;
  const pushX = new Float64Array(n);
  const pushY = new Float64Array(n);
  for (let iter = 0; iter < iterations && n > 1; iter++) {
    pushX.fill(0);
    pushY.fill(0);
    forEachOverlappingPair(enemies, radius, (i, j, dx, dy, dist) => {
      let nx;
      let ny;
      if (dist < 1e-9) {
        // 완전히 같은 자리: 두 적의 번호로 정한 일정한 방향으로 밀어 서로 다른 쪽으로 갈라지게 한다.
        const angle = enemies[i].id * 12.9898 + enemies[j].id * 78.233;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }
      const amount = (diameter - dist) * 0.5 * strength;
      pushX[i] -= nx * amount;
      pushY[i] -= ny * amount;
      pushX[j] += nx * amount;
      pushY[j] += ny * amount;
    });
    for (let i = 0; i < n; i++) {
      let px = pushX[i];
      let py = pushY[i];
      const len = Math.hypot(px, py);
      if (len > radius) {
        px = (px / len) * radius;
        py = (py / len) * radius;
      }
      enemies[i].x += px;
      enemies[i].y += py;
      clampToBounds(enemies[i], bounds);
    }
  }
  for (const e of enemies) clampToBounds(e, bounds);
}

// 모든 적을 dt초만큼 갱신한다: 플레이어를 향해 이동 -> 적끼리 밀어내기 -> 월드 안으로 제한.
// 플레이어(player)는 읽기만 한다. 적은 플레이어를 통과하고, 플레이어도 적에게 밀리지 않는다.
export function updateEnemies(enemies, dt, player, { config = ENEMY, world = WORLD } = {}) {
  const radius = enemyRadius(config);
  const bounds = enemyBounds(world, radius);
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      // 남은 거리보다 멀리 가지 않게 해서 플레이어 위치를 지나쳐 앞뒤로 떨지 않게 한다.
      const step = Math.min(config.speed * dt, dist);
      e.x += (dx / dist) * step;
      e.y += (dy / dist) * step;
    }
    e.facing = facingToward(e.facing, dx, config.facingDeadZone);
    clampToBounds(e, bounds);
  }
  separateEnemies(enemies, { radius, iterations: config.separationIterations, strength: config.separationStrength, bounds });
}
