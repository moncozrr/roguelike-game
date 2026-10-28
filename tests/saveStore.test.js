// 마일스톤 M0: 저장 기반(src/save/saveStore.js) 검증. 브라우저 없이 가짜 저장소로 실행한다. 실행: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_BACKUP_KEY, SAVE_VERSION, MAX_UPGRADE_LEVEL, createDefaultSave, validateSave, parseImport, exportSave, createSaveStore } from '../src/save/saveStore.js';

// 메모리에서 동작하는 가짜 localStorage. fail에 'get'/'set'/'remove'를 넣으면 그 동작이 예외를 던진다.
function fakeStorage(fail = []) {
  const map = new Map();
  return {
    map,
    getItem(k) {
      if (fail.includes('get')) throw new Error('blocked');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (fail.includes('set')) throw new Error('quota');
      map.set(k, String(v));
    },
    removeItem(k) {
      if (fail.includes('remove')) throw new Error('blocked');
      map.delete(k);
    },
  };
}

function sampleSave() {
  const s = createDefaultSave();
  s.coins = 120;
  s.nameFragments = 2;
  s.stats = { runs: 3, normalKills: 150, bossKills: 2, bestSurvivalSeconds: 301 };
  s.upgrades = { vitality: 4, might: MAX_UPGRADE_LEVEL };
  s.bestiary = { wonyon: { kills: 150 } };
  s.achievements = { firstRun: { claimed: true }, wonyon50: { claimed: false } };
  return s;
}

test('기본 저장 데이터는 검증을 통과한다', () => {
  const r = validateSave(createDefaultSave());
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, createDefaultSave());
});

test('검증: 올바른 데이터는 그대로 통과하고 원본과 다른 사본을 돌려준다', () => {
  const s = sampleSave();
  const r = validateSave(s);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, s);
  assert.notEqual(r.data, s);
});

test('검증: 알려지지 않은 최상위 항목은 버려진다', () => {
  const s = { ...sampleSave(), cheat: 999 };
  const r = validateSave(s);
  assert.equal(r.ok, true);
  assert.equal('cheat' in r.data, false);
});

test('검증: 잘못된 데이터는 거부한다', () => {
  const bad = [
    null,
    [],
    'text',
    { ...sampleSave(), version: 2 },
    { ...sampleSave(), version: undefined },
    { ...sampleSave(), coins: -1 },
    { ...sampleSave(), coins: 1.5 },
    { ...sampleSave(), coins: '10' },
    { ...sampleSave(), coins: NaN },
    { ...sampleSave(), nameFragments: Infinity },
    { ...sampleSave(), stats: null },
    { ...sampleSave(), stats: { runs: 1 } },
    { ...sampleSave(), upgrades: { vitality: MAX_UPGRADE_LEVEL + 1 } },
    { ...sampleSave(), upgrades: { vitality: -1 } },
    { ...sampleSave(), upgrades: { vitality: 2.5 } },
    { ...sampleSave(), upgrades: [] },
    { ...sampleSave(), bestiary: { wonyon: { kills: -3 } } },
    { ...sampleSave(), bestiary: { wonyon: 5 } },
    { ...sampleSave(), achievements: { a: { claimed: 'yes' } } },
    { ...sampleSave(), achievements: { 'bad key!': { claimed: true } } },
  ];
  for (const b of bad) assert.equal(validateSave(b).ok, false, JSON.stringify(b));
});

test('검증: __proto__ 같은 위험한 이름은 거부한다', () => {
  const text = JSON.stringify(sampleSave()).replace('"upgrades":{', '"upgrades":{"__proto__":1,');
  const r = parseImport(text);
  assert.equal(r.ok, false);
  assert.equal({}.polluted, undefined);
});

test('검증: 항목 수가 너무 많으면 거부한다', () => {
  const s = sampleSave();
  for (let i = 0; i < 201; i++) s.upgrades[`u${i}`] = 1;
  assert.equal(validateSave(s).ok, false);
});

test('가져오기: 형식이 아니거나 비었거나 너무 크면 거부하고, 정상 JSON은 받는다', () => {
  assert.equal(parseImport('').ok, false);
  assert.equal(parseImport(undefined).ok, false);
  assert.equal(parseImport('{not json').ok, false);
  assert.equal(parseImport('x'.repeat(200001)).ok, false);
  assert.equal(parseImport(exportSave(sampleSave())).ok, true);
});

test('내보내기: 내보낸 글자를 다시 가져오면 같은 데이터가 된다', () => {
  const s = sampleSave();
  assert.deepEqual(parseImport(exportSave(s)).data, s);
  assert.throws(() => exportSave({ ...s, coins: -5 }));
});

test('저장소: 처음에는 기본값과 상태 new', () => {
  const store = createSaveStore(fakeStorage());
  const r = store.load();
  assert.equal(r.status, 'new');
  assert.deepEqual(r.data, createDefaultSave());
});

test('저장소: 저장 후 새로 불러와도(새로고침과 같은 상황) 그대로다', () => {
  const storage = fakeStorage();
  const s = sampleSave();
  assert.deepEqual(createSaveStore(storage).save(s), { ok: true });
  const r = createSaveStore(storage).load(); // 새 저장소 객체 = 페이지를 다시 연 것과 같다
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.data, s);
});

test('저장소: 잘못된 데이터 저장은 거부하고 기존 저장을 지키며, 불러온 데이터를 고쳐도 저장본은 안전하다', () => {
  const storage = fakeStorage();
  const store = createSaveStore(storage);
  store.save(sampleSave());
  const before = storage.map.get(SAVE_KEY);
  const result = store.save({ ...sampleSave(), coins: -1 });
  assert.equal(result.ok, false);
  assert.equal(storage.map.get(SAVE_KEY), before);
  const loaded = store.load().data;
  loaded.coins = 99999; // 저장하지 않고 바꾼 값
  assert.equal(store.load().data.coins, 120);
});

test('저장소: 손상된 데이터는 기본값으로 시작하고 원본을 백업 키에 남긴다', () => {
  const storage = fakeStorage();
  storage.map.set(SAVE_KEY, '{broken');
  const r = createSaveStore(storage).load();
  assert.equal(r.status, 'corrupt');
  assert.deepEqual(r.data, createDefaultSave());
  assert.equal(storage.map.get(SAVE_BACKUP_KEY), '{broken');
  assert.equal(storage.map.get(SAVE_KEY), '{broken'); // 불러오기만으로는 지우지 않는다
});

test('저장소: 읽기가 막혀도 예외 없이 기본값과 unavailable', () => {
  const r = createSaveStore(fakeStorage(['get'])).load();
  assert.equal(r.status, 'unavailable');
  assert.deepEqual(r.data, createDefaultSave());
});

test('저장소: 쓰기가 실패하면 ok:false를 알리고, 이번 접속 동안은 메모리 사본으로 계속 쓴다', () => {
  const store = createSaveStore(fakeStorage(['set']));
  const result = store.save(sampleSave());
  assert.equal(result.ok, false);
  const r = store.load();
  assert.equal(r.status, 'unavailable');
  assert.equal(r.data.coins, 120);
});

test('저장소: localStorage 자체가 없어도(null) 동작한다', () => {
  const store = createSaveStore(null);
  assert.equal(store.load().status, 'unavailable');
  assert.equal(store.save(sampleSave()).ok, false);
  assert.equal(store.load().data.coins, 120);
  assert.equal(store.reset(), true);
  assert.deepEqual(store.load().data, createDefaultSave());
});

test('초기화: 저장과 백업을 지우고, 이후 불러오면 new다. 삭제가 막히면 false', () => {
  const storage = fakeStorage();
  storage.map.set(SAVE_BACKUP_KEY, 'old');
  const store = createSaveStore(storage);
  store.save(sampleSave());
  assert.equal(store.reset(), true);
  assert.equal(storage.map.size, 0);
  assert.equal(store.load().status, 'new');
  assert.equal(createSaveStore(fakeStorage(['remove'])).reset(), false);
});

test('버전 상수가 1이다(스키마를 바꾸면 이 테스트와 마이그레이션을 함께 고친다)', () => {
  assert.equal(SAVE_VERSION, 1);
  assert.equal(MAX_UPGRADE_LEVEL, 10);
});
