// 단계 9: 보상 카드 배치, 클릭 판정, 키 번호, 글자 줄바꿈(순수 계산). 픽셀 모양은 검증하지 않는다.
// 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIMITS, computeCardLayout, hitTestCards, keyToCardIndex, pointerToCanvas, titleAnchor, wrapText } from '../src/rewardCards.js';
import { createWeaponSystem } from '../src/weapons.js';
import { createExperience } from '../src/experience.js';
import { listValidRewards } from '../src/rewards.js';

const VIEWS = [
  { width: 1200, height: 800 },
  { width: 800, height: 600 },
  { width: 640, height: 480 },
  { width: 400, height: 700 },
  { width: 320, height: 568 },
];

test('카드 장수: 최대 3장이고 1장/2장이면 그 장수만 배치된다(가짜 카드 없음)', () => {
  const view = VIEWS[1];
  assert.equal(computeCardLayout(0, view).length, 0);
  assert.equal(computeCardLayout(1, view).length, 1);
  assert.equal(computeCardLayout(2, view).length, 2);
  assert.equal(computeCardLayout(3, view).length, 3);
  assert.equal(computeCardLayout(4, view).length, 3); // 4장 이상이 들어와도 3장까지만
  assert.equal(computeCardLayout(99, view).length, 3);
  assert.equal(computeCardLayout(-1, view).length, 0);
  assert.equal(computeCardLayout(NaN, view).length, 0);
});

test('카드는 화면 중앙에 가로로 나란히 놓이고, 왼쪽부터 순서대로이며 서로 겹치지 않는다', () => {
  for (const view of VIEWS) {
    for (const n of [1, 2, 3]) {
      const layout = computeCardLayout(n, view);
      const left = layout[0].x;
      const right = layout[n - 1].x + layout[n - 1].width;
      assert.ok(Math.abs(left + right - view.width) < 1e-9, `가로 중앙: ${view.width}px ${n}장`);
      assert.ok(layout.every((r) => r.y === layout[0].y && r.height === layout[0].height && r.width === layout[0].width));
      for (let i = 1; i < n; i++) assert.ok(layout[i].x >= layout[i - 1].x + layout[i - 1].width, '카드가 겹친다');
      assert.ok(left >= CARD_LIMITS.edgeMargin - 1e-9, `${view.width}px ${n}장: 왼쪽이 화면 밖`);
      assert.ok(right <= view.width - CARD_LIMITS.edgeMargin + 1e-9, `${view.width}px ${n}장: 오른쪽이 화면 밖`);
      assert.ok(layout[0].y >= 0 && layout[0].y + layout[0].height <= view.height, `${view.width}x${view.height}: 세로 범위`);
    }
  }
});

test('카드 크기는 화면에 따라 조절되지만 최소/최대로 제한된다(화면에 들어갈 수 있는 경우)', () => {
  for (const view of [{ width: 1200, height: 800 }, { width: 2400, height: 1400 }, { width: 800, height: 600 }, { width: 900, height: 600 }]) {
    const [r] = computeCardLayout(3, view);
    assert.ok(r.width >= CARD_LIMITS.minWidth && r.width <= CARD_LIMITS.maxWidth, `${view.width}px 너비 ${r.width}`);
    assert.ok(r.height >= CARD_LIMITS.minHeight && r.height <= CARD_LIMITS.maxHeight, `${view.width}px 높이 ${r.height}`);
  }
  // 큰 화면에서는 최대 크기를 넘지 않는다
  assert.equal(computeCardLayout(3, { width: 4000, height: 2000 })[0].width, CARD_LIMITS.maxWidth);
  // 더 큰 화면일수록 카드가 같거나 커진다
  assert.ok(computeCardLayout(3, { width: 1000, height: 700 })[0].width >= computeCardLayout(3, { width: 900, height: 700 })[0].width);
  // 매우 좁은 화면에서는 화면 밖으로 나가지 않는 것이 우선(최소 너비보다 줄어든다)
  assert.ok(computeCardLayout(3, { width: 320, height: 568 })[0].width < CARD_LIMITS.minWidth);
});

test('클릭 판정: 카드 안은 해당 번호, 위/아래 바깥과 카드 사이 틈은 -1', () => {
  for (const view of VIEWS) {
    for (const n of [1, 2, 3]) {
      const layout = computeCardLayout(n, view);
      layout.forEach((r, i) => {
        assert.equal(hitTestCards(layout, r.x + r.width / 2, r.y + r.height / 2), i); // 중앙
        assert.equal(hitTestCards(layout, r.x + 1, r.y + 1), i); // 모서리 안쪽
        assert.equal(hitTestCards(layout, r.x + r.width - 1, r.y + r.height - 1), i);
        assert.equal(hitTestCards(layout, r.x + r.width / 2, r.y - 1), -1); // 위쪽 바깥
        assert.equal(hitTestCards(layout, r.x + r.width / 2, r.y + r.height + 1), -1); // 아래쪽 바깥
      });
      assert.equal(hitTestCards(layout, 0, 0), -1);
      assert.equal(hitTestCards(layout, view.width, view.height), -1);
    }
  }
  // 카드 사이 틈
  const layout = computeCardLayout(3, VIEWS[1]);
  const gapX = (layout[0].x + layout[0].width + layout[1].x) / 2;
  assert.equal(hitTestCards(layout, gapX, layout[0].y + 10), -1);
  // 2장일 때 오른쪽 세 번째 자리는 카드가 아니다
  const two = computeCardLayout(2, VIEWS[1]);
  assert.equal(hitTestCards(two, two[1].x + two[1].width + 40, two[0].y + 10), -1);
  assert.equal(hitTestCards([], 100, 100), -1);
});

test('마우스 좌표 변환: 캔버스 위치(left/top)와 CSS 크기 차이를 보정한다', () => {
  const view = { width: 800, height: 600 };
  assert.deepEqual(pointerToCanvas({ clientX: 150, clientY: 90 }, { left: 100, top: 50, width: 800, height: 600 }, view), { x: 50, y: 40 });
  // 캔버스가 CSS로 절반 크기로 줄어 표시된 경우: 화면 좌표 1px = 게임 좌표 2px
  assert.deepEqual(pointerToCanvas({ clientX: 150, clientY: 90 }, { left: 100, top: 50, width: 400, height: 300 }, view), { x: 100, y: 80 });
  // 크기가 0인 비정상 값에서도 NaN이 나오지 않는다
  const odd = pointerToCanvas({ clientX: 5, clientY: 5 }, { left: 0, top: 0, width: 0, height: 0 }, view);
  assert.ok(Number.isFinite(odd.x) && Number.isFinite(odd.y));
});

test('좌표 변환 + 배치 일치: 카드 중앙을 클릭하면 어떤 캔버스 위치/배율에서도 그 카드가 맞는다', () => {
  const view = { width: 800, height: 600 };
  const layout = computeCardLayout(3, view);
  for (const rect of [{ left: 0, top: 0, width: 800, height: 600 }, { left: 37, top: 91, width: 800, height: 600 }, { left: 20, top: 10, width: 400, height: 300 }]) {
    layout.forEach((r, i) => {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const event = { clientX: rect.left + (cx * rect.width) / view.width, clientY: rect.top + (cy * rect.height) / view.height };
      const p = pointerToCanvas(event, rect, view);
      assert.equal(hitTestCards(layout, p.x, p.y), i);
    });
  }
});

test('키 번호: 1/2/3(숫자 키패드 포함)은 왼쪽부터 0/1/2, 그 밖의 키는 null', () => {
  assert.deepEqual(['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].map(keyToCardIndex), [0, 1, 2, 0, 1, 2]);
  for (const code of ['Digit0', 'Digit4', 'Numpad4', 'KeyA', 'Enter', 'Space', 'constructor', 'toString', '__proto__', '', undefined]) {
    assert.equal(keyToCardIndex(code), null, String(code));
  }
});

test('제목 위치는 카드 위쪽 가운데이고 화면 안에 있다', () => {
  for (const view of VIEWS) {
    const layout = computeCardLayout(3, view);
    const t = titleAnchor(layout, view);
    assert.equal(t.x, view.width / 2);
    assert.ok(t.y >= 28 && t.y < layout[0].y);
  }
  assert.ok(titleAnchor([], VIEWS[1]).y >= 28);
});

test('글자 줄바꿈: 너비 안에서 나누고, 긴 단어는 글자 단위로 자르며, 내용은 보존된다', () => {
  const measure = (t) => t.length * 10;
  assert.deepEqual(wrapText(measure, 'aaa bbb ccc', 70), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrapText(measure, '한 줄', 200), ['한 줄']);
  assert.deepEqual(wrapText(measure, '', 100), []);
  assert.deepEqual(wrapText(measure, 'abcdefghij', 40), ['abcd', 'efgh', 'ij']);
  for (const line of wrapText(measure, '날아갔다 돌아오며 경로의 적을 공격 합니다 길게 길게', 90)) assert.ok(measure(line) <= 90);
  assert.equal(wrapText(measure, '가까운 적에서 시작해 최대 3마리에 연쇄', 100).join(' '), '가까운 적에서 시작해 최대 3마리에 연쇄');
});

test('카드에 표시되는 값은 보상 데이터에서 온다: 유형, 이름, 효과 수치, 설명이 모두 있고 실제 상태와 일치한다', () => {
  const weapons = createWeaponSystem();
  const experience = createExperience();
  const rewards = listValidRewards({ weapons, experience });
  for (const r of rewards) {
    for (const field of ['category', 'title', 'effect', 'description']) {
      assert.equal(typeof r[field], 'string');
      assert.ok(r[field].length > 0, `${r.kind}:${r.id}의 ${field}가 비어 있다`);
    }
  }
  const upgrade = rewards.find((r) => r.kind === 'weaponUpgrade');
  assert.equal(upgrade.effect, 'Lv.1 → Lv.2 · 피해 3 → 3.6'); // shard: 3 -> 3 × 1.2
  const magnet = rewards.find((r) => r.kind === 'magnet');
  assert.equal(magnet.effect, `줍기 반경 ${experience.pickupRadius}px → ${experience.pickupRadius + 6}px`);
  // 강화를 적용하면 다음 카드의 수치가 실제 상태를 따라 바뀐다
  weapons.upgrade('shard');
  experience.upgradeMagnet();
  const next = listValidRewards({ weapons, experience });
  assert.equal(next.find((r) => r.kind === 'weaponUpgrade').effect, 'Lv.2 → Lv.3 · 피해 3.6 → 4.2');
  assert.equal(next.find((r) => r.kind === 'magnet').effect, '줍기 반경 66px → 72px');
});
