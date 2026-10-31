// 캐릭터 데이터와 선택 상태(src/data/characters.js) 검증. 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CHARACTERS, DEFAULT_CHARACTER_ID, getCharacter, createCharacterSelection } from '../src/data/characters.js';

test('캐릭터 목록: 달과 무진 두 명이고 id가 겹치지 않는다', () => {
  assert.deepEqual(CHARACTERS.map((c) => c.id), ['dal', 'mujin']);
  assert.deepEqual(CHARACTERS.map((c) => c.name), ['달', '무진']);
  assert.equal(new Set(CHARACTERS.map((c) => c.id)).size, CHARACTERS.length);
});

test('캐릭터 파일: 시트와 초상화 파일이 실제로 있다', () => {
  for (const c of CHARACTERS) {
    assert.ok(existsSync(new URL(`../public/${c.sheet}`, import.meta.url)), `${c.id} 시트 없음: ${c.sheet}`);
    assert.ok(existsSync(new URL(`../public/${c.portrait}`, import.meta.url)), `${c.id} 초상화 없음: ${c.portrait}`);
  }
});

test('getCharacter: id로 찾고, 없거나 이상한 값은 null, 기본 캐릭터는 목록에 있다', () => {
  assert.equal(getCharacter('mujin').name, '무진');
  assert.equal(getCharacter('nobody'), null);
  assert.equal(getCharacter(null), null);
  assert.equal(getCharacter(undefined), null);
  assert.ok(getCharacter(DEFAULT_CHARACTER_ID));
});

test('선택 상태: 처음에는 아무도 고르지 않아 입장할 수 없다', () => {
  const s = createCharacterSelection();
  assert.equal(s.selectedId, null);
  assert.equal(s.canEnter, false);
  assert.equal(s.enter(), null);
});

test('선택 상태: 고르면 입장할 수 있고 입장하면 그 id를 돌려준다. 다시 고르면 바뀐다', () => {
  const s = createCharacterSelection();
  assert.equal(s.select('dal'), true);
  assert.equal(s.canEnter, true);
  assert.equal(s.enter(), 'dal');
  assert.equal(s.select('mujin'), true);
  assert.equal(s.selectedId, 'mujin');
  assert.equal(s.enter(), 'mujin');
});

test('선택 상태: 목록에 없는 id는 받지 않고 기존 선택을 그대로 둔다', () => {
  const s = createCharacterSelection();
  assert.equal(s.select('nobody'), false);
  assert.equal(s.canEnter, false);
  s.select('dal');
  assert.equal(s.select('nobody'), false);
  assert.equal(s.selectedId, 'dal');
  assert.equal(s.select(undefined), false);
});

test('선택 상태: 선택은 서로 다른 선택 객체끼리 공유되지 않는다(매번 비어 있는 상태로 시작)', () => {
  const a = createCharacterSelection();
  a.select('dal');
  const b = createCharacterSelection();
  assert.equal(b.selectedId, null);
});
