// 보스 만들기와 출현 위치. 화면(DOM)에 의존하지 않는다.
// 보스는 일반 적과 같은 적 목록/이동/피해/제거 규칙을 그대로 쓰고, isBoss 표시와 따로 정한 HP/속도만 다르다.

import { BOSS, ENEMY, WORLD } from './config.js';
import { createEnemy, enemyBounds } from './enemy.js';

export const MINI_BOSS_KIND = 'miniBoss';
export const FINAL_BOSS_KIND = 'finalBoss';

export function isMiniBoss(enemy) {
  return enemy?.kind === MINI_BOSS_KIND;
}

export function isFinalBoss(enemy) {
  return enemy?.kind === FINAL_BOSS_KIND;
}

// 화면 밖(보이는 영역의 바깥 고리)에서 무작위 방향으로 고른 위치. 월드 안쪽으로 제한한다.
export function miniBossSpawnPosition(player, view, rng = Math.random, { world = WORLD, margin = BOSS.miniBoss.spawnMargin } = {}) {
  const distance = Math.hypot(view.width, view.height) / 2 + margin;
  const angle = rng() * Math.PI * 2;
  const bounds = enemyBounds(world);
  return {
    x: Math.min(Math.max(player.x + Math.cos(angle) * distance, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(player.y + Math.sin(angle) * distance, bounds.minY), bounds.maxY),
  };
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

export function createFinalBoss(id, x, y, player, stats = BOSS.finalBoss) {
  return createBoss(FINAL_BOSS_KIND, id, x, y, player, stats);
}
