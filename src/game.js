// 플레이어 이동을 담당하는 최소한의 게임 루프.
// 좌표는 CSS 픽셀 단위로 다루고, 그리기 직전에만 devicePixelRatio를 적용한다.

import { loadSprite, WALK_FPS } from './sprite.js';

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 240; // 초당 이동 픽셀
const MAX_FRAME_TIME = 0.05; // 탭 전환 등으로 프레임이 길어질 때 순간이동 방지

const DASH_DISTANCE = 108; // 대시 목표 이동 거리(px)
const DASH_SPEED = 600; // 초당 이동 픽셀 (108px / 600 = 0.18초)
const DASH_COOLDOWN = 0.8; // 대시를 시작한 순간부터 계산
const DEBUG_DASH = false; // true면 개발용으로 대시 이동 거리를 콘솔에 출력

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
  const size = { width: 0, height: 0 };
  const player = { x: 0, y: 0 };
  const lastDirection = { x: 1, y: 0 }; // 방향키 없이 대시할 때 쓰는 마지막 이동 방향(처음엔 오른쪽)
  const dash = { active: false, remaining: 0, dx: 0, dy: 0, cooldown: 0, startX: 0, startY: 0, elapsed: 0 };
  let sprite = null; // 로딩에 성공하면 캐릭터 스프라이트, 아니면 null(원형으로 표시)
  let facingRight = true; // 위아래 이동에서는 마지막 좌우 방향을 유지
  let walkTime = 0; // 걷기 애니메이션 진행 시간(초)
  let dashRequested = false; // Space를 새로 눌렀을 때만 true, update에서 한 번 처리하고 꺼짐
  let spaceHeld = false; // Space를 누르고 있는 동안 true (자동 재발동 방지)
  let lastTime = performance.now();

  function clampPlayer() {
    // 스프라이트가 있으면 그림이 화면 밖으로 잘리지 않도록 좌우·위쪽 여백을 그림 크기만큼 둔다.
    // 그림은 항상 실제 좌표(발밑 = y + PLAYER_RADIUS)에 그리므로 발 위치와 좌표는 어긋나지 않는다.
    // 창이 너무 작아 여백이 화면 절반을 넘으면 범위가 뒤집히지 않게 절반으로 제한한다.
    const marginX = Math.min(Math.max(PLAYER_RADIUS, sprite?.halfWidth ?? 0), size.width / 2);
    const marginTop = Math.min(Math.max(PLAYER_RADIUS, (sprite?.height ?? 0) - PLAYER_RADIUS), size.height / 2);
    player.x = Math.min(Math.max(player.x, marginX), size.width - marginX);
    player.y = Math.min(Math.max(player.y, marginTop), size.height - PLAYER_RADIUS);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, PLAYER_RADIUS * 2);
    const height = Math.max(rect.height, PLAYER_RADIUS * 2);
    const dpr = window.devicePixelRatio || 1;

    if (size.width === 0) {
      // 첫 배치: 중앙에서 시작
      player.x = width / 2;
      player.y = height / 2;
    } else {
      // 영역 크기가 바뀌면 상대 위치를 유지
      player.x *= width / size.width;
      player.y *= height / size.height;
    }

    size.width = width;
    size.height = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampPlayer();
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

  function update(dt) {
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

  function drawFloor() {
    ctx.fillStyle = '#16141d';
    ctx.fillRect(0, 0, size.width, size.height);

    // 희미한 바닥 격자
    const tile = 48;
    ctx.strokeStyle = 'rgba(201, 162, 74, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = tile; x < size.width; x += tile) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, size.height);
    }
    for (let y = tile; y < size.height; y += tile) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size.width, y + 0.5);
    }
    ctx.stroke();

    // 가장자리를 어둡게 하는 비네트
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

  function draw() {
    drawFloor();
    drawPlayer();
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault(); // Space로 페이지가 스크롤되지 않게
      // 누르고 있을 때 반복해서 오는 keydown은 무시하고, 새로 누른 경우만 대시 요청
      if (!e.repeat && !spaceHeld) dashRequested = true;
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
  // 창이 포커스를 잃으면 keyup을 못 받으므로 입력을 초기화
  window.addEventListener('blur', () => {
    pressed.clear();
    spaceHeld = false;
    dashRequested = false;
  });

  loadSprite().then((loaded) => {
    sprite = loaded;
    clampPlayer(); // 여백이 넓어졌으므로 이미 가장자리에 있던 플레이어를 안쪽으로 맞춘다.
  });

  new ResizeObserver(resize).observe(canvas);
  resize();
  requestAnimationFrame(frame);
}
