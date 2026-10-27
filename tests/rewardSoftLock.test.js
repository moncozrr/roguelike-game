// 보상 선택이 실패(적용 불가)해도 보상 화면이 영원히 멈추지 않고 전투로 돌아오는지 확인한다.
// 정상 플레이에서는 화면이 열린 동안 상태가 바뀌지 않아 일어나지 않는 방어용 상황이므로, 개발용 핸들로 후보를 일부러 무효로 만든다.
// 브라우저 없이 가짜 캔버스로 실행한다(tests/helpers/gameHarness.js). 실행: npm test

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, launchGame } from './helpers/gameHarness.js';

let loaded;
before(async () => {
  loaded = await loadGame();
});
after(async () => {
  await loaded.close();
});

const FLASH = 0.25; // 선택 강조(약 0.15초)가 끝나기에 충분한 시간

// 첫 번째 후보를 지금 상태에서 적용할 수 없게 만든다.
function invalidate(game, reward) {
  if (reward.kind === 'newWeapon') game.weapons.equip(reward.id);
  else if (reward.kind === 'weaponUpgrade') game.weapons.setLevel(reward.id, 5);
  else while (game.experience.upgradeMagnet());
}

test('보상 선택이 적용에 실패해도 보상 화면이 멈추지 않고 전투가 재개된다', () => {
  const h = launchGame(loaded.startGame, { seed: 5 });
  try {
    h.step();
    h.tap('Enter');
    h.tap('KeyX'); // 경험치 +10 -> 레벨업 1회
    assert.equal(h.game.state.current, 'levelup');
    h.step();

    invalidate(h.game, h.game.levelUp.candidates[0]);
    h.tap('Digit1'); // 무효가 된 첫 번째 카드를 고른다
    h.run(FLASH);

    assert.equal(h.game.state.current, 'playing', '보상 적용에 실패하면 화면에서 빠져나오지 못합니다');
  } finally {
    h.dispose();
  }
});
