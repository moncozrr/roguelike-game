// 플레이어 프로필: 저장 데이터를 들고 있으면서, 진행도 규칙(progress.js)을 적용한 뒤 바로 저장소에 쓴다.
// 화면은 이 객체의 메서드만 부르고, 저장 실패(persistOk === false)는 화면이 안내만 한다. 게임은 메모리 사본으로 계속 진행된다.

import { createDefaultSave } from '../save/saveStore.js';
import { applyRunResult, buyUpgrade, claimAchievement, registerMonster, computeModifiers } from './progress.js';

export function createProfile(saveStore) {
  const loaded = saveStore.load();
  let save = loaded.data;
  let persistOk = loaded.status !== 'unavailable';

  function persist() {
    persistOk = saveStore.save(save).ok;
  }

  // 규칙 함수를 실행하고, 성공했을 때만 저장한다.
  function mutate(rule) {
    const result = rule(save);
    if (result.ok !== false) persist();
    return result;
  }

  return {
    get save() {
      return save;
    },
    get loadStatus() {
      return loaded.status; // 'new' | 'ok' | 'corrupt' | 'unavailable'
    },
    get persistOk() {
      return persistOk;
    },
    recordRun: (result) => mutate((s) => ({ ...applyRunResult(s, result) })),
    buyUpgrade: (id) => mutate((s) => buyUpgrade(s, id)),
    claimAchievement: (id) => mutate((s) => claimAchievement(s, id)),
    registerMonster: (id) => mutate((s) => registerMonster(s, id)),
    modifiers: () => computeModifiers(save),
    // 저장 데이터를 모두 지운다(확인 절차는 화면이 맡는다).
    reset() {
      const ok = saveStore.reset();
      save = createDefaultSave();
      persistOk = ok;
      return ok;
    },
    // 검증을 통과한 데이터로 통째로 바꾼다(덮어쓰기 확인은 화면이 맡는다).
    replaceWith(validData) {
      save = validData;
      persist();
      return persistOk;
    },
  };
}
