// game.js를 브라우저 없이 실제로 실행하는 통합 테스트용 도구(추가 의존성 없음).
//   - Vite의 ssrLoadModule로 src/game.js를 불러온다. 그래서 import.meta.env 같은 Vite 전용 코드도 그대로 동작한다.
//   - window/document/canvas/requestAnimationFrame 등 브라우저 객체는 가짜로 대신하고, 프레임은 테스트가 직접 진행한다.
//   - 키 입력은 game.js가 등록한 keydown/keyup 리스너를 그대로 호출하므로, 실제 사용자 입력과 같은 경로를 지난다.
//   - 실제 그림(픽셀)은 검증하지 않는다. 대신 캔버스에 그려진 글자(fillText)를 기록해서 HUD/오버레이 문구를 확인한다.

import { createServer } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

// 스프라이트 이미지가 없는 테스트 환경에서는 게임이 정상적으로 원형 표시로 대체되며 경고를 남긴다.
// 이 경고는 테스트 함수가 끝난 뒤 비동기로 나올 수 있어서, 이 파일이 불려 온 프로세스에서는 계속 걸러 둔다.
const realWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).startsWith('[enemy]') || String(args[0]).startsWith('[sprite]')) return;
  realWarn(...args);
};

// 재현 가능한 난수(mulberry32). 적 생성 위치와 보상 후보 추첨이 매번 같아진다.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// game.js를 불러온다. simulateProduction이 true면 import.meta.env.DEV를 false로 바꿔서(프로덕션 빌드와 같은 조건)
// 개발 전용 기능이 꺼져 있는지 확인할 수 있다. close()로 서버를 닫는다.
export async function loadGame({ simulateProduction = false } = {}) {
  installGlobals(); // game.js가 불러질 때 window를 읽으므로 먼저 준비한다.
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    root,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: simulateProduction ? { 'import.meta.env.DEV': 'false' } : {},
  });
  const module = await server.ssrLoadModule('/src/game.js');
  return { startGame: module.startGame, close: () => server.close() };
}

const saved = new Map();
function setGlobal(name, value) {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
function restoreGlobals() {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  saved.clear();
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

function installGlobals() {
  const win = createEventTarget();
  win.location = { search: '' };
  win.devicePixelRatio = 1;
  const doc = createEventTarget();
  doc.hidden = false;
  setGlobal('window', win);
  setGlobal('document', doc);
}

// 모든 그리기 함수를 아무것도 안 하는 함수로 대신하고, 글자와 속성 설정만 기록하는 가짜 2D 컨텍스트
function createFakeContext() {
  const texts = [];
  const props = {};
  const noop = () => {};
  const target = {
    texts,
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    fillText: (text) => texts.push(String(text)),
  };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (key in props) return props[key];
      return noop;
    },
    set(t, key, value) {
      props[key] = value;
      return true;
    },
  });
}

// 게임을 하나 실행한다. 테스트가 끝나면 반드시 dispose()를 불러 전역 값을 되돌린다.
//   press/release/tap: 키 입력, step/run/runUntil: 프레임 진행(1/60초 단위), game: 개발 모드 상태 핸들
export function launchGame(startGame, { seed = 1, width = 800, height = 600 } = {}) {
  installGlobals();
  const ctx = createFakeContext();
  const canvas = {
    width,
    height,
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => ctx,
  };
  let fakeNow = 1000;
  let pendingFrame = null;
  setGlobal('performance', { now: () => fakeNow });
  setGlobal('requestAnimationFrame', (callback) => {
    pendingFrame = callback;
    return 1;
  });
  setGlobal('ResizeObserver', class { observe() {} });
  setGlobal('fetch', () => Promise.reject(new Error('테스트 환경에는 파일이 없습니다')));
  setGlobal(
    'Image',
    class {
      set src(value) {
        this._src = value;
        queueMicrotask(() => this.onerror?.());
      }
    },
  );
  const originalRandom = Math.random;
  Math.random = seededRandom(seed);

  startGame(canvas);

  const harness = {
    ctx,
    get game() {
      return window.__nineBorders;
    },
    get texts() {
      return ctx.texts;
    },
    // 키보드 입력. 게임이 window에 등록한 리스너를 그대로 호출한다.
    press(code, { repeat = false, shiftKey = false } = {}) {
      window.dispatch('keydown', { code, repeat, shiftKey, preventDefault() {} });
    },
    release(code) {
      window.dispatch('keyup', { code, preventDefault() {} });
    },
    tap(code, options) {
      harness.press(code, options);
      harness.release(code);
    },
    // 프레임 하나를 진행한다. 글자 기록은 이번 프레임 것만 남긴다.
    step(seconds = 1 / 60) {
      fakeNow += seconds * 1000;
      const callback = pendingFrame;
      pendingFrame = null;
      ctx.texts.length = 0;
      callback(fakeNow);
    },
    run(seconds) {
      const frames = Math.round(seconds * 60);
      for (let i = 0; i < frames; i++) harness.step();
    },
    // 조건이 참이 될 때까지 진행한다. 시간 안에 안 되면 실패로 던진다.
    runUntil(condition, maxSeconds, description = '조건') {
      const frames = Math.round(maxSeconds * 60);
      for (let i = 0; i < frames; i++) {
        if (condition()) return;
        harness.step();
      }
      if (!condition()) throw new Error(`${maxSeconds}초 안에 ${description}이(가) 충족되지 않았습니다`);
    },
    dispose() {
      Math.random = originalRandom;
      restoreGlobals();
    },
  };
  return harness;
}
