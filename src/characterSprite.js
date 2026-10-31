// 달(Dal) 8방향 스프라이트: 시트 불러오기, 방향별 그리기, 불러오기 실패 시 null.
// 시트는 tools/make-dal-sheet.ps1이 만든 192x96 PNG(48x48 칸, 4열 x 2행)이며 대기 포즈만 있다.
// 칸 배치는 direction.js의 DAL_SHEET_LAYOUT을 따른다. 주인공 기존 스프라이트(sprite.js)와 별개 모듈이다.

import { DIRECTION_NAMES, dalSheetCell } from './direction.js';

export const DAL_CELL = 48; // 한 칸의 크기(px)
export const DAL_COLS = 4;
export const DAL_ROWS = 2;
export const DAL_ANCHOR_X = 24; // 칸 안에서 발의 가로 중심(모든 방향이 같은 값으로 정렬되어 있다)
export const DAL_FEET_Y = 47; // 칸 안에서 발바닥 선(맨 아래 불투명 줄이 46번째 줄이다)

const IMAGE_PATH = 'assets/characters/dal/dal_8dir_48.png';

// 이동 한계 계산에 쓰는 값(clampPlayer): 그림이 월드 가장자리에서 잘리지 않도록 칸 크기로 넉넉히 잡는다.
export const DAL_HALF_WIDTH = DAL_CELL / 2;
export const DAL_HEIGHT = DAL_FEET_Y;

// 걷기 프레임이 없어서 이동 중에만 1px씩 위아래로 흔든다(미끄러지는 느낌을 줄이는 임시 표현).
export const DAL_BOB_FPS = 10;

// 방향 인덱스(direction.js의 DIRECTION_NAMES 기준)의 시트 안 원본 영역
export function dalCellRect(directionIndex) {
  const { col, row } = dalSheetCell(DIRECTION_NAMES[directionIndex]);
  return { sx: col * DAL_CELL, sy: row * DAL_CELL, sw: DAL_CELL, sh: DAL_CELL };
}

// 이동 중 위아래 흔들림(px). 멈췄으면 0. 걷기 시간(walkTime)은 멈추면 0으로 돌아간다.
export function dalBob(moving, walkTime) {
  if (!moving || !(walkTime > 0)) return 0;
  return Math.floor(walkTime * DAL_BOB_FPS) % 2 === 1 ? 1 : 0;
}

// (x, feetY): 발밑 기준점의 월드 좌표. 화면에서 정수 픽셀에 맞춰(snap: { camX, camY, dpr }) 도트가 번지지 않게 한다.
export function dalDrawPosition(x, feetY, bob = 0, snap = null) {
  let dx = x - DAL_ANCHOR_X;
  let dy = feetY - DAL_FEET_Y - bob;
  if (snap) {
    dx = Math.round((dx - snap.camX) * snap.dpr) / snap.dpr + snap.camX;
    dy = Math.round((dy - snap.camY) * snap.dpr) / snap.dpr + snap.camY;
  }
  return { dx, dy };
}

function defaultLoadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${url}`));
    image.src = url;
  });
}

// 성공하면 { draw, halfWidth, height }, 실패하면 null(호출한 쪽에서 기존 스프라이트로 대체).
// options는 테스트에서 불러오기와 캔버스 만들기를 바꿔 끼우기 위한 것이다.
export async function loadDalSprite(options = {}) {
  const {
    baseUrl = import.meta.env?.BASE_URL ?? '/',
    loadImage = defaultLoadImage,
    createCanvas = () => document.createElement('canvas'),
    warn = (...args) => console.warn(...args),
  } = options;

  try {
    const image = await loadImage(`${baseUrl}${IMAGE_PATH}`);
    if (image.width !== DAL_CELL * DAL_COLS || image.height !== DAL_CELL * DAL_ROWS) {
      throw new Error(`시트 크기가 ${DAL_CELL * DAL_COLS}x${DAL_CELL * DAL_ROWS}가 아닙니다(${image.width}x${image.height})`);
    }

    // 칸마다 따로 오려 둔다. 이웃 칸 픽셀이 섞이는 것을 막는다.
    const frames = DIRECTION_NAMES.map((_, index) => {
      const { sx, sy, sw, sh } = dalCellRect(index);
      const canvas = createCanvas();
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      return canvas;
    });

    function draw(ctx, directionIndex, x, feetY, bob = 0, snap = null) {
      const { dx, dy } = dalDrawPosition(x, feetY, bob, snap);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frames[directionIndex] ?? frames[0], dx, dy, DAL_CELL, DAL_CELL);
      ctx.restore();
    }

    return { draw, halfWidth: DAL_HALF_WIDTH, height: DAL_HEIGHT };
  } catch (error) {
    warn('[dal] 달 스프라이트를 사용할 수 없어 기존 주인공 스프라이트로 대체합니다:', error.message);
    return null;
  }
}
