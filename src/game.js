// 플레이어 이동을 담당하는 최소한의 게임 루프.
// 좌표는 CSS 픽셀 단위로 다루고, 그리기 직전에만 devicePixelRatio를 적용한다.

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 240; // 초당 이동 픽셀
const MAX_FRAME_TIME = 0.05; // 탭 전환 등으로 프레임이 길어질 때 순간이동 방지

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
  let lastTime = performance.now();

  function clampPlayer() {
    player.x = Math.min(Math.max(player.x, PLAYER_RADIUS), size.width - PLAYER_RADIUS);
    player.y = Math.min(Math.max(player.y, PLAYER_RADIUS), size.height - PLAYER_RADIUS);
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

  function update(dt) {
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
    if (dx === 0 && dy === 0) return;

    // 대각선 이동 속도가 빨라지지 않도록 정규화
    const length = Math.hypot(dx, dy);
    player.x += (dx / length) * PLAYER_SPEED * dt;
    player.y += (dy / length) * PLAYER_SPEED * dt;
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

  function drawPlayer() {
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
    if (!(e.code in KEY_DIRECTIONS)) return;
    e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.code);
  });
  // 창이 포커스를 잃으면 keyup을 못 받으므로 입력을 초기화
  window.addEventListener('blur', () => pressed.clear());

  new ResizeObserver(resize).observe(canvas);
  resize();
  requestAnimationFrame(frame);
}
