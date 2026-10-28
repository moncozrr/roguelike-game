// 전투 화면: 기존 캔버스 게임을 감싸고, 일시 정지/포기 버튼과 모바일 터치 조작을 붙인다.
// 게임 규칙은 game.js가 그대로 맡는다. 이 화면은 게임을 만들고(startGame), 나갈 때 destroy()로 정리하는 일만 한다.

import { h, confirmDialog } from '../ui/dom.js';
import { startGame } from '../game.js';
import { getDungeon } from '../data/dungeons.js';
import { createTouchControls } from '../ui/touchControls.js';

const END_SCREEN_DELAY_MS = 1200; // 게임 오버/승리 문구를 잠깐 보여 준 뒤 결과 화면으로 넘어간다.

// 터치 기기인지: 주 입력이 손가락이거나, 개발용으로 ?touch=1을 붙였을 때
export function isTouchLayout() {
  try {
    return window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(window.location.search).has('touch');
  } catch {
    return false;
  }
}

export function battleScreen(app, { dungeonId }) {
  const dungeon = getDungeon(dungeonId);
  const touch = isTouchLayout();
  const abort = new AbortController();
  let endTimer = null;
  let watchFrame = 0;
  let controls = null;
  let game = null;

  const canvas = h('canvas', { class: 'game-canvas', 'aria-label': '게임 영역' });
  const pauseButton = h('button', { class: 'btn btn-small', type: 'button' }, '일시 정지');
  const abandonButton = h('button', { class: 'btn btn-small btn-danger', type: 'button' }, '포기');
  const frame = h('div', { class: 'game-frame' }, canvas);
  const element = h(
    'main',
    { class: `game-screen battle${touch ? ' touch' : ''}` },
    h('header', { class: 'game-header battle-bar' }, pauseButton, h('h1', { class: 'game-title battle-title' }, dungeon?.name ?? '전투'), abandonButton),
    frame,
    h('p', { class: 'controls' }, 'WASD/방향키 이동 · Space 대시 · Esc 일시 정지 · R 경계 회복 · 1/2/3 보상 선택'),
  );

  document.documentElement.classList.add('in-battle'); // 전투 중에는 당겨서 새로고침 같은 브라우저 제스처를 막는다.

  // 캔버스가 화면에 붙은 뒤에 게임을 시작해야 크기를 잴 수 있다(ScreenManager가 element를 붙인 직후 실행).
  queueMicrotask(() => {
    if (abort.signal.aborted) return;
    game = startGame(canvas, {
      autoStart: true,
      dungeonId,
      hudTop: touch,
      modifiers: app.profile.modifiers(),
      onRunEnd: (result) => {
        endTimer = setTimeout(() => app.finishRun(result), END_SCREEN_DELAY_MS);
      },
    });
    if (touch) {
      controls = createTouchControls({ onMove: (x, y) => game.setMoveVector(x, y), onDash: () => game.requestDash() });
      frame.append(controls.element);
    }
    watchState();
  });

  // 게임 상태를 화면 요소에 반영한다: 버튼 글자, 터치 조작 표시/숨김, 정지·보상 화면에서 조이스틱 놓기, 대시 쿨다운 표시.
  function watchState() {
    if (abort.signal.aborted || !game) return;
    const state = game.state;
    pauseButton.textContent = state === 'paused' ? '재개' : '일시 정지';
    pauseButton.disabled = !(state === 'playing' || state === 'paused');
    abandonButton.disabled = !(state === 'playing' || state === 'paused');
    if (controls) {
      controls.element.dataset.state = state;
      if (state !== 'playing') controls.reset(); // 정지/보상/종료 중에는 조이스틱을 놓은 상태로 되돌려 아래 화면을 막지 않는다.
      controls.setDashCooldown(game.dashCooldownRatio);
    }
    watchFrame = requestAnimationFrame(watchState);
  }

  pauseButton.addEventListener('click', () => game?.togglePause(), { signal: abort.signal });
  abandonButton.addEventListener(
    'click',
    async () => {
      if (!game) return;
      const wasPlaying = game.state === 'playing';
      if (wasPlaying) game.togglePause(); // 확인 창이 떠 있는 동안 게임이 진행되지 않게 먼저 멈춘다.
      const yes = await confirmDialog({ title: '출정 포기', message: '지금까지의 처치 수와 생존 시간으로 이번 출정을 끝냅니다. 포기할까요?', confirmLabel: '포기', cancelLabel: '계속 싸우기', danger: true });
      if (abort.signal.aborted) return;
      if (yes) game.abandon();
      else if (wasPlaying && game.state === 'paused') game.togglePause();
    },
    { signal: abort.signal },
  );
  // 일시 정지 버튼이 키보드 포커스를 가져가 Space/Enter가 버튼을 누르지 않게, 누른 뒤 포커스를 돌려준다.
  element.addEventListener('pointerup', () => document.activeElement?.blur?.(), { signal: abort.signal });

  return {
    element,
    destroy() {
      abort.abort();
      clearTimeout(endTimer);
      cancelAnimationFrame(watchFrame);
      controls?.destroy();
      game?.destroy();
      document.documentElement.classList.remove('in-battle');
    },
  };
}
