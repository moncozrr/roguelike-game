// 게임 상태(ready / playing / paused / gameover / levelup / victory)와 전환 규칙.
// 화면(DOM)에 의존하지 않는다. 표에 없는 전환 요청은 상태를 바꾸지 않고 무시한다.

export const STATES = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
  VICTORY: 'victory', // 최종 보스 처치로 런이 끝남: 모든 진행이 멈추고 Enter로 새 런만 시작할 수 있다.
  LEVELUP: 'levelup', // 레벨업 보상 선택 중: 전투와 게임 시간이 모두 멈춘다. 선택이 끝나야만 playing으로 돌아간다.
};

// 현재 상태 -> { 동작: 다음 상태 }
const TRANSITIONS = {
  [STATES.READY]: { start: STATES.PLAYING },
  [STATES.PLAYING]: { pause: STATES.PAUSED, gameOver: STATES.GAMEOVER, levelUp: STATES.LEVELUP, victory: STATES.VICTORY },
  [STATES.PAUSED]: { resume: STATES.PLAYING },
  [STATES.GAMEOVER]: { start: STATES.PLAYING },
  [STATES.VICTORY]: { start: STATES.PLAYING },
  [STATES.LEVELUP]: { rewardDone: STATES.PLAYING },
};

export function createGameState(initial = STATES.READY) {
  let current = initial;
  return {
    get current() {
      return current;
    },
    is(state) {
      return current === state;
    },
    // 전환에 성공하면 true, 허용되지 않은 요청이면 false(상태는 그대로).
    send(action) {
      const next = TRANSITIONS[current]?.[action];
      if (!next) return false;
      current = next;
      return true;
    },
  };
}
