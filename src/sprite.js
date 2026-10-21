// 캐릭터 스프라이트 시트를 불러오고 프레임 단위로 그리는 모듈.
// 프레임 좌표는 protagonist-frames.json에서 읽고, 상태가 "확정"인 프레임만 사용한다.

const IMAGE_URL = `${import.meta.env.BASE_URL}assets/characters/protagonist-temp.png`;
const FRAMES_URL = `${import.meta.env.BASE_URL}assets/characters/protagonist-frames.json`;

export const SPRITE_HEIGHT = 48; // 화면에 표시할 캐릭터 높이(px). 너비는 같은 배율로 따라간다(이전 96px의 50%). 충돌 반지름(PLAYER.radius)과는 별개다.
export const WALK_FPS = 10; // 걷기 애니메이션 초당 프레임 수

const WALK_FRAME_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const DASH_FRAME_NUMBERS = [3, 4, 5, 6]; // 달리기 8프레임 중 중간 부분

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${url}`));
    image.src = url;
  });
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`JSON을 불러오지 못했습니다: ${url} (${response.status})`);
  return response.json();
}

// JSON에서 번호(index)로 프레임을 찾는다. 없거나 확정이 아니거나 좌표가 이상하면 오류.
function pickFrames(animation, numbers, name, image) {
  return numbers.map((number) => {
    const f = animation?.frames?.find((frame) => frame.index === number);
    const valid =
      f &&
      f.status === '확정' &&
      [f.x, f.y, f.width, f.height].every(Number.isFinite) &&
      f.width > 0 &&
      f.height > 0 &&
      f.x >= 0 &&
      f.y >= 0 &&
      f.x + f.width <= image.width &&
      f.y + f.height <= image.height;
    if (!valid) throw new Error(`${name} ${number}번 프레임을 사용할 수 없습니다(없음, 미확정, 또는 좌표 오류)`);
    return f;
  });
}

// 시트에서 프레임 하나만 따로 오려 둔다. 이웃 프레임 픽셀이 축소할 때 섞이는 것을 막는다.
// facesRight: 원본 그림이 오른쪽을 보고 있는지(걷기는 왼쪽, 달리기는 오른쪽을 본다).
function cropFrame(image, f, facesRight) {
  const canvas = document.createElement('canvas');
  canvas.width = f.width;
  canvas.height = f.height;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.drawImage(image, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
  return { canvas, width: f.width, height: f.height, anchorX: findAnchorX(c, f), facesRight };
}

// 가로 기준점: 불투명도로 가중한 무게중심. 칼이나 머리카락이 뻗어도 박스 중앙보다 덜 흔들린다.
function findAnchorX(c, f) {
  try {
    const { data } = c.getImageData(0, 0, f.width, f.height);
    let sum = 0;
    let mass = 0;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const alpha = data[(y * f.width + x) * 4 + 3];
        sum += alpha * (x + 0.5);
        mass += alpha;
      }
    }
    if (mass > 0) return sum / mass;
  } catch {
    // 픽셀을 읽을 수 없으면 아래 대체값 사용
  }
  return Number.isFinite(f.bboxCenterX) ? f.bboxCenterX - f.x : f.width / 2;
}

// 성공하면 { walkFrames, dashFrames, draw, halfWidth, height }, 실패하면 null(호출한 쪽에서 원형 표시로 대체).
export async function loadSprite() {
  try {
    const [image, data] = await Promise.all([loadImage(IMAGE_URL), loadJson(FRAMES_URL)]);
    const walkFrames = pickFrames(data.animations?.walk, WALK_FRAME_NUMBERS, '걷기', image).map((f) => cropFrame(image, f, false));
    const dashFrames = pickFrames(data.animations?.run, DASH_FRAME_NUMBERS, '달리기', image).map((f) => cropFrame(image, f, true));

    // 모든 프레임에 같은 배율을 적용해야 프레임마다 크기가 달라 보이지 않는다.
    const allFrames = walkFrames.concat(dashFrames);
    const maxHeight = Math.max(...allFrames.map((f) => f.height));
    const scale = SPRITE_HEIGHT / maxHeight;

    // 화면 밖으로 잘리지 않게 이동 한계를 정할 때 쓰는 값. 프레임마다 달라지지 않도록 전체 프레임 중
    // 가장 큰 값을 쓰고, 좌우 반전해도 안전하도록 기준점에서 더 먼 쪽 너비를 쓴다.
    const halfWidth = Math.max(...allFrames.map((f) => Math.max(f.anchorX, f.width - f.anchorX))) * scale;

    // (x, feetY)가 캐릭터의 발밑 기준점. 원본이 보는 방향과 원하는 방향이 다를 때만 좌우 반전한다.
    function draw(ctx, frame, x, feetY, facingRight) {
      const w = frame.width * scale;
      const h = frame.height * scale;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(x, feetY);
      if (facingRight !== frame.facesRight) ctx.scale(-1, 1);
      ctx.drawImage(frame.canvas, -frame.anchorX * scale, -h, w, h);
      ctx.restore();
    }

    return { walkFrames, dashFrames, draw, halfWidth, height: SPRITE_HEIGHT };
  } catch (error) {
    console.warn('[sprite] 스프라이트를 사용할 수 없어 원형 플레이어로 대체합니다:', error.message);
    return null;
  }
}
