// 달 8방향 스프라이트(src/dalSprite.js)와 게임용 시트 파일 검증. 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DAL_CELL,
  DAL_COLS,
  DAL_ROWS,
  DAL_ANCHOR_X,
  DAL_FEET_Y,
  dalCellRect,
  dalBob,
  dalDrawPosition,
  loadDalSprite,
} from '../src/dalSprite.js';
import { DIRECTION_NAMES, dalSheetCell } from '../src/direction.js';

test('게임용 시트: 192x96 PNG 파일이 있다(48px 칸 4열 x 2행)', () => {
  const buf = readFileSync(new URL('../public/assets/characters/dal/dal_8dir_48.png', import.meta.url));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(buf.readUInt32BE(16), DAL_CELL * DAL_COLS);
  assert.equal(buf.readUInt32BE(20), DAL_CELL * DAL_ROWS);
});

test('칸 영역: 8방향이 시트 안에서 서로 다른 48x48 칸이다', () => {
  const seen = new Set();
  DIRECTION_NAMES.forEach((name, index) => {
    const r = dalCellRect(index);
    assert.equal(r.sw, 48);
    assert.equal(r.sh, 48);
    assert.ok(r.sx >= 0 && r.sx + r.sw <= 192 && r.sy >= 0 && r.sy + r.sh <= 96, `${name} 영역이 시트 밖`);
    const cell = dalSheetCell(name);
    assert.equal(r.sx, cell.col * 48);
    assert.equal(r.sy, cell.row * 48);
    seen.add(`${r.sx},${r.sy}`);
  });
  assert.equal(seen.size, 8);
});

test('흔들림: 멈추면 0, 이동 중에는 0.1초마다 0과 1이 번갈아 나온다', () => {
  assert.equal(dalBob(false, 0.25), 0);
  assert.equal(dalBob(true, 0), 0);
  assert.equal(dalBob(true, NaN), 0);
  assert.equal(dalBob(true, 0.05), 0);
  assert.equal(dalBob(true, 0.15), 1);
  assert.equal(dalBob(true, 0.25), 0);
});

test('그릴 위치: 발밑 기준점에서 칸의 발 기준점만큼 빼고, 흔들림은 위로 올린다', () => {
  assert.deepEqual(dalDrawPosition(100, 200), { dx: 100 - DAL_ANCHOR_X, dy: 200 - DAL_FEET_Y });
  assert.deepEqual(dalDrawPosition(100, 200, 1), { dx: 100 - DAL_ANCHOR_X, dy: 200 - DAL_FEET_Y - 1 });
});

test('그릴 위치: 화면 정수 픽셀에 맞춘다(dpr 1과 2)', () => {
  const a = dalDrawPosition(100.4, 200.4, 0, { camX: 0.3, camY: 0.7, dpr: 1 });
  assert.equal(Math.round(a.dx - 0.3), a.dx - 0.3);
  assert.equal(Math.round(a.dy - 0.7), a.dy - 0.7);
  const b = dalDrawPosition(100.3, 200.3, 0, { camX: 0, camY: 0, dpr: 2 });
  assert.equal(b.dx * 2, Math.round(b.dx * 2));
  assert.equal(b.dy * 2, Math.round(b.dy * 2));
});

// 테스트용 가짜 캔버스: 어느 영역을 오려 갔는지 기록한다.
function fakeCanvasFactory(log) {
  return () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => log.push(args.slice(1)) }),
  });
}

test('불러오기 성공: 8방향 칸을 각각 오려 두고, 그릴 때 해당 방향 칸을 쓴다', async () => {
  const log = [];
  const sprite = await loadDalSprite({
    baseUrl: '/',
    loadImage: async () => ({ width: 192, height: 96 }),
    createCanvas: fakeCanvasFactory(log),
    warn: () => assert.fail('경고가 나오면 안 된다'),
  });
  assert.ok(sprite);
  assert.equal(log.length, 8);
  // 칸 순서는 DIRECTION_NAMES 인덱스 순서: 0 right, 1 front-right, 2 front, 3 front-left, ...
  assert.deepEqual(log[0].slice(0, 4), [96, 0, 48, 48]); // right (3열 1행)
  assert.deepEqual(log[2].slice(0, 4), [0, 0, 48, 48]); // front (1열 1행)
  assert.deepEqual(log[3].slice(0, 4), [144, 48, 48, 48]); // front-left (4열 2행)
  assert.deepEqual(log[6].slice(0, 4), [0, 48, 48, 48]); // back (1열 2행)

  const calls = [];
  const ctx = {
    save() {},
    restore() {},
    drawImage: (...args) => calls.push(args),
    set imageSmoothingEnabled(v) {
      calls.push(['smoothing', v]);
    },
  };
  sprite.draw(ctx, 4, 100, 200, 0, null);
  assert.deepEqual(calls[0], ['smoothing', false], '도트가 번지지 않게 보간을 끈다');
  assert.equal(calls[1][1], 100 - DAL_ANCHOR_X);
  assert.equal(calls[1][2], 200 - DAL_FEET_Y);
  assert.ok(sprite.halfWidth > 0 && sprite.height > 0);
});

test('불러오기 실패: 이미지 오류나 크기 불일치는 예외 없이 null과 경고', async () => {
  const warnings = [];
  const failed = await loadDalSprite({
    loadImage: async () => {
      throw new Error('없음');
    },
    createCanvas: fakeCanvasFactory([]),
    warn: (...a) => warnings.push(a),
  });
  assert.equal(failed, null);

  const wrongSize = await loadDalSprite({
    loadImage: async () => ({ width: 1536, height: 768 }),
    createCanvas: fakeCanvasFactory([]),
    warn: (...a) => warnings.push(a),
  });
  assert.equal(wrongSize, null);
  assert.equal(warnings.length, 2);
});
