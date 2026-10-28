// 저장 데이터의 모양, 검증, 브라우저 저장소(localStorage) 읽기/쓰기.
// 화면(DOM)에 의존하지 않는다. 저장소는 바깥에서 넣어 줄 수 있어서(테스트용) 브라우저 없이도 시험할 수 있다.
// 저장소가 막혀 있거나 가득 차도 예외를 밖으로 던지지 않고, 메모리에 보관해서 게임이 계속되게 한다.

export const SAVE_KEY = 'ninefold-veil-save';
export const SAVE_BACKUP_KEY = 'ninefold-veil-save-corrupt'; // 손상된 데이터를 덮어쓰기 전에 보관하는 곳
export const SAVE_VERSION = 1;
export const MAX_UPGRADE_LEVEL = 10; // [확정] 영구 업그레이드 최대 레벨
const MAX_IMPORT_LENGTH = 200000; // 가져오기 글자 수 상한(터무니없이 큰 입력 방지)
const MAX_RECORD_ENTRIES = 200; // 업그레이드/도감/업적 항목 수 상한
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    coins: 0, // 일반 재화(엽전) [임시 이름]
    nameFragments: 0, // 이름 등록 조각 [임시 이름]
    stats: { runs: 0, normalKills: 0, bossKills: 0, bestSurvivalSeconds: 0 },
    upgrades: {}, // { 업그레이드 id: 레벨 0~10 }
    bestiary: {}, // { 몬스터 id: { kills, registered? } } registered: 이름 등록 조각으로 이름을 등록했는지
    achievements: {}, // { 업적 id: { claimed } }
  };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isSafeInteger(v) && v >= 0;
const isValidKey = (k) => KEY_PATTERN.test(k) && !FORBIDDEN_KEYS.has(k);

// 항목 하나를 검사해서 문제가 있으면 오류 문장을, 없으면 null을 돌려준다.
function checkRecord(name, record, checkValue) {
  if (!isPlainObject(record)) return `${name}: 객체여야 합니다`;
  const keys = Object.keys(record);
  if (keys.length > MAX_RECORD_ENTRIES) return `${name}: 항목이 너무 많습니다`;
  for (const key of keys) {
    if (!isValidKey(key)) return `${name}: 허용되지 않는 이름 "${key}"`;
    const problem = checkValue(record[key]);
    if (problem) return `${name}.${key}: ${problem}`;
  }
  return null;
}

// 저장 데이터를 엄격하게 검사한다(고쳐 주지 않고 거부). 성공하면 알려진 항목만 복사한 새 객체를 돌려준다.
// 반환: { ok: true, data } 또는 { ok: false, error }
export function validateSave(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: '저장 데이터가 객체가 아닙니다' };
  if (raw.version !== SAVE_VERSION) return { ok: false, error: `지원하지 않는 버전입니다: ${String(raw.version)}` };
  if (!isCount(raw.coins)) return { ok: false, error: 'coins: 0 이상의 정수여야 합니다' };
  if (!isCount(raw.nameFragments)) return { ok: false, error: 'nameFragments: 0 이상의 정수여야 합니다' };

  const stats = raw.stats;
  if (!isPlainObject(stats)) return { ok: false, error: 'stats: 객체여야 합니다' };
  for (const field of ['runs', 'normalKills', 'bossKills', 'bestSurvivalSeconds']) {
    if (!isCount(stats[field])) return { ok: false, error: `stats.${field}: 0 이상의 정수여야 합니다` };
  }

  const problem =
    checkRecord('upgrades', raw.upgrades, (v) => (Number.isInteger(v) && v >= 0 && v <= MAX_UPGRADE_LEVEL ? null : `0~${MAX_UPGRADE_LEVEL}의 정수여야 합니다`)) ||
    checkRecord('bestiary', raw.bestiary, (v) => (isPlainObject(v) && isCount(v.kills) && (v.registered === undefined || typeof v.registered === 'boolean') ? null : 'kills가 0 이상의 정수이고 registered는 true/false인 객체여야 합니다')) ||
    checkRecord('achievements', raw.achievements, (v) => (isPlainObject(v) && typeof v.claimed === 'boolean' ? null : 'claimed가 true/false인 객체여야 합니다'));
  if (problem) return { ok: false, error: problem };

  const data = createDefaultSave();
  data.coins = raw.coins;
  data.nameFragments = raw.nameFragments;
  for (const field of Object.keys(data.stats)) data.stats[field] = stats[field];
  for (const [key, level] of Object.entries(raw.upgrades)) data.upgrades[key] = level;
  for (const [key, entry] of Object.entries(raw.bestiary)) data.bestiary[key] = entry.registered === undefined ? { kills: entry.kills } : { kills: entry.kills, registered: entry.registered };
  for (const [key, entry] of Object.entries(raw.achievements)) data.achievements[key] = { claimed: entry.claimed };
  return { ok: true, data };
}

// 가져오기용: 글자(JSON)를 읽고 검증만 한다. 저장소는 건드리지 않는다(덮어쓰기 확인은 화면이 맡는다).
export function parseImport(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: '내용이 비어 있습니다' };
  if (text.length > MAX_IMPORT_LENGTH) return { ok: false, error: '파일이 너무 큽니다' };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다' };
  }
  return validateSave(parsed);
}

// 내보내기용 글자. 검증된 데이터만 내보낸다.
export function exportSave(data) {
  const checked = validateSave(data);
  if (!checked.ok) throw new Error(`내보낼 수 없는 데이터: ${checked.error}`);
  return JSON.stringify(checked.data, null, 2);
}

// 브라우저의 localStorage를 안전하게 가져온다. 차단되었거나 없으면 null.
function getBrowserStorage() {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null; // 일부 브라우저는 접근만 해도 예외를 던진다(쿠키/사이트 데이터 차단 등)
  }
}

// 저장소 객체는 getItem/setItem/removeItem만 있으면 된다. 인자를 생략하면 브라우저 localStorage를 쓴다.
export function createSaveStore(storage = getBrowserStorage()) {
  let memorySave = null; // 저장소에 쓰지 못했을 때 이번 접속 동안 쓰는 사본
  let memoryRaw = null;

  function readRaw() {
    if (!storage) return { ok: false, raw: memoryRaw };
    try {
      return { ok: true, raw: storage.getItem(SAVE_KEY) };
    } catch {
      return { ok: false, raw: memoryRaw };
    }
  }

  // 반환: { data, status }  status: 'new'(저장 없음) | 'ok' | 'corrupt'(손상, 기본값으로 시작) | 'unavailable'(저장소 사용 불가)
  function load() {
    if (memorySave) return { data: structuredClone(memorySave), status: 'unavailable' };
    const read = readRaw();
    if (!read.ok) return { data: createDefaultSave(), status: 'unavailable' };
    if (read.raw === null || read.raw === undefined) return { data: createDefaultSave(), status: 'new' };
    const parsed = parseImport(read.raw);
    if (parsed.ok) return { data: parsed.data, status: 'ok' };
    try {
      storage.setItem(SAVE_BACKUP_KEY, read.raw); // 다음 저장이 원본을 덮어쓰기 전에 사본을 남긴다(실패해도 무시)
    } catch {
      // 백업은 부가 기능이라 실패해도 게임을 막지 않는다.
    }
    return { data: createDefaultSave(), status: 'corrupt' };
  }

  // 반환: { ok: true } 또는 { ok: false, error }. 저장소 쓰기에 실패하면 메모리에만 보관하고 ok:false를 알린다.
  function save(data) {
    const checked = validateSave(data);
    if (!checked.ok) return { ok: false, error: checked.error }; // 잘못된 데이터로 기존 저장을 망치지 않는다.
    const text = JSON.stringify(checked.data);
    if (!storage) {
      memorySave = checked.data;
      memoryRaw = text;
      return { ok: false, error: '저장소를 사용할 수 없습니다' };
    }
    try {
      storage.setItem(SAVE_KEY, text);
      memorySave = null;
      memoryRaw = null;
      return { ok: true };
    } catch {
      memorySave = checked.data;
      memoryRaw = text;
      return { ok: false, error: '저장소에 쓰지 못했습니다' };
    }
  }

  // 저장 데이터를 지운다(확인 절차는 화면이 맡는다). 성공하면 true.
  function reset() {
    memorySave = null;
    memoryRaw = null;
    if (!storage) return true;
    try {
      storage.removeItem(SAVE_KEY);
      storage.removeItem(SAVE_BACKUP_KEY);
      return true;
    } catch {
      return false;
    }
  }

  return { load, save, reset };
}
