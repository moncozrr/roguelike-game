// 플레이어 이동과 게임 상태/시간을 담당하는 최소한의 게임 루프.
// 좌표는 CSS 픽셀 단위로 다루고, 그리기 직전에만 devicePixelRatio를 적용한다.

import { loadSprite, WALK_FPS } from './sprite.js';
import { GAME_TITLE, PLAYER, DASH, WORLD, SPAWN, ENEMY, ENEMY_PROJECTILE, XP, MAX_FRAME_TIME, NOTICE_DURATION, TIMELINE, BOUNDARY, BOSS } from './config.js';
import { createGameState, STATES } from './gameState.js';
import { createTimeline } from './timeline.js';
import { computeCamera, viewRect } from './camera.js';
import { createBoundary } from './boundary.js';
import { attackMultiplier } from './boundaryBuffs.js';
import { createEnemy, updateEnemies, enemyRadius, removeDeadEnemies } from './enemy.js';
import { createWeaponSystem } from './weapons.js';
import { createEnemyProjectileSystem } from './enemyProjectiles.js';
import { createExperience } from './experience.js';
import { createLevelUpFlow } from './rewards.js';
import { computeCardLayout, hitTestCards, keyToCardIndex, pointerToCanvas } from './rewardCards.js';
import { drawRewardCards } from './rewardCardsView.js';
import { createPlayerHealth, anyContact } from './combat.js';
import { createSpawner } from './spawner.js';
import { createEnemySprites } from './enemySprites.js';

// 밸런스 값은 config.js에서 관리한다. 아래는 이 파일에서 쓰기 쉬운 이름으로 옮겨 둔 것이다.
const PLAYER_RADIUS = PLAYER.radius;
const PLAYER_SPEED = PLAYER.speed;
const DASH_DISTANCE = DASH.distance;
const DASH_SPEED = DASH.speed;
const DASH_COOLDOWN = DASH.cooldown;
const ENEMY_RADIUS = enemyRadius(ENEMY); // 접촉 판정에 쓰는 적 충돌 반지름(표시 크기와 별개)
const HIT_BLINK_INTERVAL = 0.1; // [임시] 피격 후 보호 중 깜빡임: 이 시간(초)마다 보임/흐림이 바뀐다(표시용 값, 밸런스 아님)
const REWARD_FLASH_DURATION = 0.15; // [임시] 보상을 고른 뒤 선택한 카드를 강조해서 보여 주는 시간(초, 표시용). 이 동안에도 게임은 정지 상태다.
const HIT_BLINK_ALPHA = 0.35; // [임시] 흐려진 상태의 투명도
const DEBUG_DASH = false; // true면 개발용으로 대시 이동 거리를 콘솔에 출력

// 시간 이벤트가 발동했을 때 화면에 보여 줄 알림(단계 1에서는 보스 전투 없이 알림만 표시)
const EVENT_MESSAGES = {
  midBoss: '중간 보스 출현 (테스트)',
  finalBoss: '최종 보스 출현 (테스트)',
  target: '5:00 도달 (런은 계속됩니다)',
};

// 개발용 테스트 기능: 개발 모드(npm run dev)에서만 켜지고, 프로덕션 빌드에서는 코드째 제거된다.
//   ?t=115     게임 시간을 115초부터 시작
//   ?speed=10  게임 시간이 10배 빠르게 흐름(이동/대시 속도는 그대로)
//   G 키       게임 오버 강제 발생
const devOptions = { startTime: 0, speed: 1 };
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  const startTime = Number(params.get('t'));
  const speed = Number(params.get('speed'));
  if (params.has('t') && Number.isFinite(startTime) && startTime >= 0) devOptions.startTime = startTime;
  if (params.has('speed') && Number.isFinite(speed) && speed > 0) devOptions.speed = speed;
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// e.code 기준이라 한글 입력 상태에서도 WASD가 동작한다.
const KEY_DIRECTIONS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function startGame(canvas) {
  const ctx = canvas.getContext('2d');
  const pressed = new Set();
  const size = { width: 0, height: 0 }; // 화면(캔버스) 크기. 플레이어 위치 계산에는 쓰지 않는다.
  // 플레이어는 월드 좌표로 관리한다. 시작 위치는 월드 중앙이고, 단계 3의 경계 중심으로 쓰기 위해 기록해 둔다.
  const startPosition = { x: WORLD.width / 2, y: WORLD.height / 2 };
  const player = { x: startPosition.x, y: startPosition.y };
  const lastDirection = { x: 1, y: 0 }; // 방향키 없이 대시할 때 쓰는 마지막 이동 방향(처음엔 오른쪽)
  const dash = { active: false, remaining: 0, dx: 0, dy: 0, cooldown: 0, startX: 0, startY: 0, elapsed: 0 };
  let sprite = null; // 로딩에 성공하면 캐릭터 스프라이트, 아니면 null(원형으로 표시)
  let facingRight = true; // 위아래 이동에서는 마지막 좌우 방향을 유지
  let walkTime = 0; // 걷기 애니메이션 진행 시간(초)
  let dashRequested = false; // Space를 새로 눌렀을 때만 true, update에서 한 번 처리하고 꺼짐
  let spaceHeld = false; // Space를 누르고 있는 동안 true (자동 재발동 방지)
  let lastTime = performance.now();

  const state = createGameState(); // ready -> playing <-> paused, playing -> gameover
  const timeline = createTimeline([
    { id: 'midBoss', at: TIMELINE.midBossAt },
    { id: 'finalBoss', at: TIMELINE.finalBossAt },
    { id: 'target', at: TIMELINE.targetTime },
  ]);
  let gameTime = devOptions.startTime; // 게임 시간(초). update에서만 증가하므로 정지 중에는 멈춘다.
  let notice = null; // 화면에 잠시 보여 줄 이벤트 알림 { text, remaining }

  // 경계: 월드에 고정된 원. 중심은 플레이어가 시작한 위치이고 이후 플레이어를 따라다니지 않는다.
  let boundary = createBoundary(startPosition);
  let insideBoundary = boundary.contains(player); // 플레이어 중심이 경계 안(경계선 위 포함)인지

  // 플레이어가 움직인 뒤 경계 안/밖 상태를 다시 계산한다. 체력/버프 등 효과는 아직 없다(단계 5, 10).
  function refreshBoundaryState() {
    insideBoundary = boundary.contains(player);
  }

  // 적(원혼): 적 목록, 번호표, 생성기, 스프라이트. 적 로직은 이미지 로딩 여부와 무관하게 동작한다.
  const enemies = [];
  let nextEnemyId = 1;
  const spawner = createSpawner();
  const enemySprites = createEnemySprites();
  let pixelRatio = 1; // 화면 배율(devicePixelRatio). 도트 그림을 정수 픽셀에 맞춰 그릴 때 쓴다.

  // 플레이어 체력: HP, 피격 후 보호, 대시 무적(서로 독립). 판정 규칙은 combat.js에 있다.
  const health = createPlayerHealth();

  // 무기: 자동 공격(가장 가까운 살아 있는 적), 투사체, 근접 공격. 게임이 실행 중일 때만 갱신되므로 정지/게임 오버에서는 멈춘다.
  const weapons = createWeaponSystem();

  // 경험치 구슬/레벨/자석과 레벨업 보상 선택. 선택 화면(levelup 상태)이 열려 있는 동안은 게임이 갱신되지 않는다.
  const experience = createExperience();
  const levelUp = createLevelUpFlow({ weapons, experience });

  // 무기를 갱신하고, 이번 공격으로 죽은 적을 목록에서 제거한다(제거된 적은 이후 이동/밀어내기/접촉/생성 수 계산에서 빠진다).
  // 제거되는 적마다 경험치 구슬을 한 개 만든다(한 적에게서는 한 번만).
  function updateWeaponSystem(dt) {
    // 경계 안에 있는 동안 공격력 버프(내구도에 따라 약해짐)가 발동하는 공격에 적용된다.
    weapons.update(dt, player, enemies, attackMultiplier(boundary, player, 'player'));
    removeDeadEnemies(enemies, (enemy) => experience.spawnOrbFor(enemy));
  }

  // 구슬을 줍고, 레벨이 올랐으면 보상 선택 화면을 연다. 게임이 실행 중일 때만 불린다.
  function openLevelUpIfNeeded(levelsGained) {
    if (levelsGained <= 0) return;
    levelUp.addLevelUps(levelsGained);
    if (levelUp.advance() && state.send('levelUp')) dashRequested = false; // 선택 중에는 대시 요청을 쌓지 않는다.
  }

  function updateExperience() {
    openLevelUpIfNeeded(experience.collect(player).levelsGained);
  }

  // 보상 선택 직후의 강조 표시: { cards: 방금 보여 준 카드, index: 고른 카드, remaining: 남은 시간(초) }.
  // 강조 중에는 보상이 이미 적용되었지만 화면은 그대로 정지 상태이며, 끝난 뒤에 다음 화면을 열거나 전투를 재개한다.
  // (이 값은 "강조를 보여 주는 동안 입력을 받지 않는" 용도이고, 보상을 한 번만 적용하는 규칙은 levelUp.select가 맡는다.)
  let rewardFlash = null;

  // 보상 선택(숫자 키와 마우스 클릭이 같은 함수를 쓴다). index는 현재 화면에서 왼쪽부터 센 카드 번호(0부터).
  // 표시되지 않은 번호나 이미 처리된 선택은 무시한다. 선택하면 보상은 즉시 적용되고 짧은 강조 뒤에 화면이 넘어간다.
  function selectReward(index) {
    if (!state.is(STATES.LEVELUP) || rewardFlash) return;
    const cards = levelUp.candidates;
    if (!levelUp.select(index)) return;
    rewardFlash = { cards, index, remaining: REWARD_FLASH_DURATION };
  }

  // 강조 시간이 지나면 더 열 화면이 없을 때만 전투로 돌아간다(레벨업 상태 전환은 기존 상태 기계를 쓴다).
  function updateRewardFlash(dt) {
    if (!rewardFlash) return;
    rewardFlash.remaining -= dt;
    if (rewardFlash.remaining > 0) return;
    rewardFlash = null;
    if (!levelUp.active) state.send('rewardDone');
  }

  // 카드 영역 클릭. 그려진 카드와 같은 배치 계산(computeCardLayout)으로 판정하므로 어긋나지 않는다.
  function onCanvasClick(e) {
    if (!state.is(STATES.LEVELUP) || rewardFlash) return;
    const point = pointerToCanvas(e, canvas.getBoundingClientRect(), size);
    const index = hitTestCards(computeCardLayout(levelUp.candidates.length, size), point.x, point.y);
    if (index >= 0) selectReward(index);
  }

  // 원거리 적의 투사체. 게임이 실행 중일 때만 갱신되므로 정지/게임 오버에서는 쿨다운과 투사체가 멈춘다.
  const enemyProjectiles = createEnemyProjectileSystem();

  // 원거리 적 발사와 투사체 이동/명중. 명중하면 투사체는 사라지고, 피해는 접촉과 같은 보호 규칙(피격 후 보호, 대시 무적)을 따른다.
  function updateEnemyProjectileSystem(dt) {
    enemyProjectiles.update(dt, {
      player,
      playerRadius: PLAYER_RADIUS,
      enemies,
      onHit: (damage) => {
        if (health.takeDamage(damage) && health.isDead) state.send('gameOver');
      },
    });
  }

  // 적과 닿았으면 피해를 한 번 시도한다(여러 마리가 닿아도 한 번). HP가 0이 되면 게임 오버.
  // 게임이 실행 중일 때만 불리고, 대시 중에도 불린다(update()의 대시 조기 반환과 무관한 위치에서 호출).
  function updateContactDamage() {
    if (!anyContact(player, PLAYER_RADIUS, enemies, ENEMY_RADIUS)) return;
    if (health.takeContactDamage() && health.isDead) state.send('gameOver');
  }

  // 생성기가 정한 위치에 적을 만들고, 모든 적을 이동시킨다. 게임이 실행 중일 때만 불린다(정지 중에는 멈춤).
  function updateEnemySystem(dt) {
    const cam = computeCamera(player, size, WORLD);
    const spawned = spawner.update(dt, { gameTime, enemyCount: enemies.length, cam, view: size });
    for (const p of spawned) enemies.push(createEnemy(nextEnemyId++, p.x, p.y, player, ENEMY, p.kind));
    updateEnemies(enemies, dt, player);
  }

  // 새 런을 시작할 때 입력, 플레이어, 대시, 시간, 이벤트 기록을 모두 초기 상태로 되돌린다.
  function resetRun() {
    pressed.clear();
    spaceHeld = false;
    dashRequested = false;
    dash.active = false;
    dash.remaining = 0;
    dash.dx = 0;
    dash.dy = 0;
    dash.cooldown = 0;
    dash.elapsed = 0;
    lastDirection.x = 1;
    lastDirection.y = 0;
    facingRight = true;
    walkTime = 0;
    player.x = startPosition.x;
    player.y = startPosition.y;
    clampPlayer();
    boundary = createBoundary(player); // 새 런의 시작 위치에 경계를 고정(강화 레벨도 0으로 초기화)
    refreshBoundaryState();
    enemies.length = 0; // 이전 런의 적과 생성기 상태(타이머, 소수 이월값)를 모두 지운다.
    nextEnemyId = 1;
    spawner.reset();
    enemyProjectiles.reset(); // 적 투사체를 모두 지움(원거리 적 쿨다운은 적 목록과 함께 지워짐)
    experience.reset(); // 구슬, 경험치, 레벨, 자석을 초기화
    levelUp.reset(); // 대기 중인 보상과 열려 있던 후보를 지움
    rewardFlash = null;
    weapons.reset(); // 투사체/효과를 지우고 무기를 시작 구성(레벨 1, 쿨다운 0)으로 되돌림
    health.reset(); // HP와 두 보호 타이머(피격 후 보호, 대시 무적)를 초기화
    gameTime = devOptions.startTime;
    timeline.reset();
    notice = null;
  }

  function clampPlayer() {
    // 플레이어를 월드 안에 가둔다. 스프라이트가 있으면 그림이 월드 가장자리에서 잘리지 않도록
    // 좌우·위쪽 여백을 그림 크기만큼 둔다.
    // 그림은 항상 실제 좌표(발밑 = y + PLAYER_RADIUS)에 그리므로 발 위치와 좌표는 어긋나지 않는다.
    // 월드가 아주 작아 여백이 월드 절반을 넘으면 범위가 뒤집히지 않게 절반으로 제한한다.
    const marginX = Math.min(Math.max(PLAYER_RADIUS, sprite?.halfWidth ?? 0), WORLD.width / 2);
    const marginTop = Math.min(Math.max(PLAYER_RADIUS, (sprite?.height ?? 0) - PLAYER_RADIUS), WORLD.height / 2);
    player.x = Math.min(Math.max(player.x, marginX), WORLD.width - marginX);
    player.y = Math.min(Math.max(player.y, marginTop), WORLD.height - PLAYER_RADIUS);
  }

  // 화면 크기만 갱신한다. 플레이어의 월드 좌표는 그대로이고, 카메라는 draw에서 다시 계산된다.
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, PLAYER_RADIUS * 2);
    const height = Math.max(rect.height, PLAYER_RADIUS * 2);
    const dpr = window.devicePixelRatio || 1;
    pixelRatio = dpr;

    size.width = width;
    size.height = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // 눌려 있는 방향키를 길이 1의 방향으로 바꾼다. 입력이 없으면 null.
  function readInputDirection() {
    let dx = 0;
    let dy = 0;
    for (const code of pressed) {
      const [x, y] = KEY_DIRECTIONS[code];
      dx += x;
      dy += y;
    }
    // WASD와 방향키를 함께 눌러도 한 방향으로만 취급
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    if (dx === 0 && dy === 0) return null;

    // 대각선 이동 속도가 빨라지지 않도록 정규화
    const length = Math.hypot(dx, dy);
    return { x: dx / length, y: dy / length };
  }

  function startDash() {
    // 방향키가 없으면 마지막 이동 방향, 대시 중에는 이 방향이 고정된다.
    const dir = readInputDirection() ?? lastDirection;
    dash.active = true;
    dash.remaining = DASH_DISTANCE;
    dash.dx = dir.x;
    dash.dy = dir.y;
    dash.cooldown = DASH_COOLDOWN;
    dash.startX = player.x;
    dash.startY = player.y;
    dash.elapsed = 0;
    health.startDashInvulnerability(); // 대시 무적 시작(피격 후 보호 시간은 건드리지 않는다)
    if (dir.x !== 0) facingRight = dir.x > 0;
  }

  function updateDash(dt) {
    // 마지막 프레임에서는 남은 거리만큼만 움직여 총 거리가 정확히 108px이 되게 한다.
    const step = Math.min(dash.remaining, DASH_SPEED * dt);
    player.x += dash.dx * step;
    player.y += dash.dy * step;
    clampPlayer();
    dash.remaining -= step;
    dash.elapsed += dt;

    if (dash.remaining <= 1e-6) {
      dash.active = false;
      if (DEBUG_DASH) {
        const moved = Math.hypot(player.x - dash.startX, player.y - dash.startY);
        const blocked = moved < DASH_DISTANCE - 0.01;
        console.log(`[dash] 이동 ${moved.toFixed(2)}px / 목표 ${DASH_DISTANCE}px (${blocked ? '경계에 막힘' : '정상'})`);
      }
    }
  }

  function updateTimeline(dt) {
    gameTime += dt * devOptions.speed;
    for (const event of timeline.update(gameTime)) {
      notice = { text: EVENT_MESSAGES[event.id], remaining: NOTICE_DURATION };
      if (import.meta.env.DEV) console.log(`[timeline] ${event.id} @ ${formatTime(gameTime)}`);
    }
    if (notice) {
      notice.remaining -= dt;
      if (notice.remaining <= 0) notice = null;
    }
  }

  function update(dt) {
    updateTimeline(dt);
    dash.cooldown = Math.max(0, dash.cooldown - dt);

    // Space 요청은 한 번만 처리하고, 대시 중이거나 쿨다운 중이면 버린다(선입력 없음).
    if (dashRequested) {
      dashRequested = false;
      if (!dash.active && dash.cooldown === 0) startDash();
    }

    // 보호 타이머는 대시 조기 반환보다 앞에서 줄인다(대시 중에도 흘러야 한다). 대시를 막 시작한 프레임의 시간도 포함한다.
    health.update(dt);

    if (dash.active) {
      updateDash(dt);
      return;
    }

    const dir = readInputDirection();
    if (!dir) {
      walkTime = 0; // 멈추면 걷기 첫 프레임에 고정(검증된 대기 프레임이 없어 임시 표시)
      return;
    }

    walkTime += dt;
    if (dir.x !== 0) facingRight = dir.x > 0;
    lastDirection.x = dir.x;
    lastDirection.y = dir.y;
    player.x += dir.x * PLAYER_SPEED * dt;
    player.y += dir.y * PLAYER_SPEED * dt;
    clampPlayer();
  }

  // 화면을 칠하고 희미한 바닥 격자를 그린다.
  // 격자는 월드 좌표 48px 배수에 놓이므로 카메라가 움직이면 화면에서 함께 움직인다.
  // 얇은 선이 번지지 않도록, 월드 좌표를 화면 좌표로 바꾼 뒤 정수 픽셀에 맞춰 그린다.
  function drawFloor(cam) {
    ctx.fillStyle = '#16141d';
    ctx.fillRect(0, 0, size.width, size.height);

    const tile = 48;
    const view = viewRect(cam, size);
    // 월드 안쪽에 보이는 범위만 그린다(월드 가장자리 선은 검증용 표식이 따로 그린다).
    const left = Math.max(view.left, 0);
    const right = Math.min(view.right, WORLD.width);
    const top = Math.max(view.top, 0);
    const bottom = Math.min(view.bottom, WORLD.height);

    ctx.strokeStyle = 'rgba(201, 162, 74, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let wx = Math.max(Math.ceil(left / tile), 1) * tile; wx < right; wx += tile) {
      const sx = Math.round(wx - cam.x) + 0.5;
      ctx.moveTo(sx, top - cam.y);
      ctx.lineTo(sx, bottom - cam.y);
    }
    for (let wy = Math.max(Math.ceil(top / tile), 1) * tile; wy < bottom; wy += tile) {
      const sy = Math.round(wy - cam.y) + 0.5;
      ctx.moveTo(left - cam.x, sy);
      ctx.lineTo(right - cam.x, sy);
    }
    ctx.stroke();
  }

  // 가장자리를 어둡게 하는 비네트. 화면 기준 효과라서 카메라가 움직여도 화면에 고정된다.
  function drawVignette() {
    const vignette = ctx.createRadialGradient(
      size.width / 2,
      size.height / 2,
      Math.min(size.width, size.height) * 0.3,
      size.width / 2,
      size.height / 2,
      Math.max(size.width, size.height) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  // 원형 경계. 월드 좌표로 그리므로 월드 레이어(카메라 변환 안)에서 호출해야 한다.
  // 청록색 테두리와 옅은 내부 채움(임시 스타일). 플레이어 아래에 그리고 채움을 옅게 해서 가시성을 해치지 않는다.
  // 중심과 반경을 매 프레임 boundary에서 읽으므로 반경이 강화되어도 이 함수는 바꿀 필요가 없다.
  function drawBoundary() {
    ctx.save();
    ctx.fillStyle = 'rgba(64, 190, 180, 0.07)';
    ctx.strokeStyle = 'rgba(64, 200, 190, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(boundary.center.x, boundary.center.y, boundary.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // [개발 모드 전용 검증 표식] 월드 좌표 200px 간격 교차점마다 작은 십자를 그린다(프로덕션 빌드에서는 코드째 제거).
  // 카메라/창 크기와 무관하게 월드에 고정되어 보이는지 확인하는 용도다. 화면에 보이는 영역의 십자만 그린다.
  const DEBUG_GRID_STEP = 200;
  const DEBUG_CROSS_HALF = 5;
  function drawDebugGridCrosses(view) {
    const pad = DEBUG_CROSS_HALF + 1;
    const firstX = Math.max(Math.ceil((view.left - pad) / DEBUG_GRID_STEP), 0);
    const lastX = Math.min(Math.floor((view.right + pad) / DEBUG_GRID_STEP), WORLD.width / DEBUG_GRID_STEP);
    const firstY = Math.max(Math.ceil((view.top - pad) / DEBUG_GRID_STEP), 0);
    const lastY = Math.min(Math.floor((view.bottom + pad) / DEBUG_GRID_STEP), WORLD.height / DEBUG_GRID_STEP);
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 230, 227, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let ix = firstX; ix <= lastX; ix++) {
      for (let iy = firstY; iy <= lastY; iy++) {
        const x = ix * DEBUG_GRID_STEP;
        const y = iy * DEBUG_GRID_STEP;
        ctx.moveTo(x - DEBUG_CROSS_HALF, y);
        ctx.lineTo(x + DEBUG_CROSS_HALF, y);
        ctx.moveTo(x, y - DEBUG_CROSS_HALF);
        ctx.lineTo(x, y + DEBUG_CROSS_HALF);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // [개발 모드 전용 검증 표식] 월드 고정 좌표가 카메라와 함께 일관되게 움직이는지 확인하기 위한 것.
  // 월드 중앙 십자와 월드 가장자리 테두리. 검증이 끝나면 이 함수와 호출부를 지운다.
  // 월드 좌표로 그리므로 월드 레이어(카메라 변환 안)에서 호출해야 한다.
  function drawWorldMarkers() {
    ctx.save();
    ctx.strokeStyle = 'rgba(201, 162, 74, 0.7)';
    ctx.lineWidth = 2;
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    // 선 두께가 월드 안쪽에 온전히 들어오도록 안쪽으로 2px 당겨 그린다.
    ctx.strokeStyle = 'rgba(201, 74, 74, 0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, WORLD.width - 4, WORLD.height - 4);
    ctx.restore();
  }

  function drawPlayerSprite() {
    let frame;
    if (dash.active) {
      // 대시 시간 동안 중간 프레임 4개를 한 번 재생
      const progress = Math.min(dash.elapsed / (DASH_DISTANCE / DASH_SPEED), 0.999);
      frame = sprite.dashFrames[Math.floor(progress * sprite.dashFrames.length)];
    } else {
      frame = sprite.walkFrames[Math.floor(walkTime * WALK_FPS) % sprite.walkFrames.length];
    }
    // 이동 판정 원의 아랫부분을 발밑으로 삼는다.
    sprite.draw(ctx, frame, player.x, player.y + PLAYER_RADIUS, facingRight);
  }

  function drawPlayer() {
    if (sprite) {
      drawPlayerSprite();
      return;
    }

    const { x, y } = player;

    // 발밑의 은은한 빛
    const glow = ctx.createRadialGradient(x, y, PLAYER_RADIUS * 0.5, x, y, PLAYER_RADIUS * 3);
    glow.addColorStop(0, 'rgba(201, 162, 74, 0.25)');
    glow.addColorStop(1, 'rgba(201, 162, 74, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS * 3, 0, Math.PI * 2);
    ctx.fill();

    // 몸체
    ctx.fillStyle = '#2a2433';
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 중앙의 룬 문양
    ctx.fillStyle = '#e8e6e3';
    ctx.beginPath();
    ctx.moveTo(x, y - PLAYER_RADIUS * 0.55);
    ctx.lineTo(x + PLAYER_RADIUS * 0.4, y);
    ctx.lineTo(x, y + PLAYER_RADIUS * 0.55);
    ctx.lineTo(x - PLAYER_RADIUS * 0.4, y);
    ctx.closePath();
    ctx.fill();
  }

  // 개발 모드에서만 호출된다(프로덕션 빌드에서는 코드째 제거). 플레이어/카메라의 월드 좌표를 보여 준다.
  function drawDevCoords(cam) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(232, 230, 227, 0.7)';
    ctx.font = '12px monospace';
    ctx.fillText(`player (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`, 12, 12);
    ctx.fillText(`camera (${cam.x.toFixed(1)}, ${cam.y.toFixed(1)})`, 12, 28);
    const dist = boundary.distanceTo(player).toFixed(1);
    ctx.fillText(`boundary: ${insideBoundary ? 'inside' : 'outside'} (d=${dist} / r=${boundary.radius})`, 12, 44);
    ctx.fillText(`enemies: ${enemies.length} / ${SPAWN.maxEnemies}`, 12, 60);
    ctx.fillText(`weapons: ${weapons.slots.map((w) => `${w.id} Lv${w.level} cd ${w.cooldown.toFixed(2)}`).join(' | ')}  projectiles: ${weapons.projectiles.length}`, 12, 92);
    ctx.fillText(`magnet: Lv${experience.magnetLevel} r=${experience.pickupRadius}  orbs: ${experience.orbs.length}  boomerangs: ${weapons.boomerangs.length}  [X] +10xp  [Shift+X] +100xp`, 12, 124);
    ctx.fillText(`boundary durability: ${boundary.durability.toFixed(1)} / ${boundary.maxDurability}  recovery: ${boundary.recoveryOn ? 'ON' : 'OFF'}  sinceDamage: ${Math.min(boundary.timeSinceDamage, 999).toFixed(1)}  [B] -10%  [Shift+B] -100%`, 12, 140);
    ctx.fillText(`enemy projectiles: ${enemyProjectiles.projectiles.length}`, 12, 108);
    ctx.fillText(`hp: ${health.hp} / ${health.maxHp}  protect: ${health.hitProtection.toFixed(2)}  dashInv: ${health.dashInvuln.toFixed(2)}`, 12, 76);
    ctx.restore();
  }

  function drawHud(cam) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#e8e6e3';
    ctx.font = '600 22px system-ui, "Malgun Gothic", sans-serif';
    ctx.fillText(formatTime(gameTime), size.width / 2, 12);
    if (notice) {
      ctx.fillStyle = '#c9a24a';
      ctx.font = '600 18px system-ui, "Malgun Gothic", sans-serif';
      ctx.fillText(notice.text, size.width / 2, 44);
    }
    ctx.restore();
    drawHealthBar();
    drawBoundaryStatus();
    if (import.meta.env.DEV) drawDevCoords(cam);
  }

  // 화면 오른쪽 위: 경계 내구도와 회복 ON/OFF 표시(임시 스타일).
  function drawBoundaryStatus() {
    const percent = Math.round((boundary.durability * 100) / boundary.maxDurability);
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = insideBoundary ? '#7fe0d6' : '#e8e6e3';
    ctx.font = '600 14px system-ui, "Malgun Gothic", sans-serif';
    ctx.fillText(`경계 내구도 ${percent}%  ·  회복 ${boundary.recoveryOn ? 'ON' : 'OFF'} [R]`, size.width - 16, 14);
    ctx.restore();
  }

  // 화면 왼쪽 아래의 HP 바. 개발용 글자(왼쪽 위)와 겹치지 않는다.
  function drawHealthBar() {
    const barW = 200;
    const barH = 14;
    const x = 16;
    const y = size.height - 28 - barH; // 아래에 경험치 바가 들어갈 자리를 둔다
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);
    ctx.fillStyle = '#b8404f';
    ctx.fillRect(x, y, (barW * health.hp) / health.maxHp, barH);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#e8e6e3';
    ctx.font = '600 13px system-ui, "Malgun Gothic", sans-serif';
    ctx.fillText(`HP ${health.hp} / ${health.maxHp}`, x, y - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`LV ${experience.level}   XP ${experience.xp} / ${experience.xpToNext}`, x + barW, y - 4);
    ctx.restore();
    // 경험치 바(HP 바 바로 아래)
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x - 2, y + barH + 2, barW + 4, 8);
    ctx.fillStyle = '#5fcf76';
    ctx.fillRect(x, y + barH + 4, (barW * experience.xp) / experience.xpToNext, 4);
    ctx.restore();
  }

  // 피격 후 보호 중에는 플레이어가 깜빡인다(대시 무적에서는 깜빡이지 않는다).
  function drawPlayerWithHitBlink() {
    const dim = health.isProtected && Math.floor(health.hitProtection / HIT_BLINK_INTERVAL) % 2 === 1;
    if (!dim) {
      drawPlayer();
      return;
    }
    ctx.save();
    ctx.globalAlpha = HIT_BLINK_ALPHA;
    drawPlayer();
    ctx.restore();
  }

  // ready / paused / gameover일 때 화면을 어둡게 하고 안내 문구를 보여 준다.
  function drawOverlay() {
    let title;
    let lines = [];
    if (state.is(STATES.READY)) {
      title = GAME_TITLE;
      lines = ['Enter를 눌러 시작'];
    } else if (state.is(STATES.PAUSED)) {
      title = '일시 정지';
      lines = ['Esc / Enter 눌러서 재개'];
    } else if (state.is(STATES.LEVELUP)) {
      // 보상 선택 화면은 카드 UI가 그린다. 강조 중에는 방금 보여 준 카드에서 고른 카드를 강조한다.
      drawRewardCards(ctx, size, rewardFlash ? { title: 'LEVEL UP', cards: rewardFlash.cards, selectedIndex: rewardFlash.index } : { title: 'LEVEL UP', cards: levelUp.candidates });
      return;
    } else if (state.is(STATES.GAMEOVER)) {
      title = '게임 오버';
      lines = [`생존 시간 ${formatTime(gameTime)}`, 'Enter를 눌러 다시 시작'];
    } else {
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8e6e3';
    ctx.font = '700 40px system-ui, "Malgun Gothic", sans-serif';
    ctx.fillText(title, size.width / 2, size.height / 2 - 24);
    ctx.fillStyle = '#c9a24a';
    ctx.font = '500 18px system-ui, "Malgun Gothic", sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, size.width / 2, size.height / 2 + 20 + i * 28));
    ctx.restore();
  }

  // 연쇄 번개 표시(임시): 점들을 잇는 지그재그 선. 효과 시간이 끝나면 목록에서 사라져 화면에 남지 않는다.
  function drawChainLightning(points, alpha) {
    ctx.save();
    ctx.globalAlpha = 0.9 * alpha;
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len; // 선에 수직인 방향
      const ny = (b.x - a.x) / len;
      const parts = 4;
      for (let k = 1; k < parts; k++) {
        const off = (k % 2 === 0 ? -1 : 1) * 5;
        ctx.lineTo(a.x + ((b.x - a.x) * k) / parts + nx * off, a.y + ((b.y - a.y) * k) / parts + ny * off);
      }
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 근접 공격 표시: 플레이어를 중심으로 공격 범위까지 퍼지는 고리(임시 스타일). 플레이어/적 아래에 그린다.
  function drawWeaponEffects() {
    ctx.save();
    ctx.lineWidth = 3;
    for (const f of weapons.effects) {
      const t = Math.min(f.age / f.duration, 1);
      if (f.points) {
        drawChainLightning(f.points, 1 - t);
        continue;
      }
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = '#e8c36a';
      ctx.fillStyle = 'rgba(232, 195, 106, 0.15)';
      ctx.beginPath();
      ctx.arc(player.x, player.y, f.radius * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 원거리 적 표시(임시): 원혼 그림 위에 보라색 마름모와 발밑 고리를 덧그려 일반 적과 구분한다.
  function drawRangedMarker(e) {
    ctx.save();
    ctx.strokeStyle = 'rgba(190, 110, 230, 0.9)';
    ctx.fillStyle = 'rgba(190, 110, 230, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + ENEMY_RADIUS * 0.9, ENEMY_RADIUS * 1.1, ENEMY_RADIUS * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    const top = e.y - ENEMY.displaySize / 2 - 4;
    ctx.beginPath();
    ctx.moveTo(e.x, top - 6);
    ctx.lineTo(e.x + 5, top);
    ctx.lineTo(e.x, top + 6);
    ctx.lineTo(e.x - 5, top);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 적 투사체(임시 스타일: 보라색 구체). 플레이어 투사체와 색으로 구분한다.
  function drawEnemyProjectiles() {
    ctx.save();
    ctx.fillStyle = '#d58cf0';
    ctx.strokeStyle = '#7a2fa0';
    ctx.lineWidth = 2;
    for (const p of enemyProjectiles.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, ENEMY_PROJECTILE.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 부메랑 표시(임시): 회전하는 마름모. 나가는 단계는 금색, 돌아오는 단계는 청록색으로 구분한다.
  function drawBoomerangs() {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const b of weapons.boomerangs) {
      const r = b.def.projectileRadius * 1.3;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = b.phase === 'out' ? '#f0c85a' : '#6fe0d4';
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // 경험치 구슬(임시 스타일: 연두색 마름모). 화면에 보이는 구슬만 그린다. 적과 플레이어 아래에 그린다.
  function drawOrbs(view) {
    const r = XP.orbDrawRadius;
    ctx.save();
    ctx.fillStyle = '#7be08a';
    ctx.strokeStyle = '#2f8f45';
    ctx.lineWidth = 1.5;
    for (const orb of experience.orbs) {
      if (orb.x < view.left - r || orb.x > view.right + r || orb.y < view.top - r || orb.y > view.bottom + r) continue;
      ctx.beginPath();
      ctx.moveTo(orb.x, orb.y - r);
      ctx.lineTo(orb.x + r * 0.75, orb.y);
      ctx.lineTo(orb.x, orb.y + r);
      ctx.lineTo(orb.x - r * 0.75, orb.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 투사체(임시 스타일: 작은 밝은 원). 적과 플레이어 위에 그린다.
  function drawProjectiles() {
    ctx.save();
    ctx.fillStyle = '#f2e6b0';
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 1.5;
    for (const p of weapons.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 적과 플레이어를 y 좌표 순서로 그린다: 플레이어보다 위쪽(y가 작은) 적은 플레이어 뒤에,
  // 아래쪽(y가 같거나 큰) 적은 플레이어 앞에 그려서 겹칠 때 앞뒤가 자연스럽게 보이게 한다.
  function drawEntities(cam) {
    const snap = { camX: cam.x, camY: cam.y, dpr: pixelRatio }; // 도트 그림을 정수 픽셀에 맞춰 그리기 위한 값
    const order = enemies.slice().sort((a, b) => a.y - b.y); // 그리기 순서만 정렬하고 원래 목록은 건드리지 않는다.
    let i = 0;
    const drawEnemy = (e) => {
      enemySprites.draw(ctx, e.x, e.y, e.facing, snap, e.isBoss ? BOSS.sizeScale : 1);
      if (e.kind === 'ranged') drawRangedMarker(e);
    };
    for (; i < order.length && order[i].y < player.y; i++) drawEnemy(order[i]);
    drawPlayerWithHitBlink();
    for (; i < order.length; i++) drawEnemy(order[i]);
  }

  function draw() {
    // 카메라는 매 프레임 플레이어(월드 좌표)와 화면 크기에서 계산한다. 창 크기가 바뀌어도 일관된다.
    const cam = computeCamera(player, size, WORLD);

    // 화면 레이어: 화면 좌표 그대로 그린다.
    drawFloor(cam);
    drawVignette();

    // 월드 레이어: 월드 좌표 그대로 그리고, 카메라만큼 평행 이동해서 화면에 놓는다.
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawBoundary();
    if (import.meta.env.DEV) {
      // [개발 모드 전용 검증 표식] 프로덕션 빌드에서는 코드째 제거된다.
      drawDebugGridCrosses(viewRect(cam, size));
      drawWorldMarkers();
    }
    drawOrbs(viewRect(cam, size));
    drawWeaponEffects();
    drawEntities(cam); // 적(경계 위)과 플레이어
    drawProjectiles();
    drawBoomerangs();
    drawEnemyProjectiles();
    ctx.restore();

    // 화면 레이어: HUD와 오버레이는 화면에 고정된다.
    drawHud(cam);
    drawOverlay();
  }

  function frame(now) {
    // lastTime은 정지 중에도 매 프레임 갱신하므로, 재개 직후 첫 dt가 정지 시간만큼 커지지 않는다.
    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    updateRewardFlash(dt); // 보상 선택 강조 시간(정지 중에도 흐른다)
    if (state.is(STATES.PLAYING)) {
      update(dt); // 게임 진행 관련 업데이트는 실행 중에만
      refreshBoundaryState(); // 이동/대시가 끝난 위치 기준으로 경계 안/밖 갱신
      boundary.update(dt); // 내구도 회복(켜져 있고 피해가 없을 때). 정지 중에는 불리지 않아 멈춘다.
      updateWeaponSystem(dt); // 자동 공격과 투사체, 죽은 적 제거(이동이 끝난 플레이어 위치 기준)
      updateEnemySystem(dt); // 적 생성과 이동(플레이어 위치 기준)
      updateEnemyProjectileSystem(dt); // 원거리 적 발사와 투사체 명중(적 이동 후, 접촉 피해 전)
      updateContactDamage(); // 이동이 끝난 위치 기준 접촉 피해. HP 0이면 여기서 게임 오버가 된다.
      if (state.is(STATES.PLAYING)) updateExperience(); // 마지막에 구슬 줍기. 게임 오버가 난 프레임에는 줍지 않는다.
    }
    draw();
    requestAnimationFrame(frame);
  }

  function togglePause() {
    if (state.is(STATES.PLAYING)) {
      state.send('pause');
      dashRequested = false;
    } else if (state.send('resume')) {
      dashRequested = false; // 정지 중에 쌓인 대시 요청은 재개 후 실행하지 않는다.
    }
  }

  // 창/탭이 포커스를 잃으면 keyup을 못 받으므로 입력을 초기화하고 일시 정지한다.
  // 포커스가 돌아와도 자동으로 재개하지 않는다(Esc로만 재개).
  function pauseForFocusLoss() {
    pressed.clear();
    spaceHeld = false;
    dashRequested = false;
    state.send('pause');
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (e.repeat) return;
      // 일시 정지 중에는 재개. 그 외에는 ready 또는 gameover에서만 전환에 성공하고, 그때만 새 런을 초기화한다.
      if (state.is(STATES.PAUSED)) togglePause();
      else if (state.send('start')) resetRun();
      return;
    }
    if (state.is(STATES.LEVELUP)) {
      // 보상 선택 중에는 1/2/3만 받는다(숫자 키패드 포함, 화면의 왼쪽부터 카드 번호). 다른 입력은 무시한다.
      const choice = keyToCardIndex(e.code);
      if (choice !== null) {
        e.preventDefault();
        if (!e.repeat) selectReward(choice);
      }
      if (e.code in KEY_DIRECTIONS || e.code === 'Space') e.preventDefault(); // 선택 중에도 페이지가 스크롤되지 않게
      if (e.code in KEY_DIRECTIONS) pressed.add(e.code); // 이동 키 상태만 계속 추적한다(재개 후 이어서 이동)
      if (e.code === 'Space') spaceHeld = true;
      return;
    }
    if (e.code === 'KeyR') {
      // R: 경계 회복 ON/OFF. 실행 중에만 바꾼다.
      if (!e.repeat && state.is(STATES.PLAYING)) boundary.toggleRecovery();
      return;
    }
    if (import.meta.env.DEV && e.code === 'KeyB') {
      // [개발 모드 전용] B: 경계 내구도를 최대의 10% 깎고, Shift+B는 전부 깎는다(적이 경계를 공격하는 규칙은 아직 미정).
      if (!e.repeat && state.is(STATES.PLAYING)) boundary.damage(e.shiftKey ? boundary.maxDurability : (boundary.maxDurability * BOUNDARY.devDamagePercent) / 100);
      return;
    }
    if (import.meta.env.DEV && e.code === 'KeyX') {
      // [개발 모드 전용] X: 경험치 +10, Shift+X: +100. 구슬을 줍지 않고 레벨업/연속 레벨업을 시험한다.
      if (!e.repeat && state.is(STATES.PLAYING)) openLevelUpIfNeeded(experience.addXp(e.shiftKey ? 100 : 10));
      return;
    }
    if (import.meta.env.DEV && e.code === 'KeyG') {
      if (!e.repeat) state.send('gameOver');
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault(); // Space로 페이지가 스크롤되지 않게
      // 누르고 있을 때 반복해서 오는 keydown은 무시하고, 새로 누른 경우만 대시 요청.
      // 실행 중이 아닐 때(정지, 시작 전, 게임 오버) 누른 Space는 대시 요청으로 쌓지 않는다.
      if (!e.repeat && !spaceHeld && state.is(STATES.PLAYING)) dashRequested = true;
      spaceHeld = true;
      return;
    }
    if (!(e.code in KEY_DIRECTIONS)) return;
    e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceHeld = false;
    pressed.delete(e.code);
  });
  canvas.addEventListener('click', onCanvasClick);
  window.addEventListener('blur', pauseForFocusLoss);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseForFocusLoss();
  });

  loadSprite().then((loaded) => {
    sprite = loaded;
    clampPlayer(); // 여백이 넓어졌으므로 이미 가장자리에 있던 플레이어를 안쪽으로 맞춘다.
  });
  enemySprites.load(); // 실패해도 예외 없이 임시 원형으로 대체되므로 결과를 기다리지 않는다.

  if (import.meta.env.DEV) {
    // [개발 모드 전용] 자동 통합 테스트(tests/gameIntegration.test.js)가 게임 상태를 읽고 시험 상황을 만들기 위한 핸들.
    // 프로덕션 빌드에서는 코드째 제거된다(tests/prodBuild.test.js가 확인).
    window.__nineBorders = { state, player, enemies, weapons, enemyProjectiles, experience, levelUp, health, gameTime: () => gameTime, boundary: () => boundary };
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  requestAnimationFrame(frame);
}
