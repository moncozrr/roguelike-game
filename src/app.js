// 앱 전체 흐름: 로비 -> 던전 선택 -> 전투 -> 결과 -> 로비. 화면 전환과 프로필(저장)을 한곳에서 묶는다.

import { createScreenManager } from './screens/screenManager.js';
import { createProfile } from './meta/profile.js';
import { lobbyScreen, dungeonSelectScreen } from './screens/lobbyScreen.js';
import { upgradesScreen, bestiaryScreen, achievementsScreen } from './screens/progressScreens.js';
import { noticesScreen, settingsScreen } from './screens/infoScreens.js';
import { battleScreen } from './screens/battleScreen.js';
import { resultScreen } from './screens/resultScreen.js';

const SCREENS = {
  lobby: lobbyScreen,
  dungeons: dungeonSelectScreen,
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
    startBattle(dungeonId) {
      app.go('battle', { dungeonId });
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
