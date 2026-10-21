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
};

// 무기 정의. 아래 값은 모두 테스트용 [임시]값이며 확정된 밸런스나 이름이 아니다.
// 공통 필드: name, type('projectile' | 'area'), damage(1회 피해), cooldown(초), range(자동 조준 거리, 적 중심까지 px)
// projectile 전용: projectileSpeed(px/초), projectileRadius(px), projectileMaxDistance(날아갈 수 있는 최대 거리, px)
// area 전용: 플레이어 중심 반경 range 안의 모든 적을 한 번에 때린다. flashDuration은 표시 효과 시간(초)
export const WEAPONS = {
  shard: {
    name: '원거리 테스트 무기',
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
    type: 'area',
    damage: 5,
    cooldown: 1.0,
    range: 80,
    flashDuration: 0.15,
  },
};

// [임시] 새 런을 시작할 때 갖고 있는 무기(획득 UI가 생기기 전의 테스트용)
export const STARTING_WEAPONS = ['shard', 'pulse'];
