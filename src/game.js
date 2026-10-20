// 플레이어 이동과 게임 상태/시간을 담당하는 최소한의 게임 루프.
// 좌표는 CSS 픽셀 단위로 다루고, 그리기 직전에만 devicePixelRatio를 적용한다.

import { loadSprite, WALK_FPS } from './sprite.js';
import { GAME_TITLE, PLAYER, DASH, WORLD, MAX_FRAME_TIME, NOTICE_DURATION, TIMELINE } from './config.js';
import { createGameState, STATES } from './gameState.js';
import { createTimeline } from './timeline.js';
import { computeCamera, viewRect } from './camera.js';

// 밸런스 값은 config.js에서 관리한다. 아래는 이 파일에서 쓰기 쉬운 이름으로 옮겨 둔 것이다.
const PLAYER_RADIUS = PLAYER.radius;
const PLAYER_SPEED = PLAYER.speed;
const DASH_DISTANCE = DASH.distance;
const DASH_SPEED = DASH.speed;
const DASH_COOLDOWN = DASH.cooldown;
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

  // [검증용 임시 표식] 월드 고정 좌표가 카메라와 함께 일관되게 움직이는지 확인하기 위한 것.
  // 월드 중앙 십자와 월드 가장자리 테두리. 경계 시스템(단계 3)이 들어오면 이 함수와 호출부를 지운다.
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
    if (import.meta.env.DEV) drawDevCoords(cam);
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

  function draw() {
    // 카메라는 매 프레임 플레이어(월드 좌표)와 화면 크기에서 계산한다. 창 크기가 바뀌어도 일관된다.
    const cam = computeCamera(player, size, WORLD);

    // 화면 레이어: 화면 좌표 그대로 그린다.
    drawFloor(cam);
    drawVignette();

    // 월드 레이어: 월드 좌표 그대로 그리고, 카메라만큼 평행 이동해서 화면에 놓는다.
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawWorldMarkers(); // [검증용 임시 표식]
    drawPlayer();
    ctx.restore();

    // 화면 레이어: HUD와 오버레이는 화면에 고정된다.
    drawHud(cam);
    drawOverlay();
  }

  function frame(now) {
    // lastTime은 정지 중에도 매 프레임 갱신하므로, 재개 직후 첫 dt가 정지 시간만큼 커지지 않는다.
    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    if (state.is(STATES.PLAYING)) update(dt); // 게임 진행 관련 업데이트는 실행 중에만
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
  window.addEventListener('blur', pauseForFocusLoss);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseForFocusLoss();
  });

  loadSprite().then((loaded) => {
    sprite = loaded;
    clampPlayer(); // 여백이 넓어졌으므로 이미 가장자리에 있던 플레이어를 안쪽으로 맞춘다.
  });

  new ResizeObserver(resize).observe(canvas);
  resize();
  requestAnimationFrame(frame);
}
