// M9 터치 입력 계산(src/touchInput.js) 검증. 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { joystickVector, quantizeToEightDirections, JOYSTICK_DEADZONE } from '../src/touchInput.js';

test('조이스틱 벡터: 반지름 안에서는 비례하고 밖에서는 길이 1로 잘린다', () => {
  assert.deepEqual(joystickVector(0, 0, 50), { x: 0, y: 0 });
  assert.deepEqual(joystickVector(25, 0, 50), { x: 0.5, y: 0 });
  const far = joystickVector(300, 400, 50);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
  assert.ok(Math.abs(far.x - 0.6) < 1e-9 && Math.abs(far.y - 0.8) < 1e-9);
});

test('조이스틱 벡터: 잘못된 입력은 0', () => {
  for (const [dx, dy, r] of [[NaN, 1, 50], [1, Infinity, 50], [1, 1, 0], [1, 1, -5], [1, 1, NaN]]) {
    assert.deepEqual(joystickVector(dx, dy, r), { x: 0, y: 0 });
  }
});

test('8방향 맞춤: 데드존 안은 null, 밖은 가장 가까운 8방향의 길이 1 벡터', () => {
  assert.equal(quantizeToEightDirections(0, 0), null);
  assert.equal(quantizeToEightDirections(JOYSTICK_DEADZONE - 0.01, 0), null);
  assert.equal(quantizeToEightDirections(NaN, 1), null);
  const expected = [
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [-1, 0, -1, 0],
    [0, -1, 0, -1],
    [1, 1, Math.SQRT1_2, Math.SQRT1_2],
    [-1, 1, -Math.SQRT1_2, Math.SQRT1_2],
    [1, -1, Math.SQRT1_2, -Math.SQRT1_2],
    [-1, -1, -Math.SQRT1_2, -Math.SQRT1_2],
    [1, 0.3, 1, 0], // 22.5도 미만은 가로로
    [1, 0.5, Math.SQRT1_2, Math.SQRT1_2], // 22.5도 이상은 대각선으로
  ];
  for (const [x, y, ex, ey] of expected) {
    const d = quantizeToEightDirections(x, y);
    assert.ok(Math.abs(d.x - ex) < 1e-9 && Math.abs(d.y - ey) < 1e-9, `(${x}, ${y}) -> (${d.x}, ${d.y})`);
    assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-9);
  }
});
