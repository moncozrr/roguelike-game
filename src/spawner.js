// 일반 적 생성: 시간에 따른 밀도, 생성 간격, 그룹 크기, 화면 바깥 위치 선택. 화면(DOM)에 의존하지 않는다.
// 난수는 주입할 수 있어서 테스트를 재현할 수 있다. 이 모듈은 "어디에 몇 마리를 만들지"만 돌려주고,
// 실제 적 객체는 게임 쪽에서 만든다. 게임이 멈춰 있으면(update를 부르지 않으면) 타이머도 멈춘다.

import { SPAWN, ENEMY, WORLD } from './config.js';
import { screenToWorld, viewRect } from './camera.js';
import { enemyRadius } from './enemy.js';

// 밀도(%): 기본값 100에서 시작해 densityStepSeconds(1분)가 지날 때마다 densityStepPercent(+20%p)를 더한다(계단식, 가산).
// stopAtTime(5:00) 이상이면 0 = 신규 생성 중단.
export function densityPercent(gameTime, config = SPAWN) {
  if (gameTime >= config.stopAtTime) return 0;
  const steps = Math.floor(Math.max(gameTime, 0) / config.densityStepSeconds);
  return 100 + steps * config.densityStepPercent;
}

// 생성 간격(초) = 기본 간격 ÷ 밀도 배수
export function spawnInterval(percent, config = SPAWN) {
  return (config.baseInterval * 100) / percent;
}

// 화면 바깥 위치 후보를 한 번 뽑는다: 화면 사각형을 사방으로 margin만큼 넓힌 사각형의 둘레 위 한 점(화면 좌표).
// 둘레 길이에 비례해 고르므로 긴 변에 더 많이 나온다.
function pickPerimeterPoint(view, margin, rng) {
  const w = view.width + margin * 2;
  const h = view.height + margin * 2;
  let u = rng() * 2 * (w + h);
  if (u < w) return { x: -margin + u, y: -margin }; // 위
  u -= w;
  if (u < h) return { x: view.width + margin, y: -margin + u }; // 오른쪽
  u -= h;
  if (u < w) return { x: view.width + margin - u, y: view.height + margin }; // 아래
  u -= w;
  return { x: -margin, y: view.height + margin - u }; // 왼쪽
}

export function createSpawner({ rng = Math.random, config = SPAWN, enemyConfig = ENEMY, world = WORLD } = {}) {
  const radius = enemyRadius(enemyConfig);
  const spread = radius * 2; // 한 그룹이 퍼지는 범위(충돌 반지름의 2배)
  const MAX_ANCHOR_TRIES = 30;
  const MAX_MEMBER_TRIES = 10;
  const MAX_GROUPS_PER_UPDATE = 8; // dt가 비정상적으로 커도 한 번에 무한정 만들지 않게 하는 안전장치

  let timer = 0; // 마지막 생성 이후 지난 시간(초)
  let carry = 0; // 그룹 크기의 소수 부분 이월값(1/100 마리 단위의 정수라서 오차가 쌓이지 않음)

  const insideWorld = (p) => p.x >= radius && p.x <= world.width - radius && p.y >= radius && p.y <= world.height - radius;
  const outsideView = (p, rect) => p.x < rect.left || p.x > rect.right || p.y < rect.top || p.y > rect.bottom;

  // 화면 바깥이면서 월드 안쪽인 기준점 하나. 카메라 변환(screenToWorld)으로 월드 좌표로 바꾼다. 없으면 null.
  function pickAnchor(cam, view, rect) {
    for (let i = 0; i < MAX_ANCHOR_TRIES; i++) {
      const p = screenToWorld(pickPerimeterPoint(view, config.margin, rng), cam);
      if (insideWorld(p) && outsideView(p, rect)) return p;
    }
    return null;
  }

  // 기준점 주변에 n마리의 위치를 정한다. 각 위치는 월드 안이고 화면 바깥이어야 하며, 조건을 못 맞추면 기준점을 쓴다.
  function spawnGroup(n, cam, view) {
    const rect = viewRect(cam, view);
    const anchor = pickAnchor(cam, view, rect);
    if (!anchor) return [];
    const positions = [];
    for (let i = 0; i < n; i++) {
      let chosen = anchor;
      for (let t = 0; t < MAX_MEMBER_TRIES; t++) {
        const angle = rng() * Math.PI * 2;
        const dist = Math.sqrt(rng()) * spread;
        const p = { x: anchor.x + Math.cos(angle) * dist, y: anchor.y + Math.sin(angle) * dist };
        if (insideWorld(p) && outsideView(p, rect)) {
          chosen = p;
          break;
        }
      }
      positions.push({ x: chosen.x, y: chosen.y, kind: rng() < config.rangedChance ? 'ranged' : 'melee' });
    }
    return positions;
  }

  return {
    // dt: 이번 프레임 시간(초). 상태: { gameTime, enemyCount, cam, view }
    //   gameTime: 게임 시간(초), enemyCount: 지금 살아 있는 적 수, cam: 카메라 위치, view: 화면 크기 {width, height}
    // 이번에 새로 만들 적의 월드 좌표 목록 [{x, y}]을 돌려준다.
    update(dt, { gameTime, enemyCount, cam, view }) {
      const percent = densityPercent(gameTime, config);
      if (percent === 0) return []; // 5:00 이후: 신규 생성 중단(타이머도 진행하지 않음)
      timer += dt;
      const interval = spawnInterval(percent, config);
      const created = [];
      for (let g = 0; g < MAX_GROUPS_PER_UPDATE && timer >= interval; g++) {
        timer -= interval;
        const room = config.maxEnemies - (enemyCount + created.length);
        if (room <= 0) continue; // 상한에 도달: 이번 그룹은 만들지 않는다(이월값도 그대로)
        carry += config.baseGroupSize * percent; // 평균 그룹 크기 = 기본 크기 × 배수(1/100 단위)
        const size = Math.floor(carry / 100);
        carry -= size * 100;
        created.push(...spawnGroup(Math.min(size, room), cam, view));
      }
      return created;
    },
    // 새 런을 시작할 때 타이머와 이월값을 지운다.
    reset() {
      timer = 0;
      carry = 0;
    },
    get timer() {
      return timer;
    },
    get carry() {
      return carry;
    },
  };
}
