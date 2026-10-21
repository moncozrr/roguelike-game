// 게임 이름과 밸런스 값을 모아 두는 설정 파일. 순수 상수만 두고 화면(DOM)에는 의존하지 않는다.
// [임시] 표시가 있는 값은 테스트용 임시값이며 확정된 기획 수치가 아니다.
// [확정] 표시가 있는 값은 기획 문서(docs/GAME_DESIGN.md)에서 합의된 규칙이다.

// [임시] 게임 이름. 바꾸려면 여기와 index.html의 <title>(JS 실행 전 폴백) 두 곳을 고친다.
export const GAME_TITLE = '경계선';

export const PLAYER = {
  radius: 14, // [임시] 이동 판정 원의 반지름(px)
  speed: 240, // [임시] 초당 이동 픽셀
};

export const DASH = {
  distance: 108, // [임시] 대시 목표 이동 거리(px)
  speed: 600, // [임시] 초당 이동 픽셀 (108px / 600 = 0.18초)
  cooldown: 0.8, // [임시] 대시를 시작한 순간부터 계산(초)
};

// [임시] 월드(플레이 가능한 전체 영역) 크기(px). 확정된 게임 규칙이 아니다.
// 좌표 원점은 왼쪽 위(0, 0), x는 오른쪽, y는 아래쪽으로 증가한다.
export const WORLD = {
  width: 4000,
  height: 4000,
};

export const BOUNDARY = {
  baseRadius: 300, // [임시] 기본 경계 반경(px). 최종 밸런스 값이 아니다.
  // [확정] 반경 강화: 레벨당 기본 반경의 +10%, 최대 3레벨(최대 130%). 중심은 고정이다.
  // 반경 = 기본 반경 × (1 + 레벨 × 0.1). 부동소수점 오차를 피하려고 정수 퍼센트로 계산한다.
  radiusUpgradePercent: 10,
  maxRadiusLevel: 3,
  // 내구도(단계 10). 경계는 내구도가 0이어도 사라지지 않는다.
  maxDurability: 100, // [임시] 최대 내구도(비율로만 쓰이므로 회복 속도에는 영향이 없다)
  recoveryPercentPerSecond: 5, // [확정] 회복 ON이고 피해가 없을 때 초당 최대 내구도의 5%
  recoveryDelay: 3, // [임시] 마지막 피해 후 이 시간(초) 동안은 회복하지 않는다(문서에 값이 없음)
  recoveryDefaultOn: true, // [임시] 새 런에서 회복 기능의 기본 상태
  weakenStepLossPercent: 10, // [확정] 내구도 손실 10%마다
  weakenPercentPerStep: 5, // [확정] 경계 버프가 5%씩 약해진다
  maxWeakenPercent: 50, // [확정] 최대 약화
  attackBuffPercent: 50, // [임시] 경계 안 플레이어 공격력 증가 버프(기본 효과, 약화 적용 전)
  enemySharePercent: 50, // [확정] 인간형 적/보스가 공유하는 버프 비율
  devDamagePercent: 10, // [개발 전용] B 키 한 번에 깎는 내구도(최대 내구도 대비 %)
};

// 보스(단계 11에서 등장). 보스는 일반 적보다 약간 크게 그린다.
export const BOSS = {
  sizeScale: 1.1, // [임시] 표시 크기 배율(+10%). 충돌 판정은 바꾸지 않는다.
  // 중간 보스(2:00 출현). 이름, 외형, HP, 공격 패턴은 문서에 미결정이라 아래는 모두 테스트용 [임시]값이다.
  // 새 공격은 없고 일반 적과 같은 이동/접촉 피해/피격 규칙을 쓴다.
  miniBoss: {
    maxHp: 200, // [임시] 일반 적(10)의 20배
    speed: 60, // [임시] 일반 적(80)보다 느림
    spawnMargin: 120, // 화면 가장자리에서 바깥으로 떨어진 거리(px)
  },
  // 최종 보스(3:00 출현, 중간 보스 생존 여부와 무관). 문서에 수치가 없어서 모두 테스트용 [임시]값이다.
  // 새 공격 패턴은 없고, 접촉 피해는 일반 적과 같은 기준(PLAYER_HEALTH.contactDamage)을 쓴다.
  finalBoss: {
    maxHp: 400, // [임시]
    speed: 60, // [임시]
    spawnMargin: 120, // 화면 가장자리에서 바깥으로 떨어진 거리(px)
  },
};

// 일반 적(원혼). 아래 값은 모두 테스트용 [임시]값이며 확정된 밸런스가 아니다.
export const ENEMY = {
  sourceSize: 48, // 원본 이미지 크기(px). 표시 크기와 별개다.
  displaySize: 48, // 화면에 그리는 크기(px). 충돌 반지름과 별개다.
  collisionRadiusRatio: 0.3, // 충돌 반지름 = 표시 크기 × 0.3 (48px이면 14.4px)
  speed: 80, // 초당 이동 픽셀(플레이어 240보다 느림)
  maxHp: 10, // [임시] 원혼 최대 HP. 원거리 3 피해는 4번, 근접 5 피해는 2번에 처치된다.
  facingDeadZone: 2, // 플레이어와의 수평 거리가 이보다 작으면 이전 방향을 유지(px, 깜빡임 방지)
  // 적끼리 밀어내기 조정값(구현 튜닝용). 한 프레임에 겹침을 푸는 반복 횟수와 한 번에 푸는 비율.
  // 측정 결과(100마리 밀집): 강도 1.0은 떨리고, 3회/0.5는 겹침이 지름의 27%까지 남아서 6회/0.7로 정했다.
  separationIterations: 6,
  separationStrength: 0.7,
};

// 일반 적 생성. 아래 값은 모두 테스트용 [임시]값이다. 단, 밀도가 1분마다 +20%p(가산)씩 늘어나는 규칙은 [확정]이다.
export const SPAWN = {
  baseInterval: 3, // 기본 생성 간격(초). 실제 간격 = 기본 간격 ÷ 밀도 배수
  baseGroupSize: 3, // 기본 그룹 크기(마리). 실제 평균 크기 = 기본 크기 × 밀도 배수
  margin: 80, // 화면 가장자리에서 바깥으로 떨어진 거리(px)
  maxEnemies: 100, // 동시에 존재할 수 있는 최대 적 수
  densityStepSeconds: 60, // [확정] 이 시간이 지날 때마다 밀도가 늘어난다.
  densityStepPercent: 20, // [확정] 늘어나는 양(%p, 기본값 대비 가산: 100 -> 120 -> 140 ...)
  rangedChance: 0.25, // [임시] 새로 생기는 적 한 마리가 원거리 적일 확률(생성 간격/그룹 크기/최대 수와 무관)
  stopAtTime: 300, // 게임 시간이 이 값(5:00) 이상이면 신규 적 생성을 완전히 중단(기존 적은 계속 움직임)
};

// 플레이어 체력과 적 접촉 피해. 아래 값은 모두 테스트용 [임시]값이며 확정된 밸런스가 아니다.
// 접촉 판정은 원형이다: 플레이어 반지름(PLAYER.radius)과 적 충돌 반지름(ENEMY 기준)의 합 이하이면 접촉.
export const PLAYER_HEALTH = {
  maxHp: 100, // 최대 HP
  contactDamage: 10, // 적 접촉 1회당 피해
  hitProtection: 1.0, // 피격 후 보호 시간(초). 이 동안 접촉 피해를 받지 않는다.
};

// [임시] 대시 무적 시간(초). 대시 시간(DASH.distance / DASH.speed)과는 별개의 독립 설정값이다.
// 피격 후 보호 시간과도 별개이며, 대시 무적이 끝나도 피격 후 보호 시간이 생기지 않는다.
export const DASH_INVULN = 0.5;

// [임시] 탭 전환 등으로 프레임이 길어질 때 순간이동/시간 점프를 막는 한 프레임 최대 시간(초).
// 이보다 긴 프레임은 이 값으로 잘리므로, 게임 시간은 "잘린 업데이트 시간의 합"이다.
export const MAX_FRAME_TIME = 0.05;

// [임시] 이벤트 알림(예: 보스 출현)을 화면에 보여 주는 시간(게임 시간 기준, 초)
export const NOTICE_DURATION = 3;

// [확정] 시간 기반 이벤트 시각(초). 두 이벤트는 서로 독립적이다.
export const TIMELINE = {
  midBossAt: 120, // 2:00 중간 보스 출현
  finalBossAt: 180, // 3:00 최종 보스 출현(중간 보스 생존 여부와 무관)
  targetTime: 300, // 5:00 테스트 목표 시간. 표시일 뿐 런을 종료하지 않는다.
};

// 무기 규칙. 슬롯 수와 최대 레벨은 단계 6 기획 기준이다. 무기 종류마다 하나만 가질 수 있다.
export const WEAPON_RULES = {
  maxSlots: 3,
  maxLevel: 5,
  // 무기 레벨 피해 배율 = 1 + 0.2 × (레벨 - 1). 부동소수점 오차를 피하려고 정수 퍼센트로 계산한다(100/120/140/160/180%).
  // 레벨이 올라도 공격력만 늘고 공격 주기, 사거리, 연쇄 횟수 등은 변하지 않는다.
  damagePercentPerLevel: 20,
};

// 무기 정의. 아래 값은 모두 테스트용 [임시]값이며 확정된 밸런스나 이름이 아니다.
// 공통 필드: name, description(보상 화면 설명), type('projectile' | 'area' | 'chain' | 'boomerang'), damage(1회 피해), cooldown(초), range(자동 조준 거리, 적 중심까지 px)
// projectile 전용: projectileSpeed(px/초), projectileRadius(px), projectileMaxDistance(날아갈 수 있는 최대 거리, px)
// area 전용: 플레이어 중심 반경 range 안의 모든 적을 한 번에 때린다. flashDuration은 표시 효과 시간(초)
// chain 전용: 가장 가까운 적(range 이내)에서 시작해 직전 적에서 chainDistance 이내의 가장 가까운 다른 적으로 이어진다.
//   chainCount는 최초 타깃을 포함한 최대 타격 수. 한 번의 공격에서 같은 적은 한 번만 맞는다.
// boomerang 전용: 타깃 쪽으로 날아가 도달(또는 maxDistance)하면 플레이어 쪽으로 돌아온다. 왕복 중 적마다 한 번만 맞힌다.
//   catchRadius: 돌아온 투사체가 플레이어에 닿았다고 보는 거리, maxLifetime: 안전장치(초)
export const WEAPONS = {
  shard: {
    name: '원거리 테스트 무기',
    description: '가장 가까운 적에게 투사체 발사',
    type: 'projectile',
    damage: 3,
    cooldown: 0.6,
    range: 320,
    projectileSpeed: 420,
    projectileRadius: 5,
    projectileMaxDistance: 700,
  },
  pulse: {
    name: '근접 테스트 무기',
    description: '주변 모든 적을 범위 공격',
    type: 'area',
    damage: 5,
    cooldown: 1.0,
    range: 80,
    flashDuration: 0.15,
  },
  chainLightning: {
    name: 'Chain Lightning',
    description: '가까운 적에서 시작해 최대 3마리에 연쇄',
    type: 'chain',
    damage: 2, // 적 한 명당
    cooldown: 1.2,
    range: 180,
    chainCount: 3,
    chainDistance: 100,
    flashDuration: 0.15,
  },
  boomerangBlade: {
    name: 'Boomerang Blade',
    description: '날아갔다 돌아오며 경로의 적을 공격',
    type: 'boomerang',
    damage: 2, // 적 한 명당(왕복 한 번에 적마다 한 번)
    cooldown: 2,
    range: 220,
    projectileSpeed: 300,
    projectileRadius: 8,
    maxDistance: 300, // 바깥쪽으로 날아갈 수 있는 최대 거리(px). 도달하면 귀환한다.
    catchRadius: 16,
    maxLifetime: 6,
  },
};

// 새 런을 시작할 때 갖고 있는 무기. 나머지 무기는 레벨업 보상으로 얻는다.
export const STARTING_WEAPONS = ['shard'];

// 원거리 적과 그 투사체. 아래 값은 모두 테스트용 [임시]값이며 확정된 밸런스가 아니다.
// 원거리 적은 일반 원혼과 같은 추적 AI를 쓰고(거리 유지 없음), 플레이어가 range 안에 있으면 쿨다운마다 쏜다.
// 투사체는 발사 순간의 플레이어 위치로 방향을 한 번 정하고 직선으로 날아간다(유도/관통/지속 피해 없음).
export const ENEMY_PROJECTILE = {
  damage: 10, // 명중 1회 피해(피격 후 보호/대시 무적 중에는 피해 없이 사라진다)
  speed: 240, // 초당 이동 픽셀
  radius: 6, // 투사체 충돌 반지름(px)
  maxDistance: 350, // 최대 비행 거리(px). 넘으면 사라진다.
  range: 300, // 발사 사거리(적 중심 ~ 플레이어 중심, px). 최대 비행 거리보다 짧아서 쏜 탄이 닿을 수 있다.
  cooldown: 2.5, // 발사 간격(초). 생성 직후에도 이 시간이 지나야 처음 쏜다.
};

// 경험치와 레벨업. 아래 값은 모두 테스트용 [임시]값이며 확정된 밸런스가 아니다.
export const XP = {
  orbValue: { melee: 1, ranged: 2 }, // 적 종류별 구슬 경험치(적 처치 1회당 구슬 1개)
  firstLevelXp: 8, // 1레벨 -> 2레벨에 필요한 경험치
  levelXpIncrease: 4, // 이후 레벨마다 요구량이 늘어나는 양(8, 12, 16, 20, ...)
  orbDrawRadius: 6, // 구슬을 그리는 크기(px, 표시용)
};

// 경험치 자석: 구슬을 줍는 반경(플레이어 중심 ~ 구슬 중심). 무기 슬롯/레벨과 별개의 강화이다.
export const MAGNET = {
  basePickupRadius: 60, // [임시] 기본 줍기 반경(px)
  radiusPerLevel: 6, // [임시] 강화 1회당 늘어나는 반경(px): 60 / 66 / 72 / 78
  maxLevel: 3,
};
