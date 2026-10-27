// 보스 만들기와 출현 위치. 화면(DOM)에 의존하지 않는다.
// 보스는 일반 적과 같은 적 목록/이동/피해/제거 규칙을 그대로 쓰고, isBoss 표시와 따로 정한 HP/속도만 다르다.

import { BOSS, ENEMY, WORLD } from './config.js';
import { createEnemy, enemyBounds } from './enemy.js';
import { computeCamera, viewRect } from './camera.js';

export const MINI_BOSS_KIND = 'miniBoss';
export const SECOND_BOSS_KIND = 'secondBoss';
export const FINAL_BOSS_KIND = 'finalBoss';

export function isMiniBoss(enemy) {
  return enemy?.kind === MINI_BOSS_KIND;
}

export function isSecondBoss(enemy) {
  return enemy?.kind === SECOND_BOSS_KIND;
}

export function isFinalBoss(enemy) {
  return enemy?.kind === FINAL_BOSS_KIND;
}

// 보스/정예 같은 특수 적의 출현 위치: 플레이어에게서 distance(px) 떨어진, 실제로 화면에 보이지 않는 월드 안쪽 점.
// 무작위 방향(rng 한 번)에서 시작해, 월드 가장자리에 잘리거나 화면 안에 들어오는 방향이면 16방향을 돌려 가며 알맞은 방향을 찾는다(추가 난수 없음).
// 화면이 아주 크거나 월드가 아주 작아서 어느 방향도 만족하지 못하면 화면 밖인 후보 중 가장 먼 것(없으면 가장 먼 것)을 쓴다.
// 화면이 커서 800px이 화면 안에 들어가는 경우를 위해, 거리는 화면 대각선의 절반에 여유를 더한 값보다 작아지지 않는다.
const SPAWN_DIRECTION_TRIES = 16;
const SCREEN_MARGIN = 20;
export function bossSpawnPosition(player, view, rng = Math.random, { world = WORLD, distance = BOSS.spawnDistance } = {}) {
  const ring = Math.max(distance, Math.hypot(view.width, view.height) / 2 + SCREEN_MARGIN);
  const startAngle = rng() * Math.PI * 2;
  const bounds = enemyBounds(world);
  // 실제 화면 영역(카메라가 월드 가장자리에서 멈춘 경우 포함)을 보스 그림 반만큼 넓힌 것. 이 밖이면 출현하는 순간 보이지 않는다.
  const rect = viewRect(computeCamera(player, view, world), view);
  const pad = (ENEMY.displaySize * BOSS.sizeScale) / 2;
  const isOutside = (p) => p.x < rect.left - pad || p.x > rect.right + pad || p.y < rect.top - pad || p.y > rect.bottom + pad;

  let best = null;
  let bestOutside = false;
  let bestAway = -1;
  for (let i = 0; i < SPAWN_DIRECTION_TRIES; i++) {
    const angle = startAngle + (i * Math.PI * 2) / SPAWN_DIRECTION_TRIES;
    const p = {
      x: Math.min(Math.max(player.x + Math.cos(angle) * ring, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(player.y + Math.sin(angle) * ring, bounds.minY), bounds.maxY),
    };
    const away = Math.hypot(p.x - player.x, p.y - player.y);
    const outside = isOutside(p);
    if (outside && away >= ring - 1e-6) return p; // 월드에 잘리지 않고 화면 밖
    if (outside > bestOutside || (outside === bestOutside && away > bestAway)) {
      best = p;
      bestOutside = outside;
      bestAway = away;
    }
  }
  return best;
}

function createBoss(kind, id, x, y, player, stats) {
  const boss = createEnemy(id, x, y, player, { ...ENEMY, maxHp: stats.maxHp }, kind);
  boss.isBoss = true; // 경계 버프 공유(인간형 보스 규칙)와 표시 크기(BOSS.sizeScale)가 이 표시를 본다.
  boss.speed = stats.speed;
  return boss;
}

export function createMiniBoss(id, x, y, player, stats = BOSS.miniBoss) {
  return createBoss(MINI_BOSS_KIND, id, x, y, player, stats);
}

export function createSecondBoss(id, x, y, player, stats = BOSS.secondBoss) {
  return createBoss(SECOND_BOSS_KIND, id, x, y, player, stats);
}

export function createFinalBoss(id, x, y, player, stats = BOSS.finalBoss) {
  return createBoss(FINAL_BOSS_KIND, id, x, y, player, stats);
}
