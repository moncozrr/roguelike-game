// 업적 정의. 조건과 보상은 모두 [임시](2026-10-27 사용자 위임으로 정한 제안값)다.
// progress(save)는 { current, target }을 돌려주며, current >= target이면 달성이다. 수령 여부는 save.achievements에 따로 저장된다.

const killsOf = (save, id) => save.bestiary[id]?.kills ?? 0;
const anyUpgrade = (save) => Object.values(save.upgrades).filter((level) => level > 0).length;

export const ACHIEVEMENTS = [
  { id: 'firstRun', name: '첫 출정', description: '던전에 한 번 출정한다.', reward: { coins: 20 }, progress: (s) => ({ current: s.stats.runs, target: 1 }) },
  { id: 'wonyon50', name: '원혼 달래기', description: '원혼을 누적 50마리 처치한다.', reward: { coins: 50 }, progress: (s) => ({ current: killsOf(s, 'wonyon'), target: 50 }) },
  { id: 'midBoss1', name: '아귀의 허기', description: '굶주린 아귀를 처음 처치한다.', reward: { nameFragments: 1 }, progress: (s) => ({ current: killsOf(s, 'midBoss'), target: 1 }) },
  { id: 'survive5', name: '다섯 해의 밤', description: '한 번의 출정에서 5분 이상 생존한다.', reward: { coins: 100 }, progress: (s) => ({ current: s.stats.bestSurvivalSeconds, target: 300 }) },
  { id: 'finalBoss1', name: '폐왕의 몰락', description: '망국의 폐왕을 처치한다.', reward: { nameFragments: 3 }, progress: (s) => ({ current: killsOf(s, 'finalBoss'), target: 1 }) },
  { id: 'firstUpgrade', name: '첫 수련', description: '영구 업그레이드를 처음 구매한다.', reward: { coins: 30 }, progress: (s) => ({ current: anyUpgrade(s), target: 1 }) },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
