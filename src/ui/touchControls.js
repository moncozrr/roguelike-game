// 모바일 터치 조작: 왼쪽 아래 가상 조이스틱과 오른쪽 아래 대시 버튼(화면 요소).
// 입력 장치 처리만 맡고 게임 규칙은 모른다. 게임에는 onMove(x, y)와 onDash() 두 콜백으로만 전달한다.
// Pointer Events로 손가락마다 pointerId를 따로 추적하므로, 조이스틱과 대시 버튼을 동시에 눌러도 서로 방해하지 않는다.
// 화면 좌표(CSS 픽셀)는 이 파일 안에서만 쓰고, 게임에는 -1~1 방향 값만 넘긴다.

import { h } from './dom.js';
import { joystickVector } from '../touchInput.js';

export function createTouchControls({ onMove, onDash }) {
  const abort = new AbortController();
  const listen = { signal: abort.signal };

  // ----- 조이스틱 -----
  const knob = h('div', { class: 'joystick-knob' });
  const base = h('div', { class: 'joystick-base', 'aria-label': '이동 조이스틱', role: 'application' }, knob);
  let activePointer = null; // 조이스틱을 쥐고 있는 손가락의 pointerId. 없으면 null.

  function moveFromEvent(e) {
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    const v = joystickVector(e.clientX - (rect.left + radius), e.clientY - (rect.top + rect.height / 2), radius);
    knob.style.transform = `translate(${v.x * radius * 0.6}px, ${v.y * radius * 0.6}px)`; // 손잡이는 반지름의 60%까지만 움직여 베이스 안에 머문다.
    onMove(v.x, v.y);
  }

  function releaseJoystick() {
    activePointer = null;
    knob.style.transform = '';
    onMove(0, 0);
  }

  base.addEventListener(
    'pointerdown',
    (e) => {
      if (activePointer !== null) return; // 이미 다른 손가락이 쥐고 있으면 무시
      e.preventDefault();
      activePointer = e.pointerId;
      try {
        base.setPointerCapture(e.pointerId); // 손가락이 베이스 밖으로 나가도 계속 추적
      } catch {
        // 일부 환경은 캡처를 지원하지 않는다. window 이벤트로도 받으므로 계속 진행한다.
      }
      moveFromEvent(e);
    },
    listen,
  );
  base.addEventListener('pointermove', (e) => e.pointerId === activePointer && moveFromEvent(e), listen);
  // 손가락을 떼거나(up), 시스템이 터치를 가져가거나(cancel), 캡처를 잃으면 반드시 멈춘다.
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    base.addEventListener(type, (e) => e.pointerId === activePointer && releaseJoystick(), listen);
  }

  // ----- 대시 버튼 -----
  // pointerdown 한 번에 대시 한 번만 요청한다. 누르고 있어도 반복되지 않는다(쿨다운 규칙은 게임이 처리).
  const dashButton = h('button', { class: 'dash-button', type: 'button', 'aria-label': '대시' }, '대시');
  dashButton.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      onDash();
    },
    listen,
  );

  const element = h('div', { class: 'touch-controls' }, base, dashButton);
  // 길게 눌러 나오는 메뉴(복사 등)와 스크롤/확대 제스처를 막는다.
  element.addEventListener('contextmenu', (e) => e.preventDefault(), listen);

  return {
    element,
    // 정지, 보상 화면, 게임 오버 등에서 조이스틱을 즉시 놓은 상태로 되돌린다.
    reset() {
      if (activePointer !== null) releaseJoystick();
    },
    // 대시 쿨다운 표시: ratio 0(사용 가능) ~ 1(방금 사용)
    setDashCooldown(ratio) {
      dashButton.style.setProperty('--cooldown', String(Math.max(0, Math.min(1, ratio))));
      dashButton.classList.toggle('cooling', ratio > 0);
    },
    destroy() {
      abort.abort();
      onMove(0, 0);
      element.remove();
    },
  };
}
