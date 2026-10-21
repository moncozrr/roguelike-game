// 보상 카드 화면의 "계산" 부분: 카드 배치, 클릭 판정, 키 번호 -> 카드 위치, 글자 줄바꿈. 화면(DOM/Canvas)에 의존하지 않는다.
// 그리기는 rewardCardsView.js가, 보상 후보 생성과 적용은 rewards.js가 맡는다. 배치와 클릭 판정이 같은 함수(computeCardLayout)를
// 쓰므로 "그려진 카드 영역 = 클릭되는 영역"이 항상 일치한다. 일반 레벨업과 이후 경계 강화 화면이 함께 쓴다.

export const CARD_LIMITS = {
  minWidth: 170,
  maxWidth: 240,
  minHeight: 230,
  maxHeight: 320,
  widthRatio: 0.22, // 화면 너비 대비 카드 너비(최소/최대로 제한)
  heightRatio: 1.35, // 카드 너비 대비 높이(최소/최대로 제한)
  minGap: 12,
  maxGap: 24,
  gapRatio: 0.02,
  edgeMargin: 16, // 카드 묶음과 화면 좌우 가장자리 사이 최소 여백
  maxCards: 3,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// 카드 count장(1~3)의 사각형을 화면 중앙에 가로로 배치한다. 왼쪽부터 순서대로 [{ x, y, width, height }].
// view: { width, height }(CSS 픽셀). 카드 크기는 화면 크기에 따라 조절되지만 최소/최대 크기로 제한된다.
// 화면이 너무 좁아 최소 크기로는 들어가지 않으면 가장자리 여백 안에 들어가도록 카드 너비만 줄인다(화면 밖으로 나가지 않는 것이 우선).
export function computeCardLayout(count, view, limits = CARD_LIMITS) {
  const n = Math.min(Math.max(Math.trunc(count) || 0, 0), limits.maxCards);
  if (n === 0) return [];
  const gap = clamp(view.width * limits.gapRatio, limits.minGap, limits.maxGap);
  let width = clamp(view.width * limits.widthRatio, limits.minWidth, limits.maxWidth);
  const available = view.width - limits.edgeMargin * 2;
  if (n * width + (n - 1) * gap > available) width = Math.max((available - (n - 1) * gap) / n, 1);
  const height = clamp(width * limits.heightRatio, limits.minHeight, limits.maxHeight);
  const totalWidth = n * width + (n - 1) * gap;
  const left = (view.width - totalWidth) / 2;
  const top = (view.height - height) / 2 + 24; // 제목이 들어갈 자리를 위에 둔다
  return Array.from({ length: n }, (_, i) => ({ x: left + i * (width + gap), y: top, width, height }));
}

// 점(x, y)이 몇 번째 카드 안에 있는지(경계 포함). 어느 카드도 아니면 -1.
export function hitTestCards(layout, x, y) {
  for (let i = 0; i < layout.length; i++) {
    const r = layout[i];
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return i;
  }
  return -1;
}

// 마우스 이벤트 좌표를 게임 캔버스 좌표(CSS 픽셀)로 바꾼다. rect: canvas.getBoundingClientRect(), view: 게임이 쓰는 화면 크기.
// 캔버스가 CSS로 늘어나거나 줄어든 경우를 위해 rect 크기 대비 view 크기 비율을 곱한다.
export function pointerToCanvas(event, rect, view) {
  const scaleX = rect.width > 0 ? view.width / rect.width : 1;
  const scaleY = rect.height > 0 ? view.height / rect.height : 1;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

// 키 -> 카드 위치(왼쪽부터 0, 1, 2). 1/2/3 키(숫자 키패드 포함)만 해당하고 그 밖의 키는 null.
const KEY_TO_CARD = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
export function keyToCardIndex(code) {
  return Object.hasOwn(KEY_TO_CARD, code) ? KEY_TO_CARD[code] : null;
}

// 제목을 놓을 위치(카드 위 중앙). 카드가 없으면 화면 중앙 근처.
export function titleAnchor(layout, view) {
  const top = layout.length > 0 ? layout[0].y : view.height / 2;
  return { x: view.width / 2, y: Math.max(top - 44, 28) };
}

// maxWidth 안에 들어가도록 글자를 줄로 나눈다. measure(text) -> 글자 너비(px).
// 공백 단위로 나누고, 한 단어가 한 줄보다 길면 글자 단위로 자른다.
export function wrapText(measure, text, maxWidth) {
  const lines = [];
  let line = '';
  const push = () => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    push();
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    for (const char of word) {
      if (line && measure(line + char) > maxWidth) push();
      line += char;
    }
  }
  push();
  return lines;
}
