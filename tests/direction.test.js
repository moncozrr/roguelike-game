// 8방향 선택(src/direction.js) 검증. 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTION_NAMES,
  DAL_SHEET_LAYOUT,
  DEFAULT_DIRECTION_INDEX,
  directionIndexFromVector,
  directionName,
  dalSheetCell,
} from '../src/direction.js';

const at = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const nameOf = (x, y, prev = null) => directionName(directionIndexFromVector(x, y, prev));

test('8방향: 상하좌우와 대각선이 화면 기준 이름으로 나온다(y+는 아래쪽=카메라 쪽)', () => {
  assert.equal(nameOf(1, 0), 'right');
  assert.equal(nameOf(1, 1), 'front-right');
  assert.equal(nameOf(0, 1), 'front');
  assert.equal(nameOf(-1, 1), 'front-left');
  assert.equal(nameOf(-1, 0), 'left');
  assert.equal(nameOf(-1, -1), 'back-left');
  assert.equal(nameOf(0, -1), 'back');
  assert.equal(nameOf(1, -1), 'back-right');
});

test('8방향: 벡터 크기는 결과에 영향을 주지 않는다', () => {
  assert.equal(nameOf(0.001, 0.001), 'front-right');
  assert.equal(nameOf(500, 500), 'front-right');
});

test('8방향: 왼쪽(180도 부근)에서 -0과 부호 차이가 있어도 left', () => {
  assert.equal(nameOf(-1, 0), 'left');
  assert.equal(nameOf(-1, -0), 'left');
  assert.equal(nameOf(-1, 0.01), 'left');
  assert.equal(nameOf(-1, -0.01), 'left');
});

test('8방향: 멈춰 있으면 직전 방향을 유지하고, 직전 방향이 없으면 정면', () => {
  assert.equal(directionIndexFromVector(0, 0, null), DEFAULT_DIRECTION_INDEX);
  assert.equal(directionName(DEFAULT_DIRECTION_INDEX), 'front');
  assert.equal(directionIndexFromVector(0, 0, 4), 4);
  assert.equal(directionIndexFromVector(1e-9, 0, 6), 6);
});

test('8방향: 이상한 입력(NaN, Infinity, 범위 밖 이전 값)은 안전하게 처리한다', () => {
  assert.equal(directionIndexFromVector(NaN, 1, 3), 3);
  assert.equal(directionIndexFromVector(1, Infinity, null), DEFAULT_DIRECTION_INDEX);
  assert.equal(directionIndexFromVector(undefined, undefined, 5), 5);
  assert.equal(directionIndexFromVector(1, 0, 99), 0, '범위 밖 이전 값은 무시하고 새로 계산');
  assert.equal(directionIndexFromVector(1, 0, -1), 0);
  assert.equal(directionIndexFromVector(1, 0, 1.5), 0);
});

test('이력(hysteresis): 이전 방향 구간 경계를 조금 넘어도 바로 바뀌지 않는다', () => {
  // right(0도)와 front-right(45도)의 경계는 22.5도. 여유 8도를 두면 30.5도까지 right를 유지한다.
  assert.equal(nameOf(...at(25)), 'front-right', '이전 방향이 없으면 경계를 넘자마자 바뀐다');
  assert.equal(nameOf(...at(25), 0), 'right', '이전이 right이면 25도에서도 유지');
  assert.equal(nameOf(...at(30), 0), 'right');
  assert.equal(nameOf(...at(35), 0), 'front-right', '여유를 넘으면 바뀐다');
});

test('이력: 반대쪽에서 경계로 다가올 때도 같은 폭을 쓴다', () => {
  // front-right(1)에서 right(0) 쪽으로 이동: 45도 기준 22.5도 + 8도 = 14.5도까지 유지
  assert.equal(nameOf(...at(18), 1), 'front-right');
  assert.equal(nameOf(...at(10), 1), 'right');
});

test('이력: 왼쪽 경계(180도)를 가로지를 때도 정상 동작한다', () => {
  // left(180도) 이전 상태에서 -170도(=190도)는 10도 차이 → 유지
  assert.equal(nameOf(...at(-170), 4), 'left');
  // back-left(225도=-135도)로 충분히 넘어가면 바뀐다
  assert.equal(nameOf(...at(-140), 4), 'back-left');
});

test('이력: 큰 방향 전환(반대 방향)은 즉시 바뀐다', () => {
  assert.equal(nameOf(-1, 0, 0), 'left');
  assert.equal(nameOf(0, -1, 2), 'back');
});

test('시트 배치: 8방향이 4열 x 2행 칸에 하나씩 겹치지 않게 대응된다', () => {
  assert.equal(DIRECTION_NAMES.length, 8);
  const seen = new Set();
  for (const name of DIRECTION_NAMES) {
    const { col, row } = dalSheetCell(name);
    assert.ok(col >= 0 && col < 4 && row >= 0 && row < 2, `${name} 칸이 범위 밖`);
    seen.add(`${col},${row}`);
  }
  assert.equal(seen.size, 8);
  assert.deepEqual(Object.keys(DAL_SHEET_LAYOUT).sort(), [...DIRECTION_NAMES].sort());
});

test('시트 배치: 시안의 칸 순서와 같다', () => {
  assert.deepEqual(dalSheetCell('front'), { col: 0, row: 0 });
  assert.deepEqual(dalSheetCell('back-right'), { col: 3, row: 0 });
  assert.deepEqual(dalSheetCell('back'), { col: 0, row: 1 });
  assert.deepEqual(dalSheetCell('front-left'), { col: 3, row: 1 });
  assert.deepEqual(dalSheetCell('없는 이름'), { col: 0, row: 0 }, '모르는 이름은 정면 칸');
});
