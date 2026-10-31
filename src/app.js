// 앱 전체 흐름: 로비 -> 던전 선택 -> 전투 -> 결과 -> 로비. 화면 전환과 프로필(저장)을 한곳에서 묶는다.

import { createScreenManager } from './screens/screenManager.js';
import { createProfile } from './meta/profile.js';
import { lobbyScreen, dungeonSelectScreen } from './screens/lobbyScreen.js';
import { characterSelectScreen } from './screens/characterSelectScreen.js';
import { upgradesScreen, bestiaryScreen, achievementsScreen } from './screens/progressScreens.js';
import { noticesScreen, settingsScreen } from './screens/infoScreens.js';
import { battleScreen } from './screens/battleScreen.js';
import { resultScreen } from './screens/resultScreen.js';

const SCREENS = {
  lobby: lobbyScreen,
  dungeons: dungeonSelectScreen,
  characters: characterSelectScreen,
  upgrades: upgradesScreen,
  bestiary: bestiaryScreen,
  achievements: achievementsScreen,
  notices: noticesScreen,
  settings: settingsScreen,
  battle: battleScreen,
  result: resultScreen,
};

export function createApp(root, { saveStore }) {
  const profile = createProfile(saveStore);
  const manager = createScreenManager(root);

  const app = {
    profile,
    go(name, params = {}) {
      manager.show(() => SCREENS[name](app, params));
    },
    // 직전 출정의 캐릭터. 저장하지 않고 메모리에만 두며, 결과 화면의 "다시 도전"이 같은 캐릭터로 시작하는 데만 쓴다.
    lastCharacterId: null,
    startBattle(dungeonId, characterId = app.lastCharacterId) {
      app.lastCharacterId = characterId;
      app.go('battle', { dungeonId, characterId });
    },
    // 전투가 끝나면 결과를 저장에 반영하고(런마다 한 번), 결과 화면을 연다.
    finishRun(result) {
      const summary = profile.recordRun(result);
      app.go('result', { result, summary });
    },
  };

  app.go('lobby');
  return { app, destroy: manager.destroy };
}
