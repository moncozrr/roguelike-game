// 도감에 나오는 몬스터 목록. 이름과 글자 공개 기준은 모두 [임시](2026-10-27 사용자 위임으로 정한 제안값)이며 코드 밖 문서로 확정되지 않았다.
// 일반 몬스터는 누적 처치 수로, 보스는 누적 처치 횟수로 이름 글자가 하나씩 공개된다.
// revealAt[i]는 i번째 글자(공백 제외)가 공개되는 누적 처치 수이고, 글자 수와 같은 길이여야 한다(테스트로 확인).

import { MINI_BOSS_KIND, SECOND_BOSS_KIND, FINAL_BOSS_KIND } from '../boss.js';

export const MONSTERS = [
  { id: 'wonyon', name: '원혼', hanja: '怨魂', kind: 'normal', revealAt: [30, 100], note: '폐허를 떠도는 억울한 넋. 닿는 것을 놓지 않는다.' },
  { id: 'midBoss', name: '굶주린 아귀', hanja: '餓鬼', kind: 'boss', revealAt: [1, 2, 3, 4, 5], note: '채워지지 않는 허기로 길을 막는 첫 번째 수문장.' },
  { id: 'secondBoss', name: '목 잃은 장수', hanja: '無首', kind: 'boss', revealAt: [1, 2, 3, 4, 5], note: '머리를 잃고도 전장을 떠나지 못한 무인의 혼.' },
  { id: 'finalBoss', name: '망국의 폐왕', hanja: '廢王', kind: 'boss', revealAt: [1, 2, 3, 4, 5], note: '무너진 나라의 옥좌를 지키는 마지막 그림자.' },
];

export const MONSTER_BY_ID = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

// 게임 안의 적 객체를 도감 번호표로 바꾼다. 일반 적(원거리 변종 포함)은 모두 원혼이다.
export function monsterIdForEnemy(enemy) {
  switch (enemy?.kind) {
    case MINI_BOSS_KIND:
      return 'midBoss';
    case SECOND_BOSS_KIND:
      return 'secondBoss';
    case FINAL_BOSS_KIND:
      return 'finalBoss';
    default:
      return 'wonyon';
  }
}
