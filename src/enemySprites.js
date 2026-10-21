// 적(원혼) 스프라이트: 이미지 로딩, 방향별 선택, 그리기, 로딩 실패 대체.
// 주인공 스프라이트(sprite.js)와 별개 모듈이며, 이미지가 없거나 로딩 중이어도 적 로직은 영향을 받지 않는다.
// 왼쪽/오른쪽 이미지는 서로 다른 그림이므로 한 장을 뒤집어 쓰지 않는다.

import { ENEMY } from './config.js';

export const ENEMY_SPRITE_PATHS = {
  right: 'assets/sprites/enemies/wonyon/wonyon_right_48.png',
  left: 'assets/sprites/enemies/wonyon/wonyon_left_48.png',
};

// 알파(투명도) 값이 있는 픽셀의 가로 무게중심(원본 픽셀 단위). 그림이 없으면 null.
// 방향이 바뀌어도 몸통이 튀지 않도록 이 값을 가로 기준점으로 쓴다(주인공 스프라이트와 같은 접근).
export function alphaCentroidX(rgba, width, height) {
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      sum += alpha * (x + 0.5);
      mass += alpha;
    }
  }
  return mass > 0 ? sum / mass : null;
}

// sprites: { left, right } (각각 불러온 스프라이트 또는 null). 원하는 방향 이미지가 있으면 그것을,
// 없으면 다른 방향 이미지로 대체하고, 둘 다 없으면 null(원형 대체 그리기)을 돌려준다.
export function pickSprite(sprites, facing) {
  const wanted = facing === 'left' ? sprites.left : sprites.right;
  if (wanted) return wanted;
  return (facing === 'left' ? sprites.right : sprites.left) ?? null;
}

// 브라우저 기본 이미지 로더
function defaultLoadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${url}`));
    image.src = url;
  });
}

// 브라우저 기본 무게중심 계산. 픽셀을 읽을 수 없으면 가로 중앙을 쓴다.
function defaultMeasureAnchorX(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    const { data } = c.getImageData(0, 0, image.width, image.height);
    return alphaCentroidX(data, image.width, image.height) ?? image.width / 2;
  } catch {
    return image.width / 2;
  }
}

// options는 테스트에서 로더 등을 바꿔 끼우기 위한 것이다. 평소에는 기본값을 쓴다.
export function createEnemySprites(options = {}) {
  const {
    baseUrl = import.meta.env?.BASE_URL ?? '/',
    paths = ENEMY_SPRITE_PATHS,
    loadImage = defaultLoadImage,
    measureAnchorX = defaultMeasureAnchorX,
    displaySize = ENEMY.displaySize,
    sourceSize = ENEMY.sourceSize,
    fallbackRadius = ENEMY.displaySize * ENEMY.collisionRadiusRatio,
    warn = (...args) => console.warn(...args),
  } = options;

  const sprites = { left: null, right: null }; // 불러오기에 성공한 방향별 스프라이트
  let status = 'loading'; // 'loading' | 'ready'(둘 다 성공) | 'partial'(한 장만 성공) | 'failed'(둘 다 실패)
  let loadPromise = null;

  async function loadOne(direction) {
    const url = `${baseUrl}${paths[direction]}`;
    try {
      const image = await loadImage(url);
      if (!(image.width > 0) || !(image.height > 0)) throw new Error('이미지 크기가 0입니다');
      if (image.width !== sourceSize || image.height !== sourceSize) {
        warn(`[enemy] ${direction} 이미지 크기가 ${sourceSize}x${sourceSize}가 아닙니다(${image.width}x${image.height}). 실제 크기를 기준으로 그립니다.`);
      }
      sprites[direction] = { image, width: image.width, height: image.height, anchorX: measureAnchorX(image) };
    } catch (error) {
      warn(`[enemy] ${direction} 이미지를 사용할 수 없습니다:`, error.message);
      sprites[direction] = null;
    }
  }

  // 한 번만 불러온다(여러 번 불러도 같은 결과를 돌려줌). 실패해도 예외를 던지지 않는다.
  function load() {
    if (!loadPromise) {
      loadPromise = Promise.all([loadOne('right'), loadOne('left')]).then(() => {
        if (sprites.left && sprites.right) status = 'ready';
        else if (sprites.left || sprites.right) {
          status = 'partial';
          warn('[enemy] 이미지 한 장만 불러와서 양쪽 방향에 같은 이미지를 사용합니다.');
        } else {
          status = 'failed';
          warn('[enemy] 이미지를 모두 불러오지 못해 임시 원형으로 표시합니다.');
        }
        return status;
      });
    }
    return loadPromise;
  }

  function drawFallback(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 30, 50, 0.85)';
    ctx.strokeStyle = 'rgba(64, 200, 190, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, fallbackRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // (x, y): 적의 월드 좌표(충돌 원의 중심). facing: 'left' | 'right'.
  // snap: { camX, camY, dpr } 를 주면 화면에서 정수 픽셀에 맞춰 그린다(도트가 번져 보이지 않게).
  function draw(ctx, x, y, facing, snap = null) {
    const sprite = pickSprite(sprites, facing);
    if (!sprite) {
      drawFallback(ctx, x, y);
      return;
    }
    const scale = displaySize / sprite.width; // 원본 크기와 표시 크기는 별개
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    let dx = x - sprite.anchorX * scale;
    let dy = y - h / 2;
    if (snap) {
      dx = Math.round((dx - snap.camX) * snap.dpr) / snap.dpr + snap.camX;
      dy = Math.round((dy - snap.camY) * snap.dpr) / snap.dpr + snap.camY;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite.image, dx, dy, w, h);
    ctx.restore();
  }

  return {
    load,
    draw,
    select: (facing) => pickSprite(sprites, facing),
    get status() {
      return status;
    },
    get sprites() {
      return sprites;
    },
  };
}
